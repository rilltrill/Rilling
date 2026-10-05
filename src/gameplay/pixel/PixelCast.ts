import * as THREE from 'three';
import { MAX_LAYERS, MAX_PRIMS, PRIM_FLOATS, type PixelFigure } from './figure';
import { MAT_COLS, STEPS, materialTable } from './materials';
import { STAMP_ATLAS, stampAtlas } from './stamps';

/**
 * PixelCast GPU passes: a painted figure (see `figure.ts`) → a pixel-art sprite
 * image, in two small full-screen draws, no readbacks.
 *
 * 1. PAINT (G-buffer): per texel, walk the figure's primitives (a float data
 *    texture, uploaded per redraw): smooth-union each layer's solids, keep the
 *    nearest covered layer, apply its decals, shade it with the blended field's
 *    inflation normal (light from the upper left, screen space — the sprite
 *    artist's light, not the stage's), run the material's surface pattern
 *    (weave, twill, buffalo check, rot, strands, scales, stripes…). Writes the
 *    material id, a continuous tone, packed view depth and layer/flags.
 * 2. RESOLVE (pixel-art pass): tone → the material's hand-built ramp step, with
 *    ordered dither only in the transition bands; a 1-texel selective outline on
 *    the silhouette's own edge texels (darkest step on the shadow side, a darker
 *    shade of the local colour on the lit side, never on 1-texel runs), inner
 *    contours where a nearer layer overlaps a farther one, a cool rim on the
 *    back-lit edge in dark stages, the stage's light tint and fog. Output is the
 *    display-space colour with packed depth in alpha — the same sprite format the
 *    impostor bake produces, so SpriteArt's billboards draw both.
 */

const VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const NOISE = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
`;

/** Pattern ids — keep in sync with materials.ts `PAT`. */
const PAINT_FRAG = /* glsl */ `
  precision highp float;
  precision highp int;
  precision highp sampler2D;
  uniform sampler2D uPrims;
  uniform sampler2D uMats;
  uniform sampler2D uStamps;
  uniform int uLayers;
  uniform vec2 uLayerRange[${MAX_LAYERS}];
  uniform vec4 uLayerBox[${MAX_LAYERS}];
  uniform vec2 uDepthRange;
  uniform float uTexS;
  uniform vec3 uLight;
  uniform vec4 uShade;   // ambient, diffuse, wrap, specular gain
  ${NOISE}

  float packDepth(float d) {
    float t = clamp((d - uDepthRange.x) / max(uDepthRange.y - uDepthRange.x, 1e-4), 0.0, 1.0);
    return (1.0 + floor(t * 254.0 + 0.5)) / 255.0;
  }

  // Round cone (iq's uneven capsule): distance + axis param t, distance from the
  // axis l, side sign, outward gradient g and the radius R at t.
  float roundCone(vec2 p, vec4 T0, vec4 T1, out float t, out float l, out float sgn, out vec2 g, out float R) {
    vec2 a = T0.xy;
    vec2 ba = T0.zw - a;
    float ra = T1.x, rb = T1.y;
    vec2 pa = p - a;
    float h = dot(ba, ba);
    float b = ra - rb;
    if (h <= b * b + 1e-4) {
      // Degenerate: one end swallows the other — a disc.
      bool useA = ra >= rb;
      vec2 c = useA ? a : T0.zw;
      R = max(max(ra, rb), 1e-3);
      vec2 dp = p - c;
      l = length(dp);
      g = l > 1e-4 ? dp / l : vec2(0.0, 1.0);
      t = useA ? 0.0 : 1.0;
      sgn = dp.x >= 0.0 ? 1.0 : -1.0;
      return l - R;
    }
    float cr = pa.x * ba.y - pa.y * ba.x;
    vec2 q = vec2(abs(cr), dot(pa, ba)) / h;
    vec2 c = vec2(sqrt(h - b * b), b);
    float k = c.x * q.y - c.y * q.x;
    float m = dot(c, q);
    float n = dot(q, q);
    float d;
    if (k < 0.0) d = sqrt(h * n) - ra;
    else if (k > c.x) d = sqrt(h * (n + 1.0 - 2.0 * q.y)) - rb;
    else d = m - ra;
    t = clamp(dot(pa, ba) / h, 0.0, 1.0);
    vec2 dp = p - (a + ba * t);
    l = length(dp);
    R = max(mix(ra, rb, t), 1e-3);
    sgn = cr >= 0.0 ? -1.0 : 1.0;
    g = l > 1e-4 ? dp / l : vec2(-ba.y, ba.x) / sqrt(h) * sgn;
    return d;
  }

  // Stamp cell code → material (slot), absolute tone (−1 = shade the layer), tone shift, flags.
  void stampCode(int c, vec4 T2, vec4 T4, out float m, out float ab, out float dt, out int sf) {
    m = 0.0;
    ab = -1.0;
    dt = 0.0;
    sf = 0;
    if (c <= 24) {
      int slot = (c - 1) / 6;
      m = slot == 0 ? T2.x : slot == 1 ? T2.y : slot == 2 ? T2.z : T4.x;
      ab = float(c - 1 - slot * 6) / 5.0;
    } else if (c <= 34) {
      dt = -float(c - 30) / 5.0;
      sf = 128;
    } else if (c == 40) {
      dt = 0.2;
      sf = 128;
    } else {
      int slot = c - 50;
      m = slot == 0 ? T2.x : slot == 1 ? T2.y : slot == 2 ? T2.z : T4.x;
      ab = 1.0;
      sf = 2;
    }
  }

  void main() {
    vec2 p = gl_FragCoord.xy;
    // Visible (nearest covered) layer so far.
    float bZ = 1e9, bLayer = -1.0, bMat = 0.0, bTone = 0.0, bU = 0.0, bV = 0.0, bSeed = 0.0, bT = 0.0, bAbs = -1.0, bFore = 1.0;
    int bFlags = 0;
    vec3 bN = vec3(0.0, 0.0, 1.0);
    for (int L = 0; L < ${MAX_LAYERS}; L++) {
      if (L >= uLayers) break;
      // Whole layer out of reach of this texel: one compare, no fetches.
      vec4 lb = uLayerBox[L];
      if (p.x < lb.x || p.y < lb.y || p.x > lb.z || p.y > lb.w) continue;
      int i0 = int(uLayerRange[L].x + 0.5);
      int i1 = int(uLayerRange[L].y + 0.5);
      float lD = 1e9, lR = 1.0, lZ = 0.0;
      vec2 lG = vec2(0.0, 1.0);
      float cD = 1e9, cZ = 1e9, cMat = 0.0, cU = 0.0, cV = 0.0, cTone = 0.0, cSeed = 0.0, cT = 0.0, cAbs = -1.0, cFore = 1.0;
      bool cCov = false;
      int cFlags = 0;
      float dMat = -1.0, dTone = 0.0, dAbs = -1.0;
      int dFlags = 0;
      for (int i = i0; i < i1; i++) {
        // Texel bounding box first: a primitive out of reach costs one fetch.
        vec4 B = texelFetch(uPrims, ivec2(5, i), 0);
        if (p.x < B.x || p.y < B.y || p.x > B.z || p.y > B.w) continue;
        vec4 T3 = texelFetch(uPrims, ivec2(3, i), 0);
        int flags = int(T3.y + 0.5);
        bool decal = (flags & 1) != 0;
        if (decal && lD > 0.0) continue;
        vec4 T0 = texelFetch(uPrims, ivec2(0, i), 0);
        vec4 T1 = texelFetch(uPrims, ivec2(1, i), 0);
        vec4 T2 = texelFetch(uPrims, ivec2(2, i), 0);
        if ((flags & 256) != 0) {
          // ── Stamp: a hand-pixelled bitmap cell (whole texels, never resampled). ──
          vec2 q = floor((p - T0.xy) / T1.x);
          float qx = T3.z > 0.5 ? T1.y - 1.0 - q.x : q.x;
          int c = int(texelFetch(uStamps, ivec2(int(T0.z + qx), int(T0.w + q.y)), 0).r * 255.0 + 0.5);
          if (c == 0) continue;
          vec4 T4 = texelFetch(uPrims, ivec2(4, i), 0);
          float sm, sab, sdt;
          int sf;
          stampCode(c, T2, T4, sm, sab, sdt, sf);
          if (decal) {
            dMat = sm;
            dTone = sdt;
            dAbs = sab;
            dFlags = sf | 64 | 4;
            continue;
          }
          float z = T1.z;
          if (lD > 1e8) {
            lG = vec2(0.0, 1.0);
            lR = 1.0;
            lZ = z;
          }
          lD = min(lD, -0.5);
          if (!cCov || z < cZ) {
            cCov = true;
            cZ = z;
            cD = -0.5;
            cMat = sm;
            cU = 0.0;
            cV = 0.0;
            cTone = T4.z + sdt;
            cFlags = sf | 64;
            cSeed = 0.0;
            cT = 0.5;
            cAbs = sab;
            cFore = 1.0;
          }
          continue;
        }
        float t, l, sgn, R;
        vec2 g;
        float d = roundCone(p, T0, T1, t, l, sgn, g, R);
        float len = length(T0.zw - T0.xy);
        if (T3.z > 0.0) {
          // Ragged edge: value noise along the outline (sticks to the part).
          float along = t * len + (t <= 0.0 || t >= 1.0 ? atan(g.y, g.x) * R : 0.0);
          float w = (flags & 8) != 0 ? smoothstep(0.45, 1.0, t) : 1.0;
          float nz = vnoise(vec2(along * 0.55, T3.w * 7.0 + sgn * 3.0));
          if ((flags & 16) != 0) nz = 1.0 - abs(fract(along * 0.42 + nz * 0.8) * 2.0 - 1.0);
          d += T3.z * w * (nz * 2.0 - 1.0);
        }
        if ((flags & 32) != 0) {
          // Tooth row: little triangles (2-texel period, up to 2R long) on both sides of the
          // lip line — the half inside the lip / jaw is hidden by it (give the row a +zBias).
          float f = fract(t * len * 0.5 + T3.w);
          float tooth = (1.0 - abs(f * 2.0 - 1.0)) * (0.75 + 0.25 * hash12(vec2(floor(t * len * 0.5 + T3.w), T3.w)));
          d = t > 0.0 && t < 1.0 ? l - tooth * 2.0 * R : 1.0;
        }
        vec4 T4 = texelFetch(uPrims, ivec2(4, i), 0);
        float mat = t > T2.z ? T2.y : T2.x;
        if (decal) {
          if (d < 0.0) {
            dMat = mat;
            dTone = T4.z;
            dAbs = -1.0;
            dFlags = flags;
          }
          continue;
        }
        float k = max(T2.w, 1e-3);
        float wb = clamp(0.5 + 0.5 * (lD - d) / k, 0.0, 1.0);
        float hh = max(k - abs(lD - d), 0.0) / k;
        float z = mix(T1.z, T1.w, t);
        if (lD > 1e8) {
          lG = g;
          lR = R;
          lZ = z;
        } else {
          lG = mix(lG, g, wb);
          lR = mix(lR, R, wb);
          lZ = mix(lZ, z, wb);
        }
        lD = min(lD, d) - hh * hh * k * 0.25;
        // Material / pattern frame: the front-most primitive covering the texel
        // (else the nearest one, in the blend fillets).
        float xr = min(l / R, 1.0);
        float zf = z - R * z / uTexS * sqrt(max(0.0, 1.0 - xr * xr));
        bool covers = d < 0.0;
        if (covers ? (!cCov || zf < cZ) : (!cCov && d < cD)) {
          cCov = covers;
          cZ = zf;
          cD = d;
          cMat = mat;
          cU = T4.x + t * T4.y;
          cV = sgn * l * z / uTexS;
          cTone = T4.z;
          cFlags = flags;
          cSeed = T3.w;
          cT = t;
          cAbs = -1.0;
          // Foreshortening of the part (1 = seen side-on): patterns along u fade head-on.
          cFore = clamp(len * z / uTexS / max(T4.y, 1e-3), 0.0, 1.0);
        }
      }
      // ── Commit the layer: shade it, keep it if it is the nearest. ──
      if (lD <= 0.0) {
        float xp = clamp(1.0 + lD / max(lR, 0.5), 0.0, 1.0);
        float nz = sqrt(max(0.0, 1.0 - xp * xp));
        // Flatter in the middle, rolling off at the edge: broad lit planes, not pillows.
        float xs = xp * xp * (1.6 - 0.6 * xp);
        vec2 g2 = length(lG) > 1e-4 ? normalize(lG) : vec2(0.0, 1.0);
        float rm = lR * lZ / uTexS;
        float z = lZ - rm * nz;
        if (z < bZ) {
          bZ = z;
          bLayer = float(L);
          bool flatN = (cFlags & 64) != 0;
          bN = flatN ? vec3(0.0, 0.0, 1.0) : normalize(vec3(g2 * xs, sqrt(max(0.0, 1.0 - xs * xs))));
          bMat = cMat;
          bTone = cTone;
          bFlags = cFlags;
          bAbs = cAbs;
          if (dMat >= 0.0) {
            if ((dFlags & 128) == 0) {
              bMat = dMat;
              bFlags = dFlags;
              bAbs = dAbs;
            }
            bTone += dTone;
          }
          bU = cU;
          bV = cV;
          bSeed = cSeed;
          bT = cT;
          bFore = cFore;
        }
      }
    }
    if (bLayer < 0.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float mat = bMat;
    float tone;
    if (bAbs >= 0.0) {
      // Stamp pixel: the artist's own ramp step (plus any shade the stamp asked for).
      tone = bAbs + min(bTone, 0.0) * 0.5;
    } else {
    // ── Light + material pattern ──
    float diff = dot(bN, uLight);
    tone = uShade.x + uShade.y * max((diff + uShade.z) / (1.0 + uShade.z), 0.0) + bTone;
    vec4 m1 = texelFetch(uMats, ivec2(${STEPS}, int(mat + 0.5)), 0);
    vec4 m2 = texelFetch(uMats, ivec2(${STEPS + 1}, int(mat + 0.5)), 0);
    int pat = int(m1.r * 255.0 + 0.5);
    float scale = max(m1.g * 0.5, 0.005);
    float str = m1.b;
    float sec = floor(m1.a * 255.0 + 0.5);
    vec2 uv = vec2(bU, bV);
    vec2 ip = floor(p);
    float spec = m2.b;
    float sd = bSeed * 1.37;
    if (pat == 1) {
      // WEAVE: grime and sweat patches (big clusters, no per-texel noise); rare stains.
      float n = vnoise(uv * 6.0 + sd);
      if (sec > 0.5 && n > 0.86) mat = sec;
      else if (n > 0.66) tone -= 0.08 * str;
    } else if (pat == 2) {
      // DENIM: worn, faded patches on the lit planes.
      float n = vnoise(uv * 5.0 + sd);
      if (n > 0.68 && tone > 0.45) tone += 0.1 * str;
      if (sec > 0.5 && vnoise(uv * 7.0 + sd + 5.0) > 0.88) mat = sec;
    } else if (pat == 3) {
      // PLAID: buffalo check stuck to the body.
      vec2 c = floor(uv / scale + vec2(sd, 0.0));
      float a = mod(c.x, 2.0), b2 = mod(c.y, 2.0);
      if (a * b2 > 0.5 && sec > 0.5) mat = sec;
      else tone -= (a + b2) * 0.2 * str;
    } else if (pat == 4) {
      // ROT: rot patches (secondary), purple bruising (tertiary), dark veins.
      float n = vnoise(uv * 8.0 + sd);
      float n2 = vnoise(uv * 10.0 + sd + 9.0);
      float ter = floor(m2.a * 255.0 + 0.5);
      if (sec > 0.5 && n > 1.06 - 0.5 * str) mat = sec;
      else if (ter > 0.5 && n2 > 1.21 - 0.5 * str) mat = ter;
      else if (n2 > 0.66) tone -= 0.1 * str;
      float v = abs(vnoise(uv * 5.0 + sd + 3.0) - 0.5);
      if (v < 0.02) tone -= 0.16 * str;
    } else if (pat == 5) {
      // FLESH: smooth, a touch of warmth in the light.
      tone += 0.02 * str;
    } else if (pat == 6) {
      // HAIR: clumps of strands along the part.
      float s = hash12(vec2(floor(bV * 45.0 + sd), sd));
      tone += (s - 0.5) * 0.24 * str;
    } else if (pat == 9) {
      // WET: a glistening speck here and there on the lit side.
      if (hash12(floor(ip / 2.0) + sd) > 0.93 && tone > 0.55) tone += 0.3 * str;
    } else if (pat == 10) {
      // SCALES: small cells with dark seams.
      vec2 q = uv / (scale * 0.25);
      q.x += mod(floor(q.y), 2.0) * 0.5;
      vec2 f = fract(q);
      if (f.x < 0.22 || f.y < 0.22) tone -= 0.09 * str;
      tone += (hash12(floor(q) + sd) - 0.5) * 0.08 * str;
    } else if (pat == 11) {
      // STRIPES: bold chevrons slanting back and down from the spine, uneven in
      // width and broken here and there, fading out above the pale belly; a darker
      // saddle along the back. Seen end-on (head-on pounce) they fade to the saddle.
      float vert = clamp(bN.y * 1.4, -1.0, 1.0);
      float s = (bU - (1.0 - vert) * scale * 0.55) / scale + vnoise(vec2(bU * 3.0, sd)) * 0.3;
      float id = floor(s);
      float wid = 0.2 + 0.22 * hash12(vec2(id, sd + 1.0));
      float brk = hash12(vec2(id * 3.0 + floor(vert * 2.5), sd + 7.0));
      float fade = smoothstep(-0.5, 0.0, vert) * smoothstep(0.3, 0.7, bFore);
      float ter = floor(m2.a * 255.0 + 0.5);
      if (fract(s) < wid * fade && brk > 0.15) {
        if (ter > 0.5) mat = ter;
        else tone -= 0.32 * str;
      } else if (vert > 0.55) tone -= 0.1 * str;
      vec2 q = uv / 0.035;
      q.x += mod(floor(q.y), 2.0) * 0.5;
      vec2 f = fract(q);
      if (f.x < 0.2 || f.y < 0.2) tone -= 0.06;
      if (sec > 0.5 && bN.y < -0.42 && length(bN.xy) > 0.5) mat = sec;
    } else if (pat == 12) {
      // GOWN: little print dots.
      if (mod(ip.x + floor(ip.y / 3.0) * 2.0, 4.0) < 0.5 && mod(ip.y, 3.0) < 0.5) tone -= 0.14 * str;
    } else if (pat == 13) {
      // CAMO: hard blotches.
      float n = vnoise(uv / scale + sd);
      tone += n > 0.62 ? -0.22 * str : n < 0.3 ? 0.1 * str : 0.0;
    } else if (pat == 14) {
      // RIBS: bone bars across the wound.
      float s = fract(bU / scale);
      if (s < 0.42 && abs(bV) < 0.075) mat = sec;
    } else if (pat == 15) {
      // PLATE: brushed metal — a hard specular band, scratches, rivets near the ends.
      float sc = hash12(vec2(floor(bU * 40.0 + bV * 25.0), floor(bV * 60.0) + sd));
      if (sc > 0.93) tone += 0.16 * str;
      if (abs(bV) > 0.0 && fract(bU / scale) < 0.08 && hash12(vec2(floor(bU / scale), sd)) > 0.4 && abs(abs(bV) - 0.04) < 0.012) tone += 0.25;
    }
    // Cloth folds: short drawn creases bunching toward the joints (elbows, knees, waist).
    if (pat == 1 || pat == 2 || pat == 3 || pat == 12 || pat == 13) {
      float j = 1.0 - smoothstep(0.04, 0.2, min(bT, 1.0 - bT));
      if (j > 0.0) {
        // Short broken diagonal strokes on the shaded side of the part.
        float fl = fract((bU + abs(bV) * 1.1 + vnoise(vec2(bU * 9.0, sd)) * 0.04) / 0.06);
        float keep = step(0.45, vnoise(vec2(floor((bU + abs(bV) * 1.1) / 0.06) * 3.1, bV * 25.0 + sd)));
        if (fl < 0.18 && keep > 0.5 && bN.x > -0.6) tone -= 0.16 * j;
      }
    }
    // Specular glint (wet, leather, plastic, hair).
    if (spec > 0.0) {
      vec3 H = normalize(uLight + vec3(0.0, 0.0, 1.0));
      float s = pow(max(dot(bN, H), 0.0), 22.0);
      tone += s * spec * uShade.w;
    }
    }
    bool glow = (bFlags & 2) != 0 || texelFetch(uMats, ivec2(${STEPS + 1}, int(mat + 0.5)), 0).r > 0.5;
    int fl = (glow ? 1 : 0) | ((bFlags & 4) != 0 ? 2 : 0);
    gl_FragColor = vec4(mat / 255.0, clamp(tone, 0.0, 1.0), packDepth(bZ), (bLayer * 16.0 + float(fl)) / 255.0);
  }
`;

const RESOLVE_FRAG = /* glsl */ `
  precision highp float;
  precision highp int;
  uniform sampler2D uG;
  uniform sampler2D uMats;
  uniform vec2 uSize;
  uniform vec3 uTint;
  uniform vec4 uRim;
  uniform vec4 uFog;
  uniform float uGap;
  uniform float uOutline;
  uniform float uSmall;

  float bayer4(ivec2 p) {
    int i = (p.x & 3) + (p.y & 3) * 4;
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[i]) + 0.5) / 16.0 - 0.5;
  }
  vec4 G(ivec2 q) {
    if (q.x < 0 || q.y < 0 || q.x >= int(uSize.x) || q.y >= int(uSize.y)) return vec4(0.0);
    return texelFetch(uG, q, 0);
  }
  int layerOf(vec4 c) { return int(c.a * 255.0 + 0.5) >> 4; }
  vec3 ramp(float mat, float s) { return texelFetch(uMats, ivec2(int(s + 0.5), int(mat + 0.5)), 0).rgb; }

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 c = G(p);
    if (c.r < 0.5 / 255.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float mat = floor(c.r * 255.0 + 0.5);
    int fl = int(c.a * 255.0 + 0.5) & 15;
    if ((fl & 1) != 0) {
      gl_FragColor = vec4(ramp(mat, ${STEPS - 1}.0), c.b);
      return;
    }
    vec4 nR = G(p + ivec2(1, 0));
    vec4 nL = G(p - ivec2(1, 0));
    vec4 nU = G(p + ivec2(0, 1));
    vec4 nD = G(p - ivec2(0, 1));
    bool eR = nR.r < 0.5 / 255.0, eL = nL.r < 0.5 / 255.0, eU = nU.r < 0.5 / 255.0, eD = nD.r < 0.5 / 255.0;
    vec4 m2 = texelFetch(uMats, ivec2(${STEPS + 1}, int(mat)), 0);
    float dith = m2.g * 0.5;
    float s = c.g * ${STEPS - 1}.0;
    float th = bayer4(p);
    float st = clamp(floor(s + 0.5 + th * 2.0 * dith), 1.0, ${STEPS - 1}.0);
    bool edge = eR || eL || eU || eD;
    bool thin = (eL && eR) || (eU && eD);
    bool noOut = (fl & 2) != 0 || uOutline < 0.5;
    int L = layerOf(c);
    bool ink = false;
    if (edge && !noOut) {
      // Exterior outline: near-black (hue-shifted toward the local colour) on the
      // shadow side so the figure reads as an icon against any background; the
      // darkest shade of the local colour on a lit top / left edge (selective outline).
      if (thin) st = max(st - 1.0, 1.0);
      else if ((eU || eL) && !eD && !eR && st >= 4.0) st = 0.0;
      else {
        st = 0.0;
        ink = true;
      }
    } else if (!noOut) {
      // Inner contour: this texel's layer overlaps a farther one.
      bool ct = (layerOf(nR) != L && nR.b - c.b > uGap) || (layerOf(nL) != L && nL.b - c.b > uGap) ||
                (layerOf(nU) != L && nU.b - c.b > uGap) || (layerOf(nD) != L && nD.b - c.b > uGap);
      if (ct) st = 0.0;
      else {
        // Cast shadow: a nearer part up-left of this texel (toward the light) shades it.
        vec4 s1 = G(p + ivec2(-1, 1));
        vec4 s2 = G(p + ivec2(-2, 2));
        bool sh = (s1.r > 0.5 / 255.0 && layerOf(s1) != L && c.b - s1.b > uGap) || (s2.r > 0.5 / 255.0 && layerOf(s2) != L && c.b - s2.b > uGap) ||
                  (!eU && layerOf(nU) != L && c.b - nU.b > uGap);
        // Under a hem / cuff / collar of another material on the same part: a step of shadow.
        if (!eU && layerOf(nU) == L && abs(nU.r - c.r) > 0.5 / 255.0 && abs(nU.b - c.b) < uGap) sh = true;
        if (sh) st = max(1.0, st - 1.0);
        // Lit rim: one texel inside a top / left silhouette edge, a step of light.
        else if (st >= 2.0 && ((G(p + ivec2(0, 2)).r < 0.5 / 255.0 && layerOf(nU) == L) || (G(p - ivec2(2, 0)).r < 0.5 / 255.0 && layerOf(nL) == L))) st = min(st + 1.0, ${STEPS - 1}.0);
      }
    }
    // Small sprites (far away): three bold steps, the base a notch lighter — an icon, not mush.
    if (uSmall > 0.5 && st > 0.5 && !noOut) st = st < 2.5 ? 2.0 : st < 4.5 ? 4.0 : 5.0;
    vec3 col = ramp(mat, st);
    if (ink) col = col * 0.42 + vec3(0.012, 0.008, 0.03);
    col *= uTint;
    // Night: cool back-light rim on the edge away from the key light.
    if (uRim.a > 0.0 && (eR || eU) && !(eL && eR)) col = mix(col, uRim.rgb, min(1.0, uRim.a * (1.0 + 0.5 * uSmall)));
    col = mix(col, uFog.rgb, uFog.a);
    gl_FragColor = vec4(col, c.b);
  }
`;

/** Shading look (tunable from the debug console / lab). */
export interface CastLook {
  /** Light direction in screen space (x right, y up, z toward the viewer). */
  light: [number, number, number];
  ambient: number;
  diffuse: number;
  /** Wrap lighting (0 = hard terminator). */
  wrap: number;
  spec: number;
  outline: number;
  /** Inner-contour depth gap (metres). */
  gap: number;
}

export const DEFAULT_CAST: CastLook = {
  light: [-0.55, 0.62, 0.56],
  ambient: 0.2,
  diffuse: 0.76,
  wrap: 0,
  spec: 0.45,
  outline: 1,
  gap: 0.07,
};

/** Per-sprite lighting context (stage tint, rim, fog), display space. */
export interface CastEnv {
  tint: THREE.Color;
  rim: THREE.Color;
  rimAmount: number;
  fog: THREE.Color;
  fogAmount: number;
}

const SCRATCH = 256;

export class PixelCast {
  readonly look: CastLook = { ...DEFAULT_CAST, light: [...DEFAULT_CAST.light] };
  private gbuf: THREE.WebGLRenderTarget;
  private primTex: THREE.DataTexture;
  private matTex: THREE.DataTexture;
  private stampTex: THREE.DataTexture;
  private matVersion = -1;
  private paintMat: THREE.ShaderMaterial;
  private resolveMat: THREE.ShaderMaterial;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private primData: Float32Array;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.gbuf = new THREE.WebGLRenderTarget(SCRATCH, SCRATCH, {
      type: THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.gbuf.scissorTest = true;
    this.primData = new Float32Array(MAX_PRIMS * PRIM_FLOATS);
    this.primTex = new THREE.DataTexture(this.primData, PRIM_FLOATS / 4, MAX_PRIMS, THREE.RGBAFormat, THREE.FloatType);
    this.primTex.minFilter = this.primTex.magFilter = THREE.NearestFilter;
    this.primTex.generateMipmaps = false;
    const mt = materialTable();
    this.matTex = new THREE.DataTexture(mt.data, mt.cols, mt.rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.matTex.minFilter = this.matTex.magFilter = THREE.NearestFilter;
    this.matTex.generateMipmaps = false;
    this.matTex.colorSpace = THREE.NoColorSpace;
    this.stampTex = new THREE.DataTexture(stampAtlas(), STAMP_ATLAS, STAMP_ATLAS, THREE.RedFormat, THREE.UnsignedByteType);
    this.stampTex.minFilter = this.stampTex.magFilter = THREE.NearestFilter;
    this.stampTex.generateMipmaps = false;
    this.stampTex.colorSpace = THREE.NoColorSpace;
    this.stampTex.needsUpdate = true;
    const lr: THREE.Vector2[] = [];
    const lb: THREE.Vector4[] = [];
    for (let i = 0; i < MAX_LAYERS; i++) {
      lr.push(new THREE.Vector2());
      lb.push(new THREE.Vector4());
    }
    this.paintMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: PAINT_FRAG,
      uniforms: {
        uPrims: { value: this.primTex },
        uMats: { value: this.matTex },
        uStamps: { value: this.stampTex },
        uLayers: { value: 0 },
        uLayerRange: { value: lr },
        uLayerBox: { value: lb },
        uDepthRange: { value: new THREE.Vector2(0, 1) },
        uTexS: { value: 1 },
        uLight: { value: new THREE.Vector3() },
        uShade: { value: new THREE.Vector4() },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.resolveMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: RESOLVE_FRAG,
      uniforms: {
        uG: { value: this.gbuf.texture },
        uMats: { value: this.matTex },
        uSize: { value: new THREE.Vector2() },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uRim: { value: new THREE.Vector4() },
        uFog: { value: new THREE.Vector4() },
        uGap: { value: 0.02 },
        uOutline: { value: 1 },
        uSmall: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.paintMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Compile both passes (shader warm-up). */
  precompile() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    try {
      r.setRenderTarget(this.gbuf);
      this.quad.material = this.paintMat;
      r.compile(this.scene, this.cam);
      this.quad.material = this.resolveMat;
      r.compile(this.scene, this.cam);
    } finally {
      r.setRenderTarget(prev);
    }
  }

  /**
   * Paint `f` (after `layout`) into `dst` (its W × H corner). Two draws. The
   * caller binds / restores render targets and clear colours around batches.
   */
  paint(f: PixelFigure, dst: THREE.WebGLRenderTarget, env: CastEnv) {
    const r = this.renderer;
    const mt = materialTable();
    if (mt.version !== this.matVersion) {
      this.matVersion = mt.version;
      this.matTex.needsUpdate = true;
    }
    this.primData.set(f.data);
    this.primTex.needsUpdate = true;
    const L = this.look;
    const pu = this.paintMat.uniforms;
    pu.uLayers.value = f.layers;
    const lr = pu.uLayerRange.value as THREE.Vector2[];
    const lb = pu.uLayerBox.value as THREE.Vector4[];
    for (let i = 0; i < f.layers; i++) {
      lr[i].set(f.layerRange[i * 2], f.layerRange[i * 2 + 1]);
      lb[i].set(f.layerBox[i * 4], f.layerBox[i * 4 + 1], f.layerBox[i * 4 + 2], f.layerBox[i * 4 + 3]);
    }
    (pu.uDepthRange.value as THREE.Vector2).set(f.d0, f.d1);
    pu.uTexS.value = f.texS;
    (pu.uLight.value as THREE.Vector3).set(L.light[0], L.light[1], L.light[2]).normalize();
    (pu.uShade.value as THREE.Vector4).set(L.ambient, L.diffuse, L.wrap, L.spec);
    const W = f.W;
    const H = f.H;
    this.gbuf.viewport.set(0, 0, W, H);
    this.gbuf.scissor.set(0, 0, W, H);
    r.setRenderTarget(this.gbuf);
    this.quad.material = this.paintMat;
    r.render(this.scene, this.cam);

    const ru = this.resolveMat.uniforms;
    (ru.uSize.value as THREE.Vector2).set(W, H);
    (ru.uTint.value as THREE.Color).copy(env.tint);
    (ru.uRim.value as THREE.Vector4).set(env.rim.r, env.rim.g, env.rim.b, env.rimAmount);
    (ru.uFog.value as THREE.Vector4).set(env.fog.r, env.fog.g, env.fog.b, env.fogAmount);
    ru.uGap.value = (L.gap / Math.max(f.d1 - f.d0, 1e-3)) * 254 / 255;
    ru.uOutline.value = L.outline;
    // Far-away figures (under ~45 texels tall) collapse to three bold steps.
    ru.uSmall.value = H * f.kpx < 45 ? 1 : 0;
    dst.viewport.set(0, 0, W, H);
    dst.scissor.set(0, 0, W, H);
    r.setRenderTarget(dst);
    this.quad.material = this.resolveMat;
    r.render(this.scene, this.cam);
  }

  /** GPU bytes held (scratch G-buffer + tables). */
  bytes(): number {
    return SCRATCH * SCRATCH * 4 + MAX_PRIMS * PRIM_FLOATS * 4 + MAT_COLS * 256 * 4 + STAMP_ATLAS * STAMP_ATLAS;
  }

  dispose() {
    this.gbuf.dispose();
    this.primTex.dispose();
    this.matTex.dispose();
    this.stampTex.dispose();
    this.paintMat.dispose();
    this.resolveMat.dispose();
    this.quad.geometry.dispose();
  }
}

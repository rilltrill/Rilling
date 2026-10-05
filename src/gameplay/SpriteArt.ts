import * as THREE from 'three';
import type { World } from './World';
import type { Entity } from './Entity';
import { Enemy } from './Enemy';
import { Civilian } from './Civilian';
import { Projectile } from './Projectile';
import { Pickup } from './Pickup';
import { RETRO_DETAIL } from '../content/kit/ModelKit';
import { buildPalette, linearToOklab, PALETTE_MAX, paletteRamps, type PaletteId } from './spritePalette';
import { PixelFigure } from './pixel/figure';
import { PixelCast, type CastEnv } from './pixel/PixelCast';

/**
 * ART: SPRITES — every character (enemies, bosses, civilians), plus the things
 * they throw, the pickups they drop and the limbs they lose, is drawn as a 2D
 * pixel-art sprite, like the pre-rendered sprites of 90s arcade shooters.
 *
 * Live impostors: about 12 times a second of game time (round-robin, capped per
 * frame) each visible source is re-rendered from the main camera into a small
 * offscreen image — the main camera's projection cropped to its on-screen bounds,
 * lit by mirrors of the stage's own lights, with the stage fog — at a WHOLE number
 * of retro screen pixels per texel (1 far, 2 mid, 3 close), 2x supersampled, with
 * the characters' pixel textures boosted. A bake pass turns that into pixel art:
 * texture-preserving downsample (the sample nearest the median, plus local
 * contrast), crisp alpha with knocked-out box corners, a selective outline drawn
 * inside the silhouette (a dark shade of the local colour), inner contours, a top
 * light and a cool back-light rim in dark stages, dithered luminance bands with
 * hue-shifted shading (cool shadows, warm highlights) and the campaign's restricted
 * palette, matched in display space. Glows (eyes, weak points) are tagged during
 * the bake and skip all of that. Each texel's view depth goes into alpha, so the
 * screen-aligned billboard — snapped to the retro pixel grid every frame — writes
 * per-pixel depth: scenery occludes sprites (and sprites each other) like the 3D
 * models would. Characters get a pixel blob shadow (one instanced draw for all).
 *
 * Some parts stay real 3D meshes drawn live over the sprite: alpha-blended ones
 * (glow halos, IV tubes, spray), lines and very thin geometry, and anything tagged
 * `userData.spriteKeep3D = true`.
 *
 * Gameplay is untouched: the real 3D models keep updating, animating and being
 * raycast (hitboxes, aim assist, AutoPlayer, the simulator); they are only hidden
 * for the main camera's draw (`beginFrame` … render … `endFrame`).
 */

/** Sprite animation rate (bakes per character per second of game time). */
export const SPRITE_FPS = 12;
/** Most character re-renders in one frame (never-drawn characters may exceed it). */
const MAX_BAKES_PER_FRAME = 6;
const MAX_FIRST_BAKES = 18;
/**
 * Draw calls the bakes of one frame may spend (a bake costs its source's meshes
 * + 1); at least one bake always runs. Keeps a 100-mesh boss from landing on the
 * same frame as a crowd's bakes. Characters with no image yet get a bigger one.
 */
const BAKE_CALL_BUDGET = 90;
/**
 * Texels repainted per frame (after the first redraw): the paint pass costs about
 * texels × primitives, so a close boss and a horde never land in the same frame
 * (the most overdue go first; the rest wait a frame or two). ≈ two big sprites.
 */
const TEXEL_BUDGET = 52000;
const FIRST_BAKE_CALL_BUDGET = 170;

/** Redraw schedule of one quality level: animation rate, redraws and texels per frame. */
export interface SpriteSchedule {
  fps: number;
  maxBakes: number;
  texelBudget: number;
}
const SCHEDULE: SpriteSchedule = { fps: SPRITE_FPS, maxBakes: MAX_BAKES_PER_FRAME, texelBudget: TEXEL_BUDGET };
/**
 * GRAPHICS LOW (older iPhones, Low Power Mode): characters redraw at 10 fps of
 * game time, at most 4 redraws and ≈ 36 k texels a frame — ~30 % less paint-pass
 * work, still smooth secondary motion (positions stay smooth at 60).
 */
const SCHEDULE_LOW: SpriteSchedule = { fps: 10, maxBakes: 4, texelBudget: 36000 };

/** The redraw schedule for a GRAPHICS quality level. */
export function spriteSchedule(quality: string): SpriteSchedule {
  return quality === 'low' ? SCHEDULE_LOW : SCHEDULE;
}
/** Frames an on-screen character may stay hidden waiting for its first image before its 3D model shows. */
const PENDING_FRAMES = 3;
/** Sprite size caps in texels (beyond them texels grow). */
const MAX_TEX = 256;
const MAX_TEX_BOSS = 512;
/** Scratch target (raw bake: HDR colour + depth). Must hold the biggest sprite. */
const SCRATCH = 512;
/** NDC margin kept beyond the screen edge, so a sprite moving in between bakes doesn't show a cut edge. */
const EDGE = 0.12;
/** Re-bake when the view direction to a sprite turned by more than this (cos 4°). */
const TURN_COS = Math.cos((4 * Math.PI) / 180);
/** Layer nothing renders: parts hidden from one camera without touching `visible`. */
const OFF_LAYER = 31;

const _box = new THREE.Box3();
const _mb = new THREE.Box3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _crop = new THREE.Matrix4();
const _clear = new THREE.Color();

/** Tunable look (exposed for the debug console / A-B tests: `&spriteLook=pal:0,k:2`). */
export interface SpriteLook {
  /** Dithered luminance levels in display (gamma) space. 0 = off. */
  bands: number;
  /** Ordered-dither strength between bands / palette colours (0..1). */
  dither: number;
  /** Outline brightness: the outline is the local colour × this (0 = black). */
  outline: number;
  /** Inner contour lines where a part stands in front of another (0 = off, 1 = as dark as the outline). */
  inner: number;
  /** Top light on the upper edge (0 = off). */
  rim: number;
  /** Cool back-light rim around the silhouette in dark stages (0 = off). */
  rimLight: number;
  /** Saturation multiplier (pixel-art palettes are punchier). */
  saturation: number;
  /** Local contrast: keeps texture grit through the downsample (0 = off). */
  sharpen: number;
  /** Characters' pixel-texture strength while baking (1 = as authored). */
  detail: number;
  /** Hue-shifted shading: cool shadows, warm highlights (0 = off). */
  hue: number;
  /** Restricted per-campaign palette (1 = on). */
  pal: number;
  /** Knock out box-corner texels (1 = on). */
  round: number;
  /** Retro pixels per texel; 0 = auto (1 far, 2 mid, 3 close). Whole numbers only. */
  pxPerTexel: number;
  /** Auto scale: on-screen size (retro px) where texels become 2 and 3 pixels (0 = never). */
  k2: number;
  k3: number;
  /** Supersampling (1 or 2). */
  ss: number;
  /** Blob shadow strength under sprites (0 = off). */
  shadows: number;
  /** Doom-style turning: characters shown at the nearest of this many view angles (0 = off; try 8). */
  dirs: number;
  /** Finest texel in world units (cm; bosses 2×). 0 = off. */
  texelCm: number;
}

export const DEFAULT_LOOK: SpriteLook = {
  bands: 14,
  dither: 0.15,
  outline: 0.4,
  inner: 0.3,
  rim: 0.18,
  rimLight: 1,
  saturation: 1.12,
  sharpen: 0.25,
  detail: 1.25,
  hue: 0.3,
  pal: 1,
  round: 1,
  pxPerTexel: 0,
  k2: 300,
  k3: 0,
  ss: 2,
  shadows: 1,
  texelCm: 1.2,
  dirs: 0,
};

/** Parse `bands:8,dither:0.3,k:1` (debug URL `&spriteLook=`) over a look. */
export function parseLook(spec: string | null | undefined, base: SpriteLook = DEFAULT_LOOK): SpriteLook {
  const out = { ...base };
  if (!spec) return out;
  for (const part of spec.split(',')) {
    const [k, v] = part.split(':');
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const key = (k === 'k' ? 'pxPerTexel' : k === 'sat' ? 'saturation' : k) as keyof SpriteLook;
    if (key in out) out[key] = n;
  }
  return out;
}

/**
 * Whole retro pixels per texel for a sprite `size` retro px tall: 1 far, 2 mid,
 * 3 close, with 10 % hysteresis around the steps (`prev` = last choice).
 */
export function autoTexelScale(size: number, prev: number, k2: number, k3: number): number {
  const up = 1.1;
  const down = 0.9;
  if (!(k3 > 0)) k3 = Infinity;
  if (!(k2 > 0)) k2 = Infinity;
  let k = size < k2 ? 1 : size < k3 ? 2 : 3;
  if (prev === k - 1 && size < (k === 2 ? k2 : k3) * up) k = prev;
  else if (prev === k + 1 && size > (k === 1 ? k2 : k3) * down) k = prev;
  return k;
}

const FULL_VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Shared GLSL: the retro pass's tone curve (display = aces(scene × exposure)) and its inverse. */
const TONE = /* glsl */ `
  vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }
  vec3 invAces(vec3 y) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    y = clamp(y, 0.0, 0.985);
    vec3 A = a - c * y;
    vec3 B = b - d * y;
    vec3 C = -e * y;
    return (-B + sqrt(B * B - 4.0 * A * C)) / (2.0 * A);
  }
`;

/**
 * Raw bake → pixel-art sprite texel. Stored in DISPLAY space (what the retro
 * pass will show, gamma-encoded) so dark stages keep their shades and the palette
 * matches what the player sees; alpha = 0 empty, else packed depth.
 */
const BAKE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uSize;        // sprite size in texels
  uniform int uSS;           // supersampling: raw texels per sprite texel (per axis)
  uniform vec2 uDepthRange;  // view distance mapped to alpha 1/255 … 1
  uniform vec2 uProj;        // projection elements [10], [14] (depth → view distance)
  uniform float uExp;        // display exposure (retro pass)
  uniform float uLevels;
  uniform float uDither;
  uniform float uOutline;
  uniform float uInner;
  uniform float uRim;
  uniform float uSat;
  uniform float uSharp;
  uniform float uHue;
  uniform float uRefL;       // display luminance of a lit mid surface in this stage (hue-shift reference)
  uniform float uRound;
  uniform float uSmall;      // 1 = tiny sprite (softer outline)
  uniform int uPalN;
  uniform vec4 uPal[${PALETTE_MAX}];     // OKLab + ramp id
  uniform vec3 uPalRgb[${PALETTE_MAX}];  // display-linear rgb
  ${TONE}

  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  float bayer4(ivec2 p) {
    int i = (p.x & 3) + (p.y & 3) * 4;
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[i]) + 0.5) / 16.0 - 0.5;
  }
  float dist(ivec2 q) {
    float z = texelFetch(tDepth, q, 0).r * 2.0 - 1.0;
    return uProj.y / (z + uProj.x);
  }
  bool inside(ivec2 p) { return p.x >= 0 && p.y >= 0 && p.x < int(uSize.x) && p.y < int(uSize.y); }
  // One sprite texel from its raw subsamples. Covered when half the samples hit,
  // or any glow sample does (eyes never vanish). Colour = the sample nearest the
  // median brightness (texture grit survives, no averaging to mush); glow wins.
  vec4 px(ivec2 p, out float d, out float glow) {
    d = 1e9;
    glow = 0.0;
    if (!inside(p)) return vec4(0.0);
    vec3 col[4];
    float lum[4];
    int n = 0;
    int ng = 0;
    bool h00 = false;
    float gl = -1.0;
    vec3 gcol = vec3(0.0);
    for (int j = 0; j < 2; j++) {
      for (int i = 0; i < 2; i++) {
        if (i >= uSS || j >= uSS) continue;
        ivec2 q = p * uSS + ivec2(i, j);
        vec4 c = texelFetch(tColor, q, 0);
        if (c.a < 0.5) continue;
        d = min(d, dist(q));
        if (i == 0 && j == 0) h00 = true;
        float l = luma(c.rgb);
        if (c.a < 0.9) {
          ng++;
          if (l > gl) {
            gl = l;
            gcol = c.rgb;
          }
        }
        col[n] = c.rgb;
        lum[n] = l;
        n++;
      }
    }
    // Glow wins when it covers half the texel — or any of it on a tiny sprite (eyes never vanish).
    if (ng > 0 && (ng * 2 >= n || uSmall > 0.5)) {
      glow = 1.0;
      return vec4(gcol, 1.0);
    }
    // Half-covered ties go by one fixed sample: area stays unbiased (the silhouette
    // matches the model's, and its hitbox), the edge just settles a quarter texel over.
    float cov = float(n) / float(uSS * uSS);
    if (cov < 0.5 || (n * 2 == uSS * uSS && !h00 && uSS > 1)) return vec4(0.0, 0.0, 0.0, 0.0);
    int best = 0;
    float bs = 1e9;
    for (int a = 0; a < 4; a++) {
      if (a >= n) break;
      float s = 0.0;
      for (int b = 0; b < 4; b++) {
        if (b >= n) break;
        s += abs(lum[a] - lum[b]);
      }
      if (s < bs) {
        bs = s;
        best = a;
      }
    }
    return vec4(col[best], cov);
  }
  bool covered(ivec2 p) {
    if (!inside(p)) return false;
    int n = 0;
    int ng = 0;
    bool h00 = false;
    for (int j = 0; j < 2; j++) {
      for (int i = 0; i < 2; i++) {
        if (i >= uSS || j >= uSS) continue;
        float a = texelFetch(tColor, p * uSS + ivec2(i, j), 0).a;
        if (a >= 0.5) {
          n++;
          if (i == 0 && j == 0) h00 = true;
          if (a < 0.9) ng++;
        }
      }
    }
    if (ng > 0 && (ng * 2 >= n || uSmall > 0.5)) return true;
    return n * 2 > uSS * uSS || (n * 2 == uSS * uSS && (h00 || uSS == 1));
  }
  float packDepth(float d) {
    float t = clamp((d - uDepthRange.x) / max(uDepthRange.y - uDepthRange.x, 1e-4), 0.0, 1.0);
    return (1.0 + floor(t * 254.0 + 0.5)) / 255.0;
  }
  vec3 toLab(vec3 c) {
    c = max(c, 0.0);
    float l = pow(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b, 1.0 / 3.0);
    float m = pow(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b, 1.0 / 3.0);
    float s = pow(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b, 1.0 / 3.0);
    return vec3(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
                1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
                0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
  }
  // Palette colour in two steps, the way a pixel artist picks one: first the ramp
  // (by hue and chroma, undithered — a surface keeps one ramp, no speckle between
  // hues), then the step along it by lightness, dithered.
  // \`area\` = the colour of the texel's neighbourhood: the ramp follows the region,
  // not each texel's texture noise.
  vec3 palette(vec3 y, vec3 area, float th) {
    vec3 lab = toLab(y);
    vec3 alab = toLab(area);
    float best = 1e9;
    float ramp = -1.0;
    for (int i = 0; i < ${PALETTE_MAX}; i++) {
      if (i >= uPalN) break;
      vec3 d = alab - uPal[i].xyz;
      float e = d.x * d.x * 0.3 + dot(d.yz, d.yz) * 3.0;
      if (e < best) {
        best = e;
        ramp = uPal[i].w;
      }
    }
    float L = lab.x + th * 0.07;
    best = 1e9;
    vec3 res = y;
    for (int i = 0; i < ${PALETTE_MAX}; i++) {
      if (i >= uPalN) break;
      if (abs(uPal[i].w - ramp) > 0.5) continue;
      float e = abs(L - uPal[i].x);
      if (e < best) {
        best = e;
        res = uPalRgb[i];
      }
    }
    return res;
  }
  vec4 store(vec3 y, float depth) { return vec4(pow(clamp(y, 0.0, 1.0), vec3(1.0 / 2.2)), depth); }

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float dC, gC;
    vec4 c = px(p, dC, gC);
    if (c.a < 0.5) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float dR, dL, dU, dD, gR, gL, gU, gD;
    vec4 nR = px(p + ivec2(1, 0), dR, gR);
    vec4 nL = px(p - ivec2(1, 0), dL, gL);
    vec4 nU = px(p + ivec2(0, 1), dU, gU);
    vec4 nD = px(p - ivec2(0, 1), dD, gD);
    bool sR = nR.a >= 0.5, sL = nL.a >= 0.5, sU = nU.a >= 0.5, sD = nD.a >= 0.5;
    // 1-texel-wide runs (thin legs, tails, cables) are never darkened or cut.
    bool thin = (!sL && !sR) || (!sU && !sD);
    float depth = packDepth(dC);
    float th = bayer4(p) * uDither;
    if (gC > 0.5) {
      // Glow (eyes, weak points, lamps): full brightness, no outline / bands / palette.
      gl_FragColor = store(aces(c.rgb * uExp), depth);
      return;
    }
    // Run lengths through this texel (±2): parts 3 texels thick or less are "thin" —
    // lighter outline, no rim light (an arm or a tentacle must not turn into an outline).
    bool sL2 = covered(p - ivec2(2, 0)), sR2 = covered(p + ivec2(2, 0));
    bool sU2 = covered(p + ivec2(0, 2)), sD2 = covered(p - ivec2(0, 2));
    float hRun = 1.0 + (sL ? 1.0 + float(sL2) : 0.0) + (sR ? 1.0 + float(sR2) : 0.0);
    float vRun = 1.0 + (sU ? 1.0 + float(sU2) : 0.0) + (sD ? 1.0 + float(sD2) : 0.0);
    bool slim = min(hRun, vRun) <= 3.0;
    // Rounded silhouette: knock out BOX corners only — where a straight top/bottom edge
    // meets a straight side, each 3+ texels long (heads, fists, shoulders; never the
    // steps of a diagonal limb).
    if (uRound > 0.5 && !thin) {
      bool cut = false;
      if (!sU && !sL && !covered(p + ivec2(-1, 1))) cut = sR && sR2 && sD && sD2 && !covered(p + ivec2(1, 1)) && !covered(p + ivec2(-1, -1));
      if (!cut && !sU && !sR && !covered(p + ivec2(1, 1))) cut = sL && sL2 && sD && sD2 && !covered(p + ivec2(-1, 1)) && !covered(p + ivec2(1, -1));
      if (!cut && !sD && !sL && !covered(p + ivec2(-1, -1))) cut = sR && sR2 && sU && sU2 && !covered(p + ivec2(1, -1)) && !covered(p + ivec2(-1, 1));
      if (!cut && !sD && !sR && !covered(p + ivec2(1, -1))) cut = sL && sL2 && sU && sU2 && !covered(p + ivec2(-1, -1)) && !covered(p + ivec2(1, 1));
      if (cut) {
        gl_FragColor = vec4(0.0);
        return;
      }
    }
    vec3 rgb = c.rgb;
    // Local contrast against the covered neighbours: keeps texture and face details.
    float l0 = luma(rgb);
    float ln = 0.0, wn = 0.0;
    if (sR && gR < 0.5) { ln += luma(nR.rgb); wn += 1.0; }
    if (sL && gL < 0.5) { ln += luma(nL.rgb); wn += 1.0; }
    if (sU && gU < 0.5) { ln += luma(nU.rgb); wn += 1.0; }
    if (sD && gD < 0.5) { ln += luma(nD.rgb); wn += 1.0; }
    if (wn > 0.0 && uSharp > 0.0) {
      float l1 = max(l0 + uSharp * (l0 - ln / wn), l0 * 0.4);
      rgb *= l1 / max(l0, 1e-6);
    }
    bool edge = !(sR && sL && sU && sD);
    float ol = mix(uOutline, 0.8, uSmall);
    if (slim) ol = mix(ol, 1.0, 0.45);
    vec3 y;
    if (edge && !thin) {
      // Selective outline on the silhouette's own edge texels: a darker, richer
      // shade of the local colour (no bloat: the sprite covers what the model covers).
      // Lit from above: top edges keep most of their light (a lit shoulder stays a
      // shoulder), bottom edges go darkest.
      float o = !sU ? mix(ol, 1.0, 0.6) : !sD ? ol * 0.85 : ol;
      float l = luma(rgb);
      y = aces(max(mix(vec3(l), rgb, 1.35), 0.0) * o * uExp);
    } else {
      float shade = 1.0;
      if (uInner > 0.0) {
        // Inner contours: a nearer part's edge against something well behind it.
        float gap = 0.12 + dC * 0.02;
        bool ie = (sR && dR - dC > gap) || (sL && dL - dC > gap) || (sU && dU - dC > gap) || (sD && dD - dC > gap);
        if (ie) shade = 1.0 - uInner * (1.0 - ol);
      }
      // Top light on the upper rim (lit from above).
      if (!slim && (!sU2 || !sU)) shade *= 1.0 + uRim;
      rgb *= shade;
      float l = luma(rgb);
      rgb = max(mix(vec3(l), rgb, uSat), 0.0);
      y = aces(rgb * uExp);
      if (uLevels > 0.0) {
        // Dithered luminance bands, even in perceived brightness.
        float g = pow(max(luma(y), 1e-5), 1.0 / 2.2);
        float q = clamp(floor(g * uLevels + 0.5 + th) / uLevels, 0.5 / uLevels, 1.0);
        y = min(y * pow(q / g, 2.2), 1.0);
      }
      if (uHue > 0.0) {
        // Hue-shifted shading: shadows lean blue-violet, highlights lean warm.
        // Relative to the stage's light level, so night stages aren't cooled wholesale.
        float yl = luma(y);
        float cool = (1.0 - smoothstep(0.1, 0.6, yl / uRefL)) * uHue;
        float warm = smoothstep(1.1, 2.2, yl / uRefL) * uHue;
        vec3 t = mix(vec3(1.0), vec3(0.88, 0.93, 1.22), cool) * mix(vec3(1.0), vec3(1.06, 1.02, 0.9), warm);
        vec3 y2 = y * t;
        y = clamp(y2 * (yl / max(luma(y2), 1e-6)), 0.0, 1.0);
      }
    }
    if (uPalN > 0) {
      vec3 area = c.rgb;
      float na = 1.0;
      if (sR && gR < 0.5) { area += nR.rgb; na += 1.0; }
      if (sL && gL < 0.5) { area += nL.rgb; na += 1.0; }
      if (sU && gU < 0.5) { area += nU.rgb; na += 1.0; }
      if (sD && gD < 0.5) { area += nD.rgb; na += 1.0; }
      y = palette(y, aces(area / na * uExp), th);
    }
    gl_FragColor = store(y, depth);
  }
`;

const SHOW_VERT = /* glsl */ `
  uniform vec2 uTarget;   // main render target size (pixels)
  uniform vec2 uPx;       // sprite size on it (pixels): whole texels, as baked
  varying vec2 vUv;
  varying float vViewZ;
  varying vec2 vProj;
  void main() {
    vUv = uv;
    // Screen-aligned at the bake's pixel size, its corner snapped to the pixel grid:
    // texels always land on whole pixels (no uneven widths, no crawling).
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vViewZ = mv.z;
    vProj = vec2(projectionMatrix[2][2], projectionMatrix[3][2]);
    vec4 cc = projectionMatrix * mv;
    vec2 pc = (cc.xy / cc.w * 0.5 + 0.5) * uTarget;
    vec2 corner = floor(pc - 0.5 * uPx + 0.5);
    vec2 ndc = (corner + uv * uPx) / uTarget * 2.0 - 1.0;
    gl_Position = vec4(ndc * cc.w, cc.z, cc.w);
  }
`;

const SHOW_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D map;
  uniform vec2 uSize;     // used texels
  uniform vec2 uRt;       // texture size
  uniform vec4 uDepth;    // bake: near, far (alpha range), quad plane distance, depth bias
  uniform vec4 uFlash;    // rgb, amount
  uniform float uExp;
  varying vec2 vUv;
  varying float vViewZ;
  varying vec2 vProj;
  ${TONE}
  void main() {
    vec2 t = min(floor(vUv * uSize), uSize - 1.0) + 0.5;
    vec4 c = texture2D(map, t / uRt);
    if (c.a < 0.5 / 255.0) discard;
    vec3 y = pow(c.rgb, vec3(2.2));
    vec3 rgb = invAces(y) / uExp;
    // Hit flash: the sprite lights up, its outline stays a little darker.
    float l = dot(y, vec3(0.2126, 0.7152, 0.0722));
    rgb = mix(rgb, uFlash.rgb * (0.45 + 0.75 * smoothstep(0.0, 0.1, l)), uFlash.a);
    // Per-texel depth: offset from the quad plane, carried into the current view
    // (biased back a hair so live 3D parts on the surface — eyes, halos — win).
    float d = mix(uDepth.x, uDepth.y, (c.a * 255.0 - 1.0) / 254.0);
    float z = vViewZ - (d - uDepth.z) - uDepth.w;
    z = min(z, -0.06);
    gl_FragDepth = ((vProj.x * z + vProj.y) / -z) * 0.5 + 0.5;
    gl_FragColor = vec4(rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Blob shadows under sprites (one instanced draw): a two-tone pixel ellipse, crisp on the retro pixel grid. */
const SHADOW_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    vUv = uv;
    vAlpha = instanceColor.r;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vAlpha *= 1.0 - smoothstep(22.0, 40.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const SHADOW_FRAG = /* glsl */ `
  precision highp float;
  uniform float uPxScale; // target pixels per retro pixel (1 with the retro pass on)
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    // Evaluate at the centre of the retro pixel (a no-op when drawing at retro resolution).
    vec2 f = gl_FragCoord.xy;
    vec2 s = (floor(f / uPxScale) + 0.5) * uPxScale - f;
    vec2 uv = vUv + dFdx(vUv) * s.x + dFdy(vUv) * s.y;
    float r = length(uv * 2.0 - 1.0);
    float a = r < 0.6 ? 0.42 : r < 1.0 ? 0.22 : 0.0;
    a *= vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;
const MAX_SHADOWS = 48;
const _m4 = new THREE.Matrix4();
const _sq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _ss = new THREE.Vector3();
const _sc = new THREE.Color();

interface Sprite {
  /** What is drawn: an entity's root, or a part it threw into the world (a severed limb). */
  obj: THREE.Object3D;
  /** The entity it belongs to (hit flashes, shadows, lifetime). */
  e: Entity;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  rt: THREE.WebGLRenderTarget | null;
  rtKey: string;
  /** World time of the next bake. */
  next: number;
  /** Has a valid image. */
  ready: boolean;
  /** Billboard centre minus root world position at bake time. */
  offset: THREE.Vector3;
  /** How the model is hidden this frame: 0 not, 1 root.visible, 2 per-part layers. */
  hidden: number;
  /** Parts moved to OFF_LAYER for the main draw (mode 2) and their layer masks. */
  hiddenParts: THREE.Object3D[];
  hiddenMasks: number[];
  /** Live 3D parts (halos, thin lines) seen at the last bake: hide per part. */
  keepAny: boolean;
  /** Last frame the entity was seen in the world (GC). */
  seen: number;
  /** Ground shadow radius (m, smoothed). */
  shadowR: number;
  /** Last bake found it off screen / empty: probed every frame (cheap) until it is back. */
  away: boolean;
  /** Draw calls its last bake cost (visible meshes + the pixel pass). */
  cost: number;
  /** Retro pixels per texel at the last bake. */
  k: number;
  /** Unit direction camera → sprite at the last bake (re-bake when it turns). */
  dir: THREE.Vector3;
  /** Frames it has been hidden waiting for a first image. */
  pending: number;
  /** Size in texels and the retro grid it was baked for (the grid can change: dynamic resolution). */
  tw: number;
  th: number;
  gw: number;
  gh: number;
}

export interface SpriteStats {
  sprites: number;
  /** Sprites drawn (billboards visible) this frame. */
  drawn: number;
  bakes: number;
  /** CPU ms spent in beginFrame (bakes + placement), smoothed. */
  cpuMs: number;
  /** Peak CPU ms of a frame in the last second. */
  cpuPeakMs: number;
  /** CPU ms of the last beginFrame. */
  lastMs: number;
  /** Render-target memory (bytes): sprite images + scratch. */
  rtBytes: number;
  bakesPerSec: number;
  /** Characters hidden this frame while their first image is pending. */
  pending: number;
  /** Characters drawn as 3D models this frame although on screen (style pop). */
  fallbacks: number;
  /** Total fallback character-frames since creation. */
  fallbacksTotal: number;
  /** Live 3D parts drawn over sprites this frame. */
  live3d: number;
  /** PixelCast paints (hand-drawn pixel art) this frame, and CPU ms they took (smoothed). */
  paints: number;
  paintMs: number;
  /** CPU ms of the last frame's paints (figure building + GPU submission). */
  paintMsFrame: number;
  /** Of that, ms spent building figures (painters + layout, pure JS). */
  figureMsFrame: number;
  /** Primitives in the last painted figure (and table overflows since creation). */
  prims: number;
  primOverflow: number;
  /** Texels redrawn this frame (paints + impostor bakes; budget ≈ TEXEL_BUDGET). */
  texels: number;
  /** Impostor bakes this frame (a sprite without a painter, or one that declined) and since creation. */
  impostors: number;
  impostorsTotal: number;
}

/** Scene-linear colour → the sRGB display colour the retro pass shows (ACES × exposure). */
function toDisplay(c: THREE.Color, exposure: number, out: THREE.Color): THREE.Color {
  const f = (x: number) => {
    x *= exposure;
    const y = Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
    return Math.pow(y, 1 / 2.2);
  };
  return out.setRGB(f(c.r), f(c.g), f(c.b), THREE.LinearSRGBColorSpace);
}

function sizeClass(n: number): number {
  let s = 16;
  while (s < n) s *= 2;
  return s;
}

/** Characters (they get ground shadows). */
export function isCharacter(e: Entity): boolean {
  return e instanceof Enemy || e instanceof Civilian;
}

/** Everything drawn as a sprite: characters plus the things they throw and the pickups they drop. */
export function isSpriteEntity(e: Entity): boolean {
  return isCharacter(e) || e instanceof Projectile || e instanceof Pickup;
}

/** Parts an entity has flung into the world (zombie limbs tumbling away) — sprites of their own. */
function looseParts(e: Entity): readonly { obj: THREE.Object3D }[] | null {
  const fl = (e as unknown as { looseParts?: () => readonly { obj: THREE.Object3D }[] }).looseParts?.();
  return fl && fl.length ? fl : null;
}

function renderable(o: THREE.Object3D): boolean {
  return (o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite;
}

function firstMat(o: THREE.Object3D): THREE.Material | undefined {
  const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  return Array.isArray(m) ? m[0] : m;
}

/**
 * Parts that stay real 3D meshes drawn live over the sprite instead of being
 * baked into it: alpha-blended (halos, IV tubes, spray — they'd vanish or turn
 * into hard blobs), lines / points / very thin geometry (they'd break into dashes),
 * or tagged `userData.spriteKeep3D`.
 */
export function keepLive(o: THREE.Object3D): boolean {
  const tag = o.userData.spriteKeep3D;
  if (tag === true || tag === false) return tag;
  if (!(o as THREE.Mesh).isMesh) return true;
  const mat = firstMat(o);
  if (!mat) return false;
  if (mat.transparent || mat.blending === THREE.AdditiveBlending) return true;
  const g = (o as THREE.Mesh).geometry;
  if (!g) return false;
  const b = geoBox(g);
  const e = o.matrixWorld.elements;
  const x = (b.max.x - b.min.x) * Math.hypot(e[0], e[1], e[2]);
  const y = (b.max.y - b.min.y) * Math.hypot(e[4], e[5], e[6]);
  const z = (b.max.z - b.min.z) * Math.hypot(e[8], e[9], e[10]);
  const big = Math.max(x, y, z);
  const mid = x + y + z - big - Math.min(x, y, z);
  return mid < 0.09 && big > 0.8 && big > 10 * mid;
}

/** Position-attribute version each geometry's bounding box was computed at. */
const boxVersion = new WeakMap<THREE.BufferGeometry, number>();
/**
 * A geometry's bounding box, recomputed when its positions changed (tentacle
 * tubes are rebuilt every frame: a stale box would crop the sprite).
 */
function geoBox(g: THREE.BufferGeometry): THREE.Box3 {
  const pos = g.attributes.position;
  const v = pos ? (pos as THREE.BufferAttribute).version : 0;
  if (!g.boundingBox || boxVersion.get(g) !== v) {
    g.computeBoundingBox();
    boxVersion.set(g, v);
  }
  return g.boundingBox!;
}

/** Unlit (glow) parts: baked with a tag in alpha, so the bake pass keeps them bright and un-outlined. */
function isGlow(o: THREE.Object3D): boolean {
  const m = firstMat(o);
  return !!m && (m as THREE.MeshBasicMaterial).isMeshBasicMaterial === true && !m.transparent && !Array.isArray((o as THREE.Mesh).material);
}
/** A twin of glow material `m` that writes the glow tag (alpha 0.75) — cached in `cache`. */
function glowTag(m: THREE.Material, cache: Map<THREE.Material, THREE.Material>): THREE.Material {
  let t = cache.get(m);
  if (!t) {
    const c = m.clone();
    const prev = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey();
    c.onBeforeCompile = (sh, r) => {
      prev.call(c, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = 0.75;');
    };
    c.customProgramCacheKey = () => `sprite-glow-tag|${prevKey}`;
    cache.set(m, (t = c));
  }
  return t;
}

/**
 * The sprite renderer for one World. Created by Game in ART: SPRITES (needs a
 * WebGL renderer, so never in the headless simulator).
 */
export class SpriteArt {
  readonly group = new THREE.Group();
  private shadows: THREE.InstancedMesh;
  private shadowMat: THREE.ShaderMaterial;
  look: SpriteLook = { ...DEFAULT_LOOK };
  readonly stats: SpriteStats = {
    sprites: 0,
    drawn: 0,
    bakes: 0,
    cpuMs: 0,
    cpuPeakMs: 0,
    lastMs: 0,
    rtBytes: 0,
    bakesPerSec: 0,
    pending: 0,
    fallbacks: 0,
    fallbacksTotal: 0,
    live3d: 0,
    paints: 0,
    paintMs: 0,
    paintMsFrame: 0,
    figureMsFrame: 0,
    prims: 0,
    primOverflow: 0,
    texels: 0,
    impostors: 0,
    impostorsTotal: 0,
  };
  /** PixelCast: characters with a painter (`Entity.paintPixels`) are drawn as pixel art. */
  private cast: PixelCast;
  private figure = new PixelFigure();
  private env: CastEnv = {
    tint: new THREE.Color(1, 1, 1),
    rim: new THREE.Color(0.5, 0.65, 1),
    rimAmount: 0,
    fog: new THREE.Color(),
    fogAmount: 0,
  };
  /** Stage darkness 0..1 (from the fog / background), light tint (display). */
  private night = 0;
  private framePaints = 0;
  private frameTexels = 0;
  private frameImpostors = 0;
  private framePaintMs = 0;
  private frameFigureMs = 0;

  private sprites = new Map<THREE.Object3D, Sprite>();
  private free = new Map<string, THREE.WebGLRenderTarget[]>();
  private scratch: THREE.WebGLRenderTarget;
  private bakeScene = new THREE.Scene();
  private bakeCam = new THREE.PerspectiveCamera();
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMat: THREE.ShaderMaterial;
  private showMat: THREE.ShaderMaterial;
  private quad = new THREE.PlaneGeometry(1, 1);
  private srcLights: THREE.Light[] = [];
  private mirrors: THREE.Light[] = [];
  private frame = 0;
  private due: Sprite[] = [];
  private secT = 0;
  private secBakes = 0;
  private secPeak = 0;
  private flashWhite = new THREE.Color(0xffffff);
  private flashRed = new THREE.Color(0xff3020);
  /** Shared by every billboard: main target size, display exposure. */
  private targetU = { value: new THREE.Vector2(1, 1) };
  private expU = { value: 1 };
  /** Retro grid this frame and target pixels per retro pixel. */
  private gridW = 1;
  private gridH = 1;
  private pxScale = 1;
  private tagMats = new Map<THREE.Material, THREE.Material>();
  private paletteId: PaletteId | null = null;
  private palN = 0;
  /** Cool back light behind each character, in the bake scene only (dark stages: silhouettes separate from the night). */
  private rimLight = new THREE.DirectionalLight(0xffffff, 0);
  private refL = { value: 0.25 };
  /** Scratch lists for one bake (kept parts, glow parts and their materials). */
  private bakeKeep: THREE.Object3D[] = [];
  private bakeKeepMasks: number[] = [];
  private bakeGlow: THREE.Mesh[] = [];
  private bakeGlowMats: THREE.Material[] = [];

  constructor(
    private renderer: THREE.WebGLRenderer,
    private world: World,
    /** Retro pixel grid (texel sizes are whole multiples of its pixels) and the main render target's size. */
    private view: () => { grid: { width: number; height: number }; target: { width: number; height: number } },
  ) {
    const hdr = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
    this.scratch = new THREE.WebGLRenderTarget(SCRATCH, SCRATCH, {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.scratch.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.scratch.depthTexture = new THREE.DepthTexture(SCRATCH, SCRATCH, THREE.UnsignedIntType);
    this.scratch.scissorTest = true;

    const pal: THREE.Vector4[] = [];
    const palRgb: THREE.Vector3[] = [];
    for (let i = 0; i < PALETTE_MAX; i++) {
      pal.push(new THREE.Vector4());
      palRgb.push(new THREE.Vector3());
    }
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: FULL_VERT,
      fragmentShader: BAKE_FRAG,
      uniforms: {
        tColor: { value: this.scratch.texture },
        tDepth: { value: this.scratch.depthTexture },
        uSize: { value: new THREE.Vector2() },
        uSS: { value: 1 },
        uDepthRange: { value: new THREE.Vector2() },
        uProj: { value: new THREE.Vector2() },
        uExp: this.expU,
        uLevels: { value: 0 },
        uDither: { value: 0 },
        uOutline: { value: 0 },
        uInner: { value: 0 },
        uRim: { value: 0 },
        uSat: { value: 1 },
        uSharp: { value: 0 },
        uHue: { value: 0 },
        uRefL: this.refL,
        uRound: { value: 0 },
        uSmall: { value: 0 },
        uPalN: { value: 0 },
        uPal: { value: pal },
        uPalRgb: { value: palRgb },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const pq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    pq.frustumCulled = false;
    this.postScene.add(pq);

    this.showMat = new THREE.ShaderMaterial({
      vertexShader: SHOW_VERT,
      fragmentShader: SHOW_FRAG,
      uniforms: {
        map: { value: null },
        uSize: { value: new THREE.Vector2(1, 1) },
        uRt: { value: new THREE.Vector2(1, 1) },
        uDepth: { value: new THREE.Vector4(1, 1, 1, 0) },
        uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
        uExp: this.expU,
        uTarget: this.targetU,
        uPx: { value: new THREE.Vector2(1, 1) },
      },
      fog: false,
    });

    this.bakeScene.matrixWorldAutoUpdate = false;
    this.rimLight.matrixAutoUpdate = false;
    this.rimLight.target.matrixAutoUpdate = false;
    this.bakeScene.add(this.rimLight);
    this.bakeCam.matrixAutoUpdate = false;
    this.bakeCam.matrixWorldAutoUpdate = false;
    this.group.name = 'sprite-art';
    // A hidden template billboard keeps the display program in the scene for shader warm-up.
    const tpl = new THREE.Mesh(this.quad, this.showMat);
    tpl.visible = false;
    this.group.add(tpl);
    this.shadowMat = new THREE.ShaderMaterial({
      vertexShader: SHADOW_VERT,
      fragmentShader: SHADOW_FRAG,
      uniforms: { uPxScale: { value: 1 } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: false,
    });
    this.shadows = new THREE.InstancedMesh(this.quad, this.shadowMat, MAX_SHADOWS);
    this.shadows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHADOWS * 3), 3);
    this.shadows.frustumCulled = false;
    this.shadows.count = 0;
    this.shadows.renderOrder = -1;
    this.shadows.name = 'sprite-shadows';
    this.group.add(this.shadows);
    world.scene.add(this.group);
    world.fx.setGibSprites(true, this.targetU);
    this.cast = new PixelCast(renderer);
    // Two small programs: compile now, so even a run without warm-up (attract demo) doesn't hitch.
    this.cast.precompile();
  }

  /**
   * Compile what the bakes need (character materials drawn into the scratch
   * target, their glow-tagged twins, the bake pass) so the first sprite of each
   * type doesn't hitch. `objects` = the warm-up set (or any subtree).
   */
  precompile(objects: THREE.Object3D) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    try {
      this.scanLights();
      this.bakeScene.fog = this.world.scene.fog;
      r.setRenderTarget(this.scratch);
      // Lit like the bakes: the stage's lights + the back light.
      r.compile(objects, this.world.camera, this.bakeScene);
      objects.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && isGlow(o)) {
          const m = o as THREE.Mesh;
          swapped.push([m, m.material]);
          m.material = glowTag(m.material as THREE.Material, this.tagMats);
        }
      });
      if (swapped.length) r.compile(objects, this.world.camera, this.bakeScene);
      r.compile(this.postScene, this.postCam);
      this.cast.precompile();
    } finally {
      for (const [m, mat] of swapped) m.material = mat;
      r.setRenderTarget(prev);
    }
  }

  // ─── Frame ────────────────────────────────────────────────────────────────

  /** Before the main render: bake due sprites, place billboards, hide the 3D characters. */
  beginFrame() {
    const t0 = performance.now();
    const w = this.world;
    this.frame++;
    if (this.frame % 20 === 1) this.scanLights();
    this.syncPalette();
    const v = this.view();
    this.gridW = v.grid.width;
    this.gridH = v.grid.height;
    this.pxScale = v.target.height / Math.max(1, v.grid.height);
    this.targetU.value.set(v.target.width, v.target.height);
    this.expU.value = this.renderer.toneMappingExposure;
    this.shadowMat.uniforms.uPxScale.value = Math.max(1, this.pxScale);
    this.syncEntities();
    w.scene.updateMatrixWorld();
    // Nothing moves until the main render: it can skip its own matrix pass (restored in endFrame).
    w.scene.matrixWorldAutoUpdate = false;
    const cam = w.camera;
    cam.updateMatrixWorld();
    _c.setFromMatrixPosition(cam.matrixWorld);

    // Due bakes: characters with no image first (off-screen ones are probed: cheap), then the most overdue.
    const due = this.due;
    due.length = 0;
    let firsts = 0;
    for (const s of this.sprites.values()) {
      if (!s.obj.visible || this.modelHidden(s)) continue;
      if (this.flashing(s) > 0 && s.ready) continue; // keep the frame; the billboard flashes instead
      if (s.away) {
        if (!this.probe(s, cam)) continue;
        s.away = false;
        s.ready = false;
      }
      if (!s.ready) {
        due.push(s);
        firsts++;
      } else if (w.time >= s.next || s.gh !== this.gridH || s.gw !== this.gridW || this.turned(s)) due.push(s);
    }
    let bakes = 0;
    this.framePaints = 0;
    this.frameTexels = 0;
    this.frameImpostors = 0;
    this.framePaintMs = 0;
    this.frameFigureMs = 0;
    if (due.length) {
      due.sort((a, b) => (a.ready === b.ready ? a.next - b.next : a.ready ? 1 : -1));
      const sch = spriteSchedule(w.settings.quality);
      const cap = Math.max(sch.maxBakes, Math.min(firsts, MAX_FIRST_BAKES));
      this.syncLights();
      this.syncRimLight();
      const r = this.renderer;
      const prevTarget = r.getRenderTarget();
      r.getClearColor(_clear);
      const prevAlpha = r.getClearAlpha();
      r.setClearColor(0x000000, 0);
      RETRO_DETAIL.value = this.look.detail;
      try {
        let spent = 0;
        let texels = 0;
        for (let i = 0; i < due.length && bakes < cap; i++) {
          const s = due[i];
          const budget = s.ready ? BAKE_CALL_BUDGET : FIRST_BAKE_CALL_BUDGET;
          if (bakes > 0 && spent + s.cost > budget) continue; // a cheaper one may still fit
          const area = s.ready ? s.tw * s.th : 0;
          if (bakes > 0 && texels + area > sch.texelBudget) continue;
          spent += s.cost;
          texels += area;
          // Spread the next bakes over the interval (phase kept, never bunching up).
          s.next = Math.max(s.next + 1 / sch.fps, w.time + 0.5 / sch.fps);
          if (this.bake(s, cam)) bakes++;
        }
      } finally {
        RETRO_DETAIL.value = 1;
        r.setRenderTarget(prevTarget);
        r.setClearColor(_clear, prevAlpha);
      }
    }

    // Place billboards and hide the real models from the main camera.
    cam.getWorldDirection(_fwd);
    let drawn = 0;
    let shadows = 0;
    let pending = 0;
    let fallbacks = 0;
    let live = 0;
    for (const s of this.sprites.values()) {
      const root = s.obj;
      s.hidden = 0;
      if (!root.visible) {
        s.mesh.visible = false;
        continue;
      }
      if (!s.ready || this.modelHidden(s)) {
        s.mesh.visible = false;
        if (s.ready || s.away || this.modelHidden(s)) {
          s.pending = 0;
          continue; // off screen (or the entity hides it itself): the model may stay as it is
        }
        // On screen, no image yet: hide it a frame or two rather than pop a 3D model in.
        if (++s.pending <= PENDING_FRAMES) {
          root.visible = false;
          s.hidden = 1;
          pending++;
        } else fallbacks++;
        continue;
      }
      s.pending = 0;
      _v.setFromMatrixPosition(root.matrixWorld).add(s.offset);
      // Behind the camera (it wrapped around between bakes): nothing to draw.
      _d.subVectors(_v, _c);
      if (_d.dot(_fwd) <= cam.near) {
        s.mesh.visible = false;
        this.hideModel(s);
        continue;
      }
      this.hideModel(s);
      if (s.hidden === 2) live += this.liveParts(s);
      s.mesh.position.copy(_v);
      s.mesh.updateMatrix();
      s.mesh.matrixWorld.copy(s.mesh.matrix);
      s.mesh.visible = true;
      // Whole target pixels per texel; scaled if the retro grid changed since the bake.
      (s.mat.uniforms.uPx.value as THREE.Vector2).set((s.tw * s.k * v.target.width) / s.gw, (s.th * s.k * v.target.height) / s.gh);
      const f = this.flashing(s);
      const u = s.mat.uniforms.uFlash.value as THREE.Vector4;
      if (f > 0) {
        const c = f === 2 ? this.flashRed : this.flashWhite;
        u.set(c.r, c.g, c.b, 1);
      } else u.w = 0;
      drawn++;
      if (shadows < MAX_SHADOWS && this.look.shadows > 0 && s.shadowR > 0 && s.obj === s.e.root && isCharacter(s.e)) {
        if (this.placeShadow(s, shadows, cam)) shadows++;
      }
    }
    this.shadows.count = shadows;
    if (shadows) {
      this.shadows.instanceMatrix.needsUpdate = true;
      this.shadows.instanceColor!.needsUpdate = true;
    }

    const ms = performance.now() - t0;
    const st = this.stats;
    st.sprites = this.sprites.size;
    st.drawn = drawn;
    st.bakes = bakes;
    st.pending = pending;
    st.fallbacks = fallbacks;
    st.fallbacksTotal += fallbacks;
    st.live3d = live;
    st.paints = this.framePaints;
    st.texels = this.frameTexels;
    st.impostors = this.frameImpostors;
    st.impostorsTotal += this.frameImpostors;
    st.paintMsFrame = this.framePaintMs;
    st.figureMsFrame = this.frameFigureMs;
    st.paintMs = st.paintMs * 0.9 + this.framePaintMs * 0.1;
    st.cpuMs = st.cpuMs * 0.9 + ms * 0.1;
    st.lastMs = ms;
    this.secPeak = Math.max(this.secPeak, ms);
    this.secBakes += bakes;
    this.secT += 1;
    if (this.secT >= 60) {
      st.bakesPerSec = this.secBakes;
      st.cpuPeakMs = this.secPeak;
      this.secT = 0;
      this.secBakes = 0;
      this.secPeak = 0;
    }
    st.rtBytes = this.rtBytes();
  }

  /** Re-bake every sprite on the next frame (look changes, debug captures). */
  invalidate() {
    for (const s of this.sprites.values()) {
      s.ready = false;
      s.away = false;
    }
  }

  /** After the main render: show the real models again (raycasts, AI and tools see them as usual). */
  endFrame() {
    this.world.scene.matrixWorldAutoUpdate = true;
    for (const s of this.sprites.values()) this.restoreModel(s);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private flashing(s: Sprite): number {
    return s.e instanceof Enemy && s.obj === s.e.root ? s.e.flashKind : 0;
  }

  /** The entity hides its model (blinking pickup, a boss off stage) while the root stays visible. */
  private modelHidden(s: Sprite): boolean {
    if (s.obj !== s.e.root) return false;
    const m = (s.e as unknown as { model?: unknown }).model;
    return m instanceof THREE.Object3D && !m.visible;
  }

  /** Hide the baked parts from the main camera (live 3D parts stay). */
  private hideModel(s: Sprite) {
    if (!s.keepAny) {
      s.obj.visible = false;
      s.hidden = 1;
      return;
    }
    s.hidden = 2;
    const parts = s.hiddenParts;
    const masks = s.hiddenMasks;
    parts.length = 0;
    masks.length = 0;
    const stack: THREE.Object3D[] = [s.obj];
    while (stack.length) {
      const o = stack.pop()!;
      if (!o.visible) continue;
      if (renderable(o) && !keepLive(o)) {
        parts.push(o);
        masks.push(o.layers.mask);
        o.layers.set(OFF_LAYER);
      }
      for (const c of o.children) stack.push(c);
    }
  }

  private restoreModel(s: Sprite) {
    if (s.hidden === 1) s.obj.visible = true;
    else if (s.hidden === 2) {
      const parts = s.hiddenParts;
      for (let i = 0; i < parts.length; i++) parts[i].layers.mask = s.hiddenMasks[i];
      parts.length = 0;
      s.hiddenMasks.length = 0;
    }
    s.hidden = 0;
  }

  /** Visible live 3D parts of a sprite (stats only). */
  private liveParts(s: Sprite): number {
    let n = 0;
    s.obj.traverseVisible((o) => {
      if (renderable(o) && keepLive(o)) n++;
    });
    return n;
  }

  /** The view direction to the sprite turned since its bake (camera or sprite moved sideways). */
  private turned(s: Sprite): boolean {
    _v.setFromMatrixPosition(s.obj.matrixWorld).add(s.offset).sub(_c);
    const l = _v.length();
    return l > 1e-4 && _v.dot(s.dir) / l < TURN_COS;
  }

  private syncEntities() {
    const f = this.frame;
    for (const e of this.world.entities) {
      if (e.removed || !isSpriteEntity(e)) continue;
      this.track(e.root, e, f);
      const parts = looseParts(e);
      if (parts) for (const p of parts) if (p.obj.parent) this.track(p.obj, e, f);
    }
    for (const [obj, s] of this.sprites) {
      if (s.seen !== f) this.release(obj, s);
    }
  }

  private track(obj: THREE.Object3D, e: Entity, f: number) {
    let s = this.sprites.get(obj);
    if (!s) {
      const mat = this.showMat.clone();
      mat.uniforms.uFlash.value = new THREE.Vector4(1, 1, 1, 0);
      mat.uniforms.uTarget = this.targetU;
      mat.uniforms.uExp = this.expU;
      const mesh = new THREE.Mesh(this.quad, mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldAutoUpdate = false;
      mesh.visible = false;
      mesh.name = 'sprite';
      this.group.add(mesh);
      s = {
        obj,
        e,
        mesh,
        mat,
        rt: null,
        rtKey: '',
        next: 0,
        ready: false,
        offset: new THREE.Vector3(),
        hidden: 0,
        hiddenParts: [],
        hiddenMasks: [],
        keepAny: false,
        seen: f,
        shadowR: 0,
        away: false,
        cost: 8,
        k: 1,
        dir: new THREE.Vector3(0, 0, -1),
        pending: 0,
        tw: 1,
        th: 1,
        gw: 1,
        gh: 1,
      };
      this.sprites.set(obj, s);
    }
    s.seen = f;
  }

  private release(obj: THREE.Object3D, s: Sprite) {
    this.restoreModel(s);
    this.group.remove(s.mesh);
    s.mat.dispose();
    if (s.rt) this.giveBack(s.rtKey, s.rt);
    this.sprites.delete(obj);
  }

  private takeTarget(w: number, h: number): { rt: THREE.WebGLRenderTarget; key: string } {
    const key = `${w}x${h}`;
    const list = this.free.get(key);
    const rt =
      list?.pop() ??
      new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
    rt.scissorTest = true;
    return { rt, key };
  }

  private giveBack(key: string, rt: THREE.WebGLRenderTarget) {
    let list = this.free.get(key);
    if (!list) this.free.set(key, (list = []));
    // Keep a few spares per size (big ones: one).
    if (list.length < (rt.width * rt.height >= 256 * 256 ? 1 : 4)) list.push(rt);
    else rt.dispose();
  }

  private rtBytes(): number {
    let b = SCRATCH * SCRATCH * (8 + 4) + this.cast.bytes();
    for (const s of this.sprites.values()) if (s.rt) b += s.rt.width * s.rt.height * 4;
    for (const list of this.free.values()) for (const rt of list) b += rt.width * rt.height * 4;
    return b;
  }

  /** Visible baked meshes counted by the last `bounds` call (≈ the bake's draw calls). */
  private meshCount = 0;

  /**
   * World-space bounds of the visible meshes under `root` that get baked; the
   * live 3D ones go to `keep` (when given), glow ones to `glow`.
   */
  private bounds(root: THREE.Object3D, out: THREE.Box3, keep?: THREE.Object3D[], glow?: THREE.Mesh[]): boolean {
    out.makeEmpty();
    this.meshCount = 0;
    const stack: THREE.Object3D[] = [root];
    while (stack.length) {
      const o = stack.pop()!;
      if (!o.visible) continue;
      if (renderable(o)) {
        const m = o as THREE.Mesh;
        const mat = m.material;
        const shown = Array.isArray(mat) ? mat.some((x) => x.visible) : mat?.visible !== false;
        if (shown && m.geometry) {
          if (keepLive(o)) keep?.push(o);
          else {
            _mb.copy(geoBox(m.geometry)).applyMatrix4(m.matrixWorld);
            out.union(_mb);
            this.meshCount++;
            if (glow && isGlow(o)) glow.push(m);
          }
        }
      }
      for (const c of o.children) stack.push(c);
    }
    return !out.isEmpty();
  }

  /** On-screen NDC rectangle and view-depth range of `_box` (false = off screen). */
  private rect = { x0: 0, y0: 0, x1: 0, y1: 0, dMin: 0, dMax: 0, fx0: 0, fy0: 0, fx1: 0, fy1: 0 };
  private project(cam: THREE.PerspectiveCamera): boolean {
    const near = cam.near;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let dMin = Infinity;
    let dMax = 0;
    let behind = false;
    const inv = cam.matrixWorldInverse;
    const P = cam.projectionMatrix.elements;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).applyMatrix4(inv);
      const d = -_v.z;
      if (d < near * 2) {
        behind = true;
        continue;
      }
      dMin = Math.min(dMin, d);
      dMax = Math.max(dMax, d);
      const nx = (P[0] * _v.x + P[8] * _v.z) / d;
      const ny = (P[5] * _v.y + P[9] * _v.z) / d;
      x0 = Math.min(x0, nx);
      x1 = Math.max(x1, nx);
      y0 = Math.min(y0, ny);
      y1 = Math.max(y1, ny);
    }
    if (dMax === 0) return false;
    if (behind) {
      // Part of it wraps around the camera: keep everything on screen.
      x0 = -1 - EDGE;
      y0 = -1 - EDGE;
      x1 = 1 + EDGE;
      y1 = 1 + EDGE;
      dMin = near * 2;
    }
    const R = this.rect;
    R.fx0 = x0;
    R.fy0 = y0;
    R.fx1 = x1;
    R.fy1 = y1;
    R.x0 = Math.max(x0, -1 - EDGE);
    R.y0 = Math.max(y0, -1 - EDGE);
    R.x1 = Math.min(x1, 1 + EDGE);
    R.y1 = Math.min(y1, 1 + EDGE);
    R.dMin = dMin;
    R.dMax = dMax;
    return R.x1 > R.x0 && R.y1 > R.y0;
  }

  /** Cheap check whether an off-screen sprite came back on screen. */
  private probe(s: Sprite, cam: THREE.PerspectiveCamera): boolean {
    return this.bounds(s.obj, _box) && this.project(cam);
  }

  /**
   * Re-render one character into its sprite image and frame its billboard. False =
   * nothing to draw (off screen). With `look.dirs`, the character is turned (for
   * the bake only) to the nearest of N view angles, so it turns in steps like a
   * Doom / Area 51 sprite.
   */
  private bake(s: Sprite, cam: THREE.PerspectiveCamera): boolean {
    const dirs = this.look.dirs;
    const src = s.obj;
    if (!(dirs > 0) || src !== s.e.root || !isCharacter(s.e)) return this.bakeNow(s, cam);
    const m = src.matrixWorld.elements;
    _v.setFromMatrixPosition(src.matrixWorld);
    _d.setFromMatrixPosition(cam.matrixWorld);
    const view = Math.atan2(_v.x - _d.x, _v.z - _d.z);
    const step = (Math.PI * 2) / Math.round(dirs);
    let rel = Math.atan2(m[8], m[10]) - view;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const delta = Math.round(rel / step) * step - rel;
    if (Math.abs(delta) < 1e-4) return this.bakeNow(s, cam);
    _q2.copy(src.quaternion);
    src.quaternion.premultiply(_q.setFromAxisAngle(_up, delta));
    src.updateMatrixWorld(true);
    try {
      return this.bakeNow(s, cam);
    } finally {
      src.quaternion.copy(_q2);
      src.updateMatrixWorld(true);
    }
  }

  private bakeNow(s: Sprite, cam: THREE.PerspectiveCamera): boolean {
    const painted = this.paint(s, cam);
    if (painted !== null) return painted;
    const e = s.e;
    const src = s.obj;
    const keep = this.bakeKeep;
    const glow = this.bakeGlow;
    keep.length = 0;
    glow.length = 0;
    if (!this.bounds(src, _box, keep, glow) || !this.project(cam)) {
      s.ready = false;
      s.away = true;
      s.cost = 1;
      return false;
    }
    s.keepAny = keep.length > 0;
    s.cost = this.meshCount + 1;
    const R = this.rect;
    const near = cam.near;
    const P = cam.projectionMatrix.elements;
    const inv = cam.matrixWorldInverse;

    // Texel grid: a whole number of retro pixels per texel, aligned to the retro pixel grid.
    const gw = this.gridW;
    const gh = this.gridH;
    const boss = e instanceof Enemy && e.isBoss && src === e.root;
    const cap = boss ? MAX_TEX_BOSS : MAX_TEX;
    const L = this.look;
    const size = Math.max(((R.fy1 - R.fy0) / 2) * gh, ((R.fx1 - R.fx0) / 2) * gw * 0.75);
    // Bosses stay as fine as their size cap allows (whole-body bounds say little about detail).
    let k = L.pxPerTexel > 0 ? Math.max(1, Math.round(L.pxPerTexel)) : boss ? 1 : autoTexelScale(size, s.k, L.k2, L.k3);
    if (L.texelCm > 0) {
      // World-space floor: one texel never shows less than texelCm of the model.
      _box.getCenter(_v).applyMatrix4(inv);
      const dist = Math.max(near * 4, -_v.z);
      const pxWorld = (2 * dist) / P[5] / gh; // metres per retro pixel at that distance
      const tau = (L.texelCm / 100) * (boss ? 2 : 1);
      k = Math.max(k, Math.round(tau / pxWorld));
    }
    // Size cap (and the scratch target): whole steps only.
    const wPx = ((R.x1 - R.x0) / 2) * gw;
    const hPx = ((R.y1 - R.y0) / 2) * gh;
    k = Math.max(k, Math.ceil((Math.max(wPx, hPx) + 4) / Math.min(cap, SCRATCH)));
    s.k = k;
    const tx = (2 * k) / gw;
    const ty = (2 * k) / gh;
    const gx0 = Math.floor(R.x0 / tx) - 1;
    const gy0 = Math.floor(R.y0 / ty) - 1;
    const W = Math.min(Math.ceil(R.x1 / tx) + 1 - gx0, SCRATCH);
    const H = Math.min(Math.ceil(R.y1 / ty) + 1 - gy0, SCRATCH);
    const ss = L.ss >= 2 && W * 2 <= SCRATCH && H * 2 <= SCRATCH ? 2 : 1;
    const rx0 = gx0 * tx;
    const ry0 = gy0 * ty;
    const rx1 = rx0 + W * tx;
    const ry1 = ry0 + H * ty;

    // Bake camera = the main camera, projection cropped to the sprite's rectangle.
    const cx = (rx0 + rx1) / 2;
    const cy = (ry0 + ry1) / 2;
    const hx = (rx1 - rx0) / 2;
    const hy = (ry1 - ry0) / 2;
    _crop.set(1 / hx, 0, 0, -cx / hx, 0, 1 / hy, 0, -cy / hy, 0, 0, 1, 0, 0, 0, 0, 1);
    const bc = this.bakeCam;
    bc.projectionMatrix.multiplyMatrices(_crop, cam.projectionMatrix);
    bc.projectionMatrixInverse.copy(bc.projectionMatrix).invert();
    bc.matrixWorld.copy(cam.matrixWorld);
    bc.matrixWorldInverse.copy(cam.matrixWorldInverse);
    bc.near = cam.near;
    bc.far = cam.far;

    const r = this.renderer;
    // 1. Raw render of just this character (stage lights + fog) into the scratch target:
    //    live 3D parts left out, glow parts tagged in alpha.
    const sc = this.scratch;
    sc.viewport.set(0, 0, W * ss, H * ss);
    sc.scissor.set(0, 0, W * ss, H * ss);
    r.setRenderTarget(sc);
    const bs = this.bakeScene;
    bs.fog = this.world.scene.fog;
    const kids = bs.children;
    const nMirrors = kids.length;
    const km = this.bakeKeepMasks;
    km.length = 0;
    const gm = this.bakeGlowMats;
    gm.length = 0;
    for (const o of keep) {
      km.push(o.layers.mask);
      o.layers.set(OFF_LAYER);
    }
    for (const m of glow) {
      gm.push(m.material as THREE.Material);
      m.material = glowTag(m.material as THREE.Material, this.tagMats);
    }
    // Back light: from behind the character (seen from the camera) and above.
    _box.getCenter(_v);
    _d.setFromMatrixPosition(cam.matrixWorld);
    this.rimLight.target.matrixWorld.makeTranslation(_v.x, _v.y, _v.z);
    _d.sub(_v).setY(0).normalize();
    this.rimLight.matrixWorld.makeTranslation(_v.x - _d.x * 6, _v.y + 4, _v.z - _d.z * 6);
    kids.push(src); // not re-parented: matrices were computed in the stage scene
    try {
      r.render(bs, bc);
    } finally {
      kids.length = nMirrors;
      for (let i = 0; i < keep.length; i++) keep[i].layers.mask = km[i];
      for (let i = 0; i < glow.length; i++) glow[i].material = gm[i];
    }

    // 2. Pixel-art pass into the sprite's own image.
    const cw = sizeClass(W);
    const ch = sizeClass(H);
    const key = `${cw}x${ch}`;
    if (!s.rt || s.rtKey !== key) {
      if (s.rt) this.giveBack(s.rtKey, s.rt);
      const t = this.takeTarget(cw, ch);
      s.rt = t.rt;
      s.rtKey = t.key;
    }
    const dst = s.rt;
    dst.viewport.set(0, 0, W, H);
    dst.scissor.set(0, 0, W, H);
    const pu = this.postMat.uniforms;
    pu.uSize.value.set(W, H);
    pu.uSS.value = ss;
    const d0 = Math.max(near, R.dMin - 0.05);
    const d1 = Math.max(d0 + 0.1, R.dMax + 0.05);
    pu.uDepthRange.value.set(d0, d1);
    pu.uProj.value.set(P[10], P[14]);
    pu.uLevels.value = L.bands;
    pu.uDither.value = L.dither;
    pu.uOutline.value = L.outline;
    pu.uInner.value = L.inner;
    pu.uRim.value = L.rim;
    pu.uSat.value = L.saturation;
    pu.uSharp.value = L.sharpen;
    pu.uHue.value = L.hue;
    pu.uRound.value = L.round > 0 && Math.max(W, H) >= 24 ? 1 : 0;
    pu.uSmall.value = 1 - THREE.MathUtils.smoothstep(H, 12, 36);
    pu.uPalN.value = L.pal > 0 ? this.palN : 0;
    r.setRenderTarget(dst);
    r.render(this.postScene, this.postCam);

    // 3. Billboard: the crop rectangle, screen-aligned, at the nearest depth of the bounds.
    const D = Math.max(d0, near * 4);
    const qx = ((cx + P[8]) * D) / P[0];
    const qy = ((cy + P[9]) * D) / P[5];
    const m = s.mesh;
    m.position.set(qx, qy, -D).applyMatrix4(cam.matrixWorld);
    m.quaternion.copy(cam.getWorldQuaternion(_q));
    m.scale.set((2 * hx * D) / P[0], (2 * hy * D) / P[5], 1);
    // Ground shadow size from the footprint (smoothed: animation makes the bounds breathe).
    const foot = Math.max(_box.max.x - _box.min.x, _box.max.z - _box.min.z);
    const want = THREE.MathUtils.clamp(foot * 0.42, 0.22, 7);
    s.shadowR = s.shadowR > 0 ? s.shadowR + (want - s.shadowR) * 0.35 : want;
    _v.setFromMatrixPosition(src.matrixWorld);
    s.offset.subVectors(m.position, _v);
    s.dir.setFromMatrixPosition(cam.matrixWorld).subVectors(m.position, s.dir).normalize();
    const u = s.mat.uniforms;
    u.map.value = dst.texture;
    (u.uSize.value as THREE.Vector2).set(W, H);
    (u.uRt.value as THREE.Vector2).set(cw, ch);
    // Depth bias: half a depth step plus 1.5 cm, so live parts on the surface draw over the sprite.
    (u.uDepth.value as THREE.Vector4).set(d0, d1, D, ((d1 - d0) / 254) * 0.5 + 0.015);
    this.frameImpostors++;
    this.frameTexels += W * H;
    s.tw = W;
    s.th = H;
    s.gw = gw;
    s.gh = gh;
    s.ready = true;
    s.away = false;
    return true;
  }

  /**
   * PixelCast: let the entity PAINT its sprite frame (hand-drawn pixel art from
   * its live rig) instead of re-rendering its 3D model. null = it has no painter
   * (or declined): use the impostor bake. false = nothing on screen.
   */
  private paint(s: Sprite, cam: THREE.PerspectiveCamera): boolean | null {
    const e = s.e;
    const root = s.obj === e.root;
    if (root ? !e.paintPixels : !e.paintPart) return null;
    const t0 = performance.now();
    const f = this.figure;
    f.begin(cam, this.gridW, this.gridH);
    f.time = this.world.time;
    f.night = this.night;
    f.kHint = s.k > 0 ? s.k : 1;
    const ok = root ? e.paintPixels!(f) : e.paintPart!(s.obj, f);
    if (!ok || f.count === 0) return null;
    // Something reaching through the lens: the 3D bake handles near-plane clipping.
    if (f.minDepth < cam.near * 1.5) return null;
    this.stats.prims = f.count;
    this.stats.primOverflow += f.overflow;
    if (!f.layout(s.k, 24, 256)) {
      s.ready = false;
      s.away = true;
      s.cost = 1;
      return false;
    }
    s.k = f.kpx;
    this.frameFigureMs += performance.now() - t0;
    // Live 3D parts under the model (blood pools, halos) stay real meshes.
    const keep = this.bakeKeep;
    keep.length = 0;
    const stack = this.paintStack;
    stack.length = 0;
    stack.push(s.obj);
    while (stack.length) {
      const o = stack.pop()!;
      if (!o.visible) continue;
      if (renderable(o) && keepLive(o)) keep.push(o);
      for (const c of o.children) stack.push(c);
    }
    s.keepAny = keep.length > 0;
    s.cost = 2;

    const W = f.W;
    const H = f.H;
    const k = f.kpx;
    const gw = this.gridW;
    const gh = this.gridH;
    const cw = sizeClass(W);
    const ch = sizeClass(H);
    // (Key strings only when the size class changes: no allocation per redraw.)
    if (!s.rt || s.rt.width !== cw || s.rt.height !== ch) {
      if (s.rt) this.giveBack(s.rtKey, s.rt);
      const t = this.takeTarget(cw, ch);
      s.rt = t.rt;
      s.rtKey = t.key;
    }
    // Stage light, back rim and fog at this character's distance.
    this.castEnv(f);
    this.cast.paint(f, s.rt, this.env);

    // Billboard over the texel rectangle (NDC), at the figure's nearest depth.
    const P = cam.projectionMatrix.elements;
    const rx0 = (f.ox / gw) * 2 - 1;
    const ry0 = (f.oy / gh) * 2 - 1;
    const rx1 = ((f.ox + W * k) / gw) * 2 - 1;
    const ry1 = ((f.oy + H * k) / gh) * 2 - 1;
    const cx = (rx0 + rx1) / 2;
    const cy = (ry0 + ry1) / 2;
    const hx = (rx1 - rx0) / 2;
    const hy = (ry1 - ry0) / 2;
    const D = Math.max(f.d0, cam.near * 4);
    const qx = ((cx + P[8]) * D) / P[0];
    const qy = ((cy + P[9]) * D) / P[5];
    const m = s.mesh;
    m.position.set(qx, qy, -D).applyMatrix4(cam.matrixWorld);
    m.quaternion.copy(cam.getWorldQuaternion(_q));
    m.scale.set((2 * hx * D) / P[0], (2 * hy * D) / P[5], 1);
    const fb = f.foot;
    const foot = Math.max(fb.max.x - fb.min.x, fb.max.z - fb.min.z);
    const want = THREE.MathUtils.clamp(foot * 0.42, 0.22, 7);
    s.shadowR = s.shadowR > 0 ? s.shadowR + (want - s.shadowR) * 0.35 : want;
    _v.setFromMatrixPosition(s.obj.matrixWorld);
    s.offset.subVectors(m.position, _v);
    s.dir.setFromMatrixPosition(cam.matrixWorld).subVectors(m.position, s.dir).normalize();
    const u = s.mat.uniforms;
    u.map.value = s.rt.texture;
    (u.uSize.value as THREE.Vector2).set(W, H);
    (u.uRt.value as THREE.Vector2).set(cw, ch);
    (u.uDepth.value as THREE.Vector4).set(f.d0, f.d1, D, ((f.d1 - f.d0) / 254) * 0.5 + 0.015);
    s.tw = W;
    s.th = H;
    s.gw = gw;
    s.gh = gh;
    s.ready = true;
    s.away = false;
    this.framePaints++;
    this.frameTexels += W * H;
    this.framePaintMs += performance.now() - t0;
    return true;
  }
  private paintStack: THREE.Object3D[] = [];

  /** Stage light tint, night rim and fog for a painted sprite (display space). */
  private castEnv(f: PixelFigure) {
    const env = this.env;
    const sc = this.world.scene;
    const fog = sc.fog as THREE.Fog | THREE.FogExp2 | null;
    // Day ≈ 1, night ≈ 0.68: characters stay readable without glowing.
    const lit = THREE.MathUtils.clamp(0.52 + 0.2 * this.irr, 0.62, 1);
    env.tint.setRGB(lit * this.skyTint.r, lit * this.skyTint.g, lit * this.skyTint.b);
    env.rimAmount = 0.42 * this.night;
    env.rim.copy(this.rimDisplay);
    env.fogAmount = 0;
    if (fog) {
      _v.copy(f.foot.min).add(f.foot.max).multiplyScalar(0.5);
      const dist = f.depth(_v);
      let a = 0;
      if ((fog as THREE.FogExp2).isFogExp2) {
        const dd = (fog as THREE.FogExp2).density * dist;
        a = 1 - Math.exp(-dd * dd);
      } else {
        const fl = fog as THREE.Fog;
        a = THREE.MathUtils.clamp((dist - fl.near) / Math.max(1e-3, fl.far - fl.near), 0, 1);
      }
      // Painted sprites get half the fog scenery gets: the cast stays legible as icons down the street.
      env.fogAmount = a * 0.5;
      toDisplay(fog.color, this.expU.value, env.fog);
    }
  }
  /** Stage light level (irradiance-ish, see syncRimLight) and the sky's tint for painted sprites. */
  private irr = 2;
  private skyTint = new THREE.Color(1, 1, 1);
  private rimDisplay = new THREE.Color(0.55, 0.7, 1);

  /** Blob shadow under a sprite: on the floor it stands on, gone once it leaves the ground. */
  private placeShadow(s: Sprite, i: number, cam: THREE.PerspectiveCamera): boolean {
    const e = s.e;
    _v.setFromMatrixPosition(e.root.matrixWorld);
    let floor = this.world.groundAt(_v.x, _v.z);
    if (e instanceof Enemy) {
      const f = e.spawn.opts.floor;
      if (typeof f === 'number' && e.frame === 'world') floor = f;
      // Standing on something raised (a car roof, a deck): that is its floor.
      else if (e.grounded && e.state !== 'entry' && _v.y > floor && _v.y - floor < 2.5 && e.state !== 'dying') floor = _v.y;
    }
    const h = Math.max(0, _v.y - floor);
    // Leaps and flyers: the shadow fades out by 0.8 m off the ground.
    let fade = (1 - THREE.MathUtils.smoothstep(h, 0.2, 0.8)) * this.look.shadows;
    if (fade <= 0.01) return false;
    let r = s.shadowR;
    // On-screen size cap: a close or huge character never gets a slab of a shadow.
    _v.y = floor + 0.03;
    const dist = Math.max(cam.near * 4, _d.subVectors(_v, _c).length());
    const pxPerM = this.gridH / (2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const capPx = this.gridH * 0.26;
    const dPx = 2 * r * pxPerM;
    if (dPx > capPx) r *= capPx / dPx;
    fade *= 1 - 0.4 * THREE.MathUtils.smoothstep(Math.min(dPx, capPx), 30, 75);
    _ss.set(r * 2, r * 2 * 0.8, 1);
    _m4.compose(_v, _sq, _ss);
    this.shadows.setMatrixAt(i, _m4);
    this.shadows.setColorAt(i, _sc.setRGB(fade, 0, 0));
    return true;
  }

  /** The campaign's palette into the bake pass (once per stage). */
  private syncPalette() {
    const id: PaletteId = this.world.stage?.campaign === 'dino' ? 'dino' : 'zombie';
    if (id === this.paletteId) return;
    this.paletteId = id;
    const p = buildPalette(id);
    const ramps = paletteRamps(id);
    const n = p.length / 3;
    const lab = this.postMat.uniforms.uPal.value as THREE.Vector4[];
    const rgb = this.postMat.uniforms.uPalRgb.value as THREE.Vector3[];
    for (let i = 0; i < n; i++) {
      rgb[i].set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      const [L, a, b] = linearToOklab(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      lab[i].set(L, a, b, ramps[i]);
    }
    this.palN = n;
  }

  /**
   * Back-light rim colour for dark stages: cool, tinted by the stage's sky light,
   * scaled by how dark the stage's fog / background is (0 in daylight).
   */
  private syncRimLight() {
    const sc = this.world.scene;
    const fog = sc.fog as THREE.Fog | THREE.FogExp2 | null;
    const c = fog?.color ?? (sc.background instanceof THREE.Color ? sc.background : null);
    const lum = c ? 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b : 0.05;
    const dark = 1 - THREE.MathUtils.smoothstep(lum, 0.015, 0.12);
    _sc.setRGB(0.42, 0.58, 1.0);
    for (const l of this.srcLights) {
      const hemi = l as THREE.HemisphereLight;
      if (hemi.isHemisphereLight) {
        const m = Math.max(hemi.color.r, hemi.color.g, hemi.color.b, 1e-3);
        _sc.lerp(_clear.setRGB(hemi.color.r / m, hemi.color.g / m, hemi.color.b / m), 0.35);
        break;
      }
    }
    // Light level: what a mid-grey surface facing up-and-toward-the-light shows on screen.
    let irr = 0;
    for (let i = 0; i < this.srcLights.length; i++) {
      const l = this.srcLights[i];
      if (!this.mirrors[i]?.visible) continue;
      const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      const hemi = l as THREE.HemisphereLight;
      if (hemi.isHemisphereLight) irr += ((lum(hemi.color) * 3 + lum(hemi.groundColor)) / 4) * l.intensity;
      else if ((l as THREE.DirectionalLight).isDirectionalLight) irr += lum(l.color) * l.intensity * 0.6;
      else if ((l as THREE.AmbientLight).isAmbientLight) irr += lum(l.color) * l.intensity;
    }
    this.rimLight.color.copy(_sc);
    this.rimLight.intensity = 0.9 * Math.max(irr, 0.3) * dark * this.look.rimLight;
    // PixelCast: light level, darkness and a faint sky tint for painted sprites.
    this.irr = irr;
    this.night = dark;
    this.skyTint.setRGB(1, 1, 1).lerp(_clear.setRGB(_sc.r, _sc.g, _sc.b), 0.18 * dark);
    toDisplay(_sc, 1.1, this.rimDisplay);
    const x = Math.max(0.02, 0.4 * irr * this.expU.value);
    const a = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    this.refL.value = THREE.MathUtils.clamp(a, 0.04, 0.6);
  }

  /** Mirror the stage's lights into the bake scene (same light set → same shader programs). */
  private scanLights() {
    const found: THREE.Light[] = [];
    this.world.scene.traverse((o) => {
      if ((o as THREE.Light).isLight) found.push(o as THREE.Light);
    });
    const same = found.length === this.srcLights.length && found.every((l, i) => l === this.srcLights[i]);
    if (same) return;
    for (const m of this.mirrors) {
      this.bakeScene.remove(m);
      m.dispose();
    }
    this.srcLights = found;
    this.mirrors = found.map((l) => {
      const Ctor = l.constructor as new () => THREE.Light;
      const m = new Ctor();
      m.matrixAutoUpdate = false;
      m.castShadow = false;
      return m;
    });
    for (const m of this.mirrors) this.bakeScene.add(m);
  }

  private syncLights() {
    for (let i = 0; i < this.srcLights.length; i++) {
      const src = this.srcLights[i] as THREE.Light & {
        target?: THREE.Object3D;
        groundColor?: THREE.Color;
        distance?: number;
        decay?: number;
        angle?: number;
        penumbra?: number;
      };
      const m = this.mirrors[i] as typeof src;
      let vis = true;
      for (let n: THREE.Object3D | null = src; n; n = n.parent) {
        if (!n.visible) {
          vis = false;
          break;
        }
      }
      m.visible = vis;
      m.color.copy(src.color);
      m.intensity = src.intensity;
      m.matrixWorld.copy(src.matrixWorld);
      if (src.target && m.target) m.target.matrixWorld.copy(src.target.matrixWorld);
      if (src.groundColor && m.groundColor) m.groundColor.copy(src.groundColor);
      if (src.distance !== undefined) m.distance = src.distance;
      if (src.decay !== undefined) m.decay = src.decay;
      if (src.angle !== undefined) m.angle = src.angle;
      if (src.penumbra !== undefined) m.penumbra = src.penumbra;
    }
  }

  // ─── Debug / bench ────────────────────────────────────────────────────────

  /**
   * Silhouette check for the bench: for every drawn character, its 3D model's
   * on-screen area (baked parts only) vs its sprite's opaque area, both at the
   * main render resolution. Call between frames (not inside begin/endFrame).
   */
  debugCoverage(): { name: string; model: number; sprite: number }[] {
    const r = this.renderer;
    const cam = this.world.camera;
    const tw = Math.round(this.targetU.value.x);
    const th = Math.round(this.targetU.value.y);
    const rt = new THREE.WebGLRenderTarget(tw, th, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const buf = new Uint8Array(tw * th * 4);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const scene = new THREE.Scene();
    scene.matrixWorldAutoUpdate = false;
    const out: { name: string; model: number; sprite: number }[] = [];
    const prevT = r.getRenderTarget();
    r.getClearColor(_clear);
    const prevA = r.getClearAlpha();
    const count = () => {
      r.readRenderTargetPixels(rt, 0, 0, tw, th, buf);
      let n = 0;
      for (let i = 3; i < buf.length; i += 4) if (buf[i] > 127) n++;
      return n;
    };
    try {
      r.setClearColor(0x000000, 0);
      this.world.scene.updateMatrixWorld();
      for (const s of this.sprites.values()) {
        if (!s.ready || !s.obj.visible || s.obj !== s.e.root || !isCharacter(s.e)) continue;
        // Model: baked parts only, flat white.
        const keep: THREE.Object3D[] = [];
        this.bounds(s.obj, _box, keep);
        const masks = keep.map((o) => o.layers.mask);
        for (const o of keep) o.layers.set(OFF_LAYER);
        scene.overrideMaterial = white;
        scene.children.push(s.obj);
        r.setRenderTarget(rt);
        r.clear();
        r.render(scene, cam);
        scene.children.length = 0;
        keep.forEach((o, i) => (o.layers.mask = masks[i]));
        const model = count();
        // Sprite: its billboard alone.
        scene.overrideMaterial = null;
        _v.setFromMatrixPosition(s.obj.matrixWorld).add(s.offset);
        s.mesh.position.copy(_v);
        s.mesh.updateMatrix();
        s.mesh.matrixWorld.copy(s.mesh.matrix);
        const vis = s.mesh.visible;
        s.mesh.visible = true;
        scene.children.push(s.mesh);
        r.clear();
        r.render(scene, cam);
        scene.children.length = 0;
        s.mesh.visible = vis;
        out.push({ name: s.e.constructor.name, model, sprite: count() });
      }
    } finally {
      r.setRenderTarget(prevT);
      r.setClearColor(_clear, prevA);
      rt.dispose();
      white.dispose();
    }
    return out;
  }

  dispose() {
    this.world.fx.setGibSprites(false);
    for (const [obj, s] of [...this.sprites]) this.release(obj, s);
    for (const list of this.free.values()) for (const rt of list) rt.dispose();
    this.free.clear();
    for (const m of this.mirrors) m.dispose();
    for (const m of this.tagMats.values()) m.dispose();
    this.tagMats.clear();
    this.scratch.depthTexture?.dispose();
    this.scratch.dispose();
    this.postMat.dispose();
    this.shadowMat.dispose();
    this.shadows.dispose();
    this.cast.dispose();
    this.showMat.dispose();
    this.quad.dispose();
    this.group.parent?.remove(this.group);
  }
}

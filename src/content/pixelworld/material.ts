import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { PW_PAL_DEEP, PW_TPM } from './canvas';
import type { PwAtlas } from './atlas';
import { PW_DEBUG_DECL, pwDebugPatch, pwDebugSetup } from '../../core/debugView';
import { PW_LIGHT_DECL, pwLightOn, pwLightPatch, pwLightUniforms, pwMoodNow, type PwMoodUniforms } from './light';

/**
 * PixelWorld materials: flat-shaded, lit by the stage's own lights (hemisphere, sun,
 * flashlight, lamps, muzzle flash: three.js's Lambert sum) — but the light does not
 * multiply the paint: it moves each texel a whole number of tones along its palette
 * row, tints it, fog comes in bands and the pixel reaches the screen as the palette
 * colour it is (PIXEL-ART LIGHT: `light.ts`, per-stage `PwMood`). The colour comes
 * from the stage's PixelWorld atlas, texel by texel:
 *
 *  - the atlas holds INDICES (ramp, tone, glow: `PWI`), the palette texture the
 *    colours (a row a ramp): `pwTexel` fetches the texel whole and looks its
 *    painted tone up — the shared chunk `PW_FETCH` every PixelWorld shader uses;
 *  - per vertex `pwRect` = the tile's atlas rect (`pwRect(tile)`: x, y in stored
 *    texels, then its PAINTED size; w < 0 = a module, clamped to its rect; w > 0
 *    = a tileable surface, wrapped inside it; h < 0 = the tile is stored at 2×,
 *    the pixel-art upscaler's copy: texel coords are doubled at the fetch and the
 *    level is picked for the stored texels) and, in UV mode, `pwUv` = PAINTED
 *    texel coordinates (unwrapped, so screen derivatives stay continuous across
 *    a wrap);
 *  - PLANAR mode (define `PW_PLANAR`): no UV attribute at all — texel coords
 *    come from the world position projected on the facet's dominant axis
 *    (screen derivatives) × `uPwDensity`: the cheap path for re-texturing big
 *    baked scenery (24 B a vertex: position + rect + colour, no normals —
 *    flat shading also comes from derivatives), like d3's packed bakes;
 *  - the level is picked from the on-screen texel size (log2(texels per pixel)
 *    + `uPwBias`) and fetched whole (`texelFetch`): hard pixel-art texels, the
 *    hand-made levels take over before anything is minified enough to crawl;
 *  - texel classes: cut out (discarded: railings, fences, signs' outlines,
 *    graffiti), glow (lit windows, neon, lamps: their painted colour, moved by
 *    `uPwGlow` in whole tones, unaffected by the lights), lit;
 *  - vertex colours (white by default) tint a vertex after the palette lookup:
 *    a NEUTRAL tile in its material's colour, per-building hue shifts.
 * `&pwlight=0` (`pwLight(false)`) makes the materials light paint as the first pass
 * did (palette colour × Lambert, smooth fog, the monitor's tone curve and dither).
 */

export interface PwMaterialOptions {
  /** World-position projection instead of a UV attribute. */
  planar?: boolean;
  side?: THREE.Side;
  /** Multiplier of the light on lit texels (a brighter room, a darker one; default 1). */
  gain?: number;
  /** Gain of glow texels (default 1 = as painted; applied in whole tone steps: `pwGlowSteps`). */
  glow?: number;
  /** The mood the material is lit under (default: the one set last with `pwMood`). */
  mood?: PwMoodUniforms;
  /** Level bias (default 0.5: level 0 until a texel is 1.4 pixels' worth). */
  bias?: number;
  /**
   * false = one level for both texel axes, picked for the squeezed one (the first pass's rule: a
   * surface whose fine regular pattern should melt into its calm far levels as soon as the view
   * foreshortens it, at the price of texels drawn wide across the view). Default: per axis.
   */
  axes?: boolean;
  fog?: boolean;
  /** Planar mode: texels per metre (default PW_TPM). */
  density?: number;
  /** Cache key suffix for materials that differ only by uniforms you change later. */
  tag?: string;
  /**
   * Animated tiles (water, flicker): every tile drawn with this material is a
   * vertical strip of `frames` equal frames, played at `fps` on `uPwTime`
   * (advance it with `pwTick`).
   */
  anim?: { frames: number; fps: number };
}

/** Advance the clock of an animated PixelWorld material (allocation-free). */
export function pwTick(m: THREE.Material, dt: number) {
  const u = m.userData.pw as { uPwTime?: { value: number } } | undefined;
  if (u?.uPwTime) u.uPwTime.value += dt;
}

/** Level bias: floor(log2(rho) + bias) — 0.5 = the GPU's nearest-mip rule. */
export const PW_MIP_BIAS = 0.5;

/**
 * CPU twin of the shader's level pick (tests): `rho` PAINTED texels a pixel, `levels` of the
 * texture, `scale` 2 for a tile stored at 2× (the level is picked for its stored texels).
 */
export function pwLevelFor(rho: number, levels: number, bias = PW_MIP_BIAS, scale = 1): number {
  return Math.max(0, Math.min(levels - 1, Math.floor(Math.log2(Math.max(rho * scale, 1e-3)) + bias)));
}

/**
 * The fetch every PixelWorld fragment shader shares (declare it once, after <common>):
 *  - `pwTexel(ip, lv)`: the texel at `ip` of level `lv` — rgb = its painted colour (linear),
 *    a = its class: 0 cut out, 0.5 glow, 1 lit (so `a < 0.25` discards and `a < 0.85` is glow);
 *  - `pwScale(rect)`: stored texels per painted texel of the tile (1, or 2: `rect.w` < 0);
 *  - `pwLevel(rho, s, bias, maxLv)`: the level for `rho` painted texels a pixel;
 *  - `pwFetch(org, t, s, lv)`: the texel at painted coords `t` inside the tile at `org`.
 * Each leaves `pwRT` = the (ramp id, painted tone) of the texel it returned: the lit materials
 * look the colour up again once the light has said how many tones to move it.
 * Samplers are highp by name: the index is rebuilt from two normalised bytes.
 */
export const PW_FETCH = /* glsl */ `
  uniform highp sampler2D uPwAtlas;
  uniform highp sampler2D uPwPal;
  ivec2 pwRT = ivec2(0);
  #ifdef PW_DEBUG
    vec3 pwDbgTexel = vec3(0.0);
  #endif
  vec4 pwTexel(ivec2 ip, int lv) {
    ivec2 b = ivec2(texelFetch(uPwAtlas, ip, lv).rg * 255.0 + 0.5);
    int ramp = b.x | ((b.y & 15) << 8);
    if (ramp == 0) return vec4(0.0);
    int tone = (b.y >> 4) & 7;
    pwRT = ivec2(ramp, tone);
    #ifdef PW_DEBUG
      // tone: 0 blue … 5 orange, glow magenta; ramp: a hue an id (paler for odd ids).
      if (uPwDebug > 3.5) {
        float hh = fract(float(ramp) * 0.61803399) * 6.0;
        vec3 hue = clamp(abs(mod(hh + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        pwDbgTexel = mix(vec3(1.0), hue, (ramp & 1) == 1 ? 0.55 : 1.0);
      } else {
        pwDbgTexel = b.y >= 128 ? vec3(1.0, 0.0, 1.0)
          : tone == 0 ? vec3(0.0, 0.0, 1.0) : tone == 1 ? vec3(0.0, 0.5, 1.0) : tone == 2 ? vec3(0.0, 1.0, 1.0)
          : tone == 3 ? vec3(0.0, 1.0, 0.0) : tone == 4 ? vec3(1.0, 1.0, 0.0) : vec3(1.0, 0.5, 0.0);
      }
    #endif
    return vec4(texelFetch(uPwPal, ivec2(${PW_PAL_DEEP} + tone, ramp), 0).rgb, b.y >= 128 ? 0.5 : 1.0);
  }
  float pwScale(vec4 rect) {
    return rect.w < 0.0 ? 2.0 : 1.0;
  }
  int pwLevel(float rho, float s, float bias, float maxLv) {
    return int(clamp(floor(log2(max(rho * s, 1e-3)) + bias), 0.0, maxLv));
  }
  vec4 pwFetch(vec2 org, vec2 t, float s, int lv) {
    return pwTexel((ivec2(org) + ivec2(floor(t * s))) >> lv, lv);
  }
  #ifdef PW_ANISO
    // The level picked per texel axis (\`rho\`: painted texels a pixel along u and along v), not once for
    // the squeezed one: a plane seen at a grazing angle (a road, a corridor wall) keeps its texels at pixel
    // size ACROSS the view instead of drawing a coarse level's texels wide. The fetch is the finer of the
    // two levels (at most two apart); along the squeezed axis the 2 or 4 texels of the block a level that
    // coarse would have made of them are read and reduced the way the levels are made (class by majority,
    // glow winning ties, then the texel nearest their mean: a real texel, and the same one wherever the
    // sample falls inside that block — nothing crawls). \`lv\` returns the level drawn along u and v.
    vec4 pwFetchAxes(vec2 org, vec2 t, float s, vec2 rho, float bias, float maxLv, out ivec2 lv) {
      vec2 l2 = clamp(floor(log2(max(rho * s, vec2(1e-3))) + bias), 0.0, maxLv);
      int hi = int(max(l2.x, l2.y));
      int lo = max(int(min(l2.x, l2.y)), hi - 2);
      bool alongU = l2.x > l2.y;
      lv = alongU ? ivec2(hi, lo) : ivec2(lo, hi);
      ivec2 p = (ivec2(org) + ivec2(floor(t * s))) >> lo;
      int sh = hi - lo;
      if (sh == 0) return pwTexel(p, lo);
      ivec2 ax = alongU ? ivec2(1, 0) : ivec2(0, 1);
      int along = alongU ? p.x : p.y;
      ivec2 p0 = p - ax * (along - ((along >> sh) << sh));
      vec4 c0 = pwTexel(p0, lo);
      ivec2 r0 = pwRT;
      vec4 c1 = pwTexel(p0 + ax, lo);
      ivec2 r1 = pwRT;
      // (A block of two: the pair counted twice, so the votes below read the same.)
      vec4 c2 = c0;
      vec4 c3 = c1;
      ivec2 r2 = r0;
      ivec2 r3 = r1;
      if (sh > 1) {
        c2 = pwTexel(p0 + ax * 2, lo);
        r2 = pwRT;
        c3 = pwTexel(p0 + ax * 3, lo);
        r3 = pwRT;
      }
      vec4 a = vec4(c0.a, c1.a, c2.a, c3.a);
      vec4 isLit = step(0.85, a);
      vec4 isGlow = step(0.25, a) - isLit;
      float lit = dot(isLit, vec4(1.0));
      float glow = dot(isGlow, vec4(1.0));
      if (lit + glow <= 1.0 && glow == 0.0) return vec4(0.0);
      vec4 w = glow > 0.0 && glow >= lit ? isGlow : isLit;
      vec3 mean = (c0.rgb * w.x + c1.rgb * w.y + c2.rgb * w.z + c3.rgb * w.w) / dot(w, vec4(1.0));
      vec3 e0 = c0.rgb - mean;
      vec3 e1 = c1.rgb - mean;
      vec3 e2 = c2.rgb - mean;
      vec3 e3 = c3.rgb - mean;
      vec4 d = vec4(dot(e0, e0), dot(e1, e1), dot(e2, e2), dot(e3, e3)) + (1.0 - w) * 1e6;
      vec4 best = c0;
      pwRT = r0;
      float bd = d.x;
      if (d.y < bd) { best = c1; pwRT = r1; bd = d.y; }
      if (d.z < bd) { best = c2; pwRT = r2; bd = d.z; }
      if (d.w < bd) { best = c3; pwRT = r3; }
      return best;
    }
  #endif
`;

/**
 * The per-axis level pick (`pwFetchAxes`; on by default, `&pwaniso=0`: one level for both axes, as
 * the first pass drew). Read when a material is MADE: set it before a stage builds.
 */
let axesOn = true;
export function pwAxisLevels(on: boolean) {
  axesOn = on;
}

/** The two textures of an atlas as the uniforms `PW_FETCH` declares. */
export function pwAtlasUniforms(atlas: PwAtlas): { uPwAtlas: { value: THREE.Texture }; uPwPal: { value: THREE.Texture } } {
  return { uPwAtlas: { value: atlas.texture() }, uPwPal: { value: atlas.palette() } };
}

const VERT_DECL = /* glsl */ `
  attribute vec4 pwRect;
  flat varying vec4 vPwRect;
  #ifdef PW_PLANAR
    varying vec3 vPwPos;
  #else
    attribute vec2 pwUv;
    varying vec2 vPwUv;
  #endif
`;

const VERT_BEGIN = /* glsl */ `
  #include <begin_vertex>
  vPwRect = pwRect;
  #ifdef PW_PLANAR
    vPwPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vPwUv = pwUv;
  #endif
`;

const FRAG_DECL = /* glsl */ `
  ${PW_DEBUG_DECL}
  ${PW_FETCH}
  ${PW_LIGHT_DECL}
  uniform float uPwBias;
  uniform float uPwGain;
  uniform float uPwGlow;
  uniform float uPwDensity;
  uniform float uPwMaxLv;
  uniform float uPwTime;
  uniform vec2 uPwAnim;
  flat varying vec4 vPwRect;
  #ifdef PW_PLANAR
    varying vec3 vPwPos;
  #else
    varying vec2 vPwUv;
  #endif
`;

/**
 * Atlas fetch: discards cut-outs. Ramp-step light (`PW_LIGHT`): leaves the texel (`pwRT`), its
 * class (`pwGlowK`) and its coords at the level drawn (`pwQ`: the dither's grid) for `PW_LIGHT_OUT`
 * and `diffuseColor` white, so the lights sum over a white surface. Else (the first pass's light,
 * backdrops): multiplies the painted colour (linear) into `diffuseColor`, sets `pwEmit` (glow texels).
 */
const FRAG_MAP = /* glsl */ `
  vec3 pwEmit = vec3(0.0);
  float pwGlowK = 0.0;
  ivec2 pwQ = ivec2(0);
  {
    #ifdef PW_PLANAR
      vec3 pn = cross(dFdx(vPwPos), dFdy(vPwPos));
      if (dot(pn, cameraPosition - vPwPos) < 0.0) pn = -pn;
      vec3 an = abs(pn);
      vec2 uvm = (an.y > an.x && an.y > an.z) ? vec2(vPwPos.x, -vPwPos.z)
        : (an.x > an.z ? vec2(pn.x > 0.0 ? -vPwPos.z : vPwPos.z, vPwPos.y) : vec2(pn.z > 0.0 ? vPwPos.x : -vPwPos.x, vPwPos.y));
      vec2 pu = uvm * uPwDensity;
    #else
      vec2 pu = vPwUv;
    #endif
    vec2 pg = max(abs(dFdx(pu)), abs(dFdy(pu)));
    float ps = pwScale(vPwRect);
    vec2 rs = abs(vPwRect.zw);
    #ifdef PW_ANIM
      // Animated strip: wrap / clamp inside one frame, then step to the current frame.
      float fh = rs.y / uPwAnim.x;
      vec2 t = vPwRect.z > 0.0 ? mod(pu, vec2(rs.x, fh)) : clamp(pu, vec2(0.0), vec2(rs.x, fh) - 0.001);
      vec2 tq = t;
      t.y += floor(mod(uPwTime * uPwAnim.y, uPwAnim.x)) * fh;
    #else
      vec2 t = vPwRect.z > 0.0 ? mod(pu, rs) : clamp(pu, vec2(0.0), rs - 0.001);
      vec2 tq = t;
    #endif
    #ifdef PW_ANISO
      ivec2 lv;
      vec4 pc = pwFetchAxes(vPwRect.xy, t, ps, pg, uPwBias, uPwMaxLv, lv);
    #else
      ivec2 lv = ivec2(pwLevel(max(pg.x, pg.y), ps, uPwBias, uPwMaxLv));
      vec4 pc = pwFetch(vPwRect.xy, t, ps, lv.x);
    #endif
    if (pc.a < 0.25) discard;
    pwGlowK = pc.a < 0.85 ? 1.0 : 0.0;
    #ifdef PW_LIGHT
      // (The frame of a strip does not move the pattern: \`tq\` is the texel inside its frame.)
      pwQ = ivec2(floor(tq * ps)) >> lv;
    #else
      diffuseColor.rgb *= pc.rgb * (1.0 - pwGlowK) * uPwGain;
      pwEmit = pc.rgb * pwGlowK * uPwGlow;
    #endif
    #ifdef PW_DEBUG
      pwDbg = uPwDebug > 2.5 ? pwDbgTexel : pwDbgMag(pu, ps, lv);
    #endif
  }
`;

const cacheByAtlas = new WeakMap<PwAtlas, Map<string, THREE.MeshLambertMaterial>>();
/** A number a mood (materials are cached by what they are lit under). */
const moodIds = new WeakMap<PwMoodUniforms, number>();
let moodSeq = 0;
function moodId(m: PwMoodUniforms): number {
  let id = moodIds.get(m);
  if (id === undefined) moodIds.set(m, (id = ++moodSeq));
  return id;
}

/** The (cached, Kit-tracked) PixelWorld material for an atlas + options. */
export function pwMaterial(atlas: PwAtlas, o: PwMaterialOptions = {}): THREE.MeshLambertMaterial {
  let byKey = cacheByAtlas.get(atlas);
  if (!byKey) cacheByAtlas.set(atlas, (byKey = new Map()));
  const mood = o.mood ?? pwMoodNow();
  const lit = pwLightOn();
  const key = `${o.planar ? 'p' : 'u'}|${o.side ?? 0}|${o.gain ?? 1}|${o.glow ?? 1}|${o.bias ?? PW_MIP_BIAS}|${o.fog ?? true}|${o.density ?? PW_TPM}|${o.tag ?? ''}|${o.anim ? `${o.anim.frames}x${o.anim.fps}` : ''}|${axesOn && o.axes !== false ? 'x' : ''}|${lit ? moodId(mood) : ''}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const uniforms: Record<string, { value: unknown }> = {
    ...pwAtlasUniforms(atlas),
    ...pwLightUniforms(mood),
    uPwBias: { value: o.bias ?? PW_MIP_BIAS },
    uPwGain: { value: o.gain ?? 1 },
    uPwGlow: { value: o.glow ?? 1 },
    uPwDensity: { value: o.density ?? PW_TPM },
    uPwMaxLv: { value: atlas.levels - 1 },
    uPwTime: { value: 0 },
    uPwAnim: { value: new THREE.Vector2(o.anim?.frames ?? 1, o.anim?.fps ?? 0) },
  };
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, side: o.side ?? THREE.FrontSide, fog: o.fog ?? true });
  const defines: Record<string, string> = {};
  if (o.planar) defines.PW_PLANAR = '';
  if (o.anim) defines.PW_ANIM = '';
  // (Backdrops, billboards and sprites face the camera: one level is right for them.)
  if (axesOn && o.axes !== false) defines.PW_ANISO = '';
  if (lit) defines.PW_LIGHT = '';
  pwDebugSetup(defines, uniforms);
  m.defines = defines;
  m.userData.pw = uniforms;
  // Bakers must leave PixelWorld meshes alone (their attributes would be stripped).
  m.userData.pixelWorld = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_DECL}`).replace('#include <begin_vertex>', VERT_BEGIN);
    shader.fragmentShader = pwLightPatch(
      shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
        .replace('#include <map_fragment>', FRAG_MAP)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += pwEmit;'),
    );
    shader.fragmentShader = pwDebugPatch(shader.fragmentShader);
  };
  m.customProgramCacheKey = () => `pixelWorld3|${o.planar ? 'p' : 'u'}|${o.anim ? 'a' : ''}`;
  m.name = `pw:${atlas.name}`;
  Kit.track(m);
  byKey.set(key, m);
  return m;
}

/**
 * Unlit PixelWorld material (backdrop layers, sky): painted colour as is (× `gain`), no lights, no
 * fog, cut-outs discarded. A backdrop's paint goes THROUGH the monitor's tone curve, like the
 * classic sky domes and like everything the scene fog is blended into — so a backdrop painted in
 * the fog colour meets the fogged scenery at the horizon, and a stage can scale it in scene space
 * (lightning, the live fog) — but it is written on the monitor's colour lattice (`pwFilmSnap`): the
 * same picture, without the pass's ordered dither over the painted sky.
 */
export function pwBackdropMaterial(atlas: PwAtlas, o: { gain?: number; depthWrite?: boolean; tag?: string } = {}): THREE.MeshBasicMaterial {
  const uniforms: Record<string, { value: unknown }> = {
    ...pwAtlasUniforms(atlas),
    ...pwLightUniforms(),
    uPwBias: { value: PW_MIP_BIAS },
    uPwGain: { value: o.gain ?? 1 },
    uPwGlow: { value: o.gain ?? 1 },
    uPwDensity: { value: 1 },
    uPwMaxLv: { value: atlas.levels - 1 },
    uPwTime: { value: 0 },
    uPwAnim: { value: new THREE.Vector2(1, 0) },
  };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false, depthWrite: o.depthWrite ?? false, side: THREE.DoubleSide });
  const defines: Record<string, string> = {};
  const snap = pwLightOn();
  pwDebugSetup(defines, uniforms);
  m.defines = defines;
  m.userData.pw = uniforms;
  m.userData.pixelWorld = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_DECL}`).replace('#include <begin_vertex>', VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      // Unlit: glow and lit texels alike are shown at their painted colour.
      // (A backdrop is black in every debug view: painted at the screen's own density, never part of the audit.)
      .replace('#include <map_fragment>', FRAG_MAP + '\n  diffuseColor.rgb = (diffuseColor.rgb + pwEmit);\n  #ifdef PW_DEBUG\n    pwDbg = vec3(0.0);\n  #endif');
    if (snap) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.rgb = pwFilmSnap(gl_FragColor.rgb);');
    shader.fragmentShader = pwDebugPatch(shader.fragmentShader);
  };
  m.customProgramCacheKey = () => `pixelWorldBackdrop3${snap ? 's' : ''}`;
  m.name = `pwBackdrop:${atlas.name}`;
  return Kit.track(m);
}

import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { PW_PAL_DEEP, PW_TPM } from './canvas';
import type { PwAtlas } from './atlas';
import { PW_DEBUG_DECL, pwDebugPatch, pwDebugSetup } from '../../core/debugView';

/**
 * PixelWorld materials: a flat-shaded Lambert (stage lights, flashlight, fog,
 * tone mapping exactly like the 3D scenery) whose colour comes from the stage's
 * PixelWorld atlas, texel by texel:
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
 *    graffiti), glow (lit windows, neon, lamps: emitted at their painted colour
 *    × `uPwGlow`, unaffected by the lights), lit;
 *  - vertex colours (white by default) tint a vertex: per-building hue shifts,
 *    painted ambient occlusion at wall feet.
 */

export interface PwMaterialOptions {
  /** World-position projection instead of a UV attribute. */
  planar?: boolean;
  side?: THREE.Side;
  /** Multiplier of lit texels (match the stage's 3D scenery brightness; default 1). */
  gain?: number;
  /** Multiplier of glow texels (default 1). */
  glow?: number;
  /** Level bias (default 0.5: level 0 until a texel is 1.4 pixels' worth). */
  bias?: number;
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
 * Samplers are highp by name: the index is rebuilt from two normalised bytes.
 */
export const PW_FETCH = /* glsl */ `
  uniform highp sampler2D uPwAtlas;
  uniform highp sampler2D uPwPal;
  #ifdef PW_DEBUG
    vec3 pwDbgTexel = vec3(0.0);
  #endif
  vec4 pwTexel(ivec2 ip, int lv) {
    ivec2 b = ivec2(texelFetch(uPwAtlas, ip, lv).rg * 255.0 + 0.5);
    int ramp = b.x | ((b.y & 15) << 8);
    if (ramp == 0) return vec4(0.0);
    int tone = (b.y >> 4) & 7;
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
`;

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

/** Atlas fetch: multiplies the painted colour (linear) into `diffuseColor`, sets `pwEmit` (glow texels), discards cut-outs. */
const FRAG_MAP = /* glsl */ `
  vec3 pwEmit = vec3(0.0);
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
    float rho = max(pg.x, pg.y);
    float ps = pwScale(vPwRect);
    int lv = pwLevel(rho, ps, uPwBias, uPwMaxLv);
    vec2 rs = abs(vPwRect.zw);
    #ifdef PW_ANIM
      // Animated strip: wrap / clamp inside one frame, then step to the current frame.
      float fh = rs.y / uPwAnim.x;
      vec2 t = vPwRect.z > 0.0 ? mod(pu, vec2(rs.x, fh)) : clamp(pu, vec2(0.0), vec2(rs.x, fh) - 0.001);
      t.y += floor(mod(uPwTime * uPwAnim.y, uPwAnim.x)) * fh;
    #else
      vec2 t = vPwRect.z > 0.0 ? mod(pu, rs) : clamp(pu, vec2(0.0), rs - 0.001);
    #endif
    vec4 pc = pwFetch(vPwRect.xy, t, ps, lv);
    if (pc.a < 0.25) discard;
    float glowK = pc.a < 0.85 ? 1.0 : 0.0;
    diffuseColor.rgb *= pc.rgb * (1.0 - glowK) * uPwGain;
    pwEmit = pc.rgb * glowK * uPwGlow;
    #ifdef PW_DEBUG
      pwDbg = uPwDebug > 2.5 ? pwDbgTexel : pwDbgMag(pu, ps, lv);
    #endif
  }
`;

const cacheByAtlas = new WeakMap<PwAtlas, Map<string, THREE.MeshLambertMaterial>>();

/** The (cached, Kit-tracked) PixelWorld material for an atlas + options. */
export function pwMaterial(atlas: PwAtlas, o: PwMaterialOptions = {}): THREE.MeshLambertMaterial {
  let byKey = cacheByAtlas.get(atlas);
  if (!byKey) cacheByAtlas.set(atlas, (byKey = new Map()));
  const key = `${o.planar ? 'p' : 'u'}|${o.side ?? 0}|${o.gain ?? 1}|${o.glow ?? 1}|${o.bias ?? PW_MIP_BIAS}|${o.fog ?? true}|${o.density ?? PW_TPM}|${o.tag ?? ''}|${o.anim ? `${o.anim.frames}x${o.anim.fps}` : ''}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const uniforms: Record<string, { value: unknown }> = {
    ...pwAtlasUniforms(atlas),
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
  pwDebugSetup(defines, uniforms);
  m.defines = defines;
  m.userData.pw = uniforms;
  // Bakers must leave PixelWorld meshes alone (their attributes would be stripped).
  m.userData.pixelWorld = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_DECL}`).replace('#include <begin_vertex>', VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += pwEmit;');
    shader.fragmentShader = pwDebugPatch(shader.fragmentShader);
  };
  m.customProgramCacheKey = () => `pixelWorld2|${o.planar ? 'p' : 'u'}|${o.anim ? 'a' : ''}`;
  m.name = `pw:${atlas.name}`;
  Kit.track(m);
  byKey.set(key, m);
  return m;
}

/**
 * Unlit PixelWorld material (backdrop layers, sky): painted colour as is (× `gain`; tone-mapped
 * like the classic sky domes, so a backdrop painted in the fog colour meets the fogged scenery),
 * no lights, no fog, cut-outs discarded.
 */
export function pwBackdropMaterial(atlas: PwAtlas, o: { gain?: number; depthWrite?: boolean; tag?: string } = {}): THREE.MeshBasicMaterial {
  const uniforms: Record<string, { value: unknown }> = {
    ...pwAtlasUniforms(atlas),
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
    shader.fragmentShader = pwDebugPatch(shader.fragmentShader);
  };
  m.customProgramCacheKey = () => 'pixelWorldBackdrop2';
  m.name = `pwBackdrop:${atlas.name}`;
  return Kit.track(m);
}

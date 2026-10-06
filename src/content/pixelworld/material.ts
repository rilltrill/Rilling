import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { PW_TPM } from './canvas';
import type { PwAtlas } from './atlas';

/**
 * PixelWorld materials: a flat-shaded Lambert (stage lights, flashlight, fog,
 * tone mapping exactly like the 3D scenery) whose colour comes from the stage's
 * PixelWorld atlas, texel by texel:
 *
 *  - per vertex `pwRect` = the tile's atlas rect (x, y, w, h texels; w < 0 =
 *    a module, clamped to its rect; w > 0 = a tileable surface, wrapped inside
 *    it) and, in UV mode, `pwUv` = texel coordinates (unwrapped, so screen
 *    derivatives stay continuous across a wrap);
 *  - PLANAR mode (define `PW_PLANAR`): no UV attribute at all — texel coords
 *    come from the world position projected on the facet's dominant axis
 *    (screen derivatives) × `uPwDensity`: the cheap path for re-texturing big
 *    baked scenery (24 B a vertex: position + rect + colour, no normals —
 *    flat shading also comes from derivatives), like d3's packed bakes;
 *  - the level is picked from the on-screen texel size (log2(texels per pixel)
 *    + `uPwBias`) and fetched whole (`texelFetch`): hard pixel-art texels, the
 *    hand-made levels take over before anything is minified enough to crawl;
 *  - alpha classes: 0 = cut out (discarded: railings, fences, signs' outlines,
 *    graffiti), PW_GLOW_A = unlit glow (lit windows, neon, lamps: emitted at
 *    their painted colour × `uPwGlow`, unaffected by the lights), 255 = lit;
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

/** CPU twin of the shader's level pick (tests). */
export function pwLevelFor(rho: number, levels: number, bias = PW_MIP_BIAS): number {
  return Math.max(0, Math.min(levels - 1, Math.floor(Math.log2(Math.max(rho, 1e-3)) + bias)));
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
  uniform sampler2D uPwAtlas;
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

/** Atlas fetch: sets `pwCol` (painted colour, linear) and `pwGlowK` (1 = unlit glow), discards cut-outs. */
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
    int lv = int(clamp(floor(log2(max(rho, 1e-3)) + uPwBias), 0.0, uPwMaxLv));
    vec2 rs = abs(vPwRect.zw);
    #ifdef PW_ANIM
      // Animated strip: wrap / clamp inside one frame, then step to the current frame.
      float fh = rs.y / uPwAnim.x;
      vec2 t = vPwRect.z > 0.0 ? mod(pu, vec2(rs.x, fh)) : clamp(pu, vec2(0.0), vec2(rs.x, fh) - 0.001);
      t.y += floor(mod(uPwTime * uPwAnim.y, uPwAnim.x)) * fh;
    #else
      vec2 t = vPwRect.z > 0.0 ? mod(pu, rs) : clamp(pu, vec2(0.0), rs - 0.001);
    #endif
    ivec2 ip = (ivec2(vPwRect.xy) + ivec2(floor(t))) >> lv;
    vec4 pc = texelFetch(uPwAtlas, ip, lv);
    if (pc.a < 0.25) discard;
    float glowK = pc.a < 0.85 ? 1.0 : 0.0;
    diffuseColor.rgb *= pc.rgb * (1.0 - glowK) * uPwGain;
    pwEmit = pc.rgb * glowK * uPwGlow;
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
  const tex = atlas.texture();
  const uniforms = {
    uPwAtlas: { value: tex },
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
  };
  m.customProgramCacheKey = () => `pixelWorld1|${o.planar ? 'p' : 'u'}|${o.anim ? 'a' : ''}`;
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
  const tex = atlas.texture();
  const uniforms = {
    uPwAtlas: { value: tex },
    uPwBias: { value: PW_MIP_BIAS },
    uPwGain: { value: o.gain ?? 1 },
    uPwGlow: { value: o.gain ?? 1 },
    uPwDensity: { value: 1 },
    uPwMaxLv: { value: atlas.levels - 1 },
    uPwTime: { value: 0 },
    uPwAnim: { value: new THREE.Vector2(1, 0) },
  };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false, depthWrite: o.depthWrite ?? false, side: THREE.DoubleSide });
  m.userData.pw = uniforms;
  m.userData.pixelWorld = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_DECL}`).replace('#include <begin_vertex>', VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      // Unlit: glow and lit texels alike are shown at their painted colour.
      .replace('#include <map_fragment>', FRAG_MAP + '\n  diffuseColor.rgb = (diffuseColor.rgb + pwEmit);');
  };
  m.customProgramCacheKey = () => 'pixelWorldBackdrop1';
  m.name = `pwBackdrop:${atlas.name}`;
  return Kit.track(m);
}

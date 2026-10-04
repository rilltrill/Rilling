import * as THREE from 'three';
import { Kit, type MatOptions } from '../../kit/ModelKit';
import { EnvKit } from '../../kit/EnvKit';
import { Textures, TEX_NAMES, type TexName } from '../../kit/Textures';

/**
 * JUNGLE RUN retro surfaces.
 *
 * Kit.mat textures live on the MATERIAL, so a baked scenery chunk that mixes
 * bark, leaves, rock and dirt would need one draw call per texture. Instead,
 * `merged()` (props.ts) writes every part's texture choice into a per-vertex
 * attribute and draws the whole chunk with ONE material that samples all of
 * Kit's pixel textures from a single 2D array texture — same object-space
 * planar projection, brightness gain and nearest-filtered texels as Kit.mat,
 * but any mix of textures in one draw call.
 *
 * Use `tm(color, tex, scale, strength)` for every d1 material: it is a cached
 * Kit.mat (so loose meshes get the texture directly) that also remembers its
 * texture spec for the bake.
 */

export type Surf = TexName | 'none';

export interface TexSpec {
  tex: Surf;
  scale: number;
  strength: number;
}

const specs = new WeakMap<THREE.Material, TexSpec>();
const NONE: TexSpec = { tex: 'none', scale: 1, strength: 0 };

/** Textured flat Lambert (cached Kit.mat) whose texture spec survives baking. */
export function tm(color: number, tex: Surf, scale = 1, strength = 1, o: MatOptions = {}): THREE.MeshLambertMaterial {
  const m = Kit.mat(color, { ...o, tex, texScale: scale, texStrength: strength });
  if (!specs.has(m)) specs.set(m, tex === 'none' ? NONE : { tex, scale, strength });
  return m;
}

/** Texture spec of any material (Kit.mat defaults: grain at 0.6, named textures at 1). */
export function specOf(m: THREE.Material): TexSpec {
  const s = specs.get(m);
  if (s) return s;
  const name = m.userData.retroTex as TexName | undefined;
  if (!name) return NONE;
  return { tex: name, scale: 1, strength: name === 'grain' ? 0.6 : 1 };
}

/**
 * Per-vertex texture parameters, packed into 4 bytes (a Uint8 `retroA`
 * attribute, decoded in the vertex shader of `bakedMaterial()`):
 *   [0] texture layer (0–25)
 *   [1] repeats per metre, log-encoded: exp2(b / 25 − 6) → 0.016…18.4, ≈1.4 % steps
 *   [2] strength × 100 (0–2.55)
 *   [3] brightness gain × 100 (Textures gain is ≤ 2.5)
 * 4 B instead of 16 B of floats per baked vertex (d1 bakes ≈ 0.5 M vertices).
 */
export function specAttr(s: TexSpec, out: [number, number, number, number]): [number, number, number, number] {
  if (s.tex === 'none' || s.strength <= 0) {
    out[0] = 0;
    out[1] = DENSITY_ONE;
    out[2] = 0;
    out[3] = 100;
    return out;
  }
  const rt = Textures.get(s.tex);
  out[0] = TEX_NAMES.indexOf(s.tex);
  out[1] = byte((Math.log2(rt.density * s.scale) + 6) * 25);
  out[2] = byte(s.strength * 100);
  out[3] = byte(rt.gain * 100);
  return out;
}

const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const DENSITY_ONE = 150; // (log2(1) + 6) * 25

/** GLSL: decode the packed `retroA` bytes (as floats 0–255) into layer, density, strength, gain. */
const DECODE = 'vec4(retroA.x, exp2(retroA.y * 0.04 - 6.0), retroA.z * 0.01, retroA.w * 0.01)';

// ─── Texture array ───────────────────────────────────────────────────────────

const LAYER = 64;
let atlas: THREE.DataArrayTexture | null = null;

/** Every Kit pixel texture as one 64×64×N sRGB array (32 px textures doubled texel-for-texel). */
function textureArray(): THREE.DataArrayTexture {
  if (atlas) return atlas;
  const n = TEX_NAMES.length;
  const data = new Uint8Array(LAYER * LAYER * 4 * n);
  TEX_NAMES.forEach((name, li) => {
    const { data: src, size } = Textures.pixels(name);
    const f = LAYER / size;
    const base = li * LAYER * LAYER * 4;
    for (let y = 0; y < LAYER; y++) {
      const sy = Math.floor(y / f);
      for (let x = 0; x < LAYER; x++) {
        const si = (sy * size + Math.floor(x / f)) * 4;
        const di = base + (y * LAYER + x) * 4;
        data[di] = src[si];
        data[di + 1] = src[si + 1];
        data[di + 2] = src[si + 2];
        data[di + 3] = 255;
      }
    }
  });
  const t = new THREE.DataArrayTexture(data, LAYER, LAYER, n);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  t.name = 'd1:retroArray';
  Kit.track(t);
  t.addEventListener('dispose', () => {
    if (atlas === t) atlas = null;
  });
  atlas = t;
  return t;
}

/**
 * Planar projection on the FACET normal (from screen derivatives of the
 * object-space position): every low-poly face gets one clean projection, like
 * the per-face UVs of a 90s model, with no seams across smooth-normal cylinders.
 */
const PROJECT = /* glsl */ `
  vec3 rFn = cross(dFdx(vRetroPos), dFdy(vRetroPos));
  vec3 an = abs(rFn);
  vec2 ruv = (an.x > an.y && an.x > an.z) ? vRetroPos.zy : ((an.y > an.z) ? vRetroPos.xz : vRetroPos.xy);
`;

let baked: THREE.MeshLambertMaterial | null = null;

/** The one material every d1 baked mesh uses (vertex colours + per-vertex texture choice). */
export function bakedMaterial(): THREE.MeshLambertMaterial {
  if (baked) return baked;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const arr = textureArray();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRetroArr = { value: arr };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 retroA;
        varying vec3 vRetroPos;
        varying vec4 vRetroA;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRetroPos = position * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
        vRetroA = ${DECODE};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform highp sampler2DArray uRetroArr;
        varying vec3 vRetroPos;
        varying vec4 vRetroA;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          ${PROJECT}
          vec3 rtex = texture(uRetroArr, vec3(ruv * vRetroA.y, vRetroA.x)).rgb * vRetroA.w;
          diffuseColor.rgb *= mix(vec3(1.0), rtex, vRetroA.z);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'd1RetroArray2';
  Kit.track(m);
  m.addEventListener('dispose', () => {
    if (baked === m) baked = null;
  });
  baked = m;
  return m;
}

// ─── Flowing water ───────────────────────────────────────────────────────────

/** Shared clock for every flowing-water material (advanced by the environment). */
export const waterClock = { value: 0 };

export interface FlowOptions {
  color: number;
  emissive?: number;
  emissiveIntensity?: number;
  opacity?: number;
  side?: THREE.Side;
  /** Texture density multiplier (like texScale). */
  scale?: number;
  /** Detail contrast; may exceed 1 (clamped at black) so ripples survive an emissive base. */
  strength?: number;
  /**
   * Velocity of the PATTERN in metres per second, in the material's texture
   * plane before `swap`: for planar projection the projected object-space
   * axes (x,z on a floor, x,y on an XY plane), for `along` the geometry's
   * `flowUv` (across, downstream) — so [0, 1.2] runs downstream at 1.2 m/s.
   */
  flow: [number, number];
  /** Swap the texture axes (the 'water' bands become streaks along the other direction). */
  swap?: boolean;
  /**
   * Map with the geometry's `flowUv` attribute (metres across, metres along
   * the stream — see `flowRibbon`) instead of planar projection, so ripples
   * follow every bend of the river and always run downstream.
   */
  along?: boolean;
}

/**
 * Animated water: Kit's 'water' pixel texture (crests run across the texture's
 * v axis), projected like Kit.mat or laid along the stream, scrolling with
 * `waterClock` (the river runs downstream, the waterfall falls).
 */
export function flowMat(o: FlowOptions): THREE.MeshLambertMaterial {
  const m = Kit.track(
    new THREE.MeshLambertMaterial({
      color: o.color,
      emissive: o.emissive ?? 0,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      transparent: o.opacity !== undefined && o.opacity < 1,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
    }),
  );
  const rt = Textures.get('water');
  const uniforms = {
    uFlowMap: { value: rt.texture },
    uFlowScale: { value: rt.density * (o.scale ?? 1) },
    uFlowStrength: { value: o.strength ?? 1 },
    uFlowGain: { value: rt.gain },
    uFlowDir: { value: new THREE.Vector2(o.flow[0], o.flow[1]) },
    uFlowTime: waterClock,
  };
  const along = !!o.along;
  const swap = o.swap ? 'ruv = ruv.yx;' : '';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', along ? '#include <common>\nattribute vec2 flowUv;\nvarying vec2 vFlowUv;' : '#include <common>\nvarying vec3 vRetroPos;')
      .replace(
        '#include <begin_vertex>',
        along
          ? `#include <begin_vertex>
        vFlowUv = flowUv;`
          : `#include <begin_vertex>
        vRetroPos = position * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uFlowMap;
        uniform float uFlowScale;
        uniform float uFlowStrength;
        uniform float uFlowGain;
        uniform vec2 uFlowDir;
        uniform float uFlowTime;
        ${along ? 'varying vec2 vFlowUv;' : 'varying vec3 vRetroPos;'}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          ${along ? 'vec2 ruv = vFlowUv;' : PROJECT}
          // A texel at texture coordinate c is drawn where ruv - flow*t == c, i.e. it moves by +flow.
          ruv -= uFlowDir * uFlowTime;
          ${swap}
          vec3 rtex = texture2D(uFlowMap, ruv * uFlowScale).rgb * uFlowGain;
          diffuseColor.rgb *= max(mix(vec3(1.0), rtex, uFlowStrength), vec3(0.0));
        }`,
      );
  };
  m.customProgramCacheKey = () => `d1Flow2|${o.swap ? 1 : 0}|${along ? 1 : 0}`;
  return m;
}

/**
 * Flat water ribbon along `curve` (same layout as EnvKit.ribbon) carrying a
 * `flowUv` attribute: x = metres across (right of the curve), y = metres along
 * it from its start. Use with `flowMat({ along: true })`; the curve must run
 * downstream. Returns a tracked mesh.
 */
export function flowRibbon(
  curve: THREE.Curve<THREE.Vector3>,
  width: number,
  mat: THREE.Material,
  opts: { step?: number; y?: number } = {},
): THREE.Mesh {
  const len = curve.getLength();
  const step = opts.step ?? 2;
  // Samples every `step` metres, exactly like EnvKit.ribbon (same triangle count).
  const n = Math.floor((len + 0.001) / step) + 1;
  const pos = new Float32Array(n * 6);
  const nor = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = Math.min(i * step, len);
    const f = EnvKit.frameAt(curve, d);
    const y = f.pos.y + (opts.y ?? 0.01);
    const hx = (f.right.x * width) / 2;
    const hz = (f.right.z * width) / 2;
    pos.set([f.pos.x - hx, y, f.pos.z - hz, f.pos.x + hx, y, f.pos.z + hz], i * 6);
    nor.set([0, 1, 0, 0, 1, 0], i * 6);
    uv.set([-width / 2, d, width / 2, d], i * 4);
    if (i > 0) {
      const a = (i - 1) * 2;
      // (left, right, nextLeft) / (right, nextRight, nextLeft) face +Y.
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('flowUv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return new THREE.Mesh(Kit.track(g), mat);
}

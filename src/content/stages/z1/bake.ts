import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from '../../kit/ModelKit';
import { EnvKit } from '../../kit/EnvKit';
import { TEX_NAMES, Textures, type TexName } from '../../kit/Textures';

/**
 * Colour + TEXTURE baking merge for MAIN STREET.
 *
 * EnvKit.mergeStatic merges per material, which leaves one draw call per colour
 * and per retro texture. Here every opaque flat Lambert colour is baked into the
 * vertex colours of ONE shared Lambert material, and every opaque glow (unlit)
 * colour into ONE shared unlit material — and the Kit retro texture of each
 * source material (brick, asphalt, skin, …, incl. the default grain) is baked
 * into a per-vertex `retro` attribute (layer, density, strength, gain). The two
 * shared materials sample all retro textures from one texture ARRAY with the
 * same object-space planar projection as Kit.mat, so a whole street block of
 * brick, stucco, planks, metal and concrete is still ~2 draw calls.
 * Whatever is left (standard/PBR, transparent, double-sided) is merged per
 * material with EnvKit.mergeStatic.
 */

// ─── Retro texture array ───────────────────────────────────────────────────

/** Layer size: every Kit texture is 32 or 64 px; 32 px ones are tiled 2×2. */
const LAYER = 64;

interface LayerInfo {
  layer: number;
  /** Repeats per metre of one array layer at texScale 1. */
  density: number;
  gain: number;
}

let retroArr: THREE.DataArrayTexture | null = null;
const layers = new Map<TexName, LayerInfo>();

/** All Kit retro textures as one sampler2DArray (built once per stage, tracked). */
export function retroArray(): THREE.DataArrayTexture {
  if (retroArr) return retroArr;
  const n = TEX_NAMES.length;
  const data = new Uint8Array(LAYER * LAYER * 4 * n);
  TEX_NAMES.forEach((name, l) => {
    const { data: px, size } = Textures.pixels(name);
    const rt = Textures.get(name);
    // Tile small textures (keeps the texel size); resample larger ones to one repeat.
    const tiled = size <= LAYER && LAYER % size === 0;
    const base = l * LAYER * LAYER * 4;
    for (let y = 0; y < LAYER; y++) {
      for (let x = 0; x < LAYER; x++) {
        const sx = tiled ? x % size : Math.floor((x * size) / LAYER);
        const sy = tiled ? y % size : Math.floor((y * size) / LAYER);
        const si = (sy * size + sx) * 4;
        const di = base + (y * LAYER + x) * 4;
        data[di] = px[si];
        data[di + 1] = px[si + 1];
        data[di + 2] = px[si + 2];
        data[di + 3] = 255;
      }
    }
    layers.set(name, { layer: l, density: rt.density * (tiled ? size / LAYER : 1), gain: rt.gain });
  });
  const t = new THREE.DataArrayTexture(data, LAYER, LAYER, n);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  t.name = 'z1:retroArray';
  t.addEventListener('dispose', () => {
    if (retroArr === t) retroArr = null;
  });
  retroArr = Kit.track(t);
  return t;
}

/** Per-vertex retro params: [layer, density (repeats/m), strength, gain]. */
export type RetroParams = readonly [number, number, number, number];
const NO_TEX: RetroParams = [0, 0, 0, 1];

/** Retro params for a texture name + Kit-style scale/strength. */
export function retroParams(name: TexName, scale = 1, strength = 1): RetroParams {
  retroArray();
  const info = layers.get(name);
  if (!info) return NO_TEX;
  return [info.layer, info.density * scale, strength, info.gain];
}

const paramCache = new WeakMap<THREE.Material, RetroParams | null>();

/**
 * The retro texture a Kit material carries (Kit.mat({ tex }), Kit.applyTexture,
 * default grain), read back from its projection uniforms. null = the material
 * has a hook we can't reproduce (left to the per-material merge).
 */
function texParamsOf(m: THREE.Material): RetroParams | null {
  const name = m.userData.retroTex as TexName | undefined;
  if (!name) return NO_TEX;
  if (paramCache.has(m)) return paramCache.get(m)!;
  let out: RetroParams | null = null;
  const rt = Textures.get(name);
  const probe = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: '', fragmentShader: '', defines: {} };
  try {
    m.onBeforeCompile(probe as never, undefined as never);
    const sc = probe.uniforms.uRetroScale?.value;
    const st = probe.uniforms.uRetroStrength?.value;
    if (typeof sc === 'number' && typeof st === 'number' && rt.density > 0) out = retroParams(name, sc / rt.density, st);
  } catch {
    out = null;
  }
  paramCache.set(m, out);
  return out;
}

/**
 * Inject the texture-array projection (per-vertex `retro` attribute, or
 * per-instance for instanced meshes) into a material's shader.
 */
export function applyRetroArray<T extends THREE.MeshLambertMaterial | THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>(m: T): T {
  const uniforms = { uRetroArr: { value: retroArray() } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 retro;
        varying vec3 vRetroAPos;
        varying vec3 vRetroANrm;
        flat varying vec4 vRetroA;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
        #ifdef USE_INSTANCING
          vRetroAPos = (instanceMatrix * vec4(position, 1.0)).xyz;
          vRetroANrm = mat3(instanceMatrix) * normal;
        #else
          vec3 rs = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
          vRetroAPos = position * rs;
          vRetroANrm = normal;
        #endif
          vRetroA = retro;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2DArray uRetroArr;
        varying vec3 vRetroAPos;
        varying vec3 vRetroANrm;
        flat varying vec4 vRetroA;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 an = abs(vRetroANrm);
          vec2 ruv = (an.x > an.y && an.x > an.z) ? vRetroAPos.zy : ((an.y > an.z) ? vRetroAPos.xz : vRetroAPos.xy);
          vec3 rtex = texture(uRetroArr, vec3(ruv * vRetroA.y, vRetroA.x)).rgb * vRetroA.w;
          diffuseColor.rgb *= mix(vec3(1.0), rtex, vRetroA.z);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'z1RetroArr1';
  m.needsUpdate = true;
  return m;
}

// ─── Shared baked materials ────────────────────────────────────────────────

const shared = new Map<string, THREE.Material>();

function sharedMat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = shared.get(key);
  if (!m) {
    m = Kit.track(make());
    m.addEventListener('dispose', () => shared.delete(key));
    shared.set(key, m);
  }
  return m as T;
}

/** Vertex-coloured, retro-textured flat Lambert (fogged). */
export function bakedLambert(): THREE.Material {
  return sharedMat('lambert', () => applyRetroArray(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
}

/** Vertex-coloured unlit glow (no fog, no tone mapping — matches Kit.glow), retro-textured. */
export function bakedGlow(): THREE.Material {
  return sharedMat('glow', () => applyRetroArray(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false })));
}

/**
 * Self-lit textured surface (lit interiors: tiles, wallpaper, checker floor).
 * Same look as Kit.glow(color, intensity) multiplied with a retro texture; bakes
 * into the shared glow material like any other glow.
 */
export function texGlow(color: number, intensity: number, tex: TexName, scale = 1, strength = 1): THREE.MeshBasicMaterial {
  return sharedMat(`tg|${color}|${intensity}|${tex}|${scale}|${strength}`, () => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false, fog: false });
    Kit.applyTexture(m, tex, scale, strength);
    return m;
  });
}

/**
 * Textured standard (PBR) material — wet asphalt, puddles. Not baked (merged per
 * material), so keep the number of distinct ones small.
 */
export function texStd(color: number, roughness: number, metalness: number, tex: TexName, scale = 1, strength = 1): THREE.MeshStandardMaterial {
  return sharedMat(`ts|${color}|${roughness}|${metalness}|${tex}|${scale}|${strength}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
    Kit.applyTexture(m, tex, scale, strength);
    return m;
  });
}

type Bucket = 'lambert' | 'glow' | null;

function bucketOf(m: THREE.Material): Bucket {
  if (m.transparent || m.side !== THREE.FrontSide) return null;
  if ((m as THREE.MeshLambertMaterial).isMeshLambertMaterial) {
    const l = m as THREE.MeshLambertMaterial;
    if (l.vertexColors || l.map || !l.fog || l.emissive.getHex() !== 0) return null;
    return texParamsOf(l) ? 'lambert' : null;
  }
  if ((m as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    const b = m as THREE.MeshBasicMaterial;
    if (b.vertexColors || b.map || b.fog || b.toneMapped) return null;
    return texParamsOf(b) ? 'glow' : null;
  }
  return null;
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

/**
 * Merge every static mesh under `group` (skipping `userData.noMerge`). The
 * originals are removed; the merged meshes are added to `group` and returned.
 */
export function bakeMerge(group: THREE.Object3D): THREE.Mesh[] {
  group.updateMatrixWorld(true);
  _inv.copy(group.matrixWorld).invert();
  const lists: Record<'lambert' | 'glow', THREE.BufferGeometry[]> = { lambert: [], glow: [] };
  const remove: THREE.Mesh[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material) || mesh.userData.noMerge) return;
    const b = bucketOf(mesh.material);
    if (!b) return;
    const tp = texParamsOf(mesh.material)!;
    const src = mesh.geometry;
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    g.applyMatrix4(_m);
    const c = (mesh.material as THREE.MeshBasicMaterial).color;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const ret = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      ret[i * 4] = tp[0];
      ret[i * 4 + 1] = tp[1];
      ret[i * 4 + 2] = tp[2];
      ret[i * 4 + 3] = tp[3];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('retro', new THREE.BufferAttribute(ret, 4));
    lists[b].push(g);
    remove.push(mesh);
  });
  for (const m of remove) m.parent?.remove(m);
  const out: THREE.Mesh[] = [];
  for (const key of ['lambert', 'glow'] as const) {
    const geos = lists[key];
    if (!geos.length) continue;
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(Kit.track(merged), key === 'lambert' ? bakedLambert() : bakedGlow());
    // Keep the classic merge below from re-merging (and stripping the colours of) this mesh.
    mesh.userData.noMerge = true;
    group.add(mesh);
    out.push(mesh);
  }
  // Everything else (PBR, transparent): classic per-material merge.
  out.push(...EnvKit.mergeStatic(group));
  return out;
}

/**
 * Build a set of meshes in a temporary group, bake them into as few meshes as
 * possible and attach the result to `parent` (same local frame). Used for
 * animated rigs: one baked mesh per joint / hit-zone instead of dozens.
 */
export function bakeInto(parent: THREE.Object3D, build: (g: THREE.Group) => void): THREE.Mesh[] {
  const g = new THREE.Group();
  build(g);
  const meshes = bakeMerge(g);
  for (const m of meshes) {
    g.remove(m);
    m.matrixAutoUpdate = true;
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    parent.add(m);
  }
  return meshes;
}

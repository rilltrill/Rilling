import * as THREE from 'three';
import { Kit, type TexName } from '../../kit/ModelKit';

/**
 * Scenery materials that remember how to bake, plus a fast colour-baking merge.
 *
 * `M.lam(colour, tex?, scale?, strength?)` is a cached Kit Lambert material;
 * `M.glow(colour)` an unlit Kit glow. `bake(group)` merges every static mesh
 * under the group into ONE mesh per retro texture: flat colours become vertex
 * colours of a shared white material, and the texture's density and strength
 * travel PER VERTEX (attribute `z3tex` = [scale, strength]). So near jersey
 * barriers (concrete ×1 at full strength) and a far sound wall (concrete ×0.5
 * at 60 %) still cost a single draw call, and clean surfaces (strength 0 —
 * sign faces, lettering, lamps) ride along in whichever bucket is biggest.
 * A 50 m stretch of interstate ends up at ~6 draw calls however many cars,
 * barriers and signs it holds.
 *
 * Meshes may carry their own `color` attribute (the road's lane wear); it is
 * multiplied with the material colour when baking.
 */

interface Surf {
  /** null = untextured (clean). */
  tex: TexName | null;
  scale: number;
  strength: number;
}

type BakeInfo = Surf & { kind: 'lam' | 'glow' };

const info = new WeakMap<THREE.Material, BakeInfo>();

/** Default grit for M.lam() without a texture (same as Kit.mat's default grain). */
const GRAIN: Surf = { tex: 'grain', scale: 1, strength: 0.6 };

/** Per-stage caches (cleared when Kit disposes everything between stages). */
let live = false;
const bakedMats = new Map<string, THREE.Material>();
const glowTex = new Map<string, THREE.MeshBasicMaterial>();

function ensureLive() {
  if (live) return;
  live = true;
  bakedMats.clear();
  glowTex.clear();
  Kit.track({
    dispose() {
      live = false;
      bakedMats.clear();
      glowTex.clear();
    },
  });
}

/**
 * Turn the Kit projection's uniform density/strength into per-vertex values:
 * `uRetroScale` / `uRetroStrength` become macros multiplying the uniform by the
 * `z3tex` attribute, so it works whatever expression Kit uses them in.
 */
function perVertexTexture(m: THREE.Material) {
  const inner = m.onBeforeCompile;
  const innerKey = m.customProgramCacheKey?.() ?? '';
  m.onBeforeCompile = (shader, renderer) => {
    inner.call(m, shader, renderer);
    const fs = shader.fragmentShader;
    if (!fs.includes('uniform float uRetroScale;') || !fs.includes('uniform float uRetroStrength;')) return;
    shader.uniforms.uRetroScaleU = shader.uniforms.uRetroScale;
    shader.uniforms.uRetroStrengthU = shader.uniforms.uRetroStrength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 z3tex;\nvarying vec2 vZ3Tex;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZ3Tex = z3tex;');
    shader.fragmentShader = fs
      .replace(
        'uniform float uRetroScale;',
        'uniform float uRetroScaleU;\nvarying vec2 vZ3Tex;\n#define uRetroScale (uRetroScaleU * vZ3Tex.x)',
      )
      .replace('uniform float uRetroStrength;', 'uniform float uRetroStrengthU;\n#define uRetroStrength (uRetroStrengthU * vZ3Tex.y)');
  };
  m.customProgramCacheKey = () => `z3vtex|${innerKey}`;
  m.needsUpdate = true;
}

function surf(tex: TexName | 'none' | undefined, scale: number, strength: number): Surf {
  if (tex === 'none' || strength <= 0) return { tex: null, scale: 1, strength: 0 };
  if (!tex) return Kit.retro.grain ? GRAIN : { tex: null, scale: 1, strength: 0 };
  return { tex, scale, strength };
}

export const M = {
  /**
   * Flat Lambert, optionally retro-textured, that bakes into a shared vertex-colour
   * material. No `tex` = Kit's default grain; 'none' = clean (signs, lettering).
   */
  lam(color: number, tex?: TexName | 'none', scale = 1, strength = 1): THREE.MeshLambertMaterial {
    const s = surf(tex, scale, strength);
    const m = s.tex ? Kit.mat(color, { tex: s.tex, texScale: s.scale, texStrength: s.strength }) : Kit.mat(color, { tex: 'none' });
    if (!info.has(m)) info.set(m, { kind: 'lam', ...s });
    return m;
  },
  /**
   * Unlit glow (lamps, windows, fire, sky silhouettes) that bakes into one
   * vertex-colour glow mesh. Pass `tex` for a (subtle) unlit texture.
   */
  glow(color: number, intensity = 1, tex?: TexName, scale = 1, strength = 0.35): THREE.MeshBasicMaterial {
    if (!tex || strength <= 0) {
      const m = Kit.glow(color, intensity);
      if (!info.has(m)) info.set(m, { kind: 'glow', tex: null, scale: 1, strength: 0 });
      return m;
    }
    ensureLive();
    const key = `${color}|${intensity}|${tex}|${scale}|${strength}`;
    let m = glowTex.get(key);
    if (!m) {
      m = Kit.track(
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false, fog: false }),
      );
      Kit.applyTexture(m, tex, scale, strength);
      glowTex.set(key, m);
      info.set(m, { kind: 'glow', tex, scale, strength });
    }
    return m;
  },
};

function bakedMat(kind: 'lam' | 'glow', tex: TexName | null): THREE.Material {
  ensureLive();
  const key = `${kind}|${tex}`;
  let m = bakedMats.get(key);
  if (!m) {
    m =
      kind === 'lam'
        ? new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true })
        : new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
    if (tex) {
      Kit.applyTexture(m as THREE.MeshLambertMaterial, tex, 1, 1);
      perVertexTexture(m);
    }
    Kit.track(m);
    bakedMats.set(key, m);
  }
  return m;
}

interface Bucket {
  kind: 'lam' | 'glow' | 'other';
  tex: TexName | null;
  mat: THREE.Material | null;
  meshes: THREE.Mesh[];
  count: number;
}

const _rel = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _nm = new THREE.Matrix3();

function vertsOf(m: THREE.Mesh) {
  const g = m.geometry;
  return g.index ? g.index.count : g.attributes.position.count;
}

/**
 * Merge every static mesh under `group` (skips `userData.noMerge`, instanced
 * meshes, hidden meshes and multi-material meshes). Originals are removed;
 * merged meshes are added to `group` and returned.
 */
export function bake(group: THREE.Object3D): THREE.Mesh[] {
  group.updateMatrixWorld(true);
  _inv.copy(group.matrixWorld).invert();
  const buckets = new Map<string, Bucket>();
  const clean: { lam: THREE.Mesh[]; glow: THREE.Mesh[] } = { lam: [], glow: [] };
  const remove: THREE.Mesh[] = [];
  const bucket = (key: string, kind: Bucket['kind'], tex: TexName | null, mat: THREE.Material | null) => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { kind, tex, mat, meshes: [], count: 0 }));
    return b;
  };
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.userData.noMerge) return;
    if (!m.visible) return;
    const mat = m.material as THREE.Material;
    const bi = info.get(mat);
    remove.push(m);
    if (!bi) {
      const b = bucket(`m|${mat.uuid}`, 'other', null, mat);
      b.meshes.push(m);
      b.count += vertsOf(m);
      return;
    }
    if (!bi.tex) {
      clean[bi.kind].push(m);
      return;
    }
    const b = bucket(`${bi.kind}|${bi.tex}`, bi.kind, bi.tex, null);
    b.meshes.push(m);
    b.count += vertsOf(m);
  });
  // Clean surfaces join the biggest textured bucket of their kind (strength 0 there).
  for (const kind of ['lam', 'glow'] as const) {
    if (!clean[kind].length) continue;
    let best: Bucket | null = null;
    for (const b of buckets.values()) if (b.kind === kind && (!best || b.count > best.count)) best = b;
    if (!best) best = bucket(`${kind}|null`, kind, null, null);
    for (const m of clean[kind]) {
      best.meshes.push(m);
      best.count += vertsOf(m);
    }
  }
  for (const m of remove) m.parent?.remove(m);

  const out: THREE.Mesh[] = [];
  const col = new THREE.Color();
  for (const b of buckets.values()) {
    if (!b.count) continue;
    const managed = b.kind !== 'other';
    const pos = new Float32Array(b.count * 3);
    const nor = new Float32Array(b.count * 3);
    const cols = managed ? new Float32Array(b.count * 3) : null;
    const tex = managed && b.tex ? new Float32Array(b.count * 2) : null;
    let o = 0;
    for (const m of b.meshes) {
      _rel.multiplyMatrices(_inv, m.matrixWorld);
      _nm.getNormalMatrix(_rel);
      const e = _rel.elements;
      const ne = _nm.elements;
      const g = m.geometry;
      const P = g.attributes.position.array;
      const N = g.attributes.normal?.array;
      const C = cols ? (g.attributes.color as THREE.BufferAttribute | undefined) : undefined;
      const idx = g.index ? g.index.array : null;
      const bi = info.get(m.material as THREE.Material);
      const ts = bi?.tex ? bi.scale : 1;
      const tk = bi?.tex ? bi.strength : 0;
      if (cols) col.copy((m.material as THREE.MeshBasicMaterial).color);
      const n = idx ? idx.length : P.length / 3;
      for (let i = 0; i < n; i++) {
        const vi = idx ? idx[i] : i;
        const v = vi * 3;
        const x = P[v];
        const y = P[v + 1];
        const z = P[v + 2];
        const o3 = o * 3;
        pos[o3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[o3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[o3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (N) {
          const nx = N[v];
          const ny = N[v + 1];
          const nz = N[v + 2];
          const tx = ne[0] * nx + ne[3] * ny + ne[6] * nz;
          const ty = ne[1] * nx + ne[4] * ny + ne[7] * nz;
          const tz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
          const l = Math.hypot(tx, ty, tz) || 1;
          nor[o3] = tx / l;
          nor[o3 + 1] = ty / l;
          nor[o3 + 2] = tz / l;
        } else {
          nor[o3 + 1] = 1;
        }
        if (cols) {
          if (C) {
            cols[o3] = col.r * C.getX(vi);
            cols[o3 + 1] = col.g * C.getY(vi);
            cols[o3 + 2] = col.b * C.getZ(vi);
          } else {
            cols[o3] = col.r;
            cols[o3 + 1] = col.g;
            cols[o3 + 2] = col.b;
          }
        }
        if (tex) {
          tex[o * 2] = ts;
          tex[o * 2 + 1] = tk;
        }
        o++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (cols) geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    if (tex) geo.setAttribute('z3tex', new THREE.BufferAttribute(tex, 2));
    geo.computeBoundingSphere();
    const mat = b.kind === 'other' ? b.mat! : bakedMat(b.kind, b.tex);
    const mesh = new THREE.Mesh(Kit.track(geo), mat);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    out.push(mesh);
  }
  return out;
}

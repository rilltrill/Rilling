import * as THREE from 'three';
import { Kit, type TexName } from '../../kit/ModelKit';

/**
 * Scenery materials that remember how to bake, plus a fast colour-baking merge.
 *
 * `M.lam(colour, tex?)` is a cached Kit Lambert material; `M.glow(colour)` an
 * unlit Kit glow. `bake(group)` merges every static mesh under the group into
 * ONE mesh per texture bucket: flat colours become vertex colours of a shared
 * white material (textured buckets keep the retro detail map), and every glow
 * colour becomes one unlit vertex-coloured mesh. A 60 m stretch of interstate
 * ends up at ~6 draw calls regardless of how many cars and barriers it holds.
 */

type BakeInfo = { kind: 'lam'; tex: TexName | null; scale: number; strength: number } | { kind: 'glow' };

const info = new WeakMap<THREE.Material, BakeInfo>();

export const M = {
  /** Flat Lambert (optionally retro-textured) that bakes into a shared vertex-colour material. */
  lam(color: number, tex?: TexName, scale = 1, strength = 1): THREE.MeshLambertMaterial {
    const m = tex ? Kit.mat(color, { tex, texScale: scale, texStrength: strength }) : Kit.mat(color);
    if (!info.has(m)) info.set(m, { kind: 'lam', tex: tex ?? null, scale, strength });
    return m;
  },
  /** Unlit glow (lamps, windows, fire) that bakes into one vertex-colour glow mesh. */
  glow(color: number, intensity = 1): THREE.MeshBasicMaterial {
    const m = Kit.glow(color, intensity);
    if (!info.has(m)) info.set(m, { kind: 'glow' });
    return m;
  },
};

let glowMat: THREE.MeshBasicMaterial | null = null;
let glowLive = false;

function bakedGlow(): THREE.MeshBasicMaterial {
  if (!glowMat || !glowLive) {
    glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
    glowLive = true;
    Kit.track(glowMat);
    Kit.track({
      dispose() {
        glowLive = false;
      },
    });
  }
  return glowMat;
}

function bakedLam(i: Extract<BakeInfo, { kind: 'lam' }>): THREE.Material {
  return i.tex
    ? Kit.mat(0xffffff, { vertexColors: true, tex: i.tex, texScale: i.scale, texStrength: i.strength })
    : Kit.mat(0xffffff, { vertexColors: true });
}

interface Bucket {
  mat: THREE.Material;
  meshes: THREE.Mesh[];
  colored: boolean;
  count: number;
}

const _rel = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _nm = new THREE.Matrix3();

/**
 * Merge every static mesh under `group` (skips `userData.noMerge`, instanced
 * meshes and multi-material meshes). Originals are removed; merged meshes are
 * added to `group` and returned.
 */
export function bake(group: THREE.Object3D): THREE.Mesh[] {
  group.updateMatrixWorld(true);
  _inv.copy(group.matrixWorld).invert();
  const buckets = new Map<string, Bucket>();
  const remove: THREE.Mesh[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.userData.noMerge) return;
    if (!m.visible) return;
    const mat = m.material as THREE.Material;
    const bi = info.get(mat);
    let key: string;
    let target: THREE.Material;
    let colored = true;
    if (bi?.kind === 'lam') {
      key = `l|${bi.tex}|${bi.scale}|${bi.strength}`;
      target = bakedLam(bi);
    } else if (bi?.kind === 'glow') {
      key = 'g';
      target = bakedGlow();
    } else {
      key = `m|${mat.uuid}`;
      target = mat;
      colored = false;
    }
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: target, meshes: [], colored, count: 0 }));
    const g = m.geometry;
    b.count += g.index ? g.index.count : g.attributes.position.count;
    b.meshes.push(m);
    remove.push(m);
  });
  for (const m of remove) m.parent?.remove(m);
  const out: THREE.Mesh[] = [];
  const col = new THREE.Color();
  for (const b of buckets.values()) {
    if (!b.count) continue;
    const pos = new Float32Array(b.count * 3);
    const nor = new Float32Array(b.count * 3);
    const cols = b.colored ? new Float32Array(b.count * 3) : null;
    let o = 0;
    for (const m of b.meshes) {
      _rel.multiplyMatrices(_inv, m.matrixWorld);
      _nm.getNormalMatrix(_rel);
      const e = _rel.elements;
      const ne = _nm.elements;
      const g = m.geometry;
      const P = g.attributes.position.array;
      const N = g.attributes.normal?.array;
      const idx = g.index ? g.index.array : null;
      if (cols) col.copy((m.material as THREE.MeshBasicMaterial).color);
      const n = idx ? idx.length : P.length / 3;
      for (let i = 0; i < n; i++) {
        const v = (idx ? idx[i] : i) * 3;
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
          cols[o3] = col.r;
          cols[o3 + 1] = col.g;
          cols[o3 + 2] = col.b;
        }
        o++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (cols) geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(Kit.track(geo), b.mat);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    out.push(mesh);
  }
  return out;
}

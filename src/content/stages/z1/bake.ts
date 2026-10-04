import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from '../../kit/ModelKit';
import { EnvKit } from '../../kit/EnvKit';

/**
 * Colour-baking merge. EnvKit.mergeStatic merges per material, which still
 * leaves one draw call per colour; here every opaque flat Lambert colour is
 * baked into vertex colours of ONE shared Lambert material, and every opaque
 * glow (unlit) colour into ONE shared unlit material. Whatever is left
 * (standard/PBR, transparent, textured) is merged per material with
 * EnvKit.mergeStatic. A whole street block becomes ~3–6 draw calls.
 */

const shared = new Map<string, THREE.Material>();

function sharedMat(key: string, make: () => THREE.Material): THREE.Material {
  let m = shared.get(key);
  if (!m) {
    m = Kit.track(make());
    m.addEventListener('dispose', () => shared.delete(key));
    shared.set(key, m);
  }
  return m;
}

/** Vertex-coloured flat Lambert (fogged). */
export function bakedLambert(): THREE.Material {
  return sharedMat('lambert', () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

/** Vertex-coloured unlit glow (no fog, no tone mapping — matches Kit.glow). */
export function bakedGlow(): THREE.Material {
  return sharedMat('glow', () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
}

type Bucket = 'lambert' | 'glow' | null;

function bucketOf(m: THREE.Material): Bucket {
  if (m.transparent || m.side !== THREE.FrontSide) return null;
  if ((m as THREE.MeshLambertMaterial).isMeshLambertMaterial) {
    const l = m as THREE.MeshLambertMaterial;
    if (l.vertexColors || l.map || !l.fog || l.emissive.getHex() !== 0) return null;
    return 'lambert';
  }
  if ((m as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    const b = m as THREE.MeshBasicMaterial;
    if (b.vertexColors || b.map || b.fog || b.toneMapped) return null;
    return 'glow';
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
    const src = mesh.geometry;
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    g.applyMatrix4(_m);
    const c = (mesh.material as THREE.MeshBasicMaterial).color;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
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

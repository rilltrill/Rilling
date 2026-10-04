import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from '../../kit/ModelKit';
import { bakedLambert, texInfo } from './mats';

/**
 * Colour baker. EnvKit.mergeStatic merges per material, leaving one draw call
 * per colour. Here every opaque Lambert colour that shares a detail texture
 * (and face side) is baked into the vertex colours of ONE shared material, and
 * every opaque unlit glow colour into ONE shared unlit material. Whatever is
 * left (transparent, PBR) is merged per material. A whole room → ~4–7 draws.
 */

let glowMat: THREE.MeshBasicMaterial | null = null;

function bakedGlow(): THREE.MeshBasicMaterial {
  if (!glowMat) {
    const m = Kit.track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
    m.addEventListener('dispose', () => {
      if (glowMat === m) glowMat = null;
    });
    glowMat = m;
  }
  return glowMat;
}

interface Bucket {
  mat: THREE.Material;
  geos: THREE.BufferGeometry[];
}

function bucketKey(m: THREE.Material): { key: string; make: () => THREE.Material } | null {
  if (m.transparent) return null;
  if ((m as THREE.MeshLambertMaterial).isMeshLambertMaterial) {
    const l = m as THREE.MeshLambertMaterial;
    if (l.vertexColors || l.map || !l.fog || l.emissive.getHex() !== 0) return null;
    const info = texInfo(m);
    if (!info && m.userData.retroTex) return null;
    const key = `l|${m.side}|${info ? `${info.tex}|${info.scale}|${info.strength}` : '-'}`;
    return { key, make: () => bakedLambert(info, m.side) };
  }
  if ((m as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    const b = m as THREE.MeshBasicMaterial;
    if (b.vertexColors || b.map || b.fog || b.toneMapped || m.side !== THREE.FrontSide) return null;
    return { key: 'glow', make: bakedGlow };
  }
  return null;
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

/**
 * Bake every static mesh under `group` (skipping `userData.noMerge`). The
 * originals are removed; merged meshes are added to `group` and returned.
 */
export function bake(group: THREE.Object3D): THREE.Mesh[] {
  group.updateMatrixWorld(true);
  _inv.copy(group.matrixWorld).invert();
  const buckets = new Map<string, Bucket>();
  const remove: THREE.Mesh[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material) || mesh.userData.noMerge) return;
    // Don't descend into subtrees that opted out.
    let p: THREE.Object3D | null = mesh.parent;
    while (p && p !== group) {
      if (p.userData.noMerge) return;
      p = p.parent;
    }
    const bk = bucketKey(mesh.material);
    if (!bk) return;
    const src = mesh.geometry;
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    g.applyMatrix4(_m);
    // Mirrored transforms flip the winding — fix so FrontSide still works.
    if (_m.determinant() < 0) flipWinding(g);
    const c = (mesh.material as THREE.MeshBasicMaterial).color;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    let b = buckets.get(bk.key);
    if (!b) {
      b = { mat: bk.make(), geos: [] };
      buckets.set(bk.key, b);
    }
    b.geos.push(g);
    remove.push(mesh);
  });
  for (const m of remove) m.parent?.remove(m);
  const out: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(Kit.track(merged), b.mat);
    mesh.userData.noMerge = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    out.push(mesh);
  }
  // Everything else (transparent glass, PBR): classic per-material merge.
  out.push(...mergeRest(group));
  return out;
}

/** Per-material merge of the leftovers (respects noMerge on meshes and parents). */
function mergeRest(group: THREE.Object3D): THREE.Mesh[] {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Mesh[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.userData.noMerge) return;
    let p: THREE.Object3D | null = m.parent;
    while (p && p !== group) {
      if (p.userData.noMerge) return;
      p = p.parent;
    }
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    _m.multiplyMatrices(_inv, m.matrixWorld);
    g.applyMatrix4(_m);
    if (_m.determinant() < 0) flipWinding(g);
    const list = byMat.get(m.material) ?? [];
    list.push(g);
    byMat.set(m.material, list);
    remove.push(m);
  });
  for (const m of remove) m.parent?.remove(m);
  const out: THREE.Mesh[] = [];
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(Kit.track(merged), mat);
    mesh.userData.noMerge = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    out.push(mesh);
  }
  return out;
}

function flipWinding(g: THREE.BufferGeometry) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute | undefined;
  for (let i = 0; i < pos.count; i += 3) {
    swap(pos, i + 1, i + 2);
    if (nrm) swap(nrm, i + 1, i + 2);
  }
}

function swap(a: THREE.BufferAttribute, i: number, j: number) {
  const x = a.getX(i);
  const y = a.getY(i);
  const z = a.getZ(i);
  a.setXYZ(i, a.getX(j), a.getY(j), a.getZ(j));
  a.setXYZ(j, x, y, z);
}

/**
 * Build meshes into a temporary group, bake them, and attach the results to
 * `parent` in the same local frame (one or two draws for an animated part).
 */
export function bakeInto(parent: THREE.Object3D, build: (g: THREE.Group) => void): THREE.Mesh[] {
  const g = new THREE.Group();
  build(g);
  const meshes = bake(g);
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

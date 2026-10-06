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

interface Piece {
  g: THREE.BufferGeometry;
  /** Centre on the ground plane (group space). */
  x: number;
  z: number;
  tris: number;
}

interface Bucket {
  mat: THREE.Material;
  geos: Piece[];
}

/**
 * A baked batch spanning a whole zone is never frustum-culled, so a big batch is
 * split (at its triangle-weighted median, along its longer ground axis) into
 * chunks of ≤ CHUNK_TRIS or ≤ CHUNK_SPAN metres: a few more draws per zone, but
 * the part of a room behind the camera isn't drawn.
 */
const CHUNK_TRIS = 1200;
const CHUNK_SPAN = 8;

function chunk(items: Piece[], out: Piece[][]) {
  let tris = 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of items) {
    tris += p.tris;
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  if (items.length < 2 || tris <= CHUNK_TRIS || Math.max(x1 - x0, z1 - z0) < CHUNK_SPAN) {
    out.push(items);
    return;
  }
  const alongX = x1 - x0 >= z1 - z0;
  items.sort((a, b) => (alongX ? a.x - b.x : a.z - b.z));
  let acc = 0;
  let k = 0;
  for (; k < items.length - 2; k++) {
    acc += items[k].tris;
    if (acc >= tris / 2) break;
  }
  chunk(items.slice(0, k + 1), out);
  chunk(items.slice(k + 1), out);
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
const _s = new THREE.Vector3();
const _box = new THREE.Box3();

/**
 * Decals (papers, smears, blood, painted text) are ≤ 1.5 cm thick boxes and
 * discs: only their two broad faces can ever be seen. Returns the thin local axis
 * (0 = x, 1 = y, 2 = z) of such a plate, or -1.
 */
function thinAxis(mesh: THREE.Mesh): number {
  const t = mesh.geometry.type;
  if (t !== 'BoxGeometry' && t !== 'CylinderGeometry') return -1;
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  _box.copy(g.boundingBox!).getSize(_s);
  _s.set(Math.abs(_s.x * mesh.scale.x), Math.abs(_s.y * mesh.scale.y), Math.abs(_s.z * mesh.scale.z));
  const min = Math.min(_s.x, _s.y, _s.z);
  if (min > 0.0151) return -1;
  const axis = min === _s.x ? 0 : min === _s.y ? 1 : 2;
  // Must be a plate (both other sides much larger), not a thin stick.
  const others = [_s.x, _s.y, _s.z].filter((_, i) => i !== axis);
  return others[0] >= min * 4 && others[1] >= min * 4 ? axis : -1;
}

/**
 * Keep only the broad faces of a thin plate (non-indexed, local space). Its rim
 * is invisible at 1 cm; dropping it saves ~2/3 of a decal's triangles.
 */
function stripRim(g: THREE.BufferGeometry, axis: number): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const keepP: number[] = [];
  const keepN: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const n = axis === 0 ? nrm.getX(i) : axis === 1 ? nrm.getY(i) : nrm.getZ(i);
    if (Math.abs(n) < 0.9) continue;
    for (let k = 0; k < 3; k++) {
      keepP.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      keepN.push(nrm.getX(i + k), nrm.getY(i + k), nrm.getZ(i + k));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keepP, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3));
  g.dispose();
  return out;
}

/** After transforming: a horizontal decal only ever shows its upper face. */
function dropUnderside(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  let up = 0;
  let down = 0;
  for (let i = 0; i < nrm.count; i += 3) {
    const y = nrm.getY(i);
    if (y > 0.9) up++;
    else if (y < -0.9) down++;
  }
  // Only for plates lying flat (every face points straight up or down).
  if (up + down !== nrm.count / 3 || !up || !down) return g;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const keepP: number[] = [];
  const keepN: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    if (nrm.getY(i) < 0) continue;
    for (let k = 0; k < 3; k++) {
      keepP.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      keepN.push(nrm.getX(i + k), nrm.getY(i + k), nrm.getZ(i + k));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keepP, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3));
  g.dispose();
  return out;
}

/** Non-indexed copy of a mesh's geometry in `group` space (decal rims stripped). */
function flatten(mesh: THREE.Mesh): THREE.BufferGeometry {
  const src = mesh.geometry;
  let g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const axis = thinAxis(mesh);
  if (axis >= 0) g = stripRim(g, axis);
  _m.multiplyMatrices(_inv, mesh.matrixWorld);
  g.applyMatrix4(_m);
  // Mirrored transforms flip the winding — fix so FrontSide still works.
  if (_m.determinant() < 0) flipWinding(g);
  // Floor decals: drop the face pressed against the floor.
  if (axis >= 0 && (mesh.material as THREE.Material).side !== THREE.BackSide) g = dropUnderside(g);
  return g;
}

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
    const g = flatten(mesh);
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
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    b.geos.push({ g, x: (bb.min.x + bb.max.x) / 2, z: (bb.min.z + bb.max.z) / 2, tris: n / 3 });
    remove.push(mesh);
  });
  for (const m of remove) m.parent?.remove(m);
  const out: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    const chunks: Piece[][] = [];
    chunk(b.geos, chunks);
    for (const c of chunks) {
      const merged = mergeGeometries(
        c.map((p) => p.g),
        false,
      );
      c.forEach((p) => p.g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(Kit.track(merged), b.mat);
      mesh.userData.noMerge = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      out.push(mesh);
    }
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
    const g = flatten(m);
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

/** ART: PIXEL WORLD hook run by `bakeInto` before its bake while a stage builds (null otherwise). */
let bakeHook: ((g: THREE.Group, parent: THREE.Object3D) => void) | null = null;

/** Set (or clear) the `bakeInto` hook: only for the duration of a synchronous stage build. */
export function setBakeHook(h: ((g: THREE.Group, parent: THREE.Object3D) => void) | null) {
  bakeHook = h;
}

/**
 * Build meshes into a temporary group, bake them, and attach the results to
 * `parent` in the same local frame (one or two draws for an animated part).
 */
export function bakeInto(parent: THREE.Object3D, build: (g: THREE.Group) => void): THREE.Mesh[] {
  const g = new THREE.Group();
  build(g);
  // ART: PIXEL WORLD re-paints the set piece first (its batch joins `parent`); the bake keeps the rest.
  bakeHook?.(g, parent);
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

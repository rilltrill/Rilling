import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit, type TexName } from '../../kit/ModelKit';
import { Destructible } from '../../../gameplay/Props';
import type { World } from '../../../gameplay/World';
import type { Rng } from '../../../core/Rng';
import { COL, type Flora } from './flora';

/**
 * Hero props for JUNGLE RUN. Builders return groups in a local frame where
 * +X = right of the rail, +Y = up, -Z = forward along the rail (the same as
 * rig space) so they can be dropped at `EnvKit.frameAt(curve, d)` with
 * `rotation.y = frame.heading`.
 */

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

/** Bake every mesh under `group` into ONE geometry (position + normal only). Tracked for disposal. */
export function bake(group: THREE.Object3D): THREE.BufferGeometry {
  group.updateMatrixWorld(true);
  _inv.copy(group.matrixWorld).invert();
  const geos: THREE.BufferGeometry[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    _m.multiplyMatrices(_inv, m.matrixWorld);
    g.applyMatrix4(_m);
    geos.push(g);
  });
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  return Kit.track(merged);
}

const _col = new THREE.Color();
const _em = new THREE.Color();
const _nm = new THREE.Matrix3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

interface MergeItem {
  mesh: THREE.Mesh;
  r: number;
  g: number;
  b: number;
  count: number;
}

/**
 * Merge every opaque lit mesh under `g` into ONE vertex-coloured mesh (the
 * material colour — plus a share of its emissive — is baked into the vertices),
 * so a whole chunk of scenery costs a single draw call no matter how many
 * colours it uses. Unlit glow meshes and transparent meshes are left alone.
 * An optional `userData.tint` on any ancestor multiplies the colour (cheap
 * per-object variation). Returns the group.
 *
 * Vertices are transformed straight into preallocated arrays (no per-mesh
 * geometry clones), which keeps the stage's scenery bake fast on phones.
 */
export function merged<T extends THREE.Object3D>(g: T): T {
  g.updateMatrixWorld(true);
  _inv.copy(g.matrixWorld).invert();
  // Meshes grouped by retro texture (Kit.mat `tex`), so textured parts keep their look.
  const groups = new Map<string, { items: MergeItem[]; verts: number }>();
  const remove: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D, tint: number) => {
    const t = tint * ((o.userData.tint as number | undefined) ?? 1);
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.noMerge && !Array.isArray(m.material) && m.geometry.attributes.normal) {
      const mat = m.material as THREE.MeshLambertMaterial;
      if ((mat.isMeshLambertMaterial || (mat as unknown as THREE.MeshStandardMaterial).isMeshStandardMaterial) && !mat.transparent) {
        const geo = m.geometry;
        const count = geo.index ? geo.index.count : geo.attributes.position.count;
        _col.copy(mat.color).multiplyScalar(t);
        if (mat.emissive) _col.add(_em.copy(mat.emissive).multiplyScalar(mat.emissiveIntensity * 0.8));
        const key = (mat.userData.retroTex as string | undefined) ?? '';
        let grp = groups.get(key);
        if (!grp) groups.set(key, (grp = { items: [], verts: 0 }));
        grp.items.push({ mesh: m, r: _col.r, g: _col.g, b: _col.b, count });
        grp.verts += count;
        remove.push(m);
      }
    }
    for (const c of o.children) visit(c, t);
  };
  visit(g, 1);
  if (!groups.size) return g;
  const built: THREE.Mesh[] = [];
  for (const [tex, grp] of groups) {
    const pos = new Float32Array(grp.verts * 3);
    const nor = new Float32Array(grp.verts * 3);
    const col = new Float32Array(grp.verts * 3);
    let o = 0;
    for (const it of grp.items) {
      const geo = it.mesh.geometry;
      const pa = geo.attributes.position;
      const na = geo.attributes.normal;
      const idx = geo.index;
      _m.multiplyMatrices(_inv, it.mesh.matrixWorld);
      _nm.getNormalMatrix(_m);
      for (let i = 0; i < it.count; i++) {
        const vi = idx ? idx.getX(i) : i;
        _p.fromBufferAttribute(pa, vi).applyMatrix4(_m);
        _n.fromBufferAttribute(na, vi).applyNormalMatrix(_nm);
        pos[o] = _p.x;
        pos[o + 1] = _p.y;
        pos[o + 2] = _p.z;
        nor[o] = _n.x;
        nor[o + 1] = _n.y;
        nor[o + 2] = _n.z;
        col[o] = it.r;
        col[o + 1] = it.g;
        col[o + 2] = it.b;
        o += 3;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const mat =
      tex === '' || tex === 'grain'
        ? Kit.mat(0xffffff, { vertexColors: true })
        : Kit.mat(0xffffff, { vertexColors: true, tex: tex as TexName });
    const mesh = new THREE.Mesh(Kit.track(geo), mat);
    mesh.matrixAutoUpdate = false;
    built.push(mesh);
  }
  for (const m of remove) m.parent?.remove(m);
  // Hoist the meshes we couldn't merge (glows, transparent) and drop the empty
  // pivot groups so they don't cost a matrix update every frame.
  const keep: THREE.Object3D[] = [];
  g.traverse((x) => {
    if (x !== g && (x as THREE.Mesh).isMesh) keep.push(x);
  });
  for (const x of keep) g.attach(x);
  for (const c of [...g.children]) if (!(c as THREE.Mesh).isMesh) g.remove(c);
  for (const mesh of built) g.add(mesh);
  return g;
}

/** Like `merged` but returns every mesh left under `g` (the baked mesh(es) plus any unmerged glows). */
export function mergedMeshes(g: THREE.Object3D): THREE.Mesh[] {
  merged(g);
  return g.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);
}

// ─── Park gate ───────────────────────────────────────────────────────────────

export interface GateParts {
  root: THREE.Group;
  doorL: THREE.Group;
  doorR: THREE.Group;
  flames: THREE.Mesh[];
  pillars: THREE.Group;
}

export function buildGate(): GateParts {
  const root = new THREE.Group();
  const wood = Kit.mat(0x6e4e30);
  const woodDark = Kit.mat(0x4a3220);
  const iron = Kit.mat(0x2c2a28);
  const pillars = new THREE.Group();
  root.add(pillars);
  const W = 4.4;
  for (const side of [-1, 1]) {
    const x = side * (W + 0.75);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const h = 10 + i * 0.4;
      Kit.add(pillars, Kit.cyl(0.42, 0.48, h, 7), i === 1 ? woodDark : wood, x + Math.cos(a) * 0.42, h / 2, Math.sin(a) * 0.42);
      Kit.add(pillars, Kit.cone(0.44, 0.9, 7), woodDark, x + Math.cos(a) * 0.42, h + 0.45, Math.sin(a) * 0.42);
    }
    for (const y of [1.2, 4.5, 8.4]) Kit.add(pillars, Kit.cyl(1.0, 1.0, 0.28, 8), iron, x, y, 0);
    // Torch bracket + basket facing the road.
    Kit.add(pillars, Kit.box(0.12, 0.12, 0.9), iron, x - side * 0.2, 5.6, 1.0);
    Kit.add(pillars, Kit.cyl(0.32, 0.18, 0.45, 7), iron, x - side * 0.2, 5.85, 1.45);
  }
  // Cross beams + roof + sign.
  Kit.add(pillars, Kit.cyl(0.42, 0.42, 2 * W + 4, 8), wood, 0, 8.9, 0.1, 0, 0, Math.PI / 2);
  Kit.add(pillars, Kit.cyl(0.36, 0.36, 2 * W + 3, 8), woodDark, 0, 9.7, -0.1, 0, 0, Math.PI / 2);
  Kit.add(pillars, Kit.box(2 * W + 4.5, 0.25, 2.4), woodDark, 0, 10.35, 0, 0, 0, 0);
  // Hanging sign board with the park emblem (red disc + dino skull silhouette).
  Kit.add(pillars, Kit.box(6.2, 1.9, 0.25), Kit.mat(0x3e2a1a), 0, 7.4, 0.55);
  Kit.add(pillars, Kit.box(6.5, 0.18, 0.3), wood, 0, 8.4, 0.55);
  Kit.add(pillars, Kit.box(6.5, 0.18, 0.3), wood, 0, 6.42, 0.55);
  for (const sx of [-2.7, 2.7]) Kit.add(pillars, Kit.box(0.12, 0.6, 0.12), iron, sx, 8.6, 0.55);
  const emblem = Kit.mat(0xd8401c, { emissive: 0x501008, emissiveIntensity: 0.5 });
  Kit.add(pillars, Kit.cyl(0.85, 0.85, 0.12, 14), emblem, 0, 7.4, 0.72, Math.PI / 2, 0, 0);
  Kit.add(pillars, Kit.cyl(0.95, 0.95, 0.1, 14), Kit.mat(0xf0c040), 0, 7.4, 0.68, Math.PI / 2, 0, 0);
  const black = Kit.mat(0x161210);
  Kit.add(pillars, Kit.box(0.7, 0.42, 0.06), black, -0.05, 7.55, 0.8, 0, 0, -0.15);
  Kit.add(pillars, Kit.box(0.5, 0.14, 0.06), black, 0.05, 7.2, 0.8, 0, 0, 0.15);
  Kit.add(pillars, Kit.box(0.12, 0.12, 0.07), Kit.mat(0xf0c040), -0.18, 7.62, 0.83);
  // "Lettering" plaques either side of the emblem.
  const gold = Kit.mat(0xe0b040);
  for (let i = 0; i < 4; i++) {
    Kit.add(pillars, Kit.box(0.42, 0.62, 0.05), gold, -2.6 + i * 0.5, 7.4, 0.7);
    Kit.add(pillars, Kit.box(0.42, 0.62, 0.05), gold, 1.1 + i * 0.5, 7.4, 0.7);
  }
  merged(pillars);

  // Doors: hinged at the inner pillar faces, swing forward (away from the jeep).
  const mkDoor = (side: 1 | -1) => {
    const hinge = new THREE.Group();
    hinge.position.set(side * W, 0, 0);
    const leaf = new THREE.Group();
    hinge.add(leaf);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = -side * (0.28 + i * 0.52);
      const h = 7.2 + (i % 2) * 0.25;
      Kit.add(leaf, Kit.box(0.5, h, 0.22), i % 3 === 1 ? woodDark : wood, x, h / 2 + 0.15, 0);
      Kit.add(leaf, Kit.cone(0.26, 0.5, 4), woodDark, x, h + 0.4, 0, 0, Math.PI / 4, 0);
    }
    for (const y of [1.3, 3.9, 6.4]) Kit.add(leaf, Kit.box(4.2, 0.4, 0.18), woodDark, -side * 2.1, y, 0.18);
    const diag = Kit.add(leaf, Kit.box(0.35, 5.6, 0.16), woodDark, -side * 2.1, 3.85, 0.2);
    diag.rotation.z = side * 0.62;
    for (const y of [1.3, 6.4]) Kit.add(leaf, Kit.box(0.5, 0.55, 0.3), iron, -side * 0.3, y, 0.05);
    merged(leaf);
    root.add(hinge);
    return hinge;
  };
  const doorL = mkDoor(-1);
  const doorR = mkDoor(1);

  // Palisade walls of sharpened logs.
  const wall = new THREE.Group();
  for (const side of [-1, 1]) {
    for (let x = W + 1.8; x < 34; x += 0.66) {
      const h = 5.2 + ((x * 7.3) % 1) * 0.9;
      Kit.add(wall, Kit.cyl(0.3, 0.32, h, 6), x % 2 < 1 ? wood : woodDark, side * x, h / 2, 0);
      Kit.add(wall, Kit.cone(0.3, 0.7, 6), woodDark, side * x, h + 0.35, 0);
    }
    for (const y of [1.4, 3.8]) Kit.add(wall, Kit.box(34 - W - 1.5, 0.3, 0.2), woodDark, side * (W + 1.5 + (34 - W - 1.5) / 2), y, 0.36);
  }
  merged(wall);
  root.add(wall);

  // Torch flames (animated).
  const flames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const x = side * (W + 0.75) - side * 0.2;
    const outer = Kit.add(root, Kit.cone(0.3, 1.0, 6), Kit.glow(0xff7a1a, 1.6), x, 6.45, 1.45);
    const inner = Kit.add(root, Kit.cone(0.17, 0.65, 6), Kit.glow(0xffe08a, 1.8), x, 6.3, 1.5);
    flames.push(outer, inner);
  }
  return { root, doorL, doorR, flames, pillars };
}

// ─── Electric fence ──────────────────────────────────────────────────────────

const WIRE_Y = [0.9, 1.7, 2.5, 3.3, 4.1];

/** One fence span from post a to post b (world points on the ground). */
export function fenceSpan(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, sag = 0.06) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const wire = Kit.mat(0x9aa0a4);
  for (const y of WIRE_Y) {
    const m = Kit.add(parent, Kit.box(0.05, 0.05, len), wire, (a.x + b.x) / 2, y - sag, (a.z + b.z) / 2);
    m.rotation.y = yaw;
  }
}

export function fencePost(parent: THREE.Object3D, p: THREE.Vector3, yaw: number, tilt = 0) {
  const g = new THREE.Group();
  g.position.copy(p);
  g.rotation.set(0, yaw, 0);
  const post = new THREE.Group();
  post.rotation.z = tilt;
  g.add(post);
  Kit.add(post, Kit.box(0.38, 4.8, 0.38), Kit.mat(0x9a968c), 0, 2.4, 0);
  Kit.add(post, Kit.box(0.5, 0.25, 0.5), Kit.mat(0x7a766c), 0, 4.85, 0);
  const ins = Kit.mat(0x2a2a2a);
  for (const y of WIRE_Y) Kit.add(post, Kit.box(0.5, 0.1, 0.14), ins, 0, y, 0);
  // Warning beacon cap.
  Kit.add(post, Kit.box(0.2, 0.16, 0.2), Kit.mat(0xd8a020), 0, 5.05, 0);
  parent.add(g);
  return g;
}

/** High-voltage warning sign (yellow board, black bolt, red band), facing local +Z. */
export function warningSign(parent: THREE.Object3D, x: number, y: number, z: number, yaw: number, tilt = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(0, yaw, tilt);
  Kit.add(g, Kit.box(1.1, 0.9, 0.06), Kit.mat(0xf2c21a, { emissive: 0x3a2a00, emissiveIntensity: 0.5 }), 0, 0, 0);
  Kit.add(g, Kit.box(1.1, 0.2, 0.07), Kit.mat(0xc8201a), 0, 0.36, 0.005);
  const blk = Kit.mat(0x141414);
  Kit.add(g, Kit.box(0.12, 0.34, 0.08), blk, 0.05, 0.05, 0.01, 0, 0, -0.5);
  Kit.add(g, Kit.box(0.2, 0.08, 0.08), blk, 0.0, -0.08, 0.01);
  Kit.add(g, Kit.box(0.12, 0.3, 0.08), blk, -0.05, -0.2, 0.01, 0, 0, -0.5);
  parent.add(g);
  return g;
}

// ─── Fallen tree ─────────────────────────────────────────────────────────────

export interface FallenTree {
  root: THREE.Group;
  /** Root-ball half (left of the road). */
  left: THREE.Group;
  /** Crown half (right of the road). */
  right: THREE.Group;
}

export function buildFallenTree(flora: Flora, rng: Rng): FallenTree {
  const root = new THREE.Group();
  const bark = Kit.mat(COL.trunk);
  const barkDark = Kit.mat(0x46362a);
  const moss = Kit.mat(COL.moss);
  const wood = Kit.mat(0xb08a5a);
  const left = new THREE.Group();
  const right = new THREE.Group();
  left.position.set(1.0, 0, 0);
  right.position.set(1.0, 0, 0);
  root.add(left, right);
  // Left half: trunk running to the root ball at x ≈ -9 (local to the split at x = 1).
  Kit.add(left, Kit.cyl(0.95, 1.15, 10, 9), bark, -5, 1.0, 0, 0, 0, Math.PI / 2);
  Kit.add(left, Kit.cyl(0.98, 0.98, 2.2, 9), moss, -3.5, 1.08, 0, 0, 0, Math.PI / 2);
  Kit.add(left, Kit.cyl(0.95, 0.95, 0.3, 9), wood, -0.1, 1.0, 0, 0, 0, Math.PI / 2);
  Kit.add(left, flora.blob(rng), barkDark, -10.2, 1.6, 0, 0, 0.4, 0, 1.4, 2.2, 2.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = Kit.add(left, Kit.cone(0.28, 2.6, 5), barkDark, -10.6, 1.6 + Math.sin(a) * 1.6, Math.cos(a) * 1.6);
    r.rotation.set(Math.cos(a) * 1.2, 0, -Math.PI / 2 + Math.sin(a) * 0.9);
  }
  Kit.add(left, flora.blob(rng), Kit.mat(0x5a4632), -10.4, 0.5, 0, 0, 0, 0, 1.8, 0.8, 2.2);
  // Right half: trunk to a broken crown at x ≈ +9.
  Kit.add(right, Kit.cyl(0.8, 0.95, 9, 9), bark, 4.5, 0.95, 0, 0, 0, Math.PI / 2);
  Kit.add(right, Kit.cyl(0.95, 0.95, 0.3, 9), wood, 0.1, 0.98, 0, 0, 0, Math.PI / 2);
  Kit.add(right, Kit.cyl(0.84, 0.84, 1.6, 9), moss, 3.2, 1.0, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group();
    b.position.set(7 + i * 0.9, 1.2, rng.spread(1));
    b.rotation.set(rng.spread(1.2), rng.next() * 6, 0.6 + rng.spread(0.5));
    right.add(b);
    Kit.add(b, Kit.cyl(0.14, 0.25, 3.2, 5), bark, 0, 1.6, 0);
    const s = rng.range(1.6, 2.4);
    Kit.add(b, flora.blob(rng), Kit.mat(rng.chance(0.5) ? 0x5f7f2a : COL.canopyA), 0, 3.2, 0, 0, 0, 0, s, s * 0.7, s);
  }
  merged(left);
  merged(right);
  return { root, left, right };
}

// ─── Tour vehicle ────────────────────────────────────────────────────────────

/** Park tour SUV (upright, facing +Z, wheels on y = 0). Caller rolls it over. */
export function buildTourCar(): THREE.Group {
  const g = new THREE.Group();
  const white = Kit.mat(0xe8e2d4);
  const red = Kit.mat(0xc8321e);
  const dark = Kit.mat(0x22262a);
  const glass = Kit.mat(0x40586a, { emissive: 0x0a1a24, emissiveIntensity: 0.4 });
  Kit.add(g, Kit.box(2.0, 1.0, 4.6), white, 0, 1.05, 0);
  Kit.add(g, Kit.box(2.02, 0.3, 4.62), red, 0, 1.0, 0);
  Kit.add(g, Kit.box(1.9, 0.85, 2.9), white, 0, 1.95, -0.4);
  Kit.add(g, Kit.box(1.94, 0.55, 2.7), glass, 0, 1.98, -0.4);
  Kit.add(g, Kit.box(1.7, 0.55, 0.06), glass, 0, 1.95, 1.07, -0.35, 0, 0);
  Kit.add(g, Kit.box(1.6, 0.12, 2.2), dark, 0, 2.45, -0.4);
  Kit.add(g, Kit.box(2.1, 0.3, 0.25), dark, 0, 0.7, 2.35);
  Kit.add(g, Kit.box(0.3, 0.2, 0.06), Kit.glow(0xfff2c0, 1.2), 0.7, 1.15, 2.31);
  Kit.add(g, Kit.box(0.3, 0.2, 0.06), Kit.mat(0x6a6a5a), -0.7, 1.15, 2.31);
  // Park emblem on the door.
  Kit.add(g, Kit.cyl(0.38, 0.38, 0.04, 12), Kit.mat(0xd8401c), 1.02, 1.25, 0.4, 0, 0, Math.PI / 2);
  Kit.add(g, Kit.cyl(0.38, 0.38, 0.04, 12), Kit.mat(0xd8401c), -1.02, 1.25, 0.4, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (const sz of [-1.45, 1.45]) {
      Kit.add(g, Kit.cyl(0.44, 0.44, 0.32, 10), dark, sx * 1.0, 0.44, sz, 0, 0, Math.PI / 2);
      Kit.add(g, Kit.cyl(0.2, 0.2, 0.34, 8), Kit.mat(0x9a9a9a), sx * 1.0, 0.44, sz, 0, 0, Math.PI / 2);
    }
  }
  Kit.add(g, Kit.cyl(0.42, 0.42, 0.28, 10), dark, 0, 1.2, -2.42, Math.PI / 2, 0, 0);
  // Scratches / dents.
  Kit.add(g, Kit.box(0.04, 0.5, 1.2), Kit.mat(0x6a2a1a), 1.01, 1.1, -0.9, 0.4, 0, 0);
  return merged(g);
}

// ─── Fuel drums (shootable set-piece trigger) ───────────────────────────────

export function fuelDrum(world: World, pos: THREE.Vector3, onDestroy?: (w: World) => void): Destructible {
  const g = new THREE.Group();
  Kit.add(g, Kit.cyl(0.36, 0.36, 1.0, 10), Kit.mat(0xc22a1e), 0, 0.5, 0);
  Kit.add(g, Kit.cyl(0.37, 0.37, 0.07, 10), Kit.mat(0x5a120e), 0, 0.22, 0);
  Kit.add(g, Kit.cyl(0.37, 0.37, 0.07, 10), Kit.mat(0x5a120e), 0, 0.78, 0);
  Kit.add(g, Kit.box(0.34, 0.26, 0.04), Kit.glow(0xffd23a, 1), 0, 0.52, 0.36);
  Kit.add(g, Kit.box(0.04, 0.26, 0.34), Kit.glow(0xffd23a, 1), 0.36, 0.52, 0);
  return new Destructible(world, { model: g, pos, hp: 1, points: 200, explode: { radius: 5.5, damage: 9 }, onDestroy });
}

// ─── Misc ────────────────────────────────────────────────────────────────────

/** Wooden park signpost with arrow boards. */
export function signpost(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const wood = Kit.mat(0x7a5a38);
  Kit.add(g, Kit.box(0.16, 2.6, 0.16), wood, 0, 1.3, 0);
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const dir = rng.chance(0.5) ? 1 : -1;
    Kit.add(g, Kit.box(1.3, 0.3, 0.06), Kit.mat(i === 0 ? 0x2f5a2a : 0x6a4a2a), dir * 0.55, 2.2 - i * 0.42, 0.08);
    Kit.add(g, Kit.cone(0.2, 0.3, 3), Kit.mat(0xe8d8a0), dir * 1.25, 2.2 - i * 0.42, 0.1, 0, 0, -dir * Math.PI / 2);
  }
  return g;
}

/** Road-closed barricade + landslide at the end of the road. */
export function buildBarricade(flora: Flora, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const red = Kit.mat(0xc8281e);
  const white = Kit.mat(0xeeeeee);
  for (let i = 0; i < 6; i++) {
    Kit.add(g, Kit.box(0.9, 0.35, 0.1), i % 2 ? red : white, -2.25 + i * 0.9, 1.25, 0);
    Kit.add(g, Kit.box(0.9, 0.35, 0.1), i % 2 ? white : red, -2.25 + i * 0.9, 0.7, 0);
  }
  for (const x of [-2.6, 2.6]) Kit.add(g, Kit.box(0.14, 1.6, 0.14), Kit.mat(0x5a4a3a), x, 0.8, 0);
  Kit.add(g, Kit.cyl(0.12, 0.12, 0.2, 8), Kit.glow(0xff9a2a, 1.4), -2.6, 1.7, 0);
  Kit.add(g, Kit.cyl(0.12, 0.12, 0.2, 8), Kit.glow(0xff9a2a, 1.4), 2.6, 1.7, 0);
  for (let i = 0; i < 14; i++) {
    const s = rng.range(1.2, 3.2);
    Kit.add(g, flora.rockGeo(rng), Kit.mat(rng.chance(0.5) ? COL.rock : COL.rockDark), rng.spread(9), s * 0.4, -4 - rng.range(0, 6), 0, rng.next() * 6, 0, s, s * 0.8, s);
  }
  return g;
}

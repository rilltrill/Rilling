import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from '../../kit/ModelKit';
import { Destructible } from '../../../gameplay/Props';
import type { World } from '../../../gameplay/World';
import type { Rng } from '../../../core/Rng';
import { COL, type Flora } from './flora';
import { bakedMaterial, specAttr, specOf, tm } from './retro';

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
const _p = new THREE.Vector3();
const _spec: [number, number, number, number] = [0, 1, 0, 1];

interface MergeItem {
  mesh: THREE.Mesh;
  r: number;
  g: number;
  b: number;
  /** Packed texture spec bytes: layer, density, strength, gain (see retro.ts specAttr). */
  t: [number, number, number, number];
  count: number;
}

/**
 * Merge every opaque lit mesh under `g` into ONE vertex-coloured mesh (the
 * material colour — plus a share of its emissive — is baked into the vertices),
 * so a whole chunk of scenery costs a single draw call no matter how many
 * colours it uses. Each part's retro texture (from `tm()` / Kit.mat) is baked
 * per vertex too, so bark, leaves, rock and dirt still share that one draw
 * call (see retro.ts). Unlit glow meshes and transparent meshes are left alone.
 * An optional `userData.tint` on any ancestor multiplies the colour (cheap
 * per-object variation). Returns the group.
 *
 * Vertices are transformed straight into preallocated arrays (no per-mesh
 * geometry clones), which keeps the stage's scenery bake fast on phones.
 */
export function merged<T extends THREE.Object3D>(g: T): T {
  g.updateMatrixWorld(true);
  _inv.copy(g.matrixWorld).invert();
  const items: MergeItem[] = [];
  let verts = 0;
  const remove: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D, tint: number) => {
    const t = tint * ((o.userData.tint as number | undefined) ?? 1);
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.noMerge && !Array.isArray(m.material) && m.geometry.attributes.normal) {
      const mat = m.material as THREE.MeshLambertMaterial;
      const lit = mat.isMeshLambertMaterial || (mat as unknown as THREE.MeshStandardMaterial).isMeshStandardMaterial;
      if (lit && !mat.transparent && !mat.vertexColors) {
        const geo = m.geometry;
        const count = geo.index ? geo.index.count : geo.attributes.position.count;
        _col.copy(mat.color).multiplyScalar(t);
        if (mat.emissive) _col.add(_em.copy(mat.emissive).multiplyScalar(mat.emissiveIntensity * 0.8));
        const spec = specAttr(specOf(mat), _spec);
        items.push({ mesh: m, r: _col.r, g: _col.g, b: _col.b, t: [spec[0], spec[1], spec[2], spec[3]], count });
        verts += count;
        remove.push(m);
      }
    }
    for (const c of o.children) visit(c, t);
  };
  visit(g, 1);
  if (!items.length) return g;
  // No normal attribute: bakedMaterial() is flat-shaded (facet normals from
  // screen derivatives) and shadows are off, so normals would be dead weight.
  const pos = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  const tex = new Uint8Array(verts * 4);
  let o = 0;
  let q = 0;
  for (const it of items) {
    const geo = it.mesh.geometry;
    const pa = geo.attributes.position;
    const idx = geo.index;
    _m.multiplyMatrices(_inv, it.mesh.matrixWorld);
    for (let i = 0; i < it.count; i++) {
      const vi = idx ? idx.getX(i) : i;
      _p.fromBufferAttribute(pa, vi).applyMatrix4(_m);
      pos[o] = _p.x;
      pos[o + 1] = _p.y;
      pos[o + 2] = _p.z;
      col[o] = it.r;
      col[o + 1] = it.g;
      col[o + 2] = it.b;
      tex[q] = it.t[0];
      tex[q + 1] = it.t[1];
      tex[q + 2] = it.t[2];
      tex[q + 3] = it.t[3];
      o += 3;
      q += 4;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // Packed texture spec (4 bytes per vertex; decoded by bakedMaterial()).
  geo.setAttribute('retroA', new THREE.BufferAttribute(tex, 4, false));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(Kit.track(geo), bakedMaterial());
  mesh.matrixAutoUpdate = false;
  for (const m of remove) m.parent?.remove(m);
  // Hoist the meshes we couldn't merge (glows, transparent) and drop the empty
  // pivot groups so they don't cost a matrix update every frame.
  const keep: THREE.Object3D[] = [];
  g.traverse((x) => {
    if (x !== g && (x as THREE.Mesh).isMesh) keep.push(x);
  });
  for (const x of keep) g.attach(x);
  for (const c of [...g.children]) if (!(c as THREE.Mesh).isMesh) g.remove(c);
  g.add(mesh);
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
  // Round logs carry bark, sawn timber carries planks, ironwork is riveted metal.
  const log = tm(0x7a5434, 'bark', 0.9);
  const logDark = tm(0x54361f, 'bark', 0.9);
  const wood = tm(0x765032, 'planks', 0.9);
  const woodDark = tm(0x4e331e, 'planks', 0.9);
  const iron = tm(0x3a3633, 'metal', 1.6, 0.9);
  const pillars = new THREE.Group();
  root.add(pillars);
  const W = 4.4;
  for (const side of [-1, 1]) {
    const x = side * (W + 0.75);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const h = 10 + i * 0.4;
      Kit.add(pillars, Kit.cyl(0.42, 0.48, h, 7), i === 1 ? logDark : log, x + Math.cos(a) * 0.42, h / 2, Math.sin(a) * 0.42);
      Kit.add(pillars, Kit.cone(0.44, 0.9, 7), logDark, x + Math.cos(a) * 0.42, h + 0.45, Math.sin(a) * 0.42);
    }
    for (const y of [1.2, 4.5, 8.4]) Kit.add(pillars, Kit.cyl(1.0, 1.0, 0.28, 8), iron, x, y, 0);
    // Torch bracket + basket facing the road.
    Kit.add(pillars, Kit.box(0.12, 0.12, 0.9), iron, x - side * 0.2, 5.6, 1.0);
    Kit.add(pillars, Kit.cyl(0.32, 0.18, 0.45, 7), iron, x - side * 0.2, 5.85, 1.45);
  }
  // Cross beams + roof + sign.
  Kit.add(pillars, Kit.cyl(0.42, 0.42, 2 * W + 4, 8), log, 0, 8.9, 0.1, 0, 0, Math.PI / 2);
  Kit.add(pillars, Kit.cyl(0.36, 0.36, 2 * W + 3, 8), logDark, 0, 9.7, -0.1, 0, 0, Math.PI / 2);
  Kit.add(pillars, Kit.box(2 * W + 4.5, 0.25, 2.4), woodDark, 0, 10.35, 0, 0, 0, 0);
  // Hanging sign board with the park emblem (red disc + dino skull silhouette).
  Kit.add(pillars, Kit.box(6.2, 1.9, 0.25), tm(0x46301c, 'planks', 1), 0, 7.4, 0.55);
  Kit.add(pillars, Kit.box(6.5, 0.18, 0.3), wood, 0, 8.4, 0.55);
  Kit.add(pillars, Kit.box(6.5, 0.18, 0.3), wood, 0, 6.42, 0.55);
  for (const sx of [-2.7, 2.7]) Kit.add(pillars, Kit.box(0.12, 0.6, 0.12), iron, sx, 8.6, 0.55);
  // Park emblem + lettering stay clean (signage reads crisply through the CRT pass).
  const emblem = tm(0xe0401a, 'none', 1, 1, { emissive: 0x501008, emissiveIntensity: 0.5 });
  Kit.add(pillars, Kit.cyl(0.85, 0.85, 0.12, 14), emblem, 0, 7.4, 0.72, Math.PI / 2, 0, 0);
  Kit.add(pillars, Kit.cyl(0.95, 0.95, 0.1, 14), tm(0xf4c43a, 'none'), 0, 7.4, 0.68, Math.PI / 2, 0, 0);
  const black = tm(0x161210, 'none');
  Kit.add(pillars, Kit.box(0.7, 0.42, 0.06), black, -0.05, 7.55, 0.8, 0, 0, -0.15);
  Kit.add(pillars, Kit.box(0.5, 0.14, 0.06), black, 0.05, 7.2, 0.8, 0, 0, 0.15);
  Kit.add(pillars, Kit.box(0.12, 0.12, 0.07), tm(0xf4c43a, 'none'), -0.18, 7.62, 0.83);
  // "Lettering" plaques either side of the emblem.
  const gold = tm(0xe8b83a, 'grain', 2, 0.5);
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
      Kit.add(wall, Kit.cyl(0.3, 0.32, h, 6), x % 2 < 1 ? log : logDark, side * x, h / 2, 0);
      Kit.add(wall, Kit.cone(0.3, 0.7, 6), logDark, side * x, h + 0.35, 0);
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
  const wire = tm(0xa8aeb2, 'none');
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
  // Galvanised steel post with a yellow/black hazard collar at the foot.
  Kit.add(post, Kit.box(0.38, 4.8, 0.38), tm(0x9a9a92, 'metal', 1.4, 0.9), 0, 2.4, 0);
  Kit.add(post, Kit.box(0.5, 0.25, 0.5), tm(0x6e6c66, 'metal', 1.6), 0, 4.85, 0);
  Kit.add(post, Kit.box(0.42, 0.62, 0.42), tm(0xf2c21a, 'hazard', 1.6), 0, 0.31, 0);
  const ins = tm(0x2a2a2a, 'none');
  for (const y of WIRE_Y) Kit.add(post, Kit.box(0.5, 0.1, 0.14), ins, 0, y, 0);
  // Warning beacon cap.
  Kit.add(post, Kit.box(0.2, 0.16, 0.2), tm(0xe8a81c, 'none', 1, 1, { emissive: 0x3a2000, emissiveIntensity: 0.6 }), 0, 5.05, 0);
  parent.add(g);
  return g;
}

/** High-voltage warning sign (yellow board, black bolt, red band), facing local +Z. */
export function warningSign(parent: THREE.Object3D, x: number, y: number, z: number, yaw: number, tilt = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(0, yaw, tilt);
  Kit.add(g, Kit.box(1.1, 0.9, 0.06), tm(0xf6c81c, 'grain', 1.5, 0.35, { emissive: 0x3a2a00, emissiveIntensity: 0.5 }), 0, 0, 0);
  Kit.add(g, Kit.box(1.1, 0.2, 0.07), tm(0xd0201a, 'none'), 0, 0.36, 0.005);
  // Hazard-striped foot of the board.
  Kit.add(g, Kit.box(1.1, 0.16, 0.07), tm(0xf6c81c, 'hazard', 2.4), 0, -0.37, 0.005);
  const blk = tm(0x141414, 'none');
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
  /** The crown's leaf masses (ART: 3D; a child of `right`, merged on its own so ART: SPRITES can hide it). */
  crown3D: THREE.Group;
  /** Leaf masses for the ART: SPRITES billboards: centre (local to `right`), width and height (m). */
  crownSpots: { x: number; y: number; z: number; w: number; h: number }[];
  /** The root ball + roots (ART: 3D; a child of `left`, merged on its own) and its billboard foot / size (local to `left`). */
  roots3D: THREE.Group;
  rootSpot: { x: number; y: number; z: number; w: number; h: number };
}

export function buildFallenTree(flora: Flora, rng: Rng): FallenTree {
  const root = new THREE.Group();
  const bark = tm(COL.trunk, 'bark', 0.75);
  const barkDark = tm(0x4a382a, 'bark', 0.75);
  const roots = tm(0x5a4632, 'dirt', 1);
  const moss = tm(COL.moss, 'grass', 1.2, 0.9);
  const wood = tm(0xc0965e, 'planks', 1.6, 0.6);
  const left = new THREE.Group();
  const right = new THREE.Group();
  left.position.set(1.0, 0, 0);
  right.position.set(1.0, 0, 0);
  root.add(left, right);
  // Left half: trunk running to the root ball at x ≈ -9 (local to the split at x = 1).
  Kit.add(left, Kit.cyl(0.95, 1.15, 10, 9), bark, -5, 1.0, 0, 0, 0, Math.PI / 2);
  Kit.add(left, Kit.cyl(0.98, 0.98, 2.2, 9), moss, -3.5, 1.08, 0, 0, 0, Math.PI / 2);
  Kit.add(left, Kit.cyl(0.95, 0.95, 0.3, 9), wood, -0.1, 1.0, 0, 0, 0, Math.PI / 2);
  // (Root ball + roots in a group of their own, local to `left`: the same meshes.)
  const roots3D = new THREE.Group();
  Kit.add(roots3D, flora.blob(rng), roots, -10.2, 1.6, 0, 0, 0.4, 0, 1.4, 2.2, 2.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = Kit.add(roots3D, Kit.cone(0.28, 2.6, 5), barkDark, -10.6, 1.6 + Math.sin(a) * 1.6, Math.cos(a) * 1.6);
    r.rotation.set(Math.cos(a) * 1.2, 0, -Math.PI / 2 + Math.sin(a) * 0.9);
  }
  Kit.add(roots3D, flora.blob(rng), roots, -10.4, 0.5, 0, 0, 0, 0, 1.8, 0.8, 2.2);
  // Right half: trunk to a broken crown at x ≈ +9.
  Kit.add(right, Kit.cyl(0.8, 0.95, 9, 9), bark, 4.5, 0.95, 0, 0, 0, Math.PI / 2);
  Kit.add(right, Kit.cyl(0.95, 0.95, 0.3, 9), wood, 0.1, 0.98, 0, 0, 0, Math.PI / 2);
  Kit.add(right, Kit.cyl(0.84, 0.84, 1.6, 9), moss, 3.2, 1.0, 0, 0, 0, Math.PI / 2);
  // (The leaf masses go in a group of their own, placed like their branch: the same meshes.)
  const crown3D = new THREE.Group();
  crown3D.position.copy(right.position);
  const crownSpots: FallenTree['crownSpots'] = [];
  const tip = new THREE.Vector3();
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group();
    b.position.set(7 + i * 0.9, 1.2, rng.spread(1));
    b.rotation.set(rng.spread(1.2), rng.next() * 6, 0.6 + rng.spread(0.5));
    right.add(b);
    Kit.add(b, Kit.cyl(0.14, 0.25, 3.2, 5), bark, 0, 1.6, 0);
    const s = rng.range(1.6, 2.4);
    const bc = new THREE.Group();
    bc.position.copy(b.position);
    bc.rotation.copy(b.rotation);
    crown3D.add(bc);
    Kit.add(bc, flora.blob(rng), tm(rng.chance(0.5) ? 0x5f7f2a : COL.canopyA, 'leaves', 0.8, 0.85), 0, 3.2, 0, 0, 0, 0, s, s * 0.7, s);
    bc.updateMatrix();
    tip.set(0, 3.2, 0).applyMatrix4(bc.matrix);
    crownSpots.push({ x: tip.x, y: tip.y, z: tip.z, w: 2 * s, h: 1.4 * s });
  }
  merged(left);
  merged(right);
  merged(crown3D);
  merged(roots3D);
  crown3D.position.set(0, 0, 0);
  right.add(crown3D);
  left.add(roots3D);
  // The root plate as seen from the road: ≈ 4.4 m across (the ball + roots), standing on the ground.
  const rootSpot = { x: -10.3, y: 0, z: 0, w: 4.4, h: 4.6 };
  return { root, left, right, crown3D, crownSpots, roots3D, rootSpot };
}

// ─── Tour vehicle ────────────────────────────────────────────────────────────

/** Park tour SUV (upright, facing +Z, wheels on y = 0). Caller rolls it over. */
export function buildTourCar(): THREE.Group {
  const g = new THREE.Group();
  const white = tm(0xe8e2d4, 'metal', 1.1, 0.7);
  const red = tm(0xd0321c, 'metal', 1.1, 0.6);
  const tyre = tm(0x26282a, 'corrugated', 2.5, 0.8);
  const stripes = tm(0xf2c21a, 'hazard', 1.8);
  const glass = tm(0x46627a, 'none', 1, 1, { emissive: 0x0a1a24, emissiveIntensity: 0.4 });
  Kit.add(g, Kit.box(2.0, 1.0, 4.6), white, 0, 1.05, 0);
  Kit.add(g, Kit.box(2.02, 0.3, 4.62), red, 0, 1.0, 0);
  Kit.add(g, Kit.box(1.9, 0.85, 2.9), white, 0, 1.95, -0.4);
  Kit.add(g, Kit.box(1.94, 0.55, 2.7), glass, 0, 1.98, -0.4);
  Kit.add(g, Kit.box(1.7, 0.55, 0.06), glass, 0, 1.95, 1.07, -0.35, 0, 0);
  Kit.add(g, Kit.box(1.6, 0.12, 2.2), tm(0x34383c, 'grate', 1.6), 0, 2.45, -0.4);
  // Hazard-striped push bars front and back.
  Kit.add(g, Kit.box(2.1, 0.3, 0.25), stripes, 0, 0.7, 2.35);
  Kit.add(g, Kit.box(2.1, 0.26, 0.2), stripes, 0, 0.66, -2.32);
  Kit.add(g, Kit.box(0.3, 0.2, 0.06), Kit.glow(0xfff2c0, 1.2), 0.7, 1.15, 2.31);
  Kit.add(g, Kit.box(0.3, 0.2, 0.06), tm(0x6a6a5a, 'none'), -0.7, 1.15, 2.31);
  // Park emblem on the door.
  const emblem = tm(0xe0401a, 'none');
  Kit.add(g, Kit.cyl(0.38, 0.38, 0.04, 12), emblem, 1.02, 1.25, 0.4, 0, 0, Math.PI / 2);
  Kit.add(g, Kit.cyl(0.38, 0.38, 0.04, 12), emblem, -1.02, 1.25, 0.4, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (const sz of [-1.45, 1.45]) {
      Kit.add(g, Kit.cyl(0.44, 0.44, 0.32, 10), tyre, sx * 1.0, 0.44, sz, 0, 0, Math.PI / 2);
      Kit.add(g, Kit.cyl(0.2, 0.2, 0.34, 8), tm(0xa4a4a0, 'metal', 4, 0.6), sx * 1.0, 0.44, sz, 0, 0, Math.PI / 2);
    }
  }
  Kit.add(g, Kit.cyl(0.42, 0.42, 0.28, 10), tyre, 0, 1.2, -2.42, Math.PI / 2, 0, 0);
  // Scratches / dents (raptor claw marks) + caked mud along the sills.
  Kit.add(g, Kit.box(0.04, 0.5, 1.2), tm(0x6a2a1a, 'none'), 1.01, 1.1, -0.9, 0.4, 0, 0);
  for (const sx of [-1, 1]) Kit.add(g, Kit.box(0.04, 0.22, 4.0), tm(0x8a6e48, 'dirt', 1.4), sx * 1.015, 0.66, 0);
  return merged(g);
}

// ─── Fuel drums (shootable set-piece trigger) ───────────────────────────────

export function fuelDrum(world: World, pos: THREE.Vector3, onDestroy?: (w: World) => void): Destructible {
  const g = new THREE.Group();
  const rim = tm(0x5a120e, 'metal', 4, 0.6);
  Kit.add(g, Kit.cyl(0.36, 0.36, 1.0, 10), tm(0xd02c1c, 'metal', 3, 0.75), 0, 0.5, 0);
  Kit.add(g, Kit.cyl(0.37, 0.37, 0.07, 10), rim, 0, 0.22, 0);
  Kit.add(g, Kit.cyl(0.37, 0.37, 0.07, 10), rim, 0, 0.78, 0);
  Kit.add(g, Kit.box(0.34, 0.26, 0.04), Kit.glow(0xffd23a, 1), 0, 0.52, 0.36);
  Kit.add(g, Kit.box(0.04, 0.26, 0.34), Kit.glow(0xffd23a, 1), 0.36, 0.52, 0);
  return new Destructible(world, { model: g, pos, hp: 1, points: 200, explode: { radius: 5.5, damage: 9 }, onDestroy });
}

// ─── Misc ────────────────────────────────────────────────────────────────────

/** Wooden park signpost with arrow boards. */
export function signpost(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const wood = tm(0x7a5a38, 'planks', 1.6);
  Kit.add(g, Kit.box(0.16, 2.6, 0.16), wood, 0, 1.3, 0);
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const dir = rng.chance(0.5) ? 1 : -1;
    Kit.add(g, Kit.box(1.3, 0.3, 0.06), tm(i === 0 ? 0x2f5a2a : 0x6a4a2a, 'planks', 1.6, 0.8), dir * 0.55, 2.2 - i * 0.42, 0.08);
    Kit.add(g, Kit.cone(0.2, 0.3, 3), tm(0xe8d8a0, 'none'), dir * 1.25, 2.2 - i * 0.42, 0.1, 0, 0, -dir * Math.PI / 2);
  }
  return g;
}

/** Road-closed barricade + landslide at the end of the road. */
export function buildBarricade(flora: Flora, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const red = tm(0xd0281c, 'planks', 1.4, 0.55);
  const white = tm(0xeeeeee, 'planks', 1.4, 0.55);
  for (let i = 0; i < 6; i++) {
    Kit.add(g, Kit.box(0.9, 0.35, 0.1), i % 2 ? red : white, -2.25 + i * 0.9, 1.25, 0);
    Kit.add(g, Kit.box(0.9, 0.35, 0.1), i % 2 ? white : red, -2.25 + i * 0.9, 0.7, 0);
  }
  for (const x of [-2.6, 2.6]) Kit.add(g, Kit.box(0.14, 1.6, 0.14), tm(0x5a4a3a, 'planks', 1.6), x, 0.8, 0);
  Kit.add(g, Kit.cyl(0.12, 0.12, 0.2, 8), Kit.glow(0xff9a2a, 1.4), -2.6, 1.7, 0);
  Kit.add(g, Kit.cyl(0.12, 0.12, 0.2, 8), Kit.glow(0xff9a2a, 1.4), 2.6, 1.7, 0);
  for (let i = 0; i < 14; i++) {
    const s = rng.range(1.2, 3.2);
    Kit.add(g, flora.rockGeo(rng), flora.rockMat(rng.chance(0.5)), rng.spread(9), s * 0.4, -4 - rng.range(0, 6), 0, rng.next() * 6, 0, s, s * 0.8, s);
  }
  return g;
}

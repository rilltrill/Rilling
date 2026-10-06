import * as THREE from 'three';
import type { PwTile } from '../../pixelworld/atlas';
import type { PwBatch } from '../../pixelworld/batch';
import { planarUv } from '../../pixelworld/batch';

/**
 * RESEARCH LABS in PIXEL WORLD — the mesh painter: re-emits any Kit mesh into a
 * PwBatch with a painted tile chosen PER FACE by a rule that sees the mesh
 * (its material, its `userData.pw` tag) and the face's object-space side, and
 * maps the tile one of four ways:
 *
 *  - 'world': planar on the world position (walls continue across pieces, v is
 *    world height: an elevation tile's skirting always sits on the floor);
 *  - 'local': planar in the object's own scaled frame (a turned crate keeps its
 *    planks square to its sides);
 *  - 'fit': a MODULE stretched over the face of the object's bounding box (a
 *    door on a door panel, a poster on a board, a decal on a floor quad);
 *  - 'cyl': wrapped round the object's local Y axis (pillars, tanks, pipes),
 *    a whole number of tile widths round, caps planar.
 *
 * Unlike the toolkit's `retexture`, nothing is decided by material alone (the
 * labs share one `S.planks` colour between benches, wainscots and desks), and
 * a mesh can be COPIED (bullet-stopping shells keep their meshes as invisible
 * occluders) or MOVED (static dressing leaves the classic bake).
 */

export type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

export interface Paint {
  tile: PwTile;
  map?: 'world' | 'local' | 'fit' | 'cyl';
  /** sRGB hex tint (default white; a NEUTRAL tile takes the material colour unless set). */
  tint?: number;
  /** Fit: mirror u. */
  flipU?: boolean;
  /** Fit: sub-rect of the module (texels). */
  sub?: { x: number; y: number; w: number; h: number };
  /** Texel offsets (world / local). */
  u0?: number;
  v0?: number;
}

/**
 * `face`: the side in the mesh's OWN frame (a sign board's front is 'pz' however the
 * sign is turned); `wface`: the side in the world (floors are 'py', ceilings 'ny');
 * `col`: the triangle's vertex colour (baked meshes emitted with `vertexColors`).
 */
export type MeshRule = (m: THREE.Mesh, face: Face, col?: THREE.Color, wface?: Face) => Paint | null | undefined;

const _A = new THREE.Vector3();
const _B = new THREE.Vector3();
const _C = new THREE.Vector3();
const _la = new THREE.Vector3();
const _lb = new THREE.Vector3();
const _lc = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _wn = new THREE.Vector3();
const _col = new THREE.Color();
const _vcol = new THREE.Color();
const _base = new THREE.Color();
const _box = new THREE.Box3();
const _m = new THREE.Matrix4();

const _lin = new Map<number, readonly number[]>();
const _lc2 = new THREE.Color();
/** Linear RGB of an sRGB hex tint (memoised: a stage uses a few dozen). */
function linearOf(hex: number): readonly number[] {
  let v = _lin.get(hex);
  if (!v) {
    _lc2.setHex(hex);
    v = [_lc2.r, _lc2.g, _lc2.b];
    _lin.set(hex, v);
  }
  return v;
}

const FACE_I: Record<Face, number> = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };
const UNSET = Symbol('unset');
const _memo: (Paint | null | typeof UNSET)[] = new Array(36).fill(UNSET);

function faceOf(n: THREE.Vector3): Face {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ay >= ax && ay >= az) return n.y > 0 ? 'py' : 'ny';
  if (ax >= az) return n.x > 0 ? 'px' : 'nx';
  return n.z > 0 ? 'pz' : 'nz';
}

const _nt = new THREE.Color();
let _ntTile: PwTile | null = null;
let _ntR = -1;
let _ntG = -1;
let _ntB = -1;
let _ntHex = 0xffffff;

/** Linear-ratio tint of a NEUTRAL tile toward a material colour, as an sRGB hex for `PwBatch.tri` (memoised: runs of one tile × colour). */
export function neutralTint(tile: PwTile, color: THREE.Color): number {
  if (tile.neutral === undefined) return 0xffffff;
  if (tile === _ntTile && color.r === _ntR && color.g === _ntG && color.b === _ntB) return _ntHex;
  _base.setHex(tile.neutral);
  _nt.setRGB(Math.min(1, color.r / Math.max(1e-4, _base.r)), Math.min(1, color.g / Math.max(1e-4, _base.g)), Math.min(1, color.b / Math.max(1e-4, _base.b)));
  _ntTile = tile;
  _ntR = color.r;
  _ntG = color.g;
  _ntB = color.b;
  _ntHex = _nt.getHex();
  return _ntHex;
}

/** Local bounding box of a geometry (without touching the shared cached geometry). */
function localBox(geo: THREE.BufferGeometry, out: THREE.Box3): THREE.Box3 {
  if (geo.boundingBox) return out.copy(geo.boundingBox);
  out.makeEmpty();
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) out.expandByPoint(_A.fromBufferAttribute(p, i));
  return out;
}

/**
 * Emit `mesh` into `batch` (`frame` = the mesh's matrix relative to the batch's
 * space: its matrixWorld for a world-space batch). Faces the rule returns
 * nothing for are dropped. Returns the triangles emitted.
 */
export function emitMesh(batch: PwBatch, mesh: THREE.Mesh, rule: MeshRule, frame: THREE.Matrix4 = mesh.matrixWorld, o: { vertexColors?: boolean } = {}): number {
  const geo = mesh.geometry;
  const p = geo.getAttribute('position');
  const colAttr = o.vertexColors ? geo.getAttribute('color') : null;
  const index = geo.index;
  const triCount = index ? index.count : p.count;
  const e = frame.elements;
  const sx = Math.hypot(e[0], e[1], e[2]);
  const sy = Math.hypot(e[4], e[5], e[6]);
  const sz = Math.hypot(e[8], e[9], e[10]);
  const mirrored = frame.determinant() < 0;
  const box = localBox(geo, _box);
  const bx0 = box.min.x * sx;
  const by0 = box.min.y * sy;
  const bz0 = box.min.z * sz;
  const bx1 = box.max.x * sx;
  const by1 = box.max.y * sy;
  const bz1 = box.max.z * sz;
  const X = Math.max(1e-6, bx1 - bx0);
  const Y = Math.max(1e-6, by1 - by0);
  const Z = Math.max(1e-6, bz1 - bz0);
  const matColor = (mesh.material as THREE.MeshLambertMaterial).color;
  const prev = batch.matrix.clone();
  batch.setMatrix(null);
  const tb = batch as unknown as { tintRGB: readonly number[] | null };
  let n = 0;
  const uv = [0, 0, 0, 0, 0, 0];
  // Without vertex colours a rule's answer depends only on the (face, world face) pair: ask once per pair.
  _memo.fill(UNSET);
  for (let t = 0; t + 2 < triCount; t += 3) {
    const ia = index ? index.getX(t) : t;
    const ib = index ? index.getX(t + 1) : t + 1;
    const ic = index ? index.getX(t + 2) : t + 2;
    _la.fromBufferAttribute(p, ia);
    _lb.fromBufferAttribute(p, ib);
    _lc.fromBufferAttribute(p, ic);
    _A.copy(_la).applyMatrix4(frame);
    _B.copy(_lb).applyMatrix4(frame);
    _C.copy(_lc).applyMatrix4(frame);
    // Scaled object frame (texels stay square on a stretched box).
    _la.set(_la.x * sx, _la.y * sy, _la.z * sz);
    _lb.set(_lb.x * sx, _lb.y * sy, _lb.z * sz);
    _lc.set(_lc.x * sx, _lc.y * sy, _lc.z * sz);
    _e1.subVectors(_lb, _la);
    _e2.subVectors(_lc, _la);
    _n.crossVectors(_e1, _e2);
    if (_n.lengthSq() < 1e-14) continue;
    _n.normalize();
    const face = faceOf(_n);
    if (colAttr) _vcol.fromBufferAttribute(colAttr as THREE.BufferAttribute, ia);
    _e1.subVectors(_B, _A);
    _e2.subVectors(_C, _A);
    _wn.crossVectors(_e1, _e2);
    if (mirrored) _wn.negate();
    const wface = faceOf(_wn);
    let paint: Paint | null | undefined;
    if (colAttr) paint = rule(mesh, face, _vcol, wface);
    else {
      const mi = FACE_I[face] * 6 + FACE_I[wface];
      const hit = _memo[mi];
      if (hit === UNSET) _memo[mi] = paint = rule(mesh, face, undefined, wface) ?? null;
      else paint = hit as Paint | null;
    }
    if (!paint) continue;
    const tile = paint.tile;
    const map = paint.map ?? 'local';
    const d = tile.density;
    if (map === 'world') {
      if (_wn.lengthSq() < 1e-14) continue;
      _wn.normalize();
      [uv[0], uv[1]] = planarUv(_A, _wn, d);
      [uv[2], uv[3]] = planarUv(_B, _wn, d);
      [uv[4], uv[5]] = planarUv(_C, _wn, d);
    } else if (map === 'local') {
      [uv[0], uv[1]] = planarUv(_la, _n, d);
      [uv[2], uv[3]] = planarUv(_lb, _n, d);
      [uv[4], uv[5]] = planarUv(_lc, _n, d);
    } else if (map === 'fit') {
      const pts = [_la, _lb, _lc];
      for (let k = 0; k < 3; k++) {
        const q = pts[k];
        let s = 0;
        let r = 0;
        switch (face) {
          case 'pz':
            s = (q.x - bx0) / X;
            r = (q.y - by0) / Y;
            break;
          case 'nz':
            s = (bx1 - q.x) / X;
            r = (q.y - by0) / Y;
            break;
          case 'px':
            s = (bz1 - q.z) / Z;
            r = (q.y - by0) / Y;
            break;
          case 'nx':
            s = (q.z - bz0) / Z;
            r = (q.y - by0) / Y;
            break;
          case 'py':
            s = (q.x - bx0) / X;
            r = (bz1 - q.z) / Z;
            break;
          case 'ny':
            s = (q.x - bx0) / X;
            r = (q.z - bz0) / Z;
            break;
        }
        if (paint.flipU) s = 1 - s;
        const sub = paint.sub;
        uv[k * 2] = sub ? sub.x + s * sub.w : s * tile.w;
        uv[k * 2 + 1] = sub ? sub.y + r * sub.h : r * tile.h;
      }
    } else {
      // Cylinder round local Y: u by angle (a whole number of tile widths round), v by height; caps planar.
      if (face === 'py' || face === 'ny') {
        [uv[0], uv[1]] = planarUv(_la, _n, d);
        [uv[2], uv[3]] = planarUv(_lb, _n, d);
        [uv[4], uv[5]] = planarUv(_lc, _n, d);
      } else {
        const r = Math.max(X, Z) / 2;
        const reps = Math.max(1, Math.round((2 * Math.PI * r * d) / tile.w));
        const circ = reps * tile.w;
        const cx = (bx0 + bx1) / 2;
        const cz = (bz0 + bz1) / 2;
        const pts = [_la, _lb, _lc];
        for (let k = 0; k < 3; k++) {
          const a = Math.atan2(pts[k].x - cx, pts[k].z - cz);
          uv[k * 2] = ((a / (2 * Math.PI)) + 0.5) * circ;
          uv[k * 2 + 1] = pts[k].y * d;
        }
        // Seam: keep the triangle on one side of the wrap.
        const mx = Math.max(uv[0], uv[2], uv[4]);
        for (let k = 0; k < 3; k++) if (mx - uv[k * 2] > circ / 2) uv[k * 2] += circ;
      }
    }
    if (map !== 'fit') {
      for (let k = 0; k < 3; k++) {
        uv[k * 2] += paint.u0 ?? 0;
        uv[k * 2 + 1] += paint.v0 ?? 0;
      }
      if (tile.wrap) {
        // Keep texel coords small (precision): shift by whole tile periods.
        const su = Math.floor(Math.min(uv[0], uv[2], uv[4]) / tile.w) * tile.w;
        const sv = Math.floor(Math.min(uv[1], uv[3], uv[5]) / tile.h) * tile.h;
        for (let k = 0; k < 3; k++) {
          uv[k * 2] -= su;
          uv[k * 2 + 1] -= sv;
        }
      }
    }
    let tint = paint.tint ?? 0xffffff;
    if (paint.tint === undefined && tile.neutral !== undefined) {
      if (colAttr) _col.copy(_vcol);
      else _col.copy(matColor ?? _col.setRGB(1, 1, 1));
      tint = neutralTint(tile, _col);
    }
    // (The batch's linear tint slot — the one `rect({ tintRGB })` uses — so no sRGB decode per vertex.)
    tb.tintRGB = linearOf(tint);
    if (mirrored) batch.tri(_A, _C, _B, tile, [uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]], tint);
    else batch.tri(_A, _B, _C, tile, uv, tint);
    n++;
  }
  tb.tintRGB = null;
  batch.setMatrix(prev);
  return n;
}

/** Is this a static, opaque, lit Kit mesh PixelWorld may re-paint? (not glow / glass / animated / instanced) */
export function paintable(m: THREE.Object3D): m is THREE.Mesh {
  const mesh = m as THREE.Mesh;
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material) || mesh.userData.pixelWorld) return false;
  const mat = mesh.material as THREE.MeshLambertMaterial;
  if (!mat.isMeshLambertMaterial || mat.transparent || mat.userData.pixelWorld) return false;
  if (mat.emissive && mat.emissive.getHex() !== 0) return false;
  return true;
}

/**
 * Paint every paintable mesh under `root` the rule accepts into `batch`
 * (world frame) and — `move` — remove it from the scene graph (so the classic
 * bake skips it). A mesh is taken when the rule paints at least its front or
 * top. `frameOf` overrides a mesh's frame (dynamic groups: relative to the group).
 */
export function paintGroup(root: THREE.Object3D, batch: PwBatch, rule: MeshRule, o: { move?: boolean; frameOf?: (m: THREE.Mesh) => THREE.Matrix4; vertexColors?: boolean } = {}): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const list: THREE.Mesh[] = [];
  root.traverse((ob) => {
    if (!paintable(ob)) return;
    const any = (['pz', 'py', 'px', 'nx', 'nz', 'ny'] as Face[]).some((f) => rule(ob, f, undefined, f) || rule(ob, f, undefined, 'py'));
    if (!any) return;
    list.push(ob);
  });
  for (const m of list) {
    emitMesh(batch, m, rule, o.frameOf ? o.frameOf(m) : m.matrixWorld, { vertexColors: o.vertexColors });
    if (o.move) m.parent?.remove(m);
  }
  return list;
}

/** Remove every mesh under `root` the predicate accepts (dressing a painted module replaces). */
export function dropMeshes(root: THREE.Object3D, pred: (m: THREE.Mesh) => boolean): number {
  const list: THREE.Mesh[] = [];
  root.traverse((ob) => {
    const m = ob as THREE.Mesh;
    if (m.isMesh && pred(m)) list.push(m);
  });
  for (const m of list) m.parent?.remove(m);
  return list.length;
}

/** The mesh's matrix relative to `ancestor` (for dynamic groups painted in their own frame). */
export function relativeMatrix(m: THREE.Object3D, ancestor: THREE.Object3D, out = new THREE.Matrix4()): THREE.Matrix4 {
  ancestor.updateMatrixWorld(true);
  _m.copy(ancestor.matrixWorld).invert();
  return out.multiplyMatrices(_m, m.matrixWorld);
}

/** Is any ancestor of `o` (or `o`) tagged `userData.pw === tag`? Returns the tagged object. */
export function tagged(o: THREE.Object3D, pred: (tag: string) => boolean): THREE.Object3D | null {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    const t = p.userData.pw as string | undefined;
    if (t && pred(t)) return p;
  }
  return null;
}

/** The tag (`userData.pw`) on `o` or its nearest tagged ancestor. */
export function tagOf(o: THREE.Object3D): string | undefined {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    const t = p.userData.pw as string | undefined;
    if (t) return t;
  }
  return undefined;
}

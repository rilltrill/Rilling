import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import type { PwAtlas, PwTile } from './atlas';
import { pwMaterial, type PwMaterialOptions } from './material';

/**
 * PixelWorld geometry builder: collects quads / triangles that reference atlas
 * tiles, in any transform (`matrix`), and builds ONE mesh (one draw call) for
 * them after the atlas is painted.
 *
 * Vertex layout (UV mode, 32 B): position f32×3, `pwUv` f32×2 (texel coords,
 * unwrapped), `pwRect` i16×4 (atlas rect; w < 0 = clamp), `color` u8×3 (tint).
 * Normals are not stored — the material is flat-shaded from screen derivatives.
 *
 * Mapping helpers:
 *  - `rect(o, ux, vy, w, h, tile)`: a flat rectangle. Wrap tiles are laid at the
 *    tile's texel density from the rectangle's own corner (+ `u0` / `v0` texel
 *    offsets: keep a facade's bricks continuous across its pieces); modules are
 *    stretched over the rectangle exactly (pass the module's own metre size so
 *    its texels stay square: `tile.w / tile.density`).
 *  - `box(...)`: a box's faces, each with a world-scale planar mapping.
 *  - `geometry(geo, matrix, tile)`: any mesh re-textured by world-scale planar
 *    projection on each triangle's dominant axis (terrain, rocks, curbs).
 *  - `ribbon(points, …)`: a strip along a path with v running ALONG it (roads,
 *    ruts, rivers: the painted lanes and tyre tracks follow every bend).
 */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _col = new THREE.Color();

export interface PwRectOpts {
  /** Texel offsets of the mapping origin (wrap tiles). */
  u0?: number;
  v0?: number;
  /** Mirror the tile horizontally (modules). */
  flipU?: boolean;
  /** Wrap tiles: stretch u by this factor (a whole number of repeats across a width: shop bays). */
  uScale?: number;
  /** Vertex tint (sRGB hex, default white). */
  tint?: number;
  /** Per-corner tint (bottom-left, bottom-right, top-right, top-left) — painted AO / light falloff. */
  tints?: [number, number, number, number];
  /** Sub-rect of a module (texels): draw only part of the tile. */
  sub?: { x: number; y: number; w: number; h: number };
  /** Linear RGB tint (a NEUTRAL tile in a material's colour: see `tintFor`). Overrides `tint`. */
  tintRGB?: readonly number[];
}

const _tc = new THREE.Color();
const _tb = new THREE.Color();
/** Linear tint that turns a NEUTRAL tile (painted round `tile.neutral`) into `hex`. */
export function tintFor(tile: PwTile, hex: number): [number, number, number] {
  _tc.setHex(hex);
  _tb.setHex(tile.neutral ?? 0xffffff);
  return [Math.min(1, _tc.r / Math.max(1e-4, _tb.r)), Math.min(1, _tc.g / Math.max(1e-4, _tb.g)), Math.min(1, _tc.b / Math.max(1e-4, _tb.b))];
}

export class PwBatch {
  private pos: number[] = [];
  private uv: number[] = [];
  private tiles: PwTile[] = [];
  /** Per-vertex tile index into `tiles` (resolved to rects at build). */
  private tileIdx: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private tileIds = new Map<PwTile, number>();
  /** Transform applied to everything emitted (world placement of a local frame). */
  readonly matrix = new THREE.Matrix4();

  /**
   * `planar`: no UV attribute (24 B a vertex: position, rect, colour) — texel
   * coords come from the world position in the shader (`pwMaterial({ planar })`).
   * For re-texturing big baked scenery (terrain, cliffs, d3's packed bakes):
   * wrap tiles only, world-aligned.
   */
  constructor(
    readonly atlas: PwAtlas,
    readonly o: { planar?: boolean } = {},
  ) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  /** Set the transform (copies `m`); `null` = identity. */
  setMatrix(m: THREE.Matrix4 | null): this {
    if (m) this.matrix.copy(m);
    else this.matrix.identity();
    return this;
  }

  /** Run `fn` with `m` as the transform, then restore the previous one. */
  withMatrix(m: THREE.Matrix4, fn: () => void) {
    const prev = this.matrix.clone();
    this.setMatrix(m);
    fn();
    this.setMatrix(prev);
  }

  private tileId(t: PwTile): number {
    let i = this.tileIds.get(t);
    if (i === undefined) {
      i = this.tiles.length;
      this.tiles.push(t);
      this.tileIds.set(t, i);
    }
    return i;
  }

  /** Linear RGB tint overriding the hex tints (set by `geometry({ tintRGB })`). */
  private tintRGB: readonly number[] | null = null;

  private vert(p: THREE.Vector3, u: number, v: number, tile: number, tint: number) {
    _a.copy(p).applyMatrix4(this.matrix);
    this.pos.push(_a.x, _a.y, _a.z);
    this.uv.push(u, v);
    this.tileIdx.push(tile);
    if (this.tintRGB) this.col.push(this.tintRGB[0], this.tintRGB[1], this.tintRGB[2]);
    else {
      _col.setHex(tint);
      this.col.push(_col.r, _col.g, _col.b);
    }
    return this.pos.length / 3 - 1;
  }

  /**
   * Quad a-b-c-d (counter-clockwise seen from its front: bottom-left,
   * bottom-right, top-right, top-left) with texel UVs per corner.
   */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, tile: PwTile, uvs: number[], tints?: [number, number, number, number] | number) {
    const t = this.tileId(tile);
    const tt = (k: number) => (tints === undefined ? 0xffffff : typeof tints === 'number' ? tints : tints[k]);
    const i0 = this.vert(a, uvs[0], uvs[1], t, tt(0));
    const i1 = this.vert(b, uvs[2], uvs[3], t, tt(1));
    const i2 = this.vert(c, uvs[4], uvs[5], t, tt(2));
    const i3 = this.vert(d, uvs[6], uvs[7], t, tt(3));
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  /** Triangle a-b-c (counter-clockwise from the front). */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, tile: PwTile, uvs: number[], tint = 0xffffff) {
    const t = this.tileId(tile);
    const i0 = this.vert(a, uvs[0], uvs[1], t, tint);
    const i1 = this.vert(b, uvs[2], uvs[3], t, tint);
    const i2 = this.vert(c, uvs[4], uvs[5], t, tint);
    this.idx.push(i0, i1, i2);
  }

  /**
   * A flat rectangle from corner `o` along unit axes `ux` (right) and `vy` (up),
   * `w` × `h` metres, facing ux × vy.
   */
  rect(o: THREE.Vector3, ux: THREE.Vector3, vy: THREE.Vector3, w: number, h: number, tile: PwTile, opts: PwRectOpts = {}) {
    _b.copy(o).addScaledVector(ux, w);
    _c.copy(_b).addScaledVector(vy, h);
    _d.copy(o).addScaledVector(vy, h);
    let u0: number, u1: number, v0: number, v1: number;
    if (tile.wrap) {
      u0 = opts.u0 ?? 0;
      v0 = opts.v0 ?? 0;
      u1 = u0 + w * tile.density * (opts.uScale ?? 1);
      v1 = v0 + h * tile.density;
    } else {
      const s = opts.sub ?? { x: 0, y: 0, w: tile.w, h: tile.h };
      u0 = s.x;
      u1 = s.x + s.w;
      v0 = s.y;
      v1 = s.y + s.h;
      if (opts.flipU) [u0, u1] = [u1, u0];
    }
    const o2 = o.clone();
    if (opts.tintRGB) this.tintRGB = opts.tintRGB;
    this.quad(o2, _b.clone(), _c.clone(), _d.clone(), tile, [u0, v0, u1, v0, u1, v1, u0, v1], opts.tints ?? opts.tint);
    this.tintRGB = null;
  }

  /**
   * Axis-aligned box (in the current transform): centre, size and a tile per
   * face (`px nx py ny pz nz`, or one tile for all; null = no face). Each face
   * is mapped at world scale from the box's corner (wrap tiles), or stretched
   * (modules).
   */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, faces: PwTile | Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', PwTile | null>>, opts: PwRectOpts = {}) {
    const all = (faces as PwTile).key !== undefined ? (faces as PwTile) : null;
    const f = (k: 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz') => (all ? all : (faces as Record<string, PwTile | null>)[k] ?? null);
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const y0 = cy - sy / 2;
    const y1 = cy + sy / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const X = new THREE.Vector3(1, 0, 0);
    const Y = new THREE.Vector3(0, 1, 0);
    const Z = new THREE.Vector3(0, 0, 1);
    const nX = new THREE.Vector3(-1, 0, 0);
    const nZ = new THREE.Vector3(0, 0, -1);
    let t: PwTile | null;
    if ((t = f('pz'))) this.rect(V(x0, y0, z1), X, Y, sx, sy, t, opts);
    if ((t = f('nz'))) this.rect(V(x1, y0, z0), nX, Y, sx, sy, t, opts);
    if ((t = f('px'))) this.rect(V(x1, y0, z1), nZ, Y, sz, sy, t, opts);
    if ((t = f('nx'))) this.rect(V(x0, y0, z0), Z, Y, sz, sy, t, opts);
    if ((t = f('py'))) this.rect(V(x0, y1, z1), X, nZ, sx, sz, t, opts);
    if ((t = f('ny'))) this.rect(V(x0, y0, z0), X, Z, sx, sz, t, opts);
  }

  /**
   * Re-texture any geometry placed by `m` (× the current transform): each
   * triangle is mapped at the tile's density by planar projection on its
   * dominant axis — in the object's own scaled frame (like Kit's retro
   * textures: a turned car keeps its panels square to its body) or in world
   * space (`world`: brick courses run on across neighbouring pieces). `tile`
   * may pick per face from its WORLD normal; null skips the face.
   */
  geometry(
    geo: THREE.BufferGeometry,
    m: THREE.Matrix4,
    tile: PwTile | ((nx: number, ny: number, nz: number) => PwTile | null),
    o: { tint?: number; world?: boolean; tintRGB?: (t: PwTile) => readonly number[] | null } = {},
  ) {
    // Triangles straight from the index (no non-indexed copy).
    const p = geo.getAttribute('position');
    const index = geo.index;
    const triCount = index ? index.count : p.count;
    const prev = this.matrix.clone();
    const full = prev.clone().multiply(m);
    // Object scale (column lengths): projection in the scaled object frame, as Kit.mat does.
    const e = full.elements;
    const sx = Math.hypot(e[0], e[1], e[2]);
    const sy = Math.hypot(e[4], e[5], e[6]);
    const sz = Math.hypot(e[8], e[9], e[10]);
    this.setMatrix(null);
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const C = new THREE.Vector3();
    const la = new THREE.Vector3();
    const lb = new THREE.Vector3();
    const lc = new THREE.Vector3();
    for (let i = 0; i + 2 < triCount; i += 3) {
      la.fromBufferAttribute(p, index ? index.getX(i) : i);
      lb.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1);
      lc.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2);
      A.copy(la).applyMatrix4(full);
      B.copy(lb).applyMatrix4(full);
      C.copy(lc).applyMatrix4(full);
      if (o.world) {
        la.copy(A);
        lb.copy(B);
        lc.copy(C);
      } else {
        la.set(la.x * sx, la.y * sy, la.z * sz);
        lb.set(lb.x * sx, lb.y * sy, lb.z * sz);
        lc.set(lc.x * sx, lc.y * sy, lc.z * sz);
      }
      let t: PwTile | null;
      if (typeof tile === 'function') {
        // The rule sees the WORLD normal (a floor is a floor however the mesh was turned).
        _e1.subVectors(B, A);
        _e2.subVectors(C, A);
        _n.crossVectors(_e1, _e2);
        if (_n.lengthSq() < 1e-12) continue;
        _n.normalize();
        t = tile(_n.x, _n.y, _n.z);
      } else t = tile;
      if (!t) continue;
      _e1.subVectors(lb, la);
      _e2.subVectors(lc, la);
      _n.crossVectors(_e1, _e2);
      if (_n.lengthSq() < 1e-12) continue;
      _n.normalize();
      this.tintRGB = o.tintRGB ? o.tintRGB(t) : null;
      const [ua, va] = planarUv(la, _n, t.density);
      const [ub, vb] = planarUv(lb, _n, t.density);
      const [uc, vc] = planarUv(lc, _n, t.density);
      // Keep the texel coords small (precision): shift the triangle by whole tile periods.
      const su = Math.floor(Math.min(ua, ub, uc) / t.w) * t.w;
      const sv = Math.floor(Math.min(va, vb, vc) / t.h) * t.h;
      this.tri(A, B, C, t, [ua - su, va - sv, ub - su, vb - sv, uc - su, vc - sv], o.tint ?? 0xffffff);
    }
    this.tintRGB = null;
    this.setMatrix(prev);
  }

  /**
   * A strip along a polyline (`pts` in the current frame, y up): `width` metres
   * across (centred on the path + `offset` to the right), v runs along the path
   * (texels, from `v0`), u across (0 … width × density from the left edge).
   * `y` lifts it; `step` is how the path was sampled (the caller's points).
   */
  ribbon(pts: THREE.Vector3[], width: number, tile: PwTile, o: { offset?: number; y?: number; v0?: number; u0?: number; tint?: number; edgeTint?: number } = {}) {
    if (pts.length < 2) return;
    const dens = tile.density;
    let along = o.v0 ?? 0;
    const L = new THREE.Vector3();
    const R = new THREE.Vector3();
    const pL = new THREE.Vector3();
    const pR = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const right = new THREE.Vector3();
    const u0 = o.u0 ?? 0;
    const u1 = u0 + width * dens;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      dir.subVectors(b, a).setY(0).normalize();
      right.set(-dir.z, 0, dir.x);
      const c = pts[i];
      L.copy(c).addScaledVector(right, (o.offset ?? 0) - width / 2);
      R.copy(c).addScaledVector(right, (o.offset ?? 0) + width / 2);
      L.y += o.y ?? 0;
      R.y += o.y ?? 0;
      if (i > 0) {
        along += pts[i].distanceTo(pts[i - 1]) * dens;
        const vPrev = along - pts[i].distanceTo(pts[i - 1]) * dens;
        this.quad(pL.clone(), pR.clone(), R.clone(), L.clone(), tile, [u0, vPrev, u1, vPrev, u1, along, u0, along], o.tint);
      }
      pL.copy(L);
      pR.copy(R);
    }
  }

  /** Build the mesh (the atlas must be built). Returns null when nothing was emitted. */
  build(mat?: THREE.Material, o: PwMaterialOptions = {}): THREE.Mesh | null {
    const n = this.vertexCount;
    if (!n) return null;
    this.atlas.build();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (!this.o.planar) geo.setAttribute('pwUv', new THREE.Float32BufferAttribute(this.uv, 2));
    const rect = new Int16Array(n * 4);
    for (let i = 0; i < n; i++) {
      const t = this.tiles[this.tileIdx[i]];
      if (t.x < 0) throw new Error(`pixelworld: tile '${t.key}' is not in atlas ${this.atlas.name}`);
      rect[i * 4] = t.x;
      rect[i * 4 + 1] = t.y;
      rect[i * 4 + 2] = t.wrap ? t.w : -t.w;
      rect[i * 4 + 3] = t.h;
    }
    geo.setAttribute('pwRect', new THREE.BufferAttribute(rect, 4));
    const col = new Uint8Array(n * 3);
    for (let i = 0; i < n * 3; i++) col[i] = Math.round(Math.min(1, Math.max(0, this.col[i])) * 255);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    Kit.track(geo);
    const mesh = new THREE.Mesh(geo, mat ?? pwMaterial(this.atlas, { ...o, planar: this.o.planar || o.planar }));
    mesh.matrixAutoUpdate = false;
    mesh.name = `pw:${this.atlas.name}`;
    // Scenery only: never raycast (bullets hit the stage's own occluders).
    mesh.raycast = () => {};
    mesh.userData.noMerge = true;
    mesh.userData.pixelWorld = true;
    return mesh;
  }
}

/**
 * Texel UV of a world point on a face with normal `n`, by the dominant axis
 * (the same projection as the material's PLANAR mode): ground (x, −z), walls
 * facing ±x (∓z, y), walls facing ±z (±x, y) — u runs to the right seen from
 * the front, v up.
 */
export function planarUv(p: THREE.Vector3, n: THREE.Vector3, density: number): [number, number] {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  let u: number;
  let v: number;
  if (ay > ax && ay > az) {
    u = p.x;
    v = n.y > 0 ? -p.z : p.z;
  } else if (ax > az) {
    u = n.x > 0 ? -p.z : p.z;
    v = p.y;
  } else {
    u = n.z > 0 ? p.x : -p.x;
    v = p.y;
  }
  return [u * density, v * density];
}

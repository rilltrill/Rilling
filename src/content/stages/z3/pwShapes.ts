import * as THREE from 'three';
import type { PwTile } from '../../pixelworld/atlas';
import type { PwBatch, PwRectOpts } from '../../pixelworld/batch';

/**
 * Painted solids for HIGHWAY TO HELL's PIXEL WORLD, emitted in the batch's
 * current transform: boxes whose faces each take a tile (modules stretched
 * over a face, wrap tiles at density), cylinders with a wrap tile running
 * round them, strips between two profile points (extruded profiles: jersey
 * barriers, W-beams), double-sided cards (cut-out modules).
 */

export type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
export type FaceTiles = Partial<Record<Face, PwTile | null>>;

const _o = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NX = new THREE.Vector3(-1, 0, 0);
const NZ = new THREE.Vector3(0, 0, -1);
const NY = new THREE.Vector3(0, -1, 0);

/**
 * Box centred at (cx, cy, cz), size (sx, sy, sz): one tile per face (null / missing = no face).
 * Faces seen from outside: ±z faces run u along x, ±x faces along z, tops along x (v along −z).
 */
export function box(b: PwBatch, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, faces: FaceTiles, o: Partial<Record<Face, PwRectOpts>> = {}, all: PwRectOpts = {}) {
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const y0 = cy - sy / 2;
  const y1 = cy + sy / 2;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;
  const f = (k: Face) => faces[k];
  const opt = (k: Face) => ({ ...all, ...o[k] });
  let t: PwTile | null | undefined;
  if ((t = f('pz'))) b.rect(_o.set(x0, y0, z1), X, Y, sx, sy, t, opt('pz'));
  if ((t = f('nz'))) b.rect(_o.set(x1, y0, z0), NX, Y, sx, sy, t, opt('nz'));
  if ((t = f('px'))) b.rect(_o.set(x1, y0, z1), NZ, Y, sz, sy, t, opt('px'));
  if ((t = f('nx'))) b.rect(_o.set(x0, y0, z0), Z, Y, sz, sy, t, opt('nx'));
  if ((t = f('py'))) b.rect(_o.set(x0, y1, z1), X, NZ, sx, sz, t, opt('py'));
  if ((t = f('ny'))) b.rect(_o.set(x0, y0, z0), X, Z, sx, sz, t, opt('ny'));
}

/** All six faces with one tile. */
export function box6(b: PwBatch, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, t: PwTile, all: PwRectOpts = {}) {
  box(b, cx, cy, cz, sx, sy, sz, { px: t, nx: t, py: t, ny: t, pz: t, nz: t }, {}, all);
}

const _ax = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _d0 = new THREE.Vector3();

/**
 * A (tapered) cylinder from `a` (radius r0) to `b` (r1), `sides` facets, the tile wrapped round it
 * (whole tile widths round for wrap tiles; a module spans the circumference once), v along the axis.
 */
export function cylinder(b: PwBatch, a: THREE.Vector3, c: THREE.Vector3, r0: number, r1: number, sides: number, tile: PwTile, o: { u0?: number; v0?: number; phase?: number; tint?: number; capB?: PwTile; vLen?: number; tintRGB?: readonly number[] } = {}) {
  _ax.subVectors(c, a);
  const len = _ax.length();
  if (len < 1e-6) return;
  _ax.divideScalar(len);
  _p1.set(0, 1, 0);
  if (Math.abs(_ax.y) > 0.9) _p1.set(1, 0, 0);
  _p2.crossVectors(_ax, _p1).normalize();
  _p1.crossVectors(_p2, _ax).normalize();
  const dens = tile.density;
  const circ = 2 * Math.PI * ((r0 + r1) / 2) * dens;
  const uTotal = tile.wrap ? Math.max(tile.w, Math.round(circ / tile.w) * tile.w) : tile.w;
  const vLen = o.vLen ?? (tile.wrap ? len * dens : tile.h);
  const u0 = o.u0 ?? 0;
  const v0 = o.v0 ?? 0;
  const ph = o.phase ?? 0;
  const P = (i: number, r: number, base: THREE.Vector3) => {
    const t = ph + (i / sides) * Math.PI * 2;
    return base.clone().addScaledVector(_p1, Math.cos(t) * r).addScaledVector(_p2, Math.sin(t) * r);
  };
  const opts: PwRectOpts = o.tintRGB ? { tintRGB: o.tintRGB } : {};
  void opts;
  for (let i = 0; i < sides; i++) {
    const A0 = P(i, r0, a);
    const A1 = P(i + 1, r0, a);
    const B1 = P(i + 1, r1, c);
    const B0 = P(i, r1, c);
    const uA = u0 + (uTotal * i) / sides;
    const uB = u0 + (uTotal * (i + 1)) / sides;
    _d0.subVectors(A0, a).add(_e1.subVectors(A1, a));
    _e1.subVectors(A1, A0);
    _e2.subVectors(r1 > 0 ? B0 : B1, A0);
    _n.crossVectors(_e1, _e2);
    if (_n.dot(_d0) >= 0) b.quad(A0, A1, B1, B0, tile, [uA, v0, uB, v0, uB, v0 + vLen, uA, v0 + vLen], o.tint);
    else b.quad(A1, A0, B0, B1, tile, [uB, v0, uA, v0, uA, v0 + vLen, uB, v0 + vLen], o.tint);
  }
  if (o.capB && r1 > 0) {
    const W = o.capB.w;
    const H = o.capB.h;
    for (let i = 0; i < sides; i++) {
      const t0 = ph + (i / sides) * Math.PI * 2;
      const t1 = ph + ((i + 1) / sides) * Math.PI * 2;
      const Q0 = P(i, r1, c);
      const Q1 = P(i + 1, r1, c);
      const uv = [W / 2, H / 2, ((Math.cos(t0) + 1) / 2) * W, ((Math.sin(t0) + 1) / 2) * H, ((Math.cos(t1) + 1) / 2) * W, ((Math.sin(t1) + 1) / 2) * H];
      _e1.subVectors(Q0, c);
      _e2.subVectors(Q1, c);
      _n.crossVectors(_e1, _e2);
      if (_n.dot(_ax) >= 0) b.tri(c.clone(), Q0, Q1, o.capB, uv, o.tint);
      else b.tri(c.clone(), Q1, Q0, o.capB, [uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]], o.tint);
    }
  }
}

/**
 * A strip of an extruded profile: from profile point (x0, y0) to (x1, y1) (x across, y up), run
 * along z from +L/2 to −L/2, on side `s` (+1 = +x, −1 mirrored). u along the run (0…uLen), v from
 * vA (at the first point) to vB.
 */
export function profileStrip(b: PwBatch, s: number, x0: number, y0: number, x1: number, y1: number, L: number, tile: PwTile, u0: number, uLen: number, vA: number, vB: number, tint?: number) {
  const zA = s > 0 ? L / 2 : -L / 2;
  const zB = -zA;
  const A = new THREE.Vector3(s * x0, y0, zA);
  const B = new THREE.Vector3(s * x0, y0, zB);
  const C = new THREE.Vector3(s * x1, y1, zB);
  const Dd = new THREE.Vector3(s * x1, y1, zA);
  b.quad(A, B, C, Dd, tile, [u0, vA, u0 + uLen, vA, u0 + uLen, vB, u0, vB], tint);
}

/** A double-sided card (cut-out module) centred at `c`, `w` × `h`, its right along `right`, up along `up`. */
export function card(b: PwBatch, c: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, w: number, h: number, tile: PwTile, o: { back?: PwTile | null; sub?: PwRectOpts['sub']; tint?: number } = {}) {
  const corner = c.clone().addScaledVector(right, -w / 2).addScaledVector(up, -h / 2);
  b.rect(corner, right, up, w, h, tile, { sub: o.sub, tint: o.tint });
  if (o.back !== null) {
    const neg = right.clone().negate();
    const c2 = c.clone().addScaledVector(right, w / 2).addScaledVector(up, -h / 2);
    b.rect(c2, neg, up, w, h, o.back ?? tile, { sub: o.sub, flipU: !o.back, tint: o.tint });
  }
}

export { X, Y, Z, NX, NY, NZ };

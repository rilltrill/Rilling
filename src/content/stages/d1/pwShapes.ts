import * as THREE from 'three';
import type { PwTile } from '../../pixelworld/atlas';
import type { PwBatch } from '../../pixelworld/batch';

/**
 * Painted solids for JUNGLE RUN's PIXEL WORLD (in the batch's current
 * transform): round logs / poles / tyres whose wrap tile runs AROUND the
 * circumference (u, seamless: the circumference is rounded to whole tile
 * widths) and ALONG the axis (v), capped with a module disc (sawn log ends,
 * wheel faces); flat module quads facing either way.
 */

const _ax = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _d0 = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();

export interface CylOpts {
  tint?: number;
  /** Module discs on the start / end faces. */
  capA?: PwTile | null;
  capB?: PwTile | null;
  /** Texel offsets (vary neighbouring logs). */
  u0?: number;
  v0?: number;
  /** Start angle (rad) of the first facet. */
  phase?: number;
  /**
   * Draw only an arc (radians) of the side, centred on the basis' "up" (for an
   * axis across the ground: the top of the log) — a module tile spans it exactly
   * (moss drapes, bands of growth). No caps.
   */
  arc?: number;
}

/** A (tapered) cylinder from `a` (radius r0) to `b` (radius r1), `sides` facets, `tile` wrapped round it. r1 = 0 makes a cone. */
export function pwCylinder(batch: PwBatch, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, sides: number, tile: PwTile, o: CylOpts = {}) {
  _ax.subVectors(b, a);
  const len = _ax.length();
  if (len < 1e-6) return;
  _ax.divideScalar(len);
  // Basis round the axis.
  _p1.set(0, 1, 0);
  if (Math.abs(_ax.y) > 0.9) _p1.set(1, 0, 0);
  _p2.crossVectors(_ax, _p1).normalize();
  _p1.crossVectors(_p2, _ax).normalize();
  const dens = tile.density;
  const rAvg = (r0 + r1) / 2;
  const circ = 2 * Math.PI * rAvg * dens;
  // Whole tile widths round (seamless), never less than one.
  const uTotal = tile.wrap ? Math.max(tile.w, Math.round(circ / tile.w) * tile.w) : tile.w;
  const vLen = tile.wrap ? len * dens : tile.h;
  const u0 = o.u0 ?? 0;
  const v0 = o.v0 ?? 0;
  const ph = o.phase ?? 0;
  const tint = o.tint ?? 0xffffff;
  const arc = o.arc ?? Math.PI * 2;
  const a0 = o.arc ? -arc / 2 : ph;
  const pts = (i: number, r: number, base: THREE.Vector3, out: THREE.Vector3) => {
    const t = a0 + (i / sides) * arc;
    return out.copy(base).addScaledVector(_p1, Math.cos(t) * r).addScaledVector(_p2, Math.sin(t) * r);
  };
  for (let i = 0; i < sides; i++) {
    const A0 = pts(i, r0, a, new THREE.Vector3());
    const A1 = pts(i + 1, r0, a, new THREE.Vector3());
    const B1 = pts(i + 1, r1, b, new THREE.Vector3());
    const B0 = pts(i, r1, b, new THREE.Vector3());
    const uA = u0 + (uTotal * i) / sides;
    const uB = u0 + (uTotal * (i + 1)) / sides;
    // Outward winding (front = counter-clockwise seen from outside).
    _d0.subVectors(A0, a).add(_d1.subVectors(A1, a));
    _e1.subVectors(A1, A0);
    _e2.subVectors(r1 > 0 ? B0 : B1, A0);
    _n.crossVectors(_e1, _e2);
    if (_n.dot(_d0) >= 0) batch.quad(A0, A1, B1, B0, tile, [uA, v0, uB, v0, uB, v0 + vLen, uA, v0 + vLen], tint);
    else batch.quad(A1, A0, B0, B1, tile, [uB, v0, uA, v0, uA, v0 + vLen, uB, v0 + vLen], tint);
  }
  if (o.arc) return;
  if (o.capA) disc(batch, a, r0, -1, sides, o.capA, ph, tint);
  if (o.capB && r1 > 0) disc(batch, b, r1, 1, sides, o.capB, ph, tint);
}

/** A disc module on the end of the current cylinder basis (`dir` = ±1 along the axis). */
function disc(batch: PwBatch, c: THREE.Vector3, r: number, dir: number, sides: number, tile: PwTile, ph: number, tint: number) {
  const W = tile.w;
  const H = tile.h;
  for (let i = 0; i < sides; i++) {
    const t0 = ph + (i / sides) * Math.PI * 2;
    const t1 = ph + ((i + 1) / sides) * Math.PI * 2;
    const P0 = c.clone().addScaledVector(_p1, Math.cos(t0) * r).addScaledVector(_p2, Math.sin(t0) * r);
    const P1 = c.clone().addScaledVector(_p1, Math.cos(t1) * r).addScaledVector(_p2, Math.sin(t1) * r);
    const uv = [W / 2, H / 2, ((Math.cos(t0) + 1) / 2) * W, ((Math.sin(t0) + 1) / 2) * H, ((Math.cos(t1) + 1) / 2) * W, ((Math.sin(t1) + 1) / 2) * H];
    _e1.subVectors(P0, c);
    _e2.subVectors(P1, c);
    _n.crossVectors(_e1, _e2);
    if (_n.dot(_ax) * dir >= 0) batch.tri(c.clone(), P0, P1, tile, uv, tint);
    else batch.tri(c.clone(), P1, P0, tile, [uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]], tint);
  }
}

/**
 * A module quad centred at `c`, `w` × `h` metres, its right along `right` and
 * up along `up` (unit vectors), facing right × up. `back` adds the reverse face
 * (the module mirrored so it reads the same way round from behind, or `backTile`).
 */
export function pwPanel(batch: PwBatch, c: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, w: number, h: number, tile: PwTile, o: { back?: boolean; backTile?: PwTile; flipU?: boolean; tint?: number } = {}) {
  const corner = c.clone().addScaledVector(right, -w / 2).addScaledVector(up, -h / 2);
  batch.rect(corner, right, up, w, h, tile, { flipU: o.flipU, tint: o.tint });
  if (o.back || o.backTile) {
    const neg = right.clone().negate();
    const c2 = c.clone().addScaledVector(right, w / 2).addScaledVector(up, -h / 2);
    batch.rect(c2, neg, up, w, h, o.backTile ?? tile, { flipU: o.backTile ? false : !o.flipU, tint: o.tint });
  }
}

/** A flat decal on the ground (facing up) centred at (x, y, z), `sx` × `sz` metres, turned by `yaw`. */
export function pwDecal(batch: PwBatch, x: number, y: number, z: number, sx: number, sz: number, yaw: number, tile: PwTile, tint?: number) {
  const ax = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const az = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const o = new THREE.Vector3(x, y, z).addScaledVector(ax, -sx / 2).addScaledVector(az, sz / 2);
  batch.rect(o, ax, az.clone().negate(), sx, sz, tile, { tint });
}

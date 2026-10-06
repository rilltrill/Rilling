import * as THREE from 'three';
import type { PwTile } from '../../pixelworld/atlas';
import { planarUv, type PwBatch } from '../../pixelworld/batch';
import { hash2 } from '../../pixelworld/surfaces';

/**
 * HIGHWAY TO HELL's rock in ART: PIXEL WORLD: the ridge the tunnel bores
 * through and the shore rocks are re-shaped (visual only: the classic lump is
 * just where the rock goes) as stepped desert cliffs: beds 2–3.6 m thick, each
 * a near-vertical face with a slight batter and a ledge on top, the ledges
 * wandering in and out round the lump (wide shelves, narrow lips), gullies cut
 * down through every bed, a broken crown of boulders on top. Flat shading
 * does the value structure the way a pixel artist would: lit ledge tops, mid
 * faces, dark undersides; the faces carry the painted strata, the ledges the
 * scrubby earth, the toe a damp dark band. No outline is a smooth dome.
 */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _n = new THREE.Vector3();

export interface RockTiles {
  /** Cliff faces (wrap; world-projected). */
  face: PwTile;
  /** Ledge tops (wrap; world-projected from above). */
  top: PwTile;
}

/** Ledge spots on the generated rock (world positions on lit shelves): scrub and dead trees go there. */
export interface RockLedge {
  x: number;
  y: number;
  z: number;
  /** Shelf depth (m): how big a plant fits. */
  room: number;
}

/** Smooth 1-D value noise round a circle (period `n` cells). */
function ring(u: number, n: number, seed: number): number {
  const x = (((u % 1) + 1) % 1) * n;
  const i = Math.floor(x);
  const f = x - i;
  const a = hash2(i % n, seed, 41);
  const b = hash2((i + 1) % n, seed, 41);
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}

/**
 * Emit one craggy lump in place of a classic jittered-ico lump placed by `m` (unit sphere → its
 * ellipsoid). `ground`: world y the rock stands on (its toe sinks a metre into it); `seed` from its
 * position. Returns the lit ledges (for plants).
 */
export function craggyLump(b: PwBatch, m: THREE.Matrix4, tiles: RockTiles, o: { ground: number; seed: number; segs?: number; crown?: number; toe?: number }): RockLedge[] {
  const e = m.elements;
  const sy = Math.hypot(e[4], e[5], e[6]);
  const cy = e[13];
  const N = o.segs ?? 18;
  const seed = o.seed;
  // Local y range: from just under the ground (or the bottom pole) to the top pole.
  const yb = Math.max(-1, (o.ground - 1 - cy) / sy);
  // Beds (world thickness 2.0–3.6 m).
  const ys: number[] = [yb];
  let y = yb;
  let k = 0;
  while (y < 0.93) {
    const t = (2.0 + hash2(k, seed, 7) * 1.6) / sy;
    y = Math.min(0.93, y + t);
    if (0.93 - y < 1.2 / sy) y = 0.93;
    ys.push(y);
    k++;
  }
  // Gullies: 2–3 notches cut down through every bed.
  const gullies: [number, number, number][] = [];
  const ng = 2 + Math.floor(hash2(seed, 3, 9) * 2);
  for (let g = 0; g < ng + 1; g++) gullies.push([hash2(seed, g, 11), 0.03 + hash2(seed, g, 12) * 0.03, 0.18 + hash2(seed, g, 13) * 0.14]);
  const rad = (layer: number, u: number, top: boolean) => {
    // Each bed's own outline (a ledge wide here, a lip there), plus the gullies.
    // Quantised a little: ledges run in straight-ish facets with corners, not round.
    const n1 = ring(u + layer * 0.37, 5, seed * 31 + layer);
    let r = 1 + (Math.round(n1 * 4) / 4 - 0.5) * 0.34 + (ring(u * 2 + layer * 0.11, 9, seed * 17 + layer) - 0.5) * 0.14;
    for (const [gu, gw, gd] of gullies) {
      let du = Math.abs(u - gu);
      du = Math.min(du, 1 - du);
      if (du < gw) r -= gd * (1 - du / gw);
    }
    if (top) r *= 0.94;
    return r;
  };
  // Rings: per bed, its foot (full outline) and its lip (battered in a little); the next bed starts
  // at the lip's height with its own (smaller, above the equator) outline: the ledge between.
  const rings: { y: number; pts: THREE.Vector3[] }[] = [];
  // A butte, not a dome: near-vertical walls (a little batter) up to the shoulder, then the crown
  // steps in fast; a scree apron flares at the foot.
  // (A lump that floats — the crown over the bore — keeps a rounded underside: it must not hang
  // in front of the portal's face.)
  const floating = yb <= -0.999;
  const env = (yy: number) => {
    if (floating && yy < 0) return Math.sqrt(Math.max(0.02, 1 - yy * yy));
    const t = floating ? 0.12 + yy * 0.88 : (yy - yb) / (1 - yb);
    if (t < 0.12) return 1.12 - t * 0.9;
    if (t < 0.62) return 1.01 - (t - 0.12) * 0.22;
    return Math.max(0.2, 0.9 - (t - 0.62) * 1.9);
  };
  for (let i = 0; i + 1 < ys.length; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    const mid = y0 + (y1 - y0) * (y0 >= 0 ? 0.75 : 0.25);
    const R = env(mid);
    const foot: THREE.Vector3[] = [];
    const lip: THREE.Vector3[] = [];
    const yl = y1 - (y1 - y0) * 0.12;
    for (let j = 0; j < N; j++) {
      const u = j / N;
      const a = u * Math.PI * 2;
      const r = R * rad(i, u, false);
      foot.push(new THREE.Vector3(Math.cos(a) * r, y0, Math.sin(a) * r));
      const rl = r * (0.93 + hash2(j, i, seed) * 0.05);
      lip.push(new THREE.Vector3(Math.cos(a) * rl, yl, Math.sin(a) * rl));
    }
    rings.push({ y: y0, pts: foot }, { y: yl, pts: lip });
  }
  // Crown: a broken cap of boulders (a few raised spikes round a low summit).
  const crown = o.crown ?? 1;
  const topY = ys[ys.length - 1];
  const capR = env(topY) * 0.7;
  const cap: THREE.Vector3[] = [];
  for (let j = 0; j < N; j++) {
    const u = j / N;
    const a = u * Math.PI * 2;
    const r = capR * rad(ys.length, u, true);
    const lift = hash2(j, seed, 19) > 0.62 ? (0.9 + hash2(j, seed, 23) * 1.6) / sy : 0;
    cap.push(new THREE.Vector3(Math.cos(a) * r, topY + lift * crown, Math.sin(a) * r));
  }
  rings.push({ y: topY, pts: cap });
  const summit = new THREE.Vector3(0, topY + ((0.6 + hash2(seed, 5, 29) * 1.4) / sy) * crown, 0);
  // Emit (world space), face / ledge / toe by the facet's world normal and height.
  const ledges: RockLedge[] = [];
  const toe = o.toe ?? o.ground + 1.3;
  const tri = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3) => {
    _a.copy(p0).applyMatrix4(m);
    _b.copy(p1).applyMatrix4(m);
    _c.copy(p2).applyMatrix4(m);
    _e1.subVectors(_b, _a);
    _e2.subVectors(_c, _a);
    _n.crossVectors(_e1, _e2);
    const l = _n.length();
    if (l < 1e-9) return;
    _n.multiplyScalar(1 / l);
    const ledge = _n.y > 0.62;
    const t = ledge ? tiles.top : tiles.face;
    const ymin = Math.min(_a.y, _b.y, _c.y);
    // Value: ledges full light (the sun does the rest), faces a touch under, undersides and the
    // damp toe darker, a cool tint in the gullies' shade.
    const tint = ymin < toe && !ledge ? 0x9a8a92 : _n.y < -0.25 ? 0xb4a8b4 : ledge ? 0xffffff : 0xece4e4;
    const [ua, va] = planarUv(_a, _n, t.density);
    const [ub, vb] = planarUv(_b, _n, t.density);
    const [uc, vc] = planarUv(_c, _n, t.density);
    const su = Math.floor(Math.min(ua, ub, uc) / t.w) * t.w;
    const sv = Math.floor(Math.min(va, vb, vc) / t.h) * t.h;
    b.tri(_a, _b, _c, t, [ua - su, va - sv, ub - su, vb - sv, uc - su, vc - sv], tint);
    if (ledge && l > 3 && ledges.length < 6) {
      const cx = (_a.x + _b.x + _c.x) / 3;
      const cz = (_a.z + _b.z + _c.z) / 3;
      const yy = Math.max(_a.y, _b.y, _c.y);
      if (yy > o.ground + 3) ledges.push({ x: cx, y: (_a.y + _b.y + _c.y) / 3, z: cz, room: Math.sqrt(l) });
    }
  };
  const prev = b.matrix.clone();
  b.setMatrix(null);
  // Facets are emitted outward (counter-clockwise seen from outside).
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i].pts;
    const B = rings[i + 1].pts;
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      tri(A[j], B[j], B[j1]);
      tri(A[j], B[j1], A[j1]);
    }
  }
  for (let j = 0; j < N; j++) tri(cap[j], summit, cap[(j + 1) % N]);
  b.setMatrix(prev);
  return ledges;
}

import * as THREE from 'three';
import type { V3 } from '../../../core/types';

/**
 * World layout for ST. MERCY HOSPITAL (z2). Units: metres, Y up.
 *
 *   start (z +24) ─ ambulance bay ─ ER doors (z −26)
 *                                   │ ER / triage
 *                                   └──→ corridor A (+X) ──→ ward ──→ nurse hub
 *                                                                       │ stairwell
 *                                                                       ↓ (down to B1, y −4.5)
 *                                                                     morgue
 *                                                                       │ corridor B
 *                                                                     surgery (OR)
 *                                     atrium (boss) ←── corridor C ←────┘
 *
 * All rooms are axis-aligned boxes. Every shared wall is built by exactly one
 * room (see env.ts). Rail keeps ≥ 1.2 m from every wall face.
 */

/** Basement floor height. */
export const B = -4.5;

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export interface RoomRect extends Rect {
  y: number;
  h: number;
}

export const R = {
  bay: { x0: -18, x1: 18, z0: -26, z1: 30 } as Rect,
  er: { x0: -11, x1: 11, z0: -50, z1: -26, y: 0, h: 4.2 } as RoomRect,
  corrA: { x0: 11, x1: 53, z0: -46.3, z1: -41.7, y: 0, h: 3.2 } as RoomRect,
  ward: { x0: 53, x1: 75, z0: -51, z1: -37, y: 0, h: 3.6 } as RoomRect,
  hub: { x0: 75, x1: 89, z0: -51, z1: -37, y: 0, h: 3.6 } as RoomRect,
  stair: { x0: 75, x1: 83, z0: -75, z1: -51, y: B, h: 8.1 } as RoomRect,
  morgue: { x0: 71, x1: 87, z0: -95, z1: -75, y: B, h: 4.2 } as RoomRect,
  corrB: { x0: 76.7, x1: 81.3, z0: -108, z1: -95, y: B, h: 3.2 } as RoomRect,
  or: { x0: 71, x1: 87, z0: -126, z1: -108, y: B, h: 5.0 } as RoomRect,
  gallery: { x0: 87, x1: 91, z0: -121.5, z1: -112.5, y: B + 2.4, h: 2.6 } as RoomRect,
  corrC: { x0: 52, x1: 71, z0: -123.3, z1: -118.7, y: B, h: 3.4 } as RoomRect,
  boiler: { x0: 56.5, x1: 63.5, z0: -128.5, z1: -123.3, y: B, h: 3.4 } as RoomRect,
  atrium: { x0: 22, x1: 52, z0: -136, z1: -106, y: B, h: 18 } as RoomRect,
};

/** Stairs: upper landing ends at STAIR_TOP, flight descends to STAIR_BOT. */
export const STAIR_TOP = -58;
export const STAIR_BOT = -67;

/** Boss pool centre. */
export const POOL: V3 = [35, B, -121];

export const RAIL: V3[] = [
  [0, 0, 29],
  [0, 0, 12],
  [0, 0, 0],
  [0, 0, -14],
  [0, 0, -26],
  [0, 0, -33],
  [1.6, 0, -40.2],
  [6, 0, -43.6],
  [11, 0, -44],
  [22, 0, -44],
  [34, 0, -44],
  [46, 0, -44],
  [56, 0, -44],
  [66, 0, -44],
  [72, 0, -44.1],
  [76.2, 0, -45.2],
  [78.6, 0, -48.4],
  [79, 0, -52],
  [79, 0, -57.2],
  [79, -2.25, -62.5],
  [79, B, -67.8],
  [79, B, -72],
  [79, B, -80],
  [79, B, -90],
  [79, B, -100],
  [79, B, -108.5],
  [78.6, B, -114.5],
  [76, B, -119.3],
  [71, B, -121],
  [64, B, -121],
  [57, B, -121],
  [51.5, B, -121],
  [47, B, -121],
];

/** Ground height at world (x, z). */
export function groundAt(x: number, z: number): number {
  if (z > STAIR_TOP) return 0;
  if (z < STAIR_BOT) {
    const g = R.gallery;
    if (x > g.x0 + 0.15 && x < g.x1 && z > g.z0 && z < g.z1) return g.y;
    return B;
  }
  return B * ((STAIR_TOP - z) / (STAIR_TOP - STAIR_BOT));
}

// ─── Rail-distance lookup (same curve construction as RailRig) ──────────────

const curve = new THREE.CatmullRomCurve3(
  RAIL.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
  false,
  'centripetal',
);
curve.arcLengthDivisions = Math.max(200, RAIL.length * 40);
curve.updateArcLengths();
export const RAIL_LENGTH = curve.getLength();

const SAMPLES: { d: number; x: number; z: number }[] = [];
{
  const v = new THREE.Vector3();
  for (let d = 0; d <= RAIL_LENGTH; d += 0.25) {
    curve.getPointAt(Math.min(1, d / RAIL_LENGTH), v);
    SAMPLES.push({ d, x: v.x, z: v.z });
  }
}

/** Rail distance (metres) of the rail point nearest to world (x, z). */
export function dAt(x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  for (const s of SAMPLES) {
    const dd = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (dd < bd) {
      bd = dd;
      best = s.d;
    }
  }
  return Math.round(best * 10) / 10;
}

/** World point on the rail at distance d. */
export function railPoint(d: number, out = new THREE.Vector3()): THREE.Vector3 {
  return curve.getPointAt(THREE.MathUtils.clamp(d / RAIL_LENGTH, 0, 1), out);
}

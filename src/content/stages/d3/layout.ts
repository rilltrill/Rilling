import * as THREE from 'three';
import type { V3 } from '../../../core/types';

/**
 * TYRANT CHASE layout: the rail and the rail distance (metres) of every
 * landmark. Scenery, set pieces, the boss and the beat script all key off
 * these numbers so the world and the script stay in sync.
 *
 * The ground route measures ≈ 568 m; the last stretch of rail climbs into the
 * sky (the helicopter escape).
 */
export const RAIL: V3[] = [
  [0, 0, 0],
  [0, 0, -40],
  [3, 0, -80],
  [10, 0, -118],
  [14, 0, -155],
  [10, 0, -192],
  [2, 0, -228],
  [-6, 0, -262],
  [-10, 0, -296],
  [-10, 0, -330],
  [-10, 0, -350],
  [-10, 0, -390],
  [-8, 0, -420],
  [-2, 0, -455],
  [6, 0, -490],
  [10, 0, -525],
  [10, 0, -548],
  [10, 0, -566],
  [10.5, 1.2, -578],
  [12, 7, -592],
  [14.5, 16, -603],
  [17.5, 26, -610],
];

export const D = {
  /** T-rex paddock: concrete pylons + high-voltage cables on the RIGHT. */
  FENCE_FROM: 6,
  FENCE_TO: 122,
  FENCE_SIDE: 10.5,
  /** The torn section of the paddock fence. */
  GAP_FROM: 53,
  GAP_TO: 65,
  HOLD_FENCE: 42,
  /** Dark visitor centre on the LEFT. */
  VISITOR: 184,
  VISITOR_SIDE: -30,
  HOLD_VISITOR: 168,
  /** Roadblock across the road: overturned tour car, fallen palm, sawhorses. */
  ROADBLOCK: 253,
  HOLD_ROADBLOCK: 238,
  /** Flooded, muddy stretch where the jeep bogs down. */
  MUD_FROM: 295,
  MUD_TO: 320,
  HOLD_MUD: 307,
  /** Wooden trestle bridge over the river gorge (straight stretch). */
  BRIDGE_FROM: 339,
  BRIDGE_TO: 383,
  GORGE_FROM: 341,
  GORGE_TO: 381,
  /** Jeep stops past the bridge to watch it fall. */
  COLLAPSE_STOP: 395,
  /** Boss chase: rig never passes HELI_APPROACH before the final phase. */
  BOSS_START: 395,
  /** Phase 1 chase never takes the jeep past this point. */
  P0_LIMIT: 486,
  HELI_APPROACH: 515,
  HELI_STOP: 548,
  /** Fuel tank by the helipad entrance (left of the road). */
  FUEL: 531,
  FUEL_SIDE: -6.8,
  /** Helipad: concrete pad centred on the rail. */
  PAD: 558,
  PAD_HALF: 13,
  HELI: 569,
  BOARD: 557,
  LIFT_FROM: 566,
  END: 625,
} as const;

/** Depth of the gorge floor below the road. */
export const GORGE_DEPTH = 17;
/** Half-width of the road. */
export const ROAD_HALF = 3.6;

// ─── Rail helpers (same curve parameters as RailRig) ────────────────────────

let curve: THREE.CatmullRomCurve3 | null = null;
let length = 0;

export function railCurve(): THREE.CatmullRomCurve3 {
  if (!curve) {
    curve = new THREE.CatmullRomCurve3(
      RAIL.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      false,
      'centripetal',
    );
    curve.arcLengthDivisions = Math.max(200, RAIL.length * 40);
    curve.updateArcLengths();
    length = curve.getLength();
  }
  return curve;
}

export function railLength(): number {
  railCurve();
  return length;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Rail point at distance d (clamped). */
export function railPoint(d: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = railCurve();
  return c.getPointAt(THREE.MathUtils.clamp(d / length, 0, 1), out);
}

/** Rail heading at d, exactly as RailRig.headingAt computes it (chord to d + 4). */
export function railHeading(d: number): number {
  const c = railCurve();
  const u0 = THREE.MathUtils.clamp(d / length, 0, 1);
  const u1 = THREE.MathUtils.clamp((d + 4) / length, 0, 1);
  c.getPointAt(u0, _a);
  if (u1 - u0 < 1e-4) c.getTangentAt(u0, _b);
  else c.getPointAt(u1, _b).sub(_a);
  return Math.atan2(-_b.x, -_b.z);
}

/** World position `lat` metres right of the rail at distance d (y = up, ground assumed 0). */
export function worldAt(d: number, lat: number, up = 0, out = new THREE.Vector3()): THREE.Vector3 {
  railPoint(d, out);
  const h = railHeading(d);
  out.x += Math.cos(h) * lat;
  out.z += -Math.sin(h) * lat;
  out.y = up;
  return out;
}

/**
 * Rig-relative [right, up, forward] of the point `lat` m beside the rail at
 * `dTarget`, as seen from a rig stopped at `dRig` — so beat scripts can aim
 * spawns and look targets at landmarks precisely.
 */
export function rel(dRig: number, dTarget: number, lat: number, up = 0): V3 {
  const p = worldAt(dTarget, lat, up, new THREE.Vector3());
  const o = railPoint(dRig, new THREE.Vector3());
  const h = railHeading(dRig);
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const right = dx * Math.cos(h) - dz * Math.sin(h);
  const fwd = -dx * Math.sin(h) - dz * Math.cos(h);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return [r2(right), up, r2(fwd)];
}

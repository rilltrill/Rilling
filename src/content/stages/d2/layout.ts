import * as THREE from 'three';
import type { V3 } from '../../../core/types';

/**
 * RESEARCH LABS layout. The building is a chain of rooms along -Z; every
 * room is an axis-aligned box [x0, x1] × [z1, z0] (z0 > z1, forward is -Z)
 * and consecutive rooms share a transverse wall with a doorway where the
 * rail crosses it. The maintenance tunnel bends, so its walls follow the
 * rail curve instead.
 *
 * Beat distances are derived from the same curve the RailRig builds, so the
 * script, the scenery and the camera all agree.
 */

export const RAIL: V3[] = [
  [2.5, 0, 4],
  [2.5, 0, -10],
  [2.0, 0, -26],
  [0.8, 0, -42],
  [0, 0, -56],
  [0, 0, -68],
  [0, 0, -80],
  [-2.4, 0, -92],
  [-3.2, 0, -104],
  [-2.0, 0, -116],
  [0, 0, -124],
  [0, 0, -143],
  [0, 0, -162],
  [0, 0, -178],
  [0, 0, -194],
  [0, 0, -206],
  [0, 0, -218],
  [0, 0, -228],
  [2.2, 0, -238],
  [6.5, 0, -247],
  [10, 0, -257],
  [11, 0, -268],
  [11, 0, -278],
  [11, 0, -286],
  [11, 0, -296],
  [11, 0, -312],
  [11, 0, -328],
  [11, 0, -336],
];

export interface Room {
  id: string;
  x0: number;
  x1: number;
  /** Near (entry) wall z — the larger value. */
  z0: number;
  /** Far (exit) wall z. */
  z1: number;
  h: number;
}

export const ROOMS = {
  lobby: { id: 'lobby', x0: -15, x1: 15, z0: 8, z1: -56, h: 15 },
  shop: { id: 'shop', x0: -8, x1: 8, z0: -56, z1: -80, h: 4.4 },
  green: { id: 'green', x0: -14, x1: 14, z0: -80, z1: -124, h: 11 },
  hatch: { id: 'hatch', x0: -10, x1: 10, z0: -124, z1: -162, h: 4.8 },
  kitchen: { id: 'kitchen', x0: -9, x1: 9, z0: -162, z1: -194, h: 4.2 },
  servers: { id: 'servers', x0: -8, x1: 8, z0: -194, z1: -218, h: 3.8 },
  pump: { id: 'pump', x0: 3, x1: 19, z0: -276, z1: -294, h: 5.5 },
  wing: { id: 'wing', x0: -1, x1: 23, z0: -294, z1: -328, h: 7.5 },
  hall: { id: 'hall', x0: -7, x1: 29, z0: -328, z1: -382, h: 11 },
} satisfies Record<string, Room>;

/** Maintenance tunnel: walls follow the rail between these z values. */
export const TUNNEL = { z0: -218, z1: -276, half: 2.6, h: 3.3 };

// ─── Curve helpers (identical construction to RailRig.setPath) ─────────────

export const CURVE = (() => {
  const c = new THREE.CatmullRomCurve3(
    RAIL.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    'centripetal',
  );
  c.arcLengthDivisions = Math.max(200, RAIL.length * 40);
  c.updateArcLengths();
  return c;
})();

export const RAIL_LEN = CURVE.getLength();

const _p = new THREE.Vector3();

/** Rail distance (m) where the rail crosses world z (the rail is monotonic in z). */
export function dAtZ(z: number): number {
  let lo = 0;
  let hi = RAIL_LEN;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    CURVE.getPointAt(mid / RAIL_LEN, _p);
    if (_p.z > z) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

/** Rail x at world z. */
export function railXAtZ(z: number): number {
  CURVE.getPointAt(dAtZ(z) / RAIL_LEN, _p);
  return _p.x;
}

/** Tunnel landmarks (rail distances): ceiling ducts the compys drop from, the side alcove. */
export const TUNNEL_SPOTS = {
  vents: [dAtZ(-231), dAtZ(-238.5)],
  alcove: dAtZ(-251),
  ambush: dAtZ(-243.5),
};

/** Pump room side-tunnel openings (z). */
export const PUMP_SIDE_Z = -287;

/** Rail distances of every hold / landmark. */
export const D = {
  LOBBY_IN: dAtZ(-6),
  LOBBY_HOLD: dAtZ(-11),
  LOBBY_HOLD2: dAtZ(-20),
  SHOP_DOOR: dAtZ(-56),
  SHOP_HOLD: dAtZ(-61),
  GREEN_HOLD: dAtZ(-88),
  GREEN_EXIT: dAtZ(-118),
  HATCH_HOLD: dAtZ(-131),
  KITCHEN_HOLD: dAtZ(-167),
  SERVER_HOLD: dAtZ(-198),
  TUNNEL_IN: dAtZ(-221),
  TUNNEL_MID: dAtZ(-246),
  PUMP_HOLD: dAtZ(-277.6),
  WING_HOLD: dAtZ(-299),
  WING_EXIT: dAtZ(-322),
  END: Math.floor(RAIL_LEN * 100) / 100,
};

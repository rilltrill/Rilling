import * as THREE from 'three';
import type { V3 } from '../../../core/types';

/**
 * HIGHWAY TO HELL layout: the rail and the rail distances (metres) of every
 * landmark. Scenery, set pieces and beats all key off these numbers so the
 * script and the world stay in sync.
 *
 * Cross-section (rig-relative x, metres): our carriageway is centred on the
 * rail (lanes −5.4…+5.4), the median jersey barrier sits at x = −7, the
 * oncoming carriageway spans −8.5…−20 and the right guard rail is at +7.6.
 * On the bridge the same cross-section continues between two railings.
 */
export const RAIL: V3[] = [
  [0, 0, 0],
  [0, 0, -50],
  [-6, 0, -120],
  [-10, 0, -190],
  [-6, 0, -260],
  [4, 0, -330],
  [12, 0, -400],
  [14, 0, -470],
  [10, 0, -540],
  [4, 0, -610],
  [0, 0, -680],
  [0, 0, -740],
  [0, 0, -800],
  [0, 0, -1190],
];

/** Lateral offsets (rig-relative x). */
export const X = {
  LANE_HALF: 5.6,
  MEDIAN: -7,
  ONCOMING: -14.2,
  FAR_EDGE: -20.6,
  RAIL_R: 7.6,
  /** Road surface half-widths for the asphalt ribbon. */
  ROAD_L: -21.2,
  ROAD_R: 8.4,
};

/** Rail distances. */
export const D = {
  /** First chase on the outbound lanes. */
  ONRAMP_END: 132,
  /** Multi-car pile-up blocks all lanes (truck stops at PILEUP_STOP). */
  PILEUP_STOP: 146,
  PILEUP: 160,
  /** Concrete overpass with spitters on the deck. */
  OVERPASS: 268,
  OVERPASS_SLOW_FROM: 226,
  OVERPASS_END: 300,
  /** Billboard alley + oncoming car crash. */
  BILLBOARDS_FROM: 312,
  CAR_CRASH: 368,
  /** Overturned tanker across the lanes. */
  TANKER_STOP: 432,
  TANKER: 447,
  /** Tunnel through the ridge. */
  TUNNEL_FROM: 520,
  TUNNEL_TO: 652,
  STALL: 590,
  /** Suspension bridge (straight). */
  BRIDGE_FROM: 726,
  TOWER_A: 800,
  TOWER_B: 1010,
  BRIDGE_TO: 1150,
  /** Army barricade on the bridge. */
  BARRICADE_STOP: 760,
  BARRICADE: 774,
  /** Boss chase. */
  BOSS_START: 776,
  BOSS_END: 1112,
  END: 1176,
};

let cached: THREE.CatmullRomCurve3 | null = null;

/** The rail curve, built exactly like RailRig.setPath builds it. */
export function railCurve(): THREE.CatmullRomCurve3 {
  if (cached) return cached;
  const c = new THREE.CatmullRomCurve3(
    RAIL.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    'centripetal',
  );
  c.arcLengthDivisions = Math.max(200, RAIL.length * 40);
  c.updateArcLengths();
  cached = c;
  return c;
}

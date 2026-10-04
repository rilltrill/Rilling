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
  HELI_APPROACH: 518,
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

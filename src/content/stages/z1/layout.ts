import type { V3 } from '../../../core/types';

/**
 * World layout for MAIN STREET (z1). One small-town block grid, night.
 *
 *            N (-Z)
 *   ┌────────── town square (z -262 … -304) ──────────┐
 *   │   hotel   PRIME MEATS   bank      clock tower    │
 *   │  shops     (boss)         bandstand             │
 *   └──── Second St (x = -58) ──┐                      │
 *        bus  ↑                 │                      │
 *   gas station ↑               │                      │
 *        alley ← ← ← ← ← ←  Main St (x = 0)           │
 *                               ↑   pharmacy / bar     │
 *                               ↑   diner / rialto     │
 *                               ↑   police barricade   │
 *                             start (z = +6)           │
 */

/** Main Street centreline x, facades at ±MAIN_FACADE. */
export const MAIN_X = 0;
export const MAIN_FACADE = 9.5;
export const MAIN_ROAD = 6;

/** Cross street on Main Street (z range). */
export const CROSS_Z0 = -88;
export const CROSS_Z1 = -102;

/** Alley: centreline z, walls. */
export const ALLEY_Z = -155;
export const ALLEY_S = -151.5;
export const ALLEY_N = -158.5;

/** Second Street centreline x, facades. */
export const SECOND_X = -58;
export const SECOND_W = -67.5;
export const SECOND_E = -48.5;

/** Town square bounds. */
export const SQ_Z0 = -262;
export const SQ_Z1 = -304;
export const SQ_X0 = -66;
export const SQ_X1 = -26;

/** Gas station lot on the west side of Second Street. */
export const GAS_Z0 = -192;
export const GAS_Z1 = -228;

/** Overturned school bus (centre, yaw). */
export const BUS_POS: V3 = [-53.2, 0, -248];
export const BUS_YAW = 0.38;

/** Camera rail (world coords). Straight streets joined by rounded corners. */
export const RAIL: V3[] = [
  [0, 0, 6],
  [0, 0, -40],
  [0, 0, -90],
  [0, 0, -125],
  [0, 0, -138],
  [-2.3, 0, -146.5],
  [-8.5, 0, -152.7],
  [-17, 0, -155],
  [-30, 0, -155],
  [-44, 0, -155],
  [-51, 0, -156.9],
  [-56.1, 0, -162],
  [-58, 0, -169],
  [-58, 0, -200],
  [-58, 0, -228],
  [-60.6, 0, -244],
  [-59.6, 0, -258],
  [-58, 0, -268],
  [-58, 0, -284],
];

/** Footprints that count as walkable "ground" above y = 0 (rooftops spitters stand on). */
export interface RoofPad {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
}
export const ROOF_PADS: RoofPad[] = [
  // Newsstand kiosks in the square (spitter perches, within 9 m of the camera hold).
  { x0: -64.6, x1: -61.4, z0: -278.4, z1: -275.6, y: 3.0 },
  { x0: -55.2, x1: -52.0, z0: -278.6, z1: -275.8, y: 3.0 },
];

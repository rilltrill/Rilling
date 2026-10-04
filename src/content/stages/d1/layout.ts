import type { V3 } from '../../../core/types';

/**
 * JUNGLE RUN layout: the rail and the rail distances (metres) of every
 * landmark. Scenery, set pieces and beats all key off these numbers so the
 * script and the world stay in sync.
 */
export const RAIL: V3[] = [
  [0, 0, 0],
  [0, 0, -40],
  [3, 0, -80],
  [10, 0, -120],
  [13, 0, -160],
  [10, 0, -200],
  [3, 0, -240],
  [0, 0, -280],
  [-4, 0, -320],
  [-6, 0, -360],
  [-3, 0, -400],
  [4, 0, -440],
  [9, 0, -480],
  [10, 0, -520],
  [7, 0, -560],
  [3, 0, -600],
  [0, 0, -640],
  [-2, 0, -680],
];

/** Approximate rail length (the curve measures ≈ 683.6 m). */
export const RAIL_END = 682;

export const D = {
  /** Big wooden park gate across the road. */
  GATE: 30,
  /** First stop: compy ambush (teaches the mounted gun). */
  COMPY_HOLD: 64,
  /** Raptor chase, part 1 ends here. */
  CHASE_SPLIT: 138,
  /** Electric fence along the LEFT side of the road. */
  FENCE_FROM: 98,
  FENCE_TO: 216,
  FENCE_SIDE: -10,
  /** Where raptors smash through the fence. */
  FENCE_BREAK: 166,
  /** Jeep stops in front of the fallen tree. */
  TREE_HOLD: 233,
  TREE: 247,
  /** Open meadow (stampede + trike). */
  MEADOW_FROM: 266,
  MEADOW_TO: 372,
  STAMPEDE_WAIT: 296,
  STAMPEDE_CROSS: 321,
  TRIKE_HOLD: 329,
  /** Toppled tour vehicle on the right verge. */
  CAR: 356,
  CAR_SIDE: 4.6,
  /** Cliffs on the LEFT, waterfall pouring into a pool that feeds the river. */
  CLIFF_FROM: 384,
  CLIFF_TO: 484,
  WATERFALL: 462,
  /** River ford (road crosses the river). */
  FORD_HOLD: 497,
  FORD: 501,
  /** Riverside road: river on the RIGHT, treeline on the left. Boss chase. */
  BOSS_START: 526,
  END: RAIL_END,
};

/**
 * River centre-line in (rail distance, lateral offset) pairs: from the
 * waterfall pool on the left, across the road at the ford, then running
 * along the right side of the road to the end.
 */
export const RIVER: [number, number][] = [
  [440, -60],
  [452, -44],
  [466, -30],
  [480, -18],
  [492, -7],
  [501, 0],
  [510, 7],
  [522, 14],
  [540, 18],
  [570, 19],
  [600, 18],
  [630, 19],
  [660, 18],
  [690, 18],
  [720, 18],
];
export const RIVER_WIDTH = 12;

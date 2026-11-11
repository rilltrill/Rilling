import type { PoseKey } from './skeleton';

/**
 * DRAWN FIGURES: hand-authored keyframes (angles in degrees on the designed skeleton). Six frames
 * a cycle at about 12 a second, like sprite sheets of the period: the extremes are designed (a foot
 * planted, the other swinging, the shoulders against the hips), never interpolated curves.
 */

const zPose = (o: PoseKey): PoseKey => ({ cLean: 8, sLean: 6, lean: 4, hPitch: 10, ...o });

/** A zombie standing: weight on one leg, one shoulder dropped, an arm dragging, the head lolling. */
export const ZIDLE: PoseKey[] = [
  zPose({ px: 0.08, tilt: 5, sTilt: -4, cTilt: -9, cLean: 10, sLean: 8, hRoll: -13, aL: [2, 5, 10], aR: [14, 12, 30], lL: [4, 3, 8], lR: [-3, 6, 4], py: -0.05 }),
];

/** A linear in-between of two keys (an animator's in-between; the keys hold the design). */
export function blendKey(a: PoseKey, b: PoseKey, t: number): PoseKey {
  const mix = (x: number | undefined, y: number | undefined) => (x ?? 0) + ((y ?? 0) - (x ?? 0)) * t;
  const arr = (x: readonly (number | undefined)[] | undefined, y: readonly (number | undefined)[] | undefined): [number, number, number, number] => [mix(x?.[0], y?.[0]), mix(x?.[1], y?.[1]), mix(x?.[2], y?.[2]), mix(x?.[3], y?.[3])];
  return {
    px: mix(a.px, b.px),
    py: mix(a.py, b.py),
    pz: mix(a.pz, b.pz),
    lean: mix(a.lean, b.lean),
    tilt: mix(a.tilt, b.tilt),
    turn: mix(a.turn, b.turn),
    sLean: mix(a.sLean, b.sLean),
    sTilt: mix(a.sTilt, b.sTilt),
    sTurn: mix(a.sTurn, b.sTurn),
    cLean: mix(a.cLean, b.cLean),
    cTilt: mix(a.cTilt, b.cTilt),
    cTurn: mix(a.cTurn, b.cTurn),
    hPitch: mix(a.hPitch, b.hPitch),
    hRoll: mix(a.hRoll, b.hRoll),
    hYaw: mix(a.hYaw, b.hYaw),
    aL: arr(a.aL, b.aL),
    aR: arr(a.aR, b.aR),
    lL: arr(a.lL, b.lL),
    lR: arr(a.lR, b.lR),
  };
}

/** Doubles a cycle with in-betweens (six keys drawn, twelve frames shown: about 12 a second at a walk). */
function doubled(keys: PoseKey[]): PoseKey[] {
  const out: PoseKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    out.push(keys[i], blendKey(keys[i], keys[(i + 1) % keys.length], 0.5));
  }
  return out;
}

/** Zombie shamble, six frames: a stiff planted leg, the other dragged through. */
const ZSHAMBLE6: PoseKey[] = [
  // 0: left foot planted forward, right trailing.
  zPose({ px: 0.05, py: -0.06, tilt: 5, sTilt: -4, cTilt: -8, cLean: 10, turn: 6, sTurn: -10, hRoll: -12, aL: [-4, 5, 12], aR: [32, 16, 34], lL: [20, 4, 8], lR: [-14, 8, 16] }),
  // 1: weight rolling onto the left leg.
  zPose({ px: 0.09, py: -0.02, tilt: 7, sTilt: -5, cTilt: -9, cLean: 10, turn: 3, sTurn: -7, hRoll: -14, aL: [2, 5, 14], aR: [26, 16, 36], lL: [8, 4, 10], lR: [-12, 8, 34] }),
  // 2: passing: the right foot dragged past.
  zPose({ px: 0.08, py: 0.05, tilt: 6, sTilt: -4, cTilt: -8, cLean: 9, turn: -3, sTurn: 2, hRoll: -11, aL: [12, 6, 20], aR: [14, 14, 30], lL: [-2, 4, 6], lR: [2, 10, 48] }),
  // 3: right foot forward.
  zPose({ px: -0.05, py: -0.06, tilt: -5, sTilt: 5, cTilt: -3, cLean: 8, turn: -6, sTurn: 10, hRoll: -10, aL: [30, 12, 34], aR: [-4, 12, 16], lL: [-16, 8, 20], lR: [18, 6, 8] }),
  // 4: weight rolling onto the right leg.
  zPose({ px: -0.09, py: -0.02, tilt: -7, sTilt: 6, cTilt: -1, cLean: 8, turn: -3, sTurn: 7, hRoll: -8, aL: [24, 12, 30], aR: [2, 12, 20], lL: [-12, 8, 36], lR: [8, 6, 10] }),
  // 5: passing: the left foot dragged past.
  zPose({ px: -0.08, py: 0.04, tilt: -6, sTilt: 5, cTilt: -4, cLean: 8, turn: 3, sTurn: -2, hRoll: -11, aL: [12, 10, 28], aR: [12, 12, 24], lL: [4, 10, 44], lR: [-2, 6, 6] }),
];

/** The cycle shown: twelve frames. */
export const ZSHAMBLE: PoseKey[] = doubled(ZSHAMBLE6);

/** Arms coming up to grab: two frames rising, one at full reach. */
export const ZWINDUP: PoseKey[] = [
  zPose({ py: -0.1, cLean: 14, hPitch: 4, hRoll: -10, cTilt: -6, aL: [50, 7, 40], aR: [60, 8, 36], lL: [10, 6, 16], lR: [-6, 10, 12] }),
  zPose({ py: -0.14, cLean: 18, hPitch: -6, hRoll: -6, cTilt: -3, aL: [85, 7, 30], aR: [95, 9, 26], lL: [14, 6, 18], lR: [-12, 12, 18] }),
  zPose({ py: -0.2, cLean: 22, lean: 8, hPitch: -14, hRoll: 0, aL: [112, 8, 16], aR: [120, 9, 14], lL: [20, 8, 24], lR: [-20, 12, 26] }),
];

/** The lunge: the whole body thrown at the camera. */
export const ZLUNGE: PoseKey[] = [
  zPose({ py: -0.26, lean: 16, cLean: 24, hPitch: -20, aL: [125, 8, 10], aR: [130, 9, 8], lL: [26, 8, 30], lR: [-26, 12, 20] }),
];

/** Rocked back by a hit. */
export const ZSTAGGER: PoseKey[] = [
  zPose({ py: -0.1, lean: -8, cLean: -12, sLean: -8, hPitch: -18, hRoll: 16, tilt: 3, sTilt: 8, aL: [-16, 30, 24], aR: [-14, 34, 30], lL: [-6, 8, 16], lR: [10, 14, 6] }),
  zPose({ py: -0.16, lean: -3, cLean: 6, sLean: 2, hPitch: 16, hRoll: -18, tilt: -6, sTilt: -10, aL: [10, 22, 40], aR: [-4, 28, 18], lL: [4, 10, 28], lR: [-8, 10, 12] }),
];

/** Going down: knees go, the body folds and drops. */
export const ZDEATH: PoseKey[] = [
  zPose({ py: -0.3, lean: -10, cLean: -6, hPitch: -24, hRoll: 14, aL: [-10, 34, 30], aR: [-18, 40, 26], lL: [18, 10, 40], lR: [8, 14, 30] }),
  zPose({ py: -1.3, lean: 10, cLean: 18, sLean: 12, hPitch: 30, hRoll: -14, aL: [8, 22, 34], aR: [20, 18, 28], lL: [70, 14, 110], lR: [60, 18, 118] }),
  // Kneeling, folding over.
  { noGround: true, py: -2.0, lean: 26, cLean: 30, sLean: 14, hPitch: 30, hRoll: -24, aL: [30, 10, 40], aR: [50, 14, 24], lL: [80, 14, 130], lR: [86, 18, 134] },
  // Fallen on the back, drawn lying in the ground plane (foreshortened toward the viewer).
  { noGround: true, py: -2.9, lean: -72, sLean: -6, cLean: -8, hPitch: 6, hRoll: 20, aL: [40, 40, 30], aR: [-20, 44, 40], lL: [14, 10, 14], lR: [28, 16, 34] },
];

const cPose = (o: PoseKey): PoseKey => o;


/** The living, standing: weight on a leg, an alert head. */
export const CIVSTAND: PoseKey[] = [
  cPose({ px: 0.05, tilt: 3, sTilt: -4, cTilt: -3, hRoll: 4, aL: [4, 8, 16], aR: [6, 10, 22], lL: [2, 5, 6], lR: [-2, 12, 4] }),
];

/** Running for her life: leaning in, arms pumping. */
const CIVRUN6: PoseKey[] = [
  { lean: 10, sLean: 6, cLean: 6, py: -0.1, turn: 8, sTurn: -14, hPitch: -6, aL: [-40, 10, 82], aR: [46, 10, 94], lL: [52, 4, 26], lR: [-38, 8, 68] },
  { lean: 8, sLean: 6, cLean: 6, py: -0.02, turn: 5, sTurn: -9, hPitch: -6, aL: [-20, 8, 86], aR: [26, 8, 92], lL: [30, 4, 18], lR: [-18, 8, 80] },
  { lean: 8, sLean: 6, cLean: 4, py: 0.08, turn: -2, sTurn: 2, hPitch: -6, aL: [14, 8, 84], aR: [-6, 8, 88], lL: [0, 4, 30], lR: [-4, 8, 96] },
  { lean: 10, sLean: 6, cLean: 6, py: -0.1, turn: -8, sTurn: 14, hPitch: -6, aL: [46, 10, 94], aR: [-40, 10, 82], lL: [-38, 8, 68], lR: [52, 4, 26] },
  { lean: 8, sLean: 6, cLean: 6, py: -0.02, turn: -5, sTurn: 9, hPitch: -6, aL: [26, 8, 92], aR: [-20, 8, 86], lL: [-18, 8, 80], lR: [30, 4, 18] },
  { lean: 8, sLean: 6, cLean: 4, py: 0.08, turn: 2, sTurn: -2, hPitch: -6, aL: [-6, 8, 88], aR: [14, 8, 84], lL: [-4, 8, 96], lR: [0, 4, 30] },
];

export const CIVRUN: PoseKey[] = doubled(CIVRUN6);

/** Cowering: crouched, knees in, arms up over the head. */
export const CIVCOWER: PoseKey[] = [
  { py: -1.1, lean: 22, sLean: 16, cLean: 14, hPitch: 24, hRoll: 6, aL: [110, 14, 118], aR: [124, 16, 122], lL: [64, 10, 118], lR: [74, 12, 116] },
];

/** Pleading: on the feet, one arm stretched toward the player, the other against the chest. */
export const CIVPLEAD: PoseKey[] = [
  { lean: 4, sLean: 4, cLean: 2, hPitch: -6, hRoll: 6, tilt: 2, aL: [70, 12, 30], aR: [18, 18, 96], lL: [8, 6, 8], lR: [-4, 14, 6] },
];

export const POSES = {
  zidle: ZIDLE,
  zshamble: ZSHAMBLE,
  zwindup: ZWINDUP,
  zlunge: ZLUNGE,
  zstagger: ZSTAGGER,
  zdeath: ZDEATH,
  civstand: CIVSTAND,
  civrun: CIVRUN,
  civcower: CIVCOWER,
  civplead: CIVPLEAD,
} as const;

export type PoseName = keyof typeof POSES;

/** Each pose table's id (cache keys). */
export const POSE_INDEX = new Map<readonly PoseKey[], number>(Object.values(POSES).map((f, i) => [f, i] as [readonly PoseKey[], number]));

import { BODY, type PoseKey } from './skeleton';

/**
 * DRAWN FIGURES: hand-authored keyframes. The cycles are drawn the way a sprite animator plots
 * them: for each frame, where each ankle goes on the ground grid and how low the hips sit (`foot`
 * solves the leg for that), so a planted foot stays planted and the stride crosses evenly. Angles
 * elsewhere are degrees on the designed skeleton. Frames change about 12 times a second.
 */

const DEG = Math.PI / 180;

/** The pelvis fields a leg is solved against. */
type Hips = Pick<PoseKey, 'px' | 'py' | 'lean' | 'tilt' | 'turn'>;

/** Vector through R = Ry(turn) Rx(lean) Rz(tilt), or back through it. */
function pelvisRot(k: Hips, v: [number, number, number], inverse: boolean): [number, number, number] {
  const sign = inverse ? -1 : 1;
  const ry = (a: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]] as [number, number, number];
  };
  const rx = (a: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]] as [number, number, number];
  };
  const rz = (a: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]] as [number, number, number];
  };
  const ops: ((a: number) => [number, number, number])[] = inverse ? [rz, rx, ry] : [ry, rx, rz];
  const ang = inverse ? [k.tilt ?? 0, k.lean ?? 0, k.turn ?? 0] : [k.turn ?? 0, k.lean ?? 0, k.tilt ?? 0];
  // (Forward is applied last-to-first on the vector, as the matrix product is written.)
  const seq = inverse ? [0, 1, 2] : [2, 1, 0];
  for (const i of seq) v = ops[i](sign * ang[i] * DEG);
  return v;
}

/**
 * The leg angles [swing, out, knee, ankle] that put the ankle `side` (+1 left, −1 right) at
 * (x, ankle height + lift, z), against the pelvis of `k`. Knee always forward.
 */
function foot(side: 1 | -1, k: Hips, x: number, z: number, lift = 0, ankle = 0): [number, number, number, number] {
  const hip = pelvisRot(k, [side * BODY.hipX, BODY.hipDown, 0], false);
  const hy = BODY.hipY + (k.py ?? 0) + hip[1];
  const hx = (k.px ?? 0) + hip[0];
  const v = pelvisRot(k, [x - hx, BODY.ankleY + lift - hy, z - hip[2]], true);
  const L1 = BODY.thigh;
  const L2 = BODY.shin;
  const d = Math.min((L1 + L2) * 0.9995, Math.hypot(v[0], v[1], v[2]));
  const f = Math.PI - Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
  const sphi = Math.max(-1, Math.min(1, v[0] / (L1 + L2 * Math.cos(f))));
  const phi = Math.asin(sphi);
  const A = (L1 + L2 * Math.cos(f)) * Math.cos(phi);
  const B = L2 * Math.sin(f);
  const s = Math.atan2(v[2], -v[1]) + Math.atan2(B, A);
  return [s / DEG, (side * phi) / DEG, f / DEG, ankle];
}

const zPose = (o: PoseKey): PoseKey => ({ cLean: 8, sLean: 6, lean: 4, hPitch: 10, ...o });

/** A zombie standing: weight on one leg, one shoulder dropped, an arm dragging, the head lolling. */
const ZIDLE_HIPS: PoseKey = { px: 0.14, py: -0.08, tilt: 6, lean: 4 };
export const ZIDLE: PoseKey[] = [
  zPose({ ...ZIDLE_HIPS, sTilt: -5, cTilt: -9, cLean: 10, sLean: 8, hRoll: -13, aL: [2, 22, 14], aR: [14, 14, 30], lL: foot(1, ZIDLE_HIPS, 0.34, 0.06), lR: foot(-1, ZIDLE_HIPS, -0.62, 0.3, 0.02) }),
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
    fists: a.fists,
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

/**
 * Zombie shamble: twelve drawn frames, a limp. The left leg is the stiff one; the right is dragged,
 * its toe on the street through the whole swing. Plotted on the ground grid (hu, + = forward) so
 * the stance foot slides back evenly and the swing crosses over five frames, not two.
 */
const ZS = {
  //        contact recoil               pass                  drag     | R contact recoil            pass                  through
  lz: [0.72, 0.52, 0.3, 0.06, -0.18, -0.42, -0.66, -0.52, -0.2, 0.14, 0.46, 0.68],
  llift: [0, 0, 0, 0, 0, 0, 0.1, 0.16, 0.18, 0.15, 0.07, 0.01],
  lx: [0.44, 0.44, 0.44, 0.44, 0.44, 0.44, 0.44, 0.39, 0.26, 0.26, 0.36, 0.44],
  rz: [-0.72, -0.58, -0.3, 0.06, 0.4, 0.62, 0.68, 0.46, 0.22, -0.04, -0.28, -0.52],
  rlift: [0.1, 0.15, 0.17, 0.13, 0.06, 0.01, 0, 0, 0, 0, 0, 0],
  rx: [-0.44, -0.39, -0.26, -0.26, -0.36, -0.44, -0.44, -0.44, -0.44, -0.44, -0.44, -0.44],
  // Hips: low on the two contacts (deeper on the bad leg), up over the passing leg.
  drop: [0.14, 0.2, 0.1, 0.0, 0.03, 0.08, 0.18, 0.27, 0.14, 0.01, 0.04, 0.09],
  // Weight goes over the stance foot.
  px: [0.08, 0.17, 0.22, 0.24, 0.2, 0.1, -0.08, -0.18, -0.24, -0.25, -0.2, -0.1],
  tilt: [3, 6, 7, 6, 4, 1, -3, -6, -8, -6, -4, -1],
  turn: [-6, -4, -1, 2, 4, 6, 6, 4, 1, -2, -4, -6],
  sTurn: [11, 8, 3, -3, -8, -11, -11, -8, -3, 3, 8, 11],
  // Spine and shoulders against the hips; the dip lands on the contact frames.
  sTilt: [-3, -5, -6, -5, -3, -1, 3, 5, 6, 5, 3, 1],
  cTilt: [-10, -12, -9, -7, -5, -6, -3, -1, -4, -6, -7, -8],
  // The head is a frame behind the shoulders.
  hRoll: [-8, -10, -12, -14, -15, -13, -11, -9, -8, -9, -10, -9],
  hPitch: [10, 12, 11, 9, 8, 9, 10, 13, 12, 10, 8, 9],
  // Arms: the left hangs dead and swings late, the right is half raised.
  aLs: [-2, 2, 8, 14, 18, 20, 14, 8, 2, -4, -6, -4],
  aLe: [12, 14, 18, 22, 26, 28, 26, 22, 18, 14, 12, 12],
  aRs: [30, 28, 24, 18, 14, 10, 8, 10, 16, 22, 28, 30],
  aRe: [34, 36, 34, 32, 30, 28, 26, 28, 30, 32, 34, 34],
};

function shambleFrame(i: number): PoseKey {
  const k: PoseKey = zPose({ px: ZS.px[i], py: -ZS.drop[i], tilt: ZS.tilt[i], turn: ZS.turn[i], sTurn: ZS.sTurn[i], sTilt: ZS.sTilt[i], cTilt: ZS.cTilt[i], cLean: 10, hRoll: ZS.hRoll[i], hPitch: ZS.hPitch[i], aL: [ZS.aLs[i], 15, ZS.aLe[i]], aR: [ZS.aRs[i], 14, ZS.aRe[i]] });
  return { ...k, lL: foot(1, k, ZS.lx[i], ZS.lz[i], ZS.llift[i]), lR: foot(-1, k, ZS.rx[i], ZS.rz[i], ZS.rlift[i]) };
}

/** The cycle shown: twelve frames. */
export const ZSHAMBLE: PoseKey[] = Array.from({ length: 12 }, (_, i) => shambleFrame(i));

const zw = (hips: PoseKey, lx: number, lz: number, rx: number, rz: number, o: PoseKey): PoseKey => zPose({ ...hips, ...o, lL: foot(1, hips, lx, lz), lR: foot(-1, hips, rx, rz, 0.02) });

/** Arms coming up to grab: hands rising from the thigh, to the chest, to the face. */
const WH0: PoseKey = { py: -0.1, px: 0.05, lean: 6, tilt: 2 };
const WH1: PoseKey = { py: -0.16, px: -0.06, lean: 8, tilt: -3 };
const WH2: PoseKey = { py: -0.24, px: -0.08, lean: 10, tilt: -4 };
export const ZWINDUP: PoseKey[] = [
  zw(WH0, 0.36, 0.2, -0.42, -0.34, { cLean: 12, hPitch: 8, hRoll: -10, cTilt: -6, aL: [22, 12, 18], aR: [32, 14, 26] }),
  zw(WH1, 0.42, 0.34, -0.42, -0.54, { cLean: 18, hPitch: -2, hRoll: -6, cTilt: -3, aL: [85, 7, 30], aR: [95, 9, 26] }),
  zw(WH2, 0.46, 0.46, -0.46, -0.72, { cLean: 22, hPitch: -14, hRoll: 2, cTilt: 2, aL: [112, 8, 16], aR: [120, 9, 14] }),
];

/** Recovering: the same reach, the other hand leading (so the attack does not end on a mirror image). */
export const ZRECOVER: PoseKey[] = [{ ...ZWINDUP[ZWINDUP.length - 1], leadL: true }];

/** The lunge: the whole body thrown at the camera. */
const LH: PoseKey = { py: -0.28, px: 0.05, lean: 16 };
export const ZLUNGE: PoseKey[] = [
  zPose({ ...LH, cLean: 24, hPitch: -20, aL: [125, 8, 10], aR: [130, 9, 8], lL: [26, 8, 30], lR: [-26, 12, 20] }),
];

/** Rocked back by a hit. */
export const ZSTAGGER: PoseKey[] = [
  zPose({ py: -0.1, lean: -8, cLean: -12, sLean: -8, hPitch: -18, hRoll: 16, tilt: 3, sTilt: 8, aL: [-16, 30, 24], aR: [-14, 34, 30], lL: [-6, 8, 16], lR: [10, 14, 6] }),
  zPose({ py: -0.16, lean: -3, cLean: 6, sLean: 2, hPitch: 16, hRoll: -18, tilt: -6, sTilt: -10, aL: [10, 22, 40], aR: [-4, 28, 18], lL: [4, 10, 28], lR: [-8, 10, 12] }),
];

/** Falling from above (a ceiling drop): knees drawn up, arms up and slightly back, not a walk frame in mid-air. */
export const ZFALL: PoseKey[] = [
  { noGround: true, py: 0, lean: 4, cLean: 2, hPitch: -6, aL: [168, 16, 18], aR: [158, 18, 14], lL: [40, 8, 60], lR: [30, 12, 74] },
];

/**
 * Going down: knees go, the body folds forward and the arms lag behind it, then limp on the ground.
 * The last frame has its own front drawing (`corpse`, plotted in figure.ts): feet toward the
 * viewer, the trunk foreshortened behind them, because the player shoots them head-on.
 */
export const ZDEATH: PoseKey[] = [
  zPose({ py: -0.3, lean: -10, cLean: -6, hPitch: -24, hRoll: 14, aL: [-10, 34, 30], aR: [-18, 40, 26], lL: [18, 10, 40], lR: [8, 14, 30] }),
  zPose({ py: -1.3, lean: 16, cLean: 34, sLean: 20, hPitch: 36, hRoll: -14, aL: [-28, 18, 24], aR: [-12, 22, 18], lL: [70, 14, 110], lR: [60, 18, 118] }),
  // Kneeling, folded right over; the arms come down last.
  {
    noGround: true,
    py: -2.0,
    lean: 34,
    cLean: 40,
    sLean: 22,
    hPitch: 34,
    hRoll: -24,
    aL: [10, 14, 22],
    aR: [34, 18, 14],
    lL: [80, 14, 130],
    lR: [86, 18, 134],
    // From the front the chest stays low and the head tips forward above the collar, chin on the chest.
    front: { noGround: true, py: -2.0, lean: 12, cLean: 8, sLean: 6, hPitch: 26, hRoll: -14, aL: [6, 16, 20], aR: [16, 22, 20], lL: [80, 14, 130], lR: [86, 18, 134] },
  },
  // Fallen on the back, seen from the side: flat on the street, one knee loose, the head in line with the spine.
  {
    noGround: true,
    py: -2.86,
    lean: -86,
    sLean: -3,
    cLean: -3,
    hPitch: 8,
    hRoll: 14,
    aL: [2, 8, 16],
    aR: [-6, 10, 26],
    lL: [14, 8, 30],
    lR: [4, 14, 12],
    front: { noGround: true, corpse: true },
  },
];

/** The living, standing: weight over the left foot, shoulders against the hips, the free foot turned out. */
const CS: PoseKey = { px: 0.18, tilt: 6 };
export const CIVSTAND: PoseKey[] = [
  { ...CS, sTilt: -6, cTilt: -6, hRoll: 7, aL: [4, 15, 16], aR: [6, 17, 22], lL: foot(1, CS, 0.32, 0.0), lR: foot(-1, CS, -0.56, 0.28) },
];

/** Running for her life: leaning in, fists pumping; a forearm is always up while the other is low. */
const CIVRUN6: PoseKey[] = [
  { fists: true, lean: 10, sLean: 6, cLean: 6, py: -0.1, turn: 8, sTurn: -14, hPitch: -6, aL: [-40, 10, 82], aR: [46, 10, 94], lL: [52, 0, 26], lR: [-38, 0, 68] },
  { fists: true, lean: 8, sLean: 6, cLean: 6, py: -0.02, turn: 5, sTurn: -9, hPitch: -6, aL: [-20, 8, 74], aR: [26, 8, 104], lL: [30, 0, 18], lR: [-18, 0, 80] },
  { fists: true, lean: 8, sLean: 6, cLean: 4, py: 0.08, turn: -2, sTurn: 2, hPitch: -6, aL: [18, 8, 100], aR: [-12, 8, 68], lL: [0, 0, 30], lR: [-4, 0, 96] },
  { fists: true, lean: 10, sLean: 6, cLean: 6, py: -0.1, turn: -8, sTurn: 14, hPitch: -6, aL: [46, 10, 94], aR: [-40, 10, 82], lL: [-38, 0, 68], lR: [52, 0, 26] },
  { fists: true, lean: 8, sLean: 6, cLean: 6, py: -0.02, turn: -5, sTurn: 9, hPitch: -6, aL: [26, 8, 104], aR: [-20, 8, 74], lL: [-18, 0, 80], lR: [30, 0, 18] },
  { fists: true, lean: 8, sLean: 6, cLean: 4, py: 0.08, turn: 2, sTurn: -2, hPitch: -6, aL: [-12, 8, 68], aR: [18, 8, 100], lL: [-4, 0, 96], lR: [0, 0, 30] },
];

export const CIVRUN: PoseKey[] = doubled(CIVRUN6);

/** Walking, a person's easy step (and, played backwards, backing away from something). */
const CW = {
  lz: [0.52, 0.28, 0.0, -0.26, -0.5, -0.5, -0.1, 0.32],
  llift: [0, 0, 0, 0, 0.05, 0.14, 0.2, 0.06],
  rz: [-0.5, -0.5, -0.1, 0.32, 0.52, 0.28, 0.0, -0.26],
  rlift: [0.05, 0.14, 0.2, 0.06, 0, 0, 0, 0],
  drop: [0.1, 0.05, 0.0, 0.04, 0.1, 0.05, 0.0, 0.04],
  px: [0.08, 0.14, 0.16, 0.1, -0.08, -0.14, -0.16, -0.1],
  // Feet apart, the swing foot coming in over the step: the front view has a stride to show.
  lx: [0.44, 0.44, 0.44, 0.44, 0.44, 0.34, 0.26, 0.36],
  rx: [-0.44, -0.34, -0.26, -0.36, -0.44, -0.44, -0.44, -0.44],
};
function civWalkFrame(i: number): PoseKey {
  const swing = Math.sin((i / 8) * Math.PI * 2);
  const k: PoseKey = { px: CW.px[i], py: -CW.drop[i], lean: 3, sLean: 3, tilt: swing * 3, sTilt: -swing * 3, hPitch: -2, aL: [-swing * 14 + 4, 13, 20], aR: [swing * 14 + 6, 13, 24] };
  return { ...k, lL: foot(1, k, CW.lx[i], CW.lz[i], CW.llift[i]), lR: foot(-1, k, CW.rx[i], CW.rz[i], CW.rlift[i]) };
}
export const CIVWALK: PoseKey[] = Array.from({ length: 8 }, (_, i) => civWalkFrame(i));

/**
 * Backing away from something: a wary shuffle, feet never crossing (the rear foot steps back while
 * the front one slides in), so the two legs do not merge into one column from the side.
 */
const CB = {
  frontZ: [0.9, 0.73, 0.57, 0.4, 0.4, 0.57, 0.73, 0.9],
  frontLift: [0.0, 0.08, 0.1, 0.03, 0, 0, 0, 0],
  rearZ: [-0.7, -0.53, -0.37, -0.2, -0.2, -0.37, -0.53, -0.7],
  rearLift: [0, 0, 0, 0, 0.03, 0.1, 0.08, 0.0],
  drop: [0.16, 0.14, 0.1, 0.14, 0.16, 0.14, 0.1, 0.14],
};
function civBackFrame(i: number): PoseKey {
  const k: PoseKey = { px: 0.06, py: -CB.drop[i], lean: -2, sLean: 2, hPitch: -4, aL: [18, 16, 44], aR: [8, 16, 34] };
  return { ...k, lL: foot(1, k, 0.4, CB.frontZ[i], CB.frontLift[i]), lR: foot(-1, k, -0.4, CB.rearZ[i], CB.rearLift[i]) };
}
export const CIVBACK: PoseKey[] = Array.from({ length: 8 }, (_, i) => civBackFrame(i));

/**
 * Cowering: crouched, knees in, arms up over the head. Three depths: the rig's head ducks and
 * comes up, and the whole drawing has to duck with it, not the head slide down a still body.
 */
function cowerKey(py: number): PoseKey {
  const k: PoseKey = { noReach: true, py, lean: 22, sLean: 16, cLean: 14, hPitch: 24, hRoll: 6, aL: [110, 14, 118], aR: [124, 16, 122] };
  return { ...k, lL: foot(1, k, 0.32, 0.3), lR: foot(-1, k, -0.34, 0.24) };
}
export const CIVCOWER: PoseKey[] = [cowerKey(-1.25), cowerKey(-1.6), cowerKey(-1.95)];

/** Pleading: on the feet, one arm stretched toward the player, the other against the chest. */
export const CIVPLEAD: PoseKey[] = [
  { lean: 4, sLean: 4, cLean: 2, hPitch: -6, hRoll: 6, tilt: 2, aL: [92, 12, 30], aR: [18, 18, 96], lL: [8, 6, 8], lR: [-4, 14, 6] },
];

export const POSES = {
  zidle: ZIDLE,
  zshamble: ZSHAMBLE,
  zwindup: ZWINDUP,
  zrecover: ZRECOVER,
  zlunge: ZLUNGE,
  zstagger: ZSTAGGER,
  zdeath: ZDEATH,
  zfall: ZFALL,
  civstand: CIVSTAND,
  civrun: CIVRUN,
  civwalk: CIVWALK,
  civback: CIVBACK,
  civcower: CIVCOWER,
  civplead: CIVPLEAD,
} as const;

export type PoseName = keyof typeof POSES;

/** Each pose table's id (cache keys). */
export const POSE_INDEX = new Map<readonly PoseKey[], number>(Object.values(POSES).map((f, i) => [f, i] as [readonly PoseKey[], number]));

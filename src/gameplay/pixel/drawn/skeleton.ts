/**
 * DRAWN FIGURES: the designed 2D skeleton.
 *
 * Proportions are the canon of docs/PIXELWORLD3.md, in HEAD UNITS (1 hu = chin to crown), not the
 * 3D rig's: a pose is a set of animator's angles on bones of designed length (bones never stretch),
 * computed to joint positions in the figure's frame and projected to the view. The joints place
 * the outlines; the outlines themselves are drawn per view (`body.ts`).
 *
 * Space: x = the figure's left, y up, z its forward; ground at y = 0. A view turns the figure about
 * y: 0 = facing the viewer, +90 = facing screen right (seen from its right side).
 */

/** Heads tall. */
export const HEADS = 6.25;

/** Designed lengths and offsets (hu). */
export const BODY = {
  hipY: 3.3,
  /** Hip joints: pelvis origin + (±hipX, hipDown). */
  hipX: 0.34,
  hipDown: -0.1,
  pelvisToWaist: 0.55,
  waistToChest: 0.85,
  chestToNeck: 0.52,
  neckToHead: 0.56,
  /** Shoulder joints from the chest origin. */
  shoulderX: 0.56,
  shoulderUp: 0.25,
  upperArm: 1.1,
  foreArm: 0.86,
  hand: 0.62,
  thigh: 1.6,
  shin: 1.3,
  foot: 0.42,
  ankleY: 0.3,
} as const;

export const J = {
  pelvis: 0,
  waist: 1,
  chest: 2,
  neck: 3,
  head: 4,
  shL: 5,
  elL: 6,
  wrL: 7,
  tipL: 8,
  shR: 9,
  elR: 10,
  wrR: 11,
  tipR: 12,
  hipL: 13,
  kneeL: 14,
  ankleL: 15,
  toeL: 16,
  hipR: 17,
  kneeR: 18,
  ankleR: 19,
  toeR: 20,
  count: 21,
} as const;

/** Angles in degrees; offsets in hu. Omitted fields are 0. */
export interface PoseKey {
  /** Pelvis shift from the standing point: sideways, up, forward. */
  px?: number;
  py?: number;
  pz?: number;
  /** Pelvis: lean forward (top toward +z), tilt (left hip up +), turn toward the figure's left +. */
  lean?: number;
  tilt?: number;
  turn?: number;
  /** Spine bend above the pelvis, same axes. */
  sLean?: number;
  sTilt?: number;
  sTurn?: number;
  /** Chest on top of the spine: extra forward hunch, shoulder drop (+ = left shoulder up), twist. */
  cLean?: number;
  cTilt?: number;
  cTurn?: number;
  /** Head: nod forward, roll (+ = toward its left shoulder), turn toward its left. */
  hPitch?: number;
  hRoll?: number;
  hYaw?: number;
  /** Arms: forward swing, outward, elbow flex (bent forward), then wrist flex; hand shape. */
  aL?: readonly [number, number, number, number?];
  aR?: readonly [number, number, number, number?];
  /** Legs: forward swing, outward, knee flex, ankle (toe down +). */
  lL?: readonly [number, number, number, number?];
  lR?: readonly [number, number, number, number?];
  /** Do not rest the lowest foot on the ground (a lying figure, a figure held off the floor). */
  noGround?: boolean;
  /** Front and back views keep arms raised over the head as drawn (a cower), not thrust at the viewer. */
  noReach?: boolean;
  /** Hands closed (a runner's fists). */
  fists?: boolean;
  /** A different drawing of this key for the front and back views (a lying body has its own foreshortening). */
  front?: PoseKey;
  /** In a front-view reach, the left arm (not the right) is the one that comes in low and big. */
  leadL?: boolean;
  /** A body lying with its feet toward the viewer: joints come from a hand-plotted table, not the bones. */
  corpse?: boolean;
}

/** Joint positions: figure frame (x, y, z); and, after `project`, screen hu (x right, y up) with z = toward the viewer. */
export class Skeleton {
  readonly x = new Float32Array(J.count);
  readonly y = new Float32Array(J.count);
  readonly z = new Float32Array(J.count);
  readonly sx = new Float32Array(J.count);
  readonly sy = new Float32Array(J.count);
  readonly sz = new Float32Array(J.count);
  /** The head's screen roll (radians): how far its up axis leans from the neck's direction, drawn by the head tables. */
  headRoll = 0;
  /** How much the head is turned from the viewer (radians, signed like the view). */
  headYaw = 0;
  /** Pitch of the head in radians (nod forward +). */
  headPitch = 0;
  /** Foot pitch about the toe (radians, toe down +): left, right. */
  readonly footPitch = new Float32Array(2);
}

// A rotation as 9 numbers (column vectors), no allocation.
const _R0 = new Float32Array(9);
const _R1 = new Float32Array(9);
const _R2 = new Float32Array(9);
const _Rt = new Float32Array(9);
const DEG = Math.PI / 180;

function identity(m: Float32Array) {
  m[0] = 1;
  m[1] = 0;
  m[2] = 0;
  m[3] = 0;
  m[4] = 1;
  m[5] = 0;
  m[6] = 0;
  m[7] = 0;
  m[8] = 1;
}
function copy(a: Float32Array, b: Float32Array) {
  for (let i = 0; i < 9; i++) a[i] = b[i];
}
/** m = m × rotation about axis (0 = x, 1 = y, 2 = z) by `d` degrees. */
function rot(m: Float32Array, axis: number, d: number) {
  if (d === 0) return;
  const r = d * DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const m0 = m[0];
  const m1 = m[1];
  const m2 = m[2];
  const m3 = m[3];
  const m4 = m[4];
  const m5 = m[5];
  const m6 = m[6];
  const m7 = m[7];
  const m8 = m[8];
  if (axis === 0) {
    // Column 1' = c·col1 + s·col2; column 2' = −s·col1 + c·col2.
    m[3] = c * m3 + s * m6;
    m[4] = c * m4 + s * m7;
    m[5] = c * m5 + s * m8;
    m[6] = -s * m3 + c * m6;
    m[7] = -s * m4 + c * m7;
    m[8] = -s * m5 + c * m8;
  } else if (axis === 1) {
    m[0] = c * m0 - s * m6;
    m[1] = c * m1 - s * m7;
    m[2] = c * m2 - s * m8;
    m[6] = s * m0 + c * m6;
    m[7] = s * m1 + c * m7;
    m[8] = s * m2 + c * m8;
  } else {
    m[0] = c * m0 + s * m3;
    m[1] = c * m1 + s * m4;
    m[2] = c * m2 + s * m5;
    m[3] = -s * m0 + c * m3;
    m[4] = -s * m1 + c * m4;
    m[5] = -s * m2 + c * m5;
  }
}
function mulV(m: Float32Array, x: number, y: number, z: number, i: number, ox: number, oy: number, oz: number, sk: Skeleton) {
  sk.x[i] = ox + m[0] * x + m[3] * y + m[6] * z;
  sk.y[i] = oy + m[1] * x + m[4] * y + m[7] * z;
  sk.z[i] = oz + m[2] * x + m[5] * y + m[8] * z;
}

const NONE: readonly (number | undefined)[] = [0, 0, 0, 0];

/** Forward kinematics: `k` to the joints of `sk`, figure frame. `ground`: keep the lowest foot on y = 0. */
export function buildPose(sk: Skeleton, k: PoseKey, ground = true) {
  const B = BODY;
  const X = sk.x;
  const Y = sk.y;
  const Z = sk.z;
  // Pelvis.
  const px = k.px ?? 0;
  const py = B.hipY + (k.py ?? 0);
  const pz = k.pz ?? 0;
  identity(_R0);
  rot(_R0, 1, k.turn ?? 0);
  rot(_R0, 0, k.lean ?? 0);
  rot(_R0, 2, k.tilt ?? 0);
  X[J.pelvis] = px;
  Y[J.pelvis] = py;
  Z[J.pelvis] = pz;
  mulV(_R0, B.hipX, B.hipDown, 0, J.hipL, px, py, pz, sk);
  mulV(_R0, -B.hipX, B.hipDown, 0, J.hipR, px, py, pz, sk);
  // Spine: half the bend below the waist, half above.
  copy(_R1, _R0);
  rot(_R1, 1, (k.sTurn ?? 0) * 0.5);
  rot(_R1, 0, (k.sLean ?? 0) * 0.5);
  rot(_R1, 2, (k.sTilt ?? 0) * 0.5);
  mulV(_R1, 0, B.pelvisToWaist, 0, J.waist, px, py, pz, sk);
  rot(_R1, 1, (k.sTurn ?? 0) * 0.5);
  rot(_R1, 0, (k.sLean ?? 0) * 0.5);
  rot(_R1, 2, (k.sTilt ?? 0) * 0.5);
  mulV(_R1, 0, B.waistToChest, 0, J.chest, X[J.waist], Y[J.waist], Z[J.waist], sk);
  // Chest frame.
  copy(_R2, _R1);
  rot(_R2, 1, k.cTurn ?? 0);
  rot(_R2, 0, k.cLean ?? 0);
  rot(_R2, 2, k.cTilt ?? 0);
  mulV(_R2, 0, B.chestToNeck, 0, J.neck, X[J.chest], Y[J.chest], Z[J.chest], sk);
  mulV(_R2, B.shoulderX, B.shoulderUp, 0, J.shL, X[J.chest], Y[J.chest], Z[J.chest], sk);
  mulV(_R2, -B.shoulderX, B.shoulderUp, 0, J.shR, X[J.chest], Y[J.chest], Z[J.chest], sk);
  // Head: rolled and nodded on the neck.
  copy(_Rt, _R2);
  rot(_Rt, 1, k.hYaw ?? 0);
  rot(_Rt, 0, (k.hPitch ?? 0) * 0.6);
  rot(_Rt, 2, k.hRoll ?? 0);
  mulV(_Rt, 0, B.neckToHead, 0, J.head, X[J.neck], Y[J.neck], Z[J.neck], sk);
  sk.headRoll = ((k.hRoll ?? 0) + (k.cTilt ?? 0) + (k.sTilt ?? 0) + (k.tilt ?? 0)) * DEG;
  sk.headYaw = ((k.hYaw ?? 0) + (k.cTurn ?? 0) + (k.sTurn ?? 0) + (k.turn ?? 0)) * DEG;
  sk.headPitch = (k.hPitch ?? 0) * DEG;
  // Arms.
  limb(sk, _R2, J.shL, J.elL, J.wrL, J.tipL, k.aL ?? NONE, B.upperArm, B.foreArm, B.hand, 1);
  limb(sk, _R2, J.shR, J.elR, J.wrR, J.tipR, k.aR ?? NONE, B.upperArm, B.foreArm, B.hand, -1);
  // Legs.
  leg(sk, J.hipL, J.kneeL, J.ankleL, J.toeL, k.lL ?? NONE, _R0);
  leg(sk, J.hipR, J.kneeR, J.ankleR, J.toeR, k.lR ?? NONE, _R0);
  if (ground) {
    let min = Infinity;
    for (let i = 0; i < 2; i++) {
      const a = i === 0 ? J.ankleL : J.ankleR;
      const t = i === 0 ? J.toeL : J.toeR;
      min = Math.min(min, Y[a] - B.ankleY, Y[t] - 0.02);
    }
    for (let i = 0; i < J.count; i++) Y[i] -= min;
  }
  footOnToe(sk, J.ankleL, J.toeL, 0, 1, ground);
  footOnToe(sk, J.ankleR, J.toeR, 1, -1, ground);
}

/** Toe joint below the ankle at rest, the distance between them, and the foot's rest slope. */
const TOE_DROP = BODY.ankleY * 0.55;
const FOOT_L = Math.hypot(TOE_DROP, BODY.foot);
const FOOT_0 = Math.atan2(TOE_DROP, BODY.foot);
const TOE_Y = BODY.ankleY - TOE_DROP;
/** A foot within this height (hu) of the street drags on its toe instead of hovering over it. */
const DRAG_H = 0.6;

/** A foot near the ground pivots about its toe: the toe stays on the street, the heel comes up. */
function footOnToe(sk: Skeleton, a: number, t: number, i: number, side: number, ground: boolean) {
  sk.footPitch[i] = 0;
  const ya = sk.y[a];
  if (!ground || ya - BODY.ankleY > DRAG_H || ya - TOE_DROP <= TOE_Y + 1e-3) return;
  const sin = Math.min(1, (ya - TOE_Y) / FOOT_L);
  const p = Math.min(1.2, Math.asin(sin) - FOOT_0);
  if (p <= 0) return;
  sk.footPitch[i] = p;
  identity(_Rt);
  rot(_Rt, 1, side * 12);
  rot(_Rt, 0, p / DEG);
  mulV(_Rt, 0, -TOE_DROP, BODY.foot, t, sk.x[a], sk.y[a], sk.z[a], sk);
}

function limb(sk: Skeleton, parent: Float32Array, a: number, b: number, c: number, d: number, p: readonly (number | undefined)[], l1: number, l2: number, l3: number, side: number) {
  identity(_R1);
  // Swing forward: the arm hanging down (−y) comes up toward +z, so about x by −swing.
  rot(_R1, 0, -(p[0] ?? 0));
  rot(_R1, 2, side * (p[1] ?? 0));
  mul(_Rt, parent, _R1);
  mulV(_Rt, 0, -l1, 0, b, sk.x[a], sk.y[a], sk.z[a], sk);
  copy(_R1, _Rt);
  // Elbow flex: the forearm folds forward.
  rot(_R1, 0, -(p[2] ?? 0));
  mulV(_R1, 0, -l2, 0, c, sk.x[b], sk.y[b], sk.z[b], sk);
  rot(_R1, 0, -(p[3] ?? 0));
  mulV(_R1, 0, -l3, 0, d, sk.x[c], sk.y[c], sk.z[c], sk);
}

function leg(sk: Skeleton, a: number, b: number, c: number, d: number, p: readonly (number | undefined)[], parent: Float32Array) {
  const side = a === J.hipL ? 1 : -1;
  identity(_R1);
  rot(_R1, 0, -(p[0] ?? 0));
  rot(_R1, 2, side * (p[1] ?? 0));
  mul(_R2, parent, _R1);
  mulV(_R2, 0, -BODY.thigh, 0, b, sk.x[a], sk.y[a], sk.z[a], sk);
  copy(_R1, _R2);
  // Knee flex: the shin folds back.
  rot(_R1, 0, p[2] ?? 0);
  mulV(_R1, 0, -BODY.shin, 0, c, sk.x[b], sk.y[b], sk.z[b], sk);
  // The foot stays roughly flat (it is drawn per view): ankle flex is applied on the toe joint.
  identity(_Rt);
  rot(_Rt, 1, side * 12); // toes splay out a little
  rot(_Rt, 0, p[3] ?? 0);
  // Ankle-to-toe in the leg's yaw, flat on the ground when the ankle flex is 0.
  mulV(_Rt, 0, -BODY.ankleY * 0.55, BODY.foot, d, sk.x[c], sk.y[c], sk.z[c], sk);
}

function mul(out: Float32Array, a: Float32Array, b: Float32Array) {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const a4 = a[4];
  const a5 = a[5];
  const a6 = a[6];
  const a7 = a[7];
  const a8 = a[8];
  const b0 = b[0];
  const b1 = b[1];
  const b2 = b[2];
  const b3 = b[3];
  const b4 = b[4];
  const b5 = b[5];
  const b6 = b[6];
  const b7 = b[7];
  const b8 = b[8];
  out[0] = a0 * b0 + a3 * b1 + a6 * b2;
  out[1] = a1 * b0 + a4 * b1 + a7 * b2;
  out[2] = a2 * b0 + a5 * b1 + a8 * b2;
  out[3] = a0 * b3 + a3 * b4 + a6 * b5;
  out[4] = a1 * b3 + a4 * b4 + a7 * b5;
  out[5] = a2 * b3 + a5 * b4 + a8 * b5;
  out[6] = a0 * b6 + a3 * b7 + a6 * b8;
  out[7] = a1 * b6 + a4 * b7 + a7 * b8;
  out[8] = a2 * b6 + a5 * b7 + a8 * b8;
}

/** The five drawn views. Others are mirrors (`mirror`). */
export const VIEW_YAW = [0, 45, 90, 135, 180] as const;
export type ViewId = 0 | 1 | 2 | 3 | 4;
export const VIEW_NAME = ['front', 'three-quarter', 'side', 'three-quarter back', 'back'];

/** Project the figure-frame joints of `sk` to the view: screen hu, y up; sz = nearer the viewer is bigger. */
export function project(sk: Skeleton, view: ViewId) {
  const yaw = (VIEW_YAW[view] * Math.PI) / 180;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (let i = 0; i < J.count; i++) {
    const x = sk.x[i];
    const z = sk.z[i];
    sk.sx[i] = x * c + z * s;
    sk.sy[i] = sk.y[i];
    sk.sz[i] = -x * s + z * c;
  }
}

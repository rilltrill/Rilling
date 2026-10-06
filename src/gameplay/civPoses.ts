import * as THREE from 'three';
import type { HumanoidRig, Limb } from '../content/kit/humanoid';
import { clamp, smoothstep } from '../core/math';

/**
 * ─── Civilian poses ─────────────────────────────────────────────────────────
 *
 * The frightened repertoire of a civilian (see `Civilian.ts`), written as joint
 * values into a flat POSE BUFFER instead of straight onto the rig: the civilian
 * keeps the pose it is leaving and blends into the next one over a few tenths of
 * a second (no snapping between cowering, peeking, running, tripping…), then
 * `applyPose` writes the result onto the humanoid rig. Both art modes follow the
 * rig: ART: 3D draws its baked meshes, ART: SPRITES paints from its joints.
 *
 * Read at phone size, at the 12 fps sprite cadence: gestures are KEYED — a wave
 * or a shiver holds each extreme for a few sprite frames (`key2`) instead of a
 * sine that smears between frames — and hands are placed by two-bone IK
 * (`ikArm`) on the body (a hand cupped at the mouth, clasped on the back of the
 * head, over the face, on the chest, braced on the floor) or on the hand of the
 * zombie holding on, never left reaching into the air.
 *
 * Rig conventions (humanoid.ts; model faces +Z, the character's LEFT is +X):
 * hip.rotation.x < 0 swings a leg forward, knee.rotation.x > 0 bends it back;
 * shoulder.rotation.x < 0 raises an arm forward, armL z > 0 / armR z < 0 raise
 * it sideways; elbow.rotation.x < 0 flexes the forearm; spine.rotation.x > 0
 * leans forward, z > 0 leans toward −X; head.rotation.y > 0 looks toward +X.
 *
 * Every writer is allocation-free and deterministic in its arguments (time,
 * phase, blend weights): the alignment tests pose a civilian and paint it.
 */

/** Pose buffer slots. */
export const J = {
  HIPS_Y: 0,
  HIPS_X: 1,
  HIPS_Z: 2,
  HIPS_RX: 3,
  HIPS_RY: 4,
  HIPS_RZ: 5,
  SPINE_X: 6,
  SPINE_Y: 7,
  SPINE_Z: 8,
  CHEST_X: 9,
  CHEST_Y: 10,
  CHEST_Z: 11,
  NECK_X: 12,
  NECK_Y: 13,
  HEAD_X: 14,
  HEAD_Y: 15,
  HEAD_Z: 16,
  SH_L_X: 17,
  SH_L_Y: 18,
  SH_L_Z: 19,
  EL_L_X: 20,
  SH_R_X: 21,
  SH_R_Y: 22,
  SH_R_Z: 23,
  EL_R_X: 24,
  HIP_L_X: 25,
  HIP_L_Z: 26,
  KNEE_L: 27,
  HIP_R_X: 28,
  HIP_R_Z: 29,
  KNEE_R: 30,
} as const;
export const POSE_SIZE = 31;

export type PoseBuf = Float32Array;

export function poseBuf(): PoseBuf {
  const p = new Float32Array(POSE_SIZE);
  poseStand(p);
  return p;
}

/** Standing at rest (the base every writer starts from). */
export function poseStand(p: PoseBuf) {
  p.fill(0);
  p[J.HIPS_Y] = 0.95;
  p[J.SH_L_Z] = 0.08;
  p[J.SH_R_Z] = -0.08;
}

/** out = a + (b − a)·t. */
export function blendPose(out: PoseBuf, a: PoseBuf, b: PoseBuf, t: number) {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
}

/** Write a pose buffer onto the rig's joints. */
export function applyPose(r: HumanoidRig, p: PoseBuf) {
  r.hips.position.set(p[J.HIPS_X], p[J.HIPS_Y], p[J.HIPS_Z]);
  r.hips.rotation.set(p[J.HIPS_RX], p[J.HIPS_RY], p[J.HIPS_RZ]);
  r.spine.rotation.set(p[J.SPINE_X], p[J.SPINE_Y], p[J.SPINE_Z]);
  r.chest.rotation.set(p[J.CHEST_X], p[J.CHEST_Y], p[J.CHEST_Z]);
  r.neck.rotation.set(p[J.NECK_X], p[J.NECK_Y], 0);
  r.head.rotation.set(p[J.HEAD_X], p[J.HEAD_Y], p[J.HEAD_Z]);
  applyArms(r, p);
  r.legL.hip.rotation.set(p[J.HIP_L_X], 0, p[J.HIP_L_Z]);
  r.legL.knee.rotation.set(p[J.KNEE_L], 0, 0);
  r.legR.hip.rotation.set(p[J.HIP_R_X], 0, p[J.HIP_R_Z]);
  r.legR.knee.rotation.set(p[J.KNEE_R], 0, 0);
}

/** Just the arms (after an IK pass on a pose already applied). */
export function applyArms(r: HumanoidRig, p: PoseBuf) {
  r.armL.shoulder.rotation.set(p[J.SH_L_X], p[J.SH_L_Y], p[J.SH_L_Z]);
  r.armL.elbow.rotation.set(p[J.EL_L_X], 0, 0);
  r.armR.shoulder.rotation.set(p[J.SH_R_X], p[J.SH_R_Y], p[J.SH_R_Z]);
  r.armR.elbow.rotation.set(p[J.EL_R_X], 0, 0);
}

/**
 * Hips height that keeps the lowest foot on the floor for these leg angles
 * (thigh 0.44, shin + shoe 0.455, hip joints 0.06 under the hips pivot).
 */
function footY(hip: number, knee: number): number {
  const shin = hip + knee;
  // The shoe is a box under the shin: its toe (shin leaning forward) or heel corner goes lowest.
  const drop = 0.455 * Math.cos(shin) + (shin > 0 ? 0.17 : 0.07) * Math.abs(Math.sin(shin));
  return 0.06 + 0.44 * Math.cos(hip) + drop;
}
function legsHeight(p: PoseBuf): number {
  return Math.max(footY(p[J.HIP_L_X], p[J.KNEE_L]), footY(p[J.HIP_R_X], p[J.KNEE_R]));
}
/** Hips height that puts a kneeling leg's knee on the floor (thigh at `hip`). */
function kneelY(hip: number): number {
  return 0.06 + 0.44 * Math.cos(hip) + 0.05;
}

// ─── Timing ──────────────────────────────────────────────────────────────────

/**
 * A held key, 0 → 1 → 0 once per 1/`hz` s: 0 for the first half, 1 for the
 * second, with a quick ease (`ease` of the period) between — a gesture that
 * holds each extreme for a few sprite frames at 12 fps instead of smearing.
 */
export function key2(t: number, hz: number, ease = 0.12): number {
  const u = t * hz - Math.floor(t * hz);
  return smoothstep(0, ease, u) - smoothstep(0.5, 0.5 + ease, u);
}

/** Small shivers on top of a pose (`amt` 0..1) — under-the-skin tension. */
export function tremble(p: PoseBuf, t: number, amt: number) {
  if (amt <= 0) return;
  p[J.SPINE_Z] += Math.sin(t * 37) * 0.025 * amt;
  p[J.CHEST_X] += Math.sin(t * 31 + 2) * 0.02 * amt;
  p[J.HEAD_Z] += Math.sin(t * 43 + 1) * 0.05 * amt;
  p[J.HEAD_Y] += Math.sin(t * 23 + 4) * 0.04 * amt;
  p[J.EL_L_X] += Math.sin(t * 29 + 0.7) * 0.06 * amt;
  p[J.EL_R_X] += Math.sin(t * 27 + 2.1) * 0.06 * amt;
}

/**
 * Shaking with fear you can SEE on the sprite grid: the body hops between two
 * offsets (≈ a retro pixel at the head) every ~1/10 s — off the 12 fps sprite
 * beat, so successive paints catch it at different sides. `amt` 0..1.
 */
export function shiver(p: PoseBuf, t: number, amt: number, seed = 0) {
  if (amt <= 0) return;
  const k = Math.floor(t * 10.5 + seed);
  const s = k & 1 ? 1 : -1;
  // (Every third hop a little smaller: not a metronome.)
  const a = amt * (k % 3 === 0 ? 0.6 : 1);
  p[J.HIPS_Y] += 0.012 * s * a;
  p[J.HIPS_X] += 0.012 * s * a;
  p[J.SPINE_Z] -= 0.055 * s * a;
  p[J.HEAD_Z] -= 0.08 * s * a;
  p[J.CHEST_X] += 0.025 * s * a;
}

// ─── IK ──────────────────────────────────────────────────────────────────────

const UPPER = 0.3;
const FORE = 0.31;
/** Shoulder pivot in the chest frame (x by side). */
const SH_OX = 0.24;
const SH_OY = -0.04;
const _a = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _eu = new THREE.Euler();
const _q = new THREE.Quaternion();
const _hp = new THREE.Vector3();
const _hp2 = new THREE.Vector3();

/**
 * Two-bone IK: set arm `side`'s (+1 left) shoulder and elbow in the pose so its
 * hand lands on `target` (chest frame, rig units), the elbow bending toward the
 * pole (px, py, pz). Out of reach: the arm points straight at it.
 */
export function ikArm(p: PoseBuf, side: number, target: THREE.Vector3, px: number, py: number, pz: number) {
  const a = _a.set(target.x - side * SH_OX, target.y - SH_OY, target.z);
  let d = a.length();
  if (d < 1e-4) return;
  a.divideScalar(d);
  d = clamp(d, 0.12, (UPPER + FORE) * 0.999);
  const flex = -(Math.PI - Math.acos(clamp((UPPER * UPPER + FORE * FORE - d * d) / (2 * UPPER * FORE), -1, 1)));
  const th = Math.acos(clamp((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d), -1, 1));
  const pole = _pole.set(px, py, pz);
  pole.addScaledVector(a, -pole.dot(a));
  if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0).addScaledVector(a, a.y);
  if (pole.lengthSq() < 1e-8) pole.set(0, 0, -1);
  pole.normalize();
  // Upper arm toward the elbow, swung off the shoulder→hand line toward the pole.
  const u = _u.copy(a).multiplyScalar(Math.cos(th)).addScaledVector(pole, Math.sin(th));
  // The shoulder's frame: local −Y down the upper arm, local +Z the way the
  // forearm folds (away from where the elbow points).
  const w = _w.copy(pole).addScaledVector(u, -pole.dot(u));
  if (w.lengthSq() < 1e-8) w.set(0, 0, 1).addScaledVector(u, -u.z);
  w.normalize().negate();
  const y = _y.copy(u).negate();
  const x = _x.crossVectors(y, w);
  _m4.makeBasis(x, y, w);
  _eu.setFromRotationMatrix(_m4, 'XYZ');
  if (side > 0) {
    p[J.SH_L_X] = _eu.x;
    p[J.SH_L_Y] = _eu.y;
    p[J.SH_L_Z] = _eu.z;
    p[J.EL_L_X] = flex;
  } else {
    p[J.SH_R_X] = _eu.x;
    p[J.SH_R_Y] = _eu.y;
    p[J.SH_R_Z] = _eu.z;
    p[J.EL_R_X] = flex;
  }
}

/** A point on the head (head frame, rig units) in the chest frame of pose `p`. */
export function headPoint(p: PoseBuf, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  out.set(x, y, z).applyEuler(_eu.set(p[J.HEAD_X], p[J.HEAD_Y], p[J.HEAD_Z]));
  out.y += 0.07;
  out.applyEuler(_eu.set(p[J.NECK_X], p[J.NECK_Y], 0));
  out.y += 0.04;
  return out;
}

/**
 * A point in the rig root's frame (rig units: feet at y 0, facing +Z) in the
 * chest frame of pose `p` — to put a hand on the floor or on something in front.
 */
export function rootToChest(p: PoseBuf, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  out.set(x - p[J.HIPS_X], y - p[J.HIPS_Y], z - p[J.HIPS_Z]);
  out.applyQuaternion(_q.setFromEuler(_eu.set(p[J.HIPS_RX], p[J.HIPS_RY], p[J.HIPS_RZ])).invert());
  out.y -= 0.06;
  out.applyQuaternion(_q.setFromEuler(_eu.set(p[J.SPINE_X], p[J.SPINE_Y], p[J.SPINE_Z])).invert());
  out.y -= 0.44;
  out.applyQuaternion(_q.setFromEuler(_eu.set(p[J.CHEST_X], p[J.CHEST_Y], p[J.CHEST_Z])).invert());
  return out;
}

/** Hand cupped beside the mouth (calling out), arm `side`. */
function handAtMouth(p: PoseBuf, side: number) {
  headPoint(p, side * 0.075, 0.06, 0.17, _hp);
  ikArm(p, side, _hp, side * 0.8, -1, -0.1);
}

// ─── Acts ────────────────────────────────────────────────────────────────────

/**
 * HELP!: crouched forward toward the camera, knees bent, calling out with one
 * hand cupped at the mouth while the other waves from the elbow beside the head
 * (`side` +1 = the left arm waves) — two held positions, 2.5 waves a second.
 * `big`: a far-off or perched civilian waves the whole arm overhead instead (the
 * only time a hand goes up over the head). `look` turns the head (radians).
 */
export function posePlead(p: PoseBuf, t: number, side: number, big: boolean, look: number) {
  poseStand(p);
  const k = key2(t, 2.5);
  p[J.HIP_L_X] = p[J.HIP_R_X] = -0.36 - 0.05 * k;
  p[J.KNEE_L] = p[J.KNEE_R] = 0.62 + 0.1 * k;
  p[J.HIP_L_Z] = 0.1;
  p[J.HIP_R_Z] = -0.1;
  p[J.HIPS_Y] = legsHeight(p);
  p[J.HIPS_Z] = -0.03;
  // Leaning in toward the player, face up to them.
  p[J.SPINE_X] = 0.34;
  p[J.CHEST_X] = 0.08;
  p[J.SPINE_Z] = -0.07 * side;
  p[J.SPINE_Y] = 0.1 * side;
  p[J.NECK_X] = -0.22;
  p[J.HEAD_X] = -0.24 + 0.06 * k;
  p[J.HEAD_Y] = look;
  p[J.HEAD_Z] = 0.1 * side - 0.06 * side * k;
  handAtMouth(p, -side);
  if (big) {
    // Up and out to the side, swinging from the elbow (two held positions).
    p[side > 0 ? J.SH_L_Z : J.SH_R_Z] = side * (2.3 + 0.35 * k);
    p[side > 0 ? J.SH_L_X : J.SH_R_X] = -0.25;
    p[side > 0 ? J.EL_L_X : J.EL_R_X] = -0.2 - 0.6 * k;
  } else {
    // Hand beside the head, the forearm swinging out and back from the elbow.
    _hp2.set(side * (0.42 + 0.2 * k), 0.34 - 0.13 * k, 0.22 - 0.1 * k);
    ikArm(p, side, _hp2, side, -0.55, -0.2);
  }
}

/**
 * COWER: down on one knee (`kneel` +1 = the left knee), folded over the other,
 * head tucked down, hands clasped over the back of the head, elbows by the
 * face. `peek` 0..1 lifts only the neck and head to look out between the
 * forearms (toward `look`, radians in the body frame) — the forearms stay up by
 * the face, spreading a little; `call` ±1: that hand comes round to the mouth,
 * calling HELP! — and `curl` 0..1 tucks in harder (something lunging, a shot
 * nearby). Add `shiver`. (Arm angles fitted to the rig so the painted arms and
 * the hitboxes agree from the front, three-quarter and side views.)
 */
export function poseCower(p: PoseBuf, t: number, peek: number, look: number, curl: number, kneel: number, call = 0) {
  poseStand(p);
  const kx = kneel > 0 ? J.HIP_L_X : J.HIP_R_X;
  const kk = kneel > 0 ? J.KNEE_L : J.KNEE_R;
  const fx = kneel > 0 ? J.HIP_R_X : J.HIP_L_X;
  const fk = kneel > 0 ? J.KNEE_R : J.KNEE_L;
  // Kneeling leg: thigh down and back, shin along the floor; the other foot planted in front.
  p[kx] = -0.5 - 0.08 * curl;
  p[kk] = 2.05;
  p[fx] = -1.45 - 0.1 * curl;
  p[fk] = 2.15 + 0.1 * curl;
  p[J.HIP_L_Z] = 0.2;
  p[J.HIP_R_Z] = -0.2;
  // (A touch high: the kneeling foot's toes stay over the floor, tucked in harder too.)
  p[J.HIPS_Y] = Math.max(kneelY(p[kx]), footY(p[fx], p[fk])) + 0.015 - 0.02 * curl;
  p[J.HIPS_Z] = -0.03;
  // Folded down over the front knee, panting.
  // (Tucking in harder drops the hips and the head, not the back: the arms stay fitted.)
  p[J.SPINE_X] = 0.76 - 0.14 * peek;
  p[J.CHEST_X] = 0.28 - 0.08 * peek + Math.sin(t * 7) * 0.03;
  p[J.SPINE_Y] = look * 0.1 * peek;
  // Head tucked down between the arms; peeking lifts only the neck and head.
  p[J.NECK_X] = 0.15 - 0.45 * peek + 0.05 * curl;
  p[J.HEAD_X] = 0.24 - 0.74 * peek + 0.08 * curl;
  p[J.HEAD_Y] = look * 0.6 * peek;
  // Hands clasped on the back of the head, elbows by the face; peeking, the
  // forearms open up beside the face (the shoulders stay up: SH_X ≤ −1.95).
  p[J.SH_L_X] = p[J.SH_R_X] = -2.39 + 0.44 * peek;
  p[J.SH_L_Y] = -0.63 - 0.6 * peek;
  p[J.SH_R_Y] = 0.63 + 0.6 * peek;
  p[J.SH_L_Z] = -0.07 - 0.3 * peek;
  p[J.SH_R_Z] = 0.07 + 0.3 * peek;
  p[J.EL_L_X] = p[J.EL_R_X] = -1.83 + 0.35 * peek;
  if (call !== 0 && peek > 0) {
    // That hand round to the mouth, calling out (blended in with the peek).
    const x = call > 0 ? J.SH_L_X : J.SH_R_X;
    const y = call > 0 ? J.SH_L_Y : J.SH_R_Y;
    const z = call > 0 ? J.SH_L_Z : J.SH_R_Z;
    const e = call > 0 ? J.EL_L_X : J.EL_R_X;
    const a0 = p[x];
    const a1 = p[y];
    const a2 = p[z];
    const a3 = p[e];
    handAtMouth(p, call);
    p[x] = a0 + (p[x] - a0) * peek;
    p[y] = a1 + (p[y] - a1) * peek;
    p[z] = a2 + (p[z] - a2) * peek;
    p[e] = a3 + (p[e] - a3) * peek;
  }
}

/**
 * The 0.12 s startle before ducking: a jolt upright, shoulders up, hands snapped
 * in front of the chin, head pulled back.
 */
export function poseStartle(p: PoseBuf, t: number) {
  poseStand(p);
  p[J.HIP_L_X] = p[J.HIP_R_X] = -0.18;
  p[J.KNEE_L] = p[J.KNEE_R] = 0.3;
  p[J.HIP_L_Z] = 0.08;
  p[J.HIP_R_Z] = -0.08;
  p[J.HIPS_Y] = legsHeight(p);
  p[J.SPINE_X] = -0.12;
  p[J.NECK_X] = -0.15;
  p[J.HEAD_X] = 0.1;
  p[J.HEAD_Z] = Math.sin(t * 40) * 0.05;
  for (let s = 1; s >= -1; s -= 2) {
    headPoint(p, s * 0.07, -0.04, 0.2, _hp);
    ikArm(p, s, _hp, s, -0.8, 0);
  }
}

/**
 * HIDE: crouched low behind cover with the back turned to the camera (facing
 * the cover and the danger beyond), hands on the cover's edge; `peek` 0..1
 * rises to look out over it, leaning out to `lean` (±1 = the character's left /
 * right); `glance` −1..1 looks back over a shoulder at the camera ("help me!").
 * Only where the stage put cover right in front (the d1 ranger in the ferns):
 * in the open it would be a mime pushing an invisible box.
 */
export function poseHide(p: PoseBuf, t: number, peek: number, lean: number, glance: number) {
  poseStand(p);
  const c = 1 - peek * 0.35;
  p[J.HIP_L_X] = -1.3 * c - 0.1;
  p[J.HIP_R_X] = -1.05 * c - 0.15;
  p[J.KNEE_L] = 2.15 * c + 0.25;
  p[J.KNEE_R] = 1.9 * c + 0.3;
  p[J.HIP_L_Z] = 0.22;
  p[J.HIP_R_Z] = -0.2;
  p[J.HIPS_Y] = legsHeight(p) - 0.02;
  p[J.HIPS_Z] = -0.05;
  p[J.SPINE_X] = 0.6 - 0.3 * peek;
  p[J.SPINE_Z] = -0.16 * lean * peek;
  p[J.CHEST_X] = 0.14 + Math.sin(t * 6.5) * 0.02;
  p[J.NECK_X] = 0.05 - 0.3 * peek;
  p[J.HEAD_X] = 0.2 - 0.45 * peek;
  p[J.HEAD_Z] = 0.12 * lean * peek;
  // Glancing back over the shoulder (turning the head and the chest).
  p[J.HEAD_Y] = 1.2 * glance;
  p[J.NECK_Y] = 0.25 * glance;
  p[J.CHEST_Y] = 0.3 * glance;
  // Hands on the cover in front (foliage, a low wall), a little apart, rising
  // with the peek — never over the head. (Fitted to the rig.)
  p[J.SH_L_X] = p[J.SH_R_X] = -1.3 - 0.1 * peek;
  p[J.SH_L_Z] = 0.12;
  p[J.SH_R_Z] = -0.12;
  p[J.EL_L_X] = p[J.EL_R_X] = -1.0 - 0.15 * peek;
}

/**
 * BACK AWAY: stepping backwards (walk `phase`, hip swing `amp`) knees soft,
 * leaning back from the threat it faces, one forearm across the face (`guard`
 * +1 = the left), the other hand reaching back behind for a way out; `fear`
 * 0..1 turns the face away behind the guard.
 */
export function poseBackAway(p: PoseBuf, phase: number, amp: number, fear: number, guard: number) {
  poseStand(p);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  p[J.HIP_L_X] = -s * amp - 0.14;
  p[J.HIP_R_X] = s * amp - 0.14;
  p[J.KNEE_L] = 0.45 + Math.max(0, c) * 0.35;
  p[J.KNEE_R] = 0.45 + Math.max(0, -c) * 0.35;
  p[J.HIP_L_Z] = 0.06;
  p[J.HIP_R_Z] = -0.06;
  p[J.HIPS_Y] = legsHeight(p);
  p[J.HIPS_RY] = 0.08 * s;
  p[J.SPINE_X] = -0.2 - 0.08 * fear;
  p[J.SPINE_Y] = -0.15 * guard;
  p[J.NECK_X] = 0.2;
  p[J.HEAD_X] = 0.12 + 0.1 * fear;
  p[J.HEAD_Y] = -0.4 * fear * guard;
  // Forearm up in front of the face on its own side, elbow out (shielding).
  headPoint(p, guard * 0.08, 0.24, 0.2, _hp);
  ikArm(p, guard, _hp, guard, 0.3, 0.3);
  // The other hand reaching back.
  const shX = guard > 0 ? J.SH_R_X : J.SH_L_X;
  const shZ = guard > 0 ? J.SH_R_Z : J.SH_L_Z;
  const el = guard > 0 ? J.EL_R_X : J.EL_L_X;
  p[shX] = 0.6 + 0.08 * s;
  p[shZ] = -guard * 0.38;
  p[el] = -0.2;
}

/**
 * FALL: `u` 0..1 through a backpedal trip — tipping back with the arms thrown
 * out (0–0.18), down on the seat scooting back on hands and heels (0.18–0.66),
 * rolling forward onto hands and knees (0.66–1, then the caller blends into the
 * run).
 */
export function poseFall(p: PoseBuf, u: number, t: number) {
  poseStand(p);
  if (u < 0.18) {
    const k = smoothstep(0, 1, u / 0.18);
    p[J.HIP_L_X] = -0.3 - 0.9 * k;
    p[J.KNEE_L] = 0.3 + 0.3 * k;
    p[J.HIP_R_X] = -0.1 - 0.5 * k;
    p[J.KNEE_R] = 0.4 + 0.9 * k;
    p[J.HIPS_Y] = 0.92 - 0.6 * k;
    p[J.HIPS_Z] = -0.1 * k;
    p[J.SPINE_X] = -0.2 - 0.35 * k;
    p[J.HEAD_X] = 0.25 * k;
    // Arms flung up and out, grabbing at the air.
    p[J.SH_L_X] = -1.1 - 0.6 * k;
    p[J.SH_R_X] = -0.9 - 0.9 * k;
    p[J.SH_L_Z] = 0.5 + 0.8 * k;
    p[J.SH_R_Z] = -0.4 - 0.9 * k;
    p[J.EL_L_X] = -0.9;
    p[J.EL_R_X] = -0.5;
    return;
  }
  if (u < 0.66) {
    // On the seat, leaning back on straight arms, heels digging in to push back.
    const scoot = key2(t, 2.2, 0.2);
    p[J.HIPS_Y] = 0.15;
    p[J.HIP_L_X] = -1.35 + 0.15 * scoot;
    p[J.HIP_R_X] = -1.2 - 0.15 * scoot;
    p[J.KNEE_L] = 0.9 + 0.5 * scoot;
    p[J.KNEE_R] = 1.4 - 0.5 * scoot;
    p[J.HIP_L_Z] = 0.18;
    p[J.HIP_R_Z] = -0.18;
    p[J.SPINE_X] = -0.55;
    p[J.CHEST_X] = 0.1;
    p[J.NECK_X] = 0.35;
    p[J.HEAD_X] = 0.3;
    p[J.HEAD_Y] = 0.25 * Math.sin(t * 3);
    for (let s = 1; s >= -1; s -= 2) {
      rootToChest(p, s * 0.26, 0.02, -0.38, _hp);
      ikArm(p, s, _hp, s * 0.3, 0, 1);
    }
    return;
  }
  // Rolling over onto hands and knees.
  poseStumble(p, 0.5, t);
}

/**
 * FLEE: a panicked sprint (stride `phase`), arms pumping and flailing; `look`
 * −1..1 twists round to look back over a shoulder at what's chasing.
 */
export function poseFlee(p: PoseBuf, phase: number, look: number, panic: number) {
  poseStand(p);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  p[J.HIP_L_X] = s * 0.9 - 0.18;
  p[J.HIP_R_X] = -s * 0.9 - 0.18;
  p[J.KNEE_L] = 0.3 + Math.max(0, -c) * 1.45;
  p[J.KNEE_R] = 0.3 + Math.max(0, c) * 1.45;
  p[J.HIPS_Y] = 0.86 + Math.abs(s) * 0.05;
  p[J.HIPS_RY] = s * 0.12;
  p[J.SPINE_X] = 0.32 - 0.12 * Math.abs(look);
  p[J.SPINE_Y] = -s * 0.1 + 0.45 * look;
  p[J.CHEST_Y] = 0.2 * look;
  p[J.NECK_X] = -0.1;
  p[J.HEAD_X] = -0.15;
  p[J.HEAD_Y] = 1.15 * look;
  // Arms: pumping (opposite to the legs), flung wider in panic.
  p[J.SH_L_X] = -s * 0.95 - 0.2;
  p[J.SH_R_X] = s * 0.95 - 0.2;
  p[J.SH_L_Z] = 0.2 + 0.35 * panic * Math.max(0, s);
  p[J.SH_R_Z] = -0.2 - 0.35 * panic * Math.max(0, -s);
  p[J.EL_L_X] = -1.3 + 0.5 * panic * Math.max(0, -s);
  p[J.EL_R_X] = -1.3 + 0.5 * panic * Math.max(0, s);
}

/**
 * STUMBLE: `u` 0..1 through a trip — pitching forward with the arms thrown out
 * (0–0.22), down on hands and knees looking back (0.22–0.62), scrambling back up
 * into a run (0.62–1, blended by the caller into `poseFlee`).
 */
export function poseStumble(p: PoseBuf, u: number, t: number) {
  poseStand(p);
  if (u < 0.22) {
    const k = u / 0.22;
    p[J.HIP_L_X] = -0.75 * k;
    p[J.KNEE_L] = 0.4 + 0.5 * k;
    p[J.HIP_R_X] = 0.65;
    p[J.KNEE_R] = 1.3;
    p[J.HIPS_Y] = 0.92 - 0.25 * k;
    p[J.HIPS_Z] = 0.1 * k;
    p[J.SPINE_X] = 0.55 + 0.6 * k;
    p[J.HEAD_X] = -0.45 * k;
    p[J.SH_L_X] = p[J.SH_R_X] = -1.4 - 0.3 * k;
    p[J.SH_L_Z] = 0.35;
    p[J.SH_R_Z] = -0.35;
    p[J.EL_L_X] = p[J.EL_R_X] = -0.25;
    return;
  }
  // On all fours: thighs under the hips, shins on the floor, arms straight down.
  const g = Math.min(1, (u - 0.22) / 0.12);
  const torso = 1.12 + 0.18 * g;
  p[J.HIP_L_X] = -0.18;
  p[J.HIP_R_X] = -0.32;
  p[J.KNEE_L] = 1.55;
  p[J.KNEE_R] = 1.7;
  p[J.HIP_L_Z] = 0.1;
  p[J.HIP_R_Z] = -0.1;
  p[J.HIPS_Y] = 0.57;
  p[J.SPINE_X] = torso;
  p[J.CHEST_X] = 0.12;
  p[J.NECK_X] = -0.35;
  p[J.HEAD_X] = -0.55;
  // Panting, head jerking round to look back.
  p[J.CHEST_X] += Math.sin(t * 8) * 0.03;
  p[J.HEAD_Y] = 0.6 * Math.sin(t * 2.6);
  p[J.SH_L_X] = p[J.SH_R_X] = -(torso + 0.12) + 0.1 * Math.sin(t * 9);
  p[J.SH_L_Z] = 0.12;
  p[J.SH_R_Z] = -0.12;
  p[J.EL_L_X] = p[J.EL_R_X] = -0.15;
}

/**
 * GRABBED: a tug of war with the zombie on `side` (+1 = at the character's
 * left): leaning hard away from it, weight on the bent far leg, the near leg
 * straight and its heel dug in, chest turned toward it so BOTH hands can pull on
 * the held wrist (the caller puts the hands there with `ikArm`). `yank` 0..1 is
 * the zombie's jerk: dragged upright toward it, the near foot stumbling a step,
 * the head snapping; `look` −1..1 turns the head from the zombie (−) to the
 * camera (+, screaming for help).
 */
export function poseGrabbed(p: PoseBuf, t: number, side: number, yank: number, look: number) {
  poseStand(p);
  const nx = side > 0 ? J.HIP_L_X : J.HIP_R_X;
  const nz = side > 0 ? J.HIP_L_Z : J.HIP_R_Z;
  const nk = side > 0 ? J.KNEE_L : J.KNEE_R;
  const fx = side > 0 ? J.HIP_R_X : J.HIP_L_X;
  const fz = side > 0 ? J.HIP_R_Z : J.HIP_L_Z;
  const fk = side > 0 ? J.KNEE_R : J.KNEE_L;
  const y = yank;
  // Near leg out toward the zombie, straight, heel dug in (a stumbling step on a yank).
  p[nz] = side * (0.36 - 0.12 * y);
  p[nx] = -0.12 - 0.45 * y;
  p[nk] = 0.06 + 0.7 * y;
  // Far leg bent under the weight, out the other way.
  p[fz] = -side * (0.2 - 0.08 * y);
  p[fx] = -0.45 + 0.25 * y;
  p[fk] = 0.85 - 0.45 * y;
  p[J.HIPS_Y] = legsHeight(p) - 0.03;
  p[J.HIPS_X] = -side * (0.15 - 0.12 * y);
  p[J.HIPS_RZ] = side * 0.08 * (1 - y);
  // Leaning hard away (z > 0 leans toward −X) — dragged upright on the yank.
  p[J.SPINE_Z] = side * (0.5 - 0.32 * y);
  p[J.CHEST_Z] = side * 0.08 * (1 - y);
  p[J.SPINE_X] = 0.1 + 0.12 * y;
  p[J.SPINE_Y] = side * 0.35;
  p[J.NECK_X] = -0.08;
  // Head: to the camera screaming, or back at the zombie straining; snapped on a yank.
  p[J.HEAD_Y] = look > 0 ? -side * (0.5 + 0.3 * look) : side * 0.55 * -look;
  p[J.HEAD_Z] = -side * (0.18 - 0.4 * y);
  p[J.HEAD_X] = -0.1 - 0.15 * y;
  // (Arms: `ikArm` onto the zombie's grip after this; a reach toward it meanwhile.)
  p[side > 0 ? J.SH_L_Z : J.SH_R_Z] = side * 1.2;
  p[side > 0 ? J.SH_L_X : J.SH_R_X] = -0.5;
  p[side > 0 ? J.EL_L_X : J.EL_R_X] = -0.1;
  p[side > 0 ? J.SH_R_X : J.SH_L_X] = -1.3;
  p[side > 0 ? J.SH_R_Z : J.SH_L_Z] = side * 0.4;
  p[side > 0 ? J.EL_R_X : J.EL_L_X] = -0.3;
  void t;
}

/**
 * Both hands onto the zombie's grip, given in the CHEST frame: the held hand at
 * `grip`, the free hand on the held wrist just inside it (`wrist`) — both arms
 * pull.
 */
export function grabArms(p: PoseBuf, side: number, grip: THREE.Vector3, wrist: THREE.Vector3) {
  ikArm(p, side, grip, side * 0.3, -1, -0.4);
  ikArm(p, -side, wrist, -side * 0.2, -1, 0.3);
}

/**
 * RESCUED: relief — a sigh (`sag` 0..1 = the first exhale, shoulders dropping),
 * then a thumbs-up at chest height with a nod (pass `HAND.THUMB` for that hand),
 * or a wave from a bent elbow at shoulder height; the other hand on the chest.
 * `side` +1 = the left hand gestures.
 */
export function poseThanks(p: PoseBuf, t: number, side: number, thumb: boolean, sag: number) {
  poseStand(p);
  p[J.HIP_L_Z] = 0.05;
  p[J.HIP_R_Z] = -0.05;
  p[J.KNEE_L] = p[J.KNEE_R] = 0.08 + 0.25 * sag;
  p[J.HIP_L_X] = p[J.HIP_R_X] = -0.04 - 0.12 * sag;
  p[J.HIPS_Y] = legsHeight(p);
  p[J.SPINE_X] = -0.04 + 0.32 * sag;
  p[J.NECK_X] = 0.1 * sag;
  // Two nods.
  const nod = t < 1.1 ? key2(t, 2.6, 0.2) : 0;
  p[J.HEAD_X] = -0.08 + 0.25 * sag + 0.22 * nod * (1 - sag);
  p[J.HEAD_Z] = 0.08 * side;
  if (thumb) {
    _hp2.set(side * 0.3, 0.06 + 0.03 * nod, 0.38);
    ikArm(p, side, _hp2, side, -1, -0.2);
  } else {
    const k = key2(t, 2.4);
    _hp2.set(side * (0.42 + 0.14 * k), 0.16 - 0.05 * k, 0.17);
    ikArm(p, side, _hp2, side, -0.8, -0.2);
  }
  // The other hand on the chest (phew).
  _hp2.set(-side * 0.04, -0.14, 0.15);
  ikArm(p, -side, _hp2, -side, -1, 0);
}

/** A relieved jog off screen (stride `phase`). */
export function poseJog(p: PoseBuf, phase: number) {
  poseStand(p);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  p[J.HIP_L_X] = s * 0.75 - 0.12;
  p[J.HIP_R_X] = -s * 0.75 - 0.12;
  p[J.KNEE_L] = 0.25 + Math.max(0, -c) * 1.2;
  p[J.KNEE_R] = 0.25 + Math.max(0, c) * 1.2;
  p[J.HIPS_Y] = 0.89 + Math.abs(s) * 0.04;
  p[J.HIPS_RY] = s * 0.1;
  p[J.SPINE_X] = 0.2;
  p[J.SPINE_Y] = -s * 0.08;
  p[J.SH_L_X] = -s * 0.8 - 0.15;
  p[J.SH_R_X] = s * 0.8 - 0.15;
  p[J.SH_L_Z] = 0.15;
  p[J.SH_R_Z] = -0.15;
  p[J.EL_L_X] = p[J.EL_R_X] = -1.35;
}

// ─── Reaching ──────────────────────────────────────────────────────────────

const _t = new THREE.Vector3();

/**
 * Point an arm at a world point: sets its shoulder's x / z so the arm hangs
 * straight toward `target` (the rig's matrices must be current up to the chest),
 * leaving the elbow as posed. The zombie holding a grabbed civilian reaches with
 * it.
 */
export function aimArm(arm: Limb, target: THREE.Vector3) {
  const chest = arm.shoulder.parent;
  if (!chest) return;
  chest.updateWorldMatrix(true, false);
  _t.copy(target);
  chest.worldToLocal(_t).sub(arm.shoulder.position);
  const len = _t.length();
  if (len < 1e-4) return;
  _t.divideScalar(len);
  // Euler XYZ on (0, −1, 0): (sin z, −cos z·cos x, −cos z·sin x).
  const z = Math.asin(Math.max(-1, Math.min(1, _t.x)));
  const x = Math.atan2(-_t.z, -_t.y);
  arm.shoulder.rotation.set(x, 0, z);
}

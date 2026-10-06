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

/** −1, 0 or +1 for segment `k` (a hash: deterministic, allocation-free). */
function pick3(k: number): number {
  const h = (Math.imul(k | 0, 0x9e3779b1) >>> 0) / 4294967296;
  return h < 0.34 ? -1 : h < 0.67 ? 0 : 1;
}

/**
 * Ducked down and keeping still is not frozen: every 1.25 s the head turns to
 * look out under an arm one way or the other (or back), and the weight shifts
 * with it — held, eased over 0.15 s, never rising. `amt` 0..1 (0 while peeking).
 */
export function fidget(p: PoseBuf, t: number, amt: number) {
  if (amt <= 0) return;
  const x = t / 1.25;
  const k = Math.floor(x);
  const v = pick3(k - 1) + (pick3(k) - pick3(k - 1)) * smoothstep(0, 0.12, x - k);
  p[J.HEAD_Y] += 0.38 * v * amt;
  p[J.NECK_Y] += 0.12 * v * amt;
  p[J.HIPS_X] += 0.03 * v * amt;
  p[J.SPINE_Z] -= 0.06 * v * amt;
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
 * Two-bone IK core: the shoulder rotation (into `_eu`, XYZ) and the elbow flex
 * (returned) that put the end of an arm `upper` + `fore` long at `a` (from the
 * shoulder, in its parent's frame), the elbow bending toward the pole (px, py,
 * pz). Out of reach: the arm points straight at it.
 */
function solveArm(a: THREE.Vector3, upper: number, fore: number, px: number, py: number, pz: number): number {
  let d = a.length();
  if (d < 1e-4) {
    _eu.set(0, 0, 0);
    return 0;
  }
  a.divideScalar(d);
  d = clamp(d, 0.4 * upper, (upper + fore) * 0.999);
  const flex = -(Math.PI - Math.acos(clamp((upper * upper + fore * fore - d * d) / (2 * upper * fore), -1, 1)));
  const th = Math.acos(clamp((upper * upper + d * d - fore * fore) / (2 * upper * d), -1, 1));
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
  return flex;
}

/**
 * Two-bone IK: set arm `side`'s (+1 left) shoulder and elbow in the pose so its
 * hand lands on `target` (chest frame, rig units), the elbow bending toward the
 * pole (px, py, pz). Out of reach: the arm points straight at it.
 */
export function ikArm(p: PoseBuf, side: number, target: THREE.Vector3, px: number, py: number, pz: number) {
  const a = _a.set(target.x - side * SH_OX, target.y - SH_OY, target.z);
  if (a.lengthSq() < 1e-8) return;
  const flex = solveArm(a, UPPER, FORE, px, py, pz);
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

const _lq = new THREE.Quaternion();
const _lp = new THREE.Vector3();

/**
 * Two-bone IK on a rig's arm in WORLD space (the zombie holding a civilian):
 * its hand onto `target`, the elbow bending toward world direction `pole`;
 * writes the shoulder rotation and the elbow flex straight onto the rig (its
 * parent's matrices must be current). Arm lengths are read off the rig.
 */
export function ikLimb(arm: Limb, target: THREE.Vector3, pole: THREE.Vector3) {
  const parent = arm.shoulder.parent;
  if (!parent) return;
  const upper = Math.abs(arm.elbow.position.y);
  const fore = Math.abs(arm.end.position.y);
  const a = _a.copy(target);
  parent.worldToLocal(a).sub(arm.shoulder.position);
  parent.getWorldQuaternion(_lq).invert();
  _lp.copy(pole).applyQuaternion(_lq);
  const flex = solveArm(a, upper, fore, _lp.x, _lp.y, _lp.z);
  arm.shoulder.rotation.copy(_eu);
  arm.elbow.rotation.set(flex, 0, 0);
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

/** Where the hand cups the mouth (chest frame), arm `side`: just in front of the chin, a little to that side. */
function mouthPoint(p: PoseBuf, side: number, out: THREE.Vector3): THREE.Vector3 {
  return headPoint(p, side * 0.05, 0.05, 0.2, out);
}

/** Clamp how far an arm is raised out sideways (|shoulder z| ≤ `max`): the elbow kept in. */
function elbowIn(p: PoseBuf, side: number, max: number) {
  const z = side > 0 ? J.SH_L_Z : J.SH_R_Z;
  p[z] = clamp(p[z], -max, max);
}

/**
 * Hand cupped at the mouth (calling out), arm `side`: the elbow DOWN by the ribs
 * and a little forward, the forearm up in front of the chest to the chin — a
 * shape that reads on a 40-texel sprite (an elbow lifted out to shoulder height
 * with the forearm folded back at the face paints as an arm straight out).
 */
function handAtMouth(p: PoseBuf, side: number) {
  mouthPoint(p, side, _hp);
  ikArm(p, side, _hp, side * 0.25, -1, 0.6);
  elbowIn(p, side, 0.5);
}

const _fq = new THREE.Quaternion();
const _fe = new THREE.Euler();

/**
 * Forward kinematics of arm `side` in pose `p` (chest frame, rig units): where
 * its elbow and hand are — to blend a hand's TARGET from where a fitted pose put
 * it to somewhere else and solve the IK every frame (blending the joint angles
 * instead swings the arm out through the air on the way).
 */
export function armFK(p: PoseBuf, side: number, elbow: THREE.Vector3, hand: THREE.Vector3) {
  const l = side > 0;
  _fq.setFromEuler(_fe.set(p[l ? J.SH_L_X : J.SH_R_X], p[l ? J.SH_L_Y : J.SH_R_Y], p[l ? J.SH_L_Z : J.SH_R_Z]));
  elbow.set(0, -UPPER, 0).applyQuaternion(_fq);
  hand
    .set(0, -FORE, 0)
    .applyEuler(_fe.set(p[l ? J.EL_L_X : J.EL_R_X], 0, 0))
    .applyQuaternion(_fq)
    .add(elbow);
  elbow.x += side * SH_OX;
  elbow.y += SH_OY;
  hand.x += side * SH_OX;
  hand.y += SH_OY;
}

const _e0 = new THREE.Vector3();
const _h0 = new THREE.Vector3();
const _e1 = new THREE.Vector3();

/**
 * Move arm `side`'s hand from where pose `p` has it now to `target` (chest
 * frame) by `w` 0..1 — the hand travels on a straight line and the elbow swings
 * from where it is toward pole (px, py, pz): two-bone IK every frame.
 */
function handTo(p: PoseBuf, side: number, target: THREE.Vector3, w: number, px: number, py: number, pz: number) {
  if (w <= 0) return;
  armFK(p, side, _e0, _h0);
  // (The elbow's current bend direction, off the shoulder→hand line.)
  _e0.x -= side * SH_OX;
  _e0.y -= SH_OY;
  _e1.set(px, py, pz).normalize();
  const n = _e0.length();
  if (n > 1e-4) _e0.divideScalar(n);
  _e0.lerp(_e1, w);
  _h0.lerp(target, w);
  ikArm(p, side, _h0, _e0.x, _e0.y, _e0.z);
}

// ─── Acts ────────────────────────────────────────────────────────────────────

/**
 * HELP!: crouched forward toward the camera, knees bent, calling out with one
 * hand cupped at the mouth (elbow down) while the other waves beside the head
 * from an elbow held in front at chest height (`side` +1 = the left arm waves) —
 * two held positions, 2.5 waves a second. Never an arm out to the side, never a
 * hand over the head. `big` (far off, or perched up on something): a deeper
 * crouch bouncing on the knees and a bigger swing of the forearm. `look` turns
 * the head (radians). The caller turns the body 0.35–0.5 rad off the camera so
 * the knee bend and the lean show in silhouette.
 */
export function posePlead(p: PoseBuf, t: number, side: number, big: boolean, look: number) {
  poseStand(p);
  const k = key2(t, 2.5);
  // (Far / perched: bouncing on the knees, 3 a second, held at each end.)
  const b = big ? key2(t + 0.07, 3, 0.2) : 0;
  const bend = big ? 0.2 : 0;
  // The waving side's foot a short step forward, the other back: a stance, not a soldier at attention.
  const fx = side > 0 ? J.HIP_L_X : J.HIP_R_X;
  const bx = side > 0 ? J.HIP_R_X : J.HIP_L_X;
  const fk = side > 0 ? J.KNEE_L : J.KNEE_R;
  const bk = side > 0 ? J.KNEE_R : J.KNEE_L;
  p[fx] = -0.62 - bend - 0.12 * b - 0.04 * k;
  p[fk] = 0.95 + bend + 0.2 * b + 0.06 * k;
  p[bx] = -0.18 - bend * 0.8 - 0.1 * b;
  p[bk] = 0.85 + bend + 0.2 * b;
  p[J.HIP_L_Z] = 0.12;
  p[J.HIP_R_Z] = -0.12;
  p[J.HIPS_Y] = legsHeight(p);
  p[J.HIPS_Z] = -0.06;
  // Leaning in toward the player, face up to them.
  p[J.SPINE_X] = 0.42 + 0.06 * b;
  p[J.CHEST_X] = 0.06;
  p[J.SPINE_Z] = -0.05 * side;
  p[J.SPINE_Y] = 0.12 * side;
  p[J.NECK_X] = -0.3;
  p[J.HEAD_X] = -0.26 + 0.06 * k;
  p[J.HEAD_Y] = look;
  p[J.HEAD_Z] = 0.1 * side - 0.06 * side * k;
  handAtMouth(p, -side);
  // The wave: elbow in front at chest height, a little out; the forearm up
  // beside the face, swinging out and back from the elbow.
  // (Elbow BELOW the shoulder: an upper arm level with it reads as an arm held
  // out sideways once the body turns.)
  const sw = big ? 0.17 : 0.13;
  _hp2.set(side * (0.27 + sw * k), 0.24 - 0.07 * k, 0.22 - 0.03 * k);
  ikArm(p, side, _hp2, side * 0.1, -1, 0.15);
  elbowIn(p, side, 1.1);
}

/**
 * COWER: down on both knees (`kneel` +1 = the left one a little further
 * forward), folded over them, head tucked down, hands clasped over the back of
 * the head, elbows in front of the face. `peek` 0..1 lifts only the neck and
 * head (never the hips) to look out over the forearms (toward `look`, radians in
 * the body frame) — the forearms come down hugging the chest; `call` ±1: that
 * hand comes down to the mouth instead, elbow by the ribs, calling HELP! — and
 * `curl` 0..1 tucks in harder (something lunging, a shot nearby). Add `shiver`. (Arm angles fitted to the rig so the painted arms and
 * the hitboxes agree from the front, three-quarter and side views.)
 */
export function poseCower(p: PoseBuf, t: number, peek: number, look: number, curl: number, kneel: number, call = 0) {
  poseStand(p);
  const kx = kneel > 0 ? J.HIP_L_X : J.HIP_R_X;
  const kk = kneel > 0 ? J.KNEE_L : J.KNEE_R;
  const fx = kneel > 0 ? J.HIP_R_X : J.HIP_L_X;
  const fk = kneel > 0 ? J.KNEE_R : J.KNEE_L;
  // Down on both knees, sitting back toward the heels, knees a little apart (one
  // knee up with the other foot planted reads, turned, as a sprinter in the blocks).
  p[kx] = -0.75 - 0.08 * curl;
  p[kk] = 2.2 + 0.08 * curl;
  p[fx] = -0.9 - 0.08 * curl;
  p[fk] = 2.35 + 0.08 * curl;
  p[J.HIP_L_Z] = 0.16;
  p[J.HIP_R_Z] = -0.16;
  p[J.HIPS_Y] = Math.max(kneelY(p[kx]), kneelY(p[fx])) + 0.01 - 0.02 * curl;
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
    // That hand comes down off the head to the mouth, calling out, the elbow
    // dropping by the ribs (the hand's target blended with the peek, IK each frame).
    mouthPoint(p, call, _hp);
    handTo(p, call, _hp, smoothstep(0, 1, peek), call * 0.25, -1, 0.6);
    elbowIn(p, call, 0.5 + 0.6 * (1 - peek));
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
 * BACK AWAY: stepping backwards (walk `phase`, hip swing `amp`) on bent knees,
 * recoiling from the threat it faces — leaning back, chin tucked, the face
 * turned away — one hand up in front of the face, palm out at it, elbow down
 * (`guard` +1 = the left), the other reaching back behind for a way out;
 * `fear` 0..1 recoils harder.
 */
export function poseBackAway(p: PoseBuf, phase: number, amp: number, fear: number, guard: number) {
  poseStand(p);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  p[J.HIP_L_X] = -s * amp - 0.2;
  p[J.HIP_R_X] = s * amp - 0.2;
  p[J.KNEE_L] = 0.5 + Math.max(0, c) * 0.35;
  p[J.KNEE_R] = 0.5 + Math.max(0, -c) * 0.35;
  p[J.HIP_L_Z] = 0.16;
  p[J.HIP_R_Z] = -0.16;
  p[J.HIPS_Y] = legsHeight(p);
  p[J.HIPS_Z] = -0.04;
  p[J.HIPS_RY] = 0.08 * s;
  // Recoiling: the hips back under a torso leaning away from it.
  p[J.SPINE_X] = -0.24 - 0.1 * fear;
  p[J.SPINE_Y] = -0.15 * guard;
  // Chin tucked, the face turned away behind the raised hand.
  p[J.NECK_X] = 0.28;
  p[J.NECK_Y] = -0.15 * guard;
  p[J.HEAD_X] = 0.22 + 0.08 * fear;
  p[J.HEAD_Y] = -guard * (0.3 + 0.25 * fear);
  // The hand up in front of the face, at nose height a forearm out, palm toward it; elbow down.
  headPoint(p, guard * 0.04, 0.1, 0.3, _hp);
  ikArm(p, guard, _hp, guard * 0.45, -1, 0.15);
  elbowIn(p, guard, 0.9);
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
 * left): weight dropped low and leaning hard away from it, the far leg bent
 * deep under the weight, the near leg out toward it with the heel dug in, the
 * chest turned toward it so BOTH hands haul on the held wrist (the caller puts
 * the hands there with `ikArm`). `yank` 0..1 is the zombie's jerk: dragged up
 * and toward it, the head snapping. The feet: `nearX` / `farX` (m, + toward the
 * zombie, from the hips) are where the caller has put each foot — the yank
 * drags them two stumbling steps toward it, they step back as they haul — and
 * `nearUp` / `farUp` 0..1 lift the foot that's stepping. `look` −1..1 turns the
 * head from the zombie (−) to the camera (+, screaming for help).
 */
export function poseGrabbed(p: PoseBuf, t: number, side: number, yank: number, look: number, nearX = 0, farX = 0, nearUp = 0, farUp = 0) {
  poseStand(p);
  const nx = side > 0 ? J.HIP_L_X : J.HIP_R_X;
  const nz = side > 0 ? J.HIP_L_Z : J.HIP_R_Z;
  const nk = side > 0 ? J.KNEE_L : J.KNEE_R;
  const fx = side > 0 ? J.HIP_R_X : J.HIP_L_X;
  const fz = side > 0 ? J.HIP_R_Z : J.HIP_L_Z;
  const fk = side > 0 ? J.KNEE_R : J.KNEE_L;
  const y = yank;
  // Near leg out toward the zombie, nearly straight, heel dug in.
  p[nz] = side * (0.34 - 0.1 * y + nearX / 0.88);
  p[nx] = -0.3 - 0.25 * y - 0.35 * nearUp;
  p[nk] = 0.45 + 0.25 * y + 0.75 * nearUp;
  // Far leg bent deep under the weight, out the other way.
  p[fz] = side * (-0.16 + 0.06 * y + farX / 0.88);
  p[fx] = -0.85 + 0.3 * y - 0.3 * farUp;
  p[fk] = 1.2 - 0.4 * y + 0.7 * farUp;
  p[J.HIPS_Y] = legsHeight(p) - 0.02;
  p[J.HIPS_X] = -side * (0.12 - 0.1 * y);
  p[J.HIPS_RZ] = side * 0.1 * (1 - y);
  // Leaning hard away (z > 0 leans toward −X) — dragged upright on the yank.
  p[J.SPINE_Z] = side * (0.5 - 0.3 * y);
  p[J.CHEST_Z] = side * 0.08 * (1 - y);
  p[J.SPINE_X] = 0.2 + 0.1 * y;
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
    // (Elbow down in front, the forearm up beside the face — as the HELP! wave.)
    const k = key2(t, 2.4);
    _hp2.set(side * (0.28 + 0.1 * k), 0.28 - 0.03 * k, 0.22);
    ikArm(p, side, _hp2, side * 0.35, -1, 0.75);
    elbowIn(p, side, 1.1);
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

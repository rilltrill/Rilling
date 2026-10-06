import * as THREE from 'three';
import type { HumanoidRig, Limb } from '../content/kit/humanoid';

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
  r.armL.shoulder.rotation.set(p[J.SH_L_X], p[J.SH_L_Y], p[J.SH_L_Z]);
  r.armL.elbow.rotation.set(p[J.EL_L_X], 0, 0);
  r.armR.shoulder.rotation.set(p[J.SH_R_X], p[J.SH_R_Y], p[J.SH_R_Z]);
  r.armR.elbow.rotation.set(p[J.EL_R_X], 0, 0);
  r.legL.hip.rotation.set(p[J.HIP_L_X], 0, p[J.HIP_L_Z]);
  r.legL.knee.rotation.set(p[J.KNEE_L], 0, 0);
  r.legR.hip.rotation.set(p[J.HIP_R_X], 0, p[J.HIP_R_Z]);
  r.legR.knee.rotation.set(p[J.KNEE_R], 0, 0);
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

/** Small shivers on top of a pose (`amt` 0..1): fear you can see at 12 fps. */
export function tremble(p: PoseBuf, t: number, amt: number) {
  if (amt <= 0) return;
  p[J.SPINE_Z] += Math.sin(t * 37) * 0.025 * amt;
  p[J.CHEST_X] += Math.sin(t * 31 + 2) * 0.02 * amt;
  p[J.HEAD_Z] += Math.sin(t * 43 + 1) * 0.05 * amt;
  p[J.HEAD_Y] += Math.sin(t * 23 + 4) * 0.04 * amt;
  p[J.SH_L_Z] += Math.sin(t * 33) * 0.05 * amt;
  p[J.SH_R_Z] -= Math.sin(t * 35 + 1.3) * 0.05 * amt;
  p[J.EL_L_X] += Math.sin(t * 29 + 0.7) * 0.06 * amt;
  p[J.EL_R_X] += Math.sin(t * 27 + 2.1) * 0.06 * amt;
  p[J.HIPS_Y] += Math.sin(t * 41) * 0.006 * amt;
}

/**
 * HELP!: half-crouched, bouncing on the knees, one arm waving big over the head
 * (`side` +1 = the left arm), the other pointing out at the threat (`point`:
 * direction in the body's frame, radians, + toward the character's left) or
 * cupped at the mouth when there's nothing to point at.
 */
export function posePlead(p: PoseBuf, t: number, side: number, point: number | null) {
  poseStand(p);
  const bob = Math.abs(Math.sin(t * 5));
  p[J.HIP_L_X] = p[J.HIP_R_X] = -0.25 - 0.12 * bob;
  p[J.KNEE_L] = p[J.KNEE_R] = 0.45 + 0.25 * bob;
  p[J.HIP_L_Z] = 0.06;
  p[J.HIP_R_Z] = -0.06;
  p[J.HIPS_Y] = legsHeight(p);
  p[J.SPINE_X] = 0.12;
  p[J.SPINE_Z] = -0.08 * side;
  p[J.NECK_X] = -0.15;
  p[J.HEAD_X] = -0.12;
  p[J.HEAD_Z] = 0.1 * side;
  const wave = Math.sin(t * 9);
  // Waving arm: up over the head, swinging side to side from the elbow.
  const shZ = side > 0 ? J.SH_L_Z : J.SH_R_Z;
  const shX = side > 0 ? J.SH_L_X : J.SH_R_X;
  const el = side > 0 ? J.EL_L_X : J.EL_R_X;
  p[shZ] = side * (2.55 + 0.3 * wave);
  p[shX] = -0.25;
  p[el] = -0.35 - 0.35 * wave;
  // Other arm: points at the threat, or a hand cupped at the mouth.
  const oZ = side > 0 ? J.SH_R_Z : J.SH_L_Z;
  const oX = side > 0 ? J.SH_R_X : J.SH_L_X;
  const oEl = side > 0 ? J.EL_R_X : J.EL_L_X;
  if (point !== null) {
    const a = Math.max(-1.3, Math.min(1.3, point));
    // Out toward the threat, a little forward, jabbing.
    p[oZ] = a * 1.05;
    p[oX] = -1.0 + Math.abs(a) * 0.45 - 0.08 * Math.sin(t * 6);
    p[oEl] = -0.15;
    p[J.HEAD_Y] = a * 0.35;
  } else {
    p[oX] = -0.55;
    p[oZ] = side * 0.35;
    p[oEl] = -2.35;
    p[J.HEAD_Y] = 0;
  }
}

/**
 * COWER: squatting on the balls of the feet, folded over the knees, forearms
 * crossed over the head. `peek` 0..1 lifts the head to look out between the
 * arms (toward `look`, radians in the body frame), `curl` 0..1 tucks in harder
 * when something lunges. Add `tremble` on top.
 */
export function poseCower(p: PoseBuf, t: number, peek: number, look: number, curl: number) {
  poseStand(p);
  // (Peeking only lifts the head and chest: the legs stay folded.)
  const k = 1 - peek * 0.08;
  p[J.HIP_L_X] = -1.42 * k - 0.12 * curl;
  p[J.HIP_R_X] = -1.3 * k - 0.12 * curl;
  p[J.KNEE_L] = 2.15 * k + 0.2 * curl;
  p[J.KNEE_R] = 2.0 * k + 0.2 * curl;
  // Knees apart (a squat reads as a squat from the front too).
  p[J.HIP_L_Z] = 0.3;
  p[J.HIP_R_Z] = -0.26;
  p[J.HIPS_Y] = legsHeight(p) - 0.03;
  // Folded over the knees (the hips sit back over the heels).
  p[J.HIPS_Z] = -0.06;
  p[J.SPINE_X] = 0.72 - 0.14 * peek + 0.12 * curl;
  p[J.CHEST_X] = 0.32 - 0.2 * peek + 0.1 * curl;
  // Panting.
  p[J.CHEST_X] += Math.sin(t * 7) * 0.025;
  p[J.NECK_X] = 0.25 - 0.55 * peek;
  p[J.HEAD_X] = 0.4 - 1.05 * peek + 0.15 * curl;
  p[J.HEAD_Y] = look * 0.55 * peek;
  p[J.SPINE_Y] = look * 0.12 * peek;
  // Hands clasped on the back of the head, elbows by the face; peeking, the
  // hands come down onto the knees and the head comes up (both fitted to the rig).
  p[J.SH_L_X] = p[J.SH_R_X] = -2.39 + 1.31 * peek;
  p[J.SH_L_Y] = -0.63 - 0.28 * peek;
  p[J.SH_R_Y] = 0.63 + 0.28 * peek;
  p[J.SH_L_Z] = -0.07 - 0.04 * peek;
  p[J.SH_R_Z] = 0.07 + 0.04 * peek;
  p[J.EL_L_X] = p[J.EL_R_X] = -1.83 + 1.41 * peek;
}

/**
 * HIDE: crouched low behind cover with the back to the camera (the civilian
 * faces the cover / the threat), hands on its edge; `peek` 0..1 rises up to look
 * over it, leaning out to `lean` (±1 = the character's left / right); `glance`
 * −1..1 looks back over a shoulder at the camera ("help me!").
 */
export function poseHide(p: PoseBuf, t: number, peek: number, lean: number, glance: number) {
  poseStand(p);
  const c = 1 - peek * 0.4;
  p[J.HIP_L_X] = -1.25 * c - 0.1;
  p[J.HIP_R_X] = -1.0 * c - 0.15;
  p[J.KNEE_L] = 2.15 * c + 0.25;
  p[J.KNEE_R] = 1.9 * c + 0.3;
  p[J.HIP_L_Z] = 0.22;
  p[J.HIP_R_Z] = -0.2;
  p[J.HIPS_Y] = legsHeight(p) - 0.02;
  p[J.HIPS_Z] = -0.05;
  p[J.SPINE_X] = 0.55 - 0.3 * peek;
  p[J.SPINE_Z] = -0.18 * lean * peek;
  p[J.CHEST_X] = 0.12 + Math.sin(t * 6.5) * 0.02;
  p[J.NECK_X] = 0.1 - 0.25 * peek;
  p[J.HEAD_X] = 0.25 - 0.45 * peek;
  p[J.HEAD_Z] = 0.12 * lean * peek;
  // Glancing back over the shoulder (turning the head and the chest).
  p[J.HEAD_Y] = 1.25 * glance;
  p[J.NECK_Y] = 0.25 * glance;
  p[J.CHEST_Y] = 0.3 * glance;
  // Hands on the cover's edge in front, a little apart (rising with the peek, never over the head).
  p[J.SH_L_X] = p[J.SH_R_X] = -1.3 - 0.1 * peek;
  p[J.SH_L_Z] = 0.12;
  p[J.SH_R_Z] = -0.12;
  p[J.EL_L_X] = p[J.EL_R_X] = -1.0 - 0.15 * peek;
}

/**
 * BACK AWAY: stepping backwards (walk `phase`), hands up in front of the face,
 * palms out, leaning back from the threat it faces; `fear` 0..1 raises the arms
 * higher and turns the face aside.
 */
export function poseBackAway(p: PoseBuf, phase: number, amt: number, fear: number) {
  poseStand(p);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  // A backward step: the trailing (back) leg reaches behind, knees soft.
  p[J.HIP_L_X] = -s * 0.45 * amt - 0.1;
  p[J.HIP_R_X] = s * 0.45 * amt - 0.1;
  p[J.KNEE_L] = 0.25 + Math.max(0, c) * 0.7 * amt;
  p[J.KNEE_R] = 0.25 + Math.max(0, -c) * 0.7 * amt;
  p[J.HIPS_Y] = legsHeight(p) + Math.abs(c) * 0.015;
  p[J.SPINE_X] = -0.16 - 0.08 * fear;
  p[J.SPINE_Y] = 0.08 * s * amt;
  p[J.NECK_X] = 0.12;
  p[J.HEAD_X] = 0.05 + 0.1 * fear;
  p[J.HEAD_Y] = 0.45 * fear;
  // Palms out at face height.
  p[J.SH_L_X] = p[J.SH_R_X] = -1.05 - 0.35 * fear;
  p[J.SH_L_Z] = 0.28;
  p[J.SH_R_Z] = -0.28;
  p[J.EL_L_X] = p[J.EL_R_X] = -1.35 + 0.2 * fear;
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
 * GRABBED: braced and leaning away from the attacker on `side` (+1 = at the
 * character's left), the near arm held out toward it (aimed by `aimArm` after
 * this), the free arm flailing; `pull` −1..1 is the tug of war (+ = pulling
 * free), `look` −1..1 turns the head from the attacker (−) to the camera (+).
 */
export function poseGrabbed(p: PoseBuf, t: number, side: number, pull: number, look: number) {
  poseStand(p);
  // Legs braced: the far foot planted out to the side, the near knee bent.
  const far = side > 0 ? J.HIP_R_Z : J.HIP_L_Z;
  const near = side > 0 ? J.HIP_L_Z : J.HIP_R_Z;
  p[far] = -side * (0.32 + 0.06 * pull);
  p[near] = side * 0.05;
  p[side > 0 ? J.KNEE_L : J.KNEE_R] = 0.45 + 0.15 * pull;
  p[side > 0 ? J.HIP_L_X : J.HIP_R_X] = -0.3;
  p[side > 0 ? J.KNEE_R : J.KNEE_L] = 0.15;
  p[J.HIPS_Y] = legsHeight(p) - 0.04;
  p[J.HIPS_X] = -side * 0.04 * (1 + pull);
  // Leaning away (z > 0 leans toward −X).
  p[J.SPINE_Z] = side * (0.22 + 0.1 * pull);
  p[J.HIPS_RZ] = side * 0.06;
  p[J.SPINE_X] = 0.12 + 0.06 * Math.sin(t * 5);
  p[J.SPINE_Y] = -side * 0.25;
  p[J.NECK_X] = -0.1;
  p[J.HEAD_Y] = side * (look > 0 ? -0.15 - 0.45 * look : 0.6 * -look);
  p[J.HEAD_Z] = -side * 0.12;
  p[J.HEAD_X] = -0.1;
  // Near arm held straight out toward the attacker (aimed by aimArm).
  p[side > 0 ? J.SH_L_Z : J.SH_R_Z] = side * 1.25;
  p[side > 0 ? J.SH_L_X : J.SH_R_X] = -0.35;
  p[side > 0 ? J.EL_L_X : J.EL_R_X] = -0.05;
  // Free arm: pushing at the air / reaching out for help.
  const w = Math.sin(t * 7.5);
  p[side > 0 ? J.SH_R_X : J.SH_L_X] = -1.25 - 0.35 * w;
  p[side > 0 ? J.SH_R_Z : J.SH_L_Z] = -side * (0.35 + 0.25 * Math.max(0, w));
  p[side > 0 ? J.EL_R_X : J.EL_L_X] = -0.55 - 0.4 * Math.max(0, -w);
}

/**
 * RESCUED: standing tall with relief, waving (`wave` arm `side`, +1 = left) or
 * giving a thumbs-up (the arm forward and up, forearm raised — pass the
 * `HAND.THUMB` stamp for that hand); `sag` 0..1 = the first exhale.
 */
export function poseThanks(p: PoseBuf, t: number, side: number, thumb: boolean, sag: number) {
  poseStand(p);
  p[J.HIP_L_Z] = 0.05;
  p[J.HIP_R_Z] = -0.05;
  p[J.KNEE_L] = p[J.KNEE_R] = 0.08 + 0.2 * sag;
  p[J.HIP_L_X] = p[J.HIP_R_X] = -0.04 - 0.1 * sag;
  p[J.HIPS_Y] = legsHeight(p);
  p[J.SPINE_X] = -0.06 + 0.3 * sag;
  p[J.HEAD_X] = -0.1 + 0.25 * sag;
  p[J.HEAD_Z] = 0.1 * side;
  const shX = side > 0 ? J.SH_L_X : J.SH_R_X;
  const shZ = side > 0 ? J.SH_L_Z : J.SH_R_Z;
  const el = side > 0 ? J.EL_L_X : J.EL_R_X;
  if (thumb) {
    p[shX] = -1.35;
    p[shZ] = side * 0.35;
    p[el] = -1.35 + 0.08 * Math.sin(t * 10);
  } else {
    const w = Math.sin(t * 11);
    p[shZ] = side * (2.45 + 0.22 * w);
    p[shX] = -0.3;
    p[el] = -0.3 - 0.3 * w;
  }
  // The other hand on the chest (phew).
  p[side > 0 ? J.SH_R_X : J.SH_L_X] = -0.55;
  p[side > 0 ? J.SH_R_Z : J.SH_L_Z] = side * 0.3;
  p[side > 0 ? J.EL_R_X : J.EL_L_X] = -1.9;
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
 * leaving the elbow as posed. Used for the tug of war between a grabbed
 * civilian and the zombie holding them, so the two hands meet.
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

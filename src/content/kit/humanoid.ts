import * as THREE from 'three';
import { Kit } from './ModelKit';

export interface Limb {
  /** Upper joint (shoulder / hip). */
  shoulder: THREE.Group;
  /** Middle joint (elbow / knee). */
  elbow: THREE.Group;
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  /** Hand / foot. */
  end: THREE.Mesh;
}

export interface LegLimb {
  hip: THREE.Group;
  knee: THREE.Group;
  thigh: THREE.Mesh;
  shin: THREE.Mesh;
  foot: THREE.Mesh;
}

export interface HumanoidRig {
  /** Add this to your entity's model. Feet at y = 0, facing +Z. */
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  headMesh: THREE.Mesh;
  torsoMesh: THREE.Mesh;
  armL: Limb;
  armR: Limb;
  legL: LegLimb;
  legR: LegLimb;
  /** Meshes grouped by hit zone — register these as hitboxes. */
  meshes: { head: THREE.Mesh[]; torso: THREE.Mesh[]; limbs: THREE.Mesh[] };
  scale: number;
}

export interface HumanoidOptions {
  height?: number;
  skin?: number;
  shirt?: number;
  pants?: number;
  shoes?: number;
  /** null = bald. */
  hair?: number | null;
  /** Torso width multiplier (0.85 thin … 1.5 hulking). */
  bulk?: number;
  /** Head size multiplier. */
  headSize?: number;
  /** Arm length multiplier. */
  armLength?: number;
  /** Sleeve colour for upper arms (defaults to shirt). Use skin for t-shirts/bare arms. */
  sleeves?: number;
}

/** Retro pixel surfaces for un-baked humanoids (baked zombies/civilians re-texture per part in zombieKit). */
const SKIN_TEX = { tex: 'skin', texScale: 0.8, texStrength: 0.3 } as const;
const CLOTH_TEX = { tex: 'cloth', texScale: 0.8, texStrength: 0.6 } as const;
const SHOE_TEX = { tex: 'hide', texScale: 3, texStrength: 0.65 } as const;
const HAIR_TEX = { tex: 'bark', texScale: 2.5 } as const;

/**
 * Builds a jointed low-poly human (≈1.78 m by default) from boxes.
 * Joint conventions (model faces +Z, character's LEFT is +X):
 *  - shoulder.rotation.x < 0 raises the arm forward (zombie reach ≈ -1.4)
 *  - armL.shoulder.rotation.z > 0 raises the left arm sideways; armR uses < 0
 *  - hip.rotation.x swings the leg (±0.6 for a walk), knee.rotation.x > 0 bends it back
 */
export function buildHumanoid(o: HumanoidOptions = {}): HumanoidRig {
  const height = o.height ?? 1.78;
  const s = height / 1.78;
  const bulk = o.bulk ?? 1;
  const skin = Kit.mat(o.skin ?? 0xd8a888, SKIN_TEX);
  const shirt = Kit.mat(o.shirt ?? 0x556677, CLOTH_TEX);
  const sleeves = Kit.mat(o.sleeves ?? o.shirt ?? 0x556677, CLOTH_TEX);
  const pants = Kit.mat(o.pants ?? 0x333844, CLOTH_TEX);
  const shoes = Kit.mat(o.shoes ?? 0x1c1c1c, SHOE_TEX);
  const armLen = o.armLength ?? 1;
  const hs = o.headSize ?? 1;

  const root = new THREE.Group();
  root.name = 'humanoid';
  root.scale.setScalar(s);
  const hips = Kit.pivot(root, 0, 0.95, 0, 'hips');
  const pelvis = Kit.add(hips, Kit.box(0.34 * bulk, 0.16, 0.2 * Math.sqrt(bulk)), pants, 0, -0.02, 0);

  const leg = (side: 1 | -1): LegLimb => {
    const hip = Kit.pivot(hips, side * 0.1 * bulk, -0.06, 0, side > 0 ? 'hipL' : 'hipR');
    const thigh = Kit.add(hip, Kit.box(0.14, 0.44, 0.16), pants, 0, -0.22, 0);
    const knee = Kit.pivot(hip, 0, -0.44, 0);
    const shin = Kit.add(knee, Kit.box(0.12, 0.42, 0.13), pants, 0, -0.21, 0);
    const foot = Kit.add(knee, Kit.box(0.12, 0.07, 0.24), shoes, 0, -0.42, 0.05);
    return { hip, knee, thigh, shin, foot };
  };
  const legL = leg(1);
  const legR = leg(-1);

  const spine = Kit.pivot(hips, 0, 0.06, 0, 'spine');
  const torsoMesh = Kit.add(spine, Kit.box(0.38 * bulk, 0.48, 0.22 * Math.sqrt(bulk)), shirt, 0, 0.22, 0);
  const chest = Kit.pivot(spine, 0, 0.44, 0, 'chest');
  const neck = Kit.pivot(chest, 0, 0.04, 0, 'neck');
  Kit.add(neck, Kit.box(0.09, 0.08, 0.09), skin, 0, 0.03, 0);
  const head = Kit.pivot(neck, 0, 0.07, 0, 'head');
  const headMesh = Kit.add(head, Kit.box(0.22 * hs, 0.26 * hs, 0.24 * hs), skin, 0, 0.13 * hs, 0.01);
  const headMeshes = [headMesh];
  if (o.hair !== null) {
    const hair = Kit.add(head, Kit.box(0.235 * hs, 0.09 * hs, 0.25 * hs), Kit.mat(o.hair ?? 0x2a1d12, HAIR_TEX), 0, 0.245 * hs, -0.005);
    headMeshes.push(hair);
  }

  const arm = (side: 1 | -1): Limb => {
    const shoulder = Kit.pivot(chest, side * (0.2 * bulk + 0.04), -0.04, 0, side > 0 ? 'shoulderL' : 'shoulderR');
    shoulder.rotation.z = side * 0.08;
    const upper = Kit.add(shoulder, Kit.box(0.1, 0.3 * armLen, 0.11), sleeves, 0, -0.15 * armLen, 0);
    const elbow = Kit.pivot(shoulder, 0, -0.3 * armLen, 0);
    const lower = Kit.add(elbow, Kit.box(0.09, 0.27 * armLen, 0.1), skin, 0, -0.135 * armLen, 0);
    const end = Kit.add(elbow, Kit.box(0.08, 0.1, 0.06), skin, 0, -0.31 * armLen, 0);
    return { shoulder, elbow, upper, lower, end };
  };
  const armL = arm(1);
  const armR = arm(-1);

  return {
    root,
    hips,
    spine,
    chest,
    neck,
    head,
    headMesh,
    torsoMesh,
    armL,
    armR,
    legL,
    legR,
    meshes: {
      head: headMeshes,
      torso: [torsoMesh, pelvis],
      limbs: [
        armL.upper, armL.lower, armL.end, armR.upper, armR.lower, armR.end,
        legL.thigh, legL.shin, legL.foot, legR.thigh, legR.shin, legR.foot,
      ],
    },
    scale: s,
  };
}

/** Simple walk cycle. `phase` advances with distance; `amount` 0..1 blends from idle. */
export function poseWalk(r: HumanoidRig, phase: number, amount = 1, stride = 0.6) {
  const sw = Math.sin(phase) * stride * amount;
  r.legL.hip.rotation.x = sw;
  r.legR.hip.rotation.x = -sw;
  r.legL.knee.rotation.x = Math.max(0, -Math.cos(phase)) * stride * 1.2 * amount;
  r.legR.knee.rotation.x = Math.max(0, Math.cos(phase)) * stride * 1.2 * amount;
  r.hips.position.y = 0.95 - Math.abs(Math.cos(phase)) * 0.03 * amount;
}

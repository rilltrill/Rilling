import * as THREE from 'three';
import type { HumanoidRig } from '../kit/humanoid';
import { PART, PF, type PixelFigure, type PrimOpts } from '../../gameplay/pixel/figure';
import { Mat } from '../../gameplay/pixel/materials';

/**
 * ─── PixelCast humanoid painter ────────────────────────────────────────────
 *
 * Paints a `buildHumanoid` rig (zombies, civilians) as one continuous figure
 * from its live joints — anatomy first, then clothes, face, hair and gore:
 *
 *   torso layer   pelvis → belly → ribcage → shoulder girdle → neck, melted
 *                 together (traps slope into the neck, the chest tapers to the
 *                 waist); shirt / vest / tie / badges / stains / ribs as decals;
 *                 ragged hem strips hanging off zombies.
 *   head layer    skull (projected ellipsoid), jaw + chin (opens), nose, ears,
 *                 hair cap with a spiky ragged edge; face decals only while the
 *                 face is turned toward the camera: sunken sockets with a glowing
 *                 pin of an eye (zombies) or whites + pupils (the living), brow,
 *                 mouth with a tooth row, drool, wounds.
 *   arm layers    deltoid → upper arm → elbow → forearm bulge → wrist → palm,
 *                 1-texel fingers (curled to claws for zombies) and a thumb.
 *                 The arm on the far side is a shade darker (depth cue).
 *   leg layers    thigh → knee → shin with a calf → shoe.
 *
 * Sizes are the rig's (`humanoid.ts` units, × the rig's scale), slightly
 * inside / around its boxes, so the drawn figure covers every hitbox centre.
 * Everything is in joint space: any pose, any view (front, 3/4, side, back,
 * lying on the ground) comes out right; the face, ties and badges only paint
 * while that side faces the camera.
 */

export type Outfit = 'casual' | 'office' | 'worker' | 'nurse' | 'cop' | 'doctor' | 'patient' | 'soldier' | 'biker' | 'flannel' | 'scientist' | 'ranger';

export interface HumanLook {
  /** Zombie (rot, glowing eyes, snarl) vs living (warm skin, whites of the eyes). */
  dead: boolean;
  skin: number;
  bulk: number;
  headSize: number;
  armLength: number;
  hair: number | null;
  longHair: boolean;
  bun: boolean;
  eyes: number;
  shirt: number;
  shirtPat: 'cloth' | 'plaid' | 'gown' | 'camo' | 'leather';
  sleeves: 'none' | 'short' | 'long';
  sleeveColor: number;
  pants: number;
  pantsPat: 'denim' | 'cloth' | 'gown' | 'camo';
  bareLegs: boolean;
  shoes: number;
  outfit: Outfit;
  /** Accessories (null = none). */
  tie: number | null;
  jacket: number | null;
  vest: number | null;
  hat: number | null;
  belt: number | null;
  beard: number | null;
  /** Under-shirt / tee showing at the collar or open front. */
  inner: number | null;
  badge: number | null;
  // Face.
  mouthOpen: boolean;
  drool: boolean;
  faceWound: number;
  // Gore (zombies).
  rags: number;
  ribs: number;
  chestBlood: boolean;
  bellyWound: number;
  bite: number;
  armWound: number;
  legWound: number;
  blood: number;
  /** Per-character randomness for the painter (never the world RNG). */
  seed: number;
}

export function humanLook(o: Partial<HumanLook> = {}): HumanLook {
  return {
    dead: true,
    skin: 0xa9b79a,
    bulk: 1,
    headSize: 1,
    armLength: 1,
    hair: 0x2a2018,
    longHair: false,
    bun: false,
    eyes: 0xffe9a0,
    shirt: 0x4b5a6b,
    shirtPat: 'cloth',
    sleeves: 'long',
    sleeveColor: o.shirt ?? 0x4b5a6b,
    pants: 0x2e3d5c,
    pantsPat: 'denim',
    bareLegs: false,
    shoes: 0x1c1c1c,
    outfit: 'casual',
    tie: null,
    jacket: null,
    vest: null,
    hat: null,
    belt: null,
    beard: null,
    inner: null,
    badge: null,
    mouthOpen: true,
    drool: false,
    faceWound: 0,
    rags: 0,
    ribs: 0,
    chestBlood: false,
    bellyWound: 0,
    bite: 0,
    armWound: 0,
    legWound: 0,
    blood: 0x7a0c0c,
    seed: 1,
    ...o,
  };
}

/** Per-redraw state the painter needs beyond the rig's joints. */
export interface HumanPose {
  /** Arms lost: [left, right] — 0 intact, 1 forearm gone, 2 whole arm gone. */
  severed: readonly number[];
  headless: boolean;
  /** Jaw 0 shut … 1 gaping. */
  jaw: number;
  /** Expression. */
  face: 'zombie' | 'scream' | 'calm';
  /** Squash on a hit (0..1). */
  squash: number;
  /** Seconds (secondary motion: rags, hair). */
  time: number;
  /** Ground speed m/s (cloth sway). */
  speed: number;
  /** Legs gone (crawlers: torso drags on the ground). */
  legless?: boolean;
}

/** World scale of a joint (its matrix's X column length). */
function scaleOf(o: THREE.Object3D): number {
  const e = o.matrixWorld.elements;
  return Math.hypot(e[0], e[1], e[2]);
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Mats {
  skin: number;
  skinDark: number;
  shirt: number;
  sleeve: number;
  pants: number;
  shoes: number;
  hair: number;
  blood: number;
  gore: number;
  bone: number;
  mouth: number;
  teeth: number;
}

function mats(L: HumanLook): Mats {
  const skin = L.dead ? Mat.deadSkin(L.skin) : Mat.liveSkin(L.skin);
  const blood = Mat.blood(L.blood);
  const stain = L.dead ? blood : 0;
  const cloth = (hex: number, pat: HumanLook['shirtPat'] | HumanLook['pantsPat']): number => {
    switch (pat) {
      case 'plaid':
        return Mat.plaid(hex);
      case 'gown':
        return Mat.gown(hex);
      case 'camo':
        return Mat.camo(hex);
      case 'leather':
        return Mat.leather(hex);
      case 'denim':
        return Mat.denim(hex);
      default:
        return Mat.cloth(hex, { stain });
    }
  };
  return {
    skin,
    skinDark: skin,
    shirt: cloth(L.jacket ?? L.shirt, L.shirtPat),
    sleeve: cloth(L.jacket ?? L.sleeveColor, L.shirtPat),
    pants: L.bareLegs ? skin : cloth(L.pants, L.pantsPat),
    shoes: L.bareLegs ? skin : Mat.leather(L.shoes),
    hair: Mat.hair(L.hair ?? 0x2a2018),
    blood,
    gore: Mat.gore(),
    bone: Mat.bone(),
    mouth: Mat.mouth(),
    teeth: Mat.teeth(L.dead ? 0xc8bc8c : 0xf0ece0),
  };
}

/** Paint a humanoid rig. Returns false when it can't (nothing to draw). */
export function paintHuman(f: PixelFigure, r: HumanoidRig, L: HumanLook, st: HumanPose): boolean {
  if (!r.root.visible) return false;
  // 1 texel per retro pixel up to ~190 px tall (≈ 2.5 m away); closer, texels grow (arcade sprite scaling).
  f.maxTexels = 190;
  const M = mats(L);
  const s = scaleOf(r.hips);
  const b = L.bulk;
  const sb = Math.sqrt(b);
  const torsoDepth = f.depth(f.at(r.spine, 0, 0.25, 0));

  // ── Torso ──────────────────────────────────────────────────────────────
  f.layer({ k: 0.045 * s });
  const T: PrimOpts = { part: PART.TORSO };
  const hipX = f.dir(r.hips, 1, 0, 0);
  const hipZ = f.dir(r.hips, 0, 0, 1);
  const spX = f.dir(r.spine, 1, 0, 0);
  const spZ = f.dir(r.spine, 0, 0, 1);
  // Pelvis (trousers) → belly → ribcage: a tapered, slightly V-shaped trunk.
  f.coneE(f.at(r.hips, 0, -0.085, 0.0), f.at(r.hips, 0, 0.05, 0), hipX, hipZ, 0.17 * b * s, 0.105 * sb * s, 0.155 * b * s, 0.1 * sb * s, M.pants, T);
  const shirtOpts: PrimOpts = { part: PART.TORSO, u0: 0 };
  f.coneE(f.at(r.spine, 0, 0.0, 0.004), f.at(r.spine, 0, 0.2, 0.01), spX, spZ, 0.152 * b * s, 0.1 * sb * s, 0.165 * b * s, 0.108 * sb * s, M.shirt, shirtOpts);
  f.coneE(f.at(r.spine, 0, 0.17, 0.01), f.at(r.spine, 0, 0.375, 0.0), spX, spZ, 0.168 * b * s, 0.108 * sb * s, 0.188 * b * s, 0.112 * sb * s, M.shirt, { ...shirtOpts, u0: 0.17 });
  // Shoulder girdle: traps + deltoid caps (an arm that's gone leaves a stump).
  const shX = 0.2 * b + 0.018;
  const shL = f.at(r.chest, shX, -0.03, 0);
  const shR = f.at(r.chest, -shX, -0.03, 0);
  f.cone(shL, shR, 0.07 * s, 0.07 * s, M.shirt, { ...T, k: 0.06 * s });
  // Neck.
  f.cone(f.at(r.chest, 0, -0.02, -0.012), f.at(r.neck, 0, 0.075, 0.0), 0.056 * s, 0.05 * s, M.skin, { ...T, k: 0.035 * s });
  // Ragged shirt strips hanging below the hem (zombies), swaying with the walk.
  for (let i = 0; i < L.rags; i++) {
    const h = hash(L.seed + i * 3.1);
    const x = (h * 2 - 1) * 0.13 * b;
    const back = hash(L.seed + i * 7.7) < 0.35;
    const z = (back ? -1 : 1) * 0.1 * sb;
    const sway = Math.sin(st.time * (5 + h * 3) + i * 2) * 0.02 * (0.5 + Math.min(1, st.speed));
    f.cone(f.at(r.spine, x, 0.02, z), f.at(r.spine, x + sway, -0.1 - h * 0.05, z * 1.08), 0.034 * s, 0.014 * s, M.shirt, {
      ...T,
      k: 0.01 * s,
      rag: 0.012 * s,
      flags: PF.SPIKY | PF.RAG_END,
      seed: i * 13 + 5,
    });
  }
  // Clothing details (decals: paint only where the trunk is).
  const front = f.facing(f.at(r.spine, 0, 0.25, 0.1), f.dir(r.spine, 0, 0, 1));
  const fz = 0.11 * sb;
  torsoDetails(f, r, L, M, front, fz, b, s);
  if (L.outfit === 'flannel') {
    // Tool belt: a leather pouch on the left hip, a hammer hanging on the right.
    const lm = Mat.leather(0x5a3a1e);
    f.cone(f.at(r.hips, 0.12 * b, 0.03, 0.105), f.at(r.hips, 0.125 * b, -0.04, 0.115), 0.036 * s, 0.034 * s, lm, { ...T, k: 0.005 * s });
    f.cone(f.at(r.hips, -0.13 * b, 0.02, 0.12), f.at(r.hips, -0.13 * b, -0.13, 0.13), 0.012 * s, 0.011 * s, Mat.leather(0x9a6c3a), { ...T, k: 0.002 * s });
    f.cone(f.at(r.hips, -0.17 * b, 0.04, 0.125), f.at(r.hips, -0.09 * b, 0.04, 0.125), 0.016 * s, 0.016 * s, Mat.gloss(0x60646c), { ...T, k: 0.002 * s });
  }

  // ── Head ───────────────────────────────────────────────────────────────
  if (!st.headless) paintHead(f, r, L, M, st, s);
  else {
    // Neck stump: torn flesh and a knob of spine.
    f.layer({ k: 0.02 * s });
    f.cone(f.at(r.neck, 0, 0.02, 0), f.at(r.neck, 0, 0.1, 0.0), 0.054 * s, 0.05 * s, M.gore, { part: PART.TORSO, rag: 0.01 * s, flags: PF.SPIKY | PF.RAG_END, seed: 3 });
    f.ball(f.at(r.neck, 0, 0.115, -0.01), 0.018 * s, M.bone, { part: PART.TORSO });
  }

  // ── Arms ───────────────────────────────────────────────────────────────
  for (const side of [1, -1] as const) {
    const sev = st.severed[side > 0 ? 0 : 1] ?? 0;
    const arm = side > 0 ? r.armL : r.armR;
    if (sev >= 2) {
      // Shoulder stump on the trunk.
      f.layer({ k: 0.02 * s });
      const p = side > 0 ? shL : shR;
      f.ball(p, 0.062 * s, M.gore, { part: PART.TORSO, rag: 0.008 * s, flags: PF.SPIKY, seed: 9 + side });
      f.ball(f.add(p, f.dir(r.chest, side, -0.4, 0), 0.03 * s), 0.016 * s, M.bone, { part: PART.TORSO });
      continue;
    }
    const mid = f.depth(f.at(arm.shoulder, 0, -0.25, 0));
    f.layer({ k: 0.035 * s, tone: mid > torsoDepth + 0.05 ? -0.1 : 0 });
    paintArm(f, arm.shoulder, sev >= 1 ? null : arm.elbow, side, L, M, s, st);
  }

  // ── Legs ───────────────────────────────────────────────────────────────
  if (!st.legless) {
    for (const side of [1, -1] as const) {
      const leg = side > 0 ? r.legL : r.legR;
      const mid = f.depth(f.at(leg.knee, 0, 0, 0));
      f.layer({ k: 0.04 * s, tone: mid > torsoDepth + 0.06 ? -0.09 : 0 });
      paintLeg(f, leg.hip, leg.knee, side, L, M, s);
    }
  }

  if (st.squash > 0) {
    const q = st.squash;
    f.warp(f.at(r.hips, 0, -0.9, 0), 1 + 0.07 * q, 1 - 0.06 * q);
  }
  return true;
}

/** Trunk decals: outfit details, stains, wounds. */
function torsoDetails(f: PixelFigure, r: HumanoidRig, L: HumanLook, M: Mats, front: number, fz: number, b: number, s: number) {
  const sp = r.spine;
  const D = PF.FLAT;
  const T: PrimOpts = { part: PART.TORSO, flags: D };
  const seenFront = front > -0.15;
  // Collar / neckline (skin V for scrubs and tees).
  if (seenFront) {
    if (L.outfit === 'nurse' || L.outfit === 'patient' || (L.outfit === 'casual' && L.sleeves !== 'long')) {
      f.decal(f.at(sp, -0.055, 0.46, fz), f.at(sp, 0, 0.38, fz), 0.02 * s, 0.012 * s, M.skin, T);
      f.decal(f.at(sp, 0.055, 0.46, fz), f.at(sp, 0, 0.38, fz), 0.02 * s, 0.012 * s, M.skin, T);
    }
    if (L.inner !== null) {
      // Under-shirt in an open front / at the collar.
      const m = Mat.cloth(L.inner, { stain: L.dead ? M.blood : 0 });
      if (L.jacket !== null) f.decal(f.at(sp, 0, 0.455, fz), f.at(sp, 0, 0.2, fz), 0.062 * s, 0.01 * s, m, T);
      else if (L.outfit === 'biker' || L.outfit === 'casual') f.decal(f.at(sp, 0, 0.46, fz), f.at(sp, 0, 0.04, fz), 0.055 * s, 0.045 * s, m, T);
      else f.decal(f.at(sp, -0.04, 0.455, fz), f.at(sp, 0.04, 0.455, fz), 0.022 * s, 0.022 * s, m, T);
    }
    if (L.outfit === 'office' || L.outfit === 'doctor' || L.outfit === 'scientist' || L.outfit === 'cop') {
      // Shirt collar points.
      const col = L.jacket !== null || L.outfit === 'doctor' ? Mat.cloth(L.inner ?? 0xe4e4e0) : M.shirt;
      f.decal(f.at(sp, -0.06, 0.465, fz), f.at(sp, -0.015, 0.42, fz), 0.016 * s, 0.01 * s, col, { ...T, tone: 0.08 });
      f.decal(f.at(sp, 0.06, 0.465, fz), f.at(sp, 0.015, 0.42, fz), 0.016 * s, 0.01 * s, col, { ...T, tone: 0.08 });
    }
    if (L.tie !== null) {
      const tm = Mat.cloth(L.tie);
      // Knot, then the blade widening down to a point.
      f.decal(f.at(sp, 0, 0.44, fz), f.at(sp, 0.002, 0.425, fz), 0.016 * s, 0.014 * s, tm, T);
      f.decal(f.at(sp, 0.002, 0.415, fz), f.at(sp, 0.008, 0.2, fz), 0.009 * s, 0.02 * s, tm, T);
    }
    if (L.badge !== null) f.decal(f.at(sp, 0.09 * b, 0.34, fz), f.at(sp, 0.09 * b, 0.32, fz), 0.017 * s, 0.017 * s, Mat.gloss(L.badge), T);
    if (L.outfit === 'doctor' || L.outfit === 'scientist') {
      // Stethoscope / pens.
      f.decal(f.at(sp, -0.07, 0.44, fz), f.at(sp, 0.0, 0.3, fz), 0.006 * s, 0.006 * s, Mat.leather(0x404448), T);
      f.decal(f.at(sp, 0.07, 0.44, fz), f.at(sp, 0.0, 0.3, fz), 0.006 * s, 0.006 * s, Mat.leather(0x404448), T);
    }
    if (L.outfit === 'nurse') {
      // ID card on a lanyard.
      f.decal(f.at(sp, 0.06 * b, 0.4, fz), f.at(sp, 0.085 * b, 0.33, fz), 0.005 * s, 0.005 * s, Mat.flat(0x2a5aa0), T);
      f.decal(f.at(sp, 0.085 * b, 0.32, fz), f.at(sp, 0.085 * b, 0.29, fz), 0.02 * s, 0.02 * s, Mat.flat(0xf0f0f0), T);
    }
  }
  // Open jacket edges / lapels (front).
  if (L.jacket !== null && seenFront) {
    const jm = Mat.cloth(L.jacket);
    f.decal(f.at(sp, -0.06, 0.45, fz), f.at(sp, -0.04, 0.22, fz), 0.012 * s, 0.01 * s, jm, { ...T, tone: -0.12 });
    f.decal(f.at(sp, 0.06, 0.45, fz), f.at(sp, 0.04, 0.22, fz), 0.012 * s, 0.01 * s, jm, { ...T, tone: -0.12 });
  }
  // Vests wrap all the way round (hi-vis, tactical).
  if (L.vest !== null) {
    const vm = L.outfit === 'worker' ? Mat.gloss(L.vest) : Mat.cloth(L.vest);
    f.decal(f.at(sp, 0, 0.1, 0), f.at(sp, 0, 0.44, 0), 0.21 * b * s, 0.2 * b * s, vm, { part: PART.TORSO, flags: D });
    if (L.outfit === 'worker') {
      // Reflective bands + the open front.
      const band = Mat.gloss(0xe0e4e8);
      for (const y of [0.17, 0.29]) f.decal(f.at(sp, -0.2 * b, y, 0), f.at(sp, 0.2 * b, y, 0), 0.016 * s, 0.016 * s, band, { part: PART.TORSO, flags: D });
      if (seenFront) f.decal(f.at(sp, 0, 0.45, fz), f.at(sp, 0, 0.1, fz), 0.03 * s, 0.025 * s, M.shirt, T);
    } else {
      for (const x of [-0.08, 0.08]) f.decal(f.at(sp, x, 0.22, fz + 0.03), f.at(sp, x, 0.16, fz + 0.03), 0.035 * s, 0.035 * s, Mat.cloth(L.vest), { ...T, tone: 0.1 });
    }
  }
  // Belt across the hips.
  if (L.belt !== null) {
    const bm = Mat.leather(L.belt);
    f.decal(f.at(r.hips, -0.18 * b, 0.05, 0.06), f.at(r.hips, 0.18 * b, 0.05, 0.06), 0.024 * s, 0.024 * s, bm, T);
    if (seenFront) f.decal(f.at(r.hips, 0, 0.05, 0.11), f.at(r.hips, 0.0, 0.05, 0.11), 0.017 * s, 0.017 * s, Mat.gloss(0xc8a840), T);
  }
  if (L.outfit === 'flannel' && seenFront) {
    // Button placket.
    f.decal(f.at(sp, 0.005, 0.44, fz), f.at(sp, 0.005, 0.05, fz), 0.008 * s, 0.008 * s, M.shirt, { ...T, tone: -0.2, flags: D | PF.SHADE_ONLY });
  }
  // Gore.
  if (L.dead) {
    if (L.ribs !== 0 && seenFront) {
      f.decal(f.at(sp, L.ribs * 0.08 * b, 0.36, fz), f.at(sp, L.ribs * 0.07 * b, 0.2, fz), 0.065 * s, 0.055 * s, Mat.ribs(), { ...T, rag: 0.012 * s, flags: D | PF.SPIKY });
    }
    if (L.chestBlood && seenFront) {
      f.decal(f.at(sp, 0, 0.45, fz), f.at(sp, 0.015, 0.3, fz), 0.08 * s, 0.035 * s, M.blood, { ...T, rag: 0.02 * s, flags: D | PF.SPIKY | PF.RAG_END, seed: 4 });
    }
    if (L.bellyWound !== 0 && seenFront) {
      f.decal(f.at(sp, L.bellyWound * 0.08, 0.14, fz), f.at(sp, L.bellyWound * 0.06, 0.1, fz), 0.05 * s, 0.04 * s, M.blood, { ...T, rag: 0.012 * s, flags: D | PF.SPIKY });
    }
    if (L.bite !== 0 && seenFront) {
      f.decal(f.at(sp, L.bite * 0.11 * b, 0.07, fz), f.at(sp, L.bite * 0.09 * b, 0.05, fz), 0.045 * s, 0.035 * s, M.skin, { ...T, rag: 0.012 * s, flags: D | PF.SPIKY, seed: 7 });
      f.decal(f.at(sp, L.bite * 0.1 * b, 0.065, fz), f.at(sp, L.bite * 0.1 * b, 0.06, fz), 0.02 * s, 0.02 * s, M.blood, T);
    }
  }
}

/** Head, face and hair. */
function paintHead(f: PixelFigure, r: HumanoidRig, L: HumanLook, M: Mats, st: HumanPose, s: number) {
  const h = r.head;
  const hs = L.headSize;
  const H: PrimOpts = { part: PART.HEAD };
  const fwd = f.dir(h, 0, 0, 1);
  const face = f.facing(f.at(h, 0, 0.14 * hs, 0.12 * hs), fwd);
  // Long hair falls behind the head and shoulders (own layer, behind).
  if (L.hair !== null && L.longHair) {
    f.layer({ k: 0.03 * s });
    const sway = Math.sin(st.time * 3.1 + L.seed) * 0.015;
    f.cone(f.at(h, 0, 0.2 * hs, -0.06 * hs), f.at(h, sway, -0.05, -0.1 * hs), 0.105 * hs * s, 0.085 * s, M.hair, {
      part: PART.NONE,
      rag: 0.014 * s,
      flags: PF.SPIKY | PF.RAG_END,
      seed: 11,
      zBias: 0.05,
    });
  }
  f.layer({ k: 0.03 * s });
  const jaw = st.jaw;
  // Skull: a projected ellipsoid (narrower at the jaw thanks to the chin below).
  f.ellipsoid(h, 0, 0.148 * hs, 0.0, 0.116 * hs * s, 0.128 * hs * s, 0.124 * hs * s, M.skin, H);
  // Jaw + chin (drops open around the hinge).
  const ja = jaw * 0.55;
  const cy = 0.035 - Math.sin(ja) * 0.06;
  const cz = 0.085 * Math.cos(ja) - 0.01;
  f.cone(f.at(h, 0, 0.085 * hs, -0.035 * hs), f.at(h, 0, cy * hs, cz * hs), 0.078 * hs * s, 0.047 * hs * s, M.skin, { ...H, k: 0.03 * s });
  // Nose and ears stick out of the silhouette in profile.
  f.cone(f.at(h, 0, 0.145 * hs, 0.118 * hs), f.at(h, 0, 0.104 * hs, 0.146 * hs), 0.017 * hs * s, 0.021 * hs * s, M.skin, { ...H, k: 0.01 * s });
  for (const sd of [1, -1]) {
    f.cone(f.at(h, sd * 0.108 * hs, 0.152 * hs, -0.012), f.at(h, sd * 0.114 * hs, 0.128 * hs, -0.016), 0.018 * hs * s, 0.015 * hs * s, M.skin, { ...H, k: 0.008 * s });
  }
  // Hair cap: sits on the skull, its front edge is the hairline.
  if (L.hair !== null) {
    const top = L.hat !== null ? 0.17 : 0.2;
    f.ellipsoid(h, 0, top * hs, -0.022 * hs, 0.124 * hs * s, 0.088 * hs * s, 0.132 * hs * s, M.hair, {
      ...H,
      rag: 0.01 * s,
      flags: PF.SPIKY,
      seed: 21,
      zBias: -0.03,
      k: 0.01 * s,
    });
    // Back of the head.
    f.ellipsoid(h, 0, 0.14 * hs, -0.06 * hs, 0.116 * hs * s, 0.105 * hs * s, 0.075 * hs * s, M.hair, { ...H, zBias: -0.01, k: 0.01 * s });
    if (L.bun) f.ball(f.at(h, 0, 0.2 * hs, -0.14 * hs), 0.05 * hs * s, M.hair, { part: PART.NONE, k: 0.02 * s });
  }
  if (L.beard !== null && face > -0.2) {
    f.decal(f.at(h, -0.07 * hs, 0.08 * hs, 0.1 * hs), f.at(h, 0.07 * hs, 0.08 * hs, 0.1 * hs), 0.04 * hs * s, 0.04 * hs * s, Mat.hair(L.beard), { ...H, rag: 0.006 * s, flags: PF.SPIKY });
  }

  // ── Face (only while it's turned to the camera) ──
  if (face > 0.05) {
    const D = PF.FLAT;
    const F: PrimOpts = { part: PART.HEAD, flags: D };
    const ey = 0.148 * hs;
    const ez = 0.112 * hs;
    for (const sd of [1, -1]) {
      const eye = f.at(h, sd * 0.048 * hs, ey, ez);
      // Only the eye on the near side when nearly in profile.
      const side = f.facing(eye, f.dir(h, sd * 0.55, 0, 1));
      if (side < 0.12) continue;
      if (L.dead) {
        // Sunken socket + a glowing pin of an eye.
        f.decal(f.at(h, sd * 0.05 * hs, ey + 0.004, ez), f.at(h, sd * 0.044 * hs, ey - 0.006, ez), 0.022 * hs * s, 0.018 * hs * s, M.skin, { ...F, tone: -0.42, flags: D | PF.SHADE_ONLY });
        f.decal(eye, eye, 0.009 * hs * s, 0.009 * hs * s, Mat.glow(L.eyes), { ...F, flags: D | PF.GLOW, minPx: 0.5 });
      } else {
        const wide = st.face === 'scream' ? 1.25 : 1;
        f.decal(f.at(h, sd * 0.052 * hs, ey, ez), f.at(h, sd * 0.046 * hs, ey, ez), 0.016 * hs * s * wide, 0.016 * hs * s * wide, Mat.flat(0xf2eee4), F);
        f.decal(f.at(h, sd * 0.046 * hs, ey - 0.002, ez + 0.005), f.at(h, sd * 0.046 * hs, ey - 0.002, ez + 0.005), 0.008 * hs * s, 0.008 * hs * s, Mat.flat(0x1e140e), { ...F, minPx: 0.5 });
      }
      // Brow: heavy and low on the dead, raised on the screaming.
      const by = ey + (st.face === 'scream' ? 0.04 : 0.028) * hs;
      const tilt = st.face === 'scream' ? 0.012 : -0.008;
      f.decal(f.at(h, sd * 0.075 * hs, by - tilt, ez), f.at(h, sd * 0.025 * hs, by + tilt, ez + 0.005), 0.011 * hs * s, 0.01 * hs * s, L.hair !== null && !L.dead ? M.hair : M.skin, {
        ...F,
        tone: L.dead ? -0.3 : 0,
        flags: L.hair !== null && !L.dead ? D : D | PF.SHADE_ONLY,
      });
    }
    if (L.outfit === 'scientist') {
      // Glasses: two pale lenses with a glint, and the bridge.
      const lens = Mat.flat(0xa8e0f8);
      for (const sd of [1, -1]) f.decal(f.at(h, sd * 0.05 * hs, ey, ez + 0.008), f.at(h, sd * 0.046 * hs, ey, ez + 0.008), 0.022 * hs * s, 0.02 * hs * s, lens, { ...F, tone: 0.1 });
      f.decal(f.at(h, -0.03 * hs, ey + 0.008, ez + 0.01), f.at(h, 0.03 * hs, ey + 0.008, ez + 0.01), 0.006 * hs * s, 0.006 * hs * s, Mat.flat(0x1a1a1a), F);
    }
    // Mouth: a dark gash that opens with the jaw; a tooth row along the top.
    const open = st.face === 'calm' ? 0.05 : Math.max(jaw, L.mouthOpen ? 0.25 : 0.05);
    const my = 0.07 * hs - open * 0.022 * hs;
    const mw = (st.face === 'scream' ? 0.032 : 0.042) * hs;
    f.decal(f.at(h, -mw, my, 0.11 * hs), f.at(h, mw, my, 0.11 * hs), (0.008 + open * 0.022) * hs * s, (0.008 + open * 0.022) * hs * s, M.mouth, F);
    if (open > 0.2) {
      const ty = my + (0.006 + open * 0.016) * hs;
      f.decal(f.at(h, mw * 0.8, ty, 0.115 * hs), f.at(h, -mw * 0.8, ty, 0.115 * hs), 0.007 * hs * s, 0.007 * hs * s, M.teeth, { ...F, flags: D | PF.NO_OUTLINE });
    }
    if (L.dead && (L.drool || jaw > 0.4)) {
      const dy = Math.min(0.03, ((st.time * 0.07 + L.seed) % 0.04));
      f.decal(f.at(h, 0.02 * hs, my, 0.112 * hs), f.at(h, 0.022 * hs, my - 0.03 * hs - dy, 0.105 * hs), 0.01 * hs * s, 0.006 * hs * s, M.blood, F);
    }
    if (L.faceWound !== 0) {
      f.decal(f.at(h, L.faceWound * 0.065 * hs, 0.11 * hs, 0.1 * hs), f.at(h, L.faceWound * 0.06 * hs, 0.09 * hs, 0.1 * hs), 0.025 * hs * s, 0.02 * hs * s, M.blood, { ...F, rag: 0.006 * s, flags: D | PF.SPIKY });
    }
    // Cheek hollows / nose shadow give the face its planes.
    if (L.dead) {
      for (const sd of [1, -1]) f.decal(f.at(h, sd * 0.07 * hs, 0.1 * hs, 0.09 * hs), f.at(h, sd * 0.06 * hs, 0.075 * hs, 0.09 * hs), 0.015 * hs * s, 0.012 * hs * s, M.skin, { ...F, tone: -0.2, flags: D | PF.SHADE_ONLY });
    }
  }
  // Hats: their own layer (outlined, composited by depth over the head).
  if (L.hat !== null) {
    f.layer({ k: 0.01 * s });
    paintHat(f, h, L, s, hs);
  }
}

function paintHat(f: PixelFigure, h: THREE.Object3D, L: HumanLook, s: number, hs: number) {
  const hat = L.hat!;
  const H: PrimOpts = { part: PART.NONE };
  switch (L.outfit) {
    case 'worker': {
      const m = Mat.gloss(hat);
      // Dome + ridge + brim.
      f.ellipsoid(h, 0, 0.245 * hs, -0.005, 0.128 * hs * s, 0.075 * hs * s, 0.138 * hs * s, m, { ...H, k: 0.005 * s });
      f.ellipsoid(h, 0, 0.205 * hs, 0.035 * hs, 0.148 * hs * s, 0.016 * hs * s, 0.168 * hs * s, m, { ...H, k: 0.004 * s, tone: -0.05 });
      break;
    }
    case 'cop': {
      const m = Mat.cloth(hat);
      f.ellipsoid(h, 0, 0.255 * hs, -0.005, 0.124 * hs * s, 0.05 * hs * s, 0.13 * hs * s, m, { ...H, k: 0.01 * s });
      f.ellipsoid(h, 0, 0.215 * hs, 0.09 * hs, 0.1 * hs * s, 0.012 * hs * s, 0.06 * hs * s, Mat.leather(0x141416), { ...H, k: 0.003 * s });
      break;
    }
    case 'ranger': {
      const m = Mat.leather(hat);
      f.ellipsoid(h, 0, 0.255 * hs, -0.005, 0.12 * hs * s, 0.065 * hs * s, 0.128 * hs * s, m, { ...H, k: 0.01 * s });
      f.ellipsoid(h, 0, 0.21 * hs, 0.005, 0.2 * hs * s, 0.014 * hs * s, 0.21 * hs * s, m, { ...H, k: 0.004 * s, tone: -0.04 });
      f.decal(f.at(h, -0.12 * hs, 0.225 * hs, 0.0), f.at(h, 0.12 * hs, 0.225 * hs, 0.0), 0.012 * hs * s, 0.012 * hs * s, Mat.leather(0x3a2a18), { ...H, flags: PF.FLAT });
      break;
    }
    case 'nurse': {
      const m = Mat.cloth(hat);
      f.ellipsoid(h, 0, 0.275 * hs, 0.03 * hs, 0.08 * hs * s, 0.035 * hs * s, 0.055 * hs * s, m, { ...H, k: 0.006 * s });
      const c = f.at(h, 0, 0.28 * hs, 0.085 * hs);
      if (f.facing(c, f.dir(h, 0, 0, 1)) > 0.1) {
        const red = Mat.flat(0xe02020);
        f.decal(f.at(h, -0.014 * hs, 0.28 * hs, 0.085 * hs), f.at(h, 0.014 * hs, 0.28 * hs, 0.085 * hs), 0.005 * s, 0.005 * s, red, { ...H, flags: PF.FLAT | PF.NO_OUTLINE });
        f.decal(f.at(h, 0, 0.294 * hs, 0.085 * hs), f.at(h, 0, 0.266 * hs, 0.085 * hs), 0.005 * s, 0.005 * s, red, { ...H, flags: PF.FLAT | PF.NO_OUTLINE });
      }
      break;
    }
    case 'patient': {
      // Head bandage: a band round the skull.
      f.ellipsoid(h, 0, 0.215 * hs, 0.0, 0.124 * hs * s, 0.032 * hs * s, 0.13 * hs * s, Mat.cloth(hat, { stain: Mat.blood() }), { ...H, k: 0.004 * s });
      break;
    }
    case 'soldier': {
      const m = Mat.gloss(hat);
      f.ellipsoid(h, 0, 0.215 * hs, -0.005, 0.138 * hs * s, 0.1 * hs * s, 0.15 * hs * s, m, { part: PART.ARMOR, k: 0.01 * s });
      break;
    }
    default: {
      // Beanie / cap.
      const m = Mat.cloth(hat);
      f.ellipsoid(h, 0, 0.225 * hs, -0.01, 0.12 * hs * s, 0.07 * hs * s, 0.128 * hs * s, m, { ...H, k: 0.01 * s });
    }
  }
}

/** One arm: `elbow` null = the forearm is gone (stump at the elbow). */
export function paintArm(f: PixelFigure, sh: THREE.Object3D, elbow: THREE.Object3D | null, side: number, L: HumanLook, M: Mats, s: number, st: { time: number }) {
  const a = L.armLength;
  const A: PrimOpts = { part: PART.LIMB };
  const upperMat = L.sleeves === 'none' ? M.skin : M.sleeve;
  // Deltoid + upper arm (short sleeves end halfway down).
  f.cone(f.at(sh, 0, 0.035, 0), f.at(sh, 0.004 * side, -0.13 * a, 0.004), 0.064 * s, 0.057 * s, upperMat, A);
  const shortSleeve = L.sleeves === 'short';
  f.cone(f.at(sh, 0, -0.06 * a, 0), f.at(sh, 0, -0.3 * a, 0), 0.056 * s, 0.048 * s, upperMat, {
    ...A,
    matB: shortSleeve ? M.skin : upperMat,
    split: shortSleeve ? 0.42 : 2,
  });
  if (shortSleeve) {
    // Sleeve hem: a ragged, slightly flared cuff.
    f.cone(f.at(sh, 0, -0.08 * a, 0), f.at(sh, 0, -0.15 * a, 0), 0.06 * s, 0.062 * s, M.sleeve, {
      ...A,
      k: 0.006 * s,
      rag: L.dead ? 0.008 * s : 0.002 * s,
      flags: PF.SPIKY | PF.RAG_END,
      seed: 31 + side,
    });
  }
  if (!elbow) {
    // Forearm blown off: ragged stump with a knob of bone.
    const e = f.at(sh, 0, -0.3 * a, 0);
    f.ball(e, 0.048 * s, M.gore, { ...A, rag: 0.009 * s, flags: PF.SPIKY, seed: 17 + side });
    f.ball(f.at(sh, 0, -0.345 * a, 0), 0.016 * s, M.bone, A);
    return;
  }
  const foreMat = L.sleeves === 'long' ? M.sleeve : M.skin;
  // Forearm: muscle bulge below the elbow, tapering to the wrist.
  f.cone(f.at(elbow, 0, 0.02, 0), f.at(elbow, 0, -0.1 * a, 0.004), 0.05 * s, 0.052 * s, foreMat, A);
  f.cone(f.at(elbow, 0, -0.07 * a, 0), f.at(elbow, 0, -0.245 * a, 0), 0.049 * s, 0.036 * s, foreMat, {
    ...A,
    matB: L.sleeves === 'long' ? M.skin : foreMat,
    split: L.sleeves === 'long' ? 0.93 : 2,
  });
  if (L.dead && L.armWound === side) {
    f.decal(f.at(elbow, 0, -0.08 * a, 0.03), f.at(elbow, 0, -0.14 * a, 0.03), 0.04 * s, 0.035 * s, M.blood, { ...A, flags: PF.FLAT, rag: 0.008 * s });
  }
  paintHand(f, elbow, side, L, M, s, a, st.time);
}

function paintHand(f: PixelFigure, el: THREE.Object3D, side: number, L: HumanLook, M: Mats, s: number, a: number, time: number) {
  const A: PrimOpts = { part: PART.LIMB, k: 0.012 * s };
  // Hands are drawn the way a sprite artist draws them: fanned out on screen.
  // The spread axis is ⟂ both the forearm and the view (the rig never turns its
  // palms, so a raised hand would otherwise show its thin edge as a spike).
  const along = f.dir(el, 0, -1, 0);
  const wrist = f.at(el, 0, -0.255 * a, 0.004);
  const view = f.vec().subVectors(f.eye, wrist).normalize();
  const cr = f.vec().crossVectors(along, view);
  const cl = cr.length();
  const jz = f.dir(el, 0, 0, 1);
  const spread = cl > 0.35 ? cr.divideScalar(cl) : jz;
  // Keep the thumb on the joint's front edge (its +Z side).
  if (spread.dot(jz) < 0) spread.negate();
  const thick = f.vec().crossVectors(spread, along).normalize();
  const pt = (y: number, x: number, z: number) => f.vec().copy(wrist).addScaledVector(along, (y - 0.255) * a * s).addScaledVector(spread, x * s).addScaledVector(thick, z * s);
  // Palm.
  f.coneE(pt(0.255, 0, 0), pt(0.322, 0, 0), thick, spread, 0.022 * s, 0.036 * s, 0.02 * s, 0.043 * s, M.skin, A);
  // Fingers: zombies claw (curled, splayed, twitching), the living keep them straighter.
  const curl = L.dead ? 0.6 + 0.25 * Math.sin(time * 6 + side) : 0.15;
  const F: PrimOpts = { part: PART.LIMB, k: 0.004 * s };
  for (let i = 0; i < 4; i++) {
    const x = 0.034 - i * 0.022;
    const len = 0.075 - Math.abs(i - 1.3) * 0.01;
    const fan = x * (L.dead ? 0.5 : 0.35);
    const k0 = pt(0.318, x, 0);
    const mid = pt(0.318 + len * 0.6, x + fan * 0.6, -curl * 0.014);
    const tip = pt(0.318 + len * (1 - curl * 0.35), x + fan, -curl * 0.045);
    f.cone(k0, mid, 0.0135 * s, 0.012 * s, M.skin, F);
    f.cone(mid, tip, 0.012 * s, 0.009 * s, M.skin, F);
  }
  // Thumb.
  f.cone(pt(0.27, 0.034, 0), pt(0.315, 0.068, -0.01), 0.015 * s, 0.011 * s, M.skin, F);
}

function paintLeg(f: PixelFigure, hip: THREE.Object3D, knee: THREE.Object3D, side: number, L: HumanLook, M: Mats, s: number) {
  const P: PrimOpts = { part: PART.LIMB };
  // Thigh (quads bulge forward), knee, shin with a calf behind, shoe.
  f.cone(f.at(hip, 0, 0.04, 0.004), f.at(hip, 0, -0.41, 0.012), 0.09 * s, 0.066 * s, M.pants, P);
  f.cone(f.at(hip, 0, -0.08, 0.02), f.at(hip, 0, -0.26, 0.018), 0.082 * s, 0.075 * s, M.pants, { ...P, k: 0.05 * s });
  const shin = L.legWound === side && L.dead ? M.skin : M.pants;
  f.cone(f.at(knee, 0, 0.01, 0.0), f.at(knee, 0, -0.37, -0.004), 0.064 * s, 0.047 * s, M.pants, { ...P, matB: shin, split: L.legWound === side && L.dead ? 0.35 : 2 });
  f.cone(f.at(knee, 0, -0.07, -0.022), f.at(knee, 0, -0.22, -0.014), 0.064 * s, 0.054 * s, M.pants, { ...P, k: 0.05 * s });
  if (L.legWound === side && L.dead) {
    f.decal(f.at(knee, 0, -0.18, 0.06), f.at(knee, 0, -0.24, 0.06), 0.03 * s, 0.025 * s, M.blood, { ...P, flags: PF.FLAT, rag: 0.008 * s });
  }
  // Shoe: heel to toe, a darker sole.
  f.cone(f.at(knee, 0, -0.395, -0.05), f.at(knee, 0, -0.425, 0.165), 0.05 * s, 0.042 * s, M.shoes, { ...P, k: 0.025 * s });
}

/**
 * A severed arm lying / tumbling in the world (`obj` = the pivot that flew off:
 * the shoulder for a whole arm, the elbow for a forearm). Gore at the joint.
 */
export function paintLooseArm(f: PixelFigure, obj: THREE.Object3D, whole: boolean, L: HumanLook): boolean {
  const M = mats(L);
  const s = scaleOf(obj);
  f.layer({ k: 0.035 * s });
  if (whole) {
    let elbow: THREE.Object3D | null = null;
    for (const c of obj.children) if (!(c as THREE.Mesh).isMesh) elbow = c;
    paintArm(f, obj, elbow, 1, L, M, s, { time: 0 });
    f.ball(f.at(obj, 0, 0.02, 0), 0.055 * s, M.gore, { part: PART.NONE, rag: 0.008 * s, flags: PF.SPIKY, zBias: -0.05 });
  } else {
    const a = L.armLength;
    const foreMat = L.sleeves === 'long' ? M.sleeve : M.skin;
    f.cone(f.at(obj, 0, 0.02, 0), f.at(obj, 0, -0.1 * a, 0.004), 0.046 * s, 0.047 * s, foreMat, {});
    f.cone(f.at(obj, 0, -0.07 * a, 0), f.at(obj, 0, -0.245 * a, 0), 0.044 * s, 0.03 * s, foreMat, {});
    paintHand(f, obj, 1, L, M, s, a, 0);
    f.ball(f.at(obj, 0, 0.02, 0), 0.047 * s, M.gore, { rag: 0.008 * s, flags: PF.SPIKY, zBias: -0.05 });
    f.ball(f.at(obj, 0, 0.05, 0), 0.015 * s, M.bone, { zBias: -0.06 });
  }
  return true;
}

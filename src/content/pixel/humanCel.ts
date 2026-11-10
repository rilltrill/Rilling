import * as THREE from 'three';
import type { HumanoidRig } from '../kit/humanoid';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat } from '../../gameplay/pixel/materials';
import { CEL_STAMP, HAND, celSize } from '../../gameplay/pixel/stamps';
import { hash, mats, paintBubble, paintHand, paintHat, paintPonytail, paintSmears, scaleOf, tilted, torsoDetails, trunkSlice, tx, type HumanLook, type HumanPose, type Mats } from './human';

/**
 * ─── PIXEL CAST 2: the humanoid, DRAWN ─────────────────────────────────────
 *
 * The same rig, joints and sizes as `paintHuman` (the sprite still covers what
 * the hitboxes cover), but built the way a mid-2000s arcade sprite is drawn —
 * flat shapes with corners instead of melted anatomy (docs/PIXELWORLD2.md §9):
 *
 *   trunk     ONE trapezoid: square shoulders tapering to the waist, cut straight
 *             at the hem (torn into hanging points on the dead), a yoke triangle
 *             sloping from the neck to the shoulder points.
 *   limbs     a sleeve / trouser leg per segment with hard joints; cuffs and hems
 *             are cut square (a flared band at the wrist, a straight trouser hem
 *             breaking over the shoe); shoes have a heel, a sole and a toe cap.
 *   head      a little big; hair as a designed shape (a cap, a fringe of pointed
 *             locks, spikes, sideburns, a highlight bar); the face is hand-pixelled
 *             stamps in four sizes (`CEL_STAMP`): zombies = heavy brow, black
 *             sockets, a glowing pin, a nose shadow, a mouth with separate teeth;
 *             the living = brows, whites, pupils, an open mouth.
 *   costume   4–6 drawn details saying who this was: lapels, a pointed collar, a
 *             striped tie, a pocket with pens, a name badge, a watch; hi-vis vest
 *             with H-bands, a zip, a radio, knee patches, laced boots; scrubs with
 *             a V neck, a lanyard card, pocket pens; plaid with a placket, pocket
 *             flaps, a tool belt.
 *   gore      wounds are shapes (the resolve pass rims them and wets their lit
 *             edge), not speckle.
 *
 * Tone is flat: this painter never shades. The resolve pass lays the one shadow
 * shape and the ink; `.flag(PF.SHADE_ONLY).tone(-1)` here adds a drawn shadow
 * shape to it, small tone biases draw crease lines.
 */

const D = PF.FLAT;
const SH = PF.FLAT | PF.SHADE_ONLY;
const CUT = PF.CUT_A | PF.CUT_B;

interface CelMats {
  sole: number;
  lace: number;
  white: number;
  dark: number;
  red: number;
  blue: number;
  gold: number;
}

const celCache = new WeakMap<HumanLook, CelMats>();

function celMats(L: HumanLook): CelMats {
  let m = celCache.get(L);
  if (m) return m;
  // Soles: pale rubber under trainers and work boots, near-black under dress shoes.
  const pale = !L.dead || L.outfit === 'worker' || L.outfit === 'nurse';
  m = {
    sole: Mat.flat(pale ? 0xd8d2c0 : 0x2a2622, 'sole'),
    lace: Mat.flat(0xe8e0c8, 'lace'),
    white: Mat.flat(0xf4f1e8),
    dark: Mat.flat(0x1c1a22),
    red: Mat.flat(0xd8322a),
    blue: Mat.flat(0x2a5aa0),
    gold: Mat.gloss(0xd8b040),
  };
  celCache.set(L, m);
  return m;
}

const P0 = { x: 0, y: 0, z: 0 };
const P1 = { x: 0, y: 0, z: 0 };

/** Paint a humanoid rig in the PIXEL CAST 2 looks (`f.cel` 1–3). */
export function paintHumanCel(f: PixelFigure, r: HumanoidRig, L: HumanLook, st: HumanPose): boolean {
  if (!r.root.visible) return false;
  f.maxTexels = 240;
  const M = mats(L);
  const C = celMats(L);
  const s = scaleOf(r.hips);
  const b = L.bulk;
  const sb = Math.sqrt(b);
  const torsoDepth = f.depth(f.at(r.spine, 0, 0.25, 0));
  const sd = L.seed;
  const hunch = L.dead ? 0.55 + 0.45 * hash(sd * 1.3) : 0.12;
  const slump = L.dead ? (hash(sd * 2.9) - 0.5) * 2 : 0;
  const t = st.time;

  if (st.mem && st.smear !== undefined && st.smear > 0) paintSmears(f, r, M, st, s);

  // ── Trunk ──────────────────────────────────────────────────────────────
  f.layer(0.014 * s, PART.TORSO);
  const hipY = f.dir(r.hips, 0, 1, 0);
  const hipZ = f.dir(r.hips, 0, 0, 1);
  const spX = f.dir(r.spine, 1, 0, 0);
  const spZ = f.dir(r.spine, 0, 0, 1);
  const hz = 0.022 * hunch;
  if (st.pelvis !== false) trunkSlice(f, r.hips, hipY, hipZ, -0.025, 0.0, 0.168 * b, 0.078, 0.104 * sb, s, M.pants).u(0).k(0.014 * s);
  const o = L.outfit;
  const untucked = o === 'casual' || o === 'worker' || o === 'flannel' || o === 'biker' || o === 'patient' || o === 'nurse';
  const hemY = untucked ? (o === 'patient' || o === 'nurse' ? -0.085 : -0.04) : 0.015;
  // Two stacked trapezoids: square shoulders tapering to the waist, then the shirt flaring
  // to a hem cut straight across (corners at the shoulder, the waist and the hem).
  const shHalf = 0.194 * b + 0.012;
  f.coneE(f.at(r.spine, 0, 0.452, hz * 0.7), f.at(r.spine, 0, 0.13, hz * 0.3), spX, spZ, shHalf * s, 0.112 * sb * s, 0.156 * b * s, 0.102 * sb * s, M.shirt)
    .flag(CUT)
    .u(0.05);
  f.coneE(f.at(r.spine, 0, 0.14, hz * 0.3), f.at(r.spine, 0, hemY, 0.004), spX, spZ, 0.156 * b * s, 0.102 * sb * s, (untucked ? 0.174 : 0.16) * b * s, 0.102 * sb * s, M.shirt)
    .flag(CUT)
    .u(0.36);
  // Shoulder line: sloping from the neck to each shoulder point (one shoulder drops on the dead).
  const shW = 0.2 * b + 0.032;
  for (let side = 1; side >= -1; side -= 2) {
    const drop = 0.016 * slump * side;
    f.cone(f.at(r.chest, side * 0.04, 0.045, -0.006), f.at(r.chest, side * (shW - 0.045), -0.02 - drop, hz * 0.6), 0.04 * s, 0.05 * s, M.shirt).k(0.008 * s);
  }
  // Upper-back hump (the hunched dead, in profile).
  f.cone(f.at(r.spine, 0, 0.27, -0.035 - 0.015 * hunch), f.at(r.spine, 0, 0.4, -0.03 - 0.02 * hunch), 0.085 * sb * s, 0.08 * sb * s, M.shirt).k(0.03 * s);
  // Neck.
  const nw = st.neckW ?? 1;
  f.cone(f.at(r.chest, 0, -0.02, -0.006 + hz), f.at(r.neck, 0, nw > 1.2 ? 0.04 : 0.075, 0.004), 0.052 * nw * s, 0.046 * Math.min(nw, 1.3) * s, M.skin).k(0.01 * s);
  // The dead's hem is torn: pointed strips hang below it and sway with the walk.
  if (L.dead) {
    const n = Math.min(3, Math.max(untucked ? 2 : 0, L.rags));
    for (let i = 0; i < n; i++) {
      const h = hash(sd + i * 3.1);
      const x = (-0.11 + i * 0.1 + (h - 0.5) * 0.04) * b;
      const back = hash(sd + i * 7.7) < 0.3;
      const z = (back ? -1 : 1) * 0.09 * sb;
      const sway = Math.sin(t * (5 + h * 3) + i * 2) * 0.018 * (0.5 + Math.min(1, st.speed));
      const w = 0.03 + h * 0.016;
      f.tri(f.at(r.spine, x - w, hemY + 0.012, z), f.at(r.spine, x + w, hemY + 0.012, z), f.at(r.spine, x + sway + (h - 0.5) * 0.03, hemY - 0.075 - h * 0.05, z * 1.05), M.shirt);
    }
  }
  // Arms torn off at the shoulder: the stump is part of the trunk.
  for (let side = 1; side >= -1; side -= 2) {
    if ((st.severed[side > 0 ? 0 : 1] ?? 0) < 2) continue;
    f.ball(f.at(r.chest, side * (shW - 0.005), -0.035, 0), 0.066 * s, M.gore)
      .rag(0.012 * s, PF.SPIKY)
      .seed(9 + side)
      .z(-0.08)
      .k(0.012 * s);
    f.ball(f.at(r.chest, side * (shW + 0.03), -0.03, 0.01), 0.02 * s, M.bone).z(-0.1).k(0.004 * s);
    f.triDecal(f.at(r.chest, side * (shW - 0.03), -0.05, 0.06), f.at(r.chest, side * (shW - 0.09), -0.07, 0.06), f.at(r.spine, side * 0.15 * b, 0.14, 0.08), M.blood);
  }
  const front = f.facing(f.at(r.spine, 0, 0.25, 0.1), spZ);
  const fz = 0.112 * sb;
  if (o === 'office' || o === 'worker' || o === 'nurse' || o === 'flannel' || o === 'casual') costume(f, r, L, M, C, front, fz, b, s);
  else torsoDetails(f, r, L, M, front, 0.11 * sb, b, s);
  torsoLines(f, r, L, M, front, fz, b, s, hunch);
  if (L.dead) torsoGore(f, r, L, M, front, fz, b, s);
  if (o === 'flannel' || o === 'worker') {
    // Tool belt: a leather pouch on the left hip; a hammer hanging on the right (the flannel).
    f.cone(f.at(r.hips, 0.125 * b, 0.035, 0.11), f.at(r.hips, 0.13 * b, -0.045, 0.115), 0.036 * s, 0.034 * s, M.pouch).flag(CUT).k(0.004 * s);
    if (o === 'flannel') {
      f.cone(f.at(r.hips, -0.13 * b, 0.02, 0.12), f.at(r.hips, -0.13 * b, -0.13, 0.13), 0.012 * s, 0.011 * s, M.handle).k(0.002 * s);
      f.cone(f.at(r.hips, -0.17 * b, 0.04, 0.125), f.at(r.hips, -0.09 * b, 0.04, 0.125), 0.016 * s, 0.016 * s, M.steel).flag(CUT).k(0.002 * s);
    }
  }
  if (st.torso) st.torso(f);

  // ── Head ───────────────────────────────────────────────────────────────
  if (!st.headless) {
    const roll = L.dead ? 0.1 * Math.sin(t * 0.9 + sd) + 0.08 * (hash(sd * 4.1) - 0.5) : 0.03 * Math.sin(t * 1.7 + sd);
    const pitch = L.dead ? 0.06 + 0.05 * Math.sin(t * 0.7 + sd * 1.7) : 0;
    headCel(f, r, tilted(r.head, pitch, roll), L, M, C, st, s);
  } else {
    f.layer(0.012 * s, PART.TORSO);
    f.cone(f.at(r.neck, 0, 0.02, 0), f.at(r.neck, 0, 0.1, 0.0), 0.054 * s, 0.05 * s, M.gore)
      .rag(0.01 * s, PF.SPIKY | PF.RAG_END)
      .seed(3);
    f.ball(f.at(r.neck, 0, 0.115, -0.01), 0.018 * s, M.bone);
  }

  // ── Arms ───────────────────────────────────────────────────────────────
  for (let side = 1; side >= -1; side -= 2) {
    const sev = st.severed[side > 0 ? 0 : 1] ?? 0;
    const arm = side > 0 ? r.armL : r.armR;
    if (sev >= 2) continue;
    const mid = f.depth(f.at(arm.shoulder, 0, -0.25, 0));
    f.layer(0.012 * s, PART.LIMB, mid > torsoDepth + 0.05 ? -0.1 : 0);
    armCel(f, arm.shoulder, sev >= 1 ? null : arm.elbow, side, L, M, C, s * (st.armW?.[side > 0 ? 0 : 1] ?? 1), st, r.chest);
  }

  // ── Legs ───────────────────────────────────────────────────────────────
  if (!st.legless) {
    for (let side = 1; side >= -1; side -= 2) {
      const leg = side > 0 ? r.legL : r.legR;
      const mid = f.depth(f.at(leg.knee, 0, 0, 0));
      const tuck = L.dead ? 0 : Math.min(0.08, Math.max(0, (mid - f.depth(f.at(leg.hip, 0, 0, 0)) - 0.12) * 0.5));
      f.layer(0.014 * s, PART.LIMB, mid > torsoDepth + 0.06 ? -0.1 : 0, tuck);
      legCel(f, leg.hip, leg.knee, side, L, M, C, s * (st.legW ?? 1));
    }
  }
  if (st.extra) st.extra(f);
  if (st.bubble !== undefined && st.bubble >= 0 && !st.headless) paintBubble(f, r, st.bubble, s);

  if (st.squash > 0) {
    const q = st.squash;
    f.warp(f.at(r.hips, 0, -0.9, 0), 1 + 0.07 * q, 1 - 0.06 * q);
  }
  return true;
}

/** A thin drawn stroke on the current layer (a crease, a seam): `tone` −0.2 = one step darker. */
function stroke(f: PixelFigure, a: THREE.Vector3, b: THREE.Vector3, mat: number, s: number, tone: number) {
  f.decal(a, b, 0.005 * s, 0.005 * s, mat).flag(SH).tone(tone).min(0.5);
}

/** A flat rectangle painted on the current layer: from a to b, half-width hw (metres). */
function rect(f: PixelFigure, a: THREE.Vector3, b: THREE.Vector3, hw: number, mat: number): PixelFigure {
  return f.decal(a, b, hw, hw, mat).flag(D | CUT).min(0.5);
}

/**
 * The costume: 4–6 drawn details that say who this person was (front view),
 * plus what wraps round the body (vests, belts) from any side.
 */
function costume(f: PixelFigure, r: HumanoidRig, L: HumanLook, M: Mats, C: CelMats, front: number, fz: number, b: number, s: number) {
  const sp = r.spine;
  const seen = front > -0.15;
  const o = L.outfit;
  const hi = f.cel > 1;
  if (o === 'office') {
    if (seen) {
      if (M.jacket && M.inner) {
        // The shirt front in the jacket's V, then the lapels lying on it.
        f.triDecal(f.at(sp, -0.078, 0.458, fz), f.at(sp, 0.078, 0.458, fz), f.at(sp, 0, 0.17, fz), M.inner);
        for (let sd = 1; sd >= -1; sd -= 2) {
          f.triDecal(f.at(sp, sd * 0.082, 0.46, fz), f.at(sp, sd * 0.128 * b, 0.345, fz), f.at(sp, sd * 0.012, 0.185, fz), M.jacket).tone(sd > 0 ? -0.2 : 0.12);
          // The notch of the lapel.
          stroke(f, f.at(sp, sd * 0.128 * b, 0.345, fz), f.at(sp, sd * 0.085, 0.36, fz), M.jacket, s, -0.4);
        }
        // Pocket square.
        f.triDecal(f.at(sp, 0.085 * b, 0.33, fz), f.at(sp, 0.13 * b, 0.33, fz), f.at(sp, 0.112 * b, 0.365, fz), C.white);
      } else {
        // Shirt sleeves: a breast pocket with two pens, a name badge clipped opposite.
        stroke(f, f.at(sp, 0.06 * b, 0.335, fz), f.at(sp, 0.13 * b, 0.335, fz), M.shirt, s, -0.2);
        stroke(f, f.at(sp, 0.06 * b, 0.335, fz), f.at(sp, 0.065 * b, 0.265, fz), M.shirt, s, -0.2);
        stroke(f, f.at(sp, 0.13 * b, 0.335, fz), f.at(sp, 0.125 * b, 0.265, fz), M.shirt, s, -0.2);
        f.decal(f.at(sp, 0.08 * b, 0.375, fz), f.at(sp, 0.08 * b, 0.33, fz), 0.005 * s, 0.005 * s, C.blue).flag(D | PF.NO_OUTLINE).min(0.5);
        f.decal(f.at(sp, 0.105 * b, 0.37, fz), f.at(sp, 0.105 * b, 0.33, fz), 0.005 * s, 0.005 * s, C.red).flag(D | PF.NO_OUTLINE).min(0.5);
      }
      // Name badge: a white card with a line of print.
      rect(f, f.at(sp, -0.125 * b, 0.335, fz), f.at(sp, -0.07 * b, 0.335, fz), 0.016 * s, C.white);
      f.decal(f.at(sp, -0.115 * b, 0.332, fz), f.at(sp, -0.085 * b, 0.332, fz), 0.004 * s, 0.004 * s, C.dark).flag(D | PF.NO_OUTLINE).min(0.5);
      // Pointed collar.
      const col = M.collar;
      for (let sd = 1; sd >= -1; sd -= 2) f.triDecal(f.at(sp, sd * 0.075, 0.475, fz), f.at(sp, sd * 0.006, 0.452, fz), f.at(sp, sd * 0.055, 0.395, fz), col).tone(0.1);
      if (M.tie) {
        // Knot, a blade widening to a point, two diagonal stripes.
        const tx0 = (hash(L.seed * 2.1) - 0.5) * 0.03;
        f.triDecal(f.at(sp, -0.02, 0.452, fz), f.at(sp, 0.02, 0.452, fz), f.at(sp, 0, 0.415, fz), M.tie);
        f.triDecal(f.at(sp, 0, 0.44, fz), f.at(sp, -0.03 + tx0, 0.235, fz), f.at(sp, 0.03 + tx0, 0.235, fz), M.tie);
        f.triDecal(f.at(sp, -0.03 + tx0, 0.237, fz), f.at(sp, 0.03 + tx0, 0.237, fz), f.at(sp, tx0 * 1.2, 0.185, fz), M.tie);
        if (hi) {
          f.decal(f.at(sp, -0.018 + tx0 * 0.4, 0.36, fz), f.at(sp, 0.018 + tx0 * 0.4, 0.34, fz), 0.006 * s, 0.006 * s, M.tie).flag(SH | PF.NO_OUTLINE).tone(0.25).min(0.5);
          f.decal(f.at(sp, -0.024 + tx0 * 0.7, 0.295, fz), f.at(sp, 0.024 + tx0 * 0.7, 0.275, fz), 0.006 * s, 0.006 * s, M.tie).flag(SH | PF.NO_OUTLINE).tone(0.25).min(0.5);
        }
      }
    }
  } else if (o === 'worker') {
    if (M.vest) {
      // Hi-vis vest: a squared body with a straight hem (the shirt shows below it), a V neck.
      f.decal(f.at(sp, 0, 0.47, 0), f.at(sp, 0, 0.065, 0), 0.24 * b * s, 0.24 * b * s, M.vest).flag(D | CUT);
      // Reflective tape: two bands round the body, braces over the shoulders.
      f.decal(f.at(sp, -0.22 * b, 0.135, 0), f.at(sp, 0.22 * b, 0.135, 0), 0.017 * s, 0.017 * s, M.band).flag(D);
      f.decal(f.at(sp, -0.22 * b, 0.27, 0), f.at(sp, 0.22 * b, 0.27, 0), 0.017 * s, 0.017 * s, M.band).flag(D);
      if (seen) {
        for (let sd = 1; sd >= -1; sd -= 2) rect(f, f.at(sp, sd * 0.105 * b, 0.46, fz), f.at(sp, sd * 0.105 * b, 0.285, fz), 0.015 * s, M.band);
        f.triDecal(f.at(sp, -0.07, 0.462, fz), f.at(sp, 0.07, 0.462, fz), f.at(sp, 0, 0.36, fz), M.shirt);
        // Zip.
        stroke(f, f.at(sp, 0.002, 0.36, fz), f.at(sp, 0.002, 0.07, fz), M.vest, s, -0.4);
        // A radio clipped to the left brace, its aerial; a glint on the tape.
        rect(f, f.at(sp, 0.105 * b, 0.4, fz + 0.01), f.at(sp, 0.105 * b, 0.34, fz + 0.01), 0.02 * s, C.dark);
        f.decal(f.at(sp, 0.12 * b, 0.4, fz + 0.01), f.at(sp, 0.125 * b, 0.455, fz + 0.01), 0.004 * s, 0.004 * s, C.dark).flag(D | PF.NO_OUTLINE).min(0.5);
        if (hi) {
          const g = f.at(sp, -0.06 * b, 0.272, fz);
          f.decal(g, g, 0.009 * s, 0.009 * s, C.white).flag(D | PF.NO_OUTLINE).min(0.6);
          const g2 = f.at(sp, 0.105 * b, 0.375, fz + 0.01);
          f.decal(g2, g2, 0.006 * s, 0.006 * s, C.red).flag(D | PF.GLOW).min(0.5);
        }
      } else {
        // From behind: the braces cross to a band.
        for (let sd = 1; sd >= -1; sd -= 2) rect(f, f.at(sp, sd * 0.1 * b, 0.46, -fz), f.at(sp, sd * 0.1 * b, 0.285, -fz), 0.015 * s, M.band);
      }
    }
  } else if (o === 'nurse') {
    if (seen) {
      // Scrubs: a V neck with a piped edge, a chest pocket with pens, an ID card on a lanyard, hem pockets.
      f.triDecal(f.at(sp, -0.062, 0.462, fz), f.at(sp, 0.062, 0.462, fz), f.at(sp, 0, 0.365, fz), M.skin);
      for (let sd = 1; sd >= -1; sd -= 2) stroke(f, f.at(sp, sd * 0.07, 0.462, fz), f.at(sp, sd * 0.004, 0.358, fz), M.shirt, s, -0.4);
      stroke(f, f.at(sp, -0.13 * b, 0.33, fz), f.at(sp, -0.06 * b, 0.33, fz), M.shirt, s, -0.2);
      stroke(f, f.at(sp, -0.13 * b, 0.33, fz), f.at(sp, -0.125 * b, 0.26, fz), M.shirt, s, -0.2);
      stroke(f, f.at(sp, -0.06 * b, 0.33, fz), f.at(sp, -0.065 * b, 0.26, fz), M.shirt, s, -0.2);
      f.decal(f.at(sp, -0.11 * b, 0.365, fz), f.at(sp, -0.11 * b, 0.325, fz), 0.005 * s, 0.005 * s, C.blue).flag(D | PF.NO_OUTLINE).min(0.5);
      f.decal(f.at(sp, -0.085 * b, 0.36, fz), f.at(sp, -0.085 * b, 0.325, fz), 0.005 * s, 0.005 * s, C.red).flag(D | PF.NO_OUTLINE).min(0.5);
      f.decal(f.at(sp, 0.045, 0.44, fz), f.at(sp, 0.085 * b, 0.33, fz), 0.005 * s, 0.005 * s, M.lanyard).flag(D | PF.NO_OUTLINE).min(0.5);
      rect(f, f.at(sp, 0.085 * b, 0.33, fz), f.at(sp, 0.085 * b, 0.27, fz), 0.022 * s, M.card);
      const ph = f.at(sp, 0.08 * b, 0.31, fz);
      f.decal(ph, ph, 0.008 * s, 0.008 * s, C.dark).flag(D | PF.NO_OUTLINE).min(0.5);
      for (let sd = 1; sd >= -1; sd -= 2) {
        stroke(f, f.at(sp, sd * 0.14 * b, 0.07, fz), f.at(sp, sd * 0.05 * b, 0.07, fz), M.shirt, s, -0.2);
        stroke(f, f.at(sp, sd * 0.05 * b, 0.07, fz), f.at(sp, sd * 0.05 * b, -0.02, fz), M.shirt, s, -0.2);
      }
    }
  } else if (o === 'flannel') {
    if (seen) {
      // Open collar over the tee, a button placket, two pocket flaps.
      if (M.inner) f.triDecal(f.at(sp, -0.05, 0.462, fz), f.at(sp, 0.05, 0.462, fz), f.at(sp, 0, 0.385, fz), M.inner);
      for (let sd = 1; sd >= -1; sd -= 2) {
        f.triDecal(f.at(sp, sd * 0.085, 0.47, fz), f.at(sp, sd * 0.004, 0.39, fz), f.at(sp, sd * 0.075, 0.375, fz), M.shirt).flag(PF.SHADE_ONLY).tone(-0.2);
        f.triDecal(f.at(sp, sd * 0.055 * b, 0.335, fz), f.at(sp, sd * 0.135 * b, 0.335, fz), f.at(sp, sd * 0.095 * b, 0.295, fz), M.shirt).flag(PF.SHADE_ONLY).tone(-0.2);
        const bt = f.at(sp, sd * 0.095 * b, 0.318, fz);
        f.decal(bt, bt, 0.006 * s, 0.006 * s, C.white).flag(D | PF.NO_OUTLINE).min(0.5);
      }
      stroke(f, f.at(sp, 0.004, 0.385, fz), f.at(sp, 0.004, 0.0, fz), M.shirt, s, -0.4);
      for (let i = 0; i < 3; i++) {
        const bt = f.at(sp, 0.018, 0.33 - i * 0.1, fz);
        f.decal(bt, bt, 0.006 * s, 0.006 * s, C.white).flag(D | PF.NO_OUTLINE).min(0.5);
      }
    }
  } else {
    // Casual tee / top: a ribbed crew neck, a bold chest stripe, a sleeve tag.
    if (seen) {
      if (L.sleeves !== 'long') {
        f.triDecal(f.at(sp, -0.058, 0.464, fz), f.at(sp, 0.058, 0.464, fz), f.at(sp, 0, 0.405, fz), M.skin);
        for (let sd = 1; sd >= -1; sd -= 2) stroke(f, f.at(sp, sd * 0.066, 0.464, fz), f.at(sp, sd * 0.004, 0.398, fz), M.shirt, s, -0.4);
      } else if (M.inner) f.triDecal(f.at(sp, -0.05, 0.462, fz), f.at(sp, 0.05, 0.462, fz), f.at(sp, 0, 0.39, fz), M.inner);
      if (!L.dead || hash(L.seed * 7.3) < 0.6) {
        f.decal(f.at(sp, -0.2 * b, 0.315, fz), f.at(sp, 0.2 * b, 0.315, fz), 0.02 * s, 0.02 * s, C.white).flag(D);
        f.decal(f.at(sp, -0.2 * b, 0.27, fz), f.at(sp, 0.2 * b, 0.27, fz), 0.007 * s, 0.007 * s, C.white).flag(D).min(0.5);
      }
    }
  }
  // Belt across the hips, a squared buckle.
  if (M.belt) {
    f.decal(f.at(r.hips, -0.19 * b, 0.05, 0.06), f.at(r.hips, 0.19 * b, 0.05, 0.06), 0.022 * s, 0.022 * s, M.belt).flag(D);
    if (seen) rect(f, f.at(r.hips, -0.02, 0.05, 0.11), f.at(r.hips, 0.02, 0.05, 0.11), 0.02 * s, C.gold);
  }
}

/** A few deliberate lines: pocket slits and the fly, a belly fold on the hunched, blades from behind. */
function torsoLines(f: PixelFigure, r: HumanoidRig, L: HumanLook, M: Mats, front: number, fz: number, b: number, s: number, hunch: number) {
  const sp = r.spine;
  const sb = Math.sqrt(b);
  if (front > -0.15 && !L.bareLegs && L.outfit !== 'patient') {
    for (let sd = 1; sd >= -1; sd -= 2) stroke(f, f.at(r.hips, sd * 0.095 * b, 0.025, 0.1 * sb), f.at(r.hips, sd * 0.15 * b, -0.055, 0.09 * sb), M.pants, s, -0.2);
    stroke(f, f.at(r.hips, 0.008, 0.02, 0.105 * sb), f.at(r.hips, 0.012, -0.085, 0.1 * sb), M.pants, s, -0.2);
  }
  if (front > 0.1 && hunch > 0.5 && L.vest === null && L.jacket === null) {
    // The shirt bunches over the hunch: one drawn fold.
    stroke(f, f.at(sp, -0.1 * b, 0.13, fz), f.at(sp, -0.02 * b, 0.105, fz), M.shirt, s, -0.2);
    stroke(f, f.at(sp, 0.03 * b, 0.12, fz), f.at(sp, 0.1 * b, 0.1, fz), M.shirt, s, -0.2);
  } else if (front < -0.2) {
    for (let sd = 1; sd >= -1; sd -= 2) stroke(f, f.at(sp, sd * 0.06 * b, 0.4, -fz), f.at(sp, sd * 0.1 * b, 0.28, -fz), M.shirt, s, -0.2);
    stroke(f, f.at(sp, 0, 0.42, -fz), f.at(sp, 0, 0.12, -fz), M.shirt, s, -0.2);
  }
}

/** Zombie gore on the trunk: wounds as shapes (the resolve pass rims them), one drip that creeps. */
function torsoGore(f: PixelFigure, r: HumanoidRig, L: HumanLook, M: Mats, front: number, fz: number, b: number, s: number) {
  const sp = r.spine;
  if (front > -0.15) {
    if (L.ribs !== 0) {
      f.decal(f.at(sp, L.ribs * 0.08 * b, 0.36, fz), f.at(sp, L.ribs * 0.07 * b, 0.2, fz), 0.062 * s, 0.052 * s, M.ribs).flag(D).rag(0.01 * s, PF.SPIKY);
    }
    if (L.chestBlood) {
      // Blood down the front from the mouth: a pointed bib and a creeping drip.
      f.triDecal(f.at(sp, -0.035, 0.44, fz), f.at(sp, 0.05, 0.44, fz), f.at(sp, 0.025, 0.31, fz), M.blood);
      const run = (f.time * 0.06 + L.seed * 0.37) % 0.16;
      f.decal(f.at(sp, 0.03, 0.32, fz), f.at(sp, 0.036, 0.24 - run, fz), 0.007 * s, 0.006 * s, M.blood).flag(D).min(0.5);
    }
    if (L.bellyWound !== 0) {
      const wx = L.bellyWound * 0.08;
      f.triDecal(f.at(sp, wx - 0.05, 0.15, fz), f.at(sp, wx + 0.055, 0.17, fz), f.at(sp, wx + 0.01, 0.06, fz), M.blood);
      f.triDecal(f.at(sp, wx - 0.03, 0.2, fz), f.at(sp, wx + 0.02, 0.13, fz), f.at(sp, wx + 0.06, 0.2, fz), M.blood);
    }
    if (L.bite !== 0) {
      f.decal(f.at(sp, L.bite * 0.11 * b, 0.07, fz), f.at(sp, L.bite * 0.09 * b, 0.05, fz), 0.042 * s, 0.034 * s, M.skin).flag(D).rag(0.008 * s, PF.SPIKY).seed(7);
      f.decal(f.at(sp, L.bite * 0.1 * b, 0.065, fz), f.at(sp, L.bite * 0.1 * b, 0.06, fz), 0.02 * s, 0.02 * s, M.blood).flag(D);
    }
    // A tear showing rotten skin (a pointed rip, a dark slit inside it).
    {
      const hx = (hash(L.seed * 1.7) * 2 - 1) * 0.11 * b;
      const hy = 0.14 + hash(L.seed * 2.3) * 0.2;
      f.triDecal(f.at(sp, hx - 0.03, hy + 0.03, fz), f.at(sp, hx + 0.035, hy + 0.012, fz), f.at(sp, hx + 0.005, hy - 0.05, fz), M.skin);
      stroke(f, f.at(sp, hx - 0.005, hy + 0.015, fz), f.at(sp, hx + 0.006, hy - 0.025, fz), M.skin, s, -0.4);
    }
    // One splash of blood across the cloth.
    const bx = (hash(L.seed * 3.9) * 2 - 1) * 0.1 * b;
    f.triDecal(f.at(sp, bx - 0.02, 0.31, fz), f.at(sp, bx + 0.07, 0.25, fz), f.at(sp, bx + 0.03, 0.17, fz), M.blood);
  } else if (front < -0.2) {
    f.triDecal(f.at(sp, -0.01, 0.4, -fz), f.at(sp, 0.09, 0.36, -fz), f.at(sp, 0.06, 0.1, -fz), M.blood);
  }
}

/** Head, hair and face. `h` is the head joint, possibly tilted (head loll). */
function headCel(f: PixelFigure, r: HumanoidRig, h: THREE.Object3D, L: HumanLook, M: Mats, C: CelMats, st: HumanPose, s: number) {
  // (A little big — classic sprite chunkiness; the head box still holds its centre.)
  const hs = L.headSize * 1.05;
  const face = f.facing(f.at(h, 0, 0.14 * hs, 0.12 * hs), f.dir(h, 0, 0, 1));
  const sd = L.seed;
  if (L.hair !== null && L.longHair) {
    // Long hair: a squared curtain behind the head and shoulders, its end cut into points.
    f.layer(0.012 * s, PART.NONE);
    const sway = Math.sin(st.time * 3.1 + sd) * 0.015;
    f.cone(f.at(h, 0, 0.2 * hs, -0.06 * hs), f.at(h, sway, -0.03, -0.1 * hs), 0.108 * hs * s, 0.1 * s, M.hair).flag(PF.CUT_B).z(0.05);
    for (let i = -1; i <= 1; i++) f.tri(f.at(h, i * 0.07 - 0.04 + sway, -0.02, -0.1 * hs), f.at(h, i * 0.07 + 0.04 + sway, -0.02, -0.1 * hs), f.at(h, i * 0.075 + sway * 1.6, -0.09 - 0.02 * hash(sd + i), -0.1 * hs), M.hair);
  }
  if (L.hair !== null && L.ponytail) paintPonytail(f, h, L, M, st, s, hs);
  f.layer(0.012 * s, PART.HEAD);
  const jaw = st.jaw;
  // Cranium, then a jaw that tapers to a chin (and drops open).
  f.ellipsoid(h, 0, 0.152 * hs, -0.004, 0.116 * hs, 0.126 * hs, 0.126 * hs, M.face);
  const ja = jaw * 0.55;
  const cy = 0.034 - Math.sin(ja) * 0.06;
  const cz = 0.085 * Math.cos(ja) - 0.01;
  f.cone(f.at(h, 0, 0.09 * hs, -0.03 * hs), f.at(h, 0, cy * hs, cz * hs), 0.086 * hs * s, (L.dead ? 0.044 : 0.052) * hs * s, M.face).k(0.02 * s);
  // Nose (profile) and ears.
  f.cone(f.at(h, 0, 0.145 * hs, 0.118 * hs), f.at(h, 0, 0.106 * hs, 0.146 * hs), 0.016 * hs * s, 0.02 * hs * s, M.face).k(0.008 * s);
  for (let side = 1; side >= -1; side -= 2) f.cone(f.at(h, side * 0.106 * hs, 0.156 * hs, -0.012), f.at(h, side * 0.112 * hs, 0.128 * hs, -0.018), 0.02 * hs * s, 0.016 * hs * s, M.face).k(0.006 * s);
  // ── Hair: a designed shape ──
  if (L.hair !== null) {
    const crownHat = L.hat !== null && L.outfit !== 'nurse' && L.outfit !== 'patient';
    const top = crownHat ? 0.17 : 0.2;
    f.ellipsoid(h, 0, top * hs, -0.022 * hs, 0.126 * hs, 0.09 * hs, 0.134 * hs, M.hair).z(-0.03).k(0.006 * s);
    f.ellipsoid(h, 0, 0.14 * hs, -0.06 * hs, 0.118 * hs, 0.105 * hs, 0.075 * hs, M.hair).z(-0.01).k(0.006 * s);
    if (L.bun) f.ball(f.at(h, 0, 0.2 * hs, -0.14 * hs), 0.05 * hs * s, M.hair).part(L.dead ? PART.NONE : PART.HEAD).k(0.008 * s);
    const fzh = 0.112 * hs;
    if (!crownHat) {
      if (L.dead) {
        // Matted spikes standing off the crown, each zombie its own.
        for (let i = 0; i < 4; i++) {
          const a = hash(sd * 3.3 + i * 1.9) * 2 - 1;
          const x = (-0.085 + i * 0.057) * hs;
          const len = (0.05 + 0.045 * hash(sd * 1.1 + i)) * hs;
          const z = -0.02 * hs;
          f.tri(f.at(h, x - 0.03 * hs, 0.255 * hs, z), f.at(h, x + 0.03 * hs, 0.262 * hs, z), f.at(h, x + a * len * 0.7, 0.27 * hs + len, z), M.hair);
        }
        // A ragged fringe: two uneven locks down the forehead.
        f.triDecal(f.at(h, -0.1 * hs, 0.24 * hs, fzh), f.at(h, -0.02 * hs, 0.24 * hs, fzh), f.at(h, -0.075 * hs, (0.185 - 0.02 * hash(sd)) * hs, fzh), M.hair);
        f.triDecal(f.at(h, 0.01 * hs, 0.24 * hs, fzh), f.at(h, 0.095 * hs, 0.24 * hs, fzh), f.at(h, 0.07 * hs, (0.19 - 0.025 * hash(sd * 1.7)) * hs, fzh), M.hair);
      } else {
        // The living: a parted fringe swept to one side, a pointed forelock.
        const sw = hash(sd * 0.71) < 0.5 ? 1 : -1;
        f.triDecal(f.at(h, -sw * 0.105 * hs, 0.245 * hs, fzh), f.at(h, sw * 0.06 * hs, 0.25 * hs, fzh), f.at(h, -sw * 0.098 * hs, 0.17 * hs, fzh), M.hair);
        f.triDecal(f.at(h, sw * 0.02 * hs, 0.25 * hs, fzh), f.at(h, sw * 0.108 * hs, 0.24 * hs, fzh), f.at(h, sw * 0.1 * hs, 0.185 * hs, fzh), M.hair);
        f.tri(f.at(h, -sw * 0.02 * hs, 0.268 * hs, 0.02 * hs), f.at(h, sw * 0.07 * hs, 0.262 * hs, 0.02 * hs), f.at(h, sw * 0.045 * hs, 0.31 * hs, 0.0), M.hair);
      }
    }
    // Sideburns frame the face.
    if (face > 0.2) {
      for (let side = 1; side >= -1; side -= 2) f.triDecal(f.at(h, side * 0.11 * hs, 0.2 * hs, 0.07 * hs), f.at(h, side * 0.082 * hs, 0.2 * hs, 0.095 * hs), f.at(h, side * 0.098 * hs, (L.dead ? 0.13 : 0.15) * hs, 0.085 * hs), M.hair);
    }
    // A highlight bar across the lit side of the hair.
    if (f.cel > 1 && !crownHat) f.decal(f.at(h, -0.085 * hs, 0.238 * hs, 0.085 * hs), f.at(h, -0.025 * hs, 0.262 * hs, 0.09 * hs), 0.009 * hs * s, 0.007 * hs * s, M.hair).flag(SH | PF.NO_OUTLINE).tone(0.3).min(0.5);
  }
  if (M.beard && face > -0.2) {
    // A squared beard with a pointed chin tuft.
    f.triDecal(f.at(h, -0.085 * hs, 0.105 * hs, 0.09 * hs), f.at(h, 0.085 * hs, 0.105 * hs, 0.09 * hs), f.at(h, 0, -0.005 * hs, 0.1 * hs), M.beard);
    f.decal(f.at(h, -0.07 * hs, 0.085 * hs, 0.1 * hs), f.at(h, 0.07 * hs, 0.085 * hs, 0.1 * hs), 0.03 * hs * s, 0.03 * hs * s, M.beard);
  }

  // ── Face: hand-pixelled stamps, placed where the rig's eyes and lips are ──
  if (face > 0.05) {
    const ey = 0.148 * hs;
    const ez = 0.114 * hs;
    const headTx = tx(f, f.at(h, 0, 0.13 * hs, 0), 0.26 * hs * s);
    const eyeC = f.at(h, 0, ey, ez);
    // One texel per stamp cell (pixel art is never resampled).
    const cellM = f.kHint / f.pxPerM(eyeC);
    const nose = f.project(f.at(h, 0, 0.12 * hs, 0.14 * hs), P0);
    const nx = nose.x;
    if (headTx >= 6.5) {
      const size = celSize(headTx);
      for (let side = 1; side >= -1; side -= 2) {
        const eye = f.at(h, side * 0.05 * hs, ey, ez);
        if (f.facing(eye, f.dir(h, side * 0.55, 0, 1)) < 0.12) continue;
        const mirror = nx < f.project(eye, P1).x;
        if (L.dead) f.stamp(eye, cellM, CEL_STAMP.zeye[size], M.eyeGlow, 0, 0, 0, mirror);
        else f.stamp(eye, cellM, liveEye(st.face)[size], 0, M.eyeWhite, M.pupil, L.hair !== null ? M.hair : M.pupil, mirror);
      }
      if (L.outfit === 'scientist') {
        for (let side = 1; side >= -1; side -= 2) f.decal(f.at(h, side * 0.05 * hs, ey, ez + 0.008), f.at(h, side * 0.046 * hs, ey, ez + 0.008), 0.022 * hs * s, 0.02 * hs * s, M.lens).flag(D).tone(0.1);
        f.decal(f.at(h, -0.03 * hs, ey + 0.008, ez + 0.01), f.at(h, 0.03 * hs, ey + 0.008, ez + 0.01), 0.006 * hs * s, 0.006 * hs * s, M.frame).flag(D);
      }
      // Nose shadow (a rotted-away hole on some of the dead).
      const np = f.at(h, 0, 0.106 * hs, 0.13 * hs);
      if (L.dead && hash(sd * 5.1) < 0.35) f.decal(np, np, 0.012 * hs * s, 0.012 * hs * s, M.mouth).flag(D).min(0.5);
      else if (size > 0) f.stamp(np, cellM, CEL_STAMP.nose[size], 0, 0, 0, 0, false);
      // Mouth by how far the jaw hangs.
      const open = st.face === 'calm' || st.face === 'relief' || st.face === 'strain' ? 0.05 : Math.max(jaw, L.mouthOpen ? 0.25 : 0.05);
      const my = 0.07 * hs - open * 0.012 * hs;
      const mouth = f.at(h, 0, my, 0.118 * hs);
      const mm = nx < f.project(mouth, P1).x - 0.5;
      if (L.dead) f.stamp(mouth, cellM, CEL_STAMP.zmouth[open < 0.3 ? 0 : open < 0.62 ? 1 : 2][size], M.mouth, M.teeth, 0, 0, mm);
      else f.stamp(mouth, cellM, liveMouthCel(st.face, jaw)[size], M.mouth, M.teeth, 0, 0, mm);
      if (L.dead && size >= 3) {
        // A heavy brow slanting down to the nose over each socket.
        for (let side = 1; side >= -1; side -= 2) {
          f.decal(f.at(h, side * 0.092 * hs, ey + 0.04 * hs, ez * 0.92), f.at(h, side * 0.02 * hs, ey + 0.02 * hs, ez), 0.007 * hs * s, 0.007 * hs * s, M.face).flag(SH).tone(-0.6).min(0.5);
        }
      }
      if (L.dead && size >= 2) {
        // Gaunt cheeks: a short hollow under each cheekbone.
        for (let side = 1; side >= -1; side -= 2) stroke(f, f.at(h, side * 0.088 * hs, 0.112 * hs, 0.085 * hs), f.at(h, side * 0.062 * hs, 0.07 * hs, 0.1 * hs), M.face, s, -0.2);
      }
      if (L.dead && (L.drool || jaw > 0.4)) {
        const dy = Math.min(0.03, (st.time * 0.07 + sd) % 0.04);
        f.decal(f.at(h, 0.022 * hs, my - 0.012 * hs, 0.112 * hs), f.at(h, 0.024 * hs, my - 0.045 * hs - dy, 0.105 * hs), 0.008 * hs * s, 0.006 * hs * s, M.blood).flag(D | PF.NO_OUTLINE).min(0.5);
      }
      if (L.faceWound !== 0) {
        f.triDecal(f.at(h, L.faceWound * 0.095 * hs, 0.125 * hs, 0.09 * hs), f.at(h, L.faceWound * 0.04 * hs, 0.1 * hs, 0.11 * hs), f.at(h, L.faceWound * 0.075 * hs, 0.06 * hs, 0.1 * hs), M.blood);
      }
    } else if (L.dead) {
      // Far away: two glowing pins under a dark brow, a dark mouth.
      f.decal(f.at(h, -0.07 * hs, ey + 0.012 * hs, ez), f.at(h, 0.07 * hs, ey + 0.012 * hs, ez), 0.02 * hs * s, 0.02 * hs * s, M.skin).flag(SH).tone(-0.4);
      for (let side = 1; side >= -1; side -= 2) {
        const eye = f.at(h, side * 0.05 * hs, ey, ez);
        f.decal(eye, eye, 0.009 * hs * s, 0.009 * hs * s, M.eyeGlow).flag(D | PF.GLOW).min(0.5);
      }
    } else {
      for (let side = 1; side >= -1; side -= 2) {
        const eye = f.at(h, side * 0.05 * hs, ey, ez);
        f.decal(eye, eye, 0.012 * hs * s, 0.012 * hs * s, M.pupil).flag(D).min(0.5);
      }
    }
  }
  void r;
  void C;
  if (M.hat) {
    f.layer(0.006 * s, PART.HEAD);
    paintHat(f, h, L, M, s, hs);
  }
}

function liveEye(face: HumanPose['face']): readonly number[] {
  switch (face) {
    case 'scream':
      return CEL_STAMP.leye.scream;
    case 'terror':
      return CEL_STAMP.leye.terror;
    case 'relief':
      return CEL_STAMP.leye.relief;
    case 'strain':
      return CEL_STAMP.leye.strain;
    default:
      return CEL_STAMP.leye.calm;
  }
}

function liveMouthCel(face: HumanPose['face'], jaw: number): readonly number[] {
  switch (face) {
    case 'scream':
      return CEL_STAMP.lmouth.scream;
    case 'terror':
      return jaw > 0.55 ? CEL_STAMP.lmouth.scream : CEL_STAMP.lmouth.gasp;
    case 'relief':
      return CEL_STAMP.lmouth.smile;
    case 'strain':
      return CEL_STAMP.lmouth.grit;
    default:
      return CEL_STAMP.lmouth.calm;
  }
}

/**
 * One arm (current layer): a round shoulder cap, a sleeve to the elbow, a forearm
 * cut square at the wrist under a flared cuff, the hand. `elbow` null = the
 * forearm is gone (stump at the elbow).
 */
function armCel(f: PixelFigure, sh: THREE.Object3D, elbow: THREE.Object3D | null, side: number, L: HumanLook, M: Mats, C: CelMats, s: number, st: HumanPose, chest: THREE.Object3D | null) {
  const a = L.armLength;
  const bare = L.sleeves === 'none';
  const upperMat = bare ? M.skin : M.sleeve;
  const shortSleeve = L.sleeves === 'short';
  f.ball(f.at(sh, 0.006 * side, 0.004, 0.004), 0.064 * s, upperMat);
  f.cone(f.at(sh, 0, -0.03 * a, 0.005), f.at(sh, 0, -0.295 * a, -0.002), 0.056 * s, 0.045 * s, upperMat);
  if (shortSleeve) {
    f.mat2(M.skin, 0.44);
    // Sleeve hem: a flared band cut square (torn into a point on the dead).
    f.cone(f.at(sh, 0, -0.085 * a, 0), f.at(sh, 0, -0.15 * a, 0), 0.06 * s, 0.066 * s, M.sleeve).flag(CUT).k(0.004 * s);
    if (L.dead) f.tri(f.at(sh, -0.04, -0.14 * a, 0.02), f.at(sh, 0.03, -0.14 * a, 0.02), f.at(sh, -0.01 * side, -0.215 * a, 0.02), M.sleeve);
  }
  if (!elbow) {
    f.ball(f.at(sh, 0, -0.3 * a, 0), 0.052 * s, M.gore)
      .rag(0.01 * s, PF.SPIKY)
      .seed(17 + side)
      .z(-0.05);
    f.ball(f.at(sh, 0, -0.35 * a, 0), 0.018 * s, M.bone).z(-0.08);
    f.triDecal(f.at(sh, -0.03, -0.28 * a, 0.03), f.at(sh, 0.03, -0.28 * a, 0.03), f.at(sh, 0.005, -0.17 * a, 0.035), M.blood);
    return;
  }
  const longSleeve = L.sleeves === 'long';
  const foreMat = longSleeve ? M.sleeve : M.skin;
  if (longSleeve) {
    f.cone(f.at(elbow, 0, 0.012, 0.002), f.at(elbow, 0, -0.232 * a, 0.002), 0.05 * s, 0.041 * s, foreMat).flag(PF.CUT_B);
    // Cuff: a flared band at the wrist — the shirt's own white cuff under a jacket.
    const cuff = L.jacket !== null ? M.collar : M.sleeve;
    f.cone(f.at(elbow, 0, -0.198 * a, 0.002), f.at(elbow, 0, -0.243 * a, 0.002), 0.045 * s, 0.049 * s, cuff)
      .flag(CUT)
      .k(0.003 * s)
      .tone(L.jacket !== null ? 0 : -0.2);
  } else {
    f.cone(f.at(elbow, 0, 0.012, 0.004), f.at(elbow, 0, -0.24 * a, 0.0), 0.047 * s, 0.032 * s, foreMat);
  }
  const fore = f.facing(f.at(elbow, 0, -0.1, 0.05), f.dir(elbow, 0, 0, 1));
  // A drawn crease at the inner elbow when the arm bends.
  const bend = 1 - f.dir(sh, 0, -1, 0).dot(f.dir(elbow, 0, -1, 0));
  if (bend > 0.06 && fore > 0) stroke(f, f.at(elbow, side * 0.03, 0.03, 0.05), f.at(elbow, -side * 0.02, 0.0, 0.05), foreMat, s, -0.2);
  if (!L.dead || L.outfit === 'office') {
    // A wristwatch (left) / wristband.
    if (side > 0 && !longSleeve) f.decal(f.at(elbow, -0.04, -0.212 * a, 0), f.at(elbow, 0.04, -0.212 * a, 0), 0.012 * s, 0.012 * s, L.dead ? C.gold : C.red).flag(D);
    else if (side > 0 && L.jacket === null && longSleeve) f.decal(f.at(elbow, -0.04, -0.25 * a, 0), f.at(elbow, 0.04, -0.25 * a, 0), 0.01 * s, 0.01 * s, C.gold).flag(D).min(0.5);
  }
  if (L.dead && fore > 0) {
    if (longSleeve && hash(L.seed * 6.7 + side) < 0.5) {
      // A pointed rip in the sleeve showing rotten skin.
      f.triDecal(f.at(elbow, -0.035, -0.07 * a, 0.045), f.at(elbow, 0.03, -0.09 * a, 0.045), f.at(elbow, 0.004, -0.17 * a, 0.045), M.skin);
    }
    if (L.armWound === side) f.triDecal(f.at(elbow, -0.04, -0.06 * a, 0.03), f.at(elbow, 0.045, -0.09 * a, 0.03), f.at(elbow, 0.0, -0.165 * a, 0.03), M.blood);
  }
  // (Hands a little big.)
  paintHand(f, elbow, side, L, M, s * 1.1, a, st.time, (side > 0 ? st.handL : st.handR) ?? st.hand ?? (L.dead ? HAND.CLAW : HAND.OPEN), chest);
}

/**
 * A leg: thigh → shin, the trouser leg cut straight at a hem that breaks over
 * the shoe (torn into points on the dead); a shoe with a squared heel, a sole
 * and a toe cap.
 */
function legCel(f: PixelFigure, hip: THREE.Object3D, knee: THREE.Object3D, side: number, L: HumanLook, M: Mats, C: CelMats, s: number) {
  const pm = M.pants;
  f.cone(f.at(hip, 0, 0.035, 0.004), f.at(hip, 0, -0.44, 0.01), 0.088 * s, 0.064 * s, pm);
  const torn = L.legWound === side && L.dead;
  const seenFront = f.facing(f.at(knee, 0, 0, 0.07), f.dir(knee, 0, 0, 1)) > 0;
  if (L.bareLegs) {
    f.cone(f.at(knee, 0, 0.012, 0.004), f.at(knee, 0, -0.375, 0.0), 0.058 * s, 0.035 * s, pm);
    f.cone(f.at(knee, 0, -0.06, -0.02), f.at(knee, 0, -0.22, -0.016), 0.058 * s, 0.046 * s, pm).k(0.03 * s);
  } else {
    f.cone(f.at(knee, 0, 0.016, 0.0), f.at(knee, 0, -0.378, 0.004), 0.064 * s, 0.062 * s, pm).flag(PF.CUT_B);
    if (torn) f.mat2(M.skin, 0.42);
    if (L.dead && !torn) {
      // Torn hem: two points hanging over the shoe.
      f.tri(f.at(knee, -0.055, -0.37, 0.02), f.at(knee, 0.0, -0.37, 0.02), f.at(knee, -0.035, -0.425, 0.03), pm);
      f.tri(f.at(knee, 0.005, -0.37, 0.02), f.at(knee, 0.058, -0.37, 0.02), f.at(knee, 0.04, -0.415, 0.03), pm);
    } else if (!L.dead) {
      // A turned-up hem.
      f.decal(f.at(knee, -0.07, -0.355, 0), f.at(knee, 0.07, -0.355, 0), 0.016 * s, 0.016 * s, pm).flag(SH).tone(-0.2);
    }
  }
  if (torn) f.triDecal(f.at(knee, -0.03, -0.16, 0.06), f.at(knee, 0.035, -0.18, 0.06), f.at(knee, 0.0, -0.27, 0.06), M.blood);
  const bend = 1 - f.dir(hip, 0, -1, 0).dot(f.dir(knee, 0, -1, 0));
  if (!L.bareLegs && seenFront) {
    // Knee: patches on work trousers, else one crease across a bent knee.
    if (L.outfit === 'worker' || L.outfit === 'flannel') f.decal(f.at(knee, 0, 0.045, 0.066), f.at(knee, 0, -0.065, 0.066), 0.046 * s, 0.046 * s, pm).flag(SH | CUT).tone(-0.2);
    else if (bend > 0.03) stroke(f, f.at(knee, -0.04, -0.03, 0.066), f.at(knee, 0.035, -0.045, 0.066), pm, s, -0.2);
    // The crotch pull at the hip.
    stroke(f, f.at(hip, -side * 0.05, -0.03, 0.075), f.at(hip, -side * 0.012, -0.11, 0.08), pm, s, -0.2);
    if (L.dead && hash(L.seed * 4.3 + side) < 0.5) {
      f.triDecal(f.at(hip, -0.03, -0.17, 0.08), f.at(hip, 0.035, -0.19, 0.085), f.at(hip, 0.0, -0.285, 0.085), M.skin);
    } else if (L.dead) {
      f.triDecal(f.at(hip, -0.025, -0.12, 0.08), f.at(hip, 0.04, -0.15, 0.08), f.at(hip, 0.02, -0.29, 0.08), M.blood);
    }
  }
  // Shoe: a squared heel, the upper, a sole band under it, a toe cap.
  if (L.bareLegs) {
    f.cone(f.at(knee, 0, -0.395, -0.045), f.at(knee, 0, -0.428, 0.16), 0.046 * s, 0.036 * s, M.shoes).k(0.012 * s);
    return;
  }
  f.cone(f.at(knee, 0, -0.4, -0.05), f.at(knee, 0, -0.418, 0.165), 0.05 * s, 0.04 * s, M.shoes).flag(PF.CUT_A).k(0.008 * s);
  f.cone(f.at(knee, 0, -0.452, -0.058), f.at(knee, 0, -0.452, 0.19), 0.014 * s, 0.014 * s, C.sole).flag(CUT).k(0.002 * s).min(0.5);
  if (f.cel > 1) {
    f.decal(f.at(knee, -0.018, -0.392, 0.15), f.at(knee, 0.012, -0.392, 0.15), 0.006 * s, 0.006 * s, M.shoes).flag(SH | PF.NO_OUTLINE).tone(0.3).min(0.5);
  }
  if (seenFront && (L.outfit === 'worker' || L.outfit === 'flannel' || !L.dead)) {
    // Laces: two pale ticks across the instep.
    f.decal(f.at(knee, -0.022, -0.385, 0.075), f.at(knee, 0.022, -0.385, 0.075), 0.005 * s, 0.005 * s, C.lace).flag(D | PF.NO_OUTLINE).min(0.5);
    f.decal(f.at(knee, -0.02, -0.4, 0.105), f.at(knee, 0.02, -0.4, 0.105), 0.005 * s, 0.005 * s, C.lace).flag(D | PF.NO_OUTLINE).min(0.5);
  }
}

const LOOSE: HumanPose = { severed: [0, 0], headless: false, jaw: 0, face: 'zombie', squash: 0, time: 0, speed: 0 };

/** A severed arm lying / tumbling in the world, in the PIXEL CAST 2 looks. */
export function paintLooseArmCel(f: PixelFigure, obj: THREE.Object3D, whole: boolean, L: HumanLook): boolean {
  const M = mats(L);
  const C = celMats(L);
  const s = scaleOf(obj);
  f.layer(0.012 * s, PART.NONE);
  if (whole) {
    let elbow: THREE.Object3D | null = null;
    for (const c of obj.children) if (!(c as THREE.Mesh).isMesh) elbow = c;
    armCel(f, obj, elbow, 1, L, M, C, s, LOOSE, null);
    f.ball(f.at(obj, 0, 0.02, 0), 0.055 * s, M.gore).rag(0.008 * s, PF.SPIKY).z(-0.05);
  } else {
    const a = L.armLength;
    const foreMat = L.sleeves === 'long' ? M.sleeve : M.skin;
    f.cone(f.at(obj, 0, 0.012, 0.004), f.at(obj, 0, -0.24 * a, 0), 0.048 * s, 0.034 * s, foreMat);
    paintHand(f, obj, 1, L, M, s, a, 0, L.dead ? HAND.CLAW : HAND.OPEN, null);
    f.ball(f.at(obj, 0, 0.02, 0), 0.047 * s, M.gore).rag(0.008 * s, PF.SPIKY).z(-0.05);
    f.ball(f.at(obj, 0, 0.05, 0), 0.015 * s, M.bone).z(-0.06);
  }
  return true;
}

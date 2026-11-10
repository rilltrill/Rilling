import * as THREE from 'three';
import type { HumanoidRig } from '../kit/humanoid';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat } from '../../gameplay/pixel/materials';
import { CEL_HAND, CEL_STAMP, HAND, STAMP, celSize, dir8 } from '../../gameplay/pixel/stamps';
import { hash, mats, paintBubble, paintHat, paintPonytail, paintSmears, scaleOf, tilted, trunkSlice, tx, type HumanLook, type HumanPose, type Mats } from './human';

/**
 * ─── PIXEL CAST 2: the humanoid, DRAWN ─────────────────────────────────────
 *
 * The same rig, joints and sizes as `paintHuman` (the sprite still covers what
 * the hitboxes cover), drawn the way a mid-2000s arcade sprite is drawn
 * (docs/PIXELWORLD2.md §9, docs/ARCHITECTURE.md "PIXEL CAST 2"):
 *
 *   anatomy   AS SILHOUETTE, filled flat: shoulders slope from the neck, the
 *             trunk runs chest → waist → hip in one shape, arms go deltoid →
 *             elbow corner → forearm swell → thin wrist, legs thigh → knee →
 *             calf → ankle; corners only where cloth has them (collars, lapels,
 *             cuffs, hems, heels, hair).
 *   shading   THREE tones, as designed shapes — never a stripe down every limb.
 *             The automatic form band is off (`autoBand`); far-side limbs are a
 *             whole step down; the side of the trunk and of the limbs away from
 *             the light carry wedges built on the joints (`seg` / `shape`: wide at
 *             a joint, running out along the limb, so they are fold shadows and
 *             stay put from redraw to redraw); nearer layers cast on farther ones
 *             (resolve pass); small LIGHT shapes one step up sit on the planes
 *             that face the light (shoulder top, chest plane, forward thigh, hair).
 *   faces     stamps in four sizes, in front, three-quarter and profile views;
 *             the back of a head is hair with a shape, ears, a nape. The dead:
 *             sockets, a glowing pin, teeth, a jaw that drops, rot. The living:
 *             brows, pupils, whites only from the M size up.
 *   hands     stamps at every size (the big ones: `CEL_HAND`), a little big.
 *   costume   4–6 drawn details per outfit, from the front AND from behind.
 *   gore      designed two-tone shapes: stains with a dark rim and a run, wounds
 *             with a wet centre, rot as an edged patch — a few per zombie.
 *
 * Detail follows size (`lod`): under ~70 texels tall a figure keeps its big
 * reads only (two tones, bigger simpler head features); from ~150 it gains fold
 * strokes, stitching and small marks.
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
  olive: number;
}

const celCache = new WeakMap<HumanLook, CelMats>();

function celMats(L: HumanLook): CelMats {
  let m = celCache.get(L);
  if (m) return m;
  // Soles: pale rubber under trainers and work boots, near-black under dress shoes.
  const pale = !L.dead || L.outfit === 'worker' || L.outfit === 'nurse';
  m = {
    sole: Mat.flat(pale ? 0xd8d2c0 : 0x3a3430, 'sole'),
    lace: Mat.flat(0xe8e0c8, 'lace'),
    white: Mat.flat(0xf4f1e8),
    dark: Mat.flat(0x1c1a22),
    red: Mat.flat(0xd8322a),
    blue: Mat.flat(0x2a5aa0),
    gold: Mat.gloss(0xd8b040),
    olive: Mat.flat(0x4a5032),
  };
  celCache.set(L, m);
  return m;
}

const P0 = { x: 0, y: 0, z: 0 };
const P1 = { x: 0, y: 0, z: 0 };

// ─── Shape helpers (module scratch: one figure is painted at a time) ─────────

const SA = new THREE.Vector3();
const SB = new THREE.Vector3();
const SN = new THREE.Vector3();

/** Aim the shape helpers at the part whose axis runs a → b: `SN` = the unit offset toward its side AWAY from the light. */
function seg(f: PixelFigure, a: THREE.Vector3, b: THREE.Vector3) {
  SA.copy(a);
  SB.copy(b);
  SN.copy(f.sideOf(a, b, 1));
}

/** A point `t` along the current segment, `off` metres toward the shadow side (negative: the lit side). */
function sp(f: PixelFigure, t: number, off: number): THREE.Vector3 {
  return f.vec().copy(SA).lerp(SB, t).addScaledVector(SN, off);
}

/**
 * A drawn tone shape on the current layer, between three points of the current
 * segment: `tone` −1 = a shadow shape (it joins the cast shadows), −1.2 = a deep
 * recess, +0.2 = a light shape.
 */
function shape(f: PixelFigure, t0: number, o0: number, t1: number, o1: number, t2: number, o2: number, tone: number, mat: number) {
  f.triDecal(sp(f, t0, o0), sp(f, t1, o1), sp(f, t2, o2), mat).flag(PF.SHADE_ONLY).tone(tone);
}

/** A thin drawn stroke on the current layer (a crease, a seam): `tone` −0.2 = one step darker. */
function stroke(f: PixelFigure, a: THREE.Vector3, b: THREE.Vector3, mat: number, s: number, tone: number) {
  f.decal(a, b, 0.005 * s, 0.005 * s, mat).flag(SH).tone(tone).min(0.5);
}

/** A flat rectangle painted on the current layer: from a to b, half-width hw (metres). */
function rect(f: PixelFigure, a: THREE.Vector3, b: THREE.Vector3, hw: number, mat: number): PixelFigure {
  return f.decal(a, b, hw, hw, mat).flag(D | CUT).min(0.5);
}

/** A small flat mark (a button, a stud, a pen cap) that keeps its colour. */
function dot(f: PixelFigure, p: THREE.Vector3, r: number, mat: number): PixelFigure {
  return f.decal(p, p, r, r, mat).flag(D | PF.NO_OUTLINE).min(0.5);
}

// ─── Gore: designed shapes (seeded from the look — never the world RNG) ───────

/**
 * A blood stain on joint `j` at (x, y) on the plane z, about w × h metres: a
 * dark-rimmed blob with a wet body, a tail that narrows into a run creeping down,
 * a bead at its end.
 */
function stain(f: PixelFigure, j: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, M: Mats, s: number, seed: number, drip: number, lod: number) {
  const h1 = hash(seed) - 0.5;
  const h2 = hash(seed * 1.7 + 3) - 0.5;
  const dx = x + w * 0.5 * h2;
  f.decal(f.at(j, x - w * 0.55, y + h * 0.5 * h1, z), f.at(j, x + w * 0.55, y - h * 0.5 * h1, z), h * 0.6 * s, h * 0.5 * s, M.blood).flag(D).tone(-0.2);
  f.triDecal(f.at(j, x - w * 0.6, y - h * 0.1, z), f.at(j, x + w * 0.55, y - h * 0.2, z), f.at(j, dx, y - h * 1.5, z), M.blood).tone(-0.2);
  if (lod > 0) f.decal(f.at(j, x - w * 0.3, y + h * (0.1 + 0.3 * h1), z), f.at(j, x + w * 0.25, y - h * 0.3 * h1, z), h * 0.3 * s, h * 0.24 * s, M.blood).flag(D | PF.NO_OUTLINE);
  if (drip > 0) {
    f.decal(f.at(j, dx, y - h * 1.3, z), f.at(j, dx + 0.004, y - h * 1.5 - drip, z), 0.007 * s, 0.006 * s, M.blood).flag(D).tone(-0.2).min(0.5);
    if (lod > 1) dot(f, f.at(j, dx + 0.004, y - h * 1.5 - drip - 0.008, z), 0.01 * s, M.blood);
  }
}

/**
 * A wound: a gash from (x − dx, y + dy) to (x + dx, y − dy), `r` metres wide — a
 * torn dark shape, wet meat inside it, a glint; cloth points torn out at its ends.
 */
function wound(f: PixelFigure, j: THREE.Object3D, x: number, y: number, z: number, dx: number, dy: number, r: number, M: Mats, s: number, lod: number) {
  f.decal(f.at(j, x - dx, y + dy, z), f.at(j, x + dx, y - dy, z), r * s, r * 0.8 * s, M.blood).flag(D).tone(-0.5);
  f.decal(f.at(j, x - dx * 0.5, y + dy * 0.5, z), f.at(j, x + dx * 0.45, y - dy * 0.45, z), r * 0.5 * s, r * 0.4 * s, M.gore).flag(D | PF.NO_OUTLINE);
  if (lod > 1) {
    f.triDecal(f.at(j, x - dx + r * 0.4, y + dy + r * 0.5, z), f.at(j, x - dx - r * 0.6, y + dy - r * 0.2, z), f.at(j, x - dx * 2.2 - r * 0.4, y + dy * 2.2 + r * 0.5, z), M.blood).tone(-0.5);
    f.triDecal(f.at(j, x + dx - r * 0.4, y - dy - r * 0.5, z), f.at(j, x + dx + r * 0.6, y - dy + r * 0.2, z), f.at(j, x + dx * 2.1 + r * 0.3, y - dy * 2.1 - r * 0.6, z), M.blood).tone(-0.5);
    dot(f, f.at(j, x - dx * 0.25, y + dy * 0.25 + r * 0.12, z), 0.007 * s, M.gore).tone(0.5);
  }
}

/** Rot on skin: a lobed patch in the skin's own ramp, a step down, with a darker edge. */
function rot(f: PixelFigure, j: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, mat: number, s: number, seed: number) {
  const h1 = hash(seed * 2.1 + 7) - 0.5;
  const r = Math.min(w, h);
  f.decal(f.at(j, x - w * 0.6, y + h * 0.6 * h1, z), f.at(j, x + w * 0.6, y - h * 0.6 * h1, z), r * 0.75 * s, r * 0.55 * s, mat).flag(SH).tone(-0.5);
  f.decal(f.at(j, x + w * 0.3 * h1, y + h * 0.7, z), f.at(j, x - w * 0.2 * h1, y - h * 0.6, z), r * 0.5 * s, r * 0.6 * s, mat).flag(SH).tone(-0.5);
  f.decal(f.at(j, x - w * 0.35, y + h * 0.4 * h1, z), f.at(j, x + w * 0.35, y - h * 0.4 * h1, z), r * 0.45 * s, r * 0.3 * s, mat).flag(SH).tone(-0.2);
}

/** Paint a humanoid rig in the PIXEL CAST 2 look (`f.cel` > 0). */
export function paintHumanCel(f: PixelFigure, r: HumanoidRig, L: HumanLook, st: HumanPose): boolean {
  if (!r.root.visible) return false;
  f.maxTexels = 240;
  // Shadows here are drawn shapes: no automatic band on anything this painter adds.
  f.autoBand = false;
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
  // Detail tier from the figure's height in texels: 0 small (< 70), 1 mid, 2 big (≥ 150).
  const tall = tx(f, f.at(r.spine, 0, 0.2, 0), 1.8 * s);
  const lod = tall < 70 ? 0 : tall < 150 ? 1 : 2;

  if (st.mem && st.smear !== undefined && st.smear > 0) paintSmears(f, r, M, st, s);

  // ── Trunk: ONE shape, shoulder → chest → waist → hip ─────────────────────
  f.layer(0.012 * s, PART.TORSO);
  const hipY = f.dir(r.hips, 0, 1, 0);
  const hipZ = f.dir(r.hips, 0, 0, 1);
  const hipX = f.dir(r.hips, 1, 0, 0);
  const spX = f.dir(r.spine, 1, 0, 0);
  const spZ = f.dir(r.spine, 0, 0, 1);
  const hz = 0.022 * hunch;
  const o = L.outfit;
  const bare = M.shirt === M.skin;
  // The zombie doctor's closed coat hangs to mid-thigh; a patient's gown is a skirt round the hips.
  const coat = L.dead && o === 'doctor';
  const gown = o === 'patient';
  const jacket = L.jacket !== null;
  const untucked = o === 'casual' || o === 'worker' || o === 'flannel' || o === 'nurse' || jacket || coat || gown;
  const hemY = coat || gown ? 0.03 : o === 'nurse' ? -0.075 : untucked ? -0.04 : 0.025;
  const hemW = (coat || gown ? 0.16 : untucked ? 0.174 : 0.158) * b;
  const shH = 0.186 * b + 0.004;
  if (st.pelvis !== false) trunkSlice(f, r.hips, hipY, hipZ, -0.025, 0.0, 0.168 * b, 0.078, 0.104 * sb, s, M.pants).u(0).k(0.012 * s);
  // Chest (square at the shoulder line), ribs narrowing to the waist, the shirt out to its hem.
  f.coneE(f.at(r.spine, 0, 0.452, hz * 0.7), f.at(r.spine, 0, 0.27, hz * 0.45), spX, spZ, shH * s, 0.11 * sb * s, 0.172 * b * s, 0.108 * sb * s, M.shirt)
    .flag(CUT)
    .bulge(0.1 * sb * s)
    .u(0.05);
  f.coneE(f.at(r.spine, 0, 0.28, hz * 0.45), f.at(r.spine, 0, 0.11, hz * 0.2), spX, spZ, 0.172 * b * s, 0.108 * sb * s, 0.148 * b * s, 0.098 * sb * s, M.shirt)
    .flag(CUT)
    .bulge(0.095 * sb * s)
    .u(0.22);
  f.coneE(f.at(r.spine, 0, 0.12, hz * 0.2), f.at(r.spine, 0, hemY, 0.004), spX, spZ, 0.148 * b * s, 0.098 * sb * s, hemW * s, 0.102 * sb * s, M.shirt)
    .flag(CUT)
    .bulge(0.09 * sb * s)
    .u(0.38);
  if (coat || gown) {
    // Coat tails / gown skirt: a flared panel round the hips, cut straight above the knee.
    const low = coat ? -0.3 : -0.26;
    f.coneE(f.at(r.hips, 0, 0.06, 0), f.at(r.hips, 0, low, 0.004), hipX, hipZ, 0.166 * b * s, 0.106 * sb * s, 0.205 * b * s, 0.122 * sb * s, M.shirt)
      .flag(CUT)
      .bulge(0.1 * sb * s)
      .z(-0.05)
      .u(0.5);
  }
  // Shoulder line: sloping from the neck down to each shoulder point (one shoulder drops on the dead).
  const shW = 0.2 * b + 0.032;
  for (let side = 1; side >= -1; side -= 2) {
    const drop = 0.016 * slump * side;
    f.cone(f.at(r.chest, side * 0.045, 0.046, -0.008), f.at(r.chest, side * (shW - 0.048), -0.02 - drop, hz * 0.6), 0.036 * s, 0.056 * s, M.shirt).k(0.01 * s);
  }
  // Upper-back hump (the hunched dead, in profile).
  f.cone(f.at(r.spine, 0, 0.27, -0.035 - 0.015 * hunch), f.at(r.spine, 0, 0.4, -0.03 - 0.02 * hunch), 0.085 * sb * s, 0.08 * sb * s, M.shirt).k(0.03 * s);
  // Neck.
  const nw = st.neckW ?? 1;
  f.cone(f.at(r.chest, 0, -0.02, -0.006 + hz), f.at(r.neck, 0, nw > 1.2 ? 0.04 : 0.075, 0.004), 0.054 * nw * s, 0.046 * Math.min(nw, 1.3) * s, M.skin).k(0.01 * s);
  const fz = 0.112 * sb;
  if (untucked && !coat && !gown && !bare) {
    // The hem is a drawn edge, not a ruled line: a shirt tail dips on one side (front and back).
    const dip = hash(sd * 0.37) < 0.5 ? 1 : -1;
    for (let zs = 1; zs >= -1; zs -= 2) {
      const z = zs * 0.085 * sb;
      f.tri(f.at(r.spine, -hemW * 0.95, hemY + 0.014, z), f.at(r.spine, hemW * 0.95, hemY + 0.014, z), f.at(r.spine, dip * zs * hemW * 0.5, hemY - 0.038, z * 1.04), M.shirt);
    }
    if (jacket) {
      // A jacket's front panels round off toward the opening.
      for (let side = 1; side >= -1; side -= 2) f.tri(f.at(r.spine, side * hemW * 0.95, hemY + 0.014, 0.085 * sb), f.at(r.spine, side * 0.02, hemY + 0.014, 0.09 * sb), f.at(r.spine, side * hemW * 0.62, hemY - 0.05, 0.09 * sb), M.shirt);
    }
  }
  // The dead's hem is torn: pointed strips hang below it and sway with the walk.
  if (L.dead) {
    const n = Math.min(3, Math.max(untucked ? 2 : 0, L.rags));
    const base = coat ? -0.3 : gown ? -0.26 : hemY;
    const j = coat || gown ? r.hips : r.spine;
    for (let i = 0; i < n; i++) {
      const h = hash(sd + i * 3.1);
      const x = (-0.11 + i * 0.1 + (h - 0.5) * 0.04) * b;
      const back = hash(sd + i * 7.7) < 0.3;
      const z = (back ? -1 : 1) * 0.09 * sb;
      const sway = Math.sin(t * (5 + h * 3) + i * 2) * 0.018 * (0.5 + Math.min(1, st.speed));
      const w = 0.03 + h * 0.016;
      f.tri(f.at(j, x - w, base + 0.012, z), f.at(j, x + w, base + 0.012, z), f.at(j, x + sway + (h - 0.5) * 0.03, base - 0.07 - h * 0.05, z * 1.05), M.shirt);
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
    // Blood runs down the side from the stump.
    f.triDecal(f.at(r.chest, side * (shW - 0.03), -0.05, 0.06), f.at(r.chest, side * (shW - 0.1), -0.07, 0.06), f.at(r.spine, side * 0.15 * b, 0.12, 0.08), M.blood).tone(-0.2);
    f.triDecal(f.at(r.chest, side * (shW - 0.04), -0.06, 0.06), f.at(r.chest, side * (shW - 0.085), -0.075, 0.06), f.at(r.spine, side * 0.15 * b, 0.2, 0.08), M.blood);
  }
  const front = f.facing(f.at(r.spine, 0, 0.25, 0.1), spZ);
  costume(f, r, L, M, C, front, fz, b, s, lod, bare || !!st.torso);
  if (L.dead) torsoGore(f, r, L, M, front, fz, b, s, lod, bare);
  if (o === 'flannel' || o === 'worker') {
    // Tool belt: a leather pouch on the left hip; a hammer hanging on the right (the flannel).
    f.cone(f.at(r.hips, 0.125 * b, 0.035, 0.11), f.at(r.hips, 0.13 * b, -0.045, 0.115), 0.036 * s, 0.032 * s, M.pouch).flag(CUT).k(0.004 * s);
    if (o === 'flannel') {
      f.cone(f.at(r.hips, -0.13 * b, 0.02, 0.12), f.at(r.hips, -0.13 * b, -0.13, 0.13), 0.012 * s, 0.011 * s, M.handle).k(0.002 * s);
      f.cone(f.at(r.hips, -0.17 * b, 0.04, 0.125), f.at(r.hips, -0.09 * b, 0.04, 0.125), 0.016 * s, 0.016 * s, M.steel).flag(CUT).k(0.002 * s);
    }
  }
  // ── Trunk tone shapes (they lie over the costume): the side away from the light from
  // armpit to hem, a V under the chin, the hem's shadow; a light shape on the chest plane.
  {
    seg(f, f.at(r.spine, 0, hemY, 0.004), f.at(r.spine, 0, 0.452, hz * 0.7));
    const nx = SN.dot(spX);
    const nz = SN.dot(spZ);
    const hwT = Math.hypot(shH * nx, 0.11 * sb * nz) * s;
    const hwB = Math.hypot(hemW * nx, 0.1 * sb * nz) * s;
    shape(f, 0.9, hwT * 0.6, 0.9, hwT * 1.5, 0, hwB * 1.5, -1, M.shirt);
    shape(f, 0.9, hwT * 0.6, 0, hwB * 1.5, 0, hwB * 0.38, -1, M.shirt);
    if (lod > 0) {
      shape(f, 0.98, -hwT * 1.4, 0.98, -hwT * 0.12, 0.6, -hwT * 1.4, 0.2, M.shirt);
      if (front > 0.2 && !st.headless) shape(f, 1.02, -hwT * 0.2, 1.02, hwT * 0.42, 0.87, hwT * 0.2, -1, M.shirt);
    }
    if (untucked && !coat && !gown && st.pelvis !== false) {
      // The hem's shadow on the hips.
      f.decal(f.at(r.spine, -hemW, hemY - 0.03, 0), f.at(r.spine, hemW, hemY - 0.03, 0), 0.02 * s, 0.02 * s, M.pants).flag(SH).tone(-1);
    }
  }
  if (st.torso) {
    // (Parts other painters melt into the trunk keep the automatic band until they are redrawn.)
    f.autoBand = true;
    st.torso(f);
    f.autoBand = false;
  }

  // ── Head ───────────────────────────────────────────────────────────────
  if (!st.headless) {
    const roll = L.dead ? 0.1 * Math.sin(t * 0.9 + sd) + 0.08 * (hash(sd * 4.1) - 0.5) : 0.03 * Math.sin(t * 1.7 + sd);
    const pitch = L.dead ? 0.06 + 0.05 * Math.sin(t * 0.7 + sd * 1.7) : 0;
    headCel(f, tilted(r.head, pitch, roll), L, M, st, s, lod);
  } else {
    f.layer(0.012 * s, PART.TORSO);
    f.cone(f.at(r.neck, 0, 0.02, 0), f.at(r.neck, 0, 0.1, 0.0), 0.054 * s, 0.05 * s, M.gore)
      .rag(0.01 * s, PF.SPIKY | PF.RAG_END)
      .seed(3);
    f.ball(f.at(r.neck, 0, 0.115, -0.01), 0.018 * s, M.bone);
  }

  // ── Arms ───────────────────────────────────────────────────────────────
  const mid0 = f.at(r.spine, 0, 0.25, 0);
  for (let side = 1; side >= -1; side -= 2) {
    const sev = st.severed[side > 0 ? 0 : 1] ?? 0;
    const arm = side > 0 ? r.armL : r.armR;
    if (sev >= 2) continue;
    const root = f.at(arm.shoulder, 0, -0.25, 0);
    const far = f.depth(root) > torsoDepth + 0.05;
    // Is this arm on the side of the body away from the light?
    const away = root.sub(mid0).dot(f.shadeDir) > 0;
    f.layer(0.016 * s, PART.LIMB, far ? -0.1 : 0);
    armCel(f, arm.shoulder, sev >= 1 ? null : arm.elbow, side, L, M, C, s * (st.armW?.[side > 0 ? 0 : 1] ?? 1), st, r.chest, far, away, lod);
  }

  // ── Legs ───────────────────────────────────────────────────────────────
  if (!st.legless) {
    for (let side = 1; side >= -1; side -= 2) {
      const leg = side > 0 ? r.legL : r.legR;
      const kn = f.at(leg.knee, 0, 0, 0);
      const mid = f.depth(kn);
      const tuck = L.dead ? 0 : Math.min(0.08, Math.max(0, (mid - f.depth(f.at(leg.hip, 0, 0, 0)) - 0.12) * 0.5));
      const far = mid > torsoDepth + 0.06;
      const away = kn.sub(mid0).dot(f.shadeDir) > 0;
      f.layer(0.014 * s, PART.LIMB, far ? -0.1 : 0, tuck);
      legCel(f, leg.hip, leg.knee, side, L, M, C, s * (st.legW ?? 1), far, away, lod);
    }
  }
  if (st.extra) {
    f.autoBand = true;
    st.extra(f);
    f.autoBand = false;
  }
  if (st.bubble !== undefined && st.bubble >= 0 && !st.headless) paintBubble(f, r, st.bubble, s);

  if (st.squash > 0) {
    const q = st.squash;
    f.warp(f.at(r.hips, 0, -0.9, 0), 1 + 0.07 * q, 1 - 0.06 * q);
  }
  return true;
}

/**
 * The costume: drawn details that say who this person was — from the front AND
 * from behind — plus what wraps round the body (vests, belts) from any side.
 * `plain` = a bare or reshaped trunk (brutes, bloaters): no chest marks.
 */
function costume(f: PixelFigure, r: HumanoidRig, L: HumanLook, M: Mats, C: CelMats, front: number, fz: number, b: number, s: number, lod: number, plain: boolean) {
  const sp0 = r.spine;
  const seen = front > -0.15;
  const back = front < -0.2;
  const o = L.outfit;
  const bz = -fz;
  if (o === 'office' || o === 'scientist' || o === 'doctor') {
    const coat = o !== 'office';
    const open = M.inner !== 0 && (L.jacket !== null || o === 'doctor');
    const iw = L.innerW ?? 1;
    if (seen) {
      if (open) {
        // The shirt front in the jacket's V, then the lapels lying on it (the lit one a step lighter).
        const vw = 0.078 * Math.min(iw, 1.8);
        f.triDecal(f.at(sp0, -vw, 0.458, fz), f.at(sp0, vw, 0.458, fz), f.at(sp0, 0, coat && iw > 1.5 ? 0.06 : 0.17, fz), M.inner);
        const lapel = L.jacket !== null ? M.jacket : M.shirt;
        for (let sd = 1; sd >= -1; sd -= 2) {
          f.triDecal(f.at(sp0, sd * (vw + 0.004), 0.46, fz), f.at(sp0, sd * 0.13 * b, 0.345, fz), f.at(sp0, sd * 0.012, coat && iw > 1.5 ? 0.075 : 0.185, fz), lapel).tone(sd > 0 ? -0.2 : 0.2);
          // The notch of the lapel.
          if (lod > 0) stroke(f, f.at(sp0, sd * 0.13 * b, 0.345, fz), f.at(sp0, sd * 0.085, 0.362, fz), lapel, s, -0.5);
        }
        if (o === 'office') f.triDecal(f.at(sp0, 0.085 * b, 0.33, fz), f.at(sp0, 0.13 * b, 0.33, fz), f.at(sp0, 0.112 * b, 0.368, fz), C.white);
        // Two jacket buttons below the V.
        if (lod > 0 && !(coat && iw > 1.5)) {
          dot(f, f.at(sp0, 0.012, 0.13, fz), 0.008 * s, coat ? C.dark : C.gold);
          dot(f, f.at(sp0, 0.012, 0.06, fz), 0.008 * s, coat ? C.dark : C.gold);
        }
      } else {
        // Shirt sleeves: a breast pocket with two pens.
        rect(f, f.at(sp0, 0.095 * b, 0.335, fz), f.at(sp0, 0.095 * b, 0.262, fz), 0.036 * s, M.shirt).flag(PF.SHADE_ONLY).tone(-0.2);
        dot(f, f.at(sp0, 0.08 * b, 0.35, fz), 0.006 * s, C.blue);
        if (lod > 0) dot(f, f.at(sp0, 0.105 * b, 0.348, fz), 0.006 * s, C.red);
      }
      if (coat) {
        // Lab coat: a breast pocket with pens, an ID card clipped on.
        if (lod > 0) {
          dot(f, f.at(sp0, 0.1 * b, 0.34, fz), 0.006 * s, C.blue);
          dot(f, f.at(sp0, 0.122 * b, 0.338, fz), 0.006 * s, C.red);
          stroke(f, f.at(sp0, 0.075 * b, 0.325, fz), f.at(sp0, 0.14 * b, 0.325, fz), M.shirt, s, -0.2);
        }
        rect(f, f.at(sp0, -0.105 * b, 0.33, fz), f.at(sp0, -0.105 * b, 0.275, fz), 0.022 * s, M.card);
        if (lod > 0) dot(f, f.at(sp0, -0.105 * b, 0.31, fz), 0.009 * s, C.dark);
        if (o === 'doctor') {
          // Stethoscope: the tube round the neck, the chest piece hanging on the left.
          f.decal(f.at(sp0, -0.062, 0.46, fz), f.at(sp0, -0.05, 0.3, fz), 0.006 * s, 0.006 * s, M.cord).flag(D).min(0.5);
          f.decal(f.at(sp0, 0.062, 0.46, fz), f.at(sp0, 0.055, 0.34, fz), 0.006 * s, 0.006 * s, M.cord).flag(D).min(0.5);
          dot(f, f.at(sp0, -0.05, 0.285, fz), 0.014 * s, M.steel);
        }
      } else {
        // Name badge: a white card with a line of print.
        rect(f, f.at(sp0, -0.125 * b, 0.335, fz), f.at(sp0, -0.07 * b, 0.335, fz), 0.016 * s, C.white);
        if (lod > 0) f.decal(f.at(sp0, -0.115 * b, 0.332, fz), f.at(sp0, -0.085 * b, 0.332, fz), 0.004 * s, 0.004 * s, C.dark).flag(D | PF.NO_OUTLINE).min(0.5);
      }
      // Pointed collar.
      for (let sd = 1; sd >= -1; sd -= 2) f.triDecal(f.at(sp0, sd * 0.075, 0.475, fz), f.at(sp0, sd * 0.006, 0.452, fz), f.at(sp0, sd * 0.055, 0.395, fz), M.collar).tone(sd > 0 ? 0 : 0.2);
      if (M.tie) {
        // Knot, a blade widening to a point, two diagonal stripes.
        const tx0 = (hash(L.seed * 2.1) - 0.5) * 0.03;
        f.triDecal(f.at(sp0, -0.02, 0.452, fz), f.at(sp0, 0.02, 0.452, fz), f.at(sp0, 0, 0.415, fz), M.tie);
        f.triDecal(f.at(sp0, 0, 0.44, fz), f.at(sp0, -0.03 + tx0, 0.235, fz), f.at(sp0, 0.03 + tx0, 0.235, fz), M.tie);
        f.triDecal(f.at(sp0, -0.03 + tx0, 0.237, fz), f.at(sp0, 0.03 + tx0, 0.237, fz), f.at(sp0, tx0 * 1.2, 0.185, fz), M.tie);
        if (lod > 0) {
          f.decal(f.at(sp0, -0.018 + tx0 * 0.4, 0.36, fz), f.at(sp0, 0.018 + tx0 * 0.4, 0.34, fz), 0.006 * s, 0.006 * s, M.tie).flag(SH | PF.NO_OUTLINE).tone(0.5).min(0.5);
          f.decal(f.at(sp0, -0.024 + tx0 * 0.7, 0.295, fz), f.at(sp0, 0.024 + tx0 * 0.7, 0.275, fz), 0.006 * s, 0.006 * s, M.tie).flag(SH | PF.NO_OUTLINE).tone(0.5).min(0.5);
        }
      }
    } else if (back) {
      // From behind: the shirt collar over the jacket, the centre seam down to a vent, a half belt on a coat.
      rect(f, f.at(sp0, -0.06, 0.462, bz), f.at(sp0, 0.06, 0.462, bz), 0.014 * s, M.collar);
      stroke(f, f.at(sp0, 0, 0.44, bz), f.at(sp0, 0, coat ? 0.16 : 0.06, bz), M.shirt, s, -0.2);
      if (coat) {
        rect(f, f.at(sp0, -0.085 * b, 0.13, bz), f.at(sp0, 0.085 * b, 0.13, bz), 0.016 * s, M.shirt).flag(PF.SHADE_ONLY).tone(-0.2);
        if (lod > 0) {
          dot(f, f.at(sp0, -0.07 * b, 0.13, bz), 0.007 * s, C.dark);
          dot(f, f.at(sp0, 0.07 * b, 0.13, bz), 0.007 * s, C.dark);
        }
        // The coat's vent: a dark slit up from the hem.
        if (L.dead && o === 'doctor') f.triDecal(f.at(r.hips, -0.02, -0.31, bz), f.at(r.hips, 0.02, -0.31, bz), f.at(r.hips, 0, -0.06, bz), M.shirt).flag(PF.SHADE_ONLY).tone(-1.2);
      } else if (L.jacket !== null) {
        f.triDecal(f.at(sp0, -0.016, -0.08, bz), f.at(sp0, 0.016, -0.08, bz), f.at(sp0, 0, 0.07, bz), M.shirt).flag(PF.SHADE_ONLY).tone(-1.2);
        if (lod > 0) for (let sd = 1; sd >= -1; sd -= 2) stroke(f, f.at(sp0, sd * 0.07, 0.445, bz), f.at(sp0, sd * 0.17 * b, 0.41, bz), M.shirt, s, -0.2);
      } else if (lod > 0) {
        // A shirt's yoke.
        stroke(f, f.at(sp0, -0.15 * b, 0.385, bz), f.at(sp0, 0.15 * b, 0.385, bz), M.shirt, s, -0.2);
      }
    }
  } else if (o === 'worker') {
    if (M.vest) {
      // Hi-vis vest: a body with a straight hem (the shirt shows below it), a V neck.
      f.decal(f.at(sp0, 0, 0.47, 0), f.at(sp0, 0, 0.065, 0), 0.24 * b * s, 0.24 * b * s, M.vest).flag(D | CUT);
      // Reflective tape: two bands round the body, braces over the shoulders.
      f.decal(f.at(sp0, -0.22 * b, 0.135, 0), f.at(sp0, 0.22 * b, 0.135, 0), 0.017 * s, 0.017 * s, M.band).flag(D);
      f.decal(f.at(sp0, -0.22 * b, 0.27, 0), f.at(sp0, 0.22 * b, 0.27, 0), 0.017 * s, 0.017 * s, M.band).flag(D);
      if (seen) {
        for (let sd = 1; sd >= -1; sd -= 2) rect(f, f.at(sp0, sd * 0.105 * b, 0.46, fz), f.at(sp0, sd * 0.105 * b, 0.285, fz), 0.015 * s, M.band);
        f.triDecal(f.at(sp0, -0.07, 0.462, fz), f.at(sp0, 0.07, 0.462, fz), f.at(sp0, 0, 0.36, fz), M.shirt);
        // Zip.
        stroke(f, f.at(sp0, 0.002, 0.36, fz), f.at(sp0, 0.002, 0.07, fz), M.vest, s, -0.5);
        // A radio clipped to the left brace, its aerial, a live LED.
        rect(f, f.at(sp0, 0.105 * b, 0.4, fz + 0.01), f.at(sp0, 0.105 * b, 0.34, fz + 0.01), 0.02 * s, C.dark);
        if (lod > 0) {
          f.decal(f.at(sp0, 0.12 * b, 0.4, fz + 0.01), f.at(sp0, 0.125 * b, 0.455, fz + 0.01), 0.004 * s, 0.004 * s, C.dark).flag(D | PF.NO_OUTLINE).min(0.5);
          const g2 = f.at(sp0, 0.105 * b, 0.375, fz + 0.01);
          f.decal(g2, g2, 0.006 * s, 0.006 * s, C.red).flag(D | PF.GLOW).min(0.5);
          // A site pass in a pocket window on the right.
          rect(f, f.at(sp0, -0.105 * b, 0.235, fz), f.at(sp0, -0.105 * b, 0.19, fz), 0.022 * s, C.white);
        }
      } else if (back) {
        // From behind: the braces run down to the band; a printed panel (the contractor's name) between them.
        for (let sd = 1; sd >= -1; sd -= 2) rect(f, f.at(sp0, sd * 0.1 * b, 0.46, bz), f.at(sp0, sd * 0.1 * b, 0.285, bz), 0.015 * s, M.band);
        rect(f, f.at(sp0, -0.07 * b, 0.36, bz), f.at(sp0, 0.07 * b, 0.36, bz), 0.026 * s, C.dark);
        if (lod > 0) f.decal(f.at(sp0, -0.05 * b, 0.36, bz), f.at(sp0, 0.05 * b, 0.36, bz), 0.006 * s, 0.006 * s, C.white).flag(D | PF.NO_OUTLINE).min(0.5);
      }
    }
  } else if (o === 'nurse') {
    if (seen) {
      // Scrubs: a V neck with a piped edge, a chest pocket with pens, an ID card on a lanyard, hem pockets.
      f.triDecal(f.at(sp0, -0.062, 0.462, fz), f.at(sp0, 0.062, 0.462, fz), f.at(sp0, 0, 0.365, fz), M.skin);
      for (let sd = 1; sd >= -1; sd -= 2) stroke(f, f.at(sp0, sd * 0.07, 0.462, fz), f.at(sp0, sd * 0.004, 0.358, fz), M.shirt, s, -0.5);
      rect(f, f.at(sp0, -0.095 * b, 0.33, fz), f.at(sp0, -0.095 * b, 0.262, fz), 0.036 * s, M.shirt).flag(PF.SHADE_ONLY).tone(-0.2);
      dot(f, f.at(sp0, -0.11 * b, 0.345, fz), 0.006 * s, C.blue);
      if (lod > 0) dot(f, f.at(sp0, -0.085 * b, 0.343, fz), 0.006 * s, C.red);
      f.decal(f.at(sp0, 0.045, 0.44, fz), f.at(sp0, 0.085 * b, 0.33, fz), 0.005 * s, 0.005 * s, M.lanyard).flag(D | PF.NO_OUTLINE).min(0.5);
      rect(f, f.at(sp0, 0.085 * b, 0.33, fz), f.at(sp0, 0.085 * b, 0.27, fz), 0.022 * s, M.card);
      if (lod > 0) {
        dot(f, f.at(sp0, 0.08 * b, 0.31, fz), 0.008 * s, C.dark);
        // Hem pockets: one drawn line each, a fob watch pinned by the left one.
        for (let sd = 1; sd >= -1; sd -= 2) stroke(f, f.at(sp0, sd * 0.14 * b, 0.06, fz), f.at(sp0, sd * 0.05 * b, 0.07, fz), M.shirt, s, -0.2);
      }
    } else if (back) {
      // From behind: the lanyard round the neck, the scrub top's tie strings in a bow, a centre crease.
      f.decal(f.at(sp0, -0.05, 0.46, bz), f.at(sp0, 0.05, 0.46, bz), 0.006 * s, 0.006 * s, M.lanyard).flag(D | PF.NO_OUTLINE).min(0.5);
      for (let sd = 1; sd >= -1; sd -= 2) f.triDecal(f.at(sp0, 0, 0.12, bz), f.at(sp0, sd * 0.06 * b, 0.15, bz), f.at(sp0, sd * 0.055 * b, 0.085, bz), M.shirt).flag(PF.SHADE_ONLY).tone(0.2);
      if (lod > 0) {
        stroke(f, f.at(sp0, 0, 0.12, bz), f.at(sp0, 0.012, 0.02, bz), M.shirt, s, -0.2);
        stroke(f, f.at(sp0, 0, 0.42, bz), f.at(sp0, 0, 0.18, bz), M.shirt, s, -0.2);
      }
    }
  } else if (o === 'flannel' || o === 'ranger') {
    if (seen) {
      // Open collar over the tee, a button placket, two pocket flaps with buttons.
      if (M.inner) f.triDecal(f.at(sp0, -0.05, 0.462, fz), f.at(sp0, 0.05, 0.462, fz), f.at(sp0, 0, 0.385, fz), M.inner);
      else f.triDecal(f.at(sp0, -0.045, 0.462, fz), f.at(sp0, 0.045, 0.462, fz), f.at(sp0, 0, 0.4, fz), M.skin);
      for (let sd = 1; sd >= -1; sd -= 2) {
        f.triDecal(f.at(sp0, sd * 0.085, 0.47, fz), f.at(sp0, sd * 0.004, 0.39, fz), f.at(sp0, sd * 0.075, 0.375, fz), M.shirt).flag(PF.SHADE_ONLY).tone(sd > 0 ? -0.2 : 0.2);
        f.triDecal(f.at(sp0, sd * 0.055 * b, 0.335, fz), f.at(sp0, sd * 0.135 * b, 0.335, fz), f.at(sp0, sd * 0.095 * b, 0.295, fz), M.shirt).flag(PF.SHADE_ONLY).tone(-0.2);
        if (lod > 0) dot(f, f.at(sp0, sd * 0.095 * b, 0.318, fz), 0.006 * s, o === 'ranger' ? C.gold : C.white);
      }
      stroke(f, f.at(sp0, 0.004, 0.385, fz), f.at(sp0, 0.004, 0.0, fz), M.shirt, s, -0.5);
      if (lod > 0) for (let i = 0; i < 3; i++) dot(f, f.at(sp0, 0.018, 0.33 - i * 0.1, fz), 0.006 * s, C.white);
      if (o === 'ranger') {
        // A ranger's shield over the left pocket.
        f.triDecal(f.at(sp0, 0.075 * b, 0.385, fz), f.at(sp0, 0.115 * b, 0.385, fz), f.at(sp0, 0.095 * b, 0.345, fz), C.gold);
      }
    } else if (back) {
      // From behind: the yoke seam with its pleat, the collar.
      rect(f, f.at(sp0, -0.06, 0.462, bz), f.at(sp0, 0.06, 0.462, bz), 0.014 * s, M.shirt).flag(PF.SHADE_ONLY).tone(0.2);
      stroke(f, f.at(sp0, -0.16 * b, 0.375, bz), f.at(sp0, 0, 0.355, bz), M.shirt, s, -0.5);
      stroke(f, f.at(sp0, 0, 0.355, bz), f.at(sp0, 0.16 * b, 0.375, bz), M.shirt, s, -0.5);
      if (lod > 0) stroke(f, f.at(sp0, 0, 0.355, bz), f.at(sp0, 0, 0.1, bz), M.shirt, s, -0.2);
    }
    if (o === 'ranger' && lod > 0) {
      // Epaulettes buttoned down on the shoulders (any side).
      for (let sd = 1; sd >= -1; sd -= 2) rect(f, f.at(r.chest, sd * 0.07, 0.03, 0.02), f.at(r.chest, sd * 0.16 * b, -0.005, 0.02), 0.013 * s, M.shirt).flag(PF.SHADE_ONLY).tone(-0.2);
    }
  } else if (o === 'cop') {
    if (seen) {
      // Uniform shirt: collar points, a dark tie, a gold shield, two flapped pockets, a radio mic on the shoulder.
      for (let sd = 1; sd >= -1; sd -= 2) {
        f.triDecal(f.at(sp0, sd * 0.075, 0.475, fz), f.at(sp0, sd * 0.006, 0.452, fz), f.at(sp0, sd * 0.055, 0.395, fz), M.shirt).flag(PF.SHADE_ONLY).tone(sd > 0 ? -0.2 : 0.2);
        f.triDecal(f.at(sp0, sd * 0.055 * b, 0.3, fz), f.at(sp0, sd * 0.135 * b, 0.3, fz), f.at(sp0, sd * 0.095 * b, 0.265, fz), M.shirt).flag(PF.SHADE_ONLY).tone(-0.2);
      }
      if (M.tie) {
        f.triDecal(f.at(sp0, -0.02, 0.452, fz), f.at(sp0, 0.02, 0.452, fz), f.at(sp0, 0, 0.415, fz), M.tie);
        f.triDecal(f.at(sp0, 0, 0.44, fz), f.at(sp0, -0.026, 0.225, fz), f.at(sp0, 0.026, 0.225, fz), M.tie);
      }
      // The shield: a gold badge with a point.
      rect(f, f.at(sp0, 0.095 * b, 0.375, fz), f.at(sp0, 0.095 * b, 0.345, fz), 0.02 * s, C.gold);
      f.triDecal(f.at(sp0, 0.075 * b, 0.347, fz), f.at(sp0, 0.115 * b, 0.347, fz), f.at(sp0, 0.095 * b, 0.315, fz), C.gold);
      // Radio mic clipped at the right shoulder, its cord to the belt.
      rect(f, f.at(sp0, -0.115 * b, 0.43, fz + 0.01), f.at(sp0, -0.115 * b, 0.385, fz + 0.01), 0.018 * s, C.dark);
      if (lod > 0) f.decal(f.at(sp0, -0.115 * b, 0.385, fz), f.at(sp0, -0.15 * b, 0.1, fz), 0.004 * s, 0.004 * s, C.dark).flag(D | PF.NO_OUTLINE).min(0.5);
    } else if (back) {
      // From behind: the collar, the yoke, the radio on the belt and a pair of cuffs.
      rect(f, f.at(sp0, -0.06, 0.462, bz), f.at(sp0, 0.06, 0.462, bz), 0.014 * s, M.shirt).flag(PF.SHADE_ONLY).tone(0.2);
      stroke(f, f.at(sp0, -0.16 * b, 0.38, bz), f.at(sp0, 0.16 * b, 0.38, bz), M.shirt, s, -0.5);
      if (lod > 0) stroke(f, f.at(sp0, 0, 0.38, bz), f.at(sp0, 0, 0.1, bz), M.shirt, s, -0.2);
    }
    // Shoulder patches (both sleeves, any side) are drawn with the arms; the duty belt's pouches here.
    if (M.belt) {
      for (let i = -1; i <= 1; i += 2) f.cone(f.at(r.hips, i * 0.15 * b, 0.065, i > 0 ? 0.07 : -0.05), f.at(r.hips, i * 0.155 * b, -0.02, i > 0 ? 0.075 : -0.055), 0.034 * s, 0.03 * s, M.belt).flag(CUT).k(0.003 * s);
      if (back && lod > 0) {
        rect(f, f.at(r.hips, 0.03, 0.06, -0.11), f.at(r.hips, 0.03, 0.0, -0.11), 0.022 * s, C.dark);
        dot(f, f.at(r.hips, -0.06, 0.02, -0.11), 0.014 * s, M.steel);
      }
    }
  } else if (o === 'patient') {
    if (seen) {
      // Gown: a round neck with a bound edge, a faded hospital stamp, one tie at the side.
      f.triDecal(f.at(sp0, -0.055, 0.462, fz), f.at(sp0, 0.055, 0.462, fz), f.at(sp0, 0, 0.4, fz), M.skin);
      for (let sd = 1; sd >= -1; sd -= 2) stroke(f, f.at(sp0, sd * 0.064, 0.462, fz), f.at(sp0, sd * 0.004, 0.394, fz), M.shirt, s, -0.5);
      if (lod > 0) {
        rect(f, f.at(sp0, 0.06 * b, 0.33, fz), f.at(sp0, 0.12 * b, 0.33, fz), 0.014 * s, M.shirt).flag(PF.SHADE_ONLY).tone(-0.2);
        stroke(f, f.at(sp0, -0.15 * b, 0.2, fz), f.at(sp0, -0.1 * b, 0.13, fz), M.shirt, s, -0.5);
        stroke(f, f.at(sp0, -0.15 * b, 0.2, fz), f.at(sp0, -0.17 * b, 0.12, fz), M.shirt, s, -0.5);
      }
      // The gown's hem band.
      f.decal(f.at(r.hips, -0.21 * b, -0.235, 0), f.at(r.hips, 0.21 * b, -0.235, 0), 0.012 * s, 0.012 * s, M.shirt).flag(SH).tone(-0.2);
    } else if (back) {
      // From behind the gown gapes: a strip of bare back, three ties across it.
      f.triDecal(f.at(sp0, -0.035, 0.45, bz), f.at(sp0, 0.035, 0.45, bz), f.at(sp0, 0.0, 0.0, bz), M.skin);
      f.triDecal(f.at(r.hips, -0.02, 0.06, bz), f.at(r.hips, 0.02, 0.06, bz), f.at(r.hips, 0.0, -0.26, bz), M.skin);
      for (let i = 0; i < 3; i++) {
        const y = 0.4 - i * 0.14;
        f.decal(f.at(sp0, -0.05, y, bz), f.at(sp0, 0.05, y - 0.012, bz), 0.006 * s, 0.006 * s, C.white).flag(D).min(0.5);
      }
    }
  } else if (o === 'soldier') {
    // Tactical vest: wraps the trunk; magazine pouches in front, a drag handle and a pack panel behind.
    if (M.vest) {
      f.decal(f.at(sp0, 0, 0.455, 0), f.at(sp0, 0, 0.14, 0), 0.24 * b * s, 0.24 * b * s, M.vest).flag(D | CUT);
      if (seen) {
        f.triDecal(f.at(sp0, -0.06, 0.462, fz), f.at(sp0, 0.06, 0.462, fz), f.at(sp0, 0, 0.39, fz), M.shirt);
        for (let i = -1; i <= 1; i++) {
          rect(f, f.at(sp0, i * 0.075 * b, 0.25, fz + 0.02), f.at(sp0, i * 0.075 * b, 0.165, fz + 0.02), 0.03 * s, M.vest).tone(i === 0 ? 0.2 : -0.2);
          if (lod > 0) stroke(f, f.at(sp0, (i * 0.075 - 0.028) * b, 0.225, fz + 0.02), f.at(sp0, (i * 0.075 + 0.028) * b, 0.225, fz + 0.02), M.vest, s, -0.5);
        }
        // Shoulder straps and a chest strap.
        for (let sd = 1; sd >= -1; sd -= 2) rect(f, f.at(sp0, sd * 0.1 * b, 0.46, fz), f.at(sp0, sd * 0.1 * b, 0.3, fz), 0.016 * s, M.vest).flag(PF.SHADE_ONLY).tone(-0.2);
        stroke(f, f.at(sp0, -0.16 * b, 0.3, fz), f.at(sp0, 0.16 * b, 0.3, fz), M.vest, s, -0.5);
        // Dog tags on a ball chain.
        if (lod > 0) {
          f.decal(f.at(sp0, -0.03, 0.455, fz), f.at(sp0, 0.012, 0.36, fz), 0.004 * s, 0.004 * s, M.steel).flag(D | PF.NO_OUTLINE).min(0.5);
          dot(f, f.at(sp0, 0.014, 0.345, fz), 0.011 * s, M.steel);
        }
      } else if (back) {
        rect(f, f.at(sp0, 0, 0.4, bz), f.at(sp0, 0, 0.2, bz), 0.085 * b * s, M.vest).tone(-0.2);
        rect(f, f.at(sp0, -0.03, 0.435, bz), f.at(sp0, 0.03, 0.435, bz), 0.011 * s, C.dark);
        if (lod > 0) {
          stroke(f, f.at(sp0, -0.085 * b, 0.3, bz), f.at(sp0, 0.085 * b, 0.3, bz), M.vest, s, -0.5);
          for (let sd = 1; sd >= -1; sd -= 2) rect(f, f.at(sp0, sd * 0.12 * b, 0.46, bz), f.at(sp0, sd * 0.12 * b, 0.2, bz), 0.012 * s, M.vest).flag(PF.SHADE_ONLY).tone(-0.5);
        }
      }
    }
  } else if (o === 'biker') {
    if (seen) {
      // Leather jacket open over a tee: wide lapels, a zip's teeth, studs.
      if (M.inner) f.triDecal(f.at(sp0, -0.075, 0.46, fz), f.at(sp0, 0.075, 0.46, fz), f.at(sp0, 0, 0.0, fz), M.inner);
      for (let sd = 1; sd >= -1; sd -= 2) {
        f.triDecal(f.at(sp0, sd * 0.08, 0.465, fz), f.at(sp0, sd * 0.15 * b, 0.36, fz), f.at(sp0, sd * 0.04, 0.26, fz), M.shirt).tone(sd > 0 ? 0 : 0.2);
        f.decal(f.at(sp0, sd * 0.04, 0.26, fz), f.at(sp0, sd * 0.012, 0.0, fz), 0.005 * s, 0.005 * s, M.steel).flag(D | PF.NO_OUTLINE).min(0.5);
        if (lod > 0) dot(f, f.at(sp0, sd * 0.125 * b, 0.375, fz), 0.007 * s, M.steel);
      }
      // A skull print on the tee.
      if (M.inner && lod > 0) {
        dot(f, f.at(sp0, 0, 0.2, fz), 0.022 * s, C.dark);
        dot(f, f.at(sp0, -0.009, 0.205, fz), 0.006 * s, C.white);
        dot(f, f.at(sp0, 0.009, 0.205, fz), 0.006 * s, C.white);
      }
    } else if (back) {
      // The club's back patch: a top rocker, a centre emblem, a bottom rocker.
      rect(f, f.at(sp0, -0.085 * b, 0.4, bz), f.at(sp0, 0.085 * b, 0.4, bz), 0.016 * s, C.white);
      f.triDecal(f.at(sp0, -0.055 * b, 0.36, bz), f.at(sp0, 0.055 * b, 0.36, bz), f.at(sp0, 0, 0.23, bz), C.red);
      if (lod > 0) {
        dot(f, f.at(sp0, 0, 0.32, bz), 0.016 * s, C.white);
        rect(f, f.at(sp0, -0.07 * b, 0.19, bz), f.at(sp0, 0.07 * b, 0.19, bz), 0.012 * s, C.white);
      }
    }
    // A wallet chain swinging at the hip.
    if (lod > 0) f.decal(f.at(r.hips, -0.15 * b, 0.03, 0.09), f.at(r.hips, -0.06 * b, -0.06, 0.11), 0.005 * s, 0.005 * s, M.steel).flag(D | PF.NO_OUTLINE).min(0.5);
  } else if (!plain) {
    // Casual tee / top: a ribbed crew neck, a small chest print, a hem band; from behind a neck tag and a back print.
    if (seen) {
      if (L.sleeves !== 'long') {
        f.triDecal(f.at(sp0, -0.058, 0.464, fz), f.at(sp0, 0.058, 0.464, fz), f.at(sp0, 0, 0.405, fz), M.skin);
        for (let sd = 1; sd >= -1; sd -= 2) stroke(f, f.at(sp0, sd * 0.066, 0.464, fz), f.at(sp0, sd * 0.004, 0.398, fz), M.shirt, s, -0.5);
      } else if (M.inner) f.triDecal(f.at(sp0, -0.05, 0.462, fz), f.at(sp0, 0.05, 0.462, fz), f.at(sp0, 0, 0.39, fz), M.inner);
      // The print: one of three (a ringed disc, a slanted bar pair, a block), in the shirt's own ramp.
      const pk = Math.floor(hash(L.seed * 7.3) * 3);
      const px = 0.0;
      if (pk === 0) {
        dot(f, f.at(sp0, px, 0.3, fz), 0.04 * s, M.shirt).flag(PF.SHADE_ONLY).tone(0.5);
        if (lod > 0) dot(f, f.at(sp0, px, 0.3, fz), 0.02 * s, M.shirt).flag(PF.SHADE_ONLY).tone(-0.5);
      } else if (pk === 1) {
        f.decal(f.at(sp0, -0.07 * b, 0.33, fz), f.at(sp0, 0.07 * b, 0.3, fz), 0.012 * s, 0.012 * s, M.shirt).flag(SH).tone(0.5);
        f.decal(f.at(sp0, -0.07 * b, 0.29, fz), f.at(sp0, 0.07 * b, 0.26, fz), 0.007 * s, 0.007 * s, M.shirt).flag(SH).tone(0.5).min(0.5);
      } else {
        rect(f, f.at(sp0, -0.05 * b, 0.31, fz), f.at(sp0, 0.05 * b, 0.31, fz), 0.03 * s, M.shirt).flag(PF.SHADE_ONLY).tone(-0.5);
        if (lod > 0) f.decal(f.at(sp0, -0.03 * b, 0.31, fz), f.at(sp0, 0.03 * b, 0.31, fz), 0.006 * s, 0.006 * s, M.shirt).flag(SH).tone(0.5).min(0.5);
      }
    } else if (back) {
      rect(f, f.at(sp0, -0.012, 0.452, bz), f.at(sp0, 0.012, 0.452, bz), 0.012 * s, C.white);
      if (lod > 0) {
        f.decal(f.at(sp0, -0.06 * b, 0.33, bz), f.at(sp0, 0.06 * b, 0.33, bz), 0.012 * s, 0.012 * s, M.shirt).flag(SH).tone(0.5);
        stroke(f, f.at(sp0, -0.04 * b, 0.29, bz), f.at(sp0, 0.04 * b, 0.29, bz), M.shirt, s, 0.5);
      }
    }
  }
  // Belt across the hips, a squared buckle; a wallet in the back pocket.
  if (M.belt) {
    f.decal(f.at(r.hips, -0.19 * b, 0.05, 0.06), f.at(r.hips, 0.19 * b, 0.05, 0.06), 0.022 * s, 0.022 * s, M.belt).flag(D);
    if (seen) rect(f, f.at(r.hips, -0.02, 0.05, 0.11), f.at(r.hips, 0.02, 0.05, 0.11), 0.02 * s, C.gold);
  }
  const sb = Math.sqrt(b);
  if (!L.bareLegs && o !== 'patient' && !(L.dead && o === 'doctor')) {
    if (seen) {
      // Trouser front: pocket slits and the fly.
      for (let sd = 1; sd >= -1; sd -= 2) stroke(f, f.at(r.hips, sd * 0.095 * b, 0.025, 0.1 * sb), f.at(r.hips, sd * 0.15 * b, -0.055, 0.09 * sb), M.pants, s, -0.2);
      if (lod > 0) stroke(f, f.at(r.hips, 0.008, 0.02, 0.105 * sb), f.at(r.hips, 0.012, -0.085, 0.1 * sb), M.pants, s, -0.2);
    } else if (back) {
      // Back pockets (one with a wallet's corner), the seat seam.
      for (let sd = 1; sd >= -1; sd -= 2) rect(f, f.at(r.hips, sd * 0.085 * b, -0.02, -0.1 * sb), f.at(r.hips, sd * 0.085 * b, -0.085, -0.1 * sb), 0.04 * s, M.pants).flag(PF.SHADE_ONLY).tone(-0.2);
      if (lod > 0) {
        stroke(f, f.at(r.hips, 0, 0.03, -0.105 * sb), f.at(r.hips, 0, -0.1, -0.1 * sb), M.pants, s, -0.5);
        dot(f, f.at(r.hips, 0.085 * b, -0.02, -0.1 * sb), 0.012 * s, M.pouch);
      }
    }
  }
}

/**
 * Zombie gore on the trunk: three or four designed shapes, placed BESIDE the costume's
 * reads (never over the tie or the badge): a stain with a rim and a run, a wound with a
 * wet centre, a rip showing rotten skin.
 */
function torsoGore(f: PixelFigure, r: HumanoidRig, L: HumanLook, M: Mats, front: number, fz: number, b: number, s: number, lod: number, bare: boolean) {
  const sp0 = r.spine;
  const sd = L.seed;
  if (front > -0.15) {
    // The side the big wound sits on; the stain and the rip go to the other.
    const ws = L.ribs !== 0 ? L.ribs : L.bellyWound !== 0 ? Math.sign(L.bellyWound) : L.bite !== 0 ? L.bite : hash(sd * 3.9) < 0.5 ? -1 : 1;
    if (L.ribs !== 0) {
      // The chest torn open: a dark gash, wet meat, three ribs of uneven length across it.
      const rx = L.ribs * 0.1 * b;
      wound(f, sp0, rx, 0.3, fz, 0.012, 0.055, 0.05, M, s, lod);
      for (let i = 0; i < 3; i++) {
        const y = 0.345 - i * 0.045;
        const w = 0.028 + 0.016 * hash(sd + i * 2.7);
        f.decal(f.at(sp0, rx - w, y + 0.008, fz), f.at(sp0, rx + w * 0.8, y - 0.006, fz), 0.007 * s, 0.006 * s, M.bone).flag(D).min(0.5);
      }
    } else if (L.bellyWound !== 0) wound(f, sp0, ws * 0.085 * b, 0.13, fz, 0.035, 0.014, 0.034, M, s, lod);
    else if (L.bite !== 0) wound(f, sp0, ws * 0.1 * b, 0.07, fz, 0.012, 0.008, 0.034, M, s, lod);
    // Blood from the mouth: a bib beside the tie that narrows into a creeping run.
    if (L.chestBlood) {
      const run = (f.time * 0.05 + sd * 0.37) % 0.1;
      stain(f, sp0, -ws * 0.055 * b, 0.4, fz, 0.036, 0.034, M, s, sd * 1.1, 0.05 + run, lod);
    }
    if (!bare && L.ribs === 0) {
      // A rip showing rotten skin, a dark slit in it.
      const hx = -ws * (0.06 + 0.06 * hash(sd * 1.7)) * b;
      const hy = 0.17 + hash(sd * 2.3) * 0.1;
      f.triDecal(f.at(sp0, hx - 0.03, hy + 0.03, fz), f.at(sp0, hx + 0.035, hy + 0.012, fz), f.at(sp0, hx + 0.005, hy - 0.05, fz), M.skin);
      if (lod > 0) stroke(f, f.at(sp0, hx - 0.005, hy + 0.015, fz), f.at(sp0, hx + 0.006, hy - 0.025, fz), M.skin, s, -0.5);
    }
    // One stain soaked into the cloth low on the wound's side.
    if (L.bellyWound === 0 && L.bite === 0) stain(f, sp0, ws * (0.08 + 0.03 * hash(sd * 4.7)) * b, 0.16, fz, 0.036, 0.036, M, s, sd * 6.1, lod > 0 ? 0.045 : 0, lod);
  } else if (front < -0.2) {
    // From behind: a stain across one shoulder blade with a long run, a torn hole lower down.
    const bx = (hash(sd * 3.9) < 0.5 ? 1 : -1) * 0.085 * b;
    stain(f, sp0, bx, 0.33, -fz, 0.04, 0.036, M, s, sd * 7.3, 0.08, lod);
    if (!bare) {
      const hx = -bx * 1.1;
      f.triDecal(f.at(sp0, hx - 0.03, 0.2, -fz), f.at(sp0, hx + 0.035, 0.185, -fz), f.at(sp0, hx, 0.12, -fz), M.skin);
      if (lod > 0) stroke(f, f.at(sp0, hx - 0.004, 0.19, -fz), f.at(sp0, hx + 0.004, 0.145, -fz), M.skin, s, -0.5);
    }
  }
}

/** Head, hair and face in every view. `h` is the head joint, possibly tilted (head loll). */
function headCel(f: PixelFigure, h: THREE.Object3D, L: HumanLook, M: Mats, st: HumanPose, s: number, lod: number) {
  // (A little big — classic sprite chunkiness; the head box still holds its centre.)
  const hs = L.headSize * 1.05;
  const hc = f.at(h, 0, 0.14 * hs, 0);
  // 1 = facing us, 0 = profile, −1 = from behind; `near` = which side of the head is toward us.
  const face = f.facing(hc, f.dir(h, 0, 0, 1));
  const near = f.facing(hc, f.dir(h, 1, 0, 0)) >= 0 ? 1 : -1;
  const profile = Math.abs(face) < 0.5;
  const sd = L.seed;
  if (L.hair !== null && L.longHair) {
    // Long hair: a curtain behind the head and shoulders, its end cut into points.
    f.layer(0.012 * s, PART.NONE);
    const sway = Math.sin(st.time * 3.1 + sd) * 0.015;
    f.cone(f.at(h, 0, 0.2 * hs, -0.06 * hs), f.at(h, sway, -0.03, -0.1 * hs), 0.108 * hs * s, 0.1 * s, M.hair).flag(PF.CUT_B).z(0.05);
    for (let i = -1; i <= 1; i++) f.tri(f.at(h, i * 0.07 - 0.04 + sway, -0.02, -0.1 * hs), f.at(h, i * 0.07 + 0.04 + sway, -0.02, -0.1 * hs), f.at(h, i * 0.075 + sway * 1.6, -0.09 - 0.02 * hash(sd + i), -0.1 * hs), M.hair);
    if (lod > 0 && face < 0.3) {
      // Lock lines down the curtain.
      for (let i = -1; i <= 1; i += 2) f.decal(f.at(h, i * 0.045, 0.1 * hs, -0.17 * hs), f.at(h, i * 0.05 + sway, -0.04, -0.17 * hs), 0.005 * s, 0.005 * s, M.hair).flag(SH).tone(-0.2).min(0.5);
    }
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
  // The profile's contour: a brow ridge on the dead, the nose, the ears.
  if (L.dead) f.cone(f.at(h, 0, 0.182 * hs, 0.098 * hs), f.at(h, 0, 0.172 * hs, 0.122 * hs), 0.022 * hs * s, 0.016 * hs * s, M.face).k(0.006 * s);
  f.cone(f.at(h, 0, 0.145 * hs, 0.118 * hs), f.at(h, 0, 0.106 * hs, 0.148 * hs), 0.016 * hs * s, 0.021 * hs * s, M.face).k(0.006 * s);
  for (let side = 1; side >= -1; side -= 2) f.cone(f.at(h, side * 0.11 * hs, 0.158 * hs, -0.012), f.at(h, side * 0.118 * hs, 0.126 * hs, -0.018), 0.023 * hs * s, 0.018 * hs * s, M.face).k(0.005 * s);
  const headTx = tx(f, f.at(h, 0, 0.13 * hs, 0), 0.26 * hs * s);
  const crownHat = L.hat !== null && L.outfit !== 'nurse' && L.outfit !== 'patient';
  // ── Hair: a designed shape that reads from every side ──
  if (L.hair !== null) {
    const top = crownHat ? 0.17 : 0.2;
    f.ellipsoid(h, 0, top * hs, -0.022 * hs, 0.126 * hs, 0.09 * hs, 0.134 * hs, M.hair).z(-0.03).k(0.006 * s);
    if (crownHat) f.ellipsoid(h, 0, 0.125 * hs, -0.062 * hs, 0.112 * hs, 0.075 * hs, 0.07 * hs, M.hair).z(-0.01).k(0.006 * s);
    else f.ellipsoid(h, 0, 0.14 * hs, -0.06 * hs, 0.118 * hs, 0.105 * hs, 0.075 * hs, M.hair).z(-0.01).k(0.006 * s);
    if (L.bun) f.ball(f.at(h, 0, 0.2 * hs, -0.14 * hs), 0.05 * hs * s, M.hair).part(L.dead ? PART.NONE : PART.HEAD).k(0.008 * s);
    const fzh = 0.112 * hs;
    const rnd = 0.007 * hs * s;
    if (!crownHat) {
      if (L.dead && L.longHair) {
        // Long hair on the dead: lank curtains parted in the middle, hanging over the brow.
        f.triDecal(f.at(h, -0.11 * hs, 0.25 * hs, fzh), f.at(h, 0.0, 0.25 * hs, fzh), f.at(h, -0.105 * hs, (0.14 - 0.03 * hash(sd)) * hs, fzh), M.hair);
        f.triDecal(f.at(h, 0.012 * hs, 0.25 * hs, fzh), f.at(h, 0.11 * hs, 0.25 * hs, fzh), f.at(h, 0.105 * hs, (0.15 - 0.03 * hash(sd * 1.7)) * hs, fzh), M.hair);
      } else if (L.dead) {
        // Matted tufts standing off the crown, each zombie its own: they lean one way, one
        // is long, one is a stub (their bases cross the skull, so they keep their width in
        // profile too). Small figures keep the cap's plain shape.
        const lean = hash(sd * 0.53) < 0.5 ? -1 : 1;
        const tuft = Math.floor(hash(sd * 7.7) * 4);
        for (let i = lod > 0 ? 0 : 4; i < 4; i++) {
          const a = lean * (0.25 + 0.75 * hash(sd * 3.3 + i * 1.9));
          const x = (-0.085 + i * 0.057) * hs;
          const len = (i === tuft ? 0.1 : 0.03 + 0.04 * hash(sd * 1.1 + i)) * hs;
          const z = (-0.02 + (i % 2 ? 0.05 : -0.045)) * hs;
          const dz = (i % 2 ? -1 : 1) * 0.032 * hs;
          f.tri(f.at(h, x - 0.03 * hs, 0.255 * hs, z - dz), f.at(h, x + 0.03 * hs, 0.262 * hs, z + dz), f.at(h, x + a * len * 0.7, 0.27 * hs + len, z + a * len * 0.4), M.hair, rnd).part(PART.NONE);
        }
        // A ragged fringe: two uneven locks down the forehead.
        f.triDecal(f.at(h, -0.1 * hs, 0.24 * hs, fzh), f.at(h, -0.02 * hs, 0.24 * hs, fzh), f.at(h, -0.075 * hs, (0.185 - 0.02 * hash(sd)) * hs, fzh), M.hair);
        f.triDecal(f.at(h, 0.01 * hs, 0.24 * hs, fzh), f.at(h, 0.095 * hs, 0.24 * hs, fzh), f.at(h, 0.07 * hs, (0.19 - 0.025 * hash(sd * 1.7)) * hs, fzh), M.hair);
      } else {
        // The living: a parted fringe swept to one side, a pointed forelock.
        const sw = hash(sd * 0.71) < 0.5 ? 1 : -1;
        f.triDecal(f.at(h, -sw * 0.105 * hs, 0.245 * hs, fzh), f.at(h, sw * 0.06 * hs, 0.25 * hs, fzh), f.at(h, -sw * 0.098 * hs, 0.17 * hs, fzh), M.hair);
        f.triDecal(f.at(h, sw * 0.02 * hs, 0.25 * hs, fzh), f.at(h, sw * 0.108 * hs, 0.24 * hs, fzh), f.at(h, sw * 0.1 * hs, 0.185 * hs, fzh), M.hair);
        f.tri(f.at(h, -sw * 0.02 * hs, 0.268 * hs, 0.05 * hs), f.at(h, sw * 0.07 * hs, 0.262 * hs, -0.01 * hs), f.at(h, sw * 0.045 * hs, 0.31 * hs, 0.03 * hs), M.hair, rnd).part(PART.NONE);
      }
    }
    // Sideburns frame the face (front); a temple lock runs down in front of the ear (profile).
    if (face > 0.45) {
      for (let side = 1; side >= -1; side -= 2) f.triDecal(f.at(h, side * 0.112 * hs, 0.2 * hs, 0.07 * hs), f.at(h, side * 0.084 * hs, 0.2 * hs, 0.095 * hs), f.at(h, side * 0.1 * hs, (L.dead ? 0.13 : 0.15) * hs, 0.085 * hs), M.hair);
    } else if (face > -0.4) f.triDecal(f.at(h, near * 0.116 * hs, 0.21 * hs, 0.035 * hs), f.at(h, near * 0.116 * hs, 0.21 * hs, -0.03 * hs), f.at(h, near * 0.114 * hs, (L.dead ? 0.125 : 0.14) * hs, 0.012 * hs), M.hair);
    // The nape: the hair ends in a point on the neck (profile and back).
    if (face < 0.6 && !L.longHair) f.tri(f.at(h, -0.075 * hs, 0.085 * hs, -0.1 * hs), f.at(h, 0.075 * hs, 0.085 * hs, -0.1 * hs), f.at(h, 0.01 * hs, 0.02 * hs, -0.085 * hs), M.hair, rnd).part(PART.NONE);
    if (lod > 0) {
      // Tone shapes: the hair's side away from the light a step down, a jagged shine on the lit side.
      seg(f, f.at(h, 0, 0.12 * hs, -0.03 * hs), f.at(h, 0, 0.28 * hs, -0.03 * hs));
      const hr = 0.125 * hs * s;
      shape(f, -0.4, hr * 0.45, 1.2, hr * 0.3, 1.2, hr * 1.4, -1, M.hair);
      shape(f, -0.4, hr * 0.45, 1.2, hr * 1.4, -0.4, hr * 1.4, -1, M.hair);
      if (!crownHat) {
        shape(f, 0.62, -hr * 0.85, 0.82, -hr * 0.2, 0.56, -hr * 0.35, 0.2, M.hair);
        shape(f, 0.56, -hr * 0.35, 0.8, hr * 0.12, 0.6, hr * 0.02, 0.2, M.hair);
      }
      if (face < -0.3 && !L.longHair) {
        // From behind: two lock lines falling to the nape.
        for (let i = -1; i <= 1; i += 2) f.decal(f.at(h, i * 0.045 * hs, 0.22 * hs, -0.125 * hs), f.at(h, i * 0.025 * hs, 0.08 * hs, -0.11 * hs), 0.005 * s, 0.005 * s, M.hair).flag(SH).tone(-0.2).min(0.5);
      }
    }
  } else if (lod > 0 && face < 0.3) {
    // A bald head from behind / the side: the skull's crease above the neck, a fold of the nape.
    stroke(f, f.at(h, -0.07 * hs, 0.1 * hs, -0.1 * hs), f.at(h, 0.07 * hs, 0.1 * hs, -0.1 * hs), M.face, s, -0.2);
    if (L.dead) rot(f, h, 0.03 * hs, 0.2 * hs, -0.11 * hs, 0.04 * hs, 0.035 * hs, M.face, s, sd * 1.3);
  }
  if (M.beard && face > -0.2) {
    // A squared beard with a pointed chin tuft.
    f.triDecal(f.at(h, -0.085 * hs, 0.105 * hs, 0.09 * hs), f.at(h, 0.085 * hs, 0.105 * hs, 0.09 * hs), f.at(h, 0, -0.005 * hs, 0.1 * hs), M.beard);
    f.decal(f.at(h, -0.07 * hs, 0.085 * hs, 0.1 * hs), f.at(h, 0.07 * hs, 0.085 * hs, 0.1 * hs), 0.03 * hs * s, 0.03 * hs * s, M.beard);
  }
  // Face tone shapes: the cheek and jaw away from the light (never a half-face mask).
  if (lod > 0 && face > -0.3) {
    seg(f, f.at(h, 0, 0.02 * hs, 0.02 * hs), f.at(h, 0, 0.2 * hs, 0.02 * hs));
    const fr = 0.11 * hs * s;
    shape(f, 0.95, fr * 0.82, 0.95, fr * 1.4, -0.2, fr * 1.4, -1, M.face);
    shape(f, 0.95, fr * 0.82, -0.2, fr * 1.4, -0.2, fr * 0.25, -1, M.face);
  }
  const ey = 0.148 * hs;
  const ez = 0.114 * hs;
  const eyeC = f.at(h, 0, ey, ez);
  // One texel per stamp cell (pixel art is never resampled).
  const cellM = f.kHint / f.pxPerM(eyeC);
  const size = celSize(headTx);
  if (profile) {
    // ── Profile: ONE eye set back on the cheek, a brow, the mouth as a notch in the face's
    // edge, the ear mid-skull. (The stamps are the front ones, turned to the nose.)
    const nose = f.project(f.at(h, 0, 0.12 * hs, 0.14 * hs), P0).x;
    const eye = f.at(h, near * 0.1 * hs, ey, 0.062 * hs);
    const mirror = nose < f.project(eye, P1).x;
    if (headTx >= 6.5) {
      if (L.dead) f.stamp(eye, cellM, CEL_STAMP.zeye[Math.min(size, 2)], M.eyeGlow, 0, 0, 0, mirror);
      else f.stamp(eye, cellM, liveEye(st.face)[Math.min(size, 2)], 0, M.eyeWhite, M.pupil, L.hair !== null ? M.hair : M.pupil, mirror);
    } else if (L.dead) f.decal(eye, eye, 0.009 * hs * s, 0.009 * hs * s, M.eyeGlow).flag(D | PF.GLOW).min(0.5);
    else f.decal(eye, eye, 0.012 * hs * s, 0.012 * hs * s, M.pupil).flag(D).min(0.5);
    // The mouth: a dark wedge opening at the lips, teeth along its top (the dead), a drip.
    const open = st.face === 'calm' || st.face === 'relief' || st.face === 'strain' ? 0.12 : Math.max(jaw, L.mouthOpen ? 0.3 : 0.12);
    const my = 0.074 * hs;
    const mx = near * 0.085 * hs;
    f.triDecal(f.at(h, mx, my, 0.135 * hs), f.at(h, mx, my - (0.012 + open * 0.05) * hs, 0.125 * hs), f.at(h, mx, my - 0.004 * hs, (0.07 - open * 0.02) * hs), M.mouth);
    if (L.dead && headTx >= 9) f.decal(f.at(h, mx, my + 0.002 * hs, 0.128 * hs), f.at(h, mx, my, 0.092 * hs), 0.006 * hs * s, 0.006 * hs * s, M.teeth).flag(D | PF.NO_OUTLINE).min(0.5);
    if (lod > 0) {
      // The ear: a drawn C mid-skull; the jaw's line running back from the chin.
      const ex = near * 0.118 * hs;
      stroke(f, f.at(h, ex, 0.168 * hs, -0.002), f.at(h, ex, 0.132 * hs, -0.022 * hs), M.face, s, -0.2);
      stroke(f, f.at(h, mx, 0.045 * hs, 0.06 * hs), f.at(h, near * 0.1 * hs, 0.085 * hs, -0.02 * hs), M.face, s, -0.2);
      if (L.dead && size >= 2) stroke(f, f.at(h, near * 0.095 * hs, 0.118 * hs, 0.07 * hs), f.at(h, near * 0.1 * hs, 0.082 * hs, 0.05 * hs), M.face, s, -0.2);
    }
    if (L.dead && (L.drool || jaw > 0.4)) {
      const dy = Math.min(0.03, (st.time * 0.07 + sd) % 0.04);
      f.decal(f.at(h, mx, my - 0.02 * hs, 0.11 * hs), f.at(h, mx, my - 0.05 * hs - dy, 0.105 * hs), 0.008 * hs * s, 0.006 * hs * s, M.blood).flag(D | PF.NO_OUTLINE).min(0.5);
    }
    if (L.dead && lod > 0) rot(f, h, near * 0.112 * hs, 0.2 * hs, 0.02 * hs, 0.03 * hs, 0.03 * hs, M.face, s, sd * 2.9);
  } else if (face > 0) {
    // ── Front and three-quarter: hand-pixelled stamps, placed where the rig's eyes and lips are ──
    const nx = f.project(f.at(h, 0, 0.12 * hs, 0.14 * hs), P0).x;
    if (headTx >= 6.5) {
      for (let side = 1; side >= -1; side -= 2) {
        const eye = f.at(h, side * 0.05 * hs, ey, ez);
        // The far eye of a three-quarter face is dropped before it can slide off the cheek.
        if (f.facing(eye, f.dir(h, side * 0.55, 0, 1)) < 0.34) continue;
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
          f.decal(f.at(h, side * 0.092 * hs, ey + 0.04 * hs, ez * 0.92), f.at(h, side * 0.02 * hs, ey + 0.02 * hs, ez), 0.007 * hs * s, 0.007 * hs * s, M.face).flag(SH).tone(-0.5).min(0.5);
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
      if (L.faceWound !== 0) wound(f, h, L.faceWound * 0.075 * hs, 0.1 * hs, 0.1 * hs, 0.008 * hs, 0.022 * hs, 0.022 * hs, M, s, lod);
      // Rot: one edged patch on the brow or the cheek.
      else if (L.dead && size >= 1) {
        const rs = hash(sd * 6.3) < 0.5 ? 1 : -1;
        rot(f, h, rs * 0.072 * hs, (hash(sd * 8.1) < 0.5 ? 0.215 : 0.1) * hs, 0.1 * hs, 0.03 * hs, 0.024 * hs, M.face, s, sd * 2.9);
      }
    } else if (L.dead) {
      // Far away: two glowing pins (the resolve pass rings them dark), a dark mouth.
      for (let side = 1; side >= -1; side -= 2) {
        const eye = f.at(h, side * 0.05 * hs, ey, ez);
        f.decal(eye, eye, 0.009 * hs * s, 0.009 * hs * s, M.eyeGlow).flag(D | PF.GLOW).min(0.5);
      }
      const mo = f.at(h, 0, 0.06 * hs, 0.118 * hs);
      f.decal(mo, mo, 0.014 * hs * s, 0.014 * hs * s, M.mouth).flag(D | PF.NO_OUTLINE).min(0.5);
    } else {
      // Far away, the living: two dark eyes and a mouth — never a bright pixel.
      for (let side = 1; side >= -1; side -= 2) {
        const eye = f.at(h, side * 0.05 * hs, ey, ez);
        f.decal(eye, eye, 0.012 * hs * s, 0.012 * hs * s, M.pupil).flag(D | PF.NO_OUTLINE).min(0.5);
      }
    }
  }
  if (M.hat) {
    f.layer(0.006 * s, PART.HEAD);
    if (L.outfit === 'cop') {
      // A peaked cap: the band, a wide flat crown, a dark visor.
      f.cone(f.at(h, 0, 0.21 * hs, -0.004), f.at(h, 0, 0.25 * hs, -0.004), 0.124 * hs * s, 0.128 * hs * s, M.hat).flag(CUT).k(0.003 * s);
      f.ellipsoid(h, 0, 0.266 * hs, 0.004 * hs, 0.142 * hs, 0.03 * hs, 0.146 * hs, M.hat).k(0.004 * s);
      f.tri(f.at(h, -0.09 * hs, 0.214 * hs, 0.1 * hs), f.at(h, 0.09 * hs, 0.214 * hs, 0.1 * hs), f.at(h, 0, 0.198 * hs, 0.19 * hs), M.hatTrim, 0.008 * hs * s);
      f.decal(f.at(h, -0.13 * hs, 0.217 * hs, 0), f.at(h, 0.13 * hs, 0.217 * hs, 0), 0.01 * hs * s, 0.01 * hs * s, M.hatTrim).flag(D).min(0.5);
    } else paintHat(f, h, L, M, s, hs);
    if (lod > 0) {
      // A light shape on the crown's lit side; costume marks: a cap badge, a helmet's band and strap.
      seg(f, f.at(h, 0, 0.2 * hs, 0), f.at(h, 0, 0.3 * hs, 0));
      const hr = 0.12 * hs * s;
      shape(f, 0.4, -hr * 1.2, 1.3, -hr * 0.9, 0.9, -hr * 0.1, 0.2, M.hat);
      shape(f, -0.1, hr * 0.55, 1.2, hr * 0.5, 1.2, hr * 1.4, -1, M.hat);
      shape(f, -0.1, hr * 0.55, 1.2, hr * 1.4, -0.1, hr * 1.4, -1, M.hat);
      if (L.outfit === 'cop' && face > 0.1) f.triDecal(f.at(h, -0.022 * hs, 0.262 * hs, 0.13 * hs), f.at(h, 0.022 * hs, 0.262 * hs, 0.13 * hs), f.at(h, 0, 0.226 * hs, 0.132 * hs), M.buckle);
      if (L.outfit === 'soldier') {
        f.decal(f.at(h, -0.14 * hs, 0.2 * hs, 0), f.at(h, 0.14 * hs, 0.2 * hs, 0), 0.01 * hs * s, 0.01 * hs * s, M.hat).flag(SH).tone(-0.5).min(0.5);
        if (face > -0.2) for (let side = 1; side >= -1; side -= 2) f.decal(f.at(h, side * 0.11 * hs, 0.17 * hs, 0.03 * hs), f.at(h, side * 0.07 * hs, 0.05 * hs, 0.07 * hs), 0.006 * hs * s, 0.006 * hs * s, M.frame).flag(D | PF.NO_OUTLINE).min(0.5);
      }
    }
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

const hWrist = new THREE.Vector3();

/**
 * A hand: a hand-pixelled stamp at EVERY size (claw / open / fist / thumbs-up, 8
 * directions along the forearm on screen), drawn a little big. One texel per cell
 * up to the largest stamp; beyond it the cells grow by whole texels.
 */
function handCel(f: PixelFigure, el: THREE.Object3D, side: number, L: HumanLook, M: Mats, s: number, a: number, pose: number, chest: THREE.Object3D | null) {
  hWrist.copy(f.at(el, 0, -0.248 * a, 0.004));
  // (The dead's claws a little big; the living's hands at their size — they hold them to their faces.)
  const span = 0.17 * s * (L.dead ? 1.1 : 1);
  const len = tx(f, hWrist, span);
  if (len < 3) {
    f.ball(f.at(el, 0, -0.3 * a, 0.004), 0.034 * s, M.skin).k(0.004 * s);
    return;
  }
  const e = f.project(f.at(el, 0, -0.05, 0), P0);
  const w = f.project(hWrist, P1);
  const dir = dir8(w.x - e.x, w.y - e.y);
  // Thumbs toward the body for hands pointing straight up / down.
  let mirror = false;
  if ((dir === 2 || dir === 6) && chest) mirror = f.project(f.at(chest, 0, 0, 0), P0).x < w.x;
  const one = f.kHint / f.pxPerM(hWrist);
  // The stamp nearest the hand's real length in texels: 5, 7, ~10, ~12 or ~16 cells.
  if (len < 8.8) {
    const size = len < 6 ? 0 : 1;
    f.stamp(hWrist, one, STAMP.hand[pose][size][dir], M.skin, 0, 0, 0, mirror, true);
  } else {
    const size = len < 11.6 ? 0 : len < 15.6 ? 1 : 2;
    f.stamp(hWrist, Math.max(one, span / 24), CEL_HAND[pose][size][dir], M.skin, 0, 0, 0, mirror, true);
  }
}

/**
 * One arm (current layer): a deltoid cap, the upper arm tapering into the elbow's
 * corner, a forearm that swells below it and narrows to a thin wrist, a cuff cut
 * square, the hand. `elbow` null = the forearm is gone (stump at the elbow).
 */
function armCel(f: PixelFigure, sh: THREE.Object3D, elbow: THREE.Object3D | null, side: number, L: HumanLook, M: Mats, C: CelMats, s: number, st: HumanPose, chest: THREE.Object3D | null, far: boolean, away: boolean, lod: number) {
  const a = L.armLength;
  const bare = L.sleeves === 'none';
  const upperMat = bare ? M.skin : M.sleeve;
  const shortSleeve = L.sleeves === 'short';
  const o = L.outfit;
  f.cone(f.at(sh, 0.008 * side, 0.03, 0.004), f.at(sh, 0.008 * side, -0.11 * a, 0.006), 0.064 * s, 0.053 * s, upperMat);
  f.cone(f.at(sh, 0, -0.08 * a, 0.006), f.at(sh, 0, -0.29 * a, -0.004), 0.052 * s, 0.039 * s, upperMat);
  if (shortSleeve) {
    f.mat2(M.skin, 0.36);
    // Sleeve hem: a flared band cut square (torn into a point on the dead).
    f.cone(f.at(sh, 0, -0.1 * a, 0.004), f.at(sh, 0, -0.16 * a, 0.002), 0.058 * s, 0.064 * s, M.sleeve).flag(CUT).k(0.004 * s);
    if (L.dead) f.tri(f.at(sh, -0.04, -0.15 * a, 0.02), f.at(sh, 0.03, -0.15 * a, 0.02), f.at(sh, -0.01 * side, -0.22 * a, 0.02), M.sleeve);
  }
  const shadeArm = !far && lod > 0;
  if (shadeArm) {
    // Upper arm: the shoulder's lit top; a shadow that widens into the elbow's fold (from the
    // armpit down on the arm away from the light).
    seg(f, f.at(sh, 0, 0.0, 0.004), f.at(sh, 0, -0.29 * a, 0));
    const ru = 0.05 * s;
    if (away) {
      shape(f, 0, ru * 0.25, 0, ru * 1.6, 1, ru * 1.6, -1, upperMat);
      shape(f, 0, ru * 0.25, 1, ru * 1.6, 1, -ru * 0.15, -1, upperMat);
    } else {
      shape(f, 0.3, ru * 1.6, 1, ru * 1.6, 1, ru * 0.1, -1, upperMat);
      shape(f, -0.15, -ru * 1.7, 0.42, -ru * 1.7, -0.15, -ru * 0.25, 0.2, upperMat);
    }
  }
  if (lod > 0 && (o === 'cop' || o === 'ranger') && !bare) {
    // A shoulder patch on each sleeve.
    const px = side * 0.058;
    f.triDecal(f.at(sh, px, -0.04 * a, 0.03), f.at(sh, px, -0.04 * a, -0.03), f.at(sh, px, -0.11 * a, 0), o === 'cop' ? C.gold : C.olive);
  }
  if (!elbow) {
    f.ball(f.at(sh, 0, -0.3 * a, 0), 0.052 * s, M.gore)
      .rag(0.01 * s, PF.SPIKY)
      .seed(17 + side)
      .z(-0.05);
    f.ball(f.at(sh, 0, -0.35 * a, 0), 0.018 * s, M.bone).z(-0.08);
    // Blood soaks back up the sleeve from the stump.
    f.triDecal(f.at(sh, -0.045, -0.29 * a, 0.03), f.at(sh, 0.045, -0.29 * a, 0.03), f.at(sh, 0.005, -0.15 * a, 0.035), M.blood).tone(-0.2);
    f.triDecal(f.at(sh, -0.025, -0.29 * a, 0.03), f.at(sh, 0.03, -0.29 * a, 0.03), f.at(sh, 0.005, -0.2 * a, 0.035), M.blood);
    return;
  }
  const longSleeve = L.sleeves === 'long';
  const foreMat = longSleeve ? M.sleeve : M.skin;
  // The elbow: a corner at the back of the joint; the forearm swells below it, then thins to the wrist.
  f.ball(f.at(elbow, 0, 0.0, -0.014), 0.04 * s, foreMat).k(0.01 * s);
  f.cone(f.at(elbow, 0, 0.012, 0.004), f.at(elbow, 0, -0.095 * a, 0.008), 0.043 * s, 0.05 * s, foreMat);
  if (longSleeve) {
    f.cone(f.at(elbow, 0, -0.085 * a, 0.006), f.at(elbow, 0, -0.236 * a, 0.002), 0.05 * s, 0.036 * s, foreMat).flag(PF.CUT_B);
    // Cuff: a flared band at the wrist — the shirt's own white cuff under a jacket.
    const cuff = L.jacket !== null ? M.collar : M.sleeve;
    f.cone(f.at(elbow, 0, -0.2 * a, 0.002), f.at(elbow, 0, -0.246 * a, 0.002), 0.04 * s, 0.045 * s, cuff)
      .flag(CUT)
      .k(0.003 * s)
      .tone(L.jacket !== null ? 0 : -0.2);
  } else {
    f.cone(f.at(elbow, 0, -0.085 * a, 0.006), f.at(elbow, 0, -0.242 * a, 0.0), 0.05 * s, 0.03 * s, foreMat);
  }
  const fore = f.facing(f.at(elbow, 0, -0.1, 0.05), f.dir(elbow, 0, 0, 1));
  const bend = 1 - f.dir(sh, 0, -1, 0).dot(f.dir(elbow, 0, -1, 0));
  if (shadeArm) {
    // Forearm: a shadow out of the elbow's fold, running out toward the wrist; its lit top.
    seg(f, f.at(elbow, 0, 0.01, 0.004), f.at(elbow, 0, -0.24 * a, 0));
    const rf = 0.048 * s;
    shape(f, 0, rf * 1.6, 0, away ? -rf * 0.2 : rf * 0.2, away ? 1 : 0.72, rf * 1.6, -1, foreMat);
    if (!away) shape(f, 0.12, -rf * 1.6, 0.8, -rf * 1.6, 0.12, -rf * 0.5, 0.2, foreMat);
    // A drawn crease at the inner elbow when the arm bends.
    if (bend > 0.06 && fore > 0) stroke(f, f.at(elbow, side * 0.03, 0.03, 0.05), f.at(elbow, -side * 0.02, 0.0, 0.05), foreMat, s, -0.5);
  }
  if (!L.dead || o === 'office') {
    // A wristwatch (left) / wristband.
    if (side > 0 && !longSleeve) f.decal(f.at(elbow, -0.04, -0.212 * a, 0), f.at(elbow, 0.04, -0.212 * a, 0), 0.012 * s, 0.012 * s, L.dead ? C.gold : C.red).flag(D);
    else if (side > 0 && L.jacket === null && longSleeve) f.decal(f.at(elbow, -0.04, -0.25 * a, 0), f.at(elbow, 0.04, -0.25 * a, 0), 0.01 * s, 0.01 * s, C.gold).flag(D).min(0.5);
  }
  if (o === 'patient' && side > 0) {
    // The hospital wristband, a strip of tape over a cannula.
    f.decal(f.at(elbow, -0.04, -0.215 * a, 0), f.at(elbow, 0.04, -0.215 * a, 0), 0.012 * s, 0.012 * s, C.white).flag(D);
    if (lod > 0 && fore > 0) rect(f, f.at(elbow, -0.02, -0.06 * a, 0.045), f.at(elbow, 0.02, -0.075 * a, 0.045), 0.012 * s, C.white);
  }
  if (L.dead && lod > 0) {
    if (fore > 0) {
      if (longSleeve && hash(L.seed * 6.7 + side) < 0.5) {
        // A pointed rip in the sleeve showing rotten skin.
        f.triDecal(f.at(elbow, -0.035, -0.07 * a, 0.045), f.at(elbow, 0.03, -0.09 * a, 0.045), f.at(elbow, 0.004, -0.17 * a, 0.045), M.skin);
      } else if (!longSleeve && hash(L.seed * 6.7 + side) < 0.6) rot(f, elbow, 0.0, -0.11 * a, 0.045, 0.02, 0.036 * a, M.skin, s, L.seed * 3.7 + side);
      if (L.armWound === side) wound(f, elbow, 0.0, -0.11 * a, 0.03, 0.008, 0.035 * a, 0.024, M, s, lod);
    }
    // Blood to the wrist on one hand: a soaked cuff, a smear across the knuckles.
    if (hash(L.seed * 9.1) < (side > 0 ? 0.6 : 0.4)) {
      f.decal(f.at(elbow, -0.05, -0.225 * a, 0), f.at(elbow, 0.05, -0.232 * a, 0), 0.016 * s, 0.014 * s, M.blood).flag(D).tone(-0.2);
      f.decal(f.at(elbow, -0.04, -0.3 * a, 0.004), f.at(elbow, 0.04, -0.33 * a, 0.004), 0.016 * s, 0.014 * s, M.blood).flag(D | PF.NO_OUTLINE);
    }
  }
  handCel(f, elbow, side, L, M, s, a, (side > 0 ? st.handL : st.handR) ?? st.hand ?? (L.dead ? HAND.CLAW : HAND.OPEN), chest);
}

/**
 * A leg: a thigh tapering to the knee's corner, the calf behind it, an ankle; the
 * trouser leg breaks over the shoe in a hem (torn into points on the dead). The
 * shoe is a wedge: a heel block, an arch, a toe that tapers, a sole, a toe cap.
 */
function legCel(f: PixelFigure, hip: THREE.Object3D, knee: THREE.Object3D, side: number, L: HumanLook, M: Mats, C: CelMats, s: number, far: boolean, away: boolean, lod: number) {
  const pm = M.pants;
  const bareL = L.bareLegs;
  f.cone(f.at(hip, 0, 0.035, 0.004), f.at(hip, 0, -0.43, 0.012), 0.09 * s, (bareL ? 0.058 : 0.066) * s, pm);
  // The thigh's front (side view): full above, running into the knee's corner.
  f.cone(f.at(hip, 0, -0.09, 0.022), f.at(hip, 0, -0.27, 0.022), 0.08 * s, 0.068 * s, pm).k(0.02 * s);
  f.ball(f.at(knee, 0, 0.0, 0.024), (bareL ? 0.052 : 0.059) * s, pm).k(0.01 * s);
  const torn = L.legWound === side && L.dead;
  const seenFront = f.facing(f.at(knee, 0, 0, 0.07), f.dir(knee, 0, 0, 1)) > 0;
  if (bareL) {
    // Shin, the calf muscle behind it, a slim ankle.
    f.cone(f.at(knee, 0, 0.012, 0.004), f.at(knee, 0, -0.375, 0.0), 0.054 * s, 0.033 * s, pm);
    f.cone(f.at(knee, 0, -0.05, -0.022), f.at(knee, 0, -0.21, -0.016), 0.058 * s, 0.044 * s, pm).k(0.02 * s);
  } else {
    f.cone(f.at(knee, 0, 0.016, 0.0), f.at(knee, 0, -0.2, -0.008), 0.066 * s, 0.065 * s, pm);
    // The calf fills the trouser leg behind (side view), then the leg narrows to the ankle.
    f.cone(f.at(knee, 0, -0.07, -0.022), f.at(knee, 0, -0.22, -0.016), 0.062 * s, 0.056 * s, pm).k(0.02 * s);
    f.cone(f.at(knee, 0, -0.18, -0.008), f.at(knee, 0, -0.378, 0.004), 0.065 * s, 0.054 * s, pm).flag(PF.CUT_B);
    if (torn) f.mat2(M.skin, 0.2);
    if (L.dead && !torn) {
      // Torn hem: two points hanging over the shoe.
      f.tri(f.at(knee, -0.055, -0.37, 0.02), f.at(knee, 0.0, -0.37, 0.02), f.at(knee, -0.035, -0.425, 0.03), pm);
      f.tri(f.at(knee, 0.005, -0.37, 0.02), f.at(knee, 0.058, -0.37, 0.02), f.at(knee, 0.04, -0.415, 0.03), pm);
    } else if (!L.dead) {
      // The hem breaks over the shoe: a flared turn-up.
      f.cone(f.at(knee, 0, -0.35, 0.004), f.at(knee, 0, -0.39, 0.008), 0.056 * s, 0.062 * s, pm).flag(CUT).k(0.003 * s);
    }
  }
  const o = L.outfit;
  const bend = 1 - f.dir(hip, 0, -1, 0).dot(f.dir(knee, 0, -1, 0));
  if (!far && lod > 0) {
    // Thigh: the hem's / the crotch's shadow running out toward the knee (the whole inner
    // half on the leg away from the light); the lit front plane of the leg toward the light.
    seg(f, f.at(hip, 0, 0.0, 0.004), f.at(hip, 0, -0.43, 0.012));
    const rt = 0.08 * s;
    if (away) shape(f, 0, rt * 1.7, 0, -rt * 0.15, 1, rt * 1.7, -1, pm);
    else {
      shape(f, 0, rt * 1.7, 0, rt * 0.3, 0.62, rt * 1.7, -1, pm);
      shape(f, 0.1, -rt * 1.7, 0.92, -rt * 1.7, 0.1, -rt * 0.45, 0.2, pm);
    }
    // Shin: a shadow out of the knee's fold, running out toward the ankle.
    seg(f, f.at(knee, 0, 0.0, 0), f.at(knee, 0, -0.38, 0));
    const rs = 0.062 * s;
    shape(f, 0.03, rs * 1.7, 0.03, away ? -rs * 0.1 : rs * 0.3, away ? 1 : 0.7, rs * 1.7, -1, pm);
  }
  if (!bareL && seenFront && !far) {
    // Work trousers: a patch sewn on ONE knee. Otherwise a crease across a bent knee.
    if ((o === 'worker' || o === 'flannel') && (hash(L.seed * 1.9) < 0.5 ? 1 : -1) === side) {
      rect(f, f.at(knee, 0, 0.04, 0.066), f.at(knee, 0, -0.06, 0.066), 0.04 * s, pm).flag(PF.SHADE_ONLY).tone(-0.2);
      if (lod > 1) stroke(f, f.at(knee, -0.03, 0.02, 0.066), f.at(knee, 0.03, 0.02, 0.066), pm, s, 0.2);
    } else if (bend > 0.03 && lod > 0) stroke(f, f.at(knee, -0.04, -0.03, 0.066), f.at(knee, 0.035, -0.045, 0.066), pm, s, -0.5);
    // The trouser's break over the shoe: one drawn fold.
    if (lod > 1 && !L.dead) stroke(f, f.at(knee, -0.045, -0.31, 0.06), f.at(knee, 0.03, -0.335, 0.06), pm, s, -0.2);
    if (o === 'soldier' && lod > 0) rect(f, f.at(hip, side * 0.07, -0.16, 0.05), f.at(hip, side * 0.07, -0.26, 0.05), 0.04 * s, pm).flag(PF.SHADE_ONLY).tone(-0.2);
  }
  if (L.dead && seenFront && !far) {
    if (torn) wound(f, knee, 0.0, -0.2, 0.06, 0.008, 0.04, 0.028, M, s, lod);
    if (lod > 0) {
      if (bareL) rot(f, hip, side * 0.01, -0.2 - 0.1 * hash(L.seed * 4.3 + side), 0.08, 0.028, 0.045, M.skin, s, L.seed * 1.9 + side);
      else if (hash(L.seed * 4.3 + side) < 0.5) {
        // A rip on the thigh showing skin; on the other leg, a stain run down from the knee.
        f.triDecal(f.at(hip, -0.03, -0.17, 0.08), f.at(hip, 0.035, -0.19, 0.085), f.at(hip, 0.0, -0.285, 0.085), M.skin);
      } else stain(f, knee, side * 0.01, -0.08, 0.066, 0.028, 0.05, M, s, L.seed * 8.9 + side, 0.08, lod);
    }
  }
  if (bareL) {
    // A bare foot: a wedge from heel to toes, the toes drawn.
    f.cone(f.at(knee, 0, -0.4, -0.04), f.at(knee, 0, -0.432, 0.15), 0.044 * s, 0.03 * s, M.shoes).flag(PF.CUT_A).k(0.008 * s);
    if (lod > 0 && seenFront) {
      for (let i = -1; i <= 1; i++) stroke(f, f.at(knee, i * 0.018, -0.425, 0.12), f.at(knee, i * 0.02, -0.44, 0.17), M.shoes, s, -0.5);
    }
    return;
  }
  f.cone(f.at(knee, 0, -0.4, -0.066), f.at(knee, 0, -0.424, 0.17), 0.05 * s, 0.036 * s, M.shoes).flag(PF.CUT_A).k(0.006 * s);
  // Sole: the tread under the ball of the foot, a heel block, the arch between them.
  f.cone(f.at(knee, 0, -0.455, 0.004), f.at(knee, 0, -0.455, 0.198), 0.013 * s, 0.012 * s, C.sole).flag(CUT).k(0.002 * s).min(0.5);
  f.cone(f.at(knee, 0, -0.452, -0.068), f.at(knee, 0, -0.452, -0.022), 0.016 * s, 0.016 * s, C.sole).flag(CUT).k(0.002 * s).min(0.5);
  if (lod > 0) {
    // Toe cap: a light shape on the leather.
    f.decal(f.at(knee, -0.02, -0.398, 0.14), f.at(knee, 0.014, -0.398, 0.155), 0.01 * s, 0.008 * s, M.shoes).flag(SH | PF.NO_OUTLINE).tone(0.2).min(0.5);
    if (seenFront && (o === 'worker' || o === 'flannel' || o === 'soldier' || !L.dead)) {
      // Laces: two pale ticks across the instep.
      f.decal(f.at(knee, -0.022, -0.385, 0.075), f.at(knee, 0.022, -0.385, 0.075), 0.005 * s, 0.005 * s, C.lace).flag(D | PF.NO_OUTLINE).min(0.5);
      f.decal(f.at(knee, -0.02, -0.4, 0.105), f.at(knee, 0.02, -0.4, 0.105), 0.005 * s, 0.005 * s, C.lace).flag(D | PF.NO_OUTLINE).min(0.5);
    }
  }
}

const LOOSE: HumanPose = { severed: [0, 0], headless: false, jaw: 0, face: 'zombie', squash: 0, time: 0, speed: 0 };

/** A severed arm lying / tumbling in the world, in the PIXEL CAST 2 look. */
export function paintLooseArmCel(f: PixelFigure, obj: THREE.Object3D, whole: boolean, L: HumanLook): boolean {
  const M = mats(L);
  const C = celMats(L);
  const s = scaleOf(obj);
  f.autoBand = false;
  const lod = tx(f, f.at(obj, 0, 0, 0), 1.8 * s) < 70 ? 0 : 1;
  f.layer(0.012 * s, PART.NONE);
  if (whole) {
    let elbow: THREE.Object3D | null = null;
    for (const c of obj.children) if (!(c as THREE.Mesh).isMesh) elbow = c;
    armCel(f, obj, elbow, 1, L, M, C, s, LOOSE, null, false, false, lod);
    f.ball(f.at(obj, 0, 0.02, 0), 0.055 * s, M.gore).rag(0.008 * s, PF.SPIKY).z(-0.05);
    f.ball(f.at(obj, 0, 0.06, 0), 0.016 * s, M.bone).z(-0.06);
  } else {
    const a = L.armLength;
    const foreMat = L.sleeves === 'long' ? M.sleeve : M.skin;
    f.cone(f.at(obj, 0, 0.012, 0.004), f.at(obj, 0, -0.095 * a, 0.008), 0.043 * s, 0.05 * s, foreMat);
    f.cone(f.at(obj, 0, -0.085 * a, 0.006), f.at(obj, 0, -0.242 * a, 0), 0.05 * s, 0.031 * s, foreMat);
    if (lod > 0) {
      seg(f, f.at(obj, 0, 0.01, 0.004), f.at(obj, 0, -0.24 * a, 0));
      shape(f, 0, 0.077 * s, 0, 0.01 * s, 0.72, 0.077 * s, -1, foreMat);
    }
    handCel(f, obj, 1, L, M, s, a, L.dead ? HAND.CLAW : HAND.OPEN, null);
    f.ball(f.at(obj, 0, 0.02, 0), 0.047 * s, M.gore).rag(0.008 * s, PF.SPIKY).z(-0.05);
    f.ball(f.at(obj, 0, 0.05, 0), 0.015 * s, M.bone).z(-0.06);
  }
  return true;
}

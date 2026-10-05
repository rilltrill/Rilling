import * as THREE from 'three';
import type { TheroRig, TheroSpec } from '../enemies/dinoKit';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat, material } from '../../gameplay/pixel/materials';
import { STAMP, stampSize } from '../../gameplay/pixel/stamps';
import { hoop } from './castKit';
import { Enemy } from '../../gameplay/Enemy';
import type { World } from '../../gameplay/World';

/**
 * ─── PixelCast dinosaur bosses ─────────────────────────────────────────────
 *
 * Painters for the d2 and d3 bosses, built from their live joints / meshes like
 * the rest of the cast (the weak points you shoot are drawn where their
 * hitboxes are, in every pose).
 *
 *   SPECIMEN X (d2)  the albino hybrid raptor: one flowing body line (theropod
 *                    painter ideas: snout → skull → neck → deep chest → narrow
 *                    hips → whip tail, elliptical sections, chevron hide); a
 *                    crest of bone quills along the spine (armour) that bristle
 *                    and rattle; scythe claws; GLOWING bioluminescent stripes
 *                    (weak) arcing over the flanks, neck, tail base and skull —
 *                    they pulse, flare purple when it is enraged, stutter out
 *                    when it dies; glowing eyes in a halo of light spilling on
 *                    the skin (weak). CLOAK: the hide sinks down its own ramp
 *                    into the dark while the stripes and eyes keep burning.
 *                    Head-on (pounce, bite) the head is redrawn as a MAW. Its
 *                    quill darts are painted too (bone quill + glowing tip).
 *   THE TYRANT (d3)  a 12 m rex: a deep barrel body in slices, a massive skull
 *                    with bony brows and cheek horns over small glowing amber
 *                    eyes (weak, light spilling round them), ragged tooth rows;
 *                    jaws open: gums, a tongue and a burning throat (weak) deep
 *                    in a dark gullet, saliva strands. Head-on — the chase, every
 *                    lunge — the open mouth faces the lens: a cavern ringed by
 *                    teeth. Drumstick thighs, tiny clawed arms, scutes down the
 *                    spine, a whip tail; lunges leave a smear.
 */

function scaleOf(o: THREE.Object3D): number {
  const e = o.matrixWorld.elements;
  return Math.hypot(e[0], e[1], e[2]);
}

const X = (f: PixelFigure, o: THREE.Object3D) => f.dir(o, 1, 0, 0);
const Y = (f: PixelFigure, o: THREE.Object3D) => f.dir(o, 0, 1, 0);
const Z = (f: PixelFigure, o: THREE.Object3D) => f.dir(o, 0, 0, 1);
const P0 = { x: 0, y: 0, z: 0 };
const P1 = { x: 0, y: 0, z: 0 };

/** Smear memory (a lunge streaks the head / body back along its path for a redraw). */
export interface BossDMem {
  valid: boolean;
  t: number;
  head: THREE.Vector3;
  body: THREE.Vector3;
}

function bossDMem(): BossDMem {
  return { valid: false, t: 0, head: new THREE.Vector3(), body: new THREE.Vector3() };
}

/** Glow level 0 (off) … 3 (flare) from a glow material's colour (max channel ≈ its brightness). */
function bossDLevel(c: THREE.Color): number {
  const k = Math.max(c.r, c.g, c.b);
  return k < 0.28 ? 0 : k < 0.95 ? 1 : k < 1.75 ? 2 : 3;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIMEN X (d2)
// ═══════════════════════════════════════════════════════════════════════════

/** Teeth, claws, mouth and pupils (entries shared with the Tyrant and the raptors). */
interface BossDXShared {
  teeth: number;
  claw: number;
  throat: number;
  pupil: number;
}

/** Hide materials of one cloak level. */
interface BossDXSkin {
  hide: number;
  back: number;
  limb: number;
  belly: number;
  quill: number;
  quillTip: number;
}

export interface BossDSpecimenRig {
  r: TheroRig;
  s: TheroSpec;
  /** Hide palettes, one per cloak level (`SX_CK`): the albino sinking into the dark like the 3D's cloak material. */
  skins: readonly BossDXSkin[];
  /** Quill pivots: neck, chest, hips, tail base (they raise / rattle / scale). */
  quills: readonly THREE.Object3D[];
  eyes: readonly THREE.Object3D[];
  halos: readonly THREE.Object3D[];
  mem: BossDMem;
}

/**
 * Cloak levels: cloak amounts at which the hide's lightness steps evenly (the 3D
 * multiplies the skin by (0.9, 0.95, 1.1) · (1 − 0.86·cloak) in linear light).
 * Nearest level per redraw: the fade is a classic palette fade of half-ramp steps.
 */
const SX_CK = [0, 0.37, 0.65, 0.86, 1];
/** Tiger-band period along the body (metres) and their colour: a cool grey-taupe on the albino. */
const SX_BAND = 0.34;
const SX_STRIPE = 0x8a7f86;

/** Quill rows as built by the boss (pivot-local): count, length, spread, z0, z1, y. */
const SX_QUILLS: readonly (readonly [number, number, number, number, number, number])[] = [
  [3, 0.22, 0.05, 0.05, 0.3, 0.128],
  [6, 0.42, 0.09, 0.87, 0.02, 0.3128],
  [3, 0.36, 0.08, 0.15, -0.3, 0.2944],
  [3, 0.26, 0.06, -0.05, -0.38, 0.204],
];

function bossDLin(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function bossDSrgb(v: number): number {
  const c = Math.min(1, Math.max(0, v));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
}
/** `hex` under the cloak material at cloak `ck` (linear-light multiply, cool). */
function bossDCloakHex(hex: number, ck: number): number {
  if (ck <= 0) return hex;
  const c = 1 - 0.86 * ck;
  const r = bossDSrgb(bossDLin((hex >> 16) & 255) * c * 0.9);
  const g = bossDSrgb(bossDLin((hex >> 8) & 255) * c * 0.95);
  const b = bossDSrgb(bossDLin(hex & 255) * c * 1.1);
  return (r << 16) | (g << 8) | b;
}

/**
 * What the painter reads from the boss (built once). `weak` = the boss's weak
 * meshes in registration order (eye, halo, eye, halo, stripes…). The soft eye
 * halos are painted (light on the skin round a crisp eye; the far one behind the
 * head), so SpriteArt hides them with the model instead of drawing them live.
 */
export function bossDSpecimenRig(r: TheroRig, s: TheroSpec, quills: readonly THREE.Object3D[], weak: readonly THREE.Object3D[]): BossDSpecimenRig {
  const p = s.pal;
  const skins: BossDXSkin[] = [];
  for (let i = 0; i < SX_CK.length; i++) {
    const ck = SX_CK[i];
    // (Four materials a level — the shared table is small: limbs and brows wear the
    // hide, the quills' dark tips are the hide's own band colour.)
    const belly = Mat.hide(bossDCloakHex(p.belly, ck), { scale: 0.2 });
    const band = bossDCloakHex(SX_STRIPE, ck);
    const hide = Mat.hide(bossDCloakHex(p.base, ck), { stripes: 0.9, belly, stripe: band, scale: SX_BAND });
    // (Mat.hide made this entry; the fallback only runs if the table was already full.)
    const tip = material(`stripe|${band.toString(16).padStart(6, '0')}`, () => ({ ramp: [band, band, band, band, band, band], pattern: 0, scale: 0.1, strength: 0, secondary: 0, glow: false, dither: 0, spec: 0 }));
    skins.push({ hide, back: hide, limb: hide, belly, quill: Mat.bone(bossDCloakHex(p.accent, ck)), quillTip: tip });
  }
  weak[1].userData.spriteKeep3D = false;
  weak[3].userData.spriteKeep3D = false;
  return { r, s, skins, quills, eyes: [weak[0], weak[2]], halos: [weak[1], weak[3]], mem: bossDMem() };
}

const XM = {
  ready: false,
  stripe: [0, 0, 0, 0],
  stripeR: [0, 0, 0, 0],
  eye: [0, 0, 0, 0],
  eyeR: [0, 0, 0, 0],
  core: 0,
  coreR: 0,
  rim: 0,
  rimR: 0,
  spill: 0,
  spillR: 0,
  scythe: 0,
  edge: 0,
  gum: 0,
  deep: 0,
  tongue: 0,
  teeth: 0,
  throat: 0,
  pupil: 0,
  /** Teeth / claws / mouth / pupils as the painter's `M` (built once: no object per redraw). */
  shared: { teeth: 0, claw: 0, throat: 0, pupil: 0 } as BossDXShared,
  dart: 0,
  dartTip: 0,
  dartGlow: 0,
  dartRing: 0,
};

function xm() {
  if (!XM.ready) {
    XM.ready = true;
    // Stripes: off (dead tissue), dim, glowing, flaring — a pale cyan like the 3D's
    // over-bright glow (purple when enraged).
    XM.stripe = [Mat.flat(0x5a6670, 'sxdead'), Mat.glow(0x3ab8d8), Mat.glow(0x7aeaff), Mat.glow(0xc8faff)];
    XM.stripeR = [XM.stripe[0], Mat.glow(0x8a44c0), Mat.glow(0xc880ff), Mat.glow(0xecd6ff)];
    // (The eyes burn in the stripes' own glow ramp; every entry of the shared
    // material table counts — a long session fills it.)
    XM.eye = XM.stripe;
    XM.eyeR = XM.stripeR;
    XM.core = XM.stripe[3];
    XM.coreR = XM.stripeR[3];
    // A dim glow rim hugging the eye; the light it throws on the skin round it.
    XM.rim = XM.stripe[1];
    XM.rimR = XM.stripeR[1];
    XM.spill = Mat.hide(0xaccad0, { scale: 0.2 });
    XM.spillR = Mat.hide(0xd0b0b8, { scale: 0.2 });
    XM.scythe = Mat.gloss(0x24262c);
    XM.edge = Mat.flat(0xc8d0dc, 'sxedge');
    // Mouth, teeth and pupils share the Tyrant's (and the raptors') entries.
    XM.gum = Mat.gore(0x8a2a2a);
    XM.deep = Mat.mouth(0x1e0404);
    XM.tongue = Mat.gore(0xa03848);
    XM.teeth = Mat.teeth(0xeee2c2);
    XM.throat = Mat.mouth(0x5e1414);
    XM.pupil = Mat.flat(0x140c06);
    XM.shared = { teeth: XM.teeth, claw: XM.scythe, throat: XM.throat, pupil: XM.pupil };
    XM.dart = Mat.bone(0xe8e2d4);
    XM.dartTip = XM.edge;
    XM.dartGlow = XM.stripe[2];
    XM.dartRing = XM.stripe[1];
  }
  return XM;
}

/**
 * Paint Specimen X. `cloak` 0..1 (the hide fades into the dark), `stripeC` /
 * `eyeC` = the live glow colours of the 3D stripes / eyes (their brightness
 * drives pulse, flare and the death stutter), `rage` = enraged palette,
 * `quill` = how far the quills are raised, `flinch` = hit squash.
 */
export function bossDPaintSpecimen(f: PixelFigure, R: BossDSpecimenRig, cloak: number, stripeC: THREE.Color, eyeC: THREE.Color, rage: boolean, quill: number, flinch: number, time: number): boolean {
  f.maxTexels = 240;
  const r = R.r;
  const s = R.s;
  // Cloak: the nearest palette level, plus a continuous shade that deepens it.
  const ck = Math.min(1, Math.max(0, cloak));
  let li = 0;
  for (let i = 1; i < SX_CK.length; i++) if (Math.abs(ck - SX_CK[i]) < Math.abs(ck - SX_CK[li])) li = i;
  const C = R.skins[li];
  // Teeth, claws, mouth and pupils (shared entries).
  const XS = xm();
  const M = XS.shared;
  // (The 3D's lit hide barely darkens at mid cloak, then sinks to near black.)
  const dark = -0.4 * ck * ck * ck;
  const sc = scaleOf(r.pelvis);
  const T = s.torso;
  const sk = s.skull;
  const sn = s.snout;
  const J = s.jaw;
  const h = r.head;
  // Glows: the 3D's flare (it brightens while cloaked) reads a level up.
  const lv0 = bossDLevel(stripeC);
  const lvS = lv0 > 0 ? Math.min(3, lv0 + (ck > 0.3 ? 1 : 0)) : 0;
  const lvE = bossDLevel(eyeC);
  const stripeM = rage ? XS.stripeR[lvS] : XS.stripe[lvS];
  const eyeM = rage ? XS.eyeR[lvE] : XS.eye[lvE];
  const torsoDepth = f.depth(f.at(r.chest, 0, 0, T.len * 0.4));
  const snoutY0 = -sk.r[1] * 0.12;
  const sr0x = sk.r[0] * 0.85;
  const sr0y = sk.r[1] * 0.78;
  const snoutTip = f.at(h, 0, snoutY0 - sn.drop, sk.len + sn.len);
  const headOn = f.facing(snoutTip, Z(f, h));
  const jawA = r.jaw ? r.jaw.rotation.x : 0;
  // Head-on (the leap, a bite) or glaring down at the lens with the snout hanging
  // toward it (the pounce wind-up): the MAW. A head turned to look at the camera
  // from a 3/4 body still reads as a profile head.
  const pe = f.project(f.at(h, 0, 0, sk.len * 0.42), P0);
  const ps = f.project(snoutTip, P1);
  const hang = pe.y - ps.y > 1.5 * Math.abs(pe.x - ps.x);
  const maw = headOn > 0.88 || (headOn > 0.6 && hang);
  const headTx = f.px(f.at(h, 0, 0, sk.len * 0.5), sk.r[1] * 2 * sc) / f.kHint;
  // Rearing (roar, the death scream): the chest's front slims into the neck.
  const rear = Math.min(1, Math.max(0, -r.body.rotation.x / 0.5));

  // ── Smears: a pounce streaks back along its path ──
  bossDSmear(f, R.mem, f.at(h, 0, 0, sk.len * 0.5), f.at(r.chest, 0, 0, T.len * 0.5), sk.r[1] * 0.9 * sc, T.r1[1] * 0.8 * sc, C.hide, time, dark);

  // ── Body line: snout → skull → neck → chest → hips → tail (one melted layer) ──
  // (Pattern u runs in metres along the body, so the tiger bands flow on unbroken.)
  if (maw) f.layer(0.04 * sc, PART.HEAD, dark);
  else f.layer(0.05 * sc, PART.TORSO, dark);
  let u = 0;
  const hx = X(f, h);
  const hy = Y(f, h);
  // Head: a long wedge (skull tapering into the snout), the cranium swelling behind the eyes.
  f.coneE(snoutTip, f.at(h, 0, snoutY0 * 0.5, sk.len * 0.35), hx, hy, sn.r1[0] * sc, sn.r1[1] * sc, sr0x * 0.98 * sc, sr0y * 1.05 * sc, C.hide).part(PART.HEAD).u(u).k(0.03 * sc);
  u += (sn.len + sk.len * 0.6) * sc;
  f.ellipsoid(h, 0, sk.r[1] * 0.06, sk.len * 0.3, sk.r[0] * 0.94, sk.r[1] * 0.92, sk.len * 0.62, C.hide).part(PART.HEAD).u(u).k(0.045 * sc);
  u += sk.len * 0.5 * sc;
  // The bony nasal ridge between the brows, running down onto the snout.
  f.cone(f.at(h, 0, sk.r[1] * 0.62, sk.len * 0.15), f.at(h, 0, sk.r[1] * 0.42, sk.len * 1.3), sk.r[0] * 0.42 * sc, sk.r[0] * 0.3 * sc, C.hide).part(PART.HEAD).k(0.03 * sc);
  // Heavy brow ridges (a V of bone from the front: the scowl).
  for (let sd = 1; sd >= -1; sd -= 2) {
    f.cone(f.at(h, sd * sk.r[0] * 0.66, sk.r[1] * 0.82, sk.len * 0.8), f.at(h, sd * sk.r[0] * 0.48, sk.r[1] * 0.92, sk.len * 0.1), 0.026 * sc, 0.034 * sc, C.back).part(PART.HEAD).k(0.02 * sc).tone(-0.18);
  }
  // Jaw: its own primitive on the jaw joint, a small blend so the gape stays open;
  // a wedge (deep at the hinge, a sharp chin), tooth rows along both rims.
  if (r.jaw) {
    f.coneE(f.at(r.jaw, 0, 0, -0.04), f.at(r.jaw, 0, -0.005, J.len - 0.03), X(f, r.jaw), Y(f, r.jaw), J.r0[0] * sc, J.r0[1] * sc, J.r1[0] * 0.85 * sc, J.r1[1] * 0.8 * sc, C.hide).part(PART.HEAD).u(0.1).k((jawA < 0.15 ? 0.04 : 0.012) * sc);
    if (!maw) {
      for (let sd = 1; sd >= -1; sd -= 2) {
        f.cone(f.at(r.jaw, sd * J.r0[0] * 0.7, J.r0[1] * 0.7, 0.04), f.at(r.jaw, sd * J.r1[0] * 0.6, J.r1[1] * 0.65, J.len * 0.9), 0.02 * sc, 0.013 * sc, M.teeth).part(PART.HEAD).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(0.03).seed(2 + sd);
      }
      f.cone(f.at(r.jaw, 0, -J.r0[1] * 0.6, 0.02), f.at(r.jaw, 0, -J.r0[1] * 1.5, -0.04), J.r0[0] * 0.55 * sc, J.r0[0] * 0.3 * sc, C.belly).k(0.02 * sc).part(PART.HEAD);
    }
  }
  if (!maw) {
    for (let sd = 1; sd >= -1; sd -= 2) {
      f.cone(f.at(h, sd * sr0x * 0.75, snoutY0 - sr0y * 0.68, sk.len * 0.85), f.at(h, sd * sn.r1[0] * 0.7, snoutY0 - sn.drop - sn.r1[1] * 0.7, sk.len + sn.len * 0.9), 0.022 * sc, 0.015 * sc, M.teeth).part(PART.HEAD).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(0.03).seed(5 + sd);
    }
  }
  // Crest quills on the skull (two rows splayed into a V), bristling.
  const q = s.quills * (1 + quill * 0.35);
  for (let i = 0; i < (maw ? 1 : 2); i++) {
    for (let sd = 1; sd >= -1; sd -= 2) {
      const z = sk.len * 0.55 - i * 0.12 * s.quills;
      const len = 0.11 * q * (1 - i * 0.12);
      const sway = Math.sin(time * (7 + quill * 30) + i + sd) * (0.006 + quill * 0.01);
      f.cone(f.at(h, sd * sk.r[0] * 0.3, sk.r[1] * 0.78, z), f.at(h, sd * (sk.r[0] * 0.3 + len * 0.35) + sway, sk.r[1] * 0.78 + len * 0.6, z - len * 0.75), 0.02 * s.quills * sc, 0.004 * sc, (i + (sd > 0 ? 0 : 1)) % 2 ? C.quillTip : C.quill)
        .part(PART.NONE)
        .k(0.01 * sc)
        .min(0.5);
    }
  }
  // The halos (weak): the glow's light on the skin round each eye — lit, cyan-tinted
  // hide melted into the head, a little over half the halo's size (the soft rest of
  // the 3D glow is left out: drawn whole it reads as goggles). The far one only
  // where it shows past the skull.
  for (let i = 0; i < R.halos.length; i++) {
    const sd = i === 0 ? 1 : -1;
    if (!R.halos[i].visible || f.facing(f.at(R.eyes[i], 0, 0, 0), f.dir(h, sd, 0.2, maw ? 0.6 : 0.3)) < -0.1) continue;
    const hr = maw ? 0.072 : 0.06;
    f.ellipsoid(R.halos[i], 0, 0, 0, hr, hr, 0.062, lvE > 0 ? (rage ? XS.spillR : XS.spill) : C.hide).part(PART.WEAK).flag(PF.FLAT).k(0.01 * sc).z(-0.01 * sc);
  }
  if (maw) {
    bossDSpecimenMaw(f, R, C, M, XS, sc, snoutTip, eyeM, rage, dark, jawA);
    f.layer(0.05 * sc, PART.TORSO, dark);
  }
  // Neck.
  const nN = r.neck.length;
  for (let i = nN - 1; i >= 0; i--) {
    const n = r.neck[i];
    const t0 = i / nN;
    const t1 = (i + 1) / nN;
    const len = s.neck.lens[i];
    const r0 = s.neck.r0;
    const r1 = s.neck.r1;
    f.coneE(
      f.at(n, 0, 0, len + 0.02),
      f.at(n, 0, 0, -0.04),
      X(f, n),
      Y(f, n),
      // (The 3D neck is a hexagonal tube: its silhouette is ~0.93 of the nominal radius.)
      (r0[0] + (r1[0] - r0[0]) * t1) * 0.93 * sc,
      (r0[1] + (r1[1] - r0[1]) * t1) * 0.93 * sc,
      (r0[0] + (r1[0] - r0[0]) * t0) * 0.93 * sc,
      (r0[1] + (r1[1] - r0[1]) * t0) * 0.93 * sc,
      C.hide,
    )
      .u(u)
      .k(0.05 * sc);
    u += len * sc;
  }
  // Deep chest tapering to the hips (breathing swells it), hips, whip tail.
  const br = r.torso.scale.y;
  // (Two slices: the 3D torso bulges ~10 % at mid-length; rearing, the chest's front slims.)
  const cx = X(f, r.chest);
  const cy = Y(f, r.chest);
  const mx = (T.r0[0] + T.r1[0]) * 0.5 * 1.05;
  const my = (T.r0[1] + T.r1[1]) * 0.5 * 1.05;
  const fr = 1 - 0.24 * rear;
  f.coneE(f.at(r.chest, 0, T.rise * (1 - 0.3 * rear), T.len * (1 - 0.1 * rear)), f.at(r.chest, 0, T.rise * 0.25, T.len * 0.48), cx, cy, T.r1[0] * 0.96 * fr * sc * br, T.r1[1] * 1.02 * fr * sc * br, mx * sc * br, my * sc * br, C.hide)
    .u(u)
    .k(0.07 * sc);
  f.coneE(f.at(r.chest, 0, T.rise * 0.25, T.len * 0.48), f.at(r.chest, 0, 0, 0.0), cx, cy, mx * sc * br, my * sc * br, T.r0[0] * 0.96 * sc * br, T.r0[1] * 0.97 * sc * br, C.hide)
    .u(u + T.len * 0.52 * sc)
    .k(0.07 * sc);
  u += T.len * sc;
  f.ellipsoid(r.body, 0, 0.02, -0.08, s.hips[0] * 0.9, s.hips[1] * 0.95, s.hips[2] * 0.95, C.hide).u(u).k(0.08 * sc);
  u += s.hips[2] * sc;
  let trx = s.tail.r0[0];
  let try_ = s.tail.r0[1];
  for (let i = 0; i < r.tail.length; i++) {
    const seg = r.tail[i];
    const len = s.tail.lens[i];
    const last = i === r.tail.length - 1;
    const r1x = last ? 0.012 : trx * s.tail.taper;
    const r1y = last ? 0.014 : try_ * s.tail.taper;
    f.coneE(f.at(seg, 0, 0, 0.04), f.at(seg, 0, 0, -len), X(f, seg), Y(f, seg), trx * 0.93 * sc, try_ * 0.93 * sc, r1x * 0.93 * sc, r1y * 0.93 * sc, C.hide).part(PART.TAIL).u(u).k(0.05 * sc);
    u += len * sc;
    trx = r1x;
    try_ = r1y;
  }
  if (!maw) {
    // Face: a dark mask band through the eye; nostrils.
    for (let sd = 1; sd >= -1; sd -= 2) {
      const eyeP = f.at(h, sd * sk.r[0] * 0.86, sk.r[1] * 0.32, sk.len * 0.42);
      if (f.facing(eyeP, f.dir(h, sd, 0.25, 0.35)) < 0.05) continue;
      f.decal(f.at(h, sd * sk.r[0] * 0.8, sk.r[1] * 0.3, sk.len * 0.9), f.at(h, sd * sk.r[0] * 0.8, sk.r[1] * 0.36, sk.len * 0.02), 0.024 * sc, 0.028 * sc, C.hide)
        .part(PART.HEAD)
        .flag(PF.FLAT | PF.SHADE_ONLY)
        .tone(-0.3);
    }
    if (headOn > -0.6) {
      for (let sd = 1; sd >= -1; sd -= 2) {
        const no = f.at(h, sd * sn.r1[0] * 0.55, snoutY0 - sn.drop * 0.9 + sn.r1[1] * 0.5, sk.len + sn.len * 0.88);
        f.decal(no, no, 0.009 * sc, 0.009 * sc, M.throat).part(PART.HEAD).flag(PF.FLAT).min(0.45);
      }
    }
  }

  // ── The gape (jaws apart, not head-on): one screaming mouth — wet gums, a dark
  // throat and the tongue fill the wedge between the lips; the tooth rows on both
  // rims point into it. Its own layer just behind the jaws (they outline it). ──
  if (r.jaw && jawA > 0.05 && !maw) {
    f.layer(0.004 * sc, PART.HEAD, dark * 0.5, 0.05 * sc);
    const tipU = f.at(h, 0, snoutY0 - sn.drop - sn.r1[1] * 0.3, sk.len + sn.len * 0.86);
    const tipJ = f.at(r.jaw, 0, J.r1[1] * 0.3, J.len * 0.86);
    const hinge = f.mix(f.at(h, 0, snoutY0 - sr0y * 0.5, sk.len * 0.35), f.at(r.jaw, 0, J.r0[1] * 0.3, 0.04), 0.5);
    // (Gums pushed back so the gullet and tongue drawn over them win; the two
    // corners of the mouth give the wedge its width when the face turns to us.)
    for (let sd = 1; sd >= -1; sd -= 2) {
      const hs = f.mix(f.at(h, sd * sr0x * 0.8, snoutY0 - sr0y * 0.5, sk.len * 0.35), f.at(r.jaw, sd * J.r0[0] * 0.8, J.r0[1] * 0.3, 0.04), 0.5);
      f.tri(hs, tipU, tipJ, XS.gum, 0.006 * sc).z(0.3 * sc);
    }
    const a = f.mix(hinge, tipU, 0.72);
    const b = f.mix(hinge, tipJ, 0.72);
    f.tri(f.mix(hinge, a, 0.1), a, b, XS.deep, 0.004 * sc);
    f.cone(f.mix(hinge, tipJ, 0.25), f.mix(hinge, tipJ, 0.8), 0.026 * sc, 0.018 * sc, XS.tongue).z(-0.3 * sc).min(0.5);
  }

  // ── Bioluminescent stripes (weak): glowing arcs on the sides facing us ──
  f.layer(0.004 * sc, PART.WEAK, 0, -0.05 * sc);
  for (let sd = 1; sd >= -1; sd -= 2) {
    const sideF = f.facing(f.at(r.chest, sd * T.r0[0], 0, T.len * 0.5), f.dir(r.chest, sd, 0.15, 0));
    if (sideF > -0.02) {
      for (let k = 0; k < 4; k++) {
        const t = 0.18 + k * 0.215;
        const rx = (T.r0[0] + (T.r1[0] - T.r0[0]) * t) * 1.05 * 1.03;
        const ry = (T.r0[1] + (T.r1[1] - T.r0[1]) * t) * 1.05 * 1.03;
        // (A flank seen at a graze: its arcs are slivers, one stroke each over the curve's crown.)
        if (sideF > 0.3 || maw) bossDArc(f, r.chest, sd, -0.02 + t * T.len, T.rise * t * t, rx, ry, -0.5, 0.9, 0.034 * sc, stripeM);
        else bossDArc1(f, r.chest, sd, -0.02 + t * T.len, T.rise * t * t, rx * 1.04, ry * 1.04, -0.2, 0.9, 0.034 * sc, stripeM);
      }
    }
    const n0 = r.neck[0];
    if (f.facing(f.at(n0, sd * s.neck.r0[0], 0, s.neck.lens[0] * 0.3), f.dir(n0, sd, 0.2, 0)) > -0.02) {
      const rx = (s.neck.r0[0] + (s.neck.r1[0] - s.neck.r0[0]) * 0.25) * 1.05 * 1.03;
      const ry = (s.neck.r0[1] + (s.neck.r1[1] - s.neck.r0[1]) * 0.25) * 1.05 * 1.03;
      for (let k = 0; k < 2; k++) bossDArc1(f, n0, sd, (k === 0 ? 0.1 : 0.45) * s.neck.lens[0], 0, rx, ry, -0.4, 1.0, 0.03 * sc, stripeM);
    }
    const t0 = r.tail[0];
    // (Head-on the tail base hides behind the body.)
    if (!maw && f.facing(f.at(t0, sd * s.tail.r0[0], 0, -s.tail.lens[0] * 0.5), f.dir(t0, sd, 0.2, 0)) > -0.02) {
      for (let k = 0; k < 3; k++) {
        const t = 0.15 + k * 0.35;
        bossDArc1(f, t0, sd, -t * s.tail.lens[0], 0, s.tail.r0[0] * (1 - t * 0.3) * 1.03, s.tail.r0[1] * (1 - t * 0.3) * 1.03, -0.3, 1.1, 0.03 * sc, stripeM);
      }
    }
  }
  // Crest line down the skull.
  f.cone(f.at(h, 0, sk.r[1] * 1.0, sk.len * 0.72), f.at(h, 0, sk.r[1] * 0.97, sk.len * 0.72 - 0.3), 0.022 * sc, 0.018 * sc, stripeM).min(0.6);

  // ── Eyes (weak): a dim glow rim hugging the eye, the glowing eye, a slit pupil ──
  if (!maw) {
    f.layer(0.004 * sc, PART.WEAK, 0, -0.08 * sc);
    for (let i = 0; i < R.eyes.length; i++) {
      const e = R.eyes[i];
      if (!e.visible) continue;
      const c = f.at(e, 0, 0, 0);
      const sd = i === 0 ? 1 : -1;
      if (f.facing(c, f.dir(h, sd, 0.2, 0.4)) < -0.15) continue;
      if (lvE > 0) f.ellipsoid(e, 0, 0, 0, 0.042, 0.032, 0.06, rage ? XS.rimR : XS.rim).flag(PF.FLAT).min(0.6);
      f.ellipsoid(e, 0, 0, 0, 0.034, 0.026, 0.05, eyeM).flag(PF.FLAT).z(-0.01).min(0.6);
      if (headTx >= 9 && lvE > 0) {
        const size = stampSize(headTx * 1.5);
        const mirror = f.project(snoutTip, P0).x < f.project(c, P1).x;
        f.stamp(c, (sk.r[1] * 2 * sc) / (size === 0 ? 8 : size === 1 ? 12 : 17), STAMP.reye[size], lvE >= 3 ? (rage ? XS.coreR : XS.core) : eyeM, M.pupil, 0, 0, mirror);
      }
    }
  }

  // ── Quills (armour): bone spikes along the spine, raised and rattling ──
  f.layer(0.006 * sc, PART.ARMOR, dark * 0.7);
  const camSide = f.facing(f.at(r.chest, 0, 0, T.len * 0.5), f.dir(r.chest, 1, 0, 0)) >= 0 ? 1 : -1;
  for (let p = 0; p < R.quills.length && p < SX_QUILLS.length; p++) {
    const pv = R.quills[p];
    if (!pv.visible) continue;
    // (Index reads, not array destructuring: no iterator per redraw.)
    const Q = SX_QUILLS[p];
    const n = Q[0];
    const len = Q[1];
    const spread = Q[2];
    const z0 = Q[3];
    const z1 = Q[4];
    const y = Q[5];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      const z = z0 + (z1 - z0) * t;
      const l = len * (0.75 + 0.35 * Math.sin(Math.PI * t));
      // Centre quill (tilted back), then the thin side quills: the camera's side, and
      // on the chest and hips the far one too (they stick up past the back).
      const cl = l * 1.1;
      const base = f.at(pv, 0, y - 0.01, z - 0.01);
      f.cone(base, f.at(pv, 0, y + 0.01 + cl * 0.4085, z - 0.02 - cl * 0.9128), 0.03 * sc, 0.004 * sc, C.quill).mat2(C.quillTip, 0.7).k(0.01 * sc).min(0.5);
      for (let sd = 1; sd >= -1; sd -= 2) {
        // (The short neck and tail rows: the centre quills alone; the chest and hips
        // rows get the thin side quills of both sides, sticking up past the back.)
        if (p === 0 || p === 3) continue;
        const dx = -Math.sin(sd * 0.3);
        f.cone(f.at(pv, sd * spread, y, z), f.at(pv, sd * spread + dx * l, y + l * 0.4754, z - l * 0.8286), 0.014 * sc, 0.003 * sc, C.quill)
          .mat2(C.quillTip, 0.75)
          .flag(PF.NO_OUTLINE)
          .tone(sd === camSide ? 0 : -0.1)
          .k(0.004 * sc)
          .min(0.5);
      }
    }
  }

  // ── Legs: drumstick thigh, a bony knee, the shin tapering from the calf, sinewy metatarsus ──
  const L = s.legR;
  for (let i = 0; i < r.legs.length; i++) {
    const leg = r.legs[i];
    const side = i === 0 ? 1 : -1;
    const mid = f.depth(f.at(leg.knee, 0, 0, 0));
    const farLeg = mid > torsoDepth + 0.1;
    f.layer(0.05 * sc, PART.LIMB, (farLeg ? -0.1 : 0) + dark);
    // (Starts below the hip joint: the 3D thigh's top is flat, the round cap must not rise over the hips.)
    f.coneE(f.at(leg.hip, 0, -0.1 * L, 0.01), f.at(leg.hip, 0, -s.thigh, 0), X(f, leg.hip), Z(f, leg.hip), 0.11 * L * sc, 0.165 * L * sc, 0.05 * L * sc, 0.064 * L * sc, C.hide).u(1.0 + i * 0.3);
    // The drumstick's swell (the 3D thigh bulges at mid-length), a lit crescent down its front.
    f.ellipsoid(leg.hip, 0, -s.thigh * 0.42, 0.012, 0.1 * L, s.thigh * 0.36, 0.17 * L, C.hide).u(1.2 + i * 0.3).k(0.04 * sc);
    if (!maw && !farLeg) f.decal(f.at(leg.hip, 0, -0.02, 0.15 * L), f.at(leg.hip, 0, -s.thigh * 0.6, 0.11 * L), 0.012 * sc, 0.01 * sc, C.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(0.22).min(0.5);
    f.ball(f.at(leg.knee, 0, -0.005, 0.012), 0.056 * L * sc, C.limb).k(0.02 * sc);
    f.coneE(f.at(leg.knee, 0, 0.0, -0.008), f.at(leg.knee, 0, -s.shin, 0), X(f, leg.knee), Z(f, leg.knee), 0.064 * L * sc, 0.088 * L * sc, 0.032 * L * sc, 0.038 * L * sc, C.limb).k(0.03 * sc);
    f.coneE(f.at(leg.ankle, 0, 0.03, 0), f.at(leg.ankle, 0, -s.meta, 0), X(f, leg.ankle), Z(f, leg.ankle), 0.042 * L * sc, 0.05 * L * sc, 0.032 * L * sc, 0.036 * L * sc, C.limb).k(0.03 * sc);
    const to = leg.toe;
    const fh = s.footH;
    f.ball(f.at(to, 0, -fh * 0.4, 0), 0.054 * L * sc, C.limb).k(0.02 * sc);
    // Two forward toes, each tapering into its claw.
    for (let t = 0; t < 2; t++) {
      const x = (t === 0 ? -0.022 : 0.026) * L * side;
      f.cone(f.at(to, x, -fh * 0.55, 0), f.at(to, x * 1.3, -fh * 1.1, s.toe + 0.045 * L), 0.031 * L * sc, 0.005 * sc, C.limb).mat2(M.claw, 0.74).k(0.012 * sc).min(0.5);
    }
    // The sickle: raised inner toe + the big killing claw held up off the ground, hooked forward.
    const x = 0.05 * side;
    const k1 = f.at(to, x * 1.3, 0.03, 0.05);
    f.cone(f.at(to, x, -fh * 0.3, 0.0), k1, 0.022 * sc, 0.022 * sc, C.limb).k(0.01 * sc);
    f.cone(k1, f.at(to, x * 1.6, 0.15, 0.14), 0.025 * sc, 0.004 * sc, M.claw).k(0.006 * sc).min(0.5);
  }

  // ── Arms + scythe claws (three long hooked blades, a pale honed edge) ──
  const a = s.arm;
  for (let i = 0; i < r.arms.length; i++) {
    const arm = r.arms[i];
    const mid = f.depth(f.at(arm.elbow, 0, 0, 0));
    const farArm = mid > torsoDepth + 0.05;
    f.layer(0.03 * sc, PART.LIMB, (farArm ? -0.1 : 0) + dark);
    // (The upper arm starts where it leaves the chest: the shoulder pivot is buried in the torso.)
    f.coneE(f.at(arm.shoulder, 0, -a.upper * 0.25, 0), f.at(arm.shoulder, 0, -a.upper, 0), X(f, arm.shoulder), Z(f, arm.shoulder), a.r * 0.9 * sc, a.r * 1.0 * sc, a.r * 0.8 * sc, a.r * 0.9 * sc, C.hide).u(0.5);
    f.coneE(f.at(arm.elbow, 0, 0, 0), f.at(arm.elbow, 0, -a.fore, 0), X(f, arm.elbow), Z(f, arm.elbow), a.r * 0.8 * sc, a.r * 0.85 * sc, a.r * 0.6 * sc, a.r * 0.6 * sc, C.limb).k(0.02 * sc);
    const spread = maw ? 1.6 : 1;
    for (let c = -1; c <= 1; c++) {
      const dx = c * 0.03;
      const sx = -Math.sin(dx * 3) * spread;
      // Blade direction (down and forward), curling forward at the tip.
      const bx = dx * spread;
      const by = -a.fore - 0.02;
      const b0 = f.at(arm.elbow, bx, by, 0.03);
      const m1 = f.at(arm.elbow, bx + sx * 0.16, by - 0.878 * 0.17, 0.03 + 0.479 * 0.17);
      const tip = f.at(arm.elbow, bx + sx * 0.3, by - 0.878 * 0.27, 0.03 + 0.479 * 0.27 + 0.09);
      if (c !== 0) {
        // (The far hand's outer blades hide behind its middle one.)
        if (!farArm) f.cone(b0, tip, 0.022 * sc, 0.004 * sc, XS.scythe).k(0.006 * sc).min(0.5);
        continue;
      }
      f.cone(b0, m1, 0.024 * sc, 0.017 * sc, XS.scythe).k(0.006 * sc).min(0.5);
      f.cone(m1, tip, 0.017 * sc, 0.004 * sc, XS.scythe).k(0.004 * sc).min(0.5);
      if (!maw && !farArm) f.decal(m1, tip, 0.006 * sc, 0.003 * sc, XS.edge).flag(PF.FLAT).min(0.45);
    }
  }

  if (flinch > 0) f.warp(f.at(r.pelvis, 0, 0, 0), 1 + 0.05 * Math.min(1, flinch), 1 - 0.06 * Math.min(1, flinch));
  return true;
}

/** A short glowing stripe (neck, tail base): one flat band from a0 to a1. */
function bossDArc1(f: PixelFigure, j: THREE.Object3D, sd: number, z: number, y0: number, rx: number, ry: number, a0: number, a1: number, w: number, mat: number) {
  const am = (a0 + a1) * 0.5;
  const pa = f.at(j, sd * Math.cos(a0) * rx, y0 + Math.sin(a0) * ry, z);
  const pb = f.at(j, sd * Math.cos(a1) * rx, y0 + Math.sin(a1) * ry, z);
  f.coneE(pa, pb, f.dir(j, sd * Math.cos(am), Math.sin(am), 0), f.dir(j, 0, 0, 1), w * 0.45, w, w * 0.45, w * 0.7, mat).flag(PF.FLAT).min(0.6);
}

/**
 * A glowing stripe: an arc over the body's side at height y0 / depth z (two
 * strokes). Its section is a flat band like the 3D one — `w` wide along the body,
 * thin across the surface — so it is a bar from the side and a sliver edge-on.
 */
function bossDArc(f: PixelFigure, j: THREE.Object3D, sd: number, z: number, y0: number, rx: number, ry: number, a0: number, a1: number, w: number, mat: number) {
  const am = (a0 + a1) * 0.5;
  const pa = f.at(j, sd * Math.cos(a0) * rx, y0 + Math.sin(a0) * ry, z);
  const pm = f.at(j, sd * Math.cos(am) * rx * 1.02, y0 + Math.sin(am) * ry * 1.02, z);
  const pb = f.at(j, sd * Math.cos(a1) * rx, y0 + Math.sin(a1) * ry, z);
  const along = f.dir(j, 0, 0, 1);
  const q0 = (a0 + am) * 0.5;
  const q1 = (am + a1) * 0.5;
  f.coneE(pa, pm, f.dir(j, sd * Math.cos(q0), Math.sin(q0), 0), along, w * 0.45, w * 0.8, w * 0.45, w, mat).flag(PF.FLAT).min(0.6);
  f.coneE(pm, pb, f.dir(j, sd * Math.cos(q1), Math.sin(q1), 0), along, w * 0.45, w, w * 0.45, w * 0.6, mat).flag(PF.FLAT).min(0.6);
}

/**
 * Specimen X head-on (pounce, bite): the snout points at the lens and the jaw
 * hangs open toward us. A sprite artist draws the MAW on the head: an oval
 * gape — wet red gums round a two-step dark gullet, the upper tooth row arching
 * over it, the lower rows following the jaw's V but stopping well short of the
 * chin, the tongue on the jaw floor — under angry glowing slit eyes and a V of
 * brow, a lit ridge down the snout to the nostrils.
 */
function bossDSpecimenMaw(f: PixelFigure, R: BossDSpecimenRig, C: BossDXSkin, M: BossDXShared, XS: typeof XM, sc: number, snoutTip: THREE.Vector3, eyeM: number, rage: boolean, dark: number, jawA: number) {
  const r = R.r;
  const s = R.s;
  const h = r.head;
  const sk = s.skull;
  const sn = s.snout;
  // Brow V (shade decals) over the eyes.
  for (let sd = 1; sd >= -1; sd -= 2) {
    f.decal(f.at(h, sd * sk.r[0] * 1.0, sk.r[1] * 0.85, sk.len * 0.3), f.at(h, sd * sk.r[0] * 0.1, sk.r[1] * 0.25, sk.len + sn.len * 0.25), 0.034 * sc, 0.016 * sc, C.hide)
      .part(PART.HEAD)
      .flag(PF.FLAT | PF.SHADE_ONLY)
      .tone(-0.55)
      .min(0.5);
  }
  // The snout's ridge catching the light from the brow to the nose; nostrils above the lip.
  f.decal(f.at(h, 0, sk.r[1] * 0.75, sk.len * 0.55), f.at(h, 0, -sk.r[1] * 0.12 - sn.drop + sn.r1[1] * 0.8, sk.len + sn.len * 0.8), 0.03 * sc, 0.016 * sc, C.hide).part(PART.HEAD).flag(PF.FLAT | PF.SHADE_ONLY).tone(0.2).min(0.5);
  for (let sd = 1; sd >= -1; sd -= 2) {
    const no = f.at(h, sd * sn.r1[0] * 0.55, -sk.r[1] * 0.12 - sn.drop + sn.r1[1] * 0.55, sk.len + sn.len * 0.9);
    f.decal(no, no, 0.012 * sc, 0.009 * sc, M.throat).part(PART.HEAD).flag(PF.FLAT).min(0.45);
  }
  const jw = r.jaw;
  if (jw) bossDSpecimenGape(f, R, M, XS, sc, jw, jawA, dark);
  // Eyes: angry almonds slanting up to the outside, a slit pupil, the brow's shadow over the top.
  f.layer(0.004 * sc, PART.WEAK, 0, -0.06 * sc);
  for (let i = 0; i < R.eyes.length; i++) {
    const e = R.eyes[i];
    if (!e.visible) continue;
    const sd = i === 0 ? 1 : -1;
    f.decal(f.at(e, -sd * 0.04, -0.016, 0.0), f.at(e, sd * 0.04, 0.016, 0.0), 0.022 * sc, 0.016 * sc, rage ? XS.rimR : XS.rim).flag(PF.FLAT).min(0.7);
    f.cone(f.at(e, -sd * 0.032, -0.012, 0.0), f.at(e, sd * 0.034, 0.014, 0.0), 0.014 * sc, 0.009 * sc, eyeM).flag(PF.FLAT).z(-0.01).min(0.7);
  }
}

/** The maw's gape (head-on): see `bossDSpecimenMaw`. Drawn into the head's layer. */
function bossDSpecimenGape(f: PixelFigure, R: BossDSpecimenRig, M: BossDXShared, XS: typeof XM, sc: number, jw: THREE.Object3D, jawA: number, dark: number) {
  const h = R.r.head;
  const sk = R.s.skull;
  const sn = R.s.snout;
  const J = R.s.jaw;
  void dark;
  // The gape, drawn the way a sprite artist faces it at the player: an upright
  // diamond hanging from the upper lip (top) down the screen as far as the jaws
  // gape (at least as far as the real lower lip shows), its corners out to the
  // skull's width — wet red gums round a two-step dark gullet.
  const top = f.at(h, 0, -sk.r[1] * 0.12 - sn.drop - sn.r1[1] * 0.3, sk.len + sn.len * 0.8);
  const op = Math.min(1, Math.max(0, (jawA - 0.15) / 0.6));
  const lip = f.at(jw, 0, J.r1[1] * 0.3, J.len * (0.48 + 0.14 * op));
  const vd = f.vec().subVectors(top, f.eye).normalize();
  const down = f.vec().set(0, -1, 0).addScaledVector(vd, vd.y).normalize();
  const right = f.vec().crossVectors(vd, down).normalize();
  const dl = f.vec().subVectors(lip, top);
  const shown = Math.max(0, dl.dot(down));
  const gape = Math.max(shown, J.len * sc * (0.12 + 0.18 * op));
  const bot = f.add(top, down, gape);
  const midC = f.add(top, down, gape * 0.4);
  const w = Math.min(sk.r[0] * 0.8 * sc, sk.r[0] * 0.42 * sc + gape * 0.3);
  const cl = f.add(midC, right, -w);
  const cr = f.add(midC, right, w);
  // (Part of the head's own layer, in front of it: the lips are the head's edge, not a pasted badge.)
  f.tri(top, cl, bot, XS.gum, w * 0.18).z(-0.12 * sc).k(0.004 * sc);
  f.tri(top, cr, bot, XS.gum, w * 0.18).z(-0.12 * sc).k(0.004 * sc);
  const ti = f.mix(top, midC, 0.3);
  const bi = f.mix(bot, midC, 0.25);
  f.tri(ti, f.mix(cl, midC, 0.28), bi, XS.deep, w * 0.12).z(-0.14 * sc).k(0.002 * sc);
  f.tri(ti, f.mix(cr, midC, 0.28), bi, XS.deep, w * 0.12).z(-0.14 * sc).k(0.002 * sc);
  // Tongue on the floor of the jaw, its tip short of the chin.
  f.cone(f.mix(midC, bot, 0.3), f.mix(midC, bot, 0.78), w * 0.2, w * 0.15, XS.tongue).z(-0.16 * sc).k(0.002 * sc).min(0.5);
  // Fangs, one by one: the upper ones hang from the lip over the gullet, the lower
  // ones climb the jaw's rims from the corners and stop well short of the chin.
  for (let sd = 1; sd >= -1; sd -= 2) {
    const c = sd > 0 ? cl : cr;
    for (let k = 0; k < 3; k++) {
      const t = 0.3 + k * 0.25;
      const p = f.mix(top, c, t);
      f.tri(f.mix(top, c, t - 0.1), f.mix(top, c, t + 0.1), f.mix(p, midC, 0.4 - k * 0.07), M.teeth, 0.002 * sc).z(-0.17 * sc).k(0.001);
    }
    const p = f.mix(c, bot, 0.24);
    f.tri(f.mix(c, bot, 0.12), f.mix(c, bot, 0.36), f.mix(p, top, 0.3), M.teeth, 0.002 * sc).z(-0.17 * sc).k(0.001);
  }
}

/** Smear: the head and body streak back along their path for a redraw after a fast move. */
function bossDSmear(f: PixelFigure, mem: BossDMem, head: THREE.Vector3, body: THREE.Vector3, rh: number, rb: number, mat: number, time: number, tone: number) {
  if (mem.valid && time > mem.t && time - mem.t < 0.2) {
    const a = f.project(mem.head, P0);
    const b = f.project(head, P1);
    if (Math.hypot(b.x - a.x, b.y - a.y) > 6) {
      f.layer(0.02, PART.NONE, 0.05 + tone, 0.4);
      f.cone(head, f.mix(head, mem.head, 0.7), rh, rh * 0.25, mat).flag(PF.FLAT).tone(0.1).min(0.5);
      f.cone(body, f.mix(body, mem.body, 0.6), rb, rb * 0.2, mat).flag(PF.FLAT).tone(0.1).min(0.5);
    }
  }
  mem.head.copy(head);
  mem.body.copy(body);
  mem.t = time;
  mem.valid = true;
}

/**
 * A quill dart (Specimen X's volley): a bone quill flying tip-first — a dark-edged
 * shaft tapering to a pale point with a glowing bead on it — inside a thin ring
 * of light. `g` = the dart's mesh group. The soft halo round it stays a live glow
 * (like every alpha halo) over the sprite.
 */
export function bossDPaintDart(f: PixelFigure, g: THREE.Object3D): boolean {
  const XS = xm();
  f.maxTexels = 120;
  const s = scaleOf(g);
  // Shaft (Kit cone r 0.08 × 0.9 along +Z, tip at +Z): bone, paling toward the point.
  f.layer(0.01 * s, PART.TORSO);
  f.cone(f.at(g, 0, 0, -0.45), f.at(g, 0, 0, 0.2), 0.075 * s, 0.04 * s, XS.dart).mat2(XS.dartTip, 0.6).min(0.6);
  f.cone(f.at(g, 0, 0, 0.2), f.at(g, 0, 0, 0.47), 0.04 * s, 0.008 * s, XS.dartTip).min(0.5);
  // The glowing bead near the tip (the 3D's glow ball) and a 1-texel ring of light (the halo's rim).
  f.layer(0.004 * s, PART.TORSO, 0, -0.04 * s);
  f.ball(f.at(g, 0, 0, 0.42), 0.115 * s, XS.dartRing).flag(PF.FLAT).min(0.6);
  f.ball(f.at(g, 0, 0, 0.43), 0.08 * s, XS.dartGlow).flag(PF.FLAT).z(-0.01).min(0.6);
  f.ball(f.at(g, 0.015, 0.022, 0.45), 0.035 * s, XS.core).flag(PF.FLAT).z(-0.02).min(0.6);
  hoop(f, g, 2, 0.3, 0.2, 0.012 * s, XS.dartRing, false, 10, true, 0, PF.FLAT);
  return true;
}

/** The paint hook for one dart (one closure per dart, none per redraw). */
export function bossDDart(root: THREE.Object3D): (f: PixelFigure) => boolean {
  return (f) => {
    const g = root.children[0];
    return !!g && root.visible && bossDPaintDart(f, g);
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE TYRANT (d3)
// ═══════════════════════════════════════════════════════════════════════════

export interface BossDTyrantRig {
  hips: THREE.Object3D;
  /** The torso mesh (its scale breathes). */
  torso: THREE.Object3D;
  chest: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  jaw: THREE.Object3D;
  /** Pivot at the jaw hinge turning half the jaw angle (the throat glow). */
  maw: THREE.Object3D;
  /** Gullet group (visible while the jaws gape). */
  mouth: THREE.Object3D;
  throat: THREE.Object3D;
  tongue: THREE.Object3D;
  eyes: readonly THREE.Object3D[];
  halos: readonly THREE.Object3D[];
  tail: readonly THREE.Object3D[];
  legs: readonly { hip: THREE.Object3D; knee: THREE.Object3D; ankle: THREE.Object3D; foot: THREE.Object3D }[];
  arms: readonly THREE.Object3D[];
  mem?: BossDMem;
}

/**
 * What the Tyrant painter reads (built once). Its eye halos are painted (amber
 * light on the skin round a crisp eye), so SpriteArt hides them with the model.
 */
export function bossDTyrantRig(r: BossDTyrantRig): BossDTyrantRig {
  r.mem = bossDMem();
  for (let i = 0; i < r.halos.length; i++) r.halos[i].userData.spriteKeep3D = false;
  return r;
}

const TM = {
  ready: false,
  hide: 0,
  belly: 0,
  back: 0,
  limb: 0,
  thigh: 0,
  head: 0,
  scute: 0,
  horn: 0,
  teeth: 0,
  claw: 0,
  gum: 0,
  heat: 0,
  gullet: 0,
  deep: 0,
  throat: 0,
  throatHot: 0,
  throatCore: 0,
  tongue: 0,
  eye: 0,
  eyeDead: 0,
  pupil: 0,
  spill: 0,
  rim: 0,
  nostril: 0,
  saliva: 0,
  scar: 0,
};

function tm() {
  if (!TM.ready) {
    TM.ready = true;
    // The 3D's browns, a touch warmer: tan belly and throat, dark slanting bands and saddle.
    TM.belly = Mat.hide(0xcdb084, { scale: 0.3 });
    TM.hide = Mat.hide(0x8a6a46, { stripes: 0.95, stripe: 0x3a2818, belly: TM.belly, scale: 0.5 });
    // (Head, legs and thighs wear the hide; scutes and the scar the dark back —
    // the shared material table is small.)
    TM.head = TM.hide;
    TM.back = Mat.hide(0x4e3a26, { scale: 0.3 });
    TM.limb = TM.hide;
    TM.thigh = TM.hide;
    TM.scute = TM.back;
    TM.horn = Mat.bone(0x8a7a62);
    TM.teeth = Mat.teeth(0xeee2c2);
    TM.claw = Mat.gloss(0x24262c);
    TM.gum = Mat.gore(0x8a2a2a);
    // Gum lit by the burning throat (the heat on the palate).
    TM.heat = Mat.flat(0xd0502a, 'trexheat');
    TM.gullet = Mat.mouth(0x5e1414);
    TM.deep = Mat.mouth(0x1e0404);
    TM.throat = Mat.glow(0xff3a14);
    TM.throatHot = Mat.glow(0xff8a2a);
    TM.throatCore = Mat.glow(0xffe08a);
    TM.tongue = Mat.gore(0xa03848);
    TM.eye = Mat.glow(0xffb020);
    TM.eyeDead = TM.deep;
    TM.pupil = Mat.flat(0x140c06);
    TM.spill = Mat.hide(0xc89a58, { scale: 0.2 });
    TM.rim = TM.throat;
    TM.nostril = TM.deep;
    TM.saliva = Mat.flat(0xd8d4c4, 'drool');
    TM.scar = TM.back;
  }
  return TM;
}

/** Tail segment lengths and the radii the 3D tail tapers through. */
const TY_TAIL = [1.05, 1.0, 0.95, 0.9, 0.85, 0.8];

/**
 * A fang: a flat triangle hanging from the lip at (x, y, z) of `j` (`dir` −1 down,
 * +1 up), its base slanted across the jaw so it reads as a tooth both in profile
 * and head-on; dark gaps between fangs are the gum behind them.
 */
function bossDFang(f: PixelFigure, j: THREE.Object3D, x: number, y: number, z: number, len: number, dir: number, sd: number, mat: number, s: number) {
  f.tri(f.at(j, x + sd * 0.04, y, z - 0.06), f.at(j, x - sd * 0.04, y, z + 0.06), f.at(j, x - sd * len * 0.22, y + dir * len, z + 0.015), mat, 0.004 * s).k(0.001).z(-0.1 * s).min(0.5);
}

/**
 * A fang drawn the way a sprite artist faces it at the player (head-on): a
 * triangle from the lip point `p`, its base across the screen, pointing along
 * `d` (a unit vector in the screen plane: down for the upper row, up for the lower).
 */
function bossDFangS(f: PixelFigure, p: THREE.Vector3, right: THREE.Vector3, d: THREE.Vector3, len: number, w: number, mat: number, s: number) {
  f.tri(f.add(p, right, -w), f.add(p, right, w), f.add(p, d, len), mat, 0.004 * s).k(0.001).z(-0.35 * s).min(0.5);
}

/**
 * Paint the Tyrant. `time` animates secondary motion (drool, flicker), `dead`
 * = the eyes have gone out (the death's last beat).
 */
export function bossDPaintTyrant(f: PixelFigure, T: BossDTyrantRig, time: number, dead: boolean): boolean {
  f.maxTexels = 240;
  const M = tm();
  const hp = T.hips;
  const h = T.head;
  const jw = T.jaw;
  const s = scaleOf(hp);
  const mem = (T.mem ??= bossDMem());
  const open = T.mouth.visible;
  const jawA = jw.rotation.x;
  const snoutTip = f.at(h, 0, -0.14, 1.95);
  const headOn = f.facing(snoutTip, Z(f, h));
  // The face turned to the lens (the chase, every bite / charge / lunge): a sprite
  // artist's rex face — brow crescents, a lit snout plane, fangs, the burning throat.
  const face = headOn > 0.5;
  const bodyDepth = f.depth(f.at(T.chest, 0, -0.3, -1.2));
  // Facing the lens: the body behind the head sinks a notch into shadow.
  const back = headOn > 0.3 ? -0.14 * Math.min(1, (headOn - 0.3) / 0.4) : 0;
  // Down on its side (knockdown, the death slide).
  const lying = f.dir(hp, 0, 1, 0).y < 0.55;
  const to = T.torso;
  const nk = T.neck;
  const bellyF = f.facing(f.at(to, 0, -0.9, 1.0), f.dir(to, 0, -1, 0.2));
  const backF = f.facing(f.at(to, 0, 1.1, 0.8), f.dir(to, 0, 1, 0));

  bossDSmear(f, mem, f.at(h, 0, 0, 0.9), f.at(T.chest, 0, -0.3, -0.6), 0.55 * s, 0.9 * s, M.hide, time, 0);

  // Which leg is nearer: its drumstick thigh melts into the flank (no sticker outline).
  const near = T.legs.length > 1 && f.depth(f.at(T.legs[1].knee, 0, 0, 0)) < f.depth(f.at(T.legs[0].knee, 0, 0, 0)) ? 1 : 0;

  // ── Body: hips, barrel torso in slices, pale belly, neck, whip tail (one layer) ──
  f.layer(0.3 * s, PART.TORSO, back);
  const tx = X(f, to);
  const ty = Y(f, to);
  f.ellipsoid(to, 0, 0.12, -0.45, 0.94, 1.06, 1.32, M.hide).u(0).k(0.3 * s);
  f.coneE(f.at(to, 0, 0.06, -0.3), f.at(to, 0, 0.16, 1.25), tx, ty, 1.0 * s, 1.16 * s, 1.08 * s, 1.26 * s, M.hide).u(0.4).k(0.35 * s);
  f.coneE(f.at(to, 0, 0.16, 1.25), f.at(to, 0, 0.36, 2.45), tx, ty, 1.08 * s, 1.26 * s, 0.9 * s, 1.04 * s, M.hide).u(2.0).k(0.35 * s);
  // The pale belly bulging under the chest (the 3D's belly blob), sagging into a round line.
  f.ellipsoid(to, 0, -0.62, 1.2, 0.68, 0.54, 1.18, bellyF > -0.2 ? M.belly : M.hide).u(1.2).k(0.3 * s);
  f.coneE(f.at(nk, 0, 0.01, -0.12), f.at(nk, 0, 0.03, 1.3), X(f, nk), Y(f, nk), 0.8 * s, 0.94 * s, 0.58 * s, 0.7 * s, M.hide).u(3.6).k(0.3 * s);
  // (Pattern u runs on unbroken down the tail: each segment starts where the last ended.)
  let u = 5;
  let r0x = 0.86;
  let r0y = 0.96;
  for (let i = 0; i < T.tail.length; i++) {
    const seg = T.tail[i];
    const len = TY_TAIL[i] ?? 0.8;
    const k = 0.72 - i * 0.04;
    const last = i === T.tail.length - 1;
    const r1x = last ? 0.05 : r0x * k;
    const r1y = last ? 0.05 : r0y * k;
    f.coneE(f.at(seg, 0, 0, 0.08), f.at(seg, 0, 0, -len - 0.02), X(f, seg), Y(f, seg), r0x * s, r0y * s, r1x * s, r1y * s, M.hide)
      .part(PART.TAIL)
      .u(u)
      .k(0.2 * s);
    u += (len + 0.1) * s;
    r0x = r1x;
    r0y = r1y;
  }
  // The near drumstick, melted into the flank: the thigh's front flows into the
  // belly, a dark crease and the lit crescent shape it.
  {
    const L = T.legs[near];
    const sd = near === 0 ? -1 : 1;
    f.coneE(f.at(L.hip, 0, 0.2, 0), f.at(L.hip, 0, -1.48, 0), X(f, L.hip), Z(f, L.hip), 0.58 * s, 0.68 * s, 0.36 * s, 0.4 * s, M.thigh).part(PART.LIMB).u(1.1 + near).k(0.12 * s);
    f.ellipsoid(L.hip, sd * 0.06, -0.35, 0.05, 0.52, 0.9, 0.74, M.thigh).part(PART.LIMB).u(1.4 + near).k(0.2 * s);
    f.decal(f.at(L.hip, sd * 0.3, 0.05, -0.66), f.at(L.hip, sd * 0.3, -1.25, -0.42), 0.06 * s, 0.04 * s, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.42).min(0.5);
    f.decal(f.at(L.hip, sd * 0.32, 0.12, 0.1), f.at(L.hip, sd * 0.32, 0.02, -0.6), 0.045 * s, 0.05 * s, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.3).min(0.5);
    f.decal(f.at(L.hip, sd * 0.3, -0.05, 0.6), f.at(L.hip, sd * 0.3, -1.0, 0.4), 0.05 * s, 0.04 * s, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(0.12).min(0.5);
  }
  // Pale throat and belly band (where the underside shows), a dark saddle down the back.
  if (bellyF > -0.2) {
    f.decal(f.at(nk, 0, -0.62, 0.0), f.at(nk, 0, -0.5, 1.25), 0.34 * s, 0.26 * s, M.belly).flag(PF.FLAT).min(0.5);
    f.decal(f.at(to, 0, -0.85, 2.2), f.at(to, 0, -0.95, 0.2), 0.42 * s, 0.4 * s, M.belly).flag(PF.FLAT).min(0.5);
  }
  if (backF > -0.25) {
    f.decal(f.at(to, 0, 1.15, -0.8), f.at(to, 0, 1.2, 2.3), 0.42 * s, 0.38 * s, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.2).min(0.5);
    f.decal(f.at(nk, 0, 0.75, -0.1), f.at(nk, 0, 0.62, 1.2), 0.3 * s, 0.22 * s, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.2).min(0.5);
  }

  // ── Scutes (armour): a row of small dark bony spikes down the spine — only those
  // standing out on the silhouette (none pointing at the lens like a row of bullets) ──
  f.layer(0.02 * s, PART.ARMOR, back);
  const up = f.dir(hp, 0, 1, 0);
  const vd = f.vec().subVectors(f.at(hp, 0, 1.2, 0.5), f.eye).normalize();
  const edgeOn = Math.abs(up.dot(vd)) < 0.6;
  for (let i = 0; i < 9; i++) {
    const z = -1.4 + i * 0.5;
    const y = 1.12 + Math.sin(((i + 1) / 10) * Math.PI) * 0.35;
    const sd = i % 2 ? 1 : -1;
    if (!edgeOn && i % 3 !== 1) continue;
    f.cone(f.at(hp, sd * 0.2, y - 0.08, z + 0.05), f.at(hp, sd * 0.24, y + 0.2, z - 0.08), 0.11 * s, 0.012 * s, M.scute).min(0.5);
  }
  for (let i = 0; i < 4; i++) {
    const sd = i % 2 ? 1 : -1;
    if (!edgeOn && i % 2) continue;
    f.cone(f.at(nk, sd * 0.18, 0.8 - i * 0.04, 0.05 + i * 0.32), f.at(nk, sd * 0.22, 1.0 - i * 0.04, -0.05 + i * 0.32), 0.09 * s, 0.01 * s, M.scute).min(0.5);
  }
  if (edgeOn) {
    let rr = 0.98;
    for (let i = 0; i < 4 && i < T.tail.length; i++) {
      f.cone(f.at(T.tail[i], 0, rr * 0.84, -(TY_TAIL[i] ?? 0.8) * 0.35), f.at(T.tail[i], 0, rr * 0.92 + 0.18, -(TY_TAIL[i] ?? 0.8) * 0.5), 0.07 * s, 0.01 * s, M.scute).part(PART.TAIL).min(0.5);
      rr *= 0.72 - i * 0.04;
    }
  }

  // ── Legs: (far drumstick), shin, metatarsus, three clawed toes ──
  for (let i = 0; i < T.legs.length; i++) {
    const L = T.legs[i];
    const sd = i === 0 ? -1 : 1;
    const mid = f.depth(f.at(L.knee, 0, 0, 0));
    f.layer(0.16 * s, PART.LIMB, (mid > bodyDepth + 0.3 ? -0.12 : 0) + back);
    if (i !== near) {
      f.coneE(f.at(L.hip, 0, 0.2, 0), f.at(L.hip, 0, -1.48, 0), X(f, L.hip), Z(f, L.hip), 0.58 * s, 0.68 * s, 0.36 * s, 0.4 * s, M.thigh).u(1.1 + i);
      f.ellipsoid(L.hip, sd * 0.06, -0.35, 0.05, 0.52, 0.9, 0.74, M.thigh).u(1.4 + i).k(0.2 * s);
    }
    f.coneE(f.at(L.knee, 0, 0.08, 0), f.at(L.knee, 0, -1.43, 0), X(f, L.knee), Z(f, L.knee), 0.36 * s, 0.42 * s, 0.22 * s, 0.26 * s, M.limb).u(2.6).k(0.1 * s);
    f.coneE(f.at(L.foot, 0, 0.9, 0), f.at(L.foot, 0, -0.02, 0), X(f, L.foot), Z(f, L.foot), 0.24 * s, 0.27 * s, 0.19 * s, 0.19 * s, M.limb).u(3.5).k(0.08 * s);
    f.ellipsoid(L.foot, 0, -0.06, -0.06, 0.2, 0.12, 0.24, M.limb).k(0.06 * s);
    for (let t = -1; t <= 1; t++) {
      const ta = t * 0.3;
      const tx0 = t * 0.17;
      const tip = f.at(L.foot, tx0 + Math.sin(ta) * 0.68, -0.08, Math.cos(ta) * 0.68);
      f.cone(f.at(L.foot, tx0, -0.08, 0.02), tip, 0.1 * s, 0.065 * s, M.limb).k(0.05 * s);
      f.cone(tip, f.at(L.foot, tx0 + Math.sin(ta) * 0.9, -0.16, Math.cos(ta) * 0.86), 0.055 * s, 0.01 * s, M.claw).k(0.01 * s).min(0.5);
    }
  }

  // ── Tiny arms (two claws), flailing; down on its side they fold in under the chest ──
  for (let i = 0; i < T.arms.length; i++) {
    const a = T.arms[i];
    const mid = f.depth(f.at(a, 0, 0, 0));
    f.layer(0.04 * s, PART.LIMB, mid > bodyDepth ? -0.1 : 0);
    const el = f.at(a, 0, -0.46, 0.02);
    f.cone(f.at(a, 0, 0.04, 0), el, 0.13 * s, 0.1 * s, M.limb);
    if (lying) continue;
    const wr = f.at(a, 0, -0.46 - 0.42 * 0.36, 0.02 + 0.42 * 0.93);
    f.cone(el, wr, 0.1 * s, 0.075 * s, M.limb).k(0.03 * s);
    for (let c = -1; c <= 1; c += 2) f.cone(f.add(wr, X(f, a), c * 0.04 * s), f.at(a, c * 0.05, -0.68, 0.58), 0.035 * s, 0.008 * s, M.claw).k(0.008 * s).min(0.5);
  }

  bossDTyrantHead(f, T, M, s, time, dead, open, jawA, face, snoutTip, headOn);
  return true;
}

/** The Tyrant's head: skull, brows and horns (armour), fangs, eyes (weak), the open mouth (weak). */
function bossDTyrantHead(f: PixelFigure, T: BossDTyrantRig, M: typeof TM, s: number, time: number, dead: boolean, open: boolean, jawA: number, face: boolean, snoutTip: THREE.Vector3, headOn: number) {
  const h = T.head;
  const jw = T.jaw;
  // ── Head: a massive skull (own layer: it contours against the neck behind) ──
  f.layer(0.12 * s, PART.TORSO);
  const hx = X(f, h);
  const hy = Y(f, h);
  f.coneE(f.at(h, 0, 0.06, -0.12), f.at(h, 0, 0.04, 0.98), hx, hy, 0.58 * s, 0.62 * s, 0.52 * s, 0.56 * s, M.head).u(0.2).k(0.16 * s);
  f.ellipsoid(h, 0, 0.12, 0.3, 0.6, 0.6, 0.55, M.head).u(0.6).k(0.16 * s);
  f.coneE(f.at(h, 0, 0.0, 0.92), snoutTip, hx, hy, 0.5 * s, 0.48 * s, 0.29 * s, 0.29 * s, M.head).u(1.1).k(0.12 * s);
  const topF = f.facing(f.at(h, 0, 0.3, 1.4), f.dir(h, 0, 1, 0.25));
  if (topF > -0.05) {
    if (face) {
      // Head-on the muzzle is seen end-on: its top plane lit, its lip edge a dark
      // line the fangs hang from.
      f.decal(f.at(h, 0, 0.3, 1.2), f.at(h, 0, 0.14, 1.9), 0.3 * s, 0.2 * s, M.head).flag(PF.FLAT | PF.SHADE_ONLY).tone(0.16).min(0.5);
      for (let sd = 1; sd >= -1; sd -= 2) f.decal(f.at(h, sd * 0.47, -0.24, 0.85), f.at(h, sd * 0.1, -0.3, 1.9), 0.05 * s, 0.05 * s, M.head).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.45).min(0.5);
    } else {
      // Snout ridge (darker), wrinkles across the nose.
      f.decal(f.at(h, 0, 0.62, 0.5), f.at(h, 0, 0.16, 1.86), 0.24 * s, 0.1 * s, M.back).flag(PF.FLAT).min(0.5);
      for (let i = 0; i < 3; i++) {
        const z = 1.25 + i * 0.2;
        f.decal(f.at(h, -0.3 + i * 0.03, 0.22 - i * 0.06, z), f.at(h, 0.3 - i * 0.03, 0.22 - i * 0.06, z + 0.04), 0.022 * s, 0.022 * s, M.head).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.3).min(0.5);
      }
    }
    // A scar across the muzzle.
    f.decal(f.at(h, 0.35, 0.3, 0.55), f.at(h, 0.2, 0.05, 1.05), 0.03 * s, 0.025 * s, M.scar).flag(PF.FLAT).min(0.5);
  }
  // Nostrils: pits on the snout tip.
  if (headOn > -0.3) {
    for (let sd = 1; sd >= -1; sd -= 2) {
      if (face) f.decal(f.at(h, sd * 0.08, 0.06, 1.95), f.at(h, sd * 0.2, 0.12, 1.9), 0.028 * s, 0.022 * s, M.nostril).flag(PF.FLAT).min(0.5);
      else f.decal(f.at(h, sd * 0.12, 0.06, 1.9), f.at(h, sd * 0.2, 0.03, 1.86), 0.035 * s, 0.025 * s, M.nostril).flag(PF.FLAT).min(0.5);
    }
  }
  // Head-on the fangs are drawn facing the player: pointing down the screen from the
  // upper lip, up the screen from the lower one (whatever the head's pitch does to them).
  const vd = f.vec().subVectors(snoutTip, f.eye).normalize();
  const sDown = f.vec().set(0, -1, 0).addScaledVector(vd, vd.y).normalize();
  const sUp = f.vec().copy(sDown).multiplyScalar(-1);
  const sRight = f.vec().crossVectors(vd, sDown).normalize();
  if (!face) {
    // Upper lip: a red gum line, fangs hanging from it one by one (where the 3D teeth are).
    for (let sd = 1; sd >= -1; sd -= 2) {
      f.cone(f.at(h, sd * 0.46, -0.28, 0.72), f.at(h, sd * 0.26, -0.37, 1.86), 0.06 * s, 0.045 * s, M.gum).k(0.02 * s);
      for (let i = 0; i < 6; i++) {
        const t = 0.03 + i * 0.19;
        const w = 0.48 + (0.27 - 0.48) * t;
        const y = -0.31 - t * 0.12;
        const z = 0.75 + t * 1.12;
        const len = 0.26 - 0.06 * t + 0.05 * Math.sin(i * 2.3 + sd);
        bossDFang(f, h, sd * w, y + 0.02, z, len, -1, sd, M.teeth, s);
      }
    }
  }
  // Jaw (own primitive on the jaw joint; a small blend keeps the gape open) + lower fangs.
  const jx = X(f, jw);
  const jy = Y(f, jw);
  f.coneE(f.at(jw, 0, -0.12, 0.0), f.at(jw, 0, -0.16, 1.88), jx, jy, 0.48 * s, 0.23 * s, 0.26 * s, 0.13 * s, M.head).u(0.3).k(jawA > 0.2 ? 0.02 * s : 0.08 * s);
  if (f.facing(f.at(jw, 0, -0.3, 0.6), f.dir(jw, 0, -1, 0)) > -0.1) f.ellipsoid(jw, 0, -0.26, 0.6, 0.36, 0.14, 0.62, face ? M.head : M.belly).k(0.08 * s).z(-0.02 * s);
  for (let sd = 1; sd >= -1 && !face; sd -= 2) {
    for (let i = 0; i < 5; i++) {
      const t = 0.06 + i * 0.22;
      const w = 0.42 + (0.24 - 0.42) * t;
      const z = 0.65 + t * 1.1;
      const len = 0.2 - 0.05 * t + 0.03 * Math.sin(i * 1.9 - sd);
      bossDFang(f, jw, sd * w, -0.02, z, len, 1, sd, M.teeth, s);
    }
  }
  if (open) {
    // The open mouth faces us: the jaw floor and the palate are wet gum, not hide;
    // the palate glows with the throat's heat.
    if (f.facing(f.at(jw, 0, 0.1, 1.0), f.dir(jw, 0, 1, 0)) > 0.05) f.decal(f.at(jw, 0, 0.1, 0.25), f.at(jw, 0, 0.06, 1.6), 0.3 * s, 0.15 * s, M.gullet).flag(PF.FLAT);
    if (face && f.facing(f.at(h, 0, -0.36, 1.1), f.dir(h, 0, -1, 0)) > 0.05) {
      f.decal(f.at(h, 0, -0.36, 0.4), f.at(h, 0, -0.38, 1.7), 0.36 * s, 0.22 * s, M.gum).flag(PF.FLAT).tone(-0.2);
      f.decal(f.at(h, 0, -0.37, 0.35), f.at(h, 0, -0.37, 0.85), 0.24 * s, 0.16 * s, M.heat).flag(PF.FLAT).min(0.5);
    }
  }
  // Eye sockets: crescents of shadow under the brow.
  for (let i = 0; i < T.eyes.length; i++) {
    const sd = i === 0 ? -1 : 1;
    const c = f.at(h, sd * 0.5, 0.33, 0.8);
    if (f.facing(c, f.dir(h, sd, 0.2, 0.5)) < -0.1) continue;
    f.decal(f.at(h, sd * 0.56, 0.4, 0.58), f.at(h, sd * 0.42, 0.42, 0.98), 0.1 * s, 0.08 * s, M.head).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.45).min(0.5);
  }
  // The halos (weak): the eyes' amber light on the skin round them, a little over
  // half the halo's size, melted into the head (never a disc standing off it).
  if (!dead) {
    for (let i = 0; i < T.halos.length; i++) {
      const sd = i === 0 ? -1 : 1;
      if (!T.halos[i].visible || f.facing(f.at(T.eyes[i], 0, 0, 0), f.dir(h, sd, 0.15, 0.6)) < -0.1) continue;
      // (Head-on, pulled in over the eye so it never stands off the skull like an ear.)
      if (face) f.ellipsoid(T.halos[i], -sd * 0.07, 0.01, 0, 0.1, 0.12, 0.1, M.spill).part(PART.WEAK).flag(PF.FLAT).tone(0.1).k(0.04 * s).z(-0.02 * s);
      else f.ellipsoid(T.halos[i], 0, 0, 0, 0.14, 0.14, 0.12, M.spill).part(PART.WEAK).flag(PF.FLAT).tone(0.1).k(0.04 * s).z(-0.02 * s);
    }
  }

  if (face) {
    // ── Head-on fangs: their own layer in front of the head (the palate painted on
    // the head never covers them; an ink line rings each one). The upper lip is
    // an ARCH over the mouth — from one corner over the front of the muzzle to the
    // other — a red gum line with a row of fangs hanging from it, the long ones at
    // the front (end-on the 3D rows would stack into two clumps at the sides).
    f.layer(0.02 * s, PART.TORSO, 0, -0.08 * s);
    const cL = f.at(h, 0.47, -0.28, 0.78);
    const cR = f.at(h, -0.47, -0.28, 0.78);
    const fr = f.at(h, 0, -0.38, 1.9);
    const ctl = f.vec().copy(fr).multiplyScalar(2).addScaledVector(cL, -0.5).addScaledVector(cR, -0.5);
    const A = f.vec();
    const B = f.vec();
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const q = 1 - t;
      A.copy(cL).multiplyScalar(q * q).addScaledVector(ctl, 2 * t * q).addScaledVector(cR, t * t);
      if (i > 0) f.cone(B, A, 0.07 * s, 0.07 * s, M.gum).k(0.02 * s).z(-0.3 * s);
      B.copy(A);
    }
    for (let i = 0; i < 9; i++) {
      const t = 0.06 + i * 0.11;
      const q = 1 - t;
      A.copy(cL).multiplyScalar(q * q).addScaledVector(ctl, 2 * t * q).addScaledVector(cR, t * t);
      const mid = 1 - Math.abs(t - 0.5) * 2;
      const len = (0.2 + 0.14 * mid + 0.04 * Math.sin(i * 2.3)) * s;
      bossDFangS(f, A, sRight, sDown, len, (0.045 + 0.015 * mid) * s, M.teeth, s);
    }
    // The lower rows climb the jaw's rims from the corners, pointing up the screen.
    for (let sd = 1; sd >= -1; sd -= 2) {
      for (let i = 0; i < 5; i++) {
        const t = 0.06 + i * 0.22;
        const w = 0.42 + (0.24 - 0.42) * t;
        const z = 0.65 + t * 1.1;
        const len = 0.2 - 0.05 * t + 0.03 * Math.sin(i * 1.9 - sd);
        bossDFangS(f, f.at(jw, sd * w, -0.04, z), sRight, sUp, len * 1.25 * s, 0.055 * s, M.teeth, s);
      }
    }
  }

  // ── Brows and cheek horns (armour) ──
  f.layer(0.03 * s, PART.ARMOR);
  for (let sd = 1; sd >= -1; sd -= 2) {
    // Brow ridges: a bony scowl over each eye, highest at the back (a V from the front).
    if (face) {
      // Head-on the brow ridges are a scowl: heavy bony bars slanting down from over
      // each eye toward the muzzle (end-on they would be two knobs, like ears).
      f.cone(f.at(h, sd * 0.48, 0.56, 0.6), f.at(h, sd * 0.12, 0.36, 1.15), 0.13 * s, 0.07 * s, M.back).k(0.03 * s).z(-0.3 * s);
    } else {
      f.cone(f.at(h, sd * 0.3, 0.6, 0.3), f.at(h, sd * 0.44, 0.52, 0.95), 0.13 * s, 0.09 * s, M.back).k(0.04 * s);
      f.cone(f.at(h, sd * 0.38, 0.68, 0.4), f.at(h, sd * 0.46, 0.6, 0.66), 0.1 * s, 0.08 * s, M.back).k(0.04 * s);
    }
    if (face) f.cone(f.at(h, sd * 0.5, 0.2, 0.15), f.at(h, sd * 0.66, 0.26, 0.12), 0.08 * s, 0.02 * s, M.horn).min(0.5);
    else f.cone(f.at(h, sd * 0.52, 0.2, 0.15), f.at(h, sd * 0.78, 0.3, 0.15), 0.11 * s, 0.02 * s, M.horn).min(0.5);
  }

  // ── Eyes (weak): small, deep-set, burning amber; a slit pupil; shut in death ──
  f.layer(0.004 * s, PART.WEAK, 0, -0.2 * s);
  const headTx = f.px(f.at(h, 0, 0, 0.8), 1.2 * s) / f.kHint;
  for (let i = 0; i < T.eyes.length; i++) {
    const e = T.eyes[i];
    const c = f.at(e, 0, 0, 0);
    const sd = i === 0 ? -1 : 1;
    if (f.facing(c, f.dir(h, sd, 0.15, 0.6)) < -0.05) continue;
    if (dead) {
      // A closed slit: the lid's dark line along the eye.
      f.ellipsoid(e, 0, 0, 0, 0.1, 0.11, 0.13, M.head).flag(PF.FLAT).tone(-0.15).min(0.6);
      f.decal(f.at(e, 0, 0, -0.13), f.at(e, 0, -0.02, 0.13), 0.022 * s, 0.022 * s, M.eyeDead).flag(PF.FLAT).min(0.5);
      continue;
    }
    if (face) {
      // Head-on: a burning slit under the brow, set into the skull's edge.
      f.ellipsoid(e, -sd * 0.03, 0, 0, 0.08, 0.06, 0.12, M.eye).flag(PF.FLAT).min(0.6);
      continue;
    }
    f.ellipsoid(e, 0, 0, 0, 0.13, 0.14, 0.17, M.rim).flag(PF.FLAT).min(0.6);
    f.ellipsoid(e, 0, 0, 0, 0.1, 0.11, 0.13, M.eye).flag(PF.FLAT).z(-0.01 * s).min(0.6);
    if (headTx >= 14) {
      const size = stampSize(headTx * 0.75);
      const mirror = f.project(snoutTip, P0).x < f.project(c, P1).x;
      f.stamp(c, (0.24 * s) / (size === 0 ? 2.2 : size === 1 ? 3.2 : 4.2), STAMP.reye[size], M.eye, M.pupil, 0, 0, mirror);
    } else {
      f.decal(c, c, 0.025 * s, 0.06 * s, M.pupil).flag(PF.FLAT).min(0.45);
    }
  }

  // ── The open mouth (weak): the throat burning deep in a dark gullet, the heat on
  // the palate above it, the tongue on the jaw's floor, drool ──
  if (open) {
    f.layer(0.02 * s, PART.WEAK, 0, -0.04 * s);
    const mo = T.mouth;
    const th = T.throat;
    // Dark gullet ring round the throat (deeper than the glow, wider than it).
    f.ellipsoid(mo, 0, -0.04, 0.1, 0.4, 0.3, 0.26, M.deep).flag(PF.FLAT).z(0.06 * s);
    f.ellipsoid(th, 0, 0.02, 0, 0.28, 0.28, 0.28, M.throat).flag(PF.FLAT);
    f.ellipsoid(th, 0, 0.06, 0.05, 0.17, 0.17, 0.17, M.throatHot).flag(PF.FLAT).z(-0.03 * s);
    f.ellipsoid(th, 0, 0.09, 0.1, 0.08, 0.08, 0.08, M.throatCore).flag(PF.FLAT).z(-0.06 * s).min(0.6);
    // The tongue lies on the floor of the jaw, its tip half way to the chin; the
    // jaw floor in front of it is dark wet gum.
    const tg = T.tongue;
    f.coneE(f.at(tg, 0, 0.0, -0.52), f.at(tg, 0, 0.01, -0.14), X(f, tg), Y(f, tg), 0.17 * s, 0.05 * s, 0.13 * s, 0.045 * s, M.tongue).z(-0.04 * s);
    f.coneE(f.at(tg, 0, -0.02, -0.14), f.at(tg, 0, -0.02, 0.5), X(f, tg), Y(f, tg), 0.17 * s, 0.03 * s, 0.14 * s, 0.03 * s, M.gullet).flag(PF.FLAT).z(0.02 * s);
    // Drool strands between the jaws (swaying, breaking now and then).
    if (jawA > 0.5) {
      for (let sd = 1; sd >= -1; sd -= 2) {
        if (Math.sin(time * 1.7 + sd * 2) < -0.6) continue;
        const sw = Math.sin(time * 5 + sd) * 0.03;
        const a = f.at(h, sd * 0.36, -0.42, 1.05);
        const b = f.at(jw, sd * 0.32 + sw, 0.08, 0.9);
        f.cone(a, f.mix(a, b, 0.55), 0.022 * s, 0.012 * s, M.saliva).flag(PF.NO_OUTLINE).min(0.45).z(-0.3 * s);
        f.cone(f.mix(a, b, 0.55), b, 0.012 * s, 0.02 * s, M.saliva).flag(PF.NO_OUTLINE).min(0.45).z(-0.3 * s);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// A boss's carcass (ART: SPRITES keeps painting it)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What is left in the world once a boss's entity is gone (the Tyrant's body for
 * the escape shot): it holds the model and keeps it painted in SPRITES — before,
 * the bare model was parented to the scene and popped back to 3D. No hitboxes,
 * not hostile, never aimed at or counted (dying, a boss: outside every wave,
 * slot, corpse-budget and target query), no rng draws, no AI.
 */
class BossDCarcass extends Enemy {
  override hostile = false;
  override assistable = false;
  override isBoss = true;
  override usesAttackSlot = false;
  override name = 'carcass';

  constructor(
    world: World,
    private readonly body: THREE.Object3D,
    private readonly paint: (f: PixelFigure) => boolean,
  ) {
    // Rooted where the boss stood (its blob shadow sits under the body).
    super(world, { pos: body.parent ? body.parent.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: {} });
    this.state = 'dying';
    this.hp = 0;
  }

  protected build(): void {}

  /** (No configure / build / entry / rng: it only takes the body over.) */
  override onAdded(): void {
    this.root.updateMatrixWorld(true);
    this.model.attach(this.body);
  }

  override update(dt: number): void {
    this.age += dt;
  }

  override paintPixels(f: PixelFigure): boolean {
    return this.body.visible && this.paint(f);
  }
}

/**
 * The carcass entity for a boss whose entity is about to be removed: add it to
 * the world instead of re-parenting the model to the scene (`paint` = the boss's
 * own painter, called with its final pose).
 */
export function bossDCarcass(world: World, model: THREE.Object3D, paint: (f: PixelFigure) => boolean): Enemy {
  return new BossDCarcass(world, model, paint);
}

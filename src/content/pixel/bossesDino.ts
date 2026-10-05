import * as THREE from 'three';
import type { TheroRig, TheroSpec } from '../enemies/dinoKit';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat } from '../../gameplay/pixel/materials';
import { STAMP, stampSize } from '../../gameplay/pixel/stamps';
import { dinoMats, type DinoMats } from './theropod';

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

export interface BossDSpecimenRig {
  r: TheroRig;
  s: TheroSpec;
  /** The same spec in the cloak's dark slate palette (materials while it fades into the dark). */
  sCloak: TheroSpec;
  /** Quill pivots: neck, chest, hips, tail base (they raise / rattle / scale). */
  quills: readonly THREE.Object3D[];
  eyes: readonly THREE.Object3D[];
  halos: readonly THREE.Object3D[];
  mem: BossDMem;
}

/** Quill rows as built by the boss (pivot-local): count, length, spread, z0, z1, y. */
const SX_QUILLS: readonly (readonly [number, number, number, number, number, number])[] = [
  [3, 0.22, 0.05, 0.05, 0.3, 0.128],
  [6, 0.42, 0.09, 0.87, 0.02, 0.3128],
  [3, 0.36, 0.08, 0.15, -0.3, 0.2944],
  [3, 0.26, 0.06, -0.05, -0.38, 0.204],
];

/**
 * What the painter reads from the boss (built once). `weak` = the boss's weak
 * meshes in registration order (eye, halo, eye, halo, stripes…). The soft halos
 * stay live alpha-blended glows over the sprite (like every glow halo); the
 * painter draws the crisp eye and a ring of light inside them.
 */
export function bossDSpecimenRig(r: TheroRig, s: TheroSpec, quills: readonly THREE.Object3D[], weak: readonly THREE.Object3D[]): BossDSpecimenRig {
  const sCloak: TheroSpec = { ...s, pal: { ...s.pal, key: 'sxcloak', base: 0x3c3e48, back: 0x2c2c36, belly: 0x4c4e5a, stripe: 0x282830, accent: 0x5c5c66, accent2: 0x34343e, claw: 0x16161c, teeth: 0x9a9a98, mouth: 0x2a0a14 } };
  return { r, s, sCloak, quills, eyes: [weak[0], weak[2]], halos: [weak[1], weak[3]], mem: bossDMem() };
}

const XM = {
  ready: false,
  stripe: [0, 0, 0, 0],
  stripeR: [0, 0, 0, 0],
  eye: [0, 0, 0, 0],
  eyeR: [0, 0, 0, 0],
  core: 0,
  coreR: 0,
  spill: 0,
  spillR: 0,
  spill2: 0,
  spill2R: 0,
  quill: 0,
  quillTip: 0,
  quillDark: 0,
  quillTipDark: 0,
  scythe: 0,
  edge: 0,
  gum: 0,
  deep: 0,
  tongue: 0,
  throatGlow: 0,
  dart: 0,
  dartGlow: 0,
  dartHalo: 0,
  dartHalo2: 0,
};

function xm() {
  if (!XM.ready) {
    XM.ready = true;
    // Stripes: off (dead tissue), dim, glowing, flaring — cyan, purple when enraged.
    XM.stripe = [Mat.flat(0x5a6670, 'sxdead'), Mat.glow(0x2a9ec4), Mat.glow(0x5ae0ff), Mat.glow(0xb8f6ff)];
    XM.stripeR = [XM.stripe[0], Mat.glow(0x7a3cb0), Mat.glow(0xc070ff), Mat.glow(0xead0ff)];
    XM.eye = [Mat.flat(0x3a4048, 'sxeye'), Mat.glow(0x3aa8c8), Mat.glow(0x8af0ff), Mat.glow(0xd8fcff)];
    XM.eyeR = [XM.eye[0], Mat.glow(0xa02838), Mat.glow(0xff4060), Mat.glow(0xffb0b8)];
    XM.core = Mat.glow(0xf2ffff);
    XM.coreR = Mat.glow(0xfff0f4);
    // Light spilling from the eyes onto the skin (the halo hitboxes): lit hide, then a glow ring.
    XM.spill = Mat.hide(0xb6e2ea, { scale: 0.2 });
    XM.spillR = Mat.hide(0xeab8c6, { scale: 0.2 });
    XM.spill2 = Mat.glow(0x78d8ee);
    XM.spill2R = Mat.glow(0xe87890);
    XM.quill = Mat.bone(0xe8e2d4);
    XM.quillTip = Mat.bone(0x9a9284);
    XM.scythe = Mat.gloss(0x24262c);
    XM.edge = Mat.flat(0xc8d0dc, 'sxedge');
    XM.gum = Mat.gore(0x8a2a3a);
    XM.deep = Mat.mouth(0x2a0810);
    XM.tongue = Mat.gore(0xa84858);
    XM.dart = Mat.bone(0xe8e2d4);
    XM.dartGlow = Mat.glow(0x60e8ff);
    XM.dartHalo = Mat.glow(0x2a8ab0);
    XM.dartHalo2 = Mat.glow(0x9af4ff);
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
  // Cloak: the hide sinks down its ramp, then into a dark slate palette (glows stay lit).
  const ck = Math.min(1, Math.max(0, cloak));
  const M = dinoMats(ck >= 0.5 ? R.sCloak : s);
  const dark = ck < 0.5 ? -0.9 * (ck / 0.5) : -0.25 - 0.45 * ((ck - 0.5) / 0.5);
  const XS = xm();
  const sc = scaleOf(r.pelvis);
  const T = s.torso;
  const sk = s.skull;
  const sn = s.snout;
  const J = s.jaw;
  const h = r.head;
  const lvS = bossDLevel(stripeC);
  const lvE = bossDLevel(eyeC);
  const stripeM = rage ? XS.stripeR[lvS] : XS.stripe[lvS];
  const eyeM = rage ? XS.eyeR[lvE] : XS.eye[lvE];
  const torsoDepth = f.depth(f.at(r.chest, 0, 0, T.len * 0.4));
  const snoutY0 = -sk.r[1] * 0.12;
  const sr0x = sk.r[0] * 0.85;
  const sr0y = sk.r[1] * 0.78;
  const snoutTip = f.at(h, 0, snoutY0 - sn.drop, sk.len + sn.len);
  const headOn = f.facing(snoutTip, Z(f, h));
  const maw = headOn > 0.6;
  const headTx = f.px(f.at(h, 0, 0, sk.len * 0.5), sk.r[1] * 2 * sc) / f.kHint;

  // ── Smears: a pounce streaks back along its path ──
  bossDSmear(f, R.mem, f.at(h, 0, 0, sk.len * 0.5), f.at(r.chest, 0, 0, T.len * 0.5), sk.r[1] * 0.9 * sc, T.r1[1] * 0.8 * sc, M.hide, time, dark);

  // ── Body line: snout → skull → neck → chest → hips → tail (one melted layer) ──
  if (maw) f.layer(0.04 * sc, PART.HEAD, dark);
  else f.layer(0.05 * sc, PART.TORSO, dark);
  let u = 0;
  const hx = X(f, h);
  const hy = Y(f, h);
  // Head: a long wedge (skull tapering into the snout), the cranium swelling behind the eyes.
  f.coneE(snoutTip, f.at(h, 0, snoutY0 * 0.5, sk.len * 0.35), hx, hy, sn.r1[0] * sc, sn.r1[1] * sc, sr0x * 0.98 * sc, sr0y * 1.05 * sc, M.hide).part(PART.HEAD).u(u).k(0.03 * sc);
  u += sn.len + sk.len * 0.6;
  f.ellipsoid(h, 0, sk.r[1] * 0.06, sk.len * 0.3, sk.r[0] * 0.94, sk.r[1] * 0.92, sk.len * 0.62, M.hide).part(PART.HEAD).u(u).k(0.045 * sc);
  u += sk.len * 0.5;
  // Heavy brow ridges (a V of bone from the front: the scowl).
  for (let sd = 1; sd >= -1; sd -= 2) {
    f.cone(f.at(h, sd * sk.r[0] * 0.66, sk.r[1] * 0.82, sk.len * 0.8), f.at(h, sd * sk.r[0] * 0.48, sk.r[1] * 0.92, sk.len * 0.1), 0.026 * sc, 0.034 * sc, M.back).part(PART.HEAD).k(0.02 * sc);
  }
  // Jaw: its own primitive on the jaw joint, a small blend so the gape stays open.
  if (r.jaw) {
    f.coneE(f.at(r.jaw, 0, 0, -0.04), f.at(r.jaw, 0, -0.005, J.len - 0.03), X(f, r.jaw), Y(f, r.jaw), J.r0[0] * sc, J.r0[1] * sc, J.r1[0] * sc, J.r1[1] * sc, M.hide).part(PART.HEAD).u(0.1).k(0.012 * sc);
    for (let sd = 1; sd >= -1; sd -= 2) {
      f.cone(f.at(r.jaw, sd * J.r0[0] * 0.7, J.r0[1] * 0.7, 0.04), f.at(r.jaw, sd * J.r1[0] * 0.6, J.r1[1] * 0.65, J.len * 0.9), 0.02 * sc, 0.013 * sc, M.teeth).part(PART.HEAD).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(0.03).seed(2 + sd);
    }
    if (!maw) f.cone(f.at(r.jaw, 0, -J.r0[1] * 0.6, 0.02), f.at(r.jaw, 0, -J.r0[1] * 1.5, -0.04), J.r0[0] * 0.55 * sc, J.r0[0] * 0.3 * sc, M.belly).k(0.02 * sc).part(PART.HEAD);
  }
  for (let sd = 1; sd >= -1; sd -= 2) {
    f.cone(f.at(h, sd * sr0x * 0.75, snoutY0 - sr0y * 0.68, sk.len * 0.85), f.at(h, sd * sn.r1[0] * 0.7, snoutY0 - sn.drop - sn.r1[1] * 0.7, sk.len + sn.len * 0.9), 0.022 * sc, 0.015 * sc, M.teeth).part(PART.HEAD).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(0.03).seed(5 + sd);
  }
  // Crest quills on the skull (two rows splayed into a V), bristling.
  const q = s.quills * (1 + quill * 0.35);
  for (let i = 0; i < 2; i++) {
    for (let sd = 1; sd >= -1; sd -= 2) {
      const z = sk.len * 0.55 - i * 0.12 * s.quills;
      const len = 0.11 * q * (1 - i * 0.12);
      const sway = Math.sin(time * (7 + quill * 30) + i + sd) * (0.006 + quill * 0.01);
      f.cone(f.at(h, sd * sk.r[0] * 0.3, sk.r[1] * 0.78, z), f.at(h, sd * (sk.r[0] * 0.3 + len * 0.35) + sway, sk.r[1] * 0.78 + len * 0.6, z - len * 0.75), 0.02 * s.quills * sc, 0.004 * sc, (i + (sd > 0 ? 0 : 1)) % 2 ? M.acc2 : M.acc)
        .part(PART.NONE)
        .k(0.01 * sc)
        .min(0.5);
    }
  }
  if (maw) {
    bossDSpecimenMaw(f, R, M, XS, sc, snoutTip, eyeM, rage, headTx, dark);
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
      M.hide,
    )
      .u(u)
      .k(0.05 * sc);
    u += len;
  }
  // Deep chest tapering to the hips (breathing swells it), hips, whip tail.
  const br = r.torso.scale.y;
  // (Two slices: the 3D torso bulges ~10 % at mid-length.)
  const cx = X(f, r.chest);
  const cy = Y(f, r.chest);
  const mx = (T.r0[0] + T.r1[0]) * 0.5 * 1.05;
  const my = (T.r0[1] + T.r1[1]) * 0.5 * 1.05;
  f.coneE(f.at(r.chest, 0, T.rise, T.len), f.at(r.chest, 0, T.rise * 0.25, T.len * 0.48), cx, cy, T.r1[0] * 0.96 * sc * br, T.r1[1] * 1.02 * sc * br, mx * sc * br, my * sc * br, M.hide)
    .u(u)
    .k(0.07 * sc);
  f.coneE(f.at(r.chest, 0, T.rise * 0.25, T.len * 0.48), f.at(r.chest, 0, 0, 0.0), cx, cy, mx * sc * br, my * sc * br, T.r0[0] * 0.96 * sc * br, T.r0[1] * 0.97 * sc * br, M.hide)
    .u(u + T.len * 0.5)
    .k(0.07 * sc);
  u += T.len;
  f.ellipsoid(r.body, 0, 0.02, -0.08, s.hips[0] * 0.9, s.hips[1] * 0.95, s.hips[2] * 0.95, M.hide).u(u).k(0.08 * sc);
  u += s.hips[2];
  let trx = s.tail.r0[0];
  let try_ = s.tail.r0[1];
  for (let i = 0; i < r.tail.length; i++) {
    const seg = r.tail[i];
    const len = s.tail.lens[i];
    const last = i === r.tail.length - 1;
    const r1x = last ? 0.012 : trx * s.tail.taper;
    const r1y = last ? 0.014 : try_ * s.tail.taper;
    f.coneE(f.at(seg, 0, 0, 0.04), f.at(seg, 0, 0, -len), X(f, seg), Y(f, seg), trx * 0.93 * sc, try_ * 0.93 * sc, r1x * 0.93 * sc, r1y * 0.93 * sc, M.hide).part(PART.TAIL).u(u).k(0.05 * sc);
    u += len * (1.25 + i * 0.25);
    trx = r1x;
    try_ = r1y;
  }
  if (!maw) {
    // Face: a dark mask band through the eye; nostrils.
    for (let sd = 1; sd >= -1; sd -= 2) {
      const eyeP = f.at(h, sd * sk.r[0] * 0.86, sk.r[1] * 0.32, sk.len * 0.42);
      if (f.facing(eyeP, f.dir(h, sd, 0.25, 0.35)) < 0.05) continue;
      f.decal(f.at(h, sd * sk.r[0] * 0.8, sk.r[1] * 0.3, sk.len * 0.9), f.at(h, sd * sk.r[0] * 0.8, sk.r[1] * 0.36, sk.len * 0.02), 0.024 * sc, 0.028 * sc, M.hide)
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

  // ── Throat behind the gape (dark, wet) ──
  if (r.jaw && r.jaw.rotation.x > 0.08 && !maw) {
    f.layer(0.02 * sc, PART.HEAD, dark * 0.5, 0.04 * sc);
    const tipU = f.at(h, 0, snoutY0 - sn.drop - sn.r1[1] * 0.5, sk.len + sn.len * 0.7);
    const tipJ = f.at(r.jaw, 0, J.r1[1] * 0.5, J.len * 0.7);
    const mid = f.mix(tipU, tipJ, 0.5);
    const gap = tipU.distanceTo(tipJ);
    const hinge = f.mix(f.at(h, 0, snoutY0 - sr0y * 0.4, sk.len * 0.3), f.at(r.jaw, 0, J.r0[1] * 0.3, 0.06), 0.5);
    f.cone(hinge, mid, sk.r[1] * 0.12 * sc, Math.min(sk.r[1] * 0.4 * sc, Math.max(0.008, gap * 0.22)), XS.gum);
    f.cone(hinge, f.mix(hinge, mid, 0.6), sk.r[1] * 0.08 * sc, Math.min(sk.r[1] * 0.2 * sc, Math.max(0.006, gap * 0.1)), M.throat).z(-0.01);
  }

  // ── Bioluminescent stripes (weak): glowing arcs on the side facing us ──
  f.layer(0.004 * sc, PART.WEAK, 0, -0.05 * sc);
  for (let sd = 1; sd >= -1; sd -= 2) {
    if (f.facing(f.at(r.chest, sd * T.r0[0], 0, T.len * 0.5), f.dir(r.chest, sd, 0.15, 0)) > -0.02) {
      for (let k = 0; k < 4; k++) {
        const t = 0.18 + k * 0.215;
        const rx = (T.r0[0] + (T.r1[0] - T.r0[0]) * t) * 1.05 * 1.03;
        const ry = (T.r0[1] + (T.r1[1] - T.r0[1]) * t) * 1.05 * 1.03;
        bossDArc(f, r.chest, sd, -0.02 + t * T.len, T.rise * t * t, rx, ry, -0.5, 0.9, 0.034 * sc, stripeM);
      }
    }
    const n0 = r.neck[0];
    if (f.facing(f.at(n0, sd * s.neck.r0[0], 0, s.neck.lens[0] * 0.3), f.dir(n0, sd, 0.2, 0)) > -0.02) {
      const rx = (s.neck.r0[0] + (s.neck.r1[0] - s.neck.r0[0]) * 0.25) * 1.05 * 1.03;
      const ry = (s.neck.r0[1] + (s.neck.r1[1] - s.neck.r0[1]) * 0.25) * 1.05 * 1.03;
      for (let k = 0; k < 2; k++) bossDArc1(f, n0, sd, (k === 0 ? 0.1 : 0.45) * s.neck.lens[0], 0, rx, ry, -0.4, 1.0, 0.03 * sc, stripeM);
    }
    const t0 = r.tail[0];
    if (f.facing(f.at(t0, sd * s.tail.r0[0], 0, -s.tail.lens[0] * 0.5), f.dir(t0, sd, 0.2, 0)) > -0.02) {
      for (let k = 0; k < 3; k++) {
        const t = 0.15 + k * 0.35;
        bossDArc1(f, t0, sd, -t * s.tail.lens[0], 0, s.tail.r0[0] * (1 - t * 0.3) * 1.03, s.tail.r0[1] * (1 - t * 0.3) * 1.03, -0.3, 1.1, 0.03 * sc, stripeM);
      }
    }
  }
  // Crest line down the skull.
  f.cone(f.at(h, 0, sk.r[1] * 1.0, sk.len * 0.72), f.at(h, 0, sk.r[1] * 0.97, sk.len * 0.72 - 0.3), 0.022 * sc, 0.018 * sc, stripeM).min(0.6);

  // ── Eyes (weak): a ring of light, the glowing eye, a slit pupil ──
  if (!maw) {
    f.layer(0.004 * sc, PART.WEAK, 0, -0.08 * sc);
    for (let i = 0; i < R.eyes.length; i++) {
      const e = R.eyes[i];
      if (!e.visible) continue;
      const c = f.at(e, 0, 0, 0);
      const sd = i === 0 ? 1 : -1;
      if (f.facing(c, f.dir(h, sd, 0.2, 0.4)) < -0.15) continue;
      if (lvE > 0) f.ellipsoid(R.halos[i], 0, 0, 0, 0.045, 0.045, 0.045, rage ? XS.spill2R : XS.spill2).flag(PF.FLAT).min(0.6);
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
  const qM = ck >= 0.5 ? XS.quillDark : XS.quill;
  const qT = ck >= 0.5 ? XS.quillTipDark : XS.quillTip;
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
      // Centre quill (tilted back), then the side quill on the camera's side (the chest row: both).
      const cl = l * 1.1;
      const base = f.at(pv, 0, y - 0.01, z - 0.01);
      f.cone(base, f.at(pv, 0, y + 0.01 + cl * 0.4085, z - 0.02 - cl * 0.9128), 0.03 * sc, 0.004 * sc, qM).mat2(qT, 0.7).k(0.01 * sc).min(0.5);
      // Thin side quills (no outline: pale needles between the big ones): both rows
      // on the chest and hips, where they stick up past the back from either side.
      for (let sd = 1; sd >= -1; sd -= 2) {
        if ((p === 0 || p === 3) && sd !== camSide) continue;
        const dx = -Math.sin(sd * 0.3);
        f.cone(f.at(pv, sd * spread, y, z), f.at(pv, sd * spread + dx * l, y + l * 0.4754, z - l * 0.8286), 0.013 * sc, 0.003 * sc, qM)
          .mat2(qT, 0.75)
          .flag(PF.NO_OUTLINE)
          .tone(sd === camSide ? 0 : -0.1)
          .k(0.004 * sc)
          .min(0.5);
      }
    }
  }

  // ── Legs ──
  const L = s.legR;
  for (let i = 0; i < r.legs.length; i++) {
    const leg = r.legs[i];
    const side = i === 0 ? 1 : -1;
    const mid = f.depth(f.at(leg.knee, 0, 0, 0));
    f.layer(0.05 * sc, PART.LIMB, (mid > torsoDepth + 0.1 ? -0.1 : 0) + dark);
    // (Starts below the hip joint: the 3D thigh's top is flat, the round cap must not rise over the hips.)
    f.coneE(f.at(leg.hip, 0, -0.1 * L, 0.01), f.at(leg.hip, 0, -s.thigh, 0), X(f, leg.hip), Z(f, leg.hip), 0.11 * L * sc, 0.17 * L * sc, 0.054 * L * sc, 0.07 * L * sc, M.hide).u(1.0 + i * 0.3);
    f.decal(f.at(leg.hip, 0, 0.02, 0.15 * L), f.at(leg.hip, 0, -s.thigh * 0.55, 0.1 * L), 0.012 * sc, 0.01 * sc, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(0.22).min(0.5);
    f.coneE(f.at(leg.knee, 0, 0.04, 0), f.at(leg.knee, 0, -s.shin, 0), X(f, leg.knee), Z(f, leg.knee), 0.066 * L * sc, 0.086 * L * sc, 0.038 * L * sc, 0.046 * L * sc, M.limb).k(0.04 * sc);
    f.coneE(f.at(leg.ankle, 0, 0.03, 0), f.at(leg.ankle, 0, -s.meta, 0), X(f, leg.ankle), Z(f, leg.ankle), 0.042 * L * sc, 0.05 * L * sc, 0.036 * L * sc, 0.042 * L * sc, M.limb).k(0.03 * sc);
    const to = leg.toe;
    const fh = s.footH;
    f.ball(f.at(to, 0, -fh * 0.4, 0), 0.056 * L * sc, M.limb).k(0.02 * sc);
    for (let t = 0; t < 2; t++) {
      const x = (t === 0 ? -0.022 : 0.026) * L * side;
      const b = f.at(to, x * 1.25, -fh * 0.62, s.toe);
      f.cone(f.at(to, x, -fh * 0.55, 0), b, 0.031 * L * sc, 0.019 * L * sc, M.limb).k(0.012 * sc);
      f.cone(b, f.at(to, x * 1.3, -fh * 1.1, s.toe + 0.045 * L), 0.012 * L * sc, 0.004 * sc, M.claw).k(0.004 * sc).min(0.5);
    }
    // The sickle: raised inner toe + the big killing claw held up off the ground.
    const x = 0.05 * side;
    const k1 = f.at(to, x * 1.3, 0.03, 0.05);
    const c1 = f.at(to, x * 1.55, 0.12, 0.09);
    f.cone(f.at(to, x, -fh * 0.3, 0.0), k1, 0.022 * sc, 0.022 * sc, M.limb).k(0.01 * sc);
    f.cone(k1, c1, 0.025 * sc, 0.014 * sc, M.claw).k(0.006 * sc);
    f.cone(c1, f.at(to, x * 1.6, 0.15, 0.14), 0.014 * sc, 0.004 * sc, M.claw).k(0.004 * sc).min(0.5);
  }

  // ── Arms + scythe claws (three long hooked blades, a pale honed edge) ──
  const a = s.arm;
  for (let i = 0; i < r.arms.length; i++) {
    const arm = r.arms[i];
    const mid = f.depth(f.at(arm.elbow, 0, 0, 0));
    f.layer(0.03 * sc, PART.LIMB, (mid > torsoDepth + 0.05 ? -0.1 : 0) + dark);
    // (The upper arm starts where it leaves the chest: the shoulder pivot is buried in the torso.)
    f.coneE(f.at(arm.shoulder, 0, -a.upper * 0.25, 0), f.at(arm.shoulder, 0, -a.upper, 0), X(f, arm.shoulder), Z(f, arm.shoulder), a.r * 0.9 * sc, a.r * 1.0 * sc, a.r * 0.8 * sc, a.r * 0.9 * sc, M.hide).u(0.5);
    f.coneE(f.at(arm.elbow, 0, 0, 0), f.at(arm.elbow, 0, -a.fore, 0), X(f, arm.elbow), Z(f, arm.elbow), a.r * 0.8 * sc, a.r * 0.85 * sc, a.r * 0.6 * sc, a.r * 0.6 * sc, M.limb).k(0.02 * sc);
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
        f.cone(b0, tip, 0.022 * sc, 0.004 * sc, XS.scythe).k(0.006 * sc).min(0.5);
        continue;
      }
      f.cone(b0, m1, 0.024 * sc, 0.017 * sc, XS.scythe).k(0.006 * sc).min(0.5);
      f.cone(m1, tip, 0.017 * sc, 0.004 * sc, XS.scythe).k(0.004 * sc).min(0.5);
      if (c === 0) f.decal(m1, tip, 0.006 * sc, 0.003 * sc, XS.edge).flag(PF.FLAT).min(0.45);
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
 * Specimen X head-on (pounce, bite): the snout points at the lens. A sprite
 * artist draws the MAW: glowing eyes in their halos at the skull's edges under
 * a V of brow, a dark gullet ringed by fanned tooth rows, a wet tongue.
 */
function bossDSpecimenMaw(f: PixelFigure, R: BossDSpecimenRig, M: DinoMats, XS: typeof XM, sc: number, snoutTip: THREE.Vector3, eyeM: number, rage: boolean, headTx: number, dark: number) {
  const r = R.r;
  const s = R.s;
  const h = r.head;
  const sk = s.skull;
  const sn = s.snout;
  const J = s.jaw;
  const hx = X(f, h);
  // Brow V (shade decals) and the eyes in their halos (own layer just in front of the head).
  for (let sd = 1; sd >= -1; sd -= 2) {
    f.decal(f.at(h, sd * sk.r[0] * 1.0, sk.r[1] * 0.85, sk.len * 0.3), f.at(h, sd * sk.r[0] * 0.1, sk.r[1] * 0.25, sk.len + sn.len * 0.25), 0.034 * sc, 0.016 * sc, M.hide)
      .part(PART.HEAD)
      .flag(PF.FLAT | PF.SHADE_ONLY)
      .tone(-0.55)
      .min(0.5);
  }
  for (let sd = 1; sd >= -1; sd -= 2) {
    const no = f.add(snoutTip, hx, sd * sn.r1[0] * 0.5 * sc);
    f.decal(no, no, 0.012 * sc, 0.012 * sc, M.throat).part(PART.HEAD).flag(PF.FLAT).min(0.45);
  }
  f.layer(0.004 * sc, PART.WEAK, 0, -0.06 * sc);
  for (let i = 0; i < R.eyes.length; i++) {
    const e = R.eyes[i];
    if (!e.visible) continue;
    // An angry almond slanting up to the outside, a slit pupil, the brow's shadow over its top.
    // (eye joint frame)
    const sd = i === 0 ? 1 : -1;
    f.ellipsoid(R.halos[i], 0, 0, 0, 0.04, 0.035, 0.04, rage ? XS.spill2R : XS.spill2).flag(PF.FLAT).min(0.6);
    f.decal(f.at(e, -sd * 0.035, -0.012, 0.0), f.at(e, sd * 0.035, 0.014, 0.0), 0.016 * sc, 0.012 * sc, eyeM).flag(PF.FLAT).min(0.7);
    f.decal(f.at(e, 0, 0.018, 0), f.at(e, 0, -0.016, 0), 0.004 * sc, 0.004 * sc, M.pupil).flag(PF.FLAT).min(0.45);
    f.decal(f.at(e, -sd * 0.05, 0.03, 0), f.at(e, sd * 0.05, 0.05, 0), 0.012 * sc, 0.012 * sc, M.hide).flag(PF.FLAT).tone(-0.6).min(0.5);
    void headTx;
  }
  // The maw, built on the real jaws: the lips' four corners (upper lip front, the
  // hinges, the jaw tip) frame a dark gullet; tooth rows fanned along the rims
  // point into it; the tongue lies on the jaw floor.
  const jw = r.jaw;
  if (!jw) return;
  const top = f.at(h, 0, -sk.r[1] * 0.12 - sn.drop - sn.r1[1] * 0.4, sk.len + sn.len * 0.86);
  const bot = f.at(jw, 0, J.r1[1] * 0.4, J.len * 0.9);
  const cl = f.at(jw, J.r0[0] * 0.95, J.r0[1] * 0.6, 0.06);
  const cr = f.at(jw, -J.r0[0] * 0.95, J.r0[1] * 0.6, 0.06);
  f.layer(0.006 * sc, PART.HEAD, dark * 0.3, -0.12 * sc);
  f.tri(top, cl, bot, XS.deep, 0.01 * sc);
  f.tri(top, cr, bot, XS.deep, 0.01 * sc);
  f.cone(f.at(jw, 0, J.r0[1] * 0.5, 0.1), f.at(jw, 0, J.r1[1] * 0.5, J.len * 0.5), J.r0[0] * 0.36 * sc, J.r1[0] * 0.42 * sc, XS.gum).z(-0.02);
  f.ball(f.mix(f.at(h, 0, -sk.r[1] * 0.4, sk.len * 0.5), f.at(jw, 0, J.r0[1] * 0.5, 0.12), 0.5), sk.r[1] * 0.22 * sc, XS.throatGlow).flag(PF.FLAT).z(-0.01).min(0.6);
  for (let sd = 1; sd >= -1; sd -= 2) {
    const c = sd > 0 ? cl : cr;
    f.cone(f.mix(top, c, 0.04), f.mix(top, c, 0.94), 0.024 * sc, 0.016 * sc, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(-0.01).seed(3 + sd);
    f.cone(f.mix(c, bot, 0.08), f.mix(c, bot, 0.96), 0.02 * sc, 0.013 * sc, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(-0.01).seed(7 + sd);
  }
  void hx;
  void headTx;
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
 * A quill dart (Specimen X's volley): a bone quill flying tip-first with a
 * glowing bioluminescent tip in a ring of light. `g` = the dart's mesh group.
 */
export function bossDPaintDart(f: PixelFigure, g: THREE.Object3D): boolean {
  const XS = xm();
  f.maxTexels = 120;
  const s = scaleOf(g);
  // Shaft (Kit cone 0.08 × 0.9 along +Z, tip at +Z), tip glow at z 0.42, halo round z 0.3.
  f.layer(0.01 * s, PART.TORSO);
  f.cone(f.at(g, 0, 0, -0.45), f.at(g, 0, 0, 0.36), 0.03 * s, 0.075 * s, XS.dart).min(0.6);
  f.layer(0.004 * s, PART.TORSO, 0, -0.05 * s);
  f.ball(f.at(g, 0, 0, 0.3), 0.27 * s, XS.dartHalo).flag(PF.FLAT);
  f.ball(f.at(g, 0, 0, 0.36), 0.18 * s, XS.dartHalo2).flag(PF.FLAT).z(-0.02);
  f.ball(f.at(g, 0, 0, 0.42), 0.11 * s, XS.dartGlow).flag(PF.FLAT).z(-0.04);
  f.ball(f.at(g, 0.02, 0.03, 0.46), 0.045 * s, XS.core).flag(PF.FLAT).z(-0.06).min(0.6);
  return true;
}

/** The paint hook for one dart (one closure per dart, none per redraw); its halo is painted, not kept live. */
export function bossDDart(root: THREE.Object3D): (f: PixelFigure) => boolean {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m?.transparent) o.userData.spriteKeep3D = false;
  });
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

/** What the Tyrant painter reads (built once). Its soft halos stay live alpha glows over the sprite. */
export function bossDTyrantRig(r: BossDTyrantRig): BossDTyrantRig {
  r.mem = bossDMem();
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
  gullet: 0,
  deep: 0,
  throat: 0,
  throatHot: 0,
  throatCore: 0,
  tongue: 0,
  eye: 0,
  eyeHot: 0,
  eyeDead: 0,
  pupil: 0,
  spill: 0,
  spill2: 0,
  nostril: 0,
  saliva: 0,
  scar: 0,
};

function tm() {
  if (!TM.ready) {
    TM.ready = true;
    TM.belly = Mat.hide(0xc4a982, { scale: 0.3 });
    TM.hide = Mat.hide(0x84694a, { stripes: 0.85, stripe: 0x3e2e20, belly: TM.belly, scale: 0.5 });
    TM.head = Mat.hide(0x84694a, { stripes: 0.7, stripe: 0x3e2e20, belly: TM.belly, scale: 0.34 });
    TM.back = Mat.hide(0x4e3d2a, { scale: 0.3 });
    TM.limb = Mat.hide(0x76603f, { scale: 0.22 });
    TM.thigh = Mat.hide(0x775e40, { belly: TM.belly, scale: 0.3 });
    TM.scute = Mat.hide(0x3a3028, { scale: 0.12 });
    TM.horn = Mat.bone(0x8a7a62);
    TM.teeth = Mat.teeth(0xeee2c2);
    TM.claw = Mat.gloss(0x2a2420);
    TM.gum = Mat.gore(0x8a2a2a);
    TM.gullet = Mat.mouth(0x5e1414);
    TM.deep = Mat.mouth(0x260606);
    TM.throat = Mat.glow(0xff3a14);
    TM.throatHot = Mat.glow(0xff8a2a);
    TM.throatCore = Mat.glow(0xffe08a);
    TM.tongue = Mat.gore(0xa03848);
    TM.eye = Mat.glow(0xffb020);
    TM.eyeHot = Mat.glow(0xffe680);
    TM.eyeDead = Mat.flat(0x2a2014, 'trexeye');
    TM.pupil = Mat.flat(0x120806, 'trexpupil');
    TM.spill = Mat.hide(0xc89a58, { scale: 0.2 });
    TM.spill2 = Mat.glow(0xe0841e);
    TM.nostril = Mat.mouth(0x1a0e0a);
    TM.saliva = Mat.flat(0xd8d4c4, 'drool');
    TM.scar = Mat.flat(0x5a3a2a, 'trexscar');
  }
  return TM;
}

/** Tail segment lengths and the radii the 3D tail tapers through. */
const TY_TAIL = [1.05, 1.0, 0.95, 0.9, 0.85, 0.8];

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
  const bodyDepth = f.depth(f.at(T.chest, 0, -0.3, -1.2));
  // Facing the lens (the chase, every lunge): the body behind the head sinks a notch into shadow.
  const back = headOn > 0.3 ? -0.14 * Math.min(1, (headOn - 0.3) / 0.4) : 0;

  bossDSmear(f, mem, f.at(h, 0, 0, 0.9), f.at(T.chest, 0, -0.3, -0.6), 0.55 * s, 0.9 * s, M.hide, time, 0);

  // ── Body: hips, barrel torso in slices, pale belly, neck, whip tail (one layer) ──
  f.layer(0.3 * s, PART.TORSO, back);
  const to = T.torso;
  const tx = X(f, to);
  const ty = Y(f, to);
  f.ellipsoid(to, 0, 0.12, -0.45, 0.94, 1.06, 1.32, M.hide).u(0).k(0.3 * s);
  f.coneE(f.at(to, 0, 0.06, -0.3), f.at(to, 0, 0.16, 1.25), tx, ty, 1.0 * s, 1.16 * s, 1.08 * s, 1.26 * s, M.hide).u(0.4).k(0.35 * s);
  f.coneE(f.at(to, 0, 0.16, 1.25), f.at(to, 0, 0.36, 2.45), tx, ty, 1.08 * s, 1.26 * s, 0.9 * s, 1.04 * s, M.hide).u(2.0).k(0.35 * s);
  f.ellipsoid(to, 0, -0.6, 1.25, 0.66, 0.5, 1.12, M.hide).u(1.2).k(0.25 * s);
  const nk = T.neck;
  f.coneE(f.at(nk, 0, 0.01, -0.12), f.at(nk, 0, 0.03, 1.3), X(f, nk), Y(f, nk), 0.8 * s, 0.94 * s, 0.58 * s, 0.7 * s, M.hide).u(3.6).k(0.3 * s);
  // Throat folds under the neck (shade only), a scar across the flank.
  if (f.facing(f.at(nk, 0, -0.7, 0.6), f.dir(nk, 0, -1, 0.3)) > 0) {
    for (let i = 0; i < 3; i++) {
      f.decal(f.at(nk, -0.45, -0.62 + i * 0.04, 0.25 + i * 0.32), f.at(nk, 0.45, -0.62 + i * 0.04, 0.32 + i * 0.32), 0.03 * s, 0.03 * s, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.28).min(0.5);
    }
  }
  let u = -0.6;
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
    u -= len * 1.1;
    r0x = r1x;
    r0y = r1y;
  }
  // ── Scutes (armour): a row of dark bony spikes down the spine ──
  f.layer(0.02 * s, PART.ARMOR, back);
  for (let i = 0; i < 9; i++) {
    const z = -1.4 + i * 0.5;
    const y = 1.12 + Math.sin(((i + 1) / 10) * Math.PI) * 0.35;
    const sd = i % 2 ? 1 : -1;
    f.cone(f.at(hp, sd * 0.2, y - 0.08, z + 0.05), f.at(hp, sd * 0.24, y + 0.22, z - 0.08), 0.12 * s, 0.015 * s, M.scute).min(0.5);
  }
  for (let i = 0; i < 4; i++) {
    const sd = i % 2 ? 1 : -1;
    f.cone(f.at(nk, sd * 0.18, 0.8 - i * 0.04, 0.05 + i * 0.32), f.at(nk, sd * 0.22, 1.02 - i * 0.04, -0.05 + i * 0.32), 0.1 * s, 0.012 * s, M.scute).min(0.5);
  }
  {
    let rr = 0.98;
    for (let i = 0; i < 4 && i < T.tail.length; i++) {
      f.cone(f.at(T.tail[i], 0, rr * 0.84, -(TY_TAIL[i] ?? 0.8) * 0.35), f.at(T.tail[i], 0, rr * 0.92 + 0.2, -(TY_TAIL[i] ?? 0.8) * 0.5), 0.08 * s, 0.01 * s, M.scute).part(PART.TAIL).min(0.5);
      rr *= 0.72 - i * 0.04;
    }
  }

  // ── Legs: drumstick thigh, shin, metatarsus, three clawed toes ──
  for (let i = 0; i < T.legs.length; i++) {
    const L = T.legs[i];
    const sd = i === 0 ? -1 : 1;
    const mid = f.depth(f.at(L.knee, 0, 0, 0));
    f.layer(0.16 * s, PART.LIMB, (mid > bodyDepth + 0.3 ? -0.12 : 0) + back);
    f.coneE(f.at(L.hip, 0, 0.2, 0), f.at(L.hip, 0, -1.48, 0), X(f, L.hip), Z(f, L.hip), 0.58 * s, 0.68 * s, 0.36 * s, 0.4 * s, M.thigh).u(1.1 + i);
    f.ellipsoid(L.hip, sd * 0.06, -0.35, 0.05, 0.52, 0.9, 0.74, M.thigh).u(1.4 + i).k(0.2 * s);
    // Lit crescent down the thigh's front, a dark crease behind the knee.
    f.decal(f.at(L.hip, 0, -0.05, 0.62), f.at(L.hip, 0, -1.0, 0.42), 0.05 * s, 0.04 * s, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(0.12).min(0.5);
    // A muscle crease curving across the drumstick, a band of the hide's stripe over the top.
    f.decal(f.at(L.hip, sd * 0.56, -0.2, 0.45), f.at(L.hip, sd * 0.6, -0.75, -0.2), 0.035 * s, 0.03 * s, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.25).min(0.5);
    f.decal(f.at(L.hip, sd * 0.55, 0.05, 0.5), f.at(L.hip, sd * 0.58, -0.15, -0.5), 0.07 * s, 0.06 * s, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.18).min(0.5);
    f.decal(f.at(L.hip, sd * 0.5, 0.0, -0.1), f.at(L.hip, sd * 0.42, -1.2, -0.1), 0.06 * s, 0.05 * s, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.2).min(0.5);
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

  // ── Tiny arms (two claws), flailing ──
  for (let i = 0; i < T.arms.length; i++) {
    const a = T.arms[i];
    const mid = f.depth(f.at(a, 0, 0, 0));
    f.layer(0.04 * s, PART.LIMB, mid > bodyDepth ? -0.1 : 0);
    const el = f.at(a, 0, -0.46, 0.02);
    f.cone(f.at(a, 0, 0.04, 0), el, 0.13 * s, 0.1 * s, M.limb);
    const wr = f.at(a, 0, -0.46 - 0.42 * 0.36, 0.02 + 0.42 * 0.93);
    f.cone(el, wr, 0.1 * s, 0.075 * s, M.limb).k(0.03 * s);
    for (let c = -1; c <= 1; c += 2) f.cone(f.add(wr, X(f, a), c * 0.04 * s), f.at(a, c * 0.05, -0.68, 0.58), 0.035 * s, 0.008 * s, M.claw).k(0.008 * s).min(0.5);
  }

  // ── Head: a massive skull (own layer: it contours against the neck behind) ──
  f.layer(0.12 * s, PART.TORSO);
  const hx = X(f, h);
  const hy = Y(f, h);
  f.coneE(f.at(h, 0, 0.06, -0.12), f.at(h, 0, 0.04, 0.98), hx, hy, 0.58 * s, 0.62 * s, 0.52 * s, 0.56 * s, M.head).u(0.2).k(0.16 * s);
  f.ellipsoid(h, 0, 0.12, 0.3, 0.6, 0.6, 0.55, M.head).u(0.6).k(0.16 * s);
  f.coneE(f.at(h, 0, 0.0, 0.92), snoutTip, hx, hy, 0.5 * s, 0.48 * s, 0.29 * s, 0.29 * s, M.head).u(1.1).k(0.12 * s);
  // Snout ridge (darker), wrinkles across the nose, a scar.
  if (f.facing(f.at(h, 0, 0.3, 1.4), f.dir(h, 0, 1, 0.25)) > -0.05) {
    f.decal(f.at(h, 0, 0.62, 0.5), f.at(h, 0, 0.16, 1.86), 0.24 * s, 0.1 * s, M.back).flag(PF.FLAT).min(0.5);
    for (let i = 0; i < 3; i++) {
      const z = 1.25 + i * 0.2;
      f.decal(f.at(h, -0.3 + i * 0.03, 0.22 - i * 0.06, z), f.at(h, 0.3 - i * 0.03, 0.22 - i * 0.06, z + 0.04), 0.022 * s, 0.022 * s, M.head).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.3).min(0.5);
    }
    f.decal(f.at(h, 0.35, 0.3, 0.55), f.at(h, 0.2, 0.05, 1.05), 0.03 * s, 0.025 * s, M.scar).flag(PF.FLAT).min(0.5);
  }
  // Upper lip: a gum line and ragged fangs hanging from it (where the 3D teeth are).
  for (let sd = 1; sd >= -1; sd -= 2) {
    f.cone(f.at(h, sd * 0.46, -0.27, 0.72), f.at(h, sd * 0.26, -0.37, 1.86), 0.06 * s, 0.045 * s, M.gum).k(0.02 * s);
    for (let i = 0; i < 5; i++) {
      const t = 0.04 + i * 0.23;
      const w = 0.48 + (0.27 - 0.48) * t;
      const y = -0.31 - t * 0.12;
      const z = 0.75 + t * 1.12;
      const len = 0.24 - 0.07 * t + 0.04 * Math.sin(i * 2.3 + sd);
      // (Raked inward a little: invisible in profile, they point into the cavern head-on.)
      f.cone(f.at(h, sd * w, y + 0.03, z), f.at(h, sd * (w - len * 0.55), y - len, z + len * 0.12), 0.05 * s, 0.008 * s, M.teeth).flag(PF.NO_OUTLINE).k(0.004 * s).min(0.5);
    }
  }
  // Nostrils on the snout tip.
  if (headOn > -0.3) {
    for (let sd = 1; sd >= -1; sd -= 2) {
      f.decal(f.at(h, sd * 0.12, 0.06, 1.9), f.at(h, sd * 0.2, 0.03, 1.86), 0.03 * s, 0.02 * s, M.nostril).flag(PF.FLAT).min(0.5);
    }
  }
  // Jaw (own primitive on the jaw joint; a small blend keeps the gape open) + lower teeth.
  const jx = X(f, jw);
  const jy = Y(f, jw);
  f.coneE(f.at(jw, 0, -0.12, 0.0), f.at(jw, 0, -0.16, 1.88), jx, jy, 0.48 * s, 0.23 * s, 0.26 * s, 0.13 * s, M.head).u(0.3).k(jawA > 0.2 ? 0.02 * s : 0.08 * s);
  if (f.facing(f.at(jw, 0, -0.3, 0.6), f.dir(jw, 0, -1, 0)) > -0.1) f.ellipsoid(jw, 0, -0.26, 0.6, 0.36, 0.14, 0.62, M.belly).k(0.08 * s).z(-0.02 * s);
  for (let sd = 1; sd >= -1; sd -= 2) {
    for (let i = 0; i < 4; i++) {
      const t = 0.08 + i * 0.29;
      const w = 0.42 + (0.24 - 0.42) * t;
      const z = 0.65 + t * 1.1;
      const len = 0.19 - 0.05 * t + 0.03 * Math.sin(i * 1.9 - sd);
      f.cone(f.at(jw, sd * w, -0.02, z), f.at(jw, sd * (w - len * 0.5), len, z + len * 0.1), 0.045 * s, 0.007 * s, M.teeth).flag(PF.NO_OUTLINE).k(0.004 * s).min(0.5);
    }
  }
  if (open) {
    // The open mouth faces us: the jaw floor and the palate are wet gum, not hide.
    if (f.facing(f.at(jw, 0, 0.1, 1.0), f.dir(jw, 0, 1, 0)) > 0.05) f.decal(f.at(jw, 0, 0.1, 0.25), f.at(jw, 0, 0.06, 1.6), 0.3 * s, 0.15 * s, M.gullet).flag(PF.FLAT);
    if (f.facing(f.at(h, 0, -0.36, 1.1), f.dir(h, 0, -1, 0)) > 0.05) f.decal(f.at(h, 0, -0.36, 0.4), f.at(h, 0, -0.38, 1.7), 0.36 * s, 0.22 * s, M.gum).flag(PF.FLAT).tone(-0.2);
  }
  // Eye sockets: a deep shadow under the brow.
  for (let i = 0; i < T.eyes.length; i++) {
    const sd = i === 0 ? -1 : 1;
    const c = f.at(h, sd * 0.5, 0.33, 0.8);
    if (f.facing(c, f.dir(h, sd, 0.2, 0.5)) < -0.1) continue;
    f.decal(f.at(h, sd * 0.52, 0.36, 0.62), f.at(h, sd * 0.5, 0.34, 0.98), 0.13 * s, 0.11 * s, M.head).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.42).min(0.5);
  }

  // ── Brows and cheek horns (armour) ──
  f.layer(0.03 * s, PART.ARMOR);
  for (let sd = 1; sd >= -1; sd -= 2) {
    // Brow ridges: a bony scowl over each eye, highest at the back (a V from the front).
    f.cone(f.at(h, sd * 0.3, 0.6, 0.3), f.at(h, sd * 0.44, 0.52, 0.95), 0.13 * s, 0.09 * s, M.back).k(0.04 * s);
    f.cone(f.at(h, sd * 0.38, 0.68, 0.4), f.at(h, sd * 0.46, 0.6, 0.66), 0.1 * s, 0.08 * s, M.back).k(0.04 * s);
    f.cone(f.at(h, sd * 0.52, 0.2, 0.15), f.at(h, sd * 0.78, 0.3, 0.15), 0.11 * s, 0.02 * s, M.horn).min(0.5);
  }

  // ── Eyes (weak): small, deep-set, burning amber; a slit pupil ──
  f.layer(0.004 * s, PART.WEAK, 0, -0.2 * s);
  const headTx = f.px(f.at(h, 0, 0, 0.8), 1.2 * s) / f.kHint;
  for (let i = 0; i < T.eyes.length; i++) {
    const e = T.eyes[i];
    const c = f.at(e, 0, 0, 0);
    const sd = i === 0 ? -1 : 1;
    if (f.facing(c, f.dir(h, sd, 0.15, 0.6)) < -0.05) continue;
    if (!dead) f.ellipsoid(T.halos[i], 0, 0, 0, 0.1, 0.1, 0.1, M.spill2).flag(PF.FLAT).min(0.6);
    f.ellipsoid(e, 0, 0, 0, 0.1, 0.11, 0.13, dead ? M.eyeDead : M.eye).flag(PF.FLAT).z(-0.01 * s).min(0.6);
    if (!dead && headTx >= 14) {
      const size = stampSize(headTx * 0.75);
      const mirror = f.project(snoutTip, P0).x < f.project(c, P1).x;
      f.stamp(c, (0.24 * s) / (size === 0 ? 2.2 : size === 1 ? 3.2 : 4.2), STAMP.reye[size], M.eye, M.pupil, 0, 0, mirror);
    } else if (!dead) {
      f.decal(c, c, 0.025 * s, 0.06 * s, M.pupil).flag(PF.FLAT).min(0.45);
    }
  }

  // ── The open mouth (weak): dark gullet, a burning throat, the tongue, drool ──
  if (open) {
    f.layer(0.02 * s, PART.WEAK, 0, -0.1 * s);
    const mo = T.mouth;
    f.ellipsoid(mo, 0, -0.04, 0.1, 0.31, 0.2, 0.22, M.deep);
    const th = T.throat;
    f.ellipsoid(th, 0, 0, 0, 0.42, 0.42, 0.42, M.throat).flag(PF.FLAT).z(-0.04 * s);
    f.ellipsoid(th, 0, 0.04, 0.05, 0.27, 0.27, 0.27, M.throatHot).flag(PF.FLAT).z(-0.08 * s);
    f.ellipsoid(th, 0, 0.08, 0.1, 0.12, 0.12, 0.12, M.throatCore).flag(PF.FLAT).z(-0.12 * s).min(0.6);
    f.coneE(f.at(T.tongue, 0, 0.0, -0.5), f.at(T.tongue, 0, 0.02, 0.5), X(f, T.tongue), Y(f, T.tongue), 0.19 * s, 0.06 * s, 0.14 * s, 0.05 * s, M.tongue).z(-0.15 * s);
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
  return true;
}

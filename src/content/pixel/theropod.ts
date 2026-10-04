import * as THREE from 'three';
import type { Palette, TheroRig, TheroSpec } from '../enemies/dinoKit';
import { PART, PF, type PixelFigure, type PrimOpts } from '../../gameplay/pixel/figure';
import { Mat, hexToOklch, oklchToHex } from '../../gameplay/pixel/materials';

/**
 * ─── PixelCast theropod painter (raptor; reusable for compy / dilo) ────────
 *
 * The whole animal is ONE flowing line: tail tip → tail segments → hips →
 * torso → neck → skull → snout, all in a single layer whose primitives melt
 * together, carrying a continuous pattern coordinate `u` (metres from the
 * snout) so the stripes run unbroken from the shoulders to the tail tip.
 * Every segment has an ELLIPTICAL cross-section (deep chest, narrow back), so
 * the body is slim seen head-on and deep from the side.
 *
 *   body layer   hide with stripes, scale seams, a pale belly on the underside
 *                and a darker back; brow ridges and crest quills stick out of
 *                the silhouette; the jaw (own primitive, opens with the rig);
 *                tooth rows along both lips; eye (glowing, dark slit pupil, a
 *                dark mask band), nostril.
 *   mouth layer  the throat behind the jaw (shows only in the gap).
 *   leg layers   heavy drumstick thigh → shin → metatarsus → two toes with
 *                claws + the raised sickle claw; far leg a shade darker.
 *   arm layers   small arms folded forward, three hooked claws.
 */

export interface TheroPose {
  /** 0..1 jaw (the rig's jaw joint already carries it; this is for the throat). */
  jaw: number;
  /** Squash on a hit (0..1). */
  squash: number;
  time: number;
  /** Crest quill size (0 = none). */
  quills: number;
  /** Raptors: sickle claw on the inner toe. */
  sickle: boolean;
  /** Torso breathing scale (the rig's torso mesh scale). */
  breath: number;
}

function scaleOf(o: THREE.Object3D): number {
  const e = o.matrixWorld.elements;
  return Math.hypot(e[0], e[1], e[2]);
}

function shade(hex: number, l: number, c = 1): number {
  const [L, C, h] = hexToOklch(hex);
  return oklchToHex(L * l, C * c, h);
}

/** Paint a theropod rig built by `buildTheropod(spec)`. */
export function paintTheropod(f: PixelFigure, r: TheroRig, s: TheroSpec, p: Palette, st: TheroPose): boolean {
  f.maxTexels = 200;
  const sc = scaleOf(r.pelvis);
  const belly = Mat.hide(p.belly, { scale: 0.2 });
  const hide = Mat.hide(p.base, { stripes: 0.85, belly, scale: 0.26 / Math.max(0.6, s.stripes / 2) });
  const back = Mat.hide(p.back, { scale: 0.2 });
  const claw = Mat.gloss(p.claw);
  const teeth = Mat.teeth(p.teeth);
  const throat = Mat.mouth(shade(p.mouth, 0.7));
  const B: PrimOpts = { part: PART.TORSO };
  const T = s.torso;
  const sk = s.skull;
  const sn = s.snout;
  const J = s.jaw;
  const torsoDepth = f.depth(f.at(r.chest, 0, 0, T.len * 0.4));

  // ── Body line: one layer, snout to tail tip ───────────────────────────────
  f.layer({ k: 0.05 * sc });
  const X = (o: THREE.Object3D) => f.dir(o, 1, 0, 0);
  const Y = (o: THREE.Object3D) => f.dir(o, 0, 1, 0);
  // u runs from the snout tip back along the body (metres).
  let u = 0;
  // Snout + skull.
  const h = r.head;
  const hx = X(h);
  const hy = Y(h);
  const snoutY0 = -sk.r[1] * 0.12;
  const sr0: [number, number] = [sk.r[0] * 0.85, sk.r[1] * 0.78];
  const Hd: PrimOpts = { part: PART.HEAD };
  f.coneE(f.at(h, 0, snoutY0 - sn.drop, sk.len + sn.len), f.at(h, 0, snoutY0, sk.len - 0.03), hx, hy, sn.r1[0] * sc, sn.r1[1] * sc, sr0[0] * sc, sr0[1] * sc, hide, { ...Hd, u0: u, k: 0.03 * sc });
  u += sn.len;
  f.coneE(f.at(h, 0, 0.01, sk.len), f.at(h, 0, 0.01, -0.08), hx, hy, sk.r[0] * sc, sk.r[1] * sc, sk.r[0] * 0.92 * sc, sk.r[1] * 0.9 * sc, hide, { ...Hd, u0: u, k: 0.04 * sc });
  u += sk.len + 0.08;
  // Brow ridges: bumps over the eyes.
  for (const side of [1, -1]) {
    f.cone(f.at(h, side * sk.r[0] * 0.6, sk.r[1] * 0.78, sk.len * 0.72), f.at(h, side * sk.r[0] * 0.55, sk.r[1] * 0.85, sk.len * 0.18), 0.026 * sc, 0.03 * sc, back, { ...Hd, k: 0.02 * sc });
  }
  // Jaw: its own primitive on the jaw joint (opens with the rig), small blend so the gape stays open.
  if (r.jaw) {
    const jx = X(r.jaw);
    const jy = Y(r.jaw);
    f.coneE(f.at(r.jaw, 0, 0, -0.04), f.at(r.jaw, 0, -0.005, J.len - 0.03), jx, jy, J.r0[0] * sc, J.r0[1] * sc, J.r1[0] * sc, J.r1[1] * sc, hide, { ...Hd, u0: 0.1, k: 0.012 * sc });
    // Lower tooth rows along both edges of the jaw.
    for (const sd of [1, -1]) {
      f.cone(f.at(r.jaw, sd * J.r0[0] * 0.7, J.r0[1] * 0.7, 0.04), f.at(r.jaw, sd * J.r1[0] * 0.6, J.r1[1] * 0.65, J.len * 0.9), 0.014 * sc, 0.01 * sc, teeth, {
        ...Hd,
        flags: PF.TEETH | PF.NO_OUTLINE,
        k: 0.001,
        zBias: 0.03,
        seed: 2 + sd,
      });
    }
  }
  // Upper tooth rows along both lips under the snout.
  for (const sd of [1, -1]) {
    f.cone(f.at(h, sd * sr0[0] * 0.75, snoutY0 - sr0[1] * 0.68, sk.len * 0.85), f.at(h, sd * sn.r1[0] * 0.7, snoutY0 - sn.drop - sn.r1[1] * 0.7, sk.len + sn.len * 0.9), 0.016 * sc, 0.012 * sc, teeth, {
      ...Hd,
      flags: PF.TEETH | PF.NO_OUTLINE,
      k: 0.001,
      zBias: 0.03,
      seed: 5 + sd,
    });
  }
  // Crest quills (the alpha's are big and bright).
  if (st.quills > 0) {
    const q = st.quills;
    const acc = Mat.cloth(p.accent, { pattern: 0 });
    const acc2 = Mat.cloth(p.accent2, { pattern: 0 });
    // Two rows splayed outward (a V seen head-on), bristling as it moves.
    for (let i = 0; i < 6; i++) {
      for (const sd of [1, -1]) {
        const z = sk.len * 0.55 - i * 0.06 * q;
        const len = 0.11 * q * (1 - i * 0.1);
        const sway = Math.sin(st.time * 7 + i + sd) * 0.006;
        const base = f.at(h, sd * sk.r[0] * 0.3, sk.r[1] * 0.78, z);
        const tip = f.at(h, sd * (sk.r[0] * 0.3 + len * 0.35) + sway, sk.r[1] * 0.78 + len * 0.58, z - len * 0.75);
        f.cone(base, tip, 0.018 * q * sc, 0.004 * sc, (i + (sd > 0 ? 0 : 1)) % 2 ? acc2 : acc, { ...Hd, k: 0.01 * sc, minPx: 0.5 });
      }
    }
  }
  // Neck (head end first).
  for (let i = r.neck.length - 1; i >= 0; i--) {
    const n = r.neck[i];
    const t0 = i / r.neck.length;
    const t1 = (i + 1) / r.neck.length;
    const ra = [s.neck.r0[0] + (s.neck.r1[0] - s.neck.r0[0]) * t1, s.neck.r0[1] + (s.neck.r1[1] - s.neck.r0[1]) * t1];
    const rb = [s.neck.r0[0] + (s.neck.r1[0] - s.neck.r0[0]) * t0, s.neck.r0[1] + (s.neck.r1[1] - s.neck.r0[1]) * t0];
    const len = s.neck.lens[i];
    f.coneE(f.at(n, 0, 0, len + 0.02), f.at(n, 0, 0, -0.04), X(n), Y(n), ra[0] * sc, ra[1] * sc, rb[0] * sc, rb[1] * sc, hide, { ...B, u0: u, k: 0.05 * sc });
    u += len;
  }
  // Torso (chest → hips): breathing swells it a little.
  const br = st.breath;
  f.coneE(f.at(r.chest, 0, T.rise, T.len), f.at(r.chest, 0, 0, -0.02), X(r.chest), Y(r.chest), T.r1[0] * sc * br, T.r1[1] * sc * br, T.r0[0] * sc * br, T.r0[1] * sc * br, hide, { ...B, u0: u, k: 0.07 * sc });
  u += T.len;
  f.ellipsoid(r.body, 0, 0.02, -0.08, s.hips[0] * sc, s.hips[1] * sc, s.hips[2] * sc, hide, { ...B, u0: u, k: 0.08 * sc });
  u += s.hips[2];
  // Tail: tapering to a point, whipping with the rig.
  let tr: [number, number] = [s.tail.r0[0], s.tail.r0[1]];
  for (let i = 0; i < r.tail.length; i++) {
    const seg = r.tail[i];
    const len = s.tail.lens[i];
    const last = i === r.tail.length - 1;
    const r1: [number, number] = last ? [0.012, 0.014] : [tr[0] * s.tail.taper, tr[1] * s.tail.taper];
    f.coneE(f.at(seg, 0, 0, 0.04), f.at(seg, 0, 0, -len), X(seg), Y(seg), tr[0] * sc, tr[1] * sc, r1[0] * sc, r1[1] * sc, hide, { part: PART.TAIL, u0: u, k: 0.05 * sc });
    u += len;
    tr = r1;
  }
  // Face details (decals on the body layer).
  const fwd = f.dir(h, 0, 0, 1);
  for (const side of [1, -1]) {
    const eye = f.at(h, side * sk.r[0] * 0.86, sk.r[1] * 0.32, sk.len * 0.42);
    const n = f.dir(h, side, 0.25, 0.35);
    if (f.facing(eye, n) < 0.05) continue;
    const D: PrimOpts = { part: PART.HEAD, flags: PF.FLAT };
    // Dark mask band through the eye, the eye, its slit pupil.
    f.decal(f.at(h, side * sk.r[0] * 0.8, sk.r[1] * 0.3, sk.len * 0.85), f.at(h, side * sk.r[0] * 0.8, sk.r[1] * 0.38, sk.len * 0.05), 0.022 * sc, 0.026 * sc, hide, { ...D, tone: -0.3, flags: PF.FLAT | PF.SHADE_ONLY });
    f.decal(eye, eye, s.eyeSize * 0.75 * sc, s.eyeSize * 0.75 * sc, Mat.glow(p.eye), { ...D, flags: PF.FLAT | PF.GLOW, minPx: 0.6 });
    f.decal(f.at(h, side * sk.r[0] * 0.9, sk.r[1] * 0.32 + s.eyeSize * 0.4, sk.len * 0.43), f.at(h, side * sk.r[0] * 0.9, sk.r[1] * 0.32 - s.eyeSize * 0.4, sk.len * 0.43), 0.006 * sc, 0.006 * sc, Mat.flat(0x140c06), { ...D, minPx: 0.4 });
  }
  if (f.facing(f.at(h, 0, 0, sk.len + sn.len), fwd) > -0.6) {
    for (const side of [1, -1]) {
      const no = f.at(h, side * sn.r1[0] * 0.55, snoutY0 - sn.drop * 0.9 + sn.r1[1] * 0.5, sk.len + sn.len * 0.88);
      f.decal(no, no, 0.008 * sc, 0.008 * sc, throat, { part: PART.HEAD, flags: PF.FLAT, minPx: 0.45 });
    }
  }

  // ── Throat behind the gape ───────────────────────────────────────────────
  if (r.jaw && r.jaw.rotation.x > 0.08) {
    f.layer({ k: 0.02 * sc, depth: 0.04 });
    // A wedge from the hinge into the gape, kept inside the lips' outline.
    const tipU = f.at(h, 0, snoutY0 - sn.drop - sn.r1[1] * 0.5, sk.len + sn.len * 0.7);
    const tipJ = f.at(r.jaw, 0, J.r1[1] * 0.5, J.len * 0.7);
    const mid = f.mix(tipU, tipJ, 0.5);
    const gap = tipU.distanceTo(tipJ);
    const hinge = f.mix(f.at(h, 0, snoutY0 - sr0[1] * 0.4, sk.len * 0.3), f.at(r.jaw, 0, J.r0[1] * 0.3, 0.06), 0.5);
    f.cone(hinge, mid, sk.r[1] * 0.3 * sc, Math.max(0.008, gap * 0.32), throat, { part: PART.HEAD });
  }

  // ── Legs ─────────────────────────────────────────────────────────────────
  const L = s.legR;
  const lp = Mat.hide(p.base, { scale: 0.18 });
  for (let i = 0; i < r.legs.length; i++) {
    const leg = r.legs[i];
    const side = i === 0 ? 1 : -1;
    const mid = f.depth(f.at(leg.knee, 0, 0, 0));
    f.layer({ k: 0.05 * sc, tone: mid > torsoDepth + 0.08 ? -0.1 : 0 });
    const P: PrimOpts = { part: PART.LIMB };
    const hx2 = X(leg.hip);
    const hz = f.dir(leg.hip, 0, 0, 1);
    // Drumstick thigh: deep front-to-back.
    f.coneE(f.at(leg.hip, 0, 0.08, 0.01), f.at(leg.hip, 0, -s.thigh, 0), hx2, hz, 0.11 * L * sc, 0.17 * L * sc, 0.058 * L * sc, 0.075 * L * sc, hide, { ...P, u0: 1.0 + i * 0.3 });
    f.coneE(f.at(leg.knee, 0, 0.04, 0), f.at(leg.knee, 0, -s.shin, 0), X(leg.knee), f.dir(leg.knee, 0, 0, 1), 0.068 * L * sc, 0.09 * L * sc, 0.04 * L * sc, 0.048 * L * sc, lp, { ...P, k: 0.04 * sc });
    f.coneE(f.at(leg.ankle, 0, 0.03, 0), f.at(leg.ankle, 0, -s.meta, 0), X(leg.ankle), f.dir(leg.ankle, 0, 0, 1), 0.042 * L * sc, 0.05 * L * sc, 0.036 * L * sc, 0.042 * L * sc, lp, { ...P, k: 0.03 * sc });
    // Foot: heel pad, two forward toes with claws, the hallux.
    const to = leg.toe;
    const fh = s.footH;
    f.ball(f.at(to, 0, -fh * 0.4, 0), 0.05 * L * sc, lp, { ...P, k: 0.02 * sc });
    for (const tx of [-0.022, 0.026]) {
      const x = tx * L * side;
      const a = f.at(to, x, -fh * 0.55, 0);
      const b = f.at(to, x * 1.25, -fh * 0.62, s.toe);
      f.cone(a, b, 0.026 * L * sc, 0.016 * L * sc, lp, { ...P, k: 0.012 * sc });
      f.cone(b, f.at(to, x * 1.3, -fh * 1.1, s.toe + 0.045 * L), 0.012 * L * sc, 0.004 * sc, claw, { ...P, k: 0.004 * sc, minPx: 0.5 });
    }
    if (st.sickle) {
      // Raised inner toe + the big killing claw, held UP off the ground and hooked forward.
      const x = 0.05 * side;
      const k0 = f.at(to, x, -fh * 0.3, 0.0);
      const k1 = f.at(to, x * 1.1, 0.04, 0.045);
      f.cone(k0, k1, 0.021 * sc, 0.018 * sc, lp, { ...P, k: 0.01 * sc });
      const c1 = f.at(to, x * 1.4, 0.12, 0.085);
      const c2 = f.at(to, x * 1.4, 0.14, 0.14);
      f.cone(k1, c1, 0.019 * sc, 0.012 * sc, claw, { ...P, k: 0.006 * sc });
      f.cone(c1, c2, 0.012 * sc, 0.004 * sc, claw, { ...P, k: 0.004 * sc, minPx: 0.5 });
    }
  }

  // ── Arms ─────────────────────────────────────────────────────────────────
  for (let i = 0; i < r.arms.length; i++) {
    const arm = r.arms[i];
    const a = s.arm;
    const mid = f.depth(f.at(arm.elbow, 0, 0, 0));
    f.layer({ k: 0.03 * sc, tone: mid > torsoDepth + 0.05 ? -0.1 : 0 });
    const A: PrimOpts = { part: PART.LIMB };
    f.coneE(f.at(arm.shoulder, 0, 0.02, 0), f.at(arm.shoulder, 0, -a.upper, 0), X(arm.shoulder), f.dir(arm.shoulder, 0, 0, 1), a.r * sc, a.r * 1.15 * sc, a.r * 0.8 * sc, a.r * 0.9 * sc, hide, { ...A, u0: 0.5 });
    f.coneE(f.at(arm.elbow, 0, 0, 0), f.at(arm.elbow, 0, -a.fore, 0), X(arm.elbow), f.dir(arm.elbow, 0, 0, 1), a.r * 0.8 * sc, a.r * 0.85 * sc, a.r * 0.6 * sc, a.r * 0.6 * sc, lp, { ...A, k: 0.02 * sc });
    for (let c = -1; c <= 1; c++) {
      const w0 = f.at(arm.elbow, c * a.r * 0.45, -a.fore + 0.01, a.r * 0.2);
      const w1 = f.at(arm.elbow, c * a.r * 0.6, -a.fore - a.claw * 0.55, a.r * 0.2 + a.claw * 0.45);
      const w2 = f.at(arm.elbow, c * a.r * 0.65, -a.fore - a.claw * 0.95, a.r * 0.2 + a.claw * 0.35);
      f.cone(w0, w1, 0.013 * sc, 0.009 * sc, claw, { ...A, k: 0.004 * sc, minPx: 0.5 });
      f.cone(w1, w2, 0.009 * sc, 0.004 * sc, claw, { ...A, k: 0.003 * sc, minPx: 0.5 });
    }
  }

  if (st.squash > 0) f.warp(f.at(r.pelvis, 0, 0, 0), 1 + 0.06 * st.squash, 1 - 0.07 * st.squash);
  return true;
}

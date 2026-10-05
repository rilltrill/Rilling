import * as THREE from 'three';
import type { TheroRig, TheroSpec } from '../enemies/dinoKit';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat, hexToOklch, oklchToHex } from '../../gameplay/pixel/materials';
import { STAMP, stampSize } from '../../gameplay/pixel/stamps';

/**
 * ─── PixelCast theropod painter (raptor, compy, dilo; any `TheroSpec`) ─────
 *
 * The whole animal is ONE flowing line: snout → skull → neck → a deep chest
 * tapering to narrow hips → tail tip, all in a single layer whose primitives
 * melt together, carrying a continuous pattern coordinate `u` (metres from the
 * snout; it runs faster down the tail, so the bands narrow toward the tip).
 * Every segment has an ELLIPTICAL cross-section, so the body is slim seen
 * head-on and deep from the side.
 *
 *   body layer   hide with bold chevron stripes slanting back from the spine,
 *                broken and uneven, fading above a pale belly; a darker saddle;
 *                scale seams. The back line is broken by a row of short quills
 *                (the alpha's crest is big and bright), a throat wattle hangs
 *                under the jaw, brow ridges jut over the eyes. Eyes are stamps
 *                (glowing, slit pupil, a brow shadow) with a dark mask band.
 *   head-on      when the snout points at the camera (the pounce!) the head is
 *                redrawn as a MAW: a dark diamond throat ringed by fanned tooth
 *                rows, glowing slit eyes pushed to the skull's edges under a V of
 *                brow ridges, the forearm claws splayed beside it.
 *   mouth layer  the throat behind the jaw (shows only in the gape).
 *   leg layers   drumstick thigh with a lit crescent → thin shin → metatarsus
 *                → toes with claws + the raised sickle claw; far leg darker.
 *   arm layers   small arms folded forward, three hooked claws.
 *   smears       a pounce leaves a streak behind the head and body for a frame.
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
  /** Per-animal memory for smears (`theroMem()`), owned by the animal. */
  mem?: TheroMem;
  /** Extra shapes after the figure (dilo frills…). */
  extra?: (f: PixelFigure) => void;
  /** 0..1: size of the dorsal quill row (compys: none). */
  dorsal?: number;
}

export interface TheroMem {
  valid: boolean;
  t: number;
  head: THREE.Vector3;
  chest: THREE.Vector3;
}

export function theroMem(): TheroMem {
  return { valid: false, t: 0, head: new THREE.Vector3(), chest: new THREE.Vector3() };
}

function scaleOf(o: THREE.Object3D): number {
  const e = o.matrixWorld.elements;
  return Math.hypot(e[0], e[1], e[2]);
}

function shade(hex: number, l: number, c = 1): number {
  const [L, C, h] = hexToOklch(hex);
  return oklchToHex(L * l, C * c, h);
}

export interface DinoMats {
  hide: number;
  back: number;
  limb: number;
  belly: number;
  claw: number;
  teeth: number;
  throat: number;
  acc: number;
  acc2: number;
  eye: number;
  pupil: number;
}

/** Materials per spec (palette + stripe density), resolved once. */
const matCache = new WeakMap<TheroSpec, DinoMats>();

export function dinoMats(spec: TheroSpec): DinoMats {
  let m = matCache.get(spec);
  if (m) return m;
  const p = spec.pal;
  const stripes = spec.stripes;
  const belly = Mat.hide(p.belly, { scale: 0.2 });
  m = {
    hide:
      stripes > 0
        ? Mat.hide(p.base, { stripes: 0.85, belly, stripe: p.stripe, scale: 0.26 / Math.max(0.6, stripes / 2) })
        : spec.spots
          ? Mat.hide(p.base, { spots: 0.9, belly, stripe: p.stripe, scale: 0.11 })
          : Mat.hide(p.base, { belly, scale: 0.2 }),
    back: Mat.hide(p.back, { scale: 0.2 }),
    limb: Mat.hide(p.base, { scale: 0.18 }),
    belly,
    claw: Mat.gloss(p.claw),
    teeth: Mat.teeth(p.teeth),
    throat: Mat.mouth(shade(p.mouth, 0.7)),
    acc: Mat.cloth(p.accent, { pattern: 0 }),
    acc2: Mat.cloth(p.accent2, { pattern: 0 }),
    eye: Mat.glow(p.eye),
    pupil: Mat.flat(0x140c06),
  };
  matCache.set(spec, m);
  return m;
}

const X = (f: PixelFigure, o: THREE.Object3D) => f.dir(o, 1, 0, 0);
const Y = (f: PixelFigure, o: THREE.Object3D) => f.dir(o, 0, 1, 0);
const Z = (f: PixelFigure, o: THREE.Object3D) => f.dir(o, 0, 0, 1);
const P0 = { x: 0, y: 0, z: 0 };
const P1 = { x: 0, y: 0, z: 0 };

/** Paint a theropod rig built by `buildTheropod(spec)` (colours from `spec.pal`). */
export function paintTheropod(f: PixelFigure, r: TheroRig, s: TheroSpec, st: TheroPose): boolean {
  f.maxTexels = 240;
  const M = dinoMats(s);
  const sc = scaleOf(r.pelvis);
  const T = s.torso;
  const sk = s.skull;
  const sn = s.snout;
  const J = s.jaw;
  const torsoDepth = f.depth(f.at(r.chest, 0, 0, T.len * 0.4));
  const h = r.head;
  const snoutY0 = -sk.r[1] * 0.12;
  const sr0x = sk.r[0] * 0.85;
  const sr0y = sk.r[1] * 0.78;
  const snoutTip = f.at(h, 0, snoutY0 - sn.drop, sk.len + sn.len);
  // Snout pointing at the camera: the pounce. Draw the maw instead of a profile head.
  const headOn = f.facing(snoutTip, Z(f, h));
  const maw = headOn > 0.62;
  const dorsal = st.dorsal ?? 1;

  // ── Smears (a pounce leaves a streak) ──
  if (st.mem) theroSmears(f, r, M, st, sc, s);

  // ── Body line: one layer, snout to tail tip ───────────────────────────────
  // (Lunging at the camera, the head is in front of the chest: it gets a layer of
  // its own so an inner contour separates the maw from the body behind it.)
  if (maw) f.layer(0.04 * sc, PART.HEAD);
  else f.layer(0.05 * sc, PART.TORSO);
  let u = 0;
  const hx = X(f, h);
  const hy = Y(f, h);
  f.coneE(snoutTip, f.at(h, 0, snoutY0, sk.len - 0.03), hx, hy, sn.r1[0] * sc, sn.r1[1] * sc, sr0x * sc, sr0y * sc, M.hide)
    .part(PART.HEAD)
    .u(u)
    .k(0.03 * sc);
  u += sn.len;
  f.coneE(f.at(h, 0, 0.01, sk.len), f.at(h, 0, 0.01, -0.08), hx, hy, sk.r[0] * sc, sk.r[1] * sc, sk.r[0] * 0.92 * sc, sk.r[1] * 0.9 * sc, M.hide)
    .part(PART.HEAD)
    .u(u)
    .k(0.04 * sc);
  u += sk.len + 0.08;
  // Brow ridges: bumps over the eyes (a V from the front).
  for (let side = 1; side >= -1; side -= 2) {
    f.cone(f.at(h, side * sk.r[0] * 0.62, sk.r[1] * 0.8, sk.len * 0.74), f.at(h, side * sk.r[0] * 0.5, sk.r[1] * 0.9, sk.len * 0.16), 0.028 * sc, 0.032 * sc, M.back)
      .part(PART.HEAD)
      .k(0.02 * sc);
  }
  // Jaw: its own primitive on the jaw joint (opens with the rig), small blend so the gape stays open.
  if (r.jaw) {
    f.coneE(f.at(r.jaw, 0, 0, -0.04), f.at(r.jaw, 0, -0.005, J.len - 0.03), X(f, r.jaw), Y(f, r.jaw), J.r0[0] * sc, J.r0[1] * sc, J.r1[0] * sc, J.r1[1] * sc, M.hide)
      .part(PART.HEAD)
      .u(0.1)
      .k(0.012 * sc);
    if (s.teeth > 0) {
      for (let sd = 1; sd >= -1; sd -= 2) {
        f.cone(f.at(r.jaw, sd * J.r0[0] * 0.7, J.r0[1] * 0.7, 0.04), f.at(r.jaw, sd * J.r1[0] * 0.6, J.r1[1] * 0.65, J.len * 0.9), 0.014 * sc, 0.01 * sc, M.teeth)
          .part(PART.HEAD)
          .flag(PF.TEETH | PF.NO_OUTLINE)
          .k(0.001)
          .z(0.03)
          .seed(2 + sd);
      }
      // Throat wattle: a loose fold hanging under the jaw hinge.
      if (!maw) {
        f.cone(f.at(r.jaw, 0, -J.r0[1] * 0.6, 0.02), f.at(r.jaw, 0, -J.r0[1] * 1.5, -0.04), J.r0[0] * 0.55 * sc, J.r0[0] * 0.3 * sc, M.belly)
          .k(0.02 * sc)
          .part(PART.HEAD);
      }
    }
  }
  if (s.teeth > 0) {
    for (let sd = 1; sd >= -1; sd -= 2) {
      f.cone(f.at(h, sd * sr0x * 0.75, snoutY0 - sr0y * 0.68, sk.len * 0.85), f.at(h, sd * sn.r1[0] * 0.7, snoutY0 - sn.drop - sn.r1[1] * 0.7, sk.len + sn.len * 0.9), 0.016 * sc, 0.012 * sc, M.teeth)
        .part(PART.HEAD)
        .flag(PF.TEETH | PF.NO_OUTLINE)
        .k(0.001)
        .z(0.03)
        .seed(5 + sd);
    }
  }
  // Twin half-moon head crests (dilophosaurus): thin bony fans standing up off the skull.
  if (s.crests) {
    for (let sd = 1; sd >= -1; sd -= 2) {
      f.ellipsoid(h, sd * 0.028, sk.r[1] * 0.85, sk.len * 0.45 + sn.len * 0.2, 0.014, 0.11, 0.22, sd > 0 ? M.acc : M.acc2)
        .part(PART.HEAD)
        .k(0.01 * sc)
        .z(0.01);
    }
  }
  // Crest quills (the alpha's are big and bright): two rows splayed outward (a V
  // seen head-on), bristling as it moves.
  if (st.quills > 0) {
    const q = st.quills;
    for (let i = 0; i < 6; i++) {
      for (let sd = 1; sd >= -1; sd -= 2) {
        const z = sk.len * 0.55 - i * 0.06 * q;
        const len = 0.11 * q * (1 - i * 0.1);
        const sway = Math.sin(st.time * 7 + i + sd) * 0.006;
        const base = f.at(h, sd * sk.r[0] * 0.3, sk.r[1] * 0.78, z);
        const tip = f.at(h, sd * (sk.r[0] * 0.3 + len * 0.35) + sway, sk.r[1] * 0.78 + len * 0.58, z - len * 0.75);
        f.cone(base, tip, 0.018 * q * sc, 0.004 * sc, (i + (sd > 0 ? 0 : 1)) % 2 ? M.acc2 : M.acc)
          .part(PART.NONE)
          .k(0.01 * sc)
          .min(0.5);
      }
    }
  }
  if (maw) {
    // Head-on: the maw goes on the head layer; the body line continues on its own.
    paintMaw(f, r, s, M, sc, snoutTip, f.px(f.at(h, 0, 0, sk.len * 0.5), sk.r[1] * 2 * sc) / f.kHint);
    f.layer(0.05 * sc, PART.TORSO);
  }
  // Neck (head end first), with a row of short quills breaking the back line.
  const nN = r.neck.length;
  for (let i = nN - 1; i >= 0; i--) {
    const n = r.neck[i];
    const t0 = i / nN;
    const t1 = (i + 1) / nN;
    const len = s.neck.lens[i];
    const r0 = s.neck.r0;
    const r1 = s.neck.r1;
    const ry0 = r0[1] + (r1[1] - r0[1]) * t0;
    f.coneE(
      f.at(n, 0, 0, len + 0.02),
      f.at(n, 0, 0, -0.04),
      X(f, n),
      Y(f, n),
      (r0[0] + (r1[0] - r0[0]) * t1) * sc,
      (r0[1] + (r1[1] - r0[1]) * t1) * sc,
      (r0[0] + (r1[0] - r0[0]) * t0) * sc,
      ry0 * sc,
      M.hide,
    )
      .u(u)
      .k(0.05 * sc);
    u += len;
    if (dorsal > 0) {
      for (let j = 0; j < 2; j++) {
        const z = len * (0.75 - j * 0.45);
        const ql = (0.045 + 0.02 * ((i + j) % 2)) * dorsal * sc;
        const sw = Math.sin(st.time * 5 + i * 2 + j) * 0.004;
        f.cone(f.at(n, 0, ry0 * 0.92, z), f.at(n, sw, ry0 * 0.92 + ql * 0.75, z - ql * 0.85), 0.014 * sc, 0.003 * sc, M.back)
          .part(PART.NONE)
          .k(0.006 * sc)
          .min(0.5);
      }
    }
  }
  // Torso: a deep chest tapering to the hips (breathing swells it a little).
  const br = st.breath;
  f.coneE(f.at(r.chest, 0, T.rise, T.len), f.at(r.chest, 0, 0, -0.02), X(f, r.chest), Y(f, r.chest), T.r1[0] * sc * br, T.r1[1] * 1.1 * sc * br, T.r0[0] * 0.94 * sc * br, T.r0[1] * 0.95 * sc * br, M.hide)
    .u(u)
    .k(0.07 * sc);
  if (dorsal > 0) {
    for (let j = 0; j < 4; j++) {
      const z = T.len * (0.85 - j * 0.24);
      const yy = T.rise * (z / T.len) + T.r1[1] * (0.95 - 0.05 * j);
      const ql = (0.05 - j * 0.006) * dorsal * sc;
      f.cone(f.at(r.chest, 0, yy, z), f.at(r.chest, 0, yy + ql * 0.7, z - ql), 0.016 * sc, 0.003 * sc, M.back)
        .part(PART.NONE)
        .k(0.006 * sc)
        .min(0.5);
    }
  }
  u += T.len;
  f.ellipsoid(r.body, 0, 0.02, -0.08, s.hips[0] * 0.92, s.hips[1], s.hips[2], M.hide).u(u).k(0.08 * sc);
  u += s.hips[2];
  // Tail: tapering to a point, whipping with the rig; `u` runs faster so the bands narrow.
  let trx = s.tail.r0[0];
  let try_ = s.tail.r0[1];
  for (let i = 0; i < r.tail.length; i++) {
    const seg = r.tail[i];
    const len = s.tail.lens[i];
    const last = i === r.tail.length - 1;
    const r1x = last ? 0.012 : trx * s.tail.taper;
    const r1y = last ? 0.014 : try_ * s.tail.taper;
    f.coneE(f.at(seg, 0, 0, 0.04), f.at(seg, 0, 0, -len), X(f, seg), Y(f, seg), trx * sc, try_ * sc, r1x * sc, r1y * sc, M.hide)
      .part(PART.TAIL)
      .u(u)
      .k(0.05 * sc);
    u += len * (1.25 + i * 0.25);
    trx = r1x;
    try_ = r1y;
  }
  // Head size in texels picks the eye stamp (or plain pixels when tiny).
  const headTx = f.px(f.at(h, 0, 0, sk.len * 0.5), sk.r[1] * 2 * sc) / f.kHint;
  if (!maw) {
    // Face: stamped eye (glowing, slit pupil, brow shadow) inside a dark mask band.
    for (let side = 1; side >= -1; side -= 2) {
      const eye = f.at(h, side * sk.r[0] * 0.86, sk.r[1] * 0.32, sk.len * 0.42);
      if (f.facing(eye, f.dir(h, side, 0.25, 0.35)) < 0.05) continue;
      f.decal(f.at(h, side * sk.r[0] * 0.8, sk.r[1] * 0.3, sk.len * 0.85), f.at(h, side * sk.r[0] * 0.8, sk.r[1] * 0.38, sk.len * 0.05), 0.022 * sc, 0.026 * sc, M.hide)
        .part(PART.HEAD)
        .flag(PF.FLAT | PF.SHADE_ONLY)
        .tone(-0.3);
      if (headTx >= 7) {
        const size = stampSize(headTx * 1.6);
        const mirror = f.project(snoutTip, P0).x < f.project(eye, P1).x;
        f.stamp(eye, (sk.r[1] * 2 * sc) / (size === 0 ? 7 : size === 1 ? 11 : 16), STAMP.reye[size], M.eye, M.pupil, 0, 0, mirror);
      } else {
        f.decal(eye, eye, s.eyeSize * 0.75 * sc, s.eyeSize * 0.75 * sc, M.eye).part(PART.HEAD).flag(PF.FLAT | PF.GLOW).min(0.6);
      }
    }
    if (headOn > -0.6) {
      for (let side = 1; side >= -1; side -= 2) {
        const no = f.at(h, side * sn.r1[0] * 0.55, snoutY0 - sn.drop * 0.9 + sn.r1[1] * 0.5, sk.len + sn.len * 0.88);
        f.decal(no, no, 0.008 * sc, 0.008 * sc, M.throat).part(PART.HEAD).flag(PF.FLAT).min(0.45);
      }
    }
  }

  // ── Throat behind the gape ───────────────────────────────────────────────
  if (r.jaw && r.jaw.rotation.x > 0.08) {
    f.layer(0.02 * sc, PART.HEAD, 0, 0.04);
    // A wedge from the hinge into the gape, kept inside the lips' outline.
    const tipU = f.at(h, 0, snoutY0 - sn.drop - sn.r1[1] * 0.5, sk.len + sn.len * 0.7);
    const tipJ = f.at(r.jaw, 0, J.r1[1] * 0.5, J.len * 0.7);
    const mid = f.mix(tipU, tipJ, 0.5);
    const gap = tipU.distanceTo(tipJ);
    const hinge = f.mix(f.at(h, 0, snoutY0 - sr0y * 0.4, sk.len * 0.3), f.at(r.jaw, 0, J.r0[1] * 0.3, 0.06), 0.5);
    f.cone(hinge, mid, sk.r[1] * 0.3 * sc, Math.min(sk.r[1] * 0.55 * sc, Math.max(0.008, gap * 0.26)), M.throat);
  }

  // ── Legs ─────────────────────────────────────────────────────────────────
  const L = s.legR;
  for (let i = 0; i < r.legs.length; i++) {
    const leg = r.legs[i];
    const side = i === 0 ? 1 : -1;
    const mid = f.depth(f.at(leg.knee, 0, 0, 0));
    f.layer(0.05 * sc, PART.LIMB, mid > torsoDepth + 0.08 ? -0.1 : 0);
    // Drumstick thigh: deep front-to-back, a lit crescent down its front.
    f.coneE(f.at(leg.hip, 0, 0.07 * L, 0.01), f.at(leg.hip, 0, -s.thigh, 0), X(f, leg.hip), Z(f, leg.hip), 0.11 * L * sc, 0.175 * L * sc, 0.054 * L * sc, 0.07 * L * sc, M.hide).u(1.0 + i * 0.3);
    f.decal(f.at(leg.hip, 0, 0.02, 0.15 * L), f.at(leg.hip, 0, -s.thigh * 0.55, 0.1 * L), 0.012 * sc, 0.01 * sc, M.hide).flag(PF.FLAT | PF.SHADE_ONLY).tone(0.22).min(0.5);
    // Thin shin, sinewy metatarsus.
    f.coneE(f.at(leg.knee, 0, 0.04, 0), f.at(leg.knee, 0, -s.shin, 0), X(f, leg.knee), Z(f, leg.knee), 0.058 * L * sc, 0.078 * L * sc, 0.032 * L * sc, 0.038 * L * sc, M.limb).k(0.04 * sc);
    f.coneE(f.at(leg.ankle, 0, 0.03, 0), f.at(leg.ankle, 0, -s.meta, 0), X(f, leg.ankle), Z(f, leg.ankle), 0.038 * L * sc, 0.045 * L * sc, 0.032 * L * sc, 0.038 * L * sc, M.limb).k(0.03 * sc);
    // Foot: heel pad, two forward toes with claws.
    const to = leg.toe;
    const fh = s.footH;
    f.ball(f.at(to, 0, -fh * 0.4, 0), 0.048 * L * sc, M.limb).k(0.02 * sc);
    for (let t = 0; t < 2; t++) {
      const x = (t === 0 ? -0.022 : 0.026) * L * side;
      const b = f.at(to, x * 1.25, -fh * 0.62, s.toe);
      f.cone(f.at(to, x, -fh * 0.55, 0), b, 0.026 * L * sc, 0.016 * L * sc, M.limb).k(0.012 * sc);
      f.cone(b, f.at(to, x * 1.3, -fh * 1.1, s.toe + 0.045 * L), 0.012 * L * sc, 0.004 * sc, M.claw).k(0.004 * sc).min(0.5);
    }
    if (st.sickle) {
      // Raised inner toe + the big killing claw, held UP off the ground and hooked forward.
      const x = 0.05 * side;
      const k1 = f.at(to, x * 1.1, 0.04, 0.045);
      const c1 = f.at(to, x * 1.4, 0.12, 0.085);
      f.cone(f.at(to, x, -fh * 0.3, 0.0), k1, 0.021 * sc, 0.018 * sc, M.limb).k(0.01 * sc);
      f.cone(k1, c1, 0.019 * sc, 0.012 * sc, M.claw).k(0.006 * sc);
      f.cone(c1, f.at(to, x * 1.4, 0.14, 0.14), 0.012 * sc, 0.004 * sc, M.claw).k(0.004 * sc).min(0.5);
    }
  }

  // ── Arms ─────────────────────────────────────────────────────────────────
  const a = s.arm;
  if (s.compact) {
    // Compact rigs carry the arms folded into the torso: tiny clawed arms under the chest.
    f.layer(0.01 * sc, PART.TORSO);
    for (let side = 1; side >= -1; side -= 2) {
      const sh = f.at(r.chest, side * T.r0[0] * 0.55, -T.r1[1] * 0.3, T.len * 0.8);
      const el = f.at(r.chest, side * T.r0[0] * 0.6, -T.r1[1] * 0.3 - a.upper * 0.95, T.len * 0.8 + a.upper * 0.3);
      const wr = f.at(r.chest, side * T.r0[0] * 0.6, -T.r1[1] * 0.3 - a.upper * 0.8, T.len * 0.8 + a.upper * 0.3 + a.fore);
      f.cone(sh, el, a.r * sc, a.r * 0.8 * sc, M.limb).min(0.5);
      f.cone(el, wr, a.r * 0.8 * sc, a.r * 0.5 * sc, M.limb).min(0.5);
      f.cone(wr, f.add(wr, f.dir(r.chest, 0, -1, 0.4), a.claw * sc), 0.006 * sc, 0.002 * sc, M.claw).min(0.5);
    }
  }
  for (let i = 0; i < r.arms.length; i++) {
    const arm = r.arms[i];
    const side = i === 0 ? 1 : -1;
    const mid = f.depth(f.at(arm.elbow, 0, 0, 0));
    f.layer(0.03 * sc, PART.LIMB, mid > torsoDepth + 0.05 ? -0.1 : 0);
    f.coneE(f.at(arm.shoulder, 0, 0.02, 0), f.at(arm.shoulder, 0, -a.upper, 0), X(f, arm.shoulder), Z(f, arm.shoulder), a.r * sc, a.r * 1.15 * sc, a.r * 0.8 * sc, a.r * 0.9 * sc, M.hide).u(0.5);
    f.coneE(f.at(arm.elbow, 0, 0, 0), f.at(arm.elbow, 0, -a.fore, 0), X(f, arm.elbow), Z(f, arm.elbow), a.r * 0.8 * sc, a.r * 0.85 * sc, a.r * 0.6 * sc, a.r * 0.6 * sc, M.limb).k(0.02 * sc);
    // Claws: hooked; splayed wide (outward) when it lunges at the camera.
    const spread = maw ? 1.8 : 1;
    const out = maw ? side * a.r * 0.7 : 0;
    for (let c = -1; c <= 1; c++) {
      const w1 = f.at(arm.elbow, c * a.r * 0.6 * spread + out, -a.fore - a.claw * 0.55, a.r * 0.2 + a.claw * 0.45);
      f.cone(f.at(arm.elbow, c * a.r * 0.45, -a.fore + 0.01, a.r * 0.2), w1, 0.013 * sc, 0.009 * sc, M.claw).k(0.004 * sc).min(0.5);
      f.cone(w1, f.at(arm.elbow, c * a.r * 0.65 * spread + out * 1.5, -a.fore - a.claw * 0.95, a.r * 0.2 + a.claw * 0.35), 0.009 * sc, 0.004 * sc, M.claw).k(0.003 * sc).min(0.5);
    }
  }
  if (st.extra) st.extra(f);

  if (st.squash > 0) f.warp(f.at(r.pelvis, 0, 0, 0), 1 + 0.06 * st.squash, 1 - 0.07 * st.squash);
  return true;
}

/**
 * Head-on maw (the pounce): the snout points at the camera, so a profile head
 * reads as a lump. Paint what a sprite artist would: the open throat as a dark
 * diamond ringed by fanned tooth rows, glowing slit eyes at the skull's edges
 * under a V of brows — decals and tooth rows on the head already drawn, inside
 * the head hitbox.
 */
function paintMaw(f: PixelFigure, r: TheroRig, s: TheroSpec, M: DinoMats, sc: number, snoutTip: THREE.Vector3, headTx: number) {
  const h = r.head;
  const sk = s.skull;
  const sn = s.snout;
  const J = s.jaw;
  const hx = X(f, h);
  // Eyes at the skull's outer edges: glowing slits, under a V of brow shadow (decals on the head).
  for (let sd = 1; sd >= -1; sd -= 2) {
    const eye = f.at(h, sd * sk.r[0] * 0.78, sk.r[1] * 0.35, sk.len * 0.5);
    const e2 = f.at(h, sd * sk.r[0] * 0.7, sk.r[1] * 0.42, sk.len * 0.62);
    f.decal(f.at(h, sd * sk.r[0] * 0.9, sk.r[1] * 0.7, sk.len * 0.4), f.at(h, sd * sk.r[0] * 0.1, sk.r[1] * 0.25, sk.len + sn.len * 0.2), 0.016 * sc, 0.01 * sc, M.hide)
      .part(PART.HEAD)
      .flag(PF.FLAT | PF.SHADE_ONLY)
      .tone(-0.45)
      .min(0.5);
    f.decal(eye, e2, s.eyeSize * 0.45 * sc, s.eyeSize * 0.35 * sc, M.eye).part(PART.HEAD).flag(PF.FLAT | PF.GLOW).min(headTx > 12 ? 0.7 : 0.5);
  }
  // Nostrils on the snout tip, facing us.
  for (let sd = 1; sd >= -1; sd -= 2) {
    const no = f.add(snoutTip, hx, sd * sn.r1[0] * 0.5 * sc);
    f.decal(no, no, 0.01 * sc, 0.01 * sc, M.throat).part(PART.HEAD).flag(PF.FLAT).min(0.45);
  }
  // The maw: its own layer just in front of the head, so a dark lip line rings it.
  const top = f.at(h, 0, -sk.r[1] * 0.12 - sn.drop, sk.len + sn.len * 0.6);
  const bot = r.jaw ? f.at(r.jaw, 0, 0, J.len * 0.62) : f.at(h, 0, -sk.r[1] * 0.7, sk.len + sn.len * 0.4);
  const mid = f.mix(top, bot, 0.5);
  const gape = Math.max(0.05, top.distanceTo(bot));
  const w = Math.min(sk.r[0] * 1.05, sk.r[0] * 0.6 + gape * 0.2) * sc;
  f.layer(0.004 * sc, PART.HEAD, 0, -0.12);
  // Dark diamond throat: two cones meeting at the widest point.
  f.cone(top, mid, 0.012 * sc, w * 0.6, M.throat).flag(PF.FLAT);
  f.cone(mid, bot, w * 0.6, 0.014 * sc, M.throat).flag(PF.FLAT);
  if (s.teeth > 0) {
    // Fanned tooth rows along the four rim edges, pointing into the throat.
    for (let sd = 1; sd >= -1; sd -= 2) {
      const corner = f.add(mid, hx, sd * w * 0.62);
      f.cone(f.mix(top, corner, 0.08), f.mix(top, corner, 0.95), 0.016 * sc, 0.012 * sc, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(-0.01).seed(3 + sd);
      f.cone(f.mix(bot, corner, 0.08), f.mix(bot, corner, 0.95), 0.015 * sc, 0.011 * sc, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(-0.01).seed(7 + sd);
    }
  }
}

/** Pounce smears: the head and chest streak back along their path for a redraw. */
function theroSmears(f: PixelFigure, r: TheroRig, M: DinoMats, st: TheroPose, sc: number, s: TheroSpec) {
  const mem = st.mem!;
  const head = f.at(r.head, 0, 0, s.skull.len * 0.5);
  const chest = f.at(r.chest, 0, 0, s.torso.len * 0.5);
  if (mem.valid && st.time > mem.t && st.time - mem.t < 0.2) {
    const a = f.project(mem.head, P0);
    const b = f.project(head, P1);
    if (Math.hypot(b.x - a.x, b.y - a.y) > 6) {
      f.layer(0.02 * sc, PART.NONE, 0.05, 0.3);
      f.cone(head, f.mix(head, mem.head, 0.7), s.skull.r[1] * 0.9 * sc, s.skull.r[1] * 0.25 * sc, M.hide).flag(PF.FLAT).tone(0.1).min(0.5);
      f.cone(chest, f.mix(chest, mem.chest, 0.6), s.torso.r1[1] * 0.8 * sc, s.torso.r1[1] * 0.2 * sc, M.hide).flag(PF.FLAT).tone(0.1).min(0.5);
    }
  }
  mem.head.copy(head);
  mem.chest.copy(chest);
  mem.t = st.time;
  mem.valid = true;
}

const frillMats = { y: 0, o: 0, r: 0, k: 0 };

/**
 * Dilophosaurus neck frill (the weak point): two fans of petals around the head,
 * yellow → orange → a scalloped red rim, dark speckles; drawn while the fan is
 * open (its pivot's scale opens and folds it like the 3D one).
 */
export function paintFrill(f: PixelFigure, pivots: readonly THREE.Object3D[], s: TheroSpec) {
  if (!frillMats.y) {
    frillMats.y = Mat.flat(0xffd21e, 'frill');
    frillMats.o = Mat.flat(0xff8a1a, 'frill');
    frillMats.r = Mat.flat(0xd8281a, 'frill');
    frillMats.k = Mat.flat(0x1c1410, 'frill');
  }
  const R = 0.46;
  // The two half fans together ring the neck: each is drawn as its whole disc
  // (the union is the same), in concentric bands, ribbed and speckled.
  for (let i = 0; i < pivots.length; i++) {
    const p = pivots[i];
    if (!p.visible) continue;
    const sc = scaleOf(p);
    if (sc < 0.3) continue;
    f.layer(0.02 * sc, PART.WEAK);
    f.ellipsoid(p, 0, 0, 0, R * 0.96, R * 0.96, 0.02, frillMats.r).flag(PF.FLAT).rag(0.03 * sc).seed(4 + i);
    f.ellipsoid(p, 0, 0, 0, R * 0.8, R * 0.8, 0.02, frillMats.o).flag(PF.FLAT).z(-0.01).k(0.002);
    f.ellipsoid(p, 0, 0, 0, R * 0.55, R * 0.55, 0.02, frillMats.y).flag(PF.FLAT).z(-0.02).k(0.002);
    const c = f.at(p, 0, 0, 0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + i * 0.4;
      f.decal(f.at(p, Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2, 0), f.at(p, Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, 0), 0.007 * sc, 0.009 * sc, frillMats.y)
        .flag(PF.FLAT | PF.SHADE_ONLY)
        .tone(-0.35)
        .min(0.5);
      if (k % 2 === 1) {
        const sp = f.at(p, Math.cos(a + 0.35) * R * 0.68, Math.sin(a + 0.35) * R * 0.68, 0);
        f.decal(sp, sp, 0.024 * sc, 0.024 * sc, frillMats.k).flag(PF.FLAT).min(0.5);
      }
    }
    void c;
  }
  void s;
}

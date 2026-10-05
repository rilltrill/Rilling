import * as THREE from 'three';
import type { Palette, PteroRig, TrikeRig } from '../enemies/dinoKit';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat } from '../../gameplay/pixel/materials';

/**
 * ─── PixelCast beasts: the non-theropod dinosaurs ───────────────────────────
 *
 *   ptero   a furry body and neck, a long pointed beak, a swept-back crest
 *           with a glowing tip, glowing eyes; each wing a tapered membrane in
 *           two parts (arm → wrist → pointed tip) with a pale bony leading edge
 *           and dark finger bands on the lining (players mostly see it from
 *           below, so the side facing the camera picks lining or top).
 *   trike   a barrel body with a saddle, a fan frill (scalloped, banded red /
 *           amber, a rim of spikes), two long brow horns and a nose horn, a
 *           hooked beak, columnar legs with toes, a stubby tail.
 *
 * Built from the live rigs (`buildPtero`, `buildTrike`), so every shape sits on
 * its hitbox.
 */

function scaleOf(o: THREE.Object3D): number {
  const e = o.matrixWorld.elements;
  return Math.hypot(e[0], e[1], e[2]);
}

const proxy = { matrixWorld: new THREE.Matrix4() } as unknown as THREE.Object3D;
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

/** A stand-in joint: `j`'s frame moved by (x, y, z) and rotated by Euler (rx, ry, rz). */
function frame(j: THREE.Object3D, x: number, y: number, z: number, rx: number, ry: number, rz: number): THREE.Object3D {
  _m.makeRotationFromEuler(_e.set(rx, ry, rz)).setPosition(x, y, z);
  proxy.matrixWorld.multiplyMatrices(j.matrixWorld, _m);
  return proxy;
}

// ─── Pteranodon ────────────────────────────────────────────────────────────

/** Wing polygons (x along the span, z along the body) — the 3D wing's own outline. */
const INNER: readonly (readonly [number, number])[] = [
  [0, 0.17],
  [0.98, 0.13],
  [0.98, -0.1],
  [0.55, -0.32],
  [0.0, -0.46],
];
const OUTER: readonly (readonly [number, number])[] = [
  [0, 0.13],
  [0.6, 0.06],
  [1.25, -0.24],
  [0.75, -0.22],
  [0.0, -0.1],
];

interface PteroMats {
  fur: number;
  belly: number;
  lining: number;
  top: number;
  bone: number;
  beak: number;
  beakDark: number;
  crest: number;
  crest2: number;
  glow: number;
  band: number;
  claw: number;
}
const pteroCache = new WeakMap<Palette, PteroMats>();

function pteroMats(p: Palette): PteroMats {
  let m = pteroCache.get(p);
  if (m) return m;
  m = {
    fur: Mat.hide(p.base, { scale: 0.08 }),
    belly: Mat.hide(p.belly, { scale: 0.08 }),
    lining: Mat.cloth(p.belly, { pattern: 0 }),
    top: Mat.cloth(p.back, { pattern: 0 }),
    bone: Mat.bone(0xe8dcc0),
    beak: Mat.gloss(0xb8a070),
    beakDark: Mat.gloss(0x3a3024),
    crest: Mat.gloss(p.accent),
    crest2: Mat.gloss(p.accent2),
    glow: Mat.glow(p.eye),
    band: Mat.flat(p.stripe, 'band'),
    claw: Mat.gloss(p.claw),
  };
  pteroCache.set(p, m);
  return m;
}

export function paintPtero(f: PixelFigure, r: PteroRig, pal: Palette): boolean {
  f.maxTexels = 240;
  const M = pteroMats(pal);
  const s = scaleOf(r.body);
  const b = r.body;
  // ── Body + neck (torso) ──
  f.layer(0.04 * s, PART.TORSO);
  const bx = f.dir(b, 1, 0, 0);
  const by = f.dir(b, 0, 1, 0);
  f.coneE(f.at(b, 0, 0, -0.38), f.at(b, 0, 0, 0.24), bx, by, 0.1 * s, 0.11 * s, 0.15 * s, 0.16 * s, M.fur);
  f.cone(f.at(b, 0, 0, -0.36), f.at(b, 0, -0.2, -0.36), 0.05 * s, 0.01 * s, M.fur).min(0.5);
  f.coneE(f.at(r.neck, 0, 0, -0.03), f.at(r.neck, 0, 0, 0.31), f.dir(r.neck, 1, 0, 0), f.dir(r.neck, 0, 1, 0), 0.08 * s, 0.09 * s, 0.055 * s, 0.065 * s, M.fur).k(0.03 * s);
  if (f.facing(f.at(b, 0, -0.15, 0), f.dir(b, 0, -1, 0)) > 0) {
    f.decal(f.at(b, 0, -0.1, -0.3), f.at(b, 0, -0.12, 0.2), 0.07 * s, 0.1 * s, M.belly).flag(PF.FLAT);
  }
  // ── Head: skull, long beak, crest blade (glowing tip), eyes ──
  const h = r.head;
  f.layer(0.02 * s, PART.HEAD);
  const hx = f.dir(h, 1, 0, 0);
  const hy = f.dir(h, 0, 1, 0);
  f.coneE(f.at(h, 0, 0, -0.06), f.at(h, 0, 0, 0.14), hx, hy, 0.06 * s, 0.07 * s, 0.055 * s, 0.06 * s, M.fur);
  f.coneE(f.at(h, 0, -0.005, 0.12), f.at(h, 0, -0.045, 0.9), hx, hy, 0.045 * s, 0.05 * s, 0.006 * s, 0.008 * s, M.beak).mat2(M.beakDark, 0.88).min(0.5);
  f.coneE(f.at(r.jaw, 0, -0.01, 0), f.at(r.jaw, 0, -0.01, 0.7), hx, hy, 0.04 * s, 0.025 * s, 0.005 * s, 0.005 * s, M.beak).mat2(M.beakDark, 0.86).min(0.5);
  // Crest: +Z rotated by Rx(−2.75) — swept back and up.
  const cy = Math.sin(2.75);
  const cz = Math.cos(2.75);
  f.coneE(f.at(h, 0, 0.06, 0.05), f.at(h, 0, 0.06 + cy * 0.6, 0.05 + cz * 0.6), hx, hy, 0.032 * s, 0.085 * s, 0.016 * s, 0.03 * s, M.crest2).mat2(M.crest, 0.35).k(0.02 * s);
  f.coneE(f.at(h, 0, 0.06 + cy * 0.41, 0.05 + cz * 0.41), f.at(h, 0, 0.06 + cy * 0.63, 0.05 + cz * 0.63), hx, hy, 0.026 * s, 0.052 * s, 0.019 * s, 0.036 * s, M.glow).flag(PF.GLOW).k(0.004 * s).z(-0.01);
  for (let sd = 1; sd >= -1; sd -= 2) {
    const e = f.at(h, sd * 0.058, 0.026, 0.03);
    if (f.facing(e, f.dir(h, sd, 0.2, 0.3)) < 0) continue;
    f.decal(e, e, 0.03 * s, 0.03 * s, M.glow).flag(PF.FLAT | PF.GLOW).min(0.6);
  }
  // ── Wings: inner (shoulder → wrist) and outer (wrist → tip) membranes ──
  for (let i = 0; i < 2; i++) {
    const sh = r.shoulders[i];
    const wr = r.wrists[i];
    const side = i === 0 ? 1 : -1;
    f.layer(0.03 * s, PART.LIMB);
    const ny = f.dir(sh, 0, 1, 0);
    const under = f.facing(f.at(sh, side * 0.5, 0, -0.1), ny) < 0;
    const mem = under ? M.lining : M.top;
    // The membrane: the wing's own polygons as flat triangles (they shear with the
    // view exactly like the 3D wing), one melted shape per wing.
    const I = INNER;
    for (let k = 1; k < I.length - 1; k++) {
      f.tri(f.at(sh, side * I[0][0], 0, I[0][1]), f.at(sh, side * I[k][0], 0, I[k][1]), f.at(sh, side * I[k + 1][0], 0, I[k + 1][1]), mem, 0.02);
    }
    const O = OUTER;
    for (let k = 1; k < O.length - 1; k++) {
      f.tri(f.at(wr, side * O[0][0], 0, O[0][1]), f.at(wr, side * O[k][0], 0, O[k][1]), f.at(wr, side * O[k + 1][0], 0, O[k + 1][1]), mem, 0.02);
    }
    // Leading edge: arm bones (pale, so the outline reads from any angle).
    f.cone(f.at(sh, 0, 0, 0.15), f.at(sh, side * 0.98, 0, 0.12), 0.04 * s, 0.03 * s, M.bone).k(0.015 * s).z(-0.01);
    f.cone(f.at(wr, 0, 0, 0.12), f.at(wr, side * 0.6, 0, 0.06), 0.036 * s, 0.024 * s, M.bone).k(0.01 * s).z(-0.01);
    f.cone(f.at(wr, side * 0.6, 0, 0.06), f.at(wr, side * 1.25, 0, -0.23), 0.02 * s, 0.006 * s, M.bone).k(0.01 * s).z(-0.01).min(0.5);
    if (under) {
      // Dark finger bands across the lining.
      f.decal(f.at(sh, side * 0.3, 0, 0.1), f.at(sh, side * 0.2, 0, -0.35), 0.02 * s, 0.02 * s, M.band).flag(PF.FLAT).min(0.5);
      f.decal(f.at(sh, side * 0.7, 0, 0.1), f.at(sh, side * 0.6, 0, -0.25), 0.02 * s, 0.02 * s, M.band).flag(PF.FLAT).min(0.5);
      f.decal(f.at(wr, side * 0.4, 0, 0.06), f.at(wr, side * 0.55, 0, -0.18), 0.016 * s, 0.016 * s, M.band).flag(PF.FLAT).min(0.5);
    }
    // Hand claws at the wrist.
    f.cone(f.at(wr, 0, 0, 0.13), f.at(wr, side * 0.06, -0.02, 0.22), 0.012 * s, 0.003 * s, M.claw).min(0.5);
  }
  // ── Legs, trailing behind ──
  f.layer(0.01 * s, PART.LIMB);
  for (let sd = 1; sd >= -1; sd -= 2) {
    // (The 3D legs trail backward and a little UP: +Z turned by Euler (0.2, π ± 0.12, 0).)
    const a = f.at(r.legs, sd * 0.08, 0, 0);
    const d = f.at(r.legs, sd * 0.08 + sd * 0.04, 0.066, -0.33);
    f.cone(a, d, 0.033 * s, 0.02 * s, M.fur).min(0.5);
    f.cone(d, f.at(r.legs, sd * 0.11, -0.02, -0.38), 0.012 * s, 0.003 * s, M.claw).min(0.5);
  }
  return true;
}

// ─── Triceratops ───────────────────────────────────────────────────────────

interface TrikeMats {
  hide: number;
  back: number;
  belly: number;
  limb: number;
  horn: number;
  hornTip: number;
  beak: number;
  red: number;
  amber: number;
  spike: number;
  claw: number;
  eye: number;
  mouth: number;
}
const trikeCache = new WeakMap<Palette, TrikeMats>();

function trikeMats(p: Palette): TrikeMats {
  let m = trikeCache.get(p);
  if (m) return m;
  const belly = Mat.hide(p.belly, { scale: 0.3 });
  m = {
    hide: Mat.hide(p.base, { stripes: 0.7, stripe: p.stripe, belly, scale: 0.5 }),
    back: Mat.hide(p.back, { scale: 0.3 }),
    belly,
    limb: Mat.hide(p.base, { scale: 0.25 }),
    horn: Mat.bone(p.teeth),
    hornTip: Mat.gloss(0x3a3428),
    beak: Mat.gloss(0x35302a),
    red: Mat.flat(p.accent, 'frill'),
    amber: Mat.flat(p.accent2, 'frill'),
    spike: Mat.bone(p.teeth),
    claw: Mat.gloss(p.claw),
    eye: Mat.glow(p.eye),
    mouth: Mat.mouth(p.mouth),
  };
  trikeCache.set(p, m);
  return m;
}

export function paintTrike(f: PixelFigure, r: TrikeRig, pal: Palette): boolean {
  f.maxTexels = 240;
  const M = trikeMats(pal);
  const s = scaleOf(r.body);
  const b = r.body;
  // ── Body (one melted layer with the neck and tail) ──
  f.layer(0.2 * s, PART.TORSO);
  f.ellipsoid(b, 0, 0.06, 0.28, 0.92, 0.84, 1.55, M.hide).u(0).k(0.25 * s);
  f.ellipsoid(b, 0, 0.12, -0.68, 0.84, 0.8, 0.95, M.hide).u(1.2).k(0.25 * s);
  f.coneE(f.at(r.neck, 0, 0, -0.08), f.at(r.neck, 0, 0, 0.54), f.dir(r.neck, 1, 0, 0), f.dir(r.neck, 0, 1, 0), 0.5 * s, 0.52 * s, 0.4 * s, 0.44 * s, M.hide).k(0.15 * s).u(-0.6);
  let u = 2.0;
  let rr = 0.5;
  const tl = [0.78, 0.7, 0.62];
  for (let i = 0; i < r.tail.length; i++) {
    const seg = r.tail[i];
    const last = i === r.tail.length - 1;
    const r1 = last ? 0.045 : rr * 0.62;
    f.coneE(f.at(seg, 0, 0, 0.1), f.at(seg, 0, 0, -tl[i]), f.dir(seg, 1, 0, 0), f.dir(seg, 0, 1, 0), rr * s, rr * 1.04 * s, r1 * s, r1 * 1.04 * s, M.hide)
      .part(PART.TAIL)
      .u(u)
      .k(0.12 * s);
    u += tl[i] * 1.3;
    rr = r1;
  }
  // ── Head: skull, drooping snout, hooked beak, cheek horns ──
  const h = r.head;
  f.layer(0.08 * s, PART.HEAD);
  const hx = f.dir(h, 1, 0, 0);
  const hy = f.dir(h, 0, 1, 0);
  f.coneE(f.at(h, 0, 0, -0.3), f.at(h, 0, 0, 0.6), hx, hy, 0.44 * s, 0.5 * s, 0.33 * s, 0.36 * s, M.hide).k(0.1 * s);
  f.coneE(f.at(h, 0, -0.04, 0.52), f.at(h, 0, -0.32, 1.27), hx, hy, 0.31 * s, 0.34 * s, 0.09 * s, 0.11 * s, M.hide).k(0.1 * s);
  f.cone(f.at(h, 0, -0.3, 1.12), f.at(h, 0, -0.5, 1.28), 0.085 * s, 0.01 * s, M.beak).k(0.02 * s).min(0.5);
  f.coneE(f.at(r.jaw, 0, 0, -0.1), f.at(r.jaw, 0, 0.04, 0.9), hx, hy, 0.3 * s, 0.14 * s, 0.08 * s, 0.06 * s, M.hide).k(0.04 * s).mat2(M.beak, 0.85);
  for (let sd = 1; sd >= -1; sd -= 2) {
    f.cone(f.at(h, sd * 0.36, -0.12, 0.05), f.at(h, sd * 0.55, -0.19, 0.05), 0.1 * s, 0.01 * s, M.back).k(0.03 * s).min(0.5);
    const e = f.at(h, sd * 0.3, 0.12, 0.42);
    if (f.facing(e, f.dir(h, sd, 0.3, 0.4)) > 0) f.decal(e, e, 0.045 * s, 0.04 * s, M.eye).flag(PF.FLAT | PF.GLOW).min(0.6);
  }
  // ── Frill (armour): a fan behind the head, banded, scalloped, spiked rim ──
  f.layer(0.06 * s, PART.ARMOR, 0, 0.02);
  const R = 1.05;
  const fr = frame(h, 0, 0.22, -0.3, -0.85, 0, 0);
  const c = f.at(fr, 0, 0, 0);
  // The fan itself: triangles from the centre to a scalloped rim (the 3D fan's own
  // shape), banded amber → red with a pale rim, and spikes around the edge.
  for (let i = 0; i < 14; i++) {
    const a0 = -0.3 + ((Math.PI + 0.6) * i) / 14;
    const a1 = -0.3 + ((Math.PI + 0.6) * (i + 1)) / 14;
    const r0 = i % 2 ? 1.0 : 0.94;
    const r1 = (i + 1) % 2 ? 1.0 : 0.94;
    f.tri(c, f.at(fr, Math.cos(a0) * R * r0, Math.sin(a0) * R * r0, 0), f.at(fr, Math.cos(a1) * R * r1, Math.sin(a1) * R * r1, 0), M.red);
  }
  for (let i = 0; i < 7; i++) {
    const a0 = -0.3 + ((Math.PI + 0.6) * i) / 7;
    const a1 = -0.3 + ((Math.PI + 0.6) * (i + 1)) / 7;
    f.tri(c, f.at(fr, Math.cos(a0) * R * 0.68, Math.sin(a0) * R * 0.68, 0), f.at(fr, Math.cos(a1) * R * 0.68, Math.sin(a1) * R * 0.68, 0), M.amber).z(-0.01);
  }
  for (let i = 0; i <= 14; i++) {
    const a = -0.32 + ((Math.PI + 0.64) * i) / 14;
    const p0 = f.at(fr, Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, 0);
    const p1 = f.at(fr, Math.cos(a) * R * 1.06, Math.sin(a) * R * 1.06, 0);
    f.cone(p0, p1, 0.05 * s, 0.008 * s, M.spike).z(-0.02).min(0.5);
  }
  // ── Horns (armour): two long brow horns, a nose horn ──
  f.layer(0.02 * s, PART.ARMOR);
  for (let sd = 1; sd >= -1; sd -= 2) {
    // +Y rotated by (1.18, 0, −side·0.12): forward and a little up.
    const fr = frame(h, sd * 0.22, 0.36, 0.28, 1.18, 0, -sd * 0.12);
    f.cone(f.at(fr, 0, 0, 0), f.at(fr, 0, 0.72, 0), 0.1 * s, 0.04 * s, M.horn);
    f.cone(f.at(fr, 0, 0.72, 0), f.at(fr, 0, 1.0, 0), 0.04 * s, 0.006 * s, M.hornTip).min(0.5);
  }
  {
    const fr = frame(h, 0, 0.18, 0.86, 0.5, 0, 0);
    f.cone(f.at(fr, 0, 0, 0), f.at(fr, 0, 0.32, 0), 0.085 * s, 0.01 * s, M.horn).min(0.5);
  }
  // ── Legs: columnar, toes ──
  for (let i = 0; i < r.legs.length; i++) {
    const L = r.legs[i];
    const [a, bl] = L.len;
    const ru = L.front ? 0.27 : 0.38;
    f.layer(0.1 * s, PART.LIMB);
    // (The upper leg's top is buried in the barrel body: draw only what hangs below it.)
    f.cone(f.at(L.upper, 0, -a * 0.45, 0), f.at(L.upper, 0, -a, 0), ru * 0.85 * s, 0.21 * s, M.limb);
    f.cone(f.at(L.lower, 0, 0.04, 0), f.at(L.lower, 0, -bl, 0.03), 0.19 * s, 0.21 * s, M.limb);
    for (let c = -1; c <= 1; c++) f.cone(f.at(L.lower, c * 0.1, -bl - 0.06, 0.14), f.at(L.lower, c * 0.1, -bl - 0.08, 0.26), 0.05 * s, 0.01 * s, M.claw).min(0.5);
  }
  return true;
}

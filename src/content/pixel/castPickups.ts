import * as THREE from 'three';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat } from '../../gameplay/pixel/materials';
import type { PickupKind } from '../../core/types';
import { BOX, box, castMat, castView, enamelMat, faceShown, faceTone, line, paint, scaleOf, screenOff, sparkle, woodMat } from './castKit';

/**
 * ─── PixelCast pickups ─────────────────────────────────────────────────────
 *
 * Shoot-to-collect items drawn as arcade pixel-art props, painted from the
 * pickup's live model frame (it spins and bobs; so does the sprite, and the
 * sprite covers every hitbox): a scuffed white first-aid kit with a lid seam,
 * latches, a carry handle, end straps and a square-cut red cross; plank-and-
 * bracket weapon crates with a stencilled band in a muted shade of the weapon's
 * colour and the gun itself lying on the lid (pump shotgun, SMG, revolver); a
 * round bomb with a fuse cap and a fizzing fuse spark; a brilliant-cut gem
 * (table, crown and pavilion facets in five glowing steps, a pale rim on the lit
 * edge and a dark-gold one on the shadow side, an inner fire, a star glint)
 * whose facets turn with the spin. All of them: a crisp 1–2 px halo ring that
 * breathes with the 3D one — the front arc bright, the back arc dim behind the
 * item, sparkle beads travelling round it — and every ~1.7 s a short glint that
 * runs along the item's top edge and ends in a star twinkle.
 */

export interface PickupParts {
  /** The model group (spins about Y, bobs) — everything is placed in its frame. */
  model: THREE.Object3D;
  /** The halo ring (its scale pulses). */
  halo: THREE.Object3D | null;
  /** Item colour (halo, band, glow). */
  color: number;
}

// ─── Materials (made the first time a kind / colour is painted: the table is shared) ──

const hsl = { h: 0, s: 0, l: 0 };
function shade(color: number, ds: number, l: (l: number) => number, dh = 0): number {
  new THREE.Color(color).getHSL(hsl);
  return new THREE.Color().setHSL((hsl.h + dh + 1) % 1, Math.min(1, hsl.s * ds), Math.min(0.97, Math.max(0, l(hsl.l)))).getHex();
}

interface HaloM {
  ring: number;
  dim: number;
  bead: number;
}
const haloCache = new Map<number, HaloM>();
function haloMats(color: number): HaloM {
  let m = haloCache.get(color);
  if (!m) {
    m = {
      ring: Mat.glow(color),
      dim: Mat.glow(shade(color, 0.85, (l) => l * 0.42)),
      bead: Mat.glow(shade(color, 0.6, (l) => l * 0.4 + 0.6)),
    };
    haloCache.set(color, m);
  }
  return m;
}

const W = { ready: false, white: 0, cross: 0, crossRim: 0, latch: 0, handle: 0, shine: 0 };
function medMats() {
  if (!W.ready) {
    W.ready = true;
    W.white = enamelMat(0xf2f0e8, 0.8, 0.55);
    W.cross = Mat.glow(0xff2a2a);
    W.crossRim = enamelMat(0x8a1010, 0.5, 0.4);
    W.latch = Mat.gloss(0x5a5e66);
    W.handle = Mat.leather(0x2a2a30);
    W.shine = Mat.glow(0xffffff);
  }
  return W;
}

const K = { ready: false, wood: 0, bracket: 0, steel: 0, gunWood: 0 };
function crateMats() {
  if (!K.ready) {
    K.ready = true;
    K.wood = woodMat(0x7a5a38);
    K.bracket = Mat.plate(0x6a6e78);
    K.steel = Mat.gloss(0x4a5260);
    K.gunWood = Mat.leather(0xa8602a);
  }
  return K;
}
const bandCache = new Map<number, { band: number; edge: number }>();
/** The crate's stencilled band: a muted, darker shade of the weapon's colour (never the halo's own glow). */
function bandMats(color: number) {
  let b = bandCache.get(color);
  if (!b) {
    b = {
      band: castMat(shade(color, 0.55, (l) => l * 0.62), 0, { light: 0.45, dark: 0.4, sat: 1, dither: 0, strength: 0 }),
      edge: castMat(shade(color, 0.5, (l) => l * 0.3), 0, { light: 0.4, dark: 0.45, sat: 1, dither: 0, strength: 0 }),
    };
    bandCache.set(color, b);
  }
  return b;
}

const B = { ready: false, bomb: 0, band: 0, fuse: 0 };
function bombMats() {
  if (!B.ready) {
    B.ready = true;
    B.bomb = Mat.gloss(0x3a4630);
    B.band = Mat.plate(0x2a2e28);
    B.fuse = Mat.cloth(0xb08a50, { strength: 0.3 });
  }
  return B;
}

interface GemM {
  /** Five self-lit facet steps, pale → deep. */
  steps: number[];
  rimLit: number;
  rimDark: number;
}
const gemCache = new Map<number, GemM>();
function gemMats(color: number): GemM {
  let g = gemCache.get(color);
  if (!g) {
    g = {
      steps: [
        Mat.glow(shade(color, 0.45, (l) => l * 0.25 + 0.72)),
        Mat.glow(shade(color, 0.85, (l) => l * 0.6 + 0.36, -0.01)),
        Mat.glow(color),
        Mat.glow(shade(color, 1, (l) => l * 0.74, -0.02)),
        Mat.glow(shade(color, 1, (l) => l * 0.52, -0.035)),
      ],
      rimLit: Mat.glow(shade(color, 0.4, (l) => l * 0.2 + 0.78)),
      rimDark: Mat.glow(shade(color, 0.95, (l) => l * 0.32, -0.04)),
    };
    gemCache.set(color, g);
  }
  return g;
}

/** Item glint: 0..1 while it runs (every `period` s, lasting `dur`), else −1. */
function glintPhase(time: number, seed: number, period = 1.7, dur = 0.42): number {
  const t = (time + seed * 0.37) % period;
  return t < dur ? t / dur : -1;
}

/**
 * Paint a pickup (ART: SPRITES). `time` = its age (seconds), `cam` = the main
 * camera (face shading). False = nothing to draw.
 */
export function paintPickup(f: PixelFigure, kind: PickupKind, P: PickupParts, time: number, cam: THREE.Camera): boolean {
  const g = P.model;
  if (!g.visible) return false;
  castView(cam);
  const s = scaleOf(g);
  f.maxTexels = 110;
  const gl = glintPhase(time, kind.length * 3.1);
  const H = haloMats(P.color);
  if (kind === 'health') medkit(f, g, s, gl);
  else if (kind === 'bomb') bomb(f, g, s, time, H);
  else if (kind === 'points') gem(f, g, s, time, gl, P.color);
  else crate(f, g, s, kind, gl, P.color);
  halo(f, g, P, H, s, time);
  return true;
}

// ─── Halo ring ───────────────────────────────────────────────────────────────

/** Ring segments (the 3D torus: radius 0.42 in the model's XZ plane, pulsing ±8 %). */
const HALO_N = 16;

const _hn = new THREE.Vector3();
const _hc = new THREE.Vector3();

function halo(f: PixelFigure, g: THREE.Object3D, P: PickupParts, H: HaloM, s: number, time: number) {
  const k = P.halo ? P.halo.scale.x : 1;
  const r = 0.42 * k;
  // Seen edge-on (eye level) the ring would be a flat stripe through the item: open it
  // a little, as if seen from a touch above — the near arc dips, the far arc rises.
  _hc.setFromMatrixPosition(g.matrixWorld);
  const up = f.dir(g, 0, 1, 0);
  const open = Math.max(0, 0.14 - Math.abs(f.facing(_hc, up))) * r;
  _hn.subVectors(f.eye, _hc).normalize();
  // One thin glowing line round the item: the arc toward the camera bright, the far arc
  // dim (and behind the item: the layer composites by depth), 1–2 texels wide.
  f.layer(0.002 * s, PART.TORSO);
  const fl = PF.GLOW | PF.NO_OUTLINE | PF.FLAT;
  let pa: THREE.Vector3 | null = null;
  for (let i = 0; i <= HALO_N; i++) {
    const a = (i / HALO_N) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const rad = f.dir(g, c, 0, sn);
    const near = rad.dot(_hn);
    const p = screenOff(f, f.at(g, c * r, 0, sn * r), 0, -near * open);
    if (pa) {
      const am = a - Math.PI / HALO_N;
      const front = f.dir(g, Math.cos(am), 0, Math.sin(am)).dot(_hn) > -0.05;
      f.cone(pa, p, front ? 0.013 : 0.008, front ? 0.013 : 0.008, front ? H.ring : H.dim)
        .flag(fl)
        .z(front ? 0 : 0.01)
        .min(0.5);
    }
    pa = p;
  }
  // Sparkle beads travelling round the ring.
  for (let i = 0; i < 3; i++) {
    const a = time * 1.9 + (i / 3) * Math.PI * 2;
    const rad = f.dir(g, Math.cos(a), 0, Math.sin(a));
    const near = rad.dot(_hn);
    const p = screenOff(f, f.at(g, Math.cos(a) * r, 0, Math.sin(a) * r), 0, -near * open);
    const front = near > 0;
    f.ball(p, (front ? 0.022 : 0.013) * s, front ? H.bead : H.ring).flag(fl).z(-0.004).min(0.6);
  }
}

/** Box side faces a glint may run along (+X, −X, +Z, −Z). */
const SIDES = [0, 1, 4, 5];

/**
 * The glint: a short bright streak running along the top front edge of the last
 * `box` (its side face turned most to the camera), ending in a star twinkle at the corner.
 */
function edgeGlint(f: PixelFigure, g: THREE.Object3D, s: number, hx: number, hy: number, hz: number, gl: number, mat: number) {
  if (gl < 0) return;
  let best = -1;
  let bf = 0.15;
  for (let j = 0; j < 4; j++) {
    const i = SIDES[j];
    if (BOX.mask & (1 << i) && BOX.facing[i] > bf) {
      bf = BOX.facing[i];
      best = i;
    }
  }
  if (best < 0) return;
  const ax = best >> 1;
  const sg = best & 1 ? -1 : 1;
  // Along the face's top edge, from one corner to the other.
  const ex = ax === 0 ? sg * hx : 0;
  const ez = ax === 2 ? sg * hz : 0;
  const ux = ax === 0 ? 0 : sg;
  const uz = ax === 0 ? -sg : 0;
  const L = ax === 0 ? hz : hx;
  const t = Math.min(1, gl / 0.75);
  const c = -L + 2 * L * t;
  f.layer(0.002 * s, PART.TORSO, 0, -0.02);
  const fl = PF.GLOW | PF.NO_OUTLINE | PF.FLAT;
  if (t < 1) {
    const a = Math.max(-L, c - 0.07);
    const b = Math.min(L, c + 0.02);
    f.cone(f.at(g, ex + ux * a, hy, ez + uz * a), f.at(g, ex + ux * b, hy, ez + uz * b), 0.006 * s, 0.012 * s, mat).flag(fl).min(0.5);
  } else {
    const tw = 1 - Math.abs((gl - 0.87) / 0.13);
    sparkle(f, f.at(g, ex + ux * L, hy, ez + uz * L), 0.075 * s * Math.max(0.3, tw), mat, 0.6, 0.25);
  }
}

// ─── First-aid kit ───────────────────────────────────────────────────────────

function medkit(f: PixelFigure, g: THREE.Object3D, s: number, gl: number) {
  const M = medMats();
  const hx = 0.25;
  const hy = 0.18;
  const hz = 0.11;
  // Carry handle (behind the lid line): two posts + a grip.
  f.layer(0.01 * s, PART.TORSO);
  f.cone(f.at(g, -0.085, hy - 0.01, 0), f.at(g, -0.085, hy + 0.05, 0), 0.016, 0.016, M.handle).min(0.6);
  f.cone(f.at(g, 0.085, hy - 0.01, 0), f.at(g, 0.085, hy + 0.05, 0), 0.016, 0.016, M.handle).min(0.6);
  f.cone(f.at(g, -0.09, hy + 0.055, 0), f.at(g, 0.09, hy + 0.055, 0), 0.02, 0.02, M.handle).min(0.6);
  // The case.
  f.layer(0.006 * s, PART.TORSO);
  box(f, g, 0, 0, 0, hx, hy, hz, M.white, 0.012, 1.15);
  const mask = BOX.mask;
  // Lid seam all round, latches, wear (grime along the foot, scuffs, a dent), end straps.
  for (let i = 0; i < 6; i++) {
    if (!faceShown(i, 0.12)) continue;
    if (i === 4 || i === 5) {
      const z = i === 4 ? hz : -hz;
      const d = i === 4 ? 1 : -1;
      line(f, g, -hx, 0.118, z, hx, 0.118, z, 0.006, -0.32, M.white);
      line(f, g, -hx, 0.128, z, hx, 0.128, z, 0.004, 0.18, M.white);
      for (let k = -1; k <= 1; k += 2) paint(f, g, k * 0.19, 0.1, z, k * 0.19, 0.14, z, 0.018, M.latch);
      line(f, g, -hx + 0.02, -hy + 0.02, z, hx - 0.02, -hy + 0.02, z, 0.018, -0.2, M.white);
      line(f, g, d * 0.17, -0.1, z, d * 0.21, -0.13, z, 0.007, -0.3, M.white);
      line(f, g, d * -0.2, 0.06, z, d * -0.15, 0.075, z, 0.006, -0.28, M.white);
      line(f, g, d * 0.18, -0.02, z, d * 0.2, -0.05, z, 0.01, -0.22, M.white);
      line(f, g, d * 0.185, -0.012, z, d * 0.205, -0.042, z, 0.005, 0.25, M.white);
    } else if (i === 0 || i === 1) {
      const x = i === 0 ? hx : -hx;
      line(f, g, x, 0.118, -hz, x, 0.118, hz, 0.006, -0.32, M.white);
      // A strap round the end with its buckle.
      paint(f, g, x, -hy, 0, x, hy, 0, 0.022, M.handle);
      paint(f, g, x, 0.02, 0, x, 0.04, 0, 0.026, M.latch);
    } else if (i === 2) {
      // Lid top: a pale bevel just inside the edge, the straps over it.
      line(f, g, -hx + 0.02, hy, hz - 0.02, hx - 0.02, hy, hz - 0.02, 0.006, 0.15, M.white);
      for (let k = -1; k <= 1; k += 2) paint(f, g, k * (hx - 0.002), hy, -hz, k * (hx - 0.002), hy, hz, 0.012, M.handle);
    }
  }
  // The red cross (the 3D's glowing bars on both big faces): square-cut bars made of thin
  // parallel strokes (decals: no depth fight with the face) — a dark red rim, the glow inside.
  for (let k = 0; k < 2; k++) {
    if (!(mask & (1 << (4 + k)))) continue;
    const z = k === 0 ? hz : -hz;
    bar(f, g, -0.115, -0.065, 0.115, 0.025, z, M.crossRim);
    bar(f, g, -0.045, -0.135, 0.045, 0.095, z, M.crossRim);
    bar(f, g, -0.1, -0.05, 0.1, 0.01, z, M.cross);
    bar(f, g, -0.03, -0.12, 0.03, 0.08, z, M.cross);
  }
  edgeGlint(f, g, s, hx, hy, hz, gl, M.shine);
}

/**
 * A square-cut bar (x0, y0)–(x1, y1) on `g`'s plane z = `z`, painted as thin parallel
 * decal strokes along its long side (round caps ~1 texel: crisp corners, any angle).
 */
function bar(f: PixelFigure, g: THREE.Object3D, x0: number, y0: number, x1: number, y1: number, z: number, mat: number) {
  const along = x1 - x0 >= y1 - y0;
  const w = along ? y1 - y0 : x1 - x0;
  const n = Math.max(2, Math.round(w / 0.016));
  const r = w / (2 * n);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (along) {
      const y = y0 + w * t;
      f.decal(f.at(g, x0 + r, y, z), f.at(g, x1 - r, y, z), r, r, mat).flag(PF.FLAT).min(0.5);
    } else {
      const x = x0 + w * t;
      f.decal(f.at(g, x, y0 + r, z), f.at(g, x, y1 - r, z), r, r, mat).flag(PF.FLAT).min(0.5);
    }
  }
}

// ─── Weapon crates ───────────────────────────────────────────────────────────

function crate(f: PixelFigure, g: THREE.Object3D, s: number, kind: PickupKind, gl: number, color: number) {
  const M = crateMats();
  const Bd = bandMats(color);
  const hx = 0.35;
  const hy = 0.21;
  const hz = 0.21;
  // The weapon lying on the lid (its own layer: contours where it overlaps the lid).
  f.layer(0.008 * s, PART.TORSO);
  gun(f, g, M, kind, hy + 0.035);
  // The crate.
  f.layer(0.004 * s, PART.TORSO);
  box(f, g, 0, 0, 0, hx, hy, hz, M.wood, 0.008, 1.2, M.wood, M.wood);
  for (let i = 0; i < 6; i++) {
    if (!faceShown(i, 0.12)) continue;
    const ax = i >> 1;
    const sg = i & 1 ? -1 : 1;
    if (ax === 1) {
      // Lid: planks along X + a pale bevel.
      if (sg > 0) {
        for (let k = -1; k <= 1; k += 2) line(f, g, -hx, hy, k * 0.07, hx, hy, k * 0.07, 0.006, -0.3, M.wood);
        line(f, g, -hx + 0.02, hy, hz - 0.015, hx - 0.02, hy, hz - 0.015, 0.006, 0.12, M.wood);
      }
      continue;
    }
    // Side faces: planks, a stencilled band (a muted shade of the weapon's colour), metal corner brackets.
    const along = ax === 0 ? hz : hx;
    // Face-local u (across the face) → model x / z.
    const x0 = ax === 0 ? sg * hx : -along * sg;
    const z0 = ax === 0 ? along * sg : sg * hz;
    const x1 = ax === 0 ? sg * hx : along * sg;
    const z1 = ax === 0 ? -along * sg : sg * hz;
    line(f, g, x0, -0.06, z0, x1, -0.06, z1, 0.006, -0.3, M.wood);
    line(f, g, x0, 0.075, z0, x1, 0.075, z1, 0.006, -0.3, M.wood);
    paint(f, g, x0, 0.14, z0, x1, 0.14, z1, 0.03, Bd.edge);
    paint(f, g, x0, 0.14, z0, x1, 0.14, z1, 0.019, Bd.band);
    for (let k = -1; k <= 1; k += 2) {
      const t = 0.5 + k * (0.5 - 0.025 / along);
      const bx = x0 + (x1 - x0) * t;
      const bz = z0 + (z1 - z0) * t;
      paint(f, g, bx, -hy + 0.01, bz, bx, -hy + 0.06, bz, 0.022, M.bracket);
      paint(f, g, bx, hy - 0.06, bz, bx, hy - 0.01, bz, 0.022, M.bracket);
    }
    // A knot in the bottom plank.
    const kx = x0 + (x1 - x0) * 0.3;
    const kz = z0 + (z1 - z0) * 0.3;
    line(f, g, kx, -0.12, kz, kx, -0.12, kz, 0.014, -0.3, M.wood);
  }
  edgeGlint(f, g, s, hx, hy, hz, gl, medMats().shine);
}

/** The gun on the lid, along the crate's X (muzzle at −X), top at height `y`. */
function gun(f: PixelFigure, g: THREE.Object3D, M: typeof K, kind: PickupKind, y: number) {
  if (kind === 'shotgun') {
    // Pump shotgun: long barrel + magazine tube, wooden pump, receiver, stock dropping to the butt.
    f.cone(f.at(g, -0.33, y + 0.01, 0), f.at(g, 0.08, y + 0.01, 0), 0.018, 0.02, M.steel).min(0.6);
    f.cone(f.at(g, -0.24, y - 0.015, 0), f.at(g, 0.06, y - 0.015, 0), 0.016, 0.016, M.steel).min(0.5);
    f.cone(f.at(g, -0.16, y - 0.012, 0), f.at(g, -0.04, y - 0.012, 0), 0.03, 0.03, M.gunWood).min(0.6);
    f.cone(f.at(g, 0.06, y, 0), f.at(g, 0.16, y, 0), 0.034, 0.03, M.steel).min(0.6);
    f.cone(f.at(g, 0.15, y - 0.005, 0), f.at(g, 0.34, y - 0.04, 0), 0.03, 0.045, M.gunWood).min(0.6);
  } else if (kind === 'smg') {
    // SMG: stubby barrel, boxy receiver, the magazine lying out sideways, folded stock.
    f.cone(f.at(g, -0.24, y, 0), f.at(g, -0.1, y, 0), 0.014, 0.016, M.steel).min(0.6);
    f.cone(f.at(g, -0.12, y, 0), f.at(g, 0.1, y, 0), 0.036, 0.036, M.steel).min(0.6);
    f.cone(f.at(g, -0.04, y - 0.01, 0.03), f.at(g, -0.06, y - 0.015, 0.17), 0.022, 0.02, M.steel).min(0.6);
    f.cone(f.at(g, 0.06, y - 0.01, -0.03), f.at(g, 0.09, y - 0.015, -0.11), 0.018, 0.018, M.gunWood).min(0.6);
    f.cone(f.at(g, 0.1, y - 0.005, 0), f.at(g, 0.24, y - 0.01, 0), 0.012, 0.012, M.steel).min(0.5);
    f.cone(f.at(g, 0.24, y - 0.01, -0.04), f.at(g, 0.24, y - 0.01, 0.04), 0.014, 0.014, M.steel).min(0.5);
  } else {
    // Revolver: long barrel with a front sight, fat cylinder, hammer, a curved wooden grip.
    f.cone(f.at(g, -0.24, y + 0.005, 0), f.at(g, -0.02, y + 0.005, 0), 0.022, 0.024, M.steel).min(0.6);
    f.cone(f.at(g, -0.22, y + 0.03, 0), f.at(g, -0.21, y + 0.04, 0), 0.008, 0.006, M.steel).min(0.5);
    f.cone(f.at(g, -0.01, y - 0.004, 0), f.at(g, 0.07, y - 0.004, 0), 0.045, 0.045, M.steel).min(0.6);
    f.cone(f.at(g, 0.07, y + 0.01, 0), f.at(g, 0.11, y + 0.035, 0), 0.016, 0.01, M.steel).min(0.5);
    f.cone(f.at(g, 0.08, y - 0.01, 0), f.at(g, 0.2, y - 0.045, 0), 0.03, 0.038, M.gunWood).min(0.6);
  }
}

// ─── Bomb ────────────────────────────────────────────────────────────────────

function bomb(f: PixelFigure, g: THREE.Object3D, s: number, time: number, H: HaloM) {
  const M = bombMats();
  // The 3D: a 0.2 m sphere + the glowing pin (0.05 × 0.12 at y 0.22).
  f.layer(0.02 * s, PART.TORSO);
  f.ball(f.at(g, 0, 0, 0), 0.2, M.bomb);
  // Fuse cap (riveted collar).
  f.cone(f.at(g, 0, 0.16, 0), f.at(g, 0, 0.23, 0), 0.06, 0.055, M.band).k(0.01 * s);
  // A band round the belly (front half), a scuff on the iron.
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = ((i + 1) / 8) * Math.PI * 2;
    const p0 = f.at(g, Math.cos(a0) * 0.198, 0, Math.sin(a0) * 0.198);
    if (f.facing(p0, f.dir(g, Math.cos(a0), 0, Math.sin(a0))) < -0.05) continue;
    f.decal(p0, f.at(g, Math.cos(a1) * 0.198, 0, Math.sin(a1) * 0.198), 0.016, 0.016, M.band).flag(PF.FLAT).min(0.5);
  }
  f.decal(f.at(g, 0.08, -0.08, 0.15), f.at(g, 0.12, -0.05, 0.13), 0.008, 0.008, M.bomb)
    .flag(PF.FLAT | PF.SHADE_ONLY | PF.NO_OUTLINE)
    .tone(0.25)
    .min(0.5);
  // Fuse: a short curling cord.
  f.layer(0.006 * s, PART.TORSO, 0, -0.01);
  const w = Math.sin(time * 9) * 0.008;
  const a = f.at(g, 0, 0.225, 0);
  const b = f.at(g, 0.025 + w, 0.27, 0.01);
  const c = f.at(g, 0.015 + w, 0.31, 0.02);
  f.cone(a, b, 0.016, 0.014, M.fuse).min(0.6);
  f.cone(b, c, 0.014, 0.012, M.fuse).min(0.6);
  // Specular speck on the lit shoulder.
  f.layer(0.002 * s, PART.TORSO, 0, -0.25);
  f.ball(screenOff(f, f.at(g, 0, 0, 0), -0.085, 0.09), 0.026, medMats().shine).flag(PF.GLOW | PF.NO_OUTLINE).min(0.6);
  // The fizzing spark at the fuse tip: a star that flickers between sizes.
  const fk = 0.75 + 0.25 * Math.sin(time * 31) + 0.15 * Math.sin(time * 17.3);
  sparkle(f, c, 0.065 * fk, H.bead, 0.7, 0.35);
  f.ball(c, 0.022, H.ring).flag(PF.GLOW | PF.NO_OUTLINE).min(0.6);
}

// ─── Gem ─────────────────────────────────────────────────────────────────────

/** Brilliant cut round the 3D octahedron (apexes ±0.35, equator 0.25): table, crown, girdle, pavilion. */
const GEM_N = 8;
const GIRDLE_R = 0.26;
const GIRDLE_Y = 0.02;
const TABLE_R = 0.1;
const TABLE_Y = 0.3;
const CULET_Y = -0.36;
/** Visible facets this redraw: kind (0 crown, 1 pavilion, 2 table), index, glow step (scratch). */
const facetKind = new Int8Array(GEM_N * 2 + 1);
const facetIdx = new Int8Array(GEM_N * 2 + 1);
const facetStep = new Int8Array(GEM_N * 2 + 1);
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _m = new THREE.Vector3();

/** Gem vertex: ring 0 table, 1 girdle, 2 the culet; shifted (ox, oy) metres on screen. */
function gemV(f: PixelFigure, g: THREE.Object3D, ring: number, i: number, ox: number, oy: number): THREE.Vector3 {
  const a = ((i % GEM_N) / GEM_N) * Math.PI * 2 + Math.PI / GEM_N;
  const p =
    ring === 0
      ? f.at(g, Math.cos(a) * TABLE_R, TABLE_Y, Math.sin(a) * TABLE_R)
      : ring === 1
        ? f.at(g, Math.cos(a) * GIRDLE_R, GIRDLE_Y, Math.sin(a) * GIRDLE_R)
        : f.at(g, 0, CULET_Y, 0);
  return ox || oy ? screenOff(f, p, ox, oy) : p;
}

/** Draw facet (kind, i) as flat unlit triangles in `mat`, shifted (ox, oy) on screen, depth bias z. */
function gemFacet(f: PixelFigure, g: THREE.Object3D, kind: number, i: number, mat: number, ox: number, oy: number, z: number) {
  const fl = PF.GLOW | PF.NO_OUTLINE;
  if (kind === 0) {
    const t0 = gemV(f, g, 0, i, ox, oy);
    const t1 = gemV(f, g, 0, i + 1, ox, oy);
    const g0 = gemV(f, g, 1, i, ox, oy);
    const g1 = gemV(f, g, 1, i + 1, ox, oy);
    f.tri(t0, g0, g1, mat, 0.001).flag(fl).z(z);
    f.tri(t0, g1, t1, mat, 0.001).flag(fl).z(z);
  } else if (kind === 1) {
    f.tri(gemV(f, g, 1, i, ox, oy), gemV(f, g, 2, 0, ox, oy), gemV(f, g, 1, i + 1, ox, oy), mat, 0.001).flag(fl).z(z);
  } else {
    const c = gemV(f, g, 0, 0, ox, oy);
    for (let k = 1; k < GEM_N - 1; k++) f.tri(c, gemV(f, g, 0, k, ox, oy), gemV(f, g, 0, k + 1, ox, oy), mat, 0.001).flag(fl).z(z);
  }
}

function gem(f: PixelFigure, g: THREE.Object3D, s: number, time: number, gl: number, color: number) {
  const M = gemMats(color);
  // Which facets face the camera, and their glow step by how each faces the light
  // (they turn with the spin: the facet pattern rotates).
  let n = 0;
  let bright = -1;
  let bt = -9;
  for (let kind = 0; kind < 3; kind++) {
    const cnt = kind === 2 ? 1 : GEM_N;
    for (let i = 0; i < cnt; i++) {
      const A = kind === 1 ? gemV(f, g, 1, i, 0, 0) : gemV(f, g, 0, kind === 2 ? 0 : i, 0, 0);
      const Bv = kind === 1 ? gemV(f, g, 2, 0, 0, 0) : kind === 2 ? gemV(f, g, 0, 1, 0, 0) : gemV(f, g, 1, i, 0, 0);
      const C = kind === 1 ? gemV(f, g, 1, i + 1, 0, 0) : kind === 2 ? gemV(f, g, 0, 2, 0, 0) : gemV(f, g, 1, i + 1, 0, 0);
      // (All three wind inward as built.)
      _n.crossVectors(_e1.subVectors(Bv, A), _e2.subVectors(C, A)).normalize().negate();
      _m.copy(A).add(Bv).add(C).divideScalar(3);
      if (f.facing(_m, _n) <= 0.02) continue;
      const t = faceTone(_n, 2.2) + (kind === 1 ? -0.16 : kind === 2 ? 0.1 : -0.2);
      facetKind[n] = kind;
      facetIdx[n] = i;
      // Five steps by the light, every other facet a step deeper (cut stones flash light / dark round the ring).
      const st = t > 0.3 ? 0 : t > 0.1 ? 1 : t > -0.06 ? 2 : t > -0.2 ? 3 : 4;
      facetStep[n] = Math.min(4, st + (kind !== 2 && i & 1 ? 1 : 0));
      if (kind === 0 && t > bt) {
        bt = t;
        bright = n;
      }
      n++;
    }
  }
  // Rims: the whole gem a texel down-right in dark gold and a texel up-left in pale gold,
  // the facets over both (each rim shows only on its own side). One texel ≈ kHint retro px.
  const px = (1.15 / Math.max(1, f.pxPerM(f.at(g, 0, 0, 0)))) * Math.max(1, f.kHint);
  f.layer(0.001 * s, PART.TORSO);
  for (let j = 0; j < n; j++) gemFacet(f, g, facetKind[j], facetIdx[j], M.rimDark, px, -px, 0.02);
  for (let j = 0; j < n; j++) gemFacet(f, g, facetKind[j], facetIdx[j], M.rimLit, -px * 0.8, px * 0.8, 0.01);
  for (let j = 0; j < n; j++) gemFacet(f, g, facetKind[j], facetIdx[j], M.steps[facetStep[j]], 0, 0, 0);
  // Inner fire: a paler sliver inside the pavilion, a 1-px sparkle line across the brightest crown facet.
  f.layer(0.001 * s, PART.TORSO, 0, -0.01);
  const fl = PF.GLOW | PF.NO_OUTLINE | PF.FLAT;
  const pv = f.at(g, 0, CULET_Y * 0.45, 0);
  f.cone(screenOff(f, pv, -0.04, 0.05), screenOff(f, pv, 0.015, -0.06), 0.02 * s, 0.006 * s, M.steps[1]).flag(fl).min(0.5);
  if (bright >= 0) {
    const i = facetIdx[bright];
    f.cone(gemV(f, g, 0, i, 0, 0), gemV(f, g, 1, i + 1, 0, 0), 0.006 * s, 0.006 * s, M.steps[0]).flag(fl).z(-0.01).min(0.5);
  }
  // The star glint on the table's lit corner breathes; the glint passes a second star across.
  const tw = 0.5 + 0.5 * Math.sin(time * 4.2);
  sparkle(f, screenOff(f, f.at(g, 0, TABLE_Y, 0), -0.06, 0.02), 0.045 + 0.05 * tw, M.rimLit, 0.6);
  if (gl >= 0) sparkle(f, screenOff(f, f.at(g, 0, 0, 0), -0.14 + 0.28 * gl, 0.12 - 0.24 * gl), 0.08, medMats().shine, 0.5);
}

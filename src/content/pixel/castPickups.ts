import * as THREE from 'three';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat } from '../../gameplay/pixel/materials';
import type { PickupKind } from '../../core/types';
import { BOX, box, castView, enamelMat, faceTone, hoop, line, paint, scaleOf, screenOff, sparkle, woodMat } from './castKit';

/**
 * ─── PixelCast pickups ─────────────────────────────────────────────────────
 *
 * Shoot-to-collect items drawn as arcade pixel-art props, painted from the
 * pickup's live model frame (it spins and bobs; so does the sprite, and the
 * sprite covers every hitbox): a white first-aid kit with a lid seam, latches,
 * a carry handle and a glowing red cross; plank-and-bracket weapon crates with
 * the weapon's colour stencilled round them and the gun itself lying on the lid
 * (pump shotgun, SMG, revolver); a round bomb with a fuse cap and a fizzing
 * fuse spark; a faceted gold gem. All of them: a crisp glowing pixel halo ring
 * that breathes with the 3D one, an item shine that sweeps across every ~1.7 s
 * and a sparkle star.
 */

export interface PickupParts {
  /** The model group (spins about Y, bobs) — everything is placed in its frame. */
  model: THREE.Object3D;
  /** The halo ring (its scale pulses). */
  halo: THREE.Object3D | null;
  /** Item colour (halo, band, glow). */
  color: number;
}

interface Mats {
  white: number;
  whiteRim: number;
  cross: number;
  crossRim: number;
  latch: number;
  handle: number;
  wood: number;
  woodDark: number;
  bracket: number;
  steel: number;
  gunWood: number;
  bomb: number;
  bombBand: number;
  fuse: number;
  gem: number;
  /** Self-lit facets (pale → deep), like the 3D's glowing gem. */
  gemG: number[];
  shine: number;
  spark: number;
  ring: number;
  ringCore: number;
  band: number;
  bandDark: number;
}

const cache = new Map<number, Mats>();

function mats(color: number): Mats {
  let m = cache.get(color);
  if (m) return m;
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const dark = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.9), hsl.l * 0.45).getHex();
  const pale = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.7), Math.min(0.92, hsl.l * 0.5 + 0.5)).getHex();
  m = {
    white: enamelMat(0xf2f0e8, 0.8, 0.55),
    whiteRim: enamelMat(0xb8bcc4, 0.6, 0.4),
    cross: Mat.glow(0xff2a2a),
    crossRim: enamelMat(0x8a1010, 0.5, 0.4),
    latch: Mat.gloss(0x5a5e66),
    handle: Mat.leather(0x2a2a30),
    wood: woodMat(0x7a5a38),
    woodDark: woodMat(0x4e3824),
    bracket: Mat.plate(0x6a6e78),
    steel: Mat.gloss(0x4a5260),
    gunWood: Mat.leather(0xa8602a),
    bomb: Mat.gloss(0x3a4630),
    bombBand: Mat.plate(0x2a2e28),
    fuse: Mat.cloth(0xb08a50, { strength: 0.3 }),
    gem: enamelMat(dark, 0.4, 0.5),
    gemG: [
      Mat.glow(pale),
      Mat.glow(color),
      Mat.glow(new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s), hsl.l * 0.72).getHex()),
      Mat.glow(new THREE.Color().setHSL(hsl.h - 0.02, Math.min(1, hsl.s), hsl.l * 0.5).getHex()),
    ],
    shine: Mat.glow(0xffffff),
    spark: Mat.glow(pale),
    ring: Mat.glow(color),
    ringCore: Mat.glow(pale),
    band: Mat.glow(color),
    bandDark: enamelMat(dark, 0.4, 0.4),
  };
  cache.set(color, m);
  return m;
}

/** Item shine: 0..1 while a glint sweeps across (every `period` s, lasting `dur`), else −1. */
function shine(time: number, seed: number, period = 1.7, dur = 0.38): number {
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
  const M = mats(P.color);
  const s = scaleOf(g);
  f.maxTexels = 110;
  const seed = kind.length * 3.1;
  const sh = shine(time, seed);
  if (kind === 'health') medkit(f, g, M, s, sh);
  else if (kind === 'bomb') bomb(f, g, M, s, time);
  else if (kind === 'points') gem(f, g, M, s, time, sh);
  else crate(f, g, M, s, kind, sh);
  halo(f, g, P, M, s);
  return true;
}

// ─── Halo ring ───────────────────────────────────────────────────────────────

function halo(f: PixelFigure, g: THREE.Object3D, P: PickupParts, M: Mats, s: number) {
  const k = P.halo ? P.halo.scale.x : 1;
  // The 3D torus: radius 0.42, tube 0.03, flat at the model's centre (pulsing ±8 %).
  f.layer(0.004 * s, PART.TORSO);
  hoop(f, g, 1, 0, 0.42 * k, 0.03, M.ring, false, 20, true, 0, PF.GLOW | PF.NO_OUTLINE);
  // A pale hot core on the front arc only (reads as light, not a hoop of paint).
  f.layer(0.002 * s, PART.TORSO, 0, -0.01);
  hoop(f, g, 1, 0, 0.42 * k, 0.012, M.ringCore, false, 20, false, 0, PF.GLOW | PF.NO_OUTLINE);
}

// ─── First-aid kit ───────────────────────────────────────────────────────────

function medkit(f: PixelFigure, g: THREE.Object3D, M: Mats, s: number, sh: number) {
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
  // Lid seam all round + latches + the cross on the big faces.
  for (let i = 0; i < 6; i++) {
    if (!(mask & (1 << i))) continue;
    if (i === 4 || i === 5) {
      const z = i === 4 ? hz : -hz;
      line(f, g, -hx, 0.118, z, hx, 0.118, z, 0.006, -0.32, M.white);
      line(f, g, -hx, 0.128, z, hx, 0.128, z, 0.004, 0.18, M.white);
      for (let k = -1; k <= 1; k += 2) paint(f, g, k * 0.19, 0.1, z, k * 0.19, 0.14, z, 0.018, M.latch);
      // Red cross: a dark rim, then the glowing cross.
      paint(f, g, -0.095, -0.02, z, 0.095, -0.02, z, 0.05, M.crossRim);
      paint(f, g, 0, -0.115, z, 0, 0.075, z, 0.05, M.crossRim);
      paint(f, g, -0.09, -0.02, z, 0.09, -0.02, z, 0.034, M.cross);
      paint(f, g, 0, -0.11, z, 0, 0.07, z, 0.034, M.cross);
      if (sh >= 0) {
        // The shine: a pale diagonal streak sweeping left → right across the face.
        const x = -hx + (2 * hx + 0.1) * sh - 0.05;
        const dir = i === 4 ? 1 : -1;
        paint(f, g, dir * (x - 0.05), -hy * 0.55, z, dir * (x + 0.05), hy * 0.55, z, 0.02, M.spark);
        paint(f, g, dir * (x + 0.04), -hy * 0.35, z, dir * (x + 0.1), hy * 0.35, z, 0.008, M.spark);
      }
    } else if (i === 0 || i === 1) {
      const x = i === 0 ? hx : -hx;
      line(f, g, x, 0.118, -hz, x, 0.118, hz, 0.006, -0.32, M.white);
    } else if (i === 2) {
      // Lid top: a pale bevel just inside the edge.
      line(f, g, -hx + 0.02, hy, hz - 0.02, hx - 0.02, hy, hz - 0.02, 0.006, 0.15, M.white);
    }
  }
  if (sh >= 0.35 && sh < 0.85) sparkle(f, f.at(g, hx - 0.03, hy - 0.02, hz), 0.07 * (1 - Math.abs(sh - 0.6) * 3), M.spark, 0.6);
}

// ─── Weapon crates ───────────────────────────────────────────────────────────

function crate(f: PixelFigure, g: THREE.Object3D, M: Mats, s: number, kind: PickupKind, sh: number) {
  const hx = 0.35;
  const hy = 0.21;
  const hz = 0.21;
  // The weapon lying on the lid (its own layer: contours where it overlaps the lid).
  f.layer(0.008 * s, PART.TORSO);
  gun(f, g, M, kind, hy + 0.035);
  // The crate.
  f.layer(0.004 * s, PART.TORSO);
  box(f, g, 0, 0, 0, hx, hy, hz, M.wood, 0.008, 1.2, M.wood, M.wood);
  const mask = BOX.mask;
  for (let i = 0; i < 6; i++) {
    if (!(mask & (1 << i))) continue;
    const ax = i >> 1;
    const sg = i & 1 ? -1 : 1;
    if (ax === 1) {
      // Lid: planks along X + bracket corners.
      if (sg > 0) {
        for (let k = -1; k <= 1; k += 2) line(f, g, -hx, hy, k * 0.07, hx, hy, k * 0.07, 0.006, -0.3, M.wood);
        line(f, g, -hx + 0.02, hy, hz - 0.015, hx - 0.02, hy, hz - 0.015, 0.006, 0.12, M.wood);
      }
      continue;
    }
    // Side faces: planks, a stencilled band in the weapon's colour, metal corner brackets.
    const along = ax === 0 ? hz : hx;
    // Face-local u (across the face) → model x / z.
    const x0 = ax === 0 ? sg * hx : -along * sg;
    const z0 = ax === 0 ? along * sg : sg * hz;
    const x1 = ax === 0 ? sg * hx : along * sg;
    const z1 = ax === 0 ? -along * sg : sg * hz;
    // Planks (seams below and above the stencilled top plank), the band in the weapon's colour on it.
    line(f, g, x0, -0.06, z0, x1, -0.06, z1, 0.006, -0.3, M.wood);
    line(f, g, x0, 0.075, z0, x1, 0.075, z1, 0.006, -0.3, M.wood);
    paint(f, g, x0, 0.135, z0, x1, 0.135, z1, 0.042, M.bandDark);
    paint(f, g, x0, 0.135, z0, x1, 0.135, z1, 0.028, M.band);
    for (let k = -1; k <= 1; k += 2) {
      const t = 0.5 + k * (0.5 - 0.025 / along);
      const bx = x0 + (x1 - x0) * t;
      const bz = z0 + (z1 - z0) * t;
      paint(f, g, bx, -hy + 0.01, bz, bx, -hy + 0.06, bz, 0.022, M.bracket);
      paint(f, g, bx, hy - 0.06, bz, bx, hy - 0.01, bz, 0.022, M.bracket);
    }
    if (sh >= 0 && ax === 2) {
      const x = (-along + (2 * along + 0.1) * sh - 0.05) * sg;
      paint(f, g, x - 0.06 * sg, -hy * 0.55, sg * hz, x + 0.06 * sg, hy * 0.55, sg * hz, 0.02, M.spark);
      paint(f, g, x + 0.04 * sg, -hy * 0.35, sg * hz, x + 0.11 * sg, hy * 0.35, sg * hz, 0.008, M.spark);
    }
  }
  if (sh >= 0.3 && sh < 0.9) sparkle(f, f.at(g, 0.12, hy + 0.07, 0), 0.08 * (1 - Math.abs(sh - 0.6) * 3), M.spark, 0.6);
}

/** The gun on the lid, along the crate's X (muzzle at −X), top at height `y`. */
function gun(f: PixelFigure, g: THREE.Object3D, M: Mats, kind: PickupKind, y: number) {
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

function bomb(f: PixelFigure, g: THREE.Object3D, M: Mats, s: number, time: number) {
  // The 3D: a 0.2 m sphere + the glowing pin (0.05 × 0.12 at y 0.22).
  f.layer(0.02 * s, PART.TORSO);
  f.ball(f.at(g, 0, 0, 0), 0.2, M.bomb);
  // Fuse cap (riveted collar).
  f.cone(f.at(g, 0, 0.16, 0), f.at(g, 0, 0.23, 0), 0.06, 0.055, M.bombBand).k(0.01 * s);
  // A band round the belly + two rivets (front half only).
  hoop(f, g, 1, 0.0, 0.198, 0.016, M.bombBand, true, 12);
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
  f.ball(screenOff(f, f.at(g, 0, 0, 0), -0.085, 0.09), 0.026, M.shine).flag(PF.GLOW | PF.NO_OUTLINE).min(0.6);
  // The fizzing spark at the fuse tip: a star that flickers between sizes.
  const fl = 0.75 + 0.25 * Math.sin(time * 31) + 0.15 * Math.sin(time * 17.3);
  sparkle(f, c, 0.065 * fl, M.spark, 0.7, 0.35);
  f.ball(c, 0.022, M.ring).flag(PF.GLOW | PF.NO_OUTLINE).min(0.6);
}

// ─── Gem ─────────────────────────────────────────────────────────────────────

const GEM_V = [
  [0.25, 0, 0],
  [0, 0, 0.25],
  [-0.25, 0, 0],
  [0, 0, -0.25],
];

function gem(f: PixelFigure, g: THREE.Object3D, M: Mats, s: number, time: number, sh: number) {
  // The 3D: an octahedron r 0.25 stretched 1.4× in Y (apexes at ±0.35).
  const top = 0.35;
  const n = f.vec();
  // Two passes: a dark-gold rim a hair bigger behind (the outline), then the
  // self-lit facets in four glow steps by how each faces the light, crystal edges.
  for (let pass = 0; pass < 2; pass++) {
    f.layer(0.004 * s, PART.TORSO, 0, pass === 0 ? 0.03 : 0);
    for (let half = 0; half < 2; half++) {
      const ay = half === 0 ? top : -top;
      for (let i = 0; i < 4; i++) {
        const v0 = GEM_V[i];
        const v1 = GEM_V[(i + 1) % 4];
        const A = f.at(g, 0, ay, 0);
        const B = f.at(g, v0[0], 0, v0[2]);
        const C = f.at(g, v1[0], 0, v1[2]);
        n.subVectors(B, A).cross(f.vec().subVectors(C, A)).normalize();
        if (half === 0) n.negate();
        const mid = f.vec().copy(A).add(B).add(C).divideScalar(3);
        if (f.facing(mid, n) < 0.0) continue;
        if (pass === 0) {
          f.tri(A, B, C, M.gem, 0.02);
          continue;
        }
        const t = faceTone(n, 1.6) + (half === 0 ? 0.08 : -0.12);
        const m = t > 0.5 ? M.gemG[0] : t > -0.06 ? M.gemG[1] : t > -0.22 ? M.gemG[2] : M.gemG[3];
        f.tri(A, B, C, m, 0.002).flag(PF.GLOW);
        f.decal(A, B, 0.006, 0.006, M.gemG[0]).flag(PF.FLAT | PF.GLOW | PF.NO_OUTLINE).min(0.5);
      }
    }
  }
  // Twinkle: the apex star breathes; the shine passes a second star across.
  const tw = 0.5 + 0.5 * Math.sin(time * 4.2);
  sparkle(f, f.at(g, 0, top * 0.82, 0), 0.05 + 0.05 * tw, M.spark, 0.6);
  if (sh >= 0) sparkle(f, screenOff(f, f.at(g, 0, 0, 0), -0.12 + 0.24 * sh, 0.1 - 0.2 * sh), 0.07, M.shine, 0.5);
}

import { bayer, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD, textWidth } from './font';
import { hash2, smooth } from './surfaces';
import { d1Emblem } from './d1Tiles';

/**
 * TYRANT CHASE (d3) machines for ART: PIXEL WORLD: the park maintenance truck
 * bogged in the mud (yellow cab with its door stencil, grimy windscreen frame,
 * grille, the crane arm), the rescue helicopter (white / navy / orange livery,
 * PARK RESCUE, the open door glowing warm, rivets and rain streaks), the finale
 * fuel tank (red steel, JET A-1 / FLAMMABLE plates), and the helipad's painted
 * concrete (expansion joints, tie-downs, worn paint).
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Painted steel (wrap 32 × 32): enamel with chips to rust, rain streaks, rivets; `rivets` every 16 texels. */
export function d3EnamelTile(atlas: PwAtlas, o: { hex: number; rust?: number; rivets?: boolean }): PwTile {
  return atlas.tile(`d3enamel|${h6(o.hex)}|${o.rivets ? 1 : 0}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(o.hex, { light: 0.45, sat: 0.95 });
    const rust = k.ramp(o.rust ?? 0x6a3218, { light: 0.4 });
    c.rect(0, 0, 32, 32, p, (x, y) => (smooth(x, y, 32, 32, 2, 3) > 0.7 ? 3.4 : smooth(x, y, 32, 32, 4, 4) < 0.25 ? 2.6 : 3));
    if (o.rivets) {
      for (let y = 0; y < 32; y += 16) {
        c.hline(0, y, 32, p, 1.6);
        for (let x = 2; x < 32; x += 6) c.set(x, y + 2, p, 4.4);
      }
    }
    for (let i = 0; i < 8; i++) c.cluster(rng.int(0, 31), rng.int(0, 31), i, rust, 2.6);
    for (let i = 0; i < 5; i++) c.streak(rng, rng.int(0, 31), rng.int(0, 31), rng.int(6, 16), -0.6, 0);
  }, { wrap: true });
}

/**
 * The maintenance truck's cab side (module 64 × 52 = 2 × 1.6 m; the front on the
 * RIGHT): the door with its window (the storm in the glass), handle and step,
 * PARK MAINTENANCE stencilled under the emblem, mud thrown up the lower half.
 */
export function d3TruckDoorModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  const W = 64;
  const H = 52;
  return atlas.tile(`d3truckdoor|${h6(o.hex)}`, W, H, (c, k) => {
    const rng = k.rng;
    const y = k.ramp(o.hex, { light: 0.45, sat: 1.0 });
    const glass = k.ramp(0x1a2840, { light: 0.55, sat: 0.9 });
    const ink = k.ramp(0x161412, { light: 0.4 });
    const mud = k.ramp(0x4a3624, { light: 0.4 });
    const st = k.ramp(0x8a8a86, { light: 0.5, sat: 0.6 });
    c.rect(0, 0, W, H, y, 3);
    c.hline(0, 0, W, y, 4.2);
    // Door seam + window.
    c.frame(10, 2, 46, H - 6, y, 1.6);
    c.vline(11, 3, H - 8, y, 4);
    for (let yy = 5; yy < 22; yy++) for (let x = 16; x < 52; x++) c.set(x, yy, glass, ((x + yy) % 17) < 3 ? 3.4 : yy < 12 ? 2.6 : 2);
    c.frame(15, 4, 38, 19, ink, 1.4);
    c.rect(44, 26, 7, 2, st, 4);
    c.hline(44, 28, 7, st, 1.4);
    // Emblem + stencil.
    d1Emblem(c, k, 22, 32, 5.5);
    drawText(c, 'PARK', 30, 28, FONT_3x5, ink, 1.2);
    drawText(c, 'MAINT.', 30, 34, FONT_3x5, ink, 1.2);
    // Mud: caked low, splatter thrown up.
    for (let x = 0; x < W; x++) {
      const top = H - 8 - Math.round(smooth(x, 0, W, 8, 6, 3) * 6);
      for (let yy = top; yy < H; yy++) c.set(x, yy, mud, yy === top ? 3.6 : hash2(x, yy, 4) > 0.7 ? 2 : 2.8);
    }
    for (let i = 0; i < 40; i++) c.cluster(rng.int(0, W - 1), rng.int(20, H - 8), i, mud, rng.chance(0.5) ? 3 : 2.4);
    for (let i = 0; i < 8; i++) c.streak(rng, rng.int(0, W - 1), 0, rng.int(8, 20), -0.6, y);
  });
}

/** The truck's cab front (module 70 × 52 = 2.2 × 1.6 m): windscreen frame (the glass is real), a heavy grille, headlights, bumper, plate, amber marker lights. */
export function d3TruckFrontModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  const W = 70;
  const H = 52;
  return atlas.tile(`d3truckfront|${h6(o.hex)}`, W, H, (c, k) => {
    const y = k.ramp(o.hex, { light: 0.45, sat: 1.0 });
    const dark = k.ramp(0x1c1c1e, { light: 0.4 });
    const st = k.ramp(0x8a8a86, { light: 0.5, sat: 0.6 });
    const lens = k.ramp(0xe8e0c0, { light: 0.45 });
    const mud = k.ramp(0x4a3624, { light: 0.4 });
    const glass = k.ramp(0x1a2840, { light: 0.55, sat: 0.9 });
    c.rect(0, 0, W, H, y, 3);
    c.hline(0, 0, W, y, 4.2);
    // Windscreen opening (upper third; the classic glass sits over it).
    for (let yy = 3; yy < 21; yy++) for (let x = 5; x < W - 5; x++) c.set(x, yy, glass, ((x + yy) % 19) < 3 ? 3.2 : 2.2);
    c.frame(4, 2, W - 8, 20, dark, 1.4);
    // Grille + headlights.
    c.rect(18, 26, 34, 14, dark, 1);
    for (let x = 19; x < 52; x += 3) c.vline(x, 26, 14, st, x < 34 ? 3.8 : 3);
    for (const x of [8, 62]) {
      c.ellipse(x, 32, 5, 5, st, 3.4);
      c.ellipse(x, 32, 3.5, 3.5, lens, 3.6);
      c.set(x - 2, 30, lens, 5);
    }
    c.rect(0, 43, W, 6, st, 3);
    c.hline(0, 43, W, st, 4.4);
    c.rect(27, 44, 16, 4, k.ramp(0xe8e2c8, { light: 0.3 }), 3.6);
    drawText(c, 'PI 3', 29, 44, FONT_3x5, dark, 1);
    c.scatter(k.rng, 0, 36, W, 16, 40, mud, 2.6, { shapes: 6 });
  });
}

/** Hazard-banded crane arm / bed rail (wrap 32 × 16): yellow enamel with black diagonal bands, chips, grease. */
export function d3CraneTile(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3crane`, 32, 16, (c, k) => {
    const y = k.ramp(0xb08a28, { light: 0.45, sat: 1.0 });
    const ink = k.ramp(0x161412, { light: 0.4 });
    for (let yy = 0; yy < 16; yy++) for (let x = 0; x < 32; x++) {
      const band = ((x + yy) >> 3) & 1;
      c.set(x, yy, band && x < 16 ? ink : y, yy === 0 ? 4 : yy === 15 ? 2 : 3);
    }
    c.scatter(k.rng, 0, 0, 32, 16, 10, 0, -1, { shapes: 4 });
  }, { wrap: true });
}

/**
 * The helicopter's side (module 116 × 64 = 3.6 × 2 m, the nose on the RIGHT):
 * white upper body with PARK RESCUE and a registration, the orange cheat line,
 * the navy belly, windows, an access panel, rivet lines, rain streaks; `door`:
 * the open side door glowing warm (a seat, a strap, a medkit).
 */
export function d3HeliSideModule(atlas: PwAtlas, door: boolean): PwTile {
  const W = 116;
  const H = 64;
  return atlas.tile(`d3helisside|${door ? 1 : 0}`, W, H, (c, k) => {
    const rng = k.rng;
    const wh = k.ramp(0xccd0d4, { light: 0.35, sat: 0.6 });
    const navy = k.ramp(0x22304e, { light: 0.45, sat: 1.0 });
    const or = k.ramp(0xe06a1a, { light: 0.45, sat: 1.05 });
    const glass = k.ramp(0x223858, { light: 0.55, sat: 0.9 });
    const warm = k.ramp(0xffc880, { light: 0.5 });
    const ink = k.ramp(0x14161c, { light: 0.4 });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (y < 36) c.set(x, y, wh, y < 2 ? 4.2 : y < 12 ? 3.4 : 3);
      else if (y < 41) c.set(x, y, or, y === 36 ? 4 : 3);
      else c.set(x, y, navy, y === 41 ? 3.6 : y > 58 ? 2.2 : 3);
    }
    // Windows: two cabin windows aft of the door; the cockpit glass toward the nose.
    for (const [x0, w] of [[8, 16], [28, 16]]) {
      c.rect(x0, 8, w, 14, glass, 2.4);
      c.hline(x0, 8, w, glass, 3.6);
      c.frame(x0 - 1, 7, w + 2, 16, ink, 1.2);
    }
    if (door) {
      // The open door: a dark cabin, the warm light, a seat, a strap, a medkit.
      c.rect(50, 6, 34, 50, ink, 1);
      for (let y = 8; y < 54; y++) for (let x = 52; x < 82; x++) {
        const d = Math.hypot((x - 66) / 20, (y - 8) / 34);
        if (d < 1 && bayer(x, y) > d * 0.9) c.set(x, y, warm, d < 0.4 ? 3.6 : 2.6, PWF.GLOW);
      }
      c.rect(56, 30, 10, 16, ink, 1.6);
      c.rect(72, 22, 8, 7, wh, 3.6);
      c.hline(73, 25, 6, or, 3.2);
      c.vline(76, 23, 5, or, 3.2);
      c.vline(68, 8, 24, ink, 2.4);
      c.frame(49, 5, 36, 52, ink, 2.6);
    } else {
      c.frame(50, 6, 34, 50, wh, 1.6);
      c.rect(78, 28, 4, 2, ink, 1.6);
    }
    // Cockpit glass sweeping up to the nose.
    c.poly([90, 4, 112, 14, 114, 30, 92, 30], glass, 2.6);
    c.line(92, 6, 110, 16, glass, 4.4);
    // PARK RESCUE + registration.
    if (!door) {
      const tw = textWidth('PARK RESCUE', FONT_5x7);
      drawText(c, 'PARK RESCUE', Math.round(60 - tw / 2), 26, FONT_5x7, navy, 3.4);
    } else drawText(c, 'RESCUE', 6, 26, FONT_5x7, navy, 3.4);
    drawText(c, 'PI-07', 88, 47, FONT_3x5, wh, 3.8);
    // Rivet lines, an access panel, rain streaks, exhaust soot at the top.
    for (let x = 2; x < W; x += 5) c.set(x, 34, wh, 1.8);
    c.frame(4, 44, 14, 10, navy, 1.6);
    for (let i = 0; i < 12; i++) c.streak(rng, rng.int(0, W - 1), 0, rng.int(8, 30), -0.5, wh);
    for (let x = 30; x < 70; x++) for (let y = 0; y < 4; y++) if (hash2(x, y, 7) > 0.5) c.shift(x, y, -0.8);
  });
}

/** Tank side plate (module 48 × 36 = 1.5 × 1.1 m): a white plate with the red flame diamond, JET A-1 and FLAMMABLE, rivets. */
export function d3TankPlateModule(atlas: PwAtlas): PwTile {
  const W = 48;
  const H = 36;
  return atlas.tile(`d3tankplate`, W, H, (c, k) => {
    const wh = k.ramp(0xe8e2d4, { light: 0.3, sat: 0.5 });
    const red = k.ramp(0xc0201a, { light: 0.45 });
    const ink = k.ramp(0x161412, { light: 0.4 });
    c.rect(0, 0, W, H, wh, 3.2);
    c.frame(0, 0, W, H, ink, 1.6);
    for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) if (Math.abs(x) + Math.abs(y) <= 10) c.set(10 + x, 14 + y, red, Math.abs(x) + Math.abs(y) > 8 ? 2 : 3.2);
    c.poly([10, 6, 14, 14, 12, 14, 13, 19, 8, 12, 10, 12], wh, 4);
    drawText(c, 'JET', 23, 4, FONT_5x7, ink, 1.2);
    drawText(c, 'A-1', 23, 13, FONT_5x7, ink, 1.2);
    const tw = textWidth('FLAMMABLE', FONT_3x5);
    c.rect(1, 27, W - 2, 8, red, 3);
    drawText(c, 'FLAMMABLE', Math.round((W - tw) / 2), 28, FONT_3x5, wh, 3.8);
    for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]]) c.set(x, y, ink, 4);
  });
}

/** A round end cap (module 32 × 32): a domed steel end with a manhole, rust ring, bolts. */
export function d3CapModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3cap|${h6(o.hex)}`, 32, 32, (c, k) => {
    const p = k.ramp(o.hex, { light: 0.45, sat: 1.0 });
    const st = k.ramp(0x4a4e52, { light: 0.5, sat: 0.6 });
    c.ellipse(16, 16, 16, 16, p, (u, v) => (Math.hypot(u, v) > 0.9 ? (u + v < 0 ? 4 : 1.8) : u + v < -0.5 ? 3.6 : 3));
    c.ellipse(16, 16, 6, 6, st, (u, v) => (u + v < 0 ? 4 : 2.4));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.set(16 + Math.round(Math.cos(a) * 5), 16 + Math.round(Math.sin(a) * 5), st, 1);
    }
  });
}

/**
 * Helipad concrete (wrap 128 × 128 = 4 m): slabs with expansion joints at the
 * tile edges (a joint line every 4 m), aggregate, tyre scuffs, oil stains,
 * puddle glints.
 */
export function d3PadTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3pad|${h6(o.hex)}`, 128, 128, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.4, sat: 0.8 });
    const oil = k.ramp(0x1e1c26, { light: 0.45 });
    const sky = k.ramp(0x5a6a90, { light: 0.4 });
    c.rect(0, 0, 128, 128, s, (x, y) => (x === 0 || y === 0 ? 1.4 : x === 1 || y === 1 ? 3.8 : smooth(x, y, 128, 128, 4, 5) > 0.7 ? 3.3 : 3));
    for (let i = 0; i < 300; i++) c.cluster(rng.int(2, 127), rng.int(2, 127), i % 3, 0, i % 2 ? 0.8 : -0.8);
    for (let i = 0; i < 3; i++) {
      const cx = rng.int(14, 114);
      const cy = rng.int(14, 114);
      for (let y = -6; y <= 6; y++) for (let x = -10; x <= 10; x++) if ((x / 10) ** 2 + (y / 6) ** 2 + (hash2(x, y, i) - 0.5) * 0.4 < 1) c.set(cx + x, cy + y, oil, 1.6);
    }
    for (let i = 0; i < 14; i++) {
      const x = rng.int(4, 120);
      const y = rng.int(4, 124);
      for (let j = 0; j < rng.int(2, 6); j++) c.set(x + j, y, sky, 2.6);
    }
  }, { wrap: true });
}

/** Worn pad paint (wrap 16 × 64, v along the stripe): `hex` paint with aggregate showing through, scuffs. */
export function d3PaintStripeTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3stripe|${h6(o.hex)}`, 16, 64, (c, k) => {
    const p = k.ramp(o.hex, { light: 0.4, sat: 0.95 });
    const s = k.ramp(0x6e6e6a, { light: 0.4, sat: 0.8 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) {
      if (hash2(x, y, 3) > 0.86 || hash2(x >> 2, y >> 2, 4) > 0.9) c.set(x, y, s, 2.6);
      else c.set(x, y, p, x === 0 ? 3.8 : hash2(x, y, 5) > 0.8 ? 2.6 : 3.2);
    }
  }, { wrap: true });
}

/** Big painted lettering on the pad (module, cut out): `text` in worn white bold letters. */
export function d3PadLettersModule(atlas: PwAtlas, text: string, scale: number): PwTile {
  const f = FONT_BOLD;
  const W = Math.ceil((textWidth(text, f, { scale }) + 4) / 2) * 2;
  const H = 7 * scale + 4;
  return atlas.tile(`d3padletters|${text}|${scale}`, W, H, (c, k) => {
    const p = k.ramp(0xe8e8e0, { light: 0.3, sat: 0.5 });
    drawText(c, text, 2, 2, f, p, 3.2, { scale });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (c.at(x, y) && (hash2(x, y, 3) > 0.84 || hash2(x >> 2, y >> 2, 4) > 0.86)) c.set(x, y, 0, 0);
  });
}

/** Corrugated hut wall with a lit window (module 64 × 48 = 2 × 1.5 m): grimy glass with a warm lamp and a radio desk, a frame. */
export function d3HutWindowModule(atlas: PwAtlas): PwTile {
  const W = 64;
  const H = 48;
  return atlas.tile(`d3hutwin`, W, H, (c, k) => {
    const warm = k.ramp(0xffd090, { light: 0.5 });
    const ink = k.ramp(0x161412, { light: 0.4 });
    const fr = k.ramp(0x3a3c3e, { light: 0.5 });
    c.rect(0, 0, W, H, fr, 2.6);
    for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
      const d = Math.hypot((x - 40) / 30, (y - 8) / 30);
      c.set(x, y, warm, d < 0.4 ? 4.2 : d < 0.8 ? 3.4 : 2.6, PWF.GLOW);
    }
    // A radio desk, a mic, a chair back in silhouette; a lamp hanging.
    c.rect(4, 32, 56, 4, ink, 1, PWF.GLOW);
    c.rect(10, 24, 14, 8, ink, 1, PWF.GLOW);
    for (const x of [12, 15, 18]) c.set(x, 26, warm, 4.6, PWF.GLOW);
    c.rect(36, 22, 8, 14, ink, 1, PWF.GLOW);
    c.vline(40, 4, 6, ink, 1, PWF.GLOW);
    c.frame(3, 3, W - 6, H - 6, fr, 4);
    c.vline(W / 2, 4, H - 8, fr, 3);
    for (let i = 0; i < 30; i++) c.cluster(k.rng.int(4, W - 6), k.rng.int(4, H - 6), i, 0, -0.6);
    void wrap;
  });
}

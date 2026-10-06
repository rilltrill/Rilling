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
 * Aircraft livery enamel (wrap 32 × 32): clean paint in soft drifts, panel lines with rivets every
 * 16 texels, oil and exhaust runs streaking down from a seam (a few long runs, placed by rule —
 * never rust confetti).
 */
export function d3LiveryTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3livery|${h6(o.hex)}`, 32, 32, (c, k) => {
    const p = k.ramp(o.hex, { light: 0.4, sat: 0.9 });
    const oil = k.ramp(0x2a2622, { light: 0.4 });
    c.rect(0, 0, 32, 32, p, (x, y) => (smooth(x, y, 32, 32, 2, 5) > 0.7 ? 3.4 : 3));
    for (let y = 0; y < 32; y += 16) {
      c.hline(0, y, 32, p, 1.8);
      c.hline(0, y + 1, 32, p, 3.6);
      for (let x = 3; x < 32; x += 8) c.set(x, y + 3, p, 4.2);
    }
    c.vline(21, 0, 32, p, 2.2);
    // Two runs from the seam: dark at the source, thinning (ordered) as they run down.
    for (const [x, len] of [[9, 14], [26, 9]]) {
      for (let j = 0; j < len; j++) if (j < len / 2 || bayer(x, j + 2) > (j - len / 2) / len) c.set(x, 2 + j, oil, j < 3 ? 1.6 : 2.2);
    }
  }, { wrap: true });
}

/** Exhaust soot on the engine housing (module 48 × 24 = 1.5 × 0.75 m, cut out): black at the stack, feathering back and down in dithered fingers. */
export function d3SootModule(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3soot`, 48, 24, (c, k) => {
    const soot = k.ramp(0x1e1c1a, { light: 0.4 });
    for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) {
      const u = x / 48;
      const finger = 0.5 + Math.sin(x * 0.55) * 0.18 + Math.sin(x * 1.3) * 0.1;
      const v = y / 24;
      if (v > finger * (1 - u * 0.4) + 0.2) continue;
      if (bayer(x, y) > 1.05 - u) continue;
      c.set(x, y, soot, u < 0.25 ? 1.4 : 2);
    }
  });
}

/** The main rotor's blur (module 64 × 64, cut out, laid flat over the hub): faint dithered arcs where the blades sweep, darker near the tips. */
export function d3RotorDiscModule(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3rotordisc`, 64, 64, (c, k) => {
    const st = k.ramp(0x24262a, { light: 0.5, sat: 0.6 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32;
      if (d > 1 || d < 0.08) continue;
      const a = Math.atan2(y - 32, x - 32);
      const sweep = (Math.sin(a * 4) * 0.5 + 0.5) * 0.35 + d * 0.25;
      if (bayer(x >> 1, y >> 1) > sweep) continue;
      c.set(x, y, st, d > 0.92 ? 1.6 : 2.6);
    }
  });
}

/**
 * The helicopter's nose in profile (module 100 × 68 = 3.1 × 2.1 m, cut out, the tip on the RIGHT):
 * the bubble canopy's curve — tinted glass with the storm in a sweeping highlight, its frame
 * struts, the instrument glow low inside, the pilot's empty seat — over the white chin and the
 * navy belly, the orange cheat line running into the tip; it breaks the box body's silhouette.
 */
export function d3HeliNoseModule(atlas: PwAtlas): PwTile {
  const W = 100;
  const H = 68;
  return atlas.tile(`d3helinose`, W, H, (c, k) => {
    const wh = k.ramp(0xccd0d4, { light: 0.35, sat: 0.6 });
    const navy = k.ramp(0x22304e, { light: 0.45, sat: 1.0 });
    const or = k.ramp(0xe06a1a, { light: 0.45, sat: 1.05 });
    const glass = k.ramp(0x223858, { light: 0.55, sat: 0.9 });
    const ink = k.ramp(0x14161c, { light: 0.4 });
    const panel = k.ramp(0x60f080, { light: 0.5 });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // The profile: an ellipse whose back half (left) stays full height, the tip rounding off.
        const u = (x + 0.5) / W;
        const v = (y + 0.5) / H;
        const nx = u < 0.4 ? 0 : (u - 0.4) / 0.6;
        const top = 0.5 - 0.5 * Math.sqrt(Math.max(0, 1 - nx * nx * 1.02));
        const bot = 0.5 + 0.48 * Math.sqrt(Math.max(0, 1 - Math.pow(nx, 2.4)));
        if (v < top || v > bot) continue;
        let r = wh;
        let t = 3;
        if (v < 0.5 && u > 0.18) {
          // Canopy glass: dark, a sweeping highlight band, the frame struts.
          r = glass;
          const band = Math.abs(v - (0.22 + (u - 0.18) * 0.25)) < 0.05;
          t = band ? 3.6 : v < 0.2 ? 2.6 : 2;
          if (Math.abs(u - 0.46) < 0.015 || Math.abs(u - 0.72) < 0.015 || Math.abs(v - 0.47) < 0.02) {
            r = ink;
            t = 1.6;
          }
        } else if (v > 0.66) {
          r = navy;
          t = v > 0.92 ? 2 : 3;
        } else if (v > 0.58) {
          r = or;
          t = v < 0.6 ? 4 : 3;
        }
        // Rim: lit top edge, dark lower edge.
        if (v - top < 0.03) t = r === glass ? 4.2 : 4;
        if (bot - v < 0.03) t = 1.6;
        c.set(x, y, r, t);
      }
    }
    // The instrument panel glowing low in the cockpit, the seat's dark back.
    c.rect(40, 26, 18, 3, panel, 2.6, PWF.GLOW);
    for (const x of [42, 47, 52]) c.set(x, 27, k.ramp(0xffd060, { light: 0.5 }), 4, PWF.GLOW);
    c.rect(24, 14, 6, 18, ink, 1.2);
  });
}

/** The truck's bent front bumper (module 72 × 10 = 2.25 × 0.3 m, cut out): galvanised steel, dented, one end buckled down, mud on the lower lip. */
export function d3BumperModule(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3bumper`, 72, 10, (c, k) => {
    const st = k.ramp(0x8a8a86, { light: 0.5, sat: 0.6 });
    const mud = k.ramp(0x4a3624, { light: 0.4 });
    for (let x = 0; x < 72; x++) {
      const drop = x > 54 ? Math.round((x - 54) * 0.22) : 0;
      for (let y = 0; y < 7; y++) {
        const yy = y + drop;
        if (yy >= 10) continue;
        c.set(x, yy, st, y === 0 ? 4.2 : y === 6 ? 1.6 : (x >= 20 && x < 30 && y > 1) ? 2.2 : 3);
      }
      if (hash2(x >> 1, 1, 71) > 0.4) c.set(x, Math.min(9, 6 + drop), mud, 2.6);
    }
  });
}

/**
 * The maintenance truck's cab side (module 64 × 52 = 2 × 1.6 m; the front on the
 * RIGHT): the door with its window (the storm in the glass), handle and step,
 * PARK MAINTENANCE stencilled under the emblem, mud thrown up the lower half.
 */
export function d3TruckDoorModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  const W = 64;
  const H = 52;
  return atlas.tile(`d3truckdoor2|${h6(o.hex)}`, W, H, (c, k) => {
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
    // The front wheel's arch (centre at u ≈ 0.55, the module's foot): mud thrown up in a fan.
    for (let i = 0; i < 70; i++) {
      const a = Math.PI * (0.15 + rng.next() * 0.7);
      const r = 10 + Math.pow(rng.next(), 0.7) * 16;
      c.cluster(Math.round(35 + Math.cos(a) * r * 1.3), Math.round(H - Math.sin(a) * r), i, mud, rng.chance(0.5) ? 2.8 : 2.2);
    }
    for (let i = 0; i < 8; i++) c.streak(rng, rng.int(0, W - 1), 0, rng.int(8, 20), -0.6, y);
  });
}

/** The truck's cab front (module 70 × 52 = 2.2 × 1.6 m): windscreen frame (the glass is real), a heavy grille, headlights, bumper, plate, amber marker lights. */
export function d3TruckFrontModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  const W = 70;
  const H = 52;
  return atlas.tile(`d3truckfront2|${h6(o.hex)}`, W, H, (c, k) => {
    const y = k.ramp(o.hex, { light: 0.45, sat: 1.0 });
    const dark = k.ramp(0x1c1c1e, { light: 0.4 });
    const st = k.ramp(0x8a8a86, { light: 0.5, sat: 0.6 });
    const lens = k.ramp(0xe8e0c0, { light: 0.45 });
    const mud = k.ramp(0x4a3624, { light: 0.4 });
    const glass = k.ramp(0x1a2840, { light: 0.55, sat: 0.9 });
    c.rect(0, 0, W, H, y, 3);
    c.hline(0, 0, W, y, 4.2);
    // Windscreen opening (upper third; the classic glass sits over it).
    for (let yy = 3; yy < 21; yy++) {
      for (let x = 5; x < W - 5; x++) {
        // The storm sky caught in a broad diagonal band (two steps), dark below; the dashboard's edge.
        const band = (x - yy * 1.4 + 200) % 46;
        let t = yy > 17 ? 1.2 : band < 7 ? 3.6 : band < 12 ? 2.8 : 2.2;
        // Wiper arcs: cleared fans (a step darker, no beads).
        const wa = Math.hypot(x - 22, yy - 21);
        const wb = Math.hypot(x - 50, yy - 21);
        const wiped = (wa > 6 && wa < 16) || (wb > 6 && wb < 16);
        if (wiped && yy <= 17) t = Math.min(t, 2.6);
        c.set(x, yy, glass, t);
        // Rain beads outside the wiped fans: a lit texel over a dark one.
        if (!wiped && yy < 16 && hash2(x, yy, 72) > 0.9) {
          c.set(x, yy, glass, 4.4);
          c.set(x, yy + 1, glass, 1.4);
        }
      }
    }
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

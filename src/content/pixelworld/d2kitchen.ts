import { bayer, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, textWidth } from './font';
import { NEUTRAL_HEX } from './retexture';
import { hash2 } from './surfaces';
import { bloodSplat, notice, plate, rivet, scuffs } from './d2kit';

/**
 * RESEARCH LABS · the staff KITCHEN, round two: a glazed-tile canteen wall
 * (white tiles to the hood with a park-green course and a bullnose cap, cream
 * gloss paint above going sooty at the ceiling), grease and soot clouds over
 * the ranges, a stainless hood with filter panels and a lamp strip under it,
 * cabinet runs with real door fronts (shadow gaps, bar handles, a kick plinth),
 * the island ends, and the hanging pans as pixel billboards (side-on pans and
 * pots on S-hooks, copper rims catching the light). No per-texel brushing:
 * stainless reads from a few 2-texel streak bands and its lit edges.
 */

const N = NEUTRAL_HEX;

/**
 * The kitchen wall elevation (world, v from the floor, 4.5 m): a coved dark
 * skirting; white glazed tiles (16 × 8, stack bond, soft grout) to 2.4 m with a
 * park-green course at 1.2 m and a red pencil course under the bullnose cap;
 * cream gloss over blockwork above, the block courses barely showing, soot
 * gathering in 2×2 clumps toward the ceiling. 128 × 144.
 */
export function kitchenWallTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2kitwall|2',
    128,
    144,
    (c, k) => {
      const tile = k.ramp(0xdcdcd2, { light: 0.4, sat: 0.5 });
      const grout = k.ramp(0xa4a49a, { light: 0.4, sat: 0.4 });
      const green = k.ramp(0x2a7a4a, { light: 0.45, sat: 0.9 });
      const red = k.ramp(0xa83028, { light: 0.45 });
      const cream = k.ramp(0xc8c0a0, { light: 0.4, sat: 0.6 });
      const cove = k.ramp(0x3a3e44, { light: 0.4 });
      const H = 144;
      const row = (m: number) => H - 1 - Math.round(m * 32);
      const capY = row(2.4);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < 128; x++) {
          if (y > row(0.1)) {
            c.set(x, y, cove, y === row(0.1) + 1 ? 3.5 : 2);
            continue;
          }
          if (y > capY) {
            // Tiles: rows counted up from the skirting.
            const fromFloor = H - 1 - y - 3;
            const ly = fromFloor % 8;
            const lx = x % 16;
            const course = Math.floor(fromFloor / 8);
            const isGreen = course === 4;
            const isRed = course === 8;
            const r = isGreen ? green : isRed ? red : tile;
            let t = 3 + (hash2(x >> 4, course, 3) > 0.8 ? -0.25 : 0);
            if (lx === 0 || ly === 0) {
              // Splash-back band over the counters (0.95 … 1.65 m): the grout has gone grimy.
              const splash = fromFloor >= 30 && fromFloor < 53;
              c.set(x, y, isGreen || isRed ? r : grout, isGreen || isRed ? 1.75 : splash ? (hash2(x >> 2, fromFloor >> 2, 31) > 0.35 ? 1.5 : 2) : 2.5);
              continue;
            }
            // Glaze: a lit top row and a lit left column on each tile.
            if (ly === 7 || lx === 1) t += 0.75;
            c.set(x, y, r, t);
            continue;
          }
          if (y >= capY - 3) {
            // Bullnose capping course.
            c.set(x, y, tile, y === capY - 3 ? 4.25 : y === capY ? 1.75 : 3.5);
            continue;
          }
          // Cream gloss over block: courses 8 texels, joints a quarter step down (2 texels).
          const by = (capY - 4 - y) % 8;
          const bx = (x + (Math.floor((capY - 4 - y) / 8) % 2 ? 8 : 0)) % 16;
          let t = 3;
          if (by < 1 || bx < 1) t = 2.5;
          c.set(x, y, cream, t);
        }
      }
      // Soot toward the ceiling (2×2 clumps, denser at the top).
      for (let y = 0; y < 36; y += 2) {
        for (let x = 0; x < 128; x += 2) {
          if (hash2(x >> 1, y >> 1, 21) < 0.75 - y / 40) c.shade(x, y, 2, 2, -0.75);
        }
      }
      // A few cracked / chipped tiles (clusters), splash marks low down.
      for (let i = 0; i < 6; i++) {
        const x = k.rng.int(0, 120);
        const y = k.rng.int(capY + 6, row(0.4));
        c.cluster(x, y, k.rng.int(4, 9), 0, -1);
      }
      scuffs(c, k.rng, 0, row(0.35), 128, 6, 10, -0.75);
      // A few tiles fallen off (grey adhesive with its comb lines showing), cracked tiles.
      const glue = k.ramp(0x8a8a80, { light: 0.4, sat: 0.4 });
      for (let i = 0; i < 5; i++) {
        const tx = k.rng.int(0, 7) * 16;
        const course = k.rng.int(1, 9);
        if (course === 4 || course === 8) continue;
        const y0 = H - 1 - 3 - (course + 1) * 8 + 1;
        c.rect(tx + 1, y0, 15, 7, glue, (xx: number, yy: number) => ((yy - y0) % 2 ? 1.75 : 2.25) + (xx === tx + 1 ? -0.5 : 0));
        c.hline(tx + 1, y0, 15, glue, 1);
      }
      for (let i = 0; i < 4; i++) {
        const x = k.rng.int(0, 120);
        const y = k.rng.int(capY + 8, row(0.3));
        c.line(x, y, x + k.rng.int(3, 9), y + k.rng.int(2, 6), grout, 1.25);
      }
      // Grease spatter on the splash-back (2×2 clumps, a few runs).
      const greaseR = k.ramp(0x6a4a20, { light: 0.45 });
      for (let i = 0; i < 26; i++) {
        const x = k.rng.int(0, 63) * 2;
        const y = row(1.0) - k.rng.int(0, 18);
        c.rect(x, y, 2, 2, greaseR, k.rng.chance(0.5) ? 2 : 2.5);
        if (i % 5 === 0) for (let j = 2; j < 6; j++) c.rect(x, y + j, 2, 1, greaseR, 2.5);
      }
    },
    { wrap: true },
  );
}

/** Grease and soot over a range (cut out, 1.5 × 1.5 m): a brown-black cloud densest just above the burners, curling up, fat drips running down. 48 × 48. */
export function sootDecalTile(atlas: PwAtlas, v = 0): PwTile {
  return atlas.tile(`d2soot|${v % 2}`, 48, 48, (c, k) => {
    const soot = k.ramp(0x2a2018, { light: 0.4, sat: 0.6 });
    const grease = k.ramp(0x6a4a20, { light: 0.45 });
    for (let y = 0; y < 48; y += 2) {
      for (let x = 0; x < 48; x += 2) {
        const dx = (x - 24) / 24;
        const up = 1 - y / 48;
        // A plume: wide at the bottom, curling narrower up the wall.
        const w = 0.55 + up * 0.35 + Math.sin(y * 0.25 + v) * 0.1;
        const d = Math.abs(dx + Math.sin(y * 0.12 + v * 2) * 0.15) / w;
        const dens = (1 - d) * (0.35 + (1 - up) * 0.65);
        if (dens <= 0) continue;
        if (hash2((x >> 1) + v * 31, y >> 1, 7) < dens) c.rect(x, y, 2, 2, soot, dens > 0.55 ? 1 : 1.75);
      }
    }
    // Grease drips (2 texels wide) from the bottom edge of the plume.
    for (let i = 0; i < 5; i++) {
      const x = 10 + i * 7 + (v % 2) * 3;
      const len = 5 + ((i * 7 + v) % 9);
      for (let j = 0; j < len; j++) c.rect(x, 34 + j, 2, 1, grease, j === len - 1 ? 1.5 : 2.5);
    }
  });
}

/**
 * The extractor hood's front (world, v0 at the hood's foot, 0.7 m): stainless in
 * a few broad brushed bands, a rolled lit lip, a rivet line, louvred filter
 * panels (2-texel louvres), a CAUTION HOT plate, grease runs. 64 × 32 (rows 9…31).
 */
export function hoodFrontTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2hood|r3',
    64,
    32,
    (c, k) => {
      const m = k.ramp(0xb8bec4, { light: 0.55, sat: 0.4 });
      const grease = k.ramp(0x4a3a20, { light: 0.5 });
      const yel = k.ramp(0xe0b020, { light: 0.45 });
      const ink = k.ramp(0x1a1a1e, { light: 0.4 });
      c.rect(0, 0, 64, 32, m, 3);
      for (let y = 12; y < 30; y += 6) c.rect(0, y, 64, 2, m, 3.25);
      c.hline(0, 9, 64, m, 4.5);
      c.hline(0, 10, 64, m, 3.75);
      for (let x = 3; x < 64; x += 8) c.set(x, 11, m, 1.5);
      // Filter panels: a frame and 2-texel louvres.
      for (let p = 0; p < 2; p++) {
        const x0 = p * 32 + 3;
        c.frame(x0, 14, 26, 13, m, 1.5);
        for (let y = 15; y < 26; y++) c.hline(x0 + 1, y, 24, m, (y - 15) % 4 < 2 ? 3.75 : 2);
      }
      // CAUTION HOT plate.
      plate(c, 26, 3, 12, 5, yel, { tone: 3 });
      c.hline(27, 5, 10, ink, 1.5);
      c.hline(0, 30, 64, m, 2);
      c.hline(0, 31, 64, m, 1);
      for (let i = 0; i < 5; i++) {
        const x = 4 + i * 13 + (i % 2) * 3;
        const len = 3 + (i % 3) * 2;
        for (let j = 0; j < len; j++) c.rect(x, 26 + j, 2, 1, grease, j === len - 1 ? 1 : 2);
      }
    },
    { wrap: true },
  );
}

/**
 * The hood's underside (world, seen from below: 1.4 m deep): grease-filter
 * mesh panels in 2-texel cells between stainless ribs, a lamp strip glowing
 * every 2 m, grease beading on the front edge. 64 × 48.
 */
export function hoodUndersideTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2hoodunder',
    64,
    48,
    (c, k) => {
      const m = k.ramp(0x9aa0a6, { light: 0.5, sat: 0.4 });
      const lamp = k.ramp(0xfff0c8, { light: 0.6 });
      const grease = k.ramp(0x4a3a20, { light: 0.5 });
      c.rect(0, 0, 64, 48, m, 2.5);
      // Filter cells.
      for (let y = 4; y < 44; y++) for (let x = 0; x < 64; x++) if ((x >> 1) % 2 === 0 && (y >> 1) % 2 === 0) c.set(x, y, m, 1.5);
      // Ribs every 16, the lit front lip.
      for (let x = 0; x < 64; x += 16) {
        c.vline(x, 0, 48, m, 3.75);
        c.vline(x + 1, 0, 48, m, 3);
      }
      c.rect(0, 0, 64, 3, m, 3.5);
      c.rect(0, 45, 64, 3, m, 3);
      // A lamp strip glowing on the underside.
      c.rect(40, 20, 12, 6, m, 1);
      c.rect(41, 21, 10, 4, lamp, 4.5, PWF.GLOW);
      c.hline(41, 21, 10, lamp, 5, PWF.GLOW);
      for (let x = 2; x < 64; x += 5) c.rect(x, 3, 2, 2 + ((x * 3) % 4), grease, 2);
    },
    { wrap: true },
  );
}

/**
 * A stainless cabinet run (world, v0 at the body's foot; NEUTRAL): door fronts
 * a metre wide with 2-texel shadow gaps, each with a recessed centre panel
 * (shaded top / left inside, lit bottom / right lip), a polished diagonal sheen
 * (2 texels) across it, a bar handle with a cast shadow, a recessed kick
 * plinth, a couple of dents and greasy finger marks. 64 × 32.
 */
export function cabinetFrontTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile(
    'd2cabinet|r4',
    64,
    32,
    (c, k) => {
      const m = k.ramp(N, { light: 0.6, sat: 0.4 });
      c.rect(0, 0, 64, 32, m, 3.25);
      for (let d = 0; d < 2; d++) {
        const x = d * 32;
        // Shadow gap round each door (2 texels), lit top / left edge inside it.
        c.rect(x, 0, 2, 26, m, 0.75);
        c.rect(x, 0, 32, 2, m, 1);
        c.vline(x + 2, 2, 24, m, 4.25);
        c.hline(x + 2, 2, 30, m, 4.25);
        // Recessed centre panel: shaded top / left, lit lip bottom / right.
        c.rect(x + 6, 6, 22, 15, m, 2.5);
        c.hline(x + 6, 6, 22, m, 1.5);
        c.vline(x + 6, 6, 15, m, 1.75);
        c.hline(x + 6, 20, 22, m, 3.75);
        c.vline(x + 27, 6, 15, m, 3.5);
        // A polished sheen across the panel (2-texel diagonal), broken.
        for (let i = 0; i < 12; i++) if (i % 5 < 4) c.rect(x + 10 + i, 18 - i, 2, 1, m, 4);
        // Bar handle with its shadow, finger marks.
        const hx = x + (d ? 3 : 29);
        c.rect(hx, 8, 2, 11, m, 4.75);
        c.vline(hx + (d ? 2 : -1), 9, 11, m, 1.25);
        for (const [fx, fy] of [[hx + (d ? 3 : -3), 10], [hx + (d ? 3 : -3), 14]]) c.rect(fx, fy, 2, 2, m, 2.5);
      }
      // Kick plinth (recessed, dark), the lit edge of the door bottoms over it.
      c.rect(0, 26, 64, 6, m, 0.75);
      c.hline(0, 25, 64, m, 2);
      // Dents.
      c.ellipseShade(46, 13, 3, 2, (dd) => (dd > 0.55 ? 0.75 : -0.75));
      bloodSplat(c, k.rng, k, 52, 22, 1.5, { drips: 2, wrap: true });
    },
    { wrap: true },
  );
  t.neutral = N;
  return t;
}

/** An island's end panel (fit, 1.5 × 0.8 m): stainless with a lit rim, a fire-blanket box and a curling notice. 48 × 26. */
export function islandEndTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2islandend', 48, 26, (c, k) => {
    const m = k.ramp(0x7a8088, { light: 0.55, sat: 0.4 });
    const red = k.ramp(0xc02020, { light: 0.45 });
    const cream = k.ramp(0xf0ece0, { light: 0.35 });
    c.rect(0, 0, 48, 26, m, 3);
    c.hline(0, 0, 48, m, 4.5);
    c.vline(0, 0, 26, m, 4);
    c.vline(47, 0, 26, m, 1.5);
    c.rect(0, 22, 48, 4, m, 1.25);
    // Fire blanket box.
    plate(c, 6, 4, 12, 14, red, { tone: 3 });
    c.rect(8, 7, 8, 3, cream, 3.5);
    c.rect(10, 14, 4, 2, cream, 3);
    // A notice taped on, curling.
    notice(c, k.rng, k, 28, 5, 12, 14);
    rivet(c, 2, 2, m, 3);
    rivet(c, 44, 2, m, 3);
  });
}

/**
 * Hanging pans (cut out, two-sided card on the pot rack, 0.5 × 0.75 m): an
 * S-hook off the rail, then 0 = a copper frying pan hung by its handle (the
 * bowl seen three-quarter: lit copper rim, a dark sooty base), 1 = a steel
 * saucepan with a long handle and a lid knob, 2 = a stock pot by one ear.
 * 16 × 24.
 */
export function panCardTile(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`d2pan|${v % 3}`, 16, 24, (c, k) => {
    const hook = k.ramp(0x2a2a2e, { light: 0.4 });
    const copper = k.ramp(0xb0602a, { light: 0.55, sat: 1.0 });
    const steel = k.ramp(0xa8b0b8, { light: 0.55, sat: 0.4 });
    const soot = k.ramp(0x2a241e, { light: 0.4 });
    // S-hook from the rail (rows 0–3).
    c.vline(8, 0, 3, hook, 3);
    c.set(7, 3, hook, 2);
    c.set(8, 4, hook, 2);
    const kind = v % 3;
    const metal = kind === 0 ? copper : steel;
    if (kind === 0 || kind === 1) {
      // Handle down from the hook.
      for (let y = 4; y < 11; y++) c.rect(7, y, 2, 1, kind === 0 ? hook : steel, y === 4 ? 3.5 : 2.5);
      // The bowl: an ellipse with a lit rim crescent (upper-left), a dark base.
      const cy = kind === 0 ? 17 : 16;
      const rx = kind === 0 ? 7 : 6;
      const ry = kind === 0 ? 6 : 6;
      c.ellipse(8, cy, rx, ry, metal, (u, vv) => (u * u + vv * vv > 0.62 ? (u + vv < -0.2 ? 4.5 : 2.5) : u + vv < -0.5 ? 3.5 : 3));
      c.ellipse(8.5, cy + 0.5, rx - 2.5, ry - 2.5, kind === 0 ? soot : metal, kind === 0 ? 1.5 : 2);
      // Sheen.
      c.set(5, cy - 3, metal, 5);
      c.set(4, cy - 2, metal, 4.5);
      if (kind === 1) c.ellipse(8.5, cy + 0.5, 1.2, 1.2, hook, 2);
    } else {
      // Stock pot by one ear: a tall rounded body, a rim, the other ear, a dent.
      c.set(8, 5, hook, 2);
      c.rect(2, 6, 12, 2, steel, 4);
      c.rect(2, 8, 12, 14, steel, (x: number) => (x < 4 ? 4 : x > 11 ? 2 : 3));
      c.rect(1, 9, 1, 3, steel, 2.5);
      c.rect(14, 9, 1, 3, steel, 2.5);
      c.hline(2, 21, 12, steel, 1.5);
      c.ellipseShade(9, 15, 2, 2, (dd) => (dd > 0.5 ? 0.75 : -0.75));
      // Soot on the base.
      c.rect(3, 19, 10, 2, soot, 2);
    }
    c.outline(0);
    void drawText;
    void FONT_3x5;
    void textWidth;
  });
}

/**
 * Counter-top clutter standing on the islands (cut out, two-sided card, 0.75 ×
 * 0.5 m): 0 = a stock pot with a ladle and a stack of steel trays, 1 = a
 * leaning cutting board, a knife block and a jar of utensils. Breaks the
 * island's flat top line. 24 × 16.
 */
export function counterClutterTile(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`d2clutter|${v % 4}`, 24, 16, (c, k) => {
    const steel = k.ramp(0xb8bec4, { light: 0.55, sat: 0.4 });
    const dark = k.ramp(0x2a2a2e, { light: 0.4 });
    const wood = k.ramp(0x9a6a3a, { light: 0.45 });
    const red = k.ramp(0xc03a2a, { light: 0.45 });
    const cream = k.ramp(0xe8e4d8, { light: 0.4, sat: 0.4 });
    if (v % 4 === 2) {
      // A stand mixer (red, its bowl) and a stack of plates.
      c.rect(2, 3, 9, 4, red, (x: number) => (x < 4 ? 4 : 3));
      c.rect(8, 7, 3, 7, red, 2.5);
      c.rect(1, 14, 11, 2, red, 2);
      c.rect(2, 9, 6, 5, steel, (x: number) => (x < 4 ? 4.5 : 3));
      for (let i = 0; i < 6; i++) c.hline(14, 15 - i * 2, 9, cream, i % 2 ? 2.5 : 4);
      c.outline(0);
      return;
    }
    if (v % 4 === 3) {
      // A tray of mugs and a rolled tea towel.
      c.hline(1, 15, 22, steel, 2);
      c.hline(1, 14, 22, steel, 4);
      for (let i = 0; i < 4; i++) {
        const x = 2 + i * 5;
        c.rect(x, 9, 4, 5, i % 2 ? cream : red, (xx: number) => (xx === x ? 4 : 3));
        c.set(x + 4, 10, i % 2 ? cream : red, 2.5);
        c.set(x + 4, 12, i % 2 ? cream : red, 2.5);
      }
      c.rect(4, 5, 14, 3, cream, 3);
      for (let x = 5; x < 18; x += 3) c.vline(x, 5, 3, red, 3);
      c.outline(0);
      return;
    }
    if (v % 2 === 0) {
      // Trays (stacked, lit lips), the pot with a ladle.
      for (let i = 0; i < 4; i++) {
        c.hline(1, 15 - i * 2, 9, steel, 4);
        c.hline(1, 14 - i * 2, 9, steel, 2);
      }
      c.rect(12, 7, 10, 9, steel, (x: number) => (x < 14 ? 4 : x > 19 ? 2 : 3));
      c.hline(11, 6, 12, steel, 4.5);
      c.hline(12, 15, 10, steel, 1.5);
      c.line(18, 6, 21, 0, dark, 2);
      c.rect(20, 0, 3, 2, steel, 3.5);
    } else {
      // Leaning cutting board, a knife block, a jar of utensils.
      c.poly([1, 15, 4, 2, 10, 2, 9, 15], wood, 3);
      c.line(4, 2, 10, 2, wood, 4);
      c.ellipse(6.5, 4.5, 1, 1, dark, 1);
      c.rect(12, 7, 5, 9, dark, 2);
      for (let i = 0; i < 3; i++) c.rect(12 + i * 2, 3 + i, 1, 4, steel, 4);
      c.rect(18, 9, 5, 7, red, 3);
      c.hline(18, 9, 5, red, 4);
      c.line(19, 9, 18, 2, steel, 4);
      c.line(21, 9, 22, 3, wood, 3);
    }
    c.outline(0);
  });
}

/**
 * Stainless counter top (world, wrap 64 × 64; every counter runs along z, which is the
 * tile's v): mid steel with two reflected light strips running ALONG the run (8 texels
 * wide, a hot 4-texel core: one always lands on a 1.1 m wall counter or a 1.6 m island),
 * brushed grain as broken 1-texel lines along the run, food stains, a smear of sauce,
 * water spots and short knife scratches. Lines along the run survive the grazing view
 * (a pattern across it would collapse into one flat value — round 5: the tops read as
 * flat white slabs).
 */
export function counterTopTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2countertop|3',
    64,
    64,
    (c, k) => {
      const rng = k.rng;
      const m = k.ramp(0xa8b0b8, { light: 0.55, sat: 0.4 });
      const stain = k.ramp(0x6a4a2a, { light: 0.45, sat: 0.8 });
      const sauce = k.ramp(0x8a2a10, { light: 0.45 });
      for (let x = 0; x < 64; x++) {
        const b = x % 32;
        const t = b >= 8 && b < 16 ? (b >= 10 && b < 14 ? 4.5 : 3.5) : b === 7 || b === 16 ? 1.75 : 2.25;
        for (let y = 0; y < 64; y++) c.set(x, y, m, t);
      }
      // Brushed grain: broken 1-texel lines along the run (a step either side of the base).
      for (let i = 0; i < 14; i++) {
        const x = rng.int(0, 63);
        if (x % 32 >= 7 && x % 32 <= 16) continue;
        const y0 = rng.int(0, 63);
        const len = rng.int(10, 30);
        const t = i % 2 ? 2.75 : 1.75;
        for (let j = 0; j < len; j++) if ((j >> 3) % 4 !== 3) c.set(x, (y0 + j) % 64, m, t);
      }
      // Food stains, a smear of sauce, water spots (dull rings), knife scratches (short, along the run).
      for (let i = 0; i < 5; i++) c.cluster(rng.int(2, 60), rng.int(2, 60), rng.int(2, 8), stain, 1.75);
      c.cluster(rng.int(4, 56), rng.int(4, 56), 7, sauce, 2.25);
      for (let i = 0; i < 5; i++) c.rect(rng.int(0, 61), rng.int(0, 61), 2, 2, m, 1.5);
      for (let i = 0; i < 6; i++) {
        const x = rng.int(2, 60);
        const y = rng.int(2, 56);
        for (let j = 0; j < 6; j++) c.set(x + (j >> 2), y + j, m, 4.25);
      }
    },
    { wrap: true },
  );
}

/**
 * A floor contact shadow beside a counter or island base (cut out, 1.5 × 0.375 m = 48 × 12,
 * the bottom row against the base): solid dark for 5 texels at the kick plinth, one
 * 50 % step of 2×2 cells, then nothing — the boxes stand ON the floor instead of floating over an evenly lit chequer.
 */
export function floorShadowTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2floorshadow|2', 48, 12, (c, k) => {
    const r = k.ramp(0x161a20, { light: 0.4, sat: 0.6 });
    // (2×2-texel dither cells: a 1-texel checker crawls under the moving camera.)
    for (let y = 0; y < 12; y++) {
      const d = 11 - y; // texels from the base
      const cover = d < 5 ? 1 : d < 9 ? 0.5 : 0;
      for (let x = 0; x < 48; x++) if (bayer(x >> 1, y >> 1) < cover) c.set(x, y, r, d < 2 ? 0.75 : 1.25);
    }
  });
}

/** The counter top's front lip (fit across the 7 cm edge, 16 × 4): a lit rolled edge over a dark drip lip. */
export function counterLipTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2counterlip', 16, 4, (c, k) => {
    const m = k.ramp(0xb8bec4, { light: 0.55, sat: 0.4 });
    c.hline(0, 0, 16, m, 4.75);
    c.hline(0, 1, 16, m, 3.5);
    c.hline(0, 2, 16, m, 1.5);
    c.hline(0, 3, 16, m, 0.75);
  });
}

/**
 * A utensil rail on the splash-back (cut out, 1.5 × 0.6 m = 48 × 20): a steel
 * bar on two brackets with ladles, a slotted turner, a whisk, tongs, a sieve
 * and a cleaver hung from S-hooks — lit upper left, outlined.
 */
export function utensilRailTile(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`d2utensils|${v % 2}`, 48, 20, (c, k) => {
    const steel = k.ramp(0xb8bec4, { light: 0.55, sat: 0.4 });
    const dark = k.ramp(0x2a2a2e, { light: 0.4 });
    const wood = k.ramp(0x8a5a2e, { light: 0.45 });
    const red = k.ramp(0xb03a2a, { light: 0.45 });
    // Bar and brackets.
    c.hline(1, 1, 46, steel, 4.5);
    c.hline(1, 2, 46, steel, 2.5);
    for (const x of [2, 44]) c.rect(x, 0, 2, 4, dark, 2);
    const kinds = v % 2 ? [3, 0, 4, 1, 5, 2] : [0, 1, 2, 3, 4, 5];
    kinds.forEach((kind, i) => {
      const x = 6 + i * 7;
      c.set(x, 3, dark, 2);
      c.set(x, 4, dark, 2.5);
      switch (kind) {
        case 0: // ladle
          c.vline(x, 5, 9, steel, 4);
          c.ellipse(x + 0.5, 15.5, 2.5, 2, steel, (u, w) => (u + w < -0.3 ? 4.5 : u + w > 0.6 ? 2 : 3));
          break;
        case 1: // slotted turner, wooden handle
          c.rect(x, 5, 1, 6, wood, 3);
          c.rect(x - 1, 11, 3, 6, steel, 3.5);
          c.vline(x, 12, 4, dark, 1.5);
          break;
        case 2: // whisk
          c.vline(x, 5, 5, steel, 4);
          // Three wire loops (outer pair and the middle wire), the gaps between them open.
          for (let yy = 10; yy < 18; yy++) {
            const t = (yy - 10) / 7;
            const half = Math.round(Math.sin(t * Math.PI * 0.95 + 0.15) * 2);
            c.set(x - half, yy, steel, 4);
            c.set(x + half, yy, steel, 2.5);
            c.set(x, yy, steel, 3.25);
          }
          break;
        case 3: // tongs
          c.line(x, 5, x - 1, 16, steel, 4);
          c.line(x + 1, 5, x + 2, 16, steel, 2.5);
          break;
        case 4: // sieve
          c.vline(x, 5, 5, dark, 2);
          c.ellipse(x + 0.5, 13.5, 3, 3, steel, (u, w) => (u * u + w * w > 0.55 ? 4 : (Math.round(u * 6) + Math.round(w * 6)) % 2 ? 1.5 : 2.5));
          break;
        default: // cleaver, red handle
          c.rect(x, 5, 1, 4, red, 3);
          c.rect(x - 2, 9, 4, 7, steel, (xx: number) => (xx < x - 1 ? 4.5 : 3.25));
          c.hline(x - 2, 15, 4, steel, 1.75);
      }
    });
    c.outline(0);
  });
}

/**
 * A wall shelf (cut out, 2 × 0.6 m = 64 × 20) on two brackets: jars of pickles and
 * beans, labelled tins, cereal boxes, a stack of bowls, an oil bottle — the
 * counter run's long flat line broken by a skyline of stores.
 */
export function storesShelfTile(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`d2stores|${v % 2}`, 64, 20, (c, k) => {
    const rng = k.rng;
    const steel = k.ramp(0x9aa0a8, { light: 0.55, sat: 0.4 });
    const glass = k.ramp(0x8ab0a0, { light: 0.4, sat: 0.6 });
    const cols = [0xc03a2a, 0x2a8a4a, 0xe0b020, 0x2a5aa0, 0xd8d0c0].map((h) => k.ramp(h, { light: 0.45 }));
    const dark = k.ramp(0x2a2a2e, { light: 0.4 });
    // Shelf plank and brackets.
    c.rect(0, 16, 64, 2, steel, 3.5);
    c.hline(0, 16, 64, steel, 4.5);
    c.hline(0, 18, 64, steel, 1.5);
    for (const x of [6, 56]) c.line(x, 18, x + 3, 19, dark, 2);
    let x = 1 + (v % 2) * 3;
    while (x < 60) {
      const kind = rng.int(0, 4);
      const col = cols[rng.int(0, cols.length - 1)];
      if (kind === 0) {
        // Jar: glass with contents, a lid.
        const h = rng.int(7, 10);
        c.rect(x, 16 - h, 5, h, glass, (xx: number) => (xx === x ? 4 : 2.5));
        c.rect(x + 1, 16 - h + 3, 3, h - 4, col, 2.5);
        c.rect(x, 16 - h - 1, 5, 1, dark, 3);
        x += 6;
      } else if (kind === 1) {
        // Tins: two stacked, label band.
        for (let j = 0; j < 2; j++) {
          const y = 16 - 5 * (j + 1);
          c.rect(x, y, 4, 5, steel, 3);
          c.rect(x, y + 1, 4, 3, col, 3);
          c.vline(x, y, 5, steel, 4.5);
        }
        x += 5;
      } else if (kind === 2) {
        // Cereal-style box, a darker side.
        const h = rng.int(9, 13);
        c.rect(x, 16 - h, 6, h, col, (xx: number) => (xx >= x + 4 ? 2 : 3));
        c.rect(x + 1, 16 - h + 2, 3, 3, cols[4], 3.5);
        x += 7;
      } else if (kind === 3) {
        // Stack of bowls.
        for (let j = 0; j < 3; j++) c.rect(x + j % 2, 15 - j * 2, 6, 2, cols[4], j % 2 ? 3 : 4);
        x += 7;
      } else {
        // Oil bottle.
        c.rect(x, 7, 3, 9, cols[2], (xx: number) => (xx === x ? 4 : 2.5));
        c.rect(x + 1, 4, 1, 3, cols[2], 3);
        c.set(x + 1, 3, dark, 2);
        x += 4;
      }
    }
    c.outline(0);
  });
}

/** A floor drain (cut out round its wet ring, 0.75 m = 24 × 24): a slotted steel grate, rust in the slots, a dark damp halo. */
export function floorDrainTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2drain', 24, 24, (c, k) => {
    const m = k.ramp(0x8a9098, { light: 0.5, sat: 0.4 });
    const wet = k.ramp(0x3a3e3a, { light: 0.4, sat: 0.6 });
    const rust = k.ramp(0x7a3a1c, { light: 0.4 });
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        const u = (x + 0.5 - 12) / 12;
        const w = (y + 0.5 - 12) / 12;
        const d = u * u + w * w;
        if (d > 1 || (d > 0.7 && hash2(x >> 1, y >> 1, 5) > 0.5)) continue;
        c.set(x, y, wet, 2);
      }
    }
    c.rect(5, 5, 14, 14, m, 3);
    c.hline(5, 5, 14, m, 4.25);
    c.vline(5, 5, 14, m, 4);
    c.hline(5, 18, 14, m, 1.75);
    for (let y = 8; y < 17; y += 3) {
      c.rect(7, y, 10, 1, m, 0.75);
      if (y % 2) c.set(8 + (y % 5), y, rust, 2);
    }
  });
}

/** A grease stain on the vinyl (cut out, 1.5 × 1 m = 48 × 32): 2×2 clumps, densest at the middle, a faint lighter sheen arc. */
export function greaseStainTile(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`d2grease|${v % 2}`, 48, 32, (c, k) => {
    const g = k.ramp(0x4a3a24, { light: 0.4, sat: 0.7 });
    for (let y = 0; y < 32; y += 2) {
      for (let x = 0; x < 48; x += 2) {
        const u = (x + 1 - 24) / 22;
        const w = (y + 1 - 16) / 14;
        const r = Math.hypot(u, w) * (1 + Math.sin(Math.atan2(w, u) * 3 + v) * 0.18);
        const dens = 1 - r;
        if (dens <= 0 || hash2((x >> 1) + v * 17, y >> 1, 41) > dens * 1.6) continue;
        const sheen = Math.abs(r - 0.45) < 0.06 && u < 0;
        c.rect(x, y, 2, 2, g, sheen ? 3 : dens > 0.5 ? 1.5 : 2);
      }
    }
  });
}

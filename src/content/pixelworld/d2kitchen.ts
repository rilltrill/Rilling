import { PWF } from './canvas';
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
    'd2kitwall',
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
              c.set(x, y, isGreen || isRed ? r : grout, isGreen || isRed ? 1.75 : 2.5);
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
  return atlas.tile(`d2clutter|${v % 2}`, 24, 16, (c, k) => {
    const steel = k.ramp(0xb8bec4, { light: 0.55, sat: 0.4 });
    const dark = k.ramp(0x2a2a2e, { light: 0.4 });
    const wood = k.ramp(0x9a6a3a, { light: 0.45 });
    const red = k.ramp(0xc03a2a, { light: 0.45 });
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

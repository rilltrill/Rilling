import { bayer, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { hash2 } from './surfaces';
import { drawText, FONT_3x5, FONT_5x7, textWidth } from './font';

/**
 * The Patient Zero atrium (z2 boss arena) for PIXEL WORLD — it is on screen
 * the longest, so its surfaces get their own painters: the skylight seen
 * from below (night through wired glass, broken panes), glass balustrades
 * (cut out: frame, reflections, cracks, a smeared hand), balcony doorways
 * and lit office windows, fluted columns, and the growth — veins crawling
 * out of the fountain (ribbons with glowing nodes), flesh drapes hanging
 * from the balconies, strands dripping off the fascias.
 */

const G = PWF.GLOW;

/** Skylight from below (wrap 96 × 96 = one 3 m bay, GLOW): night sky, cloud, wired glass, broken panes, rain. */
export function skylightTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z2skylight', 96, 96, (c, k) => {
    const rng = k.rng;
    const sky = k.ramp(0x1a2a48, { light: 0.45, sat: 0.9 });
    const cloud = k.ramp(0x3a4a6a, { light: 0.4 });
    const wire = k.ramp(0x0c1018, { light: 0.4 });
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const n = hash2(x >> 3, y >> 3, 3);
      c.set(x, y, n > 0.75 ? cloud : sky, n > 0.75 ? 2 : 3, G);
    }
    // Moonlit cloud streak across the bay.
    for (let x = 0; x < 96; x++) {
      const y0 = 30 + Math.round(Math.sin(x * 0.08) * 6);
      for (let y = y0; y < y0 + 8; y++) if (bayer(x, y) < 0.7) c.set(x, y, cloud, y === y0 ? 4 : 3, G);
    }
    // Panes: 1.5 m squares; wire mesh every 8 texels; one pane broken (dark) with a ragged hole.
    for (let i = 0; i < 96; i += 8) for (let j = 0; j < 96; j++) {
      c.set(i, j, wire, 1, G);
      c.set(j, i, wire, 1, G);
    }
    for (let j = 0; j < 96; j++) {
      c.set(48, j, wire, 0, G);
      c.set(j, 48, wire, 0, G);
    }
    const bx = 62;
    const by = 66;
    for (let y = 50; y < 96; y++) for (let x = 50; x < 96; x++) {
      const d = Math.hypot(x - bx, y - by) + Math.sin(Math.atan2(y - by, x - bx) * 6) * 3;
      if (d < 12) c.set(x, y, wire, 0, G);
      else if (d < 13) c.set(x, y, cloud, 5, G);
    }
    // Rain beads on the glass.
    for (let i = 0; i < 40; i++) {
      const x = rng.int(0, 95);
      const y = rng.int(0, 92);
      c.set(x, y, cloud, 4, G);
      c.set(x, y + 1, cloud, 3, G);
    }
  }, { wrap: true });
}

/**
 * One bay of glass balustrade (2.5 × 1 m → 80 × 32, cut out): the bottom
 * channel and the clamp posts, pale reflection streaks; `variant` 0–1 clean,
 * 2 a crack spider, 3 a bloody hand dragged down it, 4 a pane gone (shards
 * left in the channel).
 */
export function glassRailTile(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2glassbay|${variant}`, 80, 32, (c, k) => {
    const rng = k.rng;
    const g = k.ramp(0x9fd0d0, { light: 0.45, sat: 0.6 });
    const frame = k.ramp(0x8a9094, { light: 0.5, sat: 0.4 });
    const blood = k.ramp(0x6a0c0c, { light: 0.45, sat: 1.1 });
    c.rect(0, 29, 80, 3, frame, 2);
    c.hline(0, 29, 80, frame, 4);
    for (const x of [0, 79]) c.vline(x, 0, 29, frame, 3);
    if (variant === 4) {
      // Pane gone: jagged shards standing in the channel.
      for (let x = 2; x < 78; x++) {
        const h = Math.max(0, Math.round(4 + Math.sin(x * 0.7) * 3 + (hash2(x, 1, 9) - 0.5) * 5));
        for (let y = 29 - h; y < 29; y++) c.set(x, y, g, y === 29 - h ? 5 : 3);
      }
      return;
    }
    // Reflections: two or three diagonal streaks (the rest is see-through).
    for (let i = 0; i < 2 + (variant & 1); i++) {
      const x0 = 8 + i * 26 + rng.int(0, 10);
      for (let j = 0; j < 22; j++) {
        const x = x0 + Math.round(j * 0.6);
        const y = 26 - j;
        if (x < 78 && bayer(x, y) < 0.8) c.set(x, y, g, j % 7 === 0 ? 5 : 3);
        if (i === 0 && x + 1 < 78) c.set(x + 1, y, g, 2);
      }
    }
    if (variant === 2) {
      const cx = rng.int(20, 60);
      const cy = rng.int(8, 18);
      for (let a = 0; a < 7; a++) {
        let x = cx;
        let y = cy;
        const an = (a / 7) * 6.28 + rng.next();
        for (let j = 0; j < 7 + rng.int(0, 6); j++) {
          x += Math.cos(an + rng.spread(0.3));
          y += Math.sin(an + rng.spread(0.3));
          if (x > 1 && x < 78 && y > 0 && y < 28) c.set(Math.round(x), Math.round(y), g, 5);
        }
      }
      for (let a = 0; a < 6.28; a += 0.5) c.set(Math.round(cx + Math.cos(a) * 3), Math.round(cy + Math.sin(a) * 2), g, 4);
    }
    if (variant === 3) {
      const x0 = rng.int(10, 60);
      for (let j = 0; j < 18; j++) for (let i = 0; i < 4; i++) if ((i + j) % 4 !== 3 && !(j > 12 && bayer(i, j) < 0.5)) c.set(x0 + i + (j >> 3), 4 + j, blood, j < 3 ? 4 : 3);
    }
  });
}

/** A balcony doorway: double doors, one ajar on the dark (1.6 × 2.4 m → 52 × 78). */
export function doorwayModule(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2doorway|${variant}`, 52, 78, (c, k) => {
    const frame = k.ramp(0x6a6a62, { light: 0.45 });
    const door = k.ramp(variant ? 0x5a6a6a : 0x6a5a48, { light: 0.45 });
    const dark = k.ramp(0x0c1010, { light: 0.3 });
    const glass = k.ramp(0x2a3a3a, { light: 0.45 });
    c.rect(0, 0, 52, 78, frame, 3);
    c.hline(0, 0, 52, frame, 4);
    c.vline(0, 0, 78, frame, 4);
    c.rect(3, 3, 46, 75, dark, 1);
    // Left leaf closed, right leaf ajar (narrower, darker), kick plates, a wired window each.
    c.rect(3, 3, 23, 75, door, 3);
    c.vline(3, 3, 75, door, 4);
    c.rect(28, 3, 14, 75, door, 2);
    c.vline(41, 3, 75, door, 1);
    for (const [x, w] of [[7, 15], [30, 9]]) {
      c.rect(x, 12, w, 18, glass, 2);
      for (let y = 12; y < 30; y += 4) c.hline(x, y, w, glass, 1);
    }
    c.rect(4, 66, 21, 10, frame, 3);
    c.rect(22, 38, 2, 6, frame, 4);
    // A lit room beyond the ajar leaf (warm light spilling over the floor).
    if (variant === 2) {
      const warm = k.ramp(0xd8b070, { light: 0.5 });
      c.rect(42, 3, 7, 75, warm, 3, G);
      c.rect(44, 3, 5, 75, warm, 4, G);
      for (let y = 70; y < 78; y++) for (let x = 30; x < 42; x++) if (bayer(x, y) < (y - 69) / 10) c.set(x, y, warm, 2, G);
    }
    // Something's eyes in the dark gap.
    if (variant === 1) {
      c.set(45, 30, k.ramp(0xff3020, { light: 0.4 }), 4, G);
      c.set(47, 30, k.ramp(0xff3020, { light: 0.4 }), 4, G);
    }
  });
}

/** Lit office window over the atrium (1.4 × 0.8 m → 45 × 26, GLOW): blinds half down, a desk lamp, a silhouette now and then. */
export function officeWindow(atlas: PwAtlas, lit: number, variant = 0): PwTile {
  return atlas.tile(`z2office|${lit.toString(16)}|${variant}`, 45, 26, (c, k) => {
    const l = k.ramp(lit, { light: 0.55, sat: 0.9 });
    const frame = k.ramp(0x5a5e58, { light: 0.45 });
    const slat = k.ramp(0x8a8a80, { light: 0.4 });
    c.rect(0, 0, 45, 26, frame, 3);
    c.rect(2, 2, 41, 22, l, 3, G);
    for (let y = 2; y < 12; y += 2) c.hline(2, y, 41, slat, 3);
    c.rect(6, 17, 10, 2, l, 5, G);
    if (variant) {
      const s = k.ramp(0x101414, { light: 0.3 });
      c.ellipse(30, 15, 3, 3, s, 1);
      c.rect(26, 18, 8, 6, s, 1);
    }
    c.vline(22, 2, 22, frame, 3);
  });
}

/** Fluted column (wrap 32 × 32, laid round the drum): flutes lit on their left, dark on the right, grime at the foot is a decal. */
export function columnTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2column|${hex.toString(16)}`, 32, 32, (c, k) => {
    const s = k.ramp(hex, { light: 0.42, sat: 0.7 });
    const P = [4, 3, 3, 3, 2, 1, 2, 3];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, s, P[x % 8]);
    c.scatter(k.rng, 0, 0, 32, 32, 10, 0, -1, { shapes: 3 });
  }, { wrap: true });
}

/**
 * A vein crawling across the floor (wrap along v: laid as a ribbon with u
 * stretched once across it; 32 × 64, cut out): a swollen tube with lobed
 * edges, a dark outline step, a lit ridge on its upper-left, creases across
 * it, a dim glowing core line pulsing through (it reads at a distance), and
 * clusters of glowing pustules.
 */
export function veinTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2vein3|${hex.toString(16)}`, 32, 64, (c, k) => {
    const f = k.ramp(hex, { light: 0.4, dark: 0.45, sat: 1.15 });
    const node = k.ramp(0xff5a20, { light: 0.35, sat: 1.15 });
    const TAU = Math.PI * 2;
    const hwAt = (v: number) => 9 + Math.sin((v / 64) * TAU * 2) * 3 + Math.sin((v / 64) * TAU * 5 + 1) * 1.6;
    const cAt = (v: number) => 16 + Math.sin((v / 64) * TAU) * 2;
    for (let y = 0; y < 64; y++) {
      const hw = hwAt(y);
      const cx = cAt(y);
      for (let x = 0; x < 32; x++) {
        const d = (x + 0.5 - cx) / hw;
        if (Math.abs(d) > 1) continue;
        // Dark outline step, a lit ridge on the left, the body, the shadowed right flank.
        let t = Math.abs(d) > 0.8 ? 0 : d < -0.4 ? 4 : d < 0.25 ? 3 : 2;
        if ((y + Math.round(d * d * 3)) % 11 === 0 && Math.abs(d) < 0.75) t = 1;
        c.set(x, y, f, t);
      }
      // The glowing core: a continuous 2-texel line of light pulsing down the tube (it frames the arena).
      const core = Math.round(cx - 1);
      const hot = hw > 10;
      c.set(core, y, node, hot ? 4 : 3, G);
      c.set(core + 1, y, node, hot ? 3 : 2, G);
    }
    // Pustules swelling on the tube (glow, dark-rimmed), one big cluster a tile.
    for (const [px, py, r] of [[15, 14, 4], [20, 18, 2], [12, 47, 3]] as const) {
      c.ellipse(px, py, r + 1, r * 0.85 + 1, f, 0);
      c.ellipse(px, py, r, r * 0.85, node, 3, G);
      c.ellipse(px - r * 0.3, py - r * 0.3, Math.max(0.8, r * 0.35), Math.max(0.6, r * 0.3), node, 4, G);
    }
  }, { wrap: true });
}

/** A strand of flesh dripping off a fascia (12 × 64, cut out): knotted, a drop at the end. */
export function dripTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2drip|${hex.toString(16)}`, 12, 64, (c, k) => {
    const f = k.ramp(hex, { light: 0.5, sat: 1.1 });
    for (let y = 0; y < 60; y++) {
      const w = Math.max(1, Math.round(3 - y / 30 + Math.sin(y * 0.5) * 0.8));
      const cx = 6 + Math.round(Math.sin(y * 0.15) * 1.5);
      for (let x = cx - w; x <= cx + w; x++) c.set(x, y, f, x === cx - w ? 4 : x === cx + w ? 1 : 3);
    }
    c.ellipse(6, 61, 2, 2.5, f, 3);
    c.set(5, 60, f, 5);
  });
}

/** A drape of membrane hanging off a balcony fascia (64 × 32 = 2 × 1 m, cut out): veined sheet, holes, a ragged dripping hem. */
export function membraneTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2membrane|${hex.toString(16)}`, 64, 32, (c, k) => {
    const rng = k.rng;
    const f = k.ramp(hex, { light: 0.5, sat: 1.1 });
    const vein = k.ramp(0x5a1a3a, { light: 0.45, sat: 1.1 });
    for (let x = 0; x < 64; x++) {
      const hem = 18 + Math.round(Math.sin(x * 0.3) * 3 + Math.sin(x * 0.11 + 1) * 4);
      for (let y = 0; y < hem; y++) c.set(x, y, f, y < 3 ? 4 : (x * 3 + y) % 9 === 0 ? 2 : 3);
      // Drips under the hem.
      if (hash2(x, 3, 5) > 0.82) for (let y = hem; y < Math.min(31, hem + rng.int(3, 10)); y++) c.set(x, y, f, 2);
    }
    // Holes (torn) and veins.
    for (let i = 0; i < 3; i++) c.ellipse(rng.int(8, 56), rng.int(6, 14), rng.range(1.5, 3), rng.range(1, 2), f, 0);
    for (let i = 0; i < 4; i++) {
      let x = rng.int(4, 60);
      let y = 1;
      for (let j = 0; j < 16; j++) {
        if (c.at(x, y)) c.set(x, y, vein, 3);
        x += rng.int(-1, 1);
        y += 1;
      }
    }
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
      const i = y * 64 + x;
      if (c.ramp[i] === f && c.tone[i] === 0) c.ramp[i] = 0;
    }
  }, { wrap: true });
}

/** A cluster of glowing pustules on the floor (top view, 24 × 24, GLOW cores, dark rims, cut out). */
export function pustuleDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z2pustule3', 24, 24, (c, k) => {
    const f = k.ramp(0x7a2a2a, { light: 0.4, sat: 1.1 });
    const n = k.ramp(0xff5a20, { light: 0.35, sat: 1.15 });
    for (const [x, y, r] of [[11, 12, 7], [18, 6, 3], [5, 17, 2.6]] as const) {
      c.ellipse(x, y, r + 1.2, r + 1, f, 0);
      c.ellipse(x, y, r, r * 0.9, f, 2);
      c.ellipse(x, y, r * 0.62, r * 0.55, n, 3, G);
      c.ellipse(x - r * 0.2, y - r * 0.2, Math.max(0.8, r * 0.28), Math.max(0.7, r * 0.24), n, 4, G);
    }
  });
}

/**
 * Balcony fascia (wrap 80 × 16 = 2.5 m × 0.5 m, v from the slab's underside):
 * the painted edge band of each storey — a lit nosing, a drip groove and the
 * shadowed underside lip, dirty-water dribbles and rust runs from the rail
 * posts above, a hairline crack, soot rising from the bottom edge.
 */
export function fasciaTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2fascia|${hex.toString(16)}`, 80, 16, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(hex, { light: 0.42, sat: 0.7 });
    const rust = k.ramp(0x7a4a2a, { light: 0.4, sat: 0.8 });
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 80; x++) {
        const t = y === 0 ? 4 : y === 13 ? 1 : y >= 14 ? 2 : 3;
        c.set(x, y, p, t);
      }
    }
    // Patchy repaint: broad clusters a step darker / lighter.
    for (let i = 0; i < 14; i++) c.cluster(rng.int(0, 77), rng.int(2, 11), rng.int(0, 9), 0, rng.chance(0.6) ? -1 : 1);
    // Dribbles from the nosing down the band (dirty rainwater), longer where they pool.
    for (let i = 0; i < 9; i++) {
      const x = rng.int(0, 79);
      const len = rng.int(3, 11);
      for (let y = 1; y < 1 + len && y < 13; y++) c.shift(x, y, -1);
      if (rng.chance(0.4)) for (let y = 1; y < 1 + (len >> 1); y++) c.shift((x + 1) % 80, y, -1);
    }
    // Rust runs (two per bay, under where the rail posts stand).
    for (const x0 of [6, 46]) {
      const len = rng.int(6, 11);
      for (let y = 1; y < 1 + len; y++) c.tint(x0 + (y > 6 ? 1 : 0), y, rust, y < 3 ? 0 : -0.6);
    }
    // Hairline crack across the band, soot along the drip edge.
    let cx = rng.int(20, 60);
    for (let y = 2; y < 13; y++) {
      c.shift(cx, y, -1);
      if (hash2(cx, y, 5) > 0.6) cx += 1;
    }
    for (let x = 0; x < 80; x++) if (hash2(x >> 1, 0, 8) < 0.45) c.shift(x, 12, -1);
  }, { wrap: true });
}

/**
 * The elevator bank on the atrium's ground floor (3.75 × 3.25 m → 120 × 104):
 * stone cladding, two brushed-steel cars — the left pried open on the dark
 * shaft (cables, a smeared hand), the right shut — amber floor indicators
 * (GLOW: B1 and a dead one), the call buttons lit, an OUT OF ORDER sheet.
 */
export function elevatorBank(atlas: PwAtlas): PwTile {
  return atlas.tile('z2elevators', 120, 104, (c, k) => {
    const rng = k.rng;
    const stone = k.ramp(0x6a665c, { light: 0.4, sat: 0.6 });
    const steel = k.ramp(0x9aa2a4, { light: 0.5, sat: 0.35 });
    const dark = k.ramp(0x0a0c0e, { light: 0.3 });
    const amber = k.ramp(0xffa830, { light: 0.5 });
    const paper = k.ramp(0xe0dccc, { light: 0.25 });
    const ink = k.ramp(0x1a1a1a, { light: 0.3 });
    const blood = k.ramp(0x5c0909, { light: 0.45, sat: 1.1 });
    c.rect(0, 0, 120, 104, stone, 3);
    for (let y = 0; y < 104; y += 26) c.hline(0, y, 120, stone, 2);
    for (let x = 0; x < 120; x += 40) c.vline(x, 0, 104, stone, 2);
    c.scatter(rng, 0, 0, 120, 104, 40, 0, -1, { shapes: 4 });
    for (const [x0, open] of [[10, true], [66, false]] as const) {
      // Steel surround, then the doors (or the open shaft).
      c.rect(x0 - 3, 30, 50, 74, steel, 2);
      c.hline(x0 - 3, 30, 50, steel, 4);
      c.vline(x0 - 3, 30, 74, steel, 4);
      if (open) {
        c.rect(x0, 33, 44, 71, dark, 1);
        // Doors forced back into the jambs, the shaft's cables, a hand print on the edge.
        c.rect(x0, 33, 6, 71, steel, 3);
        c.rect(x0 + 38, 33, 6, 71, steel, 3);
        for (const cx of [x0 + 18, x0 + 24]) for (let y = 33; y < 104; y++) if (y % 5) c.set(cx, y, steel, 1);
        for (let j = 0; j < 9; j++) for (let i = 0; i < 4; i++) if ((i + j) % 4 !== 3) c.set(x0 + 6 + i, 60 + j, blood, j < 2 ? 4 : 3);
      } else {
        for (let y = 33; y < 104; y++) for (let x = x0; x < x0 + 44; x++) c.set(x, y, steel, (x * 3 + (y >> 2)) % 7 === 0 ? 4 : 3);
        c.vline(x0 + 22, 33, 71, steel, 1);
        c.vline(x0 + 23, 33, 71, steel, 4);
        // OUT OF ORDER taped to it.
        c.rect(x0 + 26, 50, 14, 10, paper, 3);
        drawText(c, 'OUT', x0 + 27, 51, FONT_3x5, ink, 3, {});
      }
      // Floor indicator above: a dark slot, amber digits.
      c.rect(x0 + 12, 18, 20, 9, dark, 1);
      c.frame(x0 + 11, 17, 22, 11, steel, 3);
      if (open) drawText(c, 'B1', x0 + 16, 20, FONT_3x5, amber, 4, {});
      else c.set(x0 + 21, 22, amber, 2, G);
    }
    // Call buttons between the cars (up lit).
    c.rect(57, 58, 7, 14, steel, 3);
    c.ellipse(60, 62, 1.6, 1.6, amber, 4, G);
    c.ellipse(60, 68, 1.6, 1.6, steel, 1);
    for (let y = 0; y < 104; y++) for (let x = 0; x < 120; x++) if (c.ramp[y * 120 + x] === amber && !(c.flag[y * 120 + x] & G)) c.flag[y * 120 + x] = G;
  });
}

/**
 * A café front on the atrium's ground floor (5 × 3 m → 160 × 96): a lit CAFE
 * sign, the roller shutter jammed half down, under it a dark counter with an
 * espresso machine's lit dial, a chalk menu, stacked chairs, blood on the
 * shutter.
 */
export function cafeFront(atlas: PwAtlas): PwTile {
  return atlas.tile('z2cafe', 160, 96, (c, k) => {
    const rng = k.rng;
    const wall = k.ramp(0x4a3a30, { light: 0.4, sat: 0.8 });
    const shutter = k.ramp(0x8a8c88, { light: 0.45, sat: 0.4 });
    const dark = k.ramp(0x100c0a, { light: 0.35 });
    const warm = k.ramp(0xffc070, { light: 0.55 });
    const chalk = k.ramp(0x1c2a22, { light: 0.4 });
    const chalkInk = k.ramp(0xd8d8c8, { light: 0.3 });
    const wood = k.ramp(0x6a4a2a, { light: 0.45 });
    const blood = k.ramp(0x5c0909, { light: 0.45, sat: 1.1 });
    c.rect(0, 0, 160, 96, wall, 3);
    c.hline(0, 0, 160, wall, 4);
    // Fascia with the lit sign.
    c.rect(4, 4, 152, 18, dark, 1);
    const tw = textWidth('CAFE', FONT_5x7, { scale: 2 });
    drawText(c, 'CAFE', 80 - Math.round(tw / 2), 6, FONT_5x7, warm, 4, { scale: 2 });
    for (let y = 4; y < 22; y++) for (let x = 4; x < 156; x++) if (c.ramp[y * 160 + x] === warm) c.flag[y * 160 + x] = G;
    // Opening: shutter down to 0.9 m above the counter.
    c.rect(8, 26, 144, 70, dark, 1);
    for (let y = 26; y < 52; y++) for (let x = 8; x < 152; x++) c.set(x, y, shutter, y % 3 === 0 ? 2 : y % 3 === 1 ? 4 : 3);
    c.hline(8, 52, 144, shutter, 1);
    // Under the shutter: the counter, the espresso machine, a menu board, stacked chairs.
    c.rect(8, 70, 144, 26, wood, 3);
    c.hline(8, 70, 144, wood, 5);
    c.rect(30, 56, 22, 14, shutter, 2);
    c.ellipse(41, 62, 3, 3, warm, 3, G);
    c.rect(100, 54, 34, 16, chalk, 2);
    for (let j = 0; j < 4; j++) c.hline(103, 57 + j * 3, rng.int(14, 28), chalkInk, 3);
    for (const x of [64, 76]) {
      c.vline(x, 56, 14, wood, 2);
      c.hline(x - 4, 60, 9, wood, 4);
    }
    // Blood smeared across the shutter's bottom slats.
    for (let x = 60; x < 96; x++) {
      const h = Math.round(3 + Math.sin(x * 0.4) * 2 + hash2(x, 2, 5) * 3);
      for (let y = 49 - h; y < 52; y++) if (bayer(x, y) < 0.85) c.set(x, y, blood, y > 48 ? 4 : 3);
    }
  });
}

/** The hospital directory board (1.25 × 1.6 m → 40 × 52): floors listed, YOU ARE HERE, a bloody hand. */
export function directoryBoard(atlas: PwAtlas): PwTile {
  return atlas.tile('z2directory', 40, 52, (c, k) => {
    const frame = k.ramp(0x8a8c88, { light: 0.5, sat: 0.4 });
    const board = k.ramp(0x1a2430, { light: 0.4 });
    const ink = k.ramp(0xd8e4e8, { light: 0.3 });
    const head = k.ramp(0x6ab8e8, { light: 0.4 });
    const red = k.ramp(0xe8301e, { light: 0.4 });
    const blood = k.ramp(0x5c0909, { light: 0.45, sat: 1.1 });
    c.rect(0, 0, 40, 52, frame, 3);
    c.hline(0, 0, 40, frame, 4);
    c.vline(0, 0, 52, frame, 4);
    c.rect(2, 2, 36, 48, board, 2);
    c.rect(2, 2, 36, 8, head, 2);
    drawText(c, 'FLOORS', 20 - Math.round(textWidth('FLOORS', FONT_3x5, {}) / 2), 4, FONT_3x5, ink, 4, {});
    ['3 SURGERY', '2 WARDS', '1 ER', 'B1 MORGUE'].forEach((t, i) => drawText(c, t, 4, 13 + i * 8, FONT_3x5, ink, 3, {}));
    c.ellipse(33, 45, 2, 2, red, 3);
    for (let j = 0; j < 10; j++) for (let i = 0; i < 5; i++) if ((i + j) % 5 !== 4 && hash2(i, j, 7) > 0.2) c.set(24 + i + (j >> 2), 30 + j, blood, j < 2 ? 4 : 3);
  });
}

/** A big atrium wall clock (1.5 m → 48 × 48, cut out round it): stopped at 3:14, the glass cracked. */
export function bigClock(atlas: PwAtlas): PwTile {
  return atlas.tile('z2bigclock', 48, 48, (c, k) => {
    const rim = k.ramp(0x2a2e30, { light: 0.5 });
    const face = k.ramp(0xe0dccc, { light: 0.3, sat: 0.5 });
    const ink = k.ramp(0x1a1a1a, { light: 0.3 });
    const red = k.ramp(0xb81e14, { light: 0.4 });
    c.ellipse(24, 24, 23.5, 23.5, rim, 2);
    c.ellipse(23, 23, 23, 23, rim, 4);
    c.ellipse(24, 24, 20.5, 20.5, face, 3);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r0 = i % 3 === 0 ? 15 : 17;
      for (let r = r0; r < 19; r++) c.set(Math.round(24 + Math.sin(a) * r), Math.round(24 - Math.cos(a) * r), ink, 1);
    }
    const hand = (a: number, len: number, r: number) => {
      for (let t = 0; t < len; t += 0.5) {
        c.set(Math.round(24 + Math.sin(a) * t), Math.round(24 - Math.cos(a) * t), r, 1);
        c.set(Math.round(24.5 + Math.sin(a) * t), Math.round(24 - Math.cos(a) * t), r, 1);
      }
    };
    hand((3.23 / 12) * Math.PI * 2, 11, ink);
    hand((14 / 60) * Math.PI * 2, 16, ink);
    hand((40 / 60) * Math.PI * 2, 17, red);
    c.ellipse(24, 24, 1.5, 1.5, ink, 1);
    // Cracked glass: lines from a strike point.
    for (const a of [0.3, 1.4, 2.6, 4.0, 5.2]) {
      for (let t = 0; t < 14; t++) {
        const x = Math.round(31 + Math.cos(a) * t);
        const y = Math.round(15 + Math.sin(a) * t);
        if (c.at(x, y) === face) c.set(x, y, face, 5);
      }
    }
  });
}

/**
 * A banner hanging from the top balcony (1 × 3.5 m → 32 × 112, cut out):
 * the hospital's anniversary banner — a teal cloth with the cross, ST MERCY
 * set down it, a torn ragged foot, a long blood streak.
 */
export function bannerModule(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`z2banner|${v}`, 32, 112, (c, k) => {
    const rng = k.rng;
    const cloth = k.ramp(v ? 0x2a6a7a : 0x7a2a3a, { light: 0.45, sat: 0.9 });
    const ink = k.ramp(0xe8e4d8, { light: 0.3 });
    const rod = k.ramp(0x8a9094, { light: 0.5 });
    const blood = k.ramp(0x4a0606, { light: 0.4, sat: 1.1 });
    c.rect(0, 0, 32, 3, rod, 3);
    c.hline(0, 0, 32, rod, 5);
    for (let x = 1; x < 31; x++) {
      const foot = 104 - Math.round(Math.abs(Math.sin(x * 0.9 + v)) * 6 + hash2(x, v, 3) * 8 + (v && x > 18 ? 18 : 0));
      for (let y = 3; y < foot; y++) {
        // Folds: the cloth hangs in soft vertical pleats.
        const pleat = Math.sin(x * 0.7) > 0.6 ? 4 : Math.sin(x * 0.7) < -0.6 ? 2 : 3;
        c.set(x, y, cloth, pleat);
      }
    }
    // The cross and the name down the banner.
    c.rect(12, 10, 8, 20, ink, 3);
    c.rect(6, 16, 20, 8, ink, 3);
    'MERCY'.split('').forEach((ch, i) => drawText(c, ch, 14, 38 + i * 9, FONT_3x5, ink, 3, {}));
    for (let x = 2; x < 30; x++) if (hash2(x, 9, v) > 0.4) c.set(x, 34, ink, 2);
    // A blood streak run down from a hand print.
    const bx = 7 + rng.int(0, 16);
    for (let y = 60; y < 100; y++) if (c.at(bx, y) && !(y > 88 && bayer(bx, y) < 0.5)) {
      c.set(bx, y, blood, 2);
      if (y < 70) c.set(bx + 1, y, blood, 2);
    }
  });
}

/** A wall sconce on a balcony wall (0.3 × 0.44 m → 10 × 14): a bracket and a frosted shade, lit (GLOW) or dead. */
export function sconceModule(atlas: PwAtlas, lit: boolean): PwTile {
  return atlas.tile(`z2sconce|${lit ? 1 : 0}`, 10, 14, (c, k) => {
    const brass = k.ramp(0x8a7a4a, { light: 0.45 });
    const shade = k.ramp(lit ? 0xffd8a0 : 0x5a564e, { light: 0.5 });
    c.rect(4, 8, 2, 6, brass, 2);
    c.rect(3, 12, 4, 2, brass, 3);
    for (let y = 0; y < 9; y++) {
      const w = 3 + Math.round(y / 3);
      c.rect(5 - w, y, w * 2, 1, shade, lit ? (y < 2 ? 5 : y < 6 ? 4 : 3) : y < 2 ? 3 : 2, lit ? G : 0);
    }
  });
}

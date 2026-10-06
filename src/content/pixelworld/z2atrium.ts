import { bayer, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { hash2 } from './surfaces';

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

/** Glass balustrade (wrap along u, 64 × 32 = 2 × 1 m, cut out): edge frames, reflections, cracks, smears. */
export function glassRailTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z2glassrail', 64, 32, (c, k) => {
    const rng = k.rng;
    const g = k.ramp(0x9fd0d0, { light: 0.45, sat: 0.6 });
    const frame = k.ramp(0x8a9094, { light: 0.5, sat: 0.4 });
    const blood = k.ramp(0x6a0c0c, { light: 0.45, sat: 1.1 });
    // Panel clamps every 2 m and a bottom channel.
    c.rect(0, 29, 64, 3, frame, 2);
    c.hline(0, 29, 64, frame, 4);
    for (const x of [0, 63]) c.vline(x, 0, 29, frame, 3);
    // Reflections: diagonal streaks of pale glass (the rest is see-through).
    for (let i = 0; i < 5; i++) {
      const x0 = rng.int(4, 56);
      for (let j = 0; j < 22; j++) {
        const x = x0 + Math.round(j * 0.6);
        const y = 26 - j;
        if (x < 63 && bayer(x, y) < 0.8) c.set(x, y, g, j % 7 === 0 ? 5 : 3);
        if (i % 2 === 0 && x + 1 < 63) c.set(x + 1, y, g, 2);
      }
    }
    // A crack spider in one panel.
    const cx = 40;
    const cy = 12;
    for (let a = 0; a < 6; a++) {
      let x = cx;
      let y = cy;
      const an = (a / 6) * 6.28 + 0.4;
      for (let j = 0; j < 9; j++) {
        x += Math.cos(an + rng.spread(0.3));
        y += Math.sin(an + rng.spread(0.3));
        if (x > 1 && x < 62 && y > 0 && y < 28) c.set(Math.round(x), Math.round(y), g, 5);
      }
    }
    // A bloody hand dragged down the glass.
    for (let j = 0; j < 12; j++) for (let i = 0; i < 4; i++) if ((i + j) % 4 !== 3) c.set(12 + i, 6 + j, blood, j < 3 ? 4 : 3);
  }, { wrap: true });
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
 * A vein crawling across the floor (wrap along v: laid as a ribbon, 16 × 64,
 * cut out): a swollen tube with a lit crest and dark creases, tapering knots,
 * glowing nodes (GLOW) every metre or so, hair-thin capillaries at the sides.
 */
export function veinTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2vein|${hex.toString(16)}`, 16, 64, (c, k) => {
    const f = k.ramp(hex, { light: 0.5, sat: 1.1 });
    const node = k.ramp(0xff4a2a, { light: 0.5, sat: 1.1 });
    for (let y = 0; y < 64; y++) {
      const w = 3 + Math.round(Math.sin((y / 64) * Math.PI * 4) * 1.2 + Math.sin((y / 64) * Math.PI * 10) * 0.6);
      const cx = 8 + Math.round(Math.sin((y / 64) * Math.PI * 2) * 1.5);
      for (let x = cx - w; x <= cx + w; x++) {
        const d = (x - cx) / w;
        const t = d < -0.6 ? 4 : d < -0.2 ? 3 : d < 0.5 ? 2 : 1;
        c.set(x, y, f, (y * 7 + x) % 11 === 0 ? 1 : t);
      }
      if (hash2(y, 1, 7) > 0.9) {
        c.set(cx - w - 1, y, f, 2);
        c.set(cx - w - 2, y + 1, f, 2);
      }
    }
    // Nodes: glowing pustules.
    for (const ny of [14, 46]) {
      c.ellipse(8, ny, 4, 3, node, 4, G);
      c.ellipse(7, ny - 1, 1.5, 1, node, 5, G);
      c.set(10, ny + 1, node, 3, G);
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

/** A glowing pustule on the floor (top view, 12 × 12, GLOW core, cut out). */
export function pustuleDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z2pustule', 12, 12, (c, k) => {
    const f = k.ramp(0x7a2a2a, { light: 0.5, sat: 1.1 });
    const n = k.ramp(0xff4a2a, { light: 0.5, sat: 1.1 });
    c.ellipse(6, 6, 5.5, 5, f, 2);
    c.ellipse(6, 6, 3, 2.6, n, 3, G);
    c.ellipse(5, 5, 1.2, 1, n, 4, G);
  });
}

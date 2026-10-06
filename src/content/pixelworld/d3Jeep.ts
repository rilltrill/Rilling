import { bayer } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_BOLD, textWidth } from './font';
import { hash2, smooth } from './surfaces';
import { d1Emblem } from './d1Tiles';

/**
 * The ranger jeep of TYRANT CHASE (the first-person vehicle, right under the
 * camera all stage long) for ART: PIXEL WORLD, painted at D3_JEEP_TPM so its
 * texels sit with the cast's sprites up close: rain-soaked olive drab over
 * riveted panels (wet highlights beaded along the seams, chips down to primer
 * and bare steel, scratches), caked mud on the wings, a sand recognition
 * stripe, gunmetal, knobbly tyres, the bed's diamond plate, canvas seats, the
 * red jerry cans, the park emblem and a stencilled RANGER number on the hood.
 */

export const D3_JEEP_TPM = 48;

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Wet olive drab panel (64 × 64 wrap): faded drifts, a riveted seam, chips, scratches, mud flecks, rain beads. */
export function d3JeepPaintTile(atlas: PwAtlas, o: { hex: number; primer: number; steel: number; mud: number; rivets?: boolean }): PwTile {
  return atlas.tile(`d3jeeppaint|${h6(o.hex)}|${o.rivets === false ? 0 : 1}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(o.hex, { light: 0.45, sat: 0.95 });
    const pr = k.ramp(o.primer, { light: 0.4 });
    const st = k.ramp(o.steel, { light: 0.55, sat: 0.6 });
    const mud = k.ramp(o.mud, { light: 0.4 });
    // Faded drifts: hard-edged areas a step lighter / darker (no blur).
    c.rect(0, 0, 64, 64, p, (x, y) => {
      const n = smooth(x, y, 64, 64, 3, 5) * 0.8 + hash2(x >> 1, y >> 1, 6) * 0.2;
      return n > 0.66 ? 3.5 : n < 0.28 ? 2.6 : 3;
    });
    if (o.rivets !== false) {
      for (let y = 0; y < 64; y += 32) {
        c.hline(0, y, 64, p, 1.4);
        c.hline(0, y + 1, 64, p, 3.9);
        for (let x = 3; x < 64; x += 6) {
          c.set(x, y + 3, p, 4.6);
          c.set(x + 1, y + 4, p, 1.6);
        }
      }
    }
    // Chips: primer, bare steel in the bigger ones, a dark lower rim.
    for (let i = 0; i < 24; i++) {
      const x = rng.int(0, 63);
      const y = rng.int(0, 63);
      const s = rng.int(0, 9);
      c.cluster(x, y, s, pr, 3.2);
      if (rng.chance(0.35)) c.set(wrap(x + 1, 64), y, st, 4.4);
      c.shift(x, wrap(y + 2, 64), -0.9);
    }
    // Scratches.
    for (let i = 0; i < 9; i++) {
      const x = rng.int(0, 63);
      const y = rng.int(0, 63);
      const len = rng.int(3, 9);
      const dy = rng.chance(0.5) ? 0 : 1;
      for (let j = 0; j < len; j++) c.set(wrap(x + j, 64), wrap(y + Math.round((j * dy) / 3), 64), st, 3.8);
    }
    // Mud flecks.
    for (let i = 0; i < 12; i++) c.cluster(rng.int(0, 63), rng.int(0, 63), i, mud, rng.chance(0.5) ? 3 : 2.4);
    // Rain beads: a lit texel on a dark one (the drop and its shadow), more along the seam.
    for (let i = 0; i < 40; i++) {
      const x = rng.int(0, 63);
      const y = i < 10 ? (i % 2 ? 2 : 34) + rng.int(0, 2) : rng.int(0, 63);
      c.shift(x, y, 1.6);
      c.shift(x, wrap(y + 1, 64), -1);
    }
  }, { wrap: true, density: D3_JEEP_TPM });
}

/** Caked mud on the wings (32 × 32 wrap): lumps lit on top, cracks, the paint showing in gaps, wet sheen. */
export function d3JeepMudTile(atlas: PwAtlas, o: { hex: number; under: number }): PwTile {
  return atlas.tile(`d3jeepmud|${h6(o.hex)}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const m = k.ramp(o.hex, { light: 0.42 });
    const u = k.ramp(o.under, { light: 0.42 });
    c.rect(0, 0, 32, 32, m, (x, y) => (smooth(x, y, 32, 32, 4, 3) < 0.3 ? 2.2 : 3));
    for (let i = 0; i < 22; i++) {
      const x = rng.int(0, 31);
      const y = rng.int(0, 31);
      const r = rng.int(1, 3);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) c.set(wrap(x + dx, 32), wrap(y + dy, 32), m, dy < 0 ? 4 : dy > 0 ? 2.2 : 3.2);
    }
    for (let i = 0; i < 6; i++) c.cluster(rng.int(0, 30), rng.int(0, 30), i, u, 3);
    for (let i = 0; i < 8; i++) c.set(rng.int(0, 31), rng.int(0, 31), m, 4.8);
  }, { wrap: true, density: D3_JEEP_TPM });
}

/** Gunmetal / bare steel (32 × 32 wrap): brushed bands, bright worn edges, scratches, rust spots, beads of rain. */
export function d3SteelTile(atlas: PwAtlas, o: { hex: number; calm?: boolean }): PwTile {
  // `calm`: fewer, softer scuffs (a surface right at the lens: the cabin's door frame).
  return atlas.tile(`d3steel|${h6(o.hex)}${o.calm ? '|calm' : ''}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.55, sat: 0.6 });
    const rust = k.ramp(0x7a3a1c, { light: 0.4 });
    const dash = o.calm ? 0.94 : 0.8;
    c.rect(0, 0, 32, 32, s, (x, y) => (hash2(x >> 3, y, 3) > dash ? (o.calm ? 3.3 : 3.6) : hash2(x >> 2, y >> 3, 4) > 0.85 ? 2.4 : 3));
    for (let i = 0; i < (o.calm ? 3 : 8); i++) {
      const x = rng.int(0, 31);
      const y = rng.int(0, 31);
      const n = rng.int(3, 7);
      for (let j = 0; j < n; j++) c.set(wrap(x + j, 32), y, s, o.calm ? 3.8 : 4.6);
    }
    for (let i = 0; i < (o.calm ? 0 : 4); i++) c.cluster(rng.int(0, 30), rng.int(0, 30), i, rust, 2.6);
    for (let i = 0; i < (o.calm ? 4 : 10); i++) {
      const x = rng.int(0, 31);
      const y = rng.int(0, 30);
      c.shift(x, y, 1.6);
      c.shift(x, y + 1, -1);
    }
  }, { wrap: true, density: D3_JEEP_TPM });
}

/** Knobbly tyre (32 × 32 wrap, u round the wheel): staggered lugs lit on top, mud packed between them. */
export function d3TyreTile(atlas: PwAtlas, o: { hex: number; mud: number }): PwTile {
  return atlas.tile(`d3tyre|${h6(o.hex)}`, 32, 32, (c, k) => {
    const r = k.ramp(o.hex, { light: 0.4 });
    const mud = k.ramp(o.mud, { light: 0.4 });
    c.rect(0, 0, 32, 32, r, 1.6);
    for (let y = 0; y < 32; y += 8) {
      for (let x = 0; x < 32; x += 8) {
        const ox = ((y >> 3) & 1) * 4;
        c.rect(wrap(x + ox, 32), y + 1, 5, 5, r, 3);
        c.hline(wrap(x + ox, 32), y + 1, 5, r, 4);
        c.vline(wrap(x + ox + 4, 32), y + 2, 4, r, 2.2);
      }
    }
    c.scatter(k.rng, 0, 0, 32, 32, 18, mud, 2.8, { shapes: 6 });
  }, { wrap: true, density: D3_JEEP_TPM });
}

/** Diamond tread plate (32 × 32 wrap): raised lit diamonds in a herringbone, water and mud in the corners. */
export function d3TreadPlateTile(atlas: PwAtlas, o: { hex: number; mud: number }): PwTile {
  return atlas.tile(`d3treadplate|${h6(o.hex)}`, 32, 32, (c, k) => {
    const s = k.ramp(o.hex, { light: 0.55, sat: 0.6 });
    const mud = k.ramp(o.mud, { light: 0.4 });
    c.rect(0, 0, 32, 32, s, 2.6);
    for (let y = 0; y < 32; y += 4) {
      for (let x = 0; x < 32; x += 8) {
        const dx = x + ((y >> 2) % 2 ? 4 : 0);
        const up = ((y >> 2) + (x >> 3)) % 2 === 0;
        for (let j = 0; j < 3; j++) {
          c.set(wrap(dx + j, 32), wrap(y + (up ? 2 - j : j), 32), s, j === 0 ? 4.4 : 3.6);
          c.set(wrap(dx + j + 1, 32), wrap(y + (up ? 3 - j : j + 1), 32), s, 1.4);
        }
      }
    }
    c.scatter(k.rng, 0, 0, 32, 32, 16, mud, 2.6, { shapes: 6 });
  }, { wrap: true, density: D3_JEEP_TPM });
}

/** Grille / mesh (32 × 32 wrap): dark openings in a lit lattice. */
export function d3MeshTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3mesh|${h6(o.hex)}`, 32, 32, (c, k) => {
    const s = k.ramp(o.hex, { light: 0.5, sat: 0.6 });
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const gx = x % 4;
        const gy = y % 4;
        c.set(x, y, s, gx === 0 || gy === 0 ? (gx === 0 && gy === 0 ? 4 : 3.2) : gx === 1 && gy === 1 ? 0.6 : 1);
      }
    }
  }, { wrap: true, density: D3_JEEP_TPM });
}

/** Canvas (seats, kit bag): woven texture, stitched seams, wet dark patches. 32 × 32 wrap. */
export function d3CanvasTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3canvas|${h6(o.hex)}`, 32, 32, (c, k) => {
    const f = k.ramp(o.hex, { light: 0.42 });
    c.rect(0, 0, 32, 32, f, (x, y) => ((x + y) % 2 === 0 ? 3.2 : 2.8));
    for (let x = 0; x < 32; x += 2) c.set(x, 15, f, 1.6);
    c.hline(0, 16, 32, f, 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (smooth(x, y, 32, 32, 4, 9) < 0.28) c.shift(x, y, -0.8);
  }, { wrap: true, density: D3_JEEP_TPM });
}

/** Jerry can red (32 × 32 wrap): worn enamel, the X emboss, chips. */
export function d3JerryTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3jerry|${h6(o.hex)}`, 32, 32, (c, k) => {
    const r = k.ramp(o.hex, { light: 0.45, sat: 1.0 });
    const st = k.ramp(0x8a8a86, { light: 0.5, sat: 0.6 });
    c.rect(0, 0, 32, 32, r, 3);
    for (let i = 0; i < 32; i++) {
      c.set(i, i, r, 4.2);
      c.set(i, wrap(i + 1, 32), r, 2);
      c.set(31 - i, i, r, 4.2);
      c.set(31 - i, wrap(i + 1, 32), r, 2);
    }
    c.scatter(k.rng, 0, 0, 32, 32, 12, st, 3.6, { shapes: 3 });
  }, { wrap: true, density: D3_JEEP_TPM });
}

/** The park emblem decal (module 32 × 32, cut out round the disc), worn. */
export function d3EmblemDecal(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3emblemdecal`, 32, 32, (c, k) => {
    d1Emblem(c, k, 16, 16, 15.5);
    c.scatter(k.rng, 4, 4, 24, 24, 9, 0, -1, { shapes: 3 });
  });
}

/**
 * A painted steel tube (wrap 16 × 128 at D3_JEEP_TPM, u once round the tube; `pwCylinder` lays
 * u = 0 on the basis' first direction — screen-left for the roll hoop's posts seen from the gun,
 * the top for a tube lying across): a 2-texel highlight column, the mid core, a dark rim column
 * underneath, a few chips placed by rule along it (never a rhythm) and one rust run from a weld.
 */
export function d3TubeTile(atlas: PwAtlas, o: { hex: number; primer: number }): PwTile {
  return atlas.tile(`d3tube|${h6(o.hex)}|${h6(o.primer)}`, 16, 128, (c, k) => {
    const p = k.ramp(o.hex, { light: 0.5, sat: 0.7 });
    const pr = k.ramp(o.primer, { light: 0.4 });
    const rust = k.ramp(0x7a3a1c, { light: 0.42 });
    // Round the tube: 0–1 highlight, the core, 7–10 the dark underside, back up to the far side.
    const tone = [4.4, 4.4, 3.6, 3, 3, 3, 2.6, 2, 1.4, 1.4, 1.8, 2.2, 2.6, 3, 3, 3.6];
    for (let y = 0; y < 128; y++) for (let x = 0; x < 16; x++) c.set(x, y, p, tone[x]);
    // Chips: three, on the lit face, at hand-picked heights; each a primer fleck with a dark lower lip.
    for (const [x, y] of [[3, 19], [4, 61], [2, 97]]) {
      c.set(x, y, pr, 3.4);
      c.set(x + 1, y, pr, 3);
      c.set(x, y + 1, p, 1.8);
    }
    // One rust run from the weld at the tile's start, down the underside.
    for (let y = 0; y < 22; y++) if (y < 12 || bayer(8, y) > (y - 12) / 10) c.tint(8 + (y > 9 ? 1 : 0), y, rust, -0.2);
    c.set(9, 0, rust, 2);
    c.set(10, 1, rust, 2.4);
  }, { wrap: true, density: D3_JEEP_TPM });
}

/**
 * A square steel bar's face (wrap 16 × 64, u ACROSS the face — laid at exactly 16 texels across —,
 * v along the bar): a lit bevel down the left edge, a calm core, the shaded right bevel; two
 * small chips and a short scuff placed by rule (no hashed dashes).
 */
export function d3BarTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3bar|${h6(o.hex)}`, 16, 64, (c, k) => {
    const p = k.ramp(o.hex, { light: 0.5, sat: 0.7 });
    const tone = [4, 3.6, 3.2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2.8, 2.4, 1.8, 1.4];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) c.set(x, y, p, tone[x]);
    for (const [x, y] of [[5, 13], [9, 44]]) {
      c.set(x, y, p, 4);
      c.set(x + 1, y + 1, p, 1.8);
    }
    for (let j = 0; j < 4; j++) c.set(6 + j, 30 + (j >> 1), p, 3.6);
  }, { wrap: true, density: D3_JEEP_TPM });
}

/**
 * The cabin sill's hazard edge (wrap 32 × 16 at D3_JEEP_TPM): yellow / black diagonal bands 8 texels
 * wide (whole through the first levels at the lens), a lit leading edge, boot scuffs worn into the
 * yellow, grit in the black.
 */
export function d3SillTile(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3sill`, 32, 16, (c, k) => {
    const yl = k.ramp(0xe0b020, { light: 0.45, sat: 1.05 });
    const ink = k.ramp(0x1a1a1e, { light: 0.4 });
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 32; x++) {
        const band = ((x + y) >> 3) & 1;
        c.set(x, y, band ? ink : yl, band ? 1.4 : y === 0 ? 4 : 3);
      }
    }
    // Scuffs (2 × 2: kept by the levels) in the yellow, grit in the black.
    for (const [x, y] of [[4, 6], [20, 10], [12, 2]]) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (c.at(x + dx, y + dy) === yl) c.set(x + dx, y + dy, yl, 2.2);
    for (const [x, y] of [[10, 12], [27, 4]]) if (c.at(x, y) === ink) c.set(x, y, ink, 2.6);
  }, { wrap: true, density: D3_JEEP_TPM });
}

/**
 * The hood's one marking (module 48 × 48, cut out, strokes on a 2- / 4-texel grid from the bottom:
 * whole at the hood's grazing level 1–2): RANGER in 2-texel strokes over a big 12 in 4-texel
 * strokes, stencilled in cream, lightly worn in 2 × 2 flecks.
 */
export function d3HoodMarking(atlas: PwAtlas, o: { ink: number }): PwTile {
  return atlas.tile(`d3hoodmark2|${h6(o.ink)}`, 48, 48, (c, k) => {
    const ink = k.ramp(o.ink, { light: 0.35, sat: 0.8 });
    const tw = textWidth('RANGER', FONT_3x5, { scale: 2 });
    drawText(c, 'RANGER', Math.round((48 - tw) / 4) * 2, 2, FONT_3x5, ink, 3.2, { scale: 2 });
    const tw2 = textWidth('12', FONT_BOLD, { scale: 4 });
    drawText(c, '12', Math.round((48 - tw2) / 8) * 4, 16, FONT_BOLD, ink, 3.4, { scale: 4 });
    for (let y = 0; y < 48; y += 2) for (let x = 0; x < 48; x += 2) if (c.at(x, y) && hash2(x >> 1, y >> 1, 7) > 0.9) for (let q = 0; q < 4; q++) c.set(x + (q & 1), y + (q >> 1), 0, 0);
  });
}

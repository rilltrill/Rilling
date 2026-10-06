import { bayer } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_BOLD } from './font';
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
export function d3SteelTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3steel|${h6(o.hex)}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.55, sat: 0.6 });
    const rust = k.ramp(0x7a3a1c, { light: 0.4 });
    c.rect(0, 0, 32, 32, s, (x, y) => (hash2(x >> 3, y, 3) > 0.8 ? 3.6 : hash2(x >> 2, y >> 3, 4) > 0.85 ? 2.4 : 3));
    for (let i = 0; i < 8; i++) {
      const x = rng.int(0, 31);
      const y = rng.int(0, 31);
      for (let j = 0; j < rng.int(3, 7); j++) c.set(wrap(x + j, 32), y, s, 4.6);
    }
    for (let i = 0; i < 4; i++) c.cluster(rng.int(0, 30), rng.int(0, 30), i, rust, 2.6);
    for (let i = 0; i < 10; i++) {
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

/** Stencilled hood marking (module 96 × 16, cut out): RANGER and the car number, worn through. */
export function d3HoodStencil(atlas: PwAtlas, o: { ink: number }): PwTile {
  return atlas.tile(`d3hoodstencil|${h6(o.ink)}`, 96, 16, (c, k) => {
    const ink = k.ramp(o.ink, { light: 0.35 });
    drawText(c, 'PARK RANGER', 2, 9, FONT_3x5, ink, 3.4);
    drawText(c, '12', 66, 1, FONT_BOLD, ink, 3.6);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 96; x++) if (c.at(x, y) && (hash2(x, y, 7) > 0.84 || bayer(x, y) > 0.97)) c.set(x, y, 0, 0);
  });
}

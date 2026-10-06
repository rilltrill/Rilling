import { bayer } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_BOLD } from './font';
import { hash2, smooth } from './surfaces';
import { d1Emblem } from './d1Tiles';

/**
 * The park jeep (JUNGLE RUN's first-person vehicle) for ART: PIXEL WORLD —
 * painted at JEEP_TPM (it sits a metre or two from the eye, so its texels
 * match the cast's sprites up close): weathered olive drab over riveted
 * panels with the khaki primer and bare steel showing through chips and
 * scratches, caked mud on the wings, diamond-plate floor, gunmetal, a red
 * jerry can, the park emblem and a stencilled hood number.
 */

/** Texels per metre on the jeep (a view model: denser than the world's 32). */
export const JEEP_TPM = 48;

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Olive drab panel: faded patches, rivet seams, chips to primer / bare steel, scratches, mud flecks. 64 × 64 wrap. */
export function d1JeepPaintTile(atlas: PwAtlas, o: { hex: number; primer: number; steel: number; mud: number; rivets?: boolean }): PwTile {
  return atlas.tile(`d1jeeppaint|${h6(o.hex)}|${o.rivets === false ? 0 : 1}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(o.hex, { light: 0.42, sat: 0.95 });
    const pr = k.ramp(o.primer, { light: 0.4 });
    const st = k.ramp(o.steel, { light: 0.55, sat: 0.6 });
    const mud = k.ramp(o.mud, { light: 0.4 });
    // Sun-faded paint in broad drifts (one step lighter, dithered seams).
    c.rect(0, 0, 64, 64, p, (x, y) => {
      const n = smooth(x, y, 64, 64, 3, 5);
      return n > 0.66 ? (bayer(x, y) < (n - 0.66) * 6 ? 3.6 : 3) : n < 0.25 ? 2.6 : 3;
    });
    if (o.rivets !== false) {
      // A seam every 32 texels with a rivet row beside it.
      for (let y = 0; y < 64; y += 32) {
        c.hline(0, y, 64, p, 1.6);
        c.hline(0, y + 1, 64, p, 3.8);
        for (let x = 3; x < 64; x += 6) {
          c.set(x, y + 3, p, 4.6);
          c.set(x + 1, y + 4, p, 1.4);
        }
      }
    }
    // Chips: primer showing, bare steel in the middle of the bigger ones, a dark rim under them.
    for (let i = 0; i < 26; i++) {
      const x = rng.int(0, 63);
      const y = rng.int(0, 63);
      const big = rng.chance(0.35);
      const s = rng.int(0, 9);
      c.cluster(x, y, s, pr, 3.4);
      if (big) {
        c.cluster(wrap(x + 1, 64), wrap(y + 1, 64), s + 3, pr, 3);
        c.set(wrap(x + 1, 64), y, st, 4.4);
      }
      c.shift(x, wrap(y + 2, 64), -0.8);
    }
    // Scratches: short lit lines through the paint.
    for (let i = 0; i < 10; i++) {
      const x = rng.int(0, 63);
      const y = rng.int(0, 63);
      const len = rng.int(3, 9);
      const dy = rng.chance(0.5) ? 0 : rng.chance(0.5) ? 1 : -1;
      for (let j = 0; j < len; j++) c.set(wrap(x + j, 64), wrap(y + Math.round((j * dy) / 3), 64), st, 4);
    }
    // Mud flecks.
    for (let i = 0; i < 14; i++) c.cluster(rng.int(0, 63), rng.int(0, 63), i, mud, rng.chance(0.5) ? 3 : 2.4);
  }, { wrap: true, density: JEEP_TPM });
}

/** Caked mud on the wings / sills: lumps with lit tops, cracks, the olive showing in gaps. 32 × 32 wrap. */
export function d1JeepMudTile(atlas: PwAtlas, o: { hex: number; under: number }): PwTile {
  return atlas.tile(`d1jeepmud|${h6(o.hex)}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const m = k.ramp(o.hex, { light: 0.4 });
    const u = k.ramp(o.under, { light: 0.4 });
    c.rect(0, 0, 32, 32, m, (x, y) => (smooth(x, y, 32, 32, 4, 3) < 0.3 ? 2.2 : 3));
    for (let i = 0; i < 22; i++) {
      const x = rng.int(0, 31);
      const y = rng.int(0, 31);
      const r = rng.int(1, 3);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) c.set(wrap(x + dx, 32), wrap(y + dy, 32), m, dy < 0 ? 4 : dy > 0 ? 2.4 : 3.3);
    }
    for (let i = 0; i < 6; i++) c.cluster(rng.int(0, 30), rng.int(0, 30), i, u, 3);
  }, { wrap: true, density: JEEP_TPM });
}

/** Gunmetal / bare steel: brushed lines, worn bright edges, scratches, a little rust. 32 × 32 wrap. */
export function d1SteelTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d1steel|${h6(o.hex)}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.55, sat: 0.6 });
    const rust = k.ramp(0x7a3a1c, { light: 0.4 });
    c.rect(0, 0, 32, 32, s, (x, y) => (hash2(x >> 3, y, 3) > 0.8 ? 3.6 : 3));
    for (let i = 0; i < 8; i++) {
      const x = rng.int(0, 31);
      const y = rng.int(0, 31);
      for (let j = 0; j < rng.int(3, 7); j++) c.set(wrap(x + j, 32), y, s, 4.6);
    }
    for (let i = 0; i < 4; i++) c.cluster(rng.int(0, 30), rng.int(0, 30), i, rust, 2.6);
    c.scatter(rng, 0, 0, 32, 32, 10, 0, -0.8, { shapes: 3 });
  }, { wrap: true, density: JEEP_TPM });
}

/** Diamond tread plate (the bed floor): raised lit diamonds in a herringbone, mud in the corners. 32 × 32 wrap. */
export function d1TreadPlateTile(atlas: PwAtlas, o: { hex: number; mud: number }): PwTile {
  return atlas.tile(`d1treadplate|${h6(o.hex)}`, 32, 32, (c, k) => {
    const s = k.ramp(o.hex, { light: 0.55, sat: 0.6 });
    const mud = k.ramp(o.mud, { light: 0.4 });
    c.rect(0, 0, 32, 32, s, 2.6);
    for (let y = 0; y < 32; y += 4) {
      for (let x = 0; x < 32; x += 8) {
        const off = (y >> 2) % 2 ? 4 : 0;
        const dx = x + off;
        const up = ((y >> 2) + (x >> 3)) % 2 === 0;
        for (let j = 0; j < 3; j++) {
          c.set(wrap(dx + j, 32), wrap(y + (up ? 2 - j : j), 32), s, j === 0 ? 4.4 : 3.6);
          c.set(wrap(dx + j + 1, 32), wrap(y + (up ? 3 - j : j + 1), 32), s, 1.4);
        }
      }
    }
    c.scatter(k.rng, 0, 0, 32, 32, 16, mud, 2.6, { shapes: 6 });
  }, { wrap: true, density: JEEP_TPM });
}

/** Jerry can red: worn enamel, the X emboss, a white stencil stripe. 32 × 32 wrap. */
export function d1JerryTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d1jerry|${h6(o.hex)}`, 32, 32, (c, k) => {
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
  }, { wrap: true, density: JEEP_TPM });
}

/** The park emblem decal (module 32 × 32, cut out round the disc). */
export function d1EmblemDecal(atlas: PwAtlas): PwTile {
  return atlas.tile(`d1emblemdecal`, 32, 32, (c, k) => {
    d1Emblem(c, k, 16, 16, 15.5);
    // Worn: a few chips through the decal.
    c.scatter(k.rng, 4, 4, 24, 24, 8, 0, -1, { shapes: 3 });
  });
}

/** Stencilled hood marking (module 96 × 16, cut out): PRIMAL ISLAND and the car number, worn. */
export function d1HoodStencil(atlas: PwAtlas, o: { ink: number }): PwTile {
  return atlas.tile(`d1hoodstencil|${h6(o.ink)}`, 96, 16, (c, k) => {
    const ink = k.ramp(o.ink, { light: 0.35 });
    drawText(c, 'PRIMAL ISLAND', 2, 9, FONT_3x5, ink, 3.4);
    drawText(c, '07', 64, 1, FONT_BOLD, ink, 3.6);
    // Worn stencil: gaps eaten out of the letters.
    for (let y = 0; y < 16; y++) for (let x = 0; x < 96; x++) if (c.at(x, y) && hash2(x, y, 7) > 0.84) c.set(x, y, 0, 0);
  });
}

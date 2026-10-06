import type { PwAtlas, PwTile } from './atlas';
import { D3_ANIM_FRAMES, d3Frames } from './d3Ground';
import { hash2 } from './surfaces';

/**
 * TYRANT CHASE (d3) trestle bridge and gorge for ART: PIXEL WORLD: rain-black
 * deck planks laid across the road (gaps, nail heads, worn tyre tracks, moss in
 * the seams), heavy creosoted timbers for the stringers, rails and the trestle
 * towers (checks, bolts, streaks), and white water churning round the rocks.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');

/**
 * Bridge deck (wrap 64 × 64, u across the road, v along it): wide rain-dark planks (16 texels,
 * half a metre) all on one ramp step, soft 2-texel seams one step down, staggered butt joints,
 * the grain as rare 2 × 2 dashes, nails and moss only as rare 2 × 2 clusters — calm under the
 * moving camera (few, low-contrast lines across the direction of travel).
 */
export function d3DeckTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3deck3|${h6(o.hex)}`, 64, 64, (c, k) => {
    const w = k.ramp(o.hex, { light: 0.42 });
    const moss = k.ramp(0x3f5a2e, { light: 0.42 });
    for (let y = 0; y < 64; y++) {
      const plank = y >> 4;
      const ly = y & 15;
      // A butt joint per plank, staggered.
      const joint = (plank * 23 + 9) % 64;
      for (let x = 0; x < 64; x++) {
        let t = 3;
        if (ly >= 14) t = 2;
        else if (x === joint || x === joint + 1) t = 2;
        else if (hash2(x >> 2, y >> 1, plank + 5) > 0.96) t = 2;
        c.set(x, y, w, t);
      }
    }
    // Nails (2 × 2, a step up) at two joists; moss (2 × 2) in a seam.
    for (const [x, y] of [[6, 6], [38, 22], [6, 38], [38, 54]]) c.rect(x, y, 2, 2, w, 4);
    c.rect(22, 14, 4, 2, moss, 2.2);
  }, { wrap: true });
}

/** Creosoted timber (wrap 32 × 64, the grain along v): dark tarred wood, checks, bolt plates, rain streaks. */
export function d3TimberTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3timber|${h6(o.hex)}`, 32, 64, (c, k) => {
    const rng = k.rng;
    const w = k.ramp(o.hex, { light: 0.42 });
    const st = k.ramp(0x3a3e44, { light: 0.5, sat: 0.6 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) c.set(x, y, w, x % 8 === 0 ? 2.2 : hash2(x, y >> 3, 3) > 0.85 ? 2.6 : (x + (y >> 2)) % 11 === 0 ? 3.6 : 3);
    // Checks (splits along the grain).
    for (let i = 0; i < 5; i++) {
      const x = rng.int(1, 30);
      const y0 = rng.int(0, 50);
      for (let j = 0; j < rng.int(6, 14); j++) c.set(x + (j % 5 === 4 ? 1 : 0), y0 + j, w, 0.8);
    }
    // A bolt plate.
    c.rect(10, 28, 10, 8, st, 2.8);
    c.hline(10, 28, 10, st, 4.2);
    for (const [x, y] of [[12, 30], [17, 33]]) c.set(x, y, st, 4.6);
    for (let i = 0; i < 4; i++) c.streak(rng, rng.int(0, 31), 36, rng.int(6, 14), -0.6, 0);
  }, { wrap: true });
}

/** White water round a rock (animated module 64 × 24 a frame, cut out): foam churning, flecks breaking off downstream. */
export function d3FoamModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  const F = D3_ANIM_FRAMES;
  const W = 64;
  const FH = 24;
  return atlas.tile(`d3foam|${h6(o.hex)}|${F}`, W, FH * F, (c, k) => {
    const fm = k.ramp(o.hex, { light: 0.35, sat: 0.6 });
    d3Frames(c, F, (x, vt, f, y) => {
      const ly = FH - 1 - vt;
      const u = (x + 0.5 - W / 2) / (W / 2);
      const v = (ly + 0.5 - FH / 2) / (FH / 2);
      const d = u * u + v * v * 1.6;
      const n = hash2((x + f * 3) >> 1, ly >> 1, 7);
      if (d > 1 || n < d * 0.9) return;
      c.set(x, y, fm, n > 0.8 ? 4.4 : n > 0.5 ? 3.6 : 2.6);
    });
  });
}

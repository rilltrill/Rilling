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

/** Bridge deck (wrap 64 × 64, u across the road, v along it): planks across with dark gaps, nail rows, tyre-worn tracks, moss in the seams. */
export function d3DeckTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3deck|${h6(o.hex)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const w = k.ramp(o.hex, { light: 0.42 });
    const moss = k.ramp(0x3f5a2e, { light: 0.42 });
    for (let y = 0; y < 64; y++) {
      const plank = y >> 3;
      const ly = y & 7;
      const pt = hash2(plank, 0, 3) > 0.6 ? 3.2 : hash2(plank, 1, 3) > 0.7 ? 2.6 : 2.9;
      for (let x = 0; x < 64; x++) {
        let t = pt;
        if (ly === 7) t = 0.8;
        else if (ly === 0) t = pt + 0.8;
        else if (hash2(x >> 3, y, plank + 5) > 0.88) t -= 0.6; // grain
        // Tyre-worn tracks: smoother, a touch lighter.
        if ((x > 10 && x < 20) || (x > 42 && x < 52)) t += ly > 0 && ly < 7 ? 0.3 : 0;
        c.set(x, y, w, t);
      }
      // Nails at the joists.
      if (ly === 3) for (const x of [4, 30, 58]) c.set(x, y, w, 4.6);
      // (Moss only as whole short runs in the seams: lone mid-tone specks would win the coarser levels.)
      if (ly === 7 && plank % 3 === 1) for (let x = 20; x < 28; x++) c.set(x, y, moss, 1.2);
    }
    for (let i = 0; i < 6; i++) c.streak(rng, rng.int(0, 63), rng.int(0, 63), rng.int(4, 10), -0.7, 0);
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

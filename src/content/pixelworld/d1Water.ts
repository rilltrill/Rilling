import { bayer, PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2, smooth } from './surfaces';

/**
 * JUNGLE RUN (d1) water for ART: PIXEL WORLD, painted as animated strips
 * (`pwMaterial(atlas, { anim: { frames: D1_WATER_FRAMES, fps } })`: every
 * tile drawn with that material is D1_WATER_FRAMES frames stacked vertically,
 * frame 0 at the bottom). Like SNES / arcade water: a calm teal body, broad
 * darker troughs, short lit ripple dashes (a dark dash under each crest), sun
 * glints — two layers drifting at different speeds so it shimmers instead of
 * sliding. Plus the bank (static), the white-water edge, the waterfall sheet
 * and the churning splash at its foot.
 */

/** Frames of every d1 animated water tile (one material plays them all). */
export const D1_WATER_FRAMES = 8;

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Paint `frames` frames of a pattern `p(c, x, vt, f, y)` (vt = texture row within the frame, 0 = its bottom). */
function frames(c: PwCanvas, F: number, paint: (x: number, vt: number, f: number, y: number) => void) {
  const FH = c.h / F;
  for (let f = 0; f < F; f++) {
    const y0 = c.h - (f + 1) * FH;
    for (let yl = 0; yl < FH; yl++) {
      const vt = FH - 1 - yl;
      for (let x = 0; x < c.w; x++) paint(x, vt, f, y0 + yl);
    }
  }
}

/**
 * River surface (wrap 64 × 64 a frame: 2 × 2 m; v = downstream). Ripple
 * dashes ride the current 8 texels a frame, the trough pattern 4 a frame.
 */
export function d1WaterTile(atlas: PwAtlas, o: { hex: number; deep: number }): PwTile {
  const F = D1_WATER_FRAMES;
  return atlas.tile(`d1water|${h6(o.hex)}|${h6(o.deep)}|${F}`, 64, 64 * F, (c, k) => {
    const w = k.ramp(o.hex, { light: 0.55, sat: 1.05 });
    const d = k.ramp(o.deep, { light: 0.45, sat: 1.05 });
    const FH = 64;
    // Precomputed ripple field (one frame's worth, rows wrap): crest dashes along u.
    const TW = 64;
    const crest = new Uint8Array(TW * FH);
    for (let i = 0; i < 55; i++) {
      const x = Math.floor(hash2(i, 1, 3) * TW);
      const y = Math.floor(hash2(i, 2, 3) * FH);
      const len = 2 + Math.floor(hash2(i, 3, 3) * 6);
      for (let j = 0; j < len; j++) {
        crest[y * TW + ((x + j) & (TW - 1))] = j === 0 || j === len - 1 ? 1 : 2;
        crest[((y + 1) % FH) * TW + ((x + j) & (TW - 1))] = 3; // the dark trough under the crest
      }
    }
    const glint = new Uint8Array(TW * FH);
    for (let i = 0; i < 7; i++) glint[Math.floor(hash2(i, 5, 3) * FH) * TW + Math.floor(hash2(i, 6, 3) * TW)] = 1;
    frames(c, F, (x, vt, f, y) => {
      // Troughs: broad darker bands across the flow (period 32 rows, 4 a frame), dithered edges.
      const v2 = wrap(vt - f * 4, 32);
      const n = smooth(x, v2, TW, 32, 2, 7);
      let t = 3;
      let r = w;
      if (n < 0.34) {
        r = d;
        t = n < 0.24 ? 3 : bayer(x, v2) < (0.34 - n) * 10 ? 3 : 3.4;
        if (t === 3.4) r = w;
      }
      // Ripples: 8 texels a frame — a lit crest dash over a dark trough dash.
      const v1 = wrap(vt - f * 8, FH);
      const cr = crest[(FH - 1 - v1) * TW + x];
      if (cr === 1) t = 3.8;
      else if (cr === 2) t = 4.4;
      else if (cr === 3) t = 2;
      if (glint[(FH - 1 - v1) * TW + x] && (f + x) % 3 !== 0) {
        r = w;
        t = 5;
      }
      c.set(x, y, r, t);
    });
  }, { wrap: true });
}

/** White water along a bank (wrap 16 × 32 a frame, cut out): lapping foam clusters riding the current. */
export function d1FoamEdgeTile(atlas: PwAtlas, o: { hex: number; mirror?: boolean }): PwTile {
  const F = D1_WATER_FRAMES;
  return atlas.tile(`d1foam|${h6(o.hex)}|${F}|${o.mirror ? 1 : 0}`, 16, 32 * F, (c, k) => {
    const fm = k.ramp(o.hex, { light: 0.35, sat: 0.6 });
    frames(c, F, (xx, vt, f, y) => {
      const x = o.mirror ? 15 - xx : xx;
      const v = wrap(vt - f * 4, 32);
      // Thicker toward the bank (x = 0), breaking into clusters toward the water.
      const lap = 5 + Math.sin(((v + f * 2) / 32) * Math.PI * 4) * 2 + hash2(x, v >> 1, 3) * 3;
      if (x > lap) return;
      if (x > lap - 2 && bayer(x, v) < 0.5) return;
      c.set(xx, y, fm, x < 2 ? 2.8 : hash2(x >> 1, v >> 1, 5) > 0.6 ? 4.4 : 3.6);
    });
  }, { wrap: true });
}

/** Waterfall sheet (wrap 64 × 32 a frame): pale ropes of water falling 8 texels a frame, dark gaps, foam beads. */
export function d1FallTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  const F = D1_WATER_FRAMES;
  return atlas.tile(`d1fall|${h6(o.hex)}|${F}`, 64, 32 * F, (c, k) => {
    const w = k.ramp(o.hex, { light: 0.45, sat: 0.9 });
    // Ropes: columns with their own tone and wobble.
    const rope = new Float32Array(64);
    for (let x = 0; x < 64; x++) rope[x] = smooth(x, 0, 64, 4, 8, 3);
    frames(c, F, (x, vt, f, y) => {
      const v = wrap(vt + f * 8, 32);
      const r = rope[x];
      let t = r > 0.62 ? 4 : r > 0.4 ? 3.2 : 2.2;
      // Streaks falling: bright dashes 3-8 long in each rope.
      const s = hash2(x, v >> 2, 9);
      if (s > 0.8 && (v & 3) < 3) t = 4.8;
      else if (s < 0.12) t = 2;
      c.set(x, y, w, t);
    });
  }, { wrap: true });
}

/** Splash / spray where the fall hits the pool (module 64 × 32 a frame, cut out): churning foam heaps, flying droplets. */
export function d1SplashModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  const F = D1_WATER_FRAMES;
  return atlas.tile(`d1splash|${h6(o.hex)}|${F}`, 64, 32 * F, (c, k) => {
    const fm = k.ramp(o.hex, { light: 0.35, sat: 0.6 });
    frames(c, F, (x, vt, f, y) => {
      // Heap: a lumpy mound whose crest boils frame to frame.
      const u = (x + 0.5) / 64;
      const crest = 12 + Math.sin(u * Math.PI) * 13 + Math.sin(u * 23 + f * 1.7) * 2 + Math.sin(u * 51 - f * 2.3) * 1.5;
      if (vt > crest) {
        // Droplets above the heap.
        if (hash2(x, (vt + f * 5) >> 1, 11) > 0.97 && vt < crest + 6) c.set(x, y, fm, 4.6);
        return;
      }
      const lump = smooth(x + f * 3, vt + f * 4, 64, 32, 4, 13);
      const edge = crest - vt < 2;
      c.set(x, y, fm, edge ? 4.8 : lump > 0.6 ? 4.2 : lump < 0.3 ? 2.6 : 3.4);
    });
  });
}

/**
 * A torch flame (module 16 × 24 a frame, cut out, unlit GLOW): a licking tongue
 * of fire — white-yellow core, orange body, red tips — its tips flickering
 * frame to frame, a spark or two. Shares the water's frame count and clock.
 */
export function d1FlameModule(atlas: PwAtlas): PwTile {
  const F = D1_WATER_FRAMES;
  return atlas.tile(`d1flame|${F}`, 16, 24 * F, (c, k) => {
    const fire = k.ramp(0xff7a1a, { light: 0.6, sat: 1.1 });
    const core = k.ramp(0xffd860, { light: 0.6, sat: 1.0 });
    const red = k.ramp(0xd8301a, { light: 0.5, sat: 1.1 });
    frames(c, F, (x, vt, f, y) => {
      const u = (x + 0.5 - 8) / 8;
      const h = vt / 24;
      // Width narrows upward; the tongue sways and its tip length flickers.
      const sway = Math.sin(h * 5 + f * 1.3) * 0.18 * h;
      const half = (1 - h) * (0.85 + Math.sin(f * 2.1 + h * 3) * 0.08);
      const top = 0.78 + Math.sin(f * 1.7) * 0.12 + hash2(x, f, 3) * 0.08;
      if (h > top || Math.abs(u - sway) > half) {
        if (h > top && h < top + 0.15 && hash2(x, vt + f * 7, 5) > 0.93) c.set(x, y, core, 5, PWF.GLOW);
        return;
      }
      const d = Math.abs(u - sway) / Math.max(0.05, half);
      const r = d < 0.4 && h < 0.6 ? core : h > top - 0.18 ? red : fire;
      c.set(x, y, r, r === core ? 5 : d > 0.75 ? 3 : 4, PWF.GLOW);
    });
  });
}

/**
 * River bank (wrap 80 × 128: 2.5 m across × 4 m along; u = 0 the land side, cut
 * out in a ragged grass fringe, u = 80 the waterline): grass, dry earth with
 * exposed roots, a band of pebbles and coarse sand, dark wet mud with a lit
 * wet sheen at the water. `mirror` paints it the other way round (the land on
 * the right) for the opposite bank.
 */
export function d1BankTile(atlas: PwAtlas, o: { earth: number; sand: number; mud: number; grass: number; stone: number; mirror?: boolean }): PwTile {
  return atlas.tile(`d1bank|${h6(o.earth)}|${h6(o.sand)}|${o.mirror ? 1 : 0}`, 80, 128, (c, k) => paintBank(c, k, o), { wrap: true });
}

function paintBank(c: PwCanvas, k: PwKit, o: { earth: number; sand: number; mud: number; grass: number; stone: number; mirror?: boolean }) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const earth = k.ramp(o.earth, { light: 0.4 });
  const sand = k.ramp(o.sand, { light: 0.4, sat: 0.9 });
  const mud = k.ramp(o.mud, { light: 0.42 });
  const grass = k.ramp(o.grass, { light: 0.45, sat: 1.05 });
  const stone = k.ramp(o.stone, { light: 0.45, sat: 0.6 });
  const X = (u: number) => (o.mirror ? W - 1 - u : u);
  for (let y = 0; y < H; y++) {
    const gEdge = 14 + (smooth(0, y, 8, H, 8, 21) - 0.5) * 12;
    const sEdge = 40 + (smooth(2, y, 8, H, 8, 22) - 0.5) * 12;
    const mEdge = 62 + (smooth(4, y, 8, H, 8, 23) - 0.5) * 8;
    for (let u = 0; u < W; u++) {
      const x = X(u);
      if (u < gEdge) {
        if (u < gEdge - 8 && hash2(x, y >> 1, 3) > 0.45) continue;
        c.set(x, y, grass, (x + y * 3) % 5 === 0 ? 4.3 : hash2(x, y, 9) > 0.7 ? 2.2 : 3.2);
      } else if (u < sEdge) c.set(x, y, earth, u < gEdge + 3 ? 2 : smooth(u, y, W, H, 8, 5) > 0.6 ? 3.6 : 3);
      else if (u < mEdge) c.set(x, y, sand, bayer(u, y) < 0.15 ? 2.4 : smooth(u, y, W, H, 8, 6) > 0.55 ? 3.8 : 3);
      else c.set(x, y, mud, u > W - 4 ? 4.2 : u > W - 6 ? 1.4 : u < mEdge + 2 ? 2 : 2.6);
    }
  }
  // Exposed roots in the earth band.
  for (let i = 0; i < 5; i++) {
    let u = rng.int(16, 34);
    let y = rng.int(0, H - 1);
    for (let j = 0; j < rng.int(8, 18); j++) {
      c.set(X(u), wrap(y, H), earth, 0.8);
      c.set(X(u), wrap(y + 1, H), earth, 4);
      u += rng.chance(0.6) ? 1 : 0;
      y += rng.chance(0.5) ? 1 : -1;
    }
  }
  // Pebbles (sand band) and a few cobbles in the mud.
  for (let i = 0; i < 70; i++) {
    const u = rng.int(36, 70);
    const y = rng.int(0, H - 1);
    const big = rng.chance(0.25);
    c.set(X(u), y, stone, 4.4);
    c.set(X(u + 1), y, stone, 3.2);
    c.set(X(u + 1), wrap(y + 1, H), stone, 1.8);
    if (big) {
      c.set(X(u), wrap(y + 1, H), stone, 3.2);
      c.set(X(u + 2), wrap(y + 1, H), stone, 1.8);
      c.set(X(u + 2), y, stone, 3.2);
    }
  }
  // Reeds at the waterline: a few dark stalks (the billboards do the big ones).
  for (let i = 0; i < 10; i++) {
    const u = rng.int(56, 64);
    const y = rng.int(0, H - 1);
    for (let j = 0; j < 3; j++) c.set(X(u), wrap(y - j, H), grass, j === 2 ? 4 : 2.6);
  }
}

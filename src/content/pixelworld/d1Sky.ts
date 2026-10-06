import { PWF, PW_BACKDROP_TPD, type PwCanvas } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { hash2, smooth } from './surfaces';

/**
 * JUNGLE RUN (d1) panorama painters for ART: PIXEL WORLD — the day sky and
 * the jungle ranges painted straight into the canvas arrays (one pass, per-row
 * and per-column work hoisted out of the texel loops: the whole panorama paints
 * in a fraction of the generic painters' time), with d1's own look:
 *  - SKY: banded blue climbing from the fog-coloured horizon haze (ordered
 *    dither only on the seams), sunlit cumulus with flat blue-grey bellies;
 *  - RANGE: a ridge of canopy crowns over rock, flanks lit toward the sun with
 *    the light / shade divide wandering down gullies, tree clumps, and a haze
 *    that thickens toward the foot until it IS the fog colour — the fogged
 *    trees of the stage melt into it instead of standing out as pale cut-outs.
 */

const TW = 2048;
const h6 = (n: number) => n.toString(16).padStart(6, '0');
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Rows for a band of `deg` degrees (multiple of 16). */
export function d1RowsFor(deg: number): number {
  return Math.max(16, Math.round((deg * PW_BACKDROP_TPD) / 16) * 16);
}

const colOf = (az: number) => Math.round((((az % 360) + 360) % 360) * (TW / 360));

export interface D1SkyOpts {
  horizon: number;
  top: number;
  el0: number;
  el1: number;
  sunAz: number;
  clouds: number;
  haze: number;
}

/** The day sky band (wrap 2048 × rows). */
export function d1SkyTile(atlas: PwAtlas, o: D1SkyOpts): PwTile {
  const H = d1RowsFor(o.el1 - o.el0);
  return atlas.tile(`d1sky|${h6(o.horizon)}|${h6(o.top)}|${o.el0}|${o.el1}|${o.sunAz}|${o.clouds}|${o.haze}`, TW, H, (c, k) => {
    const rng = k.rng;
    const top = k.ramp(o.top, { light: 0.5, dark: 0.6 });
    const hz = k.ramp(o.horizon, { light: 0.4, dark: 0.75 });
    const cl = k.ramp(0xe8eef2, { light: 0.4, dark: 0.55, sat: 0.7 });
    const R = c.ramp;
    const T = c.tone;
    const F = c.flag;
    for (let y = 0; y < H; y++) {
      const el = o.el1 - ((y + 0.5) / H) * (o.el1 - o.el0);
      const blue = Math.min(1, Math.max(0, (el - o.haze + 3) / 6));
      const tHz = 3 + Math.min(1, Math.max(0, el) / o.haze);
      const tTop = Math.max(2, 4 - Math.max(0, el - o.haze) / 14);
      const row = y * TW;
      const b0 = (y & 3) * 4;
      for (let x = 0; x < TW; x++) {
        const i = row + x;
        const useHz = blue < 1 && BAYER[b0 + (x & 3)] >= blue;
        R[i] = useHz ? hz : top;
        T[i] = useHz ? tHz : tTop;
        F[i] = PWF.DITHER;
      }
    }
    const sunCol = colOf(o.sunAz);
    const n = Math.round(22 * o.clouds);
    for (let i = 0; i < n; i++) {
      const cx = rng.int(0, TW - 1);
      const el = rng.range(4, 24);
      const cy = Math.round(((o.el1 - el) / (o.el1 - o.el0)) * H);
      const w = rng.int(60, 200) * (1 - el / 60);
      const side = (sunCol - cx + TW) % TW > TW / 2 ? -1 : 1;
      cumulus(c, cl, cx, cy, w, rng.int(10, 24) * (1 - el / 60), side, rng.next() * 999);
    }
  }, { wrap: true });
}

/** Sunlit cumulus: puffs, bright tops toward the sun, shaded bellies, a flat base (bounding boxes per puff). */
function cumulus(c: PwCanvas, ramp: number, cx: number, base: number, w: number, h: number, side: number, seed: number) {
  const n = Math.max(3, Math.round(w / 18));
  const puffs: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = h * (0.5 + 0.7 * Math.sin(t * Math.PI)) * (0.75 + hash2(i, 2, seed) * 0.5);
    puffs.push([cx - w / 2 + t * w, base - r * 0.6, r]);
  }
  // Best light per texel over the puffs covering it (a small box: the cloud's bounds).
  const x0 = Math.floor(cx - w / 2 - h);
  const x1 = Math.ceil(cx + w / 2 + h);
  const y0 = Math.max(0, Math.floor(base - h * 2.2));
  const y1 = Math.min(c.h - 1, base);
  const bw = x1 - x0 + 1;
  const lit = new Float32Array(bw * (y1 - y0 + 1)).fill(-9);
  for (const [px, py, r] of puffs) {
    for (let y = Math.max(y0, Math.floor(py - r)); y <= Math.min(y1, Math.ceil(py + r)); y++) {
      const dy = y - py;
      const span = Math.sqrt(Math.max(0, r * r - dy * dy * 1.4));
      for (let x = Math.ceil(px - span); x <= Math.floor(px + span); x++) {
        const l = (-dy / r) * 0.75 + ((x - px) / r) * side * 0.45;
        const i = (y - y0) * bw + (x - x0);
        if (l > lit[i]) lit[i] = l;
      }
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const l = lit[(y - y0) * bw + (x - x0)];
      if (l < -1.5) continue;
      const t = y >= base - 1 ? 2 : l > 0.45 ? 5 : l > 0 ? 4 : l > -0.4 ? 3 : 2;
      c.set(((x % TW) + TW) % TW, y, ramp, t);
    }
  }
}

export interface D1RangeOpts {
  hex: number;
  haze: number;
  el0: number;
  el1: number;
  height: number;
  rough: number;
  lightAz: number;
  seed: number;
  /** Fraction of the band (from the foot) that is fully hazed (the fog colour). */
  fogFoot?: number;
}

/** A jungle range (wrap 2048 × rows, cut out above the ridge). */
export function d1RangeTile(atlas: PwAtlas, o: D1RangeOpts): PwTile {
  const H = d1RowsFor(o.el1 - o.el0);
  return atlas.tile(`d1range|${h6(o.hex)}|${h6(o.haze)}|${o.el0}|${o.el1}|${o.height}|${o.rough}|${o.lightAz}|${o.seed}|${o.fogFoot ?? 0}`, TW, H, (c, k) => {
    const rock = k.ramp(o.hex, { light: 0.4, sat: 0.9 });
    const haze = k.ramp(o.haze, { light: 0.35 });
    const seed = o.seed;
    const lightCol = colOf(o.lightAz);
    // Ridge (normalised), the bare slope, canopy crowns along the top.
    const bare = new Float32Array(TW);
    let rMax = 0;
    for (let x = 0; x < TW; x++) {
      const b = smooth(x, 0, TW, 8, 6, 31 + seed);
      const r = b * b * 1.6 * 0.6 + smooth(x, 0, TW, 8, 17, 32 + seed) * 0.28 + smooth(x, 0, TW, 8, 64, 33 + seed) * 0.12 * o.rough * 2;
      bare[x] = r;
      if (r > rMax) rMax = r;
    }
    for (let x = 0; x < TW; x++) bare[x] = H - 1 - Math.pow(bare[x] / rMax, 0.7) * (H - 6) * o.height;
    const ridge = bare.slice();
    const crownSide = new Int8Array(TW);
    for (let cx = 0; cx < TW; ) {
      const rad = 2 + Math.floor(hash2(cx, 1, 50 + seed) * 3);
      const top = bare[cx] + rad * 0.4;
      for (let dx = -rad; dx <= rad; dx++) {
        const x = (cx + dx + TW) % TW;
        const y = top - Math.sqrt(rad * rad - dx * dx);
        if (y < ridge[x]) {
          ridge[x] = y;
          crownSide[x] = dx < 0 ? -1 : 1;
        }
      }
      cx += rad + 1 + Math.floor(hash2(cx, 2, 51 + seed) * 3);
    }
    // Per column: lit flank (slope facing the light, smoothed over ±3), gully strength.
    const litCol = new Uint8Array(TW);
    const gully = new Float32Array(TW);
    for (let x = 0; x < TW; x++) {
      const toward = (lightCol - x + TW) % TW < TW / 2 ? 1 : -1;
      litCol[x] = ((bare[(x + 3) % TW] - bare[(x - 3 + TW) % TW]) / 3) * toward < -0.15 ? 1 : 0;
      gully[x] = smooth(x, 0, TW, 8, 90, 41 + seed);
    }
    // Per row: how far the light / shade divide wanders, the haze dither threshold.
    const wander = new Float32Array(H);
    for (let y = 0; y < H; y++) wander[y] = smooth(0, y, 8, H, 6, 45 + seed) - 0.5;
    const fogFoot = o.fogFoot ?? 0;
    const R = c.ramp;
    const T = c.tone;
    for (let x = 0; x < TW; x++) {
      const top = Math.max(0, Math.round(ridge[x]));
      const flank = Math.round(bare[x]);
      const towardLight = (lightCol - x + TW) % TW < TW / 2 ? 1 : -1;
      const crownLit = crownSide[x] === towardLight;
      const g = gully[x];
      for (let y = top; y < H; y++) {
        const depth = (y - top) / Math.max(1, H - top);
        const below = y - flank;
        // Down the face the divide wanders (spurs / gullies), never a straight slab.
        const xs = below > 1 ? (x + Math.round(wander[y] * Math.min(40, below * 1.2)) + TW) % TW : x;
        let t = litCol[xs] ? 3 : 2;
        if (y < flank) t = crownLit ? 4 : 3;
        if (y === top) t = litCol[x] || crownLit ? 4 : 3;
        if (g > 0.72 && ((y >> 2) + (x >> 3)) % 3 !== 0) t -= 1;
        // Tree clumps: a step up / down in 2×2 blocks.
        const hb = hash2(x >> 1, y >> 1, 7 + seed);
        if (depth > 0.04 && hb > 0.8) t += hb > 0.9 ? 1 : -1;
        const i = y * TW + x;
        // Haze thickening toward the foot; the lowest `fogFoot` of the band is the fog itself.
        const yb = (y + 0.5) / H;
        const hzK = fogFoot > 0 ? Math.max(0, (yb - (1 - fogFoot * 2)) / fogFoot) : depth > 0.62 ? (depth - 0.62) * 2 : 0;
        if (hzK > 0 && BAYER[(y & 3) * 4 + (x & 3)] < hzK) {
          R[i] = haze;
          T[i] = 3;
        } else {
          R[i] = rock;
          T[i] = t;
        }
      }
    }
  }, { wrap: true });
}

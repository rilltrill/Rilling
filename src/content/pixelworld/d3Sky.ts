import { PWF, PW_BACKDROP_TPD, type PwCanvas } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { hash2, smooth } from './surfaces';

/**
 * TYRANT CHASE (d3) panorama for ART: PIXEL WORLD — the storm over the park at
 * night, painted straight into the canvas arrays (per-row / per-column work
 * hoisted out of the texel loops):
 *  - SKY: near-black navy climbing from the fog-coloured horizon, a paler band
 *    where the rain curtains hang, towering storm clouds with moonlit rims and
 *    bruised violet bellies, rain shafts slanting down under their bases, the
 *    moon smothered behind a cloud bank (a glowing rim and a halo);
 *  - RANGES: the island's ridges — a far, hazy one (an optional volcano: a dull
 *    red crater glow and a plume lit from below) and a near one crowded with
 *    palm and canopy silhouettes — whose feet melt into the fog colour, where
 *    the fogged hills of the stage meet them;
 *  - BOLTS: three hand-drawn lightning forks (cut-out, glowing core and halo)
 *    for the storm's strikes.
 */

const TW = 2048;
const h6 = (n: number) => n.toString(16).padStart(6, '0');
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const colOf = (az: number) => Math.round((((az % 360) + 360) % 360) * (TW / 360));

/** Rows for a band of `deg` degrees (multiple of 16). */
export function d3RowsFor(deg: number): number {
  return Math.max(16, Math.round((deg * PW_BACKDROP_TPD) / 16) * 16);
}

export interface D3SkyOpts {
  /** The fog colour (the horizon band). */
  fog: number;
  horizon: number;
  top: number;
  cloud: number;
  rim: number;
  el0: number;
  el1: number;
  moonAz: number;
  moonEl: number;
}

/** The storm sky band (wrap 2048 × rows). */
export function d3SkyTile(atlas: PwAtlas, o: D3SkyOpts): PwTile {
  const H = d3RowsFor(o.el1 - o.el0);
  return atlas.tile(`d3sky|${h6(o.fog)}|${h6(o.horizon)}|${h6(o.top)}|${h6(o.cloud)}|${o.el0}|${o.el1}|${o.moonAz}|2`, TW, H, (c, k) => {
    const rng = k.rng;
    const fog = k.ramp(o.fog, { light: 0.4, dark: 0.7 });
    const hz = k.ramp(o.horizon, { light: 0.4, dark: 0.55 });
    const top = k.ramp(o.top, { light: 0.6, dark: 0.7 });
    const cl = k.ramp(o.cloud, { light: 0.5, dark: 0.5, sat: 0.9 });
    const rim = k.ramp(o.rim, { light: 0.45, sat: 0.7 });
    const moon = k.ramp(0xdfe6ff, { light: 0.5, sat: 0.5 });
    const R = c.ramp;
    const T = c.tone;
    const F = c.flag;
    const elOf = (y: number) => o.el1 - ((y + 0.5) / H) * (o.el1 - o.el0);
    const rowOf = (el: number) => Math.round(((o.el1 - el) / (o.el1 - o.el0)) * H);
    // Gradient as flat bands (SNES-style), each seam a short Bayer transition: the fog colour to
    // 1.5°, a dark glow under the clouds to ~12°, the navy deepening to near black at the top.
    const stops: [number, number, number][] = [
      [1.5, fog, 3],
      [4, hz, 3],
      [8, hz, 2],
      [14, top, 3],
      [21, top, 2],
      [30, top, 1],
      [99, top, 0.6],
    ];
    const band = (el: number) => {
      let i = 0;
      while (i < stops.length - 1 && el >= stops[i][0]) i++;
      return i;
    };
    const degRow = (o.el1 - o.el0) / H;
    for (let y = 0; y < H; y++) {
      const el = elOf(y);
      const bi = band(el);
      const row = y * TW;
      R.fill(stops[bi][1], row, row + TW);
      T.fill(stops[bi][2], row, row + TW);
      F.fill(0, row, row + TW);
      // Within 2.5 rows of the seam below this band: dither in the band below.
      if (bi === 0) continue;
      const seam = stops[bi - 1][0];
      const dRows = (el - seam) / degRow;
      if (dRows > 2.5) continue;
      const k2 = 0.5 - dRows / 5;
      const b0 = (y & 3) * 4;
      for (let x = 0; x < TW; x++) {
        if (BAYER[b0 + (x & 3)] >= k2) continue;
        R[row + x] = stops[bi - 1][1];
        T[row + x] = stops[bi - 1][2];
      }
    }
    // The moon behind the cloud bank: halo rings (stepped, dithered seams), the disc peeking out.
    const mx = colOf(o.moonAz);
    const my = rowOf(o.moonEl);
    for (let y = -46; y <= 46; y++) {
      const yy = my + y;
      if (yy < 0 || yy >= H) continue;
      for (let x = -60; x <= 60; x++) {
        const d = Math.hypot(x, y * 1.2);
        const i = yy * TW + ((mx + x + TW) % TW);
        if (d < 9) {
          R[i] = moon;
          T[i] = d < 7 ? (x + y < -4 ? 5 : 4.4) : 3.4;
          F[i] = PWF.GLOW;
        } else if (d < 56) {
          const k2 = (56 - d) / 47;
          if (BAYER[(yy & 3) * 4 + (x & 3)] < k2 * 1.3) {
            T[i] = Math.min(5, T[i] + (d < 20 ? 1.2 : 0.6));
            F[i] = 0;
          }
        }
      }
    }
    // Storm clouds, far (high) to near (low): billowing masses with silver rims toward the moon.
    const masses: [number, number, number, number][] = [];
    for (let i = 0; i < 20; i++) masses.push([rng.int(0, TW - 1), rng.range(9, 32), rng.int(110, 320), rng.range(20, 46)]);
    for (let i = 0; i < 10; i++) masses.push([rng.int(0, TW - 1), rng.range(4, 9), rng.int(120, 300), rng.range(5, 9)]);
    masses.push([mx + 34, o.moonEl - 3, 280, 34]);
    masses.sort((a, b) => b[1] - a[1]);
    for (const [cx, el, w, h] of masses) stormCloud(c, cl, rim, cx, rowOf(el), w, h, mx, my, hash2(cx, Math.round(el * 10), 7) * 999, rowOf(o.el0 + 1), el < 9.5);
  }, { wrap: true });
}

/**
 * One storm cloud: billows painted back to front (each a lit upper-left / shaded lower-right
 * dome whose lower edge is a dark contour), a silver rim where its silhouette faces the moon,
 * a darker ragged base, and rain shafts slanting down from it to the horizon.
 */
function stormCloud(c: PwCanvas, ramp: number, rimR: number, cx: number, base: number, w: number, h: number, moonX: number, moonY: number, seed: number, floor: number, flat = false) {
  const toward = (((moonX - cx) % TW) + TW) % TW < TW / 2 ? 1 : -1;
  const x0 = Math.floor(cx - w / 2 - h * (flat ? 3.8 : 1.6));
  const x1 = Math.ceil(cx + w / 2 + h * (flat ? 3.8 : 1.6));
  const y0 = Math.max(0, Math.floor(base - h * 2.4));
  const y1 = Math.min(c.h - 1, base + 6);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const mask = new Uint8Array(bw * bh);
  const tone = new Float32Array(bw * bh);
  // Billows: a tall central tower (anvil-ish) tapering to low shoulders, then a row of front billows.
  // Billows: [x, y, r, x-stretch]. Towers: a tall central mass tapering to low shoulders, a row of
  // front billows. Flat (low scud / stratus): a few long lenses.
  const bil: [number, number, number, number][] = [];
  if (flat) {
    const n = Math.max(4, Math.round(w / 22));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const r = h * (0.35 + hash2(i, 3, seed) * 0.5);
      bil.push([cx - w / 2 + t * w + (hash2(i, 5, seed) - 0.5) * 16, base - r * 0.5 - hash2(i, 6, seed) * h * 0.4, r, 1.8 + hash2(i, 4, seed) * 1.6]);
    }
  } else {
    const n = Math.max(5, Math.round(w / 16));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const tower = Math.pow(Math.sin(t * Math.PI), 1.6);
      const r = h * (0.32 + 0.55 * tower) * (0.75 + hash2(i, 3, seed) * 0.45);
      bil.push([cx - w / 2 + t * w + (hash2(i, 4, seed) - 0.5) * 12, base - r * 0.7 - tower * h * 0.6, r, 1]);
    }
    for (let i = 0; i < Math.round(n / 2); i++) {
      const t = (i + 0.5 + (hash2(i, 5, seed) - 0.5) * 0.6) / Math.round(n / 2);
      const r = h * (0.25 + hash2(i, 6, seed) * 0.2);
      bil.push([cx - w / 2 + t * w, base - r * 0.55, r, 1.6]);
    }
  }
  for (const [px, py, r, sx] of bil) {
    const ry = r * 0.82;
    const ir = 1 / (r * sx);
    for (let y = Math.max(y0, Math.floor(py - ry)); y <= Math.min(y1, Math.ceil(py + ry)); y++) {
      const dy = (y + 0.5 - py) / ry;
      const span = r * sx * Math.sqrt(Math.max(0, 1 - dy * dy));
      const dy2 = dy * dy;
      const ly = -dy * 0.6;
      const contour = dy > 0.1;
      const row = (y - y0) * bw - x0;
      for (let x = Math.ceil(px - span); x <= Math.floor(px + span); x++) {
        const i = row + x;
        const dx = (x + 0.5 - px) * ir;
        const l = ly + dx * toward * 0.55;
        mask[i] = 1;
        // Lower-right contour: the billow's edge over the one behind it (1 − |d| < 0.08 ⇔ |d|² > 0.8464).
        tone[i] = contour && dx * dx + dy2 > 0.8464 ? 1.2 : l > 0.45 ? 2.5 : l > 0 ? 2.1 : l > -0.45 ? 1.8 : 1.5;
      }
    }
  }
  const R = c.ramp;
  const T = c.tone;
  const F = c.flag;
  for (let y = y0; y <= y1; y++) {
    const rowJ = y * c.w;
    for (let x = x0; x <= x1; x++) {
      const i = (y - y0) * bw + (x - x0);
      if (!mask[i]) continue;
      const above = y > y0 ? mask[i - bw] : 0;
      const side = x - toward >= x0 && x - toward <= x1 ? mask[i - toward] : 0;
      let r = ramp;
      let t = tone[i];
      // Silver lining on the silhouette facing the moon (top and the moon side), a lit band under it.
      // (Low scud has none: dark rags against the glow.)
      if (flat) t = Math.min(t, 1.6);
      else if (!above || (!side && t > 2)) {
        r = rimR;
        t = above ? 2.8 : 3.4;
      } else if (y > y0 + 1 && !mask[i - bw * 2] && t > 1.6) t = Math.max(t, 2.8);
      if (y > base - 1) t = Math.min(t, 1.4);
      const j = rowJ + (x < 0 ? x + TW : x >= TW ? x - TW : x);
      R[j] = r;
      T[j] = t;
      F[j] = 0;
    }
  }
  // Ragged base: drips of darker cloud hanging under it.
  for (let x = x0; x <= x1; x++) {
    if (!mask[(base - y0 - 1) * bw + (x - x0)] || base - y0 - 1 < 0) continue;
    const len = Math.floor(hash2(x >> 2, 9, seed) * 4);
    for (let j = 0; j < len; j++) {
      const yy = base + j;
      if (yy >= c.h) break;
      const q = yy * c.w + (((x % TW) + TW) % TW);
      R[q] = ramp;
      T[q] = 1.2;
      F[q] = 0;
    }
  }
  // Rain shafts: slanted streaks a step paler, every third column, gappy, thinning toward the horizon.
  if (hash2(1, 2, seed) > 0.35) {
    const sx0 = cx - w * 0.3;
    const sw = w * (0.3 + hash2(2, 3, seed) * 0.4);
    for (let y = base + 2; y < floor; y++) {
      const fade = (y - base) / Math.max(1, floor - base);
      const sl = Math.round((y - base) * 0.4);
      for (let dx = 0; dx < sw; dx += 3) {
        const x = Math.round(sx0 + dx + sl);
        if (hash2(x >> 1, (y + x) >> 3, seed) < 0.5 + fade * 0.45) continue;
        const q = y * c.w + (((x % TW) + TW) % TW);
        if (R[q] === ramp || R[q] === rimR) continue;
        T[q] = Math.min(5, T[q] + 0.5);
        F[q] = 0;
      }
    }
  }
}

export interface D3RangeOpts {
  hex: number;
  fog: number;
  el0: number;
  el1: number;
  height: number;
  seed: number;
  /** Palm / canopy silhouettes along the ridge (0…1 density). */
  palms: number;
  /** The volcano: azimuth (deg) and half-width (texels), with its crater glow. */
  volcano?: { az: number; half: number; glow: number };
  /** Fraction of the band from the foot that is the fog colour. */
  fogFoot: number;
  /** Moon azimuth (lit flanks face it). */
  moonAz: number;
}

/** A ridge of the island (wrap 2048 × rows, cut out above it). */
export function d3RangeTile(atlas: PwAtlas, o: D3RangeOpts): PwTile {
  const H = d3RowsFor(o.el1 - o.el0);
  return atlas.tile(`d3range|${h6(o.hex)}|${h6(o.fog)}|${o.el0}|${o.el1}|${o.height}|${o.seed}|${o.palms}|${o.volcano ? o.volcano.az : -1}`, TW, H, (c, k) => {
    const rock = k.ramp(o.hex, { light: 0.4, dark: 0.5, sat: 0.9 });
    const fog = k.ramp(o.fog, { light: 0.4, dark: 0.7 });
    const glow = k.ramp(o.volcano?.glow ?? 0xff5a1a, { light: 0.5, sat: 1.1 });
    const smoke = k.ramp(0x3a3440, { light: 0.4 });
    const seed = o.seed;
    const R = c.ramp;
    const T = c.tone;
    const F = c.flag;
    // Ridge line (rows from the top: smaller = higher).
    const ridge = new Float32Array(TW);
    const vx = o.volcano ? colOf(o.volcano.az) : -1;
    for (let x = 0; x < TW; x++) {
      const b = smooth(x, 0, TW, 8, 7, 31 + seed) * 0.6 + smooth(x, 0, TW, 8, 23, 32 + seed) * 0.3 + smooth(x, 0, TW, 8, 80, 33 + seed) * 0.1;
      let hgt = Math.pow(b, 1.4) * o.height;
      if (o.volcano) {
        const d = Math.min(Math.abs(x - vx), TW - Math.abs(x - vx)) / o.volcano.half;
        if (d < 1.6) hgt = Math.max(hgt, (1 - Math.min(1, d) * 0.92) * 1.0 - (d < 0.12 ? (0.12 - d) * 1.4 : 0));
      }
      ridge[x] = (H - 2) - hgt * (H - 8);
    }
    const lightCol = colOf(o.moonAz);
    const fogStart = H * (1 - o.fogFoot * 2);
    for (let x = 0; x < TW; x++) {
      const top = Math.max(0, Math.round(ridge[x]));
      const toward = (lightCol - x + TW) % TW < TW / 2 ? 1 : -1;
      const slope = (ridge[(x + 4) % TW] - ridge[(x - 4 + TW) % TW]) * toward;
      const litFlank = slope > 0.4;
      for (let y = top; y < H; y++) {
        const i = y * TW + x;
        const yb = (y + 0.5) / H;
        const fk = yb * H > fogStart ? (yb * H - fogStart) / Math.max(1, H - fogStart) : 0;
        const b = BAYER[(y & 3) * 4 + (x & 3)];
        if (fk >= 0.5 || (fk > 0 && b < fk * 2)) {
          R[i] = fog;
          T[i] = 3;
          F[i] = 0;
          continue;
        }
        let t = litFlank ? 2.4 : 1.8;
        if (y === top) t = litFlank ? 3.2 : 2.4;
        // Tree clumps: 2 × 2 blocks a step up / down.
        const hb = hash2(x >> 1, y >> 1, 7 + seed);
        if (y > top + 2 && hb > 0.82) t += hb > 0.91 ? 0.6 : -0.6;
        R[i] = rock;
        T[i] = t;
        F[i] = 0;
      }
    }
    // Silhouettes on the ridge: canopy domes and palms (trunk + a crown of drooping fronds).
    const put = (x: number, y: number, t: number) => {
      if (y < 0 || y >= H) return;
      const i = y * TW + ((x % TW) + TW) % TW;
      R[i] = rock;
      T[i] = t;
      F[i] = 0;
    };
    for (let x = 0; x < TW; ) {
      const h = hash2(x, 1, 50 + seed);
      const top = Math.round(ridge[x]);
      if (vx >= 0 && Math.min(Math.abs(x - vx), TW - Math.abs(x - vx)) < (o.volcano?.half ?? 0) * 0.5) {
        x += 6;
        continue;
      }
      if (h < o.palms * 0.45) {
        // Palm: a leaning trunk, then fronds.
        const ph = 8 + Math.floor(hash2(x, 2, 51 + seed) * 10);
        const lean = (hash2(x, 3, 52 + seed) - 0.5) * 0.6;
        let px = x;
        for (let j = 0; j < ph; j++) {
          px = x + Math.round(lean * j);
          put(px, top - j, 1.8);
        }
        const fy = top - ph;
        for (let f = 0; f < 6; f++) {
          const a = (f / 6) * Math.PI * 2;
          const dx = Math.cos(a);
          const len = 4 + Math.floor(hash2(x, f, 53) * 3);
          for (let s = 1; s <= len; s++) put(px + Math.round(dx * s), fy + Math.round(Math.abs(dx) * s * 0.15 + (s * s) / 6 - (dx < 0.3 && dx > -0.3 ? s * 0.6 : 0)), s === 1 ? 2.2 : 1.8);
        }
        x += 5 + Math.floor(hash2(x, 4, 54 + seed) * 8);
      } else if (h < 0.75) {
        // Canopy dome.
        const r = 2 + Math.floor(hash2(x, 5, 55 + seed) * 4);
        for (let dx = -r; dx <= r; dx++) {
          const hh = Math.round(Math.sqrt(r * r - dx * dx));
          for (let j = 0; j <= hh; j++) put(x + dx, top - j, j === hh ? 2.4 : 1.8);
        }
        x += r + 1;
      } else x += 3;
    }
    if (o.volcano) {
      // Crater glow (a ragged notch of dull unlit orange: no beacon through the trees), a plume lit from below, leaning with the wind.
      const ty = Math.round(ridge[vx]);
      for (let dx = -10; dx <= 10; dx++) {
        const d = Math.abs(dx) / 10;
        for (let j = 0; j < 3 - Math.round(d * 2); j++) {
          const i = (ty + j) * TW + ((vx + dx + TW) % TW);
          if (ty + j < 0 || ty + j >= H) continue;
          R[i] = glow;
          T[i] = j === 0 ? 3.2 - d : 2.2 - d;
          F[i] = PWF.GLOW;
        }
      }
      for (let y = ty - 1; y >= 0; y--) {
        const up = ty - y;
        const cx = vx + Math.round(up * 0.6 + Math.sin(up * 0.12) * 4);
        const r = 5 + up * 0.35;
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          const n = hash2((cx + dx) >> 2, y >> 2, 61);
          if (Math.abs(dx) > r * (0.7 + n * 0.3)) continue;
          const i = y * TW + ((cx + dx + TW) % TW);
          const near = up < 14;
          R[i] = near && dx < r * 0.4 ? glow : smoke;
          T[i] = near ? (up < 5 ? 1.9 : 1.4) : dx < 0 ? 2.6 : 1.8;
          F[i] = near && up < 6 ? PWF.GLOW : 0;
        }
      }
    }
  }, { wrap: true });
}

/** A lightning fork (module 64 × 192, cut out): a jagged glowing channel with branches, a pale halo round the core. */
export function d3BoltModule(atlas: PwAtlas, variant: number): PwTile {
  const W = 64;
  const H = 192;
  return atlas.tile(`d3bolt|${variant}`, W, H, (c, k) => {
    const core = k.ramp(0xe8f0ff, { light: 0.6, sat: 0.5 });
    const halo = k.ramp(0x8aa0ff, { light: 0.5, sat: 0.9 });
    const pts: [number, number, number][] = [];
    const walk = (x: number, y: number, len: number, w: number, depth: number, s: number) => {
      let cx = x;
      let cy = y;
      for (let i = 0; i < len; i++) {
        const nx = Math.max(4, Math.min(W - 5, cx + (hash2(i, depth * 7 + s, 300 + variant) - 0.5) * 12));
        const ny = cy + 6 + hash2(i, depth * 7 + s, 301 + variant) * 7;
        pts.push([cx, cy, w], [nx, ny, w]);
        if (depth < 2 && hash2(i, depth + s, 302 + variant) > 0.72) walk(nx, ny, Math.floor(len * 0.35), w * 0.6, depth + 1, s + i + 1);
        cx = nx;
        cy = ny;
        if (cy > H - 4) break;
      }
    };
    walk(W / 2 + (variant - 1) * 8, 0, 30, 1, 0, 0);
    for (let p = 0; p < pts.length; p += 2) {
      const [x0, y0, w] = pts[p];
      const [x1, y1] = pts[p + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= n; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / n);
        const y = Math.round(y0 + ((y1 - y0) * s) / n);
        // Halo first (one texel round), then the core over it.
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!c.at(x + dx, y + dy)) c.set(x + dx, y + dy, halo, w < 1 ? 2.6 : 3.4, PWF.GLOW);
        c.set(x, y, core, w < 1 ? 4 : 5, PWF.GLOW);
        if (w >= 1) c.set(x + 1, y, core, 4.4, PWF.GLOW);
      }
    }
  });
}

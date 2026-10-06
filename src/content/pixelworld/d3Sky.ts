import { PWF, PW_BACKDROP_TPD, type PwCanvas } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { hash2, smooth } from './surfaces';

/**
 * TYRANT CHASE (d3) panorama for ART: PIXEL WORLD — the storm over the park at
 * night, painted straight into the canvas arrays (per-row / per-column work
 * hoisted out of the texel loops):
 *  - SKY: the fog colour up to where the fogged trees reach (7°), then the
 *    classic dome's gradient in darker steps toward the zenith, every seam an
 *    ordered (Bayer) transition; storm heaps built from overlapping lobes in
 *    three steps (shadow / body / moonlit) with dithered terminators, thick
 *    silver rims only on the exposed tops facing the moon, none underneath;
 *    ragged rain-fed bottoms feathering into slanting rain shafts; torn scud
 *    wisps at varied heights; the moon smothered behind a heap (stepped
 *    halo). Heaps in the band the pteros fly through stay mid-toned and calm
 *    (no dark contours): a ptero keeps its silhouette over them.
 *  - RANGES: the island's jungle ridges just beyond the fog — big broadleaf
 *    crowns in two rows (the back row a haze step lighter) and palms with
 *    real fronds (drooping, leaflets ticked under the rib), lit toward the
 *    moon; never lighter than the fog, their feet dithered into it.
 *  - BOLTS: three hand-drawn lightning forks (cut-out, glowing core and halo)
 *    for the storm's strikes.
 */

const TW = 2048;
const h6 = (n: number) => n.toString(16).padStart(6, '0');
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
const colOf = (az: number) => Math.round((((az % 360) + 360) % 360) * (TW / 360));
const wrapX = (x: number) => (x < 0 ? x + TW : x >= TW ? x - TW : x);

/** sRGB mix of two hex colours. */
export function d3Mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Rows for a band of `deg` degrees (multiple of 16). */
export function d3RowsFor(deg: number): number {
  return Math.max(16, Math.round((deg * PW_BACKDROP_TPD) / 16) * 16);
}

export interface D3SkyOpts {
  /** The fog colour (the horizon band, matched exactly: ramp base, no extra chroma). */
  fog: number;
  /** The zenith. */
  top: number;
  /** Cloud body and the moonlit rim. */
  cloud: number;
  rim: number;
  el0: number;
  el1: number;
  moonAz: number;
  moonEl: number;
}

/** Band seams (deg) and how far each band is mixed from the fog toward the zenith colour. */
const SKY_EDGES = [7, 12.5, 19, 27, 34];
const SKY_MIX = [0, 0.14, 0.3, 0.48, 0.64, 0.78];

/** The storm sky band (wrap 2048 × rows). */
export function d3SkyTile(atlas: PwAtlas, o: D3SkyOpts): PwTile {
  const H = d3RowsFor(o.el1 - o.el0);
  return atlas.tile(`d3sky3|${h6(o.fog)}|${h6(o.top)}|${h6(o.cloud)}|${h6(o.rim)}|${o.el0}|${o.el1}|${o.moonAz}|${o.moonEl}`, TW, H, (c, k) => {
    const rng = k.rng;
    const R = c.ramp;
    const T = c.tone;
    const F = c.flag;
    const rpd = H / (o.el1 - o.el0);
    const elOf = (y: number) => o.el1 - (y + 0.5) / rpd;
    const rowOf = (el: number) => Math.round((o.el1 - el) * rpd - 0.5);
    const bands = SKY_MIX.map((m) => k.ramp(d3Mix(o.fog, o.top, m), { light: 0.3, dark: 0.6, sat: 1 }));
    const cl = k.ramp(o.cloud, { light: 0.4, dark: 0.62, sat: 0.95 });
    const rim = k.ramp(o.rim, { light: 0.4, dark: 0.6, sat: 0.8 });
    const scud = k.ramp(d3Mix(o.fog, 0x06080c, 0.35), { light: 0.3, dark: 0.6, sat: 1 });
    const moon = k.ramp(0xdfe6ff, { light: 0.5, sat: 0.5 });
    // Gradient bands; within 4 rows of a seam the neighbouring band is ordered-dithered in (50 % at the seam).
    for (let y = 0; y < H; y++) {
      const el = elOf(y);
      let bi = 0;
      while (bi < SKY_EDGES.length && el >= SKY_EDGES[bi]) bi++;
      const row = y * TW;
      R.fill(bands[bi], row, row + TW);
      T.fill(3, row, row + TW);
      F.fill(0, row, row + TW);
      const dn = bi > 0 ? (el - SKY_EDGES[bi - 1]) * rpd : 99;
      const up = bi < SKY_EDGES.length ? (SKY_EDGES[bi] - el) * rpd : 99;
      const near = Math.min(dn, up);
      if (near >= 4) continue;
      const other = dn < up ? bands[bi - 1] : bands[bi + 1];
      const kk = 0.5 - near / 8;
      const b0 = (y & 3) * 4;
      for (let x = 0; x < TW; x++) if (BAYER[b0 + (x & 3)] < kk) R[row + x] = other;
    }
    // The moon: a stepped halo (a lit ring, a dithered outer ring), the disc, earthshine on its dark limb.
    const mx = colOf(o.moonAz);
    const my = rowOf(o.moonEl);
    for (let y = -40; y <= 40; y++) {
      const yy = my + y;
      if (yy < 0 || yy >= H) continue;
      for (let x = -48; x <= 48; x++) {
        const d = Math.hypot(x, y * 1.15);
        const i = yy * TW + wrapX(mx + x);
        if (d < 8.5) {
          R[i] = moon;
          T[i] = d < 6.5 ? (x + y < -3 ? 5 : 4.4) : x + y > 4 ? 3 : 3.6;
          F[i] = PWF.GLOW;
        } else if (d < 19) {
          T[i] = 4;
        } else if (d < 36) {
          T[i] = 3.5;
          F[i] = PWF.DITHER;
        }
      }
    }
    // Storm heaps, far (high) to near (low).
    const heaps: [number, number, number, number][] = [];
    for (let i = 0; i < 11; i++) {
      const el = rng.range(8, 15);
      heaps.push([rng.int(0, TW - 1), el, rng.int(180, 400), Math.min(rng.range(40, 80), (30 - el) * rpd)]);
    }
    for (let i = 0; i < 8; i++) {
      const el = rng.range(15, 24);
      heaps.push([rng.int(0, TW - 1), el, rng.int(90, 200), Math.min(rng.range(18, 36), (31 - el) * rpd)]);
    }
    // The heap smothering the moon (its rim lit by it).
    heaps.push([mx + 30, o.moonEl - 5, 300, 30]);
    heaps.sort((a, b) => b[1] - a[1]);
    const floor = rowOf(1);
    for (const [cx, el, w, h] of heaps) {
      const toward = (((mx - cx) % TW) + TW) % TW < TW / 2 ? 1 : -1;
      // The ptero band (10–35°): no dark contours, calm detail.
      const calm = el > 10;
      heap(c, cl, rim, bands, cx, rowOf(el), w, h, toward, Math.round(hash2(cx, Math.round(el * 10), 7) * 9999), floor, calm);
    }
    // Torn scud: dark wisps low over the horizon at varied heights.
    for (let n = 0; n < 16; n++) {
      const x0 = rng.int(0, TW - 1);
      const y0 = rowOf(rng.range(7.5, 13));
      const segs = rng.int(3, 7);
      let x = x0;
      for (let s = 0; s < segs; s++) {
        const len = rng.int(12, 46);
        const y = y0 + rng.int(-3, 3);
        const thick = rng.range(1.2, 2.8);
        for (let j = 0; j < len; j++) {
          const t = j / len;
          const th = thick * Math.sin(Math.PI * t) + (hash2(x + j, s, n) > 0.8 ? 0.6 : 0);
          for (let dy = 0; dy < Math.round(th); dy++) {
            const yy = y + dy - Math.round(th / 2);
            if (yy < 0 || yy >= H) continue;
            const i = yy * TW + wrapX(x + j);
            if (R[i] === cl || R[i] === rim) continue;
            R[i] = scud;
            T[i] = dy === 0 && toward0(x + j, mx) ? 3.4 : 2.6;
            F[i] = 0;
          }
        }
        x += len + rng.int(3, 14);
      }
    }
  }, { wrap: true });
}

const toward0 = (x: number, mx: number) => (((mx - x) % TW) + TW) % TW < TW / 2;

/**
 * One storm heap: lobes (a tower round a peak, filler lobes, a row of front lobes) laid back to
 * front. Shading follows the WHOLE heap (lit toward the moon and up, its lower half in shadow,
 * a dark rain-laden base) with the lobes only accented: a lit crest where a lobe's top edge lies
 * over the lobe behind it and a shadow step just above that crest — no outline round every lobe.
 * Silver rims on exposed tops (two texels on the moon's side, one on the far side), none on the
 * undersides; ordered-dither terminators; a ragged base hanging rain-fed drips, rain shafts
 * slanting down from it. `calm`: no tone below the body's shadow step (pteros fly over these).
 */
function heap(c: PwCanvas, cl: number, rimR: number, bands: number[], cx: number, base: number, w: number, h: number, toward: number, seed: number, floor: number, calm: boolean) {
  const lobes: [number, number, number, number][] = [];
  const peak = cx + (hash2(seed, 1, 3) - 0.5) * w * 0.5;
  const nTop = Math.max(3, Math.round(w / Math.max(14, h * 0.62)));
  for (let i = 0; i < nTop; i++) {
    const t = (i + 0.5) / nTop;
    const x = cx - w / 2 + t * w + (hash2(i, 2, seed) - 0.5) * 12;
    const prof = Math.exp(-(((x - peak) / (w * 0.28)) ** 2));
    const r = h * (0.26 + 0.22 * prof) * (0.8 + hash2(i, 3, seed) * 0.4);
    const top = base - h * (0.28 + 0.72 * prof);
    lobes.push([x, top + r, r, 1.15]);
    // Filler lobes behind and under it (the heap is solid).
    lobes.push([x + (hash2(i, 4, seed) - 0.5) * r, top + r * 2.1, r * 1.2, 1.3]);
  }
  // Lobes behind first: the tower (high) before the filler before the front row.
  lobes.sort((a, b) => a[1] - b[1]);
  const nFront = Math.max(3, Math.round(w / Math.max(16, h * 0.7)));
  for (let i = 0; i < nFront; i++) {
    const t = (i + 0.5) / nFront;
    const r = h * (0.22 + hash2(i, 6, seed) * 0.12);
    lobes.push([cx - w / 2 + t * w + (hash2(i, 7, seed) - 0.5) * 10, base - r * 0.62, r, 1.45]);
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  for (const [x, y, r, sx] of lobes) {
    x0 = Math.min(x0, Math.floor(x - r * sx * 1.2));
    x1 = Math.max(x1, Math.ceil(x + r * sx * 1.2));
    y0 = Math.min(y0, Math.floor(y - r * 1.2));
  }
  y0 = Math.max(0, y0);
  const y1 = Math.min(c.h - 1, base + 6);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bh <= 0 || base - 1 < y0) return;
  // Owner lobe per texel (1-based; 0 = sky) and the lobe's own side shading.
  const own = new Uint8Array(bw * bh);
  const side = new Float32Array(bw * bh);
  // Cauliflower: small bumps on each lobe's upper rim (same owner as their lobe).
  const parts: [number, number, number, number, number][] = [];
  lobes.forEach(([px, py, r, sx], li) => {
    parts.push([px, py, r, sx, li]);
    const nb = 3 + Math.floor(hash2(li, 11, seed) * 3);
    for (let q = 0; q < nb; q++) {
      const a = Math.PI * (0.12 + (0.76 * (q + hash2(li, q, seed + 1) * 0.6)) / nb);
      const rr = r * (0.3 + hash2(q, li, seed + 2) * 0.18);
      parts.push([px + Math.cos(a) * r * sx * 0.82, py - Math.sin(a) * r * 0.85 * 0.82, rr, 1.1, li]);
    }
  });
  for (const [px, py, r, sx, li] of parts) {
    const ry = r * 0.85;
    const irx = 1 / (r * sx);
    const ya = Math.max(y0, Math.floor(py - ry));
    const yb = Math.min(base - 1, Math.ceil(py + ry));
    for (let y = ya; y <= yb; y++) {
      const ny = (y + 0.5 - py) / ry;
      const span = r * sx * Math.sqrt(Math.max(0, 1 - ny * ny));
      const row = (y - y0) * bw - x0;
      for (let x = Math.ceil(px - span); x <= Math.floor(px + span); x++) {
        own[row + x] = li + 1;
        side[row + x] = (x + 0.5 - px) * irx * toward - ny * 0.5;
      }
    }
  }
  const top = Math.min(...parts.map(([, y, r]) => y - r * 0.85));
  const span = Math.max(4, base - top);
  const lo = calm ? 2.4 : 2;
  const R = c.ramp;
  const T = c.tone;
  const F = c.flag;
  for (let y = y0; y < base; y++) {
    const rowJ = y * TW;
    const hy = (y + 0.5 - top) / span;
    for (let x = x0; x <= x1; x++) {
      const i = (y - y0) * bw + (x - x0);
      const o = own[i];
      if (!o) continue;
      const above = y > y0 ? own[i - bw] : 0;
      const above2 = y > y0 + 1 ? own[i - 2 * bw] : 0;
      const sd = side[i];
      // The heap's form: lit up top toward the moon, shadowed below; the lobe tilts it a little.
      const l = 0.62 - hy * 1.15 + sd * 0.3 + (bay(x, y) - 0.5) * 0.14;
      let t = l > 0.45 ? 3.8 : l > -0.05 ? 3 : l > -0.42 ? 2.4 : lo;
      let r = cl;
      if (!above) {
        // Exposed top: the silver lining (thick toward the moon).
        if (sd > -0.2) {
          r = rimR;
          t = sd > 0.25 ? 4.2 : 3.6;
        } else t = Math.max(t, 3);
      } else if (!above2 && sd > 0.25) {
        r = rimR;
        t = 3.4;
      } else if (above !== o) {
        // A lobe's crest over the lobe behind it: lit toward the moon, plain on the far side.
        if (sd > -0.1 && hy < 0.75) t = Math.min(4, t + 0.9);
      } else if (y + 1 < base && own[i + bw] && own[i + bw] !== o && (own[i - bw] === o || !own[i - bw])) {
        // Just above a crest of the lobe in front: a shadow step on the lobe behind.
        t = Math.max(lo, t - 0.7);
      }
      if (calm) t = Math.max(t, lo);
      const j = rowJ + wrapX(x);
      R[j] = r;
      T[j] = t;
      F[j] = 0;
    }
  }
  // Ragged rain-fed bottom: drips in runs of a few columns, thinning out (ordered).
  const bi = (base - 1 - y0) * bw;
  for (let x = x0; x <= x1; x++) {
    if (!own[bi + x - x0]) continue;
    const len = Math.floor(hash2(x >> 2, 9, seed) * 5 + hash2(x, 8, seed) * 2);
    for (let j = 0; j < len; j++) {
      const yy = base + j;
      if (yy >= c.h || bay(x, yy) > 1 - j / (len + 1)) continue;
      const q = yy * TW + wrapX(x);
      R[q] = cl;
      T[q] = lo;
      F[q] = 0;
    }
  }
  // Rain shafts: slanted dashes a step paler than the sky, gappy, thinning toward the horizon.
  if (hash2(1, 2, seed) > 0.3) {
    const sx0 = cx - w * (0.15 + hash2(3, 3, seed) * 0.25);
    const sw = w * (0.25 + hash2(2, 3, seed) * 0.35);
    for (let y = base + 3; y < floor; y++) {
      const fade = (y - base) / Math.max(1, floor - base);
      const sl = Math.round((y - base) * 0.38);
      for (let dx = 0; dx < sw; dx += 3) {
        const x = Math.round(sx0 + dx + sl);
        if (hash2(x >> 1, (y + x) >> 2, seed) < 0.45 + fade * 0.5) continue;
        const q = y * TW + wrapX(x);
        const rr = R[q];
        if (rr === cl || rr === rimR || bands.indexOf(rr) < 0) continue;
        T[q] = 4;
        F[q] = 0;
      }
    }
  }
}

export interface D3RangeOpts {
  /** Silhouette colour before the haze. */
  hex: number;
  fog: number;
  /** 0…1 toward the fog (the front row; the back row a step further). */
  haze: number;
  el0: number;
  el1: number;
  seed: number;
  moonAz: number;
  /** Azimuth of u = 0 (the layer's yaw). */
  yaw: number;
  /** Ridge height range (fraction of the rows, from the foot). */
  hill: [number, number];
  /** Palm heights (rows) and density (0…1). */
  palm: [number, number];
  palms: number;
  /** Broadleaf crown radius (rows). */
  crown: number;
  /** Rows at the foot dithered into the fog colour. */
  fogRows: number;
}

/**
 * A jungle ridge just beyond the fog (wrap 2048 × rows, cut out above the canopy): a back row of
 * broadleaf crowns a haze step lighter, the hill body, a front row of crowns with ragged leaf
 * edges, palms with drooping fronds; shading toward the moon in two or three steps, never lighter
 * than the fog; the foot ordered-dithered into the fog colour.
 */
export function d3RangeTile(atlas: PwAtlas, o: D3RangeOpts): PwTile {
  const H = d3RowsFor(o.el1 - o.el0);
  const key = `d3range3|${h6(o.hex)}|${h6(o.fog)}|${o.haze}|${o.el0}|${o.el1}|${o.seed}|${o.yaw}|${o.hill}|${o.palm}|${o.palms}|${o.crown}|${o.fogRows}`;
  return atlas.tile(key, TW, H, (c, k) => {
    const seed = o.seed;
    const front = k.ramp(d3Mix(o.hex, o.fog, o.haze), { light: 0.12, dark: 0.7, sat: 1 });
    const back = k.ramp(d3Mix(o.hex, o.fog, o.haze + (1 - o.haze) * 0.4), { light: 0.08, dark: 0.75, sat: 1 });
    const fogR = k.ramp(o.fog, { light: 0.3, dark: 0.6, sat: 1 });
    const R = c.ramp;
    const T = c.tone;
    const F = c.flag;
    const ridge = new Float32Array(TW);
    for (let x = 0; x < TW; x++) {
      const n = smooth(x, 0, TW, 8, 9, 31 + seed) * 0.6 + smooth(x, 0, TW, 8, 31, 32 + seed) * 0.3 + smooth(x, 0, TW, 8, 97, 33 + seed) * 0.1;
      ridge[x] = H - 1 - (o.hill[0] + (o.hill[1] - o.hill[0]) * n) * H;
    }
    const light = colOf(o.moonAz - o.yaw);
    const towardOf = (x: number) => ((light - x + TW) % TW < TW / 2 ? 1 : -1);
    const put = (x: number, y: number, r: number, t: number) => {
      if (y < 0 || y >= H) return;
      const i = y * TW + wrapX(x);
      R[i] = r;
      T[i] = t;
      F[i] = 0;
    };
    // A broadleaf crown: a dome with a ragged leafy edge, lit toward the moon and above.
    const crown = (cx: number, cy: number, r: number, ramp: number, lit: number) => {
      const tw = towardOf(wrapX(Math.round(cx)));
      const ri = Math.ceil(r * 1.1);
      for (let dy = -ri; dy <= Math.ceil(r * 0.7); dy++) {
        const y = Math.round(cy) + dy;
        if (y < 0 || y >= H) continue;
        for (let dx = -ri; dx <= ri; dx++) {
          // A ragged leafy edge: the radius jittered per 2 × 2 leaf clump.
          const edge = r * (0.86 + 0.18 * hash2((dx + 64) >> 1, (dy + 64) >> 1, Math.round(cx) + seed));
          const dd = dx * dx + (dy < 0 ? dy * dy : dy * dy * 0.36);
          if (dd > edge * edge) continue;
          const s = (dx * tw * 0.55 - dy * 0.8) / r + (bay(dx, dy) - 0.5) * 0.3;
          put(Math.round(cx) + dx, y, ramp, s > 0.55 ? lit : s > -0.25 ? 3 : 2);
        }
      }
    };
    // A palm: a leaning, curving trunk and a crown of drooping feathered fronds (leaflets swept
    // back off both sides of the rib, longest mid-frond, a few torn out), lit toward the moon.
    const palm = (x: number, base: number, ph: number, ramp: number) => {
      const tw = towardOf(x);
      const lean = (hash2(x, 3, 52 + seed) - 0.5) * 0.7;
      const thick = ph > 30 ? 2 : 1;
      let px = x;
      for (let j = 0; j < ph; j++) {
        const t = j / ph;
        px = x + Math.round(lean * ph * 0.35 * t * t);
        for (let q = 0; q < thick; q++) put(px + q, base - j, ramp, q === (tw > 0 ? thick - 1 : 0) ? 2.6 : 2);
      }
      const fx = px + (thick > 1 ? 0.5 : 0);
      const fy = base - ph;
      const L = ph * (0.46 + hash2(x, 6, 53 + seed) * 0.12);
      const n = 8;
      const line = (x0: number, y0: number, dx: number, dy: number, len: number, t: number) => {
        for (let q = 1; q <= len; q++) put(Math.round(x0 + dx * q), Math.round(y0 + dy * q), ramp, t);
      };
      for (let f = 0; f < n; f++) {
        const a = Math.PI * (-0.12 + (1.24 * f) / (n - 1)) + (hash2(x, f, 54 + seed) - 0.5) * 0.25;
        const dx = Math.cos(a);
        const dy = -Math.sin(a);
        const droop = 0.7 + hash2(x, f, 55 + seed) * 0.5;
        const len = L * (0.75 + hash2(x, f, 56 + seed) * 0.35) * (Math.abs(dx) < 0.3 ? 0.6 : 1);
        const litSide = dx * tw > 0.15;
        let lx = fx;
        let ly = fy;
        for (let s2 = 1; s2 <= len; s2++) {
          const u = s2 / len;
          const xx = fx + dx * s2;
          const yy = fy + dy * s2 * 0.7 + droop * len * u * u * 0.9;
          // Tangent and the lower normal of the rib here.
          let tx = xx - lx;
          let ty = yy - ly;
          const tl = Math.hypot(tx, ty) || 1;
          tx /= tl;
          ty /= tl;
          lx = xx;
          ly = yy;
          let nx = -ty;
          let ny = tx;
          if (ny < 0) (nx = -nx), (ny = -ny);
          put(Math.round(xx), Math.round(yy), ramp, u > 0.85 ? 2 : litSide ? 3.2 : 2.6);
          if (u < 0.12 || hash2(Math.round(xx), Math.round(yy), 57 + seed) < 0.14) continue;
          const ll = (1 + Math.sin(u * Math.PI) * 2.6) * (0.75 + hash2(s2, f, 58 + seed) * 0.4);
          // Lower leaflets (swept back, hanging), then the upper ones (shorter, lit).
          let ax = nx * 0.75 - tx * 0.45;
          let ay = ny * 0.75 - ty * 0.45 + 0.35;
          let al = Math.hypot(ax, ay);
          line(xx, yy, ax / al, ay / al, Math.round(ll), 2.2);
          ax = -nx * 0.6 - tx * 0.55;
          ay = -ny * 0.6 - ty * 0.55 + 0.55;
          al = Math.hypot(ax, ay);
          line(xx, yy, ax / al, ay / al, Math.round(ll * 0.6), litSide ? 3 : 2.4);
        }
      }
      // The crown's knot of leaf bases.
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1 + thick - 1; dx++) put(Math.round(fx) + dx, fy + dy, ramp, 2);
    };
    // Back row: big crowns rising above the ridge (a step hazier), some palms.
    for (let x = 0; x < TW; ) {
      const r = o.crown * (1.1 + hash2(x, 1, 40 + seed) * 0.8);
      crown(x, ridge[x] - r * (0.3 + hash2(x, 2, 41 + seed) * 0.5), r, back, 3.6);
      x += Math.max(3, Math.round(r * (1.2 + hash2(x, 3, 42 + seed) * 1.2)));
    }
    for (let x = 7; x < TW; x += 29 + Math.floor(hash2(x, 4, 43 + seed) * 70)) {
      if (hash2(x, 5, 44 + seed) < o.palms) palm(x, Math.round(ridge[x]), Math.round(o.palm[1] * (0.8 + hash2(x, 6, 45 + seed) * 0.35)), back);
    }
    // The hill body.
    for (let x = 0; x < TW; x++) {
      const top = Math.max(0, Math.round(ridge[x]));
      const tw = towardOf(x);
      const facing = (ridge[(x + 5) % TW] - ridge[(x - 5 + TW) % TW]) * tw < -0.5;
      for (let y = top; y < H; y++) {
        const i = y * TW + x;
        R[i] = front;
        T[i] = facing && y < top + 6 ? 2.6 : 2;
        F[i] = 0;
      }
    }
    // Front row: crowns along the ridge, then palms rising out of them.
    for (let x = 0; x < TW; ) {
      const r = o.crown * (0.6 + hash2(x, 7, 46 + seed) * 0.6);
      crown(x, ridge[x] + r * 0.2, r, front, 3.6);
      x += Math.max(2, Math.round(r * (1 + hash2(x, 8, 47 + seed) * 0.9)));
    }
    for (let x = 0; x < TW; ) {
      const h = hash2(x, 9, 48 + seed);
      if (h < o.palms) {
        const ph = Math.round(o.palm[0] + (o.palm[1] - o.palm[0]) * hash2(x, 10, 49 + seed));
        palm(x, Math.round(ridge[x]) + 2, ph, front);
        // A pair: a second palm leaning off the first now and then.
        if (hash2(x, 11, 50 + seed) > 0.6) palm(x + 5 + Math.floor(hash2(x, 12, 51 + seed) * 6), Math.round(ridge[x]) + 3, Math.round(ph * 0.75), front);
      }
      x += 18 + Math.floor(hash2(x, 13, 52 + seed) * 60);
    }
    // The foot: dithered into the fog colour.
    for (let y = H - o.fogRows; y < H; y++) {
      const kk = ((y - (H - o.fogRows) + 0.5) / o.fogRows) * 1.3;
      const row = y * TW;
      const b0 = (y & 3) * 4;
      for (let x = 0; x < TW; x++) {
        if (BAYER[b0 + (x & 3)] >= kk) continue;
        R[row + x] = fogR;
        T[row + x] = 3;
        F[row + x] = 0;
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

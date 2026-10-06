import { FloraPalette, FloraRng, type FloraRampOptions } from '../pixel/floraPaint';

/**
 * PixelWorld painting canvas (pure CPU, node-safe — no DOM, no GL).
 *
 * Every texel holds a RAMP id (a 6-step hand-built colour ramp from the same
 * `makeRamp` the PixelCast characters and FLORA plants use: base on step 3,
 * violet-shifted shadows, warm pale highlights, step 0 = outline shade), a TONE
 * in ramp-step units (0…5, fractional = ordered dither between two steps) and
 * flags (GLOW = unlit, emits its colour). Painters work in ramp space — never
 * in free RGB — so environments share the cast's palette discipline: no
 * gradients except dithered ones, no anti-aliasing, no per-texel noise unless a
 * painter asks for a dithered band on purpose.
 *
 * Coordinates are canvas texels, x right, y DOWN (row 0 = the top, as an image).
 * The atlas flips rows when it packs a tile (texture v runs up).
 *
 * Light convention (the sprite artist's, as PixelCast): from the upper left and
 * front. Raised features: lit top / left edge, dark bottom / right edge, one
 * step of cast shadow below-right on the surface behind. Recessed features
 * (window openings, doorways, gaps): the inside top / left reveal is in shadow,
 * the bottom / right reveal catches the light.
 */

/** World texel density: texels per metre on every PixelWorld world surface. */
export const PW_TPM = 32;
/** Painted mip levels (level 0 = full size). */
export const PW_LEVELS = 5;
/** Atlas rect alignment (texels): every level of every rect stays inside its own rect. */
export const PW_ALIGN = 1 << (PW_LEVELS - 1);
/** Alpha byte of an unlit (glowing) texel; 255 = lit surface, 0 = cut out. */
export const PW_GLOW_A = 160;
/** Backdrop texels per degree of view (2048 texels around the horizon ≈ 1 texel per retro pixel). */
export const PW_BACKDROP_TPD = 2048 / 360;

/** Per-texel flags. */
export const PWF = {
  /** Unlit: drawn at its painted colour regardless of the scene's lights (lit windows, neon, lamps). */
  GLOW: 1,
  /**
   * Ordered dither between the two steps around a fractional tone. Without it a
   * tone ROUNDS to the nearest step: dither is opt-in, used only where a painter
   * wants a band (sky gradients, light falloff, soft edges) — never as texture.
   */
  DITHER: 2,
} as const;

/**
 * The stage palette: ramps by base colour + options — FLORA's ramp maker (the
 * cast's `makeRamp` with an optional lightness cap), without FLORA's 255-ramp
 * limit (PixelWorld atlases are RGBA, a stage may use a few hundred ramps).
 */
export class PwPalette {
  private inner = new FloraPalette();
  readonly ramps: number[][] = [];
  private keys = new Map<string, number>();
  add(hex: number, o: FloraRampOptions = {}): number {
    const key = `${hex}|${o.dark ?? ''}|${o.light ?? ''}|${o.shift ?? ''}|${o.sat ?? ''}|${o.shadowHue ?? ''}|${o.cap ?? ''}`;
    let id = this.keys.get(key);
    if (id === undefined) {
      // One throwaway FLORA palette entry builds the ramp (same maths); recycle it when full.
      if (this.inner.ramps.length >= 250) this.inner = new FloraPalette();
      const r = this.inner.ramps[this.inner.add(hex, o) - 1];
      this.ramps.push(r);
      id = this.ramps.length;
      if (id > 65535) throw new Error('pixelworld palette full');
      this.keys.set(key, id);
    }
    return id;
  }
}

/** Deterministic painter RNG (mulberry32) — painters never touch `world.rng`. */
export class PwRng extends FloraRng {
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.next() * a.length) % a.length];
  }
}

/** 4×4 Bayer thresholds in [0, 1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function bayer(x: number, y: number): number {
  return BAYER[(y & 3) * 4 + (x & 3)];
}

/**
 * Hand-pixelled cluster shapes (2–6 texels), the way pixel artists break up a
 * surface: chips, pebbles, flecks, moss tufts. Each is a list of (dx, dy).
 */
export const CLUSTERS: readonly (readonly number[])[] = [
  [0, 0, 1, 0],
  [0, 0, 0, 1],
  [0, 0, 1, 0, 0, 1],
  [0, 0, 1, 0, 1, 1],
  [1, 0, 0, 1, 1, 1, 2, 1],
  [0, 0, 1, 0, 2, 0, 1, 1],
  [1, 0, 2, 0, 0, 1, 1, 1],
  [0, 0, 1, 1],
  [1, 0, 0, 1, 1, 1, 2, 1, 1, 2],
  [0, 0, 1, 0, 1, 1, 2, 1],
];

export class PwCanvas {
  /** Ramp id per texel (0 = empty / transparent). */
  readonly ramp: Uint16Array;
  /** Tone in ramp steps (0…5, fractional = dithered). */
  readonly tone: Float32Array;
  readonly flag: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    const n = w * h;
    this.ramp = new Uint16Array(n);
    this.tone = new Float32Array(n);
    this.flag = new Uint8Array(n);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, ramp: number, tone: number, flag = 0) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.ramp[i] = ramp;
    this.tone[i] = tone;
    this.flag[i] = flag;
  }

  /** Ramp id at (x, y) (0 outside / empty). */
  at(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.ramp[y * this.w + x];
  }

  toneAt(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.tone[y * this.w + x];
  }

  /** Shift the tone of a painted texel by `dt` steps (clamped 0…5); `only` limits it to one ramp. */
  shift(x: number, y: number, dt: number, only = 0) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (!this.ramp[i] || (only && this.ramp[i] !== only)) return;
    this.tone[i] = Math.max(0, Math.min(5, this.tone[i] + dt));
  }

  /** Recolour a painted texel (keeps its tone): stains, rust, moss on whatever is there. */
  tint(x: number, y: number, ramp: number, dt = 0) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (!this.ramp[i]) return;
    this.ramp[i] = ramp;
    this.tone[i] = Math.max(0, Math.min(5, this.tone[i] + dt));
  }

  /** Filled rectangle (x, y = top-left). `tone` may be a function of (x, y). */
  rect(x: number, y: number, w: number, h: number, ramp: number, tone: number | ((x: number, y: number) => number), flag = 0) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.floor(x + w));
    const y1 = Math.min(this.h, Math.floor(y + h));
    const f = typeof tone === 'function';
    for (let yy = y0; yy < y1; yy++) {
      let i = yy * this.w + x0;
      for (let xx = x0; xx < x1; xx++, i++) {
        this.ramp[i] = ramp;
        this.tone[i] = f ? (tone as (x: number, y: number) => number)(xx, yy) : (tone as number);
        this.flag[i] = flag;
      }
    }
  }

  /** Shift the tone of every painted texel in a rectangle (shadows, light pools, grime bands). */
  shade(x: number, y: number, w: number, h: number, dt: number | ((x: number, y: number) => number), only = 0) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.floor(x + w));
    const y1 = Math.min(this.h, Math.floor(y + h));
    const f = typeof dt === 'function';
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = yy * this.w + xx;
        if (!this.ramp[i] || (only && this.ramp[i] !== only)) continue;
        const d = f ? (dt as (x: number, y: number) => number)(xx, yy) : (dt as number);
        this.tone[i] = Math.max(0, Math.min(5, this.tone[i] + d));
      }
    }
  }

  hline(x: number, y: number, len: number, ramp: number, tone: number, flag = 0) {
    this.rect(x, y, len, 1, ramp, tone, flag);
  }

  vline(x: number, y: number, len: number, ramp: number, tone: number, flag = 0) {
    this.rect(x, y, 1, len, ramp, tone, flag);
  }

  /** One-texel outline of a rectangle. */
  frame(x: number, y: number, w: number, h: number, ramp: number, tone: number, flag = 0) {
    this.hline(x, y, w, ramp, tone, flag);
    this.hline(x, y + h - 1, w, ramp, tone, flag);
    this.vline(x, y, h, ramp, tone, flag);
    this.vline(x + w - 1, y, h, ramp, tone, flag);
  }

  /**
   * Bevel the border of a rectangle already painted: `raised` = lit top / left
   * edge (+lit) and dark bottom / right edge (−dark); sunk = the reverse (a
   * recess: shadowed top / left reveal, lit bottom / right).
   */
  bevel(x: number, y: number, w: number, h: number, raised: boolean, lit = 1, dark = 1, width = 1) {
    for (let k = 0; k < width; k++) {
      const a = raised ? lit : -dark;
      const b = raised ? -dark : lit;
      this.shade(x + k, y + k, w - k * 2, 1, a);
      this.shade(x + k, y + k + 1, 1, h - k * 2 - 2, a);
      this.shade(x + k, y + h - 1 - k, w - k * 2, 1, b);
      this.shade(x + w - 1 - k, y + k + 1, 1, h - k * 2 - 2, b);
    }
  }

  /** Bresenham line (1 texel wide). */
  line(x0: number, y0: number, x1: number, y1: number, ramp: number, tone: number, flag = 0) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, ramp, tone, flag);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Like `line`, but shifts tones of what is there (cracks, scratches, seams). */
  lineShade(x0: number, y0: number, x1: number, y1: number, dt: number, only = 0) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.shift(x0, y0, dt, only);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Filled ellipse; `tone` may depend on the normalised position (u, v ∈ −1…1). */
  ellipse(cx: number, cy: number, rx: number, ry: number, ramp: number, tone: number | ((u: number, v: number) => number), flag = 0) {
    const f = typeof tone === 'function';
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        if (u * u + v * v > 1) continue;
        this.set(x, y, ramp, f ? (tone as (u: number, v: number) => number)(u, v) : (tone as number), flag);
      }
    }
  }

  /** Shade inside an ellipse (soft light pools, stains) by `dt(d)` with d = normalised distance 0…1. */
  ellipseShade(cx: number, cy: number, rx: number, ry: number, dt: (d: number) => number, only = 0) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        const d = u * u + v * v;
        if (d > 1) continue;
        this.shift(x, y, dt(Math.sqrt(d)), only);
      }
    }
  }

  /** Filled polygon (x, y pairs). */
  poly(pts: number[], ramp: number, tone: number | ((x: number, y: number) => number), flag = 0) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]);
      x1 = Math.max(x1, pts[i]);
      y0 = Math.min(y0, pts[i + 1]);
      y1 = Math.max(y1, pts[i + 1]);
    }
    const n = pts.length / 2;
    const f = typeof tone === 'function';
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = pts[i * 2];
          const yi = pts[i * 2 + 1];
          const xj = pts[j * 2];
          const yj = pts[j * 2 + 1];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, ramp, f ? (tone as (x: number, y: number) => number)(x, y) : (tone as number), flag);
      }
    }
  }

  /** A hand-pixelled cluster (see CLUSTERS) at (x, y): paints `ramp` (0 = keep the ramp, shift tone by `tone`). */
  cluster(x: number, y: number, shape: number, ramp: number, tone: number, flag = 0) {
    const c = CLUSTERS[shape % CLUSTERS.length];
    for (let i = 0; i < c.length; i += 2) {
      if (ramp) this.set(x + c[i], y + c[i + 1], ramp, tone, flag);
      else this.shift(x + c[i], y + c[i + 1], tone);
    }
  }

  /**
   * Scatter `n` clusters in a rectangle: chips, pebbles, flecks, moss. `ramp` 0 =
   * shift the existing tones by `tone` (darker / lighter flecks of the surface).
   * `only` restricts them to texels of one ramp.
   */
  scatter(rng: PwRng, x: number, y: number, w: number, h: number, n: number, ramp: number, tone: number, o: { only?: number; flag?: number; shapes?: number } = {}) {
    const shapes = o.shapes ?? CLUSTERS.length;
    for (let k = 0; k < n; k++) {
      const cx = Math.floor(x + rng.next() * w);
      const cy = Math.floor(y + rng.next() * h);
      const s = Math.floor(rng.next() * shapes);
      if (o.only && this.at(cx, cy) !== o.only) continue;
      this.cluster(cx, cy, s, ramp, tone, o.flag ?? 0);
    }
  }

  /**
   * Vertical streaks (rain grime, rust runs, water stains): from (x, y) down `len`
   * texels, darkening by `dt`, breaking up into dither toward the end.
   */
  streak(rng: PwRng, x: number, y: number, len: number, dt: number, only = 0, width = 1) {
    for (let k = 0; k < len; k++) {
      const t = k / Math.max(1, len);
      for (let j = 0; j < width; j++) {
        const xx = x + j;
        // Ends break into a dither (fades out, never a hard bar).
        if (t > 0.55 && bayer(xx, y + k) < (t - 0.55) / 0.45) continue;
        this.shift(xx, y + k, dt, only);
      }
      if (rng.chance(0.06)) x += rng.chance(0.5) ? 1 : -1;
    }
  }

  /**
   * Selective outline for cut-out tiles (props, skyline silhouettes, signs): a
   * painted texel next to an empty one gets `tone` (step 0) on the right /
   * bottom (shadow side) — and on every side when `all`.
   */
  outline(tone = 0, all = false) {
    const { w, h } = this;
    const mark = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!this.ramp[i] || this.flag[i] & PWF.GLOW) continue;
        const eR = !this.at(x + 1, y);
        const eD = !this.at(x, y + 1);
        const eL = !this.at(x - 1, y);
        const eU = !this.at(x, y - 1);
        // 1-texel runs (wires, antennas, blades) stay as drawn.
        if ((eL && eR) || (eU && eD)) continue;
        if (eR || eD || (all && (eL || eU))) mark[i] = 1;
      }
    }
    for (let i = 0; i < w * h; i++) if (mark[i]) this.tone[i] = Math.min(this.tone[i], tone);
  }

  /** Copy another canvas in at (x, y) (empty texels of `src` leave this one as it is). */
  blit(src: PwCanvas, x: number, y: number) {
    for (let sy = 0; sy < src.h; sy++) {
      for (let sx = 0; sx < src.w; sx++) {
        const si = sy * src.w + sx;
        if (!src.ramp[si]) continue;
        this.set(x + sx, y + sy, src.ramp[si], src.tone[si], src.flag[si]);
      }
    }
  }

  /** Opaque fraction. */
  coverage(): number {
    let n = 0;
    for (let i = 0; i < this.ramp.length; i++) if (this.ramp[i]) n++;
    return n / this.ramp.length;
  }

  /**
   * Resolve to RGBA8, rows top-down: tone → the nearest ramp step, or (texels
   * flagged DITHER) a 4×4 ordered dither between the two steps around it.
   * Alpha: 0 = cut out, PW_GLOW_A = unlit glow, 255 = lit surface.
   */
  resolve(pal: PwPalette, out = new Uint8Array(this.w * this.h * 4)): Uint8Array {
    const { w, h } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const r = this.ramp[i];
        const q = i * 4;
        if (!r) {
          out[q] = out[q + 1] = out[q + 2] = out[q + 3] = 0;
          continue;
        }
        const ramp = pal.ramps[r - 1];
        let s = this.flag[i] & PWF.DITHER ? Math.floor(this.tone[i] + bayer(x, y)) : Math.floor(this.tone[i] + 0.5);
        s = s < 0 ? 0 : s > 5 ? 5 : s;
        const c = ramp[s];
        out[q] = (c >> 16) & 255;
        out[q + 1] = (c >> 8) & 255;
        out[q + 2] = c & 255;
        out[q + 3] = this.flag[i] & PWF.GLOW ? PW_GLOW_A : 255;
      }
    }
    return out;
  }
}

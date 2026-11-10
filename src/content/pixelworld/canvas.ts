import { FloraPalette, FloraRng, type FloraRampOptions } from '../pixel/floraPaint';
import { hexToOklch, oklchToHex } from '../../gameplay/pixel/materials';

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

/** World texel density of the first pass: texels per metre (one texel a frame pixel at 8 m). */
export const PW_TPM = 32;
/**
 * Density tiers (texels a metre; docs/PIXELWORLD2.md §3): pick a tile's `density` from the nearest
 * distance at which it is normally on screen — pixels per texel = 260 / (density × metres).
 * A tile painted below `PW_TPM_MID` is stored at 2× by the pixel-art upscaler (`upscale.ts`)
 * unless it opts out; one registered at `PW_TPM_MID` or more is stored as painted.
 */
export const PW_TPM_FAR = 32; // ≥ 6 m: upper storeys, the far side of a street, distant structures
export const PW_TPM_MID = 64; // 3–6 m: ground along the rail, ground-floor fronts, vehicles, big props
export const PW_TPM_NEAR = 96; // 1.8–3 m: corridor walls and floors, counters, doors you pass
export const PW_TPM_CLOSE = 128; // < 1.8 m: the player's vehicle, things brushing past the camera
/** The tier for a surface whose nearest normal view is `metres` away. */
export function pwDensityFor(metres: number): number {
  return metres >= 6 ? PW_TPM_FAR : metres >= 3 ? PW_TPM_MID : metres >= 1.8 ? PW_TPM_NEAR : PW_TPM_CLOSE;
}
/** Painted mip levels of a tile at its painted size (level 0 = full size). */
export const PW_LEVELS = 5;
/** Tile alignment in PAINTED texels: every level of every rect stays inside its own rect. */
export const PW_ALIGN = 1 << (PW_LEVELS - 1);
/** Alpha byte of an unlit (glowing) texel in a RESOLVED canvas (look-dev, tests); 255 = lit surface, 0 = cut out. */
export const PW_GLOW_A = 160;

/**
 * The stored texel: 16 bits of INDEX, never a colour — bits 0…11 the ramp id (0 = cut out), bits
 * 12…14 the painted tone (0…5), bit 15 glow (unlit). The colour comes from the atlas's palette:
 * a row a ramp, `PW_PAL_W` tones wide — the six painted tones in the middle (`PW_PAL_DEEP` …),
 * `PW_PAL_DEEP` deeper steps before them and `PW_PAL_BRIGHT` brighter ones after (`extendRamp`),
 * so light can move a texel along its own ramp by whole steps and stay a palette colour.
 */
export const PW_TONES = 6;
export const PW_PAL_DEEP = 5;
export const PW_PAL_BRIGHT = 5;
export const PW_PAL_W = PW_PAL_DEEP + PW_TONES + PW_PAL_BRIGHT;
/** Ramp ids 1…4095 (12 bits of the texel). */
export const PW_MAX_RAMPS = 4095;
export const PWI = {
  RAMP: 0x0fff,
  TONE_SHIFT: 12,
  TONE: 0x7000,
  GLOW: 0x8000,
} as const;
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
  /** The six painted tones of each ramp (index = id − 1). */
  readonly ramps: number[][] = [];
  private keys = new Map<string, number>();
  /**
   * The palette as the atlas stores and uploads it: RGBA8 (sRGB), `PW_PAL_W` texels a row, row
   * `id` = that ramp extended (row 0 unused). Grows with the ramps: read it afresh after an `add`.
   */
  rgba = new Uint8Array(64 * PW_PAL_W * 4);
  add(hex: number, o: FloraRampOptions = {}): number {
    const key = `${hex}|${o.dark ?? ''}|${o.light ?? ''}|${o.shift ?? ''}|${o.sat ?? ''}|${o.shadowHue ?? ''}|${o.cap ?? ''}`;
    let id = this.keys.get(key);
    if (id === undefined) {
      // One throwaway FLORA palette entry builds the ramp (same maths); recycle it when full.
      if (this.inner.ramps.length >= 250) this.inner = new FloraPalette();
      const r = this.inner.ramps[this.inner.add(hex, o) - 1];
      this.ramps.push(r);
      id = this.ramps.length;
      if (id > PW_MAX_RAMPS) throw new Error(`pixelworld palette full (${PW_MAX_RAMPS} ramps an atlas): reuse ramps or split the atlas`);
      this.keys.set(key, id);
      if ((id + 1) * PW_PAL_W * 4 > this.rgba.length) {
        const grown = new Uint8Array(this.rgba.length * 2);
        grown.set(this.rgba);
        this.rgba = grown;
      }
      const row = extendRamp(r);
      for (let i = 0; i < PW_PAL_W; i++) {
        const q = (id * PW_PAL_W + i) * 4;
        this.rgba[q] = (row[i] >> 16) & 255;
        this.rgba[q + 1] = (row[i] >> 8) & 255;
        this.rgba[q + 2] = row[i] & 255;
        this.rgba[q + 3] = 255;
      }
    }
    return id;
  }

  /** The stored palette, cut to its rows (a copy). */
  rows(): Uint8Array {
    return this.rgba.slice(0, (this.ramps.length + 1) * PW_PAL_W * 4);
  }
}

/** Hue `h` moved a fraction `t` of the way (the short way round) toward `target`, degrees. */
function hueToward(h: number, target: number, t: number): number {
  const d = ((target - h + 540) % 360) - 180;
  return (h + d * t + 360) % 360;
}

/** Where the deep end of every ramp heads: the night's own blue-violet (OKLCH chroma / hue), dark but never black. */
const DEEP_C = 0.058;
const DEEP_H = 285;
/** Where the bright end heads: a warm white a little short of white (OKLab L, a, b). */
const BRIGHT_L = 0.975;
const BRIGHT_A = 0.0;
const BRIGHT_B = 0.028;

/**
 * A painted six-tone ramp continued both ways into a `PW_PAL_W`-tone palette row, by the recipe
 * `makeRamp` built it with (gameplay/pixel/materials.ts: shadows cooler and richer, highlights
 * warmer and paler). Works from the ramp's own colours, so capped ramps (night plants) and custom
 * shadow hues continue from where they are.
 *  - Below tone 0 (the outline shade: already near the dark limit of most ramps) five even
 *    steps turn the hue round to blue-violet while the lightness sinks only as far as a deep
 *    indigo, lighter for a light material than for a dark one: night tones that stay apart by
 *    their colour where there is no lightness left to part them, never a grey-black.
 *  - Above tone 5 the steps climb toward a warm white, straight through the colour space (a
 *    sky blue pales to white before it warms, it does not turn mint on the way), each no more
 *    than a third of what is left — never pure white — and starting gently where the ramp's own
 *    top steps are small (a capped ramp).
 */
export function extendRamp(ramp: readonly number[]): number[] {
  const out: number[] = new Array(PW_PAL_W);
  for (let i = 0; i < PW_TONES; i++) out[PW_PAL_DEEP + i] = ramp[Math.min(i, ramp.length - 1)];
  const [L0, C0, h0] = hexToOklch(out[PW_PAL_DEEP]);
  // The deepest tone: 0.10 (a dark material) … 0.17 (a light one), always under tone 0.
  const deepL = Math.min(L0 * 0.92, Math.max(0.1, Math.min(0.17, L0 * 0.7)));
  for (let k = 1; k <= PW_PAL_DEEP; k++) {
    const t = k / PW_PAL_DEEP;
    const L = L0 + (deepL - L0) * t;
    const C = C0 + (DEEP_C - C0) * t;
    const h = C0 < 0.02 ? DEEP_H : hueToward(h0, DEEP_H, t * 0.92);
    out[PW_PAL_DEEP - k] = oklchToHex(L, C, h);
  }
  const top = PW_PAL_DEEP + PW_TONES - 1;
  const [L5, C5, h5] = hexToOklch(out[top]);
  const [L4] = hexToOklch(out[top - 1]);
  let L = L5;
  let A = C5 * Math.cos((h5 * Math.PI) / 180);
  let B = C5 * Math.sin((h5 * Math.PI) / 180);
  let step = Math.max(0.018, L5 - L4);
  for (let k = 1; k <= PW_PAL_BRIGHT; k++) {
    step = Math.min((BRIGHT_L - L) * 0.34, Math.max(0.03, step * 1.7));
    L += step;
    A += (BRIGHT_A - A) * 0.4;
    B += (BRIGHT_B - B) * 0.4;
    out[top + k] = oklchToHex(L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360);
  }
  return out;
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
   * The canvas as stored texels (`PWI`: ramp, tone step, glow), rows top-down: a tone goes to the
   * nearest ramp step, or (texels flagged DITHER) a 4×4 ordered dither between the two steps
   * around it. 0 = cut out. What the atlas packs; the palette turns it into colour.
   */
  index(out = new Uint16Array(this.w * this.h)): Uint16Array {
    const { w, h, ramp, tone, flag } = this;
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i++) {
        const r = ramp[i];
        if (!r) {
          out[i] = 0;
          continue;
        }
        const f = flag[i];
        let s = f & PWF.DITHER ? Math.floor(tone[i] + BAYER[(y & 3) * 4 + (x & 3)]) : Math.floor(tone[i] + 0.5);
        s = s < 0 ? 0 : s > 5 ? 5 : s;
        out[i] = r | (s << PWI.TONE_SHIFT) | (f & PWF.GLOW ? PWI.GLOW : 0);
      }
    }
    return out;
  }

  /**
   * Resolve to RGBA8, rows top-down (look-dev dumps, tests): the stored texels through the
   * palette. Alpha: 0 = cut out, PW_GLOW_A = unlit glow, 255 = lit surface.
   */
  resolve(pal: PwPalette, out = new Uint8Array(this.w * this.h * 4)): Uint8Array {
    return pwIndexToRgba(this.index(), pal.rgba, out);
  }
}

/** Stored texels → RGBA8 at their painted tone (alpha classes as `PwCanvas.resolve`): `pal` = palette rows (`PwPalette.rgba`). */
export function pwIndexToRgba(idx: Uint16Array, pal: Uint8Array, out = new Uint8Array(idx.length * 4)): Uint8Array {
  for (let i = 0; i < idx.length; i++) {
    const t = idx[i];
    const q = i * 4;
    if (!(t & PWI.RAMP)) {
      out[q] = out[q + 1] = out[q + 2] = out[q + 3] = 0;
      continue;
    }
    const p = pwPalAt(t);
    out[q] = pal[p];
    out[q + 1] = pal[p + 1];
    out[q + 2] = pal[p + 2];
    out[q + 3] = t & PWI.GLOW ? PW_GLOW_A : 255;
  }
  return out;
}

/** Byte offset in a palette (`PwPalette.rgba` / `PwAtlasData.pal`) of a stored texel's painted colour. */
export function pwPalAt(t: number): number {
  return ((t & PWI.RAMP) * PW_PAL_W + PW_PAL_DEEP + ((t & PWI.TONE) >> PWI.TONE_SHIFT)) * 4;
}

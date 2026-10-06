import { bayer, CLUSTERS, PWF, type PwCanvas, type PwRng } from './canvas';
import { hash2 } from './surfaces';

/**
 * HIGHWAY TO HELL (z3) painter helpers: wrapped drawing (wrap tiles draw
 * features across their seams), fast span fills straight into the canvas
 * arrays, hand-placed cluster scatters, rivets / bolts, rust runs and soot —
 * the shared vocabulary of the z3 painters (`z3*.ts`).
 */

export const h6 = (n: number) => n.toString(16).padStart(6, '0');

/** Wrapped coordinate. */
export const wrapI = (v: number, n: number) => ((v % n) + n) % n;

/** Set a texel with both coordinates wrapped (features crossing a wrap tile's seams). */
export function wset(c: PwCanvas, x: number, y: number, ramp: number, tone: number, flag = 0) {
  const i = wrapI(y | 0, c.h) * c.w + wrapI(x | 0, c.w);
  c.ramp[i] = ramp;
  c.tone[i] = tone;
  c.flag[i] = flag;
}

/** Shift a texel's tone, coordinates wrapped (0…5 clamped). */
export function wshift(c: PwCanvas, x: number, y: number, dt: number) {
  const i = wrapI(y | 0, c.h) * c.w + wrapI(x | 0, c.w);
  if (!c.ramp[i]) return;
  const t = c.tone[i] + dt;
  c.tone[i] = t < 0 ? 0 : t > 5 ? 5 : t;
}

/** Recolour a texel (keeps its tone ± dt), coordinates wrapped. */
export function wtint(c: PwCanvas, x: number, y: number, ramp: number, dt = 0) {
  const i = wrapI(y | 0, c.h) * c.w + wrapI(x | 0, c.w);
  if (!c.ramp[i]) return;
  c.ramp[i] = ramp;
  const t = c.tone[i] + dt;
  c.tone[i] = t < 0 ? 0 : t > 5 ? 5 : t;
}

/** Fill the whole canvas fast (one ramp / tone / flag). */
export function fill(c: PwCanvas, ramp: number, tone: number, flag = 0) {
  c.ramp.fill(ramp);
  c.tone.fill(tone);
  c.flag.fill(flag);
}

/** Hand-pixelled cluster (CLUSTERS) with wrapped coordinates: `ramp` 0 shifts the tone by `tone`. */
export function wcluster(c: PwCanvas, x: number, y: number, shape: number, ramp: number, tone: number, flag = 0) {
  const s = CLUSTERS[shape % CLUSTERS.length];
  for (let i = 0; i < s.length; i += 2) {
    if (ramp) wset(c, x + s[i], y + s[i + 1], ramp, tone, flag);
    else wshift(c, x + s[i], y + s[i + 1], tone);
  }
}

/**
 * Scatter `n` clusters over a rect (wrapped): only onto texels of `only` when
 * given. The flecks of a surface — chips, pits, pebbles, grit — placed by the
 * painter's own RNG (never per-texel noise).
 */
export function wscatter(c: PwCanvas, rng: PwRng, x: number, y: number, w: number, h: number, n: number, ramp: number, tone: number, o: { only?: number; shapes?: number; flag?: number } = {}) {
  const shapes = o.shapes ?? CLUSTERS.length;
  for (let k = 0; k < n; k++) {
    const cx = Math.floor(x + rng.next() * w);
    const cy = Math.floor(y + rng.next() * h);
    const s = Math.floor(rng.next() * shapes);
    if (o.only && c.ramp[wrapI(cy, c.h) * c.w + wrapI(cx, c.w)] !== o.only) continue;
    wcluster(c, cx, cy, s, ramp, tone, o.flag ?? 0);
  }
}

/** A meandering line (wrapped): `width` texels thick, tone per step from `toneAt(i)`. Returns the end point. */
export function wander(
  c: PwCanvas,
  rng: PwRng,
  x: number,
  y: number,
  len: number,
  dir: number,
  ramp: number,
  tone: number,
  o: { width?: number; jitter?: number; glint?: number; glintRamp?: number; lip?: number } = {},
): [number, number] {
  let a = dir;
  let px = x;
  let py = y;
  const wdt = o.width ?? 1;
  for (let i = 0; i < len; i++) {
    const ix = Math.round(px);
    const iy = Math.round(py);
    for (let k = 0; k < wdt; k++) {
      // Thickness across the run (perpendicular-ish: vertical for horizontal runs).
      const horiz = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
      wset(c, horiz ? ix : ix + k, horiz ? iy + k : iy, ramp, tone);
    }
    if (o.lip) wshift(c, ix + 1, iy + wdt, o.lip);
    if (o.glint && rng.chance(o.glint)) wset(c, ix, iy, o.glintRamp ?? ramp, tone + 2);
    a += rng.spread(o.jitter ?? 0.5);
    // Pull back toward the main direction (no curling up).
    a += (dir - a) * 0.18;
    px += Math.cos(a);
    py += Math.sin(a);
  }
  return [px, py];
}

/** Rivet / bolt head: a lit top-left texel over a shadow below-right. */
export function rivet(c: PwCanvas, x: number, y: number, ramp: number, base = 3) {
  c.set(x, y, ramp, Math.min(5, base + 1.5));
  c.shift(x + 1, y + 1, -1.2);
}

/** Rust run from (x, y) down `len` texels (orange-brown core, dithering out). */
export function rustRun(c: PwCanvas, rng: PwRng, x: number, y: number, len: number, rust: number) {
  let xx = x;
  for (let k = 0; k < len; k++) {
    const t = k / Math.max(1, len);
    if (t > 0.5 && bayer(xx, y + k) < (t - 0.5) * 2) continue;
    c.tint(xx, y + k, rust, k < 2 ? 0 : -0.3);
    if (rng.chance(0.08)) xx += rng.chance(0.5) ? 1 : -1;
  }
}

/** Soot bloom over a rect: darkens upward from the bottom-centre (ragged, dithered edge). */
export function sootBloom(c: PwCanvas, cx: number, by: number, rx: number, ry: number, k = 2.2) {
  for (let y = Math.max(0, Math.floor(by - ry)); y <= Math.min(c.h - 1, Math.ceil(by)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(c.w - 1, Math.ceil(cx + rx)); x++) {
      const u = (x - cx) / rx;
      const v = (by - y) / ry;
      const d = u * u * (1 + v) + v * v * 0.7;
      const j = hash2(x >> 1, y >> 1, 77) * 0.25;
      if (d + j > 1) continue;
      const s = (1 - d) * k;
      if (s < 0.6 && bayer(x, y) > s / 0.6) continue;
      c.shift(x, y, -Math.max(0.6, s));
    }
  }
}

/** Ordered-dither test for a fractional coverage `t` at (x, y). */
export const dith = (x: number, y: number, t: number) => bayer(x, y) < t;

/** Glow texel. */
export const G = PWF.GLOW;
/** Dither flag. */
export const D = PWF.DITHER;

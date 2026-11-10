import { PWF, PWI, type PwCanvas } from './canvas';

/**
 * The pixel-art upscaler: the 2× fallback for tiles still painted at the first pass's density
 * (docs/PIXELWORLD2.md §3). It gives a painted canvas at twice its size the way a pixel artist
 * would redraw it — not a filter: every output texel is a texel of the tile's own ramps.
 *
 *  - SHAPES are smoothed as EPX / Scale2x does: a corner of a texel goes to its two neighbours
 *    on that corner when they are the same and the texel's opposite neighbours are not — decided
 *    on EQUAL stored texels (ramp, tone step, glow), never on colour distance. A staircase
 *    becomes a diagonal, a blob gets round, a one-texel line stays one line.
 *  - ANTI-ALIASING: where such a corner lies between two tones of the SAME ramp at least two
 *    steps apart (both lit), it takes the tone in between instead of the neighbour's: the
 *    in-between step a pixel artist puts on a curve. One step apart, or across two ramps, there
 *    is no in-between: the corner is the neighbour's.
 *  - CUT-OUT edges stay crisp (empty is a texel like any other: corners are cut or filled whole);
 *    GLOW stays glow (a glowing corner is copied whole, never toned).
 *  - DITHER is redone at the new size, not magnified: texels flagged `PWF.DITHER` keep their
 *    fractional tone (carried toward their neighbours of the same band) and are resolved by the
 *    4×4 ordered dither on the 2× grid; a hand-made one-texel checker of two texels becomes a
 *    one-texel checker of the same two at 2×, not a board of 2×2 squares.
 *
 * `wrap`: the tile repeats (neighbours wrap round; else the edge repeats). `frames`: equal frames
 * stacked in the tile (an animated strip: each is smoothed on its own). `base`: the canvas as
 * stored texels (`c.index()`), when the caller has it; `out`: where to write (at least 4 × the
 * canvas). Returns stored texels (`PWI`), rows top-down.
 */
export function pwUpscale2x(c: PwCanvas, wrap: boolean, frames = 1, base: Uint16Array = c.index(), out = new Uint16Array(c.w * c.h * 4)): Uint16Array {
  const { w, h, ramp, tone, flag } = c;
  const W = w * 2;
  const n = w * h;
  // What "the same texel" means: the stored texel, or — inside a dithered band — the band itself.
  if (keyBuf.length < n) keyBuf = new Int32Array(n);
  const key = keyBuf;
  for (let i = 0; i < n; i++) key[i] = flag[i] & PWF.DITHER && ramp[i] ? BAND | ramp[i] | (flag[i] & PWF.GLOW ? BAND_GLOW : 0) : base[i];

  /** Texel `j` at fractional tone `t`, resolved by the ordered dither at (X, Y) of the 2× grid. */
  const dithered = (j: number, t: number, X: number, Y: number): number => {
    let s = Math.floor(t + BAYER[(Y & 3) * 4 + (X & 3)]);
    s = s < 0 ? 0 : s > 5 ? 5 : s;
    return ramp[j] | (s << PWI.TONE_SHIFT) | (flag[j] & PWF.GLOW ? PWI.GLOW : 0);
  };
  /** A corner of texel `i` (key `kp`) taken from neighbour `j`: its texel — or the tone between the two, on one ramp two steps or more apart. */
  const from = (kp: number, j: number, X: number, Y: number): number => {
    const kj = key[j];
    if (kj >= BAND) return dithered(j, tone[j], X, Y);
    if (kp && kp < BAND && kj && ((kp ^ kj) & (PWI.RAMP | PWI.GLOW)) === 0 && !(kp & PWI.GLOW)) {
      const tp = (kp & PWI.TONE) >> PWI.TONE_SHIFT;
      const d = ((kj & PWI.TONE) >> PWI.TONE_SHIFT) - tp;
      if (d >= 2 || d <= -2) return (kp & ~PWI.TONE) | ((tp + Math.trunc(d / 2)) << PWI.TONE_SHIFT);
    }
    return kj;
  };

  const fh = frames > 1 && h % frames === 0 ? h / frames : h;
  for (let y = 0; y < h; y++) {
    const f0 = y - (y % fh);
    const f1 = f0 + fh - 1;
    const yu = (y > f0 ? y - 1 : wrap ? f1 : f0) * w;
    const yd = (y < f1 ? y + 1 : wrap ? f0 : f1) * w;
    const yc = y * w;
    for (let x = 0; x < w; x++) {
      const xl = x > 0 ? x - 1 : wrap ? w - 1 : 0;
      const xr = x < w - 1 ? x + 1 : wrap ? 0 : w - 1;
      const i = yc + x;
      const kp = key[i];
      const ka = key[yu + x];
      const kb = key[yc + xr];
      const kc = key[yc + xl];
      const kd = key[yd + x];
      const o = y * 2 * W + x * 2;
      if (kp < BAND) {
        // Flat inside (most texels): four times itself.
        if (ka === kp && kb === kp && kc === kp && kd === kp) {
          out[o] = out[o + 1] = out[o + W] = out[o + W + 1] = kp;
          continue;
        }
        // A cell of a hand-made checker (every side the other texel, the diagonals its own): the same checker, finer.
        if (ka !== kp && ka === kb && ka === kc && ka === kd && ka < BAND) {
          const mine = (key[yu + xl] === kp ? 1 : 0) + (key[yu + xr] === kp ? 1 : 0) + (key[yd + xl] === kp ? 1 : 0) + (key[yd + xr] === kp ? 1 : 0);
          if (mine >= 3) {
            // (The lower texel value on the even sub-texels: both texels of the pair decide alike.)
            const even = kp < ka ? kp : ka;
            const odd = kp < ka ? ka : kp;
            out[o] = out[o + W + 1] = even;
            out[o + 1] = out[o + W] = odd;
            continue;
          }
        }
      }
      // EPX: each corner from the two neighbours on it, when they agree and the opposite ones do not.
      const j1 = kc === ka && kc !== kd && ka !== kb ? yu + x : i;
      const j2 = ka === kb && ka !== kc && kb !== kd ? yc + xr : i;
      const j3 = kd === kc && kd !== kb && kc !== ka ? yc + xl : i;
      const j4 = kb === kd && kb !== ka && kd !== kc ? yd + x : i;
      if (kp < BAND) {
        out[o] = j1 === i ? kp : from(kp, j1, x * 2, y * 2);
        out[o + 1] = j2 === i ? kp : from(kp, j2, x * 2 + 1, y * 2);
        out[o + W] = j3 === i ? kp : from(kp, j3, x * 2, y * 2 + 1);
        out[o + W + 1] = j4 === i ? kp : from(kp, j4, x * 2 + 1, y * 2 + 1);
        continue;
      }
      // A texel of a dithered band: its own corners carry its tone a quarter of the way toward
      // the neighbours of the same band on that corner, and are dithered on the 2× grid.
      const tp = tone[i];
      const tl = kc === kp ? tone[yc + xl] : tp;
      const tr = kb === kp ? tone[yc + xr] : tp;
      const tu = ka === kp ? tone[yu + x] : tp;
      const td = kd === kp ? tone[yd + x] : tp;
      const tul = key[yu + xl] === kp ? tone[yu + xl] : tp;
      const tur = key[yu + xr] === kp ? tone[yu + xr] : tp;
      const tdl = key[yd + xl] === kp ? tone[yd + xl] : tp;
      const tdr = key[yd + xr] === kp ? tone[yd + xr] : tp;
      out[o] = j1 === i ? dithered(i, (9 * tp + 3 * tl + 3 * tu + tul) / 16, x * 2, y * 2) : from(kp, j1, x * 2, y * 2);
      out[o + 1] = j2 === i ? dithered(i, (9 * tp + 3 * tr + 3 * tu + tur) / 16, x * 2 + 1, y * 2) : from(kp, j2, x * 2 + 1, y * 2);
      out[o + W] = j3 === i ? dithered(i, (9 * tp + 3 * tl + 3 * td + tdl) / 16, x * 2, y * 2 + 1) : from(kp, j3, x * 2, y * 2 + 1);
      out[o + W + 1] = j4 === i ? dithered(i, (9 * tp + 3 * tr + 3 * td + tdr) / 16, x * 2 + 1, y * 2 + 1) : from(kp, j4, x * 2 + 1, y * 2 + 1);
    }
  }
  return out;
}

/** Keys of dithered bands sit above every stored texel (16 bits). */
const BAND = 0x10000;
const BAND_GLOW = 0x20000;
/** 4×4 Bayer thresholds in [0, 1) (as `canvas.ts`). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** Scratch (painting is single-threaded): the keys of the canvas being upscaled. */
let keyBuf = new Int32Array(0);

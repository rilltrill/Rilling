import type { PwCanvas } from './canvas';

/**
 * The pixel-art upscaler: a painted canvas at twice its size, as stored texels (`PWI`, rows
 * top-down). `wrap`: the tile repeats (neighbours wrap round); `frames`: equal frames stacked
 * in it (an animated strip: each is smoothed on its own).
 */
export function pwUpscale2x(c: PwCanvas, wrap: boolean, frames = 1): Uint16Array {
  void wrap;
  void frames;
  // (Placeholder while the formats land: every texel four times.)
  const src = c.index();
  const { w, h } = c;
  const out = new Uint16Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = src[y * w + x];
      const o = y * 2 * w * 2 + x * 2;
      out[o] = out[o + 1] = out[o + w * 2] = out[o + w * 2 + 1] = t;
    }
  }
  return out;
}

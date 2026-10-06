import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2 } from './surfaces';

/**
 * MAIN STREET's fires in ART: PIXEL WORLD (the burning car, the trash-can
 * fire, the bus's engine, the gas station once it goes up): a hand-drawn
 * flame as an animated strip — tongues licking up out of a white-hot base,
 * breaking off into rising blobs at the top, the colour bands stepped (white
 * core, yellow, orange, blood red) with an ordered dither on each boundary,
 * the way Metal Slug and Final Fight draw fire. Drawn on crossed cut-out
 * cards with `pwMaterial(atlas, { anim: { frames: Z1_FLAME_FRAMES, fps } })`.
 */

export const Z1_FLAME_FRAMES = 8;
/** One frame (texels): 1 × 1.75 m at 32 texels a metre. */
export const Z1_FLAME_W = 32;
export const Z1_FLAME_H = 56;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The flame strip (`variant` 0 / 1: two out-of-step fires so neighbours never flicker together). */
export function z1FlameTile(atlas: PwAtlas, variant: number): PwTile {
  return atlas.tile(`z1fire|${variant}|${Z1_FLAME_FRAMES}`, Z1_FLAME_W, Z1_FLAME_H * Z1_FLAME_FRAMES, (c, k) => paintFlames(c, k, variant));
}

function paintFlames(c: PwCanvas, k: PwKit, variant: number) {
  const F = Z1_FLAME_FRAMES;
  const W = Z1_FLAME_W;
  const FH = Z1_FLAME_H;
  const core = k.ramp(0xfff4c0, { light: 0.3, sat: 0.9 });
  const yel = k.ramp(0xffc838, { light: 0.4, sat: 1.1 });
  const org = k.ramp(0xff6a14, { light: 0.45, sat: 1.15 });
  const red = k.ramp(0xc8280a, { light: 0.45, sat: 1.1 });
  const G = PWF.GLOW;
  // Periodic value noise rising through the loop: cells 6 × 7 texels, the y lattice wraps every F frames.
  const CW = 6;
  const CH = 7;
  const NY = (FH / CH) | 0; // 8 cells: the noise scrolls one cell a frame and wraps after F frames
  const lattice = (ix: number, iy: number) => hash2(ix, ((iy % NY) + NY) % NY, 41 + variant * 7);
  const noise = (x: number, y: number) => {
    const fx = x / CW;
    const fy = y / CH;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = lattice(ix, iy) + (lattice(ix + 1, iy) - lattice(ix, iy)) * sx;
    const b = lattice(ix, iy + 1) + (lattice(ix + 1, iy + 1) - lattice(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  };
  for (let f = 0; f < F; f++) {
    const y0 = c.h - (f + 1) * FH;
    const ph = ((f + variant * 3) / F) * Math.PI * 2;
    for (let yl = 0; yl < FH; yl++) {
      const vt = FH - 1 - yl; // 0 = the base
      const h = vt / FH;
      // The body sways as a whole, more toward the tip.
      const sway = Math.sin(h * 4.2 - ph) * 0.09 * h + Math.sin(ph + variant) * 0.03 * h;
      const half = 0.44 * Math.pow(1 - h, 0.7) + 0.04;
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W - 0.5 - sway;
        // Rising turbulence (scrolls up a cell a frame: the strip loops seamlessly).
        const n = noise(x, vt - f * CH);
        const body = 1 - Math.abs(u) / half;
        let heat = body * (1.05 - h * 0.9) + (n - 0.5) * 0.7 - h * 0.15;
        // Tongues: three lobes reaching up between the turbulence.
        heat += Math.max(0, Math.cos((u * 3 + Math.sin(ph + h * 3) * 0.3) * Math.PI)) * 0.18 * h;
        const d = (BAYER[(vt & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
        const t = heat + d * 0.12;
        if (t > 0.8) c.set(x, y0 + yl, core, 4, G);
        else if (t > 0.58) c.set(x, y0 + yl, yel, 3, G);
        else if (t > 0.34) c.set(x, y0 + yl, org, 3, G);
        else if (t > 0.14) c.set(x, y0 + yl, red, 2, G);
      }
    }
    // Blobs breaking off the tips and rising (one cycle per loop), and a few sparks.
    for (let i = 0; i < 3; i++) {
      const p = (f / F + i / 3 + variant * 0.17) % 1;
      const by = Math.round(FH * (0.55 + p * 0.42));
      const bx = Math.round(W * (0.3 + 0.2 * i + Math.sin(p * 6 + i) * 0.05));
      const r = 2.2 * (1 - p);
      for (let yy = -2; yy <= 2; yy++) {
        for (let xx = -2; xx <= 2; xx++) {
          if (xx * xx + yy * yy > r * r) continue;
          const vt = by + yy;
          if (vt < 0 || vt >= FH) continue;
          c.set(bx + xx, y0 + FH - 1 - vt, p > 0.6 ? red : org, p > 0.6 ? 2 : 3, G);
        }
      }
    }
    for (let i = 0; i < 4; i++) {
      const vt = Math.floor(FH * (0.6 + hash2(i, f, 9 + variant) * 0.38));
      c.set(Math.floor(hash2(i, f, 11 + variant) * W), y0 + FH - 1 - vt, yel, 4, G);
    }
  }
}

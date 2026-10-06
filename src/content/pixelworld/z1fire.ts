import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwAtlasData, PwKit, PwTile } from './atlas';
import { hash2 } from './surfaces';

/**
 * MAIN STREET's fires in ART: PIXEL WORLD (the burning car, the trash-can
 * fire, the bus's engine, the gas station once it goes up): a hand-drawn
 * flame as an animated strip, the way Metal Slug and Final Fight draw fire —
 * three separate tongues (the middle one tallest) licking up out of a narrow
 * white-hot base, each its own lick of heat that sways, stretches and tears off
 * a blob at its tip; the colour bands stepped (white core, yellow, orange,
 * blood red) with an ordered dither on each boundary and a dark-red rim on the
 * outside so the silhouette stays crisp against the night. Drawn on crossed
 * cut-out cards with `pwMaterial(atlas, { anim: { frames: Z1_FLAME_FRAMES, fps } })`.
 *
 * The strips live in their own atlas whose coarse levels are rebuilt by
 * COVERAGE (`z1FlameLevels`): a level texel is a flame only when at least half
 * of the full-size texels under it are — so a distant fire keeps its tapered
 * shape instead of swelling into a solid block (the shared levels let a lone
 * glow texel win over cut-out, which is right for neon but fills a flame in).
 */

export const Z1_FLAME_FRAMES = 8;
/** One frame (texels): 1 × 1.75 m at 32 texels a metre. */
export const Z1_FLAME_W = 32;
export const Z1_FLAME_H = 56;
/** Levels of the fire atlas: 0…3 (56-texel frames stay whole down to level 3). */
export const Z1_FLAME_LEVELS = 4;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The flame strip (`variant` 0 / 1: two out-of-step fires so neighbours never flicker together). */
export function z1TongueFlameTile(atlas: PwAtlas, variant: number): PwTile {
  return atlas.tile(`z1fire2|${variant}|${Z1_FLAME_FRAMES}`, Z1_FLAME_W, Z1_FLAME_H * Z1_FLAME_FRAMES, (c, k) => paintTongues(c, k, variant));
}

function paintTongues(c: PwCanvas, k: PwKit, variant: number) {
  const F = Z1_FLAME_FRAMES;
  const W = Z1_FLAME_W;
  const FH = Z1_FLAME_H;
  const core = k.ramp(0xfff4c0, { light: 0.3, sat: 0.9 });
  const yel = k.ramp(0xffc838, { light: 0.4, sat: 1.1 });
  const org = k.ramp(0xff6a14, { light: 0.45, sat: 1.15 });
  const red = k.ramp(0xc8280a, { light: 0.45, sat: 1.1 });
  const G = PWF.GLOW;
  // Periodic value noise rising through the loop: cells 5 × 7 texels, the y lattice wraps every F frames.
  const CW = 5;
  const CH = 7;
  const NY = (FH / CH) | 0;
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
  // Heat field per frame (0 = none), then banded and rimmed.
  const heat = new Float32Array(W * FH);
  for (let f = 0; f < F; f++) {
    const y0 = c.h - (f + 1) * FH;
    const ph = ((f + variant * 3) / F) * Math.PI * 2;
    // Three tongues: x centre (0…1), base half-width, height (0…1 of the frame), each on its own beat.
    const tongues = [
      { x: 0.5 + Math.sin(ph) * 0.03, hw: 0.27, h: 0.86 + Math.sin(ph * 2 + variant) * 0.1 },
      { x: 0.29 + Math.sin(ph + 2.1) * 0.04, hw: 0.19, h: 0.56 + Math.sin(ph * 2 + 1.7 + variant) * 0.14 },
      { x: 0.71 + Math.sin(ph + 4.2) * 0.04, hw: 0.19, h: 0.62 + Math.sin(ph * 2 + 3.9 + variant) * 0.13 },
    ];
    heat.fill(0);
    for (let vt = 0; vt < FH; vt++) {
      const h = vt / FH; // 0 = the base
      for (let x = 0; x < W; x++) {
        const xn = (x + 0.5) / W;
        const n = noise(x, vt - f * CH);
        let best = 0;
        for (const tg of tongues) {
          if (h > tg.h) continue;
          const t = h / tg.h;
          // The tongue leans and S-curves toward its tip.
          const cx = tg.x + Math.sin(t * 3.2 - ph * 1.3 + tg.x * 9) * 0.07 * t;
          // Fat at the root, a long taper to a point (the body pinches in below the tip).
          const hw = tg.hw * (1 - t) ** 0.7 * (1 + 0.3 * Math.sin(t * Math.PI));
          if (hw <= 0) continue;
          const body = 1 - Math.abs(xn - cx) / hw;
          if (body <= 0) continue;
          best = Math.max(best, body * (1 - t * 0.55));
        }
        if (best <= 0) continue;
        // Rising turbulence eats into the edges (scrolls a cell a frame: the strip loops seamlessly).
        const v = best + (n - 0.5) * 0.42 * (0.3 + h);
        // Hottest low in the middle.
        heat[vt * W + x] = v > 0.12 ? v + Math.max(0, 0.3 - h) * 0.6 : 0;
      }
    }
    // Blobs tearing off the tips and rising (one cycle per loop).
    for (let i = 0; i < 3; i++) {
      const p = (f / F + i / 3 + variant * 0.17) % 1;
      const by = FH * (0.6 + p * 0.38);
      const bx = W * ([0.5, 0.32, 0.68][i] + Math.sin(p * 6 + i) * 0.05);
      const r = 2.4 * (1 - p) + 0.6;
      for (let yy = Math.floor(by - r); yy <= Math.ceil(by + r); yy++) {
        for (let xx = Math.floor(bx - r); xx <= Math.ceil(bx + r); xx++) {
          if (yy < 0 || yy >= FH || xx < 0 || xx >= W) continue;
          if ((xx + 0.5 - bx) ** 2 + ((yy + 0.5 - by) * 0.8) ** 2 > r * r) continue;
          heat[yy * W + xx] = Math.max(heat[yy * W + xx], p > 0.55 ? 0.2 : 0.4);
        }
      }
    }
    for (let vt = 0; vt < FH; vt++) {
      for (let x = 0; x < W; x++) {
        const hv = heat[vt * W + x];
        if (hv <= 0) continue;
        const yy = y0 + FH - 1 - vt;
        const d = (BAYER[(vt & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
        const t = hv + d * 0.1;
        // A dark-red rim wherever the flame meets the night (the silhouette reads at every size).
        const edge = !(x > 0 && heat[vt * W + x - 1] > 0) || !(x < W - 1 && heat[vt * W + x + 1] > 0) || !(vt < FH - 1 && heat[(vt + 1) * W + x] > 0);
        if (edge) c.set(x, yy, red, 1, G);
        else if (t > 0.92) c.set(x, yy, core, 4, G);
        else if (t > 0.66) c.set(x, yy, yel, 3, G);
        else if (t > 0.4) c.set(x, yy, org, 3, G);
        else c.set(x, yy, red, 2, G);
      }
    }
    // A few sparks over the tips.
    for (let i = 0; i < 3; i++) {
      const vt = Math.floor(FH * (0.7 + hash2(i, f, 9 + variant) * 0.28));
      c.set(Math.floor(W * (0.25 + hash2(i, f, 11 + variant) * 0.5)), y0 + FH - 1 - vt, yel, 4, G);
    }
  }
}

const levelled = new WeakSet<PwAtlasData>();

/**
 * Rebuild the coarse levels of the flame strips by coverage (call after the
 * fire atlas is built, before its texture is made): each level texel covers
 * a 2^l square of full-size texels; it is cut out unless at least half of them
 * are flame, else it takes the full-size texel nearest their average colour.
 * Idempotent (the painted atlas is cached across stage loads).
 */
export function z1FlameLevels(data: PwAtlasData, tiles: readonly PwTile[]) {
  if (levelled.has(data)) return;
  levelled.add(data);
  const L0 = data.levels[0];
  const W0 = L0.width;
  const src = L0.data;
  for (let l = 1; l < Math.min(Z1_FLAME_LEVELS, data.levels.length); l++) {
    const lv = data.levels[l];
    const s = 1 << l;
    for (const t of tiles) {
      const x0 = t.x >> l;
      const y0 = t.y >> l;
      const w = Math.ceil(t.w / s);
      const h = Math.ceil(t.h / s);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let n = 0;
          let on = 0;
          let r = 0;
          let g = 0;
          let b = 0;
          for (let yy = 0; yy < s; yy++) {
            const sy = t.y + y * s + yy;
            if (sy >= t.y + t.h) continue;
            for (let xx = 0; xx < s; xx++) {
              const sx = t.x + x * s + xx;
              if (sx >= t.x + t.w) continue;
              n++;
              const i = (sy * W0 + sx) * 4;
              if (src[i + 3] === 0) continue;
              on++;
              r += src[i];
              g += src[i + 1];
              b += src[i + 2];
            }
          }
          const di = ((y0 + y) * lv.width + x0 + x) * 4;
          if (on * 2 < n || on === 0) {
            lv.data[di] = lv.data[di + 1] = lv.data[di + 2] = lv.data[di + 3] = 0;
            continue;
          }
          r /= on;
          g /= on;
          b /= on;
          let best = -1;
          let bd = Infinity;
          for (let yy = 0; yy < s; yy++) {
            const sy = t.y + y * s + yy;
            if (sy >= t.y + t.h) continue;
            for (let xx = 0; xx < s; xx++) {
              const sx = t.x + x * s + xx;
              if (sx >= t.x + t.w) continue;
              const i = (sy * W0 + sx) * 4;
              if (src[i + 3] === 0) continue;
              const d = (src[i] - r) ** 2 + (src[i + 1] - g) ** 2 + (src[i + 2] - b) ** 2;
              if (d < bd) {
                bd = d;
                best = i;
              }
            }
          }
          lv.data[di] = src[best];
          lv.data[di + 1] = src[best + 1];
          lv.data[di + 2] = src[best + 2];
          lv.data[di + 3] = src[best + 3];
        }
      }
    }
  }
}

// ─── The first flame (z3) ──────────────────────────────────────────────────

/**
 * The first flame strip (a single licking body; z3 draws its fires with it).
 * `variant` 0 / 1: two out-of-step fires.
 */
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

import type { PwAtlasData, PwTile } from './atlas';
import { PW_LEVELS, type PwCanvas } from './canvas';

/**
 * HIGHWAY TO HELL (z3) — letters that survive the distance.
 *
 * The toolkit's levels pick, per 2×2, the texel nearest their average: a bar of
 * a letter one texel thick at a level (the E's middle bar, the Z's foot) ties
 * with the board round it and drops out — "SAFE ZONE" turns into "SAFT 7ONE"
 * two levels down. Sign painters mark their INK (the letters, the border) in a
 * mask (`z3Ink`); after the atlas is painted `z3InkLevels` re-makes levels 1…n
 * of those tiles so that a 2×2 holding two or more ink texels stays ink (the
 * ink texel nearest the ink's own average: a real colour of the letters, never
 * a blend), and the ink mask itself goes down the levels the same way. Boards,
 * dirt and bolts keep the toolkit's pick. Runs once per painted atlas (the
 * atlas cache keeps the result: a RETRY / RESTART reuses it).
 */

/** Ink masks by tile key (row 0 = the tile's top row, as painted). */
const INK = new Map<string, Uint8Array>();
const done = new WeakSet<PwAtlasData>();

/** Test hook (filled only when `z3InkLevels` is asked to): the ink masks of the last pass by tile key (level 0, 1, …; atlas orientation, rows bottom-up). */
export const Z3_INK_DEBUG = new Map<string, { w: number; h: number; mask: Uint8Array }[]>();

/** Bench hook: ms of the last ink pass. */
export const Z3_INK_STATS = { ms: 0, tiles: 0 };

/** Record the ink of a painted sign: every texel painted in one of `ramps` (call at the end of the painter). */
export function z3Ink(key: string, c: PwCanvas, ramps: readonly number[]) {
  const m = new Uint8Array(c.w * c.h);
  const r = c.ramp;
  for (let i = 0; i < m.length; i++) {
    const v = r[i];
    if (!v) continue;
    for (let k = 0; k < ramps.length; k++) {
      if (ramps[k] === v) {
        m[i] = 1;
        break;
      }
    }
  }
  INK.set(key, m);
}

function dist2(S: Uint8Array | Uint8ClampedArray, i: number, r: number, g: number, b: number): number {
  const dr = S[i] - r;
  const dg = S[i + 1] - g;
  const db = S[i + 2] - b;
  return dr * dr + dg * dg + db * db;
}

/** Re-make the levels of every marked tile of `tiles` (after `atlas.build()`; `debug` keeps the masks in `Z3_INK_DEBUG`). */
export function z3InkLevels(d: PwAtlasData, tiles: Iterable<PwTile>, levels = PW_LEVELS, debug = false) {
  Z3_INK_STATS.ms = 0;
  Z3_INK_STATS.tiles = 0;
  if (done.has(d)) return;
  Z3_INK_DEBUG.clear();
  done.add(d);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  for (const t of tiles) {
    const m0 = INK.get(t.key);
    if (!m0 || t.x < 0) continue;
    Z3_INK_STATS.tiles++;
    // The mask in atlas orientation (rows bottom-up), at level 0.
    let w = t.w;
    let h = t.h;
    let mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) mask.set(m0.subarray((h - 1 - y) * w, (h - y) * w), y * w);
    const dbg = debug ? [{ w, h, mask }] : null;
    if (dbg) Z3_INK_DEBUG.set(t.key, dbg);
    for (let l = 1; l < Math.min(levels, d.levels.length); l++) {
      const src = d.levels[l - 1];
      const dst = d.levels[l];
      const lw = w >> 1;
      const lh = h >> 1;
      if (lw < 1 || lh < 1) break;
      const next = new Uint8Array(lw * lh);
      const sx0 = t.x >> (l - 1);
      const sy0 = t.y >> (l - 1);
      const dx0 = t.x >> l;
      const dy0 = t.y >> l;
      const S = src.data;
      const D = dst.data;
      const sw = src.width;
      for (let y = 0; y < lh; y++) {
        for (let x = 0; x < lw; x++) {
          const m = (y * 2) * w + x * 2;
          const k0 = mask[m];
          const k1 = mask[m + 1];
          const k2 = mask[m + w];
          const k3 = mask[m + w + 1];
          if (k0 + k1 + k2 + k3 < 2) continue;
          next[y * lw + x] = 1;
          // The ink texel nearest the ink's average colour (inline: no closures in the hot loop).
          const i0 = ((sy0 + y * 2) * sw + sx0 + x * 2) * 4;
          const i1 = i0 + 4;
          const i2 = i0 + sw * 4;
          const i3 = i2 + 4;
          const u0 = k0 && S[i0 + 3] ? 1 : 0;
          const u1 = k1 && S[i1 + 3] ? 1 : 0;
          const u2 = k2 && S[i2 + 3] ? 1 : 0;
          const u3 = k3 && S[i3 + 3] ? 1 : 0;
          const n = u0 + u1 + u2 + u3;
          if (!n) continue;
          const r = (u0 * S[i0] + u1 * S[i1] + u2 * S[i2] + u3 * S[i3]) / n;
          const g = (u0 * S[i0 + 1] + u1 * S[i1 + 1] + u2 * S[i2 + 1] + u3 * S[i3 + 1]) / n;
          const b = (u0 * S[i0 + 2] + u1 * S[i1 + 2] + u2 * S[i2 + 2] + u3 * S[i3 + 2]) / n;
          let best = -1;
          let bd = Infinity;
          if (u0) {
            const dd = dist2(S, i0, r, g, b);
            if (dd < bd) {
              bd = dd;
              best = i0;
            }
          }
          if (u1) {
            const dd = dist2(S, i1, r, g, b);
            if (dd < bd) {
              bd = dd;
              best = i1;
            }
          }
          if (u2) {
            const dd = dist2(S, i2, r, g, b);
            if (dd < bd) {
              bd = dd;
              best = i2;
            }
          }
          if (u3 && dist2(S, i3, r, g, b) < bd) best = i3;
          const di = ((dy0 + y) * dst.width + dx0 + x) * 4;
          D[di] = S[best];
          D[di + 1] = S[best + 1];
          D[di + 2] = S[best + 2];
          D[di + 3] = S[best + 3];
        }
      }
      mask = next;
      w = lw;
      h = lh;
      dbg?.push({ w, h, mask });
    }
  }
  Z3_INK_STATS.ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
}

/**
 * Snap a glyph origin so the letters' font pixels line up with the level grid (scale 4: whole
 * 4×4 blocks at level 2; scale 2–3: 2×2 at level 1): x to a multiple, y so that the tile's
 * bottom-up rows line up (`h` = the tile's height). A level texel is then one font pixel.
 */
export function z3SnapGlyph(x: number, y: number, scale: number, h: number): [number, number] {
  const a = scale >= 4 ? 4 : scale >= 2 ? 2 : 1;
  const sx = Math.round(x / a) * a;
  // Rows: the glyph's top row y must leave (h − y) a multiple of a.
  const sy = h - Math.round((h - y) / a) * a;
  return [sx, sy];
}

import { pwTileLevel, type PwAtlasData, type PwTile } from './atlas';
import { PW_LEVELS, pwPalAt, type PwCanvas } from './canvas';

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
 * dirt and bolts keep the toolkit's pick. Levels are the tile's PAINTED levels
 * (`pwTileLevel`: the upscaler's copy of a tile stored at 2× is not touched).
 * Runs once per painted atlas (the atlas cache keeps the result: a RETRY /
 * RESTART reuses it).
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

/** Squared distance of a texel's painted colour (palette `P`) to (r, g, b). */
function dist2(P: Uint8Array, t: number, r: number, g: number, b: number): number {
  const q = pwPalAt(t);
  const dr = P[q] - r;
  const dg = P[q + 1] - g;
  const db = P[q + 2] - b;
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
  const P = d.pal;
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
    for (let l = 1; l < levels; l++) {
      const src = pwTileLevel(d, t, l - 1);
      const dst = pwTileLevel(d, t, l);
      if (!src || !dst) break;
      const lw = w >> 1;
      const lh = h >> 1;
      if (lw < 1 || lh < 1) break;
      const next = new Uint8Array(lw * lh);
      const S = src.idx;
      const D = dst.idx;
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
          const i0 = (src.y + y * 2) * sw + src.x + x * 2;
          const s0 = S[i0];
          const s1 = S[i0 + 1];
          const s2 = S[i0 + sw];
          const s3 = S[i0 + sw + 1];
          const u0 = k0 && s0 ? 1 : 0;
          const u1 = k1 && s1 ? 1 : 0;
          const u2 = k2 && s2 ? 1 : 0;
          const u3 = k3 && s3 ? 1 : 0;
          const n = u0 + u1 + u2 + u3;
          if (!n) continue;
          const q0 = pwPalAt(s0);
          const q1 = pwPalAt(s1);
          const q2 = pwPalAt(s2);
          const q3 = pwPalAt(s3);
          const r = (u0 * P[q0] + u1 * P[q1] + u2 * P[q2] + u3 * P[q3]) / n;
          const g = (u0 * P[q0 + 1] + u1 * P[q1 + 1] + u2 * P[q2 + 1] + u3 * P[q3 + 1]) / n;
          const b = (u0 * P[q0 + 2] + u1 * P[q1 + 2] + u2 * P[q2 + 2] + u3 * P[q3 + 2]) / n;
          let best = 0;
          let bd = Infinity;
          if (u0) {
            const dd = dist2(P, s0, r, g, b);
            if (dd < bd) {
              bd = dd;
              best = s0;
            }
          }
          if (u1) {
            const dd = dist2(P, s1, r, g, b);
            if (dd < bd) {
              bd = dd;
              best = s1;
            }
          }
          if (u2) {
            const dd = dist2(P, s2, r, g, b);
            if (dd < bd) {
              bd = dd;
              best = s2;
            }
          }
          if (u3 && dist2(P, s3, r, g, b) < bd) best = s3;
          D[(dst.y + y) * dst.width + dst.x + x] = best;
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

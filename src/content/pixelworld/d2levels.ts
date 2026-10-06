import type { PwAtlasData, PwTile } from './atlas';

/**
 * RESEARCH LABS — calm far levels for tileable surfaces.
 *
 * The toolkit's levels pick, per 2×2, the source texel nearest their average:
 * perfect for modules (signs keep whole letters), but a fine regular pattern
 * (grating bars, grout, chequer, cladding ribs) reduces to a pattern of the
 * same contrast at every level — whichever texel a block lands on — and it
 * crawls when the camera moves. For WRAP tiles this re-makes levels 2…n
 * (level 1 keeps the toolkit's picks: real texels, half size) as the colour
 * of the surface seen from afar: the mean over the block AND its neighbours
 * (a 1-2-1 tent on the level's own grid, wrapped like the tile), snapped to
 * the nearest colour the tile itself is painted in. A regular pattern collapses
 * into its own mid-tone instead of alternating; slabs, stains and big
 * features (wider than a level texel) survive.
 *
 * Runs once per painted atlas (the atlas cache keeps the result: a RETRY /
 * RESTART reuses it). Only opaque wrap tiles (no cut-out / glow texels).
 * Reads level 1 (a quarter of level 0's data); allocation-light: one set of
 * scratch buffers for the whole pass.
 */

const done = new WeakSet<PwAtlasData>();

/** Bench hook: ms spent by the last calm-levels pass (0 when the cached atlas was already done). */
export const D2_LEVEL_STATS = { ms: 0 };

/** Snap memo: 15-bit colour key → palette colour, stamped per tile (no clearing). */
const memoVal = new Int32Array(32768);
const memoGen = new Int32Array(32768);
let gen = 0;

export function d2CalmLevels(d: PwAtlasData, tiles: Iterable<PwTile>) {
  D2_LEVEL_STATS.ms = 0;
  if (done.has(d)) return;
  done.add(d);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (d.levels.length < 3) return;
  // Source: the toolkit's level 1 (real texels of the tile, a quarter of level 0's data).
  const L1 = d.levels[1];
  const src = L1.data;
  const W1 = L1.width;
  let cap = 0;
  let R = new Float32Array(0);
  let G = new Float32Array(0);
  let B = new Float32Array(0);
  let R2 = new Float32Array(0);
  let G2 = new Float32Array(0);
  let B2 = new Float32Array(0);
  const pal = new Int32Array(256);
  const pr = new Float32Array(256);
  const pg = new Float32Array(256);
  const pb = new Float32Array(256);
  const seen = new Map<number, number>();
  for (const t of tiles) {
    if (!t.wrap || t.x < 0) continue;
    const w = t.w >> 1;
    const h = t.h >> 1;
    const ox = t.x >> 1;
    const oy = t.y >> 1;
    // Opaque only; the tile's own colours (the palette the levels snap to, ≤ 256).
    seen.clear();
    let np = 0;
    let ok = true;
    for (let y = 0; y < h && ok; y++) {
      let i = ((oy + y) * W1 + ox) * 4;
      for (let x = 0; x < w; x++, i += 4) {
        if (src[i + 3] !== 255) {
          ok = false;
          break;
        }
        const rgb = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
        if (seen.has(rgb)) continue;
        if (np === 256) {
          ok = false;
          break;
        }
        seen.set(rgb, np);
        pal[np] = rgb;
        pr[np] = src[i];
        pg[np] = src[i + 1];
        pb[np] = src[i + 2];
        np++;
      }
    }
    if (!ok) continue;
    gen++;
    // Level-2 means straight from level 1.
    let cw = w >> 1;
    let ch = h >> 1;
    if (cw < 1 || ch < 1) continue;
    if (cw * ch > cap) {
      cap = cw * ch;
      R = new Float32Array(cap);
      G = new Float32Array(cap);
      B = new Float32Array(cap);
      R2 = new Float32Array(cap);
      G2 = new Float32Array(cap);
      B2 = new Float32Array(cap);
    }
    const row = W1 * 4;
    for (let y = 0; y < ch; y++) {
      let i = ((oy + y * 2) * W1 + ox) * 4;
      let j = y * cw;
      for (let x = 0; x < cw; x++, i += 8, j++) {
        R[j] = (src[i] + src[i + 4] + src[i + row] + src[i + row + 4]) * 0.25;
        G[j] = (src[i + 1] + src[i + 5] + src[i + row + 1] + src[i + row + 5]) * 0.25;
        B[j] = (src[i + 2] + src[i + 6] + src[i + row + 2] + src[i + row + 6]) * 0.25;
      }
    }
    for (let l = 2; l < d.levels.length; l++) {
      if (l > 2) {
        const lw = cw >> 1;
        const lh = ch >> 1;
        if (lw < 1 || lh < 1) break;
        for (let y = 0; y < lh; y++) {
          for (let x = 0; x < lw; x++) {
            const q = y * 2 * cw + x * 2;
            const j = y * lw + x;
            R2[j] = (R[q] + R[q + 1] + R[q + cw] + R[q + cw + 1]) * 0.25;
            G2[j] = (G[q] + G[q + 1] + G[q + cw] + G[q + cw + 1]) * 0.25;
            B2[j] = (B[q] + B[q + 1] + B[q + cw] + B[q + cw + 1]) * 0.25;
          }
        }
        let sw = R;
        R = R2;
        R2 = sw;
        sw = G;
        G = G2;
        G2 = sw;
        sw = B;
        B = B2;
        B2 = sw;
        cw = lw;
        ch = lh;
      }
      const lv = d.levels[l];
      const x0 = t.x >> l;
      const y0 = t.y >> l;
      // Only levels the atlas painted (blank levels past PW_LEVELS stay blank).
      if (lv.data[(y0 * lv.width + x0) * 4 + 3] === 0) break;
      const out = lv.data;
      for (let y = 0; y < ch; y++) {
        const ym = ((y - 1 + ch) % ch) * cw;
        const yc = y * cw;
        const yp = ((y + 1) % ch) * cw;
        let di = ((y0 + y) * lv.width + x0) * 4;
        for (let x = 0; x < cw; x++, di += 4) {
          const xm = x === 0 ? cw - 1 : x - 1;
          const xp = x === cw - 1 ? 0 : x + 1;
          // 1-2-1 tent (wrapped): the block and its neighbours.
          const r = (R[ym + xm] + R[ym + xp] + R[yp + xm] + R[yp + xp] + 2 * (R[ym + x] + R[yp + x] + R[yc + xm] + R[yc + xp]) + 4 * R[yc + x]) * 0.0625;
          const g = (G[ym + xm] + G[ym + xp] + G[yp + xm] + G[yp + xp] + 2 * (G[ym + x] + G[yp + x] + G[yc + xm] + G[yc + xp]) + 4 * G[yc + x]) * 0.0625;
          const b = (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp] + 2 * (B[ym + x] + B[yp + x] + B[yc + xm] + B[yc + xp]) + 4 * B[yc + x]) * 0.0625;
          // Snap to the tile's own nearest colour (memoised on a 15-bit key, stamped per tile).
          const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
          let c: number;
          if (memoGen[key] === gen) c = memoVal[key];
          else {
            let best = 0;
            let bd = Infinity;
            for (let k = 0; k < np; k++) {
              const dr = pr[k] - r;
              const dg = pg[k] - g;
              const db = pb[k] - b;
              // Weighted (luma-heavy): keep the surface's value right before its hue.
              const dd = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
              if (dd < bd) {
                bd = dd;
                best = k;
              }
            }
            c = pal[best];
            memoGen[key] = gen;
            memoVal[key] = c;
          }
          out[di] = (c >> 16) & 255;
          out[di + 1] = (c >> 8) & 255;
          out[di + 2] = c & 255;
          out[di + 3] = 255;
        }
      }
    }
  }
  D2_LEVEL_STATS.ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
}

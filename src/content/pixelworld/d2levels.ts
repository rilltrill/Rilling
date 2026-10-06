import type { PwAtlasData, PwTile } from './atlas';

/**
 * RESEARCH LABS — calm far levels for tileable surfaces.
 *
 * The toolkit's levels pick, per 2×2, the source texel nearest their average:
 * perfect for modules (signs keep whole letters), but a fine regular pattern
 * (grating bars, grout, chequer, cladding ribs) reduces to a pattern of the
 * same contrast at every level — whichever texel a block lands on — and it
 * crawls when the camera moves. For WRAP tiles this re-makes levels 1…n as
 * the colour of the surface seen from afar: the mean over the block AND its
 * neighbours from level `tentFrom` (a 1-2-1 tent on the level's own grid,
 * wrapped like the tile; level 1 is the plain 2×2 mean), snapped to the nearest colour the tile itself is painted in. A regular
 * pattern collapses into its own mid-tone instead of alternating; slabs,
 * stains and big features (wider than a level texel) survive.
 *
 * Runs once per painted atlas (the atlas cache keeps the result: a RETRY /
 * RESTART reuses it). Only opaque wrap tiles (no cut-out / glow texels).
 */

const done = new WeakSet<PwAtlasData>();

export function d2CalmLevels(d: PwAtlasData, tiles: Iterable<PwTile>, o: { from?: number; tentFrom?: number } = {}) {
  if (done.has(d)) return;
  done.add(d);
  const from = o.from ?? 1;
  const tentFrom = o.tentFrom ?? 2;
  const L0 = d.levels[0];
  const W0 = L0.width;
  for (const t of tiles) {
    if (!t.wrap || t.x < 0) continue;
    const w = t.w;
    const h = t.h;
    // Opaque only; the tile's own colours (the palette the levels snap to).
    const pal = new Map<number, number>();
    let opaque = true;
    for (let y = 0; y < h && opaque; y++) {
      let i = ((t.y + y) * W0 + t.x) * 4;
      for (let x = 0; x < w; x++, i += 4) {
        if (L0.data[i + 3] !== 255) {
          opaque = false;
          break;
        }
        const rgb = (L0.data[i] << 16) | (L0.data[i + 1] << 8) | L0.data[i + 2];
        if (!pal.has(rgb)) pal.set(rgb, pal.size);
      }
    }
    if (!opaque) continue;
    const P = [...pal.keys()];
    const pr = new Float32Array(P.length);
    const pg = new Float32Array(P.length);
    const pb = new Float32Array(P.length);
    P.forEach((c, k) => {
      pr[k] = (c >> 16) & 255;
      pg[k] = (c >> 8) & 255;
      pb[k] = c & 255;
    });
    const memo = new Map<number, number>();
    const snap = (r: number, g: number, b: number): number => {
      // (Memoised on a 5-bit-per-channel key: neighbouring averages share their pick.)
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
      let best = 0;
      let bd = Infinity;
      for (let k = 0; k < P.length; k++) {
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
      memo.set(key, P[best]);
      return P[best];
    };
    // Box means per level (progressive), from level 0.
    let cw = w;
    let ch = h;
    let R = new Float32Array(w * h);
    let G = new Float32Array(w * h);
    let B = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let i = ((t.y + y) * W0 + t.x) * 4;
      for (let x = 0; x < w; x++, i += 4) {
        const j = y * w + x;
        R[j] = L0.data[i];
        G[j] = L0.data[i + 1];
        B[j] = L0.data[i + 2];
      }
    }
    for (let l = 1; l < d.levels.length; l++) {
      const lw = cw >> 1;
      const lh = ch >> 1;
      if (lw < 1 || lh < 1) break;
      const r2 = new Float32Array(lw * lh);
      const g2 = new Float32Array(lw * lh);
      const b2 = new Float32Array(lw * lh);
      for (let y = 0; y < lh; y++) {
        for (let x = 0; x < lw; x++) {
          const a = y * 2 * cw + x * 2;
          const j = y * lw + x;
          r2[j] = (R[a] + R[a + 1] + R[a + cw] + R[a + cw + 1]) * 0.25;
          g2[j] = (G[a] + G[a + 1] + G[a + cw] + G[a + cw + 1]) * 0.25;
          b2[j] = (B[a] + B[a + 1] + B[a + cw] + B[a + cw + 1]) * 0.25;
        }
      }
      R = r2;
      G = g2;
      B = b2;
      cw = lw;
      ch = lh;
      const lv = d.levels[l];
      if (l < from) continue;
      // Only levels the atlas painted (blank levels past PW_LEVELS stay blank).
      const x0 = t.x >> l;
      const y0 = t.y >> l;
      const probe = (y0 * lv.width + x0) * 4;
      if (lv.data[probe + 3] === 0) continue;
      for (let y = 0; y < lh; y++) {
        const ym = ((y - 1 + lh) % lh) * lw;
        const yc = y * lw;
        const yp = ((y + 1) % lh) * lw;
        for (let x = 0; x < lw; x++) {
          const xm = (x - 1 + lw) % lw;
          const xp = (x + 1) % lw;
          if (l < tentFrom) {
            const c0 = snap(R[yc + x], G[yc + x], B[yc + x]);
            const d0 = ((y0 + y) * lv.width + x0 + x) * 4;
            lv.data[d0] = (c0 >> 16) & 255;
            lv.data[d0 + 1] = (c0 >> 8) & 255;
            lv.data[d0 + 2] = c0 & 255;
            lv.data[d0 + 3] = 255;
            continue;
          }
          // 1-2-1 tent (wrapped): the block and its neighbours.
          const tr = (R[ym + xm] + R[ym + xp] + R[yp + xm] + R[yp + xp] + 2 * (R[ym + x] + R[yp + x] + R[yc + xm] + R[yc + xp]) + 4 * R[yc + x]) / 16;
          const tg = (G[ym + xm] + G[ym + xp] + G[yp + xm] + G[yp + xp] + 2 * (G[ym + x] + G[yp + x] + G[yc + xm] + G[yc + xp]) + 4 * G[yc + x]) / 16;
          const tb = (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp] + 2 * (B[ym + x] + B[yp + x] + B[yc + xm] + B[yc + xp]) + 4 * B[yc + x]) / 16;
          const c = snap(tr, tg, tb);
          const di = ((y0 + y) * lv.width + x0 + x) * 4;
          lv.data[di] = (c >> 16) & 255;
          lv.data[di + 1] = (c >> 8) & 255;
          lv.data[di + 2] = c & 255;
          lv.data[di + 3] = 255;
        }
      }
    }
  }
}

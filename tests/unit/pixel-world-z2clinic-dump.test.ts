import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { clearPwCache, paintTile, PwAtlas, pwTileLevel, type PwTile } from '../../src/content/pixelworld/atlas';
import { pwIndexToRgba, PwPalette } from '../../src/content/pixelworld/canvas';
import { z2ClinicTiles } from '../../src/content/pixelworld/z2clinic';
import { encodePng } from './pwPng';

/**
 * Look-dev dump of the z2 clinical shell's tiles (skipped unless PW_CLINIC is set):
 *   PW_CLINIC=/tmp/pw2/z2/tiles npx vitest run tests/unit/pixel-world-z2clinic-dump.test.ts
 * writes each tile as painted (×2; wrap tiles 2 × 2 to check the seams) and, with PW_LEVELS=1,
 * its far levels 1…3 side by side at their own size ×4 (what a wall 5–20 m away is drawn from).
 * PW_ONLY=<text> keeps the tiles whose key contains it. Prints the paint time of the set;
 * PW_BENCH=1 the painters' own time per tile (min of 5, no packing or levels).
 */
const OUT = process.env.PW_CLINIC;

describe.skipIf(!OUT)('z2 clinical shell look-dev dump', () => {
  it('dumps the tiles', async () => {
    const out = OUT!;
    mkdirSync(out, { recursive: true });
    clearPwCache();
    const atlas = new PwAtlas('z2clinic-dump');
    const only = process.env.PW_ONLY;
    const tiles: PwTile[] = z2ClinicTiles(atlas).filter((t) => !only || t.key.includes(only));
    const d = atlas.build();
    console.log(`z2 clinic tiles: ${tiles.length} shown, atlas ${d.w}×${d.h}, ${(d.bytes / 1048576).toFixed(1)} MB, ${d.texels} texels, paint ${d.ms.toFixed(0)} ms`);
    if (process.env.PW_BENCH) {
      // Painter time alone (no packing, no levels), JIT-warm: the min of 5 runs per tile.
      const defs = (atlas as unknown as { tiles: Map<string, { paint: Parameters<typeof paintTile>[3] }> }).tiles;
      let sum = 0;
      const rows: string[] = [];
      for (const t of tiles) {
        let best = Infinity;
        for (let i = 0; i < 5; i++) {
          const t0 = performance.now();
          paintTile(t.key, t.w, t.h, defs.get(t.key)!.paint, new PwPalette());
          best = Math.min(best, performance.now() - t0);
        }
        sum += best;
        rows.push(`${t.key} ${t.w}×${t.h}: ${best.toFixed(1)} ms (${((best * 1e6) / (t.w * t.h)).toFixed(0)} ns a texel)`);
      }
      console.log(`painters, min of 5: ${sum.toFixed(0)} ms\n  ${rows.join('\n  ')}`);
    }
    for (const t of tiles) {
      const name = t.key.replace(/[^a-zA-Z0-9.]+/g, '_');
      const cut = (k: number) => {
        const L = pwTileLevel(d, t, k)!;
        const w = Math.max(1, t.w >> k);
        const h = Math.max(1, t.h >> k);
        const idx = new Uint16Array(w * h);
        // Atlas rows are bottom-up: flip back to the picture.
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) idx[(h - 1 - y) * w + x] = L.idx[(L.y + y) * L.width + L.x + x];
        return { rgba: pwIndexToRgba(idx, d.pal), w, h };
      };
      const l0 = cut(0);
      let img = l0.rgba;
      let w = l0.w;
      let h = l0.h;
      if (t.wrap) {
        w = l0.w * 2;
        h = l0.h * 2;
        img = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.set(l0.rgba.subarray(((y % l0.h) * l0.w + (x % l0.w)) * 4, ((y % l0.h) * l0.w + (x % l0.w)) * 4 + 4), (y * w + x) * 4);
      }
      writeFileSync(`${out}/${name}.png`, await encodePng(img, w, h, t.wrap ? 1 : 2, [255, 0, 255]));
      if (process.env.PW_LEVELS) {
        for (const k of [1, 2, 3]) {
          const l = cut(k);
          writeFileSync(`${out}/${name}_L${k}.png`, await encodePng(l.rgba, l.w, l.h, 4, [255, 0, 255]));
        }
      }
    }
  });
});

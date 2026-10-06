import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PwPalette } from '../../src/content/pixelworld/canvas';
import { paintTile, PwAtlas } from '../../src/content/pixelworld/atlas';
import { encodePng, flipRows } from './pwPng';
import { lookdevBackdrops, lookdevTiles } from '../../src/content/pixelworld/lookdev';

/**
 * PixelWorld look-dev dump (skipped unless PW_DUMP is set):
 *   PW_DUMP=/tmp/pixelworld/tiles npx vitest run tests/unit/pixel-world-dump.test.ts
 * writes every look-dev tile at ×3 (wrap tiles 2×2 to check the seams) and the
 * packed atlas (level 0 and level 2) as PNGs.
 */
const OUT = process.env.PW_DUMP;

describe.skipIf(!OUT)('PixelWorld look-dev dump', () => {
  it('dumps tiles and the atlas', async () => {
    const out = OUT!;
    mkdirSync(out, { recursive: true });
    const only = process.env.PW_ONLY;
    const atlas = new PwAtlas('lookdev');
    const pal = new PwPalette();
    const sky = new PwAtlas('lookdev-sky', { levels: 1 });
    const list = [...lookdevTiles(atlas), ...(process.env.PW_SKY ? lookdevBackdrops(sky) : [])];
    for (const t of list) {
      if (only && !t.key.includes(only)) continue;
      const def = ((atlas as unknown as { tiles: Map<string, { paint: Parameters<typeof paintTile>[3] }> }).tiles.get(t.key) ??
        (sky as unknown as { tiles: Map<string, { paint: Parameters<typeof paintTile>[3] }> }).tiles.get(t.key))!;
      const c = paintTile(t.key, t.w, t.h, def.paint, pal);
      const rgba = c.resolve(pal);
      let img = rgba;
      let w = t.w;
      let h = t.h;
      if (t.wrap && t.w < 1024) {
        w = t.w * 2;
        h = t.h * 2;
        img = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.set(rgba.subarray(((y % t.h) * t.w + (x % t.w)) * 4, ((y % t.h) * t.w + (x % t.w)) * 4 + 4), (y * w + x) * 4);
      }
      const name = t.key.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 80);
      writeFileSync(`${out}/${name}.png`, await encodePng(img, w, h, t.w >= 1024 ? 1 : 3, [255, 0, 255]));
    }
    if (!only) {
      const d = atlas.build();
      for (const l of [0, 2]) {
        const lv = d.levels[l];
        writeFileSync(`${out}/_atlas-l${l}.png`, await encodePng(flipRows(lv.data, lv.width, lv.height), lv.width, lv.height, 1, [255, 0, 255]));
      }
      console.log(`atlas ${d.w}×${d.h}, ${(d.bytes / 1048576).toFixed(2)} MB, ${d.ms.toFixed(0)} ms, ${d.texels} texels`);
    }
  });
});

describe.skipIf(!process.env.PW_BENCH)('PixelWorld paint bench', () => {
  it('steady-state paint time per tile (second pass)', { timeout: 120_000 }, async () => {
    const { lookdevTiles: tilesOf } = await import('../../src/content/pixelworld/lookdev');
    const atlas = new PwAtlas('bench');
    const list = tilesOf(atlas);
    const pal = new PwPalette();
    const defs = (atlas as unknown as { tiles: Map<string, { paint: Parameters<typeof paintTile>[3] }> }).tiles;
    // Minimum of 5 passes per tile (the box may be busy: the minimum is the honest cost).
    const best = new Map<string, number>();
    for (let pass = 0; pass < 5; pass++) {
      for (const t of list) {
        const t0 = performance.now();
        const c = paintTile(t.key, t.w, t.h, defs.get(t.key)!.paint, pal);
        c.resolve(pal);
        const ms = performance.now() - t0;
        if (pass > 0) best.set(t.key, Math.min(best.get(t.key) ?? Infinity, ms));
      }
    }
    const rows: [number, number, string][] = list.map((t) => {
      const ms = best.get(t.key)!;
      return [ms, (ms * 1e6) / (t.w * t.h), `${t.key} ${t.w}×${t.h}`];
    });
    rows.sort((a, b) => b[0] - a[0]);
    console.log(rows.map(([ms, ns, k]) => `${ms.toFixed(2)} ms  ${ns.toFixed(0)} ns/texel  ${k}`).join('\n'));
    console.log('total', rows.reduce((s, r) => s + r[0], 0).toFixed(1), 'ms');
  });
});

describe.skipIf(!process.env.PW_PROF)('PixelWorld profile', () => {
  it('profiles a warm z1 PIXEL WORLD environment build', { timeout: 300_000 }, async () => {
    const inspector = await import('node:inspector');
    const THREE = await import('three');
    const { World } = await import('../../src/gameplay/World');
    const { StageRunner } = await import('../../src/gameplay/StageRunner');
    const { AudioSystem } = await import('../../src/audio/Audio');
    const { DEFAULT_SETTINGS } = await import('../../src/core/types');
    const { ALL_STAGES } = await import('../../src/content');
    const { clearPwCache } = await import('../../src/content/pixelworld/atlas');
    const { nullHud } = await import('./sim');
    const id = process.env.PW_PROF!;
    const build = () => {
      const w = new World(new THREE.PerspectiveCamera(), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
      w.art = 'pixel';
      new StageRunner(w, ALL_STAGES.find((s) => s.id === id)!).start();
      w.dispose();
    };
    build();
    clearPwCache();
    const session = new inspector.Session();
    session.connect();
    const post = (m: string, p?: object) => new Promise<unknown>((res, rej) => session.post(m, p ?? {}, (e, r) => (e ? rej(e) : res(r))));
    await post('Profiler.enable');
    await post('Profiler.start');
    build();
    const { profile } = (await post('Profiler.stop')) as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }[]; samples: number[]; timeDeltas: number[] } };
    const self = new Map<number, number>();
    profile.samples.forEach((s, i) => self.set(s, (self.get(s) ?? 0) + profile.timeDeltas[i]));
    const agg = new Map<string, number>();
    for (const n of profile.nodes) {
      const us = self.get(n.id) ?? 0;
      const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
      agg.set(k, (agg.get(k) ?? 0) + us);
    }
    const rows = [...agg].sort((a, b) => b[1] - a[1]).slice(0, 40);
    const tot = [...agg.values()].reduce((s, v) => s + v, 0);
    console.log(rows.map(([k, us]) => `${(us / 1000).toFixed(1).padStart(8)} ms ${((100 * us) / tot).toFixed(1).padStart(5)}%  ${k}`).join('\n'));
  });
});

/**
 * A stage's painted panorama atlas (skipped unless PW_STAGE_SKY is set):
 *   PW_STAGE_SKY=d1 PW_DUMP=/tmp/pixelworld/tiles npx vitest run tests/unit/pixel-world-dump.test.ts -t "panorama"
 */
describe.skipIf(!process.env.PW_STAGE_SKY || !OUT)('PixelWorld stage panorama dump', () => {
  it('dumps the panorama atlas', async () => {
    const THREE = await import('three');
    const id = process.env.PW_STAGE_SKY!;
    let atlas: PwAtlas;
    if (id === 'd1') {
      const { D1PixelWorld } = await import('../../src/content/stages/d1/pixel');
      const pw = new D1PixelWorld();
      pw.buildBackdrop(new THREE.Vector3());
      atlas = pw.skyAtlas;
    } else {
      const { Z1PixelWorld } = await import('../../src/content/stages/z1/pixel');
      const pw = new Z1PixelWorld();
      pw.buildBackdrop(new THREE.Vector3(0.3, 0.4, -1), 0x1a2133);
      atlas = pw.skyAtlas;
    }
    const d = atlas.build();
    const lv = d.levels[0];
    mkdirSync(OUT!, { recursive: true });
    writeFileSync(`${OUT}/_${id}-sky.png`, await encodePng(flipRows(lv.data, lv.width, lv.height), lv.width, lv.height, 1, [255, 0, 255]));
    console.log(`${id} sky ${d.w}×${d.h}`);
  });
});

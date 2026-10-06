import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PwPalette } from '../../src/content/pixelworld/canvas';
import { paintTile, PwAtlas, type PwTile } from '../../src/content/pixelworld/atlas';
import { encodePng } from './pwPng';

/** Scratch look-dev for the d1 painters (D1_LAB=<out dir>). */
describe.skipIf(!process.env.D1_LAB)('d1 lab', () => {
  it('dumps d1 tiles', async () => {
    const out = process.env.D1_LAB!;
    mkdirSync(out, { recursive: true });
    const T = await import('../../src/content/pixelworld/d1Tiles');
    const atlas = new PwAtlas('d1-lab');
    const tiles: PwTile[] = [];
    const reg = (await import('./d1-lab-reg')).register;
    if (process.env.D1_SET === '3') await (await import('./d1-lab-reg')).register3(atlas, tiles);
    else if (process.env.D1_SET !== '2') reg(atlas, tiles, T);
    else await (await import('./d1-lab-reg')).register2(atlas, tiles);
    const pal = new PwPalette();
    const defs = (atlas as unknown as { tiles: Map<string, { paint: Parameters<typeof paintTile>[3] }> }).tiles;
    const only = process.env.D1_ONLY;
    for (const t of tiles) {
      if (only && !t.key.includes(only)) continue;
      const t0 = performance.now();
      const c = paintTile(t.key, t.w, t.h, defs.get(t.key)!.paint, pal);
      const ms = performance.now() - t0;
      const rgba = c.resolve(pal);
      let img = rgba;
      let w = t.w;
      let h = t.h;
      const rep = t.wrap && t.w < 512 ? 2 : 1;
      if (rep > 1) {
        w = t.w * rep;
        h = t.h * rep;
        img = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.set(rgba.subarray(((y % t.h) * t.w + (x % t.w)) * 4, ((y % t.h) * t.w + (x % t.w)) * 4 + 4), (y * w + x) * 4);
      }
      const name = t.key.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60);
      writeFileSync(`${out}/${name}.png`, await encodePng(img, w, h, w > 400 ? 2 : 4, [255, 0, 255]));
      console.log(`${ms.toFixed(1)} ms ${t.key} ${t.w}x${t.h}`);
    }
  });
});

describe.skipIf(!process.env.D1_STONES)('d1 stones', () => {
  it('dumps the stone billboard atlas', async () => {
    const out = process.env.D1_STONES!;
    mkdirSync(out, { recursive: true });
    const { paintFloraAtlas } = await import('../../src/content/pixel/floraField');
    const S = await import('../../src/content/pixelworld/d1Species');
    const t0 = performance.now();
    const a = paintFloraAtlas(S.D1_STONES_ALL, S.D1_STONE_BIOME, 'd1-stones-lab');
    console.log(`stones atlas ${a.w}x${a.h} ${(performance.now() - t0).toFixed(1)} ms`);
    for (const l of [0, 1]) {
      const lv = a.levels[l];
      const rgba = new Uint8Array(lv.width * lv.height * 4);
      for (let y = 0; y < lv.height; y++) {
        for (let x = 0; x < lv.width; x++) {
          const idx = lv.data[(lv.height - 1 - y) * lv.width + x];
          const o = (y * lv.width + x) * 4;
          if (!idx) continue;
          rgba.set(a.palette.subarray(idx * 4, idx * 4 + 3), o);
          rgba[o + 3] = 255;
        }
      }
      writeFileSync(`${out}/stones-l${l}.png`, await encodePng(rgba, lv.width, lv.height, l === 0 ? 3 : 6, [70, 110, 90]));
    }
  });
});

describe.skipIf(!process.env.D1_STONETIME)('d1 stone timing', () => {
  it('times each stone species (warm)', async () => {
    const { paintFloraAtlas } = await import('../../src/content/pixel/floraField');
    const S = await import('../../src/content/pixelworld/d1Species');
    const Hd = await import('../../src/content/pixelworld/d1Herd');
    for (let pass = 0; pass < 4; pass++) {
      const t1 = performance.now();
      paintFloraAtlas(Hd.D1_HERD, Hd.D1_HERD_BIOME, `lab-herd-${pass}`);
      if (pass >= 2) console.log(`herd ${(performance.now() - t1).toFixed(1)} ms`);
      for (const sp of S.D1_STONES_ALL) {
        const t0 = performance.now();
        paintFloraAtlas([sp], S.D1_STONE_BIOME, `lab-${pass}-${sp.key}`);
        if (pass === 2) console.log(`${sp.key} ${(performance.now() - t0).toFixed(1)} ms`);
      }
      const t0 = performance.now();
      paintFloraAtlas(S.D1_STONES_ALL, S.D1_STONE_BIOME, `lab-all-${pass}`);
      if (pass === 2) console.log(`all ${(performance.now() - t0).toFixed(1)} ms`);
    }
  });
});

describe.skipIf(!process.env.D1_BENCH)('d1 paint bench', () => {
  it('paints the d1 PIXEL WORLD atlases N times (min per atlas)', { timeout: 600_000 }, async () => {
    const THREE = await import('three');
    const { World } = await import('../../src/gameplay/World');
    const { StageRunner } = await import('../../src/gameplay/StageRunner');
    const { AudioSystem } = await import('../../src/audio/Audio');
    const { DEFAULT_SETTINGS } = await import('../../src/core/types');
    const { ALL_STAGES } = await import('../../src/content');
    const { clearPwCache, PW_STATS, PW_DEBUG_TILE_MS, PW_DEBUG_TILES, PwAtlas } = await import('../../src/content/pixelworld/atlas');
    let sizes: string[] = [];
    const want = process.env.D1_ATLAS ?? 'd1';
    let worldTiles: string[] = [];
    const orig = PwAtlas.prototype.build;
    PwAtlas.prototype.build = function (this: InstanceType<typeof PwAtlas>) {
      const fresh = !this.built;
      const d = orig.call(this);
      if (fresh && this.name === want) {
        worldTiles = PW_DEBUG_TILE_MS().slice(0, 30);
        sizes = PW_DEBUG_TILES().slice(0, 20);
      }
      return d;
    };
    const { nullHud } = await import('./sim');
    const best = new Map<string, number>();
    const N = Number(process.env.D1_BENCH) || 4;
    let tiles: string[] = [];
    for (let i = 0; i < N; i++) {
      clearPwCache();
      PW_STATS.clear();
      const w = new World(new THREE.PerspectiveCamera(), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
      w.art = 'pixel';
      new StageRunner(w, ALL_STAGES.find((s) => s.id === 'd1')!).start();
      for (const [n, a] of PW_STATS) best.set(n, Math.min(best.get(n) ?? Infinity, a.ms));
      if (i === N - 1) tiles = worldTiles;
      w.dispose();
    }
    console.log([...best].map(([n, ms]) => `${n} ${ms.toFixed(1)} ms`).join(', '), ` total ${[...best.values()].reduce((s, v) => s + v, 0).toFixed(1)} ms`);
    console.log(tiles.join('\n'));
    console.log('largest:', sizes.join(', '));
    console.log([...PW_STATS].map(([n, a]) => `${n} ${a.w}x${a.h} ${(a.texels / 1000).toFixed(0)}k texels ${(a.bytes / 1048576).toFixed(1)} MB`).join(' | '));
    PwAtlas.prototype.build = orig;
  });
});

describe.skipIf(!process.env.D1_HERD)('d1 herd', () => {
  it('dumps the herd atlas', async () => {
    const out = process.env.D1_HERD!;
    mkdirSync(out, { recursive: true });
    const { paintFloraAtlas } = await import('../../src/content/pixel/floraField');
    const S = await import('../../src/content/pixelworld/d1Herd');
    const t0 = performance.now();
    const a = paintFloraAtlas(S.D1_HERD, S.D1_HERD_BIOME, 'd1-herd-lab');
    console.log(`herd atlas ${a.w}x${a.h} ${(performance.now() - t0).toFixed(1)} ms`);
    const lv = a.levels[0];
    const rgba = new Uint8Array(lv.width * lv.height * 4);
    for (let y = 0; y < lv.height; y++) {
      for (let x = 0; x < lv.width; x++) {
        const idx = lv.data[(lv.height - 1 - y) * lv.width + x];
        const o = (y * lv.width + x) * 4;
        if (!idx) continue;
        rgba.set(a.palette.subarray(idx * 4, idx * 4 + 3), o);
        rgba[o + 3] = 255;
      }
    }
    writeFileSync(`${out}/herd-l0.png`, await encodePng(rgba, lv.width, lv.height, 3, [120, 160, 120]));
  });
});

describe.skipIf(!process.env.D1_TILEBENCH)('d1 tile bench', () => {
  it('times every d1 tile painter (min of 6, warm)', { timeout: 600_000 }, async () => {
    const THREE = await import('three');
    const { World } = await import('../../src/gameplay/World');
    const { StageRunner } = await import('../../src/gameplay/StageRunner');
    const { AudioSystem } = await import('../../src/audio/Audio');
    const { DEFAULT_SETTINGS } = await import('../../src/core/types');
    const { ALL_STAGES } = await import('../../src/content');
    const { PwAtlas, paintTile } = await import('../../src/content/pixelworld/atlas');
    const { PwPalette } = await import('../../src/content/pixelworld/canvas');
    const { nullHud } = await import('./sim');
    const want = process.env.D1_TILEBENCH === '1' ? 'd1' : process.env.D1_TILEBENCH!;
    let defs: Map<string, { tile: { key: string; w: number; h: number }; paint: Parameters<typeof paintTile>[3] }> | null = null;
    const orig = PwAtlas.prototype.build;
    PwAtlas.prototype.build = function (this: InstanceType<typeof PwAtlas>) {
      if (this.name === want && !defs) defs = (this as unknown as { tiles: typeof defs }).tiles;
      return orig.call(this);
    };
    const w = new World(new THREE.PerspectiveCamera(), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
    w.art = 'pixel';
    new StageRunner(w, ALL_STAGES.find((s) => s.id === 'd1')!).start();
    PwAtlas.prototype.build = orig;
    const pal = new PwPalette();
    const rows: [number, number, string][] = [];
    for (const { tile, paint } of defs!.values()) {
      let best = Infinity;
      let bestR = Infinity;
      for (let i = 0; i < 6; i++) {
        const t0 = performance.now();
        const c = paintTile(tile.key, tile.w, tile.h, paint, pal);
        const t1 = performance.now();
        c.resolve(pal);
        const t2 = performance.now();
        best = Math.min(best, t1 - t0);
        bestR = Math.min(bestR, t2 - t1);
      }
      rows.push([best, bestR, `${tile.key.slice(0, 50)} ${tile.w}x${tile.h}`]);
    }
    rows.sort((a, b) => b[0] - a[0]);
    console.log(rows.slice(0, 30).map(([p, r, k]) => `${p.toFixed(2)} + ${r.toFixed(2)} ms  ${k}`).join('\n'));
    console.log(`paint total ${rows.reduce((s, r) => s + r[0], 0).toFixed(1)} ms, resolve total ${rows.reduce((s, r) => s + r[1], 0).toFixed(1)} ms, ${rows.length} tiles`);
    w.dispose();
  });
});

describe.skipIf(!process.env.D1_MEASURE)('d1 measure', () => {
  it('measures sign words', async () => {
    const F = await import('../../src/content/pixelworld/font');
    for (const [n, f] of [['bold', F.FONT_BOLD], ['5x7', F.FONT_5x7], ['tallbold', F.tallFont(F.FONT_BOLD, 2)]] as const) {
      for (const s of [1, 2]) console.log(n, s, 'PRIMAL', F.textWidth('PRIMAL', f, { scale: s }), 'ISLAND', F.textWidth('ISLAND', f, { scale: s }));
    }
  });
});

describe.skipIf(!process.env.D1_FLORAMIN)('d1 flora atlas min', () => {
  it('stones + herd atlases, min of 8 (warm)', { timeout: 600_000 }, async () => {
    const { paintFloraAtlas } = await import('../../src/content/pixel/floraField');
    const S = await import('../../src/content/pixelworld/d1Species');
    const Hd = await import('../../src/content/pixelworld/d1Herd');
    let st = Infinity;
    let hd = Infinity;
    for (let i = 0; i < 8; i++) {
      let t0 = performance.now();
      paintFloraAtlas(S.D1_STONES_ALL, S.D1_STONE_BIOME, `min-st-${i}`);
      st = Math.min(st, performance.now() - t0);
      t0 = performance.now();
      paintFloraAtlas(Hd.D1_HERD, Hd.D1_HERD_BIOME, `min-hd-${i}`);
      hd = Math.min(hd, performance.now() - t0);
    }
    console.log(`FLORA stones ${st.toFixed(1)} ms, herd ${hd.toFixed(1)} ms`);
  });
});

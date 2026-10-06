import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng, flipRows } from './pwPng';

/**
 * TYRANT CHASE PIXEL WORLD look-dev (skipped unless D3_LAB=<out dir>): builds
 * the stage headless in ART: PIXEL WORLD and dumps every PixelWorld atlas
 * (level 0, and level 2 of the world atlas) as PNGs, with the paint time per
 * atlas and the slowest tiles.
 */
describe.skipIf(!process.env.D3_LAB)('d3 lab', () => {
  it('dumps the d3 atlases', { timeout: 300_000 }, async () => {
    const out = process.env.D3_LAB!;
    mkdirSync(out, { recursive: true });
    const THREE = await import('three');
    const { World } = await import('../../src/gameplay/World');
    const { StageRunner } = await import('../../src/gameplay/StageRunner');
    const { AudioSystem } = await import('../../src/audio/Audio');
    const { DEFAULT_SETTINGS } = await import('../../src/core/types');
    const { ALL_STAGES } = await import('../../src/content');
    const { clearPwCache, PW_STATS, PW_DEBUG_TILE_MS } = await import('../../src/content/pixelworld/atlas');
    const { park } = await import('../../src/content/stages/d3/env');
    const { nullHud } = await import('./sim');
    const build = () => {
      const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
      w.art = 'pixel';
      new StageRunner(w, ALL_STAGES.find((s) => s.id === 'd3')!).start();
      return w;
    };
    // Warm once (JIT), then measure fresh paints (the minimum of D3_REPS, default 1: the machine may be busy).
    build().dispose();
    const reps = Number(process.env.D3_REPS ?? 1);
    const best = new Map<string, number>();
    let w = null as unknown as ReturnType<typeof build>;
    for (let r = 0; r < reps; r++) {
      clearPwCache();
      PW_STATS.clear();
      if (r > 0) w.dispose();
      w = build();
      for (const [n, a] of PW_STATS) best.set(n, Math.min(best.get(n) ?? Infinity, a.ms));
    }
    console.log('best paint ms: ' + [...best].map(([n, ms]) => `${n} ${ms.toFixed(1)}`).join(', ') + ` total ${[...best.values()].reduce((s, v) => s + v, 0).toFixed(1)}`);
    console.log([...PW_STATS].map(([n, a]) => `${n} ${a.w}×${a.h} ${(a.bytes / 1048576).toFixed(2)} MB ${a.ms.toFixed(1)} ms ${a.tiles} tiles ${(a.texels / 1000).toFixed(0)}k texels`).join('\n'));
    console.log('slowest tiles (last atlas painted):\n' + PW_DEBUG_TILE_MS().slice(0, 12).join('\n'));
    const pw = (park() as unknown as { pw: Record<string, unknown> }).pw;
    for (const [k, v] of Object.entries(pw)) {
      const a = v as { name?: string; build?: () => { w: number; h: number; levels: { data: Uint8Array; width: number; height: number }[] } };
      if (!a || typeof a.build !== 'function' || !a.name || !(k.toLowerCase().includes('atlas'))) continue;
      const d = a.build();
      for (const l of [0, 1, 2, 3]) {
        const lv = d.levels[l];
        if (!lv || (l > 0 && d.levels.length < 3)) continue;
        writeFileSync(`${out}/${a.name}-l${l}.png`, await encodePng(flipRows(lv.data, lv.width, lv.height), lv.width, lv.height, l === 0 ? 1 : 2, [255, 0, 255]));
      }
    }
    if (process.env.D3_CPU) {
      // CPU time (user + system, this thread's process) of painting each atlas afresh, best of 5:
      // robust to other processes competing for the cores (wall time is not).
      const { PwAtlas } = await import('../../src/content/pixelworld/atlas');
      let total = 0;
      for (const [k, v] of Object.entries(pw)) {
        const a = v as { name?: string; o?: object; tiles?: Map<string, { tile: { key: string; w: number; h: number; wrap: boolean; density: number }; paint: never }> };
        if (!a?.tiles || !k.toLowerCase().includes('atlas')) continue;
        let best = Infinity;
        for (let r = 0; r < 5; r++) {
          clearPwCache();
          const fresh = new PwAtlas(a.name!, a.o);
          for (const { tile, paint } of a.tiles.values()) fresh.tile(tile.key, tile.w, tile.h, paint, { wrap: tile.wrap, density: tile.density });
          const c0 = process.cpuUsage();
          fresh.build();
          const c1 = process.cpuUsage(c0);
          best = Math.min(best, (c1.user + c1.system) / 1000);
        }
        total += best;
        console.log(`cpu ${a.name}: ${best.toFixed(1)} ms`);
      }
      console.log(`cpu total (env atlases): ${total.toFixed(1)} ms`);
      // The jeep atlas lives on the view model (the last one built).
      const { D3_JEEP_ATLAS } = await import('../../src/content/stages/d3/jeepPixel');
      const ja = D3_JEEP_ATLAS as unknown as { name: string; o: object; tiles: Map<string, { tile: { key: string; w: number; h: number; wrap: boolean; density: number }; paint: never }> } | null;
      if (ja) {
        let best = Infinity;
        for (let r = 0; r < 5; r++) {
          clearPwCache();
          const fresh = new PwAtlas(ja.name, ja.o);
          for (const { tile, paint } of ja.tiles.values()) fresh.tile(tile.key, tile.w, tile.h, paint, { wrap: tile.wrap, density: tile.density });
          const c0 = process.cpuUsage();
          fresh.build();
          const c1 = process.cpuUsage(c0);
          best = Math.min(best, (c1.user + c1.system) / 1000);
        }
        console.log(`cpu ${ja.name}: ${best.toFixed(1)} ms; all three: ${(total + best).toFixed(1)} ms`);
      }
    }
    if (process.env.D3_BENCH) {
      const { paintTile } = await import('../../src/content/pixelworld/atlas');
      const { PwPalette } = await import('../../src/content/pixelworld/canvas');
      const rows: [number, string][] = [];
      for (const [k, v] of Object.entries(pw)) {
        const a = v as { name?: string; tiles?: Map<string, { tile: { key: string; w: number; h: number }; paint: Parameters<typeof paintTile>[3] }> };
        if (!a?.tiles || !k.toLowerCase().includes('atlas')) continue;
        const pal = new PwPalette();
        for (const { tile, paint } of a.tiles.values()) {
          let best = Infinity;
          for (let i = 0; i < 3; i++) {
            const t0 = performance.now();
            paintTile(tile.key, tile.w, tile.h, paint, pal).resolve(pal);
            best = Math.min(best, performance.now() - t0);
          }
          rows.push([best, `${a.name} ${tile.key} ${tile.w}×${tile.h}`]);
        }
      }
      rows.sort((x, y) => y[0] - x[0]);
      console.log(rows.map(([ms, k]) => `${ms.toFixed(2)} ms  ${k}`).join('\n'));
      console.log('total', rows.reduce((s2, r) => s2 + r[0], 0).toFixed(1), 'ms');
    }
    w.dispose();
  });
});

import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { encodePng, flipRows } from './pwPng';

/**
 * HIGHWAY TO HELL (z3) PIXEL WORLD look-dev (skipped unless Z3_LAB is set):
 *   Z3_LAB=/tmp/pixelworld/z3/lab npx vitest run tests/unit/z3-lab.test.ts
 * builds the stage in ART: PIXEL WORLD (headless), prints the atlas stats and the
 * slowest tiles, and writes the packed world atlas (levels 0 and 2) and the sky
 * atlas as PNGs. Z3_BENCH=n: the minimum of n cold builds (paint time).
 */
const OUT = process.env.Z3_LAB;

describe.skipIf(!OUT)('z3 PIXEL WORLD look-dev', () => {
  it('builds, profiles and dumps the atlases', { timeout: 600_000 }, async () => {
    const { World } = await import('../../src/gameplay/World');
    const { StageRunner } = await import('../../src/gameplay/StageRunner');
    const { AudioSystem } = await import('../../src/audio/Audio');
    const { DEFAULT_SETTINGS } = await import('../../src/core/types');
    const { ALL_STAGES } = await import('../../src/content');
    const { clearPwCache, PW_STATS, PW_DEBUG_TILE_MS, PW_DEBUG_TILES } = await import('../../src/content/pixelworld/atlas');
    const { Kit } = await import('../../src/content/kit/ModelKit');
    const { nullHud } = await import('./sim');
    const runs = Number(process.env.Z3_BENCH ?? 1);
    const best = new Map<string, number>();
    let atlasData: { name: string; w: number; h: number; levels: { data: Uint8Array; width: number; height: number }[] }[] = [];
    for (let r = 0; r < runs; r++) {
      clearPwCache();
      PW_STATS.clear();
      const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
      w.art = 'pixel';
      const t0 = performance.now();
      new StageRunner(w, ALL_STAGES.find((s) => s.id === 'z3')!).start();
      const ms = performance.now() - t0;
      best.set('stage build', Math.min(best.get('stage build') ?? Infinity, ms));
      for (const [n, a] of PW_STATS) best.set(n, Math.min(best.get(n) ?? Infinity, a.ms));
      if (r === runs - 1) {
        console.log([...PW_STATS].map(([n, a]) => `${n} ${a.w}×${a.h} ${(a.bytes / 1048576).toFixed(2)} MB ${a.tiles} tiles ${a.texels} texels`).join('\n'));
        console.log('slowest tiles:\n' + PW_DEBUG_TILE_MS().slice(0, 25).join('\n'));
        console.log('largest tiles:\n' + PW_DEBUG_TILES().slice(0, 25).join('\n'));
        // The atlases (scene textures named pw:<atlas>).
        const seen = new Set<THREE.Texture>();
        w.scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          const u = (m?.userData?.pw as { uPwAtlas?: { value: THREE.DataTexture } } | undefined)?.uPwAtlas?.value;
          if (u && !seen.has(u)) seen.add(u);
        });
        atlasData = [...seen].map((t) => {
          const img = t.image as { width: number; height: number; data: Uint8Array };
          const levels = (t.mipmaps?.length ? (t.mipmaps as unknown as { data: Uint8Array; width: number; height: number }[]) : [{ data: img.data, width: img.width, height: img.height }]);
          return { name: t.name, w: img.width, h: img.height, levels };
        });
      }
      w.dispose();
      Kit.disposeAll();
    }
    console.log([...best].map(([k, v]) => `${k}: ${v.toFixed(1)} ms`).join('\n'));
    mkdirSync(OUT!, { recursive: true });
    for (const a of atlasData) {
      for (const l of [0, 2]) {
        const lv = a.levels[l];
        if (!lv) continue;
        writeFileSync(`${OUT}/${a.name.replace(/[^a-z0-9-]/gi, '_')}-l${l}.png`, await encodePng(flipRows(lv.data, lv.width, lv.height), lv.width, lv.height, 1, [255, 0, 255]));
      }
    }
  });
});

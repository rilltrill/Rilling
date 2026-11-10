import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { PwPalette } from '../../src/content/pixelworld/canvas';
import { clearPwCache, paintTile, PwAtlas, PW_STATS, type PwPainter, type PwTile } from '../../src/content/pixelworld/atlas';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { AudioSystem } from '../../src/audio/Audio';
import { Kit } from '../../src/content/kit/ModelKit';
import { nullHud } from './sim';
import { encodePng } from './pwPng';
import { pwPreview, type PvCam } from './pw2Preview';
import { z1GroundLookdev } from '../../src/content/pixelworld/z1road';

/**
 * z1 MAIN STREET look-dev (skipped unless PW_PREVIEW is set):
 *
 *   PW_PREVIEW=/tmp/pw2/z1/pv npx vitest run tests/unit/pw2-z1-preview.test.ts
 *
 * writes (a) the ground tiles of slice 1 as painted (`tile-<key>.png`, ×2; PW_ONLY=<part of a
 * key> limits them, PW_TILES=0 skips them) with their per-tile paint time, and (b) the software
 * preview (`pw2Preview.ts`) of the stage's PixelWorld meshes from the rail at the slice shots
 * (`pv-<label>.png`, ×3; PW_VIEWS=a,b limits them, PW_VIEWS=0 skips them).
 */
const OUT = process.env.PW_PREVIEW;

/** Rail views near the slice shots (eye 1.62 m) and a few look-down views for the ground. */
const VIEWS: Record<string, PvCam> = {
  'first-contact': { pos: [0, 1.62, -14], yaw: 0 },
  crawlers: { pos: [0, 1.62, -78], yaw: 0, pitch: -3 },
  'up-main': { pos: [0, 1.62, -84.5], yaw: 0 },
  'second-st': { pos: [-45.5, 1.62, -155.6], yaw: 82, pitch: -2 },
  square: { pos: [-58, 1.62, -268], yaw: 8, pitch: 5 },
  butcher: { pos: [-58, 1.62, -283], yaw: 0 },
  alley: { pos: [-22, 1.62, -155], yaw: 90, pitch: -4 },
  feet: { pos: [0.6, 1.62, -30], yaw: 0, pitch: -24 },
  kerb: { pos: [3.2, 1.62, -52], yaw: -38, pitch: -14 },
  second: { pos: [-58, 1.62, -205], yaw: 0, pitch: -6 },
  cross: { pos: [0, 1.62, -93], yaw: 62, pitch: -5 },
  gas: { pos: [-58, 1.62, -199], yaw: 48, pitch: -3 },
};

describe.skipIf(!OUT)('z1 ground look-dev', () => {
  it('dumps the ground tiles and previews the rail views', { timeout: 600_000 }, async () => {
    const out = OUT!;
    mkdirSync(out, { recursive: true });
    if (process.env.PW_TILES !== '0') {
      const atlas = new PwAtlas('z1-lookdev');
      const pal = new PwPalette();
      const tiles: PwTile[] = z1GroundLookdev(atlas);
      const defs = (atlas as unknown as { tiles: Map<string, { paint: PwPainter }> }).tiles;
      const only = process.env.PW_ONLY;
      let total = 0;
      for (const t of tiles) {
        if (only && !t.key.includes(only)) continue;
        paintTile(t.key, t.w, t.h, defs.get(t.key)!.paint, pal);
        const t0 = performance.now();
        const c = paintTile(t.key, t.w, t.h, defs.get(t.key)!.paint, pal);
        const ms = performance.now() - t0;
        total += ms;
        console.log(`${t.key} ${t.w}×${t.h}: ${ms.toFixed(1)} ms (${((ms * 1e6) / (t.w * t.h)).toFixed(0)} ns a texel)`);
        const name = t.key.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60);
        writeFileSync(`${out}/tile-${name}.png`, await encodePng(c.resolve(pal), t.w, t.h, 2, [255, 0, 255]));
      }
      console.log(`ground tiles: ${total.toFixed(0)} ms, ${pal.ramps.length} ramps`);
    }
    if (process.env.PW_VIEWS === '0') return;
    clearPwCache();
    PW_STATS.clear();
    const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
    w.art = 'pixel';
    const t0 = performance.now();
    new StageRunner(w, ALL_STAGES.find((s) => s.id === 'z1')!).start();
    w.scene.updateMatrixWorld(true);
    console.log(`z1 build ${(performance.now() - t0).toFixed(0)} ms; ${[...PW_STATS].map(([n, a]) => `${n} ${a.w}×${a.h} ${(a.bytes / 1048576).toFixed(1)} MB ${a.ms.toFixed(0)} ms`).join(', ')}`);
    const want = process.env.PW_VIEWS?.split(',');
    for (const [label, cam] of Object.entries(VIEWS)) {
      if (want && !want.includes(label)) continue;
      const img = pwPreview(w.scene, cam);
      writeFileSync(`${out}/pv-${label}.png`, await encodePng(img, 624, 288, 3));
    }
    w.dispose();
    Kit.disposeAll();
  });
});

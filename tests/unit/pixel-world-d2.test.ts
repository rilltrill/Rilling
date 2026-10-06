import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { PwPalette } from '../../src/content/pixelworld/canvas';
import { PW_DEBUG_TILE_MS, PW_DEBUG_TILES } from '../../src/content/pixelworld/atlas';
import { paintTile, type PwAtlas } from '../../src/content/pixelworld/atlas';
import { encodePng, flipRows } from './pwPng';

/**
 * RESEARCH LABS look-dev dump (skipped unless PW_D2_DUMP is set):
 *   PW_D2_DUMP=/tmp/pixelworld/d2/tiles npx vitest run tests/unit/pixel-world-d2.test.ts
 * builds d2 in PIXEL WORLD headless and writes every tile of its atlas (×3, wrap tiles
 * 2×2 to check seams; PW_ONLY=substring to filter) plus the packed atlas.
 */
const OUT = process.env.PW_D2_DUMP;

describe.skipIf(!OUT)('d2 PixelWorld look-dev dump', () => {
  it('dumps the d2 atlas tiles', { timeout: 120_000 }, async () => {
    const { World } = await import('../../src/gameplay/World');
    const { StageRunner } = await import('../../src/gameplay/StageRunner');
    const { AudioSystem } = await import('../../src/audio/Audio');
    const { DEFAULT_SETTINGS } = await import('../../src/core/types');
    const { ALL_STAGES } = await import('../../src/content');
    const { D2_DEBUG } = await import('../../src/content/stages/d2/pixel');
    const { nullHud } = await import('./sim');
    const w = new World(new THREE.PerspectiveCamera(), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
    w.art = 'pixel';
    new StageRunner(w, ALL_STAGES.find((s) => s.id === 'd2')!).start();
    const atlas = D2_DEBUG.last!.atlas as PwAtlas;
    const out = OUT!;
    mkdirSync(out, { recursive: true });
    const only = process.env.PW_ONLY;
    const pal = new PwPalette();
    const tiles = (atlas as unknown as { tiles: Map<string, { tile: { key: string; w: number; h: number; wrap: boolean }; paint: Parameters<typeof paintTile>[3] }> }).tiles;
    for (const { tile: t, paint } of tiles.values()) {
      if (only && !t.key.includes(only)) continue;
      const c = paintTile(t.key, t.w, t.h, paint, pal);
      const rgba = c.resolve(pal);
      let img = rgba;
      let iw = t.w;
      let ih = t.h;
      if (t.wrap && t.w <= 256) {
        iw = t.w * 2;
        ih = t.h * 2;
        img = new Uint8Array(iw * ih * 4);
        for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) img.set(rgba.subarray(((y % t.h) * t.w + (x % t.w)) * 4, ((y % t.h) * t.w + (x % t.w)) * 4 + 4), (y * iw + x) * 4);
      }
      const name = t.key.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 80);
      writeFileSync(`${out}/${name}.png`, await encodePng(img, iw, ih, iw >= 512 ? 2 : 3, [255, 0, 255]));
    }
    if (!only) {
      const d = atlas.build();
      const lv = d.levels[0];
      writeFileSync(`${out}/_atlas.png`, await encodePng(flipRows(lv.data, lv.width, lv.height), lv.width, lv.height, 1, [255, 0, 255]));
      console.log(`d2 atlas ${d.w}×${d.h}, ${(d.bytes / 1048576).toFixed(2)} MB, ${d.ms.toFixed(0)} ms, ${d.texels} texels, ${tiles.size} tiles`);
      console.log(PW_DEBUG_TILE_MS().slice(0, 25).join('\n'));
    }
    w.dispose();
  });
});

/**
 * Warm paint cost of the d2 atlases (skipped unless PW_D2_BENCH is set): builds
 * RESEARCH LABS in PIXEL WORLD three times, painting from scratch each time, and
 * prints the PixelWorld stats of the last (JIT-warm) pass plus the slowest tiles.
 */
describe.skipIf(!process.env.PW_D2_BENCH)('d2 PixelWorld paint bench', () => {
  it('warm paint ms', { timeout: 300_000 }, async () => {
    const { World } = await import('../../src/gameplay/World');
    const { StageRunner } = await import('../../src/gameplay/StageRunner');
    const { AudioSystem } = await import('../../src/audio/Audio');
    const { DEFAULT_SETTINGS } = await import('../../src/core/types');
    const { ALL_STAGES } = await import('../../src/content');
    const { clearPwCache, PW_STATS } = await import('../../src/content/pixelworld/atlas');
    const { nullHud } = await import('./sim');
    const runs: number[] = [];
    const paints: number[] = [];
    for (let i = 0; i < 6; i++) {
      clearPwCache();
      PW_STATS.clear();
      const t0 = performance.now();
      const w = new World(new THREE.PerspectiveCamera(), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
      w.art = 'pixel';
      new StageRunner(w, ALL_STAGES.find((s) => s.id === 'd2')!).start();
      runs.push(performance.now() - t0);
      paints.push([...PW_STATS.values()].reduce((s, a) => s + a.ms, 0));
      w.dispose();
    }
    for (const [n, s] of PW_STATS) console.log(`${n}: ${s.w}×${s.h} ${(s.bytes / 1048576).toFixed(2)} MB, ${(s.texels / 1000).toFixed(0)}k texels, ${s.tiles} tiles`);
    console.log(`paint ms per pass: ${paints.map((r) => r.toFixed(0)).join(', ')} (min warm ${Math.min(...paints.slice(1)).toFixed(0)})`);
    console.log(`env build ms per pass: ${runs.map((r) => r.toFixed(0)).join(', ')}`);
    const tms = PW_DEBUG_TILE_MS();
    console.log(`tile painters total ${tms.reduce((s, l) => s + parseFloat(l), 0).toFixed(1)} ms over ${tms.length} tiles`);
    console.log(tms.slice(0, 30).join('\n'));
    if (process.env.PW_D2_TILES) console.log(PW_DEBUG_TILES().slice(0, 60).join('\n'));
  });
});

/**
 * Scene fingerprint of RESEARCH LABS in CLASSIC / PIXEL CAST (skipped unless
 * PW_D2_FP=<file> is set): every mesh's path, matrix, geometry bytes and
 * material — run on two checkouts and diff the files to prove the classic
 * builds are byte-identical.
 */
describe.skipIf(!process.env.PW_D2_FP)('d2 classic build fingerprint', () => {
  it('writes the fingerprint', { timeout: 300_000 }, async () => {
    const { World } = await import('../../src/gameplay/World');
    const { StageRunner } = await import('../../src/gameplay/StageRunner');
    const { AudioSystem } = await import('../../src/audio/Audio');
    const { DEFAULT_SETTINGS } = await import('../../src/core/types');
    const { ALL_STAGES } = await import('../../src/content');
    const { nullHud } = await import('./sim');
    const { createHash } = await import('node:crypto');
    const out: string[] = [];
    for (const art of ['3d', 'sprites'] as const) {
      const w = new World(new THREE.PerspectiveCamera(), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
      w.art = art;
      new StageRunner(w, ALL_STAGES.find((s) => s.id === 'd2')!).start();
      w.scene.updateMatrixWorld(true);
      const root = w.env!.root;
      let n = 0;
      root.traverse((o) => {
        const path: string[] = [];
        for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) path.push(`${p.type}:${p.name}:${p.parent ? p.parent.children.indexOf(p) : 0}`);
        const h = createHash('sha1');
        h.update(path.join('/'));
        h.update(o.matrixWorld.elements.map((v) => v.toFixed(5)).join(','));
        h.update(`${o.visible}|${o.renderOrder}|${o.frustumCulled}`);
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const g = m.geometry;
          for (const [name, attr] of Object.entries(g.attributes)) {
            h.update(name);
            const arr = (attr as THREE.BufferAttribute).array as ArrayLike<number> & { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
            h.update(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
          }
          if (g.index) h.update(Buffer.from((g.index.array as Uint16Array).buffer, (g.index.array as Uint16Array).byteOffset, (g.index.array as Uint16Array).byteLength));
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mt of mats) {
            const c = (mt as THREE.MeshLambertMaterial).color;
            h.update(`${mt.type}|${c ? c.getHexString() : ''}|${mt.transparent}|${mt.side}|${JSON.stringify(mt.userData.retroTex ?? '')}|${(mt as THREE.MeshLambertMaterial).vertexColors}`);
          }
        }
        out.push(`${art} ${n++} ${o.type} ${h.digest('hex').slice(0, 16)}`);
      });
      out.push(`${art} rng ${w.rng.state}`);
      w.dispose();
    }
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.PW_D2_FP!, out.join('\n'));
    console.log(`fingerprint: ${out.length} lines → ${process.env.PW_D2_FP}`);
  });
});

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ART_NAMES, ART_STYLES, artCast, artWorld, envPending, isArtStyle, nextArt, pixelWorld } from '../../src/core/art';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Save } from '../../src/core/Save';
import { PW_ALIGN, PW_GLOW_A, PW_LEVELS, PW_TPM, PWF, PwCanvas, PwPalette } from '../../src/content/pixelworld/canvas';
import { clearPwCache, paintTile, PW_DEBUG_TILES, PW_STATS, PwAtlas } from '../../src/content/pixelworld/atlas';
import { PwBatch, planarUv } from '../../src/content/pixelworld/batch';
import { pwLevelFor, PW_MIP_BIAS } from '../../src/content/pixelworld/material';
import { drawText, FONT_5x7, FONT_BOLD, rasterText, textWidth } from '../../src/content/pixelworld/font';
import { lookdevBackdrops, lookdevTiles } from '../../src/content/pixelworld/lookdev';
import { brickTile } from '../../src/content/pixelworld/surfaces';
import { volcanoSpan } from '../../src/content/pixelworld/sky';
import { windowModule } from '../../src/content/pixelworld/facade';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { AudioSystem } from '../../src/audio/Audio';
import { Kit } from '../../src/content/kit/ModelKit';
import { nullHud, simulateStage } from './sim';

/** In-memory Storage for the ART migration check. */
function memStorage(init: Record<string, string>): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

const stage = (id: string) => ALL_STAGES.find((s) => s.id === id)!;

/** 0xRRGGBB of an RGBA8 texel. */
function rgbAt(d: Uint8Array, w: number, x: number, y: number): number {
  const i = (y * w + x) * 4;
  return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
}

describe('ART setting: CLASSIC / PIXEL CAST / PIXEL WORLD', () => {
  it('names, queries and the pause chip cycle', () => {
    expect(ART_STYLES).toEqual(['3d', 'sprites', 'pixel']);
    expect(ART_NAMES).toEqual({ '3d': 'CLASSIC', sprites: 'PIXEL CAST', pixel: 'PIXEL WORLD' });
    expect(['3d', 'sprites', 'pixel', 'bogus', undefined].map(isArtStyle)).toEqual([true, true, true, false, false]);
    expect(ART_STYLES.map(artCast)).toEqual([false, true, true]);
    expect(ART_STYLES.map(artWorld)).toEqual([false, false, true]);
    expect(nextArt('3d')).toBe('sprites');
    expect(nextArt('sprites')).toBe('pixel');
    expect(nextArt('pixel')).toBe('3d');
    // Environments follow the style a stage was LOADED with: only a change across PIXEL WORLD waits for the next load.
    expect(envPending('sprites', '3d')).toBe(false);
    expect(envPending('sprites', 'pixel')).toBe(true);
    expect(envPending('pixel', 'sprites')).toBe(true);
  });

  it('default stays PIXEL CAST; saves keep a PIXEL WORLD choice; junk falls back to the default', () => {
    expect(DEFAULT_SETTINGS.art).toBe('sprites');
    const chosen = new Save(memStorage({ 'overrun.save.v1': JSON.stringify({ version: 1, settings: { art: 'pixel', artV: DEFAULT_SETTINGS.artV } }) }), false);
    expect(chosen.settings.art).toBe('pixel');
    const junk = new Save(memStorage({ 'overrun.save.v1': JSON.stringify({ version: 1, settings: { art: 'voxels', artV: DEFAULT_SETTINGS.artV } }) }), false);
    expect(junk.settings.art).toBe(DEFAULT_SETTINGS.art);
    // (An old save that only stored the earlier '3d' default still moves to the current default once.)
    const old = new Save(memStorage({ 'overrun.save.v1': JSON.stringify({ version: 1, settings: { art: '3d' } }) }), false);
    expect(old.settings.art).toBe(DEFAULT_SETTINGS.art);
  });

  it('World.art: the one query stage builders branch on', () => {
    const w = new World(new THREE.PerspectiveCamera(), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, art: 'pixel' }, 1);
    expect(pixelWorld(w)).toBe(true);
    w.art = 'sprites';
    expect(pixelWorld(w)).toBe(false);
    w.dispose();
  });
});

describe('PixelWorld painting', () => {
  it('texel density: 32 texels a metre ≈ one retro pixel at mid range (8 m), whole levels further out', () => {
    expect(PW_TPM).toBe(32);
    expect(PW_ALIGN).toBe(1 << (PW_LEVELS - 1));
    // 58° vertical FOV on 288 lines: metres per pixel at distance D.
    const pxM = (d: number) => (d * 2 * Math.tan((29 * Math.PI) / 180)) / 288;
    const rho = (d: number) => pxM(d) * PW_TPM; // texels per pixel
    expect(rho(8)).toBeGreaterThan(0.85);
    expect(rho(8)).toBeLessThan(1.15);
    expect(pwLevelFor(rho(8), PW_LEVELS)).toBe(0);
    expect(pwLevelFor(rho(20), PW_LEVELS)).toBe(1);
    expect(pwLevelFor(rho(60), PW_LEVELS)).toBe(3);
    expect(pwLevelFor(rho(500), PW_LEVELS)).toBe(PW_LEVELS - 1);
    expect(PW_MIP_BIAS).toBe(0.5);
  });

  it('painters are deterministic and node-safe (no DOM / GL), ramps only', { timeout: 60_000 }, () => {
    const atlasA = new PwAtlas('det-a');
    const atlasB = new PwAtlas('det-b');
    const a = lookdevTiles(atlasA);
    const b = lookdevTiles(atlasB);
    expect(a.map((t) => t.key)).toEqual(b.map((t) => t.key));
    const pal = new PwPalette();
    for (const t of a.slice(0, 12)) {
      const d = (atlasA as unknown as { tiles: Map<string, { paint: Parameters<typeof paintTile>[3] }> }).tiles.get(t.key)!;
      const one = paintTile(t.key, t.w, t.h, d.paint, pal).resolve(pal);
      const two = paintTile(t.key, t.w, t.h, d.paint, pal).resolve(pal);
      expect(Buffer.from(one).equals(Buffer.from(two)), t.key).toBe(true);
      // Alpha classes only: cut / glow / lit.
      let bad = 0;
      for (let i = 3; i < one.length; i += 4) if (one[i] !== 0 && one[i] !== PW_GLOW_A && one[i] !== 255) bad++;
      expect(bad, t.key).toBe(0);
    }
  });

  it('dither is opt-in: integer tones resolve to one step, DITHER texels alternate between two', () => {
    const pal = new PwPalette();
    const r = pal.add(0x7a3a2c);
    const c = new PwCanvas(8, 8);
    c.rect(0, 0, 8, 4, r, 2.5);
    c.rect(0, 4, 8, 4, r, 2.5, PWF.DITHER);
    const px = c.resolve(pal);
    const col = (x: number, y: number) => rgbAt(px, 8, x, y);
    const top = new Set<number>();
    const bottom = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) top.add(col(x, y));
    for (let y = 4; y < 8; y++) for (let x = 0; x < 8; x++) bottom.add(col(x, y));
    expect(top.size).toBe(1);
    expect(bottom.size).toBe(2);
  });

  it('wrap tiles are seamless (brick bond continues across the tile edge) and sized for the mip levels', () => {
    const atlas = new PwAtlas('seam');
    const t = brickTile(atlas, { hex: 0x7a3a2c });
    expect(t.wrap).toBe(true);
    expect(t.w % PW_ALIGN).toBe(0);
    expect(t.h % PW_ALIGN).toBe(0);
    const pal = new PwPalette();
    const d = (atlas as unknown as { tiles: Map<string, { paint: Parameters<typeof paintTile>[3] }> }).tiles.get(t.key)!;
    const c = paintTile(t.key, t.w, t.h, d.paint, pal);
    // Bed joints (the mortar rows) are every 4 rows on both edges; head joints repeat every 11 columns across the wrap.
    const mortar = c.ramp[0];
    for (let y = 0; y < t.h; y += 4) expect(c.ramp[y * t.w + 5]).toBe(mortar);
    expect(t.w % 11).toBe(0);
  });

  it('atlas: rects aligned, levels palette-faithful, cached by tile list', { timeout: 60_000 }, () => {
    clearPwCache();
    const atlas = new PwAtlas('pack');
    const tiles = lookdevTiles(atlas);
    const d = atlas.build();
    for (const t of tiles) {
      expect(t.x % PW_ALIGN, t.key).toBe(0);
      expect(t.y % PW_ALIGN, t.key).toBe(0);
      expect(t.x + t.w).toBeLessThanOrEqual(d.w);
      expect(t.y + t.h).toBeLessThanOrEqual(d.h);
    }
    expect(d.levels.length).toBeGreaterThanOrEqual(PW_LEVELS);
    // Every level-1 colour of a tile exists at level 0 (texels are picked, never blended).
    const t = tiles[0];
    const l0 = d.levels[0];
    const l1 = d.levels[1];
    const colours = new Set<number>();
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) colours.add(rgbAt(l0.data, l0.width, x, y));
    let missing = 0;
    for (let y = t.y >> 1; y < (t.y + t.h) >> 1; y++) for (let x = t.x >> 1; x < (t.x + t.w) >> 1; x++) if (!colours.has(rgbAt(l1.data, l1.width, x, y))) missing++;
    expect(missing).toBe(0);
    const again = new PwAtlas('pack');
    lookdevTiles(again);
    again.build();
    expect(PW_STATS.get('pack')!.cached).toBe(true);
  });

  it('pixel fonts: bitmap glyphs, tube neon, measured widths', () => {
    // Five 5-wide glyphs, a 1-texel gap between them.
    expect(textWidth('HOTEL', FONT_5x7)).toBe(29);
    const m = rasterText('A', FONT_BOLD);
    expect(m.data.reduce((s, v) => s + v, 0)).toBeGreaterThan(15);
    const c = new PwCanvas(80, 20);
    const pal = new PwPalette();
    const w = drawText(c, 'OPEN 24', 1, 1, FONT_BOLD, pal.add(0xff2c2c), 5, { flag: PWF.GLOW });
    expect(w).toBeGreaterThan(30);
    expect(c.coverage()).toBeGreaterThan(0.05);
  });

  it('batch: world-scale UVs (32 texels a metre) and one mesh for every quad', () => {
    const atlas = new PwAtlas('batch');
    const brick = brickTile(atlas, { hex: 0x7a3a2c });
    const win = windowModule(atlas, 'warm', { wall: 0x7a3a2c, frame: 0xd8d4c8, stone: 0x86827a });
    const b = new PwBatch(atlas);
    b.rect(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 10, 4, brick);
    b.rect(new THREE.Vector3(2, 1, 0.015), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 1.5, 2.125, win);
    b.box(0, 0.5, -3, 2, 1, 2, brick);
    const mesh = b.build()!;
    expect(mesh).toBeTruthy();
    const uv = mesh.geometry.getAttribute('pwUv');
    expect(uv.getX(1) - uv.getX(0)).toBeCloseTo(10 * PW_TPM, 5);
    expect(uv.getY(2) - uv.getY(1)).toBeCloseTo(4 * PW_TPM, 5);
    const rect = mesh.geometry.getAttribute('pwRect');
    expect(rect.getZ(0)).toBe(brick.w); // wrap: positive width
    expect(rect.getZ(4)).toBe(-win.w); // module: clamped
    expect(planarUv(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 0, 1), 32)).toEqual([32, 64]);
    // Scenery only: never raycast.
    const hits: THREE.Intersection[] = [];
    mesh.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
  });
});

describe('PixelWorld stages (budgets, gameplay unchanged)', () => {
  /** Build a stage's environment headless in an ART style; returns the world (dispose it). */
  function build(id: string, art: 'sprites' | 'pixel') {
    const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
    w.art = art;
    const runner = new StageRunner(w, stage(id));
    runner.start();
    w.scene.updateMatrixWorld(true);
    return w;
  }

  function pwMeshes(w: World): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    w.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.pixelWorld) out.push(m);
    });
    return out;
  }

  for (const id of ['z1', 'd1']) {
    it(`${id}: PIXEL WORLD builds painted scenery within budget; occluders and ground identical to PIXEL CAST`, { timeout: 120_000 }, () => {
      clearPwCache();
      PW_STATS.clear();
      const t0 = performance.now();
      const px = build(id, 'pixel');
      const ms = performance.now() - t0;
      const meshes = pwMeshes(px);
      expect(meshes.length).toBeGreaterThan(0);
      // Budgets: atlas memory (all PixelWorld atlases of the stage) ≤ 24 MB; painting time recorded.
      const stats = [...PW_STATS.values()];
      const bytes = stats.reduce((s, a) => s + a.bytes, 0);
      const paint = stats.reduce((s, a) => s + a.ms, 0);
      console.log(
        `${id} PIXEL WORLD: ${stats.length} atlases (${[...PW_STATS].map(([n, a]) => `${n} ${a.w}×${a.h} ${(a.bytes / 1048576).toFixed(1)} MB ${a.ms.toFixed(0)} ms ${(a.texels / 1000).toFixed(0)}k texels`).join(', ')}), ` +
          `${(bytes / 1048576).toFixed(1)} MB, paint ${paint.toFixed(0)} ms, env build ${ms.toFixed(0)} ms, ${meshes.length} PW meshes, ${meshes.reduce((s, m) => s + m.geometry.getAttribute('position').count, 0)} verts`,
      );
      if (process.env.PW_TILES) {
        // Debug: what fills the atlases (PW_TILES=1).
        px.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          const a = (m.material as THREE.Material | undefined)?.userData?.pw ? (m.userData.pixelWorld ? m : null) : null;
          void a;
        });
        for (const [name, st] of PW_STATS) console.log(name, st);
        console.log(PW_DEBUG_TILES().slice(0, 60).join('\n'));
      }
      expect(bytes).toBeLessThanOrEqual(24 * 1048576);
      // Warm (second load in the session, painted again from scratch): the JIT-warmed painting cost.
      clearPwCache();
      PW_STATS.clear();
      const warm = build(id, 'pixel');
      const warmPaint = [...PW_STATS.values()].reduce((s, a) => s + a.ms, 0);
      console.log(`${id} PIXEL WORLD warm repaint: ${warmPaint.toFixed(0)} ms (${[...PW_STATS].map(([n, a]) => `${n} ${a.ms.toFixed(0)} ms`).join(', ')})`);
      warm.dispose();
      // PixelWorld meshes are scenery: never occluders.
      const occ = new Set(px.env!.occluders ?? []);
      for (const m of meshes) expect(occ.has(m)).toBe(false);
      const sp = build(id, 'sprites');
      expect(pwMeshes(sp)).toEqual([]);
      // Same occluders (count, placement), same walkable ground.
      const occOf = (w: World) =>
        (w.env!.occluders ?? []).map((o) => {
          o.updateMatrixWorld(true);
          const b = new THREE.Box3().setFromObject(o);
          return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => Math.round(v * 1000));
        });
      expect(occOf(px)).toEqual(occOf(sp));
      for (const [x, z] of [[0, 0], [-60, -300], [-4, -150], [3, -20]]) expect(px.env!.groundAt?.(x, z) ?? 0).toBe(sp.env!.groundAt?.(x, z) ?? 0);
      // The world RNG is untouched by the scenery (gameplay draws stay identical).
      expect(px.rng.state).toBe(sp.rng.state);
      px.dispose();
      sp.dispose();
      Kit.disposeAll();
    });
  }

  it('backdrops: one-level panoramas, 2048 texels round (≈ 1 texel a retro pixel)', () => {
    const sky = new PwAtlas('sky-test', { levels: 1 });
    const tiles = lookdevBackdrops(sky);
    const d = sky.build();
    expect(d.levels.length).toBe(1);
    // Full-round panoramas are 2048 texels; a panel (the volcano) keeps that density over its span.
    for (const t of tiles) {
      if (t.key.startsWith('volcano|')) expect(t.w).toBe(Math.round((volcanoSpan({ halfWidth: 26 }) * 2048) / 360 / 16) * 16);
      else expect(t.w).toBe(2048);
    }
    // No mip chain for panoramas (painted at the screen's own density).
    expect(d.bytes).toBe(d.w * d.h * 4);
  });

  it('z1 in PIXEL WORLD plays exactly like PIXEL CAST (stage simulator)', { timeout: 300_000 }, () => {
    const a = simulateStage(stage('z1'), { art: 'sprites', maxTime: 120 });
    const b = simulateStage(stage('z1'), { art: 'pixel', maxTime: 120 });
    expect(b.errors).toEqual([]);
    expect({ ...b, errors: [] }).toEqual({ ...a, errors: [] });
  });
});

describe('d2 RESEARCH LABS in PIXEL WORLD (budgets, gameplay unchanged)', () => {
  function buildD2(art: 'sprites' | 'pixel' | '3d') {
    const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
    w.art = art;
    new StageRunner(w, stage('d2')).start();
    w.scene.updateMatrixWorld(true);
    return w;
  }
  const pwOf = (w: World) => {
    const out: THREE.Mesh[] = [];
    w.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.pixelWorld) out.push(m);
    });
    return out;
  };
  const occOf = (w: World) =>
    (w.env!.occluders ?? []).map((o) => {
      o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o);
      return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => Math.round(v * 1000));
    });

  it('painted scenery within budget; occluders, ground and the RNG identical to PIXEL CAST; shells still stop bullets', { timeout: 180_000 }, () => {
    clearPwCache();
    PW_STATS.clear();
    const px = buildD2('pixel');
    const meshes = pwOf(px);
    expect(meshes.length).toBeGreaterThan(20);
    const stats = [...PW_STATS.values()];
    const bytes = stats.reduce((s, a) => s + a.bytes, 0);
    console.log(`d2 PIXEL WORLD: ${[...PW_STATS].map(([n, a]) => `${n} ${a.w}×${a.h} ${(a.bytes / 1048576).toFixed(2)} MB ${a.ms.toFixed(0)} ms`).join(', ')}, ${meshes.length} PW meshes`);
    expect(bytes).toBeLessThanOrEqual(24 * 1048576);
    // PixelWorld meshes are scenery: never occluders, never raycast.
    const occ = new Set(px.env!.occluders ?? []);
    for (const m of meshes) expect(occ.has(m)).toBe(false);
    const sp = buildD2('sprites');
    expect(pwOf(sp)).toEqual([]);
    // Same occluders in the same order and place (the classic shells, hidden but still there), same ground.
    expect(occOf(px)).toEqual(occOf(sp));
    for (const [x, z] of [[2.5, 0], [0, -60], [0, -100], [0, -140], [0, -180], [0, -205], [6, -250], [11, -285], [11, -310], [11, -355]]) {
      expect(px.env!.groundAt?.(x, z) ?? 0).toBe(sp.env!.groundAt?.(x, z) ?? 0);
    }
    expect(px.rng.state).toBe(sp.rng.state);
    // A ray down the lobby still stops on the (invisible) far wall shell.
    const ray = new THREE.Raycaster(new THREE.Vector3(2.5, 1.6, -10), new THREE.Vector3(0, 0, -1), 0, 200);
    const hits = (w: World) => ray.intersectObjects(w.env!.occluders ?? [], true).map((h) => Math.round(h.distance * 100));
    expect(hits(px)).toEqual(hits(sp));
    expect(hits(px).length).toBeGreaterThan(0);
    px.dispose();
    sp.dispose();
    Kit.disposeAll();
  });

  it('d2 in PIXEL WORLD plays exactly like PIXEL CAST (stage simulator)', { timeout: 600_000 }, () => {
    const a = simulateStage(stage('d2'), { art: 'sprites', maxTime: 240 });
    const b = simulateStage(stage('d2'), { art: 'pixel', maxTime: 240 });
    expect(b.errors).toEqual([]);
    expect({ ...b, errors: [] }).toEqual({ ...a, errors: [] });
  });
});

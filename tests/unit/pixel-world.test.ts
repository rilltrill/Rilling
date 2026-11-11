import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Z1Flats } from '../../src/content/stages/z1/pwFlats';
import { ART_NAMES, ART_STYLES, artCast, artWorld, envPending, isArtStyle, nextArt, pixelWorld } from '../../src/core/art';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { migrateArt, Save } from '../../src/core/Save';
import {
  extendRamp, PW_ALIGN, PW_GLOW_A, PW_LEVELS, PW_PAL_BRIGHT, PW_PAL_DEEP, PW_PAL_W, PW_TONES, PW_TPM, PW_TPM_CLOSE, PW_TPM_FAR, PW_TPM_MID, PW_TPM_NEAR, PWF, PWI, PwCanvas,
  PwPalette, pwDensityFor, pwPalAt,
} from '../../src/content/pixelworld/canvas';
import { pwUpscale2x } from '../../src/content/pixelworld/upscale';
import { hexToOklch } from '../../src/gameplay/pixel/materials';
import {
  clearPwCache,
  paintTile,
  pwCacheHas,
  pwCacheKeep,
  pwCached,
  pwDeferPaint,
  pwMenuAtlas,
  pwPaintCancel,
  pwPaintPending,
  pwPaintStep,
  PW_DEBUG_TILES,
  PW_STATS,
  PwAtlas,
  pwRect,
  pwTileLevel,
  pwUpscale,
  type PwTile,
} from '../../src/content/pixelworld/atlas';
import { pwStoreFlush, pwStorePrefetch } from '../../src/content/pixelworld/store';
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

  it('default is PIXEL WORLD (versioned migration: un-chosen old defaults move, choices stay); junk falls back to the default', () => {
    expect(DEFAULT_SETTINGS.art).toBe('pixel');
    expect(DEFAULT_SETTINGS.artV).toBe(3);
    const load = (settings: object) => new Save(memStorage({ 'overrun.save.v1': JSON.stringify({ version: 1, settings }) }), false).settings;
    // Generation 1 (no artV: '3d' was simply the stored default) → PIXEL WORLD.
    expect(load({ art: '3d' }).art).toBe('pixel');
    // Generation 2 (PIXEL CAST default): PIXEL CAST was the default → PIXEL WORLD; CLASSIC / PIXEL WORLD were choices → kept.
    expect(load({ art: 'sprites', artV: 2 }).art).toBe('pixel');
    expect(load({ art: '3d', artV: 2 }).art).toBe('3d');
    expect(load({ art: '3d', artV: 2 }).artPicked).toBe(true);
    expect(load({ art: 'pixel', artV: 2 }).art).toBe('pixel');
    // Generation 3 on: whatever is stored stays; a recorded choice survives later default changes.
    expect(load({ art: 'sprites', artV: 3 }).art).toBe('sprites');
    expect(load({ art: 'sprites', artV: 2, artPicked: true }).art).toBe('sprites');
    // Junk → the default.
    expect(load({ art: 'voxels', artV: 3 }).art).toBe(DEFAULT_SETTINGS.art);
    // A change of ART is recorded as the player's choice.
    const s = new Save(memStorage({}), false);
    expect(s.settings.art).toBe('pixel');
    expect(!!s.settings.artPicked).toBe(false);
    s.updateSettings({ art: 'sprites' });
    expect(s.settings.artPicked).toBe(true);
    expect(migrateArt({ ...s.settings, artV: 2 })).toBe('sprites');
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
    // PIXEL WORLD 2 tiers: the density that keeps a texel under ~1.5 frame pixels at the nearest normal view.
    expect([PW_TPM_FAR, PW_TPM_MID, PW_TPM_NEAR, PW_TPM_CLOSE]).toEqual([32, 64, 96, 128]);
    expect([8, 6, 4, 3, 2, 1.8, 1].map(pwDensityFor)).toEqual([32, 32, 64, 64, 96, 96, 128]);
    const pxPerTexel = (density: number, d: number) => 1 / (pxM(d) * density);
    for (const [d, lo] of [[6, 32], [3, 64], [1.8, 96]] as const) expect(pxPerTexel(pwDensityFor(d), lo === 32 ? 6 : d)).toBeLessThan(1.6);
    // A tile stored at 2× picks its level for the stored texels: the upscaler's copy (level 0) only
    // where a painted texel is magnified past √2 pixels, the painted texels (level 1) where the first pass showed them.
    expect(pwLevelFor(rho(4), PW_LEVELS + 1, PW_MIP_BIAS, 2)).toBe(0);
    expect(pwLevelFor(rho(8), PW_LEVELS + 1, PW_MIP_BIAS, 2)).toBe(1);
    expect(pwLevelFor(rho(20), PW_LEVELS + 1, PW_MIP_BIAS, 2)).toBe(pwLevelFor(rho(20), PW_LEVELS) + 1);
    expect(pwLevelFor(rho(500), PW_LEVELS + 1, PW_MIP_BIAS, 2)).toBe(PW_LEVELS);
  });

  it('stored texels are indices: ramp, tone, glow in 16 bits; the palette row extends each ramp both ways', () => {
    const pal = new PwPalette();
    const brick = pal.add(0x7a3a2c);
    const neon = pal.add(0xff2c2c);
    const c = new PwCanvas(4, 1);
    c.set(0, 0, brick, 3);
    c.set(1, 0, neon, 5, PWF.GLOW);
    c.set(2, 0, brick, 0);
    const t = c.index();
    expect([...t]).toEqual([brick | (3 << PWI.TONE_SHIFT), neon | (5 << PWI.TONE_SHIFT) | PWI.GLOW, brick, 0]);
    // The painted colour of a texel is its palette entry; `resolve` is the same through RGBA.
    const px = c.resolve(pal);
    const q = pwPalAt(t[0]);
    expect([px[0], px[1], px[2], px[3]]).toEqual([pal.rgba[q], pal.rgba[q + 1], pal.rgba[q + 2], 255]);
    expect(rgbAt(px, 4, 0, 0)).toBe(pal.ramps[brick - 1][3]);
    expect(px[7]).toBe(PW_GLOW_A);
    expect(px[15]).toBe(0);
    expect(PW_PAL_W).toBe(PW_PAL_DEEP + PW_TONES + PW_PAL_BRIGHT);
    expect(pal.rows().length).toBe(3 * PW_PAL_W * 4);
    // Every ramp of a spread of materials: the six painted tones in the middle, lightness strictly rising
    // across all sixteen... the deep end blue-violet and never black, the bright end warm and never pure white.
    for (const hex of [0x7a3a2c, 0x2c2f37, 0x8a7454, 0x4f8a2e, 0x2f7fd0, 0xff2c2c, 0xe8f8f0, 0xffd23a, 0x86827a, 0x45301f, 0x1f3a6a, 0x9a7a52]) {
      const ramp = pal.ramps[pal.add(hex) - 1];
      const row = extendRamp(ramp);
      expect(row.length).toBe(PW_PAL_W);
      expect(row.slice(PW_PAL_DEEP, PW_PAL_DEEP + PW_TONES)).toEqual(ramp);
      const lch = row.map((v) => hexToOklch(v));
      // (Within one 8-bit step: the deep end of a dark ramp parts its tones by hue where there is no lightness left.)
      for (let i = 1; i < PW_PAL_W; i++) expect(lch[i][0], `${hex.toString(16)} step ${i}`).toBeGreaterThanOrEqual(lch[i - 1][0] - 0.006);
      expect(lch[PW_PAL_DEEP][0]).toBeGreaterThan(lch[0][0]);
      // Deep: distinct colours all the way down, the deepest a blue-violet (hue 250°…320°) with real chroma, not black.
      expect(new Set(row.slice(0, PW_PAL_DEEP + 1)).size, hex.toString(16)).toBe(PW_PAL_DEEP + 1);
      expect(lch[0][0]).toBeGreaterThan(0.07);
      expect(lch[0][1]).toBeGreaterThan(0.03);
      expect(lch[0][2]).toBeGreaterThan(250);
      expect(lch[0][2]).toBeLessThan(320);
      expect(row[0] & 0xff).toBeGreaterThan((row[0] >> 16) & 0xff);
      // Bright: never pure white, warm (red ≥ blue) at the top.
      const top = row[PW_PAL_W - 1];
      expect(top).not.toBe(0xffffff);
      expect(lch[PW_PAL_W - 1][0]).toBeLessThan(0.985);
      expect((top >> 16) & 0xff).toBeGreaterThanOrEqual(top & 0xff);
    }
  });

  it('the pixel-art upscaler: shapes smoothed on equal texels, in-between tones on one ramp, crisp cut-outs, glow kept, dither redone finer', () => {
    const pal = new PwPalette();
    const a = pal.add(0x7a3a2c);
    const b = pal.add(0x2f7fd0);
    const tx = (r: number, tone: number, glow = false) => r | (tone << PWI.TONE_SHIFT) | (glow ? PWI.GLOW : 0);
    const at = (up: Uint16Array, w: number, x: number, y: number) => up[y * w * 2 + x];
    // A flat field stays flat; every painted texel survives in its own 2 × 2 block.
    {
      const c = new PwCanvas(8, 8);
      c.rect(0, 0, 8, 8, a, 3);
      c.rect(2, 2, 3, 3, b, 2);
      const up = pwUpscale2x(c, false);
      const src = c.index();
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const block = [at(up, 8, x * 2, y * 2), at(up, 8, x * 2 + 1, y * 2), at(up, 8, x * 2, y * 2 + 1), at(up, 8, x * 2 + 1, y * 2 + 1)];
        expect(block).toContain(src[y * 8 + x]);
      }
      // (EPX takes the one corner sub-texel off a convex corner: a rectangle comes out with its corners eased, sides straight.)
      expect(at(up, 8, 4, 4)).toBe(tx(a, 3));
      expect(at(up, 8, 5, 4)).toBe(tx(b, 2));
      expect(at(up, 8, 4, 5)).toBe(tx(b, 2));
      expect(at(up, 8, 3, 3)).toBe(tx(a, 3));
      for (let k = 5; k < 9; k++) expect([at(up, 8, k, 4), at(up, 8, 4, k), at(up, 8, k, 9), at(up, 8, 9, k)]).toEqual([tx(b, 2), tx(b, 2), tx(b, 2), tx(b, 2)]);
    }
    // A staircase of another ramp becomes a diagonal (EPX: the corner between two equal neighbours is theirs).
    {
      const c = new PwCanvas(6, 6);
      c.rect(0, 0, 6, 6, a, 3);
      for (let i = 0; i < 6; i++) c.rect(0, i, i + 1, 1, b, 2);
      const up = pwUpscale2x(c, false);
      // Texel (2, 1) is ground with blob to its left and below: its bottom-left corner turns blob.
      expect(at(up, 6, 4, 3)).toBe(tx(b, 2));
      expect(at(up, 6, 5, 2)).toBe(tx(a, 3));
      // Only texels of the two ramps at their painted tones (no blend across ramps).
      expect(new Set(up)).toEqual(new Set([tx(a, 3), tx(b, 2)]));
    }
    // The same staircase between two tones of ONE ramp three steps apart: the corner takes a tone in between.
    {
      const c = new PwCanvas(6, 6);
      c.rect(0, 0, 6, 6, a, 4);
      for (let i = 0; i < 6; i++) c.rect(0, i, i + 1, 1, a, 1);
      const up = pwUpscale2x(c, false);
      expect(at(up, 6, 4, 3)).toBe(tx(a, 3));
      expect([...new Set(up)].sort()).toEqual([tx(a, 1), tx(a, 2), tx(a, 3), tx(a, 4)].sort());
      // One step apart there is no in-between: plain EPX.
      const d = new PwCanvas(6, 6);
      d.rect(0, 0, 6, 6, a, 3);
      for (let i = 0; i < 6; i++) d.rect(0, i, i + 1, 1, a, 2);
      expect(new Set(pwUpscale2x(d, false))).toEqual(new Set([tx(a, 3), tx(a, 2)]));
    }
    // Cut-out: corners are cut or filled whole (empty or the painted texel, nothing else); glow is copied, never toned.
    {
      const c = new PwCanvas(6, 6);
      for (let i = 0; i < 6; i++) c.rect(0, i, i + 1, 1, a, 4);
      c.set(5, 0, a, 1, PWF.GLOW);
      c.set(4, 1, a, 1, PWF.GLOW);
      const up = pwUpscale2x(c, false);
      expect(new Set(up)).toEqual(new Set([0, tx(a, 4), tx(a, 1, true)]));
      expect(at(up, 6, 4, 3)).toBe(tx(a, 4));
    }
    // A hand-made one-texel checker stays a one-texel checker at 2×; a DITHER band is re-dithered on the 2× grid.
    {
      const c = new PwCanvas(8, 8);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) c.set(x, y, a, (x + y) & 1 ? 2 : 4);
      const up = pwUpscale2x(c, true);
      let same = 0;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 15; x++) if (at(up, 8, x, y) === at(up, 8, x + 1, y)) same++;
      expect(same).toBe(0);
      const g = new PwCanvas(8, 8);
      g.rect(0, 0, 8, 8, a, 2.5, PWF.DITHER);
      const ug = pwUpscale2x(g, true);
      same = 0;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 15; x++) if (at(ug, 8, x, y) === at(ug, 8, x + 1, y)) same++;
      expect(same).toBe(0);
      expect(new Set(ug)).toEqual(new Set([tx(a, 2), tx(a, 3)]));
      // A band from tone 1 to 4 across the tile: the 2× copy steps through the same tones, in order, finer.
      const band = new PwCanvas(16, 4);
      band.rect(0, 0, 16, 4, a, (x) => 1 + (x / 15) * 3, PWF.DITHER);
      const ub = pwUpscale2x(band, false);
      const mean = (x0: number) => {
        let s = 0;
        for (let y = 0; y < 8; y++) for (let x = x0; x < x0 + 8; x++) s += (at(ub, 16, x, y) & PWI.TONE) >> PWI.TONE_SHIFT;
        return s / 64;
      };
      expect(mean(0)).toBeLessThan(mean(8));
      expect(mean(8)).toBeLessThan(mean(16));
      expect(mean(16)).toBeLessThan(mean(24));
    }
    // Every toolkit tile: a texel outside a dithered band survives in its own 2 × 2 block; inside one, the block keeps
    // its ramp at a tone next to its own; no texel of the copy is anything the tile (or the in-between rule) could not give.
    {
      const lookdev = new PwAtlas('up-all', { upscale: false });
      for (const t of lookdevTiles(lookdev)) {
        const def = (lookdev as unknown as { tiles: Map<string, { paint: Parameters<typeof paintTile>[3] }> }).tiles.get(t.key)!;
        const c = paintTile(t.key, t.w, t.h, def.paint, pal);
        const src = c.index();
        const up = pwUpscale2x(c, t.wrap);
        const ramps = new Set(src.map((v) => v & (PWI.RAMP | PWI.GLOW)));
        let lost = 0;
        let foreign = 0;
        for (let y = 0; y < t.h; y++) {
          for (let x = 0; x < t.w; x++) {
            const i = y * t.w + x;
            const blk = [at(up, t.w, x * 2, y * 2), at(up, t.w, x * 2 + 1, y * 2), at(up, t.w, x * 2, y * 2 + 1), at(up, t.w, x * 2 + 1, y * 2 + 1)];
            if (c.flag[i] & PWF.DITHER && c.ramp[i]) {
              const ok = blk.some((v) => (v & PWI.RAMP) === c.ramp[i] && Math.abs(((v & PWI.TONE) >> PWI.TONE_SHIFT) - c.tone[i]) <= 1.5);
              if (!ok) lost++;
            } else if (!blk.includes(src[i])) lost++;
            for (const v of blk) if (!ramps.has(v & (PWI.RAMP | PWI.GLOW)) || ((v & PWI.TONE) >> PWI.TONE_SHIFT) > 5) foreign++;
          }
        }
        expect(lost, t.key).toBe(0);
        expect(foreign, t.key).toBe(0);
      }
    }
    // Wrap tiles stay seamless: the 2× copy of a tile laid twice is the copy laid twice.
    {
      const atlas = new PwAtlas('up-seam', { upscale: false });
      const t = brickTile(atlas, { hex: 0x7a3a2c });
      const def = (atlas as unknown as { tiles: Map<string, { paint: Parameters<typeof paintTile>[3] }> }).tiles.get(t.key)!;
      const one = paintTile(t.key, t.w, t.h, def.paint, pal);
      const two = new PwCanvas(t.w * 2, t.h);
      two.blit(one, 0, 0);
      two.blit(one, t.w, 0);
      const u1 = pwUpscale2x(one, true);
      const u2 = pwUpscale2x(two, true);
      let bad = 0;
      for (let y = 0; y < t.h * 2; y++) for (let x = 0; x < t.w * 4; x++) if (u2[y * t.w * 4 + x] !== u1[y * t.w * 2 + (x % (t.w * 2))]) bad++;
      expect(bad).toBe(0);
    }
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
    // First-pass tiles (32 texels a metre) are stored at 2×: one level more, rects aligned for it.
    expect(d.mips).toBe(PW_LEVELS + 1);
    expect(atlas.levels).toBe(PW_LEVELS + 1);
    expect(d.up).toBe(tiles.length);
    for (const t of tiles) {
      expect(t.scale, t.key).toBe(2);
      expect(t.x % (PW_ALIGN * 2), t.key).toBe(0);
      expect(t.y % (PW_ALIGN * 2), t.key).toBe(0);
      expect(t.x + t.w * 2).toBeLessThanOrEqual(d.w);
      expect(t.y + t.h * 2).toBeLessThanOrEqual(d.h);
      expect(pwRect(t)).toEqual([t.x, t.y, t.wrap ? t.w : -t.w, -t.h]);
    }
    expect(d.levels.length).toBeGreaterThanOrEqual(PW_LEVELS + 1);
    // Two bytes a texel at every level, plus the palette (a row a ramp and the unused row 0).
    expect(d.levels[0].data.length).toBe(d.w * d.h * 2);
    expect(d.levels[0].idx.buffer).toBe(d.levels[0].data.buffer);
    expect(d.bytes).toBe(d.levels.reduce((s, l) => s + l.data.length, 0) + d.pal.length);
    expect(d.pal.length % (PW_PAL_W * 4)).toBe(0);
    const ramps = d.pal.length / (PW_PAL_W * 4) - 1;
    expect(ramps).toBeGreaterThan(20);
    expect(PW_STATS.get('pack')!.ramps).toBe(ramps);
    for (const t of tiles) {
      const w = t.w;
      const h = t.h;
      const texels = (k: number) => {
        const lv = pwTileLevel(d, t, k)!;
        const out: number[] = [];
        for (let y = 0; y < h >> k; y++) for (let x = 0; x < w >> k; x++) out.push(lv.idx[(lv.y + y) * lv.width + lv.x + x]);
        return out;
      };
      // Every texel is a ramp of the palette at a painted tone.
      const l0 = texels(0);
      for (const v of l0) {
        expect(v & PWI.RAMP).toBeLessThanOrEqual(ramps);
        if (v) expect((v & PWI.TONE) >> PWI.TONE_SHIFT).toBeLessThan(PW_TONES);
      }
      // Every level texel of a tile exists one level up (texels are picked, never blended), all the way down.
      let above = new Set(l0);
      for (let k = 1; k < PW_LEVELS; k++) {
        const here = texels(k);
        let missing = 0;
        for (const v of here) if (!above.has(v)) missing++;
        expect(missing, `${t.key} level ${k}`).toBe(0);
        above = new Set(here);
      }
      // The upscaler's copy (stored level 0, rows bottom-up like every level) keeps each painted texel's ramp in
      // its own 2 × 2 block and brings in no ramp the tile was not painted with.
      const up = d.levels[0];
      const rampsOf = new Set(l0.map((v) => v & PWI.RAMP));
      let lost = 0;
      let foreign = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const o = (t.y + y * 2) * up.width + t.x + x * 2;
          const blk = [up.idx[o], up.idx[o + 1], up.idx[o + up.width], up.idx[o + up.width + 1]];
          if (!blk.some((v) => (v & PWI.RAMP) === (l0[y * w + x] & PWI.RAMP))) lost++;
          for (const v of blk) if (!rampsOf.has(v & PWI.RAMP)) foreign++;
        }
      }
      expect(lost, t.key).toBe(0);
      expect(foreign, t.key).toBe(0);
    }
    const again = new PwAtlas('pack');
    lookdevTiles(again);
    again.build();
    expect(PW_STATS.get('pack')!.cached).toBe(true);
  });

  it('density and the 2× fallback: native tiles are stored as painted, opt-outs and one-level atlases too; `pwUpscale(false)` is the first pass', () => {
    clearPwCache();
    const paint = (c: PwCanvas, k: { ramp(hex: number): number }) => c.rect(0, 0, c.w, c.h, k.ramp(0x806040), 2);
    const atlas = new PwAtlas('tiers');
    const far = atlas.tile('far', 32, 32, paint, { wrap: true });
    const optOut = atlas.tile('far-only', 32, 32, paint, { wrap: true, upscale: false });
    const mid = atlas.tile('mid', 64, 64, paint, { wrap: true, density: PW_TPM_MID });
    const near = atlas.tile('near', 96, 96, paint, { density: PW_TPM_NEAR });
    const close = atlas.tile('close', 128, 128, paint, { wrap: true, density: PW_TPM_CLOSE });
    expect([far.scale, optOut.scale, mid.scale, near.scale, close.scale]).toEqual([2, 1, 1, 1, 1]);
    // A native wrap tile needs every one of its six levels whole.
    expect(() => atlas.tile('bad', 48, 48, paint, { wrap: true, density: PW_TPM_MID })).toThrow(/multiple of 32/);
    const d = atlas.build();
    expect(d.mips).toBe(PW_LEVELS + 1);
    expect(d.up).toBe(1);
    for (const t of [far, optOut, mid, near, close]) {
      expect(t.x % 32).toBe(0);
      expect(t.y % 32).toBe(0);
      expect(pwRect(t)[3]).toBe(t.scale === 2 ? -t.h : t.h);
    }
    // The batch lays a wrap tile at its own density (painted texels) and carries the tile's rect.
    const batch = new PwBatch(atlas);
    for (const t of [far, mid, close]) batch.rect(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 2, 1, t);
    const mesh = batch.build()!;
    const uv = mesh.geometry.getAttribute('pwUv');
    const rect = mesh.geometry.getAttribute('pwRect');
    expect([uv.getX(2), uv.getY(2), uv.getX(6), uv.getY(6), uv.getX(10), uv.getY(10)]).toEqual([64, 32, 128, 64, 256, 128]);
    expect([rect.getW(0), rect.getW(4), rect.getW(8)]).toEqual([-32, 64, 128]);
    mesh.geometry.dispose();
    Kit.disposeAll();
    // One-level atlases (backdrops) are never upscaled; neither is anything with the fallback off.
    const sky = new PwAtlas('tiers-sky', { levels: 1 });
    expect(sky.tile('s', 64, 64, paint, { wrap: true }).scale).toBe(1);
    expect(sky.levels).toBe(1);
    pwUpscale(false);
    try {
      const v1 = new PwAtlas('tiers-v1');
      const t = v1.tile('far', 32, 32, paint, { wrap: true });
      expect(t.scale).toBe(1);
      const dv = v1.build();
      expect(dv.mips).toBe(PW_LEVELS);
      expect(t.x % PW_ALIGN).toBe(0);
      expect(dv.up).toBe(0);
      expect(v1.signature()).not.toBe(new PwAtlas('tiers-v1').signature());
    } finally {
      pwUpscale(true);
    }
    clearPwCache();
  });

  it('the 2× fallback is a safety net only: every painted level of every stage tile is texel for texel what it is without it', { timeout: 600_000 }, () => {
    const grab = (id: string) => {
      clearPwCache();
      const out = new Map<string, { d: ReturnType<PwAtlas['build']>; tiles: PwTile[] }>();
      const build = PwAtlas.prototype.build;
      PwAtlas.prototype.build = function (this: PwAtlas) {
        const d = build.call(this);
        out.set(this.name, { d, tiles: [...(this as unknown as { tiles: Map<string, { tile: PwTile }> }).tiles.values()].map((t) => ({ ...t.tile })) });
        return d;
      };
      try {
        const w = new World(new THREE.PerspectiveCamera(), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, art: 'pixel' }, 7);
        new StageRunner(w, stage(id)).start();
        w.dispose();
      } finally {
        PwAtlas.prototype.build = build;
      }
      Kit.disposeAll();
      return out;
    };
    for (const id of ['z1', 'z2', 'z3', 'd1', 'd2', 'd3']) {
      pwUpscale(false);
      let plain: ReturnType<typeof grab>;
      try {
        plain = grab(id);
      } finally {
        pwUpscale(true);
      }
      const up = grab(id);
      expect([...up.keys()]).toEqual([...plain.keys()]);
      let stored2x = 0;
      for (const [name, A] of plain) {
        const B = up.get(name)!;
        expect(B.tiles.length).toBe(A.tiles.length);
        // The same ramps in the same order (the palette does not depend on how tiles are stored).
        expect(Buffer.compare(Buffer.from(A.d.pal), Buffer.from(B.d.pal)), `${name} palette`).toBe(0);
        let differ = 0;
        A.tiles.forEach((ta, i) => {
          const tb = B.tiles[i];
          expect(ta.scale).toBe(1);
          if (tb.scale === 2) stored2x++;
          for (let k = 0; ; k++) {
            const la = pwTileLevel(A.d, ta, k);
            const lb = pwTileLevel(B.d, tb, k);
            // (A tile left as painted in an atlas that holds 2× tiles has one level more than the first pass.)
            if (!la || !lb) break;
            const w = ta.w >> k;
            const h = ta.h >> k;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (la.idx[(la.y + y) * la.width + la.x + x] !== lb.idx[(lb.y + y) * lb.width + lb.x + x]) differ++;
          }
        });
        expect(differ, `${id} ${name}`).toBe(0);
      }
      expect(stored2x, id).toBeGreaterThan(50);
    }
    clearPwCache();
  });

  it('deferred paint (stage loads): same texels as painting at once, post passes after, texture re-uploaded, cancel spares the title', { timeout: 60_000 }, () => {
    clearPwCache();
    // A post pass that rewrites the painted level (stands in for the calm / ink / flame passes).
    const invert = (d: { levels: { data: Uint8Array }[] }) => {
      const l = d.levels[0].data;
      for (let i = 0; i < l.length; i += 4) l[i] = 255 - l[i];
    };
    const now = new PwAtlas('stage-now');
    lookdevTiles(now);
    now.post(invert);
    const ref = now.build();
    expect(ref.painted).toBe(true);

    pwDeferPaint(true);
    let later: PwAtlas;
    let menu: PwAtlas;
    try {
      later = new PwAtlas('stage-later');
      lookdevTiles(later);
      later.build();
      menu = new PwAtlas('menu-test');
      lookdevTiles(menu);
      menu.build();
    } finally {
      pwDeferPaint(false);
    }
    const d = later.build();
    // Laid out (rects known) but not painted yet; the pass and the upload wait for the paint.
    expect(d.painted).toBe(false);
    expect(pwPaintPending()).toBe(2);
    let ran = 0;
    later.post((x) => (invert(x), ran++));
    later.texture();
    expect(ran).toBe(0);
    // A load abandoned half-way: its job and cache entry go, the title's job stays.
    pwPaintCancel(pwMenuAtlas);
    expect(pwPaintPending()).toBe(1);
    expect(pwCached(d.sig)).toBe(false);
    pwPaintCancel();
    expect(pwPaintPending()).toBe(0);

    // Again, painted in small slices this time.
    clearPwCache();
    pwDeferPaint(true);
    try {
      later = new PwAtlas('stage-later');
      lookdevTiles(later);
      later.build();
    } finally {
      pwDeferPaint(false);
    }
    const d2 = later.build();
    later.post((x) => (invert(x), ran++));
    const tex2 = later.texture();
    const v2 = tex2.version;
    let frames = 0;
    while (!pwPaintStep(1)) frames++;
    expect(frames).toBeGreaterThan(2);
    expect(d2.painted).toBe(true);
    expect(ran).toBe(1);
    expect(tex2.version).toBeGreaterThan(v2);
    // Identical rects and texels at every level.
    expect([...d2.rects]).toEqual([...ref.rects]);
    expect(d2.levels.length).toBe(ref.levels.length);
    for (let i = 0; i < ref.levels.length; i++) expect(Buffer.compare(Buffer.from(d2.levels[i].data), Buffer.from(ref.levels[i].data)), `level ${i}`).toBe(0);
    // … and the same palette, uploaded with the levels (a palette texture made before the paint has every row and is filled then).
    expect(Buffer.compare(Buffer.from(d2.pal), Buffer.from(ref.pal))).toBe(0);
    expect(d2.pal.length).toBeGreaterThan(PW_PAL_W * 4);
  });

  it('session cache keeps the stage being played (and the title), the store is a no-op without IndexedDB', async () => {
    clearPwCache();
    for (const name of ['z1', 'z1-sky', 'z10', 'd1', 'menu-city']) {
      const a = new PwAtlas(name);
      a.tile(`t-${name}`, 32, 32, (c, k) => c.rect(0, 0, 32, 32, k.ramp(0x806040), 2));
      a.build();
    }
    expect(pwCacheHas('z1')).toBe(true);
    pwCacheKeep(['z1', 'menu']);
    expect(pwCacheHas('z1')).toBe(true);
    expect(pwCacheHas('menu')).toBe(true);
    // 'z10' is not one of z1's atlases (names are `<prefix>` or `<prefix>-…`).
    expect(pwCacheHas('z10')).toBe(false);
    expect(pwCacheHas('d1')).toBe(false);
    // node: no IndexedDB (and no build version) — the prefetch resolves at once, nothing is written.
    await pwStorePrefetch('d1', ['menu']);
    expect(pwCacheHas('z1')).toBe(false);
    expect(pwCacheHas('menu')).toBe(true);
    expect(pwStoreFlush()).toBe(0);
    clearPwCache();
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
  function build(id: string, art: 'sprites' | 'pixel' | '3d') {
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
      // Budgets: atlas memory (all PixelWorld atlases of the stage) ≤ 48 MB; painting time recorded.
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
      expect(bytes).toBeLessThanOrEqual(48 * 1048576);
      for (const a of stats) expect(Math.max(a.w, a.h)).toBeLessThanOrEqual(4096);
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
    // No mip chain for panoramas (painted at the screen's own density), never stored at 2×: two bytes a texel and the palette.
    expect(d.up).toBe(0);
    expect(d.bytes).toBe(d.w * d.h * 2 + d.pal.length);
  });

  it('z1: drawn flats stand inside the old building volumes (never over the sidewalk where enemies walk)', { timeout: 120_000 }, () => {
    const px = build('z1', 'pixel');
    const flats = pwMeshes(px).filter((m) => m.name === 'pw:z1-flats');
    expect(flats.length).toBeGreaterThan(0);
    let verts = 0;
    let square = 0;
    for (const m of flats) {
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        if (z < -205) {
          if (Math.abs(z) > 340) continue;
          square++;
          // The boss square: PRIME MEATS, the bank and the hotel on the north row (old facade z −304, footprint back to −320),
          // the shuttered block raked back inside the west block's own footprint (x −82 … −66, z −304 … −284).
          expect(z).toBeLessThanOrEqual(-283.5);
          expect(z).toBeGreaterThanOrEqual(-320.5);
          expect(x).toBeGreaterThanOrEqual(-91);
          expect(x).toBeLessThanOrEqual(-29);
          if (z > -301) expect(x).toBeLessThanOrEqual(-64.5);
          continue;
        }
        if (Math.abs(x) > 24) continue; // anything off Main Street
        verts++;
        // Facades at ±9.5; cards (awnings, fire escapes) stand at most 1 m in front of a flat, footprints reach 14.5 m back.
        // The Rialto's marquee (the classic overhang) is the one thing that reaches out over the pavement, at head height and up.
        if (y < 2.6) expect(Math.abs(x)).toBeGreaterThanOrEqual(8.5);
        else expect(Math.abs(x)).toBeGreaterThanOrEqual(6.2);
        expect(Math.abs(x)).toBeLessThanOrEqual(9.5 + 14.5);
      }
    }
    expect(verts).toBeGreaterThan(0);
    expect(square).toBeGreaterThan(0);
  });

  it('z1: wall glows stay on where the wall still stands (a raked flat only darkens its own stretch)', () => {
    const f = new Z1Flats();
    const atlas = new PwAtlas('flats-glow-test');
    const ground = new PwBatch(atlas);
    const group = (x: number, z: number, w: number, ry: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      g.userData.pwBuilding = { w };
      g.updateMatrixWorld(true);
      return g;
    };
    const E = Math.PI / 2;
    // Stage every raked flat whose old facade could reach these glows, as the stage does.
    for (const [x, z, w, ry] of [
      [9.5, 5, 18, -E], // pawn
      [9.5, -13, 18, -E], // laundry
      [9.5, -50, 16, -E], // boarded
      [-9.5, 5, 22, E], // hotel
      [-9.5, -32, 16, E], // w4 (its old near end is the diner's far side)
      [-9.5, -81, 14, E], // bar
      [-66, -294, 20, E], // the shuttered block, next to PRIME MEATS
    ] as const) f.stage('A', group(x, z, w, ry), ground, atlas);
    // Dark: glows on the old facades that swung back.
    expect(f.swungAt(9.45, 5)).toBe(true); // pawn
    expect(f.swungAt(-9.45, 13.6)).toBe(true); // hotel
    expect(f.swungAt(-9.45, -81)).toBe(true); // bar
    // Lit: the diner's neon, the Rialto's marquee wash and PRIME MEATS' red: their walls have not moved.
    expect(f.swungAt(-9.15, -49)).toBe(false);
    expect(f.swungAt(9.45, -32)).toBe(false);
    expect(f.swungAt(-58, -303.94)).toBe(false);
  });

  it('z1 in PIXEL WORLD plays exactly like PIXEL CAST (stage simulator)', { timeout: 300_000 }, () => {
    const a = simulateStage(stage('z1'), { art: 'sprites', maxTime: 120 });
    const b = simulateStage(stage('z1'), { art: 'pixel', maxTime: 120 });
    expect(b.errors).toEqual([]);
    expect({ ...b, errors: [] }).toEqual({ ...a, errors: [] });
  });

  it('z1: hit proxies, spawned props and walkable ground (kiosk roofs, bandstand, bus) match in all three ARTs; painted scenery never takes a hit', { timeout: 180_000 }, () => {
    const sig = (w: World) => {
      const box = (o: THREE.Object3D) => {
        o.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(o);
        return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => Math.round(v * 100));
      };
      const ground: number[] = [];
      for (let x = -72; x <= 12; x += 3) for (let z = -312; z <= 20; z += 4) ground.push(Math.round((w.env!.groundAt?.(x, z) ?? 0) * 1000));
      return {
        shootables: w.shootables.objects.map((o) => [String((o.userData.shot as { part?: string } | undefined)?.part), ...box(o)]),
        entities: w.entities.map((e) => [e.constructor.name, ...e.root.position.toArray().map((v) => Math.round(v * 1000))]),
        ground,
        rng: w.rng.state,
      };
    };
    const sp = build('z1', 'sprites');
    const px = build('z1', 'pixel');
    const cl = build('z1', '3d');
    expect(sig(px)).toEqual(sig(sp));
    expect(sig(cl)).toEqual(sig(sp));
    expect(pwMeshes(cl)).toEqual([]);
    // Painted scenery is never a target: a ray straight at each PixelWorld mesh hits nothing.
    const ray = new THREE.Raycaster();
    const c = new THREE.Vector3();
    for (const m of pwMeshes(px)) {
      // (Animated classic meshes re-skinned in place keep their classic box and raycast, as in PIXEL CAST.)
      if (m.userData.pwSwap) continue;
      new THREE.Box3().setFromObject(m).getCenter(c);
      ray.set(c.clone().add(new THREE.Vector3(0, 2, 6)), new THREE.Vector3(0, -2, -6).normalize());
      expect(ray.intersectObject(m, false)).toEqual([]);
      expect(px.shootables.objects.includes(m)).toBe(false);
    }
    sp.dispose();
    px.dispose();
    cl.dispose();
    Kit.disposeAll();
  });

  it('z1: the furniture PIXEL WORLD paints over (benches, sawhorses, crates, square lamps, fountain, plinth, pediment, floodlight, bandstand base) is scenery in every ART', { timeout: 180_000 }, () => {
    const tagged = (w: World) => {
      const out: THREE.Object3D[] = [];
      w.scene.traverse((o) => {
        if (o.userData.pwProp) out.push(o);
      });
      return out;
    };
    const sp = build('z1', 'sprites');
    const props = tagged(sp);
    // (PIXEL CAST bakes their meshes into the zone's static scenery mesh — scenery by construction; the
    // single tagged meshes go with the bake, the tagged groups stay as empty nodes.)
    expect([...new Set(props.map((o) => o.userData.pwProp as string))].sort()).toEqual(['bench', 'crate', 'fountain', 'sawhorse', 'sqLamp']);
    // Never an occluder, never a target: dropping the classic meshes changes no gameplay.
    const occ = new Set(sp.env!.occluders ?? []);
    const shoot = new Set(sp.shootables.objects);
    for (const p of props) {
      p.traverse((o) => {
        expect(occ.has(o)).toBe(false);
        expect(shoot.has(o)).toBe(false);
      });
    }
    // PIXEL WORLD: the classic meshes are gone (painted on the zone batch instead).
    const px = build('z1', 'pixel');
    for (const p of tagged(px)) p.traverse((o) => expect((o as THREE.Mesh).isMesh ?? false).toBe(false));
    expect(px.shootables.objects.length).toBe(sp.shootables.objects.length);
    sp.dispose();
    px.dispose();
    Kit.disposeAll();
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
    expect(bytes).toBeLessThanOrEqual(48 * 1048576);
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

  it('d2 lettering never overflows its board (every sign, label, banner and the SPECIMEN X board)', { timeout: 180_000 }, async () => {
    const { D2_TEXT_FITS } = await import('../../src/content/pixelworld/d2kit');
    D2_TEXT_FITS.length = 0;
    clearPwCache();
    const px = buildD2('pixel');
    expect(D2_TEXT_FITS.length).toBeGreaterThan(20);
    const bad = D2_TEXT_FITS.filter((f) => f.tw > f.W - 2 * f.margin || f.th > f.H - 2 * f.margin).map((f) => `${f.key}: text ${f.tw}×${f.th} in ${f.W}×${f.H} (margin ${f.margin})`);
    expect(bad).toEqual([]);
    expect(D2_TEXT_FITS.some((f) => f.text === 'SPECIMEN X')).toBe(true);
    px.dispose();
    Kit.disposeAll();
  });

  it('d2 in PIXEL WORLD plays exactly like PIXEL CAST (stage simulator)', { timeout: 600_000 }, () => {
    const a = simulateStage(stage('d2'), { art: 'sprites', maxTime: 240 });
    const b = simulateStage(stage('d2'), { art: 'pixel', maxTime: 240 });
    expect(b.errors).toEqual([]);
    expect({ ...b, errors: [] }).toEqual({ ...a, errors: [] });
  });
});

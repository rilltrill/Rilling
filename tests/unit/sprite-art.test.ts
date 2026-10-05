import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { autoTexelScale, DEFAULT_LOOK, keepLive, parseLook, SPRITE_FPS, spriteSchedule } from '../../src/gameplay/SpriteArt';
import { buildPalette, linearToOklab, oklchToLinear, PALETTE_MAX } from '../../src/gameplay/spritePalette';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Save } from '../../src/core/Save';

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

describe('ART: SPRITES', () => {
  it('parses look overrides (debug URL &spriteLook=)', () => {
    const l = parseLook('k:2,bands:0,sat:1.3,bogus:5,inner:x,pal:0');
    expect(l.pxPerTexel).toBe(2);
    expect(l.bands).toBe(0);
    expect(l.saturation).toBe(1.3);
    expect(l.pal).toBe(0);
    expect(l.inner).toBe(DEFAULT_LOOK.inner);
    expect((l as unknown as Record<string, unknown>).bogus).toBeUndefined();
    expect(parseLook(null)).toEqual(DEFAULT_LOOK);
  });

  it('defaults ART to SPRITES (PixelCast pixel art; 3D stays one tap away)', () => {
    expect(DEFAULT_SETTINGS.art).toBe('sprites');
    // A save from before stored '3d' as the old default: it moves to SPRITES once…
    const old = new Save(memStorage({ 'overrun.save.v1': JSON.stringify({ version: 1, settings: { art: '3d' } }) }), false);
    expect(old.settings.art).toBe('sprites');
    // …while a 3D choice made since sticks.
    const chosen = new Save(memStorage({ 'overrun.save.v1': JSON.stringify({ version: 1, settings: { art: '3d', artV: 2 } }) }), false);
    expect(chosen.settings.art).toBe('3d');
  });

  it('GRAPHICS LOW redraws less (quality fallback): fewer fps, redraws and texels per frame', () => {
    const med = spriteSchedule('medium');
    const low = spriteSchedule('low');
    expect(spriteSchedule('high')).toEqual(med);
    expect(med).toEqual({ fps: SPRITE_FPS, maxBakes: 6, texelBudget: 52000 });
    expect(low.fps).toBeLessThan(med.fps);
    expect(low.fps).toBeGreaterThanOrEqual(10);
    expect(low.maxBakes).toBeLessThan(med.maxBakes);
    expect(low.texelBudget).toBeLessThanOrEqual(med.texelBudget * 0.75);
  });

  it('picks whole pixel scales by size, with hysteresis', () => {
    expect(autoTexelScale(40, 1, 90, 240)).toBe(1);
    expect(autoTexelScale(120, 1, 90, 240)).toBe(2);
    expect(autoTexelScale(300, 2, 90, 240)).toBe(3);
    // Near a step the previous choice holds.
    expect(autoTexelScale(95, 1, 90, 240)).toBe(1);
    expect(autoTexelScale(85, 2, 90, 240)).toBe(2);
    expect(autoTexelScale(230, 3, 90, 240)).toBe(3);
    for (const s of [1, 50, 89, 91, 200, 239, 241, 999]) expect(Number.isInteger(autoTexelScale(s, 2, 90, 240))).toBe(true);
    // 0 = that step never happens.
    expect(autoTexelScale(5000, 2, 220, 0)).toBe(2);
    expect(autoTexelScale(5000, 1, 0, 0)).toBe(1);
  });

  it('builds restricted, in-gamut palettes per campaign', () => {
    for (const id of ['zombie', 'dino'] as const) {
      const p = buildPalette(id);
      expect(p.length % 3).toBe(0);
      expect(p.length / 3).toBeGreaterThan(40);
      expect(p.length / 3).toBeLessThanOrEqual(PALETTE_MAX);
      for (const v of p) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    // OKLab round trip.
    const [r, g, b] = oklchToLinear(0.6, 0.1, 40);
    expect(linearToOklab(r, g, b)[0]).toBeCloseTo(0.6, 2);
  });

  it('keeps alpha-blended and very thin parts as live 3D meshes', () => {
    const solid = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshLambertMaterial());
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3 }));
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1), new THREE.MeshLambertMaterial());
    cable.scale.set(1, 4, 1);
    cable.updateMatrixWorld();
    const tagged = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial());
    tagged.userData.spriteKeep3D = true;
    expect(keepLive(solid)).toBe(false);
    expect(keepLive(halo)).toBe(true);
    expect(keepLive(cable)).toBe(true);
    expect(keepLive(tagged)).toBe(true);
  });
});

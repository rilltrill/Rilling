import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, parseLook } from '../../src/gameplay/SpriteArt';
import { DEFAULT_SETTINGS } from '../../src/core/types';

describe('ART: SPRITES', () => {
  it('parses look overrides (debug URL &spriteLook=)', () => {
    const l = parseLook('k:2,bands:0,sat:1.3,bogus:5,inner:x');
    expect(l.pxPerTexel).toBe(2);
    expect(l.bands).toBe(0);
    expect(l.saturation).toBe(1.3);
    expect(l.inner).toBe(DEFAULT_LOOK.inner);
    expect((l as unknown as Record<string, unknown>).bogus).toBeUndefined();
    expect(parseLook(null)).toEqual(DEFAULT_LOOK);
  });

  it('has an ART setting with a valid default', () => {
    expect(['3d', 'sprites']).toContain(DEFAULT_SETTINGS.art);
  });
});

import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng } from './pwPng';

/** z3 panorama tiles alone (Z3_SKY=<dir>): sky band, hills, city as PNGs (×1). */
describe.skipIf(!process.env.Z3_SKY)('z3 panorama dump', () => {
  it('dumps', async () => {
    const { PwPalette } = await import('../../src/content/pixelworld/canvas');
    const { paintTile, PwAtlas } = await import('../../src/content/pixelworld/atlas');
    const { z3SkyTile, z3HillsTile, z3CityTile } = await import('../../src/content/pixelworld/z3sky');
    const a = new PwAtlas('d', { levels: 1 });
    const list = [
      z3SkyTile(a, { fog: 0xa65a54, el0: -6, el1: 40, sunAz: 20.8, sunEl: 3.7, cityAz: 191.3 }),
      z3HillsTile(a, { near: 0x3a2234, far: 0x52304a, fog: 0xa65a54, el0: -2, el1: 8, sunAz: 20.8, cityAz: 191.3 }),
      z3CityTile(a, { body: 0x2a1a30, fog: 0xa65a54, span: 130, el0: -2, el1: 22 }),
    ];
    const defs = (a as unknown as { tiles: Map<string, { paint: Parameters<typeof paintTile>[3] }> }).tiles;
    const out = process.env.Z3_SKY!;
    mkdirSync(out, { recursive: true });
    for (const t of list) {
      const pal = new PwPalette();
      const c = paintTile(t.key, t.w, t.h, defs.get(t.key)!.paint, pal);
      writeFileSync(`${out}/${t.key.split('|')[0]}.png`, await encodePng(c.resolve(pal), t.w, t.h, 1, [255, 0, 255]));
    }
  });
});

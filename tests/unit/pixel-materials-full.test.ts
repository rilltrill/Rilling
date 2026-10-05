import { describe, expect, it } from 'vitest';
import { MAX_MATERIALS, Mat, hexToOklch, materialInfo } from '../../src/gameplay/pixel/materials';

/**
 * The PixelCast material table is shared by the whole cast and holds 255 rows;
 * a long stage fills it (every walker's random skin and cloth shades add rows).
 * From then on a new key must get the CLOSEST existing material — never id 1's
 * colour (a pickup or a boss first painted late in a stage would otherwise come
 * out in one random colour).
 */
describe('PixelCast material table: full', () => {
  it('maps a new key to the closest existing material once the table is full', () => {
    // Fill the table with greys and a few saturated colours.
    let n = 0;
    while (materialInfo(n + 1)) n++;
    for (let i = 0; n < MAX_MATERIALS; i++, n++) {
      const v = (i * 37) % 256;
      if (i % 10 === 9) Mat.glow((v << 16) | (v << 8) | v);
      else Mat.flat((v << 16) | (v << 8) | v, `fill${i}`);
    }
    const red = Mat.flat(0xd02020, 'pre-red');
    expect(red).toBeGreaterThan(0);
    // (That was full already: red maps to something; now ask for colours never seen.)
    const want = 0x2050e0;
    const id = Mat.flat(want, 'late-blue');
    const got = materialInfo(id)!.ramp[3];
    const [L0, C0] = hexToOklch(want);
    const [L1] = hexToOklch(got);
    // The nearest of a table of greys: about as light (not id 1's colour by default).
    expect(Math.abs(L1 - L0)).toBeLessThan(0.12);
    expect(C0).toBeGreaterThan(0.1);
    // Same key → same id (cached), a glow only maps to a glow.
    expect(id).not.toBe(1);
    expect(Mat.flat(want, 'late-blue')).toBe(id);
    expect(materialInfo(Mat.glow(0x44ff22))!.glow).toBe(true);
    expect(materialInfo(Mat.flat(0x44ff22, 'late-green'))!.glow).toBe(false);
  });
});

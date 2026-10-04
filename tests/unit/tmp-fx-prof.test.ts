import { it } from 'vitest';
import { particleAtlasTexture, decalAtlasTexture, PAINT_TIMES } from '../../src/fx/textures';
it('prof', () => {
  let t = performance.now();
  particleAtlasTexture();
  const a = performance.now() - t;
  t = performance.now();
  decalAtlasTexture();
  const b = performance.now() - t;
  console.log(`particle ${a.toFixed(1)} ms decal ${b.toFixed(1)} ms cells ${PAINT_TIMES.map((x) => x.toFixed(1)).join(' ')}`);
});

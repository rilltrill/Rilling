import { it } from 'vitest';
import { railCurve } from '../../src/content/stages/z3/layout';
import { EnvKit } from '../../src/content/kit/EnvKit';
it('layout', () => {
  const c = railCurve();
  console.log('len', c.getLength().toFixed(1));
  for (let d = 0; d <= c.getLength(); d += 40) {
    const f = EnvKit.frameAt(c, d);
    console.log(d, f.pos.x.toFixed(2), f.pos.z.toFixed(1), (f.heading * 180 / Math.PI).toFixed(1));
  }
});

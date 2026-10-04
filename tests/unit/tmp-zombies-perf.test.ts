import { it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { createEnemy } from '../../src/content/registry';
import '../../src/content/enemies/zombies';
import { nullHud } from './sim';
import { Kit } from '../../src/content/kit/ModelKit';

it('spawn cost', () => {
  const camera = new THREE.PerspectiveCamera(58, 2, 0.05, 400);
  const w = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 7);
  w.rig.setPath([[0, 0, 0], [0, 0, -100]]);
  for (const type of ['walker', 'runner', 'crawler', 'brute', 'spitter', 'bloater', 'walker']) {
    const N = 60;
    let best = Infinity;
    let t1 = 0;
    for (let batch = 0; batch < 6; batch++) {
      const t0 = performance.now();
      for (let i = 0; i < 10; i++) {
        const e = createEnemy(type, w, { pos: new THREE.Vector3(i % 10, 0, -10 - i), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: { variant: 'random' } });
        w.add(e);
      }
      t1 = performance.now();
      best = Math.min(best, (t1 - t0) / 10);
    }
    for (let f = 0; f < 60; f++) w.update(1 / 60);
    const t2 = performance.now();
    console.log(`${type}: build(best batch) ${best.toFixed(2)} ms/each; update ${((t2 - t1) / 60).toFixed(2)} ms/frame for ${w.entities.length} entities; kit ${JSON.stringify(Kit.stats())}`);
    for (const e of w.entities) e.removed = true;
    w.update(0.001);
  }
  w.dispose();
  Kit.disposeAll();
});

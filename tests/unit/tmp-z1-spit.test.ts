import { it } from 'vitest';
import * as THREE from 'three';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { AutoPlayer } from '../../src/debug/AutoPlayer';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Kit } from '../../src/content/kit/ModelKit';
import { nullHud } from './sim';

it('spitters stay on the roof', { timeout: 120_000 }, () => {
  const stage = ALL_STAGES.find((s) => s.id === 'z1')!;
  const idx = stage.beats.findIndex((b) => b.label === 'town square');
  for (const seed of [1, 5]) {
    const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
    const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, seed);
    world.viewport = { width: 844, height: 390 };
    world.player.god = true;
    const runner = new StageRunner(world, stage);
    const bot = new AutoPlayer(world, new Shooter(world), 0.05);
    runner.start(idx);
    const dt = 1 / 30;
    const log: string[] = [];
    for (let t = 0; t < 40; t += dt) {
      bot.update(dt);
      runner.update(world.update(dt));
      world.scene.updateMatrixWorld();
      for (const e of world.enemies()) {
        if (e.name !== 'spitter' || e.state === 'dying') continue;
        const p = e.root.position;
        const g = world.groundAt(p.x, p.z);
        if (Math.abs(p.y - g) > 0.3 && e.state !== 'entry') log.push(`FLOAT t=${t.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} g=${g} ${e.state}`);
        if (Math.floor(t * 30) % 90 === 0) log.push(`t=${t.toFixed(1)} ${p.x.toFixed(2)},${p.y.toFixed(1)},${p.z.toFixed(1)} ${e.state} d=${e.distToPlayer.toFixed(1)} onScreen=${e.onScreen()}`);
      }
    }
    console.log(seed, log.slice(0, 14).join('\n'));
    world.dispose();
    Kit.disposeAll();
  }
});

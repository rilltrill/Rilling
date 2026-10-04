import { it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { AutoPlayer } from '../../src/debug/AutoPlayer';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Kit } from '../../src/content/kit/ModelKit';
import '../../src/content';
import { stage } from '../../src/content/stages/d3';
import { nullHud } from './sim';

it('d3 diagnostics', { timeout: 300_000 }, () => {
  for (const seed of [99, 7, 1234]) {
    const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
    const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, seed);
    world.viewport = { width: 844, height: 390 };
    world.player.god = true;
    const runner = new StageRunner(world, stage);
    const shooter = new Shooter(world);
    const bot = new AutoPlayer(world, shooter, 6);
    let cleared = false;
    world.events.on('stage-clear', () => (cleared = true));
    const log: string[] = [];
    world.events.on('beat', ({ index, beat }) => log.push(`${t.toFixed(1)}s d=${world.rig.d.toFixed(0)} #${index} ${beat.kind} ${beat.label ?? ''}`));
    let t = 0;
    const dt = 1 / 30;
    runner.start();
    let lastState = '';
    let bossT = 0;
    while (!cleared && t < 900) {
      bot.update(dt);
      const sdt = world.update(dt);
      runner.update(sdt);
      world.scene.updateMatrixWorld();
      if (world.boss) {
        bossT += dt;
        const b = world.boss;
        const s = `${b.state} ph${b.phase}`;
        if (s !== lastState) {
          log.push(`   boss ${t.toFixed(1)} ${s} hp=${b.hp.toFixed(0)} d=${world.rig.d.toFixed(0)} pos=${b.root.position.x.toFixed(1)},${b.root.position.z.toFixed(1)}`);
          lastState = s;
        }
      }
      t += dt;
    }
    console.log(`seed ${seed}: cleared=${cleared} t=${t.toFixed(0)} boss=${bossT.toFixed(0)} kills=${world.score.kills} dmg=${world.player.damageTaken} ents=${world.entities.length}\n` + log.join('\n'));
    world.dispose();
    Kit.disposeAll();
  }
});

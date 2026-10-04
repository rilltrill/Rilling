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

function runBoss(rate: number, seed: number) {
  const stage = ALL_STAGES.find((s) => s.id === 'z1')!;
  const bossBeat = stage.beats.findIndex((b) => b.kind === 'boss');
  const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, seed);
  world.viewport = { width: 844, height: 390 };
  world.player.god = true;
  const runner = new StageRunner(world, stage);
  const shooter = new Shooter(world);
  const bot = new AutoPlayer(world, shooter, rate);
  let cleared = false;
  world.events.on('stage-clear', () => (cleared = true));
  runner.start(bossBeat - 2);
  const dt = 1 / 30;
  let t = 0;
  let bossT = 0;
  const states: string[] = [];
  let last = '';
  const hurts: string[] = [];
  world.events.on('player-hurt', (e) => hurts.push(`${bossT.toFixed(1)}:${e.source}`));
  while (!cleared && t < 400) {
    bot.update(dt);
    const sdt = world.update(dt);
    runner.update(sdt);
    world.scene.updateMatrixWorld();
    const b = world.boss;
    if (b) {
      bossT += dt;
      if (b.state !== last) {
        last = b.state;
        states.push(`${bossT.toFixed(1)}:${b.state}${b.state === 'phase' ? '' : ''}(${Math.round(b.hp)})`);
      }
    }
    t += dt;
  }
  world.dispose();
  Kit.disposeAll();
  return { rate, seed, cleared, bossT: bossT.toFixed(1), hurts: hurts.length, hurtList: hurts.join(' '), states: states.join(' ') };
}

it('boss diag', { timeout: 300_000 }, () => {
  for (const [rate, seed] of [[6, 1], [4, 2], [2.5, 3]] as const) {
    const r = runBoss(rate, seed);
    console.log(JSON.stringify({ rate: r.rate, cleared: r.cleared, bossT: r.bossT, hurts: r.hurts }));
    console.log('  hurts', r.hurtList);
    console.log('  states', r.states);
  }
});

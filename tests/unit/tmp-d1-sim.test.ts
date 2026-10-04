import { it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { AutoPlayer } from '../../src/debug/AutoPlayer';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Kit } from '../../src/content/kit/ModelKit';
import { nullHud } from './sim';
import '../../src/content';
import { stage } from '../../src/content/stages/d1';

it('d1 timeline', { timeout: 600_000 }, () => {
  const seed = Number(process.env.D1_SEED ?? 99);
  const dt = 1 / 30;
  const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
  const t0 = performance.now();
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, seed);
  world.viewport = { width: 844, height: 390 };
  world.player.god = true;
  const runner = new StageRunner(world, stage);
  const shooter = new Shooter(world);
  const bot = new AutoPlayer(world, shooter, 6);
  let cleared = false;
  world.events.on('stage-clear', () => (cleared = true));
  let t = 0;
  let last = -1;
  let beatStart = 0;
  let bossT = 0;
  let maxEnt = 0;
  const lines: string[] = [];
  let hurt = 0;
  world.events.on('player-hurt', (e) => {
    hurt++;
    if (world.boss) lines.push(`   hurt by ${e.source} at ${t.toFixed(1)}`);
  });
  runner.start();
  console.log('build ms', (performance.now() - t0).toFixed(0), 'objects', (() => { let n = 0; world.scene.traverse(() => n++); return n; })());
  let lastPhase = -1;
  while (!cleared && t < 700) {
    bot.update(dt);
    const sdt = world.update(dt);
    runner.update(sdt);
    world.scene.updateMatrixWorld();
    if (runner.index !== last) {
      lines.push(`${(t - beatStart).toFixed(1)}s  -> beat ${runner.label} @t=${t.toFixed(1)} d=${world.rig.d.toFixed(0)} kills=${world.score.kills}`);
      last = runner.index;
      beatStart = t;
    }
    if (world.boss) {
      bossT += dt;
      if (world.boss.phase !== lastPhase) {
        lastPhase = world.boss.phase;
        lines.push(`   boss phase ${lastPhase} at bossT=${bossT.toFixed(1)} hp=${world.boss.hp.toFixed(0)} state=${world.boss.state}`);
      }
    }
    maxEnt = Math.max(maxEnt, world.entities.length);
    t += dt;
  }
  console.log(lines.join('\n'));
  console.log({ cleared, t: t.toFixed(1), bossT: bossT.toFixed(1), kills: world.score.kills, shots: world.score.shots, hurt, civShot: world.score.civiliansShot, rescues: world.score.rescues, maxEnt, ms: (performance.now() - t0).toFixed(0) });
  world.dispose();
  Kit.disposeAll();
});

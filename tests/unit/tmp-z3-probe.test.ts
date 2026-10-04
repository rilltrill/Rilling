import { it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { AutoPlayer } from '../../src/debug/AutoPlayer';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Enemy } from '../../src/gameplay/Enemy';
import { Projectile } from '../../src/gameplay/Projectile';
import { Kit } from '../../src/content/kit/ModelKit';
import { nullHud } from './sim';
import { ALL_STAGES } from '../../src/content';

/**
 * z3 probe (temporary). Env:
 *   Z3_BEAT  start beat (default 0)    Z3_RATE  bot shots/s (0 = no input, default 6)
 *   Z3_SEEDS comma list (default 99)   Z3_MAX   max sim seconds (default 600)
 *   Z3_STOP  stop after this beat index is reached (default: never)
 *   Z3_VERBOSE 1 = log every off-screen windup/stuck episode
 */
const env = (k: string, d: string) => process.env[k] ?? d;

const _v = new THREE.Vector3();
function ndc(obj: THREE.Object3D, cam: THREE.Camera) {
  obj.getWorldPosition(_v);
  _v.project(cam);
  return { x: _v.x, y: _v.y, z: _v.z };
}

it('z3 probe', { timeout: 900_000 }, () => {
  const stage = ALL_STAGES.find((s) => s.id === 'z3')!;
  const seeds = env('Z3_SEEDS', '99').split(',').map(Number);
  const rate = Number(env('Z3_RATE', '6'));
  const startBeat = Number(env('Z3_BEAT', '0'));
  const maxTime = Number(env('Z3_MAX', '600'));
  const stopAt = Number(env('Z3_STOP', '999'));
  const verbose = env('Z3_VERBOSE', '0') === '1';
  for (const seed of seeds) {
    const camera = new THREE.PerspectiveCamera(58, 844 / 390, 0.05, 400);
    const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, seed);
    world.viewport = { width: 844, height: 390 };
    world.player.god = true;
    const runner = new StageRunner(world, stage);
    const shooter = new Shooter(world);
    const bot = rate > 0 ? new AutoPlayer(world, shooter, rate) : null;
    let cleared = false;
    world.events.on('stage-clear', () => (cleared = true));
    const hits: string[] = [];
    world.events.on('player-hurt', (e) => hits.push(`${runner.label}@${runner.beatTime.toFixed(1)}:${e.source}`));
    const dt = 1 / 30;
    let t = 0;
    runner.start(startBeat);
    const offT = new Map<Enemy, number>();
    const maxOff = new Map<Enemy, number>();
    const offLabel = new Map<Enemy, string>();
    let bossDying = false;
    world.events.on('player-hurt', () => { if (bossDying) deathHits++; });
    const offWind = new Map<string, number>();
    let lastBeat = -1;
    let beatStart = 0;
    const beatLog: string[] = [];
    let bossPhaseT: number[] = [];
    let projTop = 0;
    let projFrames = 0;
    let headTop = 0;
    let bossFrames = 0;
    let maxPitch = -99;
    let parked = 0;
    let liveMax = 0;
    let deathHits = 0;
    let pitchSum = 0;
    while (!cleared && t < maxTime) {
      bot?.update(dt);
      const sdt = world.update(dt);
      runner.update(sdt);
      world.scene.updateMatrixWorld();
      t += dt;
      if (runner.index !== lastBeat) {
        if (lastBeat >= 0) beatLog.push(`${lastBeat}:${(t - beatStart).toFixed(1)}s`);
        lastBeat = runner.index;
        beatStart = t;
        if (runner.index > stopAt) break;
      }
      let live = 0;
      for (const e of world.enemies()) {
        if (e.removed || e.state === 'dying' || !e.hostile) continue;
        if (!e.isBoss) live++;
        if (e.isBoss) continue;
        const a = ndc(e.anchor, camera);
        const off = a.z > 1 || Math.abs(a.x) > 0.92 || Math.abs(a.y) > 0.92;
        if (off && e.distToPlayer < 8 && e.state !== 'entry') {
          const v = (offT.get(e) ?? 0) + dt;
          offT.set(e, v);
          if (v > (maxOff.get(e) ?? 0)) { maxOff.set(e, v); offLabel.set(e, `${runner.index}/${e.state}/d${e.distToPlayer.toFixed(1)}/y${a.y.toFixed(2)}`); }
        } else offT.set(e, 0);
        if (e.telegraph && off) {
          const k = `${runner.label}:${e.name}`;
          offWind.set(k, (offWind.get(k) ?? 0) + dt);
        }
      }
      liveMax = Math.max(liveMax, live);
      const boss = world.boss;
      if (boss && boss.state !== 'dying') {
        bossFrames++;
        const h = ndc(boss.headAnchor!, camera);
        if (h.y > 0.75 && Math.abs(h.x) < 0.45) headTop++;
        const pitch = camera.rotation.x * 57.3;
        maxPitch = Math.max(maxPitch, pitch);
        pitchSum += pitch;
        if (world.rig.speed < 0.3) parked += dt;
        const ph = (boss as unknown as { phase: number }).phase;
        if (bossPhaseT.length <= ph) bossPhaseT.push(t);
      }
      if (boss && boss.state === 'dying') bossDying = true;
      for (const e of world.entities) {
        if (e instanceof Projectile && !e.removed && world.boss) {
          projFrames++;
          const p = ndc(e.root, camera);
          if (p.y > 0.75 && Math.abs(p.x) < 0.45 && p.z < 1) projTop++;
        }
      }
    }

    beatLog.push(`${lastBeat}:${(t - beatStart).toFixed(1)}s`);
    const stuck = [...maxOff.entries()].filter(([, v]) => v > 2).map(([e, v]) => `${e.name}:${v.toFixed(1)}(${offLabel.get(e)})`);
    console.log(
      `seed ${seed} rate ${rate}: cleared=${cleared} t=${t.toFixed(1)} kills=${world.score.kills} dmg=${world.player.damageTaken} liveMax=${liveMax}\n` +
        ` beats ${beatLog.join(' ')}\n` +
        ` hits ${hits.join(', ')}\n` +
        ` stuck>2s ${stuck.join(', ')}\n` +
        ` offWind ${[...offWind.entries()].map(([k, v]) => `${k}=${v.toFixed(1)}`).join(', ')}\n` +
        ` boss: phases@${bossPhaseT.map((x) => x.toFixed(0)).join('/')} headTop=${((headTop / Math.max(1, bossFrames)) * 100).toFixed(0)}% projTop=${((projTop / Math.max(1, projFrames)) * 100).toFixed(0)}% maxPitch=${maxPitch.toFixed(1)} avgPitch=${(pitchSum / Math.max(1, bossFrames)).toFixed(1)} deathHits=${deathHits} parked=${parked.toFixed(1)}s`,
    );
    if (verbose) console.log('verbose not implemented');
    world.dispose();
    Kit.disposeAll();
  }
});

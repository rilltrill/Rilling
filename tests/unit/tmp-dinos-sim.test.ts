import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { AutoPlayer } from '../../src/debug/AutoPlayer';
import { DEFAULT_SETTINGS, type V3 } from '../../src/core/types';
import type { Beat, Environment, StageDef } from '../../src/gameplay/StageTypes';
import { Kit } from '../../src/content/kit/ModelKit';
import { createEnemy } from '../../src/content/registry';
import { nullHud } from './sim';
import { Enemy } from '../../src/gameplay/Enemy';

function stage(beats: Beat[]): StageDef {
  const rail: V3[] = [];
  for (let i = 0; i <= 12; i++) rail.push([Math.sin(i * 0.4) * 6, 0, -i * 60]);
  return {
    id: 'tmp',
    campaign: 'dino',
    index: 0,
    name: 'TMP',
    rail,
    mode: 'walk',
    beats,
    buildEnvironment(world): Environment {
      const root = new THREE.Group();
      world.scene.add(root);
      return { root };
    },
  };
}

interface Run {
  completed: boolean;
  time: number;
  beatTimes: Record<string, number>;
  damage: Record<string, number>;
  kills: number;
  errors: string[];
  maxMeshes: Record<string, number>;
  despawned: number;
}

function run(st: StageDef, seed = 7, maxTime = 600, rate = 6): Run {
  const dt = 1 / 30;
  const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, seed);
  world.viewport = { width: 844, height: 390 };
  world.player.god = true;
  const runner = new StageRunner(world, st);
  const shooter = new Shooter(world);
  const bot = new AutoPlayer(world, shooter, Math.max(0.001, rate));
  const errors: string[] = [];
  let cleared = false;
  world.events.on('stage-clear', () => (cleared = true));
  const beatTimes: Record<string, number> = {};
  const damage: Record<string, number> = {};
  const maxMeshes: Record<string, number> = {};
  world.events.on('player-hurt', (e) => (damage[e.source] = (damage[e.source] ?? 0) + e.amount));
  let despawned = 0;
  const seen = new Set<Enemy>();
  let t = 0;
  runner.start();
  while (!cleared && t < maxTime && errors.length < 5) {
    try {
      if (rate > 0) bot.update(dt);
      const sdt = world.update(dt);
      runner.update(sdt);
      world.scene.updateMatrixWorld();
      for (const e of world.enemies()) {
        if (!seen.has(e)) {
          seen.add(e);
          let n = 0;
          e.model.traverse((o) => ((o as THREE.Mesh).isMesh ? n++ : 0));
          maxMeshes[e.name] = Math.max(maxMeshes[e.name] ?? 0, n);
        }
        const p = e.root.position;
        if (!Number.isFinite(p.x + p.y + p.z)) errors.push(`NaN position ${e.name} ${e.state}`);
      }
      for (const e of seen) {
        if (e.removed && e.state !== 'dying' && e.hp > 0 && e.name !== 'trike') {
          despawned++;
          seen.delete(e);
        }
      }
    } catch (e) {
      errors.push(`t=${t.toFixed(1)} ${runner.label}: ${(e as Error).stack ?? e}`);
    }
    const label = runner.label;
    beatTimes[label] = (beatTimes[label] ?? 0) + dt;
    t += dt;
  }
  const r = { completed: cleared, time: t, beatTimes, damage, kills: world.score.kills, errors, maxMeshes, despawned };
  world.dispose();
  Kit.disposeAll();
  return r;
}

const hold = (label: string, spawns: Beat extends never ? never : any[]): Beat => ({ kind: 'hold', label, waves: [{ spawns }] });

describe('tmp dinos', () => {
  it('every dino can be fought on foot', { timeout: 300_000 }, () => {
    const st = stage([
      { kind: 'banner', text: 'x', duration: 0.5 },
      hold('compys', [{ type: 'compy', pos: [-3, 0, 16], count: 8, every: 0.35, offset: [1, 0, 0.3] }]),
      hold('raptors', [
        { type: 'raptor', pos: [-4, 0, 18] },
        { type: 'raptor', pos: [4, 0, 19], t: 0.5, opts: { variant: 'green' } },
        { type: 'raptor', pos: [0, 0, 22], t: 1, opts: { variant: 'blue' } },
        { type: 'raptor', pos: [6, 0, 20], t: 1.5, opts: { variant: 'red' } },
        { type: 'raptor', pos: [-6, 0, 12], t: 2, entry: 'leap' },
        { type: 'raptor', pos: [2, 0, 10], t: 2.5, entry: 'burst' },
      ]),
      hold('dilos', [
        { type: 'dilo', pos: [-5, 0, 18] },
        { type: 'dilo', pos: [5, 0, 20], t: 1 },
      ]),
      hold('pteros', [
        { type: 'ptero', pos: [-8, 10, 30], entry: 'fly' },
        { type: 'ptero', pos: [8, 12, 34], t: 1, entry: 'fly' },
        { type: 'ptero', pos: [0, 0, 20], t: 2 },
      ]),
      hold('trikes', [{ type: 'trike', pos: [0, 0, 32] }, { type: 'trike', pos: [-8, 0, 36], t: 3 }]),
      hold('mixed', [
        { type: 'compy', pos: [3, 0, 14], count: 5, every: 0.3 },
        { type: 'raptor', pos: [-4, 0, 16], t: 1 },
        { type: 'dilo', pos: [6, 0, 18], t: 1 },
        { type: 'ptero', pos: [0, 11, 28], t: 2, entry: 'fly' },
        { type: 'trike', pos: [0, 0, 30], t: 3 },
      ]),
      { kind: 'move', to: 40, speed: 3 },
    ]);
    const r = run(st);
    console.log('foot', JSON.stringify(r, null, 1));
    expect(r.errors).toEqual([]);
    expect(r.completed).toBe(true);
  });

  it('every dino can chase a moving vehicle (rig frame)', { timeout: 300_000 }, () => {
    const st = stage([
      { kind: 'banner', text: 'x', duration: 0.5 },
      {
        kind: 'move',
        label: 'chase',
        to: 600,
        speed: 12,
        mode: 'drive',
        weapon: 'turret',
        waitClear: true,
        waves: [
          { spawns: [{ type: 'raptor', pos: [-5, 0, 6] }, { type: 'raptor', pos: [5, 0, 2], t: 0.5, opts: { variant: 'blue' } }] },
          { spawns: [{ type: 'ptero', pos: [-6, 10, 25], entry: 'fly' }, { type: 'ptero', pos: [6, 12, 30], t: 1, entry: 'fly' }] },
          { spawns: [{ type: 'trike', pos: [-9, 0, 12] }] },
          { spawns: [{ type: 'compy', pos: [-4, 0, 10], count: 6, every: 0.3, offset: [1.5, 0, 0] }, { type: 'dilo', pos: [6, 0, 14] }] },
        ],
      },
    ]);
    const r = run(st, 11);
    console.log('drive', JSON.stringify(r, null, 1));
    expect(r.errors).toEqual([]);
    expect(r.completed).toBe(true);
  });

  it('every attack lands when the player does not shoot', { timeout: 300_000 }, () => {
    const h = (label: string, spawns: any[]): Beat => ({ kind: 'hold', label, timeout: 25, waves: [{ spawns }] });
    const cases: [string, any[]][] = [
      ['compy', [{ type: 'compy', pos: [-3, 0, 16], count: 4, every: 0.35, offset: [2, 0, 0] }]],
      ['raptor', [{ type: 'raptor', pos: [-4, 0, 18] }, { type: 'raptor', pos: [4, 0, 18], opts: { variant: 'red' } }]],
      ['dilo', [{ type: 'dilo', pos: [-5, 0, 18] }]],
      ['ptero', [{ type: 'ptero', pos: [-8, 10, 30], entry: 'fly' }]],
      ['trike', [{ type: 'trike', pos: [0, 0, 30] }]],
    ];
    for (const [k, spawns] of cases) {
      const r = run(stage([h(k, spawns)]), 5, 30, 0);
      console.log('noshoot', k, JSON.stringify({ damage: r.damage, errors: r.errors }));
      expect(r.errors).toEqual([]);
      expect(r.damage[k] ?? 0, k).toBeGreaterThan(0);
    }
    const d = stage([
      {
        kind: 'move', label: 'chase', to: 500, speed: 12, mode: 'drive',
        waves: [{ spawns: [{ type: 'raptor', pos: [-5, 0, 6] }, { type: 'ptero', pos: [6, 10, 25], entry: 'fly' }, { type: 'trike', pos: [-9, 0, 14] }, { type: 'compy', pos: [4, 0, 8], count: 3 }, { type: 'dilo', pos: [6, 0, 14] }] }],
      },
    ]);
    const r2 = run(d, 9, 45, 0);
    console.log('noshoot drive', JSON.stringify({ damage: r2.damage, errors: r2.errors, despawned: r2.despawned }, null, 1));
    expect(r2.errors).toEqual([]);
  });

  it('a slow, sloppy shooter can still clear a mixed fight', { timeout: 300_000 }, () => {
    const st = stage([
      hold('mixed', [
        { type: 'compy', pos: [3, 0, 14], count: 6, every: 0.3 },
        { type: 'raptor', pos: [-4, 0, 16], t: 1 },
        { type: 'raptor', pos: [5, 0, 18], t: 2, opts: { variant: 'green' } },
        { type: 'dilo', pos: [6, 0, 18], t: 1 },
        { type: 'ptero', pos: [0, 11, 28], t: 2, entry: 'fly' },
        { type: 'trike', pos: [0, 0, 30], t: 3 },
      ]),
    ]);
    const r = run(st, 3, 300, 1.5);
    console.log('slow', JSON.stringify({ completed: r.completed, time: r.time, damage: r.damage, kills: r.kills, errors: r.errors }, null, 1));
    expect(r.errors).toEqual([]);
    expect(r.completed).toBe(true);
  });

  it('mesh budgets and hit zones', () => {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.05, 400);
    const world = new World(camera, new AudioSystem(), nullHud, DEFAULT_SETTINGS, 3);
    const counts: Record<string, number> = {};
    for (const [id, opts] of [
      ['compy', {}],
      ['raptor', {}],
      ['raptor', { variant: 'red' }],
      ['dilo', {}],
      ['ptero', {}],
      ['trike', {}],
    ] as const) {
      const e = createEnemy(id, world, { pos: new THREE.Vector3(0, 0, -10), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts });
      world.add(e);
      let n = 0;
      e.model.traverse((o) => ((o as THREE.Mesh).isMesh ? n++ : 0));
      counts[id + ((opts as { variant?: string }).variant ?? '')] = n;
      e.root.rotation.y = 0;
      e.root.position.set(0, 0, 0);
      e.update(0);
      e.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(e.model, true);
      const sz = box.getSize(new THREE.Vector3());
      console.log(id, 'size w/h/len', sz.x.toFixed(2), sz.y.toFixed(2), sz.z.toFixed(2), 'top', box.max.y.toFixed(2), 'bottom', box.min.y.toFixed(3));
      const parts = new Set(world.shootables.objects.filter((o) => o.userData.shot.owner === e).map((o) => o.userData.shot.part));
      console.log(id, n, [...parts].join(','));
    }
    console.log(counts, Kit.stats());
    expect(counts.compy).toBeLessThanOrEqual(12);
    for (const k of Object.keys(counts)) expect(counts[k]).toBeLessThanOrEqual(30);
    world.dispose();
    Kit.disposeAll();
  });
});

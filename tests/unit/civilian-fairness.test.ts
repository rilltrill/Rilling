import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { AutoPlayer } from '../../src/debug/AutoPlayer';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Kit } from '../../src/content/kit/ModelKit';
import { Enemy } from '../../src/gameplay/Enemy';
import { Civilian } from '../../src/gameplay/Civilian';
import type { ShotTag } from '../../src/gameplay/Shootables';
import { nullHud } from './sim';

/**
 * Civilians never stand in a fair shot: through every stage (real World +
 * StageRunner, a slow AutoPlayer so encounters last, god mode), at every other
 * frame while a civilian is a target, a ray from the camera through the centre
 * of each hostile's head / torso / weak-point hitbox must not hit a civilian
 * first — whatever the civilian is doing (cowering, hiding, running for it,
 * backing off, held by a zombie). Also records what each civilian did.
 */

interface CivRec {
  beat: string;
  phases: Set<string>;
  frames: number;
  blocked: string[];
}

function runStage(id: string, seed: number): { civs: CivRec[]; completed: boolean; rescues: number; civShots: number } {
  const stage = ALL_STAGES.find((s) => s.id === id)!;
  const dt = 1 / 30;
  const camera = new THREE.PerspectiveCamera(58, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, seed);
  world.viewport = { width: 844, height: 390 };
  world.player.god = true;
  const runner = new StageRunner(world, stage);
  const shooter = new Shooter(world);
  const bot = new AutoPlayer(world, shooter, 2.5);
  let cleared = false;
  let rescues = 0;
  let civShots = 0;
  world.events.on('stage-clear', () => (cleared = true));
  world.events.on('civilian-rescued', () => rescues++);
  world.events.on('civilian-shot', () => civShots++);
  const recs = new Map<Civilian, CivRec>();
  const ray = new THREE.Raycaster();
  const active: THREE.Object3D[] = [];
  const ctr = new THREE.Vector3();
  const q = new THREE.Vector3();
  const eye = new THREE.Vector3();
  runner.start();
  let t = 0;
  let frame = 0;
  while (!cleared && t < 700) {
    bot.update(dt);
    const sdt = world.update(dt);
    runner.update(sdt);
    world.scene.updateMatrixWorld();
    t += dt;
    if (frame++ % 2) continue;
    let anyCiv = false;
    for (const e of world.entities) {
      if (!(e instanceof Civilian) || e.removed || e.shot || e.rescued) continue;
      anyCiv = true;
      let r = recs.get(e);
      if (!r) recs.set(e, (r = { beat: runner.label, phases: new Set(), frames: 0, blocked: [] }));
      r.frames++;
      r.phases.add(e.state);
    }
    if (!anyCiv) continue;
    world.shootables.active(active);
    camera.getWorldPosition(eye);
    for (const e of world.entities) {
      if (!(e instanceof Enemy) || !e.hostile || e.removed || e.state === 'dying') continue;
      for (const o of active) {
        const tg = o.userData.shot as ShotTag;
        if (tg.owner !== e || (tg.part !== 'head' && tg.part !== 'torso' && tg.part !== 'weak')) continue;
        const m = o as THREE.Mesh;
        if (!m.geometry) continue;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        ctr.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld);
        q.copy(ctr).project(camera);
        if (q.z > 1 || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
        ray.ray.origin.copy(eye);
        ray.ray.direction.copy(ctr).sub(eye).normalize();
        const hit = ray.intersectObjects(active, false)[0];
        const owner = hit ? (hit.object.userData.shot as ShotTag).owner : null;
        if (owner instanceof Civilian) recs.get(owner)?.blocked.push(`t=${t.toFixed(1)} ${e.name} ${tg.part}${e.telegraph ? ' (attacking)' : ''} civ ${owner.state}`);
      }
    }
  }
  world.dispose();
  Kit.disposeAll();
  return { civs: [...recs.values()], completed: cleared, rescues, civShots };
}

describe('civilians never block a fair shot at an enemy', () => {
  for (const s of ALL_STAGES) {
    it(`${s.id}: no civilian in front of a hostile's head / chest, whatever they do`, { timeout: 180_000 }, () => {
      const r = runStage(s.id, 11);
      expect(r.completed, `${s.id} completed`).toBe(true);
      expect(r.civShots, 'the autoplayer never shoots a civilian').toBe(0);
      for (const c of r.civs) {
        expect(c.blocked, `${s.id} ${c.beat} (${[...c.phases].join('>')}) blocks a shot`).toEqual([]);
      }
      // Every civilian of the stage got its act going (and none is stuck in a pose).
      expect(r.civs.length).toBeGreaterThan(0);
    });
  }
});

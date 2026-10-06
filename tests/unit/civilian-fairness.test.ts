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
import { PerchedCivilian } from '../../src/content/stages/d3/civilian';
import type { ShotTag } from '../../src/gameplay/Shootables';
import { nullHud } from './sim';

/**
 * Civilians never stand in a fair shot: through every stage (real World +
 * StageRunner, a slow AutoPlayer so encounters last, god mode), every other
 * frame while a civilian is a target:
 *
 * - a ray from the camera through the centre of each hostile's head / torso /
 *   weak-point hitbox — and through rings 8, 12 and 16 px round each (the
 *   human-like bot's aim error at 844×390) — must not hit a civilian first,
 *   whatever the civilian is doing (running in, cowering, hiding, running for it,
 *   backing off, falling, held by a zombie);
 * - no civilian hitbox may sit hidden behind visible scenery that doesn't stop
 *   bullets (a shot at the counter would carry on into a civilian you can't
 *   see) — the stage puts them in the open, or behind real occluders.
 *
 * Also records what each civilian did.
 *
 * (Not the d3 mud's driver, perched on his truck by the stage script: from the
 * jeep's eye line the truck's cab and crane arm cover his shins and, cowering,
 * his hands, and the chase's red alpha — when a slow player leaves it alive —
 * can strike right under him. Both predate the acts; the truck and its perch
 * belong to the d3 environment.)
 */

interface CivRec {
  beat: string;
  phases: Set<string>;
  frames: number;
  blocked: string[];
  hidden: string[];
}

const RINGS = [8, 12, 16];
const DIRS = 8;

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
  const ndc = new THREE.Vector2();
  const nrm = new THREE.Vector3();
  runner.start();
  // Solid scenery (not foliage: billboards and fronds are see-through) and what of it stops bullets.
  const scenery: THREE.Object3D[] = [];
  const stops = new Set<THREE.Object3D>();
  const collect = () => {
    scenery.length = 0;
    stops.clear();
    for (const o of world.env?.occluders ?? []) o.traverse((c) => stops.add(c));
    // (Foliage — tagged plants and merged vegetation groups — is see-through: hiding in the ferns is fine.)
    const walk = (o: THREE.Object3D) => {
      if (!o.visible || o.userData.flora || /veg|flora|plant|foliage|fern|bush|leaf|leaves/i.test(o.name)) return;
      const m = o as THREE.Mesh;
      const mat = m.material as THREE.Material | undefined;
      if (m.isMesh && m.geometry && !(mat && (mat.transparent || mat.alphaTest > 0))) scenery.push(o);
      for (const c of o.children) walk(c);
    };
    if (world.env) walk(world.env.root);
  };
  collect();
  let t = 0;
  let frame = 0;
  let lastBeat = '';
  while (!cleared && t < 700) {
    bot.update(dt);
    const sdt = world.update(dt);
    runner.update(sdt);
    world.scene.updateMatrixWorld();
    t += dt;
    if (runner.label !== lastBeat) {
      lastBeat = runner.label;
      collect();
    }
    if (frame++ % 2) continue;
    let anyCiv = false;
    for (const e of world.entities) {
      if (!(e instanceof Civilian) || e.removed || e.shot || e.rescued || e.escaped || e instanceof PerchedCivilian) continue;
      anyCiv = true;
      let r = recs.get(e);
      if (!r) recs.set(e, (r = { beat: runner.label, phases: new Set(), frames: 0, blocked: [], hidden: [] }));
      r.frames++;
      r.phases.add(e.state);
    }
    if (!anyCiv) continue;
    world.shootables.active(active);
    camera.getWorldPosition(eye);
    const firstOwner = (x: number, y: number) => {
      ndc.set(x, y);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(active, false)[0];
      return hit ? (hit.object.userData.shot as ShotTag).owner : null;
    };
    for (const e of world.entities) {
      if (!(e instanceof Enemy) || !e.hostile || e.removed || e.state === 'dying') continue;
      // (Specks out past 120 m — a pack waiting far down the road for its beat — aren't shots anyone takes.)
      if (e.root.getWorldPosition(q).distanceTo(eye) > 120) continue;
      for (const o of active) {
        const tg = o.userData.shot as ShotTag;
        if (tg.owner !== e || (tg.part !== 'head' && tg.part !== 'torso' && tg.part !== 'weak')) continue;
        const m = o as THREE.Mesh;
        if (!m.geometry) continue;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        ctr.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld);
        q.copy(ctr).project(camera);
        if (q.z > 1 || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
        let worst = -1;
        let who: Civilian | null = null;
        const c0 = firstOwner(q.x, q.y);
        if (c0 instanceof Civilian) {
          worst = 0;
          who = c0;
        } else {
          rings: for (const r of RINGS) {
            for (let k = 0; k < DIRS; k++) {
              const a = (k / DIRS) * Math.PI * 2;
              const own = firstOwner(q.x + (Math.cos(a) * r) / 422, q.y + (Math.sin(a) * r) / 195);
              if (own instanceof Civilian) {
                worst = r;
                who = own;
                break rings;
              }
            }
          }
        }
        if (who && !(who instanceof PerchedCivilian)) {
          const cx = who.root.getWorldPosition(new THREE.Vector3()).project(camera).x * 422 + 422;
          recs.get(who)?.blocked.push(`t=${t.toFixed(1)} ${e.name} ${tg.part}${e.telegraph ? ' (attacking)' : ''} ${worst}px at x${(q.x * 422 + 422).toFixed(0)} ${ctr.distanceTo(eye).toFixed(1)}m; civ ${who.state} x${cx.toFixed(0)}`);
        }
      }
    }
    // Hidden behind scenery that doesn't stop bullets?
    if (frame % 10 !== 1) continue;
    for (const o of active) {
      const tg = o.userData.shot as ShotTag;
      if (!(tg.owner instanceof Civilian) || tg.owner instanceof PerchedCivilian) continue;
      const m = o as THREE.Mesh;
      if (!m.geometry) continue;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      ctr.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld);
      q.copy(ctr).project(camera);
      if (q.z > 1 || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
      const d = ctr.distanceTo(eye);
      ray.set(eye, q.copy(ctr).sub(eye).normalize());
      ray.far = d - 0.05;
      const hits = ray.intersectObjects(scenery, false);
      ray.far = Infinity;
      // (Ground layers — paving, verges, a river bank — a hand's breadth over the walk
      // height: a foot or a knee a little into them isn't hidden behind anything.)
      const h = hits.find((x) => {
        if (stops.has(x.object)) return false;
        if (x.face && x.point.y - world.groundAt(x.point.x, x.point.z) < 0.25) {
          nrm.copy(x.face.normal).transformDirection(x.object.matrixWorld);
          if (nrm.y > 0.7) return false;
        }
        return true;
      });
      if (h) {
        const p = tg.owner.root.position;
        recs.get(tg.owner)?.hidden.push(`t=${t.toFixed(1)} ${tg.part} behind ${h.object.name || h.object.parent?.name || 'mesh'} at ${h.point.x.toFixed(1)},${h.point.y.toFixed(1)},${h.point.z.toFixed(1)} (${tg.owner.state} at ${p.x.toFixed(1)},${p.z.toFixed(1)})`);
      }
    }
  }
  world.dispose();
  Kit.disposeAll();
  return { civs: [...recs.values()], completed: cleared, rescues, civShots };
}

describe('civilians never block a fair shot at an enemy, and are never hidden behind see-through scenery', () => {
  for (const s of ALL_STAGES) {
    it(`${s.id}: no civilian in front of (or within 16 px of) a hostile's head / chest, whatever they do; none hidden`, { timeout: 300_000 }, () => {
      const r = runStage(s.id, 11);
      expect(r.completed, `${s.id} completed`).toBe(true);
      expect(r.civShots, 'the autoplayer never shoots a civilian').toBe(0);
      for (const c of r.civs) {
        expect(c.blocked, `${s.id} ${c.beat} (${[...c.phases].join('>')}) blocks a shot`).toEqual([]);
        expect(c.hidden, `${s.id} ${c.beat} (${[...c.phases].join('>')}) hidden behind scenery`).toEqual([]);
      }
      // Every civilian of the stage got its act going (and none is stuck in a pose).
      expect(r.civs.length).toBeGreaterThan(0);
    });
  }
});

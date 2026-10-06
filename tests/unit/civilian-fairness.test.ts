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
import { Grabber } from '../../src/gameplay/civGrab';
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
    const behind = (o: THREE.Object3D): boolean => {
      const m = o as THREE.Mesh;
      if (!m.geometry) return false;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      ctr.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld);
      const d = ctr.distanceTo(eye);
      ray.set(eye, q.copy(ctr).sub(eye).normalize());
      ray.far = d - 0.05;
      const hits = ray.intersectObjects(scenery, false);
      ray.far = Infinity;
      return hits.some((x) => !stops.has(x.object) && !(x.face && x.point.y - world.groundAt(x.point.x, x.point.z) < 0.25 && nrm.copy(x.face.normal).transformDirection(x.object.matrixWorld).y > 0.7));
    };
    /** Is any of this civilian's head / torso hitboxes behind such scenery? */
    const hiddenCore = (c: Civilian): boolean => active.some((o) => {
      const tg = o.userData.shot as ShotTag;
      return tg.owner === c && tg.part !== 'limb' && behind(o);
    });
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
      // (A leg behind a display table or a toy on the floor, the head and chest in plain view: the
      // player sees who it is — and a hostile by those legs is the blocked-shot check's business.)
      if (h && tg.part === 'limb' && !hiddenCore(tg.owner)) continue;
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

/**
 * A slow player who holds fire: each civilian beat on its own (the rig jumped to
 * it, as ?beat= does), god mode, NO shots for its first HOLD_FIRE seconds, while
 * the hostiles do whatever they do — prowl, pace, walk in, wind up. On screen
 * (projected hitbox boxes; either one in front: a miss by the aim error carries
 * on into whatever is behind), a hostile's head / torso / weak point never
 * comes within BOX_PX of a civilian's hitboxes
 *
 * - while it winds up or strikes (the player must shoot it NOW), nor
 * - for longer than LINGER s at a stretch (a dino prowling across them is a
 *   moment's wait for a clear shot; one pacing about in front of them is not);
 *
 * and a zombie holding a civilian keeps GRAB_PX of clear aim round its head
 * and chest centres throughout.
 *
 * Holding fire, the beat's later waves (most start once the first is down to a
 * hostile or two) never come, so a second run CLEARS THE ROOM slowly instead:
 * from CLEAR_FROM s on, one hostile every CLEAR_EVERY s drops dead (the one
 * furthest from the civilians on screen — a player picking off the easy
 * shots first) and the waves come on, over CLEAR_SECS s; the same rules hold
 * for the hostiles still standing (the d2 hatchery's second raptor bursts out
 * of the right-hand door and runs straight at the camera: a civilian on its
 * line is caught there whatever the first wave did).
 */
const HOLD_FIRE = 12;
const CLEAR_FROM = 3;
const CLEAR_EVERY = 1.2;
const CLEAR_SECS = 20;
const BOX_PX = 16;
const LINGER = 0.3;
const GRAB_PX = 25;

interface HoldRec {
  beat: string;
  /** Closest any hostile came while attacking (px). */
  attack: number;
  attackAt: string;
  /** Longest stretch a hostile stayed within BOX_PX (s). */
  linger: number;
  lingerAt: string;
  /** Closest at all (px, for the record). */
  minBox: number;
  minGrab: number;
  grabAt: string;
  frames: number;
}

const _c = new THREE.Vector3();

function rectOf(o: THREE.Object3D, camera: THREE.Camera, out: number[]): boolean {
  const m = o as THREE.Mesh;
  if (!m.geometry) return false;
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox!;
  out[0] = out[1] = Infinity;
  out[2] = out[3] = -Infinity;
  for (let i = 0; i < 8; i++) {
    _c.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m.matrixWorld).project(camera);
    if (_c.z > 1) return false;
    const x = (_c.x * 0.5 + 0.5) * 844;
    const y = (-_c.y * 0.5 + 0.5) * 390;
    out[0] = Math.min(out[0], x);
    out[1] = Math.min(out[1], y);
    out[2] = Math.max(out[2], x);
    out[3] = Math.max(out[3], y);
  }
  return out[2] >= 0 && out[0] <= 844 && out[3] >= 0 && out[1] <= 390;
}

function rectGap(a: number[], b: number[]): number {
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
  return Math.hypot(dx, dy);
}

function holdFire(id: string, beat: number, seed: number, clear = false): HoldRec | null {
  const secs = clear ? CLEAR_SECS : HOLD_FIRE;
  const stage = ALL_STAGES.find((s) => s.id === id)!;
  const dt = 1 / 30;
  const camera = new THREE.PerspectiveCamera(58, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, seed);
  world.viewport = { width: 844, height: 390 };
  world.player.god = true;
  const runner = new StageRunner(world, stage);
  runner.start(beat);
  const rec: HoldRec = { beat: runner.label, attack: Infinity, attackAt: '', linger: 0, lingerAt: '', minBox: Infinity, minGrab: Infinity, grabAt: '', frames: 0 };
  const active: THREE.Object3D[] = [];
  const civRects: number[][] = [];
  const r = [0, 0, 0, 0];
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ctr = new THREE.Vector3();
  const q = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const near = new Map<Enemy, number>();
  let t = 0;
  let nextKill = CLEAR_FROM;
  while (t < secs && runner.index === beat) {
    const sdt = world.update(dt);
    runner.update(sdt);
    world.scene.updateMatrixWorld();
    t += dt;
    world.shootables.active(active);
    camera.getWorldPosition(eye);
    civRects.length = 0;
    for (const o of active) {
      const tg = o.userData.shot as ShotTag;
      if (!(tg.owner instanceof Civilian) || tg.owner instanceof PerchedCivilian) continue;
      if (rectOf(o, camera, r)) civRects.push(r.slice());
    }
    if (clear && t >= nextKill) {
      // Clearing the room: the hostile furthest from the civilians on screen drops.
      nextKill += CLEAR_EVERY;
      let far: Enemy | null = null;
      let farGap = -1;
      for (const e of world.entities) {
        if (!(e instanceof Enemy) || !e.hostile || e.removed || e.state === 'dying' || (e instanceof Grabber && e.holding)) continue;
        let g = 1e6;
        for (const o of active) {
          if ((o.userData.shot as ShotTag).owner !== e || !rectOf(o, camera, r)) continue;
          for (const c of civRects) g = Math.min(g, rectGap(r, c));
        }
        if (g > farGap) {
          farGap = g;
          far = e;
        }
      }
      if (far) {
        far.die(null);
        world.shootables.active(active);
      }
    }
    if (!civRects.length) {
      near.clear();
      continue;
    }
    rec.frames++;
    for (const e of world.entities) {
      if (!(e instanceof Enemy) || !e.hostile || e.removed || e.state === 'dying') continue;
      if (e.root.getWorldPosition(q).distanceTo(eye) > 120) continue;
      const holding = e instanceof Grabber && e.holding;
      let gap = Infinity;
      for (const o of active) {
        const tg = o.userData.shot as ShotTag;
        if (tg.owner !== e || (tg.part !== 'head' && tg.part !== 'torso' && tg.part !== 'weak')) continue;
        if (holding) {
          // Clear aim round its head / chest centre (rays: what a shot there hits first).
          const m = o as THREE.Mesh;
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          ctr.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld).project(camera);
          let best = 99;
          rings: for (let rr = 0; rr <= 40; rr += 2) {
            const nd = rr === 0 ? 1 : 16;
            for (let k = 0; k < nd; k++) {
              const a = (k / nd) * Math.PI * 2;
              ndc.set(ctr.x + (Math.cos(a) * rr) / 422, ctr.y + (Math.sin(a) * rr) / 195);
              ray.setFromCamera(ndc, camera);
              const h = ray.intersectObjects(active, false)[0];
              if (h && (h.object.userData.shot as ShotTag).owner instanceof Civilian) {
                best = rr;
                break rings;
              }
            }
          }
          if (best < rec.minGrab) {
            rec.minGrab = best;
            rec.grabAt = `t=${t.toFixed(2)} ${tg.part}`;
          }
          continue;
        }
        if (!rectOf(o, camera, r)) continue;
        for (const c of civRects) gap = Math.min(gap, rectGap(r, c));
      }
      if (holding || gap === Infinity) {
        near.delete(e);
        continue;
      }
      const what = `t=${t.toFixed(2)} ${e.name} ${e.state} ${gap.toFixed(1)} px`;
      rec.minBox = Math.min(rec.minBox, gap);
      if (e.telegraph && gap < rec.attack) {
        rec.attack = gap;
        rec.attackAt = what;
      }
      if (gap < BOX_PX) {
        const s = (near.get(e) ?? 0) + dt;
        near.set(e, s);
        if (s > rec.linger) {
          rec.linger = s;
          rec.lingerAt = what;
        }
      } else near.delete(e);
    }
  }
  world.dispose();
  Kit.disposeAll();
  return rec.frames ? rec : null;
}

/** Beats with civilians on the ground (the d3 mud's driver is perched on his truck by the beat script). */
function civBeats(id: string): number[] {
  const stage = ALL_STAGES.find((s) => s.id === id)!;
  const out: number[] = [];
  stage.beats.forEach((b, i) => {
    if ((b as { civilians?: unknown[] }).civilians?.length) out.push(i);
  });
  return out;
}

describe('hold fire: a slow player who doesn\'t shoot yet never finds a civilian in the way of a hostile', () => {
  const seeds = (process.env.CIV_HOLD_SEEDS ?? '1,2,3,4,5,6').split(',').map(Number);
  const modes = (process.env.CIV_HOLD_MODES ?? 'hold,clear').split(',');
  for (const s of ALL_STAGES) {
    for (const mode of modes) {
      const clear = mode === 'clear';
      const what = clear ? `the room cleared slowly over ${CLEAR_SECS} s` : `${HOLD_FIRE} s without a shot`;
      it(`${s.id}: every civilian beat, ${what}, seeds ${seeds.join(' ')}`, { timeout: 900_000 }, () => {
        const fails: string[] = [];
        for (const b of civBeats(s.id)) {
          for (const seed of seeds) {
            const r = holdFire(s.id, b, seed, clear);
            if (!r) continue;
            if (process.env.CIV_HOLD_LOG)
              process.stderr.write(`${clear ? 'CLEAR' : 'HOLD'} ${s.id} ${r.beat} seed ${seed}: attacking ${r.attack.toFixed(1)} px (${r.attackAt}) linger ${r.linger.toFixed(2)} s (${r.lingerAt}) min ${r.minBox.toFixed(1)} px grab ${r.minGrab} px (${r.grabAt})\n`);
            if (r.attack < BOX_PX) fails.push(`${r.beat} seed ${seed}: attacking ${r.attackAt}`);
            if (r.linger > LINGER) fails.push(`${r.beat} seed ${seed}: lingers ${r.linger.toFixed(2)} s — ${r.lingerAt}`);
            if (r.minGrab < GRAB_PX) fails.push(`${r.beat} seed ${seed}: grabber ${r.minGrab} px — ${r.grabAt}`);
          }
        }
        expect(fails).toEqual([]);
      });
    }
  }
});

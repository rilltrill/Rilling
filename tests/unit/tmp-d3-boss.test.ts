import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { AutoPlayer } from '../../src/debug/AutoPlayer';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Kit } from '../../src/content/kit/ModelKit';
import { Enemy } from '../../src/gameplay/Enemy';
import { Projectile } from '../../src/gameplay/Projectile';
import type { ShotTag } from '../../src/gameplay/Shootables';
import '../../src/content';
import { stage } from '../../src/content/stages/d3';
import { nullHud } from './sim';

const _v = new THREE.Vector3();
const ray = new THREE.Raycaster();

/** Human-ish shooter: fires as fast as the turret allows, aims (with jitter) at weak points it can actually see. */
class HumanBot {
  private t = 0;
  partHits: Record<string, number> = {};
  constructor(private w: World, private shooter: Shooter, private jitter: number, private rng: () => number) {}
  private screen(o: THREE.Object3D): { x: number; y: number } | null {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      _v.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld);
    } else o.getWorldPosition(_v);
    _v.project(this.w.camera);
    if (_v.z > 1 || Math.abs(_v.x) > 0.98 || Math.abs(_v.y) > 0.98) return null;
    return { x: (_v.x * 0.5 + 0.5) * this.w.viewport.width, y: (-_v.y * 0.5 + 0.5) * this.w.viewport.height };
  }
  private seen(o: THREE.Object3D, sp: { x: number; y: number }): boolean {
    const vw = this.w.viewport;
    ray.setFromCamera(new THREE.Vector2((sp.x / vw.width) * 2 - 1, -(sp.y / vw.height) * 2 + 1), this.w.camera);
    const hits = ray.intersectObjects(this.w.shootables.active(), false);
    return hits.length > 0 && hits[0].object === o;
  }
  private pick(): { x: number; y: number } | null {
    const w = this.w;
    const ents = w.entities.filter((e) => !e.removed);
    // Projectiles + minion windups first.
    const threats = ents.filter((e) => e.telegraph && (e instanceof Projectile || (e instanceof Enemy && !e.isBoss)));
    threats.sort((a, b) => b.telegraph!.progress - a.telegraph!.progress);
    for (const t of threats) {
      const sp = this.screen(t instanceof Enemy ? t.anchor : t.root);
      if (sp) return sp;
    }
    const b = w.boss;
    if (b && b.state !== 'dying' && b.model.visible) {
      const weak = w.shootables.active().filter((o) => (o.userData.shot as ShotTag).owner === b && (o.userData.shot as ShotTag).part === 'weak');
      for (const o of weak) {
        const sp = this.screen(o);
        if (sp && this.seen(o, sp)) return sp;
      }
      const sp = this.screen(b.headAnchor ?? b.anchor);
      if (sp) return sp;
    }
    for (const e of ents) {
      if (e instanceof Enemy && !e.isBoss && e.hostile && e.state !== 'dying') {
        const sp = this.screen(e.headAnchor ?? e.anchor);
        if (sp) return sp;
      }
    }
    return null;
  }
  update(dt: number) {
    this.t -= dt;
    if (this.t > 0) return;
    if (!this.w.weapons.canFire()) return;
    const sp = this.pick();
    if (!sp) return;
    const g = () => (this.rng() + this.rng() + this.rng() - 1.5) * 1.41; // ~N(0,1)
    this.t = 0.07;
    this.shooter.fire(sp.x + g() * this.jitter, sp.y + g() * this.jitter, true);
  }
}

const _c = new THREE.Vector3();
const _u = new THREE.Vector3();
/** Ray-grid probe over the boss head: [weak samples (3px grid), eye-centre unobstructed?, throat-centre unobstructed?] */
function probe(world: World, b: Enemy): [number, number, number] {
  const cam = world.camera;
  const vw = world.viewport;
  const head = b.headAnchor!;
  head.updateWorldMatrix(true, false);
  _c.set(0, -0.2, 0.9).applyMatrix4(head.matrixWorld);
  const ctr = _c.clone().project(cam);
  if (ctr.z > 1) return [0, 0, 0];
  _u.copy(_c).addScaledVector(cam.up, 2.2).project(cam);
  const R = Math.abs(_u.y - ctr.y) * 0.5 * vw.height;
  const cx = (ctr.x * 0.5 + 0.5) * vw.width;
  const cy = (-ctr.y * 0.5 + 0.5) * vw.height;
  const objs = world.shootables.active().filter((o) => (o.userData.shot as ShotTag).owner === b);
  let weak = 0;
  const v2 = new THREE.Vector2();
  for (let y = cy - R; y <= cy + R; y += 3) {
    for (let x = cx - R; x <= cx + R; x += 3) {
      v2.set((x / vw.width) * 2 - 1, -(y / vw.height) * 2 + 1);
      ray.setFromCamera(v2, cam);
      const h = ray.intersectObjects(objs, false);
      if (h.length && (h[0].object.userData.shot as ShotTag).part === 'weak') weak++;
    }
  }
  const centreSeen = (o: THREE.Object3D | undefined) => {
    if (!o || !objs.includes(o)) return 0;
    const m = o as THREE.Mesh;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    _v.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld);
    ray.set(cam.position, _v.sub(cam.position).normalize());
    const h = ray.intersectObjects(objs, false);
    return h.length && (h[0].object.userData.shot as ShotTag).part === 'weak' ? 1 : 0;
  };
  const weakObjs = objs.filter((o) => (o.userData.shot as ShotTag).part === 'weak');
  const eye = weakObjs[0];
  const throat = weakObjs.find((o) => ((o as THREE.Mesh).geometry as THREE.BufferGeometry).type === 'SphereGeometry' && o.parent && o.parent.parent === head && o.parent.type === 'Group' && o.parent !== head);
  return [weak, centreSeen(eye), centreSeen(throat)];
}

function run(seed: number, mode: 'auto' | 'human', jitter = 8, fps = 30) {
  const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, seed);
  world.viewport = { width: 844, height: 390 };
  world.player.god = true;
  const runner = new StageRunner(world, stage);
  const shooter = new Shooter(world);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const bot = mode === 'auto' ? new AutoPlayer(world, shooter, 6) : new HumanBot(world, shooter, jitter, rnd);
  let cleared = false;
  world.events.on('stage-clear', () => (cleared = true));
  const bossIdx = stage.beats.findIndex((b) => b.kind === 'boss');
  const dt = 1 / fps;
  runner.start(bossIdx);
  let t = 0;
  let bossT = 0;
  let last = '';
  const att: Record<string, { n: number; intr: number; land: number }> = {};
  const hurts: string[] = [];
  const orig = world.hurtPlayer.bind(world);
  world.hurtPlayer = (amount, source, from) => {
    const landed = orig(amount, source, from);
    if (landed && world.boss) hurts.push(`${(from instanceof Projectile ? 'proj' : from === world.boss ? world.boss.state : (from as Enemy)?.name ?? '?')}@${bossT.toFixed(0)}`);
    return landed;
  };
  const log: string[] = [];
  let bossSeen = false;
  let bossDone = false;
  let maxWindDist = 0;
  const vis: Record<string, { n: number; weak: number; eye: number; thr: number; dist: number }> = {};
  let probeT = 0;
  let windDmg = 0;
  let windShots0 = 0;
  let windHeat = 0;
  const windLog: string[] = [];
  while (!cleared && t < 400) {
    bot.update(dt);
    const sdt = world.update(dt);
    runner.update(sdt);
    world.scene.updateMatrixWorld();
    const b = world.boss;
    if (b && !bossDone) {
      bossSeen = true;
      bossT += dt;
      const st = b.state;
      if (/Wind$/.test(st)) {
        windDmg = Math.max(windDmg, (b as unknown as { interruptDmg: number }).interruptDmg);
        if (world.weapons.overheated) windHeat += dt;
      }
      if (st !== last) {
        if (/Wind$/.test(st)) {
          windShots0 = world.score.shots;
          windDmg = 0;
          windHeat = 0;
        }
        if (/Wind$/.test(last) && last !== 'flingWind') {
          windLog.push(`${last.replace('Wind', '')}:${windDmg.toFixed(1)}/${world.score.shots - windShots0}sh/${windHeat.toFixed(1)}oh/${st === 'stumble' ? 'INT' : 'hit'}`);
        }
        if (/Wind$/.test(last)) {
          const a = (att[last] ??= { n: 0, intr: 0, land: 0 });
          a.n++;
          if (st === 'stumble') a.intr++;
          else if (/Recover$/.test(st)) a.land++;
        }
        log.push(`${bossT.toFixed(1)} ${st} ph${b.phase} hp=${b.hp.toFixed(0)} d=${world.rig.d.toFixed(0)} z=${b.root.position.z.toFixed(1)}`);
        last = st;
      }
      if (st === 'dying') bossDone = true;
      if (/Wind$/.test(st)) maxWindDist = Math.max(maxWindDist, b.distToPlayer);
      probeT -= dt;
      if (process.env.D3PROBE && probeT <= 0 && st !== 'dying' && b.model.visible) {
        probeT = 0.2;
        const [wk, eye, thr] = probe(world, b);
        const key = /Wind$/.test(st) ? `${st}${b.stateTime < 0.8 ? 'A' : 'B'}` : st;
        const r = (vis[key] ??= { n: 0, weak: 0, eye: 0, thr: 0, dist: 0 });
        r.n++;
        r.weak += wk;
        r.eye += eye;
        r.thr += thr;
        r.dist += b.distToPlayer;
      }
    }
    if (bossSeen && !world.boss) bossDone = true;
    t += dt;
  }
  const out = {
    seed,
    mode,
    jitter,
    cleared,
    bossT: +bossT.toFixed(1),
    hits: hurts.length,
    hurts: hurts.join(' '),
    att: JSON.stringify(att),
    wind: windLog.join(' '),
    vis: Object.entries(vis).map(([k, r]) => `${k}: wk=${(r.weak / r.n).toFixed(0)} eye=${(r.eye / r.n).toFixed(2)} thr=${(r.thr / r.n).toFixed(2)} d=${(r.dist / r.n).toFixed(1)}`).join(' | '),
  };
  world.dispose();
  Kit.disposeAll();
  return { out, log };
}

it('d3 boss balance', { timeout: 600_000 }, () => {
  const rows: string[] = [];
  const mode = (process.env.D3MODE ?? 'auto,human') as string;
  for (const seed of [99, 7, 1234]) {
    if (mode.includes('auto')) {
      const r = run(seed, 'auto');
      rows.push(JSON.stringify(r.out));
      if (process.env.D3LOG && seed === 99) rows.push(r.log.join("\n"));
    }
    if (mode.includes('human')) {
      rows.push(JSON.stringify(run(seed, 'human', 8).out));
      rows.push(JSON.stringify(run(seed, 'human', 4).out));
    }
  }
  writeFileSync(process.env.D3OUT ?? "/tmp/d3boss.txt", rows.join("\n"));
  console.log(rows.join("\n"));
});

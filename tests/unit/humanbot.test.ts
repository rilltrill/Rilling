/**
 * HUMAN-LIKE DIFFICULTY BOT (opt-in dev tool; skipped in normal test runs).
 *
 * Plays stages without god mode like an average phone player: ~3 taps/s,
 * 0.25–0.4 s reaction, Gaussian aim error (σ = ZG_SIGMA × screen height), reloads
 * when empty, never uses bombs; deaths count as continues. Writes per-stage stats
 * (damage per beat, deaths, boss time, telegraph visibility of every hit taken,
 * civilian shots, dead time) to ZG_OUT (default /tmp/humanbot.json).
 *
 *   HUMANBOT=1 ZG_STAGES=z1,z2 ZG_SEEDS=1,2,3,4 ZG_SIGMA=0.03 npx vitest run tests/unit/humanbot.test.ts
 *
 * Knobs: ZG_REACT=0.25,0.4  ZG_TAP=3 (taps/s)  ZG_MINION=0|9 (prioritise minions in boss fights).
 * Targets of a good arcade curve: stage 1 ≈ 0–2 hearts lost, stage 2 moderate,
 * stage 3 hardest but fair; no encounter regularly deals ≥ 3 damage.
 */
import { it } from 'vitest';
import * as THREE from 'three';
import * as fs from 'node:fs';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Kit } from '../../src/content/kit/ModelKit';
import { ALL_STAGES } from '../../src/content';
import { Enemy } from '../../src/gameplay/Enemy';
import { Projectile } from '../../src/gameplay/Projectile';
import { Pickup } from '../../src/gameplay/Pickup';
import { Civilian } from '../../src/gameplay/Civilian';
import type { Entity } from '../../src/gameplay/Entity';
import type { ShotTag } from '../../src/gameplay/Shootables';
import { nullHud } from './sim';

// ─── tiny seeded rng for the bot ───────────────────────────────────────────
class BRng {
  constructor(private s: number) {}
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  gauss() {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();

let current: Entity | null = null;
const origEnemyUpdate = Enemy.prototype.update;
const origProjUpdate = Projectile.prototype.update;
Enemy.prototype.update = function (this: Enemy, dt: number) {
  const prev = current;
  current = this;
  try {
    origEnemyUpdate.call(this, dt);
  } finally {
    current = prev;
  }
};
Projectile.prototype.update = function (this: Projectile, dt: number) {
  const prev = current;
  current = this;
  try {
    origProjUpdate.call(this, dt);
  } finally {
    current = prev;
  }
};

function entName(e: Entity | null | undefined): string {
  if (!e) return '?';
  if (e instanceof Projectile) return `proj:${e.opts.source}`;
  return (e as Enemy).name ?? e.constructor.name;
}

interface TeleRec {
  ent: Entity;
  name: string;
  start: number;
  frames: number;
  onScreen: number;
  shootable: number;
  /** Last sampled reachability (sampled every 3rd frame; the frames between carry it). */
  lastReach: boolean;
  hud: number;
  startOnScreen: boolean;
  startShootable: boolean;
  startScreen: { x: number; y: number } | null;
  beat: string;
  landed?: boolean;
  struck?: boolean;
}

interface HurtRec {
  t: number;
  beat: string;
  src: string;
  attacker: string;
  landed: boolean;
  teleDur: number;
  teleOnScreenFrac: number;
  teleShootableFrac: number;
  teleHudFrac: number;
  attackerOnScreenAtHit: boolean;
  screenAtHit: { x: number; y: number } | null;
  startScreen: { x: number; y: number } | null;
  shotsAtAttacker: number;
  hpAfter: number;
}

export interface HumanResult {
  stage: string;
  seed: number;
  sigma: number;
  completed: boolean;
  time: number;
  deaths: number;
  damage: number;
  absorbed: number;
  perBeat: Record<string, { dmg: number; time: number; deaths: number }>;
  bossTime: number;
  bossDmg: number;
  civShots: number;
  rescues: number;
  shots: number;
  hits: number;
  kills: number;
  hurts: HurtRec[];
  deadStretches: { from: number; to: number; beats: string[] }[];
  quietStretches: { from: number; to: number; beats: string[] }[];
  overheats: number;
  overheatTime: number;
  overheatWhileThreat: number;
  pickups: Record<string, number>;
  pickupsMissed: string[];
  civInfo: string[];
  weaponTime: Record<string, number>;
  hudTaps: Record<string, number>;
  bossWeaponTime: Record<string, number>;
  teles: { name: string; beat: string; startOn: boolean; startShoot: boolean; on: number; shoot: number; hud: number; dur: number; landed: boolean; struck: boolean; start: { x: number; y: number } | null }[];
  beatLabel: string;
  errors: string[];
}

/** HUD regions at 844x390 (approx): top-left score, top-right pause, bottom-left hearts, bottom-right weapon, boss bar. */
function inHud(p: { x: number; y: number }, W: number, H: number, boss: boolean): boolean {
  if (p.x < 200 && p.y < 60) return true;
  if (p.x > W - 64 && p.y < 64) return true;
  if (p.x < 190 && p.y > H - 64) return true;
  if (p.x > W - 200 && p.y > H - 84) return true;
  if (boss && p.y < 56 && p.x > W * 0.25 && p.x < W * 0.75) return true;
  return false;
}


/** Tappable HUD buttons at 844x390 (measured from CRT screenshots): taps here never reach the play surface. */
function onHudButton(x: number, y: number): string | null {
  if (x >= 790 && x <= 834 && y >= 8 && y <= 52) return 'pause';
  if (x >= 638 && x <= 758 && y >= 304 && y <= 381) return 'weapon';
  if (x >= 768 && x <= 832 && y >= 316 && y <= 380) return 'reload';
  if (x >= 144 && x <= 192 && y >= 332 && y <= 381) return 'bomb';
  return null;
}

export function simulateHuman(
  stageId: string,
  o: { seed: number; startBeat?: number; debug?: (w: World, t: number, label: string) => void; god?: boolean; sigma?: number; tapRate?: number; react?: [number, number]; maxTime?: number; fps?: number; headBias?: number; minionFirst?: number },
): HumanResult {
  const stage = ALL_STAGES.find((s) => s.id === stageId)!;
  const sigma = o.sigma ?? 0.03;
  const tapRate = o.tapRate ?? 3;
  const react = o.react ?? [0.25, 0.4];
  const maxTime = o.maxTime ?? 900;
  const dt = 1 / (o.fps ?? 30);
  const W = 844;
  const H = 390;
  const camera = new THREE.PerspectiveCamera(58, W / H, 0.05, 400); // matches Engine at 844×390
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, o.seed);
  world.viewport = { width: W, height: H };
  const runner = new StageRunner(world, stage);
  const shooter = new Shooter(world);
  const rng = new BRng(o.seed * 7919 + 13);
  const res: HumanResult = {
    stage: stageId,
    seed: o.seed,
    sigma,
    completed: false,
    time: 0,
    deaths: 0,
    damage: 0,
    absorbed: 0,
    perBeat: {},
    bossTime: 0,
    bossDmg: 0,
    civShots: 0,
    rescues: 0,
    shots: 0,
    hits: 0,
    kills: 0,
    hurts: [],
    deadStretches: [],
    quietStretches: [],
    overheats: 0,
    overheatTime: 0,
    overheatWhileThreat: 0,
    pickups: {},
    pickupsMissed: [],
    teles: [],
    civInfo: [],
    weaponTime: {},
    hudTaps: {},
    bossWeaponTime: {},
    beatLabel: '',
    errors: [],
  };
  let t = 0;
  let cleared = false;
  let died = false;
  world.events.on('stage-clear', () => (cleared = true));
  world.events.on('player-dead', () => (died = true));
  let lastAim = '';
  world.events.on('civilian-shot', () => {
    res.civShots++;
    res.errors.length < 0 || (res as unknown as { civInfo: string[] }).civInfo.push(`${t.toFixed(1)} ${runner.label} aiming at ${lastAim}`);
  });
  world.events.on('civilian-rescued', () => res.rescues++);
  world.events.on('pickup', ({ kind }) => (res.pickups[kind] = (res.pickups[kind] ?? 0) + 1));
  world.events.on('kill', () => res.kills++);

  const beat = () => runner.label;
  const pb = (b: string) => (res.perBeat[b] ??= { dmg: 0, time: 0, deaths: 0 });

  // Telegraph tracking.
  const tele = new Map<Entity, TeleRec>();
  const lastTele = new Map<Entity, TeleRec>();
  const shotsAt = new Map<Entity, number>();
  const firstSeen = new Map<Entity, { t: number; react: number }>();
  const teleSeen = new Map<Entity, { t: number; react: number }>();

  const center = (obj: THREE.Object3D, out: THREE.Vector3) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      out.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld);
    } else obj.getWorldPosition(out);
    return out;
  };
  const project = (p: THREE.Vector3, margin = 0.98): { x: number; y: number } | null => {
    _v.copy(p).project(camera);
    if (_v.z > 1 || Math.abs(_v.x) > margin || Math.abs(_v.y) > margin) return null;
    return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H };
  };
  const parts = (owner: unknown, part?: string) =>
    world.shootables.active().filter((ob) => {
      const tg = ob.userData.shot as ShotTag;
      return tg.owner === owner && (!part || tg.part === part);
    });
  /** First thing along a camera ray to obj: is it the owner's? */
  const reachable = (obj: THREE.Object3D, owner: unknown): boolean => {
    const p = center(obj, new THREE.Vector3());
    _ray.ray.origin.copy(camera.position);
    _ray.ray.direction.copy(p).sub(camera.position).normalize();
    _ray.far = 200;
    const hits = _ray.intersectObjects(world.shootables.active(), false);
    const occ = world.env?.occluders ?? [];
    if (occ.length) for (const h of _ray.intersectObjects(occ, true)) if (!h.object.userData.shot) hits.push(h);
    hits.sort((a, b) => a.distance - b.distance);
    for (const h of hits) {
      const tg = h.object.userData.shot as ShotTag | undefined;
      if (!tg) return false; // wall first
      if (tg.owner.removed) continue;
      return tg.owner === owner;
    }
    return false;
  };
  const anyReachable = (e: Entity) => {
    for (const ob of parts(e)) {
      if (!project(center(ob, _v.clone()), 1)) continue;
      if (reachable(ob, e)) return true;
    }
    return false;
  };
  const anchorScreen = (e: Entity) => {
    const a = e.telegraph?.anchor ?? (e as Enemy).anchor ?? e.root;
    return project(a.getWorldPosition(new THREE.Vector3()), 1);
  };

  // Wrap hurtPlayer.
  const origHurt = world.hurtPlayer.bind(world);
  world.hurtPlayer = (amount: number, source: string, from?: Entity) => {
    const attacker = from ?? current;
    const landed = origHurt(amount, source, from);
    const rec = attacker ? tele.get(attacker) ?? lastTele.get(attacker) : undefined;
    const h: HurtRec = {
      t,
      beat: beat(),
      src: source,
      attacker: entName(attacker),
      landed,
      teleDur: rec ? t - rec.start : -1,
      teleOnScreenFrac: rec && rec.frames ? rec.onScreen / rec.frames : -1,
      teleShootableFrac: rec && rec.frames ? rec.shootable / rec.frames : -1,
      teleHudFrac: rec && rec.frames ? rec.hud / rec.frames : -1,
      attackerOnScreenAtHit: attacker ? !!anchorScreen(attacker) : false,
      screenAtHit: attacker ? anchorScreen(attacker) : null,
      startScreen: rec?.startScreen ?? null,
      shotsAtAttacker: attacker ? shotsAt.get(attacker) ?? 0 : 0,
      hpAfter: world.player.hp,
    };
    res.hurts.push(h);
    if (rec) {
      rec.struck = true;
      if (landed) rec.landed = true;
    }
    if (landed) {
      res.damage += amount;
      pb(beat()).dmg += amount;
      if (world.boss) res.bossDmg += amount;
    } else if (!world.player.dead) res.absorbed++;
    return landed;
  };

  // ─── bot state ───
  let tapCd = 0.5;
  let aimOff = { x: 0, y: 0 };
  let aimOffT = 0;
  let lastTarget: THREE.Object3D | null = null;
  const sig = sigma * H;

  // Like a player: an enemy counts as visible when ANY of its hit parts is on screen
  // (heads/rings often show before the chest anchor does).
  const visibleEnt = (e: Entity) => {
    for (const ob of parts(e)) if (project(center(ob, new THREE.Vector3()), 0.98)) return true;
    const a = (e as Enemy).anchor ?? e.root;
    return project(a.getWorldPosition(new THREE.Vector3()), 0.98) !== null;
  };

  const pickPart = (e: Entity): THREE.Object3D | null => {
    const vis = (l: THREE.Object3D[]) => l.filter((ob) => project(center(ob, new THREE.Vector3()), 0.98));
    if (e instanceof Projectile || e instanceof Pickup) return vis(parts(e))[0] ?? null;
    const weak = vis(parts(e, 'weak'));
    if (weak.length) {
      const clear = weak.find((ob) => reachable(ob, e));
      return clear ?? weak[0];
    }
    // Human: head for regular zombies sometimes, torso otherwise.
    const head = vis(parts(e, 'head'));
    const torso = vis(parts(e, 'torso'));
    const want = rng.next() < (o.headBias ?? 0.5) ? head : torso;
    const l = want.length ? want : head.length ? head : torso.length ? torso : vis(parts(e, 'body')).concat(vis(parts(e, 'limb')));
    return l[0] ?? null;
  };

  const eligible = (e: Entity, map: Map<Entity, { t: number; react: number }>) => {
    let s = map.get(e);
    if (!s) {
      s = { t, react: rng.range(react[0], react[1]) };
      map.set(e, s);
    }
    return t - s.t >= s.react;
  };

  const pickTarget = (): { obj: THREE.Object3D; ent: Entity } | null => {
    const ents = world.entities.filter((e) => !e.removed);
    // update seen maps
    for (const e of [...firstSeen.keys()]) if (e.removed || !visibleEnt(e)) firstSeen.delete(e);
    for (const e of [...teleSeen.keys()]) if (e.removed || !e.telegraph) teleSeen.delete(e);
    const threats = ents
      .filter((e) => e.telegraph && (e instanceof Enemy || e instanceof Projectile) && visibleEnt(e))
      .filter((e) => eligible(e, teleSeen))
      .sort((a, b) => b.telegraph!.progress - a.telegraph!.progress);
    for (const e of threats) {
      const ob = pickPart(e);
      if (ob) return { obj: ob, ent: e };
    }
    if (o.minionFirst) {
      const near = ents
        .filter((e): e is Enemy => e instanceof Enemy && e.state !== 'dying' && e.hostile && !e.isBoss && e.distToPlayer < o.minionFirst!)
        .filter((e) => visibleEnt(e))
        .filter((e) => eligible(e, firstSeen))
        .sort((a, b) => a.distToPlayer - b.distToPlayer);
      for (const e of near) {
        const ob = pickPart(e);
        if (ob) return { obj: ob, ent: e };
      }
    }
    const boss = world.boss;
    if (boss && !boss.removed && boss.state !== 'dying' && visibleEnt(boss) && eligible(boss, firstSeen)) {
      const ob = pickPart(boss);
      if (ob) return { obj: ob, ent: boss };
    }
    const enemies = ents
      .filter((e): e is Enemy => e instanceof Enemy && e.state !== 'dying' && e.hostile && !e.isBoss)
      .filter((e) => visibleEnt(e))
      .filter((e) => eligible(e, firstSeen))
      .sort((a, b) => a.distToPlayer - b.distToPlayer);
    for (const e of enemies) {
      const ob = pickPart(e);
      if (ob) return { obj: ob, ent: e };
    }
    for (const e of ents) {
      if (e instanceof Pickup && visibleEnt(e) && eligible(e, firstSeen)) {
        const ob = pickPart(e);
        if (ob) return { obj: ob, ent: e };
      }
    }
    return null;
  };

  const botUpdate = () => {
    const turret = world.weapons.active === 'turret';
    const tg = pickTarget();
    if (turret) {
      // Hold-to-fire with a tracking error that drifts every ~0.25 s.
      aimOffT -= dt;
      if (aimOffT <= 0 || (tg && tg.obj !== lastTarget)) {
        aimOffT = 0.25;
        aimOff = { x: rng.gauss() * sig, y: rng.gauss() * sig };
      }
      if (!tg) {
        lastTarget = null;
        return;
      }
      lastTarget = tg.obj;
      const p = project(center(tg.obj, new THREE.Vector3()), 1);
      if (!p) return;
      const before = world.score.shots;
      lastAim = `${entName(tg.ent)} d=${(tg.ent as Enemy).distToPlayer?.toFixed?.(1)} aim=${p.x.toFixed(0)},${p.y.toFixed(0)} civs=${world.entities.filter((e) => e instanceof Civilian && !e.removed).map((c) => { const q = project(c.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.2, 0)), 1.2); return q ? `${q.x.toFixed(0)},${q.y.toFixed(0)}` : 'off'; }).join('/')}`;
      if (shooter.fire(p.x + aimOff.x, p.y + aimOff.y, true)) {
        res.shots++;
        if (shooter.lastHit) res.hits++;
        shotsAt.set(tg.ent, (shotsAt.get(tg.ent) ?? 0) + 1);
      }
      void before;
      return;
    }
    tapCd -= dt;
    if (tapCd > 0) return;
    if (world.weapons.empty && world.weapons.reloading <= 0) {
      shooter.reload();
      return;
    }
    if (world.weapons.reloading > 0) return;
    if (!tg) return;
    const p = project(center(tg.obj, new THREE.Vector3()), 1);
    if (!p) return;
    const minI = world.weapons.def.interval;
    tapCd = Math.max(minI + 0.02, Math.min(0.6, Math.max(0.2, 1 / tapRate + rng.gauss() * 0.06)));
    const tx = p.x + rng.gauss() * sig;
    const ty = p.y + rng.gauss() * sig;
    {
      const btn = onHudButton(tx, ty);
      if (btn) {
        const k = `${runner.label.replace(/^\d+:/, '')} | ${entName(tg.ent)} | ${btn}`;
        res.hudTaps[k] = (res.hudTaps[k] ?? 0) + 1;
      }
      const kk = `_all ${runner.label.replace(/^\d+:/, '')}`;
      res.hudTaps[kk] = (res.hudTaps[kk] ?? 0) + 1;
    }
    lastAim = `${entName(tg.ent)} d=${(tg.ent as Enemy).distToPlayer?.toFixed?.(1)} part=${(tg.obj.userData.shot as ShotTag)?.part} civs=${world.entities.filter((e) => e instanceof Civilian && !e.removed).map((c) => { const q = project(c.root.getWorldPosition(new THREE.Vector3()).setY(c.root.getWorldPosition(new THREE.Vector3()).y + 1.2), 1.2); return q ? `${q.x.toFixed(0)},${q.y.toFixed(0)}` : 'off'; }).join('/')} aim=${p.x.toFixed(0)},${p.y.toFixed(0)}`;
    if (shooter.fire(tx, ty, false)) {
      res.shots++;
      if (shooter.lastHit) res.hits++;
      shotsAt.set(tg.ent, (shotsAt.get(tg.ent) ?? 0) + 1);
    }
  };

  // dead time tracking
  let noHostileSince = 0;
  let noHostileBeats = new Set<string>();
  let quietSince = 0;
  let quietBeats = new Set<string>();
  let wasOverheated = false;
  let bossStart = -1;

  try {
    runner.start(o.startBeat ?? 0);
    if (o.god) world.player.god = true;
  } catch (e) {
    res.errors.push(`start: ${(e as Error).stack ?? e}`);
  }
  while (!cleared && t < maxTime && res.errors.length < 5) {
    try {
      botUpdate();
      const sdt = world.update(dt);
      runner.update(sdt);
      world.scene.updateMatrixWorld();
    } catch (e) {
      res.errors.push(`t=${t.toFixed(1)} ${runner.label}: ${(e as Error).stack ?? e}`);
    }
    const b = beat();
    o.debug?.(world, t, b);
    pb(b).time += dt;
    // Telegraph sampling.
    const seenNow = new Set<Entity>();
    for (const e of world.entities) {
      if (e.removed || !e.telegraph) continue;
      seenNow.add(e);
      let r = tele.get(e);
      const sp = anchorScreen(e);
      if (!r) {
        r = {
          ent: e,
          name: entName(e),
          start: t,
          frames: 0,
          onScreen: 0,
          shootable: 0,
          lastReach: false,
          hud: 0,
          startOnScreen: !!sp,
          startShootable: anyReachable(e),
          startScreen: sp,
          beat: b,
        };
        tele.set(e, r);
      }
      r.frames++;
      if (sp) r.onScreen++;
      if (sp && inHud(sp, W, H, !!world.boss)) r.hud++;
      // Sample every 3rd frame and carry the last sample (a running-ratio carry undercounted
      // telegraphs blocked on their first sample but reachable for the rest of their life).
      if (r.frames % 3 === 1) r.lastReach = anyReachable(e);
      if (r.lastReach) r.shootable++;
    }
    for (const [e, r] of tele) {
      if (!seenNow.has(e)) {
        tele.delete(e);
        lastTele.set(e, r);
        res.teles.push({ name: r.name, beat: r.beat, startOn: r.startOnScreen, startShoot: r.startShootable, on: r.onScreen / r.frames, shoot: r.shootable / r.frames, hud: r.hud / r.frames, dur: t - r.start, landed: !!r.landed, struck: !!r.struck, start: r.startScreen });
      }
    }
    // Death → continue.
    if (died) {
      died = false;
      res.deaths++;
      pb(b).deaths++;
      world.player.revive();
      world.score.breakCombo();
      for (const e of world.entities) {
        if (e instanceof Projectile) e.removed = true;
        else if (e instanceof Enemy && e.state !== 'dying') {
          if (e.isBoss) e.stateTime = 0;
          else if (e.state === 'windup' || e.state === 'recover') e.stagger();
        }
      }
    }
    // Dead time.
    const hc = world.hostileCount();
    const onScreenHostile = world.entities.some((e) => e.hostile && !e.removed && visibleEnt(e));
    if (hc > 0 || cleared) {
      if (t - noHostileSince > 8) res.deadStretches.push({ from: +noHostileSince.toFixed(1), to: +t.toFixed(1), beats: [...noHostileBeats] });
      noHostileSince = t;
      noHostileBeats = new Set();
    } else noHostileBeats.add(b);
    if (onScreenHostile || cleared) {
      if (t - quietSince > 8) res.quietStretches.push({ from: +quietSince.toFixed(1), to: +t.toFixed(1), beats: [...quietBeats] });
      quietSince = t;
      quietBeats = new Set();
    } else quietBeats.add(b);
    // Turret heat.
    if (world.weapons.overheated) {
      res.overheatTime += dt;
      if (!wasOverheated) res.overheats++;
      if (world.entities.some((e) => e.telegraph && !e.removed)) res.overheatWhileThreat += dt;
    }
    wasOverheated = world.weapons.overheated;
    {
      const wid = world.weapons.active;
      res.weaponTime[wid] = (res.weaponTime[wid] ?? 0) + dt;
      if (world.boss) res.bossWeaponTime[wid] = (res.bossWeaponTime[wid] ?? 0) + dt;
    }
    if (world.boss) {
      if (bossStart < 0) bossStart = t;
      res.bossTime += dt;
    }
    t += dt;
  }
  res.completed = cleared;
  res.time = +t.toFixed(1);
  res.beatLabel = runner.label;
  world.dispose();
  Kit.disposeAll();
  return res;
}

const STAGES = (process.env.ZG_STAGES ?? 'z1,z2,z3').split(',');
const SEEDS = (process.env.ZG_SEEDS ?? '1,2,3').split(',').map(Number);
const SIGMA = Number(process.env.ZG_SIGMA ?? 0.03);
const OUT = process.env.ZG_OUT ?? '/tmp/humanbot.json';

it.skipIf(process.env.HUMANBOT !== '1')('human-like bot runs', { timeout: 3_600_000 }, () => {
  const all: HumanResult[] = [];
  for (const s of STAGES) {
    for (const seed of SEEDS) {
      const t0 = Date.now();
      const r = simulateHuman(s, { seed, sigma: SIGMA, minionFirst: Number(process.env.ZG_MINION ?? 0), react: process.env.ZG_REACT ? (process.env.ZG_REACT.split(',').map(Number) as [number, number]) : undefined, tapRate: Number(process.env.ZG_TAP ?? 3) });
      all.push(r);
      const top = Object.entries(r.perBeat)
        .filter(([, v]) => v.dmg > 0)
        .map(([k, v]) => `${k}=${v.dmg}`)
        .join(' | ');
      console.log(
        `${s} seed=${seed} σ=${SIGMA} done=${r.completed} t=${r.time}s deaths=${r.deaths} dmg=${r.damage} absorbed=${r.absorbed} boss=${r.bossTime.toFixed(1)}s bossDmg=${r.bossDmg} civ=${r.civShots} acc=${(r.hits / Math.max(1, r.shots)).toFixed(2)} oh=${r.overheats}/${r.overheatTime.toFixed(1)}s cpu=${Date.now() - t0}ms errs=${r.errors.length}\n   ${top}`,
      );
      if (r.errors.length) console.log(r.errors.join('\n'));
    }
  }
  fs.mkdirSync('/tmp/review-zgame', { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
});

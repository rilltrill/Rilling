import { describe, it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { AutoPlayer } from '../../src/debug/AutoPlayer';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Kit } from '../../src/content/kit/ModelKit';
import { ALL_STAGES } from '../../src/content';
import { Rng } from '../../src/core/Rng';
import { nullHud } from './sim';
import type { ShotTag } from '../../src/gameplay/Shootables';

const stage = ALL_STAGES.find((s) => s.id === 'z1')!;

interface Opts {
  rate: number;
  noise: number;
  seed: number;
  startBeat?: number;
  maxTime?: number;
  fps?: number;
}

function run(o: Opts) {
  const dt = 1 / (o.fps ?? 30);
  const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, o.seed);
  world.viewport = { width: 844, height: 390 };
  world.player.god = true;
  const runner = new StageRunner(world, stage);
  const shooter = new Shooter(world);
  const nrng = new Rng(o.seed + 7);
  const orig = shooter.fire.bind(shooter);
  shooter.fire = (x: number, y: number, h = false) => {
    const g = () => (nrng.next() + nrng.next() + nrng.next() - 1.5) * 1.4;
    return orig(x + g() * o.noise, y + g() * o.noise, h);
  };
  const bot = new AutoPlayer(world, shooter, o.rate);
  let cleared = false;
  let t = 0;
  const beats: string[] = [];
  const hurts: string[] = [];
  let civShot = 0;
  let rescues = 0;
  const pickups: string[] = [];
  let bossStart = -1;
  let bossEnd = -1;
  const phaseTimes: string[] = [];
  let lastPhase = 0;
  let maxTele = 0;
  let maxHostile = 0;
  const errors: string[] = [];
  const bossStates = new Map<string, number>();
  const attackCounts = new Map<string, number>();
  let lastBossState = '';
  const trans: string[] = [];
  world.events.on('stage-clear', () => (cleared = true));
  world.events.on('beat', (e) => beats.push(`${t.toFixed(1)} #${e.index} ${e.beat.kind} ${e.beat.label ?? ''}`));
  world.events.on('player-hurt', (e) => hurts.push(`${t.toFixed(1)} ${e.source} @${runner.label}`));
  world.events.on('civilian-shot', () => civShot++);
  world.events.on('civilian-rescued', () => rescues++);
  world.events.on('pickup', (e) => pickups.push(`${t.toFixed(1)} ${e.kind}`));
  world.events.on('boss-start', () => (bossStart = t));
  world.events.on('boss-dead', () => (bossEnd = t));
  const origHurt = world.hurtPlayer.bind(world);
  const causes = new Map<string, number>();
  world.hurtPlayer = (amount: number, source: string) => {
    const ok = origHurt(amount, source);
    if (ok) {
      const st = (new Error().stack ?? '').split('\n').slice(2, 4).map((l) => l.trim().split(' ')[1]).join('<');
      const bs = (world.boss as unknown as { state: string; phase: number } | null);
      const key = `${st} [${bs ? bs.state + ' p' + bs.phase : '-'}]`;
      causes.set(key, (causes.get(key) ?? 0) + 1);
    }
    return ok;
  };
  let teleLog = '';
  runner.start(o.startBeat ?? 0);
  while (!cleared && t < (o.maxTime ?? 900) && errors.length < 3) {
    try {
      bot.update(dt);
      const sdt = world.update(dt);
      runner.update(sdt);
      world.scene.updateMatrixWorld();
    } catch (e) {
      errors.push(`t=${t.toFixed(1)} ${runner.label}: ${(e as Error).stack}`);
    }
    const b = world.boss as unknown as { phase: number; state: string } | null;
    if (b) {
      if (b.phase !== lastPhase) {
        phaseTimes.push(`${(t - bossStart).toFixed(1)}s -> phase ${b.phase}`);
        lastPhase = b.phase;
      }
      bossStates.set(b.state, (bossStates.get(b.state) ?? 0) + dt);
      if (b.state !== lastBossState) {
        trans.push(`${(t - bossStart).toFixed(2)}:${b.state}`);
        attackCounts.set(b.state, (attackCounts.get(b.state) ?? 0) + 1);
        lastBossState = b.state;
      }
    }
    let tele = 0;
    for (const e of world.entities) if (!e.removed && e.telegraph) tele++;
    if (tele > maxTele && tele > 3) {
      const names = world.entities.filter((e) => !e.removed && e.telegraph).map((e) => ((e as unknown as { opts?: { source?: string; hp?: number; flightTime?: number } }).opts ? `P(${(e as any).opts.source},hp${(e as any).opts.hp},ft${(e as any).opts.flightTime?.toFixed?.(2)},age${(e as any).age?.toFixed?.(2)})` : (e as unknown as { name?: string }).name ?? e.constructor.name));
      names.push('TRANS:' + trans.slice(-14).join(' '));
      teleLog = `t=${t.toFixed(1)} ${runner.label} tele=${tele}: ${names.join(',')}`;
    }
    maxTele = Math.max(maxTele, tele);
    maxHostile = Math.max(maxHostile, world.hostileCount());
    t += dt;
  }
  // Leaked hitboxes: active shootables whose owner is removed.
  let leaked = 0;
  for (const s of world.shootables.active()) {
    const tag = s.userData.shot as ShotTag;
    if ((tag.owner as { removed?: boolean }).removed) leaked++;
  }
  const res = {
    cleared,
    time: +t.toFixed(1),
    kills: world.score.kills,
    shots: world.score.shots,
    dmg: world.player.damageTaken,
    civShot,
    rescues,
    bossTime: bossEnd > 0 ? +(bossEnd - bossStart).toFixed(1) : -1,
    phaseTimes,
    maxTele,
    maxHostile,
    leaked,
    errors,
    score: world.score.score,
  };
  const states = [...bossStates.entries()].map(([k, v]) => `${k}:${v.toFixed(1)}s/${attackCounts.get(k)}`).join(' ');
  world.dispose();
  Kit.disposeAll();
  return { res, beats, hurts, pickups, states, causes: [...causes.entries()].map(([k, v]) => `${v}x ${k}`).join(' | '), teleLog };
}

describe('z1 review', () => {
  it('perfect bot, 3 seeds', { timeout: 600_000 }, () => {
    for (const seed of [99, 5, 2024]) {
      const r = run({ rate: 6, noise: 0, seed });
      console.log('PERFECT seed', seed, JSON.stringify(r.res));
      console.log('TELE', r.teleLog);
      if (seed === 99) {
        console.log(r.beats.join('\n'));
        console.log('HURTS', r.hurts.join(' | '));
        console.log('PICKUPS', r.pickups.join(' | '));
        console.log('BOSS STATES', r.states);
      }
    }
  });
  it('average phone player (3/s, 18px noise)', { timeout: 600_000 }, () => {
    for (const seed of [99, 5, 2024]) {
      const r = run({ rate: 3, noise: 18, seed });
      console.log('AVG seed', seed, JSON.stringify(r.res));
      console.log('CAUSES', r.causes);
      console.log('HURTS', r.hurts.join(' | '));
      if (seed === 99) console.log('BOSS STATES', r.states);
    }
  });
  it('weak player (2/s, 30px noise)', { timeout: 600_000 }, () => {
    for (const seed of [99, 5]) {
      const r = run({ rate: 2, noise: 30, seed });
      console.log('WEAK seed', seed, JSON.stringify(r.res));
      console.log('CAUSES', r.causes);
      console.log('HURTS', r.hurts.join(' | '));
      console.log('BOSS STATES', r.states);
    }
  });
});

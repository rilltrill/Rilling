import * as THREE from 'three';
import { World, type HudApi } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { AutoPlayer } from '../../src/debug/AutoPlayer';
import { DEFAULT_SETTINGS, type ArtStyle } from '../../src/core/types';
import type { StageDef } from '../../src/gameplay/StageTypes';
import { Kit } from '../../src/content/kit/ModelKit';
import { Enemy, ndcInPlayArea } from '../../src/gameplay/Enemy';

export const nullHud: HudApi = {
  popup() {},
  banner() {},
  damage() {},
  splat() {},
  flash() {},
  hitMarker() {},
  shotFired() {},
  prompt() {},
};

export interface SimResult {
  completed: boolean;
  /** Simulated seconds until stage clear (or until giving up). */
  time: number;
  beatReached: number;
  beatLabel: string;
  kills: number;
  shots: number;
  damageTaken: number;
  maxEntities: number;
  bossTime: number;
  /** Crawler pounces whose ring never showed on screen during the coil (must stay empty). */
  unframedPounces: string[];
  errors: string[];
}

/**
 * Headless play-through of a stage: real World + StageRunner + raycast Shooter +
 * AutoPlayer aimbot, god mode, fixed timestep. Proves the stage can be completed
 * (no soft-locks, every enemy reachable on screen, boss killable).
 */
export function simulateStage(stage: StageDef, opts: { maxTime?: number; fps?: number; seed?: number; art?: ArtStyle } = {}): SimResult {
  const maxTime = opts.maxTime ?? 900;
  const dt = 1 / (opts.fps ?? 30);
  const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, opts.seed ?? 99);
  world.viewport = { width: 844, height: 390 };
  world.player.god = true;
  // ART the environment is built in (PIXEL WORLD scenery must not change gameplay).
  if (opts.art) world.art = opts.art;
  const runner = new StageRunner(world, stage);
  const shooter = new Shooter(world);
  const bot = new AutoPlayer(world, shooter, 6);
  const errors: string[] = [];
  let cleared = false;
  world.events.on('stage-clear', () => (cleared = true));
  let t = 0;
  let maxEntities = 0;
  let bossTime = 0;
  // Crawler coil watch: frames of each pounce's coil, and how many had the ring on screen.
  const coil = new Map<Enemy, { frames: number; on: number }>();
  const unframed: string[] = [];
  const _n = new THREE.Vector3();
  try {
    runner.start();
  } catch (e) {
    errors.push(`start: ${(e as Error).stack ?? e}`);
  }
  while (!cleared && t < maxTime && errors.length < 5) {
    try {
      bot.update(dt);
      const sdt = world.update(dt);
      runner.update(sdt);
      // Keep matrices current for raycasts (normally done by render()).
      world.scene.updateMatrixWorld();
      for (const e of world.entities) {
        if (!(e instanceof Enemy)) continue;
        const c = coil.get(e);
        if (e.name === 'crawler' && e.state === 'pounce' && e.telegraph && e.stateTime < 0.8) {
          const r = c ?? { frames: 0, on: 0 };
          coil.set(e, r);
          r.frames++;
          e.telegraph.anchor.getWorldPosition(_n).project(camera);
          if (ndcInPlayArea(_n.x, _n.y, _n.z, 1)) r.on++;
        } else if (c) {
          if (c.frames >= 6 && c.on === 0) unframed.push(`t=${t.toFixed(1)} ${runner.label}`);
          coil.delete(e);
        }
      }
    } catch (e) {
      errors.push(`t=${t.toFixed(1)} ${runner.label}: ${(e as Error).stack ?? e}`);
    }
    if (world.boss) bossTime += dt;
    maxEntities = Math.max(maxEntities, world.entities.length);
    t += dt;
  }
  const res: SimResult = {
    completed: cleared,
    time: t,
    beatReached: runner.index,
    beatLabel: runner.label,
    kills: world.score.kills,
    shots: world.score.shots,
    damageTaken: world.player.damageTaken,
    maxEntities,
    bossTime,
    unframedPounces: unframed,
    errors,
  };
  world.dispose();
  Kit.disposeAll();
  return res;
}

import * as THREE from 'three';
import { World, type HudApi } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Shooter } from '../../src/gameplay/Shooting';
import { AudioSystem } from '../../src/audio/Audio';
import { AutoPlayer } from '../../src/debug/AutoPlayer';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import type { StageDef } from '../../src/gameplay/StageTypes';
import { Kit } from '../../src/content/kit/ModelKit';

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
  errors: string[];
}

/**
 * Headless play-through of a stage: real World + StageRunner + raycast Shooter +
 * AutoPlayer aimbot, god mode, fixed timestep. Proves the stage can be completed
 * (no soft-locks, every enemy reachable on screen, boss killable).
 */
export function simulateStage(stage: StageDef, opts: { maxTime?: number; fps?: number; seed?: number } = {}): SimResult {
  const maxTime = opts.maxTime ?? 900;
  const dt = 1 / (opts.fps ?? 30);
  const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, opts.seed ?? 99);
  world.viewport = { width: 844, height: 390 };
  world.player.god = true;
  const runner = new StageRunner(world, stage);
  const shooter = new Shooter(world);
  const bot = new AutoPlayer(world, shooter, 6);
  const errors: string[] = [];
  let cleared = false;
  world.events.on('stage-clear', () => (cleared = true));
  let t = 0;
  let maxEntities = 0;
  let bossTime = 0;
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
    errors,
  };
  world.dispose();
  Kit.disposeAll();
  return res;
}

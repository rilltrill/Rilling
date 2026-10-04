import type { Enemy, EnemySpawn } from '../gameplay/Enemy';
import type { World } from '../gameplay/World';

export type EnemyFactory = (world: World, spawn: EnemySpawn) => Enemy;

/**
 * Canonical enemy ids. Stage scripts must only use ids that are registered;
 * the unit tests verify every stage against this registry.
 *
 * Zombies (content/enemies/zombies.ts):
 *   walker   – slow shambler, 1 headshot / 3 body shots
 *   runner   – fast sprinter, low hp
 *   crawler  – legless, low to the ground, hard to hit
 *   brute    – big armoured zombie, super-armour, headshots stagger
 *   spitter  – ranged, lobs shootable bile globs
 *   bloater  – explodes when killed (damages nearby zombies), pops if it reaches you
 * Dinosaurs (content/enemies/dinos.ts):
 *   compy    – tiny pack hunter, 1 hp, comes in swarms
 *   raptor   – fast, leaps at the camera
 *   dilo     – frilled spitter, ranged venom
 *   ptero    – flying swooper
 *   trike    – armoured charger (frill = armour, shoot the head/legs)
 *   para     – fleeing herbivore stampede (harmless obstacle-ish; ignore or shoot for nothing)
 * Bosses register their own ids from their stage modules.
 */
export const ZOMBIE_IDS = ['walker', 'runner', 'crawler', 'brute', 'spitter', 'bloater'] as const;
export const DINO_IDS = ['compy', 'raptor', 'dilo', 'ptero', 'trike'] as const;

const REGISTRY = new Map<string, EnemyFactory>();

export function registerEnemy(id: string, factory: EnemyFactory) {
  REGISTRY.set(id, factory);
}

export function hasEnemy(id: string): boolean {
  return REGISTRY.has(id);
}

export function enemyIds(): string[] {
  return [...REGISTRY.keys()];
}

export function createEnemy(id: string, world: World, spawn: EnemySpawn): Enemy {
  const f = REGISTRY.get(id);
  if (!f) throw new Error(`Unknown enemy type "${id}". Registered: ${enemyIds().join(', ')}`);
  return f(world, spawn);
}

import * as THREE from 'three';
import type { PickupKind } from '../core/types';
import type { StageDef } from './StageTypes';
import type { World } from './World';
import { flashMaterials } from './Enemy';
import { Entity } from './Entity';
import { Pickup } from './Pickup';
import { Civilian } from './Civilian';
import { createEnemy, hasEnemy, ZOMBIE_IDS, DINO_IDS } from '../content/registry';

/** What a stage will put on screen: enemy types (first spawn options seen), pickup kinds, civilian variants. */
export interface StageRoster {
  enemies: Map<string, Record<string, unknown>>;
  pickups: Set<PickupKind>;
  civilians: Set<string>;
}

export function stageRoster(stage: StageDef): StageRoster {
  const enemies = new Map<string, Record<string, unknown>>();
  const pickups = new Set<PickupKind>();
  const civilians = new Set<string>();
  const add = (id: string, opts?: Record<string, unknown>) => {
    if (!enemies.has(id)) enemies.set(id, opts ?? {});
  };
  for (const b of stage.beats) {
    if (b.kind === 'boss') add(b.boss, b.opts);
    if ((b.kind === 'move' || b.kind === 'hold' || b.kind === 'boss') && b.waves) {
      for (const wv of b.waves) for (const sp of wv.spawns) add(sp.type, sp.opts);
    }
    for (const p of b.pickups ?? []) pickups.add(p.kind);
    for (const c of b.civilians ?? []) civilians.add(c.variant ?? 'default');
  }
  // Bosses and set pieces spawn some of the campaign's regulars themselves.
  for (const id of stage.campaign === 'zombie' ? ZOMBIE_IDS : DINO_IDS) add(id);
  return { enemies, pickups, civilians };
}

/**
 * Throwaway copies of everything a stage will spawn, for `Engine.precompile`:
 * every enemy type (built detached — configure() + build() only: no AI, no
 * events, no hitboxes left behind), each pickup kind and civilian variant, plus
 * the hit-flash materials. Compiling them behind the stage intro card avoids a
 * shader-compile hitch the first time each one appears (first contact, boss
 * entrance). The world's RNG is restored afterwards, so a seeded stage plays
 * the same with or without warm-up. Call `dispose()` once compiled.
 */
export function buildWarmupSet(world: World, stage: StageDef): { group: THREE.Group; count: number; dispose(): void } {
  const group = new THREE.Group();
  group.name = 'warmup';
  const rngState = world.rng.state;
  // Some builds attach helpers (camera focus targets…) outside their root: undo those.
  const before = new Set<THREE.Object3D>([...world.scene.children, ...world.rig.space.children]);
  const made: Entity[] = [];
  const roster = stageRoster(stage);
  const at = new THREE.Vector3(0, -500, 0);
  for (const [id, opts] of roster.enemies) {
    if (!hasEnemy(id)) continue;
    try {
      const e = createEnemy(id, world, { pos: at.clone(), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts });
      e.buildDetached();
      group.add(e.root);
      made.push(e);
    } catch (err) {
      console.warn(`[warmup] ${id} failed to build`, err);
    }
  }
  for (const kind of roster.pickups) {
    const p = new Pickup(world, kind, at, 'world');
    group.add(p.root);
    made.push(p);
  }
  for (const v of roster.civilians) {
    try {
      const c = new Civilian(world, at.clone(), 'world', v);
      group.add(c.root);
      made.push(c);
    } catch (err) {
      console.warn(`[warmup] civilian ${v} failed to build`, err);
    }
  }
  // Enemies swap to these on every hit.
  const box = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  for (const m of flashMaterials()) group.add(new THREE.Mesh(box, m));
  for (const parent of [world.scene, world.rig.space]) {
    for (let i = parent.children.length - 1; i >= 0; i--) {
      const o = parent.children[i];
      if (!before.has(o)) parent.remove(o);
    }
  }
  world.rng.state = rngState;
  return {
    group,
    count: made.length,
    dispose() {
      group.parent?.remove(group);
      for (const e of made) {
        // Generic teardown only: subclass dispose() hooks undo onAdded() work that never ran.
        if (e instanceof Civilian) e.dispose();
        else Entity.prototype.dispose.call(e);
        world.shootables.removeOwner(e);
      }
      group.clear();
      box.dispose();
    },
  };
}

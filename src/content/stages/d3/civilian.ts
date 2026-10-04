import * as THREE from 'three';
import { Civilian } from '../../../gameplay/Civilian';
import type { World } from '../../../gameplay/World';

/**
 * A civilian standing on something raised (the stuck utility truck's flatbed):
 * well above the ground-level dinos on screen, so shots at a raptor prowling
 * below never pass through them. When rescued they hop down (a short fall to
 * the ground) before running off, instead of sprinting through thin air.
 *
 * Spawned by the beat script (`perch()`); the StageRunner snaps its own
 * `civilians` to the ground, so these are added and rescued by hand.
 */
export class PerchedCivilian extends Civilian {
  private vy = 0;

  constructor(world: World, pos: THREE.Vector3, variant: string) {
    super(world, pos, 'world', variant);
  }

  override update(dt: number): void {
    super.update(dt);
    if ((!this.rescued && !this.shot) || this.removed) return;
    const p = this.root.position;
    const g = this.world.groundAt(p.x, p.z);
    if (p.y > g) {
      this.vy -= 18 * dt;
      p.y = Math.max(g, p.y + this.vy * dt);
    }
  }
}

/** Add a perched civilian at a world position (feet). */
export function perch(world: World, pos: THREE.Vector3, variant: string): PerchedCivilian {
  return world.add(new PerchedCivilian(world, pos.clone(), variant));
}

import * as THREE from 'three';
import type { Frame } from '../core/types';
import { Entity, type ShotHit, type ShotOutcome } from './Entity';
import type { World } from './World';
import { Kit } from '../content/kit/ModelKit';
import type { SfxName } from '../audio/names';

export interface DestructibleOptions {
  /** Visual (already built). Every mesh inside becomes a hitbox. */
  model: THREE.Object3D;
  /** World (or rig-space) position. */
  pos: THREE.Vector3;
  frame?: Frame;
  hp?: number;
  points?: number;
  /** Explodes when destroyed, damaging enemies in `radius` metres. */
  explode?: { radius: number; damage: number };
  /** FX colour for debris when not exploding. */
  debrisColor?: number;
  sfx?: SfxName;
  onDestroy?(world: World): void;
}

/**
 * Shootable scenery: explosive barrels, gas tanks, crates, windows, fences.
 * Explosions chain into other destructibles and hurt enemies (never the player).
 */
export class Destructible extends Entity {
  hp: number;
  private o: DestructibleOptions;

  constructor(world: World, o: DestructibleOptions) {
    super(world);
    this.o = o;
    this.hp = o.hp ?? 1;
    this.frame = o.frame ?? 'world';
    this.root.position.copy(o.pos);
    this.root.add(o.model);
  }

  override onAdded(): void {
    this.root.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) this.hitbox(m, 'body');
    });
  }

  update(dt: number): void {
    this.age += dt;
  }

  override onShot(hit: ShotHit): ShotOutcome {
    this.hp -= hit.damage;
    if (this.hp > 0) {
      this.world.fx.sparks(hit.point, hit.normal, 4);
      this.world.audio.play('hit_world', { volume: 0.5 });
      return { kind: 'prop', counts: true };
    }
    this.destroy();
    return { kind: 'prop', counts: true, killed: true };
  }

  destroy() {
    if (this.removed) return;
    this.removed = true;
    const p = this.worldPos();
    p.y += 0.5;
    if (this.o.points) {
      const pts = this.world.score.add(this.o.points);
      const sp = p.clone().project(this.world.camera);
      this.world.hud.popup(`+${pts}`, (sp.x * 0.5 + 0.5) * this.world.viewport.width, (-sp.y * 0.5 + 0.5) * this.world.viewport.height, 'points');
    }
    if (this.o.explode) {
      this.world.explode(p, this.o.explode.radius, this.o.explode.damage);
    } else {
      this.world.fx.debris(p, this.o.debrisColor ?? 0x6b5a48);
      this.world.audio.play(this.o.sfx ?? 'crash', { volume: 0.7 });
    }
    this.o.onDestroy?.(this.world);
  }
}

/** Classic red explosive barrel. */
export function explosiveBarrel(world: World, pos: THREE.Vector3, frame: Frame = 'world'): Destructible {
  const g = new THREE.Group();
  Kit.add(g, Kit.cyl(0.32, 0.32, 0.9, 10), Kit.mat(0xb3261e), 0, 0.45, 0);
  Kit.add(g, Kit.cyl(0.33, 0.33, 0.06, 10), Kit.mat(0x5a120e), 0, 0.2, 0);
  Kit.add(g, Kit.cyl(0.33, 0.33, 0.06, 10), Kit.mat(0x5a120e), 0, 0.7, 0);
  Kit.add(g, Kit.box(0.3, 0.22, 0.02), Kit.glow(0xffd23a, 1), 0, 0.48, 0.33);
  return new Destructible(world, { model: g, pos, frame, hp: 1, points: 150, explode: { radius: 5, damage: 8 } });
}

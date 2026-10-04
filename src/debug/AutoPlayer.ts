import * as THREE from 'three';
import type { World } from '../gameplay/World';
import type { Shooter } from '../gameplay/Shooting';
import { Enemy } from '../gameplay/Enemy';
import { Projectile } from '../gameplay/Projectile';
import { Pickup } from '../gameplay/Pickup';
import type { ShotTag } from '../gameplay/Shootables';

const _v = new THREE.Vector3();

/**
 * Debug "aimbot" used by ?autoplay=1 and the end-to-end tests to prove every
 * stage can be completed. Prioritises: incoming attacks → projectiles → boss
 * weak points → nearest enemy → pickups. Never shoots civilians.
 */
export class AutoPlayer {
  private cooldown = 0;
  shots = 0;

  constructor(private world: World, private shooter: Shooter, private rate = 7) {}

  update(dt: number) {
    const w = this.world;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (w.weapons.empty && w.weapons.reloading <= 0) {
      this.shooter.reload();
      return;
    }
    const target = this.pickTarget();
    if (!target) return;
    const p = this.screen(target);
    if (!p) return;
    this.cooldown = 1 / this.rate;
    this.shots++;
    this.shooter.fire(p.x, p.y, false);
  }

  private screen(obj: THREE.Object3D): { x: number; y: number } | null {
    const w = this.world;
    obj.getWorldPosition(_v);
    // Aim at the visual centre of meshes rather than their pivot.
    const m = obj as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      _v.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld);
    }
    _v.project(w.camera);
    if (_v.z > 1 || Math.abs(_v.x) > 0.98 || Math.abs(_v.y) > 0.98) return null;
    return { x: (_v.x * 0.5 + 0.5) * w.viewport.width, y: (-_v.y * 0.5 + 0.5) * w.viewport.height };
  }

  private visible(obj: THREE.Object3D) {
    return this.screen(obj) !== null;
  }

  /** Hitbox meshes of an entity, optionally filtered by part. */
  private parts(owner: unknown, part?: string): THREE.Object3D[] {
    return this.world.shootables.active().filter((o) => {
      const t = o.userData.shot as ShotTag;
      return t.owner === owner && (!part || t.part === part);
    });
  }

  private pickTarget(): THREE.Object3D | null {
    const w = this.world;
    const ents = w.entities.filter((e) => !e.removed);
    // 1. Things about to hurt us (most urgent first).
    const threats = ents
      .filter((e) => e.telegraph && (e instanceof Enemy || e instanceof Projectile))
      .sort((a, b) => b.telegraph!.progress - a.telegraph!.progress);
    for (const t of threats) {
      const obj = this.bestPart(t);
      if (obj) return obj;
    }
    // 2. Boss weak points.
    if (w.boss && !w.boss.removed && w.boss.state !== 'dying') {
      const weak = this.parts(w.boss, 'weak').filter((o) => this.visible(o));
      if (weak.length) return weak[0];
    }
    // 3. Nearest enemy.
    const enemies = ents
      .filter((e): e is Enemy => e instanceof Enemy && e.state !== 'dying' && e.hostile)
      .sort((a, b) => a.distToPlayer - b.distToPlayer);
    for (const e of enemies) {
      const obj = this.bestPart(e);
      if (obj) return obj;
    }
    // 4. Pickups.
    for (const e of ents) {
      if (e instanceof Pickup) {
        const parts = this.parts(e).filter((o) => this.visible(o));
        if (parts.length) return parts[0];
      }
    }
    return null;
  }

  private bestPart(e: unknown): THREE.Object3D | null {
    for (const part of ['weak', 'head', 'torso', 'body', 'limb', 'tail']) {
      const list = this.parts(e, part).filter((o) => this.visible(o));
      if (list.length) return list[0];
    }
    return null;
  }
}

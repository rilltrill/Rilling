import * as THREE from 'three';
import type { Frame } from '../core/types';
import { Entity, type ShotHit, type ShotOutcome } from './Entity';
import type { World } from './World';
import { buildHumanoid, type HumanoidRig } from '../content/kit/humanoid';

const VARIANTS: Record<string, { shirt: number; pants: number; skin: number; hair: number }> = {
  default: { shirt: 0x3f7fbf, pants: 0x2b2f3a, skin: 0xe0b48f, hair: 0x3b2a1a },
  scientist: { shirt: 0xf0f0f0, pants: 0x3a3f4a, skin: 0xd9a77f, hair: 0x222222 },
  ranger: { shirt: 0x8a7a4a, pants: 0x5a4a2a, skin: 0xc68e5e, hair: 0x4a3216 },
  cop: { shirt: 0x24345a, pants: 0x1a2236, skin: 0xb98060, hair: 0x111111 },
  nurse: { shirt: 0x8fd1c6, pants: 0x8fd1c6, skin: 0xf0c8a0, hair: 0x6b3a1a },
  worker: { shirt: 0xe07a1f, pants: 0x34404f, skin: 0xa8714e, hair: 0x1a1a1a },
};

/**
 * Innocent bystander. Don't shoot! Shooting one costs a life and points.
 * If they survive until the encounter is cleared, they're rescued for a bonus.
 */
export class Civilian extends Entity {
  private rig: HumanoidRig;
  rescued = false;
  shot = false;
  private runDir = 1;

  constructor(world: World, pos: THREE.Vector3, frame: Frame, variant = 'default') {
    super(world);
    this.frame = frame;
    this.root.position.copy(pos);
    const v = VARIANTS[variant] ?? VARIANTS.default;
    this.rig = buildHumanoid({ skin: v.skin, shirt: v.shirt, pants: v.pants, hair: v.hair, height: 1.72 });
    this.root.add(this.rig.root);
    this.runDir = world.rng.chance(0.5) ? 1 : -1;
  }

  override onAdded(): void {
    for (const m of this.rig.meshes.head) this.hitbox(m, 'head');
    for (const m of this.rig.meshes.torso) this.hitbox(m, 'torso');
    for (const m of this.rig.meshes.limbs) this.hitbox(m, 'limb');
    // Face the player.
    const p = this.frame === 'rig' ? new THREE.Vector3() : this.world.rig.space.position;
    this.root.rotation.y = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z);
    this.world.audio.play('civilian_scream', { volume: 0.6, vary: 0.2 });
  }

  /** Called by the stage runner when the encounter is cleared. */
  rescue() {
    if (this.shot || this.rescued) return;
    this.rescued = true;
    this.world.shootables.removeOwner(this);
    this.world.onCivilianRescued(this);
    this.age = 0;
  }

  update(dt: number): void {
    this.age += dt;
    const r = this.rig;
    if (this.shot) {
      const k = Math.min(1, this.age / 0.6);
      r.root.rotation.x = -k * 1.4;
      if (this.age > 2) this.removed = true;
      return;
    }
    if (this.rescued) {
      // Thumbs-up then run off to the side.
      this.root.rotation.y += (this.runDir * Math.PI / 2 - this.root.rotation.y) * Math.min(1, dt * 4);
      const s = Math.min(1, this.age) * 5;
      this.root.translateZ(s * dt);
      const ph = this.age * 12;
      r.legL.hip.rotation.x = Math.sin(ph) * 0.9;
      r.legR.hip.rotation.x = -Math.sin(ph) * 0.9;
      r.armL.shoulder.rotation.x = -Math.sin(ph) * 0.8;
      r.armR.shoulder.rotation.x = Math.sin(ph) * 0.8;
      if (this.age > 3) this.removed = true;
      return;
    }
    // Panicked waving.
    const t = this.age * 7;
    r.armL.shoulder.rotation.z = 2.6 + Math.sin(t) * 0.35;
    r.armR.shoulder.rotation.z = -2.6 - Math.sin(t + 1) * 0.35;
    r.chest.rotation.y = Math.sin(t * 0.5) * 0.15;
    r.head.rotation.y = Math.sin(t * 0.3) * 0.4;
  }

  override onShot(hit: ShotHit): ShotOutcome {
    if (this.shot || this.rescued) return { kind: 'civilian', counts: false };
    this.shot = true;
    this.age = 0;
    this.world.shootables.removeOwner(this);
    this.world.fx.blood(hit.point, hit.dir, { color: 0x9a0a0a, amount: 1 });
    this.world.onCivilianShot(this, hit);
    return { kind: 'civilian', counts: false };
  }
}

import * as THREE from 'three';
import { Enemy, type EnemySpawn } from './Enemy';
import type { ShotHit } from './Entity';
import type { World } from './World';
import { Projectile, type ProjectileOptions } from './Projectile';

/**
 * Base for bosses. Bosses show a health bar, ignore attack slots, usually have
 * `superArmor`, and take damage mostly through `weak` hit-zones (glowing spots).
 * Parts registered as 'armor' spark and deal no damage.
 *
 * Subclasses typically override `customUpdate` with their own attack pattern
 * (set `this.state` to custom strings like 'charge', 'roar', 'spit'), and use
 * the helpers below: `telegraphAttack`, `throwProjectile`, `phaseFor`.
 */
export abstract class Boss extends Enemy {
  override isBoss = true;
  override superArmor = true;
  override usesAttackSlot = false;
  /** Display name on the health bar, e.g. "THE BUTCHER". */
  title = 'BOSS';
  /** Health fractions at which the boss changes phase, descending (e.g. [0.66, 0.33]). */
  phases: number[] = [0.66, 0.33];
  phase = 0;
  /** Seconds of slow-motion + explosions when defeated. */
  deathDuration = 3.2;

  constructor(world: World, spawn: EnemySpawn) {
    super(world, spawn);
  }

  override onAdded(): void {
    super.onAdded();
    this.world.events.emit('boss-start', { boss: this });
  }

  /** Current phase index for a given hp fraction. */
  phaseFor(frac = this.hp / this.maxHp): number {
    let p = 0;
    for (const t of this.phases) if (frac <= t) p++;
    return p;
  }

  /** Called when the boss crosses a phase threshold. */
  protected onPhase(_phase: number): void {}

  protected override onDamaged(hit: ShotHit, amount: number): void {
    super.onDamaged(hit, amount);
    const p = this.phaseFor();
    if (p > this.phase) {
      this.phase = p;
      this.world.rig.shake(0.35);
      this.onPhase(p);
    }
  }

  /** Spawn a shootable projectile aimed at the player. */
  throwProjectile(from: THREE.Vector3, opts: Partial<ProjectileOptions> = {}): Projectile {
    const p = new Projectile(this.world, { from, ...opts });
    this.world.add(p);
    return p;
  }

  /**
   * Generic telegraphed attack: shows the ring for `duration` seconds then calls
   * `onLand` unless interrupted (state changed). Call from customUpdate:
   *   if (this.telegraphAttack(dt, 1.8, () => this.world.hurtPlayer(1, this.title))) this.setState('idle')
   * Returns true on the frame the attack resolves.
   */
  protected telegraphAttack(duration: number, onLand: () => void, anchor: THREE.Object3D = this.anchor): boolean {
    if (!this.telegraph) this.telegraph = { progress: 0, anchor, radius: this.telegraphRadius };
    this.telegraph.progress = Math.min(1, this.stateTime / duration);
    if (this.stateTime >= duration) {
      this.telegraph = null;
      onLand();
      return true;
    }
    return false;
  }

  /** Bosses explode dramatically. */
  protected override updateDeath(dt: number): boolean {
    const t = this.stateTime;
    if (Math.floor((t - dt) * 6) !== Math.floor(t * 6) && t < this.deathDuration - 0.8) {
      const p = this.anchor.getWorldPosition(new THREE.Vector3());
      p.x += this.world.rng.spread(1.5);
      p.y += this.world.rng.spread(1.2);
      p.z += this.world.rng.spread(1.5);
      this.world.fx.explosion(p, 0.7 + this.world.rng.next() * 0.6);
      this.world.audio.play('explosion', { volume: 0.7, vary: 0.2 });
      this.world.rig.shake(0.25);
    }
    const k = Math.min(1, t / this.deathDuration);
    this.model.rotation.z = Math.sin(t * 20) * 0.05 * (1 - k);
    if (t > this.deathDuration * 0.6) this.model.position.y -= dt * 1.2;
    return t > this.deathDuration;
  }

  override die(hit: ShotHit | null): void {
    if (this.state === 'dying') return;
    super.die(hit);
    this.world.slowMo(0.35, 1.4);
    this.world.events.emit('boss-dead', { boss: this });
  }
}

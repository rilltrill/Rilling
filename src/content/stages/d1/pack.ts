import * as THREE from 'three';
import type { ShotHit, ShotOutcome } from '../../../gameplay/Entity';
import { Raptor } from '../../enemies/dinos';
import { registerEnemy } from '../../registry';

/**
 * JUNGLE RUN pack tuning (d1 only). Interrupt damage = a hit's damage after part
 * multipliers: a mounted-gun body hit is 0.8, a head hit 2.0.
 */
export const PACK_TUNE = {
  /**
   * Interrupt damage that breaks an AMBUSH pounce (its red ring): three body hits
   * or two head hits — a short burst on target (~0.3 s of mounted-gun fire)
   * instead of the stock raptor's first round. A stock pounce still breaks at the
   * first round.
   */
  guard: 2.4,
  /**
   * Interrupt damage that breaks a pounce the Horned Devil called (alongside its own
   * windup): four body hits or two head hits (~0.35 s of fire) — two rings, two
   * targets. With two raptors called, breaking the boss first (≈ 1.0 s) and then
   * both raptors on the chest still beats their 1.68 s rings with perfect aim.
   */
  rallyGuard: 3.2,
  /** Seconds after landing from the entry leap in which an ambusher may spring straight into its pounce… */
  ambushWindow: 2.5,
  /** …from up to this far beyond its striking range (a longer leap). */
  ambushReach: 2.5,
  /** A raptor answers the boss's call only if its own attack cooldown is about done. */
  rallyCooldown: 1.2,
  /**
   * PACK HUNTERS (the raptors the Horned Devil calls, `opts.pack`): they prowl in
   * view and hold their pounce for the boss's call — for up to this many seconds,
   * then they strike on their own (a stock pounce, first round breaks it).
   */
  patience: 6,
  /**
   * Arcade mercy: on the last two hearts every pounce breaks at the first round
   * again (no guard), so one bad patch never snowballs into a continue.
   */
  mercyHp: 2,
};

const _p = new THREE.Vector3();

/**
 * JUNGLE RUN raptor ('jungle_raptor'): the stock raptor (same look, same 1.1 s
 * crouch + leap, same attack-slot / framing rules) with two pack tricks:
 *
 *  AMBUSH (`opts.ambush`): it leaps out of the ferns and goes straight into its
 *  pounce as it lands (or as soon as it's in reach, within `ambushWindow`) —
 *  a pair's rings come up together instead of one at a time.
 *
 *  RALLY: the Horned Devil's windup roar calls raptors that could strike right
 *  now into a pounce alongside it (boss phase 2+): two rings, two targets.
 *
 * An ambush / rallied pounce takes a short burst to break (`guard` /
 * `rallyGuard`) instead of the first round, and vents an overheated mounted gun
 * when it starts. Every pounce only starts when the stock attack rules allow it
 * this frame (in the playable view, clear of the HUD panels and civilians, at
 * range, a free attack slot), so every ring is readable and shootable from its
 * first frame; the leap in is a fair warning too (shots land and kill while it's
 * in the air).
 */
export class JungleRaptor extends Raptor {
  /** Interrupt damage taken during the current attack. */
  private meter = 0;
  /** Guard of the current pounce (an ambush or a pounce the boss called), 0 = a stock pounce. */
  private guarded = 0;
  /** Seconds left to spring an ambush pounce straight out of the entry leap. */
  private ambushT = 0;
  /** True while a shot is being resolved (stagger() from bombs / continues always applies). */
  private resolvingShot = false;
  /** Pack hunter: seconds spent waiting for the boss's call since its last attack. */
  private waitT = 0;

  private attacking(): boolean {
    return this.state === 'windup' || this.state === 'pounce';
  }

  protected override onWindup() {
    super.onWindup();
    this.meter = 0;
    this.waitT = 0;
  }

  /** A pack hunter while its boss is still fighting (see PACK_TUNE.patience). */
  private huntsWithPack(): boolean {
    const b = this.world.boss;
    return !!this.spawn.opts.pack && !!b && !b.removed && b.state !== 'dying';
  }

  override setState(s: string) {
    const fromEntry = this.state === 'entry';
    if (s !== 'windup' && s !== 'pounce') this.guarded = 0;
    super.setState(s);
    if (fromEntry && s === 'advance' && this.spawn.opts.ambush) this.ambushT = PACK_TUNE.ambushWindow;
  }

  protected override advanceUpdate(dt: number) {
    if (this.ambushT > 0) {
      this.ambushT -= dt;
      if (this.strikeNow(PACK_TUNE.ambushReach, PACK_TUNE.guard)) {
        this.ambushT = 0;
        return;
      }
    }
    // Pack hunter: prowl (a free target meanwhile) and keep the pounce for the boss's call.
    if (this.huntsWithPack()) {
      this.waitT += dt;
      if (this.waitT < PACK_TUNE.patience) this.cooldown = Math.max(this.cooldown, 0.25);
    }
    super.advanceUpdate(dt);
  }

  /**
   * Join the boss's attack now — only if the stock attack could start this frame
   * (framed in the playable view, at range, not just knocked out of one, a free
   * attack slot). Returns true when it crouched.
   */
  rally(): boolean {
    if (this.removed || !this.hostile || this.state !== 'advance' || this.cooldown > PACK_TUNE.rallyCooldown) return false;
    return this.strikeNow(0.6, PACK_TUNE.rallyGuard);
  }

  /**
   * Start the pounce this frame if the stock attack rules allow it (framed in the
   * playable view, clear of HUD panels and civilians, between the minimum strike
   * distance and `range + reach`, a free attack slot).
   */
  private strikeNow(reach: number, guard: number): boolean {
    this.playerPos(_p);
    const pos = this.root.position;
    const dist = Math.hypot(pos.x - _p.x, pos.z - _p.z);
    if (dist > this.range + reach || dist < this.range * this.minStrikeFrac) return false;
    if (this.framing() !== 0 || !this.staysFramed(this.sx, this.windup, 0.85) || !this.framedAhead(this.windup)) return false;
    if (!this.takeSlot()) return false;
    this.cooldown = 0;
    this.setState('windup');
    this.guarded = guard;
    this.ventGun();
    return true;
  }

  /**
   * Fairness with the heat-limited mounted gun (as for the boss's rings): a pack
   * pounce never starts with the gun locked out or about to be, so an overheat
   * can't eat its ring — from the vent level the gun fires through several rings.
   */
  private ventGun() {
    const w = this.world;
    if (w.weapons.active !== 'turret') return;
    const locked = w.weapons.overheated;
    if (w.weapons.vent()) {
      w.audio.play('reload_done', { volume: 0.45, pitch: 0.8 });
      if (locked) w.hud.prompt(null);
    }
  }

  override onShot(hit: ShotHit): ShotOutcome {
    this.resolvingShot = true;
    try {
      return super.onShot(hit);
    } finally {
      this.resolvingShot = false;
    }
  }

  protected override onDamaged(hit: ShotHit, amount: number): void {
    super.onDamaged(hit, amount);
    if (this.attacking()) this.meter += amount;
  }

  override stagger() {
    if (this.resolvingShot && this.state !== 'dying') {
      const mercy = this.world.player.hp <= PACK_TUNE.mercyHp;
      // A guarded pounce keeps coming (it still flinches and bleeds) until the burst breaks it.
      if (this.guarded > 0 && this.attacking() && !mercy && this.meter < this.guarded) return;
      this.meter = 0;
    }
    super.stagger();
  }
}

registerEnemy('jungle_raptor', (w, s) => new JungleRaptor(w, s));

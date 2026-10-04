import type { ShotHit, ShotOutcome } from '../../../gameplay/Entity';
import type { World } from '../../../gameplay/World';
import type { EnemySpawn } from '../../../gameplay/Enemy';
import type { Palette, TheroSpec } from '../../enemies/dinoKit';
import { Raptor } from '../../enemies/dinos';
import { registerEnemy } from '../../registry';

/**
 * Hybrid tuning (d2 only). "Interrupt damage" = a hit's damage after part
 * multipliers: a pistol body hit is 1, a pistol HEADSHOT 2.5, a limb 0.7.
 */
export const HYBRID_TUNE = {
  /** Base hp (a stock raptor has 3, the red one 4): two headshots and a body hit with the pistol. */
  hp: 6,
  /**
   * Interrupt damage that breaks its crouch + pounce: ONE pistol headshot, or
   * three body hits (a stock raptor drops out of its attack at the first round).
   * Its ring is up for 1.2 s + 0.58 s leap ≈ 1.8 s: after a 0.4 s reaction a
   * ~3 taps/s player still gets four taps at it.
   */
  guard: 2.5,
  /** Wind-up (s) — a touch longer than a stock raptor's 1.1 s, so the extra hits fit. */
  windup: 1.2,
  /** A single hit this big (magnum) knocks it back at any time. */
  heavy: 3,
  /**
   * Arcade mercy: with the player on this many hearts or fewer, any hit breaks
   * its pounce again (a bad patch never snowballs into a death).
   */
  mercyHp: 1,
};

/**
 * Albino hide with slate-blue bands, blue quills and Specimen X's ice-blue eyes:
 * the lab's juvenile hybrids read as kin of the boss, and as "not a normal raptor".
 */
const HYBRID_PAL: Palette = {
  key: 'hybrid',
  base: 0xc4bcae,
  back: 0x857b6e,
  belly: 0xece6da,
  stripe: 0x3e5872,
  accent: 0x3a9ac8,
  accent2: 0x24506e,
  claw: 0x1c1c20,
  teeth: 0xf4f0e4,
  mouth: 0x6a1a2a,
  eye: 0x70ecff,
};

/** Worlds that have already shown the hybrid hint (once per stage run). */
const hinted = new WeakSet<World>();

/**
 * JUVENILE HYBRID ('raptor_hybrid') — one of Specimen X's brood, loose in the labs.
 * The big (red-alpha) raptor frame with an armoured hide:
 *   - closing in it shrugs off body hits (they still flash, flinch and bloody it);
 *     a HEADSHOT, or one heavy hit, knocks it back;
 *   - its crouch + pounce (the stock raptor ring, a 1.2 s wind-up) breaks after
 *     `HYBRID_TUNE.guard` interrupt damage — one headshot or three body hits —
 *     instead of the first round;
 *   - only one hybrid pounces at a time, and every pounce starts under the stock
 *     attack rules (framed in the play area, clear of the HUD panels and civilians,
 *     at range, a free attack slot), so the ring is readable and shootable from
 *     its first frame. Shots land while it's in the air.
 */
export class HybridRaptor extends Raptor {
  /** Interrupt damage taken during the current attack. */
  private meter = 0;
  /** True while a shot is being resolved (stagger() calls from elsewhere — bombs, revive — always apply). */
  private resolvingShot = false;
  private lastHit_: { amount: number; head: boolean } = { amount: 0, head: false };

  constructor(world: World, spawn: EnemySpawn) {
    super(world, { ...spawn, opts: { ...spawn.opts, variant: 'red' } });
  }

  protected override configure() {
    super.configure();
    this.name = 'hybrid';
    this.maxHp = HYBRID_TUNE.hp;
    this.windup = HYBRID_TUNE.windup;
    this.points = 450;
  }

  protected override makeSpec(): TheroSpec {
    return { ...super.makeSpec(), key: 'raptor', pal: HYBRID_PAL };
  }

  override onAdded(): void {
    super.onAdded();
    if (!hinted.has(this.world)) {
      hinted.add(this.world);
      this.world.hud.prompt('HYBRID! AIM FOR THE HEAD!');
    }
  }

  private attacking(): boolean {
    return this.state === 'windup' || this.state === 'pounce';
  }

  private mercy(): boolean {
    return this.world.player.hp <= HYBRID_TUNE.mercyHp;
  }

  /** Another hybrid is already crouched or in the air. */
  private packBusy(): boolean {
    for (const e of this.world.enemies()) {
      if (e !== this && e instanceof HybridRaptor && !e.removed && e.attacking()) return true;
    }
    return false;
  }

  protected override takeSlot(): boolean {
    // One hybrid pounce at a time: two guarded rings never close together.
    if (!this.holdsSlot && this.packBusy()) return false;
    return super.takeSlot();
  }

  protected override onWindup() {
    super.onWindup();
    this.meter = 0;
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
    this.lastHit_ = { amount, head: hit.part === 'head' };
    if (this.attacking()) this.meter += amount;
  }

  override stagger() {
    if (this.resolvingShot && this.state !== 'dying') {
      const { amount, head } = this.lastHit_;
      const heavy = amount >= HYBRID_TUNE.heavy;
      if (this.attacking()) {
        // Enough on target breaks the attack; until then the ring keeps closing.
        if (!heavy && !this.mercy() && this.meter < HYBRID_TUNE.guard) return;
      } else if (!heavy && !head) {
        // Closing in / recovering: body hits only make it flinch.
        return;
      }
      this.meter = 0;
    }
    super.stagger();
  }
}

registerEnemy('raptor_hybrid', (w, s) => new HybridRaptor(w, s));

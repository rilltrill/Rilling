import type { ShotHit, ShotOutcome } from '../../../gameplay/Entity';
import { Brute, BRUTE_HEAD_STAGGER_COOLDOWN } from '../../enemies/zombies';
import { registerEnemy } from '../../registry';

/** Recover after a smash (stock brute) / after a smash that LANDED (the player gets a breather). */
const RECOVER = 1.5;
const LANDED_RECOVER = 2.6;

/**
 * The boiler-room brute (z2 only): the stock brute, but its smash costs two
 * hearts (a ≥ 1 s windup — 2 s — for a big hit), and NO hit — headshot or
 * heavy shotgun/magnum blast — staggers it again within the stock headshot
 * cooldown. A stock brute is stun-locked by a shotgun (every blast ≥ its
 * heavy-hit threshold knocks it out of the windup), so the set piece never
 * swung once. Still fair: a stagger lasts 0.85 s and the cooldown 1.6 s, so
 * a fresh 2 s windup is always breakable for its last ~1.2 s by a headshot or
 * a heavy blast — the ring is the cue to aim high or close in with the shotgun.
 */
export class HospitalBrute extends Brute {
  protected override configure() {
    super.configure();
    // Its two-fisted smash costs TWO hearts (the 2 s windup ring is the warning).
    this.damage = 2;
  }

  protected override strike() {
    // (Never two at once off a player's last two hearts: a bad stretch can't end in one blow.)
    this.damage = this.world.player.hp > 2 ? 2 : 1;
    const hp = this.world.player.hp;
    super.strike();
    // A smash that lands leaves it heaving for longer before it can swing again.
    this.recoverTime = this.world.player.hp < hp ? LANDED_RECOVER : RECOVER;
  }

  /** Age at the last shot-driven stagger. */
  private shotStaggerAt = -99;
  /** Inside onShot (staggers from other sources — a continue, a bomb — are never gated). */
  private inShot = false;

  override onShot(hit: ShotHit): ShotOutcome {
    this.inShot = true;
    try {
      return super.onShot(hit);
    } finally {
      this.inShot = false;
    }
  }

  override stagger() {
    if (this.inShot && this.age - this.shotStaggerAt < BRUTE_HEAD_STAGGER_COOLDOWN) return;
    const was = this.state;
    super.stagger();
    if (this.inShot && this.state === 'stagger' && was !== 'stagger') this.shotStaggerAt = this.age;
  }
}

registerEnemy('brute_z2', (w, s) => new HospitalBrute(w, s));

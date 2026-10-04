import * as THREE from 'three';
import type { ShotHit, ShotOutcome } from '../../../gameplay/Entity';
import type { World } from '../../../gameplay/World';
import type { EnemySpawn } from '../../../gameplay/Enemy';
import { Raptor } from '../../enemies/dinos';
import { registerEnemy } from '../../registry';

/**
 * Pack tuning (d3 only). Interrupt damage = a hit's damage after part
 * multipliers: a mounted-gun body hit is 0.8, a head hit 2.0.
 */
export const ALPHA_TUNE = {
  /** Alpha base hp before the spawn's hp multiplier (a stock red raptor has 4). */
  hp: 12,
  /**
   * Interrupt damage that breaks the alpha's crouch + pounce (its red ring):
   * ten body hits or four head hits (~0.7 s of mounted-gun fire on target),
   * where a stock raptor drops out of its attack at the first round.
   */
  guard: 8,
  /** A single hit this big (magnum, point-blank shotgun) staggers the alpha even while it's closing in. */
  heavy: 3,
  /** Interrupt damage that breaks a pack-mate's rallied / ambush pounce: five body hits or two head hits. */
  rallyGuard: 4,
  /** A pack-mate joins the alpha's pounce only if its own attack cooldown is about done. */
  rallyCooldown: 0.5,
  /** Ambush ('opts.ambush'): seconds after landing from the entry leap in which it may spring straight into its pounce… */
  ambushWindow: 2.5,
  /** …from up to this far beyond its striking range (a longer leap). */
  ambushReach: 2.5,
  /**
   * Arcade mercy: with the player on this many hearts or fewer, the alpha hunts
   * alone (no pack call), its guard is halved and pack-mates drop out of a
   * pounce at the first round again — a bad patch never snowballs into a death.
   */
  mercyHp: 2,
};

const _p = new THREE.Vector3();

/** World time each world showed the alpha hint (once per stage run). */
const hintedAlpha = new WeakMap<World, number>();
/** Worlds that have already shown the pack hint. */
const hintedPack = new WeakSet<World>();
/** Seconds a HUD prompt stays up — the pack hint never cuts the alpha hint short. */
const PROMPT_TIME = 1.6;

/**
 * The finale's raptor pack (d3 only): an ALPHA and its PACK-MATES.
 *
 * ALPHA ('raptor_alpha') — the stock red raptor look (bigger, quilled) with a
 * pack leader's nerve:
 *   - closing in it shrugs off rounds — every hit still flashes, flinches and
 *     bloodies it, it just keeps coming (a single heavy hit still knocks it
 *     back) — so it can't be pinned in place by a hosed stream of fire;
 *   - its crouch + pounce (the stock red ring, same 1.1 s + leap) breaks only
 *     after `ALPHA_TUNE.guard` interrupt damage instead of the first round;
 *   - when it screeches into its crouch, the pack-mates at striking range join
 *     in: a PACK POUNCE — two or three rings closing together.
 *
 * PACK-MATE ('raptor_pack') — a stock raptor that answers the alpha's call; a
 * pack pounce takes a short burst to break (`rallyGuard`) instead of one round.
 *
 * AMBUSH (`opts.ambush`, either kind): it leaps out of cover and goes straight
 * into its pounce as it lands (or as soon as it's in reach, within
 * `ambushWindow`) — the pack's rings come up together.
 *
 * Every pounce — called, ambush or stock — only starts when the stock attack
 * rules allow it this frame (in the playable view, clear of the HUD panels and
 * civilians, at range, a free attack slot), so every ring is readable and
 * shootable from its first frame. The leap in is a fair warning too: shots
 * land (and kill) while it's in the air. Kill the pack-mates early and the
 * alpha hunts alone.
 */
export class PackRaptor extends Raptor {
  private readonly alpha: boolean;
  /** Interrupt damage taken during the current attack. */
  private meter = 0;
  /** This pounce was called by the alpha (or sprung from an ambush). */
  private rallied = false;
  /** Seconds left to spring an ambush pounce straight out of the entry leap. */
  private ambushT = 0;
  /** True while a shot is being resolved (stagger() calls from elsewhere — bombs, revive — always apply). */
  private resolvingShot = false;
  private lastAmount = 0;

  constructor(world: World, spawn: EnemySpawn, alpha: boolean) {
    super(world, alpha ? { ...spawn, opts: { variant: 'red', ...spawn.opts } } : spawn);
    this.alpha = alpha;
  }

  protected override configure() {
    super.configure();
    // (Runs inside super's constructor: `this.alpha` isn't assigned yet — read the spawn.)
    if (this.spawn.opts.alpha) {
      this.name = 'alpha';
      this.maxHp = ALPHA_TUNE.hp;
      this.points = 500;
    } else this.name = 'pack';
  }

  override onAdded(): void {
    super.onAdded();
    if (this.alpha && !hintedAlpha.has(this.world)) {
      hintedAlpha.set(this.world, this.world.time);
      this.world.hud.prompt('THE RED ALPHA! KEEP FIRING ON IT!');
    }
  }

  private attacking(): boolean {
    return this.state === 'windup' || this.state === 'pounce';
  }

  protected override onWindup() {
    super.onWindup();
    this.meter = 0;
    if (this.alpha) this.callPack();
  }

  override setState(s: string) {
    const fromEntry = this.state === 'entry';
    if (s !== 'windup' && s !== 'pounce') this.rallied = false;
    super.setState(s);
    if (fromEntry && s === 'advance' && this.spawn.opts.ambush) this.ambushT = ALPHA_TUNE.ambushWindow;
  }

  protected override advanceUpdate(dt: number) {
    if (this.ambushT > 0) {
      // AMBUSH: lands from its leap out of the ferns and goes straight into the
      // pounce (if it can be seen and shot from the first frame of the ring).
      this.ambushT -= dt;
      if (this.strikeNow(ALPHA_TUNE.ambushReach)) {
        this.ambushT = 0;
        return;
      }
    }
    super.advanceUpdate(dt);
  }

  private mercy(): boolean {
    return this.world.player.hp <= ALPHA_TUNE.mercyHp;
  }

  /** The alpha's screech: pack-mates that could attack right now crouch with it. */
  private callPack() {
    if (this.mercy()) return;
    for (const e of this.world.enemies()) {
      if (e !== this && e instanceof PackRaptor && !e.alpha) e.rally();
    }
  }

  /** First time two pack rings are up together: tell the player what's going on. */
  private hintPack() {
    if (hintedPack.has(this.world)) return;
    const alphaAt = hintedAlpha.get(this.world);
    if (alphaAt !== undefined && this.world.time - alphaAt < PROMPT_TIME) return;
    let n = 0;
    for (const e of this.world.enemies()) if (e instanceof PackRaptor && e.state === 'windup') n++;
    if (n < 2) return;
    hintedPack.add(this.world);
    this.world.hud.prompt('PACK ATTACK! BREAK EVERY RING!');
  }

  /**
   * Join a pack pounce now — only if the stock attack could start this frame
   * (framed in the playable view, at range, not just knocked out of one, a free
   * attack slot). Returns true when it crouched.
   */
  rally(): boolean {
    if (this.alpha || this.removed || !this.hostile || this.state !== 'advance' || this.cooldown > ALPHA_TUNE.rallyCooldown) return false;
    return this.strikeNow(0.6);
  }

  /**
   * Start the pounce this frame if the stock attack rules allow it (framed in the
   * playable view, clear of HUD panels and civilians, between the minimum strike
   * distance and `range + reach`, a free attack slot).
   */
  private strikeNow(reach: number): boolean {
    this.playerPos(_p);
    const pos = this.root.position;
    const dist = Math.hypot(pos.x - _p.x, pos.z - _p.z);
    if (dist > this.range + reach || dist < this.range * this.minStrikeFrac) return false;
    if (this.framing() !== 0 || !this.staysFramed(this.sx, this.windup, 0.85) || !this.framedAhead(this.windup)) return false;
    if (!this.takeSlot()) return false;
    this.cooldown = 0;
    this.setState('windup');
    if (!this.alpha) this.rallied = true;
    this.hintPack();
    return true;
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
    this.lastAmount = amount;
    if (this.attacking()) this.meter += amount;
  }

  override stagger() {
    if (this.resolvingShot && this.state !== 'dying') {
      if (this.alpha) {
        const heavy = this.lastAmount >= ALPHA_TUNE.heavy;
        if (this.attacking()) {
          // Sustained fire breaks the attack; until then the ring keeps closing.
          if (this.meter < ALPHA_TUNE.guard * (this.mercy() ? 0.5 : 1) && !heavy) return;
        } else if (!heavy) {
          // Closing in / recovering: flinches (onDamaged) but keeps coming.
          return;
        }
      } else if (this.rallied && this.attacking() && !this.mercy() && this.meter < ALPHA_TUNE.rallyGuard) {
        return;
      }
      this.meter = 0;
    }
    super.stagger();
  }
}

registerEnemy('raptor_alpha', (w, s) => new PackRaptor(w, { ...s, opts: { ...s.opts, alpha: true } }, true));
registerEnemy('raptor_pack', (w, s) => new PackRaptor(w, s, false));

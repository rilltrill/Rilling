import { Entity } from '../../../gameplay/Entity';
import { MAX_ATTACKERS } from '../../../gameplay/World';

/** Seconds without a NEW enemy windup after the player loses a heart (outside the boss fight). */
const BREATHER = 1.5;
/**
 * When a heart is lost, an enemy windup with more than this left backs off
 * (anything closer lands inside the player's 1.1 s grace and is absorbed).
 */
const BACK_OFF_LEFT = 0.9;
/** At this many hearts or fewer, only one enemy may wind up at a time. */
const LOW_HP = 2;

/**
 * ST. MERCY's pacing director (an invisible entity added first in the stage, so
 * it updates before every enemy and can veto a new windup on the same frame).
 * The hospital's holds come in dense, overlapping waves — the pressure is the
 * point — but a bad stretch must not snowball:
 *  - every heart lost buys a short breather: windups that had only just started
 *    back off, and no new ring opens for BREATHER seconds;
 *  - on their last LOW_HP hearts the player faces one ring at a time.
 * The boss fight runs its own (fight-scoped) mercy, so the director stands
 * aside while PATIENT ZERO is up.
 */
export class Director extends Entity {
  private lastHp = -1;
  private breather = 0;

  update(dt: number): void {
    const w = this.world;
    const hp = w.player.hp;
    const hurt = this.lastHp >= 0 && hp < this.lastHp;
    this.lastHp = hp;
    if (this.breather > 0) this.breather -= dt;
    if (w.boss) return;
    if (hurt && hp > 0) {
      this.breather = BREATHER;
      for (const e of w.enemies()) {
        if (e.isBoss || e.removed || e.state === 'dying' || !e.telegraph) continue;
        if ((1 - e.telegraph.progress) * e.windup > BACK_OFF_LEFT) e.setState('advance');
      }
    }
    // (World recounts free slots at the end of every frame: MAX_ATTACKERS − rings in progress.)
    if (this.breather > 0) w.attackSlots = 0;
    else if (hp <= LOW_HP) w.attackSlots = w.attackSlots >= MAX_ATTACKERS ? 1 : 0;
  }
}

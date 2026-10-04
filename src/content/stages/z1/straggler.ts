import { Walker } from '../../enemies/zombies';
import { registerEnemy } from '../../registry';

/**
 * A lone walker shambling out of a doorway or the fog during a walk between
 * fights (pacing filler: the street is never dead air). It comes straight at
 * the player like any walker, but if the player strolls past without shooting
 * it, it is left behind for good: once it's behind the camera and well out of
 * view it quietly leaves — instead of the stock AI walking it back round the
 * camera to pop up in the player's face during the next fight.
 */
export class Straggler extends Walker {
  override update(dt: number): void {
    super.update(dt);
    if (this.removed || this.state === 'dying' || this.state === 'entry' || this.telegraph) return;
    if (this.aheadOfPlayer() < -0.6 && !this.onScreen(1.25)) this.despawn();
  }
}

registerEnemy('straggler', (w, s) => new Straggler(w, s));

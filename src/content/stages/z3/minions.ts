import * as THREE from 'three';
import { Spitter } from '../../enemies/zombies';
import { registerEnemy } from '../../registry';

const _p = new THREE.Vector3();

/**
 * A spitter perched on the overpass deck. Same model, hit zones and bile
 * attack as the roster spitter, but it never walks off its ledge: it holds
 * position, turns to face the truck and spits whenever it is on screen.
 */
export class DeckSpitter extends Spitter {
  protected override configure() {
    super.configure();
    this.attackRange = 40;
  }

  protected override advanceUpdate(dt: number) {
    if (!this.onScreen(0.9)) {
      this.playerPos(_p);
      this.faceToward(_p, dt);
      this.moveSpeed = 0;
      return;
    }
    super.advanceUpdate(dt);
  }
}

registerEnemy('deck_spitter', (w, s) => new DeckSpitter(w, s));

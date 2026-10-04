import * as THREE from 'three';
import type { World } from '../../../gameplay/World';
import type { V3 } from '../../../core/types';
import { Projectile } from '../../../gameplay/Projectile';
import { ndcInPlayArea } from '../../../gameplay/Enemy';
import { Kit } from '../../kit/ModelKit';
import { tx } from './retro';
import { park } from './env';

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * A splintered, smouldering palm branch (same materials as the Tyrant's flung
 * palm debris): three meshes — trunk, frond tuft, burning tip — so a volley of
 * three costs only nine draw calls while it flies.
 */
function branchMesh(w: World): THREE.Group {
  const g = new THREE.Group();
  Kit.add(g, Kit.cyl(0.13, 0.18, 1.7, 6), tx('bark', 0x7a6650, 1.5, 0.9), 0, 0, 0, Math.PI / 2, 0, w.rng.spread(0.3));
  Kit.add(g, Kit.cone(0.55, 1.2, 5), tx('leaves', 0x4a7b42, 2, 0.8), 0, 0, 1.2, Math.PI / 2, 0, 0);
  // Burning tip: readable at night against the dark canopy.
  Kit.add(g, Kit.sphere(0.2, 6, 4), Kit.glow(0xff8a30, 1.6), 0, 0, -0.85);
  return g;
}

/**
 * Storm hazard: lightning splits a tree beside the road and `count` burning
 * branches tumble at the jeep — shootable projectiles with warning rings (three
 * mounted-gun hits each). `at` is the rig-relative [right, up, forward] of the
 * crown. A branch is only launched from inside the playable view (clear of the
 * HUD corners), so every one can be seen and shot from its first frame.
 * `active` is re-checked at each launch (the beat may already be over).
 */
export function lightningTree(w: World, at: V3, count = 2, active: () => boolean = () => true) {
  const env = park();
  if (!env || !active()) return;
  const crown = w.rig.relToWorld(at, new THREE.Vector3());
  env.strikeAt(w, crown);
  w.audio.play('wood_break', { volume: 1, pitch: 0.75 });
  w.fx.sparks(crown, null, 12);
  w.fx.debris(crown, 0x3d6a2c);
  w.fx.explosion(_p.copy(crown).setY(crown.y - 0.6), 0.45);
  w.rig.shake(0.2);
  for (let i = 0; i < count; i++) {
    w.later(0.35 + i * 0.45, () => {
      if (!active()) return;
      // The tree stays where it is in the world while a moving jeep passes it.
      _p.copy(crown);
      _p.x += w.rng.spread(0.8);
      _p.y += w.rng.spread(0.4);
      _n.copy(_p).project(w.camera);
      if (!ndcInPlayArea(_n.x, _n.y, _n.z, 0.85)) return;
      w.add(
        new Projectile(w, {
          from: _p.clone(),
          flightTime: 1.75,
          arc: 1,
          hp: 2,
          size: 0.5,
          damage: 1,
          points: 150,
          mesh: branchMesh(w),
          color: 0x6e5d4a,
          spin: 5,
          burst: 'debris',
          source: 'FALLING BRANCH',
          sfxDestroy: 'wood_break',
        }),
      );
      w.audio.play('whoosh', { volume: 0.8, vary: 0.2 });
    });
  }
}

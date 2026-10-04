import { Enemy } from '../../gameplay/Enemy';
import type { ShotHit } from '../../gameplay/Entity';
import { registerEnemy } from '../registry';
import { buildHumanoid, poseWalk, type HumanoidRig } from '../kit/humanoid';

/**
 * Zombie roster. REFERENCE IMPLEMENTATION: `Walker` shows the full pattern
 * (configure → build → animate → death). Other zombie types are registered as
 * walker variants until they get bespoke classes.
 */

const SKIN = [0x8fa37a, 0x7d9470, 0x9aa88a, 0xa0a07a];
const SHIRTS = [0x4b5a6b, 0x6b4b4b, 0x5b6b4b, 0x7a6a50, 0x3d3d4d, 0x8a8a8a];
const PANTS = [0x2b2f3a, 0x3a3326, 0x262626, 0x3b4252];

export class Walker extends Enemy {
  protected r!: HumanoidRig;
  protected phase = 0;

  protected override configure() {
    this.name = 'walker';
    this.maxHp = 2.5;
    this.speed = 1.1 + this.world.rng.range(-0.15, 0.25);
    this.attackRange = 1.7;
    this.windup = 1.6;
    this.points = 100;
    this.sfxIdle = 'zombie_groan';
    this.sfxAttack = 'zombie_attack';
    this.sfxDie = 'zombie_die';
    this.bloodColor = 0x5a0a0a;
  }

  protected override build() {
    const rng = this.world.rng;
    this.r = buildHumanoid({
      height: rng.range(1.65, 1.85),
      skin: rng.pick(SKIN),
      shirt: rng.pick(SHIRTS),
      pants: rng.pick(PANTS),
      hair: rng.chance(0.6) ? 0x2a2018 : null,
    });
    this.model.add(this.r.root);
    for (const m of this.r.meshes.head) this.hitbox(m, 'head');
    for (const m of this.r.meshes.torso) this.hitbox(m, 'torso');
    for (const m of this.r.meshes.limbs) this.hitbox(m, 'limb');
    this.anchor = this.r.chest;
    this.headAnchor = this.r.headMesh;
    this.phase = rng.next() * 10;
    // Shambling posture.
    this.r.spine.rotation.x = 0.18;
    this.r.head.rotation.z = rng.spread(0.3);
  }

  protected override animate(dt: number) {
    const r = this.r;
    this.phase += dt * (1.5 + this.moveSpeed * 3.2);
    const moving = Math.min(1, this.moveSpeed / 0.5);
    poseWalk(r, this.phase, Math.max(0.25, moving), 0.45);
    // Arms reaching forward, swaying.
    const reach = this.state === 'windup' ? -1.9 - Math.sin(this.stateTime * 18) * 0.15 : -1.35;
    r.armL.shoulder.rotation.x = reach + Math.sin(this.phase * 0.5) * 0.15;
    r.armR.shoulder.rotation.x = reach + Math.sin(this.phase * 0.5 + 1.3) * 0.15;
    r.armL.shoulder.rotation.z = 0.15;
    r.armR.shoulder.rotation.z = -0.15;
    r.spine.rotation.z = Math.sin(this.phase * 0.5) * 0.08;
    if (this.state === 'windup') {
      r.spine.rotation.x = 0.18 + Math.min(1, this.stateTime / this.windup) * 0.25;
    } else if (this.state === 'recover' && this.stateTime < 0.25) {
      r.spine.rotation.x = 0.55 - this.stateTime;
    } else if (this.state === 'stagger') {
      r.spine.rotation.x = -0.35 * Math.sin((this.stateTime / this.staggerTime) * Math.PI);
    } else {
      r.spine.rotation.x = 0.18;
    }
  }

  protected override onDamaged(hit: ShotHit) {
    // Head pops on a killing headshot.
    if (hit.part === 'head' && this.hp <= 0) {
      this.r.head.visible = false;
      this.world.fx.gibs(hit.point, 0x6b1010, 5);
      this.world.audio.play('gib', { volume: 0.6 });
    }
  }

  protected override onDeath(_hit: ShotHit | null) {
    this.r.armL.shoulder.rotation.x = -0.3;
    this.r.armR.shoulder.rotation.x = -0.2;
  }
}

registerEnemy('walker', (w, s) => new Walker(w, s));
// Placeholders until bespoke classes land — keep ids valid for stage scripts.
for (const id of ['runner', 'crawler', 'brute', 'spitter', 'bloater']) {
  registerEnemy(id, (w, s) => new Walker(w, s));
}


import { Enemy } from '../../gameplay/Enemy';
import { registerEnemy } from '../registry';
import { Kit } from '../kit/ModelKit';
import * as THREE from 'three';

/**
 * Dinosaur roster. REFERENCE IMPLEMENTATION: a simple raptor. Other ids are
 * registered as raptor placeholders until bespoke classes land.
 */
export class Raptor extends Enemy {
  private body!: THREE.Group;
  private neck!: THREE.Group;
  private jaw!: THREE.Group;
  private tail: THREE.Group[] = [];
  private legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private phase = 0;

  protected override configure() {
    this.name = 'raptor';
    this.maxHp = 3;
    this.speed = 5.5;
    this.attackRange = 2.4;
    this.windup = 1.2;
    this.points = 200;
    this.sfxAttack = 'raptor_screech';
    this.sfxDie = 'raptor_die';
    this.sfxIdle = 'raptor_screech';
    this.bloodColor = 0x7a0a0a;
    this.telegraphRadius = 0.6;
  }

  protected override build() {
    const skin = Kit.mat(0x8a6a3a);
    const belly = Kit.mat(0xc2a070);
    const stripe = Kit.mat(0x4a3a20);
    this.body = Kit.pivot(this.model, 0, 1.05, 0, 'body');
    const torso = Kit.add(this.body, Kit.box(0.5, 0.55, 1.1), skin, 0, 0, 0);
    Kit.add(this.body, Kit.box(0.4, 0.2, 0.9), belly, 0, -0.25, 0.05);
    Kit.add(this.body, Kit.box(0.52, 0.08, 0.3), stripe, 0, 0.26, -0.1);
    this.hitbox(torso, 'torso');
    this.neck = Kit.pivot(this.body, 0, 0.2, 0.5);
    const neckMesh = Kit.add(this.neck, Kit.box(0.26, 0.5, 0.26), skin, 0, 0.2, 0.08, 0.5);
    this.hitbox(neckMesh, 'torso');
    const head = Kit.pivot(this.neck, 0, 0.45, 0.2);
    const skull = Kit.add(head, Kit.box(0.3, 0.28, 0.55), skin, 0, 0, 0.18);
    this.hitbox(skull, 'head');
    this.jaw = Kit.pivot(head, 0, -0.1, 0.0);
    const jawMesh = Kit.add(this.jaw, Kit.box(0.26, 0.1, 0.5), belly, 0, -0.04, 0.2);
    this.hitbox(jawMesh, 'head');
    const eye = Kit.glow(0xffd23a, 1.2);
    Kit.add(head, Kit.box(0.04, 0.05, 0.05), eye, 0.15, 0.06, 0.25);
    Kit.add(head, Kit.box(0.04, 0.05, 0.05), eye, -0.15, 0.06, 0.25);
    let parent: THREE.Object3D = this.body;
    let z = -0.5;
    for (let i = 0; i < 4; i++) {
      const seg = Kit.pivot(parent, 0, i === 0 ? 0.05 : 0, z);
      const s = 1 - i * 0.2;
      const m = Kit.add(seg, Kit.box(0.3 * s, 0.28 * s, 0.5), skin, 0, 0, -0.25);
      this.hitbox(m, 'tail');
      this.tail.push(seg);
      parent = seg;
      z = -0.5;
    }
    for (const side of [1, -1]) {
      const hip = Kit.pivot(this.body, side * 0.24, -0.1, -0.1);
      const thigh = Kit.add(hip, Kit.box(0.18, 0.5, 0.26), skin, 0, -0.22, 0.05, -0.3);
      const knee = Kit.pivot(hip, 0, -0.45, 0.12);
      const shin = Kit.add(knee, Kit.box(0.12, 0.5, 0.14), skin, 0, -0.22, -0.08, 0.5);
      Kit.add(knee, Kit.box(0.14, 0.06, 0.3), stripe, 0, -0.48, 0.0);
      this.hitbox(thigh, 'limb');
      this.hitbox(shin, 'limb');
      this.legs.push({ hip, knee });
      const arm = Kit.add(this.body, Kit.box(0.08, 0.3, 0.08), skin, side * 0.22, -0.2, 0.45, 0.8);
      this.hitbox(arm, 'limb');
    }
    this.anchor = this.body;
    this.headAnchor = skull;
    this.phase = this.world.rng.next() * 10;
  }

  protected override animate(dt: number) {
    this.phase += dt * (2 + this.groundSpeed * 1.6);
    const run = Math.min(1, this.groundSpeed / 3);
    const s = Math.sin(this.phase);
    this.legs[0].hip.rotation.x = s * 0.9 * run;
    this.legs[1].hip.rotation.x = -s * 0.9 * run;
    this.legs[0].knee.rotation.x = Math.max(0, -Math.cos(this.phase)) * 0.9 * run;
    this.legs[1].knee.rotation.x = Math.max(0, Math.cos(this.phase)) * 0.9 * run;
    this.body.position.y = 1.05 + Math.abs(Math.cos(this.phase)) * 0.08 * run;
    this.body.rotation.x = 0.1 * run;
    this.tail.forEach((t, i) => (t.rotation.y = Math.sin(this.phase * 0.5 - i * 0.6) * 0.15));
    const open = this.state === 'windup' ? 0.5 + Math.sin(this.stateTime * 25) * 0.2 : 0.1;
    this.jaw.rotation.x = open;
    this.neck.rotation.x = this.state === 'windup' ? -0.3 : 0.1;
  }
}

registerEnemy('raptor', (w, s) => new Raptor(w, s));
for (const id of ['compy', 'dilo', 'ptero', 'trike']) registerEnemy(id, (w, s) => new Raptor(w, s));

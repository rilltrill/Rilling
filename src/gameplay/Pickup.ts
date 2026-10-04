import * as THREE from 'three';
import type { Frame, PickupKind } from '../core/types';
import { Entity, type ShotHit, type ShotOutcome } from './Entity';
import type { World } from './World';
import { Kit } from '../content/kit/ModelKit';
import { WEAPONS } from './Weapons';

const COLORS: Record<PickupKind, number> = {
  health: 0xff3b3b,
  shotgun: 0xffb347,
  smg: 0x5cc8ff,
  magnum: 0xff5e7e,
  bomb: 0xb6ff3b,
  points: 0xffd84a,
};

/** Shoot-to-collect item: first aid, weapon crates, bombs, bonus points. */
export class Pickup extends Entity {
  private model = new THREE.Group();
  private baseY = 0;
  ttl: number;

  constructor(world: World, readonly kind: PickupKind, pos: THREE.Vector3, frame: Frame, ttl = Infinity) {
    super(world);
    this.frame = frame;
    this.assistable = true;
    this.ttl = ttl;
    this.root.position.copy(pos);
    this.baseY = pos.y;
    this.root.add(this.model);
    this.buildModel();
  }

  private buildModel() {
    const c = COLORS[this.kind];
    const m = this.model;
    if (this.kind === 'health') {
      m.add(Kit.mesh(Kit.box(0.5, 0.36, 0.22), Kit.mat(0xf2f2f2)));
      m.add(Kit.mesh(Kit.box(0.28, 0.08, 0.24), Kit.glow(c, 1.2)));
      m.add(Kit.mesh(Kit.box(0.08, 0.28, 0.24), Kit.glow(c, 1.2)));
    } else if (this.kind === 'bomb') {
      m.add(Kit.mesh(Kit.sphere(0.2, 10, 8), Kit.mat(0x3d4a2a)));
      const pin = Kit.mesh(Kit.cyl(0.05, 0.05, 0.12, 6), Kit.glow(c, 1.4));
      pin.position.y = 0.22;
      m.add(pin);
    } else if (this.kind === 'points') {
      const gem = Kit.mesh(new THREE.OctahedronGeometry(0.25, 0), Kit.glow(c, 1.5));
      gem.scale.y = 1.4;
      m.add(gem);
    } else {
      // Weapon crate with a coloured band.
      m.add(Kit.mesh(Kit.box(0.7, 0.42, 0.42), Kit.mat(0x5a4632)));
      m.add(Kit.mesh(Kit.box(0.72, 0.1, 0.44), Kit.glow(c, 1.3)));
      const barrel = Kit.mesh(Kit.box(0.5, 0.06, 0.06), Kit.mat(0x222222));
      barrel.position.set(0, 0.26, 0);
      m.add(barrel);
    }
    // Soft halo ring so it reads as interactive.
    const ring = Kit.mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 24), Kit.glow(c, 2));
    ring.userData.noFlash = true;
    ring.name = 'halo';
    m.add(ring);
  }

  override onAdded(): void {
    this.model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.hitbox(o, 'body');
    });
  }

  update(dt: number): void {
    this.age += dt;
    this.model.rotation.y += dt * 1.6;
    this.root.position.y = this.baseY + Math.sin(this.age * 2.6) * 0.08;
    const halo = this.model.getObjectByName('halo');
    if (halo) {
      halo.rotation.x = Math.PI / 2;
      const s = 1 + Math.sin(this.age * 6) * 0.08;
      halo.scale.set(s, s, s);
    }
    if (this.age > this.ttl) this.removed = true;
    // Blink before expiring.
    if (this.ttl - this.age < 2) this.root.visible = Math.floor(this.age * 10) % 2 === 0;
  }

  override onShot(hit: ShotHit): ShotOutcome {
    this.removed = true;
    const w = this.world;
    w.fx.sparkle(hit.point, COLORS[this.kind]);
    let label = '';
    switch (this.kind) {
      case 'health':
        if (!w.player.heal(1)) w.score.add(1000, false);
        w.audio.play('pickup_health');
        label = '+1 LIFE';
        break;
      case 'bomb':
        if (!w.player.addBomb()) w.score.add(1000, false);
        w.audio.play('pickup');
        label = '+1 BOMB';
        break;
      case 'points': {
        const pts = w.score.add(2000);
        w.audio.play('pickup');
        label = `+${pts}`;
        break;
      }
      default:
        w.weapons.give(this.kind);
        w.audio.play('weapon_get');
        label = WEAPONS[this.kind].name + '!';
    }
    w.hud.popup(label, hit.screenX, hit.screenY, 'pickup');
    w.events.emit('pickup', { kind: this.kind });
    return { kind: 'pickup', counts: true };
  }
}

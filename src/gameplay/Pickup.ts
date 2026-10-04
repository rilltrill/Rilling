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

/** Seconds of blinking before a pickup with a ttl expires. */
export const PICKUP_BLINK = 2;

// Geometry shared by every pickup (never disposed: a stage spawns 5–15 pickups,
// and per-pickup geometries used to leak their GPU buffers).
let haloGeo: THREE.TorusGeometry | null = null;
let gemGeo: THREE.OctahedronGeometry | null = null;
function shared<T extends THREE.BufferGeometry>(g: T): T {
  g.userData.shared = true;
  return g;
}

/** Shoot-to-collect item: first aid, weapon crates, bombs, bonus points. */
export class Pickup extends Entity {
  private model = new THREE.Group();
  private halo: THREE.Mesh | null = null;
  private baseY = 0;
  ttl: number;

  constructor(world: World, readonly kind: PickupKind, pos: THREE.Vector3, frame: Frame, ttl = Infinity) {
    super(world);
    this.frame = frame;
    this.assistable = true;
    // Blinking before expiry hides the model, never the hitboxes.
    this.shootableWhenHidden = true;
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
      gemGeo ??= shared(new THREE.OctahedronGeometry(0.25, 0));
      const gem = Kit.mesh(gemGeo, Kit.glow(c, 1.5));
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
    haloGeo ??= shared(new THREE.TorusGeometry(0.42, 0.03, 6, 24));
    const ring = Kit.mesh(haloGeo, Kit.glow(c, 2));
    ring.userData.noFlash = true;
    ring.name = 'halo';
    ring.rotation.x = Math.PI / 2;
    m.add(ring);
    this.halo = ring;
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
    if (this.halo) this.halo.scale.setScalar(1 + Math.sin(this.age * 6) * 0.08);
    if (this.age > this.ttl) this.removed = true;
    // Blink before expiring (the model only: hitboxes stay shootable, see Shootables.active).
    // Reduced flashing: a slower blink.
    const rate = this.world.settings.reduceFlashes ? 4 : 8;
    this.model.visible = this.ttl - this.age >= PICKUP_BLINK || Math.floor(this.age * rate) % 2 === 0;
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

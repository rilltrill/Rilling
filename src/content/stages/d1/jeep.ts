import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { World } from '../../../gameplay/World';
import { angleDelta } from '../../../core/math';
import { merged } from './props';

const _v = new THREE.Vector3();

/**
 * First-person view model for the park-tour jeep: hood, folded windscreen,
 * sport bar + rear roll hoop and the pedestal-mounted gun.
 *
 * Lives on `world.rig.viewModelHolder` (follows the camera's yaw). The jeep
 * BODY is counter-rotated every frame so it stays aligned with the vehicle
 * (look back during the boss chase and you see the tailgate), while the GUN
 * turns with the camera like a real turret. Recoil, muzzle flash, brass and a
 * barrel that glows as the gun heats up teach the heat mechanic visually.
 */
export class JeepViewModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private gun = new THREE.Group();
  private gunKick = new THREE.Group();
  private flash: THREE.Group;
  private heatParts: THREE.Mesh[] = [];
  private heatMats: THREE.Material[];
  private coolMat: THREE.Material;
  private flashT = 0;
  private recoil = 0;
  private shots = 0;
  private steamT = 0;
  private bump = 0;
  private time = 0;
  private pitch = 0;
  private offShot: (() => void) | null = null;

  constructor(private world: World) {
    this.root.name = 'jeep-viewmodel';
    this.root.add(this.body, this.gun);
    this.buildBody();
    this.flash = this.buildGun();
    this.coolMat = Kit.mat(0x2a2c2e);
    this.heatMats = [Kit.glow(0x8a2010, 1), Kit.glow(0xd04a14, 1.2), Kit.glow(0xff8a2a, 1.4), Kit.glow(0xffd070, 1.6)];
    this.offShot = world.events.on('shot', () => this.onShot());
  }

  private buildBody() {
    const b = new THREE.Group();
    const olive = Kit.mat(0x4c6640);
    const khaki = Kit.mat(0xc4ab72);
    const dark = Kit.mat(0x2a2e2c);
    const metal = Kit.mat(0x5a5e60);
    const mud = Kit.mat(0x8a6e48);
    // Short safari hood (the gunner stands mid-vehicle at z = 0; ground at y = 0).
    Kit.add(b, Kit.box(1.92, 0.55, 4.0), olive, 0, 0.6, -0.75);
    Kit.add(b, Kit.box(1.64, 0.14, 1.25), khaki, 0, 0.94, -2.12, 0.05, 0, 0);
    Kit.add(b, Kit.box(0.28, 0.1, 1.25), olive, 0, 0.99, -2.12, 0.05, 0, 0);
    Kit.add(b, Kit.box(0.45, 0.03, 0.35), mud, -0.5, 1.02, -2.4, 0.05, 0.3, 0);
    Kit.add(b, Kit.box(0.3, 0.03, 0.25), mud, 0.6, 1.02, -1.9, 0.05, -0.2, 0);
    // Park emblem on the hood.
    Kit.add(b, Kit.cyl(0.24, 0.24, 0.04, 14), Kit.mat(0xf0c040), 0.42, 1.02, -2.35, 0.05, 0, 0);
    Kit.add(b, Kit.cyl(0.18, 0.18, 0.05, 14), Kit.mat(0xd8401c), 0.42, 1.025, -2.35, 0.05, 0, 0);
    for (const sx of [-1, 1]) {
      // Fenders + wheels.
      Kit.add(b, Kit.box(0.34, 0.18, 1.1), olive, sx * 0.9, 0.88, -2.2, 0, 0, sx * -0.18);
      Kit.add(b, Kit.cyl(0.44, 0.44, 0.34, 12), dark, sx * 0.86, 0.44, -2.2, 0, 0, Math.PI / 2);
      Kit.add(b, Kit.cyl(0.44, 0.44, 0.34, 12), dark, sx * 0.86, 0.44, 0.6, 0, 0, Math.PI / 2);
      // Headlights (glow, kept separate by the merge).
      Kit.add(b, Kit.cyl(0.12, 0.12, 0.1, 10), metal, sx * 0.62, 0.86, -2.78, Math.PI / 2, 0, 0);
      Kit.add(b, Kit.cyl(0.09, 0.09, 0.11, 10), Kit.glow(0xfff2c8, 1.1), sx * 0.62, 0.86, -2.79, Math.PI / 2, 0, 0);
      // Rear bed walls (seen when looking sideways / back).
      Kit.add(b, Kit.box(0.08, 0.45, 2.4), olive, sx * 0.92, 1.08, 0.05);
      Kit.add(b, Kit.box(0.12, 0.07, 2.4), khaki, sx * 0.92, 1.32, 0.05);
      Kit.add(b, Kit.box(0.16, 0.12, 0.05), Kit.glow(0xff2a1a, 1.1), sx * 0.72, 0.92, 1.26);
      // Sport roll bar behind the front seats (its top rail just shows at the bottom of the view).
      Kit.add(b, Kit.cyl(0.035, 0.035, 0.72, 8), dark, sx * 0.84, 1.22, -1.0, 0, 0, sx * 0.12);
      Kit.add(b, Kit.cyl(0.03, 0.03, 0.75, 8), dark, sx * 0.8, 1.2, -0.62, 0.75, 0, sx * 0.1);
    }
    Kit.add(b, Kit.cyl(0.035, 0.035, 1.6, 8), dark, 0, 1.57, -1.02, 0, 0, Math.PI / 2);
    // Grille + bull bar.
    Kit.add(b, Kit.box(1.4, 0.42, 0.1), dark, 0, 0.74, -2.76);
    Kit.add(b, Kit.cyl(0.05, 0.05, 1.7, 6), metal, 0, 0.96, -2.94, 0, 0, Math.PI / 2);
    Kit.add(b, Kit.cyl(0.05, 0.05, 1.7, 6), metal, 0, 0.56, -2.97, 0, 0, Math.PI / 2);
    for (const sx of [-0.55, 0.55]) Kit.add(b, Kit.cyl(0.045, 0.045, 0.5, 6), metal, sx, 0.78, -2.94);
    // Folded windscreen frame lying on the hood.
    Kit.add(b, Kit.box(1.5, 0.05, 0.05), metal, 0, 1.0, -1.58);
    Kit.add(b, Kit.box(1.5, 0.05, 0.05), metal, 0, 1.02, -1.98);
    for (const sx of [-0.72, 0.72]) Kit.add(b, Kit.box(0.05, 0.05, 0.42), metal, sx, 1.01, -1.78);
    Kit.add(b, Kit.box(1.36, 0.02, 0.34), Kit.mat(0x7a9aa8, { emissive: 0x18303a, emissiveIntensity: 0.5 }), 0, 1.0, -1.78);
    // Front seats (below the view).
    for (const sx of [-0.45, 0.45]) Kit.add(b, Kit.box(0.6, 0.6, 0.16), Kit.mat(0x7a5a3c), sx, 0.98, -0.75, -0.15, 0, 0);
    // Tailgate + spare wheel.
    Kit.add(b, Kit.box(1.84, 0.5, 0.08), olive, 0, 0.95, 1.26);
    Kit.add(b, Kit.cyl(0.4, 0.4, 0.26, 12), dark, 0, 1.1, 1.42, Math.PI / 2, 0, 0);
    Kit.add(b, Kit.cyl(0.18, 0.18, 0.28, 8), khaki, 0, 1.1, 1.42, Math.PI / 2, 0, 0);
    // Floor of the rear bed + ammo crate.
    Kit.add(b, Kit.box(1.76, 0.06, 2.4), Kit.mat(0x4a4a40), 0, 0.88, 0.05);
    Kit.add(b, Kit.box(0.5, 0.35, 0.35), Kit.mat(0x4a5a34), -0.55, 1.08, 0.8);
    merged(b);
    this.body.add(b);
  }

  /** Returns the muzzle-flash group. */
  private buildGun(): THREE.Group {
    const mount = this.gun;
    const metal = Kit.mat(0x2e3134);
    const dark = Kit.mat(0x1a1b1d);
    const olive = Kit.mat(0x4a5a34);
    // Pedestal rising from the bed floor.
    Kit.add(mount, Kit.cyl(0.05, 0.07, 0.75, 8), metal, 0.4, -1.12, -0.55);
    mount.add(this.gunKick);
    const k = this.gunKick;
    k.position.set(0.4, -0.72, -0.55);
    Kit.add(k, Kit.box(0.1, 0.12, 0.18), metal, 0, -0.04, 0);
    Kit.add(k, Kit.box(0.14, 0.15, 0.6), dark, 0, 0.03, -0.3);
    Kit.add(k, Kit.box(0.16, 0.045, 0.4), metal, 0, 0.12, -0.28);
    Kit.add(k, Kit.box(0.15, 0.15, 0.22), olive, -0.15, 0.0, -0.26);
    for (const sx of [-0.07, 0.07]) Kit.add(k, Kit.box(0.04, 0.12, 0.04), dark, sx, -0.02, 0.04);
    // Barrel shroud + barrel + muzzle brake.
    Kit.add(k, Kit.cyl(0.065, 0.065, 0.6, 10), metal, 0, 0.03, -0.88, Math.PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) Kit.add(k, Kit.cyl(0.072, 0.072, 0.035, 10), dark, 0, 0.03, -0.66 - i * 0.18, Math.PI / 2, 0, 0);
    const barrel = Kit.add(k, Kit.cyl(0.036, 0.036, 0.42, 8), metal, 0, 0.03, -1.38, Math.PI / 2, 0, 0);
    const brake = Kit.add(k, Kit.cyl(0.05, 0.05, 0.14, 8), metal, 0, 0.03, -1.64, Math.PI / 2, 0, 0);
    Kit.add(k, Kit.box(0.025, 0.07, 0.025), dark, 0, 0.1, -1.56);
    this.heatParts.push(barrel, brake);
    const flash = new THREE.Group();
    flash.position.set(0, 0.03, -1.76);
    k.add(flash);
    const fm = Kit.glow(0xffd27a, 2.2);
    Kit.add(flash, Kit.cone(0.08, 0.38, 5), fm, 0, 0, -0.15, -Math.PI / 2, 0, 0);
    Kit.add(flash, Kit.box(0.44, 0.045, 0.02), fm, 0, 0, -0.05);
    Kit.add(flash, Kit.box(0.045, 0.44, 0.02), fm, 0, 0, -0.05);
    Kit.add(flash, Kit.sphere(0.06, 6, 4), Kit.glow(0xffffff, 2.5), 0, 0, -0.04);
    flash.visible = false;
    return flash;
  }

  private onShot() {
    this.flashT = 0.045;
    this.recoil = Math.min(0.09, this.recoil + 0.045);
    this.flash.rotation.z = this.world.rng.next() * Math.PI;
    this.flash.scale.setScalar(0.8 + this.world.rng.next() * 0.5);
    if (++this.shots % 2 === 0) {
      this.gunKick.getWorldPosition(_v);
      _v.y += 0.1;
      this.world.fx.gibs(_v, 0xd4a640, 1, 0.025);
    }
  }

  update(dt: number) {
    const w = this.world;
    const rig = w.rig;
    const holder = rig.viewModelHolder;
    this.time += dt;
    // Keep the body aligned with the vehicle and its wheels on the ground.
    this.body.rotation.y = angleDelta(holder.rotation.y, rig.space.rotation.y);
    this.body.position.y = -rig.eyeHeight;
    this.gun.position.y = 0;
    // Engine rumble + occasional bumps on the dirt road.
    const moving = Math.min(1, rig.speed / 10);
    this.bump = Math.max(0, this.bump - dt * 3);
    if (moving > 0.2 && w.rng.chance(dt * 0.8)) this.bump = 0.6;
    const rumble = Math.sin(this.time * 47) * 0.004 * (0.3 + moving) + Math.sin(this.time * 9) * this.bump * 0.02;
    this.body.position.y += rumble;
    this.body.rotation.z = Math.sin(this.time * 1.7) * 0.006 * moving;
    // Gun recoil + flash.
    this.recoil = Math.max(0, this.recoil - dt * 0.6);
    this.gunKick.position.z = -0.55 + this.recoil;
    // The gun follows the camera's pitch (the jeep body does not).
    this.pitch += (w.camera.rotation.x - this.pitch) * Math.min(1, dt * 10);
    this.gun.rotation.x = this.pitch;
    this.gunKick.rotation.x = this.recoil * 0.6 + rumble * 2;
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    // Heat glow on the barrel.
    const heat = w.weapons.active === 'turret' ? w.weapons.heat : 0;
    const level = w.weapons.overheated ? 3 : heat > 0.8 ? 2 : heat > 0.55 ? 1 : heat > 0.3 ? 0 : -1;
    const mat = level < 0 ? this.coolMat : this.heatMats[level];
    for (const p of this.heatParts) if (p.material !== mat) p.material = mat;
    if (w.weapons.overheated) {
      this.steamT -= dt;
      if (this.steamT <= 0) {
        this.steamT = 0.12;
        this.flash.getWorldPosition(_v);
        w.fx.dust(_v, 0.25, 0xe8e8e8);
      }
    }
  }

  dispose() {
    this.offShot?.();
    this.offShot = null;
    this.root.parent?.remove(this.root);
  }
}

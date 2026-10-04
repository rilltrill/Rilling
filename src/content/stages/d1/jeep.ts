import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { World } from '../../../gameplay/World';
import { angleDelta } from '../../../core/math';
import { merged } from './props';
import { tm } from './retro';

const _v = new THREE.Vector3();

/** Gun pivot (holder space: metres right / up / back of the gunner's eye). */
const GUN_X = 0.62;
const GUN_Y = -0.86;
const GUN_Z = -0.5;
/** The body sits this much lower than the rig eye height implies (keeps the hood low in frame). */
const BODY_DROP = 0.1;

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
    this.coolMat = tm(0x2e3134, 'metal', 5, 0.6);
    this.heatMats = [Kit.glow(0x8a2010, 1), Kit.glow(0xd04a14, 1.2), Kit.glow(0xff8a2a, 1.4), Kit.glow(0xffd070, 1.6)];
    this.offShot = world.events.on('shot', () => this.onShot());
  }

  private buildBody() {
    const b = new THREE.Group();
    // Weathered park-jeep paint over riveted panels (the metal texture's rust
    // blotches read as chipped paint), mud splashes, ribbed tyres and bed.
    const olive = tm(0x4e6a40, 'metal', 1.3, 0.8);
    const khaki = tm(0xc8ac70, 'metal', 1.3, 0.75);
    const fender = tm(0x5a5c3a, 'dirt', 2.2, 0.9);
    const dark = tm(0x2a2e2c, 'metal', 4, 0.5);
    const tyre = tm(0x262826, 'corrugated', 4, 0.75);
    const grille = tm(0x2a2e2c, 'grate', 3);
    const metal = tm(0x5e6264, 'metal', 4, 0.6);
    const mud = tm(0x8a6e48, 'dirt', 2.6);
    const hoop = tm(0x5a6a48, 'metal', 4, 0.5);
    // The gunner stands mid-vehicle at z = 0 (ground at y = 0, eye ≈ 2.15 m above
    // the body after BODY_DROP). Everything ahead is kept short and low so the
    // front edge (bull bar) sits ≥ 26° below the eye: a compy 4 m in front of the
    // bumper is still fully visible above it.
    Kit.add(b, Kit.box(1.92, 0.5, 3.5), olive, 0, 0.6, -0.5);
    Kit.add(b, Kit.box(1.6, 0.08, 1.05), khaki, 0, 0.88, -1.72, 0.04, 0, 0);
    Kit.add(b, Kit.box(0.26, 0.05, 1.05), olive, 0, 0.93, -1.72, 0.04, 0, 0);
    Kit.add(b, Kit.box(0.42, 0.03, 0.3), mud, -0.48, 0.93, -2.0, 0.04, 0.3, 0);
    Kit.add(b, Kit.box(0.28, 0.03, 0.22), mud, 0.58, 0.93, -1.5, 0.04, -0.2, 0);
    Kit.add(b, Kit.box(0.2, 0.03, 0.14), mud, -0.2, 0.925, -1.3, 0.04, 0.6, 0);
    // Park emblem on the hood (clean decal).
    Kit.add(b, Kit.cyl(0.2, 0.2, 0.04, 14), tm(0xf4c43a, 'none'), 0.42, 0.93, -1.95, 0.04, 0, 0);
    Kit.add(b, Kit.cyl(0.15, 0.15, 0.05, 14), tm(0xe0401a, 'none'), 0.42, 0.935, -1.95, 0.04, 0, 0);
    for (const sx of [-1, 1]) {
      // Fenders + wheels.
      Kit.add(b, Kit.box(0.34, 0.16, 1.0), fender, sx * 0.9, 0.84, -1.75, 0, 0, sx * -0.18);
      Kit.add(b, Kit.cyl(0.44, 0.44, 0.34, 12), tyre, sx * 0.86, 0.44, -1.75, 0, 0, Math.PI / 2);
      Kit.add(b, Kit.cyl(0.44, 0.44, 0.34, 12), tyre, sx * 0.86, 0.44, 0.75, 0, 0, Math.PI / 2);
      // Headlights (glow, kept separate by the merge).
      Kit.add(b, Kit.cyl(0.11, 0.11, 0.1, 10), metal, sx * 0.62, 0.7, -2.28, Math.PI / 2, 0, 0);
      Kit.add(b, Kit.cyl(0.08, 0.08, 0.11, 10), Kit.glow(0xfff2c8, 1.1), sx * 0.62, 0.7, -2.29, Math.PI / 2, 0, 0);
      // Rear bed walls (seen when looking sideways / back).
      Kit.add(b, Kit.box(0.08, 0.45, 2.4), olive, sx * 0.92, 1.08, 0.05);
      Kit.add(b, Kit.box(0.12, 0.07, 2.4), khaki, sx * 0.92, 1.32, 0.05);
      Kit.add(b, Kit.box(0.16, 0.12, 0.05), Kit.glow(0xff2a1a, 1.1), sx * 0.72, 0.92, 1.26);
      // Waist-high roll bar in front of the gunner (peeks in at the bottom when the gun swings).
      Kit.add(b, Kit.cyl(0.032, 0.032, 0.6, 8), dark, sx * 0.84, 1.15, -0.74, 0, 0, sx * 0.1);
      // Rear roll hoop behind the gunner (seen at the bottom corners when looking back).
      Kit.add(b, Kit.cyl(0.035, 0.035, 0.42, 8), hoop, sx * 0.8, 1.53, 1.0);
      Kit.add(b, Kit.sphere(0.05, 8, 6), hoop, sx * 0.8, 1.74, 1.0);
      Kit.add(b, Kit.cyl(0.028, 0.028, 0.6, 6), hoop, sx * 0.8, 1.53, 0.78, 0.72, 0, 0);
    }
    Kit.add(b, Kit.cyl(0.032, 0.032, 1.62, 8), dark, 0, 1.44, -0.76, 0, 0, Math.PI / 2);
    Kit.add(b, Kit.cyl(0.035, 0.035, 1.6, 8), hoop, 0, 1.74, 1.0, 0, 0, Math.PI / 2);
    // Tied-down jerry can.
    Kit.add(b, Kit.box(0.34, 0.46, 0.18), tm(0x9a2c1a, 'metal', 4, 0.7), 0.55, 1.14, 1.08);
    // Grille + bull bar (the front-most, highest-on-screen part of the jeep).
    Kit.add(b, Kit.box(1.4, 0.38, 0.1), grille, 0, 0.62, -2.28);
    Kit.add(b, Kit.cyl(0.05, 0.05, 1.7, 6), metal, 0, 0.86, -2.46, 0, 0, Math.PI / 2);
    Kit.add(b, Kit.cyl(0.05, 0.05, 1.7, 6), metal, 0, 0.5, -2.5, 0, 0, Math.PI / 2);
    for (const sx of [-0.55, 0.55]) Kit.add(b, Kit.cyl(0.045, 0.045, 0.42, 6), metal, sx, 0.68, -2.47);
    // Folded windscreen frame lying on the hood.
    Kit.add(b, Kit.box(1.5, 0.05, 0.05), metal, 0, 0.93, -1.08);
    Kit.add(b, Kit.box(1.5, 0.05, 0.05), metal, 0, 0.95, -1.46);
    for (const sx of [-0.72, 0.72]) Kit.add(b, Kit.box(0.05, 0.05, 0.4), metal, sx, 0.94, -1.27);
    Kit.add(b, Kit.box(1.36, 0.02, 0.32), tm(0x7a9aa8, 'none', 1, 1, { emissive: 0x18303a, emissiveIntensity: 0.5 }), 0, 0.93, -1.27);
    // Front seats (below the view).
    for (const sx of [-0.45, 0.45]) Kit.add(b, Kit.box(0.6, 0.6, 0.16), tm(0x7a5a3c, 'cloth', 3), sx, 0.98, -0.75, -0.15, 0, 0);
    // Tailgate + spare wheel (its top arc and the roll hoop frame the bottom of the
    // screen when looking back at the boss, like the hood does ahead).
    Kit.add(b, Kit.box(1.84, 0.5, 0.08), olive, 0, 0.95, 1.26);
    Kit.add(b, Kit.cyl(0.42, 0.42, 0.26, 14), tyre, 0, 1.27, 1.42, Math.PI / 2, 0, 0);
    Kit.add(b, Kit.cyl(0.2, 0.2, 0.28, 10), khaki, 0, 1.27, 1.42, Math.PI / 2, 0, 0);
    // Floor of the rear bed + ammo crate.
    Kit.add(b, Kit.box(1.76, 0.06, 2.4), tm(0x4a4a40, 'corrugated', 2.5, 0.8), 0, 0.88, 0.05);
    Kit.add(b, Kit.box(0.5, 0.35, 0.35), tm(0x4a5a34, 'planks', 4), -0.55, 1.08, 0.8);
    merged(b);
    this.body.add(b);
  }

  /** Returns the muzzle-flash group. */
  private buildGun(): THREE.Group {
    const mount = this.gun;
    const metal = tm(0x30343a, 'metal', 5, 0.6);
    const dark = tm(0x1c1d20, 'metal', 6, 0.5);
    const olive = tm(0x4a5a34, 'metal', 5, 0.6);
    // Pedestal rising from the bed floor. The gun sits low and to the right with a
    // short barrel so it never covers the centre-right of the view.
    Kit.add(mount, Kit.cyl(0.05, 0.07, 0.75, 8), metal, GUN_X, GUN_Y - 0.4, GUN_Z);
    mount.add(this.gunKick);
    const k = this.gunKick;
    k.position.set(GUN_X, GUN_Y, GUN_Z);
    Kit.add(k, Kit.box(0.1, 0.12, 0.18), metal, 0, -0.04, 0);
    Kit.add(k, Kit.box(0.14, 0.15, 0.6), dark, 0, 0.03, -0.3);
    Kit.add(k, Kit.box(0.16, 0.045, 0.4), metal, 0, 0.12, -0.28);
    Kit.add(k, Kit.box(0.15, 0.15, 0.22), olive, -0.15, 0.0, -0.26);
    for (const sx of [-0.07, 0.07]) Kit.add(k, Kit.box(0.04, 0.12, 0.04), dark, sx, -0.02, 0.04);
    // Barrel shroud + barrel + muzzle brake.
    Kit.add(k, Kit.cyl(0.065, 0.065, 0.5, 10), metal, 0, 0.03, -0.82, Math.PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) Kit.add(k, Kit.cyl(0.072, 0.072, 0.035, 10), dark, 0, 0.03, -0.64 - i * 0.15, Math.PI / 2, 0, 0);
    const barrel = Kit.add(k, Kit.cyl(0.036, 0.036, 0.34, 8), metal, 0, 0.03, -1.22, Math.PI / 2, 0, 0);
    const brake = Kit.add(k, Kit.cyl(0.05, 0.05, 0.13, 8), metal, 0, 0.03, -1.44, Math.PI / 2, 0, 0);
    Kit.add(k, Kit.box(0.025, 0.07, 0.025), dark, 0, 0.1, -1.36);
    this.heatParts.push(barrel, brake);
    const flash = new THREE.Group();
    flash.position.set(0, 0.03, -1.55);
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
    this.body.position.y = -rig.eyeHeight - BODY_DROP;
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
    this.gunKick.position.z = GUN_Z + this.recoil;
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

import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { World } from '../../../gameplay/World';
import { angleDelta } from '../../../core/math';
import { Baker } from './bake';
import { D } from './layout';
import { clean, tx } from './retro';
import { pixelWorld } from '../../../core/art';
import { D3JeepPixel } from './jeepPixel';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

const OLIVE = 0x3e5a3a;
const OLIVE_DARK = 0x2c4029;
const SAND = 0x8a7a50;
const METAL = 0x4e5256;
const DARK = 0x1e2022;

/**
 * Ranger jeep body (ground at y = 0, gunner at the origin, nose toward −Z). ART: PIXEL WORLD
 * (`jp`, or a baker of a PIXEL WORLD stage): the body is painted instead (same geometry).
 */
export function buildJeepBody(baker: Baker, jp?: D3JeepPixel): THREE.Group {
  const b = new THREE.Group();
  // Olive-drab sheet steel: panel seams, rivets and rust blotches at a scale that
  // reads on the hood right under the camera.
  const olive = tx('metal', OLIVE, 1.6, 0.6);
  const oliveDark = tx('metal', OLIVE_DARK, 1.6, 0.6);
  const sand = tx('metal', SAND, 1.6, 0.5);
  const metal = tx('metal', METAL, 3, 0.6);
  const dark = tx('asphalt', DARK, 3, 0.8);
  const grille = tx('grate', 0x2a2c2e, 2.5, 0.8);
  const mud = tx('dirt', 0x4e3c2a, 3, 1);
  // Hood + body tub.
  Kit.add(b, Kit.box(1.94, 0.6, 4.4), olive, 0, 0.62, -0.9);
  Kit.add(b, Kit.box(1.7, 0.16, 1.5), olive, 0, 0.98, -2.35, 0.04, 0, 0);
  Kit.add(b, Kit.box(0.16, 0.03, 1.5), sand, -0.42, 1.07, -2.35, 0.04, 0, 0);
  Kit.add(b, Kit.box(0.16, 0.03, 1.5), sand, 0.42, 1.07, -2.35, 0.04, 0, 0);
  Kit.add(b, Kit.box(0.5, 0.025, 0.4), mud, -0.55, 1.065, -2.65, 0.04, 0.3, 0);
  Kit.add(b, Kit.box(0.3, 0.025, 0.3), mud, 0.62, 1.065, -2.05, 0.04, -0.2, 0);
  // Hood vents + bonnet clips.
  for (let i = 0; i < 4; i++) Kit.add(b, Kit.box(0.5, 0.03, 0.05), oliveDark, -0.45, 1.075, -2.0 - i * 0.12, 0.04, 0, 0);
  for (const sx of [-0.78, 0.78]) Kit.add(b, Kit.box(0.08, 0.06, 0.14), metal, sx, 1.07, -2.95);
  for (const sx of [-1, 1]) {
    Kit.add(b, Kit.box(0.36, 0.2, 1.2), oliveDark, sx * 0.92, 0.9, -2.45, 0, 0, sx * -0.2);
    Kit.add(b, Kit.cyl(0.46, 0.46, 0.36, 12), dark, sx * 0.88, 0.46, -2.45, 0, 0, Math.PI / 2);
    Kit.add(b, Kit.cyl(0.46, 0.46, 0.36, 12), dark, sx * 0.88, 0.46, 0.55, 0, 0, Math.PI / 2);
    Kit.add(b, Kit.cyl(0.2, 0.2, 0.38, 8), metal, sx * 0.88, 0.46, -2.45, 0, 0, Math.PI / 2);
    Kit.add(b, Kit.cyl(0.13, 0.13, 0.1, 10), metal, sx * 0.62, 0.86, -3.12, Math.PI / 2, 0, 0);
    Kit.add(b, Kit.cyl(0.1, 0.1, 0.11, 10), Kit.glow(0xfff0c8, 1.4), sx * 0.62, 0.86, -3.13, Math.PI / 2, 0, 0);
    Kit.add(b, Kit.box(0.09, 0.5, 2.6), olive, sx * 0.93, 1.1, 0.0);
    Kit.add(b, Kit.box(0.13, 0.07, 2.6), oliveDark, sx * 0.93, 1.36, 0.0);
    Kit.add(b, Kit.box(0.18, 0.12, 0.05), Kit.glow(0xff2a1a, 1.3), sx * 0.72, 0.92, 1.34);
  }
  // Grille + bull bar + winch.
  Kit.add(b, Kit.box(1.4, 0.46, 0.1), grille, 0, 0.74, -3.12);
  for (let i = 0; i < 7; i++) Kit.add(b, Kit.box(0.06, 0.4, 0.12), metal, -0.54 + i * 0.18, 0.74, -3.14);
  Kit.add(b, Kit.cyl(0.05, 0.05, 1.8, 6), metal, 0, 1.0, -3.32, 0, 0, Math.PI / 2);
  Kit.add(b, Kit.cyl(0.05, 0.05, 1.8, 6), metal, 0, 0.55, -3.35, 0, 0, Math.PI / 2);
  for (const sx of [-0.6, 0.6]) Kit.add(b, Kit.cyl(0.045, 0.045, 0.55, 6), metal, sx, 0.78, -3.32);
  Kit.add(b, Kit.box(0.5, 0.25, 0.25), metal, 0, 0.58, -3.28);
  // Windscreen folded flat onto the hood (keeps the view clear), wet glass catching the light.
  Kit.add(b, Kit.box(1.62, 0.05, 0.05), metal, 0, 1.08, -1.62);
  Kit.add(b, Kit.box(1.62, 0.05, 0.05), metal, 0, 1.1, -2.12);
  for (const sx of [-0.79, 0.79]) Kit.add(b, Kit.box(0.05, 0.05, 0.52), metal, sx, 1.09, -1.87);
  Kit.add(b, Kit.box(1.5, 0.015, 0.44), clean(0x26323c, { emissive: 0x0a1218, emissiveIntensity: 1 }), 0, 1.085, -1.87);
  // Front seats.
  for (const sx of [-0.45, 0.45]) Kit.add(b, Kit.box(0.6, 0.62, 0.16), tx('cloth', 0x5e4e38, 2.5, 0.9), sx, 1.02, -0.8, -0.15, 0, 0);
  // Roll hoop at the rear corners (frames the edges when looking back, never the centre) + amber beacon.
  for (const sx of [-0.92, 0.92]) Kit.add(b, Kit.cyl(0.035, 0.035, 1.8, 8), metal, sx, 2.2, 1.3);
  Kit.add(b, Kit.cyl(0.035, 0.035, 1.88, 8), metal, 0, 3.1, 1.3, 0, 0, Math.PI / 2);
  Kit.add(b, Kit.box(0.16, 0.12, 0.16), Kit.glow(0xffa020, 1.4), 0.6, 3.19, 1.3);
  // Tailgate, spare wheel, bed floor, jerry cans.
  Kit.add(b, Kit.box(1.86, 0.52, 0.08), olive, 0, 0.96, 1.32);
  Kit.add(b, Kit.cyl(0.4, 0.4, 0.24, 12), dark, 0, 0.82, 1.48, Math.PI / 2, 0, 0);
  Kit.add(b, Kit.cyl(0.17, 0.17, 0.26, 8), sand, 0, 0.82, 1.48, Math.PI / 2, 0, 0);
  Kit.add(b, Kit.box(1.78, 0.06, 2.5), tx('grate', 0x3e3e36, 3, 0.6), 0, 0.9, 0.05);
  Kit.add(b, Kit.box(0.24, 0.42, 0.42), tx('metal', 0x7a3020, 3, 0.6), -0.55, 1.12, 0.9);
  Kit.add(b, Kit.box(0.24, 0.42, 0.42), tx('metal', 0x7a3020, 3, 0.6), -0.25, 1.12, 0.9);
  Kit.add(b, Kit.box(0.5, 0.32, 0.32), tx('cloth', 0x4a5a34, 2.5, 0.8), 0.55, 1.08, 0.85);
  const own = !jp && baker.pixel ? new D3JeepPixel() : null;
  const pj = jp ?? own;
  pj?.paintBody(b);
  baker.bake(b);
  own?.finish();
  return b;
}

/**
 * First-person view model: the ranger jeep (hood, windscreen frame + light
 * bar, roll bar, tailgate) with a pedestal gun, live headlights (one spot
 * light + soft beam cones cutting through the rain), raindrop splashes on the
 * hood, mud bogging and bridge-plank bumps. The body counter-rotates to stay
 * aligned with the vehicle; the gun turns with the camera. For the escape it
 * swaps to a helicopter cabin door view.
 */
export class JeepViewModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private gun = new THREE.Group();
  private gunKick = new THREE.Group();
  private cabin = new THREE.Group();
  private flash!: THREE.Group;
  private heatParts: THREE.Mesh[] = [];
  private heatMats: THREE.Material[];
  private coolMat: THREE.Material;
  private head: THREE.SpotLight;
  private drops: THREE.InstancedMesh;
  private dropT: Float32Array;
  private dropPos: Float32Array;
  private flashT = 0;
  private recoil = 0;
  private shots = 0;
  private steamT = 0;
  private bump = 0;
  private time = 0;
  private pitch = 0;
  private sink = 0;
  private lastPlank = 0;
  private offShot: (() => void) | null = null;
  /** True once the player boards the helicopter. */
  inHeli = false;
  /** Set by the environment: jeep bogged in mud. */
  mud = false;

  constructor(private world: World, baker: Baker) {
    this.root.name = 'jeep-viewmodel';
    this.root.add(this.body, this.gun, this.cabin);
    // ART: PIXEL WORLD: body, gun and cabin painted on the jeep's own atlas (same geometry, same framing).
    const jp = pixelWorld(world) ? new D3JeepPixel() : null;
    this.body.add(buildJeepBody(baker, jp ?? undefined));
    this.buildGun(baker, jp);
    this.buildCabin(baker, jp);
    jp?.finish();
    this.cabin.visible = false;
    this.coolMat = tx('metal', 0x34383c, 4, 0.5);
    this.heatMats = [Kit.glow(0x8a2010, 1), Kit.glow(0xd04a14, 1.2), Kit.glow(0xff8a2a, 1.4), Kit.glow(0xffd070, 1.6)];

    // Headlights: one spot light for both lamps.
    this.head = new THREE.SpotLight(0xfff0d0, 90, 48, 0.5, 0.55, 1.35);
    this.head.position.set(0, 0.95, -3.1);
    this.head.target.position.set(0, -0.6, -22);
    this.body.add(this.head, this.head.target);

    // Raindrop splashes on the hood (one instanced draw call).
    const n = 16;
    this.drops = new THREE.InstancedMesh(Kit.box(0.05, 0.006, 0.05), Kit.glow(0xc8d8f0, 0.9), n);
    this.drops.frustumCulled = false;
    this.dropT = new Float32Array(n);
    this.dropPos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.dropT[i] = world.rng.next() * 0.3;
    this.body.add(this.drops);

    this.offShot = world.events.on('shot', () => this.onShot());
  }

  private buildGun(baker: Baker, jp: D3JeepPixel | null) {
    const mount = this.gun;
    const metal = tx('metal', 0x34383c, 4, 0.5);
    const dark = tx('metal', 0x222326, 4, 0.5);
    const olive = tx('metal', 0x44552f, 4, 0.5);
    Kit.add(mount, Kit.cyl(0.05, 0.07, 0.75, 8), metal, 0.42, -1.12, -0.55);
    mount.add(this.gunKick);
    const k = this.gunKick;
    k.position.set(0.42, -0.72, -0.55);
    const body = new THREE.Group();
    k.add(body);
    Kit.add(body, Kit.box(0.1, 0.12, 0.18), metal, 0, -0.04, 0);
    Kit.add(body, Kit.box(0.14, 0.15, 0.6), dark, 0, 0.03, -0.3);
    Kit.add(body, Kit.box(0.16, 0.045, 0.4), metal, 0, 0.12, -0.28);
    Kit.add(body, Kit.box(0.15, 0.15, 0.22), olive, -0.15, 0.0, -0.26);
    for (const sx of [-0.07, 0.07]) Kit.add(body, Kit.box(0.04, 0.12, 0.04), dark, sx, -0.02, 0.04);
    Kit.add(body, Kit.cyl(0.065, 0.065, 0.6, 10), metal, 0, 0.03, -0.88, Math.PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) Kit.add(body, Kit.cyl(0.072, 0.072, 0.035, 10), dark, 0, 0.03, -0.66 - i * 0.18, Math.PI / 2, 0, 0);
    Kit.add(body, Kit.box(0.025, 0.07, 0.025), dark, 0, 0.1, -1.56);
    if (jp) {
      jp.paint(body);
      // The pedestal (the mount's own mesh; the kick group's parts are painted above / stay classic).
      jp.paint(mount, (m) => m.parent !== mount);
    }
    baker.bake(body);
    const barrel = Kit.add(k, Kit.cyl(0.036, 0.036, 0.42, 8), metal, 0, 0.03, -1.38, Math.PI / 2, 0, 0);
    const brake = Kit.add(k, Kit.cyl(0.05, 0.05, 0.14, 8), metal, 0, 0.03, -1.64, Math.PI / 2, 0, 0);
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
    this.flash = flash;
  }

  /** Helicopter cabin seen from the open side door (shown after boarding). */
  private buildCabin(baker: Baker, jp: D3JeepPixel | null) {
    const c = new THREE.Group();
    const frame = tx('metal', 0x22262c, 3, 0.6);
    const white = tx('metal', 0xc8ccd0, 2, 0.5);
    const floor = tx('grate', 0x34363a, 3, 0.7);
    // Door frame around the view.
    Kit.add(c, Kit.box(0.18, 2.6, 0.2), frame, -1.25, -0.2, -1.1);
    Kit.add(c, Kit.box(0.18, 2.6, 0.2), frame, 1.25, -0.2, -1.1);
    Kit.add(c, Kit.box(2.7, 0.22, 0.4), white, 0, 0.82, -1.0);
    Kit.add(c, Kit.box(2.7, 0.12, 1.6), floor, 0, -0.95, -0.6);
    Kit.add(c, Kit.box(2.7, 0.1, 0.12), tx('hazard', 0xe0b020, 2, 1), 0, -0.89, -1.35);
    // Skid below the door.
    Kit.add(c, Kit.cyl(0.07, 0.07, 3.6, 6), frame, 0.1, -2.15, -1.6, 0, Math.PI / 2, Math.PI / 2);
    Kit.add(c, Kit.box(0.08, 1.1, 0.08), frame, -0.9, -1.6, -1.4, 0.2, 0, 0);
    Kit.add(c, Kit.box(0.08, 1.1, 0.08), frame, 0.9, -1.6, -1.4, 0.2, 0, 0);
    // Grab handle + warm cabin light.
    Kit.add(c, Kit.cyl(0.025, 0.025, 0.7, 6), tx('metal', 0xd0b020, 4, 0.4), 1.1, 0.25, -1.05);
    Kit.add(c, Kit.box(0.5, 0.06, 0.2), Kit.glow(0xffd090, 0.9), -0.6, 0.72, -0.7);
    jp?.paintCabin(c);
    baker.bake(c);
    this.cabin.add(c);
  }

  private onShot() {
    if (this.inHeli) return;
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

  /** Swap to the helicopter cabin (escape). */
  boardHelicopter() {
    this.inHeli = true;
    this.body.visible = false;
    this.gun.visible = false;
    this.cabin.visible = true;
    this.head.intensity = 0;
  }

  update(dt: number) {
    const w = this.world;
    const rig = w.rig;
    const holder = rig.viewModelHolder;
    this.time += dt;
    if (this.inHeli) {
      // The cabin sways gently with the helicopter.
      this.cabin.rotation.set(Math.sin(this.time * 0.9) * 0.02, angleDelta(holder.rotation.y, rig.space.rotation.y) * 0 + 0, Math.sin(this.time * 0.7) * 0.03);
      return;
    }
    this.body.rotation.y = angleDelta(holder.rotation.y, rig.space.rotation.y);
    const moving = Math.min(1, rig.speed / 10);
    // Mud: sink, rock and judder while the wheels spin.
    this.sink += ((this.mud ? 0.2 : 0) - this.sink) * Math.min(1, dt * 2);
    this.bump = Math.max(0, this.bump - dt * 3);
    if (moving > 0.2 && w.rng.chance(dt * 0.8)) this.bump = 0.6;
    // Bridge planks: a thump every plank.
    if (rig.d > D.BRIDGE_FROM && rig.d < D.BRIDGE_TO && rig.moving) {
      const plank = Math.floor(rig.d / 1.3);
      if (plank !== this.lastPlank) {
        this.lastPlank = plank;
        this.bump = Math.max(this.bump, 0.35);
      }
    }
    const spin = this.sink > 0.05 ? (Math.sin(this.time * 38) * 0.012 + Math.sin(this.time * 5.3) * 0.02) * (this.sink / 0.2) : 0;
    const rumble = Math.sin(this.time * 47) * 0.004 * (0.3 + moving) + Math.sin(this.time * 9) * this.bump * 0.02 + spin;
    this.body.position.y = -rig.eyeHeight - this.sink + rumble;
    this.body.rotation.z = Math.sin(this.time * 1.7) * 0.006 * moving + spin * 0.6;
    this.body.rotation.x = -this.sink * 0.2;
    this.gun.position.y = -this.sink * 0.6;
    // Gun recoil + flash; the gun follows the camera's pitch.
    this.recoil = Math.max(0, this.recoil - dt * 0.6);
    this.gunKick.position.z = -0.55 + this.recoil;
    this.pitch += (w.camera.rotation.x - this.pitch) * Math.min(1, dt * 10);
    this.gun.rotation.x = this.pitch;
    this.gunKick.rotation.x = this.recoil * 0.6 + rumble * 2;
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
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
    // Raindrop splashes: each drop expands and fades, then respawns elsewhere on the hood.
    const n = this.dropT.length;
    for (let i = 0; i < n; i++) {
      this.dropT[i] -= dt;
      if (this.dropT[i] <= 0) {
        this.dropT[i] = 0.18 + w.rng.next() * 0.12;
        this.dropPos[i * 3] = w.rng.spread(0.85);
        this.dropPos[i * 3 + 1] = 1.08 + w.rng.next() * 0.02;
        this.dropPos[i * 3 + 2] = -1.75 - w.rng.next() * 1.3;
      }
      const k = 1 - this.dropT[i] / 0.3;
      _s.setScalar(0.4 + k * 1.6);
      _s.y = 1;
      _v.set(this.dropPos[i * 3], this.dropPos[i * 3 + 1] + (this.dropPos[i * 3 + 2] + 2.35) * -0.04, this.dropPos[i * 3 + 2]);
      _m.compose(_v, _q.identity(), k > 0.85 ? _s.setScalar(0.001) : _s);
      this.drops.setMatrixAt(i, _m);
    }
    this.drops.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.offShot?.();
    this.offShot = null;
    this.root.parent?.remove(this.root);
  }
}

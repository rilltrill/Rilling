import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { World } from '../../../gameplay/World';
import { angleDelta, clamp } from '../../../core/math';
import { M, bake } from './bake';
import { addText } from './font';
import { pixelWorld } from '../../../core/art';
import { PwAtlas } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import {
  z3TruckBed, z3TruckGlass, z3TruckHazard, z3TruckHood, z3TruckPaint, z3TruckRoof, z3TruckSteel, z3TruckTailgate,
} from '../../pixelworld/z3truck';
import { box, cylinder } from './pwShapes';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

const TRACERS = 8;

/**
 * First-person view model: you stand in the bed of a battered pickup behind the
 * cab, on a twin-barrelled pintle gun. Coordinates are eye-relative (camera at
 * the origin looking −Z, the road is ~2 m below).
 *
 * The truck BODY stays aligned with the vehicle (look back during the boss
 * chase and the cab disappears behind you), while the GUN swings toward every
 * tap like a real turret: alternating barrel recoil, muzzle flashes, tracers,
 * spent brass and barrels that glow as the gun heats up.
 */
export class TruckViewModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private mount = new THREE.Group();
  private gun = new THREE.Group();
  private barrels: THREE.Group[] = [];
  private flashes: THREE.Group[] = [];
  private heatParts: THREE.Mesh[] = [];
  private heatMats: THREE.Material[];
  private coolMat: THREE.Material;
  private recoil = [0, 0];
  private flashT = [0, 0];
  private next = 0;
  private shots = 0;
  private time = 0;
  private bump = 0;
  private aimYaw = 0;
  private aimPitch = 0;
  private yaw = 0;
  private pitch = 0;
  private aimHold = 0;
  private steamT = 0;
  private tracers: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private offShot: (() => void) | null = null;
  private origShotFired: ((x: number, y: number) => void) | null = null;
  private wrapper: ((x: number, y: number) => void) | null = null;
  private disposed = false;
  private ray = new THREE.Vector3();

  constructor(private world: World) {
    this.root.name = 'truck-viewmodel';
    this.root.add(this.body, this.mount);
    this.buildBody();
    this.buildGun();
    this.coolMat = Kit.mat(0x34373e, { tex: 'metal', texScale: 2, texStrength: 0.7 });
    this.heatMats = [Kit.glow(0x8a2010, 1), Kit.glow(0xd04a14, 1.2), Kit.glow(0xff8a2a, 1.4), Kit.glow(0xffd070, 1.6)];
    this.offShot = world.events.on('shot', () => this.onShot());
    // Track where the player taps so the gun can swing toward it.
    const hud = world.hud;
    this.origShotFired = hud.shotFired;
    this.wrapper = (x: number, y: number) => {
      if (!this.disposed) this.aimAt(x, y);
      this.origShotFired!.call(hud, x, y);
    };
    hud.shotFired = this.wrapper;
    // Tracers live in world space.
    const tm = Kit.glow(0xffd890, 1.8);
    for (let i = 0; i < TRACERS; i++) {
      const m = Kit.mesh(Kit.box(0.035, 0.035, 2.4), tm);
      m.visible = false;
      m.frustumCulled = false;
      world.scene.add(m);
      this.tracers.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }
  }

  private buildBody() {
    const b = new THREE.Group();
    // Seen 1–5 m from the eye: chunky texels at full density read clearly.
    const paint = M.lam(0x962a20, 'metal', 1.2, 0.6);
    const primer = M.lam(0x74726a, 'metal', 1.2, 0.75);
    const rust = M.lam(0x7a4024, 'metal', 1.2, 1);
    const dark = M.lam(0x26272c, 'metal', 1.6, 0.6);
    const steel = M.lam(0x6a6e74, 'metal', 1.2, 0.85);
    const blood = M.lam(0x5a0c08, 'metal', 1.2, 0.5);
    const glass = M.lam(0x1a2230, 'none');
    const hazard = M.lam(0xe8b420, 'hazard', 2.2, 1);
    const hazardBig = M.lam(0xe8b420, 'hazard', 1.5, 1);
    // Cab roof (its front edge and the light bar frame the bottom of the screen).
    Kit.add(b, Kit.box(1.8, 0.1, 1.45), paint, 0, -1.17, -1.62);
    Kit.add(b, Kit.box(1.6, 0.06, 1.2), paint, 0, -1.1, -1.62);
    Kit.add(b, Kit.box(0.7, 0.02, 0.5), primer, -0.4, -1.065, -1.75, 0, 0.25, 0);
    Kit.add(b, Kit.box(1.86, 0.5, 0.1), paint, 0, -1.42, -0.9);
    // Windscreen sloping down to the hood.
    Kit.add(b, Kit.box(1.66, 0.05, 0.95), glass, 0, -1.52, -2.72, -0.72, 0, 0);
    for (const s of [-1, 1]) Kit.add(b, Kit.box(0.08, 0.08, 0.97), paint, s * 0.86, -1.52, -2.72, -0.72, 0, 0);
    // Hood + fenders.
    Kit.add(b, Kit.box(1.84, 0.3, 1.5), paint, 0, -2.0, -3.85);
    Kit.add(b, Kit.box(0.9, 0.04, 0.9), primer, 0.38, -1.84, -3.8, 0, 0.1, 0);
    Kit.add(b, Kit.box(0.5, 0.03, 0.5), blood, -0.45, -1.84, -4.2, 0, 0.5, 0);
    Kit.add(b, Kit.box(0.24, 0.03, 0.3), blood, 0.65, -1.84, -4.4, 0, -0.3, 0);
    Kit.add(b, Kit.box(0.5, 0.08, 0.9), primer, 0, -1.82, -3.75);
    for (const s of [-1, 1]) {
      Kit.add(b, Kit.box(0.2, 0.18, 1.4), paint, s * 0.98, -1.98, -3.85);
      // Mirrors.
      Kit.add(b, Kit.box(0.26, 0.04, 0.04), dark, s * 1.0, -1.45, -2.45);
      Kit.add(b, Kit.box(0.08, 0.24, 0.16), dark, s * 1.16, -1.4, -2.42);
      Kit.add(b, Kit.box(0.02, 0.18, 0.12), M.glow(0x9ab0d0, 0.5), s * 1.16, -1.4, -2.33);
      // Bed rails + bed walls (seen when looking sideways / back); hazard-taped rail caps frame the view.
      Kit.add(b, Kit.box(0.1, 0.42, 2.7), paint, s * 0.95, -1.68, 0.55);
      Kit.add(b, Kit.box(0.16, 0.06, 2.7), hazard, s * 0.95, -1.46, 0.55);
      // Roll bar uprights.
      Kit.add(b, Kit.cyl(0.04, 0.04, 0.5, 8), steel, s * 0.82, -1.22, -0.84);
    }
    Kit.add(b, Kit.cyl(0.04, 0.04, 1.66, 8), steel, 0, -0.97, -0.84, 0, 0, Math.PI / 2);
    // Off-road light bar on the cab roof front (amber).
    Kit.add(b, Kit.box(1.2, 0.08, 0.1), dark, 0, -1.04, -2.26);
    // Hazard tape on the back of the light bar: the one stripe always in view.
    Kit.add(b, Kit.box(1.16, 0.056, 0.012), hazardBig, 0, -1.04, -2.204);
    for (const x of [-0.42, -0.14, 0.14, 0.42]) Kit.add(b, Kit.box(0.2, 0.055, 0.03), M.glow(0xffc060, 1.4), x, -1.04, -2.32);
    // Zombie plow welded to the bumper.
    Kit.add(b, Kit.box(2.2, 0.4, 0.12), steel, 0, -2.15, -4.72, -0.5, 0, 0);
    for (const s of [-1, 1]) Kit.add(b, Kit.box(1.15, 0.4, 0.12), steel, s * 1.0, -2.15, -4.6, -0.5, s * 0.35, 0);
    // Hazard-striped top edge on the plow.
    Kit.add(b, Kit.box(2.24, 0.12, 0.14), hazard, 0, -1.99, -4.8, -0.5, 0, 0);
    for (let i = -3; i <= 3; i++) Kit.add(b, Kit.cone(0.05, 0.3, 4), rust, i * 0.3, -1.95, -4.86, -1.1, 0, 0);
    // Spray-painted hood text, readable from the bed.
    const txt = new THREE.Group();
    txt.position.set(0, -1.835, -4.25);
    txt.rotation.x = -Math.PI / 2;
    addText(txt, 'NOT TODAY', M.lam(0xece4d4, 'none'), 0, 0, 0, 0.045, 0.01);
    b.add(txt);
    // Bed floor, tailgate and cargo (only seen when looking back).
    Kit.add(b, Kit.box(1.8, 0.06, 2.7), M.lam(0x56585c, 'corrugated', 1.6, 0.9), 0, -1.88, 0.55);
    Kit.add(b, Kit.box(1.9, 0.45, 0.1), paint, 0, -1.66, 1.92);
    Kit.add(b, Kit.box(1.92, 0.08, 0.12), hazard, 0, -1.42, 1.92);
    Kit.add(b, Kit.box(0.4, 0.5, 0.25), M.lam(0xb82a1a, 'metal', 1.6, 0.7), -0.65, -1.6, 1.4);
    Kit.add(b, Kit.box(0.4, 0.5, 0.25), M.lam(0x3e622c, 'metal', 1.6, 0.7), -0.65, -1.6, 1.1);
    Kit.add(b, Kit.box(0.55, 0.3, 0.32), M.lam(0x56663a, 'metal', 1.6, 0.5), 0.55, -1.7, 1.35);
    Kit.add(b, Kit.cyl(0.32, 0.32, 0.2, 10), dark, 0.5, -1.76, 0.4, 0, 0, 0);
    // ART: PIXEL WORLD: the pickup painted (its own atlas, 48 texels a metre); the lamps stay classic.
    if (pixelWorld(this.world)) paintTruck(b);
    bake(b);
    this.body.add(b);
  }

  private buildGun() {
    const metal = M.lam(0x3a3d44, 'metal', 2, 0.7);
    const dark = M.lam(0x1c1d22, 'metal', 2, 0.5);
    const olive = M.lam(0x56663a, 'metal', 2, 0.6);
    const brass = M.lam(0xd8aa44, 'none');
    // Pedestal from the bed floor (only its top shows when looking down).
    this.mount.position.set(0.32, -0.74, -0.55);
    Kit.add(this.mount, Kit.cyl(0.06, 0.08, 1.0, 8), metal, 0, -0.55, 0);
    this.mount.add(this.gun);
    const g = this.gun;
    g.rotation.order = 'YXZ';
    const st = new THREE.Group();
    g.add(st);
    // Cradle + receiver + spade grips.
    Kit.add(st, Kit.box(0.34, 0.08, 0.3), metal, 0, -0.07, 0);
    Kit.add(st, Kit.box(0.3, 0.18, 0.62), dark, 0, 0.04, -0.12);
    Kit.add(st, Kit.box(0.32, 0.04, 0.5), metal, 0, 0.15, -0.1);
    for (const s of [-1, 1]) Kit.add(st, Kit.box(0.04, 0.16, 0.05), dark, s * 0.09, 0.0, 0.26);
    // Ammo can + belt feeding the left barrel.
    Kit.add(st, Kit.box(0.16, 0.18, 0.3), olive, -0.27, -0.02, -0.08);
    for (let i = 0; i < 4; i++) Kit.add(st, Kit.box(0.08, 0.02, 0.04), brass, -0.17, 0.08 - i * 0.02, -0.08 + i * 0.05, 0, 0, 0.4);
    // Front sight post.
    Kit.add(st, Kit.box(0.02, 0.07, 0.02), dark, 0, 0.21, -0.32);
    bake(st);
    // Twin barrels.
    for (const s of [-1, 1]) {
      const bg = new THREE.Group();
      bg.position.set(s * 0.085, 0.05, -0.42);
      g.add(bg);
      const bs = new THREE.Group();
      bg.add(bs);
      Kit.add(bs, Kit.cyl(0.05, 0.05, 0.5, 10), metal, 0, 0, -0.25, Math.PI / 2, 0, 0);
      for (let i = 0; i < 4; i++) Kit.add(bs, Kit.cyl(0.056, 0.056, 0.03, 10), dark, 0, 0, -0.08 - i * 0.12, Math.PI / 2, 0, 0);
      bake(bs);
      const barrel = Kit.add(bg, Kit.cyl(0.026, 0.026, 0.62, 8), metal, 0, 0, -0.8, Math.PI / 2, 0, 0);
      const brake = Kit.add(bg, Kit.cyl(0.04, 0.04, 0.12, 8), metal, 0, 0, -1.14, Math.PI / 2, 0, 0);
      this.heatParts.push(barrel, brake);
      const flash = new THREE.Group();
      flash.position.set(0, 0, -1.24);
      bg.add(flash);
      const fm = M.glow(0xffd27a, 2.2);
      Kit.add(flash, Kit.cone(0.07, 0.34, 5), fm, 0, 0, -0.14, -Math.PI / 2, 0, 0);
      Kit.add(flash, Kit.box(0.34, 0.035, 0.02), fm, 0, 0, -0.04);
      Kit.add(flash, Kit.box(0.035, 0.34, 0.02), fm, 0, 0, -0.04);
      Kit.add(flash, Kit.sphere(0.05, 6, 4), M.glow(0xffffff, 2.5), 0, 0, -0.03);
      bake(flash);
      flash.visible = false;
      this.barrels.push(bg);
      this.flashes.push(flash);
    }
  }

  private aimAt(x: number, y: number) {
    const w = this.world;
    const { width, height } = w.viewport;
    const cam = w.camera;
    this.ray.set((x / width) * 2 - 1, -(y / height) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize();
    // Target 30 m down the ray, in the mount's frame.
    _v.copy(cam.position).addScaledVector(this.ray, 30);
    this.mount.updateWorldMatrix(true, false);
    this.mount.worldToLocal(_v);
    // Undo the mount's own rotation (gun rotates inside mount which is aligned with the holder).
    this.aimYaw = Math.atan2(-_v.x, -_v.z);
    this.aimPitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    this.aimHold = 0.55;
  }

  private onShot() {
    const i = this.next;
    this.next = 1 - this.next;
    this.flashT[i] = 0.045;
    this.recoil[i] = Math.min(0.11, this.recoil[i] + 0.07);
    const f = this.flashes[i];
    f.rotation.z = this.world.rng.next() * Math.PI;
    f.scale.setScalar(0.8 + this.world.rng.next() * 0.5);
    this.shots++;
    // Tracer from the muzzle along the gun's current heading (every other round).
    if (this.shots % 2 === 0) {
      let tr: (typeof this.tracers)[number] | null = null;
      for (const t of this.tracers) {
        if (t.life <= 0) {
          tr = t;
          break;
        }
      }
      if (tr) {
        f.getWorldPosition(_v);
        f.getWorldQuaternion(_q);
        _w.set(0, 0, -1).applyQuaternion(_q);
        tr.mesh.position.copy(_v).addScaledVector(_w, 1.4);
        tr.mesh.quaternion.copy(_q);
        tr.vel.copy(_w).multiplyScalar(240);
        tr.life = 0.16;
        tr.mesh.visible = true;
      }
    }
    if (this.shots % 2 === 1) {
      this.gun.getWorldPosition(_v);
      _v.y += 0.12;
      this.world.fx.gibs(_v, 0xd4a640, 1, 0.022);
    }
  }

  update(dt: number) {
    const w = this.world;
    const rig = w.rig;
    const holder = rig.viewModelHolder;
    this.time += dt;
    // Body aligned with the vehicle; engine rumble + bumps on broken asphalt.
    this.body.rotation.y = angleDelta(holder.rotation.y, rig.space.rotation.y);
    const moving = Math.min(1, rig.speed / 12);
    this.bump = Math.max(0, this.bump - dt * 3);
    if (moving > 0.3 && w.rng.chance(dt * 0.9)) this.bump = 0.5 + w.rng.next() * 0.5;
    const rumble = Math.sin(this.time * 51) * 0.004 * (0.4 + moving) + Math.sin(this.time * 9) * this.bump * 0.018;
    this.body.position.y = rumble;
    this.body.rotation.z = Math.sin(this.time * 1.6) * 0.007 * moving;

    // Gun: follow the camera pitch at rest; swing toward taps while firing.
    this.aimHold -= dt;
    const camPitch = w.camera.rotation.x;
    const ty = this.aimHold > 0 ? clamp(this.aimYaw, -1.1, 1.1) : 0;
    const tp = this.aimHold > 0 ? clamp(this.aimPitch, -0.5, 0.7) : camPitch + 0.05;
    const k = 1 - Math.exp(-(this.aimHold > 0 ? 18 : 5) * dt);
    this.yaw += (ty - this.yaw) * k;
    this.pitch += (tp - this.pitch) * k;
    this.gun.rotation.set(this.pitch + rumble * 2, this.yaw, 0);
    for (let i = 0; i < 2; i++) {
      this.recoil[i] = Math.max(0, this.recoil[i] - dt * 0.9);
      this.barrels[i].position.z = -0.42 + this.recoil[i];
      this.flashT[i] -= dt;
      this.flashes[i].visible = this.flashT[i] > 0;
    }
    // Heat glow.
    const heat = w.weapons.active === 'turret' ? w.weapons.heat : 0;
    const level = w.weapons.overheated ? 3 : heat > 0.8 ? 2 : heat > 0.55 ? 1 : heat > 0.3 ? 0 : -1;
    const mat = level < 0 ? this.coolMat : this.heatMats[level];
    for (const p of this.heatParts) if (p.material !== mat) p.material = mat;
    if (w.weapons.overheated) {
      this.steamT -= dt;
      if (this.steamT <= 0) {
        this.steamT = 0.12;
        this.flashes[0].getWorldPosition(_v);
        w.fx.dust(_v, 0.25, 0xe8e8e8);
      }
    }
    // Tracers.
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.position.addScaledVector(t.vel, dt);
      if (t.life <= 0) t.mesh.visible = false;
    }
  }

  dispose() {
    this.disposed = true;
    this.offShot?.();
    this.offShot = null;
    const hud = this.world.hud;
    if (this.wrapper && hud.shotFired === this.wrapper && this.origShotFired) hud.shotFired = this.origShotFired;
    for (const t of this.tracers) t.mesh.parent?.remove(t.mesh);
    this.root.parent?.remove(this.root);
  }
}

/**
 * ART: PIXEL WORLD: re-emit the pickup's parts with painted modules (battered paint, the NOT TODAY
 * hood, the roof, the windscreen, bed floor, hazard tape, welded steel) and drop the classic meshes
 * (glows stay: the light bar, the mirror glass).
 */
function paintTruck(b: THREE.Group) {
  const atlas = new PwAtlas('z3-truck', { levels: 3 });
  const t = {
    paint: z3TruckPaint(atlas),
    red: z3TruckPaint(atlas, 0xb82a1a),
    green: z3TruckPaint(atlas, 0x3e622c),
    olive: z3TruckPaint(atlas, 0x56663a),
    hood: z3TruckHood(atlas),
    roof: z3TruckRoof(atlas),
    glass: z3TruckGlass(atlas),
    bed: z3TruckBed(atlas),
    hazard: z3TruckHazard(atlas),
    steel: z3TruckSteel(atlas),
    dark: z3TruckSteel(atlas, 0x26272c),
    rust: z3TruckSteel(atlas, 0x7a4024),
    tail: z3TruckTailgate(atlas),
  };
  const batch = new PwBatch(atlas);
  const drop: THREE.Mesh[] = [];
  const near = (a: number, x: number) => Math.abs(a - x) < 0.02;
  b.updateMatrixWorld(true);
  for (const c of b.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh) continue;
    const mat = m.material as THREE.MeshLambertMaterial;
    if ((mat as unknown as THREE.MeshBasicMaterial).isMeshBasicMaterial) continue;
    drop.push(m);
    if (m.userData.pwText) continue;
    const hex = mat.color.getHex();
    batch.setMatrix(m.matrix);
    const g = m.geometry as THREE.BoxGeometry & THREE.CylinderGeometry;
    if (g.type === 'CylinderGeometry') {
      const d = (g as THREE.CylinderGeometry).parameters;
      cylinder(batch, new THREE.Vector3(0, -d.height / 2, 0), new THREE.Vector3(0, d.height / 2, 0), d.radiusBottom, d.radiusTop, Math.max(6, d.radialSegments), hex === 0x26272c ? t.dark : t.steel, { capB: hex === 0x26272c ? t.dark : t.steel });
      continue;
    }
    if (g.type === 'ConeGeometry') {
      batch.geometry(g, new THREE.Matrix4(), t.rust);
      continue;
    }
    const d = (g as THREE.BoxGeometry).parameters;
    const all = (tile: typeof t.paint) => ({ px: tile, nx: tile, pz: tile, nz: tile, py: tile, ny: tile });
    if (hex === 0x962a20) {
      if (near(d.width, 1.84) && near(d.height, 0.3)) box(batch, 0, 0, 0, d.width, d.height, d.depth, { ...all(t.paint), py: t.hood });
      else if (near(d.width, 1.8) && near(d.height, 0.1)) box(batch, 0, 0, 0, d.width, d.height, d.depth, { ...all(t.paint), py: t.roof });
      else if (near(d.width, 1.9) && near(d.height, 0.45)) box(batch, 0, 0, 0, d.width, d.height, d.depth, { ...all(t.paint), pz: t.tail, nz: t.tail }, { nz: { flipU: true } });
      else box(batch, 0, 0, 0, d.width, d.height, d.depth, all(t.paint));
    } else if (hex === 0x74726a || hex === 0x5a0c08) {
      // (Primer patches and blood: painted into the hood / roof.)
    } else if (hex === 0x1a2230) box(batch, 0, 0, 0, d.width, d.height, d.depth, { ...all(t.dark), py: t.glass });
    else if (hex === 0x56585c) box(batch, 0, 0, 0, d.width, d.height, d.depth, { ...all(t.steel), py: t.bed });
    else if (hex === 0xe8b420) box(batch, 0, 0, 0, d.width, d.height, d.depth, all(t.hazard));
    else if (hex === 0xb82a1a) box(batch, 0, 0, 0, d.width, d.height, d.depth, all(t.red));
    else if (hex === 0x3e622c) box(batch, 0, 0, 0, d.width, d.height, d.depth, all(t.green));
    else if (hex === 0x56663a) box(batch, 0, 0, 0, d.width, d.height, d.depth, all(t.olive));
    else if (hex === 0x26272c) box(batch, 0, 0, 0, d.width, d.height, d.depth, all(t.dark));
    else box(batch, 0, 0, 0, d.width, d.height, d.depth, all(t.steel));
  }
  for (const m of drop) b.remove(m);
  batch.setMatrix(null);
  const mesh = batch.build(undefined, { gain: 1 });
  if (mesh) b.add(mesh);
}

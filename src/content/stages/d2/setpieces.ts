import * as THREE from 'three';
import type { World } from '../../../gameplay/World';
import { Destructible } from '../../../gameplay/Props';
import { Kit } from '../../kit/ModelKit';
import { clamp, easeOutCubic } from '../../../core/math';
import { bake, bakeInto, glow, mat } from './bake';
import { box, pipe } from './build';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// ─── Doors that enemies burst through ──────────────────────────────────────

export interface DoorOpts {
  /** World position of the bottom of the hinge edge. */
  hinge: THREE.Vector3;
  w: number;
  h: number;
  /** Closed-panel yaw: the panel extends along its local +X from the hinge. */
  yaw: number;
  /** +1 / -1: which way the door swings (sign of the yaw change). */
  swing: 1 | -1;
  /** 'swing' = slams open on its hinge, 'blast' = torn off and thrown into the room. */
  kind: 'swing' | 'blast';
  style: 'wood' | 'steel' | 'lab';
}

/**
 * A closed door panel. When an enemy runs into it (spawned behind it with a
 * 'burst' entry) — or when the script calls `burst()` — it slams open or is
 * ripped off its hinges with a crash, debris and a camera kick.
 */
export class BurstDoor {
  readonly root = new THREE.Group();
  private panel = new THREE.Group();
  private open = false;
  private t = 0;
  private center = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private spin = 0;
  private landed = false;

  constructor(readonly o: DoorOpts) {
    this.root.position.copy(o.hinge);
    this.root.rotation.y = o.yaw;
    this.root.add(this.panel);
    const body = o.style === 'wood' ? mat(0x6a4a30, 'planks', 1.5) : o.style === 'lab' ? mat(0xd0d6da, 'metal', 1.5, 0.5) : mat(0x8a9098, 'metal', 1.2);
    const trim = o.style === 'wood' ? mat(0x3a281a) : mat(0x4a5058, 'metal', 2);
    bakeInto(this.panel, (g) => {
      box(g, body, o.w / 2, o.h / 2, 0, o.w - 0.04, o.h - 0.02, 0.09);
      box(g, trim, o.w - 0.16, o.h * 0.48, 0.07, 0.08, 0.3, 0.06);
      if (o.style === 'lab') {
        box(g, mat(0x1a2a34), o.w / 2, o.h * 0.68, 0.03, o.w * 0.5, o.h * 0.25, 0.08);
        box(g, mat(0xffc020, 'hazard', 2), o.w / 2, 0.2, 0.05, o.w - 0.06, 0.28, 0.04);
      } else if (o.style === 'steel') {
        for (let i = 0; i < 3; i++) box(g, trim, o.w / 2, 0.5 + i * (o.h - 1) / 2, 0.06, o.w - 0.1, 0.07, 0.04);
        box(g, mat(0x9ad0ff, undefined, 1, 1), o.w / 2, o.h * 0.72, 0.05, 0.4, 0.4, 0.04);
      } else {
        box(g, trim, o.w / 2, o.h * 0.75, 0.05, o.w * 0.7, 0.06, 0.04);
        box(g, trim, o.w / 2, o.h * 0.3, 0.05, o.w * 0.7, 0.06, 0.04);
      }
    });
    // Door centre (world) and the normal pointing to the side the panel swings toward.
    this.center.set(o.w / 2, o.h / 2, 0).applyAxisAngle(_v.set(0, 1, 0), o.yaw).add(o.hinge);
    this.normal.set(0, 0, 1).applyAxisAngle(_v.set(0, 1, 0), o.yaw).multiplyScalar(-o.swing);
  }

  get isOpen() {
    return this.open;
  }

  burst(world: World) {
    if (this.open) return;
    this.open = true;
    this.t = 0;
    const heavy = this.o.style !== 'wood';
    world.audio.play('door', { volume: 1, pitch: heavy ? 0.7 : 1, vary: 0.1 });
    world.audio.play(heavy ? 'metal_clang' : 'wood_break', { volume: 0.9, vary: 0.15 });
    world.fx.debris(_w.copy(this.center), heavy ? 0x8a9098 : 0x6a4a30);
    world.fx.dust(_w.copy(this.center).setY(0.2), 1.2, 0x9a9488);
    const d = this.center.distanceTo(world.camera.position);
    world.rig.shake(clamp(0.55 - d / 40, 0.12, 0.45));
    if (this.o.kind === 'blast') {
      this.vel.copy(this.normal).multiplyScalar(5.5).setY(2.2);
      this.spin = world.rng.spread(4);
    }
  }

  update(dt: number, world: World) {
    if (!this.open) {
      for (const e of world.enemies()) {
        if (e.state === 'dying' || e.frame !== 'world') continue;
        e.root.getWorldPosition(_v);
        const dx = _v.x - this.center.x;
        const dz = _v.z - this.center.z;
        if (dx * dx + dz * dz < 1.6 * 1.6) {
          this.burst(world);
          break;
        }
      }
      return;
    }
    this.t += dt;
    if (this.o.kind === 'swing') {
      // Slam open with an overshoot and a couple of rattling bounces.
      const k = this.t;
      const target = 1.75;
      const a = target * (1 - Math.exp(-k * 9) * Math.cos(k * 16));
      this.root.rotation.y = this.o.yaw + this.o.swing * a;
      return;
    }
    if (this.landed) return;
    // Blast: torn off, tumbling into the room, sliding to a stop on the floor.
    this.vel.y -= 18 * dt;
    this.root.position.addScaledVector(this.vel, dt);
    this.panel.rotation.x = Math.min(this.panel.rotation.x + dt * 5.5, Math.PI / 2 - 0.02);
    this.root.rotation.y += this.spin * dt;
    if (this.root.position.y <= 0.05) {
      this.root.position.y = 0.05;
      this.vel.multiplyScalar(0.35);
      this.vel.y = Math.abs(this.vel.y) > 2 ? Math.abs(this.vel.y) * 0.3 : 0;
      if (this.vel.lengthSq() < 0.2) {
        this.landed = true;
        this.panel.rotation.x = Math.PI / 2 - 0.02;
        world.audio.play('metal_clang', { volume: 0.6, pitch: 0.6 });
        world.fx.dust(_w.copy(this.root.position), 1, 0x9a9488);
      }
    }
  }
}

// ─── Glass enclosure walls ────────────────────────────────────────────────

export interface GlassOpts {
  /** Bottom-centre of the pane (world). */
  center: THREE.Vector3;
  w: number;
  h: number;
  /** Pane yaw: the pane spans its local X; its normal is local Z. */
  yaw: number;
  tint?: number;
  /** Auto-shatter when an enemy runs into it. */
  proximity?: boolean;
}

/**
 * Thick containment glass in a steel frame. `crack()` spiders it, `shatter()`
 * blows it out (shard burst, crash, shake) leaving jagged teeth in the frame.
 * Enemies running into it shatter it automatically.
 */
export class GlassWall {
  readonly root = new THREE.Group();
  private pane: THREE.Mesh;
  private cracks = new THREE.Group();
  private teeth = new THREE.Group();
  broken = false;
  private crackLevel = 0;
  private c = new THREE.Vector3();

  constructor(readonly o: GlassOpts, glassMat: THREE.Material) {
    this.root.position.copy(o.center);
    this.root.rotation.y = o.yaw;
    const { w, h } = o;
    this.pane = Kit.add(this.root, Kit.box(w, h, 0.08), glassMat, 0, h / 2, 0);
    this.pane.renderOrder = 2;
    // Steel frame.
    const steel = mat(0x5a6068, 'metal', 1.5);
    bakeInto(this.root, (g) => {
      box(g, steel, 0, 0.1, 0, w + 0.3, 0.2, 0.3);
      box(g, steel, 0, h, 0, w + 0.3, 0.24, 0.3);
      box(g, steel, -w / 2 - 0.08, h / 2, 0, 0.16, h, 0.3);
      box(g, steel, w / 2 + 0.08, h / 2, 0, 0.16, h, 0.3);
      // Bolts.
      for (let i = 0; i < 6; i++) {
        const x = -w / 2 + (i + 0.5) * (w / 6);
        box(g, mat(0x2a2e34), x, 0.1, 0.16, 0.06, 0.06, 0.04);
        box(g, mat(0x2a2e34), x, h, 0.16, 0.06, 0.06, 0.04);
      }
    });
    // Crack lines (hidden until crack()).
    const crackMat = glow(0xe0f4ff, 1.2);
    const rays = 9;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + 0.3 * Math.sin(i * 7.1);
      const len = (0.6 + 0.5 * Math.abs(Math.sin(i * 3.7))) * Math.min(w, h) * 0.45;
      Kit.add(this.cracks, Kit.box(len, 0.025, 0.1), crackMat, Math.cos(a) * len * 0.5, h * 0.48 + Math.sin(a) * len * 0.5, 0.0, 0, 0, a);
    }
    for (let i = 0; i < 2; i++) {
      const r = 0.35 + i * 0.4;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        Kit.add(this.cracks, Kit.box(r * 0.8, 0.02, 0.1), crackMat, Math.cos(a) * r, h * 0.48 + Math.sin(a) * r, 0, 0, 0, a + Math.PI / 2);
      }
    }
    bake(this.cracks);
    this.cracks.visible = false;
    this.root.add(this.cracks);
    // Jagged shards left in the frame.
    const shard = Kit.mat(o.tint ?? 0xa8d8f0, { transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const n = Math.max(4, Math.round(w / 0.7));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * (w / n);
      const hb = 0.3 + Math.abs(Math.sin(i * 2.7)) * 0.7;
      const ht = 0.25 + Math.abs(Math.cos(i * 1.9)) * 0.6;
      Kit.add(this.teeth, Kit.cone(w / n / 2, hb, 3), shard, x, 0.2 + hb / 2, 0, 0, 0, 0, 1, 1, 0.1);
      Kit.add(this.teeth, Kit.cone(w / n / 2, ht, 3), shard, x, h - ht / 2, 0, Math.PI, 0, 0, 1, 1, 0.1);
    }
    bake(this.teeth);
    this.teeth.visible = false;
    this.root.add(this.teeth);
    this.c.copy(o.center).setY(o.center.y + h / 2);
  }

  /** Spider-web cracks (a warning before something comes through). */
  crack(world: World) {
    if (this.broken) return;
    this.crackLevel++;
    this.cracks.visible = true;
    this.cracks.scale.setScalar(Math.min(1.6, 0.6 + this.crackLevel * 0.45));
    world.audio.play('glass', { volume: 0.45, pitch: 0.6 + this.crackLevel * 0.1, vary: 0.05 });
    world.audio.play('hit_world', { volume: 0.8, pitch: 0.5 });
    world.rig.shake(0.18);
    world.fx.sparkle(_v.copy(this.c), 0xd8f0ff);
  }

  shatter(world: World, from?: THREE.Vector3) {
    if (this.broken) return;
    this.broken = true;
    this.pane.visible = false;
    this.cracks.visible = false;
    this.teeth.visible = true;
    const { w, h } = this.o;
    const n = Math.max(3, Math.round(w / 1.5));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 2; j++) {
        _v.set(-w / 2 + (i + 0.5) * (w / n), h * (0.3 + j * 0.4), 0);
        this.root.localToWorld(_v);
        world.fx.gibs(_v, 0xcfeaff, 5, 0.09);
        if ((i + j) % 2 === 0) world.fx.sparkle(_v, 0xd8f0ff);
      }
    }
    if (from) world.fx.dust(_v.copy(from).setY(0.3), 1.6, 0xa0a8b0);
    world.audio.play('glass', { volume: 1, pitch: 0.8, vary: 0.1 });
    world.audio.play('crash', { volume: 0.7, pitch: 0.8, vary: 0.1 });
    const d = this.c.distanceTo(world.camera.position);
    world.rig.shake(clamp(0.8 - d / 30, 0.2, 0.6));
    world.hitStop(0.04);
  }

  update(world: World) {
    if (this.broken || !this.o.proximity) return;
    const nx = Math.sin(this.o.yaw);
    const nz = Math.cos(this.o.yaw);
    for (const e of world.enemies()) {
      if (e.state === 'dying' || e.frame !== 'world' || e.isBoss) continue;
      e.root.getWorldPosition(_v).sub(this.c);
      const across = _v.x * nx + _v.z * nz;
      const along = _v.x * nz - _v.z * nx;
      if (Math.abs(across) < 1.1 && Math.abs(along) < this.o.w / 2 + 0.3) {
        e.root.getWorldPosition(_w);
        this.shatter(world, _w);
        return;
      }
    }
  }
}

// ─── Propane tanks ────────────────────────────────────────────────────────

/** Shootable propane cylinder: big explosion that clears raptors around it. */
export function propaneTank(world: World, pos: THREE.Vector3): Destructible {
  const g = new THREE.Group();
  bakeInto(g, (b) => {
    Kit.add(b, Kit.cyl(0.3, 0.3, 1.05, 10), mat(0xdcdcd4, 'metal', 2, 0.4), 0, 0.62, 0);
    Kit.add(b, Kit.sphere(0.3, 10, 5), mat(0xdcdcd4, 'metal', 2, 0.4), 0, 1.14, 0, 0, 0, 0, 1, 0.5, 1);
    Kit.add(b, Kit.cyl(0.32, 0.32, 0.12, 10), mat(0xc02a1e), 0, 0.12, 0);
    Kit.add(b, Kit.cyl(0.31, 0.31, 0.1, 10), mat(0xc02a1e), 0, 0.92, 0);
    Kit.add(b, Kit.cyl(0.06, 0.06, 0.18, 6), mat(0x8a8a40), 0, 1.33, 0);
    Kit.add(b, Kit.box(0.24, 0.05, 0.05), mat(0xc02a1e), 0, 1.43, 0);
    box(b, glow(0xffd23a, 0.9), 0, 0.62, 0.3, 0.26, 0.3, 0.02);
  });
  return new Destructible(world, { model: g, pos, hp: 1, points: 250, explode: { radius: 5.5, damage: 12 } });
}

// ─── The skeleton display ─────────────────────────────────────────────────

interface Chunk {
  obj: THREE.Group;
  from: THREE.Vector3;
  fromQ: THREE.Quaternion;
  to: THREE.Vector3;
  toQ: THREE.Quaternion;
  delay: number;
  dur: number;
  arc: number;
  landed: boolean;
  heavy: number;
}

/**
 * A rearing theropod skeleton on a granite plinth (lobby centrepiece). On cue
 * its armature snaps and it comes down in pieces — ribcage onto the plinth,
 * the giant skull crashing to the floor in front of the player — crushing
 * anything standing underneath.
 */
export class SkeletonDisplay {
  readonly root = new THREE.Group();
  private chunks: Chunk[] = [];
  private t = -1;
  private crushed = false;
  private skull!: THREE.Group;

  constructor(pos: THREE.Vector3, yaw: number) {
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;
    this.buildPlinth();
    this.buildBones();
  }

  private buildPlinth() {
    const g = new THREE.Group();
    const granite = mat(0x34343c, 'concrete', 1, 0.5);
    box(g, granite, 0, 0.4, 0, 14, 0.8, 5.4);
    box(g, mat(0x24242a), 0, 0.86, 0, 14.3, 0.12, 5.7);
    box(g, mat(0xb08a3a, 'metal', 2, 0.5), 1.5, 0.45, 2.71, 1.6, 0.5, 0.04);
    // Rope stanchions around the display.
    const brass = mat(0xc0a050, 'metal', 2, 0.4);
    const rope = mat(0x8a1a1e, 'cloth', 2);
    const posts: [number, number][] = [
      [-7.6, 3.4],
      [-3, 3.6],
      [1.6, 3.6],
      [6.2, 3.4],
      [7.8, 0],
    ];
    for (const [x, z] of posts) {
      Kit.add(g, Kit.cyl(0.05, 0.05, 1.0, 6), brass, x, 0.5, z);
      Kit.add(g, Kit.cyl(0.18, 0.2, 0.06, 8), brass, x, 0.03, z);
    }
    for (let i = 0; i + 1 < posts.length; i++) {
      const [x0, z0] = posts[i];
      const [x1, z1] = posts[i + 1];
      pipe(g, rope, new THREE.Vector3(x0, 0.9, z0), new THREE.Vector3((x0 + x1) / 2, 0.72, (z0 + z1) / 2), 0.03, 5);
      pipe(g, rope, new THREE.Vector3((x0 + x1) / 2, 0.72, (z0 + z1) / 2), new THREE.Vector3(x1, 0.9, z1), 0.03, 5);
    }
    bake(g);
    this.root.add(g);
  }

  private chunk(build: (g: THREE.Group) => void, pivot: THREE.Vector3, rest: { to: [number, number, number]; rot: [number, number, number]; delay: number; dur: number; arc?: number; heavy?: number }): THREE.Group {
    const holder = new THREE.Group();
    holder.position.copy(pivot);
    this.root.add(holder);
    const tmp = new THREE.Group();
    tmp.position.copy(pivot).negate();
    const inner = new THREE.Group();
    inner.add(tmp);
    build(tmp);
    bake(inner);
    holder.add(inner);
    const toQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rest.rot[0], rest.rot[1], rest.rot[2]));
    this.chunks.push({
      obj: holder,
      from: holder.position.clone(),
      fromQ: holder.quaternion.clone(),
      to: new THREE.Vector3(...rest.to),
      toQ,
      delay: rest.delay,
      dur: rest.dur,
      arc: rest.arc ?? 0.3,
      landed: false,
      heavy: rest.heavy ?? 0.5,
    });
    return holder;
  }

  private buildBones() {
    const bone = mat(0xd8cba8, 'stucco', 2, 0.35);
    const boneDark = mat(0xb4a684, 'stucco', 2, 0.35);
    const tooth = mat(0xf2ead8);
    const socket = mat(0x1a1410);
    const steel = mat(0x2a2c32, 'metal', 2);
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const rod = (g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, m = bone) => {
      pipe(g, m, a, b, r, 6);
      Kit.add(g, Kit.sphere(r * 1.5, 6, 4), m, b.x, b.y, b.z);
    };
    const vertebra = (g: THREE.Object3D, p: THREE.Vector3, s: number, tilt: number) => {
      Kit.add(g, Kit.box(0.34 * s, 0.3 * s, 0.32 * s), bone, p.x, p.y, p.z, 0, 0, tilt);
      Kit.add(g, Kit.box(0.1 * s, 0.55 * s, 0.08 * s), boneDark, p.x - 0.05 * s, p.y + 0.38 * s, p.z, 0, 0, tilt + 0.25);
      Kit.add(g, Kit.box(0.08 * s, 0.06 * s, 0.6 * s), boneDark, p.x, p.y + 0.05 * s, p.z, 0, 0, tilt);
    };

    // Skull + jaw (pivot at the skull centre).
    const skullC = V(5.3, 6.0, 0);
    this.skull = this.chunk(
      (g) => {
        const s = new THREE.Group();
        s.position.copy(skullC);
        s.rotation.z = -0.18;
        g.add(s);
        // Cranium, snout, brow, cheek bones.
        Kit.add(s, Kit.box(0.95, 0.85, 0.78), bone, -0.25, 0.1, 0);
        Kit.add(s, Kit.box(1.0, 0.55, 0.56), bone, 0.6, -0.02, 0, 0, 0, -0.08);
        Kit.add(s, Kit.box(0.5, 0.38, 0.44), bone, 1.08, -0.08, 0, 0, 0, -0.12);
        Kit.add(s, Kit.box(0.7, 0.16, 0.9), boneDark, -0.2, 0.5, 0);
        for (const sz of [-1, 1]) {
          Kit.add(s, Kit.box(0.26, 0.24, 0.06), socket, -0.15, 0.18, sz * 0.38);
          Kit.add(s, Kit.box(0.32, 0.22, 0.06), socket, 0.35, 0.02, sz * 0.27);
          Kit.add(s, Kit.box(0.12, 0.08, 0.05), socket, 1.25, 0.06, sz * 0.14);
          for (let i = 0; i < 6; i++) Kit.add(s, Kit.cone(0.045, 0.2 - i * 0.012, 4), tooth, 0.15 + i * 0.19, -0.38, sz * 0.22, Math.PI, 0, 0);
        }
        // Jaw hanging open.
        const jaw = new THREE.Group();
        jaw.position.set(-0.4, -0.3, 0);
        jaw.rotation.z = -0.42;
        s.add(jaw);
        Kit.add(jaw, Kit.box(1.55, 0.22, 0.5), bone, 0.72, -0.1, 0);
        for (const sz of [-1, 1]) for (let i = 0; i < 5; i++) Kit.add(jaw, Kit.cone(0.04, 0.17, 4), tooth, 0.55 + i * 0.2, 0.08, sz * 0.18);
      },
      skullC,
      { to: [3.6, 0.55, 5.6], rot: [0.25, 0.9, -1.25], delay: 0.55, dur: 0.75, arc: 0.4, heavy: 1 },
    );

    // Neck.
    const neckC = V(3.6, 5.6, 0);
    this.chunk(
      (g) => {
        for (let i = 0; i < 5; i++) vertebra(g, V(2.7 + i * 0.4, 5.05 + i * 0.22, 0), 0.9 - i * 0.05, 0.5);
      },
      neckC,
      { to: [2.6, 0.3, 3.6], rot: [0, 0.6, -0.5], delay: 0.7, dur: 0.7, arc: 0.3, heavy: 0.4 },
    );

    // Ribcage + back + tiny arms.
    const ribC = V(1.3, 4.2, 0);
    this.chunk(
      (g) => {
        for (let i = 0; i < 7; i++) {
          const x = 0.1 + i * 0.36;
          const y = 4.35 + i * 0.1;
          vertebra(g, V(x, y, 0), 1, 0.28);
          const drop = 1.5 - Math.abs(i - 3) * 0.16;
          for (const sz of [-1, 1]) {
            // Each rib: out and down, then curving in under the belly.
            const a = V(x, y - 0.05, sz * 0.14);
            const b = V(x + 0.12, y - drop * 0.5, sz * 0.75);
            const c = V(x + 0.22, y - drop, sz * 0.32);
            pipe(g, bone, a, b, 0.05, 5);
            pipe(g, bone, b, c, 0.04, 5);
          }
        }
        for (const sz of [-1, 1]) {
          rod(g, V(2.5, 4.3, sz * 0.4), V(2.75, 3.75, sz * 0.5), 0.05);
          rod(g, V(2.75, 3.75, sz * 0.5), V(3.05, 3.85, sz * 0.5), 0.04);
        }
      },
      ribC,
      { to: [1.2, 1.55, 0.5], rot: [1.25, 0.15, 0.25], delay: 0.35, dur: 0.6, arc: 0.1, heavy: 0.9 },
    );

    // Pelvis (+ hip vertebrae).
    const pelC = V(-0.5, 3.9, 0);
    this.chunk(
      (g) => {
        Kit.add(g, Kit.box(1.5, 0.75, 0.55), bone, -0.5, 3.85, 0, 0, 0, 0.1);
        Kit.add(g, Kit.box(0.4, 1.1, 0.3), boneDark, -0.15, 3.25, 0.2, 0, 0, -0.35);
        Kit.add(g, Kit.box(0.4, 1.1, 0.3), boneDark, -0.15, 3.25, -0.2, 0, 0, -0.35);
        Kit.add(g, Kit.box(0.5, 0.24, 0.7), bone, 0.15, 2.75, 0, 0, 0, -0.3);
        for (let i = 0; i < 3; i++) vertebra(g, V(-1.1 + i * 0.4, 4.25 + i * 0.04, 0), 1.05, 0.15);
      },
      pelC,
      { to: [-0.6, 1.25, 0.4], rot: [0, 0.2, 0.35], delay: 0.25, dur: 0.55, arc: 0.1, heavy: 0.8 },
    );

    // Tail in three pieces.
    const tailPts = [V(-1.4, 4.05, 0), V(-2.8, 3.7, 0), V(-4.2, 3.1, 0), V(-5.6, 2.4, 0), V(-6.9, 1.7, 0), V(-8.1, 1.1, 0), V(-9.0, 0.9, 0)];
    const tailPieces: [number, number, { to: [number, number, number]; rot: [number, number, number]; delay: number }][] = [
      [0, 2, { to: [-2.9, 1.15, 0.7], rot: [0.3, -0.15, 0.1], delay: 0.15 }],
      [2, 4, { to: [-5.8, 0.25, 3.0], rot: [0, -0.5, -0.05], delay: 0.05 }],
      [4, 6, { to: [-8.6, 0.2, 3.6], rot: [0, -0.9, 0], delay: 0.0 }],
    ];
    for (const [a, b, rest] of tailPieces) {
      const c = tailPts[a].clone().add(tailPts[b]).multiplyScalar(0.5);
      this.chunk(
        (g) => {
          for (let i = a; i < b; i++) {
            const p0 = tailPts[i];
            const p1 = tailPts[i + 1];
            const n = 4;
            for (let k = 0; k < n; k++) {
              const p = p0.clone().lerp(p1, k / n);
              vertebra(g, p, 0.95 - i * 0.1, Math.atan2(p1.y - p0.y, p1.x - p0.x));
            }
          }
        },
        c,
        { ...rest, dur: 0.6, arc: 0.2, heavy: 0.5 },
      );
    }

    // Legs.
    const legs: [number, THREE.Vector3[], { to: [number, number, number]; rot: [number, number, number]; delay: number }][] = [
      [0.55, [V(-0.35, 3.8, 0.55), V(0.45, 2.3, 0.55), V(-0.25, 1.15, 0.6), V(0.15, 0.92, 0.6)], { to: [1.0, 0.25, 3.1], rot: [Math.PI / 2, 0.4, 0], delay: 0.4 }],
      [-0.55, [V(-0.6, 3.8, -0.55), V(-0.9, 2.35, -0.55), V(-1.5, 1.2, -0.6), V(-1.1, 0.92, -0.6)], { to: [-1.2, 1.15, -1.0], rot: [-1.2, -0.3, 0.2], delay: 0.45 }],
    ];
    for (const [, pts, rest] of legs) {
      const c = pts[1].clone();
      this.chunk(
        (g) => {
          rod(g, pts[0], pts[1], 0.17);
          rod(g, pts[1], pts[2], 0.13);
          rod(g, pts[2], pts[3], 0.09);
          for (let k = -1; k <= 1; k++) pipe(g, bone, pts[3], pts[3].clone().add(V(0.45, -0.07, k * 0.16)), 0.05, 5);
        },
        c,
        { ...rest, dur: 0.6, arc: 0.25, heavy: 0.6 },
      );
    }

    // Display armature (snaps first).
    const rodC = V(1.5, 2.6, 0);
    this.chunk(
      (g) => {
        pipe(g, steel, V(1.5, 0.86, 0), V(1.5, 3.9, 0), 0.07, 6);
        pipe(g, steel, V(-3.8, 0.86, 0), V(-3.8, 3.1, 0), 0.06, 6);
        pipe(g, steel, V(4.3, 0.86, 0), V(4.3, 5.3, 0), 0.06, 6);
        pipe(g, steel, V(-3.8, 3.1, 0), V(4.3, 5.3, 0), 0.04, 5);
      },
      rodC,
      { to: [1.0, 0.95, -1.8], rot: [-1.45, 0, 0.1], delay: 0.1, dur: 0.6, arc: 0.0, heavy: 0.3 },
    );
  }

  get collapsing() {
    return this.t >= 0;
  }

  /** Start the collapse (call once). */
  collapse(world: World) {
    if (this.t >= 0) return;
    this.t = 0;
    world.audio.play('metal_clang', { volume: 1, pitch: 0.55 });
    world.audio.play('crash', { volume: 0.6, pitch: 0.5 });
    _v.set(1.5, 3.6, 0);
    this.root.localToWorld(_v);
    world.fx.sparks(_v, null, 14);
    world.rig.shake(0.2);
  }

  update(dt: number, world: World) {
    if (this.t < 0) return;
    this.t += dt;
    for (const c of this.chunks) {
      if (c.landed) continue;
      const k = clamp((this.t - c.delay) / c.dur, 0, 1);
      if (k <= 0) {
        // Wobble before letting go.
        const wob = Math.sin(this.t * 30) * 0.015 * clamp(this.t * 3, 0, 1);
        c.obj.rotation.z = wob;
        continue;
      }
      const e = k * k; // gravity-ish acceleration
      c.obj.position.lerpVectors(c.from, c.to, e);
      c.obj.position.y += Math.sin(k * Math.PI) * c.arc;
      c.obj.quaternion.slerpQuaternions(c.fromQ, c.toQ, easeOutCubic(k));
      if (k >= 1) {
        c.landed = true;
        c.obj.position.copy(c.to);
        c.obj.quaternion.copy(c.toQ);
        c.obj.getWorldPosition(_v);
        _v.y = 0.2;
        world.fx.dust(_v, 1 + c.heavy * 2.2, 0xb8ab90);
        world.fx.debris(_v, 0xd8cba8);
        world.audio.play(c.heavy > 0.7 ? 'crash' : 'wood_break', { volume: 0.5 + c.heavy * 0.5, pitch: 0.55 + (1 - c.heavy) * 0.4, vary: 0.1 });
        world.rig.shake(0.12 + c.heavy * 0.4);
        if (c.obj === this.skull) {
          world.audio.play('stomp', { volume: 1, pitch: 0.8 });
          world.hitStop(0.05);
          this.crush(world);
        }
      }
    }
  }

  /** Kill anything standing under the falling bones. */
  private crush(world: World) {
    if (this.crushed) return;
    this.crushed = true;
    const pts = [this.skull.getWorldPosition(new THREE.Vector3()), this.root.localToWorld(new THREE.Vector3(0, 0, 0)), this.root.localToWorld(new THREE.Vector3(-5, 0, 2))];
    for (const e of [...world.enemies()]) {
      if (e.state === 'dying' || e.isBoss) continue;
      e.root.getWorldPosition(_v);
      for (const p of pts) {
        if (Math.hypot(_v.x - p.x, _v.z - p.z) < 3.4) {
          e.die(null);
          world.fx.blood(_v.setY(0.8), null, { amount: 1.5 });
          break;
        }
      }
    }
  }

  /** World position of the skull (for camera looks). */
  skullWorld(out = new THREE.Vector3()) {
    return this.skull.getWorldPosition(out);
  }
}


import * as THREE from 'three';
import { Destructible, explosiveBarrel } from '../../../gameplay/Props';
import type { World } from '../../../gameplay/World';
import { Kit } from '../../kit/ModelKit';
import { bakeMerge } from './bake';
import { FirePlume } from './vfx';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// ─── Diner glass ────────────────────────────────────────────────────────────

/**
 * A big window pane. Shatters when shot OR when a zombie crashes into it
 * (enemies spawned behind it with entry 'burst' charge straight through).
 */
export class GlassPane extends Destructible {
  /** Pane centre (world) and half-extents along its plane (x: normal axis). */
  private c = new THREE.Vector3();
  constructor(
    world: World,
    pos: THREE.Vector3,
    readonly yaw: number,
    readonly width: number,
    readonly height: number,
  ) {
    const g = new THREE.Group();
    const glass = Kit.mesh(Kit.box(width, height, 0.05), Kit.mat(0x9fc8e8, { transparent: true, opacity: 0.22, smooth: true }));
    glass.position.y = height / 2;
    g.add(glass);
    // A couple of glints so the pane reads as glass.
    const glint = Kit.glow(0xcfe6ff, 0.5, true, 0.35);
    Kit.add(g, Kit.box(width * 0.5, 0.05, 0.06), glint, -width * 0.12, height * 0.72, 0, 0, 0, 0.5);
    Kit.add(g, Kit.box(width * 0.3, 0.04, 0.06), glint, width * 0.05, height * 0.6, 0, 0, 0, 0.5);
    g.rotation.y = yaw;
    super(world, { model: g, pos, hp: 1, points: 50, debrisColor: 0xbfe0f5, sfx: 'glass' });
    this.c.copy(pos);
    this.c.y += height / 2;
  }

  override update(dt: number): void {
    super.update(dt);
    // Local frame: pane normal is the model's +Z.
    const nx = Math.sin(this.yaw);
    const nz = Math.cos(this.yaw);
    for (const e of this.world.enemies()) {
      if (e.state === 'dying' || e.frame !== 'world') continue;
      e.root.getWorldPosition(_v).sub(this.c);
      const along = _v.x * nz - _v.z * nx;
      const across = _v.x * nx + _v.z * nz;
      if (Math.abs(across) < 0.75 && Math.abs(along) < this.width / 2 + 0.2) {
        this.destroy();
        return;
      }
    }
  }

  override destroy(): void {
    if (this.removed) return;
    super.destroy();
    const w = this.world;
    // Extra shards spraying outward + a hard crash.
    for (let i = -1; i <= 1; i++) {
      _v.set(Math.cos(this.yaw) * i * this.width * 0.3, 0.4 + Math.abs(i) * 0.5, -Math.sin(this.yaw) * i * this.width * 0.3).add(this.c);
      w.fx.gibs(_v, 0xcfeaff, 4, 0.07);
      w.fx.sparkle(_v, 0xd8f0ff);
    }
    w.audio.play('glass', { volume: 1, vary: 0.1 });
    w.audio.play('crash', { volume: 0.5, vary: 0.2 });
    w.rig.shake(0.15);
  }
}

// ─── Gas station ────────────────────────────────────────────────────────────

/**
 * Pumps, barrels and a propane cage that chain-react. When the first pump
 * goes up the canopy buckles and fires keep burning for the rest of the stage.
 */
export class GasStation {
  readonly canopy = new THREE.Group();
  readonly fires: FirePlume[] = [];
  readonly items: Destructible[] = [];
  private collapse = -1;
  private ignited = false;
  priceGlow: THREE.Object3D[] = [];
  spawnPoints: { pumps: THREE.Vector3[]; barrels: THREE.Vector3[]; propane: THREE.Vector3 } | null = null;
  underGlow: THREE.Object3D[] = [];
  /**
   * Canopy pillars (animated, not merged) with a marker in canopy space just
   * under the roof above each one: when the canopy buckles the pillars crumple
   * so they never poke through it.
   */
  readonly pillars: { mesh: THREE.Object3D; marker: THREE.Object3D; height: number; tilt: number }[] = [];

  constructor(
    /** Canopy centre (world), size and the corner it pivots around when collapsing. */
    readonly center: THREE.Vector3,
    readonly size: [number, number],
    readonly height: number,
  ) {}

  /** Create the shootable pumps, barrels and propane cage (call from stage setup). */
  spawn(world: World, pumps: THREE.Vector3[], barrels: THREE.Vector3[], propane: THREE.Vector3) {
    for (const p of pumps) {
      const g = new THREE.Group();
      Kit.add(g, Kit.box(0.85, 1.75, 0.55), Kit.tex('metal', 0xb82c22, 2, 0.6), 0, 0.875, 0);
      Kit.add(g, Kit.box(0.7, 0.42, 0.05), Kit.glow(0x9fe8ff, 0.9), 0, 1.35, 0.29);
      Kit.add(g, Kit.box(0.7, 0.42, 0.05), Kit.glow(0x9fe8ff, 0.9), 0, 1.35, -0.29);
      Kit.add(g, Kit.box(0.9, 0.18, 0.6), Kit.tex('metal', 0xdedad0, 2, 0.5), 0, 1.84, 0);
      Kit.add(g, Kit.box(0.12, 0.5, 0.12), Kit.mat(0x18181a), 0.5, 0.95, 0.1);
      Kit.add(g, Kit.cyl(0.03, 0.03, 0.9, 5), Kit.mat(0x18181a), 0.56, 0.5, 0.25, 0.5, 0, 0);
      bakeMerge(g);
      const d = new Destructible(world, {
        model: g,
        pos: p,
        hp: 3,
        points: 400,
        explode: { radius: 6.5, damage: 12 },
        onDestroy: (w) => this.ignite(w, p),
      });
      world.add(d);
      this.items.push(d);
    }
    for (const b of barrels) {
      const d = explosiveBarrel(world, b);
      bakeMerge(d.root);
      world.add(d);
      this.items.push(d);
    }
    {
      const g = new THREE.Group();
      const cage = Kit.tex('metal', 0x44474e, 2, 0.6);
      Kit.add(g, Kit.box(1.6, 1.7, 0.9), Kit.tex('grate', 0x30343c, 2, 0.8), 0, 0.85, 0);
      for (let i = 0; i < 3; i++) {
        Kit.add(g, Kit.cyl(0.2, 0.2, 1.1, 8), Kit.tex('metal', 0xd8d8d0, 2, 0.5), -0.5 + i * 0.5, 0.65, 0.05);
      }
      for (let i = 0; i < 6; i++) Kit.add(g, Kit.box(0.04, 1.7, 0.04), cage, -0.78 + i * 0.31, 0.85, 0.47);
      Kit.add(g, Kit.box(1.0, 0.3, 0.03), Kit.glow(0xff5030, 1.1), 0, 1.5, 0.47);
      bakeMerge(g);
      const d = new Destructible(world, {
        model: g,
        pos: propane,
        hp: 2,
        points: 300,
        explode: { radius: 7, damage: 12 },
        onDestroy: (w) => this.ignite(w, propane),
      });
      world.add(d);
      this.items.push(d);
    }
  }

  /** Light the fires near p; first ignition buckles the canopy. */
  ignite(world: World, p: THREE.Vector3) {
    let best: FirePlume | null = null;
    let bd = Infinity;
    for (const f of this.fires) {
      if (f.active) continue;
      const d = f.group.position.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    if (best && bd < 6) best.active = true;
    if (this.ignited) return;
    this.ignited = true;
    for (const o of this.priceGlow) o.visible = false;
    world.later(0.25, () => {
      this.collapse = 0;
      world.audio.play('crash', { volume: 0.9 });
      world.audio.play('explosion', { volume: 0.6, pitch: 0.7 });
      world.rig.shake(0.5);
      world.fx.dust(_w.copy(this.center).setY(0.2), 2.2, 0x55504a);
      // The pillars give way: dust and sparks at their feet and tops.
      for (const p of this.pillars) {
        world.fx.dust(_w.copy(p.mesh.position).setY(0.2), 0.9, 0x55504a);
        world.fx.sparks(_w.setY(p.height * 0.75), null, 6);
      }
      world.later(0.5, () => {
        for (const o of this.underGlow) o.visible = false;
      });
    });
    for (const f of this.fires) f.active = true;
  }

  /** Scripted chain reaction: blow everything still standing, one after another. */
  blowAll(world: World) {
    let i = 0;
    for (const d of this.items) {
      if (d.removed) continue;
      world.later(0.15 + i * 0.32, () => d.destroy());
      i++;
    }
    if (i === 0 && !this.ignited) this.ignite(world, this.center);
  }

  get anyLeft(): boolean {
    return this.items.some((d) => !d.removed);
  }

  /** (Fires are animated by the environment, which also distance-culls them.) */
  update(dt: number) {
    if (this.collapse >= 0 && this.collapse < 1) {
      this.collapse = Math.min(1, this.collapse + dt / 0.9);
      const k = this.collapse;
      // Ease out with a little bounce at the end.
      const e = k < 0.7 ? (k / 0.7) ** 2 : 1 - Math.sin(((k - 0.7) / 0.3) * Math.PI) * 0.12;
      this.canopy.rotation.z = -0.32 * e;
      this.canopy.rotation.x = 0.06 * e;
      this.canopy.updateMatrixWorld(true);
      // Crumple each pillar down to the underside of the sagging roof above it.
      for (const p of this.pillars) {
        p.marker.getWorldPosition(_v);
        const h = Math.max(0.4, Math.min(p.height, _v.y));
        p.mesh.scale.y = h / p.height;
        p.mesh.position.y = h / 2;
        p.mesh.rotation.z = p.tilt * e;
      }
    }
  }
}

// ─── Overturned bus ─────────────────────────────────────────────────────────

/** The crashed bus: rocks when something bangs inside, then its emergency door blows off. */
export class BusWreck {
  readonly group = new THREE.Group();
  readonly door: THREE.Group;
  private shakeT = 0;
  private doorT = -1;
  private doorFrom = new THREE.Vector3();
  private doorVel = new THREE.Vector3();
  private doorSpin = new THREE.Vector3();
  readonly fire: FirePlume;

  constructor(body: THREE.Group, door: THREE.Group, fire: FirePlume) {
    this.group.add(body);
    this.door = door;
    this.fire = fire;
  }

  bang(world: World) {
    this.shakeT = 0.35;
    world.audio.play('door', { volume: 0.9, pitch: 0.7, vary: 0.15 });
    world.audio.play('hit_world', { volume: 0.6, pitch: 0.6 });
    world.rig.shake(0.08);
  }

  blowDoor(world: World) {
    if (this.doorT >= 0) return;
    this.doorT = 0;
    this.door.updateMatrixWorld(true);
    this.door.getWorldPosition(this.doorFrom);
    world.scene.attach(this.door);
    // Fly out along the door's outward normal (+Z of the door) and up.
    _v.set(0, 0, 1).applyQuaternion(this.door.getWorldQuaternion(new THREE.Quaternion()));
    this.doorVel.copy(_v).multiplyScalar(7.5).setY(4.2);
    this.doorSpin.set(4.5, 1.2, 2.0);
    world.audio.play('crash', { volume: 1 });
    world.audio.play('door', { volume: 1, pitch: 0.8 });
    world.rig.shake(0.35);
    world.fx.dust(this.doorFrom, 1.4, 0x6a5a48);
    world.fx.debris(this.doorFrom, 0xd29a16);
  }

  /** (The engine fire is animated by the environment with the other fires.) */
  update(dt: number, world: World) {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT) / 0.35;
      this.group.position.x = Math.sin(this.shakeT * 70) * 0.05 * k;
      this.group.rotation.z = Math.sin(this.shakeT * 55) * 0.012 * k;
    }
    if (this.doorT >= 0 && this.doorT < 3) {
      this.doorT += dt;
      const d = this.door;
      this.doorVel.y -= 16 * dt;
      d.position.addScaledVector(this.doorVel, dt);
      if (d.position.y < 0.08) {
        d.position.y = 0.08;
        if (this.doorVel.y < -2) {
          world.audio.play('hit_world', { volume: 0.8, pitch: 0.5 });
          world.fx.dust(d.position, 0.6);
        }
        this.doorVel.y = Math.abs(this.doorVel.y) * 0.25;
        this.doorVel.x *= 0.5;
        this.doorVel.z *= 0.5;
        this.doorSpin.multiplyScalar(0.4);
        if (Math.abs(this.doorVel.y) < 0.5) {
          // Settle flat.
          d.rotation.x += (Math.PI / 2 - d.rotation.x) * Math.min(1, dt * 10);
        }
      }
      d.rotation.x += this.doorSpin.x * dt;
      d.rotation.y += this.doorSpin.y * dt;
      d.rotation.z += this.doorSpin.z * dt;
    }
  }
}

// ─── Shop doors that burst open (the Butcher's entrance) ────────────────────

export class BurstDoors {
  readonly panels: THREE.Object3D[] = [];
  private t = -1;
  private vel: THREE.Vector3[] = [];
  private spin: number[] = [];

  burst(world: World, toward: THREE.Vector3) {
    if (this.t >= 0) return;
    this.t = 0;
    for (let i = 0; i < this.panels.length; i++) {
      const p = this.panels[i];
      p.updateMatrixWorld(true);
      world.scene.attach(p);
      const dir = _v.copy(toward).sub(p.position).setY(0).normalize();
      const side = i % 2 === 0 ? 1 : -1;
      dir.x += side * 0.35;
      this.vel.push(dir.multiplyScalar(world.rng.range(7, 9.5)).setY(world.rng.range(3, 4.5)).clone());
      this.spin.push(world.rng.range(3, 6) * side);
    }
    const p0 = this.panels[0]?.position ?? toward;
    world.audio.play('crash', { volume: 1 });
    world.audio.play('door', { volume: 1, pitch: 0.6 });
    world.audio.play('glass', { volume: 0.7 });
    world.rig.shake(0.7);
    world.fx.dust(p0, 2.2, 0x5a4a40);
    world.fx.debris(p0, 0x4a3628);
  }

  update(dt: number, world: World) {
    if (this.t < 0 || this.t > 3) return;
    this.t += dt;
    for (let i = 0; i < this.panels.length; i++) {
      const p = this.panels[i];
      const v = this.vel[i];
      if (!v) continue;
      v.y -= 16 * dt;
      p.position.addScaledVector(v, dt);
      p.rotation.x += this.spin[i] * dt;
      p.rotation.y += this.spin[i] * 0.3 * dt;
      if (p.position.y < 0.1) {
        p.position.y = 0.1;
        if (v.y < -3) world.fx.dust(p.position, 0.5);
        v.y = Math.abs(v.y) * 0.2;
        v.x *= 0.4;
        v.z *= 0.4;
        this.spin[i] *= 0.3;
        if (Math.abs(v.y) < 0.6) p.rotation.x += (-Math.PI / 2 - p.rotation.x) * Math.min(1, dt * 12);
      }
    }
  }
}

/**
 * The parts a merged group was built from (each mesh with its matrix relative to
 * the group), recorded before the merge for ART: PIXEL WORLD, which re-paints
 * animated groups from them (z1/pixel.ts `convertDyn`). Record-only: the merge
 * and the scene are the same in every ART style.
 */
export const PW_PARTS = new WeakMap<THREE.Object3D, PwPart[]>();
/** A recorded part: the mesh, its matrix relative to the merged group, the nearest `userData.pwPart` tag up its ancestry. */
export interface PwPart {
  mesh: THREE.Mesh;
  rel: THREE.Matrix4;
  tag: string | undefined;
}

/** Merge a prop group but keep it as a standalone object (animated as a whole). */
export function mergedGroup(g: THREE.Group): THREE.Group {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const parts: PwPart[] = [];
  g.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    let tag: string | undefined;
    for (let a: THREE.Object3D | null = o; a && !tag; a = a === g ? null : a.parent) tag = a.userData.pwPart as string | undefined;
    parts.push({ mesh: o as THREE.Mesh, rel: inv.clone().multiply(o.matrixWorld), tag });
  });
  PW_PARTS.set(g, parts);
  bakeMerge(g);
  return g;
}

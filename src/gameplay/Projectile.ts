import * as THREE from 'three';
import { Entity, type ShotHit, type ShotOutcome } from './Entity';
import type { World } from './World';
import { Kit } from '../content/kit/ModelKit';
import type { SfxName } from '../audio/names';
import type { PixelFigure } from './pixel/figure';
import { paintThrown, sceneKeyLight, thrownKind, thrownState, type ThrownKind, type ThrownState } from '../content/pixel/castThrown';

export interface ProjectileOptions {
  /** Launch point in WORLD coordinates. */
  from: THREE.Vector3;
  /** Seconds until impact. Longer = easier to shoot down. */
  flightTime: number;
  /** Arc height in metres. */
  arc: number;
  damage: number;
  /** Hits needed to destroy it. */
  hp: number;
  points: number;
  /** Custom mesh (facing doesn't matter). Default: glowing blob. */
  mesh?: THREE.Object3D;
  color: number;
  size: number;
  spin: number;
  /** Source name for damage feedback. */
  source: string;
  sfxDestroy: SfxName;
  /** FX when destroyed: 'goo' (splat), 'debris' (sparks/dust) or 'explode'. */
  burst: 'goo' | 'debris' | 'explode';
  /**
   * ART: SPRITES — what the pixel-art painter draws ('glob', 'hook', 'barrel',
   * 'car', 'rock'…; see content/pixel/castThrown). Default: recognised from the
   * other options and the mesh.
   */
  pixel?: ThrownKind;
}

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
/** Per-projectile variety for the pixel art (a counter, never the world RNG). */
let thrownSeq = 0;

/**
 * A thrown/spat object flying at the camera (acid spit, barrels, rocks, cars…).
 * It is drawn with a warning ring and can be shot down for points. Projectiles
 * live in the rig frame so they always hit a moving player fairly.
 */
export class Projectile extends Entity {
  readonly opts: ProjectileOptions;
  protected from = new THREE.Vector3();
  protected to = new THREE.Vector3();
  private hp: number;
  private mesh: THREE.Object3D;
  /** Built with its own mesh (vs the default glowing blob). */
  private custom: boolean;
  /** ART: SPRITES — the pixel-art painter's state (made at the first paint). */
  private px: ThrownState | null = null;

  constructor(world: World, opts: Partial<ProjectileOptions> & { from: THREE.Vector3 }) {
    super(world);
    this.opts = {
      flightTime: 1.8,
      arc: 1.2,
      damage: 1,
      hp: 1,
      points: 100,
      color: 0x8cff3a,
      size: 0.28,
      spin: 4,
      source: 'projectile',
      sfxDestroy: 'hit_projectile',
      burst: 'goo',
      ...opts,
    };
    this.hp = this.opts.hp;
    this.custom = !!this.opts.mesh;
    this.hostile = true;
    this.assistable = true;
    this.frame = 'rig';
    this.mesh =
      this.opts.mesh ??
      Kit.mesh(Kit.sphere(this.opts.size, 8, 6), Kit.glow(this.opts.color, 1.6));
    this.root.add(this.mesh);
  }

  override onAdded(): void {
    const rig = this.world.rig;
    rig.space.updateMatrixWorld();
    this.from.copy(this.opts.from);
    rig.space.worldToLocal(this.from);
    // Aim slightly off-centre just in front of the camera — along the direction the
    // camera is LOOKING (look-back chase bosses), so it reads clearly and stays shootable.
    const r = this.world.rng;
    _v.copy(this.world.camera.getWorldDirection(_dir)).applyQuaternion(_q.copy(rig.space.quaternion).invert()).setY(0);
    if (_v.lengthSq() < 1e-6) _v.set(0, 0, -1);
    _v.normalize();
    this.to.set(r.spread(0.35), rig.eyeHeight - 0.15 + r.spread(0.15), 0).addScaledVector(_v, 0.9);
    this.to.add(rig.offset);
    this.root.position.copy(this.from);
    this.telegraph = { progress: 0, anchor: this.root, radius: Math.max(0.35, this.opts.size * 1.4) };
    // Groups (e.g. a hook made of parts) register their child meshes only.
    if ((this.mesh as THREE.Mesh).isMesh) this.hitbox(this.mesh, 'body');
    this.mesh.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== this.mesh) this.hitbox(o, 'body');
    });
  }

  update(dt: number): void {
    this.age += dt;
    const k = Math.min(1, this.age / this.opts.flightTime);
    this.root.position.lerpVectors(this.from, this.to, k);
    this.root.position.y += Math.sin(k * Math.PI) * this.opts.arc;
    this.mesh.rotation.x += this.opts.spin * dt;
    this.mesh.rotation.y += this.opts.spin * 0.7 * dt;
    if (this.telegraph) this.telegraph.progress = k;
    if (k >= 1) {
      this.removed = true;
      this.world.hurtPlayer(this.opts.damage, this.opts.source, this);
      if (this.opts.burst === 'goo') this.world.fx.screenSplat(this.opts.color);
    }
  }

  /**
   * ART: SPRITES: painted pixel art (content/pixel/castThrown) in the tumbling
   * mesh's frame. (A thrower may assign its own `paintPixels` per projectile.)
   */
  override paintPixels(f: PixelFigure): boolean {
    let st = this.px;
    const o = this.opts;
    if (!st) {
      st = this.px = thrownState(this.mesh, o.color, o.size, (++thrownSeq * 0.618) % 1);
      thrownKind(st, { color: o.color, size: o.size, burst: o.burst, source: o.source, pixel: o.pixel, hasMesh: this.custom });
      st.light = sceneKeyLight(this.world.scene);
      // Translucent parts (a bile skin) are painted, not kept as live 3D over the sprite.
      this.mesh.traverse((m) => {
        const mat = (m as THREE.Mesh).material as THREE.Material | undefined;
        if (mat?.transparent) m.userData.spriteKeep3D = false;
      });
    }
    st.time = this.age;
    // Flight direction (world): the path's tangent (lerp + arc), through the rig frame.
    const k = Math.min(1, this.age / o.flightTime);
    _dir.subVectors(this.to, this.from);
    _dir.y += Math.PI * Math.cos(k * Math.PI) * o.arc;
    if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, 1);
    if (this.root.parent) _dir.transformDirection(this.root.parent.matrixWorld);
    else _dir.normalize();
    st.vel.copy(_dir);
    return paintThrown(f, st, this.world.camera);
  }

  override onShot(hit: ShotHit): ShotOutcome {
    this.hp -= hit.damage;
    if (this.hp > 0) {
      this.world.fx.sparks(hit.point, hit.normal);
      return { kind: 'projectile', counts: true };
    }
    this.removed = true;
    this.root.getWorldPosition(_v);
    if (this.opts.burst === 'explode') this.world.fx.explosion(_v, 0.8);
    else if (this.opts.burst === 'goo') this.world.fx.blood(_v, hit.dir, { color: this.opts.color, amount: 1.2 });
    else this.world.fx.debris(_v, this.opts.color);
    this.world.audio.play(this.opts.sfxDestroy, { vary: 0.1 });
    const pts = this.world.score.add(this.opts.points);
    this.world.hud.popup(`+${pts}`, hit.screenX, hit.screenY, 'points');
    return { kind: 'projectile', counts: true, killed: true };
  }
}

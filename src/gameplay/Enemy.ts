import * as THREE from 'three';
import type { EntryKind, Frame } from '../core/types';
import { PART_MULT } from '../core/types';
import { clamp, angleDelta } from '../core/math';
import { Entity, type ShotHit, type ShotOutcome } from './Entity';
import type { World } from './World';
import type { SfxName } from '../audio/names';

export interface EnemySpawn {
  /** Position in the entity's frame (world coords for 'world', rig-space coords for 'rig'). */
  pos: THREE.Vector3;
  frame: Frame;
  entry: EntryKind;
  hpMul: number;
  speedMul: number;
  opts: Record<string, unknown>;
}

/** Built-in states. Subclasses may add their own string states and handle them in `customUpdate`. */
export type EnemyState = 'entry' | 'advance' | 'windup' | 'recover' | 'stagger' | 'dying' | (string & {});

const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const RED_FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xff3020 });

/** The hit-flash materials (shader warm-up compiles them up front). */
export function flashMaterials(): THREE.Material[] {
  return [FLASH_MAT, RED_FLASH_MAT];
}
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const GROUND_STATES = new Set<string>(['advance', 'windup', 'recover', 'stagger']);
/** Minimum seconds between hit flashes with Settings.reduceFlashes (≤ 3 flashes/s). */
export const REDUCED_FLASH_COOLDOWN = 0.34;

/**
 * NDC play-area test shared by enemies and tools: inside |x|,|y| < margin, in
 * front of the camera, and not under the HUD corner panels or the boss bar.
 */
export function ndcInPlayArea(x: number, y: number, z: number, margin = 0.9): boolean {
  if (z >= 1 || Math.abs(x) > margin || Math.abs(y) > margin) return false;
  if (y < -0.55 && (x < -0.55 || x > 0.45)) return false; // bottom HUD panels
  if (y > 0.72 && (x < -0.6 || x > 0.78)) return false; // score / pause
  if (y > 0.8 && Math.abs(x) < 0.45) return false; // boss bar / progress rail
  return true;
}

/**
 * Base class for every enemy (and boss). Subclasses:
 *  1. set stats in `configure()` (hp, speed, attackRange, windup, damage, points, sounds…)
 *  2. build the model in `build()` — add meshes under `this.model` FACING +Z,
 *     feet at y = 0, and register hit-zones with `this.hitbox(mesh, 'head' | 'torso' | 'limb' …)`
 *  3. animate procedurally in `animate(dt)` using `state`, `stateTime`, `moveSpeed`, `age`.
 *
 * The default AI walks toward the player, stops at `attackRange`, telegraphs for
 * `windup` seconds (a shrinking ring on screen), then strikes. Any hit during the
 * windup interrupts it (unless `superArmor`). Override hooks to customise.
 */
export abstract class Enemy extends Entity {
  override hostile = true;
  override assistable = true;
  isBoss = false;
  name = 'enemy';
  maxHp = 3;
  hp = 3;
  /** Ground speed in m/s. */
  speed = 1.2;
  /** Distance from the player at which the enemy stops and attacks. */
  attackRange = 1.9;
  /** Seconds of telegraph before an attack lands. */
  windup = 1.5;
  recoverTime = 1.1;
  damage = 1;
  points = 100;
  staggerTime = 0.4;
  /** When true, hits don't interrupt attacks or stagger (bosses, brutes). */
  superArmor = false;
  /** Damage in a single hit that staggers even with superArmor. */
  heavyHit = 99;
  /** Ring radius for the attack telegraph (metres). */
  telegraphRadius = 0.45;
  /** Optional sounds. */
  sfxHit: SfxName = 'hit_flesh';
  sfxDie: SfxName | null = null;
  sfxAttack: SfxName | null = null;
  sfxIdle: SfxName | null = null;
  /** Blood colour for FX. */
  bloodColor = 0x8a0a0a;
  /** Knockback distance per hit (metres). */
  knockback = 0.12;
  /** Needs an attack slot to start winding up (fairness cap on simultaneous attackers). */
  usesAttackSlot = true;
  /**
   * Snap to / fall onto the ground. Flying enemies (pteranodons) and anything that
   * manages its own height should set this false.
   */
  grounded = true;
  /** Minimum seconds between hit flashes — keeps autofire from strobing big models. */
  flashCooldown = 0.1;
  private lastFlashAge = -1;
  private falling = false;
  private wasOnGround = false;

  state: EnemyState = 'entry';
  stateTime = 0;
  readonly model = new THREE.Group();
  /** Centre-mass object for telegraph rings / aim assist / autoplay. */
  anchor: THREE.Object3D = this.model;
  /** Head object (autoplay prefers it). */
  headAnchor: THREE.Object3D | null = null;
  readonly spawn: EnemySpawn;
  /** Ground distance to the player this frame. */
  distToPlayer = Infinity;
  /** Actual movement speed this frame (m/s) — drive walk-cycle animations from this. */
  moveSpeed = 0;
  /** Vertical velocity used by drop/leap entries. */
  protected vy = 0;
  protected lastHit: ShotHit | null = null;
  protected entryFrom = new THREE.Vector3();
  protected entryTo = new THREE.Vector3();
  private flashTime = 0;
  private flashCrit = false;
  private meshes: THREE.Mesh[] | null = null;
  private origMats: (THREE.Material | THREE.Material[])[] = [];
  /** True while this enemy holds one of the world's limited attack slots. */
  holdsSlot = false;
  private idleSfxTimer = 0;

  constructor(world: World, spawn: EnemySpawn) {
    super(world);
    this.spawn = spawn;
    this.frame = spawn.frame;
    this.root.add(this.model);
    this.root.position.copy(spawn.pos);
  }

  /** Set stats here (called before build). */
  protected configure(): void {}
  /** Create meshes under this.model and register hitboxes. */
  protected abstract build(): void;
  /** Procedural animation, called every frame after AI. */
  protected animate(_dt: number): void {}

  override onAdded(): void {
    this.configure();
    this.maxHp *= this.spawn.hpMul;
    this.hp = this.maxHp;
    this.speed *= this.spawn.speedMul;
    this.build();
    this.idleSfxTimer = this.world.rng.range(1, 5);
    // Face the player immediately.
    this.playerPos(_p);
    this.root.rotation.y = Math.atan2(_p.x - this.root.position.x, _p.z - this.root.position.z);
    this.beginEntry(this.spawn.entry);
  }

  /**
   * Build the model WITHOUT joining the world — configure() + build() only, no
   * entry, AI, events or sounds; hitboxes are unregistered again. Used to warm
   * up shader programs (see gameplay/Warmup.ts); the instance is never updated.
   */
  buildDetached(): void {
    this.configure();
    this.build();
    this.world.shootables.removeOwner(this);
  }

  // ─── Helpers for subclasses ────────────────────────────────────────────────

  /** Player ground position in this enemy's frame. */
  playerPos(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.frame === 'rig') return out.copy(this.world.rig.offset).setY(0);
    return out.copy(this.world.rig.space.position);
  }

  /** Player eye position in this enemy's frame. */
  playerEye(out = new THREE.Vector3()): THREE.Vector3 {
    this.playerPos(out);
    out.y += this.world.rig.eyeHeight;
    return out;
  }

  /**
   * Ground height under a point in this enemy's frame. Stage scripts can pin a
   * raised floor (rooftop, deck, gallery) with `opts.floor` (metres, same frame).
   */
  groundY(x: number, z: number): number {
    const floor = this.spawn.opts.floor;
    if (typeof floor === 'number') return floor;
    if (this.frame === 'rig') return 0;
    return this.world.groundAt(x, z);
  }

  /** Custom attack states that should keep the attack slot (e.g. a crawler's 'pounce'). */
  protected keepsSlot(_s: EnemyState): boolean {
    return false;
  }

  setState(s: EnemyState) {
    // Any state change ends the current warning ring (custom attacks re-arm their own).
    if (s !== 'windup') this.telegraph = null;
    if (s !== 'windup' && s !== 'recover' && !this.keepsSlot(s)) this.releaseSlot();
    this.state = s;
    this.stateTime = 0;
    if (s === 'windup') {
      this.telegraph = { progress: 0, anchor: this.anchor, radius: this.telegraphRadius };
      this.onWindup();
    }
  }

  /** Turn smoothly toward a point (same frame). */
  faceToward(target: THREE.Vector3, dt: number, rate = 6) {
    const yaw = Math.atan2(target.x - this.root.position.x, target.z - this.root.position.z);
    this.root.rotation.y += angleDelta(this.root.rotation.y, yaw) * (1 - Math.exp(-rate * dt));
  }

  /** Move on the ground plane toward target, stopping `stopAt` metres short. Returns remaining distance. */
  moveToward(target: THREE.Vector3, speed: number, dt: number, stopAt = 0): number {
    _v.set(target.x - this.root.position.x, 0, target.z - this.root.position.z);
    const dist = _v.length();
    const remaining = dist - stopAt;
    if (remaining <= 0.001) {
      this.moveSpeed = 0;
      return Math.max(0, remaining);
    }
    const step = Math.min(remaining, speed * dt);
    _v.multiplyScalar(step / dist);
    this.root.position.add(_v);
    this.moveSpeed = dt > 0 ? step / dt : 0;
    this.faceToward(target, dt);
    // Land exactly on the stop distance (no float-epsilon "almost there" stalls).
    return remaining - step < 1e-3 ? 0 : remaining - step;
  }

  /**
   * Speed over the ground in m/s, for driving walk/run cycles. Enemies in the
   * rig frame are carried along with the vehicle, so they must run at least as
   * fast as it moves.
   */
  get groundSpeed(): number {
    if (this.frame === 'rig') return this.moveSpeed + this.world.rig.speed;
    return this.moveSpeed;
  }

  /** Signed distance along the rail heading from the player (negative = behind). */
  aheadOfPlayer(): number {
    if (this.frame === 'rig') return -this.root.position.z;
    const rig = this.world.rig.space;
    _w.subVectors(this.root.position, rig.position);
    // Rig forward is local -Z rotated by heading.
    const h = rig.rotation.y;
    return _w.x * -Math.sin(h) + _w.z * -Math.cos(h);
  }

  /** Move on the ground plane WITHOUT turning (bosses backing off / strafing while facing you). */
  slideToward(target: THREE.Vector3, speed: number, dt: number, stopAt = 0): number {
    _v.set(target.x - this.root.position.x, 0, target.z - this.root.position.z);
    const dist = _v.length();
    const remaining = dist - stopAt;
    if (remaining <= 0.001) {
      this.moveSpeed = 0;
      return Math.max(0, remaining);
    }
    const step = Math.min(remaining, speed * dt);
    this.root.position.addScaledVector(_v, step / dist);
    this.moveSpeed = dt > 0 ? step / dt : 0;
    return remaining - step;
  }

  /**
   * Fair framing for starting an attack: the object projects inside the view
   * (|NDC| < margin) AND outside the HUD's corner panels (lives/bomb bottom-left,
   * weapon/reload bottom-right, score top-left, pause top-right) and the boss bar.
   * Attack telegraphs must only begin when this holds, so a player on a phone can
   * always see — and shoot — what's about to hit them.
   */
  inPlayArea(obj: THREE.Object3D = this.anchor, margin = 0.9): boolean {
    obj.getWorldPosition(_w);
    _w.project(this.world.camera);
    return ndcInPlayArea(_w.x, _w.y, _w.z, margin);
  }

  /** Is the anchor inside the camera view (with margin)? */
  onScreen(margin = 0.92): boolean {
    this.anchor.getWorldPosition(_w);
    _w.project(this.world.camera);
    return _w.z < 1 && Math.abs(_w.x) < margin && Math.abs(_w.y) < margin;
  }

  /** Screen position (client px) of a world object, or null when behind camera. */
  screenPos(obj: THREE.Object3D = this.anchor): { x: number; y: number } | null {
    obj.getWorldPosition(_w);
    _w.project(this.world.camera);
    if (_w.z > 1) return null;
    const { width, height } = this.world.viewport;
    return { x: (_w.x * 0.5 + 0.5) * width, y: (-_w.y * 0.5 + 0.5) * height };
  }

  play(name: SfxName | null, volume = 1, vary = 0.1, pitch = 1) {
    if (!name) return;
    // Quieter with distance, panned by where the enemy is on screen.
    const vol = volume * clamp(1.4 - this.distToPlayer / 30, 0.25, 1);
    this.anchor.getWorldPosition(_w);
    _w.project(this.world.camera);
    const pan = _w.z < 1 ? clamp(_w.x * 0.6, -0.6, 0.6) : 0;
    this.world.audio.play(name, { volume: vol, vary, pan, pitch });
  }

  /** Stereo pan for a hit at screen x. */
  protected hitPan(hit: ShotHit): number {
    return clamp((hit.screenX / Math.max(1, this.world.viewport.width)) * 1.2 - 0.6, -0.6, 0.6);
  }

  // ─── Hooks ────────────────────────────────────────────────────────────────

  /** Called when windup starts (play a growl, raise arms…). */
  protected onWindup(): void {
    this.play(this.sfxAttack, 0.8);
  }

  /** The attack lands. Default: melee damage to the player. */
  protected strike(): void {
    this.world.hurtPlayer(this.damage, this.name, this);
  }

  /** Called after damage is applied but before death/stagger handling. */
  protected onDamaged(_hit: ShotHit, _amount: number): void {}

  /** Extra per-part multiplier (bosses: weak points). Return 0 for immunity. */
  protected damageMultiplier(_hit: ShotHit): number {
    return 1;
  }

  /** Death animation start. Default: topple backward. */
  protected onDeath(_hit: ShotHit | null): void {}

  /** Advance the death animation. Return true when finished (entity is removed). */
  protected updateDeath(dt: number): boolean {
    const t = this.stateTime;
    const fall = clamp(t / 0.55, 0, 1);
    this.model.rotation.x = -fall * fall * (Math.PI / 2) * 0.92;
    if (t > 1.4) this.model.position.y -= dt * 0.9;
    return t > 2.8;
  }

  /** Handle subclass-specific states. */
  protected customUpdate(_dt: number): void {}

  // ─── Core behaviour ───────────────────────────────────────────────────────

  protected beginEntry(kind: EntryKind) {
    this.state = 'entry';
    this.stateTime = 0;
    const pos = this.root.position;
    this.entryFrom.copy(pos);
    switch (kind) {
      case 'rise':
        this.model.position.y = -1.9;
        this.world.fx.dust(this.worldPos(_w), 1.2);
        break;
      case 'drop':
        this.model.position.y = 0;
        {
          // Honour scripted low drop points (vents, ceilings); default to a 6 m fall.
          const g = this.groundY(pos.x, pos.z);
          const h = typeof this.spawn.opts.dropHeight === 'number' ? (this.spawn.opts.dropHeight as number) : 6;
          this.root.position.y = pos.y > g + 1.2 ? pos.y : g + h;
        }
        this.vy = 0;
        break;
      case 'leap': {
        this.playerPos(_p);
        _v.subVectors(_p, pos).setY(0);
        const d = _v.length();
        const maxJump = typeof this.spawn.opts.leapMax === 'number' ? (this.spawn.opts.leapMax as number) : 7;
        const jump = Math.min(d * 0.55, maxJump);
        this.entryTo.copy(pos).addScaledVector(_v.normalize(), jump);
        this.entryTo.y = this.groundY(this.entryTo.x, this.entryTo.z);
        break;
      }
      default:
        break;
    }
  }

  /** Returns true when the entry animation is complete. */
  protected entryUpdate(dt: number): boolean {
    const kind = this.spawn.entry;
    const t = this.stateTime;
    switch (kind) {
      case 'rise': {
        const k = clamp(t / 1.3, 0, 1);
        this.model.position.y = -1.9 * (1 - k) * (1 - k);
        this.model.rotation.z = Math.sin(t * 9) * 0.08 * (1 - k);
        if (k >= 1) {
          this.model.position.y = 0;
          this.model.rotation.z = 0;
          return true;
        }
        return false;
      }
      case 'drop': {
        this.vy -= 22 * dt;
        this.root.position.y += this.vy * dt;
        const g = this.groundY(this.root.position.x, this.root.position.z);
        if (this.root.position.y <= g) {
          this.root.position.y = g;
          this.world.fx.dust(this.worldPos(_w), 1);
          this.world.rig.shake(0.05);
          return true;
        }
        return false;
      }
      case 'leap': {
        const dur = 0.85;
        const k = clamp(t / dur, 0, 1);
        this.root.position.lerpVectors(this.entryFrom, this.entryTo, k);
        const arc = typeof this.spawn.opts.leapArc === 'number' ? (this.spawn.opts.leapArc as number) : 2.2;
        this.root.position.y += Math.sin(k * Math.PI) * arc;
        this.moveSpeed = this.speed * 2;
        if (k >= 1) {
          this.world.fx.dust(this.worldPos(_w), 0.8);
          return true;
        }
        return false;
      }
      case 'burst': {
        this.playerPos(_p);
        this.moveToward(_p, this.speed * 2.6, dt, this.attackRange);
        return t > 0.7;
      }
      default:
        return true;
    }
  }

  /** Default advance: approach the player; start the attack when in range and on screen. */
  protected advanceUpdate(dt: number) {
    this.playerPos(_p);
    const remaining = this.moveToward(_p, this.speed, dt, this.attackRange);
    this.separate(dt);
    if (remaining <= 0.05) {
      this.faceToward(_p, dt);
      if (!this.onScreen()) {
        // Off to the side — step toward the centre of the view so attacks are always visible.
        this.world.camera.getWorldDirection(_v).setY(0).normalize();
        _v.multiplyScalar(this.attackRange).add(this.world.rig.space.position);
        if (this.frame === 'rig') this.world.rig.space.worldToLocal(_v);
        this.moveToward(_v, this.speed * 0.8, dt);
        return;
      }
      if (!this.inPlayArea()) {
        // On screen but tucked under a HUD panel: edge toward the centre first.
        this.world.camera.getWorldDirection(_v).setY(0).normalize();
        _v.multiplyScalar(this.attackRange).add(this.world.rig.space.position);
        if (this.frame === 'rig') this.world.rig.space.worldToLocal(_v);
        this.moveToward(_v, this.speed * 0.8, dt);
        return;
      }
      if (this.acquireSlot()) this.setState('windup');
    }
  }

  protected windupUpdate(dt: number) {
    // A moving vehicle carried the player out of reach: abandon the attack.
    if (!this.isBoss && this.frame === 'world' && this.distToPlayer > this.attackRange * 1.6 + 1) {
      this.setState('advance');
      return;
    }
    this.playerPos(_p);
    this.faceToward(_p, dt);
    this.moveSpeed = 0;
    if (this.telegraph) this.telegraph.progress = clamp(this.stateTime / this.windup, 0, 1);
    if (this.stateTime >= this.windup) {
      this.telegraph = null;
      this.strike();
      this.setState('recover');
    }
  }

  /** Keep enemies from stacking inside each other. */
  protected separate(dt: number) {
    for (const e of this.world.enemies()) {
      if (e === this || e.frame !== this.frame || e.state === 'dying' || e.isBoss) continue;
      _v.subVectors(this.root.position, e.root.position).setY(0);
      const d = _v.length();
      const min = 0.85;
      if (d > 0.0001 && d < min) {
        this.root.position.addScaledVector(_v.normalize(), (min - d) * Math.min(1, dt * 6));
      }
    }
  }

  protected acquireSlot(): boolean {
    if (!this.usesAttackSlot || this.isBoss) return true;
    if (this.holdsSlot) return true;
    if (this.world.attackSlots > 0) {
      this.world.attackSlots--;
      this.holdsSlot = true;
      return true;
    }
    return false;
  }

  protected releaseSlot() {
    if (this.holdsSlot) {
      this.holdsSlot = false;
      this.world.attackSlots++;
    }
  }

  stagger() {
    if (this.state === 'dying' || this.state === 'entry') return;
    this.setState('stagger');
  }

  override update(dt: number): void {
    this.age += dt;
    this.stateTime += dt;
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.restoreMaterials();
    }
    this.playerPos(_p);
    this.distToPlayer = Math.hypot(_p.x - this.root.position.x, _p.z - this.root.position.z);
    this.moveSpeed = 0;

    switch (this.state) {
      case 'entry':
        if (this.entryUpdate(dt)) this.setState('advance');
        break;
      case 'advance':
        this.advanceUpdate(dt);
        break;
      case 'windup':
        this.windupUpdate(dt);
        break;
      case 'recover':
        if (this.stateTime >= this.recoverTime) {
          // Never re-attack from off-screen (look-back chases pitch the camera around).
          this.setState(this.distToPlayer <= this.attackRange * 1.25 && this.inPlayArea() && this.acquireSlot() ? 'windup' : 'advance');
        }
        break;
      case 'stagger':
        if (this.stateTime < this.staggerTime * 0.6) {
          // Knockback drift.
          if (this.lastHit) {
            _v.copy(this.lastHit.dir).setY(0).normalize();
            if (this.frame === 'rig') _v.applyQuaternion(_q.copy(this.world.rig.space.quaternion).invert());
            this.root.position.addScaledVector(_v, this.knockback * dt * 6);
          }
        }
        if (this.stateTime >= this.staggerTime) this.setState('advance');
        break;
      case 'dying':
        if (this.updateDeath(dt)) this.removed = true;
        break;
      default:
        this.customUpdate(dt);
    }

    if (this.state !== 'dying' && this.state !== 'entry' && this.grounded) {
      const g = this.groundY(this.root.position.x, this.root.position.z);
      const y = this.root.position.y;
      if (this.isBoss) {
        // Bosses choreograph their own jumps/leaps.
        if (y < g + 0.5) this.root.position.y = g;
      } else if (this.falling) {
        // Walked off a ledge: fall until we land.
        this.vy -= 22 * dt;
        this.root.position.y = Math.max(g, y + this.vy * dt);
        if (this.root.position.y <= g) {
          this.falling = false;
          this.vy = 0;
        }
      } else if (y < g + 0.5) {
        // Step up small rises only; anything taller acts like a wall, not a lift.
        if (g - y < 0.6) this.root.position.y = g;
      } else if (y - g > 0.5 && this.wasOnGround && GROUND_STATES.has(this.state)) {
        // Only the stock walk/attack states fall; custom leap/pounce states own their arc.
        this.falling = true;
        this.vy = 0;
      }
      this.wasOnGround = !this.falling && Math.abs(this.root.position.y - g) < 0.05;
    }

    // Safety nets against soft-locks: enemies left behind by a moving rig, or
    // ones that never manage to get on screen, quietly leave.
    if (!this.isBoss && this.state !== 'dying' && this.state !== 'entry') {
      if (this.frame === 'world' && this.world.rig.moving && this.aheadOfPlayer() < -8 && this.distToPlayer > 10) {
        this.despawn();
        return;
      }
      if (this.age > 45 && !this.onScreen(1.2)) {
        this.despawn();
        return;
      }
    }

    if (this.sfxIdle && this.state !== 'dying') {
      this.idleSfxTimer -= dt;
      if (this.idleSfxTimer <= 0) {
        this.idleSfxTimer = this.world.rng.range(3, 8);
        this.play(this.sfxIdle, 0.5, 0.2);
      }
    }

    this.animate(dt);
  }

  override onShot(hit: ShotHit): ShotOutcome {
    if (this.state === 'dying') return { kind: 'enemy', counts: true };
    if (hit.part === 'armor') {
      this.world.fx.sparks(hit.point, hit.normal);
      this.world.audio.play('hit_armor', { vary: 0.15, volume: 0.7, pan: this.hitPan(hit) });
      this.onArmorHit(hit);
      return { kind: 'armor', counts: true };
    }
    const mult = PART_MULT[hit.part] * this.damageMultiplier(hit);
    if (mult <= 0) {
      this.world.fx.sparks(hit.point, hit.normal);
      this.world.audio.play('hit_armor', { vary: 0.15, volume: 0.7, pan: this.hitPan(hit) });
      return { kind: 'armor', counts: true };
    }
    const amount = hit.damage * mult;
    this.hp -= amount;
    this.lastHit = hit;
    this.flash(hit.part === 'head' || hit.part === 'weak');
    this.world.fx.blood(hit.point, hit.dir, { color: this.bloodColor, amount: Math.min(2, 0.6 + amount * 0.3) });
    this.world.audio.play(hit.part === 'head' ? 'hit_head' : this.sfxHit, { vary: 0.12, volume: 0.8, pan: this.hitPan(hit) });
    this.onDamaged(hit, amount);
    const headshot = hit.part === 'head';
    if (this.hp <= 0) {
      this.die(hit);
      return { kind: 'enemy', counts: true, killed: true, headshot };
    }
    if (!this.superArmor || amount >= this.heavyHit) this.stagger();
    return { kind: 'enemy', counts: true, headshot };
  }

  /** Shots on 'armor' parts. */
  protected onArmorHit(_hit: ShotHit): void {}

  /** Kill the enemy (awards score). */
  die(hit: ShotHit | null) {
    if (this.state === 'dying') return;
    this.hp = 0;
    this.hostile = false;
    this.telegraph = null;
    this.world.shootables.removeOwner(this);
    this.setState('dying');
    this.restoreMaterials();
    this.world.onEnemyKilled(this, hit);
    this.play(this.sfxDie, 1);
    // Bodies left behind by a moving rig stay in the world.
    if (this.frame === 'rig') {
      this.world.scene.attach(this.root);
      this.frame = 'world';
    }
    this.onDeath(hit);
  }

  /** Remove without awarding points (e.g. despawn after a chase). */
  despawn() {
    this.hostile = false;
    this.telegraph = null;
    this.removed = true;
  }

  private collectMeshes() {
    if (this.meshes) return;
    this.meshes = [];
    this.model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.meshes!.push(o as THREE.Mesh);
    });
    this.origMats = this.meshes.map((m) => m.material);
  }

  /** Briefly flash the model white (or red for critical hits). Rate-limited (photosensitivity). */
  flash(critical = false) {
    // Reduced flashing: at most ~3 flashes/s even for small enemies under autofire.
    const cd = this.world.settings.reduceFlashes ? Math.max(this.flashCooldown, REDUCED_FLASH_COOLDOWN) : this.flashCooldown;
    if (this.age - this.lastFlashAge < cd) return;
    this.lastFlashAge = this.age;
    this.collectMeshes();
    const mat = critical ? RED_FLASH_MAT : FLASH_MAT;
    for (const m of this.meshes!) if (m.userData.noFlash !== true) m.material = mat;
    this.flashTime = 0.06;
    this.flashCrit = critical;
  }

  /** Current hit flash: 0 none, 1 white, 2 red (ART: SPRITES flashes the sprite with it). */
  get flashKind(): 0 | 1 | 2 {
    if (this.flashTime <= 0) return 0;
    return this.flashCrit ? 2 : 1;
  }

  private restoreMaterials() {
    if (!this.meshes) return;
    this.meshes.forEach((m, i) => (m.material = this.origMats[i]));
  }

  /** Call after adding/removing meshes post-build (e.g. severed limbs) so flashing stays correct. */
  refreshMeshes() {
    this.restoreMaterials();
    this.meshes = null;
  }
}

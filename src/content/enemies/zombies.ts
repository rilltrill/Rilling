import * as THREE from 'three';
import { Enemy, type EnemyState } from '../../gameplay/Enemy';
import type { ShotHit } from '../../gameplay/Entity';
import type { EntryKind } from '../../core/types';
import { Projectile } from '../../gameplay/Projectile';
import { clamp, lerp, smoothstep } from '../../core/math';
import { registerEnemy } from '../registry';
import { Kit } from '../kit/ModelKit';
import type { HumanoidRig, Limb } from '../kit/humanoid';
import {
  ZBody,
  footWorld,
  ZOMBIE_VARIANTS,
  SKIN_TONES,
  BLOOD,
  BLOOD_DARK,
  GORE,
  GUTS,
  BONE,
  GOO,
  addFace,
  addGore,
  dressVariant,
  hairFor,
  maybeLongHair,
  poseCrouch,
  poseRun,
  poseShamble,
  restPose,
} from './zombieKit';

/**
 * ─── Zombie roster ─────────────────────────────────────────────────────────
 *
 *   walker   shambler (opts.variant: civilian|cop|nurse|doctor|worker|office|patient|soldier|biker|random)
 *   runner   fast sprinter, mid-approach lunge, handles 'leap' + rig-frame chases
 *   crawler  legless torso, small target, POUNCES at the camera from ~3 m
 *   brute    2.4 m riot-armoured hulk: super armour, headshot / heavy hit staggers
 *   spitter  stops at 9–12 m, inflates a glowing throat sac (weak) and spits shootable bile
 *   bloater  glowing pustules (weak), explodes when killed, pops on you if it gets close
 *
 * Shared behaviour lives in `Zombie`: dressed/baked humanoid bodies, hit
 * reactions per body part, arm dismemberment with flying limbs, head pops,
 * directional death falls, corpses that sink, animated entries (rise / drop /
 * leap / burst).
 */

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

const SEG_TORSO = 0;
const SEG_HEAD = 1;
const SEG_UPPER_L = 2;
const SEG_FORE_L = 3;
const SEG_UPPER_R = 4;
const SEG_FORE_R = 5;
const SEG_LEG_L = 6;
const SEG_LEG_R = 7;

type DeathStyle = 'back' | 'forward' | 'spin' | 'drop' | 'blast';

/** A severed limb tumbling (then lying) in the world. */
interface Flyer {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  t: number;
  /** −1 while airborne, then seconds since it started settling. */
  restT: number;
  /** World length of the limb along its local −Y, and its half-thickness when lying flat. */
  len: number;
  half: number;
  /** Settling: orientation/height it eases from → lying flat on the ground. */
  fromQ: THREE.Quaternion;
  toQ: THREE.Quaternion;
  fromY: number;
  restY: number;
}

const STOMP_OPTS = { volume: 0.4, vary: 0.12, pitch: 1.25 };

/**
 * Stand-off distance when the player rides a vehicle (eye 2.05 m, cab/hood in
 * the bottom of the frame): attackers stop clear of the hood so their chest and
 * the warning ring stay above it.
 */
const VEHICLE_RANGE = 3.4;
const VEHICLE_POUNCE_RANGE = 5.4;

/**
 * Last bloater blast per World (weakly held, so a disposed stage's World is
 * never kept alive), so blast deaths fall away from its centre.
 */
const blasts = new WeakMap<object, { pos: THREE.Vector3; time: number }>();
const _box = new THREE.Box3();
const _m4 = new THREE.Matrix4();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _vf = new THREE.Vector3();
const _vp = new THREE.Vector3();
const GROWL_OPTS = { volume: 0.5, vary: 0.15, pitch: 0.6 };

function variantOpt(opts: Record<string, unknown>, rng: { pick<T>(a: readonly T[]): T }, fallback: string): string {
  const v = opts.variant;
  if (v === 'random' || v === 'mixed') return rng.pick(ZOMBIE_VARIANTS);
  if (typeof v === 'string' && v) return v;
  return fallback;
}

// ═══════════════════════════════════════════════════════════════════════════
// Base
// ═══════════════════════════════════════════════════════════════════════════

export abstract class Zombie extends Enemy {
  protected b!: ZBody;
  protected r!: HumanoidRig;
  protected phase = 0;
  protected hipsY = 0.95;
  protected skinColor: number = SKIN_TONES[0];
  /** Strength of hit reactions (brutes barely flinch). */
  protected flinch = 1;
  /** Chance that an arm hit severs it. */
  protected severChance = 0.6;
  /** Minimum base damage of a hit that may sever (keeps SMG spray from shredding brutes). */
  protected minSeverDamage = 0;
  protected canPopHead = true;
  protected riseTime = 1.6;
  protected corpseTime = 3;
  protected seed = 0;
  /** 0 intact, 1 forearm gone, 2 whole arm gone — [left, right]. */
  protected severed = [0, 0];
  protected headless = false;

  // Hit reactions: 1 on hit → 0.
  protected kHead = 0;
  protected kTorso = 0;
  protected kArmL = 0;
  protected kArmR = 0;
  protected kLegL = 0;
  protected kLegR = 0;
  protected twist = 0;
  protected lastSeg = SEG_TORSO;

  // Entry / death bookkeeping.
  protected landT = -1;
  protected deathStyle: DeathStyle = 'back';
  protected deathSide = 1;
  protected deathSpin = 0;
  protected deathBaseY = 0;
  protected deathLandAt = -1;
  protected deathDir = new THREE.Vector3();
  protected deathSlide = 0.7;
  protected mAir = 0;
  protected mAirV = 0;
  protected sink = 0;
  /** True when spawned while the player rides a vehicle (bigger stand-off, carried legs keep running). */
  protected inVehicle = false;
  private pool: THREE.Mesh | null = null;
  protected flyers: Flyer[] = [];

  /** After configure()/build(), before the entry starts: adapt to the player being on foot or in a vehicle. */
  private adaptToRig() {
    this.inVehicle = this.world.rig.mode === 'drive';
    const ar = this.spawn.opts.attackRange;
    if (typeof ar === 'number' && ar > 0) this.attackRange = ar;
    else if (this.inVehicle) this.attackRange = Math.max(this.attackRange, this.vehicleRange());
  }

  /** Attack stand-off used when the player is in a vehicle. */
  protected vehicleRange(): number {
    return VEHICLE_RANGE;
  }

  /** Carried along by a moving rig (legs must keep running even while attacking). */
  protected get carried(): boolean {
    return this.frame === 'rig' && this.world.rig.speed > 0.8;
  }

  /** Horizontal camera forward (unit) in this zombie's frame. */
  private viewFwd(out: THREE.Vector3): THREE.Vector3 {
    this.world.camera.getWorldDirection(out);
    out.y = 0;
    if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
    out.normalize();
    if (this.frame === 'rig') {
      const h = this.world.rig.space.rotation.y;
      const c = Math.cos(h);
      const sn = Math.sin(h);
      out.set(out.x * c - out.z * sn, 0, out.x * sn + out.z * c);
    }
    return out;
  }

  /**
   * A point of this zombie's frame in VIEW space: origin at the player, +x to
   * the right of where the camera looks, −z straight ahead (so `-z` = how far
   * in front of the player it is).
   */
  protected toView(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const f = this.viewFwd(_vf);
    this.playerPos(_vp);
    const dx = p.x - _vp.x;
    const dz = p.z - _vp.z;
    return out.set(-dx * f.z + dz * f.x, 0, -(dx * f.x + dz * f.z));
  }

  /** Inverse of `toView` (in place); y is set to this zombie's height. */
  protected fromView(v: THREE.Vector3): THREE.Vector3 {
    const f = this.viewFwd(_vf);
    this.playerPos(_vp);
    const side = v.x;
    const ahead = -v.z;
    return v.set(_vp.x - f.z * side + f.x * ahead, this.root.position.y, _vp.z + f.x * side + f.z * ahead);
  }

  // ─── Building ───────────────────────────────────────────────────────────

  /** Create, dress and gore up a standard zombie body (not yet finished — add type parts, then finishBody()). */
  protected makeBody(o: {
    height: number;
    skin: number;
    eyes: number;
    eyeGlow?: number;
    bulk?: number;
    headSize?: number;
    armLength?: number;
    variant: string;
    gore?: number;
    hair?: number | null;
    missingArm?: number;
  }): ZBody {
    const rng = this.world.rng;
    const hair = o.hair !== undefined ? o.hair : hairFor(o.variant, rng);
    const b = new ZBody({ height: o.height, skin: o.skin, bulk: o.bulk, headSize: o.headSize, armLength: o.armLength, hair });
    this.b = b;
    this.r = b.rig;
    this.skinColor = o.skin;
    this.seed = rng.next() * 100;
    this.phase = rng.next() * 10;
    const shirt = dressVariant(b, o.variant, rng);
    maybeLongHair(b, o.variant, hair, rng);
    addFace(b, rng, o.eyes, o.eyeGlow ?? 1.7);
    addGore(b, rng, shirt, o.gore ?? 1);
    if (o.missingArm && rng.chance(o.missingArm)) this.removeArmAtBuild(rng.chance(0.5) ? 1 : -1, rng.chance(0.45));
    return b;
  }

  /** An arm that was already missing when the zombie turned. */
  protected removeArmAtBuild(side: 1 | -1, whole: boolean) {
    const arm = side > 0 ? this.r.armL : this.r.armR;
    const pivot = whole ? arm.shoulder : arm.elbow;
    const parent = pivot.parent!;
    parent.remove(pivot);
    this.b.box(parent, 0.1, 0.05, 0.11, GORE, pivot.position.x, pivot.position.y + (whole ? 0 : 0.02), pivot.position.z);
    this.b.box(parent, 0.04, 0.035, 0.04, BONE, pivot.position.x, pivot.position.y - 0.02, pivot.position.z);
    this.severed[side > 0 ? 0 : 1] = whole ? 2 : 1;
    this.unrig(arm, whole);
  }

  /**
   * Point the rig at inert stand-in joints once a limb is gone, so the pose
   * code stops driving the detached pivot (which now tumbles on its own).
   */
  protected unrig(arm: Limb, whole: boolean) {
    if (whole) arm.shoulder = new THREE.Group();
    arm.elbow = new THREE.Group();
  }

  /** Bake the body, add it to the model and register hit zones. */
  protected finishBody() {
    const b = this.b;
    b.finish();
    this.model.add(b.rig.root);
    for (const m of b.zones.head) this.hitbox(m, 'head');
    for (const m of b.zones.torso) this.hitbox(m, 'torso');
    for (const m of b.zones.limb) this.hitbox(m, 'limb');
    for (const m of b.zones.weak) this.hitbox(m, 'weak');
    for (const m of b.zones.armor) this.hitbox(m, 'armor');
    this.anchor = b.rig.chest;
    this.headAnchor = b.headMesh;
  }

  // ─── Per-frame ──────────────────────────────────────────────────────────

  /** Pose for every non-entry, non-dying state. Start with restPose(). */
  protected abstract pose(dt: number): void;

  protected override animate(dt: number) {
    if (this.state === 'dying') return;
    this.tickFlyers(dt);
    const d = dt / 0.32;
    this.kHead = Math.max(0, this.kHead - d);
    this.kTorso = Math.max(0, this.kTorso - d);
    this.kArmL = Math.max(0, this.kArmL - d);
    this.kArmR = Math.max(0, this.kArmR - d);
    this.kLegL = Math.max(0, this.kLegL - d);
    this.kLegR = Math.max(0, this.kLegR - d);
    if (!(this.state === 'entry' && this.poseEntry(dt))) this.pose(dt);
    this.applyReactions();
  }

  /** Additive hit reactions on top of the pose. */
  protected applyReactions() {
    const r = this.r;
    const f = this.flinch;
    const h = this.kHead * this.kHead * f;
    const t = this.kTorso * this.kTorso * f;
    const al = this.kArmL * this.kArmL * f;
    const ar = this.kArmR * this.kArmR * f;
    const ll = this.kLegL * this.kLegL * f;
    const lr = this.kLegR * this.kLegR * f;
    if (h > 0) {
      r.head.rotation.x -= 0.85 * h;
      r.neck.rotation.x -= 0.3 * h;
      r.spine.rotation.x -= 0.12 * h;
    }
    if (t > 0) {
      r.spine.rotation.x -= 0.38 * t;
      r.spine.rotation.y += this.twist * 0.3 * t;
      r.head.rotation.x += 0.25 * t;
    }
    if (al > 0) {
      r.spine.rotation.y += 0.55 * al;
      r.armL.shoulder.rotation.x += 0.9 * al;
      r.armL.shoulder.rotation.z += 0.4 * al;
    }
    if (ar > 0) {
      r.spine.rotation.y -= 0.55 * ar;
      r.armR.shoulder.rotation.x += 0.9 * ar;
      r.armR.shoulder.rotation.z -= 0.4 * ar;
    }
    if (ll > 0) {
      r.legL.knee.rotation.x += 0.9 * ll;
      r.hips.position.y -= 0.07 * ll;
      r.hips.rotation.z -= 0.12 * ll;
    }
    if (lr > 0) {
      r.legR.knee.rotation.x += 0.9 * lr;
      r.hips.position.y -= 0.07 * lr;
      r.hips.rotation.z += 0.12 * lr;
    }
  }

  // ─── Entries ────────────────────────────────────────────────────────────

  /** Rough full height (for burying a 'rise' entry). */
  protected riseDepth(): number {
    return 1.95 * this.r.scale;
  }

  protected override beginEntry(kind: EntryKind) {
    // (Called once, from onAdded, right after configure() and build().)
    this.adaptToRig();
    this.landT = -1;
    if (kind === 'rise') {
      // (Skips the base class's big dust puff — we throw dirt as the hands break through.)
      this.state = 'entry';
      this.stateTime = 0;
      this.entryFrom.copy(this.root.position);
      this.model.position.y = -this.riseDepth();
      this.play('zombie_groan', 0.6);
      return;
    }
    super.beginEntry(kind);
    if (kind === 'drop') {
      // Respect low drop points (vents, ceilings); the base class forces ≥ 6 m.
      const p = this.root.position;
      const g = this.groundY(p.x, p.z);
      p.y = this.spawn.pos.y > g + 1.2 ? this.spawn.pos.y : g + 6;
      this.vy = 0;
    } else if (kind === 'burst') {
      this.world.fx.dust(this.worldPos(_w).setY(_w.y + 0.8), 0.8, 0x6a5e50);
      this.play(this.sfxAttack ?? 'zombie_attack', 0.9);
    } else if (kind === 'leap') {
      this.play(this.sfxAttack ?? 'zombie_attack', 0.7);
    }
  }

  protected override entryUpdate(dt: number): boolean {
    const kind = this.spawn.entry;
    const t = this.stateTime;
    switch (kind) {
      case 'rise': {
        const k = clamp(t / this.riseTime, 0, 1);
        const depth = this.riseDepth();
        this.model.position.y = -depth * (1 - smoothstep(0, 1, k));
        this.model.rotation.z = Math.sin(t * 9) * 0.05 * (1 - k);
        // Dirt bursts as the hands break the surface and the body heaves out.
        if (this.crossed(t, dt, 0.08 * this.riseTime) || this.crossed(t, dt, 0.5 * this.riseTime) || this.crossed(t, dt, 0.85 * this.riseTime)) {
          this.world.fx.dust(this.worldPos(_w), 0.45, 0x7a6a56);
          this.world.fx.gibs(_w.setY(_w.y + 0.1), 0x4a3a2a, 4, 0.07);
        }
        if (k >= 1) {
          this.model.position.y = 0;
          this.model.rotation.z = 0;
          return true;
        }
        return false;
      }
      case 'drop': {
        if (this.landT < 0) {
          this.vy -= 22 * dt;
          this.root.position.y += this.vy * dt;
          const g = this.groundY(this.root.position.x, this.root.position.z);
          if (this.root.position.y <= g) {
            this.root.position.y = g;
            this.landT = 0;
            this.onLand();
          }
          return false;
        }
        this.landT += dt;
        return this.landT >= this.landDuration();
      }
      case 'leap': {
        if (this.landT < 0) {
          if (super.entryUpdate(dt)) {
            this.landT = 0;
            this.onLand();
          }
          return false;
        }
        this.landT += dt;
        return this.landT >= 0.28;
      }
      default:
        return super.entryUpdate(dt);
    }
  }

  protected landDuration() {
    return 0.65;
  }

  protected onLand() {
    this.world.fx.dust(this.worldPos(_w), 0.9);
    if (this.distToPlayer < 14) this.world.rig.shake(0.08);
    this.world.audio.play('stomp', STOMP_OPTS);
  }

  /** True on the frame `t` passes `at`. */
  protected crossed(t: number, dt: number, at: number) {
    return t >= at && t - dt < at;
  }

  /** Entry poses for upright zombies. Return false to fall back to `pose()`. */
  protected poseEntry(dt: number): boolean {
    const r = this.r;
    const t = this.stateTime;
    switch (this.spawn.entry) {
      case 'rise': {
        restPose(r, this.hipsY);
        const k = clamp(t / this.riseTime, 0, 1);
        this.clawArm(r.armL, 1, t, k);
        this.clawArm(r.armR, -1, t, k);
        r.spine.rotation.x = 0.35 - 0.15 * k;
        r.spine.rotation.z = Math.sin(t * 5) * 0.1;
        r.head.rotation.x = -0.45 + 0.3 * k;
        if (k > 0.6) poseShamble(r, t * 7, (k - 0.6) / 0.4, 0.55, 0, this.hipsY);
        return true;
      }
      case 'drop': {
        restPose(r, this.hipsY);
        if (this.landT < 0) {
          const fl = this.age * 14;
          r.armL.shoulder.rotation.set(-2.4 + Math.sin(fl) * 0.4, 0, 0.6);
          r.armR.shoulder.rotation.set(-2.4 + Math.sin(fl + 2) * 0.4, 0, -0.6);
          r.legL.hip.rotation.x = Math.sin(fl * 0.7) * 0.35;
          r.legR.hip.rotation.x = -Math.sin(fl * 0.7) * 0.35;
          r.legL.knee.rotation.x = 0.5;
          r.legR.knee.rotation.x = 0.5;
          r.spine.rotation.x = -0.15;
        } else {
          const c = 1 - smoothstep(0.12, this.landDuration(), this.landT);
          poseCrouch(r, 0.85 * c, this.hipsY);
          r.spine.rotation.x = 0.15 + 0.65 * c;
          r.head.rotation.x = -0.55 * c;
          r.armL.shoulder.rotation.set(-0.5 - 0.6 * c, 0, 0.12 + 0.35 * c);
          r.armR.shoulder.rotation.set(-0.5 - 0.6 * c, 0, -0.12 - 0.35 * c);
        }
        return true;
      }
      case 'leap': {
        restPose(r, this.hipsY);
        if (this.landT < 0) {
          const k = clamp(t / 0.85, 0, 1);
          r.legL.hip.rotation.x = -1.1;
          r.legR.hip.rotation.x = -0.7;
          r.legL.knee.rotation.x = 1.8;
          r.legR.knee.rotation.x = 1.4;
          r.spine.rotation.x = 0.35 - 0.2 * k;
          r.head.rotation.x = -0.35;
          r.armL.shoulder.rotation.set(-2.3 + k * 0.6, 0, 0.55);
          r.armR.shoulder.rotation.set(-2.3 + k * 0.6, 0, -0.55);
          r.armL.elbow.rotation.x = -0.4;
          r.armR.elbow.rotation.x = -0.4;
        } else {
          const c = 1 - this.landT / 0.28;
          poseCrouch(r, 0.7 * c, this.hipsY);
          r.spine.rotation.x = 0.2 + 0.5 * c;
          r.armL.shoulder.rotation.set(-1.3, 0, 0.3);
          r.armR.shoulder.rotation.set(-1.3, 0, -0.3);
        }
        return true;
      }
      case 'burst': {
        restPose(r, this.hipsY);
        this.phase += dt * 13;
        poseShamble(r, this.phase, 1, 0.75, 0, this.hipsY);
        r.spine.rotation.x = 0.45;
        r.head.rotation.x = -0.3;
        r.armL.shoulder.rotation.set(-1.7 + Math.sin(this.phase) * 0.3, 0, 0.45);
        r.armR.shoulder.rotation.set(-1.7 - Math.sin(this.phase) * 0.3, 0, -0.45);
        return true;
      }
      default:
        return false;
    }
  }

  /** Clawing out of the ground: arms overhead, alternating hauls. */
  private clawArm(a: Limb, side: number, t: number, k: number) {
    const ph = t * 6.5 + (side > 0 ? 0 : Math.PI);
    const s = Math.sin(ph);
    a.shoulder.rotation.x = -2.75 + s * 0.45 + k * k * 1.3;
    a.shoulder.rotation.z = side * (0.28 + s * 0.12);
    a.elbow.rotation.x = -0.25 - Math.max(0, s) * 0.9;
  }

  // ─── Hits ───────────────────────────────────────────────────────────────

  /** Which body segment a hit mesh belongs to. */
  protected segmentOf(obj: THREE.Object3D): number {
    const r = this.r;
    let o: THREE.Object3D | null = obj.parent;
    while (o && o !== this.model) {
      if (o === r.head) return SEG_HEAD;
      if (o === r.armL.elbow) return SEG_FORE_L;
      if (o === r.armL.shoulder) return SEG_UPPER_L;
      if (o === r.armR.elbow) return SEG_FORE_R;
      if (o === r.armR.shoulder) return SEG_UPPER_R;
      if (o === r.legL.hip) return SEG_LEG_L;
      if (o === r.legR.hip) return SEG_LEG_R;
      o = o.parent;
    }
    return SEG_TORSO;
  }

  protected override onDamaged(hit: ShotHit, amount: number) {
    const seg = this.segmentOf(hit.object);
    this.lastSeg = seg;
    switch (seg) {
      case SEG_HEAD:
        this.kHead = 1;
        break;
      case SEG_UPPER_L:
      case SEG_FORE_L:
        this.kArmL = 1;
        break;
      case SEG_UPPER_R:
      case SEG_FORE_R:
        this.kArmR = 1;
        break;
      case SEG_LEG_L:
        this.kLegL = 1;
        break;
      case SEG_LEG_R:
        this.kLegR = 1;
        break;
      default:
        this.kTorso = 1;
        this.twist = this.world.rng.spread(1);
    }
    if (hit.part === 'head' && this.hp <= 0 && this.canPopHead) {
      this.popHead(hit);
      return;
    }
    if (seg >= SEG_UPPER_L && seg <= SEG_FORE_R && hit.damage >= this.minSeverDamage) {
      if (hit.damage >= 2 || amount >= 2 || this.world.rng.chance(this.severChance)) {
        const side: 1 | -1 = seg === SEG_UPPER_L || seg === SEG_FORE_L ? 1 : -1;
        this.sever(side, seg === SEG_UPPER_L || seg === SEG_UPPER_R, hit);
      }
    }
  }

  /** Killing headshot: the head bursts and the neck spurts. */
  protected popHead(hit: ShotHit) {
    if (this.headless) return;
    this.headless = true;
    const r = this.r;
    r.head.visible = false;
    const fx = this.world.fx;
    fx.gibs(hit.point, this.skinColor, 4, 0.1);
    fx.gibs(hit.point, BLOOD, 6, 0.08);
    fx.blood(hit.point, hit.dir, { color: this.bloodColor, amount: 1.1 });
    this.world.audio.play('gib', { volume: 0.75, vary: 0.15 });
    Kit.add(r.neck, Kit.box(0.1, 0.05, 0.1), Kit.mat(GORE), 0, 0.075, 0);
    Kit.add(r.neck, Kit.box(0.035, 0.05, 0.035), Kit.mat(BONE), 0, 0.09, -0.01);
    this.refreshMeshes();
    for (let i = 0; i < 3; i++) {
      this.world.later(0.12 + i * 0.22, () => {
        if (this.removed) return;
        r.neck.getWorldPosition(_w);
        _w.y += 0.12;
        this.world.fx.blood(_w, null, { color: this.bloodColor, amount: 0.7 });
      });
    }
  }

  /** Blow an arm off at the elbow (forearm hit) or shoulder (upper-arm hit). */
  protected sever(side: 1 | -1, whole: boolean, hit: ShotHit) {
    const idx = side > 0 ? 0 : 1;
    const state = this.severed[idx];
    if (state === 2) return;
    if (state === 1) whole = true;
    const arm = side > 0 ? this.r.armL : this.r.armR;
    const pivot = whole ? arm.shoulder : arm.elbow;
    const parent = pivot.parent;
    if (!parent) return;
    pivot.traverse((o) => {
      if (o.userData.shot) this.world.shootables.remove(o);
    });
    // Bloody stump left on the body.
    Kit.add(parent, Kit.box(0.11, 0.05, 0.12), Kit.mat(GORE), pivot.position.x, pivot.position.y + (whole ? 0 : 0.01), pivot.position.z);
    this.severed[idx] = whole ? 2 : 1;
    this.launchLimb(pivot, hit.dir, side);
    this.unrig(arm, whole);
    const fx = this.world.fx;
    fx.gibs(hit.point, this.skinColor, 2, 0.11);
    fx.gibs(hit.point, BLOOD, 4, 0.07);
    fx.blood(hit.point, hit.dir, { color: this.bloodColor, amount: 1 });
    this.world.audio.play('gib', { volume: 0.6, vary: 0.2 });
    this.refreshMeshes();
    if (this.state !== 'dying') this.flash(false);
  }

  /** Detach a limb into the world and let it tumble to the ground. */
  protected launchLimb(obj: THREE.Object3D, dir: THREE.Vector3, side: number) {
    const rng = this.world.rng;
    // A whole arm goes limp: relax its elbow into a slight sideways bend (it lies
    // in the ground plane once the limb settles on its front face).
    const bend = rng.chance(0.5) ? 0.35 : -0.35;
    for (const c of obj.children) if (!(c as THREE.Mesh).isMesh) c.rotation.set(0, 0, bend);
    // Measure the limb in its own space: length along −Y, thickness along Z
    // (local Z points down once it lies flat).
    let len = 0.3;
    let half = 0.05;
    let first = true;
    obj.updateMatrix();
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry.boundingBox) return;
      _m4.identity();
      for (let n: THREE.Object3D | null = m; n && n !== obj; n = n.parent) {
        n.updateMatrix();
        _m4.premultiply(n.matrix);
      }
      _box.copy(m.geometry.boundingBox).applyMatrix4(_m4);
      if (first) {
        len = -_box.min.y;
        half = _box.max.z;
        first = false;
      } else {
        len = Math.max(len, -_box.min.y);
        half = Math.max(half, _box.max.z);
      }
    });
    this.world.scene.attach(obj);
    const sc = obj.getWorldScale(_p).x;
    // Out to the arm's side (model +X is the zombie's left) and up, a little along the shot.
    this.root.getWorldQuaternion(_q);
    _v.set(side, 0, 0).applyQuaternion(_q);
    const out = rng.range(2, 3.2);
    const vel = new THREE.Vector3(_v.x * out + dir.x * 1.2 + rng.spread(0.6), rng.range(3, 4.5), _v.z * out + dir.z * 1.2 + rng.spread(0.6));
    const spin = new THREE.Vector3(rng.spread(12), rng.spread(12), rng.spread(12));
    this.flyers.push({
      obj,
      vel,
      spin,
      t: 0,
      restT: -1,
      len: Math.max(0.1, len) * sc,
      half: Math.max(0.02, half) * sc,
      fromQ: new THREE.Quaternion(),
      toQ: new THREE.Quaternion(),
      fromY: 0,
      restY: 0,
    });
  }

  /** Severed limbs: ballistic tumble, bounce, settle flat on the ground, then sink away. */
  protected tickFlyers(dt: number) {
    const fl = this.flyers;
    for (let i = fl.length - 1; i >= 0; i--) {
      const f = fl[i];
      f.t += dt;
      const o = f.obj;
      if (f.restT < 0) {
        f.vel.y -= 14 * dt;
        o.position.addScaledVector(f.vel, dt);
        o.rotation.x += f.spin.x * dt;
        o.rotation.y += f.spin.y * dt;
        o.rotation.z += f.spin.z * dt;
        // Lowest point: the joint end or the far end of the limb.
        _v.set(0, -f.len, 0).applyQuaternion(o.quaternion);
        const low = Math.min(0, _v.y) - f.half * 0.6;
        const g = this.world.groundAt(o.position.x, o.position.z);
        if (o.position.y + low <= g) {
          o.position.y = g - low;
          if (f.vel.y < -2.5) {
            // Bounce, trading spin for a splat.
            f.vel.y *= -0.3;
            f.vel.x *= 0.5;
            f.vel.z *= 0.5;
            f.spin.multiplyScalar(0.4);
            this.world.fx.blood(o.position, null, { color: this.bloodColor, amount: 0.3 });
          } else {
            // Settle: ease to lying flat along its current heading, resting on its side.
            f.restT = 0;
            f.fromQ.copy(o.quaternion);
            f.fromY = o.position.y;
            f.restY = g + f.half;
            const yaw = Math.atan2(-_v.x, -_v.z) + (Math.abs(_v.x) + Math.abs(_v.z) < 1e-4 ? this.world.rng.next() * 6 : 0);
            _e.set(Math.PI / 2, yaw, 0, 'YXZ');
            f.toQ.setFromEuler(_e);
          }
        }
      } else {
        f.restT += dt;
        const k = Math.min(1, f.restT / 0.16);
        const e = k * (2 - k);
        o.quaternion.slerpQuaternions(f.fromQ, f.toQ, e);
        o.position.y = lerp(f.fromY, f.restY, e);
        if (f.restT > 2.4) o.position.y -= (f.restT - 2.4) * 0.3;
      }
      if (f.restT > 3.4 || f.t > 7) {
        o.parent?.remove(o);
        fl.splice(i, 1);
      }
    }
  }

  override dispose(): void {
    super.dispose();
    for (const f of this.flyers) f.obj.parent?.remove(f.obj);
    this.flyers.length = 0;
    // Baked geometry is per zombie (random palettes) — free it with the zombie.
    this.b?.dispose();
  }

  // ─── Death ──────────────────────────────────────────────────────────────

  protected override onDeath(hit: ShotHit | null) {
    const rng = this.world.rng;
    this.deathBaseY = Math.min(0, this.model.position.y);
    this.mAir = Math.max(0, this.model.position.y);
    this.mAirV = 0;
    this.sink = 0;
    this.vy = Math.min(0, this.vy);
    this.deathLandAt = -1;
    this.model.rotation.set(0, 0, 0);
    const yaw = this.root.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let along = 0;
    let lateral = 0;
    if (hit) {
      const len = Math.hypot(hit.dir.x, hit.dir.z) || 1;
      along = (hit.dir.x * fx + hit.dir.z * fz) / len;
      lateral = (hit.dir.x * fz - hit.dir.z * fx) / len;
      this.deathDir.set(hit.dir.x / len, 0, hit.dir.z / len);
    } else if (this.recentBlast()) {
      // Thrown away from the blast centre.
      this.deathDir.subVectors(this.root.position, blasts.get(this.world)!.pos).setY(0);
      const len = this.deathDir.length();
      if (len > 0.01) this.deathDir.divideScalar(len);
      else this.deathDir.set(-fx, 0, -fz);
      along = this.deathDir.x * fx + this.deathDir.z * fz;
      lateral = this.deathDir.x * fz - this.deathDir.z * fx;
    } else {
      this.deathDir.set(-fx, 0, -fz);
      along = -1;
    }
    this.deathSide = lateral >= 0 ? 1 : -1;
    const seg = hit ? this.lastSeg : -1;
    let style: DeathStyle;
    this.deathSlide = hit && hit.damage < 3 ? 0.7 : 3.2;
    if (!hit) style = along > 0.4 ? 'forward' : Math.abs(lateral) > 0.6 ? 'spin' : 'blast';
    else if (this.deathBaseY < -0.3) style = 'drop';
    else if (hit.damage >= 3 && seg !== SEG_LEG_L && seg !== SEG_LEG_R) style = 'blast';
    else if (seg === SEG_LEG_L || seg === SEG_LEG_R) style = 'forward';
    else if (seg >= SEG_UPPER_L && seg <= SEG_FORE_R) style = 'spin';
    else if (Math.abs(lateral) > 0.55) style = 'spin';
    else if (along > 0.35) style = 'forward';
    else if (seg === SEG_HEAD) style = rng.chance(0.55) ? 'back' : 'drop';
    else style = rng.chance(0.62) ? 'back' : rng.chance(0.5) ? 'forward' : 'spin';
    if (style === 'spin' && Math.abs(lateral) < 0.2) this.deathSide = rng.chance(0.5) ? 1 : -1;
    this.deathStyle = style;
    this.deathSpin = this.deathSide * rng.range(5, 8);
    // Blood pool on the ground.
    if (this.deathBaseY > -0.5) {
      this.pool = Kit.add(this.root, Kit.cyl(0.55, 0.55, 0.01, 10), Kit.mat(0x2a0404), 0, 0.012, 0, 0, rng.next() * 3, 0, 0.01, 1, 0.01);
      this.pool.userData.noFlash = true;
    }
  }

  protected override updateDeath(dt: number): boolean {
    const t = this.stateTime;
    this.tickFlyers(dt);
    // Fall if killed mid-air (drop entries, leaps, pounces).
    const g = this.groundY(this.root.position.x, this.root.position.z);
    if (this.root.position.y > g + 0.001) {
      this.vy -= 22 * dt;
      this.root.position.y = Math.max(g, this.root.position.y + this.vy * dt);
    }
    if (this.mAir > 0) {
      this.mAirV -= 22 * dt;
      this.mAir = Math.max(0, this.mAir + this.mAirV * dt);
    }
    const lift = this.poseDeath(t, dt);
    if (t > this.corpseTime - 1.3) this.sink += dt * 0.55;
    this.model.position.y = this.deathBaseY + this.mAir + lift - this.sink;
    if (this.pool) {
      const s = smoothstep(0.3, 1.6, t) * (1 - smoothstep(this.corpseTime - 0.6, this.corpseTime, t));
      this.pool.scale.set(Math.max(0.01, s * 1.3), 1, Math.max(0.01, s));
      this.poolOffset(_v);
      const a = this.model.rotation.y;
      this.pool.position.set(_v.x * Math.cos(a) + _v.z * Math.sin(a), 0.012, -_v.x * Math.sin(a) + _v.z * Math.cos(a));
    }
    return this.corpseGone(t);
  }

  /** The corpse has sunk away; linger (hidden) until any severed limbs have sunk too. */
  protected corpseGone(t: number): boolean {
    if (t <= this.corpseTime) return false;
    this.model.visible = false;
    return this.flyers.length === 0;
  }

  private recentBlast(): boolean {
    const b = blasts.get(this.world);
    return !!b && this.world.time - b.time < 0.1;
  }

  /** Where the torso ends up lying, relative to the feet (model space, before any death spin). */
  protected poolOffset(out: THREE.Vector3) {
    const reach = 0.75 * this.r.scale;
    const st = this.deathStyle;
    return out.set(st === 'spin' ? this.deathSide * reach : 0, 0, st === 'back' || st === 'blast' ? -reach : st === 'spin' ? 0 : reach);
  }

  /** Thud when the body hits the ground. */
  protected onBodyLand() {
    this.model.getWorldPosition(_w);
    this.world.fx.dust(_w, 0.4, 0x6e6454);
  }

  /** Death pose as a function of time. Returns extra lift so lying bodies rest on the ground. */
  protected poseDeath(t: number, dt: number): number {
    const r = this.r;
    restPose(r, this.hipsY);
    const side = this.deathSide;
    let lift = 0;
    let landed = false;
    // Slide with the impact.
    const slide = this.deathSlide;
    const sk = Math.max(0, 1 - t / 0.45);
    if (sk > 0) this.root.position.addScaledVector(this.deathDir, slide * sk * sk * dt * 2);
    switch (this.deathStyle) {
      case 'back':
      case 'blast': {
        const dur = this.deathStyle === 'blast' ? 0.42 : 0.62;
        const f = clamp((t - 0.04) / dur, 0, 1);
        const e = f * f;
        landed = f >= 1;
        const bounce = this.deathLandAt >= 0 ? Math.sin(clamp((t - this.deathLandAt) / 0.22, 0, 1) * Math.PI) * 0.07 : 0;
        this.model.rotation.x = -1.42 * e + bounce;
        r.spine.rotation.x = -0.3 * Math.sin(f * Math.PI);
        r.head.rotation.x = -0.5 * (1 - e) + 0.25 * e;
        r.head.rotation.z = side * 0.3 * e;
        r.armL.shoulder.rotation.set(-1.0 - 1.7 * e, 0, 0.3 + 0.5 * e);
        r.armR.shoulder.rotation.set(-1.0 - 1.5 * e, 0, -0.3 - 0.7 * e);
        r.armL.elbow.rotation.x = -0.4 * e;
        r.legL.hip.rotation.x = -0.35 * Math.sin(f * Math.PI);
        r.legR.hip.rotation.x = -0.15 * Math.sin(f * Math.PI);
        r.legL.knee.rotation.x = 0.5 * Math.sin(f * Math.PI);
        lift = 0.12 * e;
        break;
      }
      case 'forward': {
        const c = smoothstep(0, 0.3, t);
        const f = clamp((t - 0.22) / 0.5, 0, 1);
        const e = f * f;
        landed = f >= 1;
        poseCrouch(r, 0.55 * c * (1 - 0.8 * e), this.hipsY);
        this.model.rotation.x = 1.42 * e;
        r.spine.rotation.x = 0.4 * c * (1 - e);
        r.head.rotation.x = -0.2 + 0.4 * e;
        r.head.rotation.z = side * 0.4 * e;
        r.armL.shoulder.rotation.set(-0.5 - 1.3 * e, 0, 0.2 + 0.4 * e);
        r.armR.shoulder.rotation.set(-0.3 - 1.1 * e, 0, -0.2 - 0.6 * e);
        lift = 0.1 * e;
        break;
      }
      case 'spin': {
        this.model.rotation.y += this.deathSpin * dt;
        this.deathSpin *= Math.exp(-3.5 * dt);
        const c = smoothstep(0, 0.4, t);
        const f = clamp((t - 0.28) / 0.5, 0, 1);
        const e = f * f;
        landed = f >= 1;
        poseCrouch(r, 0.45 * c * (1 - 0.7 * e), this.hipsY);
        this.model.rotation.z = -side * 1.42 * e;
        r.spine.rotation.x = 0.45 * c;
        r.spine.rotation.z = side * 0.35 * c;
        r.head.rotation.z = side * 0.5 * c;
        r.armL.shoulder.rotation.set(-0.4, 0, 0.5 + 0.8 * c);
        r.armR.shoulder.rotation.set(-0.6, 0, -0.5 - 0.8 * c);
        lift = 0.1 * e;
        break;
      }
      case 'drop': {
        const c = smoothstep(0, 0.32, t);
        const f = clamp((t - 0.42) / 0.5, 0, 1);
        const e = f * f;
        landed = f >= 1;
        poseCrouch(r, c, this.hipsY);
        this.model.rotation.x = 1.3 * e;
        r.spine.rotation.x = 0.6 * c;
        r.head.rotation.x = 0.5 * c;
        r.armL.shoulder.rotation.set(0.2 - 1.4 * e, 0, 0.25);
        r.armR.shoulder.rotation.set(0.1 - 1.2 * e, 0, -0.25);
        lift = 0.06 * e;
        break;
      }
    }
    if (landed && this.deathLandAt < 0 && this.deathBaseY > -0.5) {
      this.deathLandAt = t;
      this.onBodyLand();
    }
    return lift;
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /** Take one of the world's attack slots directly (for custom attack states). */
  protected grabSlot(): boolean {
    if (this.holdsSlot) return true;
    if (this.world.attackSlots > 0) {
      this.world.attackSlots--;
      this.holdsSlot = true;
      return true;
    }
    return false;
  }

  /** Anchor visible in the camera (with a looser vertical margin for low enemies). */
  protected inView(obj: THREE.Object3D, mx = 0.9, my = 0.92): boolean {
    obj.getWorldPosition(_w);
    _w.project(this.world.camera);
    return _w.z < 1 && Math.abs(_w.x) < mx && Math.abs(_w.y) < my;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Walker
// ═══════════════════════════════════════════════════════════════════════════

/** Bread-and-butter shambler. One headshot or three body shots. */
export class Walker extends Zombie {
  protected variant = 'civilian';
  protected limp = 0;
  protected lean = 0.18;
  protected reachL = true;
  protected reachR = true;
  protected headTilt = 0;

  protected override configure() {
    const rng = this.world.rng;
    this.name = 'walker';
    this.maxHp = 2.5;
    this.speed = rng.range(1.0, 1.4);
    this.attackRange = 1.7;
    this.windup = 1.6;
    this.points = 100;
    this.sfxIdle = 'zombie_groan';
    this.sfxAttack = 'zombie_attack';
    this.sfxDie = 'zombie_die';
    this.bloodColor = 0x8a0d0d;
  }

  protected override build() {
    const rng = this.world.rng;
    this.variant = variantOpt(this.spawn.opts, rng, 'civilian');
    this.makeBody({
      height: rng.range(1.66, 1.86),
      skin: rng.pick(SKIN_TONES),
      eyes: rng.pick([0xffe9a0, 0xfff4c8, 0xd8ecff, 0xffc870]),
      bulk: rng.range(0.92, 1.12),
      variant: this.variant,
      missingArm: 0.14,
    });
    this.finishBody();
    this.limp = rng.chance(0.45) ? rng.spread(1) : 0;
    this.lean = rng.range(0.1, 0.32);
    this.headTilt = rng.spread(0.35);
    this.reachL = rng.chance(0.8);
    this.reachR = rng.chance(0.8);
  }

  protected override pose(dt: number) {
    const r = this.r;
    restPose(r, this.hipsY);
    const gs = this.groundSpeed;
    const run = clamp((gs - 2.2) / 2.5, 0, 1);
    this.phase += dt * (1.4 + Math.min(gs, 7) * 2.4);
    const amt = Math.max(0.22, clamp(gs / 0.4, 0, 1));
    poseShamble(r, this.phase, amt, 0.42 + run * 0.35, this.limp * (1 - run), this.hipsY);
    const sway = Math.sin(this.phase * 0.5);
    r.spine.rotation.x = this.lean + run * 0.25 + Math.abs(Math.sin(this.phase)) * 0.03;
    r.spine.rotation.z = sway * 0.08;
    r.spine.rotation.y = sway * 0.06;
    r.neck.rotation.x = -this.lean * 0.5;
    r.head.rotation.z = this.headTilt + Math.sin(this.age * 0.9 + this.seed) * 0.12;
    r.head.rotation.x = -0.05 + Math.sin(this.age * 1.3 + this.seed) * 0.06;
    this.poseArm(r.armL, 1, this.reachL, amt);
    this.poseArm(r.armR, -1, this.reachR, amt);

    const t = this.stateTime;
    if (this.state === 'windup') {
      const k = clamp(t / this.windup, 0, 1);
      const e = k * k * (3 - 2 * k);
      const trem = k > 0.6 ? Math.sin(t * 42) * 0.08 : 0;
      this.raiseArm(r.armL, 1, e, trem);
      this.raiseArm(r.armR, -1, e, -trem);
      r.spine.rotation.x = this.lean - 0.42 * e;
      r.head.rotation.x = -0.5 * e;
      r.neck.rotation.x -= 0.2 * e;
      if (!this.carried) poseCrouch(r, 0.18 * e, this.hipsY);
    } else if (this.state === 'recover' && t < 0.45) {
      const f = 1 - t / 0.45;
      const e = f * f;
      r.spine.rotation.x = this.lean + 0.7 * e;
      r.head.rotation.x = 0.3 * e;
      r.armL.shoulder.rotation.x = -1.35 + 0.5 * e;
      r.armR.shoulder.rotation.x = -1.35 + 0.5 * e;
      r.armL.shoulder.rotation.z = 0.1;
      r.armR.shoulder.rotation.z = -0.1;
    } else if (this.state === 'stagger') {
      const k = Math.sin(clamp(t / this.staggerTime, 0, 1) * Math.PI);
      r.spine.rotation.x = this.lean - 0.5 * k;
      r.head.rotation.x -= 0.35 * k;
      r.armL.shoulder.rotation.x += 0.8 * k;
      r.armR.shoulder.rotation.x += 0.8 * k;
      r.armL.shoulder.rotation.z += 0.4 * k;
      r.armR.shoulder.rotation.z -= 0.4 * k;
      r.legL.knee.rotation.x += 0.4 * k;
    }
  }

  protected poseArm(a: Limb, side: number, reach: boolean, amt: number) {
    if (reach) {
      a.shoulder.rotation.x = -1.35 + Math.sin(this.phase * 0.5 + side) * 0.15;
      a.shoulder.rotation.z = side * 0.13;
      a.elbow.rotation.x = -0.15 + Math.sin(this.phase * 0.5 + side * 2) * 0.12;
    } else {
      a.shoulder.rotation.x = 0.12 + Math.sin(this.phase) * 0.3 * side * amt;
      a.shoulder.rotation.z = side * 0.12;
      a.elbow.rotation.x = -0.25;
    }
  }

  protected raiseArm(a: Limb, side: number, e: number, trem: number) {
    a.shoulder.rotation.x = lerp(a.shoulder.rotation.x, -2.45, e) + trem;
    a.shoulder.rotation.z = side * (0.15 + 0.3 * e);
    a.elbow.rotation.x = -0.75 * e;
  }

  protected override strike() {
    super.strike();
    this.play('bite', 0.8);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════════════════════════════════════

/** Fresh infected: sprints in hunched, lunges, low hp. */
export class Runner extends Zombie {
  private lunged = false;
  private lungeFrom = new THREE.Vector3();
  private lungeTo = new THREE.Vector3();
  private twitchT = 0;
  private twitch = 0;
  /** Flanking round the player/vehicle: which side (±1, 0 = undecided) and whether it's under way. */
  private flankSide = 0;
  private flanking = false;

  protected override configure() {
    const rng = this.world.rng;
    this.name = 'runner';
    this.maxHp = 1.5;
    this.speed = rng.range(4, 5);
    this.attackRange = 1.8;
    this.windup = 1.0;
    this.recoverTime = 0.9;
    this.points = 150;
    this.telegraphRadius = 0.5;
    this.sfxIdle = 'runner_shriek';
    this.sfxAttack = 'runner_shriek';
    this.sfxDie = 'zombie_die';
    this.bloodColor = 0x900e0e;
    this.knockback = 0.25;
  }

  protected override build() {
    const rng = this.world.rng;
    this.makeBody({
      height: rng.range(1.68, 1.85),
      skin: rng.pick([0xb8bfb0, 0xa9b79a, 0xa8a8b4, 0xb4ae84]),
      eyes: 0xff3a1a,
      eyeGlow: 2.2,
      bulk: 0.86,
      armLength: 1.12,
      variant: variantOpt(this.spawn.opts, rng, 'civilian'),
      gore: 1.4,
      missingArm: 0.06,
    });
    this.finishBody();
  }

  /** Lateral clearance to keep from the player (the vehicle's width when driving). */
  private get flankClear() {
    return this.inVehicle ? 2.5 : 1.3;
  }

  /** In front of the player — in view space — by enough to approach head-on? */
  private inFront(local: THREE.Vector3) {
    return -local.z >= this.attackRange * 0.6;
  }

  protected override beginEntry(kind: EntryKind) {
    super.beginEntry(kind);
    if (kind !== 'leap') return;
    // Leaping in from behind/alongside: land out on the flank, never on (or in) the player/vehicle.
    this.toView(this.root.position, _v);
    if (this.inFront(_v)) return;
    const side = _v.x >= 0 ? 1 : -1;
    this.flankSide = side;
    const y = this.entryTo.y;
    this.toView(this.entryTo, _w);
    _w.x = side * Math.max(this.flankClear + 0.2, Math.abs(_w.x), Math.abs(_v.x));
    this.fromView(_w);
    this.entryTo.set(_w.x, y, _w.z);
  }

  protected override advanceUpdate(dt: number) {
    if (this.flank(dt)) return;
    const d = this.distToPlayer;
    if (!this.lunged && d > this.attackRange + 1.6 && d < this.attackRange + 5.5 && this.world.rng.chance(dt * 2.2) && this.onScreen()) {
      this.startLunge();
      return;
    }
    // Close in on the point of the attack circle nearest to it, but within
    // ±24° of where the camera looks, so the attack is framed in the middle of
    // the screen (not at the edge under the HUD, after overtaking wide).
    const local = this.toView(this.root.position, _v);
    const ang = clamp(Math.atan2(local.x, -local.z), -0.42, 0.42);
    _w.set(Math.sin(ang) * this.attackRange, 0, -Math.cos(ang) * this.attackRange);
    this.fromView(_w);
    const remaining = this.moveToward(_w, this.speed, dt);
    this.separate(dt);
    if (remaining <= 0.1) {
      this.playerPos(_p);
      this.faceToward(_p, dt);
      if (this.grabSlot()) this.setState('windup');
    }
  }

  /**
   * Behind or alongside the player: sprint round the outside (sideways first,
   * then forward along the flank) instead of straight through the player — or
   * through the truck's cab when chasing a vehicle — until it has overtaken
   * well past its attack range. Returns true while flanking.
   */
  private flank(dt: number): boolean {
    const local = this.toView(this.root.position, _v);
    if (!this.flanking) {
      if (this.inFront(local)) {
        this.flankSide = 0;
        return false;
      }
      this.flanking = true;
    } else if (-local.z >= this.attackRange + 0.9) {
      this.flanking = false;
      this.flankSide = 0;
      return false;
    }
    const clear = this.flankClear;
    if (!this.flankSide) this.flankSide = local.x > 0.05 ? 1 : local.x < -0.05 ? -1 : this.world.rng.chance(0.5) ? 1 : -1;
    const ax = Math.abs(local.x);
    const x = this.flankSide * Math.max(clear, ax);
    // Too close sideways: step out first (keeping its place along the rail), then run up the flank.
    const z = ax < clear - 0.15 ? Math.min(local.z, 1.2) : -(this.attackRange + 1.5);
    _w.set(x, 0, z);
    this.fromView(_w);
    this.moveToward(_w, this.speed, dt);
    this.separate(dt);
    return true;
  }

  private startLunge() {
    this.lunged = true;
    this.lungeFrom.copy(this.root.position);
    this.playerPos(_p);
    _v.subVectors(_p, this.root.position).setY(0);
    const d = _v.length();
    const travel = clamp(d - this.attackRange - 0.3, 0, 4.2);
    this.lungeTo.copy(this.root.position).addScaledVector(_v.normalize(), travel);
    this.setState('lunge');
    this.play('runner_shriek', 0.8);
  }

  protected override customUpdate(dt: number) {
    if (this.state !== 'lunge') return;
    const dur = 0.55;
    const k = clamp(this.stateTime / dur, 0, 1);
    this.root.position.lerpVectors(this.lungeFrom, this.lungeTo, k);
    this.model.position.y = Math.sin(k * Math.PI) * 0.75;
    this.moveSpeed = this.lungeFrom.distanceTo(this.lungeTo) / dur;
    this.playerPos(_p);
    this.faceToward(_p, dt, 10);
    if (k >= 1) {
      this.model.position.y = 0;
      this.world.fx.dust(this.worldPos(_w), 0.6);
      this.setState('advance');
    }
  }

  override stagger() {
    // Shot out of the air mid-lunge: fall from where it was instead of snapping down.
    if (this.state === 'lunge') {
      this.mAir = Math.max(0, this.model.position.y);
      this.mAirV = 0;
    }
    super.stagger();
  }

  protected override animate(dt: number) {
    if (this.state !== 'lunge' && this.state !== 'dying' && this.mAir > 0) {
      this.mAirV -= 22 * dt;
      this.mAir = Math.max(0, this.mAir + this.mAirV * dt);
      this.model.position.y = this.mAir;
      if (this.mAir === 0) {
        this.mAirV = 0;
        this.world.fx.dust(this.worldPos(_w), 0.5);
      }
    }
    super.animate(dt);
  }

  protected override pose(dt: number) {
    const r = this.r;
    restPose(r, this.hipsY);
    const gs = this.groundSpeed;
    const amt = clamp(gs / 2.5, 0, 1);
    // Cadence capped so rig-frame chases (huge ground speed) don't blur.
    this.phase += dt * (3 + Math.min(gs, 9) * 2.1);
    this.twitchT -= dt;
    if (this.twitchT <= 0) {
      this.twitchT = this.world.rng.range(0.4, 1.6);
      this.twitch = this.world.rng.spread(0.35);
    }
    const st = this.state;
    const t = this.stateTime;
    if (st === 'lunge') {
      const k = clamp(t / 0.55, 0, 1);
      r.legL.hip.rotation.x = -1.0 + k * 0.8;
      r.legR.hip.rotation.x = 0.5 - k * 0.6;
      r.legL.knee.rotation.x = 1.2;
      r.legR.knee.rotation.x = 1.0;
      r.spine.rotation.x = 0.55;
      r.neck.rotation.x = -0.4;
      r.armL.shoulder.rotation.set(-2.3, 0, 0.6);
      r.armR.shoulder.rotation.set(-2.3, 0, -0.6);
      r.armL.elbow.rotation.x = -0.3;
      r.armR.elbow.rotation.x = -0.3;
      return;
    }
    if (amt > 0.25) {
      poseRun(r, this.phase, amt, this.hipsY);
      r.spine.rotation.x = 0.15 + 0.5 * amt;
      r.spine.rotation.y = Math.sin(this.phase) * 0.18 * amt;
      r.neck.rotation.x = -0.4 * amt;
      r.head.rotation.x = -0.15 * amt;
      r.head.rotation.z = this.twitch * 0.5;
      // Arms trailing, flailing behind.
      const s = Math.sin(this.phase);
      r.armL.shoulder.rotation.set(0.7 * amt + s * 0.45 * amt, 0, 0.3 + Math.abs(s) * 0.15);
      r.armR.shoulder.rotation.set(0.7 * amt - s * 0.45 * amt, 0, -0.3 - Math.abs(s) * 0.15);
      r.armL.elbow.rotation.x = -0.6 - Math.max(0, s) * 0.5;
      r.armR.elbow.rotation.x = -0.6 - Math.max(0, -s) * 0.5;
    } else {
      // Twitchy predatory crouch.
      poseCrouch(r, 0.32, this.hipsY);
      r.spine.rotation.x = 0.55;
      r.neck.rotation.x = -0.45;
      r.head.rotation.z = this.twitch;
      r.head.rotation.x = Math.sin(this.age * 23) * 0.04;
      r.armL.shoulder.rotation.set(-0.9 + this.twitch * 0.3, 0, 0.45);
      r.armR.shoulder.rotation.set(-0.9 - this.twitch * 0.3, 0, -0.45);
      r.armL.elbow.rotation.x = -0.7;
      r.armR.elbow.rotation.x = -0.7;
    }
    if (st === 'windup') {
      const k = clamp(t / this.windup, 0, 1);
      const e = k * k * (3 - 2 * k);
      const spring = smoothstep(0.78, 1, k);
      // Carried by a moving vehicle the legs keep sprinting (no ice-skating crouch).
      if (!this.carried) poseCrouch(r, 0.5 * e * (1 - spring), this.hipsY);
      r.spine.rotation.x = 0.55 + 0.25 * e - 0.4 * spring;
      r.neck.rotation.x = -0.6 * e;
      r.head.rotation.z = Math.sin(t * 30) * 0.12 * e;
      r.armL.shoulder.rotation.set(lerp(0.9 * e, -2.4, spring), 0, 0.6);
      r.armR.shoulder.rotation.set(lerp(0.9 * e, -2.4, spring), 0, -0.6);
      r.armL.elbow.rotation.x = -0.9 * e * (1 - spring);
      r.armR.elbow.rotation.x = -0.9 * e * (1 - spring);
      // Spring forward at the camera.
      r.root.position.z = spring * 0.55;
    } else if (st === 'recover' && t < 0.4) {
      const f = 1 - t / 0.4;
      r.root.position.z = 0.55 * f;
      r.spine.rotation.x = 0.4 + 0.5 * f;
      r.armL.shoulder.rotation.set(-1.0 * f, 0, 0.3 - 0.6 * f);
      r.armR.shoulder.rotation.set(-1.2 * f, 0, -0.3 + 0.6 * f);
    } else if (st === 'stagger') {
      const k = Math.sin(clamp(t / this.staggerTime, 0, 1) * Math.PI);
      r.spine.rotation.x -= 0.6 * k;
      r.armL.shoulder.rotation.x -= 1.0 * k;
      r.armR.shoulder.rotation.x -= 1.0 * k;
    }
  }

  protected override strike() {
    super.strike();
    this.play('bite', 0.9);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Crawler
// ═══════════════════════════════════════════════════════════════════════════

const TAU = Math.PI * 2;
/** Prone torso pitch, shoulder distance from the hips joint, crawl stroke reach (model z) and hand height. */
const CRAWL_PITCH = 1.42;
const CRAWL_HEAVE = 0.35;
const CRAWL_SHOULDER = 0.46;
const CRAWL_FAR = 1.0;
const CRAWL_NEAR = 0.76;
const CRAWL_HAND_Y = 0.07;
const CRAWL_PLANT = 0.55;
const CRAWL_SPLAY = 0.3;
const _hl = new THREE.Vector3();
const _hr = new THREE.Vector3();

/** Phase → cycle position 0..1. */
function cycle(ph: number) {
  const u = ph / TAU;
  return u - Math.floor(u);
}

/** 0..1 while the hand is planted (peaks mid-pull). */
function plantOf(u: number) {
  return u < CRAWL_PLANT ? Math.sin((Math.PI * u) / CRAWL_PLANT) : 0;
}

/** Hand target (y, z in the model's side plane) at cycle position `u`: planted and sliding back, then lifted and swung forward. */
function handTarget(u: number, out: THREE.Vector3) {
  if (u < CRAWL_PLANT) return out.set(0, CRAWL_HAND_Y, lerp(CRAWL_FAR, CRAWL_NEAR, smoothstep(0, 1, u / CRAWL_PLANT)));
  const e = (u - CRAWL_PLANT) / (1 - CRAWL_PLANT);
  return out.set(0, CRAWL_HAND_Y + Math.sin(e * Math.PI) * 0.17, lerp(CRAWL_NEAR, CRAWL_FAR, smoothstep(0, 1, e)));
}

/**
 * Chest heave 0..1 needed for a hand at reach `z`: the further the hand is
 * pulled back under the body, the higher the chest must ride for the bent
 * elbow to clear the ground.
 */
function heaveOf(z: number) {
  return Math.sqrt(clamp((CRAWL_FAR - z) / (CRAWL_FAR - CRAWL_NEAR), 0, 1));
}

const _ik = { phi1: 0, el: 0 };

/**
 * Planar two-bone IK in the model's side plane. Angles use the rig convention
 * (direction (z, y) = (−sin φ, −cos φ); 0 = straight down, −π/2 = forward).
 * Elbow-down solution, i.e. natural flexion (el ≤ 0). Writes `_ik`.
 */
function solveArm(sy: number, sz: number, hy: number, hz: number, l1: number, l2: number) {
  const vz = hz - sz;
  const vy = hy - sy;
  const d = clamp(Math.hypot(vz, vy), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
  const phiV = Math.atan2(-vz, -vy);
  const alpha = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const beta = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  _ik.phi1 = phiV + alpha;
  _ik.el = -(Math.PI - beta);
}

/** Legless torso dragging itself on its arms. Pounces at your face from ~3 m. */
export class Crawler extends Zombie {
  private legless = true;
  /** Pivot for everything below the waist (counter-rotated to drag flat). */
  private drag!: THREE.Group;
  private lift = 0;
  private liftV = 0;
  private pull = 0;
  private launched = false;
  private pounceFrom = new THREE.Vector3();
  private pounceTo = new THREE.Vector3();
  private static readonly COIL = 0.8;
  private static readonly FLY = 0.36;
  private static readonly BACK = 0.45;
  /** Flight time of the current pounce (longer from the vehicle stand-off). */
  private fly = Crawler.FLY;

  protected override configure() {
    this.name = 'crawler';
    this.maxHp = 1.5;
    this.speed = 1.2;
    this.attackRange = 3.3;
    this.windup = Crawler.COIL + Crawler.FLY;
    this.recoverTime = 0.7;
    this.points = 150;
    this.telegraphRadius = 0.35;
    this.sfxIdle = 'crawler_hiss';
    this.sfxAttack = 'crawler_hiss';
    this.sfxDie = 'zombie_die';
    this.bloodColor = 0x8a0d0d;
    this.knockback = 0.2;
    this.hipsY = 0.15;
    this.riseTime = 1.1;
  }

  protected override build() {
    const rng = this.world.rng;
    const b = this.makeBody({
      height: rng.range(1.6, 1.75),
      skin: rng.pick(SKIN_TONES),
      eyes: 0xffa830,
      eyeGlow: 2,
      bulk: 0.92,
      headSize: 0.9,
      variant: variantOpt(this.spawn.opts, rng, rng.pick(['civilian', 'civilian', 'patient', 'office', 'worker'])),
      gore: 1.3,
    });
    const r = this.r;
    this.legless = rng.chance(0.65);
    if (this.legless) {
      r.hips.remove(r.legL.hip);
      r.hips.remove(r.legR.hip);
      r.hips.remove(b.pelvis);
    } else {
      // Broken legs dragging limp behind.
      b.box(r.legL.knee, 0.08, 0.06, 0.14, BLOOD_DARK, 0, 0, 0);
    }
    // Everything below the waist (legs, belts, gown/coat tails) hangs off a
    // "drag" pivot that stays flat along the ground (−Y in hips space = behind
    // once prone) while the chest heaves up with each pull.
    const drag = (this.drag = new THREE.Group());
    for (const c of [...r.hips.children]) if (c !== r.spine) drag.add(c);
    r.hips.add(drag);
    if (this.legless) {
      // Torn waist: guts and spine trailing behind.
      b.box(r.spine, 0.3, 0.05, 0.18, GORE, 0, -0.03, 0, 0, 0, 0, 0, 'torso');
      b.part(drag, Kit.cyl(0.03, 0.025, 0.22, 5), BONE, 0, -0.06, -0.04, 0.2, 0, 0, 1, 1, 1, 0, 'torso');
      b.part(drag, Kit.capsule(0.045, 0.2, 2, 5), GUTS, 0.06, -0.09, 0.03, 0.4, 0, 0.3, 1, 1, 1, 0, 'torso');
      b.part(drag, Kit.capsule(0.04, 0.26, 2, 5), BLOOD, -0.06, -0.14, 0.0, -0.3, 0, -0.25, 1, 1, 1, 0, 'torso');
      b.part(drag, Kit.capsule(0.035, 0.18, 2, 5), GUTS, 0.0, -0.24, 0.05, 0.5, 0, 0.6, 1, 1, 1, 0, 'torso');
    }
    this.finishBody();
  }

  protected override riseDepth() {
    return 0.75;
  }

  /** From a vehicle it must start further out, or the cab/hood hides it. */
  protected override vehicleRange() {
    return VEHICLE_POUNCE_RANGE;
  }

  protected override onDamaged(hit: ShotHit, amount: number) {
    super.onDamaged(hit, amount);
    // No arms left to drag itself with.
    if (this.severed[0] && this.severed[1] && this.hp > 0) this.hp = 0;
  }

  // ── Pounce state (replaces the default windup) ──

  override setState(s: EnemyState) {
    if (this.state === 'pounce' && s !== 'pounce') this.telegraph = null;
    if (s === 'windup') s = 'pounce';
    const had = this.holdsSlot;
    super.setState(s);
    if (s === 'pounce') {
      // Base setState releases slots for custom states — keep ours.
      if (had) this.grabSlot();
      this.launched = false;
      this.fly = clamp(Crawler.FLY + (this.distToPlayer - 3.3) * 0.06, Crawler.FLY, 0.5);
      this.windup = Crawler.COIL + this.fly;
      this.telegraph = { progress: 0, anchor: this.r.head, radius: this.telegraphRadius };
      this.play('crawler_hiss', 0.9);
    }
  }

  protected override advanceUpdate(dt: number) {
    this.playerPos(_p);
    // Surges with each arm pull; averages out at `speed`.
    const surge = 0.36 + this.pull;
    const remaining = this.moveToward(_p, this.speed * surge, dt, this.attackRange);
    this.separate(dt);
    if (remaining <= 0.05) {
      this.faceToward(_p, dt);
      // On foot its low head may sit at the screen's bottom edge; from a vehicle it must clear the hood.
      if (!this.inView(this.r.head, 0.85, this.inVehicle ? 0.6 : 1.15)) {
        this.world.camera.getWorldDirection(_v).setY(0).normalize();
        _v.multiplyScalar(this.attackRange).add(this.world.rig.space.position);
        if (this.frame === 'rig') this.world.rig.space.worldToLocal(_v);
        this.moveToward(_v, this.speed * 0.8, dt);
        return;
      }
      if (this.grabSlot()) this.setState('pounce');
    }
  }

  protected override customUpdate(dt: number) {
    if (this.state !== 'pounce') return;
    const t = this.stateTime;
    const C = Crawler.COIL;
    const F = this.fly;
    this.playerPos(_p);
    if (this.telegraph) this.telegraph.progress = clamp(t / (C + F), 0, 1);
    if (t < C) {
      this.faceToward(_p, dt, 8);
      return;
    }
    if (!this.launched) {
      this.launched = true;
      this.pounceFrom.copy(this.root.position);
      _v.subVectors(_p, this.root.position).setY(0);
      const d = _v.length();
      this.pounceTo.copy(this.root.position).addScaledVector(_v.normalize(), Math.max(0, d - 0.8));
      this.world.audio.play('whoosh', { volume: 0.6, vary: 0.1 });
    }
    if (t < C + F) {
      const k = (t - C) / F;
      this.root.position.lerpVectors(this.pounceFrom, this.pounceTo, k);
      this.lift = (this.world.rig.eyeHeight - 0.55) * (1 - (1 - k) * (1 - k)) + Math.sin(k * Math.PI) * 0.25;
      this.liftV = 0;
      this.moveSpeed = this.pounceFrom.distanceTo(this.pounceTo) / F;
      return;
    }
    if (this.telegraph) {
      // Impact.
      this.telegraph = null;
      this.world.hurtPlayer(this.damage, this.name);
      this.play('bite', 1);
      this.pounceFrom.copy(this.root.position);
      _v.subVectors(this.root.position, _p).setY(0).normalize();
      this.pounceTo.copy(_p).addScaledVector(_v, this.attackRange - 0.1);
    }
    // Knocked back down to the ground.
    const k = clamp((t - C - F) / Crawler.BACK, 0, 1);
    this.root.position.lerpVectors(this.pounceFrom, this.pounceTo, 1 - (1 - k) * (1 - k));
    if (k >= 1) this.setState('recover');
  }

  protected override animate(dt: number) {
    // Gravity on the pounce lift whenever we're not mid-pounce.
    if (this.state !== 'pounce' || this.stateTime > Crawler.COIL + this.fly) {
      if (this.lift > 0) {
        this.liftV -= 18 * dt;
        this.lift = Math.max(0, this.lift + this.liftV * dt);
        if (this.lift === 0) this.liftV = 0;
      }
    }
    super.animate(dt);
    this.r.root.position.y += this.lift;
    // Legs/guts drag flat behind the waist; dangle once it leaves the ground.
    const airborne = (this.state === 'pounce' && this.stateTime > Crawler.COIL) || (this.state === 'entry' && this.spawn.entry === 'drop' && this.landT < 0);
    this.drag.rotation.x = airborne ? 0.25 : clamp(CRAWL_PITCH - this.r.hips.rotation.x, -0.3, 1.2);
  }

  protected override poseEntry(dt: number): boolean {
    const kind = this.spawn.entry;
    if (kind === 'rise') {
      this.crawlPose(dt, 1.4, true);
      return true;
    }
    if (kind === 'drop') {
      const r = this.r;
      if (this.landT < 0) {
        this.crawlPose(dt, 0, false);
        const fl = this.age * 15;
        r.armL.shoulder.rotation.set(-2.6 + Math.sin(fl) * 0.5, 0, 0.6);
        r.armR.shoulder.rotation.set(-2.6 + Math.sin(fl + 2) * 0.5, 0, -0.6);
        r.hips.rotation.x = 1.0;
      } else {
        this.crawlPose(dt, 0, false);
        const c = 1 - clamp(this.landT / this.landDuration(), 0, 1);
        r.hips.rotation.x += Math.sin(c * Math.PI * 2) * 0.08 * c;
        r.neck.rotation.x += 0.5 * c;
        r.armL.shoulder.rotation.z += 0.7 * c;
        r.armR.shoulder.rotation.z -= 0.7 * c;
      }
      return true;
    }
    return false;
  }

  protected override landDuration() {
    return 0.45;
  }

  protected override onLand() {
    super.onLand();
    this.world.fx.blood(this.worldPos(_w).setY(_w.y + 0.2), null, { color: this.bloodColor, amount: 0.6 });
  }

  /**
   * Dragging stroke: both arms (the right a beat behind) reach out, slam down
   * and haul the torso forward, the chest heaving up off the ground as the
   * hands are pulled back under it; then they lift and swing forward again.
   * Hands are placed with 2-bone IK so they stay planted on the ground (the
   * heave is what keeps the elbows clear of it). `rate` adds to the stroke speed.
   */
  private crawlPose(dt: number, rate: number, moving: boolean) {
    const r = this.r;
    restPose(r, this.hipsY);
    // Cadence from the nominal crawl speed (plus any rig speed) — not the
    // surging per-frame speed, which would feed back into the stroke.
    const gs = moving ? Math.max(this.speed + this.groundSpeed - this.moveSpeed, 0.6) : this.groundSpeed;
    this.phase += dt * (1.6 + rate * 2 + Math.min(gs, 6) * 3.2);
    const ph = this.phase;
    const uL = cycle(ph);
    const uR = cycle(ph - 0.7);
    handTarget(uL, _hl);
    handTarget(uR, _hr);
    const hL = heaveOf(_hl.z);
    const hR = heaveOf(_hr.z);
    const heave = Math.max(hL, hR);
    const pitch = CRAWL_PITCH - CRAWL_HEAVE * heave;
    r.hips.rotation.x = pitch;
    r.hips.position.y = this.hipsY;
    // A little roll toward whichever arm is hauling.
    r.hips.rotation.z = (hR - hL) * 0.06;
    // Neck/head up to look at the player (level, whatever the chest is doing).
    r.neck.rotation.x = -0.95 + 0.6 * CRAWL_HEAVE * heave;
    r.head.rotation.x = -0.45 + Math.sin(ph * 2) * 0.05;
    r.head.rotation.z = Math.sin(this.age * 1.1 + this.seed) * 0.15;
    this.crawlArm(r.armL, 1, _hl, pitch);
    this.crawlArm(r.armR, -1, _hr, pitch);
    // Surge while the hands are planted (feeds the advance speed; averages ≈ 1).
    this.pull = 0.9 * (plantOf(uL) + plantOf(uR));
    if (!this.legless) {
      // Broken legs trail along the ground behind (the drag pivot keeps them level).
      r.legL.hip.rotation.x = 0.2 + Math.sin(ph * 0.5) * 0.05;
      r.legR.hip.rotation.x = 0.16 - Math.sin(ph * 0.5) * 0.05;
      r.legL.hip.rotation.y = 0.3;
      r.legR.hip.rotation.y = -0.15;
      r.legL.knee.rotation.x = 0;
      r.legR.knee.rotation.x = 0.35;
    }
  }

  /** Rear up on planted arms (k 0..1 blends from the crawl pose already set). */
  private coilPose(k: number, shake: number) {
    const r = this.r;
    const pitch = lerp(r.hips.rotation.x, CRAWL_PITCH - 0.55, k);
    r.hips.rotation.x = pitch;
    r.hips.position.y = this.hipsY + 0.05 * k;
    _hl.set(0, lerp(_hl.y, CRAWL_HAND_Y + 0.03, k), lerp(_hl.z, 0.74, k));
    _hr.set(0, lerp(_hr.y, CRAWL_HAND_Y + 0.03, k), lerp(_hr.z, 0.72, k));
    this.crawlArm(r.armL, 1, _hl, pitch);
    this.crawlArm(r.armR, -1, _hr, pitch);
    r.armL.shoulder.rotation.x += shake;
    r.armR.shoulder.rotation.x -= shake;
    r.neck.rotation.x = lerp(r.neck.rotation.x, -0.5, k);
    r.head.rotation.x = lerp(r.head.rotation.x, -0.25, k) + shake;
  }

  /** Airborne pounce pose, blended over the current pose by `f`. */
  private airPose(f: number) {
    const r = this.r;
    r.hips.rotation.x = lerp(r.hips.rotation.x, CRAWL_PITCH - 1.0, f);
    r.neck.rotation.x = lerp(r.neck.rotation.x, -0.25, f);
    r.head.rotation.x = lerp(r.head.rotation.x, -0.2, f);
    for (let i = 0; i < 2; i++) {
      const a = i === 0 ? r.armL : r.armR;
      const side = i === 0 ? 1 : -1;
      a.shoulder.rotation.x = lerp(a.shoulder.rotation.x, -1.7, f);
      a.shoulder.rotation.z = lerp(a.shoulder.rotation.z, side * 1.2, f);
      a.elbow.rotation.x = lerp(a.elbow.rotation.x, -0.5, f);
    }
  }

  /** Solve one arm so its hand reaches `h` (model y/z, unscaled rig units). */
  private crawlArm(a: Limb, side: number, h: THREE.Vector3, pitch: number) {
    // Shoulder in the model's side plane (y up, z forward).
    const sy = this.r.hips.position.y + CRAWL_SHOULDER * Math.cos(pitch);
    const sz = CRAWL_SHOULDER * Math.sin(pitch);
    const k = Math.cos(CRAWL_SPLAY);
    const al = this.b.al;
    solveArm(sy, sz, h.y, h.z, 0.3 * al * k, 0.31 * al * k);
    a.shoulder.rotation.set(_ik.phi1 - pitch, 0, side * CRAWL_SPLAY);
    a.elbow.rotation.x = _ik.el;
  }

  protected override pose(dt: number) {
    const r = this.r;
    const st = this.state;
    const t = this.stateTime;
    this.crawlPose(dt, st === 'advance' ? 0.6 : 0, st === 'advance');
    if (st === 'pounce') {
      const C = Crawler.COIL;
      const F = this.fly;
      if (t < C) {
        // Coil: rears up on planted, straightening arms like a cat about to spring, shaking.
        const k = smoothstep(0, 0.6, t / C);
        this.coilPose(k, Math.sin(t * 38) * 0.05 * k);
      } else if (t < C + F) {
        // Launch: from the coil into the airborne pose, claws spread at the camera.
        this.coilPose(1, 0);
        this.airPose(smoothstep(0, 0.5, (t - C) / F));
      } else {
        // Knocked back down: from the airborne pose back into the crawl.
        this.airPose(1 - smoothstep(0, 1, (t - C - F) / Crawler.BACK));
      }
    } else if (st === 'stagger') {
      const k = Math.sin(clamp(t / this.staggerTime, 0, 1) * Math.PI);
      r.neck.rotation.x -= 0.4 * k;
      r.hips.rotation.x -= 0.25 * k;
    }
  }

  protected override poseDeath(t: number, _dt: number): number {
    const r = this.r;
    restPose(r, this.hipsY);
    const c = smoothstep(0, 0.45, t);
    r.hips.rotation.x = 1.42 + 0.14 * c;
    r.hips.position.y = this.hipsY - 0.03 * c;
    r.neck.rotation.x = -0.95 + 1.0 * c;
    r.head.rotation.z = this.deathSide * 0.6 * c;
    // (Only a slight roll — more would drive the splayed arm on that side into the ground.)
    r.spine.rotation.y = this.deathSide * 0.1 * c;
    const twitch = t < 1.2 ? Math.sin(t * 25) * 0.08 * (1 - t / 1.2) : 0;
    // Arms flop forward flat along the ground, splayed.
    const flat = -1.52 - r.hips.rotation.x;
    r.armL.shoulder.rotation.set(flat + twitch, 0, 0.55 + 0.35 * c);
    r.armR.shoulder.rotation.set(flat + 0.06 - twitch, 0, -0.55 - 0.35 * c);
    if (!this.legless) {
      r.legL.hip.rotation.set(0.24, 0.3, 0);
      r.legR.hip.rotation.set(0.2, -0.15, 0);
    }
    if (c >= 1 && this.deathLandAt < 0) {
      this.deathLandAt = t;
      this.onBodyLand();
    }
    return 0;
  }

  protected override poolOffset(out: THREE.Vector3) {
    return out.set(0, 0, 0.3 * this.r.scale);
  }

  protected override onDeath(hit: ShotHit | null) {
    super.onDeath(hit);
    this.model.rotation.set(0, 0, 0);
    this.mAir = this.lift;
    this.lift = 0;
    this.liftV = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Brute
// ═══════════════════════════════════════════════════════════════════════════

/** 2.4 m riot-armoured hulk. Shoot the head (or hit hard) to stagger its smash. */
export class Brute extends Zombie {
  private stepIdx = 0;
  private growlT = 3;
  private mutant!: Limb;

  protected override configure() {
    this.name = 'brute';
    this.maxHp = 14;
    this.speed = 0.9;
    // Far enough back that the raised fists stay in frame through the 2 s windup.
    this.attackRange = 2.85;
    this.windup = 2.0;
    this.recoverTime = 1.5;
    this.points = 500;
    this.superArmor = true;
    this.heavyHit = 3;
    this.staggerTime = 0.85;
    this.knockback = 0.05;
    this.telegraphRadius = 0.85;
    this.sfxIdle = null;
    this.sfxAttack = 'brute_roar';
    this.sfxDie = 'brute_roar';
    this.bloodColor = 0x7a0a0a;
    this.flinch = 0.35;
    this.severChance = 0.5;
    this.minSeverDamage = 1;
    this.corpseTime = 3.6;
    this.riseTime = 2.2;
  }

  protected override build() {
    const rng = this.world.rng;
    const skin = rng.pick([0x8f9488, 0x9a9283, 0x7f8a78, 0x94909c]);
    const b = this.makeBody({
      height: rng.range(2.3, 2.6),
      skin,
      eyes: 0xff4020,
      eyeGlow: 2.4,
      bulk: 1.6,
      headSize: 0.92,
      armLength: 1.18,
      variant: 'civilian',
      gore: 0.5,
      hair: null,
    });
    const r = this.r;
    // Shirtless, riot trousers and boots.
    b.clothes({ shirt: skin, sleeves: 'none', pants: 0x1e2638, shoes: 0x111111 });
    const ARM = 0x1b1e26;
    const EDGE = 0x3a4252;
    const MUSCLE = 0x6a1a16;
    const sb = Math.sqrt(b.bulk);
    const w = b.chestW;
    const bz = 0.11 * sb;
    // Head sunk low and forward between the shoulders.
    r.neck.position.set(0, -0.02, 0.06);
    b.neckMesh.scale.set(2.1, 1.2, 2);
    // Thick limbs and big fists; the left arm is grotesquely mutated.
    this.mutant = rng.chance(0.5) ? r.armL : r.armR;
    for (const a of [r.armL, r.armR]) {
      const m = a === this.mutant ? 1.25 : 1;
      a.upper.scale.set(1.5 * m, 1, 1.45 * m);
      a.lower.scale.set(1.55 * m, 1, 1.5 * m);
      a.end.scale.set(1.8 * m, 1.4 * m, 1.9 * m);
    }
    for (const l of [r.legL, r.legR]) {
      l.thigh.scale.set(1.65, 1, 1.5);
      l.shin.scale.set(1.5, 1, 1.45);
      l.foot.scale.set(1.45, 1.3, 1.25);
    }
    const mu = this.mutant;
    const ms = mu === r.armL ? 1 : -1;
    b.box(mu.shoulder, 0.17, 0.16, 0.012, MUSCLE, 0, -0.16, 0.085, 0, 0, 0, 0.05);
    b.box(mu.elbow, 0.15, 0.1, 0.012, MUSCLE, 0, -0.08, 0.079, 0, 0, 0, 0.05);
    for (let i = 0; i < 3; i++) {
      b.part(mu.elbow, Kit.cone(0.025, 0.13, 5), 0xd8cfb0, ms * 0.07, -0.05 - i * 0.08, -0.02, 0, 0, -ms * 1.2, 1, 1, 1, 0.1);
    }
    // Bone spikes bursting out of the upper back.
    const spikes: [number, number, number, number][] = [
      [0.13, 0.46, -0.35, 0.3],
      [-0.1, 0.44, -0.45, 0.26],
      [0.0, 0.3, -0.9, 0.22],
      [-0.17, 0.32, -0.7, 0.2],
    ];
    for (const [x, y, rx, len] of spikes) b.part(r.spine, Kit.cone(0.045, len, 5), 0xd8cfb0, x * b.bulk, y, -bz - 0.03, rx, 0, -x * 1.8, 1, 1, 1, 0.12);
    b.box(r.spine, 0.3 * b.bulk, 0.2, 0.012, MUSCLE, 0, 0.32, -bz - 0.004);
    // Riot armour (sparks, no damage): chest plate, shoulder pads, bracer, knee pads.
    b.box(r.spine, w * 0.9, 0.22, 0.03, ARM, 0, 0.34, bz + 0.018, 0, 0, 0, 0.04, 'armor');
    b.box(r.spine, w * 0.92, 0.035, 0.035, EDGE, 0, 0.455, bz + 0.02, 0, 0, 0, 0.08, 'armor');
    b.box(r.spine, 0.18, 0.045, 0.012, 0xd0d0d0, 0, 0.38, bz + 0.036, 0, 0, 0, 0.35, 'armor');
    for (const [a, s] of [[r.armL, 1], [r.armR, -1]] as const) {
      b.box(a.shoulder, 0.2, 0.075, 0.22, ARM, s * 0.05, 0.05, 0, 0, 0, s * -0.5, 0.04, 'armor');
      b.box(a.shoulder, 0.17, 0.06, 0.2, EDGE, s * 0.09, -0.04, 0, 0, 0, s * -0.3, 0.06, 'armor');
      if (a !== mu) b.box(a.elbow, 0.16, 0.19, 0.17, ARM, 0, -0.12 * b.al, 0, 0, 0, 0, 0.04, 'armor');
    }
    for (const l of [r.legL, r.legR]) b.box(l.knee, 0.2, 0.17, 0.07, ARM, 0, -0.03, 0.12, 0, 0, 0, 0.04, 'armor');
    b.box(r.hips, 0.36 * b.bulk, 0.06, 0.22 * sb, 0x101010, 0, 0.05, 0);
    // Stitched, scarred belly.
    b.box(r.spine, 0.02, 0.18, 0.012, 0x2a1a1a, 0.05, 0.1, bz + 0.004, 0, 0, 0.2);
    for (let i = 0; i < 4; i++) b.box(r.spine, 0.06, 0.012, 0.014, 0x2a1a1a, 0.04 + 0.008 * i, 0.04 + i * 0.04, bz + 0.006, 0, 0, 0.2);
    b.box(r.spine, 0.1, 0.08, 0.012, BLOOD_DARK, -0.12, 0.12, bz + 0.004);
    this.finishBody();
  }

  protected override riseDepth() {
    return 2.0 * this.r.scale;
  }

  protected override onDamaged(hit: ShotHit, amount: number) {
    super.onDamaged(hit, amount);
    if (this.hp > 0 && hit.part === 'head') {
      this.stagger();
      if (this.state === 'stagger') this.world.audio.play('brute_roar', { volume: 0.35, pitch: 1.3, vary: 0.1 });
    }
  }

  protected override strike() {
    super.strike();
    this.world.rig.shake(0.7);
    this.world.audio.play('stomp', { volume: 1, vary: 0.1, pitch: 0.8 });
    // Impact dust where the fists come down: in front of the chest, on the ground
    // (works whether or not an arm has been blown off).
    this.root.updateWorldMatrix(true, false);
    this.root.localToWorld(_w.set(0, 0, 0.95 * this.r.scale));
    this.root.getWorldPosition(_p);
    _w.y = _p.y;
    this.world.fx.dust(_w, 1.3, 0x6a6058);
  }

  protected override pose(dt: number) {
    const r = this.r;
    restPose(r, this.hipsY);
    const gs = this.groundSpeed;
    const amt = Math.max(0.15, clamp(gs / 0.5, 0, 1));
    const run = clamp((gs - 2.2) / 3, 0, 1);
    this.phase += dt * (1.1 + Math.min(gs, 7) * 2.5);
    poseShamble(r, this.phase, amt, 0.4 + run * 0.25, 0, this.hipsY);
    const s = Math.sin(this.phase);
    r.legL.hip.rotation.z = 0.06;
    r.legR.hip.rotation.z = -0.06;
    r.spine.rotation.x = 0.42 + run * 0.2;
    r.spine.rotation.z = s * 0.1 * amt;
    r.spine.rotation.y = s * 0.08 * amt;
    r.neck.rotation.x = -0.35;
    r.head.rotation.x = -0.12;
    r.armL.shoulder.rotation.set(-s * 0.35 * amt - 0.1, 0, 0.32);
    r.armR.shoulder.rotation.set(s * 0.35 * amt - 0.1, 0, -0.32);
    r.armL.elbow.rotation.x = -0.4;
    r.armR.elbow.rotation.x = -0.4;
    // Footfalls shake the camera when close — only for its own heavy steps, not
    // the fast cadence it needs just to keep pace when carried by a moving rig.
    const step = Math.floor(this.phase / Math.PI);
    if (step !== this.stepIdx) {
      this.stepIdx = step;
      if (amt > 0.6 && this.state === 'advance' && !this.carried) {
        const near = clamp(1 - this.distToPlayer / 16, 0, 1);
        if (near > 0) {
          this.world.rig.shake(0.12 * near);
          STOMP_OPTS.volume = 0.25 + 0.45 * near;
          this.world.audio.play('stomp', STOMP_OPTS);
        }
        footWorld(s > 0 ? r.legR : r.legL, _w);
        this.world.fx.dust(_w, 0.35, 0x6a6058);
      }
    }
    this.growlT -= dt;
    if (this.growlT <= 0) {
      this.growlT = this.world.rng.range(4, 8);
      GROWL_OPTS.volume = 0.6 * clamp(1.4 - this.distToPlayer / 30, 0.25, 1);
      this.world.audio.play('zombie_groan', GROWL_OPTS);
    }

    const t = this.stateTime;
    const st = this.state;
    if (st === 'windup') {
      const k = clamp(t / this.windup, 0, 1);
      const roar = 1 - smoothstep(0.12, 0.3, k);
      const raise = smoothstep(0.2, 0.75, k);
      const trem = k > 0.75 ? Math.sin(t * 46) * 0.06 : 0;
      if (!this.carried) poseCrouch(r, 0.22 * raise, this.hipsY);
      r.spine.rotation.x = lerp(0.42, -0.2, Math.max(roar * smoothstep(0, 0.12, k), raise));
      r.head.rotation.x = -0.55 * roar * smoothstep(0, 0.1, k) - 0.25 * raise;
      // Fists overhead (not straight up, so they stay in frame) and slightly bent.
      r.armL.shoulder.rotation.set(lerp(-0.4, -2.7, raise) + trem, 0, lerp(1.1 * smoothstep(0, 0.12, k), 0.28, raise));
      r.armR.shoulder.rotation.set(lerp(-0.4, -2.7, raise) - trem, 0, -lerp(1.1 * smoothstep(0, 0.12, k), 0.28, raise));
      r.armL.elbow.rotation.x = -0.55 * raise;
      r.armR.elbow.rotation.x = -0.55 * raise;
    } else if (st === 'recover' && t < 0.7) {
      // The smash: arms crash down, body follows through.
      const down = smoothstep(0, 0.12, t);
      const out = 1 - smoothstep(0.35, 0.7, t);
      r.spine.rotation.x = lerp(-0.2, 0.8, down) * out + 0.42 * (1 - out);
      if (!this.carried) poseCrouch(r, 0.4 * out, this.hipsY);
      r.armL.shoulder.rotation.set(lerp(-2.7, -0.7, down) * out - 0.1 * (1 - out), 0, 0.25);
      r.armR.shoulder.rotation.set(lerp(-2.7, -0.7, down) * out - 0.1 * (1 - out), 0, -0.25);
      r.head.rotation.x = 0.2 * out;
    } else if (st === 'stagger') {
      const k = Math.sin(clamp(t / this.staggerTime, 0, 1) * Math.PI);
      r.spine.rotation.x = 0.42 - 0.6 * k;
      r.head.rotation.x = -0.6 * k;
      r.armL.shoulder.rotation.set(-1.0 * k, 0, 0.32 + 0.6 * k);
      r.armR.shoulder.rotation.set(-0.8 * k, 0, -0.32 - 0.7 * k);
      r.legR.hip.rotation.x = 0.35 * k;
      r.legR.knee.rotation.x = 0.3 * k;
    }
  }

  protected override onBodyLand() {
    super.onBodyLand();
    const near = clamp(1 - this.distToPlayer / 20, 0, 1);
    if (near > 0) this.world.rig.shake(0.35 * near);
    this.world.audio.play('stomp', { volume: 0.4 + 0.5 * near, pitch: 0.7 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Spitter
// ═══════════════════════════════════════════════════════════════════════════

/** Keeps its distance and spits shootable bile. Shoot the glowing throat sac. */
export class Spitter extends Zombie {
  private sacPivot!: THREE.Group;
  private sac!: THREE.Mesh;
  private mouth!: THREE.Object3D;
  private droolT = 1;

  protected override configure() {
    const rng = this.world.rng;
    this.name = 'spitter';
    this.maxHp = 3;
    this.speed = rng.range(0.95, 1.2);
    this.attackRange = rng.range(9, 12);
    this.windup = 1.4;
    this.recoverTime = 2.2;
    this.points = 200;
    this.telegraphRadius = 0.5;
    this.sfxIdle = 'zombie_groan';
    this.sfxAttack = 'bloater_gurgle';
    this.sfxDie = 'zombie_die';
    this.bloodColor = 0x6a8a18;
  }

  protected override build() {
    const rng = this.world.rng;
    const b = this.makeBody({
      height: rng.range(1.72, 1.85),
      skin: rng.pick([0xa8b07a, 0x9aa870, 0xb0b48a]),
      eyes: GOO,
      eyeGlow: 1.6,
      bulk: 0.88,
      headSize: 0.95,
      variant: variantOpt(this.spawn.opts, rng, rng.pick(['civilian', 'patient', 'office', 'nurse'])),
      gore: 0.8,
      hair: rng.chance(0.3) ? 0x3a3020 : null,
    });
    const r = this.r;
    const hs = b.hs;
    // Bile mouth and glowing veins (same material as the eyes → merged).
    b.glow(r.head, Kit.box(0.08 * hs, 0.03 * hs, 0.02), GOO, 1.6, 0, 0.068 * hs, b.faceZ + 0.006);
    b.glow(r.head, Kit.box(0.02, 0.07 * hs, 0.015), GOO, 1.6, 0.075 * hs, 0.1 * hs, b.faceZ + 0.002);
    b.glow(r.chest, Kit.box(0.025, 0.14, 0.015), GOO, 1.6, -0.06, -0.08, b.chestZ + 0.006, 'torso');
    b.glow(r.chest, Kit.box(0.025, 0.1, 0.015), GOO, 1.6, 0.05, -0.05, b.chestZ + 0.006, 'torso');
    // Swollen throat sac — the weak point.
    this.sacPivot = Kit.pivot(r.neck, 0, 0.02, 0.07);
    this.sac = b.glow(this.sacPivot, Kit.ico(0.12, 1), GOO, 1.25, 0, 0, 0.03, 'weak');
    this.sac.scale.set(1.15, 0.95, 1);
    this.mouth = Kit.pivot(r.head, 0, 0.07 * hs, b.faceZ + 0.05);
    this.finishBody();
  }

  protected override strike() {
    const from = new THREE.Vector3();
    this.mouth.getWorldPosition(from);
    this.world.add(new Projectile(this.world, { from, color: GOO, flightTime: 1.6, burst: 'goo', source: 'spitter' }));
    this.play('spit', 1);
    this.world.fx.blood(from, null, { color: GOO, amount: 0.7 });
  }

  protected override onDamaged(hit: ShotHit, amount: number) {
    super.onDamaged(hit, amount);
    if (hit.part === 'weak') this.world.fx.blood(hit.point, hit.dir, { color: GOO, amount: 1.2 });
  }

  protected override onDeath(hit: ShotHit | null) {
    super.onDeath(hit);
    // The sac bursts.
    this.sac.getWorldPosition(_w);
    this.world.fx.blood(_w, null, { color: GOO, amount: 2.2 });
    this.world.fx.gibs(_w, 0x5a8a20, 4, 0.08);
    this.world.audio.play('gib', { volume: 0.6, vary: 0.2 });
    this.sacPivot.visible = false;
  }

  protected override pose(dt: number) {
    const r = this.r;
    restPose(r, this.hipsY);
    const gs = this.groundSpeed;
    const amt = Math.max(0.2, clamp(gs / 0.4, 0, 1));
    const run = clamp((gs - 2.2) / 2.5, 0, 1);
    this.phase += dt * (1.4 + Math.min(gs, 7) * 2.4);
    poseShamble(r, this.phase, amt, 0.4 + run * 0.3, 0.3, this.hipsY);
    const sway = Math.sin(this.phase * 0.5);
    r.spine.rotation.x = 0.42 + run * 0.2;
    r.spine.rotation.z = sway * 0.07;
    r.neck.rotation.x = -0.35;
    r.head.rotation.x = -0.15;
    r.head.rotation.z = Math.sin(this.age * 0.8 + this.seed) * 0.15;
    r.armL.shoulder.rotation.set(-0.2 + Math.sin(this.phase) * 0.2 * amt, 0, 0.25);
    r.armR.shoulder.rotation.set(-0.2 - Math.sin(this.phase) * 0.2 * amt, 0, -0.25);
    r.armL.elbow.rotation.x = -0.5;
    r.armR.elbow.rotation.x = -0.5;
    let sac = 1 + Math.sin(this.age * 3.2) * 0.06;
    const t = this.stateTime;
    if (this.state === 'windup') {
      // Throat inflates; head rears back.
      const k = clamp(t / this.windup, 0, 1);
      const e = k * k * (3 - 2 * k);
      sac = 1 + 0.8 * e + (k > 0.65 ? Math.sin(t * 40) * 0.06 : 0);
      r.spine.rotation.x = 0.42 - 0.5 * e;
      r.neck.rotation.x = -0.35 - 0.35 * e;
      r.head.rotation.x = -0.15 - 0.45 * e;
      r.armL.shoulder.rotation.set(-0.4, 0, 0.25 + 0.5 * e);
      r.armR.shoulder.rotation.set(-0.4, 0, -0.25 - 0.5 * e);
    } else if (this.state === 'recover' && t < 0.45) {
      // Spit snap forward, sac deflated.
      const f = 1 - t / 0.45;
      sac = lerp(1, 0.7, f);
      r.spine.rotation.x = 0.42 + 0.35 * f;
      r.neck.rotation.x = -0.35 + 0.3 * f;
      r.head.rotation.x = 0.4 * f;
    } else if (this.state === 'stagger') {
      const k = Math.sin(clamp(t / this.staggerTime, 0, 1) * Math.PI);
      r.spine.rotation.x -= 0.5 * k;
      r.armL.shoulder.rotation.z += 0.5 * k;
      r.armR.shoulder.rotation.z -= 0.5 * k;
    }
    this.sacPivot.scale.setScalar(sac);
    // Bile drool.
    this.droolT -= dt;
    if (this.droolT <= 0 && this.distToPlayer < 25) {
      this.droolT = this.world.rng.range(0.7, 1.6);
      this.mouth.getWorldPosition(_w);
      this.world.fx.gibs(_w, GOO, 1, 0.03);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloater
// ═══════════════════════════════════════════════════════════════════════════

/** Waddling gas-bag. Pop its pustules; it explodes on death (hurts other zombies) or bursts on you. */
export class Bloater extends Zombie {
  private belly!: THREE.Group;
  private pustules: THREE.Mesh[] = [];

  protected override configure() {
    this.name = 'bloater';
    this.maxHp = 4;
    this.speed = 0.7;
    this.attackRange = 1.9;
    this.windup = 1.5;
    this.recoverTime = 1;
    this.points = 250;
    this.telegraphRadius = 0.75;
    this.sfxIdle = 'bloater_gurgle';
    this.sfxAttack = 'bloater_gurgle';
    this.sfxDie = null;
    this.bloodColor = 0x6a7a1a;
    this.flinch = 0.6;
    this.knockback = 0.06;
    this.canPopHead = true;
  }

  protected override build() {
    const rng = this.world.rng;
    const skin = rng.pick([0xa8b07a, 0xb4b088, 0x9ca878]);
    const b = this.makeBody({
      height: rng.range(1.72, 1.86),
      skin,
      eyes: 0xe8ff50,
      eyeGlow: 1.8,
      bulk: 1.5,
      headSize: 0.8,
      armLength: 0.88,
      variant: 'civilian',
      gore: 0.4,
      hair: null,
    });
    const r = this.r;
    const sb = Math.sqrt(b.bulk);
    const undershirt = rng.pick([0xc8c0a0, 0x9a9a8a, 0x8a6a5a]);
    b.clothes({ shirt: undershirt, sleeves: 'none', pants: rng.pick([0x3a3a3a, 0x2e3d5c, 0x4a3a2a]), shoes: 0x1c1c1c });
    // Puffy cheeks and neck rolls.
    b.box(r.head, 0.06, 0.08, 0.1, skin, 0.1 * b.hs, 0.08 * b.hs, 0.04, 0, 0, 0, 0.26);
    b.box(r.head, 0.06, 0.08, 0.1, skin, -0.1 * b.hs, 0.08 * b.hs, 0.04, 0, 0, 0, 0.26);
    b.neckMesh.scale.set(2.2, 1.2, 2.1);
    // The belly: own pivot so it can jiggle and swell.
    this.belly = Kit.pivot(r.spine, 0, 0.16, 0.08);
    b.part(this.belly, Kit.ico(0.4, 1), skin, 0, 0, 0, 0, 0, 0, 1.2, 1.08, 1.1, 0.26, 'torso');
    b.box(this.belly, 0.3, 0.012, 0.02, 0x5a6a3a, 0.02, 0.1, 0.43, 0, 0.1, 0.3);
    b.box(this.belly, 0.22, 0.012, 0.02, 0x5a6a3a, -0.05, -0.1, 0.43, 0, -0.1, -0.4);
    b.box(this.belly, 0.04, 0.04, 0.03, 0x4a3a2a, 0, -0.04, 0.44);
    // Undershirt band riding up over the chest.
    b.box(r.spine, b.chestW + 0.04, 0.14, 0.22 * sb + 0.06, undershirt, 0, 0.4, 0.01);
    // Glowing pustules — weak points that pop individually.
    const PUS = 0xd8ff3a;
    const spots: [number, number, number][] = [
      [0.25, 0.18, 0.4],
      [-0.22, 0.05, 0.42],
      [0.08, -0.2, 0.44],
      [-0.12, 0.26, 0.38],
      [0.3, -0.12, 0.33],
      [-0.33, -0.16, 0.3],
    ];
    for (const [x, y, z] of spots) {
      const m = b.glow(this.belly, Kit.ico(rng.range(0.055, 0.085), 0), PUS, 1.5, x * 1.2, y * 1.08, z * 1.1, 'weak');
      m.userData.keep = true;
      this.pustules.push(m);
    }
    for (const s of [1, -1]) {
      const m = b.glow(r.chest, Kit.ico(0.07, 0), PUS, 1.5, s * 0.16, 0.02, -0.12 * sb, 'weak');
      m.userData.keep = true;
      this.pustules.push(m);
    }
    this.finishBody();
  }

  protected override onDamaged(hit: ShotHit, amount: number) {
    if (hit.part === 'weak' && this.pustules.includes(hit.object as THREE.Mesh) && hit.object.visible) {
      hit.object.visible = false;
      this.world.shootables.remove(hit.object);
      this.world.fx.blood(hit.point, hit.dir, { color: GOO, amount: 1.4 });
      this.world.audio.play('gib', { volume: 0.5, vary: 0.2 });
    }
    super.onDamaged(hit, amount);
  }

  /** Reached the player: burst all over the lens. No points. */
  protected override strike() {
    this.belly.getWorldPosition(_w);
    this.world.hurtPlayer(this.damage, this.name);
    this.world.fx.screenSplat(GOO);
    this.gooBurst(_w);
    this.world.rig.shake(0.5);
    this.world.audio.play('explosion', { volume: 0.5, vary: 0.2, pitch: 1.4 });
    this.despawn();
  }

  private gooBurst(p: THREE.Vector3) {
    const fx = this.world.fx;
    fx.blood(p, null, { color: GOO, amount: 3 });
    fx.blood(p, null, { color: 0x9aa830, amount: 2 });
    fx.gibs(p, this.skinColor, 6, 0.12);
    fx.gibs(p, 0x5a7a10, 6, 0.08);
    fx.dust(p, 1.2, 0x6a8a2a);
    this.world.audio.play('gib', { volume: 0.9 });
  }

  protected override onDeath(_hit: ShotHit | null) {
    const p = new THREE.Vector3();
    this.belly.getWorldPosition(p);
    this.gooBurst(p);
    if (this.distToPlayer < 5) this.world.fx.screenSplat(GOO);
    this.model.visible = false;
    // Short fuse makes chain reactions ripple instead of popping all at once.
    this.world.later(0.06, () => {
      let b = blasts.get(this.world);
      if (!b) blasts.set(this.world, (b = { pos: new THREE.Vector3(), time: -1 }));
      b.pos.copy(p);
      b.time = this.world.time;
      this.world.explode(p, 4.5, 6);
    });
  }

  protected override updateDeath(dt: number): boolean {
    this.tickFlyers(dt);
    return this.stateTime > 0.2 && this.flyers.length === 0;
  }

  protected override pose(dt: number) {
    const r = this.r;
    restPose(r, this.hipsY);
    const gs = this.groundSpeed;
    const amt = Math.max(0.2, clamp(gs / 0.35, 0, 1));
    this.phase += dt * (1.3 + Math.min(gs, 7) * 3.2);
    poseShamble(r, this.phase, amt, 0.3, 0, this.hipsY);
    const s = Math.sin(this.phase);
    r.legL.hip.rotation.z = 0.14;
    r.legR.hip.rotation.z = -0.14;
    r.hips.rotation.z = s * 0.12 * amt;
    r.spine.rotation.x = -0.1;
    r.spine.rotation.z = -s * 0.06 * amt;
    r.head.rotation.x = 0.1;
    r.head.rotation.z = Math.sin(this.age * 0.7 + this.seed) * 0.12;
    r.armL.shoulder.rotation.set(-0.3 + s * 0.15, 0, 0.6 + Math.abs(s) * 0.1);
    r.armR.shoulder.rotation.set(-0.3 - s * 0.15, 0, -0.6 - Math.abs(s) * 0.1);
    r.armL.elbow.rotation.x = -0.4;
    r.armR.elbow.rotation.x = -0.4;
    let swell = 0;
    const t = this.stateTime;
    if (this.state === 'windup') {
      const k = clamp(t / this.windup, 0, 1);
      swell = k * k * 0.38;
      const sh = Math.sin(t * (20 + 30 * k)) * 0.05 * k;
      r.root.rotation.z = sh;
      r.spine.rotation.x = -0.1 - 0.25 * k;
      r.head.rotation.x = -0.4 * k;
      r.armL.shoulder.rotation.set(-0.8 * k, 0, 0.6 + 0.6 * k);
      r.armR.shoulder.rotation.set(-0.8 * k, 0, -0.6 - 0.6 * k);
    } else if (this.state === 'stagger') {
      const k = Math.sin(clamp(t / this.staggerTime, 0, 1) * Math.PI);
      r.spine.rotation.x -= 0.3 * k;
    }
    const j = Math.sin(this.phase * 2) * 0.04 * amt + Math.sin(this.age * 7.3) * 0.012;
    this.belly.scale.set(1 + swell + j, 1 + swell * 0.8 - j, 1 + swell + j * 0.5);
    for (let i = 0; i < this.pustules.length; i++) {
      this.pustules[i].scale.setScalar(1 + Math.sin(this.age * 5 + i * 1.7) * 0.15 + swell * 1.5);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════

registerEnemy('walker', (w, s) => new Walker(w, s));
registerEnemy('runner', (w, s) => new Runner(w, s));
registerEnemy('crawler', (w, s) => new Crawler(w, s));
registerEnemy('brute', (w, s) => new Brute(w, s));
registerEnemy('spitter', (w, s) => new Spitter(w, s));
registerEnemy('bloater', (w, s) => new Bloater(w, s));

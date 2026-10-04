import * as THREE from 'three';
import { Boss } from '../../../gameplay/Boss';
import type { EnemySpawn } from '../../../gameplay/Enemy';
import type { ShotHit, ShotOutcome } from '../../../gameplay/Entity';
import type { World } from '../../../gameplay/World';
import { Projectile } from '../../../gameplay/Projectile';
import { angleDelta, clamp, lerp, smoothstep } from '../../../core/math';
import { Kit } from '../../kit/ModelKit';
import { createEnemy, registerEnemy } from '../../registry';
import { M, bake } from './bake';
import { car } from './props';
import { z3Scene } from './env';
import { BRIDGE } from './scenery';
import { D } from './layout';

/**
 * THE BEHEMOTH — a 7.6 m construction worker turned giant, rebar speared
 * through its chest, chasing the truck across the suspension bridge.
 *
 * Lives in the RIG frame (keeps pace with the moving truck; the camera looks
 * back at it). Weak points: the glowing chest wound and the head (eyes + split
 * skull). Hard hat, rebar and the steel arm guard are armour (sparks).
 *
 *  Phase 1  throws cars (shootable, explode) · double-fist bridge slam
 *  Phase 2  roars, rips a lamp post off the railing → club swings, concrete
 *           slabs, runners leap off the bridge girders
 *  Phase 3  enraged: leaps onto the deck right behind the truck and reaches
 *           for you, faster throws, crawlers drop off its back
 *
 * Every attack has a ring telegraph and can be interrupted by pumping the weak
 * points during the wind-up (or the thrown object can be shot down).
 */

type BState =
  | 'intro'
  | 'chase'
  | 'grab'
  | 'throwWind'
  | 'throw'
  | 'slamWind'
  | 'slam'
  | 'roar'
  | 'tear'
  | 'clubWind'
  | 'club'
  | 'crouch'
  | 'leap'
  | 'land'
  | 'swipeWind'
  | 'swipe'
  | 'reel';

const SKIN = 0x84a872;
const SKIN_DARK = 0x5e7a52;
const VEST = 0xe8661a;
const STRIPE = 0xd8d8b8;
const JEANS = 0x34465e;
const BOOT = 0x3a2a1c;
const RUST = 0x7a3a1c;
const HAT = 0xe8b818;
const GORE = 0x6a1410;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

interface Joint {
  obj: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  rate: number;
}

const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Highest launch point of a thrown car/slab above the deck (keeps the flight out from under the boss bar). */
const THROW_MAX_Y = 5.6;

/**
 * Boss projectile. The base Projectile aims 0.9 m along rig −Z (straight ahead
 * of the truck); during this chase the camera looks BACK, so retarget the end
 * point just in front of where the camera actually looks. The launch point is
 * kept at most THROW_MAX_Y above the deck so that, with the low arc, the whole
 * flight crosses the middle of the screen instead of skimming the top edge.
 */
class Throwable extends Projectile {
  private onKill: (() => void) | null;
  constructor(world: World, opts: ConstructorParameters<typeof Projectile>[1], onKill?: () => void) {
    super(world, opts);
    this.onKill = onKill ?? null;
  }
  override onAdded(): void {
    super.onAdded();
    const w = this.world;
    const rig = w.rig;
    const self = this as unknown as { to?: THREE.Vector3; from?: THREE.Vector3 };
    const from = self.from;
    if (from) {
      from.y = Math.min(from.y, THROW_MAX_Y);
      this.root.position.copy(from);
    }
    const to = self.to;
    if (!to) return;
    w.camera.getWorldDirection(_d);
    _d.applyQuaternion(_q.copy(rig.space.quaternion).invert()).setY(0);
    if (_d.lengthSq() < 1e-6) return;
    _d.normalize();
    to.set(rig.offset.x + _d.x * 1.1 - _d.z * w.rng.spread(0.35), rig.eyeHeight - 0.15 + w.rng.spread(0.15), rig.offset.z + _d.z * 1.1 + _d.x * w.rng.spread(0.35));
  }
  override onShot(hit: ShotHit): ShotOutcome {
    const r = super.onShot(hit);
    if (r.killed) {
      this.onKill?.();
      this.onKill = null;
    }
    return r;
  }
}

export class Behemoth extends Boss {
  override title = 'THE BEHEMOTH';
  /**
   * Stagger (1.7 s) → topple over the railing → splash (~4.2 s) → spray column
   * past the deck, held ~2 s; the truck floors it 0.6 s after the splash, and the
   * column collapses on its own while the camera swings back to the road (see
   * dispose). Kill → stage clear stays under ~8 s.
   */
  override deathDuration = 6.3;

  // Rig.
  private hips!: THREE.Group;
  private spine!: THREE.Group;
  private chest!: THREE.Group;
  private neck!: THREE.Group;
  private head!: THREE.Group;
  private jaw!: THREE.Group;
  private shL!: THREE.Group;
  private shR!: THREE.Group;
  private elL!: THREE.Group;
  private elR!: THREE.Group;
  private handL!: THREE.Group;
  private handR!: THREE.Group;
  private hipL!: THREE.Group;
  private hipR!: THREE.Group;
  private kneeL!: THREE.Group;
  private kneeR!: THREE.Group;
  private joints: Joint[] = [];
  private J = new Map<THREE.Object3D, Joint>();
  private hipsY = 3.4;
  private hipsYT = 3.4;

  // Weak points.
  private wound!: THREE.Group;
  private core!: THREE.Mesh;
  private weakMeshes: THREE.Mesh[] = [];
  private weakMat!: THREE.Material;
  private weakHot!: THREE.Material;
  private whiteMat!: THREE.Material;
  private flashT = 0;

  // Props in hand.
  private heldCar!: THREE.Group;
  private heldSlab!: THREE.Group;
  private club!: THREE.Group;
  private clubTip!: THREE.Object3D;
  private hasClub = false;
  private holding: 'car' | 'slab' | null = null;

  // Behaviour.
  private bs: BState = 'intro';
  private chaseFor = 3;
  private targetZ = 22;
  private targetX = 0;
  private stride = 0;
  private lastFoot = 0;
  private interrupt = 0;
  private winding = false;
  private flinch = 0;
  private flinchV = 0;
  private attacks = 0;
  private lastAttack = '';
  private pendingRoar = 0;
  private roared = 0;
  private minionT = 10;
  private minionFlip = false;
  private leapFrom = new THREE.Vector3();
  private leapTo = new THREE.Vector3();
  private focus = new THREE.Object3D();
  private ring!: THREE.Mesh;
  private ringT = -1;
  private ringFrom = new THREE.Vector3();
  private introT = 0;

  // Death.
  private deathRight = new THREE.Vector3();
  private deathFwd = new THREE.Vector3();
  /** Metres the death stagger also lurches along the rail (keeps a bridge tower out of the shot). */
  private deathShift = 0;
  private deathFrom = new THREE.Vector3();
  /** Death-clock time at which the truck floors it (after the splash has read), −1 = not yet. */
  private floorAt = -1;
  private splashed = false;
  private deathTravel = 4;
  private deathFocus = new THREE.Object3D();
  private splash!: THREE.Group;
  private splashT = -1;

  constructor(world: World, spawn: EnemySpawn) {
    super(world, spawn);
  }

  protected override configure(): void {
    this.name = 'behemoth';
    this.maxHp = 390;
    this.speed = 0;
    this.points = 30000;
    this.phases = [0.66, 0.33];
    this.telegraphRadius = 1.3;
    this.bloodColor = 0x5a0a08;
    this.knockback = 0;
    this.sfxHit = 'hit_flesh';
    this.sfxDie = null;
  }

  // ─── Model ────────────────────────────────────────────────────────────────

  private joint(obj: THREE.Object3D, rate = 7): THREE.Object3D {
    const j: Joint = { obj, x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z, rate };
    this.joints.push(j);
    this.J.set(obj, j);
    return obj;
  }

  /** Static meshes added to `parent` by `build`, baked into ~1–2 meshes, registered as `part`. */
  private skin(parent: THREE.Object3D, part: 'body' | 'torso' | 'limb' | 'armor' | 'weak', build: (g: THREE.Group) => void) {
    const g = new THREE.Group();
    parent.add(g);
    build(g);
    for (const m of bake(g)) this.hitbox(m, part);
  }

  protected override build(): void {
    // Retro surfaces, sized for a 7.6 m giant seen from 9–16 m (≈4–6 cm per arcade
    // pixel): rotting skin with veins and sores, coarse work cloth, leather boots,
    // rusted rebar. One bake bucket per texture, so each body part stays at 1–2 draws.
    const skin = M.lam(SKIN, 'skin', 0.28, 0.9);
    const skinDark = M.lam(SKIN_DARK, 'skin', 0.28, 0.9);
    const vest = M.lam(VEST, 'cloth', 0.3, 0.7);
    const stripe = M.lam(STRIPE, 'none');
    const jeans = M.lam(JEANS, 'cloth', 0.3, 0.9);
    const boot = M.lam(BOOT, 'hide', 0.9, 1);
    const rust = M.lam(RUST, 'metal', 1.4, 1);
    const gore = M.lam(GORE, 'skin', 0.28, 0.7);
    const bone = M.lam(0xd8cfb0, 'skin', 0.28, 0.35);
    const shirt = M.lam(0x5e5e4c, 'cloth', 0.3, 0.9);
    const conc = M.lam(0x8a847c, 'concrete', 0.8, 0.9);
    const leather = M.lam(0x2a1e16, 'hide', 0.9, 1);
    // Weak points glow yellow (reads against the orange hi-vis vest); white-hot once enraged.
    this.weakMat = Kit.glow(0xffe25a, 1.9);
    this.weakHot = Kit.glow(0xfff8e0, 2.6);
    this.whiteMat = Kit.glow(0xffffff, 2);
    const eyeMat = Kit.glow(0xffd040, 2.4);

    const m = this.model;
    this.hips = Kit.pivot(m, 0, this.hipsY, 0, 'hips');
    this.skin(this.hips, 'torso', (g) => {
      Kit.add(g, Kit.box(2.1, 0.95, 1.35), jeans, 0, 0, 0);
      Kit.add(g, Kit.box(2.16, 0.22, 1.4), leather, 0, 0.42, 0);
      Kit.add(g, Kit.box(0.5, 0.45, 0.3), M.lam(0x6a4426, 'hide', 0.9, 1), 0.75, 0.2, 0.72);
      Kit.add(g, Kit.box(0.12, 0.5, 0.1), M.lam(0x9a9a9a, 'none'), 0.95, 0.15, 0.84, 0, 0, 0.3);
    });

    // Legs.
    const leg = (side: 1 | -1) => {
      const hip = Kit.pivot(this.hips, side * 0.62, -0.25, 0);
      this.joint(hip, 9);
      this.skin(hip, 'limb', (g) => {
        Kit.add(g, Kit.box(0.88, 1.75, 0.92), jeans, 0, -0.85, 0);
        Kit.add(g, Kit.box(0.6, 0.5, 0.06), skinDark, side * 0.05, -1.4, 0.47);
      });
      const knee = Kit.pivot(hip, 0, -1.7, 0);
      this.joint(knee, 9);
      this.skin(knee, 'limb', (g) => {
        Kit.add(g, Kit.box(0.74, 1.2, 0.8), jeans, 0, -0.6, 0);
        Kit.add(g, Kit.box(0.92, 0.52, 1.38), boot, 0, -1.2, 0.24);
        Kit.add(g, Kit.box(0.94, 0.12, 1.42), M.lam(0x1a1410, 'hide', 0.9, 0.6), 0, -1.4, 0.24);
      });
      return { hip, knee };
    };
    const L = leg(1);
    const R = leg(-1);
    this.hipL = L.hip;
    this.kneeL = L.knee;
    this.hipR = R.hip;
    this.kneeR = R.knee;

    // Spine + belly.
    this.spine = Kit.pivot(this.hips, 0, 0.4, 0, 'spine');
    this.joint(this.spine, 6);
    this.skin(this.spine, 'torso', (g) => {
      Kit.add(g, Kit.box(2.3, 1.4, 1.6), shirt, 0, 0.6, 0);
      Kit.add(g, Kit.box(1.4, 0.8, 0.2), skin, -0.2, 0.45, 0.78);
      Kit.add(g, Kit.box(0.5, 0.4, 0.1), gore, -0.4, 0.5, 0.89);
    });

    // Chest (vest over a torn shirt).
    this.chest = Kit.pivot(this.spine, 0, 1.3, 0, 'chest');
    this.joint(this.chest, 6);
    this.skin(this.chest, 'torso', (g) => {
      Kit.add(g, Kit.box(3.0, 1.7, 1.9), shirt, 0, 0.55, 0);
      // Hi-vis vest panels (front split around the wound, back) with reflective stripes.
      for (const s of [-1, 1]) {
        Kit.add(g, Kit.box(0.95, 1.75, 0.12), vest, s * 1.05, 0.55, 0.98);
        Kit.add(g, Kit.box(0.97, 0.16, 0.14), stripe, s * 1.05, 0.25, 1.0);
        Kit.add(g, Kit.box(0.97, 0.16, 0.14), stripe, s * 1.05, 0.85, 1.0);
      }
      Kit.add(g, Kit.box(3.04, 1.75, 0.12), vest, 0, 0.55, -0.98);
      Kit.add(g, Kit.box(3.06, 0.16, 0.14), stripe, 0, 0.6, -1.0);
      Kit.add(g, Kit.box(3.06, 0.16, 0.14), stripe, 0, 0.2, -1.0);
      // Traps / shoulder mass.
      for (const s of [-1, 1]) Kit.add(g, Kit.box(1.0, 0.7, 1.4), skin, s * 1.1, 1.45, -0.1, 0, 0, s * -0.35);
      Kit.add(g, Kit.box(1.4, 0.5, 1.2), skin, 0, 1.55, -0.2);
      // Ribs framing the wound.
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) Kit.add(g, Kit.box(0.5, 0.1, 0.1), bone, s * 0.38, 0.95 - i * 0.28, 1.0, 0, 0, s * 0.35);
      Kit.add(g, Kit.box(1.1, 1.2, 0.08), gore, 0, 0.55, 0.93);
      // Blood-soaked vest edges: a dark frame so the glowing wound pops off the hi-vis orange.
      const soak = M.lam(0x2e0806, 'skin', 0.28, 0.6);
      for (const s of [-1, 1]) Kit.add(g, Kit.box(0.34, 1.55, 0.14), soak, s * 0.77, 0.52, 1.0);
      Kit.add(g, Kit.box(1.6, 0.24, 0.14), soak, 0, -0.22, 1.0);
      Kit.add(g, Kit.box(1.4, 0.2, 0.14), soak, 0, 1.3, 1.0);
    });
    // Rebar speared through the torso (armour — sparks) with a lump of concrete.
    this.skin(this.chest, 'armor', (g) => {
      const bars: [number, number, number, number, number][] = [
        [0.85, 0.9, 0.35, 0.25, 4.2],
        [-0.9, 0.3, -0.3, -0.2, 3.8],
        [0.3, 0.05, 0.15, -0.4, 3.6],
      ];
      for (const [x, y, rx, rz, len] of bars) Kit.add(g, Kit.cyl(0.07, 0.07, len, 6), rust, x, y, 0, Math.PI / 2 + rx, 0, rz);
      Kit.add(g, Kit.box(0.7, 0.55, 0.6), conc, 1.2, 1.25, -1.95, 0.3, 0.5, 0.2);
      // Bent bar sticking up out of the shoulder.
      Kit.add(g, Kit.cyl(0.07, 0.07, 2.2, 6), rust, -1.3, 2.2, -0.5, 0.4, 0, 0.5);
    });
    // The wound: glowing core in a ribcage (WEAK).
    this.wound = Kit.pivot(this.chest, 0, 0.55, 1.0, 'wound');
    this.core = Kit.add(this.wound, Kit.ico(0.5, 1), this.weakMat, 0, 0, 0, 0, 0, 0, 1.25, 1.15, 0.6);
    const rim = Kit.add(this.wound, Kit.box(1.2, 1.25, 0.1), Kit.glow(0xff3010, 1.4), 0, 0, -0.04);
    for (const w of [this.core, rim]) {
      this.hitbox(w, 'weak');
      this.weakMeshes.push(w);
      w.userData.baseMat = w.material;
    }

    // Neck + head.
    this.neck = Kit.pivot(this.chest, 0, 1.55, 0.25, 'neck');
    this.joint(this.neck, 7);
    this.skin(this.neck, 'torso', (g) => Kit.add(g, Kit.box(0.8, 0.6, 0.8), skin, 0, 0.2, 0));
    this.head = Kit.pivot(this.neck, 0, 0.45, 0.15, 'head');
    this.joint(this.head, 8);
    // Face + skull are the second weak point (×2) — big and readable.
    this.skin(this.head, 'weak', (g) => {
      Kit.add(g, Kit.box(1.0, 1.0, 1.05), skin, 0, 0.45, 0);
      Kit.add(g, Kit.box(1.04, 0.22, 0.3), skinDark, 0, 0.72, 0.42);
      Kit.add(g, Kit.box(0.24, 0.3, 0.2), skinDark, 0, 0.42, 0.56);
      for (const s of [-1, 1]) Kit.add(g, Kit.box(0.12, 0.26, 0.2), skin, s * 0.54, 0.45, 0);
    });
    for (const s of [-1, 1]) {
      const eye = Kit.add(this.head, Kit.box(0.2, 0.12, 0.08), eyeMat, s * 0.24, 0.6, 0.53);
      this.hitbox(eye, 'weak');
      this.weakMeshes.push(eye);
      eye.userData.baseMat = eye.material;
    }
    // Split skull glowing under the hat brim.
    const gash = Kit.add(this.head, Kit.box(0.5, 0.14, 0.1), this.weakMat, -0.18, 0.86, 0.5, 0, 0, -0.3);
    this.hitbox(gash, 'weak');
    this.weakMeshes.push(gash);
    gash.userData.baseMat = gash.material;
    // Jaw.
    this.jaw = Kit.pivot(this.head, 0, 0.12, 0.1, 'jaw');
    this.joint(this.jaw, 12);
    this.skin(this.jaw, 'weak', (g) => {
      Kit.add(g, Kit.box(0.86, 0.3, 0.9), skin, 0, -0.1, 0.05);
      Kit.add(g, Kit.box(0.6, 0.08, 0.06), bone, 0, 0.06, 0.47);
    });
    Kit.add(this.head, Kit.box(0.7, 0.2, 0.2), Kit.glow(0x3a0606, 1), 0, 0.12, 0.45);
    // Hard hat (ARMOUR).
    this.skin(this.head, 'armor', (g) => {
      // Scuffed, grimy plastic.
      const hat = M.lam(HAT, 'stucco', 1.1, 0.75);
      Kit.add(g, Kit.sphere(0.62, 10, 6), hat, 0, 0.95, -0.02, 0, 0, 0, 1, 0.62, 1.05);
      Kit.add(g, Kit.cyl(0.78, 0.8, 0.07, 12), hat, 0, 0.94, 0.08);
      Kit.add(g, Kit.box(0.14, 0.12, 1.1), M.lam(0xc89a10, 'stucco', 1.1, 0.75), 0, 1.32, 0);
      Kit.add(g, Kit.box(0.4, 0.2, 0.05), M.lam(0x2a2a2a, 'stucco', 1.1, 0.4), 0, 1.1, 0.6);
    });

    // Arms.
    const arm = (side: 1 | -1) => {
      const sh = Kit.pivot(this.chest, side * 1.75, 1.05, -0.05);
      this.joint(sh, 7);
      this.skin(sh, 'limb', (g) => {
        Kit.add(g, Kit.box(0.8, 2.0, 0.85), skin, 0, -0.95, 0);
        Kit.add(g, Kit.box(0.84, 0.6, 0.9), shirt, 0, -0.2, 0);
        if (side < 0) Kit.add(g, Kit.box(0.3, 0.4, 0.06), gore, 0.1, -1.1, 0.44);
      });
      const el = Kit.pivot(sh, 0, -1.95, 0);
      this.joint(el, 8);
      this.skin(el, 'limb', (g) => {
        Kit.add(g, Kit.box(0.74, 1.85, 0.78), skin, 0, -0.92, 0);
      });
      if (side > 0) {
        // Steel sheet strapped to the left forearm (armour).
        this.skin(el, 'armor', (g) => {
          Kit.add(g, Kit.box(0.86, 1.3, 0.9), M.lam(0x767a82, 'metal', 1.2, 0.9), 0, -1.0, 0);
          Kit.add(g, Kit.box(0.9, 0.1, 0.94), M.lam(0x3a2a1c, 'metal', 1.2, 0.3), 0, -0.6, 0);
          Kit.add(g, Kit.box(0.9, 0.1, 0.94), M.lam(0x3a2a1c, 'metal', 1.2, 0.3), 0, -1.4, 0);
        });
      }
      const hand = Kit.pivot(el, 0, -1.85, 0);
      this.joint(hand, 10);
      this.skin(hand, 'limb', (g) => {
        Kit.add(g, Kit.box(0.9, 0.8, 0.55), skinDark, 0, -0.4, 0.05);
        for (let i = 0; i < 4; i++) Kit.add(g, Kit.box(0.18, 0.55, 0.22), skin, -0.3 + i * 0.2, -0.95, 0.12, 0.3, 0, 0);
        Kit.add(g, Kit.box(0.2, 0.45, 0.24), skin, side * 0.5, -0.5, 0.25, 0.4, 0, side * 0.4);
      });
      return { sh, el, hand };
    };
    const AL = arm(1);
    const AR = arm(-1);
    this.shL = AL.sh;
    this.elL = AL.el;
    this.handL = AL.hand;
    this.shR = AR.sh;
    this.elR = AR.el;
    this.handR = AR.hand;
    this.joint(this.model, 4);

    // Held props (right hand).
    this.heldCar = new THREE.Group();
    const hc = car(this.world.rng, { color: 0x2a5a8a, lights: true });
    hc.rotation.set(0, Math.PI / 2, 0);
    hc.position.set(0, -0.6, 0);
    this.heldCar.add(hc);
    for (const m of bake(this.heldCar)) this.hitbox(m, 'weak');
    this.heldCar.position.set(0, -1.1, 0.4);
    this.heldCar.visible = false;
    this.handR.add(this.heldCar);

    this.heldSlab = new THREE.Group();
    Kit.add(this.heldSlab, Kit.box(2.4, 0.6, 1.7), conc, 0, 0, 0);
    Kit.add(this.heldSlab, Kit.cyl(0.05, 0.05, 1.2, 5), rust, 0.8, 0.3, 0.5, 0.6, 0, 0.3);
    Kit.add(this.heldSlab, Kit.cyl(0.05, 0.05, 1.0, 5), rust, -0.6, -0.3, -0.4, -0.4, 0, 0.6);
    for (const m of bake(this.heldSlab)) this.hitbox(m, 'weak');
    this.heldSlab.position.set(0, -1.3, 0.4);
    this.heldSlab.visible = false;
    this.handR.add(this.heldSlab);

    this.club = new THREE.Group();
    this.skin(this.club, 'armor', (g) => {
      const pole = M.lam(0x464a50, 'metal', 1.2, 0.8);
      Kit.add(g, Kit.cyl(0.13, 0.17, 7.6, 6), pole, 0, -3.4, 0);
      Kit.add(g, Kit.box(0.14, 0.14, 1.9), pole, 0, -7.15, 0.85);
      Kit.add(g, Kit.box(0.4, 0.2, 0.7), M.lam(0x222226, 'metal', 1.2, 0.4), 0, -7.15, 1.75);
      Kit.add(g, Kit.box(0.32, 0.06, 0.55), M.glow(0xffb050, 1.4), 0, -7.27, 1.75);
      Kit.add(g, Kit.box(0.5, 0.4, 0.5), conc, 0, 0.3, 0);
    });
    this.clubTip = Kit.pivot(this.club, 0, -7.0, 0.6, 'clubTip');
    this.club.position.set(0, -0.8, 0.3);
    this.club.visible = false;
    this.handR.add(this.club);

    // Shockwave ring for the slam (rig frame).
    this.ring = Kit.mesh(Kit.track(new THREE.RingGeometry(0.8, 1.4, 28)), Kit.glow(0xffc890, 1, true, 0.55));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;

    // Splash column for the death plunge (added to the scene when it hits the water).
    this.splash = new THREE.Group();
    this.splash.name = 'behemoth-splash';
    const foam = Kit.glow(0xe8f2ff, 1, true, 0.75);
    const spray = Kit.glow(0xb8d0e8, 1, true, 0.5);
    Kit.add(this.splash, Kit.cyl(2.2, 4.5, 34, 10, ), foam, 0, 17, 0);
    Kit.add(this.splash, Kit.cyl(4.5, 7, 18, 10), spray, 0, 9, 0);
    Kit.add(this.splash, Kit.sphere(5, 10, 6), foam, 0, 34, 0, 0, 0, 0, 1, 0.6, 1);
    this.splash.visible = false;

    this.anchor = this.wound;
    this.headAnchor = this.head;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  override onAdded(): void {
    super.onAdded();
    const rig = this.world.rig;
    rig.space.add(this.focus, this.ring);
    // Start hanging off the right side of the deck, climbing up.
    this.root.position.set(BRIDGE.R + 1.6, 0, 21);
    this.model.position.y = -8.5;
    this.root.rotation.y = -Math.PI / 2 - 0.4;
    this.go('intro');
    this.updateFocus(1);
    rig.lookAtObject(this.focus, 3.2);
    this.world.audio.play('boss_roar', { volume: 0.7, pitch: 0.7 });
    const z = z3Scene(this.world);
    if (z) z.beacon = 1;
  }

  // ─── Damage ───────────────────────────────────────────────────────────────

  protected override damageMultiplier(hit: ShotHit): number {
    const open = this.bs === 'reel' || this.bs === 'roar' || this.bs === 'land' ? 1.35 : 1;
    switch (hit.part) {
      case 'weak':
        return open;
      case 'head':
        return open;
      case 'torso':
      case 'body':
        return 0.2;
      case 'limb':
        return 0.12;
      default:
        return 0.15;
    }
  }

  /** Don't strobe the whole giant on every bullet: flash the weak points only. */
  override flash(critical = false): void {
    if (!critical || !this.weakMeshes.length) return;
    for (const w of this.weakMeshes) w.material = this.whiteMat;
    this.flashT = 0.05;
  }

  protected override onDamaged(hit: ShotHit, amount: number): void {
    super.onDamaged(hit, amount);
    const weak = hit.part === 'weak' || hit.part === 'head';
    this.flinchV += clamp(amount * (weak ? 0.5 : 0.15), 0, 1.2);
    if (weak) this.world.fx.sparks(hit.point, hit.normal, 3);
    if (this.winding && weak) {
      this.interrupt += amount;
      if (this.interrupt >= this.interruptNeed()) this.stagger2();
    }
  }

  /**
   * Weak-point damage needed to stagger a wind-up: 8–10 twin-gun rounds (0.8)
   * on the wound/head, ≈0.6–0.75 s of on-target fire inside a 1.0–1.5 s ring.
   * Answer the ring on the glow and it breaks with time to spare; spray the body,
   * chase a runner first or react late and it lands. (At 11–13 a loose aim lost
   * ~6 hearts to the giant alone on top of the riot-brute stops; those stops and
   * the runners that leap aboard mid-fight now carry that pressure.)
   */
  private interruptNeed() {
    return [6, 7, 8][this.phase] ?? 8;
  }

  protected override onPhase(phase: number): void {
    this.pendingRoar = Math.max(this.pendingRoar, phase);
  }

  /** Interrupted: reel back, drop whatever it holds (a car explodes in its hand). */
  private stagger2() {
    const w = this.world;
    this.telegraph = null;
    this.winding = false;
    w.audio.play('boss_roar', { volume: 0.6, pitch: 1.25 });
    w.rig.shake(0.35);
    const sp = this.screenPos(this.head);
    if (sp) w.hud.popup('STAGGERED!', sp.x, sp.y - 30, 'combo');
    w.score.add(500);
    if (this.holding === 'car') {
      this.heldCar.getWorldPosition(_v);
      this.heldCar.visible = false;
      w.fx.explosion(_v, 1.4);
      w.audio.play('explosion', { volume: 0.9 });
      this.hp -= this.maxHp * 0.035;
      if (this.hp <= 0) {
        this.die(null);
        return;
      }
    } else if (this.holding === 'slab') {
      this.heldSlab.getWorldPosition(_v);
      this.heldSlab.visible = false;
      w.fx.debris(_v, 0x8a847c);
      w.fx.dust(_v, 1.5, 0x9a948c);
    }
    this.holding = null;
    this.go('reel');
  }

  // ─── State helpers ────────────────────────────────────────────────────────

  private go(s: BState) {
    this.telegraph = null;
    this.winding = false;
    this.interrupt = 0;
    this.bs = s;
    this.setState(s);
  }

  /** Telegraphed wind-up; returns true when it lands. */
  private windAttack(dur: number, anchor: THREE.Object3D, radius: number, land: () => void): boolean {
    this.winding = true;
    this.telegraphRadius = radius;
    return this.telegraphAttack(dur, land, anchor);
  }

  private set(obj: THREE.Object3D, x: number, y = 0, z = 0) {
    const j = this.J.get(obj)!;
    j.x = x;
    j.y = y;
    j.z = z;
  }

  private chaseDist(): number {
    return [15.5, 13.5, 12][this.phase] ?? 12;
  }

  private faceTruck(dt: number, rate = 4) {
    const p = this.root.position;
    const yaw = Math.atan2(-p.x, -p.z);
    this.root.rotation.y += angleDelta(this.root.rotation.y, yaw) * (1 - Math.exp(-rate * dt));
  }

  /**
   * Where the look-back camera aims. The pitch follows the head: the split
   * skull sits ~19° above the view centre (clear of the boss health bar), and
   * the pitch never exceeds ~15.5°, so the deck right behind the truck — where
   * the minions attack from — stays in frame even when the giant is close.
   */
  private updateFocus(k: number) {
    const rig = this.world.rig;
    const p = this.root.position;
    const ex = rig.offset.x;
    const ez = rig.offset.z;
    const eye = rig.eyeHeight + rig.offset.y;
    this.head.getWorldPosition(_v);
    rig.space.worldToLocal(_v);
    const hFlat = Math.max(3, Math.hypot(_v.x - ex, _v.z - ez));
    const eHead = Math.atan2(_v.y + 0.9 - eye, hFlat);
    const pitch = clamp(eHead - 0.33, 0.05, 0.27);
    const fx = p.x * 0.6;
    const fz = Math.max(4, p.z);
    _w.set(fx, eye + Math.tan(pitch) * Math.hypot(fx - ex, fz - ez), fz);
    this.focus.position.lerp(_w, k);
  }

  /** Runners leap onto the deck off the girders, or ride the giant's back and drop off it. */
  private spawnMinion(type: 'leap' | 'drop') {
    const w = this.world;
    let n = 0;
    for (const e of w.enemies()) if (!e.isBoss && e.state !== 'dying') n++;
    if (n >= 4) return;
    const p = this.root.position;
    const side = this.minionFlip ? 1 : -1;
    this.minionFlip = !this.minionFlip;
    const pos =
      type === 'leap'
        ? new THREE.Vector3(clamp(p.x + side * 4, -6, 6), 0, Math.max(10, p.z - 3))
        : new THREE.Vector3(clamp(p.x + side * 1.6, -5, 5), 5.2, Math.max(9, p.z - 2));
    try {
      const e = createEnemy('tail_runner', w, {
        pos,
        frame: 'rig',
        entry: type,
        hpMul: 1,
        speedMul: 1,
        opts: { variant: this.world.rng.pick(['worker', 'soldier', 'civilian', 'biker']) },
      });
      w.add(e);
    } catch {
      /* roster still loading — skip */
    }
  }

  private release(kind: 'car' | 'slab') {
    const w = this.world;
    const src = kind === 'car' ? this.heldCar : this.heldSlab;
    src.getWorldPosition(_v);
    src.visible = false;
    this.holding = null;
    const mesh = new THREE.Group();
    if (kind === 'car') {
      const c = car(w.rng, { color: w.rng.pick([0x2a5a8a, 0x7a1c1c, 0x9a9a9a, 0x3a5a3a]), lights: true });
      c.position.y = -0.7;
      mesh.add(c);
    } else {
      Kit.add(mesh, Kit.box(2.2, 0.6, 1.6), M.lam(0x8a847c, 'concrete', 0.8, 0.9), 0, 0, 0);
      Kit.add(mesh, Kit.cyl(0.05, 0.05, 1.2, 5), M.lam(RUST, 'metal', 1.4, 1), 0.8, 0.3, 0.5, 0.6, 0, 0.3);
    }
    bake(mesh);
    const fast = this.phase >= 2;
    const p = new Throwable(
      w,
      {
        from: _v.clone(),
        flightTime: kind === 'car' ? (fast ? 1.65 : 1.95) : fast ? 1.4 : 1.6,
        arc: kind === 'car' ? 0.5 : 0.4,
        damage: 1,
        // Twin-gun rounds (0.8) to shoot it down: a car takes 4, a slab 3.
        hp: kind === 'car' ? 3 : 2.2,
        points: kind === 'car' ? 400 : 250,
        mesh,
        size: kind === 'car' ? 1.3 : 1.0,
        spin: kind === 'car' ? 2.6 : 4,
        source: this.title,
        sfxDestroy: kind === 'car' ? 'explosion' : 'crash',
        burst: kind === 'car' ? 'explode' : 'debris',
      },
      () => {
        if (kind === 'slab') {
          p.root.getWorldPosition(_w);
          w.fx.dust(_w, 1.4, 0x9a948c);
        }
        w.rig.shake(0.2);
      },
    );
    w.add(p);
    w.audio.play('whoosh', { volume: 1, pitch: 0.6 });
  }

  // ─── Behaviour ────────────────────────────────────────────────────────────

  /**
   * Keep the truck rolling for the whole fight. The rest of the bridge is
   * rationed by the giant's remaining health, so a long fight slows the chase
   * down (and the giant's run with it) instead of parking the truck while the
   * Behemoth sprints on the spot.
   */
  private pace() {
    const rig = this.world.rig;
    const left = D.BOSS_END - rig.d;
    if (left <= 0.3) return;
    const frac = clamp(this.hp / this.maxHp, 0, 1);
    rig.moveTo(D.BOSS_END, clamp(left / (14 + 80 * frac), 1.8, 6));
  }

  protected override customUpdate(dt: number): void {
    const w = this.world;
    const t = this.stateTime;
    const p = this.root.position;
    this.pace();
    // Approach the desired spot behind the truck (rig frame).
    const zRate = this.bs === 'leap' ? 0 : this.bs === 'clubWind' || this.bs === 'swipeWind' ? 2.2 : 1.1;
    if (zRate > 0 && this.bs !== 'intro') {
      p.z += (this.targetZ - p.z) * (1 - Math.exp(-zRate * dt));
      p.x += (this.targetX - p.x) * (1 - Math.exp(-0.9 * dt));
    }

    // Minions in later phases.
    if (this.phase >= 1 && this.bs !== 'intro' && this.bs !== 'roar') {
      this.minionT -= dt;
      if (this.minionT <= 0) {
        this.minionT = this.phase >= 2 ? 13 : 15;
        this.spawnMinion(this.phase >= 2 && this.minionFlip ? 'drop' : 'leap');
        if (this.phase >= 2) w.later(0.8, () => this.state !== 'dying' && !this.removed && this.spawnMinion('leap'));
      }
    }

    switch (this.bs) {
      case 'intro': {
        this.introT += dt;
        const k = this.introT;
        if (k < 1.8) {
          // Hauling itself up over the railing.
          this.model.position.y = lerp(-8.5, -0.6, smoothstep(0, 1.8, k));
          if (Math.floor((k - dt) * 3) !== Math.floor(k * 3)) {
            w.audio.play('metal_clang', { volume: 0.5, pitch: 0.5 });
            this.handL.getWorldPosition(_v);
            w.fx.sparks(_v, null, 6);
          }
        } else if (k < 2.6) {
          // Vault onto the deck.
          const u = smoothstep(1.8, 2.6, k);
          p.x = lerp(BRIDGE.R + 1.6, 2.5, u);
          p.z = lerp(21, 17.5, u);
          this.model.position.y = lerp(-0.6, 0, u) + Math.sin(u * Math.PI) * 2.5;
        } else {
          this.model.position.y = 0;
          w.rig.shake(0.7);
          w.audio.play('stomp', { pitch: 0.5, volume: 1 });
          this.worldPos(_v);
          w.fx.dust(_v, 3, 0x8a847c);
          this.targetX = 1.5;
          this.targetZ = 17.5;
          this.go('roar');
          this.roared = 0;
          return;
        }
        this.faceTruck(dt, 2);
        break;
      }
      case 'chase': {
        this.faceTruck(dt);
        this.targetZ = this.chaseDist() + Math.sin(this.age * 0.5) * 1.5;
        this.targetX = Math.sin(this.age * 0.37) * 3.2;
        if (this.pendingRoar > this.roared) {
          this.go('roar');
          break;
        }
        if (t >= this.chaseFor) this.pickAttack();
        break;
      }
      case 'roar': {
        this.faceTruck(dt);
        if (t < dt * 1.5) {
          w.audio.play('boss_roar', { volume: 1, pitch: this.phase >= 2 ? 0.75 : 0.9 });
          w.rig.shake(0.45);
          if (this.roared > 0 || this.phase > 0) {
            const sp = this.screenPos(this.head);
            if (sp) w.hud.popup(this.phase >= 2 ? 'ENRAGED!' : 'IT\'S GETTING ANGRY!', sp.x, sp.y - 50, 'warning');
          }
        }
        if (t > 2.1) {
          const from = this.roared;
          this.roared = Math.max(this.roared, this.pendingRoar, this.phase);
          this.pendingRoar = this.roared;
          if (this.phase >= 1 && !this.hasClub) this.go('tear');
          else if (this.phase >= 2 && from < 2) this.go('crouch');
          else this.backToChase(1.2);
        }
        break;
      }
      case 'tear': {
        this.targetX = 5.5;
        this.targetZ = 15;
        this.faceTruck(dt, 2);
        if (t > 1.0 && !this.hasClub) {
          this.hasClub = true;
          this.club.visible = true;
          this.handR.getWorldPosition(_v);
          w.fx.sparks(_v, null, 18);
          w.fx.debris(_v, 0x3a3c40);
          w.audio.play('metal_clang', { volume: 1, pitch: 0.6 });
          w.audio.play('crash', { volume: 0.6, pitch: 0.7 });
          w.rig.shake(0.3);
        }
        if (t > 2.0) this.backToChase(0.8);
        break;
      }
      case 'grab': {
        this.faceTruck(dt);
        if (t > 0.55 && !this.holding) {
          this.holding = this.phase >= 1 && this.attacks % 2 === 0 ? 'slab' : 'car';
          (this.holding === 'car' ? this.heldCar : this.heldSlab).visible = true;
          this.handR.getWorldPosition(_v);
          _v.y = 0.2;
          w.fx.dust(_v, 1.6, 0x8a847c);
          w.audio.play(this.holding === 'car' ? 'crash' : 'hit_world', { volume: 0.7, pitch: 0.7 });
        }
        if (t > 0.95) this.go('throwWind');
        break;
      }
      case 'throwWind': {
        this.faceTruck(dt);
        const held = this.holding === 'slab' ? this.heldSlab : this.heldCar;
        const dur = this.phase >= 2 ? 1.0 : 1.25;
        if (!this.holding) {
          this.backToChase(1);
          break;
        }
        if (this.windAttack(dur, held, this.holding === 'car' ? 1.6 : 1.3, () => {})) this.go('throw');
        break;
      }
      case 'throw': {
        this.faceTruck(dt);
        if (t >= 0.14 && this.holding) this.release(this.holding);
        if (t > 0.7) this.backToChase(this.phase >= 2 ? 1.4 : 2.2);
        break;
      }
      case 'slamWind': {
        this.faceTruck(dt);
        this.targetZ = Math.min(this.targetZ, this.chaseDist() - 3);
        if (
          this.windAttack(this.phase >= 2 ? 1.25 : 1.5, this.wound, 1.7, () => {
            this.slamImpact();
          })
        )
          this.go('slam');
        break;
      }
      case 'slam': {
        if (t > 0.9) this.backToChase(1.8);
        break;
      }
      case 'clubWind': {
        this.faceTruck(dt, 6);
        this.targetZ = 9.2;
        this.targetX = 1.2;
        if (t < 0.7) break;
        if (
          this.stateTime >= 0.7 &&
          this.windupFrom(0.7, this.phase >= 2 ? 1.15 : 1.35, this.wound, 1.7, () => {
            w.hurtPlayer(1, this.title);
            w.rig.shake(0.85);
            w.audio.play('metal_clang', { volume: 1, pitch: 0.55 });
            w.audio.play('crash', { volume: 0.8 });
            this.clubTip.getWorldPosition(_v);
            w.fx.sparks(_v, null, 22);
            w.fx.debris(_v, 0x8a847c);
          })
        )
          this.go('club');
        break;
      }
      case 'club': {
        if (t > 0.8) this.backToChase(1.6);
        break;
      }
      case 'crouch': {
        this.faceTruck(dt);
        if (t > 0.75) {
          this.leapFrom.copy(p);
          this.leapTo.set(clamp(p.x * 0.3, -2, 2), 0, 10.5);
          w.audio.play('boss_roar', { volume: 0.8, pitch: 1.1 });
          w.audio.play('whoosh', { pitch: 0.5 });
          this.go('leap');
        }
        break;
      }
      case 'leap': {
        const k = clamp(t / 1.05, 0, 1);
        p.lerpVectors(this.leapFrom, this.leapTo, k);
        p.y = Math.sin(k * Math.PI) * 4.2;
        this.targetZ = p.z;
        this.targetX = p.x;
        this.faceTruck(dt, 6);
        if (k >= 1) {
          p.y = 0;
          w.rig.shake(1);
          w.haptic(160);
          w.audio.play('stomp', { pitch: 0.45, volume: 1 });
          w.audio.play('crash', { volume: 0.7, pitch: 0.6 });
          this.worldPos(_v);
          w.fx.dust(_v, 3.5, 0x8a847c);
          w.fx.debris(_v, 0x8a847c);
          this.go('land');
        }
        break;
      }
      case 'land': {
        this.faceTruck(dt);
        if (t > 0.65) this.go('swipeWind');
        break;
      }
      case 'swipeWind': {
        this.faceTruck(dt, 6);
        this.targetZ = 10.5;
        if (
          this.windAttack(1.45, this.wound, 1.7, () => {
            w.hurtPlayer(1, this.title);
            w.rig.shake(0.8);
            w.audio.play('bite', { volume: 1, pitch: 0.5 });
          })
        )
          this.go('swipe');
        break;
      }
      case 'swipe': {
        if (t > 0.7) this.backToChase(1.4);
        break;
      }
      case 'reel': {
        this.targetZ = Math.max(this.targetZ, this.chaseDist() + 2);
        if (t > 1.7) this.backToChase(1.2);
        break;
      }
    }
  }

  /** Like windup(), but the ring starts `offset` seconds into the state. */
  private windupFrom(offset: number, dur: number, anchor: THREE.Object3D, radius: number, land: () => void): boolean {
    this.winding = true;
    if (!this.telegraph) this.telegraph = { progress: 0, anchor, radius };
    this.telegraph.progress = clamp((this.stateTime - offset) / dur, 0, 1);
    if (this.stateTime - offset >= dur) {
      this.telegraph = null;
      this.winding = false;
      land();
      return true;
    }
    return false;
  }

  private backToChase(pause: number) {
    this.chaseFor = pause + this.world.rng.range(0.4, 1.2);
    this.go('chase');
  }

  private pickAttack() {
    const r = this.world.rng;
    this.attacks++;
    let next: BState;
    if (this.phase === 0) {
      next = this.lastAttack === 'grab' && r.chance(0.6) ? 'slamWind' : r.chance(0.7) ? 'grab' : 'slamWind';
    } else if (this.phase === 1) {
      const x = r.next();
      next = x < 0.42 ? 'clubWind' : x < 0.8 ? 'grab' : 'slamWind';
      if (next === this.lastAttack && next !== 'grab') next = 'grab';
    } else {
      const x = r.next();
      next = x < 0.35 ? 'crouch' : x < 0.6 ? 'clubWind' : x < 0.88 ? 'grab' : 'slamWind';
      if (next === this.lastAttack) next = next === 'grab' ? 'crouch' : 'grab';
    }
    if (next === 'clubWind' && !this.hasClub) next = 'grab';
    this.lastAttack = next;
    this.go(next);
  }

  private slamImpact() {
    const w = this.world;
    w.hurtPlayer(1, this.title);
    w.rig.shake(0.9);
    w.haptic(180);
    w.audio.play('stomp', { pitch: 0.4, volume: 1 });
    w.audio.play('explosion', { volume: 0.5, pitch: 0.5 });
    for (const h of [this.handL, this.handR]) {
      h.getWorldPosition(_v);
      _v.y = 0.3;
      w.fx.dust(_v, 2.6, 0x8a847c);
      w.fx.debris(_v, 0x8a847c);
    }
    this.ringFrom.set(this.root.position.x, 0.15, this.root.position.z - 3);
    this.ringT = 0;
  }

  // ─── Animation ────────────────────────────────────────────────────────────

  protected override animate(dt: number): void {
    if (this.state === 'dying') return;
    const w = this.world;
    const st = this.bs;
    const t = this.stateTime;
    const rig = w.rig;
    // Weak-point flash + pulse.
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) for (const m of this.weakMeshes) m.material = m.userData.baseMat as THREE.Material;
    }
    const hot = this.phase >= 2;
    if (this.flashT <= 0) this.core.material = hot ? this.weakHot : this.weakMat;
    const beat = Math.pow(Math.max(0, Math.sin(this.age * (hot ? 7 : 4.5))), 6);
    this.core.scale.set(1.25 + beat * 0.2, 1.15 + beat * 0.2, 0.6 + beat * 0.15);

    // Flinch spring.
    this.flinchV -= this.flinch * 60 * dt;
    this.flinchV *= Math.exp(-7 * dt);
    this.flinch += this.flinchV * dt * 8;
    const fl = clamp(this.flinch, -0.5, 0.5);

    // Run cycle (ground speed includes the moving truck).
    const running = st === 'chase' || st === 'reel' || st === 'tear' || (st === 'clubWind' && t < 0.7) || st === 'swipe' || st === 'club';
    const gs = rig.speed + 1.5;
    this.stride += dt * (2.2 + gs * 0.32) * (running ? 1 : 0.3);
    const ph = this.stride;
    // A slow truck gets a heavy lumber, not a sprint on the spot.
    const run = running ? clamp((rig.speed + 0.8) / 4.6, 0.3, 1) : 0;
    const sw = Math.sin(ph);
    const foot = Math.floor(ph / Math.PI);
    if (running && foot !== this.lastFoot) {
      this.lastFoot = foot;
      w.audio.play('stomp', { pitch: 0.55 + w.rng.next() * 0.1, volume: 0.55 });
      rig.shake(0.1);
      (foot % 2 === 0 ? this.kneeL : this.kneeR).getWorldPosition(_v);
      _v.y = 0.1;
      w.fx.dust(_v, 1.2, 0x8a847c);
    }

    // Base pose: heavy lumbering run.
    this.hipsYT = 3.4 - Math.abs(Math.cos(ph)) * 0.28 * run;
    this.set(this.hipL, sw * 0.6 * run, 0, 0.06);
    this.set(this.hipR, -sw * 0.6 * run, 0, -0.06);
    this.set(this.kneeL, (0.25 + Math.max(0, -Math.cos(ph)) * 0.9) * run + 0.1, 0, 0);
    this.set(this.kneeR, (0.25 + Math.max(0, Math.cos(ph)) * 0.9) * run + 0.1, 0, 0);
    this.set(this.spine, 0.32 + fl * 0.5, Math.sin(ph) * 0.12 * run, 0);
    this.set(this.chest, 0.1 + Math.sin(this.age * 1.6) * 0.03, 0, Math.sin(ph) * 0.04 * run);
    this.set(this.neck, -0.38 - fl * 0.6, 0, 0);
    this.set(this.head, -0.05, Math.sin(this.age * 0.7) * 0.15, Math.sin(this.age * 1.3) * 0.05);
    this.set(this.jaw, 0.15 + Math.max(0, Math.sin(this.age * 2.1)) * 0.15);
    this.set(this.shL, -sw * 0.55 * run - 0.15, 0, 0.25);
    this.set(this.shR, sw * 0.55 * run - 0.15, 0, -0.25);
    this.set(this.elL, -0.5 - Math.max(0, sw) * 0.4 * run);
    this.set(this.elR, -0.5 - Math.max(0, -sw) * 0.4 * run);
    this.set(this.handL, 0);
    this.set(this.handR, 0);
    this.set(this.model, 0, 0, fl * 0.15);

    switch (st) {
      case 'intro': {
        const k = this.introT;
        if (k < 1.8) {
          // Arms up over the railing, pulling.
          const pull = Math.sin(k * 5) * 0.2;
          this.set(this.shL, -2.7 + pull, 0, 0.2);
          this.set(this.shR, -2.7 - pull, 0, -0.2);
          this.set(this.elL, -0.6 + pull);
          this.set(this.elR, -0.6 - pull);
          this.set(this.spine, 0.5);
          this.set(this.neck, -0.6);
          this.hipsYT = 3.4;
        } else {
          this.set(this.hipL, -1.0);
          this.set(this.hipR, -0.6);
          this.set(this.kneeL, 1.4);
          this.set(this.kneeR, 1.2);
          this.set(this.shL, -1.6, 0, 0.8);
          this.set(this.shR, -1.6, 0, -0.8);
        }
        break;
      }
      case 'roar': {
        const k = smoothstep(0, 0.4, t) * (1 - smoothstep(1.8, 2.1, t));
        const shake = Math.sin(t * 40) * 0.05 * k;
        this.set(this.spine, lerp(0.32, -0.25, k));
        this.set(this.chest, -0.15 * k + shake);
        this.set(this.neck, lerp(-0.38, -0.85, k));
        this.set(this.head, -0.2 * k, shake * 2);
        this.set(this.jaw, 0.7 * k);
        this.set(this.shL, -0.6 * k, 0, 1.1 * k + 0.25);
        this.set(this.shR, -0.6 * k, 0, -1.1 * k - 0.25);
        this.set(this.elL, -1.4 * k);
        this.set(this.elR, -1.4 * k);
        this.hipsYT = 3.2;
        this.set(this.kneeL, 0.4);
        this.set(this.kneeR, 0.4);
        break;
      }
      case 'tear': {
        const k = smoothstep(0, 0.8, t);
        const yank = smoothstep(0.9, 1.3, t);
        this.set(this.shR, lerp(-0.4, -2.4, yank), 0, lerp(-1.5 * k, -0.4, yank));
        this.set(this.elR, -0.3 - yank * 0.8);
        this.set(this.spine, 0.45, -0.5 * k + yank * 0.6, -0.25 * k);
        break;
      }
      case 'grab': {
        const k = smoothstep(0, 0.5, t) * (1 - smoothstep(0.6, 0.95, t) * 0.6);
        this.set(this.spine, 0.32 + 0.75 * k);
        this.set(this.shR, -1.1 * k, 0, -0.35);
        this.set(this.elR, -0.2);
        this.set(this.kneeL, 0.9 * k);
        this.set(this.kneeR, 0.9 * k);
        this.set(this.hipL, -0.6 * k);
        this.set(this.hipR, -0.6 * k);
        this.hipsYT = 3.4 - 0.9 * k;
        break;
      }
      case 'throwWind': {
        // Side-arm hurl: the car is hauled back at shoulder height, torso coiled.
        const k = smoothstep(0, 0.5, t);
        const tremble = Math.sin(t * 30) * 0.04 * k;
        this.set(this.spine, lerp(0.6, 0.22, k), -0.55 * k, 0.06 * k);
        this.set(this.shR, lerp(-1.0, 0.25, k) + tremble, 0, lerp(-0.35, -1.25, k));
        this.set(this.elR, lerp(-0.2, -0.75, k));
        this.set(this.shL, -1.3 * k, 0, 0.45);
        this.set(this.elL, -0.4);
        this.set(this.neck, -0.5);
        this.set(this.jaw, 0.5 * k);
        break;
      }
      case 'throw': {
        const k = smoothstep(0, 0.2, t);
        this.set(this.spine, lerp(0.22, 0.6, k), lerp(-0.55, 0.5, k), 0);
        this.set(this.shR, lerp(0.25, -1.55, k), 0, lerp(-1.25, -0.35, k));
        this.set(this.elR, lerp(-0.75, -0.1, k));
        this.set(this.shL, 0.4, 0, 0.4);
        break;
      }
      case 'slamWind': {
        const k = smoothstep(0, 0.6, t);
        const tremble = Math.sin(t * 34) * 0.05 * k;
        this.set(this.spine, lerp(0.32, -0.3, k) + tremble);
        this.set(this.shL, -2.85 * k, 0, 0.15);
        this.set(this.shR, -2.85 * k, 0, -0.15);
        this.set(this.elL, -0.5 * k);
        this.set(this.elR, -0.5 * k);
        this.set(this.neck, -0.7 * k);
        this.set(this.jaw, 0.6 * k);
        this.hipsYT = 3.4 + 0.2 * k;
        break;
      }
      case 'slam': {
        const k = 1 - smoothstep(0.35, 0.9, t);
        this.set(this.spine, 1.1 * k + 0.32 * (1 - k));
        this.set(this.shL, -1.3 * k, 0, 0.1);
        this.set(this.shR, -1.3 * k, 0, -0.1);
        this.set(this.elL, -0.1);
        this.set(this.elR, -0.1);
        this.set(this.kneeL, 0.9 * k);
        this.set(this.kneeR, 0.9 * k);
        this.hipsYT = 3.4 - 1.0 * k;
        break;
      }
      case 'clubWind': {
        const k = smoothstep(0.6, 1.1, t);
        const tremble = Math.sin(t * 28) * 0.04 * k;
        this.set(this.spine, lerp(0.4, -0.1, k), -0.45 * k, 0);
        this.set(this.shR, lerp(-0.6, -2.7, k) + tremble, 0, -0.5);
        this.set(this.elR, lerp(-0.4, -1.5, k));
        this.set(this.shL, -0.8, 0, 0.5);
        this.set(this.jaw, 0.4 * k);
        break;
      }
      case 'club': {
        const k = smoothstep(0, 0.16, t) * (1 - smoothstep(0.5, 0.8, t) * 0.5);
        this.set(this.spine, lerp(-0.1, 0.95, k), 0.45 * k, 0);
        this.set(this.shR, lerp(-2.7, -0.7, k), 0, -0.4);
        this.set(this.elR, lerp(-1.5, -0.1, k));
        break;
      }
      case 'crouch': {
        const k = smoothstep(0, 0.6, t);
        this.hipsYT = 3.4 - 1.2 * k;
        this.set(this.kneeL, 1.3 * k);
        this.set(this.kneeR, 1.3 * k);
        this.set(this.hipL, -0.8 * k);
        this.set(this.hipR, -0.8 * k);
        this.set(this.spine, 0.7 * k);
        this.set(this.shL, 0.9 * k, 0, 0.3);
        this.set(this.shR, 0.9 * k, 0, -0.3);
        break;
      }
      case 'leap': {
        this.set(this.hipL, -1.1);
        this.set(this.hipR, -0.7);
        this.set(this.kneeL, 1.5);
        this.set(this.kneeR, 1.2);
        this.set(this.shL, -2.4, 0, 0.5);
        this.set(this.shR, -2.4, 0, -0.5);
        this.set(this.spine, 0.2);
        this.set(this.jaw, 0.7);
        break;
      }
      case 'land': {
        const k = 1 - smoothstep(0.1, 0.65, t);
        this.hipsYT = 3.4 - 1.4 * k;
        this.set(this.kneeL, 1.4 * k + 0.1);
        this.set(this.kneeR, 1.4 * k + 0.1);
        this.set(this.hipL, -1.0 * k);
        this.set(this.hipR, -1.0 * k);
        this.set(this.spine, 0.9 * k + 0.3);
        this.set(this.shL, -1.0 * k, 0, 0.7 * k);
        this.set(this.shR, -1.0 * k, 0, -0.7 * k);
        break;
      }
      case 'swipeWind': {
        const k = smoothstep(0, 0.8, t);
        const tremble = Math.sin(t * 30) * 0.05 * k;
        this.set(this.spine, 0.3 + 0.1 * k, 0.3 * k, 0);
        this.set(this.shL, lerp(-0.4, -1.7, k) + tremble, 0, lerp(0.3, 0.05, k));
        this.set(this.elL, lerp(-0.6, -0.15, k));
        this.set(this.handL, -0.4 * k);
        this.set(this.neck, -0.7);
        this.set(this.jaw, 0.6 * k);
        break;
      }
      case 'swipe': {
        const k = smoothstep(0, 0.2, t);
        this.set(this.spine, 0.8, -0.5 * k, 0);
        this.set(this.shL, -1.3, 0, lerp(0.05, -0.8, k));
        this.set(this.elL, -0.2);
        break;
      }
      case 'reel': {
        const k = Math.sin(clamp(t / 1.7, 0, 1) * Math.PI);
        const wob = Math.sin(t * 9) * 0.15 * k;
        this.set(this.spine, lerp(0.32, -0.45, k) + wob);
        this.set(this.neck, -0.9 * k);
        this.set(this.head, -0.3 * k, wob * 2);
        this.set(this.jaw, 0.6 * k);
        this.set(this.shL, -0.9 * k, 0, 0.9 * k);
        this.set(this.shR, -0.9 * k, 0, -0.9 * k);
        this.set(this.elL, -1.2 * k);
        this.set(this.elR, -1.2 * k);
        break;
      }
    }

    // Apply damped joints.
    for (const j of this.joints) {
      const k = 1 - Math.exp(-j.rate * dt);
      j.obj.rotation.x += (j.x - j.obj.rotation.x) * k;
      j.obj.rotation.y += (j.y - j.obj.rotation.y) * k;
      j.obj.rotation.z += (j.z - j.obj.rotation.z) * k;
    }
    // The model joint is used only for roll; keep its yaw/pitch at zero.
    this.model.rotation.x = 0;
    this.model.rotation.y = 0;
    this.hipsY += (this.hipsYT - this.hipsY) * (1 - Math.exp(-8 * dt));
    this.hips.position.y = this.hipsY;

    // Slam shockwave ring.
    if (this.ringT >= 0) {
      this.ringT += dt;
      const k = this.ringT / 0.55;
      if (k >= 1) {
        this.ringT = -1;
        this.ring.visible = false;
      } else {
        this.ring.visible = true;
        this.ring.position.copy(this.ringFrom);
        this.ring.position.z = lerp(this.ringFrom.z, 1, k);
        this.ring.scale.setScalar(1 + k * 6);
      }
    }
    this.updateFocus(1 - Math.exp(-5.5 * dt));
  }

  // ─── Death: shudders, bursts open, topples over the railing into the bay ──

  protected override onDeath(): void {
    const w = this.world;
    this.telegraph = null;
    this.heldCar.visible = false;
    this.heldSlab.visible = false;
    this.ring.visible = false;
    // die() reparented us into the world; remember the rig's right vector.
    const rig = w.rig;
    _v.set(1, 0, 0).applyQuaternion(rig.space.quaternion);
    this.deathRight.copy(_v);
    this.deathFrom.copy(this.root.position);
    const off = _w.subVectors(this.root.position, rig.space.position).dot(_v);
    this.deathTravel = Math.max(1, BRIDGE.R + 0.6 - off);
    this.deathShift = this.towerShift();
    this.vy = 0;
    w.audio.play('boss_roar', { volume: 1, pitch: 0.6 });
    // The horde breaks off: minions drop where they stand and anything in the air
    // is blown apart, so nothing can land a hit during the death cinematic.
    for (const e of w.enemies()) if (e !== this && e.state !== 'dying') e.die(null);
    for (const e of w.entities) {
      if (e instanceof Projectile && !e.removed) {
        e.removed = true;
        e.root.getWorldPosition(_w);
        w.fx.explosion(_w, 0.6);
      }
    }
    // Camera tracks the body but never dips below the deck (we watch it go over the rail).
    this.deathFocus.position.copy(this.root.position).setY(4.5);
    w.scene.add(this.deathFocus);
    w.rig.lookAtObject(this.deathFocus, 2.4);
    // Ease off the throttle so the fall happens close by.
    rig.moveTo(Math.min(rig.length, rig.d + 9), 2.5);
    const z = z3Scene(w);
    if (z) z.beacon = 0;
  }

  protected override updateDeath(dt: number): boolean {
    const w = this.world;
    const t = this.stateTime;
    // Anything that still arrives (a scheduled minion wave) is cut down at once: no hits during the finale.
    for (const e of w.enemies()) if (e !== this && e.hostile && e.state !== 'dying') e.die(null);
    // Explosions from the wound and across the body.
    if (t < 2.6 && Math.floor((t - dt) * 5) !== Math.floor(t * 5)) {
      this.wound.getWorldPosition(_v);
      _v.x += w.rng.spread(1.4);
      _v.y += w.rng.spread(1.6);
      _v.z += w.rng.spread(1.4);
      w.fx.explosion(_v, 0.8 + w.rng.next() * 0.6);
      w.fx.blood(_v, null, { color: this.bloodColor, amount: 2 });
      w.audio.play('explosion', { volume: 0.7, vary: 0.2 });
      w.rig.shake(0.25);
    }
    const r = this.deathRight;
    const shud = Math.sin(t * 24) * 0.06 * (1 - clamp(t / DEATH_STAGGER, 0, 1));
    if (t < DEATH_STAGGER) {
      // Staggering sideways to the railing, clutching the wound.
      const k = smoothstep(0, DEATH_STAGGER, t);
      this.root.position.copy(this.deathFrom).addScaledVector(r, k * this.deathTravel).addScaledVector(this.deathFwd, k * this.deathShift);
      this.model.rotation.z = shud + k * 0.12;
      this.spine.rotation.x += (-0.4 - this.spine.rotation.x) * Math.min(1, dt * 3);
      this.neck.rotation.x += (-0.9 - this.neck.rotation.x) * Math.min(1, dt * 3);
      this.jaw.rotation.x = 0.8;
      this.shL.rotation.set(-1.4, 0, 0.3);
      this.shR.rotation.set(-1.2, 0, -0.5);
      this.elL.rotation.x = -1.6;
      this.elR.rotation.x = -1.5;
      if (t > 1.0 && t - dt <= 1.0) w.audio.play('boss_roar', { volume: 0.9, pitch: 0.5 });
    } else {
      // Topple over the railing (pivoting on the feet), then drop into the bay.
      const k = t - DEATH_STAGGER;
      const roll = Math.min(1.9, 0.12 + k * k * 1.3);
      this.model.rotation.z = roll;
      this.shL.rotation.x += (-2.8 - this.shL.rotation.x) * Math.min(1, dt * 2);
      this.shR.rotation.x += (-2.6 - this.shR.rotation.x) * Math.min(1, dt * 2);
      if (roll > 1.0) {
        this.vy -= 20 * dt;
        this.root.position.y = Math.max(BRIDGE.WATER - 8, this.root.position.y + this.vy * dt);
        this.root.position.addScaledVector(r, dt * 3);
      }
      if (k > 0.3 && k - dt <= 0.3) {
        w.audio.play('metal_clang', { volume: 1, pitch: 0.45 });
        w.audio.play('crash', { volume: 0.8, pitch: 0.6 });
        this.root.getWorldPosition(_v);
        _v.y = 1.2;
        w.fx.sparks(_v, null, 24);
        w.fx.debris(_v, 0x8a847c);
        w.rig.shake(0.5);
      }
      if (!this.splashed && this.root.position.y < BRIDGE.WATER + 1) {
        this.splashed = true;
        this.root.getWorldPosition(_v);
        _v.y = BRIDGE.WATER + 0.5;
        w.audio.play('splash', { volume: 1, pitch: 0.45 });
        w.audio.play('explosion', { volume: 0.6, pitch: 0.5 });
        w.rig.shake(0.4);
        this.splash.position.copy(_v);
        this.splashT = 0;
        w.scene.add(this.splash);
        w.fx.dust(_v.setY(BRIDGE.WATER + 2), 4, 0xd8e4f0);
        // Let the column climb past the deck before the truck pulls away.
        this.floorAt = t + 0.6;
      }
    }
    if (this.floorAt >= 0 && t >= this.floorAt) {
      // Floor it: the truck pulls away while the camera holds on the spray (the
      // 'escape' beat turns it back to the open road a moment later).
      this.floorAt = -1;
      w.rig.moveTo(Math.min(w.rig.length, w.rig.d + 120), 14);
      w.audio.play('engine_rev', { volume: 0.9 });
    }
    // Splash column climbing past the deck.
    if (this.splashT >= 0) {
      this.splashT += dt;
      splashPose(this.splash, this.splashT);
    }
    this.root.getWorldPosition(_v);
    this.deathFocus.position.lerp(_v.setY(Math.max(3.5, _v.y + 4)), Math.min(1, dt * 4));
    return t > this.deathDuration;
  }

  /**
   * Rail metres to lurch along during the death stagger so the fall isn't hidden
   * behind a bridge tower. The camera looks back from about rig.d + 9 (the truck
   * eases on 9 m before the splash); a tower between it and the fall point, close
   * enough to the fall to cover it, moves the fall in front of the tower (one last
   * lunge after the truck), or — tower too near the truck for that — further
   * back, where the tower covers less of the view.
   */
  private towerShift(): number {
    const rig = this.world.rig;
    _w.set(0, 0, -1).applyQuaternion(rig.space.quaternion).setY(0);
    if (_w.lengthSq() < 1e-6) return 0;
    this.deathFwd.copy(_w.normalize());
    const dBoss = rig.d + _v.subVectors(this.root.position, rig.space.position).dot(this.deathFwd);
    const dCam = Math.min(rig.length, rig.d + 9);
    let shift = 0;
    for (const T of TOWERS) {
      if (T < dBoss - 4 || T > dCam) continue;
      const ratio = (dCam - T) / Math.max(1, dCam - dBoss);
      if (ratio < 0.45) continue;
      if (T + 6 <= dCam - 9) shift = Math.min(12, T + 6 - dBoss); // ≤ ~7 m/s: a lunge, not a slide
      else shift = Math.max(-10, Math.min(0, dCam - (dCam - T) / 0.45 - dBoss));
    }
    return shift;
  }

  override dispose(): void {
    this.deathFocus.parent?.remove(this.deathFocus);
    // The spray column outlives the boss: it collapses back into the bay while the
    // camera swings round to the road, instead of vanishing at full height.
    const splash = this.splash;
    const z = z3Scene(this.world);
    if (splash.parent && this.splashT >= 0 && z) {
      let k = this.splashT;
      z.tween(
        1.8,
        (_u, dt) => {
          k += dt;
          splashPose(splash, k);
        },
        () => splash.parent?.remove(splash),
      );
    } else splash.parent?.remove(splash);
    this.focus.parent?.remove(this.focus);
    this.ring.parent?.remove(this.ring);
    if (z) z.beacon = 0;
    super.dispose();
  }
}

/** Seconds the dying Behemoth staggers to the railing before it topples over. */
const DEATH_STAGGER = 1.7;
/** Rail distances of the bridge towers (they can hide the death plunge). */
const TOWERS = [D.TOWER_A, D.TOWER_B];

/** Splash column `k` seconds after the plunge: shoots up past the deck, spreads, then collapses into the bay. */
function splashPose(splash: THREE.Object3D, k: number) {
  const h = Math.min(1, k / 0.7);
  const sy = 0.05 + h * Math.max(0, 1 - Math.max(0, k - 1.6) * 0.5);
  splash.scale.set(1 + k * 0.8, sy, 1 + k * 0.8);
  splash.visible = sy > 0.06;
}

registerEnemy('behemoth', (w, s) => new Behemoth(w, s));

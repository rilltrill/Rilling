import * as THREE from 'three';
import { Boss } from '../../../gameplay/Boss';
import type { EnemySpawn } from '../../../gameplay/Enemy';
import type { ShotHit } from '../../../gameplay/Entity';
import type { World } from '../../../gameplay/World';
import type { Enemy } from '../../../gameplay/Enemy';
import { clamp, damp, smoothstep } from '../../../core/math';
import { Kit } from '../../kit/ModelKit';
import { createEnemy, registerEnemy } from '../../registry';
import { Projectile, type ProjectileOptions } from '../../../gameplay/Projectile';
import { M, T, TX } from './mats';
import { bakeInto } from './bake';
import { z2Scene } from './scene';

/**
 * PATIENT ZERO — boss of ST. MERCY HOSPITAL.
 *
 * A mass of fused patients grown out of the atrium fountain: a 5 m torso
 * rising from a pool of flesh, four tentacle arms, IV lines strung to the
 * balconies, eight glowing eyes (weak points) and a heart behind a rib cage.
 *
 *  Phase 1 (100–66 %): tentacle slams (ring on the raised tentacle tip — shoot
 *                      the glowing tip or the eyes to knock it back) and bile
 *                      globs (shootable projectiles).
 *  Phase 2 (66–33 %):  roars, the rib cage cracks open and the heart is
 *                      exposed (big weak point); spawns crawlers from the pool.
 *  Phase 3 (< 33 %):   frenzy — faster wind-ups, double slams, bile volleys.
 *
 * Bursting an eye during a wind-up always interrupts the attack.
 *
 * Fairness/pacing (tuned with tests/unit/humanbot.test.ts, target 45–90 s for a
 * ~3 taps/s phone player): eyes and armed tentacle tips carry invisible hit
 * spheres ~1.5× their visible size (fat-finger friendly), burst eyes reopen
 * after ~5 s, attacks only start when their ring anchor is in the playable
 * screen area, and the pool crawlers emerge in the lower-centre of the view and
 * hold a 4.8 m stand-off so their pounce ring is drawn above the HUD panels.
 */

const FLESH = 0x8a4038;
const FLESH_RAW = 0x9a2a26;
const FLESH_DARK = 0x4a1414;
const SKIN = 0xa8948a;
const BONE = 0xd8cdb0;
const EYE = 0xffd84a;
const BILE = 0xa6ff2a;

/** Tentacle-tip pustule at rest (cached Kit material, so identity is stable). */
const pusMat = () => M(0x8e2e1e, 'skin', 2.4, 0.55);

/** The body is modelled at full size and scaled to fit the atrium framing. */
const BODY_SCALE = 0.86;

/** Invisible hit-sphere radius relative to the visible eye / tip pustule. */
const EYE_HIT = 1.5;
const TIP_HIT = 1.55;

/**
 * Crawler emergence points on the pool rim, BOSS-LOCAL (x, z): +z toward the
 * camera, +x = screen right. All ~7.3–9 m from the camera and inside the
 * central band, so crawlers rise in plain view and close in on the lower centre
 * of the screen (clear of the lives/weapon panels).
 */
const CRAWL_PTS: [number, number][] = [
  [-2.3, 4.2],
  [-0.8, 4.7],
  [0.7, 4.6],
  [1.9, 4.3],
  [-3.2, 3.6],
];
/** Pool crawlers stop (and pounce from) further out than usual: head + ring well above the HUD. */
const CRAWL_RANGE = 4.8;
/** At most this many pool crawlers alive at once. */
const CRAWL_MAX = 3;
/** Seconds without a new attack after the player loses a heart. */
const BREATHER = 1.6;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ─── Bile glob ──────────────────────────────────────────────────────────────

/**
 * A bile glob that fans out sideways from the volley line (rig-frame metres at
 * the camera end), so the globs of one volley never line up behind each other
 * on screen — every one shows its own ring and can be tapped on its own.
 */
class BileGlob extends Projectile {
  constructor(
    world: World,
    opts: Partial<ProjectileOptions> & { from: THREE.Vector3 },
    private lateral: number,
  ) {
    super(world, opts);
  }

  override onAdded(): void {
    super.onAdded();
    this.from.x += this.lateral * 0.35;
    this.to.x += this.lateral;
    this.root.position.copy(this.from);
  }
}

// ─── Dynamic tentacle tube ──────────────────────────────────────────────────

/** A tapered tube along a cubic Bézier, rebuilt every frame (one draw call). */
class Tube {
  readonly mesh: THREE.Mesh;
  /** Control points P0..P3 (in the parent's frame). */
  readonly P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  readonly tipDir = new THREE.Vector3(0, 1, 0);
  private pos: Float32Array;
  private nrm: Float32Array;
  private geo: THREE.BufferGeometry;
  private n = new THREE.Vector3(1, 0, 0);

  constructor(
    private r0: number,
    private r1: number,
    mat: THREE.Material,
    private rings = 16,
    private sides = 7,
  ) {
    const count = rings * sides;
    this.pos = new Float32Array(count * 3);
    this.nrm = new Float32Array(count * 3);
    const idx: number[] = [];
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * sides + j;
        const b = i * sides + ((j + 1) % sides);
        const c = (i + 1) * sides + j;
        const d = (i + 1) * sides + ((j + 1) % sides);
        idx.push(a, b, d, a, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.geo = Kit.track(g);
    this.mesh = new THREE.Mesh(this.geo, mat);
  }

  private point(s: number, out: THREE.Vector3) {
    const a = this.P[0];
    const b = this.P[1];
    const c = this.P[2];
    const d = this.P[3];
    const u = 1 - s;
    return out
      .copy(a)
      .multiplyScalar(u * u * u)
      .addScaledVector(b, 3 * u * u * s)
      .addScaledVector(c, 3 * u * s * s)
      .addScaledVector(d, s * s * s);
  }

  private tangent(s: number, out: THREE.Vector3) {
    const a = this.P[0];
    const b = this.P[1];
    const c = this.P[2];
    const d = this.P[3];
    const u = 1 - s;
    out
      .subVectors(b, a)
      .multiplyScalar(3 * u * u)
      .addScaledVector(_v.subVectors(c, b), 6 * u * s)
      .addScaledVector(_v.subVectors(d, c), 3 * s * s);
    if (out.lengthSq() < 1e-8) out.set(0, 1, 0);
    return out.normalize();
  }

  /** Rebuild the vertices. `wave` adds a travelling peristaltic bulge. */
  update(time: number, wave: number, thick = 1) {
    const { rings, sides, pos, nrm } = this;
    this.tangent(0, _t);
    this.n.copy(Math.abs(_t.y) > 0.9 ? _b.set(1, 0, 0) : UP);
    this.n.addScaledVector(_t, -this.n.dot(_t)).normalize();
    for (let i = 0; i < rings; i++) {
      const s = i / (rings - 1);
      this.point(s, _w);
      this.tangent(s, _t);
      // Parallel transport of the normal (no twisting).
      this.n.addScaledVector(_t, -this.n.dot(_t));
      if (this.n.lengthSq() < 1e-6) this.n.set(1, 0, 0).addScaledVector(_t, -_t.x);
      this.n.normalize();
      _b.crossVectors(_t, this.n);
      const r = (this.r0 + (this.r1 - this.r0) * Math.pow(s, 0.85)) * thick * (1 + wave * 0.16 * Math.sin(s * 10 - time * 4));
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        // Outward ring direction = the vertex normal (unit: n ⊥ b).
        const nx = this.n.x * ca + _b.x * sa;
        const ny = this.n.y * ca + _b.y * sa;
        const nz = this.n.z * ca + _b.z * sa;
        const o = (i * sides + j) * 3;
        pos[o] = _w.x + nx * r;
        pos[o + 1] = _w.y + ny * r;
        pos[o + 2] = _w.z + nz * r;
        nrm[o] = nx;
        nrm[o + 1] = ny;
        nrm[o + 2] = nz;
      }
    }
    this.tangent(1, this.tipDir);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
    this.geo.computeBoundingSphere();
  }
}

type TentMode = 'rest' | 'raise' | 'slam' | 'hold' | 'recoil' | 'roar' | 'limp';

interface Tentacle {
  tube: Tube;
  side: 1 | -1;
  upper: boolean;
  base: THREE.Vector3;
  tip: THREE.Group;
  pustule: THREE.Mesh;
  /** Invisible, larger hit sphere on the pustule (registered only while the tip is armed). */
  hit: THREE.Mesh;
  mode: TentMode;
  /** Current control points P1..P3 (smoothed). */
  cur: THREE.Vector3[];
  tgt: THREE.Vector3[];
  rate: number;
  phase: number;
  dmg: number;
}

interface Eye {
  mesh: THREE.Mesh;
  /** Invisible, larger hit sphere (child of `mesh`, so it hides with it). */
  hit: THREE.Mesh;
  pupil: THREE.Object3D;
  lid: THREE.Mesh;
  hp: number;
  maxHp: number;
  closedT: number;
  big: boolean;
}

interface Bubble {
  mesh: THREE.Mesh;
  t: number;
  life: number;
}

const ST = {
  idle: 'idle',
  slam: 'slam',
  spit: 'spit',
  spawn: 'spawn',
  roar: 'roar',
  recoil: 'recoil',
} as const;

export class PatientZero extends Boss {
  // Rig.
  private body = new THREE.Group();
  private torso!: THREE.Group;
  private chest!: THREE.Group;
  private head!: THREE.Group;
  private jaw!: THREE.Group;
  private mouth!: THREE.Object3D;
  private mouthGlow!: THREE.Mesh;
  private heart!: THREE.Mesh;
  private heartRig!: THREE.Group;
  private ribL!: THREE.Group;
  private ribR!: THREE.Group;
  private ribs: THREE.Mesh[] = [];
  private eyes: Eye[] = [];
  private tents: Tentacle[] = [];
  private poolGlow: THREE.Mesh[] = [];
  private bubbles: Bubble[] = [];
  private iv: { line: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; bag: THREE.Object3D }[] = [];
  private fleshMeshes: THREE.Mesh[] = [];
  private headMesh!: THREE.Mesh;
  private player = new THREE.Vector3();

  // AI.
  private nextAttack = 2.2;
  private lastAttack = '';
  private repeat = 0;
  private dmgInState = 0;
  private fired = false;
  private slamTent: Tentacle | null = null;
  private comboLeft = 0;
  /** The current slam is the quick follow-up of a phase-3 double slam. */
  private followUp = false;
  private volley = 0;
  private flinchK = 0;
  private ribOpen = 0;
  private ribTarget = 0;
  private heartExposed = false;
  private minions: Enemy[] = [];
  private spawnPts: THREE.Vector3[] = [];
  private pendingPhase = 0;
  private growlT = 4;
  private emergeRoar = false;
  private flashObj: THREE.Mesh | null = null;
  private flashMat: THREE.Material | null = null;
  private flashT = 0;
  /** Age of the last hit flash (flashes are rate-limited: no strobing under autofire). */
  private lastFlash = -9;
  private deathBursts = 0;
  private heartPopped = false;
  private lastSlamSide: 1 | -1 = 1;
  private spat = 0;
  private roarPhase = 0;
  private burstSrc: THREE.Object3D[] = [];
  private ribRattle = 0;
  /** Never-drawn material for the generous weak-point hit spheres. */
  private hitMat!: THREE.Material;
  /** Indices into spawnPts chosen for the current crawler spawn (boil there, emerge there). */
  private spawnSel: number[] = [];
  /** Seconds the next attack has been held back for a minion's telegraph. */
  private heldFor = 0;
  /** Player hearts last frame (to notice a hit) and the breather it earns. */
  private lastPlayerHp = -1;
  private breather = 0;

  constructor(world: World, spawn: EnemySpawn) {
    super(world, spawn);
  }

  protected override configure() {
    this.name = 'patient_zero';
    this.title = 'PATIENT ZERO';
    this.maxHp = 176;
    this.speed = 0;
    this.attackRange = 99;
    this.points = 30000;
    this.phases = [0.66, 0.33];
    this.telegraphRadius = 0.6;
    this.bloodColor = 0x7a0c0c;
    this.sfxHit = 'hit_flesh';
    this.sfxDie = null;
    this.knockback = 0;
    this.deathDuration = 4.8;
  }

  // ─── Model ────────────────────────────────────────────────────────────────

  protected override build() {
    const rng = this.world.rng;
    // Retro detail maps: bumpy wrinkled hide on the fused mass, veiny skin with
    // rot sores on the raw meat and the victims, porous bone.
    const flesh = M(FLESH, 'hide', 1.0, 0.9);
    const raw = M(FLESH_RAW, 'skin', 0.8, 0.75);
    const dark = M(FLESH_DARK, 'hide', 1.3, 0.8);
    const skin = M(SKIN, 'skin', 1.1, 0.7);
    const bone = M(BONE, 'hide', 2.6, 0.45);
    const vein = Kit.glow(0xff4a24, 1.2);
    this.hitMat = Kit.track(new THREE.MeshBasicMaterial({ visible: false }));
    const jit = (r: number, amt: number, seed: number) => Kit.jitter(Kit.ico(r, 1), amt, seed);

    this.model.add(this.body);

    // ── Pool of flesh (stays at floor level) ──
    const pool = new THREE.Group();
    this.model.add(pool);
    bakeInto(pool, (g) => {
      const disc = new THREE.Mesh(Kit.cyl(4.9, 5.0, 0.16, 24), T(0x4a0a0a, TX.flesh));
      disc.position.y = 0.1;
      g.add(disc);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + rng.spread(0.2);
        const r = rng.range(4.2, 4.9);
        const m = new THREE.Mesh(jit(rng.range(0.45, 0.85), 0.18, i + 3), rng.chance(0.5) ? dark : raw);
        m.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
        m.scale.set(1.2, 0.45, 1);
        m.rotation.y = rng.next() * 3;
        g.add(m);
      }
    });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng.spread(0.3);
      const len = rng.range(1.8, 3.4);
      const m = new THREE.Mesh(Kit.box(0.09, 0.03, len), vein);
      m.position.set(Math.cos(a) * (1.6 + len / 2), 0.19, Math.sin(a) * (1.6 + len / 2));
      m.rotation.y = -a + Math.PI / 2;
      pool.add(m);
      this.poolGlow.push(m);
    }
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(Kit.sphere(0.22, 7, 5), raw);
      m.visible = false;
      pool.add(m);
      this.bubbles.push({ mesh: m, t: rng.next() * 2, life: 0 });
    }

    // ── Base mass + lower torso ──
    const base = this.part(this.body, jit(2.3, 0.4, 11), flesh, 0, 1.0, 0, 'torso');
    base.scale.set(1.25, 0.7, 1.15);
    const base2 = this.part(this.body, jit(1.4, 0.3, 12), raw, 1.2, 0.8, 1.1, 'torso');
    base2.scale.set(1, 0.6, 1);
    this.part(this.body, jit(1.2, 0.3, 13), dark, -1.4, 0.7, 0.9, 'torso').scale.set(1, 0.55, 1);
    this.torso = Kit.pivot(this.body, 0, 1.6, 0, 'torso');
    const belly = this.part(this.torso, jit(1.55, 0.3, 14), flesh, 0, 0.8, 0.1, 'torso');
    belly.scale.set(1.15, 1.0, 0.95);
    this.part(this.torso, jit(0.7, 0.18, 15), raw, 0.7, 0.6, 0.95, 'torso');
    // Fused victims: half-sunk heads and reaching arms.
    const victim = (parent: THREE.Object3D, x: number, y: number, z: number, ry: number, rx: number) => {
      const v = Kit.pivot(parent, x, y, z);
      v.rotation.set(rx, ry, rng.spread(0.4));
      this.part(v, Kit.box(0.24, 0.3, 0.26), skin, 0, 0, 0, 'torso');
      this.part(v, Kit.box(0.2, 0.05, 0.02), Kit.glow(0xffb040, 1.0), 0, 0.05, 0.135, 'torso');
      this.part(v, Kit.box(0.12, 0.05, 0.02), dark, 0, -0.08, 0.135, 'torso');
    };
    victim(this.torso, -0.95, 0.9, 1.0, -0.5, 0.2);
    victim(this.torso, 0.2, 0.2, 1.38, 0.1, -0.3);
    victim(this.body, 1.9, 1.3, 1.2, 0.7, 0.5);
    const arm = (parent: THREE.Object3D, x: number, y: number, z: number, rx: number, rz: number) => {
      const a = Kit.pivot(parent, x, y, z);
      a.rotation.set(rx, 0, rz);
      this.part(a, Kit.box(0.12, 0.6, 0.12), skin, 0, 0.3, 0, 'torso');
      this.part(a, Kit.box(0.1, 0.5, 0.1), skin, 0, 0.75, 0.12, 'torso').rotation.x = 0.5;
      this.part(a, Kit.box(0.12, 0.14, 0.06), skin, 0, 1.0, 0.28, 'torso');
    };
    arm(this.body, -2.2, 1.0, 0.8, 0.6, 0.9);
    arm(this.body, 2.0, 0.6, 1.6, 0.9, -0.6);
    arm(this.torso, -1.1, 0.3, 1.1, 1.0, 0.4);

    // ── Chest + rib cage + heart ──
    this.chest = Kit.pivot(this.torso, 0, 2.0, 0, 'chest');
    const chestMass = this.part(this.chest, jit(1.45, 0.25, 16), flesh, 0, 0.1, -0.25, 'torso');
    chestMass.scale.set(1.35, 1.0, 0.85);
    // Recessed cavity behind the heart.
    const cav = this.part(this.chest, Kit.sphere(0.85, 10, 8), M(0x240505, 'hide', 2.4, 0.8), 0, -0.05, 0.62, 'torso');
    cav.scale.set(1, 1.1, 0.55);
    this.heartRig = Kit.pivot(this.chest, 0, -0.05, 0.78);
    this.heart = new THREE.Mesh(Kit.ico(0.44, 1), Kit.glow(0xff2a2a, 1.5));
    this.heartRig.add(this.heart);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const m = new THREE.Mesh(Kit.box(0.06, 0.6, 0.06), Kit.mat(0x5a0a0a));
      m.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.12);
      m.rotation.set(0, 0, a);
      this.heartRig.add(m);
    }
    // Shoulder humps + bone spikes breaking through (silhouette).
    for (const sx of [-1, 1]) {
      this.part(this.chest, jit(0.95, 0.22, 20 + sx), raw, sx * 1.55, 0.55, -0.35, 'torso').scale.set(1, 0.8, 1);
      for (const [x, y, z, rz, rx, l] of [
        [1.75, 1.1, -0.5, -0.55, -0.2, 1.1],
        [1.3, 1.25, -0.8, -0.3, -0.45, 0.9],
        [2.05, 0.6, -0.2, -1.0, 0.1, 0.8],
      ] as [number, number, number, number, number, number][]) {
        const sp = this.part(this.chest, Kit.cone(0.13, l, 5), bone, sx * x, y, z, 'torso');
        sp.rotation.set(rx, 0, sx * rz);
      }
    }
    // Spine ridge down the back.
    for (let i = 0; i < 5; i++) {
      const sp = this.part(this.torso, Kit.cone(0.14 - i * 0.012, 0.9 - i * 0.08, 5), bone, 0, 3.4 - i * 0.6, -1.25 + i * 0.05, 'torso');
      sp.rotation.x = -0.9;
    }
    // Rib cage: two hinged halves of curved ribs (armour).
    const R = 1.25;
    const ribGeo = Kit.track(new THREE.TorusGeometry(R, 0.085, 5, 10, Math.PI / 2 + 0.08));
    const mkSide = (side: 1 | -1) => {
      const pivot = Kit.pivot(this.chest, side * R, 0, 0.18);
      for (const [y, s] of [[-0.62, 0.86], [-0.24, 1.0], [0.14, 1.02], [0.52, 0.92]] as [number, number][]) {
        const holder = new THREE.Group();
        holder.position.set(-side * R, y, 0);
        holder.rotation.y = side > 0 ? 0 : -Math.PI / 2;
        holder.scale.set(s, 1, s);
        pivot.add(holder);
        const rib = new THREE.Mesh(ribGeo, bone);
        rib.rotation.x = Math.PI / 2;
        holder.add(rib);
        this.ribs.push(rib);
      }
      // Sternum half.
      const st = new THREE.Mesh(Kit.box(0.16, 1.45, 0.14), bone);
      st.position.set(-side * R + side * 0.08, -0.05, R * 0.99);
      pivot.add(st);
      this.ribs.push(st);
      return pivot;
    };
    this.ribL = mkSide(1);
    this.ribR = mkSide(-1);

    // ── Head ──
    const neck = Kit.pivot(this.chest, 0, 1.05, 0.0, 'neck');
    this.part(neck, Kit.cyl(0.55, 0.75, 0.8, 8), flesh, 0, 0.2, 0, 'torso');
    this.head = Kit.pivot(neck, 0, 0.55, 0.15, 'head');
    this.head.scale.setScalar(1.22);
    this.headMesh = this.part(this.head, jit(0.95, 0.18, 30), skin, 0, 0.55, 0, 'torso');
    this.headMesh.scale.set(1.05, 1.15, 1.0);
    this.part(this.head, jit(0.5, 0.12, 31), raw, -0.6, 0.95, -0.2, 'torso');
    this.part(this.head, jit(0.4, 0.1, 32), dark, 0.55, 1.15, -0.3, 'torso');
    // Upper teeth + mouth glow + jaw.
    this.mouth = Kit.pivot(this.head, 0, 0.12, 0.95);
    this.mouthGlow = new THREE.Mesh(Kit.box(0.7, 0.3, 0.1), Kit.glow(0xff6a20, 1.2));
    this.mouthGlow.position.set(0, 0.1, 0.8);
    this.mouthGlow.userData.noFlash = true;
    this.head.add(this.mouthGlow);
    for (let i = 0; i < 6; i++) this.part(this.head, Kit.cone(0.06, 0.2, 4), bone, -0.3 + i * 0.12, 0.2, 0.9, 'torso').rotation.x = Math.PI;
    this.jaw = Kit.pivot(this.head, 0, 0.18, 0.2, 'jaw');
    this.part(this.jaw, Kit.box(0.9, 0.22, 0.75), skin, 0, -0.12, 0.38, 'torso');
    for (let i = 0; i < 6; i++) this.part(this.jaw, Kit.cone(0.06, 0.2, 4), bone, -0.3 + i * 0.12, 0.05, 0.68, 'torso');

    // ── Eyes (weak points) ──
    const eye = (parent: THREE.Object3D, x: number, y: number, z: number, r: number, big = false) => {
      const holder = Kit.pivot(parent, x, y, z);
      const m = new THREE.Mesh(Kit.sphere(r, 10, 8), Kit.glow(EYE, 1.5));
      holder.add(m);
      const pupil = new THREE.Mesh(Kit.box(r * 0.5, r * 0.9, r * 0.3), Kit.mat(0x0a0a0a));
      pupil.position.z = r * 0.92;
      pupil.userData.noFlash = true;
      const pp = new THREE.Group();
      pp.add(pupil);
      holder.add(pp);
      const lid = new THREE.Mesh(Kit.sphere(r * 1.1, 8, 6), dark);
      lid.scale.set(1, 1, 0.55);
      lid.visible = false;
      holder.add(lid);
      // Stitched seam across the shut lid.
      const seam = new THREE.Mesh(Kit.box(r * 1.8, r * 0.18, r * 0.2), Kit.mat(0x1a0404));
      seam.position.z = r * 0.55;
      lid.add(seam);
      // Veiny socket rim.
      const rim = new THREE.Mesh(Kit.cyl(r * 1.3, r * 1.3, r * 0.4, 8), dark);
      rim.rotation.x = Math.PI / 2;
      rim.position.z = -r * 0.45;
      holder.add(rim);
      this.fleshMeshes.push(rim);
      // Generous hit sphere: a near miss on a weak point still counts (phones).
      const hit = new THREE.Mesh(Kit.sphere(r * EYE_HIT, 8, 6), this.hitMat);
      hit.userData.flashAs = m;
      m.add(hit);
      const hp = big ? 7 : 4;
      this.eyes.push({ mesh: m, hit, pupil: pp, lid, hp, maxHp: hp, closedT: 0, big });
    };
    eye(this.head, 0, 1.0, 0.98, 0.33, true);
    eye(this.head, -0.5, 0.76, 0.88, 0.2);
    eye(this.head, 0.51, 0.8, 0.86, 0.21);
    eye(this.head, -0.34, 1.42, 0.78, 0.17);
    eye(this.head, 0.38, 1.38, 0.8, 0.18);
    eye(this.chest, -1.55, 0.95, 0.66, 0.27);
    eye(this.chest, 1.6, 0.9, 0.64, 0.26);
    eye(this.torso, 0.95, 1.35, 1.34, 0.24);

    // ── Tentacles ──
    // (The tube is rebuilt every frame in body space, so the map slides along it
    // as it moves — keep it gentle.)
    const tentMat = M(FLESH, 'hide', 1.2, 0.55);
    const mkTent = (side: 1 | -1, upper: boolean) => {
      const tube = new Tube(upper ? 0.5 : 0.42, 0.11, tentMat);
      this.body.add(tube.mesh);
      const baseP = new THREE.Vector3(side * (upper ? 1.75 : 2.0), upper ? 4.3 : 2.5, upper ? -0.35 : 0.3);
      const tip = new THREE.Group();
      this.body.add(tip);
      bakeInto(tip, (g) => {
        const c1 = new THREE.Mesh(Kit.cone(0.13, 0.55, 5), bone);
        c1.position.y = 0.3;
        g.add(c1);
        const c2 = new THREE.Mesh(Kit.cone(0.08, 0.35, 4), bone);
        c2.position.set(0.12, 0.18, 0);
        c2.rotation.z = -0.8;
        g.add(c2);
        const c3 = new THREE.Mesh(Kit.cone(0.08, 0.35, 4), bone);
        c3.position.set(-0.12, 0.18, 0);
        c3.rotation.z = 0.8;
        g.add(c3);
      });
      const pustule = new THREE.Mesh(Kit.ico(0.24, 1), pusMat());
      pustule.position.y = -0.05;
      tip.add(pustule);
      const hit = new THREE.Mesh(Kit.sphere(0.24 * TIP_HIT, 8, 6), this.hitMat);
      hit.userData.flashAs = pustule;
      pustule.add(hit);
      const t: Tentacle = {
        tube,
        side,
        upper,
        base: baseP,
        tip,
        pustule,
        hit,
        mode: 'rest',
        cur: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
        tgt: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
        rate: 4,
        phase: rng.next() * 6,
        dmg: 0,
      };
      this.tents.push(t);
    };
    mkTent(1, true);
    mkTent(-1, true);
    mkTent(1, false);
    mkTent(-1, false);

    // ── Hit zones (order matters: the autoplayer prefers the first 'weak') ──
    for (const t of this.tents) this.hitbox(t.pustule, 'tail');
    this.hitbox(this.heart, 'armor');
    for (const e of this.eyes) this.hitbox(e.hit, 'weak');
    for (const m of this.fleshMeshes) this.hitbox(m, 'torso');
    for (const t of this.tents) this.hitbox(t.tube.mesh, 'tail');
    for (const r of this.ribs) this.hitbox(r, 'armor');
    this.anchor = this.chest;
    this.headAnchor = this.eyes[0].mesh;

    // Start below the pool for the emergence.
    this.body.scale.setScalar(BODY_SCALE);
    this.body.position.y = -6.5;
    for (const t of this.tents) this.poseTentacle(t, 0, true);
  }

  /** Add a flesh mesh and remember it for hit registration. */
  private part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, _zone: 'torso'): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    this.fleshMeshes.push(m);
    return m;
  }

  override onAdded(): void {
    super.onAdded();
    // IV lines from the body up to bags hanging on the balconies.
    const sc = z2Scene(this.world);
    if (sc?.cocoon) {
      // The cocoon splits open.
      sc.cocoon.visible = false;
      sc.cocoon = null;
      this.root.getWorldPosition(_v);
      _v.y += 1.6;
      this.world.fx.blood(_v, UP, { color: 0x6a0808, amount: 3 });
      this.world.fx.gibs(_v, FLESH_RAW, 10, 0.18);
      this.world.fx.gibs(_v, FLESH_DARK, 6, 0.24);
      this.world.audio.play('gib', { volume: 1 });
      this.world.audio.play('bloater_gurgle', { volume: 1, pitch: 0.5 });
      this.world.rig.shake(0.4);
    }
    this.root.updateMatrixWorld(true);
    const anchors: [number, number, number][] = [
      [31, 1.25, -109.6],
      [41.5, 1.25, -132.4],
      [29, 5.75, -132.4],
      [43, 5.75, -109.6],
    ];
    const attach: [number, number, number][] = [
      [-1.1, 5.0, -0.9],
      [1.0, 4.8, -0.9],
      [-0.5, 5.6, -1.0],
      [0.6, 5.4, -0.8],
    ];
    const tube = Kit.mat(0xb8d0c8, { transparent: true, opacity: 0.55 });
    const bagMat = Kit.mat(0xd8e8d8, { transparent: true, opacity: 0.7 });
    anchors.forEach((a, i) => {
      const to = this.root.worldToLocal(new THREE.Vector3(a[0], a[1], a[2]));
      const line = new THREE.Mesh(Kit.cyl(0.035, 0.035, 1, 5), tube);
      line.userData.noFlash = true;
      this.model.add(line);
      const bag = new THREE.Group();
      bag.position.copy(to);
      this.model.add(bag);
      const b1 = new THREE.Mesh(Kit.box(0.3, 0.45, 0.12), bagMat);
      b1.position.y = -0.25;
      bag.add(b1);
      const liquid = new THREE.Mesh(Kit.box(0.26, 0.22, 0.13), Kit.mat(i % 2 ? 0x9a1a1a : 0xc8d840));
      liquid.position.y = -0.36;
      bag.add(liquid);
      this.iv.push({ line, from: new THREE.Vector3(...attach[i]), to, bag });
    });
    // Crawler emergence points on the pool rim, in front of the camera.
    for (const [x, z] of CRAWL_PTS) this.spawnPts.push(this.root.localToWorld(new THREE.Vector3(x, 0, z)));
  }

  // ─── Emergence (entry) ───────────────────────────────────────────────────

  protected override entryUpdate(dt: number): boolean {
    const t = this.stateTime;
    const dur = 3.6;
    const k = clamp(t / dur, 0, 1);
    const e = 1 - Math.pow(1 - k, 3);
    this.body.position.y = -6.5 * (1 - e);
    this.body.rotation.z = Math.sin(t * 7) * 0.06 * (1 - k);
    if (Math.floor((t - dt) * 5) !== Math.floor(t * 5) && k < 0.9) {
      this.root.getWorldPosition(_v);
      _v.x += this.world.rng.spread(2.5);
      _v.z += this.world.rng.spread(2.5);
      _v.y += 0.3;
      this.world.fx.blood(_v, UP, { color: 0x6a0808, amount: 1.6 });
      this.world.rig.shake(0.12);
    }
    if (!this.emergeRoar && t > 1.4) {
      this.emergeRoar = true;
      this.world.audio.play('boss_roar', { volume: 1 });
      this.world.rig.shake(0.5);
      const sc = z2Scene(this.world);
      if (sc) sc.surge = 1.2;
    }
    // Head thrown back in the roar.
    this.roarPose(smoothstep(1.2, 1.8, t) * (1 - smoothstep(2.8, 3.6, t)));
    return t >= dur;
  }

  protected override advanceUpdate(_dt: number) {
    this.setState(ST.idle);
    this.nextAttack = 1.6;
  }

  // ─── Fight ────────────────────────────────────────────────────────────────

  override setState(s: string) {
    // Leaving a custom attack state: drop the ring and any glowing tip.
    if (this.telegraph && s !== this.state) this.telegraph = null;
    if (this.slamTent && s !== ST.slam) this.armTip(this.slamTent, false);
    super.setState(s);
    this.dmgInState = 0;
    this.fired = false;
    this.followUp = false;
  }

  protected override customUpdate(dt: number) {
    this.playerLocal(this.player);
    // Mercy: every heart the player loses (to anything) buys a short breather before the next attack.
    const php = this.world.player.hp;
    if (this.lastPlayerHp >= 0 && php < this.lastPlayerHp) this.breather = BREATHER;
    this.lastPlayerHp = php;
    if (this.breather > 0) this.breather -= dt;
    switch (this.state) {
      case ST.idle:
        this.updateIdle(dt);
        break;
      case ST.slam:
        this.updateSlam(dt);
        break;
      case ST.spit:
        this.updateSpit(dt);
        break;
      case ST.spawn:
        this.updateSpawn(dt);
        break;
      case ST.roar:
        this.updateRoar(dt);
        break;
      case ST.recoil:
        if (this.stateTime > 1.0) this.setState(ST.idle);
        break;
      default:
        this.setState(ST.idle);
    }
    // One threat at a time: while our ring is up, no minion may START a windup
    // (the boss updates before the minions it spawns; World recounts slots each frame).
    if (this.telegraph) this.world.attackSlots = 0;
  }

  /** A minion (pool crawler, balcony walker…) is telegraphing an attack right now. */
  private minionThreat(): boolean {
    for (const e of this.world.enemies()) if (!e.isBoss && e.telegraph && e.state !== 'dying' && !e.removed) return true;
    return false;
  }

  private updateIdle(dt: number) {
    if (this.pendingPhase > 0) {
      this.setState(ST.roar);
      return;
    }
    this.nextAttack -= dt;
    this.growlT -= dt;
    if (this.growlT <= 0) {
      this.growlT = this.world.rng.range(3, 6);
      this.world.audio.play('zombie_groan', { volume: 0.8, pitch: 0.45, vary: 0.1 });
    }
    if (this.nextAttack > 0 || this.breather > 0) return;
    // Don't open a ring on the same beat as a minion's: let its pounce/swipe get a head start.
    if (this.heldFor < 0.6 && this.minionThreat()) {
      this.heldFor += dt;
      return;
    }
    this.heldFor = 0;
    const rng = this.world.rng;
    this.minions = this.minions.filter((m) => !m.removed && m.state !== 'dying');
    // The pool is topped up while crawlers are still out — unless the player is down to their last hearts.
    const cap = this.lowHp() ? CRAWL_MAX - 1 : CRAWL_MAX;
    const canSpawn = this.phase >= 1 && this.minions.length < cap && this.lastAttack !== ST.spawn;
    const r = rng.next();
    let pick: string;
    if (this.phase === 0) pick = r < 0.58 ? ST.slam : ST.spit;
    else if (this.phase === 1) pick = canSpawn && r < 0.4 ? ST.spawn : r < 0.7 ? ST.slam : ST.spit;
    else pick = canSpawn && r < 0.3 ? ST.spawn : r < 0.65 ? ST.slam : ST.spit;
    if (pick === this.lastAttack) {
      this.repeat++;
      if (this.repeat >= 2) {
        pick = pick === ST.slam ? ST.spit : ST.slam;
        this.repeat = 0;
      }
    } else this.repeat = 0;
    // Fair framing: never start a telegraph whose ring would sit off-screen or under the HUD.
    if (pick === ST.spit && !this.inPlayArea(this.mouth, 0.85)) pick = ST.slam;
    if (pick === ST.slam && !this.slamCandidate()) {
      this.nextAttack = 0.25;
      return;
    }
    this.lastAttack = pick;
    if (pick === ST.slam) {
      this.comboLeft = this.phase >= 2 ? 1 : 0;
      this.beginSlam();
    } else if (pick === ST.spit) {
      this.volley = this.phase === 0 ? 1 : this.phase === 1 ? 2 : 3;
      this.spat = 0;
      this.setState(ST.spit);
      this.world.audio.play('bloater_gurgle', { volume: 1, pitch: 0.55 });
    } else {
      // Pick distinct emergence points now, so the pool boils where they'll climb out.
      const n = Math.min(this.phase >= 2 ? 3 : 2, cap - this.minions.length);
      this.spawnSel.length = 0;
      for (let guard = 0; this.spawnSel.length < n && guard < 40; guard++) {
        const i = rng.int(0, this.spawnPts.length - 1);
        if (!this.spawnSel.includes(i)) this.spawnSel.push(i);
      }
      this.setState(ST.spawn);
      this.world.audio.play('boss_roar', { volume: 0.6, pitch: 1.35 });
    }
  }

  private windupFor(kind: 'slam' | 'spit'): number {
    if (kind === 'slam') return [1.7, 1.45, 1.2][this.phase] ?? 1.2;
    return [1.35, 1.2, 1.05][this.phase] ?? 1.05;
  }

  private interruptAt(): number {
    // The quick follow-up slam goes down to a single tip hit (counts double) or two eye hits.
    if (this.followUp && this.state === ST.slam) return 3;
    return [4, 5, 6][this.phase] ?? 6;
  }

  /** A resting tentacle whose tip (the ring anchor) is inside the playable screen area. */
  private slamCandidate(side?: 1 | -1, upper?: boolean): Tentacle | null {
    let any: Tentacle | null = null;
    for (const x of this.tents) {
      if (x.mode !== 'rest' || !this.inPlayArea(x.tip, 0.85)) continue;
      if ((side === undefined || x.side === side) && (upper === undefined || x.upper === upper)) return x;
      any ??= x;
    }
    return any;
  }

  private beginSlam() {
    // Alternate sides; upper tentacles are the most readable.
    const side = (this.lastSlamSide * -1) as 1 | -1;
    this.lastSlamSide = side;
    const upper = this.world.rng.chance(0.7);
    const t = this.slamCandidate(side, upper) ?? this.tents.find((x) => x.mode === 'rest') ?? this.tents[0];
    this.slamTent = t;
    t.dmg = 0;
    this.setState(ST.slam);
    t.mode = 'raise';
    this.armTip(t, true);
    this.world.audio.play('whoosh', { volume: 0.7, pitch: 0.6 });
    this.world.audio.play('crawler_hiss', { volume: 0.8, pitch: 0.5 });
  }

  private armTip(t: Tentacle, on: boolean) {
    const mat = on ? Kit.glow(0xffa030, 1.8) : pusMat();
    if (this.flashObj === t.pustule) this.flashMat = mat;
    else t.pustule.material = mat;
    // (Never re-register hit zones once the boss is dead.)
    if (this.hostile) {
      this.world.shootables.add(t.pustule, this, on ? 'weak' : 'tail');
      if (on) this.world.shootables.add(t.hit, this, 'weak');
      else this.world.shootables.remove(t.hit);
    }
    if (!on && t.mode !== 'limp') t.mode = 'rest';
  }

  private updateSlam(dt: number) {
    const t = this.slamTent;
    if (!t) {
      this.setState(ST.idle);
      return;
    }
    const W = this.windupFor('slam');
    const st = this.stateTime;
    // A continue rewinds boss attacks (stateTime = 0); one that already struck just ends.
    if (this.fired && st < W) {
      this.endAttack();
      return;
    }
    if (st < W) {
      if (!this.telegraph) this.telegraph = { progress: 0, anchor: t.tip, radius: 0.6 };
      this.telegraph.progress = clamp(st / W, 0, 1);
      if (this.dmgInState + t.dmg >= this.interruptAt()) {
        this.interrupt();
        return;
      }
      return;
    }
    if (!this.fired) {
      // Strike.
      this.fired = true;
      this.telegraph = null;
      t.mode = 'slam';
      t.rate = 26;
      this.world.audio.play('whoosh', { volume: 1, pitch: 0.5 });
      return;
    }
    const since = st - W;
    if (since >= 0.13 && t.mode === 'slam') {
      t.mode = 'hold';
      // Impact right in front of the player.
      this.world.hurtPlayer(1, this.title);
      this.world.audio.play('stomp', { volume: 1, pitch: 0.75 });
      this.world.audio.play('hit_world', { volume: 1, pitch: 0.6 });
      this.world.rig.shake(0.65);
      this.world.haptic(90);
      t.tip.getWorldPosition(_v);
      _v.y = this.world.groundAt(_v.x, _v.z) + 0.1;
      this.world.fx.dust(_v, 1.4, 0x6a5e58);
      this.world.fx.debris(_v, 0x7a736a);
      this.world.fx.blood(_v, UP, { color: 0x6a0808, amount: 1.2 });
      this.armTip(t, false);
      t.mode = 'hold';
    }
    if (since > 0.65 && t.mode === 'hold') {
      t.mode = 'rest';
      t.rate = 3;
    }
    if (since > 1.2) {
      if (this.comboLeft > 0 && !this.lowHp() && this.slamCandidate()) {
        this.comboLeft--;
        this.beginSlam();
        // Second slam of a combo winds up a little faster (still > 1 s to react).
        this.followUp = true;
        this.stateTime = W * 0.15;
      } else {
        this.slamTent = null;
        this.setState(ST.idle);
        this.nextAttack = this.idleGap();
      }
    }
  }

  /** Back to idle after an attack (no combo follow-up). */
  private endAttack() {
    this.comboLeft = 0;
    this.setState(ST.idle);
    this.slamTent = null;
    this.nextAttack = this.idleGap();
  }

  private interrupt() {
    const t = this.slamTent;
    if (t) {
      this.armTip(t, false);
      t.mode = 'recoil';
      t.rate = 9;
    }
    this.slamTent = null;
    this.comboLeft = 0;
    this.flinchK = 1;
    this.world.audio.play('boss_roar', { volume: 0.55, pitch: 1.6 });
    this.world.rig.shake(0.2);
    this.setState(ST.recoil);
    this.nextAttack = this.idleGap() * 0.8;
  }

  private idleGap(): number {
    const rng = this.world.rng;
    // (A little slower while the player is on their last hearts.)
    const mercy = this.lowHp() ? 0.5 : 0;
    if (this.phase === 0) return rng.range(1.7, 2.2) + mercy;
    if (this.phase === 1) return rng.range(1.35, 1.8) + mercy;
    return rng.range(1.0, 1.4) + mercy;
  }

  /** Player on their last two hearts. */
  private lowHp(): boolean {
    return this.world.player.hp <= 2;
  }

  private updateSpit(_dt: number) {
    const W = this.windupFor('spit');
    const st = this.stateTime;
    if (this.fired && st < W) {
      this.endAttack();
      return;
    }
    if (st < W) {
      if (!this.telegraph) this.telegraph = { progress: 0, anchor: this.mouth, radius: 0.55 };
      this.telegraph.progress = clamp(st / W, 0, 1);
      if (this.dmgInState >= this.interruptAt()) this.interrupt();
      return;
    }
    this.telegraph = null;
    // Volley: one glob every 0.32 s.
    const elapsed = st - W;
    while (this.spat < this.volley && elapsed >= this.spat * 0.32) {
      this.spitGlob();
      this.fired = true;
      this.spat++;
    }
    if (this.spat >= this.volley && elapsed > (this.volley - 1) * 0.32 + 0.6) {
      this.setState(ST.idle);
      this.nextAttack = this.idleGap();
    }
  }

  private spitGlob() {
    const from = this.mouth.getWorldPosition(new THREE.Vector3());
    const ft = this.phase >= 2 ? 1.55 : 1.8;
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(Kit.ico(0.3, 1), Kit.glow(BILE, 1.5));
    mesh.add(core);
    const skinM = new THREE.Mesh(Kit.ico(0.36, 0), Kit.mat(0x4a6a10, { transparent: true, opacity: 0.55 }));
    mesh.add(skinM);
    // Fan the volley out left / centre / right (alternating start side).
    const n = this.volley;
    const slot = n <= 1 ? 0 : (this.spat / (n - 1)) * 2 - 1;
    const lateral = slot * (n >= 3 ? 0.65 : 0.5) * this.lastSlamSide;
    const glob = new BileGlob(this.world, {
      from,
      mesh,
      flightTime: ft,
      // (A low lob: the mouth is high in the frame, so a big arc would carry the
      // glob — and its ring — up under the boss health bar.)
      arc: 0.3 + Math.abs(slot) * 0.15,
      damage: 1,
      hp: 1,
      points: 150,
      color: BILE,
      size: 0.36,
      spin: 5,
      source: this.title,
      sfxDestroy: 'hit_projectile',
      burst: 'goo',
    }, lateral);
    this.world.add(glob);
    this.world.audio.play('spit', { volume: 1, pitch: 0.6 });
    this.world.fx.blood(from, null, { color: BILE, amount: 0.8 });
    this.flinchK = Math.max(this.flinchK, 0.4);
  }

  private updateSpawn(_dt: number) {
    const st = this.stateTime;
    const rng = this.world.rng;
    // Pool boils at the spawn points, then crawlers haul themselves out.
    if (!this.fired && st < 1.1) {
      if (Math.floor((st - _dt) * 8) !== Math.floor(st * 8)) {
        for (const i of this.spawnSel) {
          const p = this.spawnPts[i];
          this.world.fx.blood(_v.copy(p).setY(p.y + 0.3), UP, { color: 0x6a0808, amount: 0.9 });
        }
      }
    }
    if (!this.fired && st >= 1.1) {
      this.fired = true;
      for (const i of this.spawnSel) {
        if (this.minions.length >= CRAWL_MAX) break;
        const pos = this.spawnPts[i].clone();
        pos.x += rng.spread(0.35);
        pos.z += rng.spread(0.35);
        pos.y = this.world.groundAt(pos.x, pos.z);
        try {
          const e = createEnemy('crawler', this.world, {
            pos,
            frame: 'world',
            entry: 'rise',
            hpMul: 1,
            speedMul: 1.1,
            opts: { variant: 'patient', attackRange: CRAWL_RANGE },
          });
          this.world.add(e);
          this.minions.push(e);
        } catch {
          /* registry missing in some test setups */
        }
      }
      this.world.audio.play('crawler_hiss', { volume: 1, pitch: 0.7 });
    }
    if (st > 2.0) {
      this.setState(ST.idle);
      this.nextAttack = this.idleGap();
    }
  }

  private updateRoar(_dt: number) {
    const st = this.stateTime;
    if (!this.fired) {
      this.fired = true;
      this.roarPhase = this.pendingPhase;
      this.world.audio.play('boss_roar', { volume: 1, pitch: this.pendingPhase >= 2 ? 0.85 : 1 });
      this.world.rig.shake(0.6);
      const sc = z2Scene(this.world);
      if (sc) {
        sc.surge = 1.5;
        sc.fleshGlow = this.pendingPhase >= 2 ? 1 : 0.5;
      }
      if (this.pendingPhase >= 1) this.ribTarget = 1;
      const vp = this.world.viewport;
      this.world.hud.popup(this.pendingPhase >= 2 ? 'IT\'S FRENZIED!' : 'SHOOT THE HEART!', vp.width * 0.5, vp.height * 0.3, 'warning');
    }
    if (st > 0.9 && this.ribTarget > 0 && !this.heartExposed && this.ribOpen > 0.6) {
      this.heartExposed = true;
      this.world.shootables.add(this.heart, this, 'weak');
      this.world.audio.play('wood_break', { volume: 1, pitch: 0.5 });
      this.world.audio.play('gib', { volume: 1 });
      this.chest.getWorldPosition(_v);
      _v.y += 0.2;
      this.world.fx.blood(_v, null, { color: 0x7a0c0c, amount: 2.2 });
      this.world.fx.gibs(_v, 0xd8cdb0, 6, 0.1);
    }
    if (st > 2.4) {
      if (this.pendingPhase === this.roarPhase) this.pendingPhase = 0;
      this.setState(ST.idle);
      this.nextAttack = 0.8;
    }
  }

  protected override onPhase(phase: number): void {
    this.pendingPhase = phase;
    // Cancel whatever was winding up — the roar takes over.
    if (this.state === ST.slam || this.state === ST.spit) {
      if (this.slamTent) {
        this.armTip(this.slamTent, false);
        this.slamTent = null;
      }
      this.setState(ST.roar);
    }
  }

  protected override damageMultiplier(hit: ShotHit): number {
    if (hit.part === 'weak') {
      if (hit.object === this.heart) return 1.5;
      for (const t of this.tents) if (hit.object === t.pustule || hit.object === t.hit) return 0.75;
      return 1;
    }
    if (hit.part === 'tail') return 0.5;
    return 0.3;
  }

  protected override onDamaged(hit: ShotHit, amount: number): void {
    super.onDamaged(hit, amount);
    this.flinchK = Math.min(1, this.flinchK + amount * 0.12);
    if (hit.part === 'weak' || hit.part === 'head') this.dmgInState += amount;
    else this.dmgInState += amount * 0.4;
    for (const t of this.tents) {
      if ((hit.object === t.pustule || hit.object === t.hit) && t === this.slamTent) t.dmg += amount;
    }
    // Eyes burst.
    for (const e of this.eyes) {
      if (hit.object !== e.hit || e.closedT > 0) continue;
      e.hp -= amount;
      if (e.hp <= 0) this.burstEye(e);
    }
    if (hit.part === 'weak') this.world.fx.blood(hit.point, hit.dir, { color: hit.object === this.heart ? 0xb01010 : 0xd8c040, amount: 1.1 });
  }

  protected override onArmorHit(_hit: ShotHit): void {
    this.ribRattle = 1;
  }

  private burstEye(e: Eye) {
    // Shut for ~5 s (long enough to force a target switch, short enough to keep the fight moving).
    e.closedT = 4.6 + this.world.rng.next() * 1.4;
    e.mesh.visible = false;
    e.lid.visible = true;
    e.pupil.visible = false;
    e.hp = e.maxHp;
    e.mesh.getWorldPosition(_v);
    this.world.fx.blood(_v, null, { color: 0xe8d040, amount: 2 });
    this.world.fx.gibs(_v, 0xe8e0a0, 4, 0.07);
    this.world.audio.play('gib', { volume: 0.9 });
    this.world.audio.play('boss_roar', { volume: 0.45, pitch: 1.8 });
    const pts = this.world.score.add(250);
    const sp = this.screenPos(e.mesh);
    if (sp) this.world.hud.popup(`EYE +${pts}`, sp.x, sp.y - 30, 'headshot');
    this.flinchK = 1;
    if (this.state === ST.slam || this.state === ST.spit) this.interrupt();
  }

  // ─── Flash only the part that was hit (a full-body strobe is too much) ───

  override flash(critical = false) {
    // At most ~3 flashes a second, however fast the SMG hits.
    if (this.age - this.lastFlash < 0.34) return;
    this.lastFlash = this.age;
    const raw = this.lastHit?.object as THREE.Mesh | undefined;
    // Hit spheres flash the eye / pustule they stand in for.
    const obj = (raw?.userData.flashAs as THREE.Mesh | undefined) ?? raw;
    const target = obj && obj.isMesh && obj.userData.noFlash !== true ? obj : this.headMesh;
    if (this.flashObj && this.flashMat) this.flashObj.material = this.flashMat;
    this.flashObj = target;
    this.flashMat = target.material as THREE.Material;
    target.material = critical ? Kit.glow(0xff3020, 1.2) : Kit.glow(0xffffff, 1.2);
    this.flashT = 0.06;
  }

  private endFlash() {
    if (this.flashObj && this.flashMat) this.flashObj.material = this.flashMat;
    this.flashObj = null;
    this.flashMat = null;
  }

  // ─── Animation ────────────────────────────────────────────────────────────

  /** Player ground position in the boss BODY frame (tentacle space). */
  private playerLocal(out: THREE.Vector3) {
    this.playerPos(out);
    this.root.worldToLocal(out);
    return out.sub(this.body.position).divideScalar(BODY_SCALE);
  }

  private roarPose(k: number) {
    if (k <= 0) return;
    this.head.rotation.x -= 0.55 * k;
    this.jaw.rotation.x += 0.75 * k;
    this.chest.rotation.x -= 0.18 * k;
    this.mouthGlow.scale.setScalar(1 + k * 0.6);
  }

  protected override animate(dt: number) {
    const t = this.age;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.endFlash();
    }
    this.flinchK = Math.max(0, this.flinchK - dt * 2.2);
    this.ribRattle = Math.max(0, this.ribRattle - dt * 5);
    const dying = this.state === 'dying';
    const frenzy = this.phase >= 2 ? 1 : 0;
    this.playerLocal(this.player);
    if (!dying) this.animatePose(t, frenzy);
    this.animateParts(dt, t, dying);
  }

  private animatePose(t: number, frenzy: number) {
    // Breathing + base pose.
    const br = Math.sin(t * (1.6 + frenzy * 1.2));
    this.torso.scale.set(1 + br * 0.03, 1 + br * 0.02, 1 + br * 0.03);
    this.torso.rotation.set(-0.05 + br * 0.02, Math.sin(t * 0.4) * 0.08, Math.sin(t * 0.55) * 0.04);
    this.chest.rotation.set(br * 0.03, Math.sin(t * 0.5 + 1) * 0.06, 0);
    this.head.rotation.set(0.12 + Math.sin(t * 0.8) * 0.05, Math.sin(t * 0.6) * 0.18, Math.sin(t * 0.37) * 0.08);
    this.jaw.rotation.x = 0.12 + Math.max(0, Math.sin(t * 2.1)) * 0.08;
    this.mouthGlow.scale.setScalar(1);
    // Look toward the player.
    const yawTo = Math.atan2(this.player.x, this.player.z);
    this.head.rotation.y += clamp(yawTo, -0.5, 0.5) * 0.6;

    // State poses.
    const st = this.stateTime;
    if (this.state === ST.spit) {
      const W = this.windupFor('spit');
      const k = smoothstep(0, W * 0.7, st) * (1 - smoothstep(W + 0.1, W + 0.6, st));
      this.head.rotation.x -= 0.45 * k;
      this.jaw.rotation.x += 0.55 * k + (st > W ? 0.3 * Math.sin((st - W) * 20) : 0);
      this.chest.rotation.x -= 0.12 * k;
      this.mouthGlow.scale.setScalar(1 + k * 0.9);
    } else if (this.state === ST.slam && this.slamTent) {
      const W = this.windupFor('slam');
      const k = st < W ? smoothstep(0, 0.5, st) : 1 - smoothstep(W + 0.2, W + 1.0, st);
      this.torso.rotation.z += -this.slamTent.side * 0.12 * k;
      this.chest.rotation.y += this.slamTent.side * 0.15 * k;
      this.jaw.rotation.x += 0.25 * k;
    } else if (this.state === ST.roar || this.state === ST.spawn) {
      const k = smoothstep(0, 0.4, st) * (1 - smoothstep(1.9, 2.4, st));
      this.roarPose(k);
      this.body.position.x = Math.sin(t * 40) * 0.04 * k;
    } else if (this.state === ST.recoil) {
      const k = 1 - smoothstep(0.2, 1.0, st);
      this.head.rotation.x -= 0.5 * k;
      this.chest.rotation.x -= 0.2 * k;
      this.jaw.rotation.x += 0.4 * k;
    }
    // Hit flinch.
    const f = this.flinchK * this.flinchK;
    this.head.rotation.x -= 0.25 * f;
    this.head.rotation.z += Math.sin(t * 31) * 0.08 * f;
    this.chest.rotation.x -= 0.08 * f;

  }

  private animateParts(dt: number, t: number, dying: boolean) {
    // Rib cage.
    if (!dying) {
      this.ribOpen = damp(this.ribOpen, this.ribTarget, 2.2, dt);
      const ro = this.ribOpen;
      const rattle = this.ribRattle * Math.sin(t * 70) * 0.05;
      this.ribL.rotation.y = ro * 1.75 + rattle + (ro > 0.05 ? Math.sin(t * 2.4) * 0.05 : 0);
      this.ribR.rotation.y = -ro * 1.75 - rattle - (ro > 0.05 ? Math.sin(t * 2.4 + 1) * 0.05 : 0);
    }

    // Heart beat (faster when hurt).
    const rate = 1.3 + (1 - this.hp / this.maxHp) * 2.2;
    const beat = Math.pow(Math.max(0, Math.sin(t * rate * Math.PI * 2)), 8);
    if (!this.heartPopped) this.heart.scale.setScalar(1 + beat * 0.22);

    // Eyes: track the camera, reopen after a while.
    this.world.camera.getWorldPosition(_w);
    for (const e of this.eyes) {
      if (e.closedT > 0 && !dying) {
        e.closedT -= dt;
        if (e.closedT <= 0) {
          e.mesh.visible = true;
          e.lid.visible = false;
          e.pupil.visible = true;
        }
      }
      if (e.pupil.visible && e.pupil.parent) {
        e.pupil.parent.worldToLocal(_v.copy(_w));
        _v.normalize();
        e.pupil.rotation.set(-_v.y * 0.5, _v.x * 0.6, 0);
      }
    }

    // Tentacles.
    for (const tn of this.tents) this.poseTentacle(tn, dt, false);

    // IV lines.
    for (const l of this.iv) {
      _v.copy(l.from).multiplyScalar(BODY_SCALE).add(this.body.position);
      _t.subVectors(l.to, _v);
      const len = _t.length();
      l.line.position.copy(_v).addScaledVector(_t, 0.5);
      l.line.scale.set(1, len, 1);
      l.line.quaternion.setFromUnitVectors(UP, _t.normalize());
      l.line.visible = !dying || this.stateTime < 1.2;
    }

    // Pool: veins pulse, bubbles.
    const glowOn = !dying || this.stateTime < 3.8;
    for (let i = 0; i < this.poolGlow.length; i++) this.poolGlow[i].visible = glowOn && Math.sin(t * 2.6 + i * 0.7) > -0.7;
    const boil = this.state === ST.spawn ? 3 : 1;
    for (const b of this.bubbles) {
      b.t -= dt * boil;
      if (b.t <= 0 && !dying) {
        b.t = this.world.rng.range(0.6, 2.2);
        b.life = 0.0001;
        const a = this.world.rng.next() * Math.PI * 2;
        const r = this.world.rng.range(2.4, 4.4);
        b.mesh.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
        b.mesh.visible = true;
      }
      if (b.life > 0) {
        b.life += dt * 1.6;
        const s = b.life < 1 ? b.life : 0;
        b.mesh.scale.set(s * 1.2, s * 0.8, s * 1.2);
        if (b.life >= 1) {
          b.life = 0;
          b.mesh.visible = false;
        }
      }
    }
  }

  /** Compute target control points for a tentacle and smooth toward them. */
  private poseTentacle(tn: Tentacle, dt: number, snap: boolean) {
    const t = this.age + tn.phase;
    const s = tn.side;
    const B0 = tn.base;
    const c1 = tn.tgt[0];
    const c2 = tn.tgt[1];
    const tip = tn.tgt[2];
    const sway = Math.sin(t * 0.9) * 0.5;
    const sway2 = Math.cos(t * 1.3) * 0.4;
    const dying = this.state === 'dying';
    switch (dying ? 'limp' : tn.mode) {
      case 'rest': {
        if (tn.upper) {
          tip.set(s * (3.7 + sway * 0.6), 5.4 + sway2, 1.4 + Math.sin(t * 0.7) * 0.8);
          c1.set(B0.x + s * 1.6, B0.y + 1.2, B0.z - 0.4);
          c2.set(s * (3.3 + sway2), 6.6 + sway, 0.6 + sway * 0.5);
        } else {
          tip.set(s * (4.2 + sway2 * 0.5), 0.7 + Math.max(0, sway) * 0.6, 2.6 + sway * 0.8);
          c1.set(B0.x + s * 1.5, B0.y + 0.4, B0.z + 0.6);
          c2.set(s * (4.4 + sway), 1.9 + sway2 * 0.4, 1.4);
        }
        tn.rate = 3;
        break;
      }
      case 'raise': {
        // Reared up toward the player, tip curled back, trembling.
        const tr = Math.sin(this.age * 38) * 0.06;
        const hy = tn.upper ? 4.5 : 3.5;
        tip.set(s * (tn.upper ? 3.1 : 3.6) + tr, hy + tr, 3.2);
        c1.set(B0.x + s * 1.2, B0.y + 2.4, B0.z - 0.2);
        c2.set(s * 3.6, hy + 3.0, 1.0);
        tn.rate = 5;
        break;
      }
      case 'slam':
      case 'hold': {
        const P = this.player;
        const fz = Math.max(3, P.z - 2.1);
        tip.set(P.x * 0.9 + s * 0.85, 0.15, fz);
        c1.set(B0.x + s * 0.8, B0.y + 3.0, B0.z + 1.2);
        c2.set(P.x * 0.5 + s * 1.4, 3.0, fz * 0.55);
        if (tn.mode === 'slam') tn.rate = 26;
        else tn.rate = 10;
        break;
      }
      case 'recoil': {
        tip.set(s * 4.6, 6.2, -0.6);
        c1.set(B0.x + s * 1.6, B0.y + 1.6, B0.z - 0.6);
        c2.set(s * 4.4, 7.2, -1.0);
        tn.rate = 9;
        if (this.state !== ST.recoil) tn.mode = 'rest';
        break;
      }
      case 'limp': {
        const k = clamp(this.stateTime / 1.2, 0, 1);
        tip.set(s * (4.6 + (tn.upper ? 0.6 : 0)), 0.25, tn.upper ? 3.4 : 1.8);
        c1.set(B0.x + s * 1.2, B0.y * (1 - k * 0.5), B0.z + 0.6);
        c2.set(s * 4.0, 0.6 + (1 - k) * 2, 2.4);
        tn.rate = 3 + k * 4;
        break;
      }
      default:
        break;
    }
    // Spread wide in the roar.
    if (!dying && (this.state === ST.roar || (this.state === 'entry' && this.stateTime > 1.2)) && tn.mode === 'rest') {
      const k = this.state === ST.roar ? smoothstep(0, 0.5, this.stateTime) * (1 - smoothstep(1.8, 2.4, this.stateTime)) : 1 - smoothstep(2.8, 3.6, this.stateTime);
      tip.x += s * 1.5 * k;
      tip.y += (tn.upper ? 2.0 : 1.4) * k;
      c2.y += 1.5 * k;
    }
    const kk = snap ? 1 : 1 - Math.exp(-tn.rate * dt);
    for (let i = 0; i < 3; i++) tn.cur[i].lerp(tn.tgt[i], kk);
    const tube = tn.tube;
    tube.P[0].copy(B0);
    tube.P[1].copy(tn.cur[0]);
    tube.P[2].copy(tn.cur[1]);
    tube.P[3].copy(tn.cur[2]);
    const armed = this.slamTent === tn && this.state === ST.slam;
    tube.update(this.age, armed ? 2 : 1, dying ? 0.9 : 1);
    tn.tip.position.copy(tn.cur[2]);
    tn.tip.quaternion.setFromUnitVectors(UP, tube.tipDir);
    if (armed && !this.fired) {
      const pulse = 1 + Math.sin(this.age * 18) * 0.15;
      tn.pustule.scale.setScalar(1.25 * pulse);
    } else tn.pustule.scale.setScalar(1);
  }

  // ─── Death ────────────────────────────────────────────────────────────────

  protected override onDeath(): void {
    this.telegraph = null;
    this.endFlash();
    for (const tn of this.tents) tn.mode = 'limp';
    this.world.audio.play('boss_roar', { volume: 1, pitch: 0.7 });
    const sc = z2Scene(this.world);
    if (sc) sc.surge = 2;
  }

  protected override updateDeath(dt: number): boolean {
    const t = this.stateTime;
    const rng = this.world.rng;
    const D = this.deathDuration;
    // Convulsions.
    const shake = (1 - smoothstep(2.5, D, t)) * 0.08;
    this.body.rotation.z = Math.sin(t * 23) * shake;
    this.body.rotation.x = Math.sin(t * 17) * shake * 0.6;
    this.head.rotation.x = -0.5 * smoothstep(0, 0.6, t) + 0.9 * smoothstep(1.8, 3.2, t);
    this.jaw.rotation.x = 0.8;
    // Flesh bursts all over.
    if (Math.floor((t - dt) * 7) !== Math.floor(t * 7) && t < D - 0.9) {
      if (!this.burstSrc.length) this.burstSrc.push(this.chest, this.head, this.torso, ...this.eyes.map((e) => e.mesh));
      const src = rng.pick(this.burstSrc);
      src.getWorldPosition(_v);
      _v.x += rng.spread(1.2);
      _v.y += rng.spread(1.0);
      _v.z += rng.spread(1.2);
      this.world.fx.blood(_v, null, { color: rng.pick([0x7a0c0c, 0x5a0808, 0xd8c040]), amount: 2 });
      this.world.fx.gibs(_v, rng.pick([FLESH, FLESH_RAW, BONE]), 4, 0.14);
      if (rng.chance(0.5)) this.world.audio.play('gib', { volume: 0.8, vary: 0.2 });
      this.world.rig.shake(0.18);
      this.deathBursts++;
    }
    // Eyes go dark one by one.
    const dark = Math.floor(clamp(t / 2.4, 0, 1) * this.eyes.length);
    for (let i = 0; i < dark; i++) {
      const e = this.eyes[i];
      if (e.mesh.material !== Kit.mat(0x2a2010)) e.mesh.material = Kit.mat(0x2a2010);
      e.mesh.visible = true;
      e.lid.visible = false;
    }
    // The heart ruptures.
    if (!this.heartPopped && t > 1.0) {
      this.heartPopped = true;
      this.heart.getWorldPosition(_v);
      this.world.fx.explosion(_v, 0.9);
      this.world.fx.blood(_v, null, { color: 0xb01010, amount: 2.5 });
      this.world.audio.play('explosion', { volume: 0.8, pitch: 0.7 });
      this.heart.visible = false;
      this.ribTarget = 1;
    }
    if (this.heartPopped) {
      this.ribOpen = damp(this.ribOpen, 1.3, 3, dt);
      this.ribL.rotation.y = this.ribOpen * 1.75;
      this.ribR.rotation.y = -this.ribOpen * 1.75;
    }
    // Collapse into the pool.
    if (t > 1.8) this.body.position.y -= dt * (0.6 + (t - 1.8) * 1.4);
    if (t > D - 0.9 && this.deathBursts >= 0) {
      this.deathBursts = -999;
      this.root.getWorldPosition(_v);
      _v.y += 1.2;
      this.world.fx.explosion(_v, 1.4);
      this.world.fx.blood(_v, UP, { color: 0x6a0808, amount: 3 });
      this.world.fx.gibs(_v, FLESH_RAW, 10, 0.2);
      this.world.audio.play('explosion', { volume: 1, pitch: 0.6 });
      this.world.audio.play('gib', { volume: 1 });
      this.world.rig.shake(0.7);
    }
    return t > D;
  }
}

registerEnemy('patient_zero', (w, s) => new PatientZero(w, s));

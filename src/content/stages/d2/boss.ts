import * as THREE from 'three';
import { Boss } from '../../../gameplay/Boss';
import { Pickup } from '../../../gameplay/Pickup';
import type { Projectile } from '../../../gameplay/Projectile';
import { ndcInPlayArea, type EnemySpawn } from '../../../gameplay/Enemy';
import type { ShotHit } from '../../../gameplay/Entity';
import type { World } from '../../../gameplay/World';
import { createEnemy, registerEnemy } from '../../registry';
import { Kit } from '../../kit/ModelKit';
import { M, SURF, Sculpt, buildTheropod, dgeo, poseTheroLeg, ARM_REST, type Palette, type TheroRig, type TheroSpec } from '../../enemies/dinoKit';
import { angleDelta, clamp, damp, lerp, TAU } from '../../../core/math';
import { HALL } from './containment';
import { labs } from './env';

/**
 * SPECIMEN X — an escaped engineered hybrid: a huge albino raptor (~6 m) with
 * a crest of dorsal quills, scythe claws and glowing blue bioluminescent
 * stripes. It fights in the holding hall, using the four pillars as cover.
 *
 *   weak points : glowing eyes (+ halo) and the bioluminescent stripes
 *                 (head crest, neck, flanks, tail base) — they keep glowing
 *                 even when it fades into the dark.
 *   armour      : dorsal quills (spark, no damage).
 *   attacks     : POUNCE       crouch + wiggle, leaps at the camera     (ring on the chest)
 *                 TAIL WHIP    sidles up, turns, whips the tail          (ring on the tail base)
 *                 QUILL VOLLEY rattles the quills, fires shootable darts (projectiles)
 *                 FADE         (phase 2+) cloaks, slips behind a pillar, ambushes with a
 *                              short-fuse pounce from close range         (ring on the chest)
 *   Enough HITS during a wind-up (or mid-leap) knock it down: free hits
 *   (3–4 stop a pounce, 2–3 a tail whip; glowing weak points count double).
 *   Fairness: attacks only start framed in the play area, never on top of two
 *   other live warnings, the pack arrives in waves; last-heart grace.
 *   phase 2 : roar, summons a raptor pack.  phase 3 : enraged — faster
 *   pounces, double pounces, compys.  death: staggers back and crashes
 *   through the specimen tank glass.
 */

type XState =
  | 'intro'
  | 'stalk'
  | 'watch'
  | 'pounceWind'
  | 'pounce'
  | 'retreat'
  | 'tailMove'
  | 'tailWind'
  | 'tailWhip'
  | 'quillWind'
  | 'quillFire'
  | 'fade'
  | 'hide'
  | 'ambush'
  | 'roar'
  | 'stun'
  | 'getUp';

const S = 1.8;

const PAL: Palette = {
  key: 'albino',
  base: 0xd6d0c2,
  back: 0xa89f92,
  belly: 0xf2eee4,
  // Warm taupe tiger bands: the only blue on the beast is the glowing weak points.
  stripe: 0x9a8a7a,
  accent: 0xe8e2d4,
  accent2: 0x7a746c,
  claw: 0x24262c,
  teeth: 0xf4f0e4,
  mouth: 0x6a1a2a,
  eye: 0x60e8ff,
};

const SPEC: TheroSpec = {
  key: 'specx',
  pal: PAL,
  hipGap: 0.17,
  thigh: 0.5,
  shin: 0.56,
  meta: 0.32,
  toe: 0.22,
  legR: 1.25,
  footH: 0.05,
  hips: [0.26, 0.32, 0.42],
  torso: { len: 0.92, r0: [0.27, 0.34], r1: [0.22, 0.29], rise: 0.14 },
  neck: { lens: [0.36, 0.3], r0: [0.14, 0.16], r1: [0.1, 0.12], rest: [-0.95, 0.5] },
  headRest: 0.5,
  skull: { len: 0.26, r: [0.13, 0.145] },
  snout: { len: 0.4, r1: [0.055, 0.06], drop: 0.03 },
  jaw: { len: 0.6, r0: [0.095, 0.055], r1: [0.042, 0.03] },
  tail: { lens: [0.46, 0.44, 0.4, 0.38, 0.34], r0: [0.2, 0.24], taper: 0.7, rest: [-0.04, -0.02, 0, 0.02, 0.03] },
  arm: { upper: 0.3, fore: 0.32, r: 0.06, claw: 0.14 },
  stripes: 2.1,
  teeth: 10,
  sickle: true,
  quills: 1.4,
  eyeSize: 0.04,
  texDensity: 1.2,
};

const STRIPE = new THREE.Color(0x5ae0ff);
const STRIPE_RAGE = new THREE.Color(0xc070ff);
const EYE = new THREE.Color(0x8af0ff);
const EYE_RAGE = new THREE.Color(0xff4060);

/** Dash / ring targets keep the boss's hips this far from pillar centres (body + tail clearance). */
const PILLAR_CLEAR = 3.5;
/** Where a pounce lands, in front of the camera (keeps head + ring in the middle of the view). */
const POUNCE_STOP = 3.7;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const _u = new THREE.Vector3();

interface Flash {
  mesh: THREE.Mesh;
  t: number;
}

export class SpecimenX extends Boss {
  override title = 'SPECIMEN X';
  override phases = [0.66, 0.33];

  private r!: TheroRig;
  private bodyMeshes: THREE.Mesh[] = [];
  private quillPivots: THREE.Group[] = [];
  private weakMeshes: THREE.Mesh[] = [];
  /** Tail-whip ring anchor: on the glowing stripes at the tail base. */
  private tailRing!: THREE.Object3D;
  private focus = new THREE.Object3D();
  private skinMatRef!: THREE.Material;
  private cloakMat!: THREE.MeshLambertMaterial;
  private stripeMat!: THREE.MeshBasicMaterial;
  private eyeMat!: THREE.MeshBasicMaterial;
  private haloMat!: THREE.MeshBasicMaterial;
  private dartHaloMat!: THREE.MeshBasicMaterial;
  private flashMat!: THREE.Material;
  private flashes: Flash[] = [];

  // Pose.
  private gaitPhase = 0;
  private runAmt = 0;
  private crouch = 0;
  private air = 0;
  private jawOpen = 0;
  private dip = 0;
  private rear = 0;
  private tailLift = 0;
  private recoil = 0;
  private armReach = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private tailWhipAmt = 0;
  private quillRaise = 0;
  private roll = 0;
  private flinch = 0;
  private flinchSide = 1;
  private lift = 0;
  private wiggle = 0;
  private tg = { crouch: 0, air: 0, jaw: 0.08, dip: 0, rear: 0, tail: 0, recoil: 0, arm: 0, whip: 0, quill: 0, roll: 0 };
  private prevPos = new THREE.Vector3();
  private speedNow = 0;
  private stepPhase = 0;

  // Fight.
  private cloak = 0;
  private cloakTarget = 0;
  private cloaked = false;
  private target = new THREE.Vector3();
  private via: THREE.Vector3 | null = null;
  private cooldown = 1.5;
  private winding = false;
  private interruptDmg = 0;
  private lastAttack = '';
  private chain = 0;
  private pendingRoar = -1;
  private roarsDone = new Set<number>();
  private roaringFor = 0;
  private enraged = false;
  private minionT = 8;
  private minionsCalled = 0;
  private volley = 0;
  private volleyT = 0;
  /** Darts of the current volley (the beast holds still until they resolve, so the view does too). */
  private darts: Projectile[] = [];
  private windTime = 1.4;
  private leapTime = 0.5;
  private pFrom = new THREE.Vector3();
  private pTo = new THREE.Vector3();
  private sideSign = 1;
  private entering = true;
  private hissT = 0;
  private shortFuse = false;
  private breathT = 0;
  /** Seconds spent holding an attack back while minion warnings are live. */
  private holdOff = 0;
  /** Staggered reinforcements (the pack arrives in waves, not all at once). */
  private reinforcements: { t: number; type: string; n: number; variant?: string }[] = [];

  // Death.
  private deathFrom = new THREE.Vector3();
  private deathTo = new THREE.Vector3();
  private deathPane = -1;
  private crashed = false;
  private deathYaw = 0;
  private deathReach = 1.6;
  /** Seconds of the rearing scream before the fall / final leap. */
  private deathRear = 0.8;
  /** stateTime when the body hit the floor (collapse) — -1 until then. */
  private fellAt = -1;
  private deathSide = 1;
  private deathRoll0 = 0;
  private deathLift = 0;
  private downAlready = false;

  constructor(world: World, spawn: EnemySpawn) {
    super(world, spawn);
  }

  protected override configure(): void {
    this.name = 'specimen_x';
    // `opts.hp` lets a stage (or a quick test) tune the fight length.
    this.maxHp = typeof this.spawn.opts.hp === 'number' ? this.spawn.opts.hp : 160;
    this.speed = 9;
    this.points = 25000;
    this.sfxHit = 'hit_flesh';
    this.sfxDie = null;
    this.bloodColor = 0x5a0a1a;
    this.telegraphRadius = 0.9;
    this.knockback = 0;
    this.deathDuration = 5.5;
  }

  // ─── Model ────────────────────────────────────────────────────────────────

  protected override build(): void {
    this.r = buildTheropod(this.model, SPEC);
    this.model.scale.setScalar(S);
    const r = this.r;
    this.stripeMat = Kit.track(new THREE.MeshBasicMaterial({ color: STRIPE.clone(), toneMapped: false, fog: false }));
    this.eyeMat = Kit.track(new THREE.MeshBasicMaterial({ color: EYE.clone().multiplyScalar(1.6), toneMapped: false, fog: false }));
    this.haloMat = Kit.track(new THREE.MeshBasicMaterial({ color: 0x40c8ff, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false, fog: false }));
    this.flashMat = Kit.glow(0xffffff, 1.2);
    this.dartHaloMat = Kit.track(new THREE.MeshBasicMaterial({ color: 0x60d8ff, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, fog: false }));
    this.skinMatRef = r.torso.material as THREE.Material;
    // Cloak: a private copy of the shared skin material (same shader hook, so the
    // pixel scales, painted stripes and rim light survive) whose colour fades
    // the hide into the dark while the bioluminescent stripes keep glowing.
    const skin = r.torso.material as THREE.MeshLambertMaterial;
    const cloak = skin.clone();
    cloak.onBeforeCompile = skin.onBeforeCompile;
    cloak.customProgramCacheKey = skin.customProgramCacheKey;
    cloak.userData.shared = false;
    this.cloakMat = Kit.track(cloak);

    // Eyes first: the autoplayer (and players) aim for these.
    const sk = SPEC.skull;
    const eyeZ = sk.len * 0.42;
    for (const sx of [1, -1]) {
      const eye = Kit.add(r.head, Kit.box(0.06, 0.045, 0.09), this.eyeMat, sx * sk.r[0] * 0.92, sk.r[1] * 0.34, eyeZ, 0, sx * 0.35, 0);
      const halo = Kit.add(r.head, Kit.sphere(0.11, 8, 6), this.haloMat, sx * sk.r[0] * 0.95, sk.r[1] * 0.34, eyeZ, 0, 0, 0, 0.9, 0.75, 1.3);
      halo.renderOrder = 3;
      this.hitbox(eye, 'weak');
      this.hitbox(halo, 'weak');
      this.weakMeshes.push(eye, halo);
    }

    // Bioluminescent stripes: one mesh per side per body part, so each one's
    // centre sits on the surface it glows on.
    const stripeBand = (key: string, side: number, pts: { z: number; rx: number; ry: number; y: number }[], a0: number, a1: number, w: number) =>
      dgeo(`specx|stripe|${key}|${side}`, () => {
        const sc = new Sculpt(0, 5);
        for (const p of pts) {
          const n = 5;
          for (let i = 0; i < n; i++) {
            const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
            const x = side * Math.cos(a) * p.rx * 1.03;
            const y = p.y + Math.sin(a) * p.ry * 1.03;
            const len = ((a1 - a0) / n) * Math.hypot(p.rx, p.ry) * 0.75;
            sc.box(0.02, len * 1.25, w, 0xffffff, M(x, y, p.z, 0, 0, side * a));
          }
        }
        return sc.build();
      });
    const T = SPEC.torso;
    const torsoPts = [0.18, 0.4, 0.62, 0.82].map((t) => ({
      z: -0.02 + t * T.len,
      rx: lerp(T.r0[0], T.r1[0], t) * 1.05,
      ry: lerp(T.r0[1], T.r1[1], t) * 1.05,
      y: T.rise * t * t,
    }));
    for (const side of [1, -1]) {
      const m = Kit.add(r.chest, stripeBand('torso', side, torsoPts, -0.5, 0.9, 0.07), this.stripeMat);
      this.hitbox(m, 'weak');
      this.weakMeshes.push(m);
    }
    const neckPts = [0.1, 0.45].map((t) => ({ z: t * SPEC.neck.lens[0], rx: lerp(SPEC.neck.r0[0], SPEC.neck.r1[0], 0.25) * 1.05, ry: lerp(SPEC.neck.r0[1], SPEC.neck.r1[1], 0.25) * 1.05, y: 0 }));
    for (const side of [1, -1]) {
      const m = Kit.add(r.neck[0], stripeBand('neck', side, neckPts, -0.4, 1.0, 0.06), this.stripeMat);
      this.hitbox(m, 'weak');
      this.weakMeshes.push(m);
    }
    const tr = SPEC.tail.r0;
    const tailPts = [0.15, 0.5, 0.85].map((t) => ({ z: -t * SPEC.tail.lens[0], rx: tr[0] * (1 - t * 0.3), ry: tr[1] * (1 - t * 0.3), y: 0 }));
    for (const side of [1, -1]) {
      const m = Kit.add(r.tail[0], stripeBand('tail', side, tailPts, -0.3, 1.1, 0.06), this.stripeMat);
      this.hitbox(m, 'weak');
      this.weakMeshes.push(m);
    }
    // Glowing crest line down the skull.
    {
      const g = dgeo('specx|crest', () => {
        const sc = new Sculpt(0, 6);
        for (let i = 0; i < 5; i++) sc.box(0.035, 0.03, 0.07, 0xffffff, M(0, sk.r[1] * 0.98 - i * 0.004, sk.len * 0.7 - i * 0.075, 0.1, 0, 0));
        return sc.build();
      });
      const m = Kit.add(r.head, g, this.stripeMat);
      this.hitbox(m, 'weak');
      this.weakMeshes.push(m);
    }

    // Dorsal quills (armour) on neck, chest, hips and tail base.
    const quillGeo = (key: string, n: number, len: number, spread: number, z0: number, z1: number, y: number) =>
      dgeo(`specx|quills|${key}`, () => {
        // Keratin quills: fibrous streaks (horn surface), not scales.
        const sc = new Sculpt(0.05, 9).as(SURF.horn);
        for (let i = 0; i < n; i++) {
          const t = n > 1 ? i / (n - 1) : 0;
          const z = lerp(z0, z1, t);
          const l = len * (0.75 + 0.35 * Math.sin(Math.PI * t));
          for (const side of [1, -1]) {
            const paint = (_x: number, yy: number) => (yy > y + l * 0.62 ? PAL.accent2 : PAL.accent);
            sc.cone(0.022, l, paint, M(side * spread, y, z, -1.05, 0, side * 0.3), 4);
          }
          sc.cone(0.026, l * 1.1, (_x: number, yy: number) => (yy > y + l * 0.7 ? PAL.accent2 : PAL.accent), M(0, y + 0.01, z - 0.02, -1.15, 0, 0), 4);
        }
        return sc.build();
      });
    const qp = (parent: THREE.Object3D, geo: THREE.BufferGeometry) => {
      const p = Kit.pivot(parent, 0, 0, 0, 'quills');
      const m = Kit.add(p, geo, this.skinMatRef);
      this.hitbox(m, 'armor');
      this.bodyMeshes.push(m);
      this.quillPivots.push(p);
    };
    qp(r.neck[0], quillGeo('neck', 3, 0.22, 0.05, 0.05, 0.3, SPEC.neck.r0[1] * 0.8));
    qp(r.chest, quillGeo('chest', 6, 0.42, 0.09, T.len - 0.05, 0.02, T.r0[1] * 0.92));
    qp(r.body, quillGeo('hips', 3, 0.36, 0.08, 0.15, -0.3, SPEC.hips[1] * 0.92));
    qp(r.tail[0], quillGeo('tail', 3, 0.26, 0.06, -0.05, -0.38, SPEC.tail.r0[1] * 0.85));

    // Scythe claws on the hands.
    for (const a of r.arms) {
      const g = dgeo('specx|scythes', () => {
        const sc = new Sculpt(0.04, 12).as(SURF.claw);
        for (const dx of [-0.03, 0, 0.03]) sc.cone(0.022, 0.3, PAL.claw, M(dx, -SPEC.arm.fore - 0.02, 0.03, Math.PI - 0.5, 0, dx * 3), 4);
        return sc.build();
      });
      const m = Kit.add(a.elbow, g, this.skinMatRef);
      this.hitbox(m, 'limb');
      this.bodyMeshes.push(m);
    }

    // Hit zones for the stock theropod meshes.
    for (const m of r.meshes.head) this.hitbox(m, 'head');
    for (const m of r.meshes.torso) this.hitbox(m, 'torso');
    for (const m of r.meshes.limb) this.hitbox(m, 'limb');
    for (const m of r.meshes.tail) this.hitbox(m, 'tail');
    this.bodyMeshes.push(...r.meshes.head, ...r.meshes.torso, ...r.meshes.limb, ...r.meshes.tail);
    for (const m of this.bodyMeshes) m.userData.baseMat = m.material;
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.baseMat) m.userData.baseMat = m.material;
    });
    // The tail-whip ring sits on the glowing tail-base stripes (weak, count double),
    // not the thin, whipping tip: a big target that stays framed while it coils.
    this.tailRing = Kit.pivot(r.tail[0], 0, 0, -SPEC.tail.lens[0] * 0.55);
    this.anchor = r.chest;
    this.headAnchor = r.headMesh;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  override onAdded(): void {
    super.onAdded();
    this.prevPos.copy(this.root.position);
    this.cloak = this.cloakTarget = 1;
    this.applyCloak(true);
    this.go('intro');
    this.crouch = 0.6;
    this.playerPos(_p);
    this.root.rotation.y = Math.atan2(_p.x - this.root.position.x, _p.z - this.root.position.z);
    this.world.scene.add(this.focus);
    this.updateFocus(1);
    this.world.rig.lookAtObject(this.focus, 1.8);
  }

  override dispose(): void {
    this.focus.parent?.remove(this.focus);
    super.dispose();
  }

  // ─── Damage ───────────────────────────────────────────────────────────────

  protected override damageMultiplier(hit: ShotHit): number {
    const vuln = this.state === 'stun' || this.state === 'roar' ? 1.5 : 1;
    switch (hit.part) {
      case 'weak':
        return 1 * vuln;
      case 'head':
        return 0.5 * vuln;
      case 'torso':
        return 0.35 * vuln;
      case 'limb':
        return 0.3 * vuln;
      case 'tail':
        return 0.3 * vuln;
      default:
        return 0.3 * vuln;
    }
  }

  override flash(critical = false): void {
    if (!critical) return;
    this.flashMesh(this.r.headMesh, 0.06);
  }

  private flashMesh(mesh: THREE.Mesh, t: number) {
    // Photosensitivity setting: no white hit-flashes on the body parts.
    if (this.world.settings.reduceFlashes) return;
    const e = this.flashes.find((f) => f.mesh === mesh);
    if (e) {
      e.t = Math.max(e.t, t);
      return;
    }
    mesh.material = this.flashMat;
    this.flashes.push({ mesh, t });
  }

  private updateFlashes(dt: number) {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t -= dt;
      if (f.t <= 0) {
        f.mesh.material = f.mesh.userData.baseMat as THREE.Material;
        this.flashes.splice(i, 1);
      }
    }
  }

  protected override onDamaged(hit: ShotHit, amount: number): void {
    super.onDamaged(hit, amount);
    const obj = hit.object as THREE.Mesh;
    if (obj.isMesh) this.flashMesh(obj, hit.part === 'weak' ? 0.07 : 0.035);
    if (hit.part === 'weak') this.world.fx.sparkle(hit.point, 0x80e8ff);
    const e = this.model.matrixWorld.elements;
    const d = hit.dir.x * e[0] + hit.dir.y * e[1] + hit.dir.z * e[2];
    this.flinchSide = d >= 0 ? 1 : -1;
    this.flinch = Math.min(1.2, this.flinch + 0.25 + amount * 0.08);
    // Stagger meter: counts HITS, not damage, so the pistol at a human ~3 taps/s
    // can always break an attack by shooting the ring; the glowing weak points
    // count double. (Every pellet / SMG round is a hit, so pickups stagger fast.)
    const weight = hit.part === 'weak' ? 2 : 1;
    if (this.winding) {
      this.interruptDmg += weight;
      if (this.interruptDmg >= this.interruptThreshold()) this.interrupt();
      else if (this.interruptDmg >= this.interruptThreshold() * 0.5) this.flinch = Math.min(1.4, this.flinch + 0.3);
    }
    // Being shot while faded gives away its position.
    if (this.cloaked && (this.state === 'hide' || this.state === 'fade')) {
      this.interruptDmg += weight;
      if (this.interruptDmg >= 2) {
        this.world.audio.play('raptor_screech', { volume: 0.9, pitch: 0.6 });
        this.go('ambush');
      }
    }
  }

  /**
   * Hits (weak = 2) that break a wind-up, sized for a ~3 taps/s pistol player
   * who starts shooting ~0.3 s into the ring:
   *   pounce  1.5/1.35/1.25 s wind + 0.5 s leap → 3 / 4 / 4 hits
   *   tail    1.4/1.3/1.2 s, ring on the glowing tail base → 2 / 3 / 3 hits
   */
  private interruptThreshold() {
    if (this.state === 'tailWind') return [2, 3, 3][this.phase] ?? 3;
    return [3, 4, 4][this.phase] ?? 4;
  }

  /** Last-heart grace: a little more wind-up time when the player is on 1 heart. */
  private grace() {
    return this.world.player.hp <= 1 ? 0.2 : 0;
  }

  /**
   * Tempo between attacks. A healthy player (4+ hearts) gets pressed harder —
   * shorter breathers, never shorter wind-ups — so the fight stays tense for
   * good shots and eases off for someone hanging on.
   */
  private breather(base: number[]) {
    const b = base[this.phase] ?? base[base.length - 1];
    return this.world.player.hp >= 4 ? b * 0.7 : b;
  }

  private interrupt() {
    const w = this.world;
    this.telegraph = null;
    this.winding = false;
    w.audio.play('raptor_screech', { volume: 1, pitch: 0.5 });
    w.audio.play('stomp', { volume: 0.8, pitch: 1.1 });
    w.rig.shake(0.3);
    const sp = this.screenPos(this.r.headMesh);
    if (sp) w.hud.popup('STAGGERED!', sp.x, sp.y - 40, 'combo');
    w.score.add(300);
    this.go('stun');
  }

  protected override onPhase(phase: number): void {
    this.pendingRoar = Math.max(this.pendingRoar, phase);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private go(s: XState) {
    this.telegraph = null;
    this.winding = false;
    this.interruptDmg = 0;
    this.entering = true;
    this.setState(s);
  }

  private yawToPlayer() {
    this.playerPos(_p);
    return Math.atan2(_p.x - this.root.position.x, _p.z - this.root.position.z);
  }

  private faceYaw(yaw: number, dt: number, rate = 6) {
    this.root.rotation.y += angleDelta(this.root.rotation.y, yaw) * (1 - Math.exp(-rate * dt));
  }

  /** Move toward (x, z) at up to `speed`, easing in on arrival. Returns remaining distance. */
  private steer(x: number, z: number, speed: number, dt: number, face = true): number {
    const p = this.root.position;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return 0;
    const step = Math.min(d, speed * dt, d * (1 - Math.exp(-4 * dt)) + speed * 0.25 * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    if (face && d > 0.4) this.faceYaw(Math.atan2(dx, dz), dt, 7);
    return d - step;
  }

  /** Keep a target inside the arena and clear of the pillars (pushed out along z). */
  private clampArena(v: THREE.Vector3) {
    v.x = clamp(v.x, HALL.x0, HALL.x1);
    v.z = clamp(v.z, HALL.zFar, HALL.zNear);
    for (const c of HALL.pillars) {
      const dx = v.x - c.x;
      const dz = v.z - c.z;
      if (dx * dx + dz * dz >= PILLAR_CLEAR * PILLAR_CLEAR) continue;
      const off = Math.sqrt(Math.max(0, PILLAR_CLEAR * PILLAR_CLEAR - dx * dx));
      v.z = clamp(dz >= 0 ? c.z + off : c.z - off, HALL.zFar, HALL.zNear);
    }
    return v;
  }

  /** Plan a dash to `to`, detouring around a pillar if the straight line clips one. */
  private planPath(to: THREE.Vector3) {
    this.target.copy(this.clampArena(to));
    this.via = null;
    const p = this.root.position;
    for (const c of HALL.pillars) {
      _v.subVectors(this.target, p).setY(0);
      const len = _v.length();
      if (len < 0.01) break;
      _v.divideScalar(len);
      _w.subVectors(c, p).setY(0);
      const along = _w.dot(_v);
      if (along < 0 || along > len) continue;
      const perp = _w.x * _v.z - _w.z * _v.x;
      if (Math.abs(perp) < 2.1) {
        const s = perp >= 0 ? -1 : 1;
        this.via = new THREE.Vector3(c.x + _v.z * s * 2.8, 0, c.z - _v.x * s * 2.8);
        this.clampArena(this.via);
        break;
      }
    }
  }

  /** Follow the planned path. Returns true on arrival. */
  private followPath(speed: number, dt: number): boolean {
    if (this.via) {
      if (this.steer(this.via.x, this.via.z, speed, dt) < 0.8) this.via = null;
      return false;
    }
    return this.steer(this.target.x, this.target.z, speed, dt) < 0.3;
  }

  /** A point `dist` metres from the player at `angle` radians off the rail axis (+ = right). */
  private ring(dist: number, angle: number, out: THREE.Vector3) {
    this.playerPos(_p);
    out.set(_p.x + Math.sin(angle) * dist, 0, _p.z - Math.cos(angle) * dist);
    return this.clampArena(out);
  }

  private dashSpeed() {
    return [8.5, 10, 11.5][this.phase] ?? 11.5;
  }

  private applyCloak(force = false) {
    const on = this.cloak > 0.02;
    if (on === this.cloaked && !force) return;
    this.cloaked = on;
    const mat = on ? this.cloakMat : this.skinMatRef;
    for (const m of this.bodyMeshes) {
      m.userData.baseMat = mat;
      if (!this.flashes.some((f) => f.mesh === m)) m.material = mat;
    }
  }

  private updateFocus(k: number, onBoss = 0.72) {
    this.r.chest.getWorldPosition(_v);
    this.r.headMesh.getWorldPosition(_w);
    _v.lerp(_w, 0.4);
    _u.copy(HALL.center).setY(2.0).lerp(_v, onBoss);
    _u.y = clamp(_u.y, onBoss > 0.9 ? 0.9 : 1.5, 2.6);
    this.focus.position.lerp(_u, k);
  }

  private raptorCount() {
    let n = 0;
    for (const e of this.world.enemies()) if (!e.isBoss && e.state !== 'dying' && e.hostile) n++;
    return n;
  }

  /** A ring attack may only START when its anchor is framed in the playable screen area. */
  private framed(obj: THREE.Object3D) {
    return this.inPlayArea(obj, 0.85);
  }

  /** Other live warnings (minion wind-ups, darts in flight). */
  private otherThreats() {
    let n = 0;
    for (const e of this.world.entities) if (e !== this && !e.removed && e.telegraph) n++;
    return n;
  }

  /** Pounce if the chest is framed; otherwise slip back into the middle of the view first. */
  private tryPounce() {
    if (this.framed(this.r.chest)) {
      this.go('pounceWind');
      return;
    }
    this.cooldown = 0.25;
    this.planPath(this.ring(9, 0, _v));
    this.go('stalk');
  }

  private dartsInFlight() {
    for (const d of this.darts) if (!d.removed) return true;
    return false;
  }

  /** Queue `n` more minions in `t` seconds (only arrives while the boss lives). */
  private reinforce(t: number, type: string, n: number, variant?: string) {
    this.reinforcements.push({ t, type, n, variant });
  }

  /**
   * Call minions out of the specimen tank through its broken panes (straight
   * down the hall between the pillars, so they arrive in the middle of the
   * view rather than at the screen edges).
   */
  private summon(type: string, n: number, variant?: string) {
    const w = this.world;
    const lab = labs(w);
    const exits: number[] = [];
    // Panes 1 and 2 face the open floor between the pillars (pane 0 is behind one).
    for (const i of [1, 2]) if (lab?.panes[i]?.broken) exits.push(HALL.paneXs[i]);
    if (!exits.length) {
      this.breakPane(1);
      exits.push(HALL.paneXs[1]);
    }
    for (let i = 0; i < n; i++) {
      const x = exits[(this.minionsCalled + i) % exits.length] + ((i % 3) - 1) * 1.1;
      const pos = new THREE.Vector3(x, 0, HALL.tankZ - 1.6 - (i % 2) * 0.8);
      const e = createEnemy(type, w, { pos, frame: 'world', entry: 'leap', hpMul: 1, speedMul: 1, opts: variant ? { variant: i % 2 ? 'tan' : variant } : {} });
      w.add(e);
      this.minionsCalled++;
    }
    w.audio.play(type === 'compy' ? 'compy_chirp' : 'raptor_screech', { volume: 0.8, pitch: type === 'compy' ? 1 : 1.1 });
  }

  /** Break a tank pane (phase changes: the pack is let out). */
  private breakPane(i: number) {
    const pane = labs(this.world)?.panes[i];
    if (!pane || pane.broken) return;
    pane.shatter(this.world, _w.set(HALL.paneXs[i], 0, HALL.tankZ + 0.5));
    this.world.audio.play('alarm', { volume: 0.4, pitch: 0.7 });
  }

  private chooseAttack(): XState {
    const r = this.world.rng.next();
    const p = this.phase;
    let pick: XState;
    if (p === 0) pick = r < 0.5 ? 'pounceWind' : r < 0.75 ? 'tailMove' : 'quillWind';
    else if (p === 1) pick = r < 0.3 ? 'pounceWind' : r < 0.5 ? 'tailMove' : r < 0.72 ? 'quillWind' : 'fade';
    else pick = r < 0.32 ? 'pounceWind' : r < 0.47 ? 'tailMove' : r < 0.65 ? 'quillWind' : 'fade';
    if (pick === this.lastAttack && pick !== 'pounceWind') pick = 'pounceWind';
    this.lastAttack = pick;
    return pick;
  }

  /**
   * A bone quill with a glowing bioluminescent tip. It flies at the lens tip
   * first, so the soft halo around the tip is what reads on the 288-line CRT —
   * and what makes it a fair, shootable target from its first frame.
   */
  private quillDart(): THREE.Object3D {
    const g = new THREE.Group();
    const spike = Kit.add(g, Kit.cone(0.08, 0.9, 5), Kit.mat(0xe8e2d4), 0, 0, 0, Math.PI / 2, 0, 0);
    spike.userData.noFlash = true;
    Kit.add(g, Kit.sphere(0.12, 6, 4), Kit.glow(0x60e8ff, 1.6), 0, 0, 0.42);
    const halo = Kit.add(g, Kit.sphere(0.27, 8, 6), this.dartHaloMat, 0, 0, 0.3);
    halo.renderOrder = 3;
    return g;
  }

  // ─── Fight ────────────────────────────────────────────────────────────────

  protected override customUpdate(dt: number): void {
    const w = this.world;
    const t = this.stateTime;
    const st = this.state as XState;
    const first = this.entering;
    this.entering = false;
    const p = this.root.position;
    const T = this.tg;

    // Phase check (explosions / bombs bypass onDamaged).
    const ph = this.phaseFor();
    if (ph > this.phase) {
      this.phase = ph;
      this.onPhase(ph);
    }
    const busy = st === 'intro' || st === 'roar' || st === 'pounce' || st === 'stun' || st === 'getUp';
    if (this.pendingRoar > 0 && !busy && !this.roarsDone.has(this.pendingRoar)) {
      this.go('roar');
      return;
    }

    T.crouch = 0;
    T.air = 0;
    T.jaw = 0.1;
    T.dip = 0;
    T.rear = 0;
    T.tail = 0;
    T.recoil = 0;
    T.arm = 0;
    T.whip = 0;
    T.quill = 0;
    T.roll = 0;
    this.wiggle = 0;
    this.playerPos(_p);
    const toPlayer = this.yawToPlayer();

    for (let i = this.reinforcements.length - 1; i >= 0; i--) {
      const rf = this.reinforcements[i];
      rf.t -= dt;
      if (rf.t <= 0) {
        this.reinforcements.splice(i, 1);
        this.summon(rf.type, rf.n, rf.variant);
      }
    }
    // Phase 2+: keep a couple of raptors in play.
    if (this.phase >= 1 && st !== 'intro' && st !== 'roar') {
      this.minionT -= dt;
      if (this.minionT <= 0) {
        this.minionT = this.enraged ? 11 : 14;
        if (this.raptorCount() < 2 && this.minionsCalled < 10) this.summon('raptor', 1, 'tan');
      }
    }

    switch (st) {
      case 'intro': {
        // Eyes in the dark… a leap out of the broken tank… a scream.
        const leapAt = 1.2;
        const landAt = 1.95;
        this.faceYaw(toPlayer, dt, t < leapAt ? 3 : 6);
        if (t < leapAt) {
          this.cloakTarget = 1;
          T.crouch = 0.6;
          T.dip = 0.5;
          T.jaw = 0.25;
          this.wiggle = t / leapAt;
          if (first) {
            w.audio.play('dilo_hiss', { volume: 0.9, pitch: 0.55 });
            this.pFrom.copy(p);
          }
        } else if (t < landAt) {
          if (t - dt < leapAt) {
            this.pFrom.copy(p);
            this.pTo.set(8.5, 0, -348.5);
            w.audio.play('raptor_screech', { volume: 1, pitch: 0.55 });
            w.audio.play('whoosh', { volume: 0.9, pitch: 0.6 });
          }
          const k = clamp((t - leapAt) / (landAt - leapAt), 0, 1);
          p.x = lerp(this.pFrom.x, this.pTo.x, k);
          p.z = lerp(this.pFrom.z, this.pTo.z, k);
          this.lift = Math.sin(Math.PI * k) * 2.4;
          this.cloakTarget = 0;
          T.air = 1;
          T.jaw = 0.9;
          T.arm = 1;
        } else {
          if (t - dt < landAt) {
            this.lift = 0;
            w.audio.play('stomp', { volume: 1, pitch: 0.8 });
            w.fx.dust(this.worldPos(_v), 2.6, 0x8a8a8a);
            w.rig.shake(0.6);
          }
          T.rear = t > landAt + 0.25 ? 1 : 0.3;
          T.jaw = t > landAt + 0.25 ? 1 : 0.4;
          T.quill = t > landAt + 0.25 ? 1 : 0;
          if (t - dt < landAt + 0.3 && t >= landAt + 0.3) {
            w.audio.play('boss_roar', { volume: 1, pitch: 1.25 });
            w.audio.play('raptor_screech', { volume: 1, pitch: 0.5 });
            w.rig.shake(0.5);
            const lab = labs(w);
            if (lab) lab.dimTarget = 0.15;
          }
          if (t > landAt + 0.3 && Math.floor((t - dt) * 5) !== Math.floor(t * 5)) w.rig.shake(0.12);
        }
        if (t > landAt + 1.9) {
          this.cooldown = 0.5;
          this.planPath(this.ring(9.5, 0.35, _v));
          this.go('stalk');
        }
        break;
      }
      case 'stalk': {
        // Dash to the next spot (often slipping behind a pillar on the way).
        this.cloakTarget = 0;
        T.dip = 0.25;
        T.tail = 0.15;
        if (this.followPath(this.dashSpeed(), dt) || t > 3.5) this.go('watch');
        break;
      }
      case 'watch': {
        // Head low, tail lashing, sizing you up.
        this.faceYaw(toPlayer, dt, 5);
        T.crouch = 0.25;
        T.dip = 0.35;
        T.jaw = 0.15 + Math.max(0, Math.sin(this.age * 2.3)) * 0.25;
        T.tail = 0.25;
        if (first) {
          this.hissT = 0;
          this.holdOff = 0;
          if (w.rng.chance(0.5)) w.audio.play('raptor_bark', { volume: 0.7, pitch: 0.55 });
        }
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
          // Fair play: never stack an attack on two other live warnings (minion
          // wind-ups, darts) — give the player up to ~2 s to deal with them first.
          if (this.otherThreats() >= 2 && this.holdOff < 2) {
            this.holdOff += dt;
            break;
          }
          this.holdOff = 0;
          const pick = this.chooseAttack();
          if (pick === 'pounceWind') this.tryPounce();
          else this.go(pick);
        }
        break;
      }
      case 'ambush': {
        // Dart out of cover onto a close flank, half-faded, then a short-fuse pounce.
        if (first) {
          this.sideSign = p.x > _p.x ? 1 : -1;
          this.planPath(this.ring(7, this.sideSign * 0.45, _v));
          w.audio.play('raptor_screech', { volume: 0.9, pitch: 0.7 });
        }
        this.cloakTarget = 0.55;
        T.dip = 0.35;
        if (this.followPath(this.dashSpeed() * 1.15, dt) || t > 1.4) {
          if (this.framed(this.r.chest)) {
            this.shortFuse = true;
            this.go('pounceWind');
          } else if (t > 2.6) {
            // Never pounce from the edge of the screen: give up the ambush.
            this.cooldown = 0.4;
            this.planPath(this.ring(8.5, 0, _v));
            this.go('stalk');
          } else {
            this.ring(7, this.sideSign * 0.12, _w);
            this.steer(_w.x, _w.z, this.dashSpeed() * 0.6, dt);
          }
        }
        break;
      }
      case 'pounceWind': {
        if (first) {
          const base = this.shortFuse ? [1.3, 1.2, 1.1] : [1.5, 1.35, 1.25];
          this.windTime = (base[this.phase] ?? 1.1) + this.grace();
          this.shortFuse = false;
          w.audio.play('raptor_screech', { volume: 0.8, pitch: 0.75 });
        }
        this.winding = true;
        this.cloakTarget = 0;
        const total = this.windTime + this.leapTime;
        // Ring on the chest: it stays in the middle of the view through the whole leap.
        if (!this.telegraph) this.telegraph = { progress: 0, anchor: this.r.chest, radius: this.telegraphRadius };
        this.telegraph.progress = clamp(t / total, 0, 1);
        this.faceYaw(toPlayer, dt, 8);
        // Creep a little closer if far away.
        if (p.distanceTo(_p) > 9.5) this.steer(_p.x, _p.z, 2.5, dt, false);
        const k = clamp(t / this.windTime, 0, 1);
        T.crouch = 0.35 + 0.45 * k;
        T.dip = 0.7;
        T.jaw = 0.3 + 0.6 * k;
        T.tail = 0.4;
        T.arm = 0.3;
        this.wiggle = k;
        if (t >= this.windTime) {
          // Leap!
          this.pFrom.copy(p);
          _v.subVectors(p, _p).setY(0).normalize();
          this.pTo.copy(_p).addScaledVector(_v, POUNCE_STOP);
          w.audio.play('raptor_screech', { volume: 1, pitch: 0.6 });
          w.audio.play('whoosh', { volume: 0.8, pitch: 0.7 });
          const prog = this.telegraph.progress;
          this.setState('pounce');
          this.entering = false;
          this.winding = true;
          this.telegraph = { progress: prog, anchor: this.r.chest, radius: this.telegraphRadius };
        }
        break;
      }
      case 'pounce': {
        const k = clamp(t / this.leapTime, 0, 1);
        p.x = lerp(this.pFrom.x, this.pTo.x, k);
        p.z = lerp(this.pFrom.z, this.pTo.z, k);
        this.lift = Math.sin(Math.PI * k) * 1.1 + k * 0.3;
        this.faceYaw(toPlayer, dt, 12);
        T.air = 1;
        T.jaw = 1;
        T.arm = 1;
        // Head up at eye level (not diving under the bottom HUD): jaws at the lens.
        T.rear = 0.45;
        const total = this.windTime + this.leapTime;
        if (this.telegraph) this.telegraph.progress = clamp((this.windTime + t) / total, 0, 1);
        if (k >= 1) {
          this.telegraph = null;
          this.winding = false;
          w.hurtPlayer(1, this.title, this);
          w.audio.play('bite', { volume: 1, pitch: 0.7 });
          w.rig.shake(0.8);
          w.hitStop(0.06);
          // Enraged double pounce — never onto a player down to their last two hearts.
          if (this.phase >= 2 && this.chain === 0 && w.player.hp >= 3 && w.rng.chance(w.player.hp >= 4 ? 0.5 : 0.35)) {
            this.chain = 1;
          } else this.chain = 0;
          this.pFrom.copy(p);
          this.go('retreat');
        }
        break;
      }
      case 'retreat': {
        // Spring back out of reach.
        const k = clamp(t / 0.6, 0, 1);
        if (first) {
          this.sideSign = w.rng.chance(0.5) ? 1 : -1;
          this.ring(8.5, this.sideSign * 0.4, this.pTo);
        }
        const e = 1 - (1 - k) * (1 - k);
        p.x = lerp(this.pFrom.x, this.pTo.x, e);
        p.z = lerp(this.pFrom.z, this.pTo.z, e);
        this.lift = lerp(this.lift, 0, Math.min(1, dt * 8)) + Math.sin(Math.PI * k) * 0.25;
        this.faceYaw(toPlayer, dt, 10);
        T.air = 0.5 * (1 - k);
        T.jaw = 0.3;
        if (k >= 1) {
          this.lift = 0;
          w.fx.dust(this.worldPos(_v), 1.2, 0x8a8a8a);
          if (this.chain === 1 && this.framed(this.r.chest)) {
            this.chain = 2;
            this.go('pounceWind');
          } else {
            this.chain = 0;
            this.cooldown = this.breather([1.2, 0.9, 0.6]);
            this.planPath(this.ring(w.rng.range(8, 11), w.rng.range(-0.75, 0.75), _v));
            this.go('stalk');
          }
        }
        break;
      }
      case 'tailMove': {
        // Sidle up on one flank.
        if (first) {
          this.sideSign = w.rng.chance(0.5) ? 1 : -1;
          this.planPath(this.ring(6.4, this.sideSign * 0.6, _v));
        }
        T.dip = 0.3;
        if (this.followPath(this.dashSpeed() * 0.85, dt) || t > 2.6) {
          if (this.framed(this.tailRing)) this.go('tailWind');
          else if (t > 3.4) {
            this.cooldown = 0.3;
            this.planPath(this.ring(9, 0, _v));
            this.go('stalk');
          }
        }
        break;
      }
      case 'tailWind': {
        // Turn side-on, coil the tail away, ring on the glowing tail base.
        if (first) this.windTime = ([1.4, 1.3, 1.2][this.phase] ?? 1.2) + this.grace();
        const dur = this.windTime;
        this.winding = true;
        const side = this.sideSign;
        this.faceYaw(toPlayer + side * 1.45, dt, 5);
        const k = clamp(t / dur, 0, 1);
        T.whip = -0.8 * k;
        T.crouch = 0.3;
        T.tail = 0.3;
        T.jaw = 0.25;
        if (first) w.audio.play('raptor_bark', { volume: 0.8, pitch: 0.5 });
        const done = this.telegraphAttack(
          dur,
          () => {
            w.hurtPlayer(1, this.title, this);
            w.audio.play('whoosh', { volume: 1, pitch: 0.6 });
            w.audio.play('hit_world', { volume: 0.8, pitch: 0.6 });
            w.rig.shake(0.7);
            w.hitStop(0.05);
          },
          this.tailRing,
        );
        if (done) this.go('tailWhip');
        break;
      }
      case 'tailWhip': {
        const side = this.sideSign;
        this.faceYaw(toPlayer + side * (1.45 + Math.min(1, t * 4) * 1.2), dt, 9);
        T.whip = 1.2 * Math.max(0, 1 - t * 2);
        T.crouch = 0.2;
        if (t > 0.7) {
          this.cooldown = this.breather([1.0, 0.8, 0.5]);
          this.planPath(this.ring(w.rng.range(8.5, 11), w.rng.range(-0.7, 0.7), _v));
          this.go('stalk');
        }
        break;
      }
      case 'quillWind': {
        // Rattle the quills.
        this.faceYaw(toPlayer, dt, 6);
        T.quill = 1;
        T.crouch = 0.2;
        T.rear = 0.25;
        T.jaw = 0.5;
        this.wiggle = 0.5;
        if (first) {
          w.audio.play('dilo_hiss', { volume: 0.9, pitch: 0.75 });
          this.volley = [2, 3, 4][this.phase] ?? 4;
          this.volleyT = 0;
          this.darts.length = 0;
        }
        if (t > 0.75) this.go('quillFire');
        break;
      }
      case 'quillFire': {
        this.faceYaw(toPlayer, dt, 6);
        T.quill = 1;
        T.rear = 0.15;
        this.volleyT -= dt;
        if (this.volley > 0 && this.volleyT <= 0) {
          this.volley--;
          this.volleyT = 0.4;
          // Flicked off the crest past the head, alternating sides: the dart starts
          // in front of the beast (never hidden behind its own body), so it can be
          // shot from its first frame — and only if that spot is in the play area.
          const side = this.volley % 2 ? 1 : -1;
          this.r.headMesh.getWorldPosition(_v);
          this.playerEye(_u);
          _w.subVectors(_u, _v).setY(0).normalize();
          _v.addScaledVector(_w, 1.0);
          _v.x -= _w.z * side * 0.8;
          _v.z += _w.x * side * 0.8;
          _v.y += 0.35;
          _u.copy(_v).project(w.camera);
          if (ndcInPlayArea(_u.x, _u.y, _u.z, 0.85)) {
            w.fx.sparkle(_v, 0x80e8ff);
            const dart = this.throwProjectile(_v.clone(), {
              mesh: this.quillDart(),
              flightTime: 1.6,
              arc: 0.85,
              damage: 1,
              hp: 1,
              points: 120,
              color: 0xe8e2d4,
              size: 0.32,
              spin: 0,
              source: this.title,
              sfxDestroy: 'hit_projectile',
              burst: 'debris',
            });
            this.darts.push(dart);
            w.audio.play('whoosh', { volume: 0.7, pitch: 1.3 });
          }
          this.recoil = 0.6;
        }
        // Hold the pose (and so the camera) until the darts have landed or been shot down.
        if (this.volley <= 0 && this.volleyT <= -0.3 && (!this.dartsInFlight() || this.volleyT <= -1.8)) {
          this.darts.length = 0;
          this.cooldown = this.breather([1.2, 0.9, 0.6]);
          this.planPath(this.ring(w.rng.range(9.5, 12), w.rng.range(-0.8, 0.8), _v));
          this.go('stalk');
        }
        break;
      }
      case 'fade': {
        // Hiss, melt into the shadows, slip behind a pillar.
        if (first) {
          w.audio.play('dilo_hiss', { volume: 1, pitch: 0.5 });
          // Pillar farthest from where it is now, offset to hide behind it.
          let best = HALL.pillars[0];
          let bd = -1;
          for (const c of HALL.pillars) {
            const dd = c.distanceTo(p);
            if (dd > bd) {
              bd = dd;
              best = c;
            }
          }
          _v.subVectors(best, _p).setY(0).normalize().multiplyScalar(2.3).add(best);
          this.planPath(_v);
        }
        this.cloakTarget = 1;
        T.dip = 0.4;
        if (this.followPath(this.dashSpeed() * 1.1, dt) || t > 3) this.go('hide');
        break;
      }
      case 'hide': {
        this.cloakTarget = 1;
        this.faceYaw(toPlayer, dt, 4);
        T.crouch = 0.5;
        T.dip = 0.5;
        if (first) this.hissT = w.rng.range(0.9, 1.5);
        if (t > this.hissT) this.go('ambush');
        break;
      }
      case 'roar': {
        const dur = 2.4;
        this.cloakTarget = 0;
        this.faceYaw(toPlayer, dt, 4);
        T.rear = t > 0.3 ? 1 : 0.4;
        T.jaw = t > 0.3 ? 1 : 0.3;
        T.quill = 1;
        T.tail = 0.5;
        if (first) {
          this.roaringFor = this.pendingRoar;
          w.audio.play('boss_roar', { volume: 1, pitch: this.roaringFor >= 2 ? 1.35 : 1.2 });
          w.audio.play('raptor_screech', { volume: 1, pitch: 0.45 });
          if (this.roaringFor === 1) {
            w.hud.prompt('IT CALLED THE PACK!');
            w.later(0.9, () => this.breakPane(1));
          }
          if (this.roaringFor >= 2) {
            w.hud.prompt('SPECIMEN X IS ENRAGED!');
            this.enraged = true;
            // A first-aid kit shaken loose from the wall cabinet: one more heart for the last phase.
            w.later(1.2, () => {
              if (this.state === 'dying' || this.removed) return;
              w.add(new Pickup(w, 'health', new THREE.Vector3(12.6, 1.3, -341.2), 'world', 16));
            });
            w.later(0.9, () => {
              this.breakPane(1);
              this.breakPane(2);
            });
          }
          const lab = labs(w);
          if (lab) lab.alarm = this.roaringFor >= 2 ? 1 : 0.6;
        }
        if (t > 0.3 && Math.floor((t - dt) * 4) !== Math.floor(t * 4)) {
          w.rig.shake(0.22);
          w.fx.dust(this.worldPos(_v), 1.4, 0x8a8a8a);
        }
        if (t >= dur) {
          const which = this.roaringFor;
          this.roarsDone.add(which);
          // The pack arrives in waves (fair on a phone): two now, the rest later.
          if (which === 1) {
            this.summon('raptor', 2, 'blue');
            this.reinforce(6, 'raptor', 1, 'blue');
          }
          if (which >= 2) {
            this.roarsDone.add(1);
            this.summon('raptor', 2, 'red');
            this.reinforce(6.5, 'compy', 3);
          }
          this.pendingRoar = -1;
          w.later(2.5, () => w.hud.prompt(null));
          this.cooldown = 1.2;
          this.planPath(this.ring(9.5, w.rng.range(-0.6, 0.6), _v));
          this.go('stalk');
        }
        break;
      }
      case 'stun': {
        // Knocked flat: thrashing on its side — free hits.
        this.cloakTarget = 0;
        if (first) {
          this.pFrom.copy(p);
          _v.subVectors(p, _p).setY(0).normalize();
          this.pTo.copy(p).addScaledVector(_v, 2.2);
          this.clampArena(this.pTo);
          w.fx.dust(this.worldPos(_w), 2, 0x8a8a8a);
        }
        const k = clamp(t / 0.35, 0, 1);
        p.x = lerp(this.pFrom.x, this.pTo.x, k);
        p.z = lerp(this.pFrom.z, this.pTo.z, k);
        this.lift = damp(this.lift, 0, 10, dt);
        T.roll = 1;
        T.recoil = 1;
        T.jaw = 0.6 + Math.sin(t * 9) * 0.2;
        if (t > 0.35 && t - dt <= 0.35) {
          w.audio.play('stomp', { volume: 0.9, pitch: 0.8 });
          w.rig.shake(0.35);
        }
        if (t > [2.0, 1.7, 1.4][this.phase]!) this.go('getUp');
        break;
      }
      case 'getUp': {
        T.roll = Math.max(0, 1 - t * 2);
        T.crouch = 0.4;
        this.faceYaw(toPlayer, dt, 4);
        if (t > 0.6) {
          w.audio.play('raptor_screech', { volume: 0.9, pitch: 0.55 });
          this.cooldown = 0.5;
          this.planPath(this.ring(w.rng.range(8.5, 11), w.rng.range(-0.8, 0.8), _v));
          this.go('stalk');
        }
        break;
      }
      default:
        this.go('watch');
    }
  }

  // ─── Per-frame (after AI) ───────────────────────────────────────────────

  override update(dt: number): void {
    super.update(dt);
    if (this.removed) return;
    this.updateFlashes(dt);
    // Speed for the gait.
    if (dt > 0) {
      const sp = Math.hypot(this.root.position.x - this.prevPos.x, this.root.position.z - this.prevPos.z) / dt;
      this.speedNow = damp(this.speedNow, Math.min(sp, 16), 10, dt);
    }
    this.prevPos.copy(this.root.position);
    // Cloak blend.
    this.cloak = damp(this.cloak, this.cloakTarget, this.cloakTarget > this.cloak ? 4 : 2.5, dt);
    const c = 1 - this.cloak * 0.86;
    this.cloakMat.color.setRGB(c * 0.9, c * 0.95, c * 1.1);
    this.applyCloak();
    // Glow: stripes pulse (faster when enraged), flare while cloaked.
    const t = this.age;
    const pulse = 0.5 + 0.5 * Math.sin(t * (this.enraged ? 7 : 3.2));
    const base = this.enraged ? STRIPE_RAGE : STRIPE;
    let dyingK = 1;
    let eyeK = 1;
    if (this.state === 'dying') {
      // Flare on the killing blow, then the stripes stutter and die; the eyes go last.
      const st = this.stateTime;
      const fade0 = this.fellAt >= 0 ? this.fellAt + 0.3 : this.deathDuration - 2.6;
      const k = clamp(1 - (st - fade0) / 2.2, 0, 1);
      const stutter = st > fade0 && Math.sin(st * 23) + Math.sin(st * 37) > 0.9 ? 0.25 : 1;
      dyingK = (st < 0.35 ? 1.8 : 1) * k * stutter;
      eyeK = clamp(1 - (st - fade0 - 0.9) / 1.6, 0, 1);
    }
    this.stripeMat.color.copy(base).multiplyScalar((1.1 + pulse * 0.7 + this.cloak * 0.4) * dyingK);
    this.eyeMat.color.copy(this.enraged ? EYE_RAGE : EYE).multiplyScalar((1.7 + pulse * 0.4) * eyeK);
    this.haloMat.color.copy(this.enraged ? EYE_RAGE : EYE);
    this.haloMat.opacity = (0.22 + 0.15 * pulse + this.cloak * 0.15) * eyeK;
    this.breathT += dt;
    // Camera focus.
    // Camera focus (fully on the beast while it dies, so the finale fills the frame).
    if (this.state !== 'dying') this.updateFocus(1 - Math.exp(-dt * 3));
    else this.updateFocus(1 - Math.exp(-dt * 2.5), 0.95);
    // Footfalls.
    if (this.runAmt > 0.3 && this.lift < 0.05) {
      const s = Math.floor(this.gaitPhase / Math.PI);
      if (s !== this.stepPhase) {
        this.stepPhase = s;
        this.world.audio.play('stomp', { volume: 0.25 * this.runAmt, pitch: 1.5, vary: 0.15 });
      }
    }
  }

  // ─── Animation ────────────────────────────────────────────────────────────

  protected override animate(dt: number): void {
    const r = this.r;
    const s = SPEC;
    const T = this.tg;
    if (this.state === 'dying') {
      this.poseDeath(dt);
      return;
    }
    const gs = this.speedNow / S;
    const freq = gs > 0.15 ? Math.min(3.2, gs / 1.45 + 0.35) : 0;
    this.gaitPhase += dt * freq * TAU;
    this.runAmt = damp(this.runAmt, clamp(gs / 4.5, 0, 1), 8, dt);
    this.crouch = damp(this.crouch, T.crouch, 9, dt);
    this.air = damp(this.air, T.air, 12, dt);
    this.jawOpen = damp(this.jawOpen, T.jaw, 14, dt);
    this.dip = damp(this.dip, T.dip, 6, dt);
    this.rear = damp(this.rear, T.rear, 5, dt);
    this.tailLift = damp(this.tailLift, T.tail, 6, dt);
    this.recoil = damp(this.recoil, T.recoil, 10, dt);
    this.armReach = damp(this.armReach, T.arm, 10, dt);
    this.tailWhipAmt = damp(this.tailWhipAmt, T.whip, T.whip > this.tailWhipAmt ? 22 : 6, dt);
    this.quillRaise = damp(this.quillRaise, T.quill, 8, dt);
    this.roll = damp(this.roll, T.roll, 6, dt);
    this.flinch = Math.max(0, this.flinch - dt * 3);
    if (this.state !== 'pounce' && this.state !== 'retreat' && this.state !== 'stun' && this.state !== 'intro') this.lift = damp(this.lift, 0, 8, dt);

    const ph = this.gaitPhase;
    const run = this.runAmt * (1 - this.air);
    const h0 = poseTheroLeg(s, r.legs[0], ph, run, this.crouch + this.roll * 0.4, this.air, 0.6);
    const h1 = poseTheroLeg(s, r.legs[1], ph + Math.PI, run, this.crouch + this.roll * 0.2, this.air, 0.6);
    r.pelvis.position.y = lerp(Math.max(h0, h1), r.hipH, this.air);
    this.model.position.y = this.lift - this.roll * 0.55;
    this.model.rotation.z = this.roll * 1.25 * this.flinchSide - this.flinchSide * this.flinch * 0.05;

    // Breathing.
    const b = Math.sin(this.breathT * (this.state === 'watch' ? 2.6 : 1.8)) * (1 - run * 0.7);
    r.torso.scale.set(1 + b * 0.035, 1 + b * 0.045, 1);

    const bob2 = Math.sin(ph * 2);
    const fl = this.flinch;
    r.body.rotation.x = 0.04 + this.crouch * 0.2 - this.rear * 0.55 - this.recoil * 0.25 + run * 0.08 + bob2 * 0.03 * run - fl * 0.1;
    r.body.rotation.z = Math.sin(ph) * 0.05 * run - this.flinchSide * fl * 0.18;
    const wig = this.wiggle > 0 ? Math.sin(this.age * 15) * 0.09 * this.wiggle : 0;
    r.pelvis.rotation.y = Math.sin(ph) * 0.07 * run + wig;
    r.legs[0].hip.rotation.z = 0.3 * this.air;
    r.legs[1].hip.rotation.z = -0.3 * this.air;

    // Head tracks the camera.
    this.playerPos(_p);
    const pos = this.root.position;
    const yawTo = angleDelta(this.root.rotation.y, Math.atan2(_p.x - pos.x, _p.z - pos.z));
    const headY = r.headH * S + this.lift;
    const dist = Math.max(1, Math.hypot(_p.x - pos.x, _p.z - pos.z));
    const pitchTo = Math.atan2(this.world.rig.eyeHeight - headY, dist);
    this.lookYaw = damp(this.lookYaw, clamp(yawTo, -1.1, 1.1), 7, dt);
    this.lookPitch = damp(this.lookPitch, clamp(pitchTo, -0.8, 0.8), 5, dt);
    const nr = s.neck.rest;
    for (let i = 0; i < r.neck.length; i++) {
      const firstN = i === 0;
      r.neck[i].rotation.x =
        nr[i] +
        this.dip * (firstN ? 0.55 : -0.3) -
        this.rear * (firstN ? 0.55 : 0.4) -
        this.lookPitch * 0.25 +
        this.air * (firstN ? 0.7 : -0.15) +
        this.recoil * (firstN ? -0.25 : 0.1) -
        bob2 * 0.05 * run;
      r.neck[i].rotation.y = this.lookYaw * 0.3;
    }
    r.head.rotation.x = s.headRest - this.lookPitch * 0.45 - this.dip * 0.15 + this.rear * 0.35 - this.air * 0.15 - fl * 0.35 - this.recoil * 0.25;
    r.head.rotation.y = this.lookYaw * 0.35;
    r.head.rotation.z = this.recoil * 0.2 * this.flinchSide + (this.state === 'roar' ? Math.sin(this.age * 22) * 0.06 : 0);
    if (r.jaw) r.jaw.rotation.x = this.jawOpen * 0.85;

    // Tail: lashing while hunting, whips on attack.
    const tl = r.tail;
    for (let i = 0; i < tl.length; i++) {
      tl[i].rotation.x = (s.tail.rest[i] ?? 0) + this.tailLift * (i === 0 ? 0.25 : 0.05) + bob2 * 0.035 * run * (i + 1) * 0.5 + this.air * (i === 0 ? 0.2 : 0.04);
      tl[i].rotation.y =
        this.tailWhipAmt * this.sideSign * (0.25 + i * 0.12) +
        Math.sin(this.age * (1.6 + this.tailLift * 2) - i * 0.7) * (0.06 + this.tailLift * 0.12) * (1 - run * 0.5) +
        Math.sin(ph - i * 0.8) * 0.06 * run;
    }
    // Arms + scythes.
    for (let i = 0; i < r.arms.length; i++) {
      const a = r.arms[i];
      const side = i === 0 ? 1 : -1;
      a.shoulder.rotation.x = ARM_REST.shoulder + Math.sin(ph + i * Math.PI) * 0.15 * run - this.armReach * 1.3 + this.recoil * 0.4 - this.rear * 0.6;
      a.shoulder.rotation.z = side * (0.08 + this.armReach * 0.45 + this.rear * 0.3);
      a.elbow.rotation.x = ARM_REST.elbow + this.armReach * 1.0 + this.rear * 0.4;
    }
    // Quills bristle.
    for (let i = 0; i < this.quillPivots.length; i++) {
      const q = this.quillPivots[i];
      const rattle = this.quillRaise > 0.3 ? Math.sin(this.age * 40 + i) * 0.04 * this.quillRaise : 0;
      q.rotation.x = -this.quillRaise * 0.25 + rattle;
      q.scale.set(1, 1 + this.quillRaise * 0.45, 1 + this.quillRaise * 0.2);
    }
  }

  // ─── Death ─────────────────────────────────────────────────────────────
  //
  // Rears up screaming (slow-mo), then either
  //  • collapses where it stands — staggering back a couple of metres onto its
  //    side, close to the camera — or
  //  • when an intact tank pane is within ~12 m, makes a last convulsive leap
  //    back into its tank and crashes through the glass.
  // The stripes stutter out and the eyes fade last.

  protected override onDeath(_hit: ShotHit | null): void {
    this.telegraph = null;
    this.winding = false;
    const w = this.world;
    const lab = labs(w);
    const p = this.root.position;
    this.deathFrom.copy(p);
    this.deathYaw = this.root.rotation.y;
    this.deathSide = this.flinchSide >= 0 ? 1 : -1;
    this.downAlready = this.roll > 0.5;
    this.deathRoll0 = this.model.rotation.z;
    this.deathLift = this.lift;
    this.deathRear = this.downAlready ? 0 : 0.8;
    this.fellAt = -1;
    this.crashed = false;
    // Nearest intact pane.
    let best = -1;
    let bd = Infinity;
    const panes = lab?.panes ?? [];
    for (let i = 0; i < panes.length; i++) {
      if (panes[i].broken) continue;
      const dd = Math.hypot(HALL.paneXs[i] - p.x, HALL.tankZ + 1 - p.z);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    this.deathPane = bd <= 12 && !this.downAlready ? best : -1;
    if (this.deathPane >= 0) {
      this.deathTo.set(HALL.paneXs[best], 0, HALL.tankZ - 2.6);
      this.deathReach = this.deathRear + clamp(bd / 9, 0.55, 1.3);
      this.deathDuration = this.deathReach + 3.6;
    } else {
      this.playerPos(_p);
      _v.subVectors(p, _p).setY(0);
      if (_v.lengthSq() < 1e-4) _v.set(0, 0, -1);
      _v.normalize();
      this.deathTo.copy(p).addScaledVector(_v, this.downAlready ? 0.4 : 2.2);
      this.clampArena(this.deathTo);
      this.deathDuration = this.deathRear + 4.6;
    }
    this.cloakTarget = 0;
    w.audio.play('raptor_screech', { volume: 1, pitch: 0.42 });
    w.audio.play('dino_die', { volume: 1, pitch: 0.8 });
    w.audio.play('boss_roar', { volume: 0.8, pitch: 1.4 });
    w.rig.shake(0.4);
    if (lab) lab.alarm = 0;
  }

  /** Death pose (joints): rearing scream → backward stagger → down and twitching. */
  private poseDeath(dt: number) {
    const r = this.r;
    const k = 1 - Math.exp(-dt * 7);
    const t = this.stateTime;
    const down = this.fellAt >= 0 || this.downAlready || this.crashed;
    const rearing = !down && t < this.deathRear;
    const thrash = down ? Math.exp(-Math.max(0, t - Math.max(0, this.fellAt)) * 0.8) : 1;
    for (let i = 0; i < r.neck.length; i++) {
      const goal = rearing ? (i === 0 ? 0.85 : 0.7) : down ? (i === 0 ? 0.15 : -0.1) : i === 0 ? 0.5 : 0.6;
      r.neck[i].rotation.x += (SPEC.neck.rest[i] - goal + (down ? Math.sin(t * 9 + i) * 0.12 * thrash : 0) - r.neck[i].rotation.x) * k;
      r.neck[i].rotation.y += (0 - r.neck[i].rotation.y) * k;
    }
    r.head.rotation.x += (SPEC.headRest - (rearing ? 1.0 : down ? 0.05 : 0.7) - r.head.rotation.x) * k;
    r.head.rotation.z += ((rearing ? Math.sin(t * 24) * 0.08 : 0) - r.head.rotation.z) * k;
    if (r.jaw) r.jaw.rotation.x += ((rearing ? 0.95 : down ? 0.45 + 0.2 * thrash * Math.max(0, Math.sin(t * 6)) : 0.75) - r.jaw.rotation.x) * k;
    r.body.rotation.x += ((rearing ? -0.55 : down ? 0 : -0.2) - r.body.rotation.x) * k;
    for (let i = 0; i < r.arms.length; i++) {
      const a = r.arms[i];
      a.shoulder.rotation.x += (-0.4 + Math.sin(t * 12 + i * 2) * 0.45 * thrash - a.shoulder.rotation.x) * k;
      a.elbow.rotation.x += (ARM_REST.elbow + 0.6 - a.elbow.rotation.x) * k;
    }
    if (!down) {
      // Stumbling BACKWARDS: the step cycle runs in reverse.
      const ph = -t * 5.5;
      const sway = Math.sin(t * 7) * 0.3;
      poseTheroLeg(SPEC, r.legs[0], ph, rearing ? 0.25 : 0.65, 0.35 + sway * 0.3, 0, 0.5);
      poseTheroLeg(SPEC, r.legs[1], ph + Math.PI, rearing ? 0.25 : 0.65, 0.35 - sway * 0.3, 0, 0.5);
    } else {
      // Down: legs kick, slowing.
      poseTheroLeg(SPEC, r.legs[0], t * 9, 0.6 * thrash, 0.45, 0.2, 0.5);
      poseTheroLeg(SPEC, r.legs[1], t * 9 + 2.1, 0.6 * thrash, 0.55, 0.2, 0.5);
    }
    for (let i = 0; i < r.tail.length; i++) {
      r.tail[i].rotation.y += (Math.sin(t * (down ? 7 : 5) - i) * (0.08 + 0.22 * thrash) - r.tail[i].rotation.y) * k;
    }
    for (const q of this.quillPivots) {
      const flare = rearing ? 1 : 0;
      q.rotation.x += (-flare * 0.25 - q.rotation.x) * k;
      q.scale.y += (1 + flare * 0.45 - q.scale.y) * k;
    }
  }

  protected override updateDeath(dt: number): boolean {
    this.root.rotation.y += angleDelta(this.root.rotation.y, this.deathYaw) * Math.min(1, dt * 3);
    if (this.deathPane >= 0) this.deathThroughGlass(dt);
    else this.deathCollapse(dt);
    // Out of sight at the very end (the stage clears as the body is removed).
    if (this.stateTime > this.deathDuration - 0.9) this.model.position.y -= dt * 0.5;
    return this.stateTime > this.deathDuration;
  }

  private deathFootfall(t: number, dt: number) {
    if (Math.floor((t - dt) * 2.6) !== Math.floor(t * 2.6)) {
      this.world.audio.play('stomp', { volume: 0.8, pitch: 0.9 });
      this.world.fx.blood(this.r.chest.getWorldPosition(_v), null, { color: this.bloodColor, amount: 1.4 });
    }
  }

  /** Stagger back a couple of metres and crash down on its side, close to the camera. */
  private deathCollapse(dt: number) {
    const w = this.world;
    const t = this.stateTime;
    const p = this.root.position;
    const fallStart = this.deathRear + (this.downAlready ? 0 : 1.0);
    const fallDur = 0.5;
    this.deathLift = damp(this.deathLift, 0, 6, dt);
    if (t < fallStart) {
      const k = clamp((t - this.deathRear * 0.5) / (fallStart - this.deathRear * 0.5), 0, 1);
      const e = k * k * (3 - 2 * k);
      p.x = lerp(this.deathFrom.x, this.deathTo.x, e);
      p.z = lerp(this.deathFrom.z, this.deathTo.z, e);
      this.model.rotation.z = lerp(this.deathRoll0, 0, clamp(t * 3, 0, 1)) + Math.sin(t * 6) * 0.1;
      this.model.rotation.x = 0;
      this.model.position.y = this.deathLift;
      if (t > this.deathRear) this.deathFootfall(t, dt);
      return;
    }
    const roll0 = this.downAlready ? this.deathRoll0 : Math.sin(fallStart * 6) * 0.1;
    const goal = (this.downAlready ? Math.sign(this.deathRoll0 || 1) : this.deathSide) * 1.32;
    const k = clamp((t - fallStart) / fallDur, 0, 1);
    const e = k * k;
    this.model.rotation.z = lerp(roll0, goal, e);
    this.model.position.y = lerp(this.deathLift, -0.55, e);
    if (k >= 1 && this.fellAt < 0) {
      this.fellAt = t;
      w.audio.play('stomp', { volume: 1, pitch: 0.55 });
      w.audio.play('crash', { volume: 0.7, pitch: 0.45 });
      w.fx.dust(this.worldPos(_v), 3.2, 0x8a8a8a);
      w.fx.dust(this.r.chest.getWorldPosition(_v).setY(0.3), 2.2, 0x8a8a8a);
      if (!this.downAlready) {
        w.rig.shake(0.75);
        w.hitStop(0.08);
        w.slowMo(0.45, 0.7);
      } else w.rig.shake(0.3);
    }
    if (this.fellAt >= 0) {
      // Settle with a small bounce.
      const tb = t - this.fellAt;
      this.model.rotation.z = goal - Math.sin(Math.min(1, tb / 0.45) * Math.PI) * 0.12 * Math.sign(goal);
    }
  }

  /** A last convulsive leap back into its tank, through the glass. */
  private deathThroughGlass(dt: number) {
    const w = this.world;
    const t = this.stateTime;
    const p = this.root.position;
    const reach = this.deathReach;
    this.deathLift = damp(this.deathLift, 0, 6, dt);
    if (!this.crashed) {
      if (t < this.deathRear) {
        this.model.position.y = this.deathLift;
        this.model.rotation.z = lerp(this.deathRoll0, 0, clamp(t * 3, 0, 1)) + Math.sin(t * 6) * 0.1;
        return;
      }
      const k = clamp((t - this.deathRear) / (reach - this.deathRear), 0, 1);
      const e = k * k * (3 - 2 * k);
      const glassZ = HALL.tankZ + 1.0;
      p.x = lerp(this.deathFrom.x, this.deathTo.x, e);
      p.z = lerp(this.deathFrom.z, glassZ, e);
      this.model.position.y = this.deathLift + Math.sin(Math.PI * k) * 1.3;
      this.model.rotation.z = Math.sin(t * 6) * 0.12;
      this.model.rotation.x = -e * 0.25;
      const lab = labs(w);
      if (lab && p.z < HALL.tankZ + 3.4 && !lab.panes[this.deathPane].broken) {
        lab.panes[this.deathPane].shatter(w, this.worldPos(_v));
        w.slowMo(0.35, 1.0);
      }
      if (k >= 1) {
        this.crashed = true;
        w.audio.play('crash', { volume: 1, pitch: 0.6 });
        w.rig.shake(0.8);
        this.deathFrom.copy(p);
      }
      return;
    }
    // Through the glass: topple backwards into the tank, sliding on the wet floor.
    const tc = t - reach;
    const k = clamp(tc / 0.9, 0, 1);
    const e = k * k;
    p.x = lerp(this.deathFrom.x, this.deathTo.x, Math.min(1, tc / 1.4));
    p.z = lerp(this.deathFrom.z, this.deathTo.z, Math.min(1, tc / 1.4));
    this.model.rotation.x = -0.25 - e * 1.1;
    this.model.rotation.z = damp(this.model.rotation.z, 0.4, 3, dt);
    this.model.position.y = -e * 0.6;
    if (k >= 1 && tc - dt < 0.9) {
      this.fellAt = t;
      w.audio.play('stomp', { volume: 1, pitch: 0.6 });
      w.audio.play('splash', { volume: 0.8, pitch: 0.6 });
      w.fx.dust(this.worldPos(_v), 3, 0x6a8aa0);
      w.rig.shake(0.6);
    }
  }
}

registerEnemy('specimen_x', (w, s) => new SpecimenX(w, s));

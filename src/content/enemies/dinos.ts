import * as THREE from 'three';
import { registerEnemy } from '../registry';
import { Kit } from '../kit/ModelKit';
import { Projectile } from '../../gameplay/Projectile';
import type { ShotHit } from '../../gameplay/Entity';
import { angleDelta, clamp, damp, lerp, TAU } from '../../core/math';
import {
  ARM_REST,
  Dino,
  PTERO_PAL,
  Sculpt,
  TRIKE_PAL,
  buildPtero,
  buildTheropod,
  buildTrike,
  dgeo,
  hash3,
  poseTheroLeg,
  skinMat,
  type Palette,
  type PaintFn,
  type PteroRig,
  type TheroRig,
  type TheroSpec,
  type TrikeRig,
} from './dinoKit';

/**
 * PRIMAL ISLAND dinosaur roster:
 *   compy  – Compsognathus pack hunter: tiny, skittering zig-zags and hops, leaps at your face.
 *   raptor – Velociraptor: flanks, crouches (wiggle!) and POUNCES. Variants tan/green/blue/red(alpha).
 *   dilo   – Dilophosaurus: keeps its distance, fans a bright frill (weak point) and spits venom.
 *   ptero  – Pteranodon: circles high, telegraphed swoop at the camera, climbs back up.
 *   trike  – Triceratops: armoured frill/horns, paws the ground, then charges.
 * Models are built by `dinoKit` from painted low-poly primitives.
 */

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

// ─── Theropod base (compy / raptor / dilo) ─────────────────────────────────

interface PoseTargets {
  crouch: number;
  air: number;
  jaw: number;
  dip: number;
  rear: number;
  tail: number;
  recoil: number;
  arm: number;
}

abstract class Theropod extends Dino {
  protected r!: TheroRig;
  protected spec!: TheroSpec;
  protected phase = 0;
  protected seed = 0;
  protected runAmt = 0;
  // Smoothed pose parameters.
  protected crouch = 0;
  protected air = 0;
  protected jawOpen = 0;
  protected dip = 0;
  protected rear = 0;
  protected tailLift = 0;
  protected recoil = 0;
  protected armReach = 0;
  protected lookYaw = 0;
  protected lookPitch = 0;
  protected readonly tg: PoseTargets = { crouch: 0, air: 0, jaw: 0, dip: 0, rear: 0, tail: 0, recoil: 0, arm: 0 };
  // Gait.
  protected strideLen = 1.6;
  protected maxFreq = 3.2;
  protected runRef = 4;
  protected stepAmp = 0.55;
  protected bodyPitch = 0.04;
  protected jawMax = 0.7;
  protected tailStiff = 1;
  // Flanking weave while approaching.
  protected weaveAmp = 2;
  protected weaveFreq = 1.2;
  protected prowlDir = 1;
  protected prowlT = 0;
  // Pounce.
  protected windupShare = 0.66;
  protected pounceDur = 0.55;
  protected leapH = 0.85;
  protected retreatDist = 5.5;
  protected reachPad = 0.45;
  protected readonly pFrom = new THREE.Vector3();
  protected readonly pDir = new THREE.Vector3();
  protected pLift0 = 0;
  protected pEndLift = 0;
  protected reach = 1.6;
  protected baseStagger = 0.45;
  protected modelScale = 1;
  protected leapPitch = 0;
  /** Body yaw offset from the player while crouching/prowling (radians). */
  protected stalkAngle = 0.55;

  protected abstract makeSpec(): TheroSpec;

  protected override build() {
    this.spec = this.makeSpec();
    this.r = buildTheropod(this.model, this.spec);
    this.model.scale.setScalar(this.modelScale);
    for (const m of this.r.meshes.head) this.hitbox(m, 'head');
    for (const m of this.r.meshes.torso) this.hitbox(m, 'torso');
    for (const m of this.r.meshes.limb) this.hitbox(m, 'limb');
    for (const m of this.r.meshes.tail) this.hitbox(m, 'tail');
    this.anchor = this.r.chest;
    this.headAnchor = this.r.headMesh;
    this.seed = this.world.rng.next() * 100;
    this.phase = this.seed;
    this.prowlDir = this.world.rng.chance(0.5) ? 1 : -1;
    this.reach = (this.r.headFwd + this.reachPad) * this.modelScale;
    this.lieHeight = this.spec.hips[0] * 0.85 * this.modelScale;
    this.baseStagger = this.staggerTime;
  }

  // ── AI ──

  /** Multiplier on speed while advancing (compys skitter). */
  protected speedFactor(): number {
    return 1;
  }

  protected override advanceUpdate(dt: number) {
    this.playerPos(_p);
    const pos = this.root.position;
    _d.set(pos.x - _p.x, 0, pos.z - _p.z);
    const dist = _d.length();
    if (dist > 1e-3) _d.divideScalar(dist);
    else _d.set(0, 0, 1);
    if (dist > this.attackRange + 0.25) {
      // Approach with a flanking weave that fades out near striking range.
      const w = this.weaveAmp * Math.sin(this.age * this.weaveFreq + this.seed) * clamp((dist - this.attackRange) / 5, 0, 1);
      _v.set(_p.x - _d.z * w, 0, _p.z + _d.x * w);
      this.moveToward(_v, this.speed * this.speedFactor(), dt, this.attackRange);
      this.separate(dt);
      return;
    }
    this.faceToward(_p, dt);
    if (!this.onScreen()) {
      // Off to the side — step toward the centre of the view so attacks are always visible.
      this.world.camera.getWorldDirection(_v).setY(0).normalize();
      _v.multiplyScalar(this.attackRange).add(this.world.rig.space.position);
      if (this.frame === 'rig') this.world.rig.space.worldToLocal(_v);
      this.moveToward(_v, this.speed * 0.8, dt);
      return;
    }
    if (this.cooldown <= 0 && this.takeSlot()) {
      this.setState('windup');
      return;
    }
    this.prowl(dt, dist);
  }

  /** Waiting for an opening: pace sideways around the player at striking range. */
  protected prowl(dt: number, dist: number) {
    this.prowlT -= dt;
    if (this.prowlT <= 0) {
      this.prowlT = this.world.rng.range(1.2, 2.6);
      this.prowlDir = this.world.rng.chance(0.65) ? -this.prowlDir : this.prowlDir;
    }
    if (!this.onScreen(0.7) && this.prowlT < 2.2) {
      // Drifting off the edge of the screen: turn back toward the middle.
      this.prowlDir = -this.prowlDir;
      this.prowlT = 2.6;
    }
    const a = Math.atan2(_d.x, _d.z) + this.prowlDir * 0.6;
    const rr = lerp(dist, this.attackRange, 0.5);
    _v.set(_p.x + Math.sin(a) * rr, 0, _p.z + Math.cos(a) * rr);
    this.moveToward(_v, this.speed * 0.3, dt);
    this.separate(dt);
    // Body angled along the pacing direction, head (via look-at) on the player.
    this.faceTowardOffset(_p, dt, -this.prowlDir * this.stalkAngle, 8);
  }

  protected override windupUpdate(dt: number) {
    this.playerPos(_p);
    // Stalking crouch: body angled off-axis (readable 3/4 silhouette), head locked on the camera.
    this.faceTowardOffset(_p, dt, this.stalkAngle * this.prowlDir, 8);
    if (this.telegraph) this.telegraph.progress = clamp(this.stateTime / this.windup, 0, 1) * this.windupShare;
    if (this.stateTime >= this.windup) this.startPounce();
  }

  protected faceTowardOffset(target: THREE.Vector3, dt: number, offset: number, rate: number) {
    const yaw = Math.atan2(target.x - this.root.position.x, target.z - this.root.position.z) + offset;
    _w.set(this.root.position.x + Math.sin(yaw), 0, this.root.position.z + Math.cos(yaw));
    this.faceToward(_w, dt, rate);
  }

  protected startPounce() {
    if (!this.enterAttack('pounce')) {
      this.setState('advance');
      return;
    }
    this.telegraph = { progress: this.windupShare, anchor: this.anchor, radius: this.telegraphRadius };
    this.pFrom.copy(this.root.position);
    this.playerPos(_p);
    this.pDir.set(this.pFrom.x - _p.x, 0, this.pFrom.z - _p.z);
    if (this.pDir.lengthSq() < 1e-4) this.pDir.set(0, 0, 1);
    this.pDir.normalize();
    this.pLift0 = this.lift;
    this.pEndLift = Math.max(0, this.world.rig.eyeHeight - this.r.headH * this.modelScale - 0.1);
    this.onPounce();
  }

  /** Leap sound etc. */
  protected onPounce(): void {
    this.play(this.sfxAttack, 1);
  }

  protected pounceUpdate(dt: number) {
    const k = clamp(this.stateTime / this.pounceDur, 0, 1);
    this.playerPos(_p);
    const tx = _p.x + this.pDir.x * this.reach;
    const tz = _p.z + this.pDir.z * this.reach;
    this.root.position.x = lerp(this.pFrom.x, tx, k);
    this.root.position.z = lerp(this.pFrom.z, tz, k);
    this.lift = lerp(this.pLift0, this.pEndLift, k) + Math.sin(Math.PI * k) * this.leapH;
    // Pitch along the arc: nose up on take-off, diving onto the target at the end.
    const dLift = this.pEndLift - this.pLift0 + Math.PI * this.leapH * Math.cos(Math.PI * k);
    const dHor = Math.hypot(tx - this.pFrom.x, tz - this.pFrom.z) + 0.01;
    this.leapPitch = -Math.atan2(dLift, dHor) * 0.4;
    this.root.rotation.y += angleDelta(this.root.rotation.y, Math.atan2(-this.pDir.x, -this.pDir.z)) * (1 - Math.exp(-14 * dt));
    if (this.telegraph) this.telegraph.progress = this.windupShare + (1 - this.windupShare) * k;
    if (k >= 1) {
      this.telegraph = null;
      this.world.hurtPlayer(this.damage, this.name);
      this.startRetreat();
    }
  }

  protected startRetreat() {
    this.setState('retreat');
    this.pFrom.copy(this.root.position);
    this.pLift0 = this.lift;
  }

  protected retreatUpdate(dt: number) {
    const dur = 0.55;
    const k = clamp(this.stateTime / dur, 0, 1);
    this.playerPos(_p);
    const tx = _p.x + this.pDir.x * this.retreatDist;
    const tz = _p.z + this.pDir.z * this.retreatDist;
    const e = 1 - (1 - k) * (1 - k);
    this.root.position.x = lerp(this.pFrom.x, tx, e);
    this.root.position.z = lerp(this.pFrom.z, tz, e);
    this.lift = lerp(this.pLift0, 0, k) + Math.sin(Math.PI * k) * 0.5 * this.modelScale;
    this.faceToward(_p, dt, 10);
    if (k >= 1) {
      this.lift = 0;
      this.onLand();
      this.setState('advance');
      this.cooldown = this.world.rng.range(1.2, 2.4);
    }
  }

  protected override customUpdate(dt: number): void {
    if (this.state === 'pounce') this.pounceUpdate(dt);
    else if (this.state === 'retreat') this.retreatUpdate(dt);
  }

  override stagger() {
    const wasAir = this.state === 'pounce' || this.state === 'retreat';
    super.stagger();
    if (this.state !== 'stagger') return;
    this.staggerTime = this.baseStagger;
    if (wasAir && this.lift > 0.05) {
      // Shot out of the air: knocked back along the shot, tumbling down.
      _v.set(0, 0, 0);
      if (this.lastHit) {
        _v.copy(this.lastHit.dir).setY(0).normalize();
        if (this.frame === 'rig') _v.applyQuaternion(_q.copy(this.world.rig.space.quaternion).invert());
      }
      this.launch(_v.x * 3.5, 2.2, _v.z * 3.5);
      this.staggerTime = this.baseStagger * 1.8;
    }
  }

  // ── Animation ──

  protected stateTargets(T: PoseTargets) {
    T.crouch = 0;
    T.air = 0;
    T.jaw = 0.06;
    T.dip = 0;
    T.rear = 0;
    T.tail = 0;
    T.recoil = 0;
    T.arm = 0;
    const t = this.stateTime;
    switch (this.state) {
      case 'windup': {
        const k = clamp(t / this.windup, 0, 1);
        T.crouch = 0.3 + 0.3 * k;
        T.jaw = 0.25 + 0.55 * k + Math.sin(t * 34) * 0.08 * k;
        T.dip = 0.7;
        T.tail = 0.35;
        T.arm = 0.25;
        break;
      }
      case 'pounce':
        T.air = 1;
        T.jaw = 1;
        T.arm = 1;
        T.dip = 0.25;
        break;
      case 'retreat':
        T.air = 0.6;
        T.jaw = 0.3;
        T.tail = 0.2;
        break;
      case 'stagger':
        T.recoil = 1;
        T.jaw = 0.6;
        break;
      case 'entry': {
        const e = this.spawn.entry;
        if ((e === 'leap' && t < 0.85) || (e === 'drop' && this.root.position.y > this.groundY(this.root.position.x, this.root.position.z) + 0.1)) {
          T.air = 0.85;
          T.jaw = 0.7;
          T.arm = 0.7;
        }
        break;
      }
      case 'advance': {
        // Occasional jaw snaps while hunting.
        const s = (this.age * 0.45 + this.seed) % 1;
        if (s < 0.08) T.jaw = 0.55;
        break;
      }
    }
    if (this.airborne) {
      T.air = Math.max(T.air, 0.6);
      T.recoil = Math.max(T.recoil, 0.7);
    }
  }

  protected pose(dt: number) {
    const r = this.r;
    const s = this.spec;
    if (this.state === 'dying') {
      this.poseDeath(dt);
      return;
    }
    const gs = this.groundSpeed;
    const freq = gs > 0.15 ? Math.min(this.maxFreq, gs / this.strideLen + 0.35) : 0;
    this.phase += dt * freq * TAU;
    this.runAmt = damp(this.runAmt, clamp(gs / this.runRef, 0, 1), 8, dt);

    const T = this.tg;
    this.stateTargets(T);
    this.crouch = damp(this.crouch, T.crouch, 10, dt);
    this.air = damp(this.air, T.air, 12, dt);
    this.jawOpen = damp(this.jawOpen, T.jaw, 16, dt);
    this.dip = damp(this.dip, T.dip, 7, dt);
    this.rear = damp(this.rear, T.rear, 7, dt);
    this.tailLift = damp(this.tailLift, T.tail, 6, dt);
    this.recoil = damp(this.recoil, T.recoil, 14, dt);
    this.armReach = damp(this.armReach, T.arm, 10, dt);

    const ph = this.phase;
    const run = this.runAmt * (1 - this.air);
    // Stumble: the leg on the hit side buckles.
    const st0 = this.recoil * (this.flinchSide > 0 ? 0.45 : 0.1);
    const st1 = this.recoil * (this.flinchSide > 0 ? 0.1 : 0.45);
    const h0 = poseTheroLeg(s, r.legs[0], ph, run, this.crouch + st0, this.air, this.stepAmp);
    const h1 = poseTheroLeg(s, r.legs[1], ph + Math.PI, run, this.crouch + st1, this.air, this.stepAmp);
    r.pelvis.position.y = lerp(Math.max(h0, h1), r.hipH, this.air);
    if (this.state !== 'pounce') this.leapPitch = damp(this.leapPitch, 0, 6, dt);
    r.pelvis.rotation.x = this.leapPitch * this.air;

    // Breathing (heavier right after an attack).
    const breathRate = this.cooldown > 0 ? 4.5 : 2.2;
    const b = Math.sin(this.age * breathRate + this.seed) * (1 - run * 0.7);
    r.torso.scale.set(1 + b * 0.03, 1 + b * 0.04, 1);

    const bob2 = Math.sin(ph * 2);
    const fl = this.flinch;
    r.body.rotation.x =
      this.bodyPitch + this.crouch * 0.2 - this.recoil * 0.32 - this.air * 0.1 + run * 0.06 + bob2 * 0.03 * run - fl * 0.12;
    r.body.rotation.z = Math.sin(ph) * 0.05 * run - this.flinchSide * fl * 0.22;
    let wiggle = 0;
    if (this.state === 'windup') wiggle = Math.sin(this.stateTime * 14) * 0.09 * this.crouch;
    r.pelvis.rotation.y = Math.sin(ph) * 0.07 * run + wiggle;
    r.pelvis.rotation.z = -this.flinchSide * fl * 0.08;
    // Legs splay outward in the leap: claws spread at the camera.
    r.legs[0].hip.rotation.z = 0.32 * this.air;
    r.legs[1].hip.rotation.z = -0.32 * this.air;

    // Head tracking toward the camera.
    this.playerPos(_p);
    const pos = this.root.position;
    const yawTo = angleDelta(this.root.rotation.y, Math.atan2(_p.x - pos.x, _p.z - pos.z));
    const headY = r.headH * this.modelScale + this.lift;
    const pitchTo = Math.atan2(this.world.rig.eyeHeight - headY, Math.max(1, this.distToPlayer));
    this.lookYaw = damp(this.lookYaw, clamp(yawTo, -1.1, 1.1), 7, dt);
    this.lookPitch = damp(this.lookPitch, clamp(pitchTo, -0.8, 0.8), 5, dt);
    const n = r.neck;
    const nr = s.neck.rest;
    const bobComp = -bob2 * 0.05 * run;
    for (let i = 0; i < n.length; i++) {
      const first = i === 0;
      n[i].rotation.x =
        nr[i] +
        this.dip * (first ? 0.55 : -0.3) -
        this.rear * (first ? 0.45 : 0.35) -
        this.lookPitch * 0.25 +
        bobComp +
        this.air * (first ? 0.45 : -0.25) +
        this.recoil * (first ? -0.25 : 0.1);
      n[i].rotation.y = this.lookYaw * 0.3;
    }
    r.head.rotation.x =
      s.headRest -
      this.lookPitch * 0.45 -
      this.dip * 0.15 +
      this.rear * 0.25 -
      this.air * 0.15 -
      fl * (this.flinchHead ? 0.6 : 0.15) -
      this.recoil * 0.25;
    r.head.rotation.y = this.lookYaw * 0.35;
    r.head.rotation.z = this.recoil * 0.25 * this.flinchSide;
    if (r.jaw) r.jaw.rotation.x = this.jawOpen * this.jawMax;

    // Tail: held out stiffly, counter-swaying with the stride, lagging behind turns.
    const tl = r.tail;
    const ts = this.tailStiff;
    for (let i = 0; i < tl.length; i++) {
      tl[i].rotation.x =
        (s.tail.rest[i] ?? 0) + this.tailLift * (i === 0 ? 0.28 : 0.06) + bob2 * 0.035 * run * (i + 1) * 0.5 + this.air * (i === 0 ? 0.2 : 0.04) - this.recoil * 0.05 * i;
      tl[i].rotation.y =
        this.tailSwing * (0.3 + i * 0.18) +
        (Math.sin(ph - i * 0.8) * 0.06 * run + Math.sin(this.age * 1.3 + this.seed - i * 0.7) * 0.07 * (1 - run)) / ts +
        (this.state === 'windup' ? Math.sin(this.stateTime * 9 - i) * 0.08 * this.crouch : 0);
    }

    // Arms.
    for (let i = 0; i < r.arms.length; i++) {
      const a = r.arms[i];
      const side = i === 0 ? 1 : -1;
      a.shoulder.rotation.x = ARM_REST.shoulder + Math.sin(ph + i * Math.PI) * 0.15 * run - this.armReach * 1.25 + this.recoil * 0.4;
      a.shoulder.rotation.z = side * (0.06 + this.armReach * 0.4);
      a.elbow.rotation.x = ARM_REST.elbow + this.armReach * 0.95;
    }
  }

  protected poseDeath(dt: number) {
    const r = this.r;
    const s = this.spec;
    const t = this.stateTime;
    const k = 1 - Math.exp(-dt * 7);
    for (let i = 0; i < r.legs.length; i++) {
      const leg = r.legs[i];
      // Decaying twitch bursts.
      const burst = Math.max(0, Math.sin(t * 4.1 + i * 2.3));
      const tw = Math.exp(-t * 0.9) * burst * burst * burst * Math.sin(t * 33 + i * 5);
      leg.hip.rotation.x += (-0.3 + i * 0.45 + tw * 0.4 - leg.hip.rotation.x) * k;
      leg.knee.rotation.x += (0.75 + tw * 0.6 - leg.knee.rotation.x) * k;
      leg.ankle.rotation.x += (-0.55 - tw * 0.5 - leg.ankle.rotation.x) * k;
      leg.toe.rotation.x += (0.7 + tw * 0.4 - leg.toe.rotation.x) * k;
    }
    // Death arch: neck thrown back, jaw slack.
    for (let i = 0; i < r.neck.length; i++) {
      r.neck[i].rotation.x += (s.neck.rest[i] - (i === 0 ? 0.35 : 0.55) - r.neck[i].rotation.x) * k;
      r.neck[i].rotation.y += (0.15 - r.neck[i].rotation.y) * k;
    }
    r.head.rotation.x += (s.headRest - 0.65 - r.head.rotation.x) * k;
    if (r.jaw) r.jaw.rotation.x += (0.45 * this.jawMax - r.jaw.rotation.x) * k;
    for (let i = 0; i < r.tail.length; i++) {
      r.tail[i].rotation.x += (-0.08 - r.tail[i].rotation.x) * k;
      r.tail[i].rotation.y += (0.12 * this.deathSide - r.tail[i].rotation.y) * k;
    }
    r.body.rotation.x += (0 - r.body.rotation.x) * k;
    r.body.rotation.z += (0 - r.body.rotation.z) * k;
    for (const a of r.arms) {
      a.shoulder.rotation.x += (0.6 - a.shoulder.rotation.x) * k;
      a.elbow.rotation.x += (-0.6 - a.elbow.rotation.x) * k;
    }
  }
}

// ─── Compsognathus ─────────────────────────────────────────────────────────

const COMPY_PAL: Palette = {
  key: 'compy',
  base: 0x8c9c46,
  back: 0x56662a,
  belly: 0xece2a2,
  stripe: 0x46542a,
  accent: 0xa0a040,
  accent2: 0x6a6a2a,
  claw: 0x2a241c,
  teeth: 0xf0e8d0,
  mouth: 0x7a2a2a,
  eye: 0xffe060,
};

export class Compy extends Theropod {
  private hopT = 0;
  private hopDur = 0.26;
  private hopH = 0.18;

  protected override configure() {
    const rng = this.world.rng;
    this.name = 'compy';
    this.maxHp = 0.6;
    this.speed = rng.range(5, 6);
    this.attackRange = rng.range(4.2, 5.2);
    this.windup = 1.4;
    this.damage = 1;
    this.points = 50;
    this.staggerTime = 0.35;
    this.knockback = 0.35;
    this.telegraphRadius = 0.35;
    this.sfxHit = 'hit_flesh';
    this.sfxAttack = 'compy_chirp';
    this.sfxDie = null;
    this.bloodColor = 0x8a1010;
    this.idleCall = { name: 'compy_chirp', pitch: rng.range(0.9, 1.25), vol: 0.4, min: 2.5, max: 7 };
    this.strideLen = 0.42;
    this.maxFreq = 6;
    this.runRef = 2.5;
    this.stepAmp = 0.65;
    this.bodyPitch = -0.05;
    this.jawMax = 0.5;
    this.tailStiff = 0.6;
    this.weaveAmp = rng.range(1.8, 3);
    this.weaveFreq = rng.range(3, 4.5);
    this.windupShare = 0.75;
    this.pounceDur = 0.45;
    this.leapH = 0.45;
    this.retreatDist = 4;
    this.reachPad = 0.35;
    this.lieHeight = 0.04;
    this.deathTime = 2.3;
    this.sinkDepth = 0.25;
    this.landDust = 0.2;
    this.landShake = 0;
    this.toppleDur = 0.3;
    this.toppleDelay = 0.05;
  }

  protected makeSpec(): TheroSpec {
    return {
      key: 'compy',
      pal: COMPY_PAL,
      hipGap: 0.045,
      thigh: 0.12,
      shin: 0.14,
      meta: 0.09,
      toe: 0.05,
      legR: 0.4,
      footH: 0.014,
      hips: [0.072, 0.085, 0.11],
      torso: { len: 0.21, r0: [0.078, 0.092], r1: [0.058, 0.07], rise: 0.04 },
      neck: { lens: [0.16], r0: [0.04, 0.045], r1: [0.03, 0.034], rest: [-0.65] },
      headRest: 0.55,
      skull: { len: 0.07, r: [0.038, 0.042] },
      snout: { len: 0.07, r1: [0.016, 0.016], drop: 0.01 },
      jaw: { len: 0.095, r0: [0.028, 0.015], r1: [0.012, 0.008] },
      tail: { lens: [0.24, 0.26], r0: [0.058, 0.064], taper: 0.45, rest: [0.05, 0.03] },
      arm: { upper: 0.05, fore: 0.05, r: 0.012, claw: 0.02 },
      stripes: 16,
      teeth: 0,
      sickle: false,
      quills: 0,
      eyeSize: 0.022,
      compact: true,
    };
  }

  protected override speedFactor(): number {
    // Skittering bursts with short pauses.
    return 0.45 + 0.85 * Math.max(0, Math.sin(this.age * 6.5 + this.seed));
  }

  protected override advanceUpdate(dt: number) {
    super.advanceUpdate(dt);
    if (this.state !== 'advance') return;
    if (this.hopT > 0) {
      this.hopT -= dt;
      const k = 1 - Math.max(0, this.hopT) / this.hopDur;
      this.lift = Math.sin(Math.PI * k) * this.hopH;
      if (this.hopT <= 0) this.lift = 0;
    } else if (this.world.rng.chance(dt * 1.6)) {
      this.hopT = this.hopDur;
      this.hopH = this.world.rng.range(0.1, 0.25);
    }
  }

  override setState(s: string) {
    if (this.state === 'advance' && s !== 'advance' && this.hopT > 0) {
      this.hopT = 0;
      if (s !== 'pounce') this.lift = 0;
    }
    super.setState(s);
  }

  protected override prowl(dt: number, dist: number) {
    // Restless pack behaviour: scurry around faster while waiting for an opening.
    super.prowl(dt, dist);
    this.moveToward(_v, this.speed * 0.25 * this.speedFactor(), dt);
  }

  protected override onDamaged(hit: ShotHit, amount: number): void {
    super.onDamaged(hit, amount);
    // Tiny and fragile: any hit (even an SMG round to the tail) is lethal.
    this.hp = 0;
  }

  protected override onWindup() {
    this.sfx('compy_chirp', 0.8, 1.35);
  }

  protected override onPounce() {
    this.sfx('compy_chirp', 0.9, 1.6);
  }

  protected override onDeath(hit: ShotHit | null) {
    super.onDeath(hit);
    this.sfx('compy_chirp', 0.7, 0.6, 0.05);
    if (hit) this.world.fx.gibs(hit.point, 0x5a6a30, 3, 0.05);
  }
}

// ─── Velociraptor ──────────────────────────────────────────────────────────

const RAPTOR_PALS: Record<string, Palette> = {
  tan: {
    key: 'tan',
    base: 0xa47c4a,
    back: 0x6a4c2c,
    belly: 0xddc9a0,
    stripe: 0x5c3d21,
    accent: 0x8a5a2a,
    accent2: 0x5a3a1a,
    claw: 0x231b15,
    teeth: 0xf2ead2,
    mouth: 0x7a2424,
    eye: 0xffc030,
  },
  green: {
    key: 'green',
    base: 0x6a7c4c,
    back: 0x3c4a2c,
    belly: 0xc8c89e,
    stripe: 0x334028,
    accent: 0x9aa040,
    accent2: 0x4a5a22,
    claw: 0x1e1a14,
    teeth: 0xf2ead2,
    mouth: 0x7a2424,
    eye: 0xffd840,
  },
  blue: {
    key: 'blue',
    base: 0x7c848a,
    back: 0x4c545a,
    belly: 0xd4d0c4,
    stripe: 0x284a7a,
    accent: 0x3a6aa8,
    accent2: 0x24406a,
    claw: 0x1c1c1e,
    teeth: 0xf2ead2,
    mouth: 0x6a2228,
    eye: 0xffb020,
  },
  red: {
    key: 'red',
    base: 0x9c5634,
    back: 0x5e2a18,
    belly: 0xd8b28c,
    stripe: 0x3a1608,
    accent: 0xe0441a,
    accent2: 0xffa030,
    claw: 0x1c1410,
    teeth: 0xf2ead2,
    mouth: 0x6a1a18,
    eye: 0xffe040,
  },
};

export class Raptor extends Theropod {
  private variant = 'tan';

  protected override configure() {
    const rng = this.world.rng;
    const v = String(this.spawn.opts.variant ?? 'tan');
    this.variant = RAPTOR_PALS[v] ? v : 'tan';
    const alpha = this.variant === 'red';
    this.name = 'raptor';
    this.maxHp = alpha ? 4 : 3;
    this.speed = rng.range(5, 6);
    this.attackRange = rng.range(6, 8);
    this.windup = 1.1;
    this.damage = 1;
    this.points = alpha ? 300 : 200;
    this.staggerTime = 0.45;
    this.knockback = 0.25;
    this.telegraphRadius = 0.75;
    this.sfxAttack = 'raptor_screech';
    this.sfxDie = 'raptor_die';
    this.bloodColor = 0x7a0a0a;
    this.idleCall = { name: 'raptor_screech', pitch: rng.range(0.85, 1.1), vol: 0.4, min: 4, max: 9 };
    this.modelScale = alpha ? 1.12 : rng.range(0.95, 1.03);
    this.strideLen = 1.45;
    this.maxFreq = 3;
    this.runRef = 4.5;
    this.weaveAmp = rng.range(2, 3.5);
    this.weaveFreq = rng.range(0.9, 1.4);
    this.windupShare = 0.66;
    this.pounceDur = 0.58;
    this.leapH = 0.85;
    this.retreatDist = 5.6;
    this.lieHeight = 0.2;
    this.deathTime = 3.0;
    this.landDust = 0.9;
    this.landShake = 0.05;
  }

  protected makeSpec(): TheroSpec {
    const alpha = this.variant === 'red';
    return {
      key: 'raptor',
      pal: RAPTOR_PALS[this.variant],
      hipGap: 0.16,
      thigh: 0.46,
      shin: 0.52,
      meta: 0.3,
      toe: 0.2,
      legR: 1.15,
      footH: 0.045,
      hips: [0.23, 0.29, 0.38],
      torso: { len: 0.8, r0: [0.24, 0.31], r1: [0.19, 0.25], rise: 0.12 },
      neck: { lens: [0.34, 0.27], r0: [0.125, 0.145], r1: [0.092, 0.11], rest: [-1.0, 0.55] },
      headRest: 0.5,
      skull: { len: 0.22, r: [0.112, 0.125] },
      snout: { len: 0.36, r1: [0.05, 0.055], drop: 0.03 },
      jaw: { len: 0.53, r0: [0.085, 0.05], r1: [0.038, 0.028] },
      tail: { lens: [0.42, 0.4, 0.36, 0.34], r0: [0.18, 0.21], taper: 0.66, rest: [-0.03, -0.02, 0, 0.02] },
      arm: { upper: 0.22, fore: 0.24, r: 0.05, claw: 0.1 },
      stripes: this.variant === 'blue' ? 1.6 : 2.3,
      teeth: 8,
      sickle: true,
      quills: alpha ? 1.35 : 0.5,
      eyeSize: 0.038,
    };
  }

  protected override onWindup() {
    // Hiss/screech as it crouches.
    this.sfx('raptor_screech', 0.7, 1.15);
  }

  protected override onPounce() {
    this.sfx('raptor_screech', 1, 0.95);
  }

  protected override onDeath(hit: ShotHit | null) {
    super.onDeath(hit);
    if (this.deathTumble === 0 && this.state === 'dying') {
      // Running kills stumble forward before they fall.
      this.toppleDelay = this.deathVel.lengthSq() > 9 ? 0.25 : 0.1;
    }
  }
}

// ─── Dilophosaurus ─────────────────────────────────────────────────────────

const DILO_PAL: Palette = {
  key: 'dilo',
  base: 0x6c7c3e,
  back: 0x3c4a22,
  belly: 0xdacd92,
  stripe: 0x2a3414,
  accent: 0xe0461c,
  accent2: 0x8a2410,
  claw: 0x221c14,
  teeth: 0xf2ead2,
  mouth: 0x8a2a2a,
  eye: 0xd8ff40,
};

const FRILL_Y = 0xffd21e;
const FRILL_O = 0xff8a1a;
const FRILL_R = 0xd8281a;
const FRILL_K = 0x1c1410;
const VENOM = 0xa8f040;

export class Dilo extends Theropod {
  private frill: THREE.Group[] = [];
  private frillOpen = 0;

  protected override configure() {
    const rng = this.world.rng;
    this.name = 'dilo';
    this.maxHp = 2.5;
    this.speed = rng.range(2.2, 2.8);
    this.attackRange = rng.range(8, 12);
    this.windup = 1.5;
    this.damage = 1;
    this.points = 150;
    this.staggerTime = 0.5;
    this.knockback = 0.2;
    this.telegraphRadius = 0.6;
    this.sfxAttack = null;
    this.sfxDie = 'raptor_die';
    this.bloodColor = 0x6a0a0a;
    this.idleCall = { name: 'compy_chirp', pitch: rng.range(0.32, 0.4), vol: 0.5, min: 3, max: 7 };
    this.strideLen = 1.1;
    this.maxFreq = 2.6;
    this.runRef = 3;
    this.bodyPitch = 0.02;
    this.jawMax = 0.8;
    this.tailStiff = 0.8;
    this.weaveAmp = 1.2;
    this.weaveFreq = 0.8;
    this.lieHeight = 0.17;
    this.landDust = 0.7;
    this.modelScale = 0.9;
  }

  protected makeSpec(): TheroSpec {
    return {
      key: 'dilo',
      pal: DILO_PAL,
      hipGap: 0.14,
      thigh: 0.4,
      shin: 0.44,
      meta: 0.27,
      toe: 0.17,
      legR: 0.85,
      footH: 0.04,
      hips: [0.17, 0.2, 0.3],
      torso: { len: 0.66, r0: [0.18, 0.21], r1: [0.14, 0.17], rise: 0.1 },
      neck: { lens: [0.3, 0.3], r0: [0.085, 0.1], r1: [0.06, 0.07], rest: [-0.95, 0.42] },
      headRest: 0.48,
      skull: { len: 0.17, r: [0.075, 0.085] },
      snout: { len: 0.24, r1: [0.033, 0.038], drop: 0.04 },
      jaw: { len: 0.36, r0: [0.06, 0.035], r1: [0.028, 0.02] },
      tail: { lens: [0.38, 0.36, 0.34, 0.32], r0: [0.13, 0.15], taper: 0.68, rest: [-0.05, -0.04, -0.02, 0] },
      arm: { upper: 0.2, fore: 0.2, r: 0.035, claw: 0.07 },
      stripes: 0,
      spots: 0.24,
      teeth: 6,
      sickle: false,
      quills: 0,
      crests: true,
      eyeSize: 0.038,
    };
  }

  protected override build() {
    super.build();
    // Collapsible neck frill: two fans around the upper neck, folded back along it.
    const head = this.r.head;
    const mat = skinMat();
    const fp: PaintFn = (x, y, _z, _nx, _ny, nz) => {
      const rr = Math.hypot(x, y) / 0.46;
      if (nz < -0.3) return rr > 0.8 ? DILO_PAL.back : DILO_PAL.base;
      if (rr > 0.86) return FRILL_R;
      if (rr > 0.66) return hash3(Math.round(x * 30), Math.round(y * 30), 2, 7) < 0.3 ? FRILL_K : FRILL_O;
      if (rr > 0.34 && hash3(Math.round(x * 30), Math.round(y * 30), 3, 9) < 0.18) return FRILL_K;
      return FRILL_Y;
    };
    for (const side of [1, -1]) {
      const pivot = Kit.pivot(head, side * 0.03, -0.01, -0.07, 'frill');
      pivot.rotation.order = 'YXZ';
      const g = dgeo(`dilo|frill${side}`, () => {
        // Each half covers its side from below the jaw to just past the top.
        const a0 = side > 0 ? -1.35 : Math.PI - 1.75;
        const a1 = side > 0 ? 1.75 : Math.PI + 1.35;
        return new Sculpt(0.04, 70)
          .fan(0.46, a0, a1, 9, [0.32, 0.66, 1], (i) => (i % 2 === 0 ? 1 : 0.86), 0.016, fp)
          .build();
      });
      const mesh = Kit.add(pivot, g, mat);
      this.hitbox(mesh, 'weak');
      this.frill.push(pivot);
    }
    this.refreshMeshes();
    this.applyFrill();
  }

  private applyFrill() {
    const k = this.frillOpen;
    // The frill must face the model's +Z regardless of the neck's pitch.
    let pitch = this.r.body.rotation.x + this.r.head.rotation.x;
    for (const n of this.r.neck) pitch += n.rotation.x;
    for (let i = 0; i < this.frill.length; i++) {
      const f = this.frill[i];
      const side = i === 0 ? 1 : -1;
      const s = 0.25 + 0.75 * k;
      f.scale.set(s, s, s);
      f.rotation.x = -pitch * k + (1 - k) * 0.2;
      f.rotation.y = side * (1 - k) * 1.35;
      f.rotation.z = Math.sin(this.age * 23 + i) * 0.04 * k;
      f.visible = k > 0.08;
    }
  }

  protected override advanceUpdate(dt: number) {
    if (this.cooldown > 0 && this.distToPlayer <= this.attackRange + 1.5) {
      // Between spits: side-step around at range, watching the player.
      this.playerPos(_p);
      _d.set(this.root.position.x - _p.x, 0, this.root.position.z - _p.z).normalize();
      this.prowl(dt, this.distToPlayer);
      return;
    }
    super.advanceUpdate(dt);
  }

  protected override prowl(dt: number, dist: number) {
    super.prowl(dt, dist);
    // Dilos keep their distance: back off if the player got close.
    if (dist < this.attackRange - 1) {
      _v.set(this.root.position.x + _d.x, 0, this.root.position.z + _d.z);
      this.moveToward(_v, this.speed * 0.5, dt);
      this.faceToward(_p, dt, 8);
    }
  }

  protected override onWindup() {
    this.sfx('spit', 0.6, 0.45);
  }

  protected override windupUpdate(dt: number) {
    this.playerPos(_p);
    this.faceToward(_p, dt, 8);
    if (this.telegraph) this.telegraph.progress = clamp(this.stateTime / this.windup, 0, 1);
    if (this.stateTime >= this.windup) {
      this.telegraph = null;
      this.spit();
      this.setState('spat');
    }
  }

  private spit() {
    this.r.mouth.getWorldPosition(_w);
    const glob = new THREE.Group();
    Kit.add(glob, Kit.sphere(0.17, 8, 6), Kit.glow(VENOM, 1.35));
    Kit.add(glob, Kit.sphere(0.09, 6, 4), Kit.glow(0xe0ff80, 1.5), 0.13, 0.07, 0.04);
    Kit.add(glob, Kit.sphere(0.07, 6, 4), Kit.glow(0x88d020, 1.3), -0.11, -0.08, -0.05);
    this.world.add(
      new Projectile(this.world, {
        from: _w.clone(),
        flightTime: 1.5,
        arc: 0.9,
        damage: this.damage,
        hp: 1,
        points: 50,
        color: VENOM,
        size: 0.2,
        spin: 7,
        source: 'dilo',
        sfxDestroy: 'hit_projectile',
        burst: 'goo',
        mesh: glob,
      }),
    );
    this.sfx('spit', 1, 1);
    this.world.fx.blood(_w, null, { color: VENOM, amount: 0.5 });
  }

  protected override customUpdate(dt: number): void {
    if (this.state === 'spat') {
      this.playerPos(_p);
      this.faceToward(_p, dt);
      if (this.stateTime > 0.55) {
        this.setState('advance');
        this.cooldown = this.world.rng.range(1.6, 2.8);
      }
      return;
    }
    super.customUpdate(dt);
  }

  protected override stateTargets(T: PoseTargets) {
    super.stateTargets(T);
    const t = this.stateTime;
    if (this.state === 'windup') {
      const k = clamp(t / this.windup, 0, 1);
      T.crouch = 0.15;
      T.dip = 0;
      T.rear = Math.min(1, k * 1.6);
      T.jaw = k > 0.6 ? 0.4 + (k - 0.6) * 1.5 : 0.15;
      T.tail = 0.2;
      T.arm = 0.2;
    } else if (this.state === 'spat') {
      T.dip = t < 0.2 ? 0.9 : 0.3;
      T.rear = 0;
      T.jaw = t < 0.25 ? 1 : 0.2;
    }
  }

  protected override pose(dt: number) {
    super.pose(dt);
    if (this.state === 'dying') {
      this.frillOpen = damp(this.frillOpen, 0.4, 3, dt);
    } else {
      const open = this.state === 'windup' || (this.state === 'spat' && this.stateTime < 0.35);
      const target = open ? 1 : 0;
      // Snaps open fast, folds slowly; slams shut when staggered.
      const rate = this.state === 'stagger' ? 20 : open ? 9 : 3;
      this.frillOpen = damp(this.frillOpen, target, rate, dt);
      // Cobra sway while threatening.
      if (this.state === 'windup') this.r.body.rotation.z += Math.sin(this.stateTime * 5) * 0.06;
    }
    this.applyFrill();
  }
}

// ─── Pteranodon ────────────────────────────────────────────────────────────

export class Ptero extends Dino {
  private r!: PteroRig;
  private readonly fwd = new THREE.Vector3(0, 0, -1);
  private readonly right = new THREE.Vector3(1, 0, 0);
  private readonly center = new THREE.Vector3();
  private readonly flyVel = new THREE.Vector3();
  private readonly d0 = new THREE.Vector3();
  private centerInit = false;
  private alt = 9;
  private circleR = 7;
  private circleDepth = 3;
  private circleDist = 20;
  private circleA = 0;
  private circleDir = 1;
  private circleTime = 0;
  private nextDive = 3;
  private diveSide = 1;
  private wingPhase = 0;
  private flapAmt = 1;
  private sweep = 0;
  private fold = 0;
  private bank = 0;
  private pitch = 0;
  private lookYaw = 0;
  private jawOpen = 0;
  private lastFlap = 0;
  private lastCry = -1;
  private seed = 0;

  protected override configure() {
    const rng = this.world.rng;
    this.name = 'ptero';
    this.maxHp = 1.5;
    this.speed = 8;
    this.attackRange = 0;
    this.windup = 1.6;
    this.damage = 1;
    this.points = 250;
    this.staggerTime = 0.55;
    this.knockback = 0.5;
    this.telegraphRadius = 1.0;
    this.sfxAttack = null;
    this.sfxDie = null;
    this.bloodColor = 0x7a0a0a;
    this.idleCall = { name: 'raptor_screech', pitch: rng.range(1.5, 1.8), vol: 0.35, min: 4, max: 8 };
    this.travelFacing = 0;
    this.alt = rng.range(7.5, 10);
    this.circleR = rng.range(5, 8);
    this.circleDepth = rng.range(2, 4);
    this.circleDist = rng.range(17, 22);
    this.circleDir = rng.chance(0.5) ? 1 : -1;
    this.nextDive = rng.range(2.5, 4.5);
    this.diveSide = rng.chance(0.5) ? 1 : -1;
    this.lieHeight = 0.08;
    this.deathTime = 3.0;
    this.sinkDepth = 0.5;
    this.landDust = 0.8;
    this.landShake = 0.03;
  }

  protected override build() {
    this.r = buildPtero(this.model, PTERO_PAL);
    this.model.scale.setScalar(0.88);
    for (const m of this.r.meshes.head) this.hitbox(m, 'head');
    for (const m of this.r.meshes.torso) this.hitbox(m, 'torso');
    for (const m of this.r.meshes.limb) this.hitbox(m, 'limb');
    this.anchor = this.r.body;
    this.headAnchor = this.r.meshes.head[0];
    this.seed = this.world.rng.next() * 100;
    this.wingPhase = this.seed;
  }

  override onAdded(): void {
    super.onAdded();
    // Altitude lives in `lift` (model offset) so the base ground snap never pulls us down.
    const pos = this.root.position;
    const g = this.groundY(pos.x, pos.z);
    this.lift = Math.max(0.3, pos.y - g);
    pos.y = g;
    this.computeBasis();
    this.playerPos(_p);
    _v.set(pos.x - _p.x, 0, pos.z - _p.z);
    this.circleA = Math.atan2(_v.dot(this.fwd) - this.circleDist, _v.dot(this.right));
    this.flyVel.set(0, this.lift < 2 ? 4 : 0, 0);
  }

  protected override beginEntry(): void {
    this.state = 'entry';
    this.stateTime = 0;
  }

  protected override entryUpdate(): boolean {
    return true;
  }

  protected override advanceUpdate(_dt: number) {
    this.setState(this.lift < this.alt - 2.5 ? 'climb' : 'circle');
  }

  /** Camera-forward / right basis in this entity's frame (flattened). */
  private computeBasis() {
    this.world.camera.getWorldDirection(_v);
    _v.y = 0;
    if (_v.lengthSq() < 1e-6) _v.set(0, 0, -1);
    if (this.frame === 'rig') _v.applyQuaternion(_q.copy(this.world.rig.space.quaternion).invert());
    _v.y = 0;
    this.fwd.copy(_v.normalize());
    this.right.set(-this.fwd.z, 0, this.fwd.x);
  }

  private updateCenter(dt: number) {
    this.computeBasis();
    this.playerPos(_p);
    _v.copy(_p).addScaledVector(this.fwd, this.circleDist);
    if (!this.centerInit) {
      this.center.copy(_v);
      this.centerInit = true;
    } else {
      this.center.x = damp(this.center.x, _v.x, 1.5, dt);
      this.center.z = damp(this.center.z, _v.z, 1.5, dt);
    }
  }

  /** Fly toward (x, alt, z) with smooth acceleration. */
  private steer(tx: number, ty: number, tz: number, maxSpeed: number, dt: number, response = 2.2) {
    const pos = this.root.position;
    _v.set((tx - pos.x) * 1.4, (ty - this.lift) * 1.4, (tz - pos.z) * 1.4);
    if (_v.lengthSq() > maxSpeed * maxSpeed) _v.setLength(maxSpeed);
    const k = 1 - Math.exp(-response * dt);
    this.flyVel.lerp(_v, k);
    pos.x += this.flyVel.x * dt;
    pos.z += this.flyVel.z * dt;
    this.lift = Math.max(1.2, this.lift + this.flyVel.y * dt);
    this.moveSpeed = Math.hypot(this.flyVel.x, this.flyVel.z);
  }

  private circleUpdate(dt: number) {
    this.updateCenter(dt);
    this.circleA += dt * (this.speed / this.circleR) * this.circleDir * 0.75;
    const a = this.circleA;
    const c = this.center;
    const tx = c.x + this.right.x * Math.cos(a) * this.circleR + this.fwd.x * Math.sin(a) * this.circleDepth;
    const tz = c.z + this.right.z * Math.cos(a) * this.circleR + this.fwd.z * Math.sin(a) * this.circleDepth;
    this.steer(tx, this.alt + Math.sin(a * 2) * 0.9, tz, this.speed, dt);
    this.circleTime += dt;
    if (this.circleTime > this.nextDive && this.cooldown <= 0 && this.onScreen(0.8)) {
      _v.set(this.root.position.x, 0, this.root.position.z).sub(this.playerPos(_p));
      if (_v.dot(this.fwd) > 8) this.startDive();
    }
  }

  private startDive() {
    if (!this.enterAttack('dive')) return;
    this.telegraph = { progress: 0, anchor: this.anchor, radius: this.telegraphRadius };
    this.d0.set(this.root.position.x, this.lift, this.root.position.z);
    this.diveSide = -this.diveSide;
    this.sfx('raptor_screech', 1, 1.55);
  }

  private diveUpdate(dt: number) {
    const T = this.windup;
    const flare = 0.32;
    const t = this.stateTime;
    if (this.telegraph) this.telegraph.progress = clamp(t / T, 0, 1);
    this.computeBasis();
    this.playerPos(_p);
    const pos = this.root.position;
    if (t < flare) {
      // Flare: pull up, wings back, a beat of hang-time before the drop.
      this.steer(pos.x - this.fwd.x * 0.5, this.d0.y + 0.8, pos.z - this.fwd.z * 0.5, 3, dt, 6);
      this.d0.set(pos.x, this.lift, pos.z);
      return;
    }
    const u = clamp((t - flare) / (T - flare), 0, 1);
    const e = u * u * (1.6 - 0.6 * u);
    // End point: right in front of the lens, slightly off-centre.
    const ex = _p.x + this.fwd.x * 1.7 + this.right.x * this.diveSide * 0.35;
    const ez = _p.z + this.fwd.z * 1.7 + this.right.z * this.diveSide * 0.35;
    const ey = Math.max(1.2, this.world.rig.eyeHeight - 0.3);
    // Swoop: control point low and to the side so the path dips then rises into the camera.
    const cx = lerp(this.d0.x, ex, 0.55) + this.right.x * this.diveSide * 1.4;
    const cz = lerp(this.d0.z, ez, 0.55) + this.right.z * this.diveSide * 1.4;
    const cy = ey - 0.6;
    const a = (1 - e) * (1 - e);
    const b = 2 * (1 - e) * e;
    const c = e * e;
    const nx = a * this.d0.x + b * cx + c * ex;
    const nz = a * this.d0.z + b * cz + c * ez;
    const ny = Math.max(1.2, a * this.d0.y + b * cy + c * ey);
    if (dt > 0) this.flyVel.set((nx - pos.x) / dt, (ny - this.lift) / dt, (nz - pos.z) / dt);
    pos.x = nx;
    pos.z = nz;
    this.lift = ny;
    this.moveSpeed = Math.hypot(this.flyVel.x, this.flyVel.z);
    if (t >= T) {
      this.telegraph = null;
      this.world.hurtPlayer(this.damage, this.name);
      this.sfx('wing_flap', 1, 0.8);
      this.startClimb();
    }
  }

  private startClimb() {
    this.setState('climb');
    this.computeBasis();
    // Peel away from the camera: up, forward and to the side.
    this.flyVel.set(this.fwd.x * 6 + this.right.x * this.diveSide * 4, 7, this.fwd.z * 6 + this.right.z * this.diveSide * 4);
  }

  private climbUpdate(dt: number) {
    this.updateCenter(dt);
    const c = this.center;
    const tx = c.x + this.right.x * this.diveSide * this.circleR;
    const tz = c.z + this.right.z * this.diveSide * this.circleR;
    this.steer(tx, this.alt + 1, tz, 11, dt, 1.8);
    if (this.lift > this.alt - 1.5 && this.stateTime > 1.0) {
      this.circleA = Math.atan2(
        (this.root.position.x - c.x) * this.fwd.x + (this.root.position.z - c.z) * this.fwd.z,
        (this.root.position.x - c.x) * this.right.x + (this.root.position.z - c.z) * this.right.z,
      );
      this.setState('circle');
      this.circleTime = 0;
      this.nextDive = this.world.rng.range(2, 3.5);
      this.cooldown = this.world.rng.range(1.5, 3);
    }
  }

  protected override customUpdate(dt: number): void {
    switch (this.state) {
      case 'circle':
        this.circleUpdate(dt);
        break;
      case 'dive':
        this.diveUpdate(dt);
        break;
      case 'climb':
        this.climbUpdate(dt);
        break;
    }
  }

  override update(dt: number): void {
    if (this.state === 'stagger' && dt > 0) {
      // Hit in flight: lose height, drift.
      this.flyVel.multiplyScalar(Math.exp(-3 * dt));
      this.lift = Math.max(1.2, this.lift - 1.5 * dt);
    }
    super.update(dt);
    if (this.state !== 'dying' && !this.removed) this.lift = Math.max(1.2, this.lift);
  }

  protected override onDamaged(hit: ShotHit, amount: number): void {
    super.onDamaged(hit, amount);
    if (this.hp > 0 && this.age - this.lastCry > 0.5) {
      this.lastCry = this.age;
      this.sfx('raptor_screech', 0.6, 1.9);
    }
  }

  protected override onDeath(hit: ShotHit | null): void {
    super.onDeath(hit);
    this.sfx('raptor_die', 1, 1.5);
    this.deathTumble = (this.world.rng.chance(0.5) ? 1 : -1) * this.world.rng.range(3, 5);
    this.toppleDelay = 0;
    this.toppleDur = 0.4;
  }

  protected override updateDeath(dt: number): boolean {
    const done = super.updateDeath(dt);
    // Crumple belly-down rather than rolling fully onto a side; spin while falling.
    if (!this.deathLanded) this.model.rotation.z = this.deathTumble * this.stateTime * 0.6;
    else this.model.rotation.z = damp(this.model.rotation.z, this.deathSide * 0.35, 6, dt);
    return done;
  }

  protected pose(dt: number) {
    const r = this.r;
    const st = this.state;
    const t = this.stateTime;
    let rate = 0;
    let amp = 0.12;
    let sweepT = 0;
    let foldT = 0;
    let jawT = 0;
    switch (st) {
      case 'climb':
      case 'entry':
      case 'advance':
        rate = 2.4;
        amp = 0.85;
        break;
      case 'circle': {
        // Glide with occasional flapping bursts (and when climbing).
        const burst = Math.sin(this.age * 0.9 + this.seed) > 0.35 || this.flyVel.y > 1;
        rate = burst ? 2.1 : 0;
        amp = burst ? 0.7 : 0.1;
        break;
      }
      case 'dive':
        if (t < 0.32) {
          rate = 3;
          amp = 0.9;
          jawT = 0.6;
        } else {
          sweepT = 0.7;
          foldT = 0.55;
          amp = 0.05;
          jawT = 1;
        }
        break;
      case 'stagger':
        rate = 5;
        amp = 1;
        jawT = 0.8;
        break;
      case 'dying':
        rate = this.deathLanded ? 0 : 6;
        amp = this.deathLanded ? 0 : 0.8;
        foldT = this.deathLanded ? 0.9 : 0.4;
        jawT = 0.5;
        break;
    }
    this.flapAmt = damp(this.flapAmt, amp, 6, dt);
    this.sweep = damp(this.sweep, sweepT, 6, dt);
    this.fold = damp(this.fold, foldT, 6, dt);
    this.jawOpen = damp(this.jawOpen, jawT, 12, dt);
    const prev = Math.sin(this.wingPhase);
    this.wingPhase += dt * rate * TAU;
    const f = Math.sin(this.wingPhase);
    // Fast powerful downstroke, slower recovery.
    const stroke = f > 0 ? f : f * 0.75;
    if (rate > 0 && prev > 0 && f <= 0 && st !== 'dying' && this.distToPlayer < 35) {
      if (this.age - this.lastFlap > 0.2) {
        this.lastFlap = this.age;
        this.sfx('wing_flap', 0.55, 0.9);
      }
    }
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const sh = r.shoulders[i];
      const wr = r.wrists[i];
      sh.rotation.z = side * (0.1 + this.flapAmt * stroke * 0.75 - this.fold * 0.2);
      sh.rotation.y = side * this.sweep * 0.9;
      sh.rotation.x = this.fold * 0.2;
      wr.rotation.z = side * (this.flapAmt * Math.sin(this.wingPhase - 0.9) * 0.45 - this.fold * 0.4);
      wr.rotation.y = side * this.fold * 1.4;
    }
    r.body.position.y = -stroke * 0.09 * this.flapAmt;
    if (st === 'dying') {
      r.neck.rotation.x = damp(r.neck.rotation.x, 0.3, 4, dt);
      r.head.rotation.x = damp(r.head.rotation.x, 0.8, 4, dt);
      r.jaw.rotation.x = this.jawOpen * 0.5;
      return;
    }

    // Orientation: heading from velocity (world-relative while cruising with a vehicle,
    // camera-relative while diving so it visibly comes AT you), banking into turns.
    let vx = this.flyVel.x;
    let vz = this.flyVel.z;
    if (this.frame === 'rig' && st !== 'dive') vz -= this.world.rig.speed * 0.8;
    if (st === 'dive' && t < 0.32) {
      this.playerPos(_p);
      vx = _p.x - this.root.position.x;
      vz = _p.z - this.root.position.z;
    }
    if (vx * vx + vz * vz > 0.04) {
      let yaw = Math.atan2(vx, vz);
      if (st === 'dive') {
        // Last part of the swoop: turn beak-first at the camera.
        this.playerPos(_p);
        const toCam = Math.atan2(_p.x - this.root.position.x, _p.z - this.root.position.z);
        yaw += angleDelta(yaw, toCam) * clamp((t - 0.7) / 0.5, 0, 1);
      }
      this.root.rotation.y += angleDelta(this.root.rotation.y, yaw) * (1 - Math.exp(-(st === 'dive' ? 8 : 4) * dt));
    }
    const maxBank = st === 'dive' ? 0.35 : 0.75;
    this.bank = damp(this.bank, clamp(-this.yawRate * 0.4, -maxBank, maxBank), 4, dt);
    const hs = Math.max(1, Math.hypot(this.flyVel.x, this.flyVel.z));
    this.pitch = damp(this.pitch, clamp(-Math.atan2(this.flyVel.y, hs) * 0.8, -0.6, 0.7), 5, dt);
    this.model.rotation.z = this.bank + (st === 'stagger' ? Math.sin(t * 17) * 0.5 : 0);
    this.model.rotation.x = this.pitch;

    // Head: look at the player, beak open while diving.
    this.playerPos(_p);
    const pos = this.root.position;
    const yawTo = angleDelta(this.root.rotation.y, Math.atan2(_p.x - pos.x, _p.z - pos.z));
    this.lookYaw = damp(this.lookYaw, clamp(yawTo, -0.9, 0.9), 4, dt);
    r.neck.rotation.y = this.lookYaw * 0.4;
    r.head.rotation.y = this.lookYaw * 0.4;
    const down = st === 'dive' && t > 0.32 ? 0.35 : 0;
    r.neck.rotation.x = -0.35 + down - stroke * 0.06 * this.flapAmt;
    r.head.rotation.x = 0.4 - down * 0.5 + Math.sin(this.age * 2 + this.seed) * 0.05;
    r.jaw.rotation.x = this.jawOpen * 0.45;
    // Feet tucked, thrown forward at the end of the swoop.
    const claws = st === 'dive' ? clamp((t - 1.1) / 0.4, 0, 1) : 0;
    r.legs.rotation.x = -claws * 1.4;
  }
}

// ─── Triceratops ───────────────────────────────────────────────────────────

/** Gait phase offsets (fraction of a cycle) for FL, FR, RL, RR in a lateral-sequence walk. */
const TRIKE_OFFS = [0.25, 0.75, 0, 0.5];

export class Trike extends Dino {
  private r!: TrikeRig;
  private phase = 0;
  private gait = 0;
  private seed = 0;
  private headDown = 0;
  private kneel = 0;
  private jawOpen = 0;
  private lookYaw = 0;
  private chargeStart = 0;
  private chargeSpeed = 0;
  private chargeDmg = 0;
  private skid = 0;
  private stompCount = 0;
  private backing = false;
  private leaveSide = 1;
  private impactDist = 5;
  private minCharge = 9;

  protected override configure() {
    const rng = this.world.rng;
    this.name = 'trike';
    this.maxHp = 14;
    this.speed = rng.range(1.4, 1.8);
    this.attackRange = rng.range(15, 22);
    this.windup = 2.0;
    this.damage = 1;
    this.points = 1500;
    this.superArmor = true;
    this.heavyHit = 3;
    this.staggerTime = 1.3;
    this.knockback = 0.05;
    this.telegraphRadius = 1.6;
    this.sfxAttack = 'dino_roar';
    this.sfxDie = 'dino_die';
    this.bloodColor = 0x6a0a0a;
    this.idleCall = { name: 'dino_roar', pitch: rng.range(0.8, 0.95), vol: 0.45, min: 6, max: 12 };
    this.travelFacing = 0.9;
    this.lieHeight = 0.72;
    this.deathTime = 3.6;
    this.sinkDepth = 1.6;
    this.landShake = 0.35;
    this.landDust = 2.2;
    this.toppleDelay = 0.6;
    this.toppleDur = 0.65;
    this.deathFriction = 2.2;
  }

  protected override build() {
    this.r = buildTrike(this.model, TRIKE_PAL);
    const m = this.r.meshes;
    for (const x of m.head) this.hitbox(x, 'head');
    for (const x of m.torso) this.hitbox(x, 'torso');
    for (const x of m.limb) this.hitbox(x, 'limb');
    for (const x of m.tail) this.hitbox(x, 'tail');
    for (const x of m.armor) this.hitbox(x, 'armor');
    this.anchor = this.r.head;
    this.headAnchor = m.head[0];
    this.seed = this.world.rng.next() * 100;
    this.phase = this.seed;
    this.impactDist = 4.9;
  }

  protected override advanceUpdate(dt: number) {
    this.playerPos(_p);
    const dist = this.distToPlayer;
    this.backing = false;
    if (dist > this.attackRange) {
      this.moveToward(_p, this.speed, dt, this.attackRange);
      this.separate(dt);
      return;
    }
    this.faceToward(_p, dt, 2.5);
    if (dist < this.minCharge) {
      // Too close to build up a charge: back up like a bull.
      _v.set(this.root.position.x - _p.x, 0, this.root.position.z - _p.z).normalize();
      this.root.position.addScaledVector(_v, this.speed * 0.9 * dt);
      this.moveSpeed = this.speed * 0.9;
      this.backing = true;
      return;
    }
    if (!this.onScreen()) {
      this.world.camera.getWorldDirection(_v).setY(0).normalize();
      _v.multiplyScalar(Math.max(this.minCharge + 2, dist)).add(this.world.rig.space.position);
      if (this.frame === 'rig') this.world.rig.space.worldToLocal(_v);
      this.moveToward(_v, this.speed * 1.5, dt);
      return;
    }
    if (this.cooldown <= 0 && this.takeSlot()) {
      this.chargeDmg = 0;
      this.stompCount = 0;
      this.setState('windup');
    }
  }

  protected override windupUpdate(dt: number) {
    this.playerPos(_p);
    this.faceToward(_p, dt, 3);
    const t = this.stateTime;
    if (this.telegraph) this.telegraph.progress = clamp(t / this.windup, 0, 1) * 0.5;
    // Paw the ground three times.
    const n = Math.floor((t - 0.15) / 0.6);
    if (t > 0.45 && n >= this.stompCount && this.stompCount < 3) {
      this.stompCount++;
      this.r.legs[1].lower.getWorldPosition(_w);
      _w.y = this.world.groundAt(_w.x, _w.z);
      this.world.fx.dust(_w, 0.9);
      this.sfx('stomp', 0.8, 0.9 + this.stompCount * 0.05);
      this.world.rig.shake(0.08);
    }
    if (t >= this.windup) this.startCharge();
  }

  private startCharge() {
    if (!this.enterAttack('charge')) {
      this.setState('advance');
      return;
    }
    this.telegraph = { progress: 0.5, anchor: this.anchor, radius: this.telegraphRadius };
    this.chargeStart = Math.max(this.distToPlayer, this.impactDist + 1);
    this.chargeSpeed = 2.5;
    this.sfx('dino_roar', 1, 1.05);
  }

  private chargeUpdate(dt: number) {
    this.playerPos(_p);
    this.chargeSpeed = Math.min(11, this.chargeSpeed + 7 * dt);
    this.moveToward(_p, this.chargeSpeed, dt, this.impactDist);
    const remaining = this.distToPlayer - this.impactDist;
    if (this.telegraph) this.telegraph.progress = 0.5 + 0.5 * clamp(1 - remaining / (this.chargeStart - this.impactDist), 0, 1);
    if (remaining <= 0.15) this.impact();
  }

  private impact() {
    this.telegraph = null;
    this.world.hurtPlayer(this.damage, this.name);
    this.world.rig.shake(1);
    this.world.hitStop(0.06);
    this.worldPos(_w);
    this.world.fx.dust(_w, 2);
    this.world.audio.play('crash', { volume: 0.8, vary: 0.1 });
    this.sfx('stomp', 1, 0.7);
    // Veer past the player and leave (no points, no longer a threat).
    this.playerPos(_p);
    const pos = this.root.position;
    const fx = Math.sin(this.root.rotation.y);
    const fz = Math.cos(this.root.rotation.y);
    const cross = fx * (_p.z - pos.z) - fz * (_p.x - pos.x);
    this.leaveSide = cross > 0 ? -1 : 1;
    this.setState('leave');
    this.hostile = false;
    this.world.shootables.removeOwner(this);
  }

  private leaveUpdate(dt: number) {
    const t = this.stateTime;
    if (this.frame === 'rig' && this.world.rig.speed > 2) {
      // Riding alongside a vehicle: peel away to the side and drop behind.
      this.playerPos(_p);
      const out = this.root.position.x >= _p.x ? 1 : -1;
      const k = Math.min(1, t / 0.8);
      this.root.position.x += out * 6 * k * dt;
      this.root.position.z += 5 * k * dt;
      this.faceToward(_w.set(this.root.position.x + out * 3, 0, this.root.position.z - 6), dt, 3);
      if (t > 3.2 || (t > 1.5 && !this.onScreen(1.3))) this.despawn();
      return;
    }
    // Swing the head away from the camera, then gallop off to the side.
    this.root.rotation.y += this.leaveSide * dt * (t < 0.7 ? 2.2 : 0.5);
    const spd = t < 0.4 ? lerp(this.chargeSpeed, 5, t / 0.4) : Math.min(10, 5 + (t - 0.4) * 4);
    const fx = Math.sin(this.root.rotation.y);
    const fz = Math.cos(this.root.rotation.y);
    this.root.position.x += fx * spd * dt;
    this.root.position.z += fz * spd * dt;
    this.moveSpeed = spd;
    // Keep clear of the camera while turning.
    this.playerPos(_p);
    _v.set(this.root.position.x - _p.x, 0, this.root.position.z - _p.z);
    const d = _v.length();
    if (d < 4.5 && d > 1e-3) this.root.position.addScaledVector(_v.divideScalar(d), (4.5 - d) * Math.min(1, dt * 8));
    if (t > 3.2 || (t > 1.5 && !this.onScreen(1.3))) this.despawn();
  }

  protected override customUpdate(dt: number): void {
    if (this.state === 'charge') this.chargeUpdate(dt);
    else if (this.state === 'leave') this.leaveUpdate(dt);
  }

  override stagger() {
    // Already veering off after a hit: nothing can turn it back into an attacker.
    if (this.state === 'leave') return;
    const wasCharging = this.state === 'charge';
    super.stagger();
    if (this.state !== 'stagger') return;
    this.skid = wasCharging ? this.chargeSpeed : 0;
    this.chargeDmg = 0;
    this.cooldown = 1.2;
    this.sfx('dino_roar', 0.8, 1.3);
  }

  override update(dt: number): void {
    if (this.state === 'stagger' && this.skid > 0.1 && dt > 0) {
      // Stumbling skid out of a charge.
      this.root.position.x += Math.sin(this.root.rotation.y) * this.skid * dt;
      this.root.position.z += Math.cos(this.root.rotation.y) * this.skid * dt;
      this.skid *= Math.exp(-2.8 * dt);
      this.moveSpeed = this.skid;
    }
    super.update(dt);
  }

  protected override onDamaged(hit: ShotHit, amount: number): void {
    super.onDamaged(hit, amount);
    this.flinch *= 0.5;
    if ((this.state === 'charge' || this.state === 'windup') && this.hp > 0) {
      // Enough punishment mid-charge makes it stumble even through super-armour.
      this.chargeDmg += amount;
      if (this.chargeDmg >= 5) this.stagger();
    }
  }

  protected override onArmorHit(_hit: ShotHit): void {
    this.flinch = Math.min(0.6, this.flinch + 0.15);
  }

  protected override onDeath(hit: ShotHit | null): void {
    super.onDeath(hit);
    this.world.rig.shake(0.3);
  }

  protected override onToppleImpact(): void {
    super.onToppleImpact();
    this.world.rig.shake(0.25 * clamp(1.5 - this.distToPlayer / 20, 0.2, 1));
    this.sfx('stomp', 1, 0.6);
  }

  protected pose(dt: number) {
    const r = this.r;
    const st = this.state;
    const t = this.stateTime;
    const gs = this.groundSpeed;
    const gallop = clamp((gs - 3.5) / 5, 0, 1);
    const stride = lerp(2.2, 3.6, gallop);
    const freq = gs > 0.1 ? clamp(gs / stride, 0.3, 2.4) : 0;
    this.phase += dt * freq * TAU * (this.backing ? -1 : 1);
    this.gait = damp(this.gait, clamp(gs / 1.8, 0, 1), 6, dt);
    const dying = st === 'dying';
    const g = dying ? 0 : this.gait;
    // Pose targets.
    let downT = 0;
    let kneelT = 0;
    let jawT = 0.05;
    if (st === 'windup') {
      downT = clamp(t / 0.5, 0, 1);
      jawT = t < 0.6 ? 0.5 : 0.1;
    } else if (st === 'charge') {
      downT = 1;
      jawT = 0.3;
    } else if (st === 'stagger') {
      kneelT = t < 0.9 ? 1 : 0;
      jawT = 0.6;
    } else if (dying) {
      kneelT = 1;
      jawT = 0.5;
    }
    this.headDown = damp(this.headDown, downT, 5, dt);
    this.kneel = damp(this.kneel, kneelT, dying ? 5 : 8, dt);
    this.jawOpen = damp(this.jawOpen, jawT, 8, dt);
    const ph = this.phase;
    const amp = lerp(0.32, 0.6, gallop);
    for (let i = 0; i < 4; i++) {
      const leg = r.legs[i];
      const p = ph + TRIKE_OFFS[i] * TAU + (gallop * (i < 2 ? 0.3 : 0)) * TAU;
      const swing = Math.sin(p) * amp * g;
      const lift = Math.max(0, Math.cos(p)) * g;
      let ux = -swing - 0.1;
      let lx = lift * (leg.front ? 0.9 : 0.75) + 0.12;
      if (leg.front) {
        ux += this.kneel * 0.75;
        lx += this.kneel * 1.6;
      }
      if (st === 'windup' && i === 1 && gs < 3) {
        // Right forefoot paws the ground.
        const pk = ((t - 0.15) / 0.6) % 1;
        const paw = t > 0.15 && t < 1.95 ? Math.sin(Math.PI * clamp(pk, 0, 1)) : 0;
        ux -= paw * 0.55;
        lx += paw * 0.9;
      }
      if (dying) {
        const burst = Math.max(0, Math.sin(t * 3.7 + i * 1.9));
        const tw = Math.exp(-t * 0.8) * burst * burst * burst * Math.sin(t * 27 + i * 3) * 0.3;
        ux = damp(leg.upper.rotation.x, (leg.front ? 0.6 : -0.2) + tw, 5, dt);
        lx = damp(leg.lower.rotation.x, (leg.front ? 1.5 : 0.5) + tw, 5, dt);
      }
      leg.upper.rotation.x = ux;
      leg.lower.rotation.x = lx;
    }
    // Body: heavy bob and roll, rocking at the gallop, dropping when the front legs buckle.
    const bob = -Math.abs(Math.sin(ph * 2)) * (0.035 + gallop * 0.08) * g;
    r.body.position.y = r.hipH + 0.08 + bob - this.kneel * 0.45;
    r.body.rotation.x = Math.sin(ph * 2) * 0.04 * gallop + this.kneel * 0.2 + this.headDown * 0.04;
    r.body.rotation.z = Math.sin(ph) * 0.03 * g - this.flinchSide * this.flinch * 0.08;
    const b = Math.sin(this.age * 1.6 + this.seed);
    r.bodyMesh.scale.set(1 + b * 0.012, 1 + b * 0.018, 1);
    // Head: lowered horns-first for the charge, tracks the player otherwise.
    this.playerPos(_p);
    const pos = this.root.position;
    const yawTo = angleDelta(this.root.rotation.y, Math.atan2(_p.x - pos.x, _p.z - pos.z));
    this.lookYaw = damp(this.lookYaw, dying ? 0 : clamp(yawTo, -0.6, 0.6), 3, dt);
    r.neck.rotation.y = this.lookYaw * 0.5;
    r.neck.rotation.x = 0.12 + this.headDown * 0.18 + Math.sin(ph * 2) * 0.04 * g - this.flinch * 0.1;
    const toss = st === 'stagger' ? Math.sin(t * 9) * 0.25 * (1 - t / this.staggerTime) : 0;
    r.head.rotation.x = 0.12 + this.headDown * 0.25 + (dying ? -0.3 * this.kneel : 0) - this.flinch * 0.1;
    r.head.rotation.z = toss + (st === 'windup' ? Math.sin(t * 7) * 0.05 : 0);
    r.head.rotation.y = this.lookYaw * 0.3;
    r.jaw.rotation.x = this.jawOpen * 0.35;
    for (let i = 0; i < r.tail.length; i++) {
      const tl = r.tail[i];
      tl.rotation.y = Math.sin(ph - i * 0.6) * 0.08 * g + this.tailSwing * (0.15 + i * 0.12) + (dying ? 0.15 * this.deathSide : 0);
      tl.rotation.x = (i === 0 ? -0.12 : -0.06) + Math.sin(ph * 2 - i) * 0.02 * g - (dying ? 0.05 : 0);
    }
  }
}

registerEnemy('compy', (w, s) => new Compy(w, s));
registerEnemy('raptor', (w, s) => new Raptor(w, s));
registerEnemy('dilo', (w, s) => new Dilo(w, s));
registerEnemy('ptero', (w, s) => new Ptero(w, s));
registerEnemy('trike', (w, s) => new Trike(w, s));

import * as THREE from 'three';
import { Boss } from '../../../gameplay/Boss';
import type { ShotHit } from '../../../gameplay/Entity';
import { registerEnemy, createEnemy } from '../../registry';
import { Kit } from '../../kit/ModelKit';
import { mergedMeshes } from './props';
import { angleDelta, clamp, damp, easeInOutSine } from '../../../core/math';
import { Projectile } from '../../../gameplay/Projectile';
import { D, RIVER_WIDTH, riverLatAt } from './layout';

/**
 * HORNED DEVIL — a Carnotaurus-like ambush predator (~8 m) that bursts out of
 * the treeline and chases the jeep along the river road (it lives in the rig
 * frame so it keeps pace; the camera turns to watch it).
 *
 *   weak points : glowing red eyes (always) + the throat when the jaws are open
 *   armour      : bull horns, back/neck osteoderms (spark, no damage)
 *   attacks     : RAM (head down, paws, charges)      — ring on the head
 *                 BITE (rears up, jaws wide)           — ring on the head, throat exposed
 *                 TAIL SWEEP (phase 2+, from the side) — ring on the tail
 *                 ROCK FLING (phase 2+, shootable rocks)
 *   Every windup is interrupted by dealing enough damage before the ring closes
 *   (the beast stumbles, jaws open → free hits on the throat).
 *   phase 2 : roars and calls the raptor pack.  phase 3 : frenzy (faster, chains).
 *   death   : tumbles off the road into the river.
 */

type CState =
  | 'intro'
  | 'leapIn'
  | 'roar'
  | 'chase'
  | 'ramWind'
  | 'ramRecover'
  | 'biteWind'
  | 'biteRecover'
  | 'flank'
  | 'tailWind'
  | 'tailRecover'
  | 'scoop'
  | 'stumble';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();

const SKIN = 0x8e3a20;
const SKIN_DARK = 0x5a2014;
const BELLY = 0xd9b48a;
const PLATE = 0x4a2416;
const HORN = 0xeadfc4;
const HORN_TIP = 0x2e2018;

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
}

interface FlashEntry {
  mesh: THREE.Mesh;
  t: number;
}

export class Carnotaur extends Boss {
  override title = 'HORNED DEVIL';
  override phases = [0.66, 0.33];

  // Rig.
  private hips!: THREE.Group;
  private chest!: THREE.Group;
  private neck!: THREE.Group;
  private head!: THREE.Group;
  private jaw!: THREE.Group;
  /** Gullet + glowing throat, shown while the jaws are open. */
  private mouth!: THREE.Group;
  private eyes: THREE.Mesh[] = [];
  private halos: THREE.Mesh[] = [];
  private skull: THREE.Mesh[] = [];
  private tail: THREE.Group[] = [];
  /** Telegraph anchor for the tail sweep (mid-tail: stays in frame while the tip whips off-screen). */
  private tailMid!: THREE.Object3D;
  /** 0..1: how far the camera framing leans toward the tail (tail sweep). */
  private tailBias = 0;
  private legs: Leg[] = [];
  private arms: THREE.Group[] = [];
  private focus = new THREE.Object3D();

  // Animation state.
  private gait = 0;
  private gaitSpeed = 0;
  private jawOpen = 0;
  private jawTarget = 0;
  private neckPitch = 0;
  private neckTarget = 0;
  private headYaw = 0;
  private flinch = 0;
  private flinchVel = 0;
  private crouch = 0;
  private crouchTarget = 0;
  private tailSwing = 0;
  private tailTarget = 0;
  private bodyYawOffset = 0;
  private lunge = 0;
  private paw = 0;
  private lastPos = new THREE.Vector3();
  private vel = new THREE.Vector3();

  // Fight state.
  private cooldown = 2.5;
  private interruptDmg = 0;
  private lastAttack = '';
  private repeatCount = 0;
  private pendingRoar = -1;
  private roaringFor = -1;
  private roarsDone = new Set<number>();
  private rigSpeed = -1;
  private raptorTimer = 0;
  private raptorsCalled = 0;
  private frenzy = false;
  private chain = 0;
  private sfxT = 0;
  private stepT = 0;
  private flashes: FlashEntry[] = [];
  private flashMat!: THREE.Material;
  private eyeMat!: THREE.Material;
  private eyeFrenzyMat!: THREE.Material;
  private haloMat!: THREE.Material;
  private haloFrenzyMat!: THREE.Material;
  private deadEndShown = false;
  private winding = false;
  /** True on the first update of a custom state (set by go()). */
  private entering = true;

  // Death (world-space waypoints: where it died → behind the jeep → in the river).
  private deathFrom = new THREE.Vector3();
  private deathMid = new THREE.Vector3();
  private deathTo = new THREE.Vector3();
  private deathFwd = new THREE.Vector3();
  private deathYaw = 0;
  private deathRoll = 0;
  private splashed = false;
  private bubbleT = 0;

  protected override configure(): void {
    this.name = 'carnotaur';
    // Tuned for the heat-limited turret: autoplayer ≈ 60 s, decent human ≈ 60–90 s.
    this.maxHp = 360;
    this.speed = 7;
    this.points = 6000;
    this.sfxHit = 'hit_flesh';
    this.sfxDie = 'dino_die';
    this.bloodColor = 0x7a0a0a;
    this.telegraphRadius = 1.1;
    this.knockback = 0;
  }

  // ─── Model ────────────────────────────────────────────────────────────────

  /** Build static parts of one bone into a group and bake them into a single vertex-coloured mesh. */
  private mergeInto(parent: THREE.Object3D, build: (g: THREE.Group) => void): THREE.Mesh[] {
    const g = new THREE.Group();
    parent.add(g);
    build(g);
    return mergedMeshes(g);
  }

  protected override build(): void {
    const skin = Kit.mat(SKIN);
    const skinDark = Kit.mat(SKIN_DARK);
    const belly = Kit.mat(BELLY);
    const plate = Kit.mat(PLATE);
    const horn = Kit.mat(HORN);
    const hornTip = Kit.mat(HORN_TIP);
    const teeth = Kit.mat(0xf2ead2);
    const claw = Kit.mat(0x2a2420);
    this.flashMat = Kit.glow(0xffffff, 1.2);
    this.eyeMat = Kit.glow(0xff3010, 2.2);
    this.eyeFrenzyMat = Kit.glow(0xffb020, 2.6);
    this.haloMat = Kit.glow(0xff2a10, 1.6, true, 0.35);
    this.haloFrenzyMat = Kit.glow(0xffa020, 1.8, true, 0.45);
    const blob = Kit.jitter(Kit.ico(1, 1), 0.16, 5);
    const bump = Kit.ico(1, 0);

    this.hips = Kit.pivot(this.model, 0, 2.35, 0, 'hips');

    // Torso: skin + bumps (merged), belly, stripes.
    const torso = this.mergeInto(this.hips, (g) => {
      Kit.add(g, blob, skin, 0, 0.15, 0.55, 0, 0, 0, 0.82, 0.88, 1.85);
      Kit.add(g, blob, skin, 0, 0.0, -0.75, 0, 0, 0, 0.7, 0.76, 0.9);
      Kit.add(g, blob, belly, 0, -0.42, 0.75, 0, 0, 0, 0.62, 0.48, 1.5);
      for (let i = 0; i < 6; i++) {
        Kit.add(g, Kit.box(1.62, 0.16, 0.34), skinDark, 0, 0.55 - Math.abs(i - 2.5) * 0.03, -0.6 + i * 0.5, 0, 0, 0);
      }
      const rng = this.world.rng;
      for (let i = 0; i < 26; i++) {
        const a = rng.range(-1.1, 1.1);
        const z = rng.range(-1, 1.9);
        const s = rng.range(0.07, 0.13);
        Kit.add(g, bump, skin, Math.sin(a) * 0.82, 0.15 + Math.cos(a) * 0.72, z, 0, 0, 0, s, s, s);
      }
    });
    for (const m of torso) this.hitbox(m, 'body');
    // Back osteoderms (armour).
    const back = this.mergeInto(this.hips, (g) => {
      for (let i = 0; i < 7; i++) {
        for (const sx of [-1, 1]) {
          const z = -1.0 + i * 0.45;
          Kit.add(g, Kit.cone(0.13, 0.32, 5), plate, sx * 0.32, 0.98 - Math.abs(z - 0.5) * 0.08, z, 0, 0, sx * -0.25);
        }
      }
    });
    for (const m of back) this.hitbox(m, 'armor');

    // Neck + head.
    this.chest = Kit.pivot(this.hips, 0, 0.3, 2.05, 'chest');
    this.neck = Kit.pivot(this.chest, 0, 0.0, 0.0, 'neck');
    const neckMeshes = this.mergeInto(this.neck, (g) => {
      Kit.add(g, blob, skin, 0, 0.18, 0.35, -0.35, 0, 0, 0.55, 0.62, 0.85);
      Kit.add(g, blob, belly, 0, -0.12, 0.45, -0.35, 0, 0, 0.42, 0.38, 0.62);
    });
    for (const m of neckMeshes) this.hitbox(m, 'torso');
    const neckPlates = this.mergeInto(this.neck, (g) => {
      for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) Kit.add(g, Kit.cone(0.11, 0.26, 5), plate, sx * 0.24, 0.72 - i * 0.05, 0.05 + i * 0.32, -0.3, 0, sx * -0.25);
    });
    for (const m of neckPlates) this.hitbox(m, 'armor');
    // Tiny arms.
    for (const sx of [-1, 1]) {
      const arm = Kit.pivot(this.chest, sx * 0.55, -0.55, 0.1);
      const am = Kit.add(arm, Kit.box(0.12, 0.34, 0.12), skin, 0, -0.15, 0.04, -0.6, 0, 0);
      Kit.add(arm, Kit.box(0.1, 0.06, 0.12), claw, 0, -0.3, 0.16);
      this.hitbox(am, 'limb');
      this.arms.push(arm);
    }

    this.head = Kit.pivot(this.neck, 0, 0.55, 0.95, 'head');
    const skull = this.mergeInto(this.head, (g) => {
      // Short, deep, bumpy skull (wide at the back so the eyes read from the front).
      Kit.add(g, blob, skin, 0, 0.12, 0.32, 0, 0, 0, 0.52, 0.5, 0.62);
      Kit.add(g, Kit.cyl(0.24, 0.36, 0.95, 6), skin, 0, 0.0, 1.05, Math.PI / 2, 0, 0, 1, 1, 0.78);
      Kit.add(g, Kit.cyl(0.2, 0.3, 0.7, 6), skinDark, 0, 0.2, 1.0, Math.PI / 2 - 0.12, 0, 0, 0.8, 1, 0.5);
      // Brow ridges + horn bosses above the eyes, warty snout.
      for (const sx of [-1, 1]) {
        Kit.add(g, Kit.box(0.36, 0.17, 0.52), skinDark, sx * 0.38, 0.55, 0.42, 0.1, 0, sx * -0.25);
        Kit.add(g, bump, skinDark, sx * 0.4, 0.35, 0.08, 0, 0, 0, 0.18, 0.2, 0.2);
        for (let i = 0; i < 4; i++) Kit.add(g, bump, skinDark, sx * (0.2 - i * 0.02), 0.28 - i * 0.02, 0.85 + i * 0.2, 0, i, 0, 0.08, 0.06, 0.1);
        Kit.add(g, bump, skin, sx * 0.34, -0.12, 0.6, 0, 0, 0, 0.16, 0.14, 0.24);
        Kit.add(g, Kit.box(0.08, 0.07, 0.06), Kit.mat(0x1a0c08), sx * 0.13, 0.08, 1.52);
      }
    });
    for (const m of skull) {
      this.hitbox(m, 'torso');
      this.skull.push(m);
    }
    const horns = this.mergeInto(this.head, (g) => {
      for (const sx of [-1, 1]) {
        const p = new THREE.Group();
        p.position.set(sx * 0.42, 0.62, 0.22);
        p.rotation.set(0.25, 0, sx * -1.05);
        g.add(p);
        Kit.add(p, Kit.cone(0.2, 0.8, 7), horn, 0, 0.4, 0);
        Kit.add(p, Kit.cone(0.085, 0.24, 7), hornTip, 0, 0.86, 0);
        Kit.add(p, Kit.cyl(0.22, 0.24, 0.12, 7), plate, 0, 0.02, 0);
      }
    });
    for (const m of horns) this.hitbox(m, 'armor');
    // Eyes (weak points) — glowing slits under the brow, bulging past the skull sides.
    for (const sx of [-1, 1]) {
      const eye = Kit.add(this.head, Kit.box(0.14, 0.17, 0.34), this.eyeMat, sx * 0.5, 0.36, 0.5);
      eye.rotation.y = sx * 0.35;
      const halo = Kit.add(this.head, Kit.sphere(0.27, 8, 6), this.haloMat, sx * 0.5, 0.36, 0.52, 0, 0, 0, 0.7, 0.75, 1.1);
      halo.renderOrder = 2;
      eye.userData.baseMat = this.eyeMat;
      halo.userData.baseMat = this.haloMat;
      this.hitbox(eye, 'weak');
      this.hitbox(halo, 'weak');
      this.eyes.push(eye);
      this.halos.push(halo);
    }
    const upperTeeth = this.mergeInto(this.head, (g) => {
      for (let i = 0; i < 6; i++) {
        for (const sx of [-1, 1]) Kit.add(g, Kit.cone(0.045, 0.16, 4), teeth, sx * 0.3, -0.38, 0.75 + i * 0.14, Math.PI, 0, 0);
      }
    });
    for (const m of upperTeeth) this.hitbox(m, 'torso');
    // Jaw + throat.
    this.jaw = Kit.pivot(this.head, 0, -0.3, 0.3, 'jaw');
    const jaw = this.mergeInto(this.jaw, (g) => {
      Kit.add(g, Kit.cyl(0.22, 0.34, 1.25, 6), skin, 0, -0.08, 0.62, Math.PI / 2, 0, 0, 1, 1, 0.42);
      Kit.add(g, Kit.box(0.46, 0.1, 0.95), belly, 0, -0.2, 0.55);
      for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) Kit.add(g, Kit.cone(0.04, 0.14, 4), teeth, sx * 0.26, 0.07, 0.55 + i * 0.15);
    });
    for (const m of jaw) this.hitbox(m, 'torso');
    // Mouth: dark gullet + glowing throat (the weak point), revealed when the jaws part.
    this.mouth = new THREE.Group();
    const mouthG = this.mouth;
    mouthG.position.set(0, -0.34, 0.62);
    this.head.add(mouthG);
    const gullet = Kit.add(mouthG, Kit.box(0.52, 0.36, 0.95), Kit.mat(0x5a0c0c), 0, 0, 0.1);
    const tongue = Kit.add(mouthG, Kit.box(0.3, 0.08, 0.7), Kit.mat(0xb04050), 0, -0.14, 0.25);
    const throat = Kit.add(mouthG, Kit.sphere(0.24, 8, 6), Kit.glow(0xff4a1a, 1.6), 0, 0.02, -0.28, 0, 0, 0, 1, 0.8, 0.6);
    for (const m of [gullet, tongue, throat]) {
      m.userData.baseMat = m.material;
      this.hitbox(m, 'weak');
    }
    mouthG.visible = false;

    // Tail.
    let parent: THREE.Object3D = Kit.pivot(this.hips, 0, 0.1, -1.4);
    for (let i = 0; i < 5; i++) {
      const seg = Kit.pivot(parent, 0, 0, i === 0 ? 0 : -0.95);
      const r = 0.52 - i * 0.09;
      const meshes = this.mergeInto(seg, (g) => {
        Kit.add(g, blob, skin, 0, 0, -0.5, 0, 0, 0, r, r * 1.05, 0.62);
        Kit.add(g, Kit.cone(0.07, 0.2, 4), skinDark, 0, r * 0.95, -0.4);
      });
      for (const m of meshes) this.hitbox(m, 'tail');
      this.tail.push(seg);
      parent = seg;
    }
    this.tailMid = Kit.pivot(this.tail[1], 0, 0.35, -0.6);

    // Legs.
    for (const sx of [-1, 1]) {
      const hip = Kit.pivot(this.hips, sx * 0.62, -0.15, 0.1);
      const thigh = this.mergeInto(hip, (g) => {
        Kit.add(g, blob, skin, 0, -0.42, 0.05, 0, 0, 0, 0.46, 0.78, 0.62);
        Kit.add(g, Kit.box(0.1, 0.5, 0.5), skinDark, sx * 0.4, -0.35, 0.05, 0, 0, sx * 0.15);
      });
      const knee = Kit.pivot(hip, 0, -1.0, 0.18);
      const shin = this.mergeInto(knee, (g) => {
        Kit.add(g, Kit.box(0.36, 0.95, 0.42), skin, 0, -0.42, -0.1, -0.22, 0, 0);
      });
      const ankle = Kit.pivot(knee, 0, -0.88, -0.28);
      const foot = this.mergeInto(ankle, (g) => {
        Kit.add(g, Kit.box(0.24, 0.42, 0.24), skinDark, 0, -0.18, 0.02, 0.25, 0, 0);
        Kit.add(g, Kit.box(0.42, 0.14, 0.62), skinDark, 0, -0.4, 0.22);
        for (const cx of [-0.14, 0, 0.14]) Kit.add(g, Kit.cone(0.05, 0.22, 4), claw, cx, -0.42, 0.6, Math.PI / 2, 0, 0);
      });
      for (const m of [...thigh, ...shin, ...foot]) this.hitbox(m, 'limb');
      this.legs.push({ hip, knee, ankle });
    }

    // Remember base materials for the custom flash.
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.baseMat) m.userData.baseMat = m.material;
    });

    this.anchor = this.chest;
    this.headAnchor = this.head;
    this.world.rig.space.add(this.focus);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  override onAdded(): void {
    super.onAdded();
    this.lastPos.copy(this.root.position);
    this.setState('intro');
    this.crouch = this.crouchTarget = 0.6;
    this.root.rotation.y = Math.atan2(-this.root.position.x, -this.root.position.z + 6);
    this.updateFocusTarget(_v);
    this.focus.position.copy(_v);
    this.world.rig.lookAtObject(this.focus, 2.2);
    this.world.audio.play('engine_rev', { volume: 0.8 });
  }

  override dispose(): void {
    this.focus.parent?.remove(this.focus);
    this.world.rig.swerve = 0;
    super.dispose();
  }

  // ─── Damage ───────────────────────────────────────────────────────────────

  protected override damageMultiplier(hit: ShotHit): number {
    const bonus = this.state === 'stumble' || this.state === 'roar' ? 1.4 : 1;
    switch (hit.part) {
      case 'weak':
        return 1 * bonus;
      case 'torso':
        return 0.45;
      case 'body':
        return 0.3;
      case 'limb':
        return 0.4;
      case 'tail':
        return 0.45;
      default:
        return 0.4;
    }
  }

  /** Bosses don't strobe white on every bullet: flash just the mesh that was hit (see onDamaged). */
  override flash(critical = false): void {
    if (!critical) return;
    for (const m of this.skull) this.flashMesh(m, 0.06);
  }

  private flashMesh(mesh: THREE.Mesh, t: number) {
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
    this.flinchVel = Math.min(4, this.flinchVel + clamp(amount * (hit.part === 'weak' ? 0.9 : 0.35), 0, 1.6));
    if (hit.part === 'weak') this.world.fx.sparks(hit.point, hit.normal, 3);
    if (this.winding) {
      this.interruptDmg += amount;
      if (this.interruptDmg >= this.interruptThreshold()) this.interrupt();
    }
  }

  private interruptThreshold() {
    return [6, 7, 8][this.phase] ?? 8;
  }

  private interrupt() {
    this.telegraph = null;
    this.winding = false;
    this.world.audio.play('dino_roar', { volume: 0.9, pitch: 0.8 });
    this.world.rig.shake(0.3);
    const sp = this.screenPos(this.head);
    if (sp) this.world.hud.popup('STAGGERED!', sp.x, sp.y - 40, 'combo');
    this.world.score.add(250);
    this.go('stumble');
  }

  protected override onPhase(phase: number): void {
    if (this.state !== 'roar' || this.pendingRoar < 0) this.pendingRoar = Math.max(this.pendingRoar, phase);
  }

  /** Next phase whose roar hasn't played yet (or -1). */
  private nextRoar(): number {
    for (let k = 1; k <= this.phase; k++) if (!this.roarsDone.has(k)) return k;
    return -1;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private go(s: CState) {
    this.telegraph = null;
    this.winding = false;
    this.interruptDmg = 0;
    this.entering = true;
    this.setState(s);
  }

  private steer(tx: number, tz: number, maxSpeed: number, dt: number) {
    const p = this.root.position;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return;
    const step = Math.min(d, maxSpeed * dt, d * (1 - Math.exp(-3.2 * dt)) + maxSpeed * 0.15 * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
  }

  private faceYaw(yaw: number, dt: number, rate = 5) {
    this.root.rotation.y += angleDelta(this.root.rotation.y, yaw) * (1 - Math.exp(-rate * dt));
  }

  /** Yaw that faces the jeep (rig origin). */
  private yawToJeep() {
    const p = this.root.position;
    return Math.atan2(-p.x, -p.z);
  }

  private headWorld(out: THREE.Vector3) {
    return this.head.getWorldPosition(out);
  }

  private updateFocusTarget(out: THREE.Vector3) {
    // Frame the head and chest, biased slightly toward the jeep so the boss sits centre-high.
    this.head.getWorldPosition(_w);
    this.chest.getWorldPosition(_u);
    out.lerpVectors(_u, _w, 0.55);
    // Tail sweep: lean the framing toward the tail so the coiling tail and its ring stay on screen.
    if (this.tailBias > 0.01) {
      this.tail[2].getWorldPosition(_w);
      out.lerp(_w, this.tailBias);
    }
    this.world.rig.space.updateMatrixWorld();
    this.world.rig.space.worldToLocal(out);
    out.y = clamp(out.y * 0.8 + 0.2, 1.8, 3.4);
    return out;
  }

  private callRaptors(n: number) {
    const w = this.world;
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      // Beside/behind the boss in the rear view: they leap past its flanks and land mid-frame ~6 m out.
      const pos = new THREE.Vector3(left ? -5 - i : 5 + i, 0, 12 + i * 2);
      const e = createEnemy('raptor', w, {
        pos,
        frame: 'rig',
        entry: 'leap',
        hpMul: 1,
        speedMul: 1,
        opts: { variant: i % 2 ? 'red' : 'tan' },
      });
      w.add(e);
      w.fx.debris(e.worldPos(_v), 0x3d7a2c);
      this.raptorsCalled++;
    }
    w.audio.play('raptor_screech', { volume: 0.9 });
  }

  private raptorCount() {
    let n = 0;
    for (const e of this.world.enemies()) if (!e.isBoss && e.state !== 'dying' && e.hostile) n++;
    return n;
  }

  private chooseAttack(): CState {
    const r = this.world.rng.next();
    const p = this.phase;
    let pick: CState;
    if (p === 0) pick = r < 0.55 ? 'ramWind' : 'biteWind';
    else if (p === 1) pick = r < 0.3 ? 'ramWind' : r < 0.6 ? 'biteWind' : r < 0.85 ? 'flank' : 'scoop';
    else pick = r < 0.25 ? 'ramWind' : r < 0.5 ? 'biteWind' : r < 0.75 ? 'flank' : 'scoop';
    if (pick === this.lastAttack && ++this.repeatCount >= 2) {
      pick = pick === 'ramWind' ? 'biteWind' : 'ramWind';
      this.repeatCount = 0;
    } else if (pick !== this.lastAttack) this.repeatCount = 0;
    this.lastAttack = pick;
    return pick;
  }

  private windupTime(base: number) {
    return base * (this.frenzy ? 0.78 : this.phase === 1 ? 0.9 : 1);
  }

  private thrownRock() {
    const g = new THREE.Group();
    Kit.add(g, Kit.jitter(Kit.ico(0.45, 0), 0.2, 3 + this.raptorsCalled), Kit.mat(0x7d7262));
    Kit.add(g, Kit.ico(0.22, 0), Kit.mat(0x5f8a30), 0.15, 0.25, 0);
    return g;
  }

  // ─── Fight ────────────────────────────────────────────────────────────────

  protected override customUpdate(dt: number): void {
    const w = this.world;
    const t = this.stateTime;
    const p = this.root.position;
    const st = this.state as CState;
    const first = this.entering;
    this.entering = false;

    // Phase check (explosions/bombs bypass onDamaged).
    const ph = this.phaseFor();
    if (ph > this.phase) {
      this.phase = ph;
      this.onPhase(ph);
    }
    if (this.pendingRoar > 0 && st !== 'intro' && st !== 'leapIn' && st !== 'roar') {
      this.go('roar');
      return;
    }

    this.jawTarget = 0.08;
    this.neckTarget = 0;
    this.crouchTarget = 0;
    this.tailTarget = 0;
    this.headYaw = damp(this.headYaw, 0, 4, dt);
    this.lunge = damp(this.lunge, 0, 6, dt);
    this.paw = 0;

    switch (st) {
      case 'intro': {
        // Lurking in the treeline: eyes glowing, foliage shaking.
        this.crouchTarget = 0.7;
        this.neckTarget = 0.25;
        this.faceYaw(this.yawToJeep(), dt, 3);
        if (Math.floor((t - dt) * 5) !== Math.floor(t * 5)) {
          w.fx.debris(this.headWorld(_v), 0x3d7a2c);
          w.audio.play('stomp', { volume: 0.4, vary: 0.2 });
        }
        if (t > 1.3) {
          this.entryFrom.copy(p);
          this.entryTo.set(-2.5, 0, 9.5);
          this.go('leapIn');
          w.audio.play('rex_roar', { volume: 0.9, pitch: 1.15 });
        }
        break;
      }
      case 'leapIn': {
        const k = clamp(t / 0.95, 0, 1);
        p.lerpVectors(this.entryFrom, this.entryTo, k);
        p.y = Math.sin(k * Math.PI) * 1.6;
        this.crouchTarget = -0.2;
        this.neckTarget = -0.2;
        this.jawTarget = 0.6;
        this.faceYaw(this.yawToJeep(), dt, 4);
        if (k < 1 && Math.floor((t - dt) * 8) !== Math.floor(t * 8)) w.fx.debris(this.worldPos(_v), 0x2f6a28);
        if (k >= 1) {
          p.y = 0;
          w.fx.dust(this.worldPos(_v), 2.4, 0x8a7a5a);
          w.audio.play('stomp', { volume: 1 });
          w.rig.shake(0.7);
          this.pendingRoar = 0;
          this.go('roar');
        }
        break;
      }
      case 'roar': {
        // Rears up, jaws wide (throat exposed), shakes its head.
        const dur = 2.2;
        this.steer(0, 11, 3, dt);
        this.faceYaw(this.yawToJeep(), dt, 4);
        this.jawTarget = t > 0.35 ? 1 : 0.3;
        this.neckTarget = t > 0.35 ? -0.55 : 0.1;
        this.headYaw = Math.sin(t * 9) * 0.18 * (t > 0.4 ? 1 : 0);
        if (first) {
          this.roaringFor = this.pendingRoar;
          w.audio.play('rex_roar', { volume: 1, pitch: this.roaringFor >= 2 ? 1.1 : 0.95 });
          if (this.roaringFor === 1) w.hud.prompt('IT CALLED THE PACK!');
          if (this.roaringFor === 2) {
            w.hud.prompt('FRENZY!');
            this.enterFrenzy();
          }
        }
        if (t > 0.4 && Math.floor((t - dt) * 4) !== Math.floor(t * 4)) {
          w.rig.shake(0.25);
          w.fx.dust(this.worldPos(_v), 1.2, 0x8a7a5a);
        }
        if (t >= dur) {
          const which = this.roaringFor;
          this.roarsDone.add(which);
          if (which === 1) this.callRaptors(2);
          if (which === 2) this.callRaptors(this.roarsDone.has(1) ? 2 : 3);
          this.pendingRoar = this.nextRoar();
          if (this.pendingRoar === 1 && which === 2) {
            this.roarsDone.add(1);
            this.pendingRoar = -1;
          }
          this.cooldown = which === 0 ? 1.4 : 1.0;
          if (this.pendingRoar > 0) this.go('roar');
          else this.go('chase');
        }
        break;
      }
      case 'chase': {
        const sway = Math.sin(this.age * 0.55) * 2.2;
        const dist = this.frenzy ? 8.6 : 9.6;
        this.steer(sway, dist + Math.sin(this.age * 0.37) * 1.0, 6, dt);
        this.faceYaw(this.yawToJeep(), dt, 4);
        this.neckTarget = 0.05 + Math.sin(this.age * 1.3) * 0.05;
        this.jawTarget = 0.12 + Math.max(0, Math.sin(this.age * 0.8)) * 0.2;
        this.cooldown -= dt;
        if (this.cooldown <= 0) this.go(this.chooseAttack());
        // Phase 2+: keep a couple of raptors around.
        if (this.phase >= 1) {
          this.raptorTimer -= dt;
          if (this.raptorTimer <= 0) {
            this.raptorTimer = this.frenzy ? 9 : 11;
            if (this.raptorCount() < 2 && this.raptorsCalled < 7) this.callRaptors(1);
          }
        }
        break;
      }
      case 'ramWind': {
        // Lowers the horns, paws the ground, snorts — then charges in the last 0.45 s.
        const dur = this.windupTime(1.9);
        const chargeAt = dur - 0.45;
        this.winding = true;
        this.faceYaw(this.yawToJeep(), dt, 6);
        if (t < chargeAt) {
          this.steer(0, 12.5, 4, dt);
          this.neckTarget = 0.42;
          this.crouchTarget = 0.35;
          this.paw = 1;
          if (Math.floor((t - dt) * 3) !== Math.floor(t * 3)) {
            w.audio.play('stomp', { volume: 0.6, pitch: 1.3 });
            this.legs[1].ankle.getWorldPosition(_v);
            w.fx.dust(_v, 0.7, 0x8a7a5a);
          }
          if (first) w.audio.play('dino_roar', { volume: 0.7, pitch: 0.75 });
        } else {
          this.steer(0, 4.6, 26, dt);
          this.neckTarget = 0.5;
          this.crouchTarget = 0.15;
        }
        const done = this.telegraphAttack(dur, () => {
          w.hurtPlayer(1, this.title);
          w.audio.play('crash', { volume: 1 });
          w.rig.shake(0.9);
          w.rig.swerve = 0.12 * (w.rng.chance(0.5) ? 1 : -1);
          w.hitStop(0.06);
        }, this.head);
        if (done) this.go('ramRecover');
        break;
      }
      case 'ramRecover': {
        this.steer(0, 10, 7, dt);
        this.neckTarget = -0.15;
        this.jawTarget = 0.4;
        this.faceYaw(this.yawToJeep(), dt, 4);
        if (t > 0.9) this.afterAttack();
        break;
      }
      case 'biteWind': {
        const dur = this.windupTime(1.45);
        this.winding = true;
        this.steer(0.8, 6.6, 9, dt);
        this.faceYaw(this.yawToJeep(), dt, 6);
        const k = clamp(t / dur, 0, 1);
        this.neckTarget = -0.5 * k;
        this.jawTarget = 0.25 + 0.75 * k;
        this.headYaw = Math.sin(t * 14) * 0.06 * k;
        if (first) w.audio.play('dino_roar', { volume: 0.8, pitch: 1.25 });
        const done = this.telegraphAttack(dur, () => {
          this.lunge = 1;
          w.hurtPlayer(1, this.title);
          w.audio.play('raptor_screech', { volume: 0.9, pitch: 0.55 });
          w.rig.shake(0.7);
          w.hitStop(0.05);
        }, this.head);
        if (done) this.go('biteRecover');
        break;
      }
      case 'biteRecover': {
        this.jawTarget = t < 0.15 ? 0 : 0.2;
        this.neckTarget = t < 0.25 ? 0.35 : 0;
        this.steer(0, 10, 6, dt);
        this.faceYaw(this.yawToJeep(), dt, 4);
        if (t > 0.8) this.afterAttack();
        break;
      }
      case 'flank': {
        // Run up alongside the jeep on the treeline side.
        this.steer(-7.4, 1.2, 9, dt);
        this.faceYaw(Math.PI, dt, 3.5);
        this.neckTarget = 0.1;
        if ((Math.abs(p.x + 7.4) < 0.6 && Math.abs(p.z - 1.2) < 0.7) || t > 2.6) this.go('tailWind');
        break;
      }
      case 'tailWind': {
        // Coil the tail away from the jeep, then whip it across.
        const dur = this.windupTime(1.5);
        this.winding = true;
        this.steer(-7.4, 1.2, 5, dt);
        const whipAt = dur - 0.3;
        if (t < whipAt) {
          const k = clamp(t / whipAt, 0, 1);
          this.faceYaw(Math.PI - 0.5 * k, dt, 6);
          this.tailTarget = -0.75 * k;
          this.headYaw = 0.3 * k;
        } else {
          this.faceYaw(Math.PI + 0.65, dt, 14);
          this.tailTarget = 1.15;
          this.headYaw = -0.2;
        }
        this.neckTarget = 0.1;
        if (first) w.audio.play('dino_roar', { volume: 0.7, pitch: 1.05 });
        const done = this.telegraphAttack(dur, () => {
          w.hurtPlayer(1, this.title);
          w.audio.play('crash', { volume: 1 });
          w.rig.shake(0.85);
          w.rig.swerve = -0.14;
          w.hitStop(0.05);
        }, this.tailMid);
        if (done) this.go('tailRecover');
        break;
      }
      case 'tailRecover': {
        const k = clamp(t / 0.5, 0, 1);
        this.tailTarget = 1.15 * (1 - k);
        if (t < 0.5) this.faceYaw(Math.PI + 0.65 * (1 - k), dt, 6);
        if (t > 0.4) {
          this.steer(0, 10, 7, dt);
          this.faceYaw(this.yawToJeep(), dt, 3);
        }
        if (t > 1.5) this.afterAttack();
        break;
      }
      case 'scoop': {
        // Head down into the dirt, flick a boulder at the jeep (shootable).
        this.steer(0.5, 10.5, 5, dt);
        this.faceYaw(this.yawToJeep(), dt, 5);
        const throws = this.frenzy ? 2 : 1;
        this.neckTarget = t < 0.7 ? 0.6 : -0.4;
        this.jawTarget = t < 0.7 ? 0.3 : 0.5;
        for (let i = 0; i < throws; i++) {
          const at = 0.75 + i * 0.75;
          if (t >= at && t - dt < at) {
            this.headWorld(_v);
            _v.y += 0.6;
            w.fx.dust(_v, 0.8, 0x8a7a5a);
            this.throwProjectile(_v.clone(), {
              flightTime: this.frenzy ? 1.35 : 1.6,
              arc: 2.6,
              hp: 2,
              size: 0.5,
              damage: 1,
              points: 150,
              mesh: this.thrownRock(),
              color: 0x8a7d6a,
              spin: 5,
              burst: 'debris',
              source: this.title,
              sfxDestroy: 'hit_projectile',
            });
            w.audio.play('stomp', { volume: 0.8, pitch: 0.8 });
          }
        }
        if (t > 0.9 + throws * 0.75) this.afterAttack();
        break;
      }
      case 'stumble': {
        // Interrupted: staggers back, jaws hanging open (free throat shots).
        this.steer(p.x * 0.5, 13, 7, dt);
        this.jawTarget = 0.85;
        this.neckTarget = -0.35 + Math.sin(t * 10) * 0.08;
        this.crouchTarget = 0.25;
        this.headYaw = Math.sin(t * 7) * 0.25;
        if (t > 1.5) {
          this.cooldown = this.frenzy ? 0.7 : 1.4;
          this.go('chase');
        }
        break;
      }
    }

    // Rig pacing; announce the dead end.
    this.updatePace(st);
    if (!this.deadEndShown && w.rig.d >= D.END - 0.5) {
      this.deadEndShown = true;
      w.hud.prompt('DEAD END!');
      w.audio.play('crash', { volume: 0.5 });
    }
    w.rig.swerve = damp(w.rig.swerve, 0, 3, dt);

    // Footsteps / growls.
    this.stepT -= dt * Math.max(0.4, this.gaitSpeed / 6);
    if (this.stepT <= 0) {
      this.stepT = 0.42;
      if (this.gaitSpeed > 1) {
        w.audio.play('stomp', { volume: 0.35, vary: 0.2 });
        w.rig.shake(0.04);
      }
    }
    this.sfxT -= dt;
    if (this.sfxT <= 0) {
      this.sfxT = w.rng.range(3, 6);
      if (st === 'chase') w.audio.play('dino_roar', { volume: 0.45, pitch: w.rng.range(0.8, 1) });
    }

    // Camera framing.
    const wantTail = st === 'flank' || st === 'tailWind' || st === 'tailRecover' ? 0.4 : 0;
    this.tailBias = damp(this.tailBias, wantTail, 3, dt);
    this.updateFocusTarget(_v);
    this.focus.position.lerp(_v, 1 - Math.exp(-4 * dt));
  }

  /**
   * The jeep's progress down the river road tracks the boss's health, so the
   * road runs out around the kill (DEAD END is a last stand, not half the
   * fight). The driver floors it while the beast is just chasing and eases off
   * while it winds up an attack (it catches up, and is steadier to aim at).
   */
  private updatePace(st: CState) {
    const w = this.world;
    let desired = 5;
    if (st !== 'intro' && st !== 'leapIn') {
      const left = Math.max(0, D.END - w.rig.d);
      // Seconds of fight a decent player still needs at this health.
      const expectLeft = 14 + 56 * (this.hp / this.maxHp);
      const need = left / expectLeft;
      const cruising = st === 'chase' || st === 'flank' || st === 'tailWind' || st === 'stumble';
      desired = cruising ? clamp(need * 1.35, 3.6, 7.5) : clamp(need * 0.7, 2, 4.5);
      if (this.frenzy) desired *= 1.1;
    }
    if (Math.abs(desired - this.rigSpeed) > 0.3) {
      this.rigSpeed = desired;
      w.rig.moveTo(D.END, desired);
    }
  }

  private afterAttack() {
    if (this.frenzy && this.chain < 1 && this.world.rng.chance(0.45)) {
      this.chain++;
      this.go(this.chooseAttack());
      return;
    }
    this.chain = 0;
    this.cooldown = [2.4, 1.8, 1.2][this.phase] ?? 1.2;
    this.go('chase');
  }

  private enterFrenzy() {
    if (this.frenzy) return;
    this.frenzy = true;
    this.eyeMat = this.eyeFrenzyMat;
    this.haloMat = this.haloFrenzyMat;
    for (const e of this.eyes) {
      e.userData.baseMat = this.eyeMat;
      if (!this.flashes.some((f) => f.mesh === e)) e.material = this.eyeMat;
    }
    for (const h of this.halos) {
      h.userData.baseMat = this.haloMat;
      if (!this.flashes.some((f) => f.mesh === h)) h.material = this.haloMat;
      h.scale.multiplyScalar(1.15);
    }
  }

  // ─── Animation ────────────────────────────────────────────────────────────

  protected override animate(dt: number): void {
    if (dt <= 0) return;
    this.updateFlashes(dt);
    if (this.state === 'dying') return; // updateDeath owns the pose
    const rig = this.world.rig;
    const dying = false;
    // Ground speed (rig frame moves along local -Z at rig.speed).
    if (!dying) {
      this.vel.subVectors(this.root.position, this.lastPos).divideScalar(dt);
      this.lastPos.copy(this.root.position);
      this.gaitSpeed = damp(this.gaitSpeed, Math.hypot(this.vel.x, this.vel.z - rig.speed), 6, dt);
    } else {
      this.gaitSpeed = damp(this.gaitSpeed, 0, 2, dt);
    }
    const run = clamp(this.gaitSpeed / 5, 0, 1);
    this.gait += dt * (1.6 + this.gaitSpeed * 0.62);
    const s = Math.sin(this.gait);
    const c = Math.cos(this.gait);

    this.jawOpen = damp(this.jawOpen, this.jawTarget, 10, dt);
    this.neckPitch = damp(this.neckPitch, this.neckTarget, 6, dt);
    this.crouch = damp(this.crouch, this.crouchTarget, 5, dt);
    this.tailSwing = damp(this.tailSwing, this.tailTarget, this.state === 'tailRecover' ? 14 : 5, dt);
    // Hit flinch spring.
    this.flinchVel += (-this.flinch * 60 - this.flinchVel * 9) * dt;
    this.flinch = clamp(this.flinch + this.flinchVel * dt, -0.3, 0.35);

    // Legs.
    const pawing = this.paw > 0 && !dying;
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const ph = i === 0 ? s : -s;
      const kn = i === 0 ? Math.max(0, -c) : Math.max(0, c);
      let hip = ph * 0.62 * run - this.crouch * 0.5;
      let knee = kn * 0.95 * run + this.crouch * 0.9;
      if (pawing && i === 1) {
        const pw = Math.sin(this.age * 9);
        hip = -0.3 + pw * 0.45;
        knee = 0.6 + Math.max(0, pw) * 0.5;
      }
      leg.hip.rotation.x = hip;
      leg.knee.rotation.x = knee;
      leg.ankle.rotation.x = -knee * 0.7 - hip * 0.4;
    }
    const breathe = Math.sin(this.age * 2.3);
    this.hips.position.y = 2.35 - this.crouch * 0.55 + Math.abs(c) * 0.14 * run;
    this.hips.rotation.x = this.crouch * 0.18 + 0.04 * run + breathe * 0.01;
    this.hips.rotation.z = s * 0.045 * run;
    this.hips.rotation.y = this.bodyYawOffset + Math.sin(this.gait * 0.5) * 0.04 * run;
    this.hips.scale.set(1 + breathe * 0.012, 1 + breathe * 0.018, 1);
    // Neck/head.
    this.neck.rotation.x = this.neckPitch - this.flinch * 0.5 - c * 0.04 * run;
    this.neck.rotation.y = this.headYaw * 0.5;
    this.head.rotation.x = -this.flinch * 0.35 + this.lunge * 0.25 - this.neckPitch * 0.25;
    this.head.rotation.y = this.headYaw * 0.6;
    this.head.position.z = 0.95 + this.lunge * 0.9;
    this.jaw.rotation.x = this.jawOpen * 0.95 + Math.max(0, breathe) * 0.03;
    this.mouth.visible = this.jawOpen > 0.32 && !dying;
    // Tail.
    for (let i = 0; i < this.tail.length; i++) {
      const seg = this.tail[i];
      seg.rotation.y = Math.sin(this.gait * 0.5 - i * 0.6) * 0.1 * (0.4 + run) + this.tailSwing * (0.25 + i * 0.08);
      seg.rotation.x = 0.05 + Math.sin(this.age * 1.4 - i * 0.5) * 0.03 - this.crouch * 0.05;
    }
    for (let i = 0; i < this.arms.length; i++) this.arms[i].rotation.x = Math.sin(this.age * 3 + i) * 0.25 + (this.state === 'roar' ? -0.6 : 0);
    // Eyes pulse.
    const pulse = 1 + Math.sin(this.age * (this.frenzy ? 12 : 5)) * 0.12;
    for (const h of this.halos) h.scale.set(0.7 * pulse * (this.frenzy ? 1.15 : 1), 0.75 * pulse * (this.frenzy ? 1.15 : 1), 1.1 * pulse);
  }

  // ─── Death: tumble off the road into the river ─────────────────────────────

  protected override onDeath(): void {
    const w = this.world;
    this.flashes.forEach((f) => (f.mesh.material = f.mesh.userData.baseMat as THREE.Material));
    this.flashes.length = 0;
    this.mouth.visible = false;
    w.rig.halt();
    w.rig.swerve = 0;
    // The pack scatters with its leader: no cheap hits after the killing blow.
    for (const e of w.enemies()) {
      if (e === this || e.isBoss || e.state === 'dying') continue;
      e.die(null);
    }
    for (const e of w.entities) {
      if (e instanceof Projectile && !e.removed) {
        e.removed = true;
        e.root.getWorldPosition(_v);
        w.fx.debris(_v, 0x8a7d6a);
      }
    }
    // Root is now in world space. Plan the fall in the rig frame (+x right,
    // +z behind) so it never passes through the jeep: stagger back to a spot
    // behind the jeep first, then roll sideways off the bank into the river.
    const space = w.rig.space;
    space.updateMatrixWorld();
    const local = space.worldToLocal(this.root.getWorldPosition(_v));
    const midX = clamp(local.x, -3.5, 4);
    const midZ = Math.max(local.z, 10.5);
    // Comes to rest just inside the near bank so the splash and the sinking body stay big on screen.
    const riverX = riverLatAt(w.rig.d - midZ) - RIVER_WIDTH / 2 + 2.6;
    this.deathFrom.copy(this.root.position);
    this.deathMid.set(midX, 0, midZ);
    space.localToWorld(this.deathMid);
    this.deathTo.set(riverX, 0, midZ + 2.5);
    space.localToWorld(this.deathTo);
    const heading = space.rotation.y;
    this.deathFwd.set(-Math.sin(heading), 0, -Math.cos(heading));
    this.deathYaw = heading + Math.PI; // face along the road (model +Z = rail forward)
    this.deathRoll = 0;
    this.splashed = false;
    this.focus.position.set(midX, 2.5, midZ);
    this.clampFocus(this.focus.position);
    w.audio.play('rex_roar', { volume: 0.8, pitch: 0.7 });
  }

  /** Keep the camera's focus point (rig-local) at least 4.5 m from the gunner so it never whips into the jeep. */
  private clampFocus(p: THREE.Vector3) {
    const r = Math.hypot(p.x, p.z);
    if (r < 4.5) {
      if (r < 1e-3) p.set(0, p.y, 4.5);
      else {
        p.x *= 4.5 / r;
        p.z *= 4.5 / r;
      }
    }
    return p;
  }

  protected override updateDeath(dt: number): boolean {
    const w = this.world;
    const t = this.stateTime;
    const p = this.root.position;
    // Turn to run along the road, stagger toward the bank.
    this.root.rotation.y += angleDelta(this.root.rotation.y, this.deathYaw) * (1 - Math.exp(-4 * dt));
    this.jawTarget = t < 1.8 ? 0.9 : 0.4;
    this.jawOpen = damp(this.jawOpen, this.jawTarget, 8, dt);
    this.jaw.rotation.x = this.jawOpen;
    if (t < 1.0) {
      // Mortally hit: staggers back behind the jeep, legs buckling, head thrashing.
      const k = t / 1.0;
      p.lerpVectors(this.deathFrom, this.deathMid, easeInOutSine(k));
      this.hips.position.y = 2.35 - k * 0.6;
      this.neck.rotation.x = -0.5 + Math.sin(t * 20) * 0.1;
      this.head.rotation.y = Math.sin(t * 9) * 0.3;
      for (let i = 0; i < this.legs.length; i++) {
        this.legs[i].hip.rotation.x = Math.sin(t * 11 + i * Math.PI) * 0.5 * (1 - k);
        this.legs[i].knee.rotation.x = 0.4 + k * 0.8;
      }
      if (Math.floor((t - dt) * 5) !== Math.floor(t * 5)) w.audio.play('stomp', { volume: 0.7, vary: 0.3 });
    } else if (t < 2.4) {
      // Topples onto its side and rolls down the bank.
      const k = (t - 1.0) / 1.4;
      const e = k * k;
      p.lerpVectors(this.deathMid, this.deathTo, e);
      p.y = Math.sin(k * Math.PI) * 0.6;
      this.deathRoll = -Math.PI * 0.55 * Math.min(1, k * 3) - k * Math.PI * 0.9;
      this.model.rotation.z = this.deathRoll;
      this.hips.position.y = 1.4;
      for (let i = 0; i < this.tail.length; i++) this.tail[i].rotation.y = Math.sin(t * 12 - i) * 0.35;
      for (let i = 0; i < this.legs.length; i++) {
        this.legs[i].hip.rotation.x = Math.sin(t * 14 + i * 2) * 0.8;
        this.legs[i].knee.rotation.x = 0.8;
      }
      if (Math.floor((t - dt) * 6) !== Math.floor(t * 6)) {
        w.fx.dust(this.worldPos(_v), 1.6, 0x8a7a5a);
        w.audio.play('stomp', { volume: 0.8, vary: 0.3 });
        w.rig.shake(0.2);
      }
    } else {
      if (!this.splashed) {
        this.splashed = true;
        this.worldPos(_v);
        _v.y = 0.3;
        w.fx.dust(_v, 3.2, 0xdff4ff);
        w.fx.blood(_v, null, { color: 0xcfeeff, amount: 2.4 });
        _w.copy(_v).addScaledVector(this.deathFwd, 3);
        w.fx.dust(_w, 2.4, 0xcfeeff);
        _w.copy(_v).addScaledVector(this.deathFwd, -3);
        w.fx.dust(_w, 2.4, 0xcfeeff);
        w.audio.play('crash', { volume: 1, pitch: 0.6 });
        w.audio.play('explosion', { volume: 0.5, pitch: 0.5 });
        w.rig.shake(0.8);
      }
      // Sinks, legs kicking feebly, bubbles.
      const k = clamp((t - 2.4) / 2.4, 0, 1);
      p.copy(this.deathTo);
      p.y = -k * 3.4;
      this.model.rotation.z = this.deathRoll - k * 0.2;
      for (let i = 0; i < this.legs.length; i++) this.legs[i].hip.rotation.x = Math.sin(t * 6 + i * 2) * 0.5 * (1 - k);
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) {
        this.bubbleT = 0.18;
        _v.copy(this.deathTo).addScaledVector(this.deathFwd, w.rng.spread(3));
        _v.y = 0.15;
        w.fx.dust(_v, 0.6, 0xe8f6ff);
      }
    }
    // Keep the camera on it (never closer than a few metres to the gunner).
    this.anchor.getWorldPosition(_v);
    w.rig.space.worldToLocal(_v);
    _v.y = clamp(_v.y, 0.8, 3);
    this.clampFocus(_v);
    this.focus.position.lerp(_v, 1 - Math.exp(-3 * dt));
    return t > 5.0;
  }
}

registerEnemy('carnotaur', (w, s) => new Carnotaur(w, s));

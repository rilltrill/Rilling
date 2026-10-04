import * as THREE from 'three';
import { Boss } from '../../../gameplay/Boss';
import { Projectile } from '../../../gameplay/Projectile';
import type { ShotHit } from '../../../gameplay/Entity';
import type { EntryKind } from '../../../core/types';
import { registerEnemy, createEnemy } from '../../registry';
import { Kit } from '../../kit/ModelKit';
import { angleDelta, clamp, damp, lerp, smoothstep } from '../../../core/math';
import { Pickup } from '../../../gameplay/Pickup';
import { Sculpt, M, type Paint } from './sculpt';
import { bakedLambert, clean, tx, type TexSpec } from './retro';
import { D } from './layout';
import { park } from './env';

/**
 * THE TYRANT — a 12 m, 5–6 m tall Tyrannosaurus and the signature chase.
 *
 * It lives in the rig frame (keeps pace with the jeep; `anchored` states add
 * the rig's motion back so it stands still in the world) and frames itself
 * with a camera focus object.
 *
 *   weak points : glowing eyes (always) + the glowing throat/mouth (only while
 *                 the jaws gape: roars, stumbles and every attack windup —
 *                 the head is posed so the open maw faces the camera)
 *   body        : 'torso' ×0.3, legs/tail even less; brow ridges + back scutes
 *                 are armour (spark)
 *   interrupts  : weak hits during a windup count in full, body hits at half
 *                 the raw shot damage (bite 6, charge 6.5, lunge 7)
 *   PHASE 1 (behind)  : bursts out of the trees behind the jeep and chases it
 *                       — lunging BITE (ring, interruptible), TAIL SMASH (flings
 *                       palm trunks / rocks: shootable projectiles)
 *   PHASE 2 (ahead)   : roars, veers into the jungle, cuts ahead and ambushes
 *                       the jeep from the front — CHARGE (ring, interruptible),
 *                       bite, HEADBUTT DEBRIS; calls raptors + pteranodons
 *   PHASE 3 (helipad) : knocked down (a first-aid kit drops), the jeep races
 *                       past to the helipad; it chases onto the pad, squares up
 *                       beside the fuel tank and makes FINAL LUNGES — shoot the
 *                       tank while it's close for a giant blast.
 *   death       : stumbles, crashes onto its side and slides along the road.
 */

type TState =
  | 'lurk'
  | 'burst'
  | 'roar'
  | 'chase'
  | 'biteWind'
  | 'biteRecover'
  | 'flingWind'
  | 'veer'
  | 'hidden'
  | 'ambush'
  | 'stalk'
  | 'chargeWind'
  | 'chargeRecover'
  | 'stumble'
  | 'knockdown'
  | 'down'
  | 'getup'
  | 'pursue'
  | 'lungeWind'
  | 'lungeRecover'
  | 'retreat'
  | 'blasted';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();

/** Phase-3 standoff distance behind the parked jeep (rig z). */
const P3_Z = 15.5;

// Warm earthy browns (lifted for the night + CRT pass so the king stays a warm
// silhouette against the blue storm instead of graying out).
const PAL = {
  base: 0x84694a,
  back: 0x4e3d2a,
  belly: 0xc4a982,
  stripe: 0x3e2e20,
  mouth: 0x5e1414,
  gum: 0x8a2a2a,
  teeth: 0xeee2c2,
  claw: 0x2a2420,
  scute: 0x3a3028,
};

const frac = (v: number) => v - Math.floor(v);

/**
 * Retro surface per paint colour: a big wrinkled hide over the body, fine
 * scales on the countershaded belly, bony keratin scutes, wet mouth skin, and
 * clean teeth / claws (they read as bright pixels against the hide).
 */
const HIDE: TexSpec = { name: 'hide', scale: 0.85, strength: 0.95 };
const TEX_OF_PAINT = new Map<number, TexSpec>([
  [PAL.belly, { name: 'scales', scale: 1.5, strength: 0.7 }],
  [PAL.scute, { name: 'rock', scale: 2.2, strength: 0.75 }],
  [PAL.mouth, { name: 'skin', scale: 1.2, strength: 0.5 }],
  [PAL.gum, { name: 'skin', scale: 1.2, strength: 0.5 }],
  [PAL.teeth, { name: 'grain', scale: 1, strength: 0 }],
  [PAL.claw, { name: 'grain', scale: 1, strength: 0 }],
  [0x1a0e0a, { name: 'grain', scale: 1, strength: 0 }],
]);
const texForPaint = (c: number): TexSpec => TEX_OF_PAINT.get(c) ?? HIDE;

/** Countershaded, tiger-striped hide. */
function hide(stripes = 0.85, phase = 0): Paint {
  return (x, y, z, _nx, ny) => {
    let c: number = PAL.base;
    if (ny < -0.45) c = PAL.belly;
    else if (ny > 0.62) c = PAL.back;
    if (stripes > 0 && ny > -0.3 && frac((z + Math.abs(y) * 0.55 + Math.abs(x) * 0.2) * stripes + phase) < 0.26) c = PAL.stripe;
    return c;
  };
}

/** Leg rest pose (radians) and lengths (metres). */
const LEG = { thigh: 1.5, shin: 1.4, meta: 0.85, foot: 0.16, hip: -0.35, knee: 0.95, ankle: -0.85 };
const HIP_DROP = 0.2;

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  foot: THREE.Group;
  prev: number;
}

interface FlashEntry {
  mesh: THREE.Mesh;
  t: number;
}

export class Tyrant extends Boss {
  override title = 'THE TYRANT';
  override phases = [0.66, 0.33];
  override deathDuration = 4.8;

  // Rig.
  private hips!: THREE.Group;
  private chest!: THREE.Group;
  private neck!: THREE.Group;
  private head!: THREE.Group;
  private jaw!: THREE.Group;
  private mouth!: THREE.Group;
  /** Pivot at the jaw hinge turning half the jaw angle: keeps the throat glow centred in the open mouth. */
  private maw!: THREE.Group;
  private tongue!: THREE.Mesh;
  private torsoMesh!: THREE.Mesh;
  private eyes: THREE.Mesh[] = [];
  private halos: THREE.Mesh[] = [];
  private headMeshes: THREE.Mesh[] = [];
  private tail: THREE.Group[] = [];
  private tailTip!: THREE.Object3D;
  private legs: Leg[] = [];
  private arms: THREE.Group[] = [];
  private focus = new THREE.Object3D();
  private throat!: THREE.Mesh;
  private mat!: THREE.Material;
  /** Warm, low-contrast hit tint for body parts (never a white strobe). */
  private tintMat!: THREE.Material;
  private eyeMat!: THREE.Material;
  private eyeDead!: THREE.Material;
  private haloMat!: THREE.Material;
  private flashes: FlashEntry[] = [];
  /** Age of the last body tint (rate-limited to ~3/s under autofire). */
  private lastTint = -1;
  /** Weak-point hit pulses (scale bump instead of a material swap, so the glow stays visible). */
  private eyePulse = 0;
  private mouthPulse = 0;

  // Pose (smoothed) + targets.
  private gait = 0;
  private run = 0;
  private crouch = 0;
  private crouchT = 0;
  private pitch = 0;
  private pitchT = 0;
  private neckP = 0;
  private neckT = 0;
  private headP = 0;
  private headT = 0;
  private headYaw = 0;
  private headYawT = 0;
  private jawOpen = 0;
  private jawT = 0;
  private tailLift = 0;
  private tailLiftT = 0;
  private tailWhip = 0;
  private tailWhipT = 0;
  private roll = 0;
  private rollT = 0;
  private arm = 0;
  private flinch = 0;
  private flinchSide = 1;
  private shakeHead = 0;
  private lastWorld = new THREE.Vector3();
  private worldVel = new THREE.Vector3();
  private groundSpd = 0;

  // Fight.
  private entering = true;
  private winding = false;
  private interruptDmg = 0;
  private cooldown = 2.5;
  private lastAttack = '';
  private pendingPhase = 0;
  private roarFor = 0;
  private afterRoar: TState = 'chase';
  private anchored = false;
  private rigTarget = -1;
  private rigSpeed = -1;
  private minionFlags = new Set<string>();
  private flingSide = 1;
  private flingThrown = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private blastSide = 1;
  private finalePrompted = false;
  private sfxT = 3;
  private debrisT = 0;
  private veerTarget: number = D.HELI_APPROACH;
  /** Seconds the phase-1 chase has been parked at the end of its road. */
  private parkedT = 0;
  private healthDropped = false;

  // Death.
  private deathVel = new THREE.Vector3();
  private deathSide = 1;
  private slammed = false;
  private corpseKept = false;

  protected override configure(): void {
    this.name = 'tyrant';
    this.maxHp = 350;
    this.speed = 8;
    this.points = 10000;
    this.sfxHit = 'hit_flesh';
    this.sfxDie = null;
    this.bloodColor = 0x7a0a0a;
    this.telegraphRadius = 1.7;
    this.knockback = 0;
  }

  // ─── Model ────────────────────────────────────────────────────────────────

  protected override build(): void {
    // One per-vertex-textured material for the whole body (raw-position projection:
    // the breathing torso's texels don't crawl).
    this.mat = bakedLambert({ emissive: 0x22170c, unscaled: true });
    this.tintMat = bakedLambert({ emissive: 0x5a3020, unscaled: true });
    this.eyeMat = Kit.glow(0xffb020, 2.4);
    this.eyeDead = Kit.mat(0x2a2014);
    this.haloMat = Kit.glow(0xff8a20, 1.5, true, 0.3);
    const mat = this.mat;
    const add = (parent: THREE.Object3D, s: Sculpt, part: 'torso' | 'limb' | 'tail' | 'armor' | 'weak') => {
      const m = Kit.add(parent, s.build(texForPaint), mat);
      m.userData.baseMat = mat;
      this.hitbox(m, part);
      return m;
    };
    const legH = LEG.thigh * Math.cos(LEG.hip) + LEG.shin * Math.cos(LEG.hip + LEG.knee) + LEG.meta * Math.cos(LEG.hip + LEG.knee + LEG.ankle) + LEG.foot;
    this.hips = Kit.pivot(this.model, 0, legH + HIP_DROP, 0, 'hips');

    // Torso + pelvis.
    this.torsoMesh = add(
      this.hips,
      new Sculpt(0.07)
        .seg(3.5, [1.05, 1.22], [0.86, 1.0], hide(0.85), M(0, 0.05, -0.5), { sides: 10, rings: 4, dy: 0.42, bulge: 0.12 })
        .blob(1.0, 1.12, 1.4, hide(0.85, 0.4), M(0, 0.12, -0.45), 10, 7)
        .blob(0.7, 0.55, 1.2, PAL.belly, M(0, -0.62, 1.2), 8, 5),
      'torso',
    );
    // Back scutes (armour).
    {
      const s = new Sculpt(0.05);
      for (let i = 0; i < 9; i++) {
        const z = -1.4 + i * 0.5;
        const y = 1.12 + Math.sin(((i + 1) / 10) * Math.PI) * 0.35;
        for (const sx of [-1, 1]) s.cone(0.12, 0.3, PAL.scute, M(sx * 0.28, y, z, -0.3, 0, sx * -0.3), 4);
      }
      add(this.hips, s, 'armor');
    }

    // Neck + head.
    this.chest = Kit.pivot(this.hips, 0, 0.5, 2.85, 'chest');
    this.neck = Kit.pivot(this.chest, 0, 0, 0, 'neck');
    this.neck.rotation.order = 'YXZ';
    add(this.neck, new Sculpt(0.07).seg(1.5, [0.8, 0.92], [0.56, 0.66], hide(1.1, 0.2), M(0, 0, -0.15), { sides: 9, rings: 2, dy: 0.25, bulge: 0.06 }), 'torso');
    {
      const s = new Sculpt(0.05);
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) s.cone(0.1, 0.24, PAL.scute, M(sx * 0.22, 0.86 - i * 0.04, 0.05 + i * 0.32, -0.4, 0, sx * -0.3), 4);
      add(this.neck, s, 'armor');
    }
    this.head = Kit.pivot(this.neck, 0, 0.28, 1.3, 'head');
    this.head.rotation.order = 'YXZ';
    const headPaint = (x: number, y: number, z: number, nx: number, ny: number): number => {
      if (ny < -0.55) return PAL.belly;
      if (ny > 0.6) return PAL.back;
      if (Math.abs(nx) > 0.6 && z > 0.35 && z < 0.95 && y > 0.05) return PAL.stripe;
      return frac(z * 1.4 + 0.3) < 0.2 && ny > -0.2 ? PAL.stripe : PAL.base;
    };
    {
      const s = new Sculpt(0.06)
        .seg(1.15, [0.6, 0.64], [0.52, 0.54], headPaint, M(0, 0.06, -0.15), { sides: 8, rings: 2, bulge: 0.08 })
        .seg(1.0, [0.52, 0.5], [0.3, 0.3], headPaint, M(0, 0.0, 0.95), { sides: 8, rings: 2, dy: -0.14 });
      // Palate (visible when the jaw opens) + upper teeth along the lip line.
      s.box(0.84, 0.05, 1.5, PAL.gum, M(0, -0.36, 1.05));
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const z = 0.75 + t * 1.12;
        const w = lerp(0.48, 0.27, t);
        const y = -0.3 - t * 0.12;
        for (const sx of [-1, 1]) s.cone(0.045, 0.2 - t * 0.05, PAL.teeth, M(sx * w, y, z, Math.PI - 0.1, 0, 0), 4);
      }
      // Nostrils.
      for (const sx of [-1, 1]) s.box(0.1, 0.06, 0.08, 0x1a0e0a, M(sx * 0.16, 0.05, 1.93));
      this.headMeshes.push(add(this.head, s, 'torso'));
    }
    // Brow ridges + cheek horns (armour).
    {
      const s = new Sculpt(0.05);
      for (const sx of [-1, 1]) {
        s.box(0.3, 0.18, 0.62, PAL.scute, M(sx * 0.36, 0.5, 0.6, 0.12, 0, sx * -0.32));
        s.cone(0.12, 0.3, PAL.scute, M(sx * 0.52, 0.2, 0.15, 0, 0, sx * -1.2), 4);
      }
      this.headMeshes.push(add(this.head, s, 'armor'));
    }
    // Jaw.
    this.jaw = Kit.pivot(this.head, 0, -0.3, 0.05, 'jaw');
    {
      const s = new Sculpt(0.06).seg(1.9, [0.5, 0.24], [0.27, 0.13], (x: number, y: number, z: number, nx: number, ny: number) => (ny > 0.75 ? PAL.mouth : ny < -0.4 ? PAL.belly : headPaint(x, y, z, nx, ny)), M(0, -0.12, 0), { sides: 7, rings: 2, dy: -0.04 });
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const z = 0.65 + t * 1.1;
        const w = lerp(0.42, 0.24, t);
        for (const sx of [-1, 1]) s.cone(0.04, 0.17 - t * 0.04, PAL.teeth, M(sx * w, 0.02, z, 0.1, 0, 0), 4);
      }
      this.headMeshes.push(add(this.jaw, s, 'torso'));
    }
    // Mouth interior (weak): a dark gullet backdrop with a big glowing throat in
    // front of it (head), tongue (jaw). Shown only while the jaws are open.
    this.mouth = new THREE.Group();
    this.mouth.position.set(0, -0.36, 0.2);
    this.head.add(this.mouth);
    const gullet = Kit.add(this.mouth, Kit.box(0.64, 0.42, 0.45), tx('skin', 0x521010, 2, 0.5), 0, -0.04, 0.1);
    this.maw = Kit.pivot(this.head, 0, -0.3, 0.05, 'maw');
    const throat = Kit.add(this.maw, Kit.sphere(0.42, 10, 8), Kit.glow(0xff3a14, 1.9), 0, -0.05, 0.78, 0, 0, 0, 0.88, 0.62, 0.6);
    this.throat = throat;
    for (const m of [throat, gullet]) {
      m.userData.baseMat = m.material;
      this.hitbox(m, 'weak');
    }
    this.tongue = Kit.add(this.jaw, Kit.box(0.38, 0.1, 1.1), tx('skin', 0xa03848, 2.5, 0.6), 0, 0.0, 0.85);
    this.tongue.userData.baseMat = this.tongue.material;
    this.hitbox(this.tongue, 'weak');
    this.mouth.visible = false;
    this.maw.visible = false;
    this.tongue.visible = false;

    // Eyes (weak) — small glowing slits under the brow + soft halos that stand
    // proud of the head's silhouette so they stay targetable from the front.
    // (Registered after the mouth so aim helpers prefer the gaping throat.)
    for (const sx of [-1, 1]) {
      const eye = Kit.add(this.head, Kit.sphere(0.12, 8, 6), this.eyeMat, sx * 0.53, 0.31, 0.8, 0, sx * 0.35, 0, 0.8, 1, 1.3);
      eye.userData.baseMat = this.eyeMat;
      this.hitbox(eye, 'weak');
      this.eyes.push(eye);
      const halo = Kit.add(this.head, Kit.sphere(0.25, 8, 6), this.haloMat, sx * 0.56, 0.29, 0.88, 0, sx * 0.3, 0, 1.05, 0.72, 1.35);
      halo.renderOrder = 2;
      halo.userData.baseMat = this.haloMat;
      halo.userData.noFlash = true;
      this.hitbox(halo, 'weak');
      this.halos.push(halo);
    }
    // Tiny arms.
    for (const sx of [-1, 1]) {
      const sh = Kit.pivot(this.chest, sx * 0.62, -0.62, 0.15);
      const s = new Sculpt(0.06)
        .seg(0.5, [0.13, 0.15], [0.1, 0.11], hide(0), M(0, 0.04, 0, Math.PI / 2))
        .seg(0.42, [0.1, 0.11], [0.08, 0.08], hide(0), M(0, -0.46, 0.02, Math.PI / 2 - 1.2));
      for (const cx of [-0.04, 0.04]) s.cone(0.03, 0.12, PAL.claw, M(cx, -0.62, 0.36, 1.6, 0, 0), 4);
      add(sh, s, 'limb');
      this.arms.push(sh);
    }

    // Tail.
    let parent: THREE.Object3D = Kit.pivot(this.hips, 0, 0.22, -1.55);
    const lens = [1.05, 1.0, 0.95, 0.9, 0.85, 0.8];
    let r: [number, number] = [0.88, 0.98];
    for (let i = 0; i < lens.length; i++) {
      const seg = Kit.pivot(parent, 0, 0, i === 0 ? 0 : -lens[i - 1]);
      seg.rotation.order = 'YXZ';
      const k = 0.72 - i * 0.04;
      const r1: [number, number] = [r[0] * k, r[1] * k];
      const s = new Sculpt(0.07).seg(lens[i] + 0.12, r, r1, hide(1.0, i * 0.3), M(0, 0, 0.08, 0, Math.PI, 0), { sides: 8, rings: 1 });
      if (i < 4) s.cone(0.08, 0.2, PAL.scute, M(0, r[1] * 0.92, -lens[i] * 0.4, -0.3, 0, 0), 4);
      add(seg, s, 'tail');
      this.tail.push(seg);
      parent = seg;
      r = r1;
    }
    this.tailTip = Kit.pivot(parent, 0, 0, -lens[lens.length - 1]);

    // Legs.
    for (const sx of [-1, 1]) {
      const hip = Kit.pivot(this.hips, sx * 0.95, -HIP_DROP, 0.2);
      add(
        hip,
        new Sculpt(0.07)
          .seg(LEG.thigh + 0.25, [0.62, 0.72], [0.38, 0.42], hide(0.9, 0.5), M(0, 0.25, 0, Math.PI / 2), { sides: 8, rings: 2, bulge: 0.18 })
          .blob(0.55, 0.95, 0.78, hide(0.9, 0.2), M(sx * 0.06, -0.35, 0.05), 9, 6),
        'limb',
      );
      const knee = Kit.pivot(hip, 0, -LEG.thigh, 0);
      add(knee, new Sculpt(0.07).seg(LEG.shin + 0.1, [0.36, 0.42], [0.22, 0.26], hide(0), M(0, 0.05, 0, Math.PI / 2), { sides: 7 }), 'limb');
      const ankle = Kit.pivot(knee, 0, -LEG.shin, 0);
      const foot = Kit.pivot(ankle, 0, -LEG.meta, 0);
      const fs = new Sculpt(0.07).seg(LEG.meta + 0.08, [0.22, 0.25], [0.17, 0.17], hide(0), M(0, LEG.meta + 0.04, 0, Math.PI / 2), { sides: 6 });
      for (const [tx, ta] of [[-0.17, -0.3], [0, 0], [0.17, 0.3]] as const) {
        fs.seg(0.7, [0.11, 0.09], [0.07, 0.06], PAL.base, M(tx, -0.08, 0, 0, ta, 0), { sides: 5 });
        fs.cone(0.06, 0.22, PAL.claw, M(tx + Math.sin(ta) * 0.7, -0.1, Math.cos(ta) * 0.7, Math.PI / 2 + 0.3, 0, 0), 4);
      }
      fs.blob(0.2, 0.12, 0.25, PAL.base, M(0, -0.06, -0.08), 6, 4);
      add(foot, fs, 'limb');
      this.legs.push({ hip, knee, ankle, foot, prev: 0 });
    }

    this.anchor = this.chest;
    this.headAnchor = this.head;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  override onAdded(): void {
    super.onAdded();
    this.world.rig.space.add(this.focus);
    this.go('lurk');
    this.crouch = this.crouchT = 0.5;
    this.root.rotation.y = Math.atan2(-this.root.position.x, -this.root.position.z);
    this.root.getWorldPosition(this.lastWorld);
    this.updateFocus(_v);
    this.focus.position.copy(_v);
    this.world.rig.lookAtObject(this.focus, 2.0);
    const env = park();
    if (env) env.onTankBlast = (p) => this.onTankBlast(p);
  }

  override dispose(): void {
    this.focus.parent?.remove(this.focus);
    this.world.rig.swerve = 0;
    const env = park();
    if (env && env.onTankBlast) env.onTankBlast = null;
    super.dispose();
  }

  // ─── Damage ───────────────────────────────────────────────────────────────

  protected override damageMultiplier(hit: ShotHit): number {
    const st = this.state as TState;
    if (st === 'down' || st === 'pursue' || st === 'getup') return 0.25;
    const bonus = st === 'blasted' ? 1.5 : st === 'stumble' || st === 'roar' || st === 'knockdown' ? 1.3 : 1;
    switch (hit.part) {
      case 'weak':
        return bonus;
      case 'torso':
      case 'body':
        return 0.3;
      case 'limb':
        return 0.4;
      case 'tail':
        return 0.5;
      default:
        return 0.3;
    }
  }

  /**
   * No whole-model flash: under turret autofire (14 shots/s) it strobed the head
   * white and hid the glowing eyes/throat the player is aiming at. Hit feedback is
   * a rate-limited warm tint on the struck body part (onDamaged) and a pulse of
   * the struck weak point.
   */
  override flash(_critical = false): void {}

  /** Briefly tint a body mesh warm. Glow (weak-point) materials are never swapped. */
  private flashMesh(mesh: THREE.Mesh, t: number) {
    if (this.state === 'dying') return;
    if (mesh.userData.baseMat !== this.mat) return;
    const e = this.flashes.find((f) => f.mesh === mesh);
    if (e) {
      e.t = Math.max(e.t, t);
      return;
    }
    mesh.material = this.tintMat;
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

  private clearFlashes() {
    for (const f of this.flashes) f.mesh.material = f.mesh.userData.baseMat as THREE.Material;
    this.flashes.length = 0;
  }

  protected override onDamaged(hit: ShotHit, amount: number): void {
    super.onDamaged(hit, amount);
    const obj = hit.object as THREE.Mesh;
    const weak = hit.part === 'weak';
    if (weak) {
      // Pulse the struck weak point (keeps its glow — the target never vanishes).
      if (obj === this.throat || obj.parent === this.mouth || obj === this.tongue) this.mouthPulse = 1;
      else this.eyePulse = 1;
    } else if (obj.isMesh && this.age - this.lastTint >= 0.34) {
      this.lastTint = this.age;
      this.flashMesh(obj, 0.05);
    }
    // Which side was hit (model space) → flinch away from it.
    const e = this.model.matrixWorld.elements;
    const d = hit.dir.x * e[0] + hit.dir.y * e[1] + hit.dir.z * e[2];
    this.flinchSide = d >= 0 ? 1 : -1;
    this.flinch = Math.min(1.2, this.flinch + (weak ? 0.22 : 0.06) + amount * 0.05);
    if (weak) this.world.fx.sparks(hit.point, hit.normal, 3);
    if (this.winding) {
      // Weak-point hits count in full; body hits still add pressure at half the
      // raw shot damage, so hosing the head while it lunges is never wasted.
      this.interruptDmg += weak ? amount : hit.damage * 0.5;
      if (this.interruptDmg >= this.interruptThreshold()) this.interrupt();
    }
  }

  private interruptThreshold(): number {
    const st = this.state as TState;
    if (st === 'lungeWind') return 7;
    if (st === 'chargeWind') return 6.5;
    return 6;
  }

  private interrupt() {
    this.telegraph = null;
    this.winding = false;
    this.world.audio.play('dino_roar', { volume: 0.9, pitch: 0.7 });
    this.world.rig.shake(0.3);
    const sp = this.screenPos(this.head);
    if (sp) this.world.hud.popup('STAGGERED!', sp.x, sp.y - 40, 'combo');
    this.world.score.add(300);
    this.go('stumble');
  }

  protected override onPhase(phase: number): void {
    this.pendingPhase = Math.max(this.pendingPhase, phase);
  }

  private onTankBlast(p: THREE.Vector3) {
    if (this.state === 'dying') return;
    this.chest.getWorldPosition(_v);
    const dx = _v.x - p.x;
    const dz = _v.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 11.5) {
      const sp = this.screenPos(this.head);
      if (sp) this.world.hud.popup('TOO EARLY!', sp.x, sp.y - 40, 'warning');
      return;
    }
    const dmg = this.maxHp * 0.2;
    this.hp -= dmg;
    this.clearFlashes();
    for (const m of this.headMeshes) this.flashMesh(m, 0.2);
    this.flashMesh(this.torsoMesh, 0.2);
    const sp = this.screenPos(this.chest);
    if (sp) {
      this.world.hud.popup('FUEL BLAST!', sp.x, sp.y - 60, 'headshot');
      this.world.hud.popup(`+${this.world.score.add(3000)}`, sp.x, sp.y - 20, 'points');
    }
    this.world.audio.play('rex_roar', { volume: 1, pitch: 0.75 });
    // Knocked away from the blast.
    this.world.rig.space.updateMatrixWorld();
    _w.set(dx, 0, dz).normalize().add(_v);
    this.world.rig.space.worldToLocal(_w);
    this.blastSide = _w.x - this.root.position.x >= 0 ? 1 : -1;
    if (this.hp <= 0) {
      this.die(null);
      return;
    }
    this.go('blasted');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private go(s: TState) {
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
    const step = Math.min(d, maxSpeed * dt, d * (1 - Math.exp(-3 * dt)) + maxSpeed * 0.2 * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
  }

  private faceYaw(yaw: number, dt: number, rate = 5) {
    this.root.rotation.y += angleDelta(this.root.rotation.y, yaw) * (1 - Math.exp(-rate * dt));
  }

  private yawToJeep() {
    const p = this.root.position;
    return Math.atan2(-p.x, -p.z);
  }

  private driveRig(target: number, speed: number) {
    const t = Math.min(target, D.HELI_STOP);
    if (Math.abs(t - this.rigTarget) > 0.01 || Math.abs(speed - this.rigSpeed) > 0.01) {
      this.rigTarget = t;
      this.rigSpeed = speed;
      this.world.rig.moveTo(t, speed);
    }
  }

  private spawnMinion(type: string, x: number, y: number, z: number, entry: EntryKind, opts: Record<string, unknown> = {}) {
    let alive = 0;
    for (const e of this.world.enemies()) if (!e.isBoss && e.state !== 'dying' && e.hostile) alive++;
    if (alive >= 4) return;
    const e = createEnemy(type, this.world, { pos: new THREE.Vector3(x, y, z), frame: 'rig', entry, hpMul: 1, speedMul: 1, opts });
    this.world.add(e);
    if (type === 'raptor') this.world.fx.debris(e.worldPos(_v), 0x3d6a2c);
  }

  /** True the first time `key` is claimed (minion waves fire once; no per-frame closures). */
  private once(key: string): boolean {
    if (this.minionFlags.has(key)) return false;
    this.minionFlags.add(key);
    return true;
  }

  /**
   * Jaws-wide threat pose blended in by `k` so the open mouth and glowing
   * throat face the jeep. Far away (roars) the head rears up; `low` (close-range
   * bites, charges, lunges) leans the body in and drops the neck so the head
   * stays in frame, tilting the skull back so the throat still faces the
   * camera ~2 m below it.
   */
  private gape(k: number, low = false) {
    if (k <= 0) return;
    this.jawT = lerp(this.jawT, 1.1, k);
    if (low) {
      this.crouchT = Math.max(this.crouchT, 0.45 * k);
      this.pitchT = lerp(this.pitchT, 0.14, k);
      this.neckT = lerp(this.neckT, 0.06, k);
      this.headT = lerp(this.headT, -0.42, k);
    } else {
      this.neckT = lerp(this.neckT, -0.24, k);
      this.headT = lerp(this.headT, -0.3, k);
    }
  }

  /** Camera framing target in rig space. */
  private updateFocus(out: THREE.Vector3) {
    const st = this.state as TState;
    if (st === 'hidden' || (st === 'veer' && this.stateTime > 0.5)) {
      out.set(0, 2.4, -24);
    } else {
      this.head.getWorldPosition(_w);
      this.chest.getWorldPosition(_u);
      // Attack windups frame the head (eyes, gaping throat, telegraph ring).
      out.lerpVectors(_u, _w, this.winding ? 0.85 : 0.6);
      this.world.rig.space.updateMatrixWorld();
      this.world.rig.space.worldToLocal(out);
      out.y = clamp(out.y * 0.8 + 0.3, 1.8, 5);
    }
    return out;
  }

  private debrisMesh(kind: number): THREE.Group {
    const g = new THREE.Group();
    const r = this.world.rng;
    if (kind === 0) {
      // Snapped palm trunk with a frond tuft.
      Kit.add(g, Kit.cyl(0.2, 0.25, 2.4, 6), tx('bark', 0x7a6650, 1.5, 0.9), 0, 0, 0, Math.PI / 2, 0, 0);
      for (let i = 0; i < 4; i++) Kit.add(g, Kit.box(0.08, 0.5, 1.4), tx('leaves', 0x4a7b42, 2, 0.8), 0, 0, 1.2, 0.5, (i / 4) * Math.PI * 2, 0.6);
    } else if (kind === 1) {
      Kit.add(g, Kit.ico(0.55, 0), tx('rock', 0x6a665c, 1.6, 1), 0, 0, 0, r.next(), r.next(), 0, 1, 0.8, 1.1);
      Kit.add(g, Kit.ico(0.25, 0), tx('grass', 0x3f6a2e, 3, 0.8), 0.2, 0.35, 0);
    } else {
      // Wrecked car door / fence panel.
      Kit.add(g, Kit.box(1.3, 1.0, 0.1), tx('metal', 0xcfc8b4, 1.6, 0.6), 0, 0, 0);
      Kit.add(g, Kit.box(1.32, 0.16, 0.12), tx('metal', 0xb8302a, 1.6, 0.6), 0, -0.2, 0);
      Kit.add(g, Kit.box(0.9, 0.4, 0.12), clean(0x24344e), 0.1, 0.25, 0);
    }
    return g;
  }

  private fling(from: THREE.Vector3, i: number) {
    const kind = this.phase === 0 ? (i % 2 === 0 ? 0 : 1) : this.phase === 1 ? (i === 0 ? 2 : 1) : i % 3;
    this.throwProjectile(from.clone(), {
      flightTime: this.phase === 2 ? 1.45 : 1.65,
      arc: 2.4,
      hp: 2,
      size: 0.55,
      damage: 1,
      points: 150,
      mesh: this.debrisMesh(kind),
      color: kind === 0 ? 0x6e5d4a : 0x8a7d6a,
      spin: 4,
      burst: 'debris',
      source: this.title,
      sfxDestroy: kind === 0 ? 'wood_break' : 'hit_projectile',
    });
    this.world.audio.play('whoosh', { volume: 0.8, vary: 0.2 });
  }

  private chooseAttack(): TState {
    const r = this.world.rng.next();
    let pick: TState;
    if (this.phase === 0) pick = r < 0.62 ? 'biteWind' : 'flingWind';
    else if (this.phase === 1) pick = r < 0.45 ? 'chargeWind' : r < 0.7 ? 'biteWind' : 'flingWind';
    else pick = r < 0.72 ? 'lungeWind' : 'flingWind';
    if (pick === this.lastAttack && pick === 'flingWind') pick = this.phase === 0 ? 'biteWind' : this.phase === 1 ? 'chargeWind' : 'lungeWind';
    this.lastAttack = pick;
    return pick;
  }

  /** The phase's neutral state. */
  private idleState(): TState {
    return this.phase === 0 ? 'chase' : this.phase === 1 ? 'stalk' : 'retreat';
  }

  private afterAttack() {
    this.cooldown = [2.4, 2.0, 2.2][this.phase] ?? 2.2;
    this.go(this.idleState());
  }

  private stompFx(volume: number, shake: number) {
    this.world.audio.play('stomp', { volume, pitch: this.world.rng.range(0.62, 0.78), vary: 0.1 });
    if (shake > 0) this.world.rig.shake(shake);
  }

  // ─── Fight ────────────────────────────────────────────────────────────────

  protected override customUpdate(dt: number): void {
    const w = this.world;
    const rig = w.rig;
    const t = this.stateTime;
    const p = this.root.position;
    const st = this.state as TState;
    const first = this.entering;
    this.entering = false;

    // Phase changes from explosions / bombs bypass onDamaged.
    const ph = this.phaseFor();
    if (ph > this.phase) {
      this.phase = ph;
      this.onPhase(ph);
    }
    const busy = st === 'lurk' || st === 'burst' || st === 'roar' || st === 'veer' || st === 'hidden' || st === 'ambush' || st === 'knockdown' || st === 'down' || st === 'getup' || st === 'pursue' || st === 'blasted';
    if (this.pendingPhase > this.roarFor && !busy) {
      const next = this.pendingPhase;
      this.roarFor = next;
      if (next === 1) {
        this.afterRoar = 'veer';
        this.go('roar');
      } else {
        this.go('knockdown');
      }
      return;
    }

    // Defaults (states override).
    this.crouchT = 0;
    this.pitchT = 0.04;
    this.neckT = -0.18;
    this.headT = 0.2;
    this.headYawT = 0;
    this.jawT = 0.1 + Math.max(0, Math.sin(this.age * 0.9)) * 0.08;
    this.tailLiftT = 0;
    this.tailWhipT = 0;
    this.rollT = 0;
    this.anchored = false;
    this.shakeHead = 0;

    switch (st) {
      case 'lurk': {
        // In the treeline behind the jeep: trees thrash, the ground shakes.
        this.anchored = true;
        this.crouchT = 0.5;
        this.neckT = 0.1;
        this.faceYaw(this.yawToJeep(), dt, 3);
        this.driveRig(D.P0_LIMIT, 2.5);
        if (first) {
          w.audio.play('roar_distant', { volume: 1 });
          w.hud.prompt('SOMETHING BIG IS COMING...');
        }
        this.debrisT -= dt;
        if (this.debrisT <= 0) {
          this.debrisT = 0.22;
          w.fx.debris(this.head.getWorldPosition(_v), 0x3d6a2c);
          this.stompFx(0.5, 0.12);
        }
        if (t > 1.6) {
          this.from.copy(p);
          this.to.set(-1.2, 0, 13.5);
          this.go('burst');
          w.audio.play('wood_break', { volume: 1 });
          w.audio.play('rex_roar', { volume: 1, pitch: 1.05 });
        }
        break;
      }
      case 'burst': {
        const k = clamp(t / 1.05, 0, 1);
        p.lerpVectors(this.from, this.to, k);
        p.y = Math.sin(k * Math.PI) * 1.3;
        this.crouchT = -0.2;
        this.neckT = -0.1;
        this.jawT = 0.75;
        this.faceYaw(this.yawToJeep(), dt, 5);
        this.driveRig(D.P0_LIMIT, 4);
        if (k < 0.8 && Math.floor((t - dt) * 9) !== Math.floor(t * 9)) w.fx.debris(this.worldPos(_v).setY(2.5), 0x2f6a28);
        if (k >= 1) {
          p.y = 0;
          w.fx.dust(this.worldPos(_v), 2.6, 0x4a4436);
          this.stompFx(1, 0.8);
          w.audio.play('crash', { volume: 0.6 });
          w.hud.prompt('GO! GO! GO!');
          this.roarFor = 0;
          this.afterRoar = 'chase';
          this.go('roar');
        }
        break;
      }
      case 'roar': {
        // Rears up, jaws wide (throat exposed), shakes its head.
        const dur = 2.4;
        if (this.phase === 0) this.steer(p.x * 0.6, 14, 4, dt);
        else this.anchored = true;
        this.faceYaw(this.yawToJeep(), dt, 4);
        // Rear up, then thrust the gaping jaws at the jeep (throat glowing, facing the camera).
        if (t < 0.7) {
          const k = clamp(t / 0.5, 0, 1);
          this.jawT = 0.2 + 0.4 * k;
          this.pitchT = -0.2 * k;
          this.neckT = -0.5 * k;
          this.headT = 0.2 - 0.45 * k;
        } else {
          this.pitchT = 0.04;
          this.crouchT = 0.2;
          this.gape(1);
          this.shakeHead = t < 2.0 ? 1 : 0.3;
        }
        this.arm = 1;
        if (first) {
          w.audio.play('rex_roar', { volume: 1, pitch: this.roarFor >= 2 ? 0.9 : 1 });
          if (this.afterRoar === 'veer') w.hud.prompt('IT\'S CUTTING AHEAD!');
          if (this.afterRoar === 'lungeWind') w.hud.prompt('FINAL STAND!');
        }
        if (t > 0.5 && Math.floor((t - dt) * 4) !== Math.floor(t * 4)) {
          w.rig.shake(0.22);
          w.fx.dust(this.worldPos(_v), 1.3, 0x4a4436);
        }
        if (t >= dur) {
          if (this.roarFor === 2 && this.once('p2')) {
            this.spawnMinion('ptero', -7, 10, 14, 'fly');
            this.spawnMinion('ptero', 7, 11, 18, 'fly');
          }
          if (this.afterRoar === 'stalk' && this.once('p1')) {
            this.spawnMinion('raptor', -9, 0, -10, 'leap', { variant: 'red' });
            this.spawnMinion('raptor', 9, 0, -12, 'leap', { variant: 'tan' });
          }
          // First attack after the entrance roar comes later (the gun is usually hot by now).
          this.cooldown = this.afterRoar === 'chase' && this.lastAttack === '' ? 2.6 : 1.4;
          this.go(this.afterRoar);
        }
        break;
      }
      case 'chase': {
        // Phase 1: running behind the jeep, swaying across the road.
        const sway = Math.sin(this.age * 0.5) * 2.2;
        this.steer(sway, 13 + Math.sin(this.age * 0.33) * 1.2, 5, dt);
        this.faceYaw(this.yawToJeep(), dt, 4);
        this.neckT = -0.12 + Math.sin(this.age * 1.4) * 0.05;
        this.headYawT = Math.sin(this.age * 0.8) * 0.15;
        this.driveRig(D.P0_LIMIT, 4.3);
        // Never park mid-chase: once the jeep reaches the end of the phase-1
        // road it cuts ahead regardless of its health.
        this.parkedT = rig.d >= D.P0_LIMIT - 0.6 ? this.parkedT + dt : 0;
        if (this.parkedT > 1.2 && this.phase === 0) {
          this.phase = 1;
          this.pendingPhase = Math.max(this.pendingPhase, 1);
          break;
        }
        this.cooldown -= dt;
        if (this.cooldown <= 0) this.go(this.chooseAttack());
        if (this.hp < this.maxHp * 0.86 && this.once('p0')) {
          this.spawnMinion('raptor', -7.5, 0, 8, 'leap', { variant: 'green' });
          this.spawnMinion('raptor', 8, 0, 11, 'leap', { variant: 'tan' });
        }
        break;
      }
      case 'biteWind': {
        const dur = this.phase === 0 ? 1.75 : 1.6;
        this.winding = true;
        if (this.phase === 0) this.steer(0.5, 7.2, 7, dt);
        else {
          this.anchored = true;
          this.steer(0.4, -6.3, 7, dt);
        }
        this.faceYaw(this.yawToJeep(), dt, 6);
        const k = clamp(t / dur, 0, 1);
        // Leans in over the jeep with the jaws gaping — the glowing throat faces
        // the camera for most of the windup.
        this.crouchT = 0.25 * k;
        this.neckT = -0.1;
        this.headT = 0.2;
        this.jawT = 0.35;
        this.gape(smoothstep(0.08, 0.4, k), true);
        this.headYawT = Math.sin(t * 13) * 0.05 * k;
        if (first) w.audio.play('dino_roar', { volume: 0.85, pitch: 0.85 });
        const done = this.telegraphAttack(
          dur,
          () => {
            w.hurtPlayer(1, this.title, this);
            w.audio.play('bite', { volume: 1, pitch: 0.6 });
            w.audio.play('crash', { volume: 0.6 });
            w.rig.shake(0.85);
            w.rig.swerve = 0.12 * (w.rng.chance(0.5) ? 1 : -1);
            w.hitStop(0.05);
          },
          this.head,
        );
        if (done) this.go('biteRecover');
        break;
      }
      case 'biteRecover': {
        this.jawT = t < 0.15 ? 0 : 0.25;
        this.neckT = t < 0.3 ? 0.2 : -0.1;
        if (this.phase === 0) this.steer(0, 13, 6, dt);
        else {
          this.anchored = true;
          this.steer(0, -12, 4, dt);
        }
        this.faceYaw(this.yawToJeep(), dt, 4);
        if (t > 1.0) this.afterAttack();
        break;
      }
      case 'flingWind': {
        // Smash a palm / wreck with the tail or head and fling the debris.
        if (first) {
          this.flingSide = p.x >= 0 ? 1 : -1;
          this.flingThrown = 0;
          w.audio.play('dino_roar', { volume: 0.7, pitch: 1.1 });
        }
        const side = this.flingSide;
        const base = this.phase === 0 ? 11 : this.phase === 1 ? -13 : P3_Z + 0.5;
        if (this.phase !== 0) this.anchored = true;
        this.steer(side * 4.6, base, 5, dt);
        const smashAt = 0.6;
        if (t < smashAt) {
          this.faceYaw(this.yawToJeep() + side * 0.6, dt, 6);
          this.tailWhipT = -side * 0.9 * (t / smashAt);
          this.headYawT = side * 0.4;
          this.neckT = 0.25;
        } else {
          this.faceYaw(this.yawToJeep() - side * 0.25, dt, 9);
          this.tailWhipT = side * 1.1;
          this.headYawT = -side * 0.3;
          this.neckT = -0.05;
          this.jawT = 0.38;
        }
        const throws = this.phase === 0 ? 2 : this.phase === 1 ? 2 : 3;
        for (let i = this.flingThrown; i < throws; i++) {
          const at = smashAt + i * 0.32;
          if (t >= at) {
            this.flingThrown++;
            if (i === 0) {
              (this.phase === 1 ? this.head : this.tailTip).getWorldPosition(_v);
              _v.y = Math.max(_v.y, 1.5);
              w.fx.debris(_v, 0x3d6a2c);
              w.fx.debris(_v, 0x6e5d4a);
              w.audio.play(this.phase === 1 ? 'crash' : 'wood_break', { volume: 0.9 });
              w.rig.shake(0.25);
            }
            this.head.getWorldPosition(_v);
            _v.y += 0.4;
            _v.x += w.rng.spread(1);
            this.fling(_v, i);
          }
        }
        if (t > smashAt + throws * 0.32 + 0.6) this.afterAttack();
        break;
      }
      case 'veer': {
        // Peels off into the jungle on the left to cut ahead.
        this.steer(-17, 22, 7, dt);
        this.faceYaw(Math.PI + 0.9, dt, 3);
        this.neckT = -0.05;
        if (first) {
          w.audio.play('engine_rev', { volume: 0.8 });
          this.veerTarget = Math.min(rig.d + 45, D.HELI_APPROACH);
        }
        this.driveRig(this.veerTarget, 9);
        if (t > 0.5 && t < 2 && Math.floor((t - dt) * 6) !== Math.floor(t * 6)) w.fx.debris(this.worldPos(_v).setY(2.5), 0x2f6a28);
        if (t > 2.3) {
          this.model.visible = false;
          p.set(17, 0, -42);
          this.root.rotation.y = -Math.PI / 2 + 0.3;
          this.go('hidden');
        }
        break;
      }
      case 'hidden': {
        this.anchored = true;
        this.driveRig(this.veerTarget, 9);
        if (t > 0.9 && Math.floor((t - dt) * 3) !== Math.floor(t * 3)) {
          w.audio.play('stomp', { volume: 0.5, pitch: 0.6 });
          w.rig.shake(0.08);
        }
        if (t > 2.0 || p.z > -24 || rig.d >= this.veerTarget - 4) {
          this.model.visible = true;
          p.set(15.5, 0, Math.max(p.z, -28));
          this.from.copy(p);
          this.to.set(1.4, 0, -15.5);
          this.driveRig(rig.d + 4.5, 9);
          w.audio.play('wood_break', { volume: 1 });
          w.audio.play('rex_roar', { volume: 1, pitch: 1.1 });
          w.hud.prompt('IT\'S IN FRONT OF US!');
          this.go('ambush');
        }
        break;
      }
      case 'ambush': {
        const k = clamp(t / 1.1, 0, 1);
        p.lerpVectors(this.from, this.to, k);
        p.y = Math.sin(k * Math.PI) * 1.5;
        this.crouchT = -0.2;
        this.jawT = 0.8;
        this.faceYaw(this.yawToJeep(), dt, 6);
        if (k < 0.85 && Math.floor((t - dt) * 9) !== Math.floor(t * 9)) w.fx.debris(this.worldPos(_v).setY(2.5), 0x2f6a28);
        if (k >= 1) {
          p.y = 0;
          w.fx.dust(this.worldPos(_v), 2.6, 0x4a4436);
          this.stompFx(1, 0.9);
          w.audio.play('crash', { volume: 0.7 });
          w.rig.swerve = 0.1;
          this.afterRoar = 'stalk';
          this.go('roar');
        }
        break;
      }
      case 'stalk': {
        // Phase 2: blocking the road ahead, sizing the jeep up.
        this.anchored = true;
        this.steer(Math.sin(this.age * 0.45) * 3.6, -14.5 + Math.sin(this.age * 0.31) * 1.4, 2.6, dt);
        this.faceYaw(this.yawToJeep(), dt, 4);
        this.neckT = -0.05 + Math.sin(this.age * 1.1) * 0.06;
        this.headYawT = Math.sin(this.age * 0.7) * 0.2;
        this.cooldown -= dt;
        if (this.cooldown <= 0) this.go(this.chooseAttack());
        if (this.hp < this.maxHp * 0.5 && this.once('p1b')) {
          this.spawnMinion('ptero', -6, 10, -20, 'fly');
          this.spawnMinion('ptero', 6, 11, -24, 'fly');
        }
        break;
      }
      case 'chargeWind': {
        // Paws the road, lowers its head… then charges.
        const dur = 2.05;
        const chargeAt = dur - 0.8;
        this.winding = true;
        this.anchored = true;
        if (first) {
          this.from.copy(p);
          w.audio.play('dino_roar', { volume: 0.9, pitch: 0.62 });
        }
        if (t < chargeAt) {
          // Lowers its head and paws the road… then rears up bellowing, jaws wide.
          this.faceYaw(this.yawToJeep(), dt, 6);
          this.crouchT = 0.4;
          this.neckT = 0.3;
          this.headT = 0.3;
          this.jawT = 0.3;
          this.tailLiftT = 0.25;
          this.gape(smoothstep(0.25, 0.6, t));
          if (Math.floor((t - dt) * 2.8) !== Math.floor(t * 2.8)) {
            this.stompFx(0.7, 0.1);
            this.legs[1].foot.getWorldPosition(_v);
            w.fx.dust(_v, 0.9, 0x4a4436);
          }
        } else {
          // Thunders in with the gaping mouth leading.
          this.steer(0.2, -5.2, 20, dt);
          this.faceYaw(this.yawToJeep(), dt, 8);
          this.crouchT = 0.15;
          this.tailLiftT = 0.4;
          this.gape(1, true);
        }
        const done = this.telegraphAttack(
          dur,
          () => {
            w.hurtPlayer(1, this.title, this);
            w.audio.play('crash', { volume: 1 });
            w.audio.play('bite', { volume: 0.7, pitch: 0.5 });
            w.rig.shake(1);
            w.rig.swerve = 0.15 * (w.rng.chance(0.5) ? 1 : -1);
            w.hitStop(0.07);
          },
          this.head,
        );
        if (done) this.go('chargeRecover');
        break;
      }
      case 'chargeRecover': {
        this.anchored = true;
        this.steer(0, -11.5, 3.5, dt);
        this.faceYaw(this.yawToJeep(), dt, 4);
        this.shakeHead = t < 0.8 ? 1 : 0;
        this.neckT = 0.1;
        if (t > 1.4) this.afterAttack();
        break;
      }
      case 'stumble': {
        // Interrupted: reels back, jaws hanging open (free shots at the throat).
        const back = this.phase === 0 ? 14.5 : this.phase === 1 ? -15.5 : P3_Z;
        if (this.phase !== 0) this.anchored = true;
        this.steer(p.x * 0.6, back, 6, dt);
        this.crouchT = 0.3;
        this.gape(0.8);
        this.neckT += Math.sin(t * 9) * 0.08;
        this.shakeHead = 1;
        this.faceYaw(this.yawToJeep() + Math.sin(t * 4) * 0.3, dt, 4);
        if (first) w.fx.dust(this.worldPos(_v), 1.4, 0x4a4436);
        if (t > 1.6) {
          this.cooldown = [1.6, 1.4, 1.1][this.phase] ?? 1.2;
          this.go(this.idleState());
        }
        break;
      }
      case 'knockdown': {
        // Phase 3 trigger: staggered hard, it crashes down at the roadside.
        this.anchored = true;
        const k = clamp(t / 1.2, 0, 1);
        this.steer(6.5, p.z, 4, dt);
        this.rollT = k > 0.4 ? 1.35 : 0;
        this.jawT = 0.9;
        this.neckT = -0.3;
        this.crouchT = 0.5;
        if (first) {
          w.audio.play('rex_roar', { volume: 1, pitch: 0.72 });
          w.hud.prompt('NOW! FLOOR IT!');
        }
        if (t >= 0.9 && t - dt < 0.9) {
          w.fx.dust(this.worldPos(_v), 3, 0x4a4436);
          this.stompFx(1, 0.9);
          w.audio.play('crash', { volume: 0.8 });
          this.driveRig(D.HELI_STOP, 13);
          w.audio.play('engine_rev', { volume: 1 });
        }
        if (t > 1.3) this.go('down');
        break;
      }
      case 'down': {
        // Lying on its side as the jeep races past; legs kicking.
        this.anchored = true;
        if (!this.healthDropped && p.z > 3) {
          // Breather: a first-aid kit floats between the jeep and the downed rex
          // (in view as the camera swings back to it).
          this.healthDropped = true;
          _v.set(clamp(p.x * 0.4, -2.5, 2.5), 2.6, 5.5);
          w.add(new Pickup(w, 'health', _v.clone(), 'rig', 9));
        }
        this.rollT = 1.35;
        this.jawT = 0.28 + Math.sin(t * 3) * 0.12;
        this.tailWhipT = Math.sin(t * 5) * 0.5;
        this.driveRig(D.HELI_STOP, 13);
        if ((p.z > 14 && t > 1.2) || t > 6) this.go('getup');
        break;
      }
      case 'getup': {
        this.anchored = rig.speed > 1;
        this.rollT = 0;
        this.crouchT = 0.5;
        this.faceYaw(this.yawToJeep(), dt, 3);
        if (first) w.audio.play('dino_roar', { volume: 1, pitch: 0.75 });
        if (t > 1.2) this.go('pursue');
        break;
      }
      case 'pursue': {
        // Chases the jeep onto the helipad.
        const relMax = rig.moving ? 12 : 8;
        const speedIntoRig = Math.max(0, rig.speed);
        // Running at (rig speed + relative closing speed): undo part of the anchoring by steering.
        p.z += speedIntoRig * dt;
        this.steer(-2.4, P3_Z + 1, relMax + speedIntoRig, dt);
        this.faceYaw(this.yawToJeep(), dt, 4);
        this.driveRig(D.HELI_STOP, 13);
        if (rig.arrived && Math.abs(p.z - (P3_Z + 1)) < 2.5) {
          park()?.armFinale(w);
          this.afterRoar = 'lungeWind';
          this.cooldown = 0.5;
          this.go('roar');
        }
        break;
      }
      case 'lungeWind': {
        // Final lunge: it thunders down the road past the fuel tank, jaws wide.
        const dur = 2.5;
        this.winding = true;
        this.anchored = true;
        if (first) {
          this.from.copy(p);
          this.to.set(0.4, 0, 6.6);
          w.audio.play('rex_roar', { volume: 0.9, pitch: 1.15 });
          if (!this.finalePrompted && park()?.tank && !park()!.tank!.removed) {
            this.finalePrompted = true;
            w.hud.prompt('SHOOT THE FUEL TANK NEXT TO IT!');
          }
        }
        const k = clamp(t / dur, 0, 1);
        const e = k * k * (1.6 - 0.6 * k);
        p.x = lerp(this.from.x, this.to.x, e);
        p.z = lerp(this.from.z, this.to.z, e);
        this.faceYaw(this.yawToJeep(), dt, 6);
        this.crouchT = 0.2;
        this.neckT = 0.15;
        this.headT = 0.1;
        this.jawT = 0.3;
        this.gape(smoothstep(0.06, 0.32, k), true);
        this.tailLiftT = 0.3;
        const done = this.telegraphAttack(
          dur,
          () => {
            w.hurtPlayer(1, this.title, this);
            w.audio.play('bite', { volume: 1, pitch: 0.55 });
            w.audio.play('crash', { volume: 0.8 });
            w.rig.shake(1);
            w.rig.swerve = 0.14 * (w.rng.chance(0.5) ? 1 : -1);
            w.hitStop(0.07);
          },
          this.head,
        );
        if (done) this.go('lungeRecover');
        break;
      }
      case 'lungeRecover': {
        this.anchored = true;
        this.jawT = t < 0.15 ? 0 : 0.3;
        this.neckT = 0.2;
        this.shakeHead = 0.6;
        this.faceYaw(this.yawToJeep(), dt, 4);
        if (t > 0.7) this.afterAttack();
        break;
      }
      case 'retreat': {
        // Backs off up the road to line up the next lunge.
        this.anchored = true;
        this.steer(-2.4 + Math.sin(this.age * 0.6) * 1.2, P3_Z, 4.5, dt);
        this.faceYaw(this.yawToJeep(), dt, 4);
        this.neckT = -0.1 + Math.sin(this.age * 1.3) * 0.06;
        this.cooldown -= dt;
        if (this.cooldown <= 0 && p.z > P3_Z - 2) this.go(this.chooseAttack());
        if (this.hp < this.maxHp * 0.18 && this.once('p2b')) {
          this.spawnMinion('raptor', -9, 0, 13, 'leap', { variant: 'blue' });
          this.spawnMinion('raptor', 9, 0, 15, 'leap', { variant: 'red' });
        }
        break;
      }
      case 'blasted': {
        // Caught in the fuel explosion: hurled onto its side, jaws hanging.
        this.anchored = true;
        const k = clamp(t / 0.6, 0, 1);
        this.steer(p.x + this.blastSide * 3 * (1 - k), p.z + 1.5 * (1 - k), 8, dt);
        this.rollT = t < 2.6 ? this.blastSide * -1.3 : 0;
        this.jawT = 0.85;
        this.neckT = -0.2;
        this.crouchT = 0.4;
        this.tailWhipT = Math.sin(t * 6) * 0.4;
        if (t > 0.55 && t - dt <= 0.55) {
          w.fx.dust(this.worldPos(_v), 3, 0x4a4436);
          this.stompFx(1, 0.7);
        }
        if (t > 3.4) {
          this.cooldown = 1.2;
          this.go('retreat');
        }
        break;
      }
    }

    // Anchored: stand still in the world while the rig moves.
    if (this.anchored) p.z += rig.speed * dt;
    w.rig.swerve = damp(w.rig.swerve, 0, 3, dt);

    // Ambient growls.
    this.sfxT -= dt;
    if (this.sfxT <= 0) {
      this.sfxT = w.rng.range(3.5, 6.5);
      if (st === 'chase' || st === 'stalk' || st === 'retreat') w.audio.play('dino_roar', { volume: 0.5, pitch: w.rng.range(0.7, 0.85) });
    }

    // Camera framing.
    this.updateFocus(_v);
    this.focus.position.lerp(_v, 1 - Math.exp(-3.5 * dt));
  }

  // ─── Animation ────────────────────────────────────────────────────────────

  protected override animate(dt: number): void {
    if (dt <= 0) return;
    this.updateFlashes(dt);
    if (this.state === 'dying') return; // updateDeath owns the pose
    // Measure real ground speed (world space) for the gait.
    this.root.getWorldPosition(_v);
    this.worldVel.subVectors(_v, this.lastWorld).divideScalar(dt);
    this.lastWorld.copy(_v);
    const spd = Math.hypot(this.worldVel.x, this.worldVel.z);
    this.groundSpd = damp(this.groundSpd, Math.min(spd, 16), 6, dt);
    const dying = false;
    const st = this.state as TState;
    const airborne = this.root.position.y > 0.05;

    // Gait.
    const gs = dying || this.roll > 0.4 ? 0 : this.groundSpd;
    const freq = gs > 0.4 ? Math.min(1.9, 0.45 + gs / 5.2) : 0;
    this.gait += dt * freq * Math.PI * 2;
    this.run = damp(this.run, clamp(gs / 6, 0, 1) * (airborne ? 0.3 : 1), 5, dt);

    // Smooth pose.
    this.crouch = damp(this.crouch, this.crouchT, 6, dt);
    this.pitch = damp(this.pitch, this.pitchT, 5, dt);
    this.neckP = damp(this.neckP, this.neckT, 6, dt);
    this.headP = damp(this.headP, this.headT, 7, dt);
    this.headYaw = damp(this.headYaw, this.headYawT, 5, dt);
    this.jawOpen = damp(this.jawOpen, this.jawT, 10, dt);
    this.tailLift = damp(this.tailLift, this.tailLiftT, 4, dt);
    this.tailWhip = damp(this.tailWhip, this.tailWhipT, st === 'flingWind' ? 9 : 4, dt);
    this.roll = damp(this.roll, this.rollT, 4, dt);
    this.arm = damp(this.arm, 0, 2, dt);
    this.flinch = Math.max(0, this.flinch - dt * 3);

    const run = this.run;
    const ph = this.gait;
    // Legs (with stomps on foot strike).
    let maxH = 0;
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const lp = ph + i * Math.PI;
      const s = Math.sin(lp);
      const lift = Math.max(0, Math.cos(lp));
      const c = this.crouch;
      L.hip.rotation.x = LEG.hip + s * 0.5 * run - c * 0.35;
      L.knee.rotation.x = LEG.knee + lift * 0.75 * run + c * 0.7;
      L.ankle.rotation.x = LEG.ankle - lift * 0.45 * run - c * 0.35;
      L.foot.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x + L.ankle.rotation.x) + lift * 0.4 * run;
      L.hip.rotation.z = (i === 0 ? 1 : -1) * 0.04;
      const a1 = L.hip.rotation.x;
      const a2 = a1 + L.knee.rotation.x;
      const a3 = a2 + L.ankle.rotation.x;
      const h = LEG.thigh * Math.cos(a1) + LEG.shin * Math.cos(a2) + LEG.meta * Math.cos(a3) + LEG.foot;
      maxH = Math.max(maxH, h);
      // Foot strike: leg reaches its most forward point.
      const phase = ((lp % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (!dying && run > 0.25 && L.prev < 1.5 * Math.PI && phase >= 1.5 * Math.PI && this.model.visible) {
        const close = clamp(1.3 - this.distToPlayer / 28, 0.25, 1);
        this.world.audio.play('stomp', { volume: 0.55 * close, pitch: this.world.rng.range(0.66, 0.8), vary: 0.08 });
        this.world.rig.shake(0.1 * close * run);
        L.foot.getWorldPosition(_w);
        this.world.fx.dust(_w, 0.6 + run * 0.5, 0x4a4436);
      }
      L.prev = phase;
    }
    const bob = Math.abs(Math.sin(ph)) * 0.12 * run;
    this.hips.position.y = maxH + HIP_DROP - bob + this.roll * 0.0 - Math.abs(this.roll) * 0.25;
    this.hips.position.z = Math.sin(ph * 2) * 0.05 * run;
    const fl = this.flinch;
    this.hips.rotation.x = this.pitch + this.crouch * 0.12 + run * 0.05 - fl * 0.06;
    this.hips.rotation.y = Math.sin(ph) * 0.06 * run;
    this.hips.rotation.z = Math.sin(ph) * 0.05 * run - this.flinchSide * fl * 0.08;
    this.model.rotation.z = this.roll;
    this.model.position.y = Math.abs(this.roll) * 0.45;

    // Breathing.
    const breath = Math.sin(this.age * (st === 'stalk' || st === 'retreat' ? 2.6 : 1.8)) * (1 - run * 0.7);
    this.torsoMesh.scale.set(1 + breath * 0.025, 1 + breath * 0.035, 1);

    // Neck + head: stabilised against the gait, swaying, shaking when roaring.
    const shake = this.shakeHead * Math.sin(this.age * 17) * 0.12;
    this.neck.rotation.x = this.neckP - Math.sin(ph * 2) * 0.04 * run + fl * 0.1;
    this.neck.rotation.y = this.headYaw * 0.5 + shake * 0.5 - this.hips.rotation.y + this.flinchSide * fl * 0.12;
    this.head.rotation.x = this.headP + Math.sin(ph * 2 + 0.6) * 0.035 * run - fl * 0.15;
    this.head.rotation.y = this.headYaw * 0.5 + shake + this.flinchSide * fl * 0.15;
    this.head.rotation.z = shake * 0.6;
    this.jaw.rotation.x = this.jawOpen * 0.82;
    // The mouth (weak) only exists while the jaws are really gaping.
    const open = this.jawOpen > 0.42 && this.state !== 'dying';
    this.mouth.visible = open;
    this.maw.visible = open;
    this.tongue.visible = open;
    this.maw.rotation.x = this.jaw.rotation.x * 0.5;
    // Weak-point hit pulses (glow stays on; the struck spot swells briefly).
    this.eyePulse = Math.max(0, this.eyePulse - dt * 9);
    this.mouthPulse = Math.max(0, this.mouthPulse - dt * 9);
    const hs = 1 + this.eyePulse * 0.3;
    for (const h of this.halos) h.scale.set(1.05 * hs, 0.72 * hs, 1.35 * hs);
    // The throat glow fills the gap between the jaws as they open.
    const ts = 1 + this.mouthPulse * 0.22;
    const gap = clamp((this.jawOpen - 0.42) / 0.6, 0, 1);
    this.throat.scale.set(0.88 * ts, (0.32 + 0.3 * gap) * ts, 0.6 * ts);

    // Arms flail.
    for (let i = 0; i < this.arms.length; i++) {
      this.arms[i].rotation.x = 0.3 + Math.sin(this.age * (3 + this.arm * 9) + i * 1.3) * (0.15 + this.arm * 0.5);
    }

    // Tail: counter-sway to the hips, whip + lift.
    for (let i = 0; i < this.tail.length; i++) {
      const seg = this.tail[i];
      const lag = Math.sin(ph - i * 0.55) * 0.07 * run;
      seg.rotation.y = -lag + this.tailWhip * (0.12 + i * 0.05) + Math.sin(this.age * 1.1 - i * 0.6) * 0.03;
      seg.rotation.x = (i === 0 ? 0.1 : 0.02) - this.tailLift * 0.12 + Math.sin(this.age * 1.6 - i * 0.5) * 0.015;
    }
  }

  // ─── Death ────────────────────────────────────────────────────────────────

  override die(hit: ShotHit | null): void {
    if (this.state === 'dying') return;
    this.clearFlashes();
    super.die(hit);
  }

  protected override onDeath(_hit: ShotHit | null): void {
    const w = this.world;
    // The pack scatters and nothing in flight lands once the king falls.
    for (const e of w.enemies()) if (e !== this && e.state !== 'dying') e.die(null);
    for (const e of w.entities) {
      if (e instanceof Projectile && !e.removed) {
        e.removed = true;
        w.fx.debris(e.worldPos(_v), 0x6e5d4a);
      }
    }
    this.model.visible = true;
    w.audio.play('rex_roar', { volume: 1, pitch: 0.6 });
    w.audio.play('dino_die', { volume: 1, pitch: 0.7 });
    w.hud.prompt(null);
    this.telegraph = null;
    // Momentum: keep sliding along its heading toward the jeep (world frame now).
    const yaw = this.root.rotation.y;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const sp = clamp(Math.hypot(this.worldVel.x, this.worldVel.z), 4, 11);
    this.deathVel.set(fwdX * sp, 0, fwdZ * sp);
    this.deathSide = this.flinchSide;
    this.mouth.visible = false;
    this.maw.visible = false;
    this.tongue.visible = false;
    this.rollT = this.roll;
  }

  protected override updateDeath(dt: number): boolean {
    const w = this.world;
    const t = this.stateTime;
    const p = this.root.position;
    // Slide, never into the camera.
    p.x += this.deathVel.x * dt;
    p.z += this.deathVel.z * dt;
    w.rig.space.updateMatrixWorld();
    _v.copy(w.camera.position).setY(p.y);
    const dist = _v.distanceTo(p);
    if (dist < 7.5) {
      _u.subVectors(p, _v).setY(0).normalize();
      const toward = -(this.deathVel.x * _u.x + this.deathVel.z * _u.z);
      if (toward > 0) this.deathVel.addScaledVector(_u, toward);
      p.addScaledVector(_u, (7.5 - dist) * Math.min(1, dt * 4));
    }
    w.rig.swerve = damp(w.rig.swerve, 0, 3, dt);
    const friction = t < 1.0 ? 0.8 : 2.4;
    this.deathVel.multiplyScalar(Math.exp(-friction * dt));
    p.y = w.groundAt(p.x, p.z);
    // Stumble (legs buckle) → topple onto its side → head slams down.
    this.crouchT = 0.8;
    this.crouch = damp(this.crouch, 1, 3, dt);
    const k = clamp((t - 0.45) / 0.8, 0, 1);
    const e = k * k;
    this.model.rotation.z = this.rollT * (1 - e) + this.deathSide * e * 1.42;
    this.model.position.y = e * 0.9;
    this.neckT = 0.25 + e * 0.2;
    this.neckP = damp(this.neckP, 0.15 + e * 0.35, 4, dt);
    this.headP = damp(this.headP, 0.3, 4, dt);
    this.jawOpen = damp(this.jawOpen, t > 3 ? 0.55 : 0.25, 1.5, dt);
    if (!this.slammed && k >= 1) {
      this.slammed = true;
      this.world.audio.play('stomp', { volume: 1, pitch: 0.55 });
      this.world.audio.play('crash', { volume: 0.7 });
      w.rig.shake(0.9);
      w.fx.dust(this.worldPos(_v), 3.2, 0x4a4436);
      this.head.getWorldPosition(_v);
      w.fx.dust(_v, 2.2, 0x4a4436);
      w.fx.blood(_v, null, { color: this.bloodColor, amount: 2 });
    }
    if (t < 1.4 && Math.floor((t - dt) * 5) !== Math.floor(t * 5)) w.fx.dust(this.worldPos(_v), 1.2, 0x4a4436);
    // Last twitch, eyes fade.
    for (let i = 0; i < this.tail.length; i++) this.tail[i].rotation.y = Math.sin(t * 6 - i) * 0.12 * Math.max(0, 1 - t / 3);
    if (t > 3.2) for (const m of [...this.eyes, ...this.halos]) m.material = this.eyeDead;
    for (const L of this.legs) {
      L.hip.rotation.x = damp(L.hip.rotation.x, -0.9, 3, dt);
      L.knee.rotation.x = damp(L.knee.rotation.x, 1.6, 3, dt);
    }
    this.neck.rotation.x = this.neckP;
    this.head.rotation.x = this.headP;
    this.jaw.rotation.x = this.jawOpen * 0.82;
    this.hips.position.y = damp(this.hips.position.y, 2.2, 2.5, dt);
    // Keep the camera on the carcass.
    this.chest.getWorldPosition(_v);
    w.rig.space.updateMatrixWorld();
    w.rig.space.worldToLocal(_v);
    _v.y = clamp(_v.y, 1.2, 3.2);
    this.focus.position.lerp(_v, 1 - Math.exp(-2.5 * dt));
    if (t > this.deathDuration) {
      // Leave the carcass in the world for the escape shot.
      if (!this.corpseKept) {
        this.corpseKept = true;
        this.world.scene.attach(this.model);
      }
      return true;
    }
    return false;
  }
}

registerEnemy('tyrant', (w, s) => new Tyrant(w, s));

import * as THREE from 'three';
import type { Frame } from '../core/types';
import { Rng } from '../core/Rng';
import { angleDelta, clamp, smoothstep } from '../core/math';
import { Entity, type ShotHit, type ShotOutcome } from './Entity';
import { Enemy } from './Enemy';
import type { World } from './World';
import { buildHumanoid, type HumanoidRig } from '../content/kit/humanoid';
import { Kit } from '../content/kit/ModelKit';
import { bakeHumanoid, releaseGeos, ZT, type BakedHumanoid, type ZSurface } from '../content/enemies/zombieKit';
import { humanLook, paintHuman, type HumanLook, type HumanPose } from '../content/pixel/human';
import type { PixelFigure } from './pixel/figure';
import { CIV_STAMP, HAND } from './pixel/stamps';
import {
  aimArm,
  applyPose,
  blendPose,
  poseBackAway,
  poseBuf,
  poseCower,
  poseFlee,
  poseGrabbed,
  poseHide,
  poseJog,
  posePlead,
  poseStumble,
  poseThanks,
  tremble,
  type PoseBuf,
} from './civPoses';
import { Grabber } from './civGrab';
import { Bubble3D } from './civBubble';

interface CivLook {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  /** Bare forearms (short or rolled-up sleeves). */
  short?: boolean;
  /** Surface of the shirt and sleeves (default cloth). */
  shirtTex?: ZSurface;
  /** A ponytail (swings in ART: SPRITES). */
  ponytail?: boolean;
}

/**
 * Bright, clean, saturated arcade palette with warm skin and hair: civilians
 * must read as "alive — don't shoot" next to the grey-green, blood-soaked
 * zombies, also on a dark CRT. Every look is chosen to NEVER match a zombie
 * variant wearing the same job (zombieKit `dressVariant`): living cops wear a
 * light-blue short-sleeve summer shirt and no cap (zombie cops: navy, peaked
 * cap), the living nurse wears purple scrubs and a white cap (zombie nurses:
 * teal / dusty pink / blue scrubs), the doctor's lab coat is open over a royal
 * blue shirt and stops at the waist (zombie doctors: closed coat with tails),
 * and the worker is a red buffalo-check flannel and jeans (zombie workers:
 * grey shirts, hi-vis vests, hard hats).
 */
const VARIANTS: Record<string, CivLook> = {
  default: { shirt: 0x3f86d0, pants: 0x3a5280, skin: 0xe0b48f, hair: 0x3b2a1a, short: true, ponytail: true },
  scientist: { shirt: 0xf4f4f0, pants: 0x8a7a5c, skin: 0xd9a77f, hair: 0x5a4632 },
  ranger: { shirt: 0xb09a5a, pants: 0x6a5a38, skin: 0xc68e5e, hair: 0x4a3216, short: true },
  cop: { shirt: 0x7cacea, pants: 0x232c4a, skin: 0xb98060, hair: 0x1a1414, short: true },
  nurse: { shirt: 0xa04cc8, pants: 0xa04cc8, skin: 0xf0c8a0, hair: 0x6b3a1a, short: true },
  worker: { shirt: 0xc4382a, pants: 0x3a5a8a, skin: 0xa8714e, hair: 0x1a1a1a, short: true, shirtTex: ZT.PLAID },
};

/**
 * What a civilian does (a stage's `CivilianDef.act`, else `auto`):
 *
 *   cower     crouched low, forearms over the head, trembling; peeks up
 *             between attacks, tucks in when something lunges.
 *   hide      ducked behind cover with the back to the camera, peeking over
 *             it and glancing back for help; drops down when a threat is near.
 *   flee      runs for it — toward the camera and out past the nearer side of
 *             the screen (or to `to`), looking back over the shoulder, tripping
 *             once and scrambling up. Safe off screen = rescued.
 *   backaway  backs off from the nearest threat, hands up, then turns and runs.
 *   grabbed   held by a zombie (spawned with it); shoot the zombie and they're
 *             free; left too long they wrench free and run.
 *   plead     waves for help ("HELP!") on and off, cowering in between.
 *   auto      a short HELP!, then cowers; backs away and runs if a threat gets close.
 */
export type CivAct = 'auto' | 'cower' | 'hide' | 'flee' | 'backaway' | 'grabbed' | 'plead';

export interface CivilianOpts {
  act?: CivAct;
  /** flee: where to run (world). Default: off the nearer side of the screen. */
  to?: THREE.Vector3 | null;
  /** grabbed: the zombie's outfit variant (default 'civilian'). */
  attacker?: string;
  /** Seconds of HELP! waving before the act (default: per act). */
  help?: number;
}

/** What the civilian is doing right now. */
export type CivPhase = 'plead' | 'cower' | 'hide' | 'backaway' | 'flee' | 'stumble' | 'grabbed' | 'thanks' | 'leave';
type Phase = CivPhase;

/**
 * Root-to-root distance (m) a grabbing zombie keeps, toward the middle of the
 * view: both arms straight, so its head and chest sit well clear of the civilian
 * on screen (≈ 3 aim-error σ of the human-like bot at the z2 ER's 8.6 m).
 */
export const GRAB_SEP = 1.55;
/** Seconds of HELP! before each act (when the stage doesn't say). */
const HELP_FIRST: Record<CivAct, number> = { auto: 1.5, cower: 1.2, hide: 0, flee: 0, backaway: 0.9, grabbed: 0, plead: 2.2 };
/** A threat this close (m, ground) panics an `auto` civilian into backing off / running. */
const PANIC_ZOMBIE = 2.6;
const PANIC_DINO = 4.2;
/** A threat this close makes a cowering / hiding civilian duck (no peeking). */
const DUCK_DIST = 4;
const STUMBLE_TIME = 1.35;
const RUN_SPEED = 3.6;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * Innocent bystander. Don't shoot! Shooting one costs a life and points.
 * Rescued (bonus) when the encounter is cleared, when the zombie holding them
 * is shot, or when they get away off screen.
 *
 * Look: a humanoid with a screaming face and variant props (lab coat, ranger
 * hat, cop cap, hi-vis vest…), baked like the zombies into a few textured,
 * vertex-coloured meshes — faces and props cost no extra draw calls.
 *
 * Behaviour: a small repertoire of frightened acts (`CivAct`) in the spirit of
 * the arcade light-gun games — they cower and peek, hide behind cover, run for
 * it and trip, back off from a zombie, get grabbed, wave for help, and thank
 * you when saved. Poses are written to a pose buffer (civPoses.ts) and blended,
 * so ART: 3D and ART: SPRITES (which paints from the same rig) show the same.
 * Never in an attack lane: they stay where the stage put them or run outward,
 * away from the middle of the view where everything comes at the player.
 */
export class Civilian extends Entity {
  private rig: HumanoidRig;
  private baked: BakedHumanoid;
  rescued = false;
  shot = false;
  /** ART: SPRITES — what the PixelCast painter draws. */
  private look: HumanLook;
  private pose2d: HumanPose = { severed: [0, 0], headless: false, jaw: 0.8, face: 'scream', squash: 0, time: 0, speed: 0 };

  /** The act it was spawned with. */
  readonly act: CivAct;
  private phase: Phase = 'plead';
  private phaseT = 0;
  /** Phase after the opening HELP!. */
  private main: Phase = 'cower';
  private helpTime: number;
  private readonly rng: Rng;
  private readonly pose = poseBuf();
  private readonly from = poseBuf();
  private readonly target = poseBuf();
  private readonly aux: PoseBuf = poseBuf();
  private blendT = 1;
  private blendDur = 0.3;
  /** Standing on something raised (a truck bed): it stays put. */
  private readonly perched: boolean;
  private readonly dino: boolean;
  // Senses (every 0.1 s).
  private senseT = 0;
  private threat: Enemy | null = null;
  private threatDist = Infinity;
  /** Direction to the threat in the body frame (radians, + = the character's left). */
  private threatAng = 0;
  /** Something is winding up an attack somewhere. */
  private alarm = false;
  /** Screen side (+1 right half, −1 left). */
  private side = 1;
  // Peeking (cower / hide), glancing back (hide).
  private peek = 0;
  private peekOn = false;
  private peekT = 0;
  private glance = 0;
  private glanceT = 2.5;
  private glanceAmt = 0;
  // Moving.
  private readonly dest = new THREE.Vector3();
  private destSet = false;
  private readonly to: THREE.Vector3 | null;
  private stride = 0;
  private speed = 0;
  private yawGoal = 0;
  private stumbleAt = -1;
  private lookBack = 0;
  private lookBackT = 1;
  private lookAmt = 0;
  private runT = 0;
  // Grabbed.
  private grabber: Grabber | null = null;
  private readonly attacker: string;
  /** +1: the zombie holding on is at the character's left. */
  private grabSide = 1;
  private grabTime = 7.5;
  /** BACK AWAY: seconds edging back before turning to run (if nothing comes close first). */
  private backTime = 5;
  private pull = 0;
  /** Where the zombie holding on stands (world), its extra turn, and where the hands meet. */
  readonly grabSpot = new THREE.Vector3();
  grabTurn = 0;
  readonly grabHand = new THREE.Vector3();
  private readonly grabBase = new THREE.Vector3();
  // Speech bubble, gestures.
  private bubble = -1;
  private bubbleT = 0;
  private helps = 0;
  /** ART: 3D's copy of the bubble (PixelCast stamps its own). */
  private readonly bubble3d = new Bubble3D(this.root);
  private waveSide = 1;
  private thumb = false;

  constructor(world: World, pos: THREE.Vector3, frame: Frame, variant = 'default', opts: CivilianOpts = {}) {
    super(world);
    this.frame = frame;
    this.root.position.copy(pos);
    const v = VARIANTS[variant] ?? VARIANTS.default;
    const r = (this.rig = buildHumanoid({
      skin: v.skin,
      shirt: v.shirt,
      pants: v.pants,
      hair: v.hair,
      sleeves: v.shirt,
      shoes: 0x2a221c,
      height: 1.72,
    }));
    // The rig has bare forearms; long sleeves cover them.
    if (!v.short) for (const a of [r.armL, r.armR]) a.lower.material = Kit.mat(v.shirt);
    if (v.shirtTex !== undefined) {
      for (const m of [r.torsoMesh, r.armL.upper, r.armR.upper]) m.userData.t = v.shirtTex;
      if (!v.short) for (const a of [r.armL, r.armR]) a.lower.userData.t = v.shirtTex;
    }
    // Same hit zones as the plain rig: the neck block was never a target.
    const neck = r.neck.children.find((c) => (c as THREE.Mesh).isMesh);
    if (neck) neck.userData.z = 'none';
    dressCivilian(r, variant, v);
    this.look = civilianLook(variant, v);
    this.baked = bakeHumanoid(this.rig, { skin: v.skin });
    this.root.add(this.rig.root);
    // (One draw from the world's RNG, as ever: the civilian's own randomness comes from it.)
    this.rng = new Rng(Math.floor(world.rng.next() * 0x7fffffff) + 1);
    this.perched = pos.y > world.groundAt(pos.x, pos.z) + 0.4;
    this.dino = world.stage?.campaign === 'dino';
    this.to = opts.to ? opts.to.clone() : null;
    this.attacker = opts.attacker ?? 'civilian';
    let act = opts.act ?? 'auto';
    // Up on a truck bed nobody runs, hides or gets grabbed: they wave for help.
    if (this.perched && act !== 'cower') act = 'plead';
    this.act = act;
    this.helpTime = opts.help ?? HELP_FIRST[act];
    this.main = act === 'hide' ? 'hide' : act === 'flee' ? 'flee' : act === 'backaway' ? 'backaway' : act === 'grabbed' ? 'grabbed' : 'cower';
    this.waveSide = this.rng.next() < 0.5 ? 1 : -1;
    this.grabTime = 7 + this.rng.next() * 1.5;
    this.backTime = 4.5 + this.rng.next() * 2;
    this.peekT = 1 + this.rng.next() * 1.5;
    this.thumb = this.rng.next() < 0.5;
    if (this.rng.next() < 0.75) this.stumbleAt = 0.7 + this.rng.next() * 0.7;
  }

  override onAdded(): void {
    const z = this.baked.zones;
    for (const m of z.head) this.hitbox(m, 'head');
    for (const m of z.torso) this.hitbox(m, 'torso');
    for (const m of z.limb) this.hitbox(m, 'limb');
    this.view();
    // Face the player; the screen side decides which way is "outward".
    this.root.rotation.y = this.yawGoal = this.faceCamYaw();
    this.side = this.viewX(this.root.position) >= 0 ? 1 : -1;
    this.sense();
    if (this.main === 'grabbed') this.startGrab();
    this.enter(this.helpTime > 0 ? 'plead' : this.main, 0.01);
    this.writePose(0);
    this.blendT = 1;
    this.pose.set(this.target);
    applyPose(this.rig, this.pose);
    this.world.audio.play('civilian_scream', { volume: 0.6, vary: 0.2 });
  }

  override dispose(): void {
    super.dispose();
    releaseGeos(this.baked.geos);
  }

  /** Called by the stage runner when the encounter is cleared (and when they're saved / get away). */
  rescue() {
    if (this.shot || this.rescued) return;
    this.rescued = true;
    this.world.shootables.removeOwner(this);
    this.world.onCivilianRescued(this);
    this.age = 0;
    this.letGo();
    const running = this.phase === 'flee' || this.phase === 'stumble' || this.phase === 'backaway';
    this.destSet = false;
    this.enter(running ? 'leave' : 'thanks', running ? 0.25 : 0.3);
  }

  // ─── Grabbed ──────────────────────────────────────────────────────────────

  /** Spawn the zombie holding on: level with us, toward the middle of the view. */
  private startGrab() {
    const p = this.root.position;
    // Toward the screen centre (−side along the view's right), a touch nearer the camera.
    this.grabBase.copy(p).addScaledVector(_right, -this.side * GRAB_SEP).addScaledVector(_fwd, -0.15);
    this.grabBase.y = this.world.groundAt(this.grabBase.x, this.grabBase.z);
    this.grabSpot.copy(this.grabBase);
    // In our body frame (we face the camera, so the view's right is our left).
    this.grabSide = -this.side;
    const g = new Grabber(this.world, { pos: this.grabSpot.clone(), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: { variant: this.attacker } }, this);
    // It faces us turned well round to the camera, holding on with the hand on our side.
    g.gripSide = this.side;
    this.grabber = this.world.add(g);
  }

  /** The zombie lost its hold (its gripping arm shot off): pull free and run. */
  grabberLost() {
    this.grabber = null;
    if (this.phase === 'grabbed') this.enter('flee', 0.2);
  }

  private letGo() {
    const g = this.grabber;
    this.grabber = null;
    if (g && !g.removed && g.state !== 'dying') g.release();
  }

  /** World position of our shoulder on the grabbed side (the zombie claws at it). */
  shoulderPoint(out: THREE.Vector3): THREE.Vector3 {
    const a = this.grabSide > 0 ? this.rig.armL : this.rig.armR;
    return a.shoulder.getWorldPosition(out);
  }

  // ─── Per frame ────────────────────────────────────────────────────────────

  update(dt: number): void {
    this.age += dt;
    const r = this.rig;
    if (this.shot) {
      this.bubble3d.hide();
      const k = Math.min(1, this.age / 0.6);
      r.root.rotation.x = -k * 1.4;
      if (this.age > 2) this.removed = true;
      return;
    }
    this.phaseT += dt;
    this.view();
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.1;
      this.sense();
    }
    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.bubble = -1;
    }
    this.think(dt);
    if (this.removed) return;
    this.writePose(dt);
    this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
    if (this.blendT < 1) blendPose(this.pose, this.from, this.target, smoothstep(0, 1, this.blendT));
    else this.pose.set(this.target);
    applyPose(r, this.pose);
    const turn = 1 - Math.exp(-(this.phase === 'flee' || this.phase === 'leave' ? 9 : 5) * dt);
    this.root.rotation.y += angleDelta(this.root.rotation.y, this.yawGoal) * turn;
    if (this.phase === 'grabbed' && this.grabber) this.reachForGrabber();
    this.updateBubble3d();
  }

  /** The 3D bubble over the head (same spot as the painter's: world up from the head). */
  private updateBubble3d() {
    if (this.bubble < 0) {
      this.bubble3d.hide();
      return;
    }
    const h = this.rig.head;
    h.updateWorldMatrix(true, false);
    h.localToWorld(_v.set(0, 0.13, 0));
    _v.y += 0.55 * this.rig.scale;
    this.bubble3d.update(this.bubble, _v, this.world.camera);
  }

  /** The tug of war: our near hand and the zombie's gripping hand meet between our shoulders. */
  private reachForGrabber() {
    const g = this.grabber!;
    const gr = g.rig;
    this.shoulderPoint(_v);
    const ga = gr ? (g.gripSide > 0 ? gr.armL : gr.armR) : null;
    if (ga) ga.shoulder.getWorldPosition(_w);
    else _w.copy(this.grabSpot).setY(_v.y);
    this.grabHand.lerpVectors(_v, _w, 0.5);
    this.grabHand.y -= 0.12;
    aimArm(this.grabSide > 0 ? this.rig.armL : this.rig.armR, this.grabHand);
  }

  /** Decide: transitions, movement and facing for the current phase. */
  private think(dt: number) {
    const t = this.phaseT;
    // Which half of the screen we're on, while standing our ground (the camera may
    // still be turning to the scene when we appear): "outward" is that way.
    if (this.phase === 'plead' || this.phase === 'cower' || this.phase === 'hide') {
      const x = this.viewX(this.root.position);
      if (Math.abs(x) > 0.4) this.side = x > 0 ? 1 : -1;
    }
    switch (this.phase) {
      case 'plead':
        this.yawGoal = this.faceCamYaw();
        if (t > this.helpTime) this.enter(this.main);
        else this.panic();
        break;
      case 'cower':
      case 'hide': {
        // Cowering turned three-quarters away from the threat (toward the screen
        // edge); hiding with the back three-quarters to the camera. (A crouch reads
        // in a 3/4 view; head-on it looks like standing on bent knees.)
        this.yawGoal = this.phase === 'hide' ? this.faceCamYaw() + Math.PI + this.side * 0.6 : this.faceCamYaw() + this.side * 0.95;
        this.peeking(dt);
        if (this.phase === 'hide') this.glancing(dt);
        if (this.act === 'plead' && t > 3.2 && !this.alarm && this.threatDist > DUCK_DIST) {
          this.helpTime = 1.6;
          this.enter('plead');
        } else this.panic();
        break;
      }
      case 'backaway': {
        const th = this.threat;
        if (th) {
          th.root.getWorldPosition(_v);
          this.yawGoal = Math.atan2(_v.x - this.root.position.x, _v.z - this.root.position.z);
        } else this.yawGoal = this.faceCamYaw();
        // Back off, away from it and outward on screen.
        this.outward(_n);
        if (th) {
          _w.copy(this.root.position).sub(_v).setY(0).normalize();
          _n.add(_w).normalize();
        }
        // Edging back while it's still coming (a stage's BACK AWAY), stepping back
        // briskly once it's close (an `auto` civilian's panic); then turn and run.
        const near = this.threatDist < (this.dino ? 4.5 : 3.2);
        const slow = this.act === 'backaway' && !near;
        this.speed = slow ? 0.35 : 0.9;
        this.stride += dt * (slow ? 3.5 : 6.5);
        this.step(_n, this.speed * dt);
        if (this.threatDist < 1.7 || (slow ? t > this.backTime : t > 2.2 || (this.act === 'backaway' && t > 1.2))) this.enter('flee', 0.2);
        break;
      }
      case 'flee':
      case 'leave': {
        if (!this.destSet) this.pickDest();
        const run = this.phase === 'flee' ? RUN_SPEED : 2.8;
        this.speed = Math.min(run, this.speed + dt * 9);
        this.runT += dt;
        _n.copy(this.dest).sub(this.root.position).setY(0);
        const d = _n.length();
        if (d > 1e-3) {
          _n.divideScalar(d);
          this.yawGoal = Math.atan2(_n.x, _n.z);
          // Turn first, then go (no moonwalking off at right angles).
          const facing = Math.cos(angleDelta(this.root.rotation.y, this.yawGoal));
          this.step(_n, Math.min(d, this.speed * dt * clamp(facing * 1.5, 0.2, 1)));
        }
        this.stride += dt * (this.phase === 'flee' ? 11.5 : 10);
        // A look back over the shoulder now and then.
        this.lookBackT -= dt;
        if (this.lookBackT <= 0) {
          this.lookBackT = 1.1 + this.rng.next() * 0.6;
          this.lookBack = this.threatAng >= 0 ? 1 : -1;
        }
        if (this.lookBackT < 0.75) this.lookBack = 0;
        if (this.phase === 'flee' && this.stumbleAt > 0 && this.runT > this.stumbleAt) {
          this.stumbleAt = -1;
          this.enter('stumble', 0.12);
          break;
        }
        if (this.offScreen() && t > 0.3) {
          // Got away (safe off screen: that's a rescue).
          if (!this.rescued) this.rescue();
          this.removed = true;
        } else if (d < 0.4) {
          // Reached the stage's spot, still in view: hide there.
          if (this.phase === 'leave') this.removed = true;
          else this.enter('cower');
        } else if (this.phase === 'leave' && this.age > 7) this.removed = true;
        break;
      }
      case 'stumble': {
        const u = t / STUMBLE_TIME;
        // Skid on, stop on all fours, then scramble off again.
        this.speed = u < 0.22 ? Math.max(0, this.speed - dt * 8) : u < 0.62 ? 0 : Math.min(RUN_SPEED * 0.8, this.speed + dt * 7);
        _n.set(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
        this.step(_n, this.speed * dt);
        if (u >= 1) this.enter('flee', 0.15);
        break;
      }
      case 'grabbed': {
        const g = this.grabber;
        this.yawGoal = this.faceCamYaw() - this.grabSide * 0.45;
        if (!g || g.removed || g.state === 'dying') {
          // The zombie's down: saved!
          this.grabber = null;
          this.rescue();
          break;
        }
        // Tug of war: we pull away, it drags us back.
        this.pull = Math.sin(t * 2.6) * 0.7 + 0.3 * Math.sin(t * 6.1);
        this.grabSpot.copy(this.grabBase).addScaledVector(_right, this.side * 0.07 * this.pull);
        this.grabTurn = -this.side * 0.8;
        if (t > 0.4 && this.helps === 0) this.say(CIV_STAMP.bubble.help, 1.6);
        if (t > this.grabTime) {
          // Wrenched free.
          this.letGo();
          this.enter('flee', 0.15);
        }
        break;
      }
      case 'thanks':
        this.yawGoal = this.faceCamYaw();
        if (t > 1.25) {
          this.destSet = false;
          this.enter('leave', 0.3);
        }
        break;
    }
  }

  /** `auto` civilians back off and run when a threat comes close. */
  private panic() {
    if (this.act !== 'auto' || this.perched) return;
    if (this.threatDist < (this.dino ? PANIC_DINO : PANIC_ZOMBIE)) this.enter(this.threatDist < 1.6 ? 'flee' : 'backaway', 0.2);
  }

  /** Cower / hide: duck while anything is close or attacking, peek up in between. */
  private peeking(dt: number) {
    const danger = this.alarm || this.threatDist < DUCK_DIST;
    this.peekT -= dt;
    if (danger) {
      this.peekOn = false;
      this.peekT = Math.max(this.peekT, 0.8);
    } else if (this.peekT <= 0) {
      this.peekOn = !this.peekOn;
      this.peekT = this.peekOn ? 1 + this.rng.next() * 0.7 : 1.4 + this.rng.next() * 1.4;
    }
    const goal = this.peekOn ? 1 : 0;
    this.peek += (goal - this.peek) * (1 - Math.exp(-(goal > this.peek ? 5 : 9) * dt));
  }

  /** Hiding: now and then a look back over the shoulder at the camera (HELP! the first times). */
  private glancing(dt: number) {
    this.glanceT -= dt;
    if (this.glanceT <= 0) {
      if (this.glance === 0 && !(this.alarm || this.threatDist < DUCK_DIST)) {
        this.glance = 1;
        this.glanceT = 1;
        if (this.helps < 2) this.say(CIV_STAMP.bubble.help, 1);
      } else {
        this.glance = 0;
        this.glanceT = 2.2 + this.rng.next() * 1.6;
      }
    }
  }

  /** Change phase, blending from the current pose over `blend` seconds. */
  private enter(p: Phase, blend = 0.3) {
    this.from.set(this.pose);
    this.blendT = 0;
    this.blendDur = Math.max(0.01, blend);
    this.phase = p;
    this.phaseT = 0;
    if (p === 'plead') this.say(CIV_STAMP.bubble.help, Math.min(this.helpTime, 2));
    if (p === 'thanks') this.say(CIV_STAMP.bubble.thanks, 1.3);
    if (p === 'flee') {
      this.lookBackT = 0.6;
      if (this.speed < 1) this.speed = 1;
    }
    if (p === 'cower' || p === 'hide') {
      this.peek = 0;
      this.peekOn = false;
    }
  }

  private say(id: number, seconds: number) {
    this.bubble = id;
    this.bubbleT = seconds;
    if (id === CIV_STAMP.bubble.help) this.helps++;
  }

  /** Pose for this frame (into `target`), and the face the painter draws. */
  private writePose(dt: number) {
    const p = this.target;
    const t = this.age;
    const ph = this.pose2d;
    ph.handL = ph.handR = undefined;
    ph.hairSwing = 0;
    switch (this.phase) {
      case 'plead': {
        const point = this.threat && Math.abs(this.threatAng) < 2.2 ? this.threatAng : null;
        posePlead(p, t, this.waveSide, point);
        tremble(p, t, 0.3);
        ph.face = 'scream';
        ph.jaw = 0.55 + 0.4 * Math.abs(Math.sin(t * 6));
        ph.hairSwing = Math.sin(t * 9) * 0.6;
        break;
      }
      case 'cower': {
        const curl = this.threatDist < 2.4 ? 1 : this.alarm ? 0.5 : 0;
        poseCower(p, t, this.peek, clamp(this.threatAng, -1.2, 1.2), curl);
        const shake = 0.6 + (this.alarm ? 0.4 : 0) + 0.3 * curl;
        tremble(p, t, shake);
        ph.face = curl > 0.6 ? 'strain' : 'terror';
        ph.jaw = 0.35 + 0.25 * Math.abs(Math.sin(t * 4.3));
        ph.hairSwing = Math.sin(t * 37) * 0.25 * shake;
        break;
      }
      case 'hide': {
        // Peeking out toward the middle of the view; glancing back at the camera
        // over the shoulder nearer to it.
        this.glanceAmt += (this.glance - this.glanceAmt) * (1 - Math.exp(-7 * dt));
        poseHide(p, t, this.peek, this.side, -this.glanceAmt * this.side);
        tremble(p, t, 0.45);
        ph.face = 'terror';
        ph.jaw = 0.3 + 0.2 * Math.abs(Math.sin(t * 3.7));
        ph.hairSwing = Math.sin(t * 33) * 0.15;
        break;
      }
      case 'backaway': {
        const fear = clamp((4 - this.threatDist) / 2.5, 0, 1);
        poseBackAway(p, this.stride, 1, fear);
        tremble(p, t, 0.5);
        ph.face = fear > 0.5 ? 'scream' : 'terror';
        ph.jaw = 0.45 + 0.4 * fear;
        ph.hairSwing = Math.sin(this.stride) * 0.4;
        break;
      }
      case 'flee': {
        this.lookAmt += (this.lookBack - this.lookAmt) * (1 - Math.exp(-10 * dt));
        poseFlee(p, this.stride, this.lookAmt, 0.7);
        ph.face = Math.abs(this.lookAmt) > 0.4 ? 'scream' : 'terror';
        ph.jaw = 0.6 + 0.3 * Math.abs(Math.sin(t * 5));
        break;
      }
      case 'stumble': {
        const u = this.phaseT / STUMBLE_TIME;
        if (u < 0.62) poseStumble(p, u, t);
        else {
          poseStumble(this.aux, 0.6, t);
          poseFlee(p, this.stride, 0, 1);
          blendPose(p, this.aux, p, smoothstep(0.62, 1, u));
        }
        ph.face = u < 0.4 ? 'strain' : 'terror';
        ph.jaw = u < 0.4 ? 0.2 : 0.7;
        ph.hairSwing = u < 0.25 ? 1 : 0;
        break;
      }
      case 'grabbed': {
        const look = Math.sin(this.phaseT * 1.3) > 0.2 ? 1 : -1;
        poseGrabbed(p, t, this.grabSide, this.pull, look);
        tremble(p, t, 0.35);
        ph.face = look > 0 ? 'scream' : 'strain';
        ph.jaw = look > 0 ? 0.75 + 0.2 * Math.sin(t * 7) : 0.2;
        ph.hairSwing = this.pull * -this.grabSide;
        break;
      }
      case 'thanks': {
        poseThanks(p, t, this.waveSide, this.thumb, clamp(1 - this.phaseT / 0.35, 0, 1));
        if (this.thumb) {
          if (this.waveSide > 0) ph.handL = HAND.THUMB;
          else ph.handR = HAND.THUMB;
        }
        ph.face = 'relief';
        ph.jaw = 0.1;
        break;
      }
      case 'leave':
        poseJog(p, this.stride);
        ph.face = 'relief';
        ph.jaw = 0.1;
        break;
    }
  }

  // ─── Senses and space ─────────────────────────────────────────────────────

  /** Nearest live hostile (ground distance), and whether anything is winding up an attack. */
  private sense() {
    let best = Infinity;
    let thr: Enemy | null = null;
    let alarm = false;
    const p = this.root.position;
    const list = this.world.enemies();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.hostile || e.removed || e.state === 'dying' || e === this.grabber) continue;
      e.root.getWorldPosition(_v);
      const d = Math.hypot(_v.x - p.x, _v.z - p.z);
      if (d < best) {
        best = d;
        thr = e;
      }
      if (e.telegraph) alarm = true;
    }
    this.threat = thr;
    this.threatDist = best;
    this.alarm = alarm;
    if (thr) {
      thr.root.getWorldPosition(_v);
      this.threatAng = angleDelta(this.root.rotation.y, Math.atan2(_v.x - p.x, _v.z - p.z));
    } else this.threatAng = 0;
  }

  /** Camera position and its horizontal right / forward axes (module scratch). */
  private view() {
    const cam = this.world.camera;
    cam.getWorldPosition(_cam);
    _right.setFromMatrixColumn(cam.matrixWorld, 0).setY(0);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _fwd.set(_right.z, 0, -_right.x);
  }

  private viewX(p: THREE.Vector3): number {
    return (p.x - _cam.x) * _right.x + (p.z - _cam.z) * _right.z;
  }

  private viewZ(p: THREE.Vector3): number {
    return (p.x - _cam.x) * _fwd.x + (p.z - _cam.z) * _fwd.z;
  }

  private faceCamYaw(): number {
    const p = this.root.position;
    return Math.atan2(_cam.x - p.x, _cam.z - p.z);
  }

  /** Unit ground direction outward on screen (away from the middle of the view) and toward the camera. */
  private outward(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(_right).multiplyScalar(this.side).addScaledVector(_fwd, -0.6).normalize();
  }

  /**
   * Where to run: the stage's `to`, else out past the nearer side of the screen —
   * toward the camera (the screen edge comes in close there) and further out, so
   * the run only ever moves away from the middle of the view.
   */
  private pickDest() {
    this.destSet = true;
    if (this.to && this.phase === 'flee') {
      this.dest.copy(this.to);
      return;
    }
    const p = this.root.position;
    const x = this.viewX(p);
    const z = this.viewZ(p);
    const ox = this.side * Math.max(Math.abs(x) + 2.2, 3.2);
    const oz = Math.min(z, Math.max(1.4, z * 0.15));
    this.dest.copy(_cam).addScaledVector(_right, ox).addScaledVector(_fwd, oz);
    this.dest.y = p.y;
  }

  /**
   * Move along unit ground direction `dir`, on the floor. Perched civilians stay
   * put until they're rescued; then they jog off the edge (PerchedCivilian drops
   * them to the ground).
   */
  private step(dir: THREE.Vector3, dist: number) {
    if (dist <= 0 || (this.perched && this.phase !== 'leave')) return;
    const p = this.root.position;
    p.x += dir.x * dist;
    p.z += dir.z * dist;
    if (!this.perched) p.y = this.world.groundAt(p.x, p.z);
  }

  /** Clean out of view: past a screen side, under the bottom edge, or beside / behind the camera. */
  private offScreen(): boolean {
    this.rig.chest.getWorldPosition(_v);
    if (this.viewZ(_v) < 0.4) return true;
    _v.project(this.world.camera);
    return _v.z > 1 || Math.abs(_v.x) > 1.12 || _v.y < -1.15;
  }

  // ─── Paint / shoot ────────────────────────────────────────────────────────

  override paintPixels(f: PixelFigure): boolean {
    const p = this.pose2d;
    p.time = this.age;
    if (this.shot) {
      // A gasp when hit.
      p.face = 'scream';
      p.jaw = 0.9;
      p.bubble = -1;
    } else p.bubble = this.bubble;
    p.speed = this.phase === 'flee' || this.phase === 'leave' || this.phase === 'stumble' ? this.speed : 0;
    return paintHuman(f, this.rig, this.look, p);
  }

  override onShot(hit: ShotHit): ShotOutcome {
    if (this.shot || this.rescued) return { kind: 'civilian', counts: false };
    this.shot = true;
    this.age = 0;
    this.bubble = -1;
    this.letGo();
    this.world.shootables.removeOwner(this);
    this.world.fx.blood(hit.point, hit.dir, { color: 0x9a0a0a, amount: 1 });
    this.world.onCivilianShot(this, hit);
    return { kind: 'civilian', counts: false };
  }

  // ─── Tests / debug ────────────────────────────────────────────────────────

  /** What it's doing now (tests, debug overlays). */
  get state(): string {
    return this.shot ? 'shot' : this.phase;
  }

  /** The zombie holding on, if any. */
  get holder(): Grabber | null {
    return this.grabber;
  }

  /** The speech bubble showing (a `CIV_STAMP.bubble` id, −1 none). */
  get speech(): number {
    return this.bubble;
  }

  /**
   * Tests / look-dev: hold `phase` at `seconds` into it — no blending, no
   * moving — with peeking (cower / hide), a glance back (hide), a look back
   * (flee) or the thumbs-up forced, and write the pose onto the rig.
   */
  debugPose(phase: CivPhase, seconds: number, o: { peek?: number; glance?: number; look?: number; thumb?: boolean; bubble?: number } = {}) {
    this.phase = phase;
    this.phaseT = seconds;
    this.age = Math.max(this.age, seconds);
    this.peek = o.peek ?? 0;
    this.glance = this.glanceAmt = o.glance ?? 0;
    this.lookBack = this.lookAmt = o.look ?? 0;
    this.stride = seconds * 11.5;
    if (o.thumb !== undefined) this.thumb = o.thumb;
    if (phase === 'grabbed') this.pull = Math.sin(seconds * 2.6) * 0.7 + 0.3 * Math.sin(seconds * 6.1);
    this.writePose(0);
    this.pose.set(this.target);
    this.blendT = 1;
    applyPose(this.rig, this.pose);
    if (phase === 'grabbed' && this.grabber) this.reachForGrabber();
    if (o.bubble !== undefined) {
      this.bubble = o.bubble;
      this.bubbleT = 1e9;
    }
    this.updateBubble3d();
  }
}

// ─── Look ────────────────────────────────────────────────────────────────────

/** The same outfit, described for the pixel-art painter (ART: SPRITES). */
function civilianLook(variant: string, v: CivLook): HumanLook {
  const base = humanLook({
    dead: false,
    skin: v.skin,
    hair: v.hair,
    shirt: v.shirt,
    sleeveColor: v.shirt,
    sleeves: v.short ? 'short' : 'long',
    pants: v.pants,
    pantsPat: 'denim',
    shoes: 0x2a221c,
    shirtPat: v.shirtTex === ZT.PLAID ? 'plaid' : 'cloth',
    outfit: 'casual',
    inner: 0xe8e4da,
    mouthOpen: true,
    rags: 0,
    seed: (v.shirt ^ v.skin) & 0xffff,
    ponytail: !!v.ponytail,
  });
  switch (variant) {
    case 'scientist':
      return { ...base, outfit: 'scientist', jacket: v.shirt, inner: 0x2f66d0, tie: 0xd02428, pantsPat: 'cloth', badge: 0xf8f8f8 };
    case 'ranger':
      return { ...base, outfit: 'ranger', inner: null, hat: 0x6e5a32, belt: 0x3a2a18, pantsPat: 'cloth' };
    case 'cop':
      return { ...base, outfit: 'cop', inner: null, tie: 0x1c2440, badge: 0xe8c040, belt: 0x161414, pantsPat: 'cloth' };
    case 'nurse':
      return { ...base, outfit: 'nurse', inner: null, bun: true, hat: 0xf6f6f2, pantsPat: 'cloth' };
    case 'worker':
      return { ...base, outfit: 'flannel', inner: 0xeeeae0, belt: 0x6a4424 };
    default:
      return base;
  }
}

/** Add a box to a joint before baking (surface `t`, self-lit `e`). */
function part(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, t?: ZSurface, e?: number, rx = 0, rz = 0) {
  const m = Kit.add(parent, Kit.box(w, h, d), Kit.mat(color), x, y, z, rx, 0, rz);
  if (t !== undefined) m.userData.t = t;
  if (e !== undefined) m.userData.e = e;
  return m;
}

/**
 * A prop that sticks out past the plain rig's silhouette (hat brims, nurse cap,
 * hair bun): baked into a separate, never-registered mesh so the "don't shoot"
 * area stays exactly the body's (shots pass the brim to the zombie behind).
 */
function prop(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, t?: ZSurface, e?: number) {
  const m = part(parent, w, h, d, color, x, y, z, t, e);
  m.userData.z = 'none';
  return m;
}

/** Screaming face (dark eyes, raised brows, open mouth, nose, ears) + per-variant props. */
function dressCivilian(r: HumanoidRig, variant: string, v: CivLook) {
  const h = r.head;
  const fz = 0.13;
  const dark = 0x22140e;
  for (const s of [1, -1]) {
    part(h, 0.044, 0.034, 0.012, 0xf4f0e6, s * 0.052, 0.148, fz + 0.002, ZT.FLAT, 0.25); // eye white
    part(h, 0.022, 0.03, 0.012, dark, s * 0.05, 0.148, fz + 0.006, ZT.FLAT); // pupil
    part(h, 0.062, 0.016, 0.016, v.hair, s * 0.054, 0.186, fz + 0.002, ZT.HAIR, 0, 0, s * -0.25); // raised brow
    part(h, 0.03, 0.06, 0.05, v.skin, s * 0.115, 0.14, -0.01); // ear
  }
  part(h, 0.032, 0.05, 0.03, v.skin, 0, 0.115, fz + 0.012); // nose
  part(h, 0.06, 0.042, 0.012, 0x5a1414, 0, 0.062, fz + 0.002, ZT.FLAT); // screaming mouth
  part(h, 0.05, 0.01, 0.014, 0xf0ece0, 0, 0.078, fz + 0.004, ZT.FLAT); // teeth
  if (v.ponytail) {
    // Hair tie and tail at the back of the crown (not a target).
    prop(h, 0.07, 0.07, 0.07, v.hair, 0, 0.2, -0.14, ZT.HAIR);
    prop(h, 0.06, 0.16, 0.06, v.hair, 0, 0.09, -0.17, ZT.HAIR);
  }
  const sp = r.spine;
  const cz = 0.11;
  const top = 0.26;
  switch (variant) {
    case 'scientist': {
      // Lab coat worn OPEN over a royal-blue shirt and red tie, ending at the
      // waist (khaki trousers below), ID badge, glasses with a glint.
      part(sp, 0.17, 0.46, 0.012, 0x2f66d0, 0, 0.22, cz + 0.002);
      for (const s of [1, -1]) part(sp, 0.016, 0.46, 0.014, 0xc8c8c0, s * 0.092, 0.22, cz + 0.004); // lapel edges
      part(sp, 0.04, 0.3, 0.014, 0xd02428, 0, 0.27, cz + 0.008, ZT.FLAT, 0.08);
      part(sp, 0.055, 0.04, 0.016, 0xd02428, 0, 0.43, cz + 0.008, ZT.FLAT, 0.08);
      part(sp, 0.05, 0.06, 0.012, 0xf8f8f8, 0.13, 0.32, cz + 0.006, ZT.FLAT, 0.2);
      part(sp, 0.05, 0.015, 0.014, 0x2a5aa0, 0.13, 0.35, cz + 0.01, ZT.FLAT);
      for (const s of [1, -1]) part(h, 0.058, 0.044, 0.008, 0xa8e0f8, s * 0.052, 0.15, fz + 0.012, ZT.FLAT, 0.45); // glasses
      part(h, 0.17, 0.012, 0.01, 0x1a1a1a, 0, 0.172, fz + 0.012, ZT.FLAT);
      break;
    }
    case 'ranger': {
      // Wide-brim hat (not a target), pocket flaps, shoulder patch.
      prop(h, 0.24, 0.08, 0.26, 0x6e5a32, 0, top + 0.03, 0, ZT.LEATHER);
      prop(h, 0.4, 0.016, 0.42, 0x6e5a32, 0, top - 0.01, 0.01, ZT.LEATHER);
      prop(h, 0.245, 0.02, 0.265, 0x3a2a18, 0, top - 0.0, 0, ZT.LEATHER);
      for (const s of [1, -1]) part(sp, 0.09, 0.03, 0.012, 0x8a7840, s * 0.09, 0.38, cz + 0.004);
      part(r.armL.shoulder, 0.02, 0.08, 0.07, 0x2a6a3a, 0.052, -0.08, 0, ZT.FLAT);
      part(r.hips, 0.36, 0.05, 0.22, 0x3a2a18, 0, 0.055, 0, ZT.LEATHER);
      break;
    }
    case 'cop': {
      // Light-blue summer uniform, bare-headed: navy tie, epaulettes, pocket
      // flaps, gold badge, black duty belt. (Zombie cops: navy, peaked cap.)
      part(sp, 0.035, 0.26, 0.014, 0x1c2440, 0, 0.29, cz + 0.006);
      part(sp, 0.05, 0.035, 0.016, 0x1c2440, 0, 0.43, cz + 0.006);
      for (const s of [1, -1]) {
        part(sp, 0.08, 0.025, 0.012, 0x5a86c8, s * 0.1, 0.38, cz + 0.004); // pocket flap
        part(s > 0 ? r.armL.shoulder : r.armR.shoulder, 0.104, 0.016, 0.114, 0x1c2440, 0, -0.012, 0); // epaulette
        part(s > 0 ? r.armL.shoulder : r.armR.shoulder, 0.012, 0.07, 0.06, 0xd8b040, s * 0.052, -0.09, 0, ZT.FLAT, 0.2); // patch
      }
      part(sp, 0.05, 0.06, 0.012, 0xe8c040, 0.1, 0.32, cz + 0.006, ZT.FLAT, 0.4); // badge
      part(r.hips, 0.36, 0.05, 0.22, 0x161414, 0, 0.055, 0, ZT.LEATHER);
      part(r.hips, 0.05, 0.035, 0.012, 0xc8a840, 0, 0.055, 0.115, ZT.FLAT);
      break;
    }
    case 'nurse': {
      // Purple scrubs, white V-neck trim, white cap with a red cross, bun, ID card.
      part(sp, 0.12, 0.022, 0.012, 0xf4f4f4, 0, 0.44, cz + 0.004, ZT.FLAT, 0.15);
      part(sp, 0.04, 0.055, 0.012, 0xf8f8f8, 0.09, 0.3, cz + 0.004, ZT.FLAT, 0.2);
      part(sp, 0.012, 0.12, 0.012, 0xf4f4f4, 0.07, 0.38, cz + 0.004, ZT.FLAT, undefined, 0, 0.35);
      prop(h, 0.1, 0.1, 0.08, v.hair, 0, 0.22, -0.14, ZT.HAIR); // bun
      prop(h, 0.15, 0.06, 0.1, 0xf6f6f2, 0, top + 0.055, 0.03, ZT.FLAT, 0.3); // cap
      prop(h, 0.036, 0.012, 0.01, 0xe02020, 0, top + 0.06, 0.084, ZT.FLAT, 0.4); // red cross
      prop(h, 0.012, 0.036, 0.01, 0xe02020, 0, top + 0.06, 0.084, ZT.FLAT, 0.4);
      break;
    }
    case 'worker': {
      // Red buffalo-check flannel (rolled sleeves), jeans, white tee at the
      // collar, leather tool belt with a hammer. (Zombie workers: grey shirts,
      // hi-vis vests, hard hats.)
      part(sp, 0.1, 0.06, 0.012, 0xeeeae0, 0, 0.42, cz + 0.004, ZT.CLOTH, 0.12);
      part(r.hips, 0.36, 0.06, 0.225, 0x6a4424, 0, 0.05, 0, ZT.LEATHER);
      part(r.hips, 0.07, 0.08, 0.04, 0x5a3a1e, 0.12, 0.0, 0.11, ZT.LEATHER); // pouch
      part(r.hips, 0.024, 0.18, 0.024, 0x9a6c3a, -0.12, -0.06, 0.125, ZT.LEATHER); // hammer handle
      part(r.hips, 0.09, 0.03, 0.03, 0x60646c, -0.12, 0.04, 0.125, ZT.FLAT); // hammer head
      break;
    }
    default: {
      // Open shirt over a white tee.
      part(sp, 0.12, 0.4, 0.012, 0xe8e4da, 0, 0.24, cz + 0.004);
      break;
    }
  }
}

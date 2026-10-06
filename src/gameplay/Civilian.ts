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
  J,
  applyArms,
  applyPose,
  blendPose,
  fidget,
  grabArms,
  poseBackAway,
  poseBuf,
  poseCower,
  poseFall,
  poseFlee,
  poseGrabbed,
  poseHide,
  poseJog,
  posePlead,
  poseStartle,
  poseStumble,
  poseThanks,
  shiver,
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

/** The d2 lab staff's polo. */
const TECH_POLO = 0xe8601c;

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
  // The park's lab staff (d2): the lab coat worn open over a safety-orange polo — a
  // broad bold front that reads on pale shop and lab walls (a white coat alone vanished there).
  tech: { shirt: 0xf4f4f0, pants: 0x6a5a3c, skin: 0xd9a77f, hair: 0x5a4632, ponytail: true },
};

/**
 * What a civilian does (a stage's `CivilianDef.act`, else `auto`):
 *
 *   cower     down on both knees, folded over, hands clasped over the head,
 *             shaking, the head turning under the arms now and then; peeks
 *             out over the forearms (calling HELP! to the player the first
 *             times, a hand at the mouth), tucks in harder at a shot nearby,
 *             a kill close by, anything winding up.
 *   hide      crouched among foliage / low cover with the back to the camera,
 *             a hand braced on the floor and one over the mouth, peeking out
 *             and glancing back for help. Only where the stage put cover in
 *             front of them — never in the open.
 *   flee      waits cowering until the danger is real (a threat close, an
 *             attack starting), then runs for it — across and out of the view
 *             (or to `to`), looking back over the shoulder, maybe tripping once
 *             on screen and scrambling up.
 *   backaway  edges back from the nearest threat for a moment, recoiling, a
 *             hand up at it in front of the face, then turns and runs —
 *             startled on the way, sometimes tripping onto the seat first and
 *             scooting back (one fall per civilian).
 *   grabbed   held by a zombie (spawned with it): a tug of war, the zombie
 *             hauling on the arm with both hands, yanking them two stumbling
 *             steps in, them hauling back on the held wrist with both hands.
 *             Shoot the zombie (or its holding arm off) and they're free.
 *   plead     calls HELP! — in a crouching stance, a hand at the mouth, the
 *             other forearm waving beside the head — on and off, cowering in
 *             between.
 *   auto      a short HELP!, then cowers; backs away and runs if a threat gets close.
 */
export type CivAct = 'auto' | 'cower' | 'hide' | 'flee' | 'backaway' | 'grabbed' | 'plead';

export interface CivilianOpts {
  act?: CivAct;
  /** flee: where to run (world). Default: out across the nearer side of the view. */
  to?: THREE.Vector3 | null;
  /** Where they run in from (world): a doorway, from behind a car. */
  from?: THREE.Vector3 | null;
  /** grabbed: the zombie's outfit variant (default 'civilian'). */
  attacker?: string;
  /** Seconds of HELP! before the act (default: per act). */
  help?: number;
}

/** What the civilian is doing right now. */
export type CivPhase = 'arrive' | 'plead' | 'startle' | 'cower' | 'hide' | 'backaway' | 'fall' | 'flee' | 'stumble' | 'grabbed' | 'thanks' | 'leave';
type Phase = CivPhase;

/**
 * Root-to-root distance (m) a grabbing zombie keeps, toward the middle of the
 * view: arm's length — its two hands on the held arm, hers hauling on her own
 * wrist (the hands still meet) — with both leaning away from each other, the
 * zombie further on a yank, so its head and chest stay clear shots well away
 * from her on screen (≥ 38 px of clear aim round each at the z2 ER, civilian
 * 7.0 m and zombie 6.3 m from the camera, on a yank too: a human-like-bot miss
 * at its chest by 40 px hit her arm when it stooped in closer).
 */
export const GRAB_SEP = 1.45;
/** Seconds of HELP! before each act (when the stage doesn't say). Cowering and backing off call out from inside the act. */
const HELP_FIRST: Record<CivAct, number> = { auto: 1.5, cower: 0, hide: 0, flee: 0, backaway: 0, grabbed: 0, plead: 2.2 };
/** A threat this close (m, ground) panics an `auto` civilian into backing off / running. */
const PANIC_ZOMBIE = 2.6;
const PANIC_DINO = 4.2;
/** A threat this close makes a cowering / hiding civilian duck (no peeking). */
const DUCK_DIST = 4;
/** FLEE runs once a threat is this close (m), something winds up, or FLEE_WAIT s pass. */
const FLEE_NEAR_ZOMBIE = 7;
const FLEE_NEAR_DINO = 12;
const FLEE_WAIT = 8;
const STUMBLE_TIME = 0.9;
const FALL_TIME = 1.7;
const RUN_SPEED = 2.8;
/** Seconds a run aims to stay on screen (Operation Wolf civilians cross the view). */
const FLEE_SCREEN = 3;
/** A rescued civilian walking off blinks out once this close to the camera (m, view depth). */
const LEAVE_NEAR = 4;
const STARTLE_TIME = 0.12;
const FLINCH_TIME = 0.22;
/** The yank: the civilian lurches this far toward the zombie (m), the zombie steps back this far. */
const YANK_LURCH = 0.22;
const YANK_STEP = 0.15;
/** From this far off (m) — or perched up on something — the HELP! is bigger: a deeper crouch bouncing on the knees. */
const FAR_WAVE = 15;
/** A shot landing within this many screen px of the head makes them flinch. */
const FLINCH_PX = 110;
/** Longest run in from the edge of the view (m) for a civilian who'd otherwise pop up in plain sight. */
const ARRIVE_MAX = 7.5;
const ARRIVE_SPEED = 3.4;
/** Running in waits (out of sight) until the rail camera turns slower than this (rad/s)… */
const ARRIVE_CAM_RATE = 0.3;
/** …or this long (s). */
const ARRIVE_WAIT_MAX = 1.2;
/** A runner who has just run in ducks down this long (s) before bolting again (unless something's right on them). */
const ARRIVE_SETTLE = 1.5;
/** The last metres of the run in turn toward the act's facing (no spin on the knees once there). */
const ARRIVE_TURN = 1.4;

/** 0 → 1 → 0 (a half sine) as `k` goes from `a` to `b`; 0 outside. */
function bump(k: number, a: number, b: number): number {
  return k <= a || k >= b ? 0 : Math.sin((Math.PI * (k - a)) / (b - a));
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _g = new THREE.Vector3();
const _h = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _n = new THREE.Vector3();
/** Run headings tried (−0.6 … +0.55 rad off straight across, in 0.115 steps) and their scratch. */
const HEADINGS = 11;
const _len = new Float32Array(HEADINGS);
const _cost = new Float32Array(HEADINGS);

/**
 * Innocent bystander. Don't shoot! Shooting one costs a life and points.
 * Rescued (bonus) when the encounter is cleared, or on the spot when the player
 * shoots the zombie holding them. One who gets away off screen is safe — paid
 * with the rest when the encounter is cleared, as ever.
 *
 * Look: a humanoid with a screaming face and variant props (lab coat, ranger
 * hat, cop cap, hi-vis vest…), baked like the zombies into a few textured,
 * vertex-coloured meshes — faces and props cost no extra draw calls.
 *
 * Behaviour: a small repertoire of frightened acts (`CivAct`) in the spirit of
 * the arcade light-gun games — they cower and peek, hide in cover, run for it
 * and trip, back off from a zombie, get grabbed, call for help, and thank you
 * when saved. Poses are written to a pose buffer (civPoses.ts) and blended, so
 * ART: 3D and ART: SPRITES (which paints from the same rig) show the same.
 * Never in an attack lane: they stay where the stage put them or run outward,
 * away from the middle of the view where everything comes at the player.
 */
export class Civilian extends Entity {
  private rig: HumanoidRig;
  private baked: BakedHumanoid;
  rescued = false;
  /** Phase time the walk-off was last re-aimed. */
  private leaveAim = 0;
  /** Walking off near the lens: blinking out (s), −1 = not yet. */
  private blinkT = -1;
  shot = false;
  /** Got away off screen (hidden, no target): paid when the encounter is cleared. */
  escaped = false;
  /** ART: SPRITES — what the PixelCast painter draws. */
  private look: HumanLook;
  private pose2d: HumanPose = { severed: [0, 0], headless: false, jaw: 0.8, face: 'scream', squash: 0, time: 0, speed: 0 };

  /** The act it was spawned with. */
  readonly act: CivAct;
  private phase: Phase = 'plead';
  private phaseT = 0;
  /** Phase after the opening HELP!. */
  private main: Phase = 'cower';
  /** Phase after a startle. */
  private next: Phase = 'cower';
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
  // Peeking (cower / hide), glancing back (hide), flinching.
  private peek = 0;
  private peekOn = false;
  private peekT = 1;
  /** This peek looks at the player (calling HELP!) rather than at the threat. */
  private peekCam = true;
  private peeks = 0;
  private glance = 0;
  private glanceT = 2.5;
  private glanceAmt = 0;
  private flinchT = 0;
  private flinchDir = 1;
  /** A shot or a kill close by just now (s left): what trips a civilian backing off. */
  private jumpT = 0;
  /** Which knee goes down cowering (+1 left), which forearm guards the face backing off. */
  private readonly kneel: number;
  private readonly guard: number;
  private readonly seed: number;
  // Moving.
  private readonly dest = new THREE.Vector3();
  private destSet = false;
  private readonly to: THREE.Vector3 | null;
  private readonly comeFrom: THREE.Vector3 | null;
  private stride = 0;
  private amp = 0.2;
  private speed = 0;
  private yawGoal = 0;
  private stumbleAt = -1;
  private readonly fallOver: boolean;
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
  private backTime = 2;
  /** The tug of war: seconds into this yank, its length, and the jerk 0..1. */
  private yankT = 0;
  private yankPeriod = 1.3;
  private yankAmt = 0;
  /** The feet in the tug of war (m toward the zombie from where they braced), and the stepping foot's lift. */
  private nearFoot = 0;
  private farFoot = 0;
  private nearUp = 0;
  private farUp = 0;
  /** Where the zombie holding on stands (world), its extra turn, and where the hands meet. */
  readonly grabSpot = new THREE.Vector3();
  grabTurn = 0;
  readonly grabHand = new THREE.Vector3();
  private readonly grabBase = new THREE.Vector3();
  private readonly grabRoot = new THREE.Vector3();
  /** Where the stage put them (they run in to it from off screen). */
  private readonly spot = new THREE.Vector3();
  /** Waiting out of sight for the camera to stop turning before running in (s waited; −1 not waiting). */
  private waitCam = -1;
  private camYaw = 0;
  private camRate = 0;
  /** Has fallen over once already (one fall per civilian: no slapstick). */
  private fell = false;
  /** Just ran in: seconds before they'd bolt again. */
  private settleT = 0;
  // Speech bubble, gestures.
  private bubble = -1;
  private bubbleT = 0;
  private helps = 0;
  /** ART: 3D's copy of the bubble (PixelCast stamps its own). */
  private readonly bubble3d = new Bubble3D(this.root);
  /** The waving hand (+1 left); the other calls at the mouth. */
  private waveSide = 1;
  private thumb = false;
  private offShot: (() => void) | null = null;
  private offKill: (() => void) | null = null;

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
    const rng = (this.rng = new Rng(Math.floor(world.rng.next() * 0x7fffffff) + 1));
    this.perched = pos.y > world.groundAt(pos.x, pos.z) + 0.4;
    this.dino = world.stage?.campaign === 'dino';
    this.to = opts.to ? opts.to.clone() : null;
    this.comeFrom = opts.from ? opts.from.clone() : null;
    this.attacker = opts.attacker ?? 'civilian';
    let act = opts.act ?? 'auto';
    // Up on a truck bed nobody runs, hides or gets grabbed: they call for help.
    if (this.perched && act !== 'cower') act = 'plead';
    this.act = act;
    this.helpTime = opts.help ?? HELP_FIRST[act];
    this.main = act === 'hide' ? 'hide' : act === 'flee' ? 'flee' : act === 'backaway' ? 'backaway' : act === 'grabbed' ? 'grabbed' : 'cower';
    this.waveSide = rng.next() < 0.5 ? 1 : -1;
    this.kneel = rng.next() < 0.5 ? 1 : -1;
    this.guard = rng.next() < 0.5 ? 1 : -1;
    this.grabTime = 7 + rng.next() * 1.5;
    this.backTime = 1.5 + rng.next();
    this.peekT = 0.6 + rng.next() * 0.5;
    this.thumb = rng.next() < 0.5;
    this.stumbleAt = rng.next() < 0.75 ? 0.35 + rng.next() * 0.25 : -1;
    this.fallOver = rng.next() < 0.5;
    this.seed = rng.next() * 7;
    this.yankPeriod = 1.1 + rng.next() * 0.5;
    // (The first yank comes half a second in.)
    this.yankT = this.yankPeriod - 0.5;
  }

  override onAdded(): void {
    this.view();
    this.camYaw = Math.atan2(_right.z, _right.x);
    // The screen side decides which way is "outward".
    this.side = this.viewX(this.root.position) >= 0 ? 1 : -1;
    this.sense();
    this.offShot = this.world.events.on('shot', (e) => this.nearShot(e.x, e.y));
    this.offKill = this.world.events.on('kill', (e) => this.nearKill(e.enemy));
    if (this.main === 'grabbed') this.startGrab();
    this.spot.copy(this.root.position);
    if (this.runsIn()) {
      // Running in from the edge of the view (or the stage's way in) — once the
      // camera has stopped turning to the scene: out of sight (and no target)
      // until then, so the run is seen, and painted at the full sprite rate.
      this.waitCam = 0;
      this.root.visible = false;
      this.enter('arrive', 0.01);
      this.speed = 0;
      this.dest.copy(this.spot);
      return;
    }
    this.appear(false);
  }

  /** On stage: a target from now on, into the act (or running in to it). */
  private appear(run: boolean) {
    this.waitCam = -1;
    this.root.visible = true;
    const z = this.baked.zones;
    for (const m of z.head) this.hitbox(m, 'head');
    for (const m of z.torso) this.hitbox(m, 'torso');
    for (const m of z.limb) this.hitbox(m, 'limb');
    // Not popping up out of nowhere in plain sight: run in from the edge of the view.
    if (!run || !this.arriving()) {
      this.root.position.copy(this.spot);
      this.enter(this.helpTime > 0 ? 'plead' : this.afterHelp(), 0.01);
    }
    // Already turned the way the act faces (no spin on the spot as they appear).
    if (this.phase === 'flee') this.pickDest(FLEE_SCREEN);
    if (this.phase === 'arrive') this.dest.copy(this.spot);
    this.root.rotation.y = this.yawGoal = this.phaseYaw();
    this.writePose(0);
    this.blendT = 1;
    this.pose.set(this.target);
    applyPose(this.rig, this.pose);
    this.world.audio.play('civilian_scream', { volume: 0.6, vary: 0.2 });
  }

  override dispose(): void {
    this.offShot?.();
    this.offKill?.();
    this.offShot = this.offKill = null;
    super.dispose();
    releaseGeos(this.baked.geos);
  }

  /**
   * Rescued: by the stage runner when the encounter is cleared, or on the spot
   * when the player shoots the zombie holding them (`run`: its arm shot off, it's
   * still on its feet — no stopping to say thanks). One who already got away off
   * screen is paid now, at the edge of the view they ran out of.
   */
  rescue(run = false) {
    if (this.shot || this.rescued) return;
    this.rescued = true;
    if (this.waitCam >= 0) {
      // Cleared before they ever came on: safe where they were, paid all the same.
      this.root.position.copy(this.spot);
      this.world.onCivilianRescued(this);
      this.removed = true;
      return;
    }
    if (this.escaped) {
      this.edgePoint(this.root.position);
      this.world.onCivilianRescued(this);
      this.removed = true;
      return;
    }
    this.world.shootables.removeOwner(this);
    this.world.onCivilianRescued(this);
    this.age = 0;
    this.letGo();
    const running = run || this.phase === 'flee' || this.phase === 'stumble' || this.phase === 'backaway' || this.phase === 'fall';
    this.destSet = false;
    if (run) this.say(CIV_STAMP.bubble.thanks, 1.1);
    this.enter(running ? 'leave' : 'thanks', running ? 0.25 : 0.3);
  }

  /** Got away off screen: out of play (hidden, not a target) until the encounter is cleared. */
  private escape() {
    this.escaped = true;
    this.letGo();
    this.world.shootables.removeOwner(this);
    this.root.visible = false;
    this.bubble = -1;
    this.bubble3d.hide();
  }

  /**
   * A civilian who would appear in plain view (the stage spawns them as the
   * encounter starts) runs in from just past the nearer edge of the view to
   * their spot instead — level with it, so the run stays in the outer part of
   * the screen on their side — shouting for help; or in from where the stage
   * says (`from`: a doorway). Not the grabbed (a set piece), the perched,
   * runners (they run anyway) or spots too far in.
   */
  private arriving(): boolean {
    if (!this.runsIn()) return false;
    const p = this.root.position;
    let run = 0;
    if (this.comeFrom) {
      // The stage's way in (a doorway…).
      run = this.comeFrom.distanceTo(p);
      p.copy(this.comeFrom);
    } else {
      // (Level with the spot, from just past the nearer edge of the view as it is now.)
      this.side = this.viewX(p) >= 0 ? 1 : -1;
      run = this.edgeTan() * Math.max(0.5, this.viewZ(p)) - Math.abs(this.viewX(p)) + 0.5;
      p.addScaledVector(_right, this.side * Math.min(run, ARRIVE_MAX * 1.4));
    }
    p.y = this.world.groundAt(p.x, p.z);
    this.enter('arrive', 0.01);
    this.say(CIV_STAMP.bubble.help, Math.min(1.6, run / ARRIVE_SPEED + 0.3));
    this.speed = ARRIVE_SPEED;
    return true;
  }

  /** Would come on running in (from the edge of the view, or the stage's `from`) rather than start in place? */
  private runsIn(): boolean {
    if (this.perched || this.main === 'grabbed') return false;
    if (this.comeFrom) return true;
    if (this.main === 'flee' || !this.onScreen(1.05, this.spot)) return false;
    const p = this.spot;
    return this.edgeTan() * Math.max(0.5, this.viewZ(p)) - Math.abs(this.viewX(p)) + 0.5 <= ARRIVE_MAX;
  }

  // ─── Grabbed ──────────────────────────────────────────────────────────────

  /** Spawn the zombie holding on: level with us, toward the middle of the view. */
  private startGrab() {
    const p = this.root.position;
    this.grabRoot.copy(p);
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

  /** The zombie lost its hold — its gripping arm shot off: saved, and off they run. */
  grabberLost() {
    this.grabber = null;
    if (this.phase === 'grabbed') this.rescue(true);
  }

  private letGo() {
    const g = this.grabber;
    this.grabber = null;
    if (g && !g.removed && g.state !== 'dying') g.release();
  }

  /** World position of our shoulder on the grabbed side. */
  shoulderPoint(out: THREE.Vector3): THREE.Vector3 {
    const a = this.grabSide > 0 ? this.rig.armL : this.rig.armR;
    return a.shoulder.getWorldPosition(out);
  }

  /** World position of the held arm's elbow (the zombie's other hand hauls on the forearm there). */
  elbowPoint(out: THREE.Vector3): THREE.Vector3 {
    const a = this.grabSide > 0 ? this.rig.armL : this.rig.armR;
    return a.elbow.getWorldPosition(out);
  }

  /** The zombie's jerk on the arm right now (0..1): it leans back into it. */
  get yank(): number {
    return this.yankAmt;
  }

  // ─── Per frame ────────────────────────────────────────────────────────────

  update(dt: number): void {
    this.age += dt;
    if (this.escaped) return;
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
    if (this.waitCam >= 0) {
      // Waiting out of sight for the camera to settle on the scene.
      const yaw = Math.atan2(_right.z, _right.x);
      const rate = dt > 0 ? Math.abs(angleDelta(this.camYaw, yaw)) / dt : 0;
      this.camYaw = yaw;
      this.camRate += (rate - this.camRate) * (1 - Math.exp(-12 * dt));
      this.waitCam += dt;
      if ((this.waitCam > 0.1 && this.camRate < ARRIVE_CAM_RATE) || this.waitCam > ARRIVE_WAIT_MAX) {
        this.phaseT = 0;
        this.appear(true);
      }
      return;
    }
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.1;
      this.sense();
    }
    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.bubble = -1;
    }
    if (this.flinchT > 0) this.flinchT -= dt;
    if (this.jumpT > 0) this.jumpT -= dt;
    if (this.settleT > 0) this.settleT -= dt;
    this.think(dt);
    if (this.removed || this.escaped) return;
    // Turn (quick when running; otherwise a shuffle, never a spin on the spot).
    const run = this.phase === 'flee' || this.phase === 'leave' || this.phase === 'arrive';
    const turn = angleDelta(this.root.rotation.y, this.yawGoal) * (1 - Math.exp(-(run ? 9 : 5) * dt));
    const maxTurn = (run || this.phase === 'fall' || this.phase === 'stumble' ? 9 : 2.6) * dt;
    this.root.rotation.y += clamp(turn, -maxTurn, maxTurn);
    this.writePose(dt);
    this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
    if (this.blendT < 1) blendPose(this.pose, this.from, this.target, smoothstep(0, 1, this.blendT));
    else this.pose.set(this.target);
    applyPose(r, this.pose);
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

  /**
   * The tug of war: the zombie's gripping hand and ours meet between our
   * shoulders; both our hands haul on the held wrist (IK into the pose buffer, so
   * whatever comes next blends from exactly what was drawn).
   */
  private reachForGrabber() {
    const g = this.grabber!;
    const gr = g.rig;
    this.shoulderPoint(_v);
    const ga = gr ? (g.gripSide > 0 ? gr.armL : gr.armR) : null;
    if (ga) ga.shoulder.getWorldPosition(_w);
    else _w.copy(this.grabSpot).setY(_v.y);
    // The grip: on the line between the two shoulders, a little low, where both
    // arms reach (each its share; at full stretch if they can't quite).
    _n.copy(_w).sub(_v);
    const d = _n.length();
    _n.divideScalar(Math.max(1e-4, d));
    const reach = 0.6 * this.rig.scale;
    const theirs = ga ? 0.6 * gr!.scale : reach;
    const at = d <= reach + theirs ? (d * reach) / (reach + theirs) : reach * 0.98;
    this.grabHand.copy(_v).addScaledVector(_n, at);
    this.grabHand.y -= 0.1;
    // Our free hand hauls on the held forearm, a hand's width nearer us.
    _h.copy(_v).addScaledVector(_n, at - 0.16);
    _h.y -= 0.1;
    const chest = this.rig.chest;
    chest.updateWorldMatrix(true, false);
    chest.worldToLocal(_g.copy(this.grabHand));
    chest.worldToLocal(_h);
    grabArms(this.pose, this.grabSide, _g, _h);
    applyArms(this.rig, this.pose);
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
      case 'arrive': {
        _n.copy(this.spot).sub(this.root.position).setY(0);
        const d = _n.length();
        // (Slowing over the last metre, the stride with it.)
        const slow = clamp(d / 1.1, 0.4, 1);
        this.stride += dt * 10.5 * slow;
        if (d > 0.25) {
          _n.divideScalar(d);
          // The last steps turn toward the act's facing: there, they drop straight into it.
          const head = Math.atan2(_n.x, _n.z);
          const w = smoothstep(0, 1, 1 - (d - 0.25) / ARRIVE_TURN);
          this.yawGoal = head + angleDelta(head, this.phaseYaw(this.helpTime > 0 ? 'plead' : this.afterHelp())) * w;
          this.step(_n, Math.min(d, this.speed * slow * dt));
        } else {
          // There: into the act (diving down into a crouch, or calling out).
          this.settleT = ARRIVE_SETTLE;
          const n = this.helpTime > 0 ? 'plead' : this.afterHelp();
          this.enter(n, n === 'cower' || n === 'hide' ? 0.35 : 0.25);
        }
        break;
      }
      case 'plead':
        this.yawGoal = this.phaseYaw();
        if (t > this.helpTime) {
          const n = this.afterHelp();
          // Ducking down from HELP!: a startled jolt first.
          if (n === 'cower') this.startle('cower');
          else this.enter(n, 0.25);
        } else this.panic();
        break;
      case 'startle':
        if (t > STARTLE_TIME) this.enter(this.next, this.next === 'cower' ? 0.42 : 0.25);
        break;
      case 'cower':
      case 'hide': {
        this.yawGoal = this.phaseYaw();
        this.peeking(dt);
        if (this.phase === 'hide') this.glancing(dt);
        if (this.act === 'plead' && t > 3.2 && !this.alarm && this.threatDist > DUCK_DIST && this.flinchT <= 0) {
          this.helpTime = 1.6;
          this.enter('plead', 0.4);
        } else if (this.main === 'flee' && this.fleeReady()) this.enter('flee', 0.25);
        else this.panic();
        break;
      }
      case 'backaway': {
        const th = this.threat;
        this.yawGoal = this.phaseYaw();
        // Back off, away from it and outward on screen.
        this.outward(_n);
        if (th) {
          th.root.getWorldPosition(_v);
          _w.copy(this.root.position).sub(_v).setY(0).normalize();
          _n.add(_w).normalize();
        }
        // Edging back while it's still coming (a stage's BACK AWAY), stepping back
        // briskly once it's close (an `auto` civilian's panic); then turn and run.
        const near = this.threatDist < (this.dino ? 4.5 : 3.2);
        const slow = this.act === 'backaway' && !near;
        this.speed = slow ? 0.35 : 0.9;
        this.amp = slow ? 0.2 : 0.34;
        // (Steps sized to the ground covered: the feet don't skate.)
        this.stride += ((dt * this.speed) / (1.8 * Math.sin(this.amp))) * Math.PI;
        this.step(_n, this.speed * dt);
        if (this.act === 'backaway' && this.fallOver && !this.fell && this.jumpT > 0 && t > 0.5 && this.threatDist > 6 && !this.alarm) {
          // Startled (a shot or a kill close by) while edging back, the danger
          // still a way off: they trip over their own heels onto the seat. Once, ever.
          // (Nothing winding up: on the floor in an attack's path they'd be in its lane.)
          this.fell = true;
          this.stumbleAt = -1;
          this.enter('fall', 0.12);
        } else if (this.threatDist < 1.7 || (slow ? t > this.backTime : t > 1.4)) this.enter('flee', 0.2);
        break;
      }
      case 'fall': {
        const u = t / FALL_TIME;
        if (u > 0.18 && u < 0.66) {
          // Scooting back on the seat.
          const y = this.root.rotation.y;
          _n.set(-Math.sin(y), 0, -Math.cos(y));
          this.step(_n, 0.32 * dt);
        }
        if (u > 0.62) {
          // Rolling over toward where they'll run.
          if (!this.destSet) this.pickDest(FLEE_SCREEN);
          this.yawGoal = Math.atan2(this.dest.x - this.root.position.x, this.dest.z - this.root.position.z);
        }
        if (u >= 1) this.enter('flee', 0.2);
        break;
      }
      case 'flee':
      case 'leave': {
        // (Walking off: re-aimed every half second, so a moving camera never ends up in their path.)
        if (this.phase === 'leave' && t - this.leaveAim > 0.5) {
          this.leaveAim = t;
          this.destSet = false;
        }
        // (Walking off: the quickest way out of the side of the view.)
        if (!this.destSet) this.pickDest(this.phase === 'flee' ? FLEE_SCREEN : 0.5);
        const run = this.phase === 'flee' ? RUN_SPEED : 3;
        this.speed = Math.min(run, this.speed + dt * 8);
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
        this.stride += dt * (this.phase === 'flee' ? 10.5 : 9.5);
        // A look back over the shoulder now and then.
        this.lookBackT -= dt;
        if (this.lookBackT <= 0) {
          this.lookBackT = 1.1 + this.rng.next() * 0.6;
          this.lookBack = this.threatAng >= 0 ? 1 : -1;
        }
        if (this.lookBackT < 0.75) this.lookBack = 0;
        if (this.phase === 'flee' && this.stumbleAt > 0 && !this.fell && this.runT > this.stumbleAt) {
          this.stumbleAt = -1;
          this.fell = true;
          // (Only where the player sees it.)
          if (this.onScreen(0.8)) {
            this.enter('stumble', 0.12);
            break;
          }
        }
        if (this.phase === 'leave' && (this.blinkT >= 0 || this.nearLens())) {
          // Never fills the lens on the way out: within ~4 m of the camera they blink out,
          // the arcade way (on / off every 0.06 s for 0.42 s), then they're gone.
          if (this.blinkT < 0) this.blinkT = 0;
          this.blinkT += dt;
          this.root.visible = Math.floor(this.blinkT / 0.06) % 2 === 1;
          if (this.blinkT > 0.42) this.removed = true;
        } else if (this.offScreen() && t > 0.3) {
          // Got away: safe off screen.
          if (this.phase === 'leave') this.removed = true;
          else this.escape();
        } else if (d < 0.4) {
          // Reached the stage's spot, still in view: hide there.
          if (this.phase === 'leave') this.removed = true;
          else this.startle('cower');
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
        this.yawGoal = this.phaseYaw();
        if (!g || g.removed || g.state === 'dying') {
          // The zombie's down: saved!
          this.grabber = null;
          this.rescue();
          break;
        }
        // The tug of war, keyed: it YANKS (a lurch toward it, 0.08 s), holds,
        // they drag back over half a second, brace, and it yanks again.
        this.yankT += dt;
        if (this.yankT >= this.yankPeriod) {
          this.yankT -= this.yankPeriod;
          this.yankPeriod = 1.1 + this.rng.next() * 0.5;
        }
        const k = this.yankT;
        this.yankAmt = k < 0.08 ? 1 - (1 - k / 0.08) ** 2 : k < 0.3 ? 1 : 1 - smoothstep(0.3, 0.8, k);
        // Dragged two stumbling steps toward it (the near foot, then the other),
        // then two steps back as they haul themselves away again.
        this.nearFoot = YANK_LURCH * (smoothstep(0, 0.1, k) - smoothstep(0.65, 0.85, k));
        this.farFoot = YANK_LURCH * (smoothstep(0.1, 0.2, k) - smoothstep(0.45, 0.65, k));
        this.nearUp = bump(k, 0, 0.1) + bump(k, 0.65, 0.85);
        this.farUp = bump(k, 0.1, 0.2) + bump(k, 0.45, 0.65);
        _n.copy(this.grabBase).sub(this.grabRoot).setY(0).normalize();
        this.root.position.copy(this.grabRoot).addScaledVector(_n, (this.nearFoot + this.farFoot) / 2);
        this.root.position.y = this.world.groundAt(this.root.position.x, this.root.position.z);
        this.grabSpot.copy(this.grabBase).addScaledVector(_n, YANK_STEP * this.yankAmt);
        this.grabTurn = -this.side * 0.8;
        if (t > 0.4 && this.helps === 0) this.say(CIV_STAMP.bubble.help, 1.6);
        if (t > this.grabTime) {
          // Wrenched free (they get away; paid with the rest at the clear).
          this.yankAmt = 0;
          this.nearFoot = this.farFoot = this.nearUp = this.farUp = 0;
          this.letGo();
          this.enter('flee', 0.15);
        }
        break;
      }
      case 'thanks':
        this.yawGoal = this.phaseYaw();
        if (t > 1.25) {
          this.destSet = false;
          this.enter('leave', 0.3);
        }
        break;
    }
  }

  /** Where the act faces (yaw). */
  private phaseYaw(ph: Phase = this.phase): number {
    const cam = this.faceCamYaw();
    switch (ph) {
      case 'plead':
        // A little turned toward the screen edge: the knee bend and the lean
        // show in silhouette (square to the camera they foreshorten away).
        return cam + this.side * 0.42;
      case 'cower':
        // Turned a touch toward the screen edge, kneeling (further round, the
        // folded figure reads as a sprinter in the blocks).
        return cam + this.side * 0.3;
      case 'hide':
        return cam + Math.PI + this.side * 0.6;
      case 'backaway': {
        // Facing the threat — but never further than 3/4 from the camera (in
        // profile, arms forward, a backing civilian reads as a zombie).
        const th = this.threat;
        if (!th) return cam;
        th.root.getWorldPosition(_v);
        const to = Math.atan2(_v.x - this.root.position.x, _v.z - this.root.position.z);
        return cam + clamp(angleDelta(cam, to), -0.7, 0.7);
      }
      case 'grabbed':
        return cam - this.grabSide * 0.45;
      case 'thanks':
        return cam;
      case 'flee':
      case 'leave':
      case 'arrive':
        return Math.atan2(this.dest.x - this.root.position.x, this.dest.z - this.root.position.z);
      default:
        return this.root.rotation.y;
    }
  }

  /** What follows the opening HELP!: the act — or, for FLEE, cowering until the danger is real. */
  private afterHelp(): Phase {
    if (this.main === 'flee' && !this.fleeReady()) return 'cower';
    return this.main;
  }

  /**
   * FLEE goes once a threat is close, something winds up an attack, or it has
   * waited long enough — not the moment they've run in (no running in only to
   * turn round and run straight out), unless it's right on them.
   */
  private fleeReady(): boolean {
    if (this.settleT > 0 && this.threatDist > DUCK_DIST) return false;
    return this.alarm || this.threatDist < (this.dino ? FLEE_NEAR_DINO : FLEE_NEAR_ZOMBIE) || this.age > FLEE_WAIT;
  }

  /** `auto` civilians back off and run when a threat comes close. */
  private panic() {
    if (this.act !== 'auto' || this.perched) return;
    if (this.threatDist < (this.dino ? PANIC_DINO : PANIC_ZOMBIE)) this.enter(this.threatDist < 1.6 ? 'flee' : 'backaway', 0.2);
  }

  /** A jolt (STARTLE_TIME), then `next`. */
  private startle(next: Phase) {
    this.next = next;
    this.enter('startle', 0.06);
  }

  /** Something made them jump: tuck in, head jerking, no peeking for a moment. */
  private flinch() {
    if (this.phase !== 'cower' && this.phase !== 'hide' && this.phase !== 'grabbed' && this.phase !== 'backaway' && this.phase !== 'plead') return;
    this.flinchT = FLINCH_TIME;
    this.flinchDir = this.rng.next() < 0.5 ? 1 : -1;
    this.peekOn = false;
    this.peek *= 0.3;
  }

  /** A shot fired close to us on screen (client px). */
  private nearShot(x: number, y: number) {
    if (this.shot || this.rescued || this.escaped || this.removed) return;
    this.rig.head.getWorldPosition(_v).project(this.world.camera);
    const vp = this.world.viewport;
    const sx = (_v.x * 0.5 + 0.5) * vp.width;
    const sy = (-_v.y * 0.5 + 0.5) * vp.height;
    if (_v.z < 1 && Math.hypot(sx - x, sy - y) < FLINCH_PX) {
      this.flinch();
      this.jumpT = FLINCH_TIME;
    }
  }

  /** Something killed close by. */
  private nearKill(e: Enemy) {
    if (this.shot || this.rescued || this.escaped || this.removed) return;
    e.root.getWorldPosition(_v);
    const p = this.root.position;
    if (Math.hypot(_v.x - p.x, _v.z - p.z) < 4) {
      this.flinch();
      this.jumpT = FLINCH_TIME;
    }
  }

  /** Cower / hide: duck while anything is close or attacking, peek up in between (0.4–0.8 s up, a 0.1 s duck back). */
  private peeking(dt: number) {
    const danger = this.alarm || this.threatDist < DUCK_DIST || this.flinchT > 0;
    this.peekT -= dt;
    if (danger) {
      this.peekOn = false;
      this.peekT = Math.max(this.peekT, 0.8);
    } else if (this.peekT <= 0) {
      this.peekOn = !this.peekOn;
      if (this.peekOn) {
        this.peekT = 0.4 + this.rng.next() * 0.4;
        // Every other peek looks at the player — HELP! the first times.
        this.peekCam = this.peeks % 2 === 0;
        this.peeks++;
        if (this.peekCam && this.phase === 'cower' && this.helps < 2) this.say(CIV_STAMP.bubble.help, this.peekT + 0.25);
      } else this.peekT = 1.4 + this.rng.next() * 1.4;
    }
    const goal = this.peekOn ? 1 : 0;
    this.peek += (goal - this.peek) * (1 - Math.exp(-(goal > this.peek ? 9 : 30) * dt));
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
    if (p === 'leave') this.leaveAim = 0;
    if (p === 'backaway' && this.helps === 0) this.say(CIV_STAMP.bubble.help, 0.9);
    if (p === 'flee') {
      this.lookBackT = 0.6;
      this.runT = 0;
      if (this.speed < 1) this.speed = 1;
    }
    if (p === 'cower' || p === 'hide') {
      this.peek = 0;
      this.peekOn = false;
    }
  }

  /** Blend from what is drawn now into the current phase's pose again (a change of hands). */
  private reblend(blend: number) {
    this.from.set(this.pose);
    this.blendT = 0;
    this.blendDur = blend;
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
    const flinch = this.flinchT > 0 ? Math.min(1, this.flinchT / 0.08) : 0;
    const calling = this.bubble === CIV_STAMP.bubble.help;
    switch (this.phase) {
      case 'arrive':
        poseFlee(p, this.stride, 0, 1);
        ph.face = 'scream';
        ph.jaw = 0.8;
        break;
      case 'plead': {
        const big = this.perched || this.camDist() > FAR_WAVE;
        // Turned three-quarters: the hand nearer the camera cups the mouth (in
        // front of the face), the far one waves beside the head — out past the
        // silhouette where it reads (swapped smoothly if the view swings round).
        const wave = this.farSide();
        if (wave !== this.waveSide) {
          this.waveSide = wave;
          this.reblend(0.25);
        }
        // At the player; a quick look at the threat now and then.
        const look = this.threat && Math.sin(this.phaseT * 2.2 + this.seed) > 0.55 ? clamp(this.threatAng, -1, 1) * 0.6 : 0;
        posePlead(p, t, this.waveSide, big, look);
        tremble(p, t, 0.3);
        ph.face = 'scream';
        ph.jaw = 0.6 + 0.35 * Math.abs(Math.sin(t * 6));
        ph.hairSwing = Math.sin(t * 9) * 0.5;
        break;
      }
      case 'startle':
        poseStartle(p, this.phaseT);
        ph.face = 'terror';
        ph.jaw = 0.85;
        ph.hairSwing = 1;
        break;
      case 'cower': {
        const curl = Math.max(this.threatDist < 2.4 ? 1 : this.alarm ? 0.5 : 0, flinch);
        const look = this.peekCam ? angleDelta(this.root.rotation.y, this.faceCamYaw()) : this.threatAng;
        // (Calling HELP!: the hand nearer the camera comes down to the mouth.)
        poseCower(p, t, this.peek, clamp(look, -1.2, 1.2), curl, this.kneel, this.peekCam && calling ? -this.farSide() : 0);
        p[J.HEAD_Y] += this.flinchDir * 0.15 * flinch;
        fidget(p, t + this.seed, (1 - this.peek) * (1 - curl));
        const shake = 0.7 + (this.alarm ? 0.3 : 0);
        shiver(p, t, shake, this.seed);
        tremble(p, t, 0.3);
        ph.face = curl > 0.6 ? 'strain' : calling && this.peek > 0.5 ? 'scream' : 'terror';
        ph.jaw = calling ? 0.75 : 0.35 + 0.25 * Math.abs(Math.sin(t * 4.3));
        ph.hairSwing = (Math.floor(t * 10.5 + this.seed) & 1 ? 0.3 : -0.3) * shake;
        break;
      }
      case 'hide': {
        // Peeking out toward the middle of the view; glancing back at the camera
        // over the shoulder nearer to it.
        this.glanceAmt += (this.glance - this.glanceAmt) * (1 - Math.exp(-7 * dt));
        poseHide(p, t, this.peek, this.side, -this.glanceAmt * this.side);
        p[J.HEAD_Y] += this.flinchDir * 0.25 * flinch;
        fidget(p, t + this.seed, (1 - this.peek) * (1 - this.glanceAmt) * 0.7);
        shiver(p, t, 0.45, this.seed);
        ph.face = 'terror';
        ph.jaw = calling ? 0.7 : 0.3 + 0.2 * Math.abs(Math.sin(t * 3.7));
        ph.hairSwing = Math.floor(t * 10.5 + this.seed) & 1 ? 0.15 : -0.15;
        break;
      }
      case 'backaway': {
        const fear = clamp((4 - this.threatDist) / 2.5, 0, 1);
        poseBackAway(p, this.stride, this.amp, fear, this.guard);
        // HELP! over the shoulder at the player, first.
        if (calling) p[J.HEAD_Y] = clamp(angleDelta(this.root.rotation.y, this.faceCamYaw()), -1.1, 1.1);
        shiver(p, t, 0.5, this.seed);
        ph.face = fear > 0.5 || calling ? 'scream' : 'terror';
        ph.jaw = 0.45 + 0.4 * Math.max(fear, calling ? 1 : 0);
        ph.hairSwing = Math.sin(this.stride) * 0.4;
        break;
      }
      case 'fall': {
        const u = this.phaseT / FALL_TIME;
        if (u < 0.82) poseFall(p, u, t);
        else {
          poseFall(this.aux, 0.7, t);
          poseFlee(p, this.stride, 0, 1);
          blendPose(p, this.aux, p, smoothstep(0.82, 1, u));
        }
        ph.face = u < 0.18 ? 'scream' : 'terror';
        ph.jaw = 0.8;
        // (Hair thrown about — and flung aside as they roll over, not draped over the head.)
        ph.hairSwing = u < 0.18 ? -1 : u > 0.62 ? 0.9 : 0;
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
        // Straining back at the zombie just after a yank; screaming to the player in between.
        const look = this.yankT < 0.85 ? -1 : 1;
        const mid = (this.nearFoot + this.farFoot) / 2;
        poseGrabbed(p, t, this.grabSide, this.yankAmt, look, this.nearFoot - mid, this.farFoot - mid, this.nearUp, this.farUp);
        shiver(p, t, 0.35, this.seed);
        ph.face = look > 0 ? 'scream' : 'strain';
        ph.jaw = look > 0 ? 0.8 + 0.15 * Math.sin(t * 7) : 0.2;
        ph.hairSwing = this.yankAmt * this.grabSide;
        break;
      }
      case 'thanks': {
        poseThanks(p, this.phaseT, this.waveSide, this.thumb, clamp(1 - this.phaseT / 0.35, 0, 1));
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
    // An attack winding up close by: a jolt.
    if (alarm && !this.alarm && best < 6) this.flinch();
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

  /**
   * The arm on the side turned away from the camera (+1 = the left): the one
   * that shows beside the silhouette rather than in front of it. Kept while
   * the civilian faces the camera nearly square.
   */
  private farSide(): number {
    const view = angleDelta(this.root.rotation.y, this.faceCamYaw());
    return Math.abs(view) < 0.12 ? this.waveSide : view > 0 ? -1 : 1;
  }

  private faceCamYaw(): number {
    const p = this.root.position;
    return Math.atan2(_cam.x - p.x, _cam.z - p.z);
  }

  private camDist(): number {
    const p = this.root.position;
    return Math.hypot(p.x - _cam.x, p.z - _cam.z);
  }

  /** Unit ground direction outward on screen (away from the middle of the view) and toward the camera. */
  private outward(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(_right).multiplyScalar(this.side).addScaledVector(_fwd, -0.6).normalize();
  }

  /** Tangent of the half view angle across, at the edge where a body has left it. */
  private edgeTan(): number {
    const c = this.world.camera;
    return c.aspect * Math.tan((c.fov * Math.PI) / 360) * 1.12;
  }

  /**
   * Where to run: the stage's `to`, else out across the nearer side of the
   * view — the heading (from straight across to a little toward or away from
   * the camera) that keeps them on screen about `secs` at running speed, so the
   * run reads, Operation Wolf style. Screen x only ever moves outward: never
   * back toward the middle of the view where everything comes at the player
   * (deeper runs stay under the angle that would turn them back inward).
   */
  private pickDest(secs: number) {
    this.destSet = true;
    if (this.to && (this.phase === 'flee' || this.phase === 'fall')) {
      this.dest.copy(this.to);
      return;
    }
    const p = this.root.position;
    const X = Math.abs(this.viewX(p));
    const Z = Math.max(0.5, this.viewZ(p));
    const E = this.edgeTan();
    // A rescued civilian walking off never heads toward the lens: to the nearer screen side,
    // a little away from the camera (re-aimed as the camera moves, see 'leave').
    const leave = this.phase === 'leave';
    if (leave) {
      const vx = this.viewX(p);
      if (Math.abs(vx) > 0.3) this.side = vx > 0 ? 1 : -1;
    }
    const i0 = leave ? 6 : 0;
    for (let i = 0; i < HEADINGS; i++) {
      if (i < i0) {
        _cost[i] = Infinity;
        continue;
      }
      const a = -0.6 + i * 0.115;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Distance until |x| / z passes the edge (or the camera plane, running in).
      const den = ca - E * sa;
      let l = den > 1e-3 ? Math.max(0, (E * Z - X) / den) : 99;
      if (sa < 0) l = Math.min(l, (Z - 0.4) / -sa);
      _len[i] = l;
      _cost[i] = Math.abs(l / RUN_SPEED - secs) + 0.4 * Math.abs(a);
    }
    let pick = i0;
    for (let i = i0 + 1; i < HEADINGS; i++) if (_cost[i] < _cost[pick]) pick = i;
    this.headingTo(pick, _len[pick] + 3, this.dest);
    this.dest.y = p.y;
  }

  /** Where heading `i` (of `pickDest`'s fan) runs to after `l` metres. */
  private headingTo(i: number, l: number, out: THREE.Vector3): THREE.Vector3 {
    const a = -0.6 + i * 0.115;
    _n.copy(_right).multiplyScalar(this.side * Math.cos(a)).addScaledVector(_fwd, Math.sin(a));
    return out.copy(this.root.position).addScaledVector(_n, l);
  }

  /** A point just inside the edge of the view on our side, at our depth (where an escaped civilian's RESCUED! shows). */
  private edgePoint(out: THREE.Vector3): THREE.Vector3 {
    this.view();
    const z = Math.max(2, this.viewZ(out));
    const x = this.side * z * (this.edgeTan() / 1.12) * 0.8;
    return out.copy(_cam).addScaledVector(_fwd, z).addScaledVector(_right, x).setY(this.world.groundAt(out.x, out.z));
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

  /** Within LEAVE_NEAR of the camera (in front of it): a walk-off ends here rather than filling the screen. */
  private nearLens(): boolean {
    this.rig.chest.getWorldPosition(_v);
    return this.viewZ(_v) < LEAVE_NEAR;
  }

  /** The chest well inside the view (|NDC x| < `margin`). */
  private onScreen(margin: number, at?: THREE.Vector3): boolean {
    if (at) _v.copy(at).setY(at.y + 1.2);
    else this.rig.chest.getWorldPosition(_v);
    if (this.viewZ(_v) < 0.6) return false;
    _v.project(this.world.camera);
    return _v.z < 1 && Math.abs(_v.x) < margin && _v.y > -0.9;
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
    p.speed = this.phase === 'flee' || this.phase === 'leave' || this.phase === 'stumble' || this.phase === 'arrive' ? this.speed : 0;
    return paintHuman(f, this.rig, this.look, p);
  }

  override onShot(hit: ShotHit): ShotOutcome {
    if (this.shot || this.rescued || this.escaped) return { kind: 'civilian', counts: false };
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
    return this.shot ? 'shot' : this.escaped ? 'escaped' : this.phase;
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
   * (flee), a yank (grabbed), a flinch or the thumbs-up forced, and write the
   * pose onto the rig.
   */
  debugPose(
    phase: CivPhase,
    seconds: number,
    o: { peek?: number; glance?: number; look?: number; thumb?: boolean; bubble?: number; yank?: number; flinch?: boolean; far?: boolean; peekCam?: boolean } = {},
  ) {
    this.view();
    if (this.waitCam >= 0) this.appear(false);
    this.phase = phase;
    this.phaseT = seconds;
    this.age = seconds;
    this.peek = o.peek ?? 0;
    this.peekCam = o.peekCam ?? false;
    this.glance = this.glanceAmt = o.glance ?? 0;
    this.lookBack = this.lookAmt = o.look ?? 0;
    this.stride = seconds * 10.5;
    this.flinchT = o.flinch ? FLINCH_TIME : 0;
    if (o.thumb !== undefined) this.thumb = o.thumb;
    if (phase === 'grabbed') {
      this.yankAmt = o.yank ?? 0;
      this.yankT = this.yankAmt > 0.5 ? 0.2 : 1;
    }
    if (o.bubble !== undefined) {
      this.bubble = o.bubble;
      this.bubbleT = 1e9;
    }
    this.writePose(0);
    if (o.far !== undefined && phase === 'plead') posePlead(this.target, this.age, this.waveSide, o.far, 0);
    this.pose.set(this.target);
    this.blendT = 1;
    applyPose(this.rig, this.pose);
    if (phase === 'grabbed' && this.grabber) this.reachForGrabber();
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
    case 'tech':
      return { ...base, outfit: 'scientist', jacket: v.shirt, inner: TECH_POLO, innerW: 2.3, pantsPat: 'cloth', badge: 0xf8f8f8 };
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
    case 'tech': {
      // Lab coat open wide over a safety-orange polo (the collar trim and an ID card on it).
      part(sp, 0.27, 0.46, 0.012, TECH_POLO, 0, 0.22, cz + 0.002, ZT.CLOTH, 0.1);
      for (const s of [1, -1]) part(sp, 0.016, 0.46, 0.014, 0xc8c8c0, s * 0.137, 0.22, cz + 0.004); // lapel edges
      part(sp, 0.08, 0.025, 0.014, 0xf4f0e8, 0, 0.44, cz + 0.006, ZT.FLAT, 0.1);
      part(sp, 0.05, 0.06, 0.012, 0xf8f8f8, 0.07, 0.32, cz + 0.008, ZT.FLAT, 0.2);
      break;
    }
    default: {
      // Open shirt over a white tee.
      part(sp, 0.12, 0.4, 0.012, 0xe8e4da, 0, 0.24, cz + 0.004);
      break;
    }
  }
}

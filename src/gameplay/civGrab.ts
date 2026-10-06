import * as THREE from 'three';
import { Walker } from '../content/enemies/zombies';
import { restPose } from '../content/enemies/zombieKit';
import { angleDelta } from '../core/math';
import type { EnemySpawn } from './Enemy';
import type { World } from './World';
import type { Civilian } from './Civilian';
import { aimArm } from './civPoses';
import type { HumanoidRig } from '../content/kit/humanoid';

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

/**
 * A zombie that has caught a civilian (the civilian's GRABBED act spawns it, at
 * the spot the civilian picks — see `Civilian`): it stands its ground at arm's
 * length, one hand clamped on the civilian's wrist, the other clawing at them,
 * lunging in to bite. House of the Dead rules: shoot it and they're free.
 *
 * Fairness: while it holds on it never attacks the player (no warning ring, no
 * attack slot) and stays where the civilian put it — level with them, an arm's
 * length and more (`GRAB_SEP`) toward the middle of the view, turned to the
 * camera and leaning back, so its head and chest are clear shots well away from
 * the civilian on screen (the human-like bot's aim error included). A hit makes
 * it flinch but it keeps its grip; shooting the gripping arm off breaks it. Let
 * go (the civilian breaks free, or is hit), it staggers back and is a plain walker.
 */
export class Grabber extends Walker {
  /** +1: holding on with the left hand (the arm on the civilian's side), −1 the right. */
  gripSide = 1;
  private bite = 0;

  constructor(
    world: World,
    spawn: EnemySpawn,
    private victim: Civilian | null,
  ) {
    super(world, spawn);
  }

  protected override configure() {
    super.configure();
    this.name = 'grabber';
  }

  override onAdded(): void {
    super.onAdded();
    // An arm already missing at build: hold on with the other one.
    if (this.severed[this.gripSide > 0 ? 0 : 1] > 0) this.gripSide = -this.gripSide;
    this.setState('grab');
  }

  /** Its rig (the civilian aims its hand at this one's). */
  get rig(): HumanoidRig | undefined {
    return this.r;
  }

  /** Still holding on (and able to)? */
  get holding(): boolean {
    return this.state === 'grab';
  }

  /** Let go: stumble back off the civilian, then walk on at the player. */
  release() {
    if (this.state !== 'grab') return;
    this.victim = null;
    this.setState('stagger');
  }

  /** Hits don't break the grip (a flinch, from the hit reactions); everything else staggers as usual. */
  override stagger() {
    if (this.state === 'grab') return;
    super.stagger();
  }

  protected override customUpdate(dt: number) {
    if (this.state !== 'grab') return;
    const v = this.victim;
    // Gripping arm shot off: the civilian pulls free.
    if (!v || v.removed || v.shot || v.rescued || this.severed[this.gripSide > 0 ? 0 : 1] > 0) {
      this.victim = null;
      v?.grabberLost();
      this.setState('stagger');
      return;
    }
    // Stand where the civilian's struggle puts us, turned to them (a 3/4 view).
    this.root.position.copy(v.grabSpot);
    v.root.getWorldPosition(_p);
    const yaw = Math.atan2(_p.x - this.root.position.x, _p.z - this.root.position.z);
    this.root.rotation.y += angleDelta(this.root.rotation.y, yaw + v.grabTurn) * (1 - Math.exp(-8 * dt));
    this.moveSpeed = 0;
    this.bite = Math.max(0, Math.sin(this.age * 2.3 + 1));
  }

  protected override pixelJaw(): number {
    if (this.state === 'grab') return 0.2 + 0.75 * this.bite * Math.abs(Math.sin(this.age * 9));
    return super.pixelJaw();
  }

  protected override pose(dt: number) {
    if (this.state !== 'grab' || !this.victim) {
      super.pose(dt);
      return;
    }
    const r = this.r;
    const v = this.victim;
    restPose(r, this.hipsY);
    const t = this.age;
    const g = this.gripSide;
    // A tug of war: feet braced, leaning back AWAY from the civilian (dragging
    // them in) — its head and chest stay clear of them on screen — throwing its
    // weight back on each yank, the head snapping at them now and then.
    const lunge = this.bite;
    const y = v.yank;
    r.legL.hip.rotation.x = g > 0 ? -0.35 - 0.15 * y : 0.2 + 0.1 * y;
    r.legR.hip.rotation.x = g > 0 ? 0.2 + 0.1 * y : -0.35 - 0.15 * y;
    r.legL.knee.rotation.x = g > 0 ? 0.45 + 0.2 * y : 0.2;
    r.legR.knee.rotation.x = g > 0 ? 0.2 : 0.45 + 0.2 * y;
    r.legL.hip.rotation.z = 0.12 + (g > 0 ? 0.08 : 0);
    r.legR.hip.rotation.z = -0.12 - (g < 0 ? 0.08 : 0);
    r.hips.position.y = this.hipsY - 0.06 - 0.04 * y;
    // (z > 0 leans toward −X: away from a civilian at its left when g = +1.)
    r.spine.rotation.z = g * (0.16 + 0.18 * y + 0.03 * Math.sin(t * 2.6));
    r.spine.rotation.x = 0.1 + 0.08 * lunge * (1 - y) - 0.12 * y;
    r.spine.rotation.y = g * 0.2;
    r.neck.rotation.x = -0.2 - 0.15 * lunge;
    r.head.rotation.x = -0.1 + 0.1 * lunge;
    r.head.rotation.y = g * 0.45;
    r.head.rotation.z = this.headTilt - g * (0.1 + 0.15 * y) + Math.sin(t * 7) * 0.06 * lunge;
    // Gripping hand (straight arm) on the civilian's wrist; the other claws
    // toward them at shoulder height (never up over its head).
    const hold = g > 0 ? r.armL : r.armR;
    const claw = g > 0 ? r.armR : r.armL;
    hold.elbow.rotation.x = -0.08;
    claw.elbow.rotation.x = -0.6 - 0.3 * key(t);
    aimArm(hold, v.grabHand);
    v.shoulderPoint(_q);
    r.chest.getWorldPosition(_p);
    _q.lerp(_p, 0.2);
    _q.y += 0.04 * key(t + 0.2);
    aimArm(claw, _q);
    // (Tremor of effort in the holding arm.)
    hold.shoulder.rotation.z += Math.sin(t * 23) * 0.03;
  }
}

/** A clawing swipe, held at each end for a few sprite frames (0 / 1, 2.2 a second). */
function key(t: number): number {
  const u = t * 2.2 - Math.floor(t * 2.2);
  return u < 0.5 ? 0 : 1;
}

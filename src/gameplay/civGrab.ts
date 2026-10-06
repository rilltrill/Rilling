import * as THREE from 'three';
import { Walker } from '../content/enemies/zombies';
import { restPose } from '../content/enemies/zombieKit';
import { angleDelta } from '../core/math';
import type { EnemySpawn } from './Enemy';
import type { World } from './World';
import type { Civilian } from './Civilian';
import { ikLimb } from './civPoses';
import type { HumanoidRig } from '../content/kit/humanoid';

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _pole = new THREE.Vector3();

/**
 * A zombie that has caught a civilian (the civilian's GRABBED act spawns it, at
 * the spot the civilian picks — see `Civilian`): a tug of war at arm's length,
 * both hands on the civilian's arm (the wrist, the forearm by the elbow),
 * hunched in snapping at it, then throwing its weight back on each yank.
 * House of the Dead rules: shoot it and they're free.
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
    // The zombie does the pulling: hunched in over the held arm between yanks,
    // the head darting at it (trying to bite), then on each yank it throws its
    // weight back, a step back with the rear foot, hauling with BOTH hands — one
    // clamped on the wrist, the other on the forearm by the elbow. (Leaning away
    // from the civilian on the yank keeps its head and chest well clear of them.)
    const y = v.yank;
    const bite = y < 0.15 ? key(t * 0.75) : 0;
    this.bite = bite;
    const front = g > 0 ? r.legL : r.legR;
    const rear = g > 0 ? r.legR : r.legL;
    front.hip.rotation.set(-0.4 + 0.2 * y, 0, g * 0.14);
    front.knee.rotation.x = 0.45 - 0.15 * y;
    rear.hip.rotation.set(0.12 + 0.38 * y, 0, -g * 0.1);
    rear.knee.rotation.x = 0.3 + 0.25 * y;
    r.hips.position.y = this.hipsY - 0.07 - 0.05 * y;
    // (z > 0 leans toward −X: away from a civilian at its left when g = +1.)
    r.spine.rotation.x = 0.38 * (1 - y) - 0.06 * y + 0.05 * bite;
    r.spine.rotation.z = g * (0.02 * (1 - y) + 0.45 * y);
    r.spine.rotation.y = g * 0.3;
    r.chest.rotation.x = 0.12 * (1 - y);
    r.neck.rotation.x = -0.2 + 0.3 * bite;
    r.head.rotation.x = -0.12 + 0.15 * bite;
    r.head.rotation.y = g * (0.45 + 0.15 * bite);
    r.head.rotation.z = this.headTilt - g * (0.08 + 0.12 * y);
    // Both hands on the held arm (two-bone IK on the rig), elbows down.
    this.root.updateWorldMatrix(true, true);
    const hold = g > 0 ? r.armL : r.armR;
    const other = g > 0 ? r.armR : r.armL;
    _pole.set(0, -1, 0);
    ikLimb(hold, v.grabHand, _pole);
    // The other hand on the forearm by the elbow — as near the elbow as it reaches.
    other.shoulder.getWorldPosition(_p);
    const reach = (Math.abs(other.elbow.position.y) + Math.abs(other.end.position.y)) * r.scale * 0.97;
    v.elbowPoint(_q);
    for (let i = 0; i < 4 && _q.distanceTo(_p) > reach; i++) _q.lerp(v.grabHand, 0.35);
    ikLimb(other, _q, _pole);
    // (Tremor of effort in the holding arm.)
    hold.shoulder.rotation.z += Math.sin(t * 23) * 0.025;
  }
}

/** A snap, held at each end for a few sprite frames (0 / 1, 2.2 a second). */
function key(t: number): number {
  const u = t * 2.2 - Math.floor(t * 2.2);
  return u < 0.5 ? 0 : 1;
}

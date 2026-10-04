import * as THREE from 'three';
import type { RigMode, V3 } from '../core/types';
import { angleDelta, clamp, damp } from '../core/math';
import type { LookSpec } from './StageTypes';

const EYE: Record<RigMode, number> = { walk: 1.62, drive: 2.05 };
const ACCEL: Record<RigMode, number> = { walk: 3.5, drive: 7 };

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/**
 * The player's "rail": a camera rig that travels along a smooth curve, stops for
 * encounters, looks at points of interest and applies walk-bob / vehicle rumble
 * / screen-shake.
 *
 * `space` is a group that follows the rig's ground position and heading. Entities
 * spawned in the 'rig' frame are parented to it so they keep pace with a moving
 * player. In rig space: +x = right, +y = up, -z = forward (use `rel()` to convert
 * from the [right, up, forward] convention used in stage scripts).
 */
export class RailRig {
  readonly space = new THREE.Group();
  /** Attach first-person props (vehicle hood, mounted gun) here — it follows the camera's yaw but not bob/shake. */
  readonly viewModelHolder = new THREE.Group();
  curve: THREE.CatmullRomCurve3 | null = null;
  length = 0;
  /** Distance travelled along the rail in metres. */
  d = 0;
  speed = 0;
  mode: RigMode = 'walk';

  private targetD = 0;
  private cruise = 0;
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private lookSpec: LookSpec = 'path';
  private lookWorld: THREE.Vector3 | null = null;
  private lookRate = 2.5;
  private lookTarget: THREE.Object3D | null = null;
  private trauma = 0;
  private bobPhase = 0;
  private time = 0;
  private eye = EYE.walk;
  /** Extra positional offset (e.g. vehicle swerve) applied in rig space. */
  readonly offset = new THREE.Vector3();
  /** Externally controllable yaw wobble in radians (vehicle swerves). */
  swerve = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    this.camera.rotation.order = 'YXZ';
  }

  setPath(points: V3[]) {
    if (points.length < 2) throw new Error('Rail needs at least 2 points');
    this.curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      false,
      'centripetal',
    );
    this.curve.arcLengthDivisions = Math.max(200, points.length * 40);
    this.curve.updateArcLengths();
    this.length = this.curve.getLength();
    this.d = 0;
    this.targetD = 0;
    this.speed = 0;
    this.cruise = 0;
    this.lookSpec = 'path';
    this.lookWorld = null;
    const h = this.headingAt(0);
    this.yaw = h;
    this.pitch = 0;
    this.syncSpace();
    this.applyCamera(0);
  }

  setMode(mode: RigMode) {
    this.mode = mode;
  }

  /** Travel to rail distance `d` at cruise `speed` m/s, decelerating smoothly on arrival. */
  moveTo(d: number, speed: number) {
    this.targetD = clamp(d, 0, this.length);
    this.cruise = Math.max(0.1, speed);
  }

  /** Stop as quickly as is comfortable. */
  halt() {
    this.targetD = this.d;
    this.cruise = 0;
  }

  get arrived(): boolean {
    return Math.abs(this.targetD - this.d) < 0.05 && this.speed < 0.15;
  }

  get moving(): boolean {
    return this.speed > 0.15;
  }

  get eyeHeight() {
    return this.eye;
  }

  look(spec: LookSpec | undefined) {
    const s = spec ?? 'path';
    this.lookSpec = s;
    this.lookWorld = null;
    this.lookTarget = null;
    if (typeof s === 'object') {
      this.lookRate = s.blend ? 3 / s.blend : 2.5;
      if ('at' in s) {
        const p = new THREE.Vector3(s.at[0], s.at[1], s.at[2]);
        this.lookWorld = s.world ? p : this.relToWorld(s.at, p);
      }
    } else {
      this.lookRate = 2.2;
    }
  }

  /** Look at an arbitrary live object (e.g. a boss) until `look()` is called again. */
  lookAtObject(obj: THREE.Object3D, rate = 2.5) {
    this.lookSpec = 'path';
    this.lookWorld = null;
    this.lookTarget = obj;
    this.lookRate = rate;
  }

  /** Add screen shake. 0.15 = light gunshot, 0.4 = hit, 1 = huge impact. */
  shake(amount: number) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Rail heading (yaw) at distance d — camera looks along -Z rotated by this. */
  headingAt(d: number): number {
    if (!this.curve) return 0;
    const u0 = clamp(d / this.length, 0, 1);
    const u1 = clamp((d + 4) / this.length, 0, 1);
    this.curve.getPointAt(u0, _a);
    if (u1 - u0 < 1e-4) {
      this.curve.getTangentAt(u0, _b);
    } else {
      this.curve.getPointAt(u1, _b).sub(_a);
    }
    if (_b.x * _b.x + _b.z * _b.z < 1e-8) return this.yaw;
    return Math.atan2(-_b.x, -_b.z);
  }

  pointAt(d: number, out = new THREE.Vector3()): THREE.Vector3 {
    if (!this.curve) return out.set(0, 0, 0);
    return this.curve.getPointAt(clamp(d / this.length, 0, 1), out);
  }

  /** Convert stage-script [right, up, forward] to rig-space local coordinates. */
  static rel(v: V3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(v[0], v[1], -v[2]);
  }

  /** Rig-relative [right, up, forward] → world position, using the rig's current frame. */
  relToWorld(v: V3, out = new THREE.Vector3()): THREE.Vector3 {
    this.space.updateMatrixWorld();
    return this.space.localToWorld(RailRig.rel(v, out));
  }

  /** World position of the player's eye (camera without shake). */
  eyeWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.space.updateMatrixWorld();
    return this.space.localToWorld(out.set(this.offset.x, this.eye + this.offset.y, this.offset.z));
  }

  update(dt: number) {
    if (!this.curve) return;
    this.time += dt;
    this.eye = damp(this.eye, EYE[this.mode], 3, dt);

    // Speed control: accelerate toward cruise, brake to arrive exactly at targetD.
    const remaining = this.targetD - this.d;
    const accel = ACCEL[this.mode];
    if (Math.abs(remaining) < 0.02) {
      this.speed = damp(this.speed, 0, 8, dt);
      if (this.speed < 0.05) {
        this.speed = 0;
        this.d = this.targetD;
      }
    } else {
      const dir = Math.sign(remaining);
      const brakeSpeed = Math.sqrt(2 * accel * 1.2 * Math.abs(remaining));
      const desired = Math.min(this.cruise, brakeSpeed);
      if (this.speed < desired) this.speed = Math.min(desired, this.speed + accel * dt);
      else this.speed = Math.max(desired, this.speed - accel * 1.5 * dt);
      const step = Math.min(Math.abs(remaining), this.speed * dt);
      this.d += dir * step;
    }

    this.syncSpace();
    this.applyCamera(dt);
  }

  private syncSpace() {
    if (!this.curve) return;
    this.pointAt(this.d, this.space.position);
    this.space.rotation.set(0, this.headingAt(this.d), 0);
    this.space.updateMatrixWorld();
  }

  private applyCamera(dt: number) {
    const heading = this.space.rotation.y;
    let targetYaw = heading;
    let targetPitch = this.mode === 'drive' ? -0.03 : -0.02;

    const eye = this.eyeWorld(_c);
    const spec = this.lookSpec;
    if (this.lookTarget) {
      if (!this.lookTarget.parent) this.lookTarget = null;
      else {
        this.lookTarget.getWorldPosition(_a);
        ({ yaw: targetYaw, pitch: targetPitch } = this.yawPitchTo(eye, _a));
      }
    } else if (this.lookWorld) {
      ({ yaw: targetYaw, pitch: targetPitch } = this.yawPitchTo(eye, this.lookWorld));
    } else if (typeof spec === 'object' && 'yaw' in spec) {
      targetYaw = heading + THREE.MathUtils.degToRad(spec.yaw);
      targetPitch = THREE.MathUtils.degToRad(spec.pitch ?? 0);
    }

    const k = dt === 0 ? 1 : 1 - Math.exp(-this.lookRate * dt);
    this.yaw += angleDelta(this.yaw, targetYaw) * k;
    this.pitch += (targetPitch - this.pitch) * k;

    // Bob / rumble.
    const moving = clamp(this.speed / (this.mode === 'walk' ? 3 : 10), 0, 1);
    let bx = 0;
    let by = 0;
    let br = 0;
    if (this.mode === 'walk') {
      this.bobPhase += dt * (4 + this.speed * 1.6);
      by = Math.sin(this.bobPhase * 2) * 0.035 * moving;
      bx = Math.sin(this.bobPhase) * 0.025 * moving;
      br = Math.sin(this.bobPhase) * 0.006 * moving;
    } else {
      this.bobPhase += dt * (8 + this.speed);
      const rumble = 0.006 + 0.018 * moving;
      by = (Math.sin(this.time * 31) * 0.5 + Math.sin(this.time * 17.3) * 0.5) * rumble +
        Math.max(0, Math.sin(this.bobPhase * 0.37)) ** 12 * 0.06 * moving;
      bx = Math.sin(this.time * 23.1) * rumble * 0.5;
      br = Math.sin(this.time * 1.3) * 0.012 * moving + this.swerve * 0.3;
    }

    // Trauma-based shake.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    const t = this.time * 40;
    const sx = (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.06 * s;
    const sy = (Math.sin(t * 1.7 + 1) + Math.sin(t * 2.9) * 0.5) * 0.06 * s;
    const sr = Math.sin(t * 1.3 + 2) * 0.035 * s;
    this.roll = damp(this.roll, br, 6, dt || 1);

    // Camera position: eye + bob in camera-local axes.
    this.camera.position.copy(eye);
    _a.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); // camera right vector
    this.camera.position.addScaledVector(_a, bx + sx);
    this.camera.position.y += by + sy;
    this.camera.rotation.set(this.pitch + sy * 0.5, this.yaw + sx * 0.4 + this.swerve, this.roll + sr);
    this.camera.updateMatrixWorld();

    // View-model follows camera yaw/pitch smoothly but ignores shake so it feels "held".
    this.viewModelHolder.position.copy(eye);
    this.viewModelHolder.rotation.set(0, this.yaw + this.swerve * 0.5, this.roll * 0.5, 'YXZ');
    this.viewModelHolder.updateMatrixWorld();
  }

  private yawPitchTo(from: THREE.Vector3, to: THREE.Vector3) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const flat = Math.hypot(dx, dz);
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.max(0.001, flat)) };
  }
}

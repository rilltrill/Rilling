import * as THREE from 'three';
import { Crawler, Runner, Spitter, Walker } from '../../enemies/zombies';
import type { EnemyState } from '../../../gameplay/Enemy';
import { clamp } from '../../../core/math';
import { registerEnemy } from '../../registry';

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _f = new THREE.Vector3();
const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * A spitter perched on the overpass deck. Same model, hit zones and bile
 * attack as the roster spitter, but it never walks off its ledge: it holds
 * position, turns to face the truck and spits whenever it is on screen.
 * Its "ground" is the deck, so a killed spitter collapses up there instead of
 * dropping through the concrete to the road.
 */
export class DeckSpitter extends Spitter {
  protected override configure() {
    super.configure();
    this.attackRange = 40;
  }

  override groundY(x: number, z: number): number {
    if (this.frame === 'world') return Math.max(this.spawn.pos.y, this.world.groundAt(x, z));
    return super.groundY(x, z);
  }

  protected override advanceUpdate(dt: number) {
    if (!this.onScreen(0.9)) {
      this.playerPos(_p);
      this.faceToward(_p, dt);
      this.moveSpeed = 0;
      return;
    }
    super.advanceUpdate(dt);
  }
}

/**
 * A runner chasing the truck (rig frame). It attacks from a stand-off in front
 * of the camera — clear of the cab, the hood and the HUD corners — and it
 * never winds up while its chest (where the warning ring is drawn) is off
 * screen: when the camera is pitched up (look-back boss fight) it backs off
 * along the view until it is framed instead of freezing out of sight.
 */
export class TruckRunner extends Runner {
  /** Attack stand-off from the player's eye, metres. */
  protected reach = 3.4;
  /** Extra stand-off earned while the camera's pitch pushed the chest below the frame. */
  private standoff = 0;

  protected override configure() {
    super.configure();
    this.attackRange = this.reach;
  }

  override onAdded(): void {
    super.onAdded();
    this.attackRange = Math.max(this.attackRange, this.reach);
  }

  /**
   * Chest (and so the warning ring) in the middle band of the screen: clear of
   * the HUD corners (bomb button bottom-left, weapon panel bottom-right) and
   * of the thumbs resting there.
   */
  protected framed(): boolean {
    this.anchor.getWorldPosition(_n).project(this.world.camera);
    return _n.z < 1 && Math.abs(_n.x) < 0.28 && _n.y > -0.8 && _n.y < 0.86;
  }

  /** Horizontal camera forward + this runner's view-space offset (x right, ahead). */
  private viewOffset(): { side: number; ahead: number } {
    this.world.camera.getWorldDirection(_f);
    if (this.frame === 'rig') _f.applyQuaternion(_q.copy(this.world.rig.space.quaternion).invert());
    _f.y = 0;
    if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1);
    _f.normalize();
    this.playerPos(_p);
    const dx = this.root.position.x - _p.x;
    const dz = this.root.position.z - _p.z;
    return { side: -dx * _f.z + dz * _f.x, ahead: dx * _f.x + dz * _f.z };
  }

  override setState(s: EnemyState) {
    // Never start an attack the player can't see (covers advance → windup and recover → windup).
    if (s === 'windup' && this.state !== 'dying' && !this.framed()) s = 'advance';
    super.setState(s);
  }

  protected override advanceUpdate(dt: number) {
    const v = this.viewOffset();
    const framed = this.framed(); // (leaves the chest's NDC in _n)
    const near = this.distToPlayer <= this.attackRange + 0.9;
    // (Runners still flanking round the truck — beside it, not yet out in front — are left to the roster AI.)
    if (v.ahead >= this.attackRange * 0.75 && near && !framed) {
      // Below the frame → step back along the view; off to a side → toward the middle.
      if (_n.z < 1 && _n.y <= -0.8) this.standoff = Math.min(7, this.standoff + dt * 3);
      this.attackRange = this.reach + this.standoff;
      const side = clamp(v.side, -0.95, 0.95);
      this.playerPos(_p);
      _t.set(_p.x + _f.x * this.attackRange - _f.z * side, this.root.position.y, _p.z + _f.z * this.attackRange + _f.x * side);
      this.moveToward(_t, this.speed * 0.85, dt);
      this.separate(dt);
      this.faceToward(_p, dt);
      return;
    }
    if (this.standoff > 0 && _n.z < 1 && _n.y > -0.5) {
      this.standoff = Math.max(0, this.standoff - dt * 0.6);
      this.attackRange = this.reach + this.standoff;
    }
    super.advanceUpdate(dt);
  }
}

/**
 * Boss-fight runner: leaps onto the bridge deck behind the truck and attacks
 * from ~5 m out, where the look-back camera (pitched up at the giant) still
 * frames it above the tailgate.
 */
export class TailRunner extends TruckRunner {
  protected override reach = 5.2;
}

/**
 * Roadside zombies (world frame) the truck drives past: targets of
 * opportunity. They never START an attack while the truck is moving — the
 * strike would land seconds later with the truck long gone — but they attack
 * normally once it stops.
 */
export class RoadsideWalker extends Walker {
  override setState(s: EnemyState) {
    if (s === 'windup' && this.world.rig.moving) s = 'advance';
    super.setState(s);
  }
}

export class RoadsideCrawler extends Crawler {
  override setState(s: EnemyState) {
    if ((s === 'windup' || s === 'pounce') && this.world.rig.moving) s = 'advance';
    super.setState(s);
  }
}

registerEnemy('deck_spitter', (w, s) => new DeckSpitter(w, s));
registerEnemy('roadside_walker', (w, s) => new RoadsideWalker(w, s));
registerEnemy('roadside_crawler', (w, s) => new RoadsideCrawler(w, s));
registerEnemy('truck_runner', (w, s) => new TruckRunner(w, s));
registerEnemy('tail_runner', (w, s) => new TailRunner(w, s));

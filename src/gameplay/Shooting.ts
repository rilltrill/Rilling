import * as THREE from 'three';
import type { World } from './World';
import type { ShotHit, ShotOutcome } from './Entity';
import type { ShotTag } from './Shootables';
import type { WeaponDef } from './Weapons';

const raycaster = new THREE.Raycaster();
raycaster.far = 160;
const RAY_FAR = 160;
const _ndc = new THREE.Vector2();
const _dir = new THREE.Vector3();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPoint = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
// Reused per-shot scratch (no allocations for the raycast lists themselves).
const _targets: THREE.Object3D[] = [];
const _tHits: THREE.Intersection[] = [];
const _oHits: THREE.Intersection[] = [];
const _ring: Candidate[] = [];

/** Aim-assist probe ring radii in CSS pixels. */
const ASSIST_RINGS = [14, 26, 38];
const ASSIST_SAMPLES = 8;
/** Pellets of a multi-pellet weapon that draw wall/ground impacts (FX budget + raycast cost). */
const IMPACT_PELLETS = 4;

interface Candidate {
  intersection: THREE.Intersection;
  tag: ShotTag;
}

/**
 * Turns a tap into bullets: raycasts against shootable meshes and scenery,
 * applies damage, aim assist, piercing, FX, score and HUD feedback.
 */
export class Shooter {
  /** Last fire result: did anything count as a hit? (used by autoplay/tests) */
  lastHit = false;

  constructor(private world: World) {}

  /**
   * Try to fire the current weapon at client pixel (x, y).
   * `held` = repeat fire from holding the finger down.
   * Returns true if a shot was fired.
   */
  fire(x: number, y: number, held = false): boolean {
    const w = this.world;
    const res = w.weapons.tryFire(held);
    if (!res.ok) {
      if (res.reason === 'empty' && !held) {
        w.audio.play('empty');
        if (w.settings.autoReload) this.reload();
        else w.hud.prompt('RELOAD!');
      } else if (res.reason === 'overheated' && !held) {
        w.audio.play('empty');
      }
      return false;
    }
    const def = res.def;
    w.audio.play(def.sfx, { vary: 0.06, volume: 0.9 });
    // Turret flash sits further ahead so it doesn't wash out the vehicle view-model.
    if (def.id === 'turret') w.fx.muzzleFlash(0.4, undefined, 3.5);
    else w.fx.muzzleFlash(def.id === 'shotgun' || def.id === 'magnum' ? 1.6 : def.id === 'smg' ? 0.7 : 1);
    w.rig.shake(def.shake);
    w.hud.shotFired(x, y);
    w.haptic(def.id === 'shotgun' || def.id === 'magnum' ? 35 : 12);

    let anyCounted = false;
    let anyResolved = false;
    for (let p = 0; p < def.pellets; p++) {
      const outcome = this.firePellet(x, y, def, p === 0 && def.pellets === 1, p < IMPACT_PELLETS);
      if (outcome) {
        anyResolved = true;
        if (outcome.counts) anyCounted = true;
      }
    }
    void anyResolved;
    w.score.shot(anyCounted);
    w.events.emit('shot', { hit: anyCounted, x, y });
    this.lastHit = anyCounted;
    if (w.weapons.empty && def.mag !== Infinity) {
      if (w.settings.autoReload) this.reload();
      else w.hud.prompt('RELOAD!');
    }
    if (w.weapons.overheated) {
      w.audio.play('overheat');
      w.hud.prompt('OVERHEAT!');
    }
    return true;
  }

  reload(): boolean {
    const w = this.world;
    if (w.weapons.reload()) {
      const id = w.weapons.def.id;
      w.audio.play(id === 'shotgun' ? 'reload_shotgun' : id === 'magnum' ? 'reload_magnum' : 'reload');
      w.hud.prompt(null);
      return true;
    }
    return false;
  }

  private setRay(x: number, y: number, spread: number) {
    const { width, height } = this.world.viewport;
    _ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    raycaster.setFromCamera(_ndc, this.world.camera);
    if (spread > 0) {
      const rng = this.world.rng;
      _dir.copy(raycaster.ray.direction);
      _right.crossVectors(_dir, this.world.camera.up).normalize();
      _up.crossVectors(_right, _dir).normalize();
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next()) * spread;
      _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
      raycaster.ray.direction.copy(_dir);
    }
  }

  /**
   * Ordered hits along the current ray: live shootables in front of the first
   * occluder, and that occluder (the blocker). `withImpact` = the caller needs
   * the blocker for impact FX even when no shootable is on the ray; otherwise
   * the (expensive, recursive) occluder raycast is skipped for clean misses.
   */
  private cast(targets: THREE.Object3D[], withImpact = true): { list: Candidate[]; blocker: THREE.Intersection | null } {
    const w = this.world;
    const occluders = w.env?.occluders ?? [];
    _tHits.length = 0;
    raycaster.intersectObjects(targets, false, _tHits);
    // Drop hitboxes unregistered since `targets` was collected (killed by an earlier pellet).
    let n = 0;
    for (const h of _tHits) {
      const tag = h.object.userData.shot as ShotTag | undefined;
      if (tag && !tag.owner.removed) _tHits[n++] = h;
    }
    _tHits.length = n;
    const list: Candidate[] = [];
    let blocker: THREE.Intersection | null = null;
    if (occluders.length && (n > 0 || withImpact)) {
      // Shootables are individual meshes; occluders may be whole groups (walls, vehicles).
      // Only walls in front of the farthest candidate matter.
      raycaster.far = withImpact ? RAY_FAR : _tHits[n - 1].distance;
      _oHits.length = 0;
      raycaster.intersectObjects(occluders, true, _oHits);
      raycaster.far = RAY_FAR;
      for (const h of _oHits) {
        if (!h.object.userData.shot) {
          blocker = h;
          break;
        }
      }
    }
    for (const h of _tHits) {
      if (blocker && h.distance > blocker.distance) break; // everything beyond a wall is hidden
      list.push({ intersection: h, tag: h.object.userData.shot as ShotTag });
    }
    return { list, blocker };
  }

  private firePellet(x: number, y: number, def: WeaponDef, allowAssist: boolean, withImpact = true): ShotOutcome | null {
    const w = this.world;
    this.setRay(x, y, def.spread);
    const targets = w.shootables.active(_targets);
    const assist = allowAssist && w.settings.aimAssist;
    let { list, blocker } = this.cast(targets, withImpact || assist);
    let assisted = false;

    if (list.length === 0 && assist) {
      const found = this.assist(x, y, targets);
      if (found) {
        list = [found];
        blocker = null;
        assisted = true;
      }
    }

    if (list.length === 0) {
      if (withImpact) this.impactWorld(blocker);
      return null;
    }

    let outcome: ShotOutcome | null = null;
    const pierce = def.pierce ?? 1;
    const seen = new Set<unknown>();
    for (const c of list) {
      if (seen.has(c.tag.owner)) continue;
      seen.add(c.tag.owner);
      const h = c.intersection;
      const normal = h.face ? _tmp.copy(h.face.normal).transformDirection(h.object.matrixWorld).clone() : null;
      const hit: ShotHit = {
        object: h.object,
        part: assisted && c.tag.part === 'head' ? 'torso' : c.tag.part,
        point: h.point.clone(),
        normal,
        dir: raycaster.ray.direction.clone(),
        distance: h.distance,
        damage: def.damage,
        weapon: def.id,
        assisted,
        screenX: x,
        screenY: y,
      };
      const o = c.tag.owner.onShot(hit);
      if (!outcome || (o.counts && !outcome.counts)) outcome = o;
      const kind = o.kind === 'civilian' ? 'penalty' : o.killed ? 'kill' : o.kind === 'armor' ? 'armor' : o.headshot ? 'head' : 'hit';
      if (o.kind !== 'none' && o.kind !== 'pickup') w.hud.hitMarker(x, y, kind);
      if (seen.size >= pierce || o.kind === 'armor') break;
    }
    return outcome;
  }

  /**
   * Probe rings of rays around the tap for a nearby hostile/pickup (never
   * civilians). Probes test only the shootable meshes (cheap); walls are checked
   * with one occluder ray per candidate, nearest first — so detailed occluder
   * meshes cost one raycast instead of one per probe.
   */
  private assist(x: number, y: number, targets: THREE.Object3D[]): Candidate | null {
    const occluders = this.world.env?.occluders ?? [];
    const cam = this.world.camera.position;
    for (const r of ASSIST_RINGS) {
      _ring.length = 0;
      for (let i = 0; i < ASSIST_SAMPLES; i++) {
        const a = (i / ASSIST_SAMPLES) * Math.PI * 2 + (r % 2) * 0.4;
        this.setRay(x + Math.cos(a) * r, y + Math.sin(a) * r, 0);
        _tHits.length = 0;
        raycaster.intersectObjects(targets, false, _tHits);
        // The first live shootable on the probe decides it (a civilian in front blocks assist).
        for (const h of _tHits) {
          const tag = h.object.userData.shot as ShotTag | undefined;
          if (!tag || tag.owner.removed) continue;
          if (tag.owner.assistable) _ring.push({ intersection: h, tag });
          break;
        }
      }
      if (_ring.length === 0) continue;
      _ring.sort((a, b) => a.intersection.distance - b.intersection.distance);
      for (const c of _ring) {
        // Re-aim the ray at the found point (FX/knockback directions, occlusion test).
        raycaster.ray.origin.copy(cam);
        raycaster.ray.direction.copy(c.intersection.point).sub(cam).normalize();
        if (occluders.length && this.blocked(occluders, c.intersection.distance)) continue;
        _ring.length = 0;
        return c;
      }
    }
    _ring.length = 0;
    // Restore the centre ray for world impacts.
    this.setRay(x, y, 0);
    return null;
  }

  /** Is there scenery on the current ray closer than `dist`? */
  private blocked(occluders: THREE.Object3D[], dist: number): boolean {
    raycaster.far = Math.max(0, dist - 0.02);
    _oHits.length = 0;
    raycaster.intersectObjects(occluders, true, _oHits);
    raycaster.far = RAY_FAR;
    for (const h of _oHits) if (!h.object.userData.shot) return true;
    return false;
  }

  private impactWorld(blocker: THREE.Intersection | null) {
    const w = this.world;
    // Occluders can tag their own surface (userData.surface = 'metal' | 'wood' | …).
    const surface = (blocker?.object.userData.surface as string | undefined) ?? w.env?.surface ?? 'concrete';
    if (blocker) {
      const n = blocker.face ? _tmp.copy(blocker.face.normal).transformDirection(blocker.object.matrixWorld) : null;
      w.fx.impact(blocker.point, n, surface);
      w.audio.play('hit_world', { volume: 0.4, vary: 0.2 });
      return;
    }
    // Hit the ground?
    const ray = raycaster.ray;
    if (ray.direction.y < -0.01) {
      _plane.constant = -w.groundAt(w.camera.position.x, w.camera.position.z);
      if (ray.intersectPlane(_plane, _hitPoint) && _hitPoint.distanceTo(ray.origin) < 70) {
        _hitPoint.y = w.groundAt(_hitPoint.x, _hitPoint.z) + 0.02;
        w.fx.impact(_hitPoint, _tmp.set(0, 1, 0), surface);
      }
    }
  }
}

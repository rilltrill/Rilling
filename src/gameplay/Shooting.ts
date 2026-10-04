import * as THREE from 'three';
import type { World } from './World';
import type { ShotHit, ShotOutcome } from './Entity';
import type { ShotTag } from './Shootables';
import type { WeaponDef } from './Weapons';

const raycaster = new THREE.Raycaster();
raycaster.far = 160;
const _ndc = new THREE.Vector2();
const _dir = new THREE.Vector3();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPoint = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

/** Aim-assist probe ring radii in CSS pixels. */
const ASSIST_RINGS = [14, 26, 38];
const ASSIST_SAMPLES = 8;

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
      const outcome = this.firePellet(x, y, def, p === 0 && def.pellets === 1);
      if (outcome) {
        anyResolved = true;
        if (outcome.counts) anyCounted = true;
      }
    }
    void anyResolved;
    w.score.shot(anyCounted);
    w.events.emit('shot', { hit: anyCounted });
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

  /** Ordered hits along the current ray: shootables and occluders. */
  private cast(): { list: Candidate[]; blocker: THREE.Intersection | null } {
    const w = this.world;
    const targets = w.shootables.active();
    const occluders = w.env?.occluders ?? [];
    // Shootables are individual meshes; occluders may be whole groups (walls, vehicles).
    const hits = raycaster.intersectObjects(targets, false);
    if (occluders.length) {
      for (const h of raycaster.intersectObjects(occluders, true)) if (!h.object.userData.shot) hits.push(h);
      hits.sort((a, b) => a.distance - b.distance);
    }
    const list: Candidate[] = [];
    let blocker: THREE.Intersection | null = null;
    for (const h of hits) {
      const tag = h.object.userData.shot as ShotTag | undefined;
      if (tag) {
        if (!tag.owner.removed) list.push({ intersection: h, tag });
      } else {
        blocker = h;
        break; // everything beyond a wall is hidden
      }
    }
    return { list, blocker };
  }

  private firePellet(x: number, y: number, def: WeaponDef, allowAssist: boolean): ShotOutcome | null {
    const w = this.world;
    this.setRay(x, y, def.spread);
    let { list, blocker } = this.cast();
    let assisted = false;

    if (list.length === 0 && allowAssist && w.settings.aimAssist) {
      const found = this.assist(x, y);
      if (found) {
        list = [found];
        blocker = null;
        assisted = true;
      }
    }

    if (list.length === 0) {
      this.impactWorld(blocker);
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

  /** Probe rings of rays around the tap for a nearby hostile/pickup (never civilians). */
  private assist(x: number, y: number): Candidate | null {
    for (const r of ASSIST_RINGS) {
      let best: Candidate | null = null;
      for (let i = 0; i < ASSIST_SAMPLES; i++) {
        const a = (i / ASSIST_SAMPLES) * Math.PI * 2 + (r % 2) * 0.4;
        this.setRay(x + Math.cos(a) * r, y + Math.sin(a) * r, 0);
        const { list } = this.cast();
        const first = list[0];
        if (!first) continue;
        if (!first.tag.owner.assistable) continue;
        if (!best || first.intersection.distance < best.intersection.distance) best = first;
      }
      if (best) {
        // Re-aim the ray at the found point so FX/knockback directions are right.
        raycaster.ray.direction.copy(best.intersection.point).sub(this.world.camera.position).normalize();
        return best;
      }
    }
    // Restore the centre ray for world impacts.
    this.setRay(x, y, 0);
    return null;
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

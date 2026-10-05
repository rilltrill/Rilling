import * as THREE from 'three';
import { Bloater, Brute, Crawler, Runner, Spitter, Walker } from '../../enemies/zombies';
import type { EnemyState } from '../../../gameplay/Enemy';
import type { EntryKind, V3 } from '../../../core/types';
import { RailRig } from '../../../gameplay/RailRig';
import type { Entity, ShotHit, ShotOutcome } from '../../../gameplay/Entity';
import type { ShotTag } from '../../../gameplay/Shootables';
import type { World } from '../../../gameplay/World';
import { Kit } from '../../kit/ModelKit';
import { PART_MULT } from '../../../core/types';
import { Civilian } from '../../../gameplay/Civilian';
import { clamp } from '../../../core/math';
import { registerEnemy } from '../../registry';
import { Mat } from '../../../gameplay/pixel/materials';
import { PART, PF } from '../../../gameplay/pixel/figure';

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _f = new THREE.Vector3();
const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _o = new THREE.Vector3();
const _a = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _targets: THREE.Object3D[] = [];
const _hits: THREE.Intersection[] = [];

/**
 * The truck's twin gun is locked out (overheated, ~1.1 s to cool). The World vents
 * it when a BOSS ring opens; the finale's own attackers do the same job by holding
 * their ring while it cools: a ring only counts down while the player can fire, so
 * no hit here ever rides on a lockout — the pressure is the rings, not the heat.
 */
function gunLocked(w: World): boolean {
  return w.weapons.overheated;
}

/**
 * Emergency vent (as World.checkBossWindup does for a boss ring): an attack that
 * can't hold still once it is under way — a crawler in mid-leap, the giant's
 * thrown car — vents an overheated or nearly overheated twin gun as it sets off,
 * so the gun fires through the whole flight (from the 35 % vent level it takes
 * ~1.5–2.2 s of flat-out fire to lock again). No-op for a cool barrel.
 */
export function ventGun(w: World) {
  if (w.weapons.active !== 'turret') return;
  const locked = w.weapons.overheated;
  if (w.weapons.vent()) {
    w.audio.play('reload_done', { volume: 0.5, pitch: 0.8 });
    if (locked) w.hud.prompt(null);
  }
}

/**
 * The finale's walkers, bloaters and spitters: the roster ones, with the same
 * guarantee as every other attacker out here — the ring holds while the twin
 * gun is locked out (gunLocked). A spitter's glob, which can't hold still in
 * mid-air, vents a hot gun as it is spat (ventGun) instead.
 */
export class FinaleWalker extends Walker {
  protected override windupUpdate(dt: number) {
    if (gunLocked(this.world)) this.stateTime = Math.max(0, this.stateTime - dt);
    super.windupUpdate(dt);
  }
}

export class FinaleBloater extends Bloater {
  protected override windupUpdate(dt: number) {
    if (gunLocked(this.world)) this.stateTime = Math.max(0, this.stateTime - dt);
    super.windupUpdate(dt);
  }
}

export class FinaleSpitter extends Spitter {
  protected override windupUpdate(dt: number) {
    if (gunLocked(this.world)) this.stateTime = Math.max(0, this.stateTime - dt);
    super.windupUpdate(dt);
  }

  protected override strike() {
    super.strike();
    ventGun(this.world);
  }
}

/**
 * A spitter perched on the overpass deck. Same model, hit zones and bile
 * attack as the roster spitter, but it never walks off its ledge: it holds
 * position, turns to face the truck and spits whenever it is on screen.
 * Its "ground" is the deck, so a killed spitter collapses up there instead of
 * dropping through the concrete to the road.
 */
export class DeckSpitter extends FinaleSpitter {
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
    // Never start an attack the player can't see (covers advance → windup and recover → windup)
    // or can't shoot: a brute or another runner standing in the line of fire sends it sidestepping.
    if (s === 'windup' && this.state !== 'dying' && (!this.framed() || !this.clearShot())) s = 'advance';
    super.setState(s);
  }

  /** The ring holds (crouched, ready) while the twin gun is locked out — see gunLocked(). */
  protected override windupUpdate(dt: number) {
    if (gunLocked(this.world)) this.stateTime = Math.max(0, this.stateTime - dt);
    super.windupUpdate(dt);
  }

  // ─── Line of fire ──────────────────────────────────────────────────────────

  private clearAge = -1;
  private clearOk = true;
  /** After a refused windup: the side of the band to step to (±1) and for how long. */
  private dodgeSide = 0;
  private dodgeT = 0;

  /**
   * Can the player hit it? A camera ray to the chest or to the head must reach
   * this runner before any other shootable (a landed brute, a runner in front)
   * or a wall. Throttled to 10 Hz; reuses module scratch arrays. When blocked
   * it picks the side of the middle band away from the blocker to step to.
   */
  protected clearShot(): boolean {
    if (this.age - this.clearAge < 0.1) return this.clearOk;
    this.clearAge = this.age;
    const w = this.world;
    _o.setFromMatrixPosition(w.camera.matrixWorld);
    const targets = w.shootables.active(_targets);
    const occ = w.env?.occluders;
    let blocker: Entity | null = null;
    let ok = false;
    for (let i = 0; i < 2 && !ok; i++) {
      const obj = i === 0 ? this.anchor : this.headAnchor;
      if (!obj) continue;
      obj.getWorldPosition(_a);
      const dist = _a.distanceTo(_o);
      if (dist < 0.2) continue;
      _ray.ray.origin.copy(_o);
      _ray.ray.direction.subVectors(_a, _o).multiplyScalar(1 / dist);
      _ray.near = 0;
      _ray.far = dist + 0.5;
      _hits.length = 0;
      _ray.intersectObjects(targets, false, _hits);
      let first: Entity | null = null;
      for (const h of _hits) {
        const tag = h.object.userData.shot as ShotTag | undefined;
        if (!tag || tag.owner.removed) continue;
        first = tag.owner;
        break;
      }
      if (first && first !== this) {
        blocker = first;
        continue;
      }
      if (occ && occ.length) {
        _ray.far = dist;
        _hits.length = 0;
        _ray.intersectObjects(occ, true, _hits);
        let wall = false;
        for (const h of _hits) {
          if (!h.object.userData.shot) {
            wall = true;
            break;
          }
        }
        if (wall) continue;
      }
      ok = true;
    }
    _hits.length = 0;
    this.clearOk = ok;
    if (!ok) {
      // Step to the far side of the band from whatever is in the way (a wall: through the middle).
      this.anchor.getWorldPosition(_a).project(w.camera);
      const mine = _a.x;
      let away = mine >= 0 ? 1 : -1;
      if (blocker) {
        blocker.root.getWorldPosition(_a).project(w.camera);
        away = mine >= _a.x ? 1 : -1;
      } else away = -away;
      this.dodgeSide = away;
      this.dodgeT = 0.9;
    }
    return ok;
  }

  protected override advanceUpdate(dt: number) {
    const v = this.viewOffset();
    const framed = this.framed(); // (leaves the chest's NDC in _n)
    const near = this.distToPlayer <= this.attackRange + 0.9;
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      if (near && v.ahead >= this.attackRange * 0.75) {
        // Sidestep into the clear part of the middle band (NDC x ≈ ±0.17 at the stand-off).
        const cam = this.world.camera;
        const half = this.attackRange * cam.aspect * Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
        const side = this.dodgeSide * 0.17 * half;
        this.playerPos(_p);
        _t.set(_p.x + _f.x * this.attackRange - _f.z * side, this.root.position.y, _p.z + _f.z * this.attackRange + _f.x * side);
        const rem = this.moveToward(_t, this.speed * 0.85, dt);
        this.separate(dt);
        this.faceToward(_p, dt);
        if (rem > 0.08) return;
        this.dodgeT = 0;
      }
    }
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
 * THE PINCER (finale). Pack runners leap aboard over the tailgate, creep along
 * both flanks of the truck just outside the camera's field of view and wait
 * there for the rest of their pack; then, with a shriek, they come round both
 * sides together and attack at once. Each still starts its warning ring only
 * once framed in the middle band (TruckRunner), so every attack stays visible
 * and shootable — the test is answering two or three rings in quick order.
 *
 *   opts.pack  pack id: spawns sharing it rush together
 *   opts.wait  max seconds a staged runner waits for its pack (default 3)
 *   opts.side  force the flank to stage on (−1 left, 1 right); by default the
 *              side it landed on — but never the side a civilian stands on, so
 *              the rush never comes in across a survivor's line of fire
 *   opts.cue   'brute': hold the rush until the fight's brute vaults in (or has
 *              been killed) — the pack comes round with it and its rings land
 *              alongside the smash, while you're busy with the big one
 */
export class PackRunner extends TruckRunner {
  private packId = '';
  private waitMax = 3;
  private waitT = 0;
  private side = 0;
  private cue = '';
  private sawBrute = false;
  /** In position beside the truck, out of view. */
  staged = false;
  /** Rushing: plain truck-runner AI from here on (after rounding the front corner). */
  released = false;
  private rushing = false;

  override onAdded(): void {
    super.onAdded();
    const id = this.spawn.opts.pack;
    this.packId = typeof id === 'string' || typeof id === 'number' ? String(id) : '';
    if (typeof this.spawn.opts.wait === 'number') this.waitMax = this.spawn.opts.wait;
    if (this.spawn.opts.side === 1 || this.spawn.opts.side === -1) this.side = this.spawn.opts.side;
    if (typeof this.spawn.opts.cue === 'string') this.cue = this.spawn.opts.cue;
    if (!this.packId) this.released = true;
  }

  /** Is a survivor standing out on this flank, in front of the player? */
  private civilianOn(side: number): boolean {
    if (this.frame !== 'world') return false;
    for (const e of this.world.entities) {
      if (!(e instanceof Civilian) || e.removed || e.rescued) continue;
      this.toView(e.root.position, _n);
      if (-_n.z > 0 && -_n.z < 16 && _n.x * side > 0.8) return true;
    }
    return false;
  }

  /** The rush's cue (see opts.cue). */
  private cued(): boolean {
    if (this.cue !== 'brute') return true;
    for (const e of this.world.enemies()) {
      if (!(e instanceof RiotBrute) || e.state === 'dying') continue;
      this.sawBrute = true;
      // It's coming over: rounding the truck takes the pack about as long as the vault and
      // the brute's last stomps, so their rings come in alongside its smash.
      return true;
    }
    // Already killed → go; not here yet → keep waiting (opts.wait caps it).
    return this.sawBrute;
  }

  /** A live member of this runner's pack (itself included). */
  private packmate(e: unknown): e is PackRunner {
    return e instanceof PackRunner && e.packId === this.packId && e.state !== 'dying' && !e.removed;
  }

  /** The pack goes: everyone rushes, the first one shrieks the warning. */
  private releasePack() {
    let first = true;
    for (const m of this.world.enemies()) if (this.packmate(m) && m.released) first = false;
    if (first) this.world.audio.play('runner_shriek', { volume: 1, pitch: 0.9, vary: 0.1 });
    for (const m of this.world.enemies()) {
      if (!this.packmate(m) || m.released) continue;
      m.released = true;
      m.rushing = true;
      m.speed *= 1.25;
    }
  }

  protected override advanceUpdate(dt: number) {
    if (this.released && !this.rushing) {
      super.advanceUpdate(dt);
      return;
    }
    const local = this.toView(this.root.position, _t);
    if (!this.side) {
      this.side = local.x >= 0 ? 1 : -1;
      if (this.civilianOn(this.side) && !this.civilianOn(-this.side)) this.side = -this.side;
    }
    if (!this.released) this.waitT += dt;
    if (local.x * this.side < 0.6 && -local.z < 2.4) {
      // On the other flank: cross over BEHIND the truck, out of view.
      if (local.z < 2.6) _t.set(local.x, 0, 3.2);
      else _t.set(this.side * 3.3, 0, 3.2);
      this.fromView(_t);
      this.moveToward(_t, this.speed, dt);
      this.separate(dt);
      return;
    }
    if (this.rushing) {
      // Round the front quarter of its own flank (never across the truck); the stock
      // truck-runner approach takes over once it is out in front.
      if (-local.z < 2.4) {
        _t.set(this.side * 1.7, 0, -3.2);
        this.fromView(_t);
        this.moveToward(_t, this.speed, dt);
        this.separate(dt);
        return;
      }
      this.rushing = false;
      super.advanceUpdate(dt);
      return;
    }
    // Staging spot (view space): beside the truck, a little ahead of the eye — ~70° off the
    // view axis, so hidden even on a wide phone screen.
    _t.set(this.side * 3.3, 0, -1.2);
    this.fromView(_t);
    const rem = this.moveToward(_t, this.speed, dt);
    this.separate(dt);
    if (rem < 0.6) this.staged = true;
    this.playerPos(_p);
    if (this.staged) this.faceToward(_p, dt);
    let ready = this.staged;
    for (const m of this.world.enemies()) {
      if (this.packmate(m) && (m.state === 'entry' || (!m.staged && !m.released))) ready = false;
    }
    // A brute cue overrides staging: whoever is still creeping round comes from where it is.
    const go = this.cued();
    if ((this.cue === 'brute' ? go : ready && go) || this.waitT > this.waitMax) this.releasePack();
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

/** Per-world teaching state for riot brutes: hints shown, headshots landed on them. */
const riotLesson = new WeakMap<World, { hints: number; headHits: number }>();
/** Share of a round's damage the riot plates still let through (they spark, dent and slowly give). */
export const RIOT_ARMOR_DENT = 0.65;
/** Glowing crack in the skull: the riot brute's tell, and where its smash ring sits. */
const BRAIN = 0xff6a5a;

/**
 * Finale brute. Same riot-armoured hulk, but the twin gun's light rounds can't
 * rock it: it shrugs off headshot staggers and only a heavy hit (≥ `heavyHit`,
 * e.g. a bomb blast) staggers it. Stock brutes flinch back on every headshot,
 * which a 14-rounds/s mounted gun turns into a permanent stun; this one keeps
 * coming, so it has to be focused down on its slow, stomping approach — and
 * once its fists go up (2 s ring) only killing it stops the smash.
 *
 * Readable counterplay: its skull is split open (a glowing crack — the tell
 * that sets it apart from the stock brute), its smash ring closes on the HEAD,
 * not on the armoured chest, and the first one (and the next ones, until the
 * player is landing headshots on them) pops "SHOOT THE HEAD!" clear of its
 * body. The plates still spark, but they dent: body fire wears it down at
 * `RIOT_ARMOR_DENT` of a round, the head takes ×2.5.
 */
export class RiotBrute extends Brute {
  private hitNow = false;
  private heavyNow = false;
  /** Centre of the head: the smash ring's anchor. */
  private ringAt!: THREE.Object3D;
  private hinted = false;

  protected override configure() {
    super.configure();
    // The ring hugs the head (the stock 0.85 m one around the chest framed the armour).
    this.telegraphRadius = 0.62;
  }

  protected override build() {
    super.build();
    const hs = this.b.hs;
    const head = this.r.head;
    this.ringAt = Kit.pivot(head, 0, 0.13 * hs, 0.02, 'ringAt');
    // Split skull: a glowing crack across the crown and down the brow (head hit zone).
    const glow = Kit.glow(BRAIN, 1.35);
    const crown = Kit.add(head, Kit.box(0.17 * hs, 0.05 * hs, 0.2 * hs), glow, 0.012, 0.262 * hs, 0.0, 0, 0, 0.1);
    const brow = Kit.add(head, Kit.box(0.045 * hs, 0.09 * hs, 0.02), glow, -0.02 * hs, 0.215 * hs, 0.125 * hs, 0, 0, 0.35);
    this.hitbox(crown, 'head');
    this.hitbox(brow, 'head');
    // ART: SPRITES — the glowing split skull (it teaches "shoot the head") over the brute's painting.
    const base = this.pose2d.extra;
    const gm = Mat.glow(BRAIN);
    this.pose2d.extra = (f) => {
      base?.(f);
      if (this.headless) return;
      f.layer(0.006, PART.HEAD, 0, -0.02);
      f.cone(f.at(head, -0.07 * hs, 0.255 * hs, 0.02), f.at(head, 0.095 * hs, 0.27 * hs, -0.02), 0.022, 0.018, gm).flag(PF.GLOW);
      f.cone(f.at(head, -0.005 * hs, 0.26 * hs, 0.125 * hs), f.at(head, -0.04 * hs, 0.17 * hs, 0.13 * hs), 0.016, 0.01, gm).flag(PF.GLOW).min(0.5);
    };
  }

  override onAdded(): void {
    super.onAdded();
    const w = this.world;
    if (!riotLesson.has(w)) riotLesson.set(w, { hints: 0, headHits: 0 });
    // No vault (a walk-on): teach as soon as it's in view.
    if (this.spawn.entry !== 'leap') w.later(0.8, () => this.hint());
  }

  /**
   * "SHOOT THE HEAD!" — positioned on the side of the screen away from the brute
   * (upper third), never across its body where the player has to aim. Shown for
   * the first riot brute and again for later ones until the player has been
   * landing headshots on them.
   */
  private hint() {
    if (this.hinted || this.state === 'dying' || this.removed) return;
    this.hinted = true;
    const w = this.world;
    const lesson = riotLesson.get(w);
    if (!lesson || (lesson.hints > 0 && (lesson.headHits >= 6 || lesson.hints >= 3))) return;
    lesson.hints++;
    const pop = () => {
      if (this.state === 'dying' || this.removed) return;
      const sp = this.screenPos(this.ringAt);
      const x = sp && sp.x > w.viewport.width * 0.5 ? 0.3 : 0.68;
      w.hud.popup('SHOOT THE HEAD!', w.viewport.width * x, w.viewport.height * 0.24, 'warning');
    };
    pop();
    w.later(1.0, pop);
  }

  /**
   * `opts.landAt` ([right, up, forward], rig-relative like a spawn position): a 'leap'
   * entry vaults whatever is in the way (car, median, sandbags) and lands there —
   * close in and near the middle of the view, where its smash ring will be.
   */
  protected override beginEntry(kind: EntryKind) {
    super.beginEntry(kind);
    const at = this.spawn.opts.landAt;
    if (kind !== 'leap' || !Array.isArray(at) || at.length !== 3) return;
    const v: V3 = [Number(at[0]), 0, Number(at[2])];
    if (this.frame === 'rig') RailRig.rel(v, this.entryTo);
    else this.world.rig.relToWorld(v, this.entryTo);
    this.entryTo.y = this.groundY(this.entryTo.x, this.entryTo.z);
  }

  /** A 300 kg landing: the truck rocks. */
  protected override onLand() {
    super.onLand();
    this.world.rig.shake(0.3);
    this.world.fx.dust(this.worldPos(_n), 1.6, 0x6a6058);
    this.world.audio.play('stomp', { volume: 1, pitch: 0.7, vary: 0.05 });
    this.hint();
  }

  override setState(s: EnemyState) {
    // The ring is drawn on the head: it may only open with the head in the play area.
    if (s === 'windup' && this.state !== 'dying' && this.ringAt && !this.inPlayArea(this.ringAt)) s = 'advance';
    super.setState(s);
    if (s === 'windup' && this.telegraph) this.telegraph.anchor = this.ringAt;
  }

  /** Fists stay up while the twin gun is locked out: the smash only counts down while you can fire back. */
  protected override windupUpdate(dt: number) {
    if (gunLocked(this.world)) this.stateTime = Math.max(0, this.stateTime - dt);
    super.windupUpdate(dt);
  }

  override onShot(hit: ShotHit): ShotOutcome {
    this.hitNow = true;
    this.heavyNow = hit.damage * (PART_MULT[hit.part] ?? 1) >= this.heavyHit;
    try {
      const out = super.onShot(hit);
      if (hit.part === 'head' && out.kind === 'enemy') {
        const lesson = riotLesson.get(this.world);
        if (lesson) lesson.headHits++;
      }
      if (out.kind === 'armor' && hit.part === 'armor' && this.state !== 'dying' && RIOT_ARMOR_DENT > 0) {
        // The plate dents: a sliver of the round gets through (sparks + clank already played).
        this.hp -= hit.damage * RIOT_ARMOR_DENT;
        this.kTorso = Math.max(this.kTorso, 0.4);
        if (this.hp <= 0) {
          this.die(hit);
          return { kind: 'enemy', counts: true, killed: true };
        }
      }
      return out;
    } finally {
      this.hitNow = false;
    }
  }

  override stagger() {
    if (this.hitNow && !this.heavyNow) return;
    super.stagger();
  }
}

/**
 * Roadside zombies (world frame) the truck drives past: targets of
 * opportunity. They never START an attack while the truck is moving — the
 * strike would land seconds later with the truck long gone — but they attack
 * normally once it stops.
 */
export class RoadsideWalker extends FinaleWalker {
  override setState(s: EnemyState) {
    if (s === 'windup' && this.world.rig.moving) s = 'advance';
    super.setState(s);
  }
}

/** Crawler.COIL (private in the roster): the crouch before the leap. */
const CRAWLER_COIL = 0.8;

/**
 * The finale's crawler. Same pounce (0.8 s coil + leap, ring on the head), but
 * the coil holds while the twin gun is locked out (gunLocked), and the leap
 * itself — which can't freeze in mid-air — vents a hot gun as it springs
 * (ventGun): the whole ring is answerable, never eaten by an overheat.
 */
export class FinaleCrawler extends Crawler {
  protected override customUpdate(dt: number) {
    if (this.state === 'pounce') {
      const before = this.stateTime - dt;
      if (before < CRAWLER_COIL) {
        if (gunLocked(this.world)) this.stateTime = Math.max(0, before);
        else if (this.stateTime >= CRAWLER_COIL) ventGun(this.world);
      }
    }
    super.customUpdate(dt);
  }
}

export class RoadsideCrawler extends FinaleCrawler {
  override setState(s: EnemyState) {
    if ((s === 'windup' || s === 'pounce') && this.world.rig.moving) s = 'advance';
    super.setState(s);
  }
}

registerEnemy('finale_walker', (w, s) => new FinaleWalker(w, s));
registerEnemy('finale_bloater', (w, s) => new FinaleBloater(w, s));
registerEnemy('finale_spitter', (w, s) => new FinaleSpitter(w, s));
registerEnemy('deck_spitter', (w, s) => new DeckSpitter(w, s));
registerEnemy('roadside_walker', (w, s) => new RoadsideWalker(w, s));
registerEnemy('roadside_crawler', (w, s) => new RoadsideCrawler(w, s));
registerEnemy('finale_crawler', (w, s) => new FinaleCrawler(w, s));
registerEnemy('truck_runner', (w, s) => new TruckRunner(w, s));
registerEnemy('tail_runner', (w, s) => new TailRunner(w, s));
registerEnemy('riot_brute', (w, s) => new RiotBrute(w, s));
registerEnemy('pack_runner', (w, s) => new PackRunner(w, s));

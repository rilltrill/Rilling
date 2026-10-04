import * as THREE from 'three';
import { EventBus } from '../core/EventBus';
import { Rng } from '../core/Rng';
import type { PickupKind, Settings } from '../core/types';
import type { AudioSystem } from '../audio/Audio';
import { Fx } from '../fx/Fx';
import { RailRig } from './RailRig';
import { Shootables } from './Shootables';
import { Player } from './Player';
import { Scoring } from './Scoring';
import { WeaponSystem } from './Weapons';
import type { Entity, ShotHit } from './Entity';
import { Enemy } from './Enemy';
import type { Boss } from './Boss';
import type { Civilian } from './Civilian';
import { Projectile } from './Projectile';
import type { Beat, Environment, StageDef } from './StageTypes';
import { haptic } from '../core/Haptics';

export type PopupStyle = 'points' | 'headshot' | 'pickup' | 'combo' | 'warning' | 'penalty' | 'rescue';
export type HitMarkerKind = 'hit' | 'head' | 'kill' | 'armor' | 'penalty';

/** What the gameplay needs from the HUD (implemented in ui/Hud.ts). */
export interface HudApi {
  popup(text: string, x: number, y: number, style: PopupStyle): void;
  banner(text: string, sub?: string, duration?: number): void;
  damage(): void;
  splat(color: number): void;
  flash(color?: string, duration?: number): void;
  hitMarker(x: number, y: number, kind: HitMarkerKind): void;
  shotFired(x: number, y: number): void;
  prompt(text: string | null): void;
  /** WARNING band + name slam for a boss (or a boss's second form). */
  bossIntro?(title: string): void;
}

export interface WorldEvents {
  /** A trigger pull; x/y = tap position in client pixels. */
  shot: { hit: boolean; x: number; y: number };
  kill: { enemy: Enemy; headshot: boolean; points: number };
  'player-hurt': { amount: number; hp: number; source: string; from?: Entity };
  'player-heal': { hp: number };
  'player-dead': Record<string, never>;
  pickup: { kind: PickupKind };
  'civilian-shot': Record<string, never>;
  'civilian-rescued': Record<string, never>;
  'boss-start': { boss: Boss };
  'boss-dead': { boss: Boss };
  beat: { index: number; beat: Beat };
  'stage-clear': Record<string, never>;
}

const _v = new THREE.Vector3();
export const MAX_ATTACKERS = 3;
/** Max non-boss death animations rendering at once (newest kept). */
export const MAX_CORPSES = 7;

/**
 * One play-through of one stage: the scene graph, every live entity and all
 * gameplay systems. Created fresh per stage and disposed afterwards.
 */
export class World {
  readonly scene = new THREE.Scene();
  readonly events = new EventBus<WorldEvents>();
  readonly shootables = new Shootables();
  readonly entities: Entity[] = [];
  readonly rig: RailRig;
  readonly fx = new Fx();
  readonly player = new Player();
  readonly score = new Scoring();
  readonly weapons = new WeaponSystem();
  readonly rng: Rng;
  env: Environment | null = null;
  stage: StageDef | null = null;
  boss: Boss | null = null;
  /** Free attack slots — at most MAX_ATTACKERS enemies wind up at once (fairness on small screens). */
  attackSlots = MAX_ATTACKERS;
  /** Scaled game time (seconds). */
  time = 0;
  /** Global time multiplier (debug ?speed=, slow-mo). */
  timeScale = 1;
  viewport = { width: 1, height: 1 };
  private slowMoT = 0;
  private slowMoScale = 1;
  private hitStopT = 0;
  private enemyCache: Enemy[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private lastHurtFrom: Entity | null = null;
  private lowHpBeat = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    readonly audio: AudioSystem,
    readonly hud: HudApi,
    readonly settings: Settings,
    seed = 1337,
  ) {
    this.rng = new Rng(seed);
    this.rig = new RailRig(camera);
    this.scene.add(this.rig.space, this.rig.viewModelHolder, this.fx.group);
    this.fx.groundAt = (x, z) => this.groundAt(x, z);
    this.fx.attachCamera(camera);
    this.fx.screen.splat = (c) => this.hud.splat(c);
    this.player.hooks = {
      hurt: (amount, hp, source) => {
        const from = this.lastHurtFrom ?? undefined;
        this.lastHurtFrom = null;
        this.score.breakCombo();
        this.rig.shake(0.6);
        this.hud.damage();
        this.audio.play('player_hurt');
        this.haptic(120);
        this.events.emit('player-hurt', { amount, hp, source, from });
      },
      heal: (_a, hp) => this.events.emit('player-heal', { hp }),
      dead: () => this.events.emit('player-dead', {}),
    };
  }

  // ─── Entities ─────────────────────────────────────────────────────────────

  add<T extends Entity>(e: T): T {
    this.entities.push(e);
    if (e.frame === 'rig') this.rig.space.add(e.root);
    else this.scene.add(e.root);
    e.onAdded();
    if (e instanceof Enemy) this.enemyCache.push(e);
    return e;
  }

  /** Live enemies (including bosses and dying ones). Cached per frame — don't mutate. */
  enemies(): readonly Enemy[] {
    return this.enemyCache;
  }

  /** Hostile entities still alive (enemies + projectiles). */
  hostileCount(): number {
    let n = 0;
    for (const e of this.entities) if (e.hostile && !e.removed) n++;
    return n;
  }

  groundAt(x: number, z: number): number {
    return this.env?.groundAt?.(x, z) ?? 0;
  }

  // ─── Gameplay hooks ───────────────────────────────────────────────────────

  /** Damage the player. Pass the attacking entity so the HUD can point at it. */
  hurtPlayer(amount: number, source: string, from?: Entity): boolean {
    this.lastHurtFrom = from ?? null;
    const landed = this.player.hurt(amount, source);
    this.lastHurtFrom = null;
    return landed;
  }

  onEnemyKilled(enemy: Enemy, hit: ShotHit | null) {
    const headshot = hit?.part === 'head';
    const pts = this.score.kill(enemy.points, headshot);
    let x = hit?.screenX;
    let y = hit?.screenY;
    if (x === undefined || y === undefined) {
      const sp = enemy.screenPos();
      x = sp?.x ?? this.viewport.width / 2;
      y = sp?.y ?? this.viewport.height / 2;
    }
    this.hud.popup(`+${pts}`, x, y - 24, 'points');
    if (headshot) {
      this.hud.popup('HEADSHOT', x, y - 56, 'headshot');
      this.hitStop(0.035);
    }
    this.events.emit('kill', { enemy, headshot, points: pts });
  }

  onCivilianShot(_c: Civilian, hit: ShotHit) {
    this.score.civiliansShot++;
    this.score.breakCombo();
    const lost = this.score.add(-1000, false);
    this.hud.popup("DON'T SHOOT CIVILIANS!", hit.screenX, hit.screenY - 40, 'penalty');
    this.hud.popup(`${lost}`, hit.screenX, hit.screenY, 'penalty');
    this.audio.play('civilian_shot');
    this.player.invuln = 0;
    this.hurtPlayer(1, 'civilian');
    this.events.emit('civilian-shot', {});
  }

  onCivilianRescued(c: Civilian) {
    this.score.rescues++;
    const pts = this.score.add(1500, false);
    const sp = (() => {
      c.root.getWorldPosition(_v);
      _v.y += 1.9;
      _v.project(this.camera);
      return { x: (_v.x * 0.5 + 0.5) * this.viewport.width, y: (-_v.y * 0.5 + 0.5) * this.viewport.height };
    })();
    this.hud.popup('RESCUED!', sp.x, sp.y - 30, 'rescue');
    this.hud.popup(`+${pts}`, sp.x, sp.y, 'points');
    this.audio.play('civilian_saved');
    // Grateful survivors sometimes hand over a first-aid kit.
    if (this.player.hp < this.player.maxHp && this.rng.chance(0.5)) {
      this.player.heal(1);
      this.hud.popup('+1 LIFE', sp.x, sp.y + 30, 'pickup');
      this.audio.play('pickup_health');
    }
    this.events.emit('civilian-rescued', {});
  }

  /** Slow motion for `duration` seconds of real time. */
  slowMo(scale: number, duration: number) {
    this.slowMoScale = scale;
    this.slowMoT = duration;
  }

  /** Freeze-frame for impact. */
  hitStop(duration: number) {
    this.hitStopT = Math.max(this.hitStopT, duration);
  }

  haptic(ms: number) {
    if (this.settings.haptics) haptic(ms);
  }

  /**
   * Explosion at a world point: FX, sound, shake, and damage to enemies and other
   * destructibles within `radius` (falls off with distance). Never hurts the player.
   */
  /** Where/when the most recent explosion happened (enemies fall away from it). */
  readonly lastExplosion = { point: new THREE.Vector3(), time: -1 };

  explode(point: THREE.Vector3, radius: number, damage: number) {
    this.lastExplosion.point.copy(point);
    this.lastExplosion.time = this.time;
    this.fx.explosion(point, Math.min(2, radius / 3.5));
    this.audio.play('explosion', { vary: 0.15 });
    const camDist = point.distanceTo(this.camera.position);
    this.rig.shake(Math.max(0.15, 0.8 - camDist / 30));
    this.haptic(80);
    for (const e of [...this.entities]) {
      if (e.removed) continue;
      e.root.getWorldPosition(_v);
      const d = _v.distanceTo(point);
      if (d > radius) continue;
      const amount = damage * (1 - (d / radius) * 0.6);
      if (e instanceof Enemy) {
        // Dying or already-leaving (non-hostile) enemies can't be farmed for points.
        if (e.state === 'dying' || (!e.hostile && !e.isBoss)) continue;
        if (e.isBoss) {
          e.hp -= Math.min(amount, e.maxHp * 0.05);
          e.flash(true);
          if (e.hp <= 0) e.die(null);
        } else {
          e.hp -= amount;
          if (e.hp <= 0) e.die(null);
          else e.stagger();
        }
      } else if (typeof (e as { destroy?: unknown }).destroy === 'function') {
        // Chain reaction into other destructibles (slight delay feels better).
        this.later(0.12, () => (e as unknown as { destroy(): void }).destroy());
      }
    }
  }

  /** Run `fn` after `delay` seconds of GAME time (pauses with the game). */
  later(delay: number, fn: () => void) {
    this.timers.push({ at: this.time + delay, fn });
  }

  /** Screen-clearing bomb. Returns false if none left. */
  useBomb(): boolean {
    if (this.player.bombs <= 0) return false;
    this.player.bombs--;
    this.audio.play('bomb');
    this.hud.flash('#fff6d0', 0.5);
    this.rig.shake(1);
    this.haptic(250);
    this.camera.getWorldDirection(_v).multiplyScalar(8).add(this.camera.position);
    this.fx.explosion(_v, 2.2);
    for (const e of [...this.entities]) {
      if (e.removed || !e.hostile) continue;
      if (e instanceof Enemy) {
        if (e.distToPlayer > 45) continue;
        if (e.isBoss) {
          e.hp -= e.maxHp * 0.08;
          e.flash(true);
          if (e.hp <= 0) e.die(null);
        } else {
          e.die(null);
        }
      } else if (e instanceof Projectile) {
        e.removed = true;
        e.root.getWorldPosition(_v);
        this.fx.explosion(_v, 0.5);
      }
    }
    return true;
  }

  // ─── Frame update ─────────────────────────────────────────────────────────

  /** Advance the world. `realDt` is unscaled seconds. Returns the scaled dt used. */
  update(realDt: number): number {
    let scale = this.timeScale;
    if (this.slowMoT > 0) {
      this.slowMoT -= realDt;
      // Hold the slow-mo, then ease back to full speed over the last 0.3 s.
      const k = Math.min(1, Math.max(0, this.slowMoT) / 0.3);
      scale *= 1 + (this.slowMoScale - 1) * k;
    }
    if (this.hitStopT > 0) {
      this.hitStopT -= realDt;
      scale *= 0.05;
    }
    const dt = realDt * scale;
    this.time += dt;
    this.score.time += dt;

    this.player.update(dt);
    this.weapons.update(dt);
    this.rig.update(dt);
    this.env?.update?.(dt, this);

    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (!e.removed) e.update(dt);
    }
    // Sweep removed entities.
    let removedAny = false;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.removed) {
        e.dispose();
        this.entities.splice(i, 1);
        removedAny = true;
        if (e === this.boss) this.boss = null;
      }
    }
    if (removedAny) this.enemyCache = this.enemyCache.filter((e) => !e.removed);
    // Corpse budget: death animations keep full draw cost, so when waves die fast
    // the oldest bodies leave early instead of stacking up.
    let dying = 0;
    for (let i = this.enemyCache.length - 1; i >= 0; i--) {
      const e = this.enemyCache[i];
      if (e.isBoss || e.state !== 'dying' || e.removed) continue;
      if (++dying > MAX_CORPSES) e.removed = true;
    }
    // Recount attack slots from scratch each frame so removed enemies can never leak one.
    let inUse = 0;
    for (const e of this.enemyCache) if (e.holdsSlot && !e.removed && e.state !== 'dying') inUse++;
    this.attackSlots = Math.max(0, MAX_ATTACKERS - inUse);

    this.fx.update(dt);

    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) t.fn();
      }
    }

    // Low health heartbeat.
    if (this.player.hp === 1 && !this.player.dead) {
      this.lowHpBeat -= realDt;
      if (this.lowHpBeat <= 0) {
        this.lowHpBeat = 1.1;
        this.audio.play('heartbeat', { volume: 0.7 });
      }
    }
    return dt;
  }

  dispose() {
    this.timers = [];
    for (const e of this.entities) e.dispose();
    this.entities.length = 0;
    this.enemyCache = [];
    this.shootables.clear();
    this.env?.dispose?.();
    this.fx.dispose();
    this.events.clear();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !m.geometry.userData?.shared) m.geometry.dispose?.();
    });
    this.scene.clear();
  }
}

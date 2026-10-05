import type { WeaponId } from '../core/types';
import type { SfxName } from '../audio/names';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Rounds per magazine (Infinity for heat-based weapons). */
  mag: number;
  /** Seconds between shots. */
  interval: number;
  /** Fires continuously while the finger is held. */
  auto: boolean;
  /** Semi-auto weapons still repeat while held, at this slower interval (mobile comfort). */
  holdInterval?: number;
  pellets: number;
  /** Cone half-angle in radians. */
  spread: number;
  /** Damage per pellet. */
  damage: number;
  reloadTime: number;
  /** Bullets continue through targets (magnum). */
  pierce?: number;
  /** Heat per shot (0..1) for overheat weapons. */
  heatPerShot?: number;
  /** Ammo given by a pickup. */
  pickupAmmo: number;
  sfx: SfxName;
  /** Screen-shake per shot. */
  shake: number;
  /** HUD colour. */
  color: string;
}

/** Longest frame (s) of cooldown overshoot carried into the next held auto shot. */
const COOLDOWN_CARRY = 0.05;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol', name: 'PISTOL', mag: 8, interval: 0.11, auto: false, holdInterval: 0.26,
    pellets: 1, spread: 0.004, damage: 1, reloadTime: 0.85, pickupAmmo: 0,
    sfx: 'pistol', shake: 0.08, color: '#e8e8e8',
  },
  shotgun: {
    id: 'shotgun', name: 'SHOTGUN', mag: 6, interval: 0.42, auto: false, holdInterval: 0.55,
    pellets: 8, spread: 0.055, damage: 0.65, reloadTime: 1.25, pickupAmmo: 24,
    sfx: 'shotgun', shake: 0.3, color: '#ffb347',
  },
  smg: {
    id: 'smg', name: 'SMG', mag: 32, interval: 1 / 12, auto: true,
    pellets: 1, spread: 0.018, damage: 0.55, reloadTime: 1.1, pickupAmmo: 128,
    sfx: 'smg', shake: 0.06, color: '#7fd3ff',
  },
  magnum: {
    id: 'magnum', name: 'MAGNUM', mag: 6, interval: 0.3, auto: false, holdInterval: 0.42,
    pellets: 1, spread: 0.002, damage: 4, reloadTime: 1.35, pierce: 3, pickupAmmo: 18,
    sfx: 'magnum', shake: 0.35, color: '#ff6b6b',
  },
  turret: {
    id: 'turret', name: 'MOUNTED GUN', mag: Infinity, interval: 1 / 12, auto: true,
    pellets: 1, spread: 0.014, damage: 0.8, reloadTime: 0, heatPerShot: 0.03, pickupAmmo: 0,
    sfx: 'turret', shake: 0.07, color: '#b6ff6b',
  },
};

/** Heat level an overheated gun must cool to before it fires again (also the vent level). */
export const VENT_LEVEL = 0.35;
/** Pause in firing (s) after which heat starts to dissipate, and the rate (heat/s) it does so. */
const FEATHER_DELAY = 0.12;
const FEATHER_COOL = 1.0;

export interface AmmoState {
  inMag: number;
  /** Rounds in reserve (Infinity for the pistol). */
  reserve: number;
}

export type FireResult =
  | { ok: true; def: WeaponDef }
  | { ok: false; reason: 'cooldown' | 'empty' | 'reloading' | 'overheated' };

/**
 * Weapon inventory, ammo, reloads and turret heat. Pure logic — no rendering.
 * The pistol is always available with infinite reserve; pickups add other
 * guns with limited ammo, and when one runs dry the player drops back to the
 * pistol automatically.
 */
export class WeaponSystem {
  current: WeaponId = 'pistol';
  /** Weapon forced by the stage (e.g. vehicle turret). */
  override: WeaponId | null = null;
  readonly ammo = new Map<WeaponId, AmmoState>();
  reloading = 0;
  reloadTotal = 0;
  heat = 0;
  overheated = false;
  private cooldown = 0;
  /** Seconds since the last successful shot (heat only dissipates when not firing). */
  private sinceShot = 0;
  /** Seconds since the last emergency vent (see `vent`). */
  private sinceVent = Infinity;
  /** Called when the weapon automatically changes (ran out of ammo). */
  onChange: (id: WeaponId) => void = () => {};
  onReloadDone: () => void = () => {};

  constructor() {
    this.ammo.set('pistol', { inMag: WEAPONS.pistol.mag, reserve: Infinity });
    this.ammo.set('turret', { inMag: Infinity, reserve: Infinity });
  }

  get active(): WeaponId {
    return this.override ?? this.current;
  }

  get def(): WeaponDef {
    return WEAPONS[this.active];
  }

  get state(): AmmoState {
    return this.ammo.get(this.active)!;
  }

  /** Weapons the player can cycle through (excluding stage overrides). */
  get owned(): WeaponId[] {
    return (['pistol', 'shotgun', 'smg', 'magnum'] as WeaponId[]).filter((w) => {
      const a = this.ammo.get(w);
      return !!a && (w === 'pistol' || a.inMag + a.reserve > 0);
    });
  }

  give(id: WeaponId, rounds = WEAPONS[id].pickupAmmo) {
    const def = WEAPONS[id];
    const a = this.ammo.get(id);
    if (a) {
      a.reserve += rounds;
    } else {
      const inMag = Math.min(def.mag, rounds);
      this.ammo.set(id, { inMag, reserve: rounds - inMag });
    }
    if (!this.override) this.select(id);
  }

  select(id: WeaponId) {
    if (!this.ammo.has(id)) return;
    if (this.current !== id) {
      this.current = id;
      this.reloading = 0;
      this.cooldown = Math.max(this.cooldown, 0.15);
      this.onChange(id);
    }
  }

  cycle() {
    const list = this.owned;
    const i = list.indexOf(this.current);
    this.select(list[(i + 1) % list.length]);
  }

  setOverride(id: WeaponId | null) {
    this.override = id;
    this.reloading = 0;
    this.heat = 0;
    this.overheated = false;
    this.onChange(this.active);
  }

  canFire(): boolean {
    return this.cooldown <= 0 && this.reloading <= 0 && !this.overheated && this.state.inMag > 0;
  }

  /**
   * Attempt to fire. `held` = this shot comes from holding the finger down
   * (semi-auto guns use their slower holdInterval).
   */
  tryFire(held = false): FireResult {
    const def = this.def;
    if (this.overheated) return { ok: false, reason: 'overheated' };
    if (this.reloading > 0) return { ok: false, reason: 'reloading' };
    if (this.cooldown > 0) return { ok: false, reason: 'cooldown' };
    const st = this.state;
    if (st.inMag <= 0) return { ok: false, reason: 'empty' };
    if (st.inMag !== Infinity) st.inMag--;
    this.sinceShot = 0;
    if (def.auto && held && this.cooldown < 0) {
      // Sustained auto fire keeps the part of the last frame already waited past
      // the ready point, so the rate is the weapon's, not the screen's (30/60/120 Hz).
      this.cooldown += def.interval;
    } else {
      this.cooldown = held && !def.auto ? def.holdInterval ?? def.interval : def.interval;
    }
    if (def.heatPerShot) {
      this.heat = Math.min(1, this.heat + def.heatPerShot);
      if (this.heat >= 1) this.overheated = true;
    }
    return { ok: true, def };
  }

  /**
   * Emergency vent for heat weapons: drop the heat to the 35% re-arm level and
   * clear an overheat lockout. Called by the World when a boss starts winding
   * up an attack, so holding the trigger never leaves you locked out for the
   * whole telegraph (the ~1.1 s lockout would otherwise eat most of a boss
   * windup). Returns true when it actually changed something (feedback cue).
   */
  vent(): boolean {
    if (this.def.heatPerShot === undefined) return false;
    const was = this.overheated || this.heat > VENT_LEVEL + 0.15;
    this.heat = Math.min(this.heat, VENT_LEVEL);
    this.overheated = false;
    if (was) this.sinceVent = 0;
    return was;
  }

  /** True for a moment after `vent()` released pressure (HUD/stage view-models can puff steam). */
  get venting(): boolean {
    return this.sinceVent < 0.6;
  }

  /** Begin reloading. Returns false when nothing to do. */
  reload(): boolean {
    const def = this.def;
    const st = this.state;
    if (def.mag === Infinity || this.reloading > 0) return false;
    if (st.inMag >= def.mag || st.reserve <= 0) return false;
    this.reloading = def.reloadTime;
    this.reloadTotal = def.reloadTime;
    return true;
  }

  /** True when the current weapon is out of rounds in the magazine. */
  get empty(): boolean {
    return this.state.inMag <= 0;
  }

  update(dt: number) {
    // May dip below 0 by up to one frame (see tryFire's carry-over for held auto fire).
    this.cooldown = Math.max(-COOLDOWN_CARRY, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const def = this.def;
        const st = this.state;
        const need = def.mag - st.inMag;
        const take = Math.min(need, st.reserve);
        st.inMag += take;
        if (st.reserve !== Infinity) st.reserve -= take;
        this.onReloadDone();
      }
    }
    // Heat only dissipates during a pause in firing (so sustained fire really does
    // overheat, ~3 s); once overheated you must cool to 35% before firing again.
    // Feathering pays: any short pause (> FEATHER_DELAY: releasing between targets,
    // bursts, taps) bleeds heat quickly, so controlled fire never locks you out;
    // only holding the trigger flat out does.
    this.sinceShot += dt;
    this.sinceVent += dt;
    const def = this.def;
    if (def.heatPerShot !== undefined || this.heat > 0) {
      const cooling = this.overheated || this.sinceShot > FEATHER_DELAY;
      if (cooling) this.heat = Math.max(0, this.heat - (this.overheated ? 0.6 : FEATHER_COOL) * dt);
      if (this.overheated && this.heat <= VENT_LEVEL) this.overheated = false;
    }
    // Out of a pickup gun entirely → back to pistol.
    if (!this.override && this.current !== 'pistol') {
      const st = this.ammo.get(this.current)!;
      if (st.inMag <= 0 && st.reserve <= 0) {
        this.ammo.delete(this.current);
        this.current = 'pistol';
        this.reloading = 0;
        this.onChange('pistol');
      }
    }
  }
}

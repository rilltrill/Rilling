import { describe, expect, it, vi } from 'vitest';
import { WEAPONS, WeaponSystem } from '../../src/gameplay/Weapons';

/** Advance the system in small steps (like the frame loop does). */
function step(w: WeaponSystem, seconds: number, dt = 1 / 120) {
  for (let t = 0; t < seconds - 1e-9; t += dt) w.update(Math.min(dt, seconds - t));
}

describe('WeaponSystem — firing', () => {
  it('starts with a full pistol with infinite reserve', () => {
    const w = new WeaponSystem();
    expect(w.active).toBe('pistol');
    expect(w.state.inMag).toBe(WEAPONS.pistol.mag);
    expect(w.state.reserve).toBe(Infinity);
    expect(w.canFire()).toBe(true);
  });

  it('respects the fire interval for taps', () => {
    const w = new WeaponSystem();
    const iv = WEAPONS.pistol.interval;
    expect(w.tryFire()).toMatchObject({ ok: true });
    expect(w.tryFire()).toEqual({ ok: false, reason: 'cooldown' });
    step(w, iv * 0.5);
    expect(w.tryFire()).toEqual({ ok: false, reason: 'cooldown' });
    step(w, iv * 0.5 + 0.001);
    expect(w.tryFire()).toMatchObject({ ok: true });
    expect(w.state.inMag).toBe(WEAPONS.pistol.mag - 2);
  });

  it('uses the slower hold interval for held semi-auto fire', () => {
    const w = new WeaponSystem();
    const def = WEAPONS.pistol;
    expect(def.holdInterval).toBeGreaterThan(def.interval);
    w.tryFire(true);
    step(w, def.interval + 0.005);
    expect(w.tryFire(true)).toEqual({ ok: false, reason: 'cooldown' });
    step(w, def.holdInterval! - def.interval);
    expect(w.tryFire(true)).toMatchObject({ ok: true });
  });

  it('full-auto weapons ignore holdInterval', () => {
    const w = new WeaponSystem();
    w.give('smg');
    step(w, 0.5); // weapon-switch delay
    w.tryFire(true);
    step(w, WEAPONS.smg.interval + 0.001);
    expect(w.tryFire(true)).toMatchObject({ ok: true });
  });

  it('runs dry, then reloads from reserve after reloadTime', () => {
    const w = new WeaponSystem();
    const def = WEAPONS.pistol;
    for (let i = 0; i < def.mag; i++) {
      expect(w.tryFire().ok).toBe(true);
      step(w, def.interval + 0.001);
    }
    expect(w.empty).toBe(true);
    expect(w.tryFire()).toEqual({ ok: false, reason: 'empty' });
    const done = vi.fn();
    w.onReloadDone = done;
    expect(w.reload()).toBe(true);
    expect(w.reload()).toBe(false); // already reloading
    expect(w.tryFire()).toEqual({ ok: false, reason: 'reloading' });
    step(w, def.reloadTime - 0.05);
    expect(w.state.inMag).toBe(0);
    step(w, 0.1);
    expect(done).toHaveBeenCalledOnce();
    expect(w.state.inMag).toBe(def.mag);
    expect(w.state.reserve).toBe(Infinity);
  });

  it('does not reload a full magazine', () => {
    const w = new WeaponSystem();
    expect(w.reload()).toBe(false);
  });
});

describe('WeaponSystem — pickups & reserve', () => {
  it('a pickup gun fills the magazine first and selects itself', () => {
    const w = new WeaponSystem();
    const changed = vi.fn();
    w.onChange = changed;
    w.give('shotgun');
    const def = WEAPONS.shotgun;
    expect(w.current).toBe('shotgun');
    expect(changed).toHaveBeenCalledWith('shotgun');
    expect(w.state.inMag).toBe(Math.min(def.mag, def.pickupAmmo));
    expect(w.state.reserve).toBe(def.pickupAmmo - w.state.inMag);
  });

  it('picking up the same gun again adds to the reserve', () => {
    const w = new WeaponSystem();
    w.give('magnum', 10);
    const before = w.state.reserve;
    w.give('magnum', 6);
    expect(w.state.reserve).toBe(before + 6);
  });

  it('reload only takes what the magazine needs from the reserve', () => {
    const w = new WeaponSystem();
    const def = WEAPONS.shotgun;
    w.give('shotgun', def.mag + 2);
    step(w, 0.5);
    w.tryFire();
    step(w, def.interval + 0.01);
    w.tryFire();
    expect(w.state.inMag).toBe(def.mag - 2);
    expect(w.reload()).toBe(true);
    step(w, def.reloadTime + 0.05);
    expect(w.state.inMag).toBe(def.mag);
    expect(w.state.reserve).toBe(0);
    // Reserve empty → nothing more to reload.
    w.tryFire();
    expect(w.reload()).toBe(false);
  });

  it('switches back to the pistol automatically when a pickup gun is completely empty', () => {
    const w = new WeaponSystem();
    w.give('smg', 3);
    step(w, 0.5);
    const changed = vi.fn();
    w.onChange = changed;
    for (let i = 0; i < 3; i++) {
      expect(w.tryFire().ok).toBe(true);
      step(w, WEAPONS.smg.interval + 0.001);
    }
    expect(w.current).toBe('pistol');
    expect(changed).toHaveBeenCalledWith('pistol');
    expect(w.ammo.has('smg')).toBe(false);
    expect(w.owned).toEqual(['pistol']);
  });

  it('cycles through owned weapons and switching cancels a reload', () => {
    const w = new WeaponSystem();
    w.give('shotgun');
    w.give('magnum');
    expect(w.owned).toEqual(['pistol', 'shotgun', 'magnum']);
    w.select('pistol');
    step(w, 0.3); // switch delay
    expect(w.tryFire().ok).toBe(true);
    step(w, 0.3);
    expect(w.reload()).toBe(true);
    w.cycle();
    expect(w.current).toBe('shotgun');
    expect(w.reloading).toBe(0);
    w.cycle();
    expect(w.current).toBe('magnum');
    w.cycle();
    expect(w.current).toBe('pistol');
  });

  it('ignores selecting a gun the player does not have', () => {
    const w = new WeaponSystem();
    w.select('smg');
    expect(w.current).toBe('pistol');
  });
});

describe('WeaponSystem — turret heat', () => {
  it('a stage override takes precedence and is cleared with null', () => {
    const w = new WeaponSystem();
    w.give('shotgun');
    w.setOverride('turret');
    expect(w.active).toBe('turret');
    expect(w.def.mag).toBe(Infinity);
    expect(w.reload()).toBe(false);
    w.setOverride(null);
    expect(w.active).toBe('shotgun');
  });

  it('overheats at 100% heat, then must cool to 35% before firing again', () => {
    const w = new WeaponSystem();
    w.setOverride('turret');
    const def = WEAPONS.turret;
    expect(def.heatPerShot).toBeGreaterThan(0);
    // Each shot adds heatPerShot; the shot that reaches 100 % trips the overheat.
    w.heat = 1 - def.heatPerShot! / 2;
    expect(w.tryFire(true).ok).toBe(true);
    expect(w.heat).toBe(1);
    expect(w.overheated).toBe(true);
    expect(w.tryFire(true)).toEqual({ ok: false, reason: 'overheated' });
    // Still locked out shortly after…
    step(w, 0.3);
    expect(w.overheated).toBe(true);
    expect(w.tryFire(true)).toEqual({ ok: false, reason: 'overheated' });
    // …and released once heat dissipates to the threshold.
    let t = 0.3;
    while (w.overheated && t < 5) {
      w.update(1 / 60);
      t += 1 / 60;
    }
    expect(w.overheated).toBe(false);
    expect(w.heat).toBeLessThanOrEqual(0.35 + 1e-6);
    expect(w.heat).toBeGreaterThan(0.3);
    expect(t).toBeGreaterThan(0.8);
    expect(t).toBeLessThan(3);
    expect(w.tryFire(true).ok).toBe(true);
  });

  it('each turret shot adds heat', () => {
    const w = new WeaponSystem();
    w.setOverride('turret');
    w.tryFire(true);
    expect(w.heat).toBeCloseTo(WEAPONS.turret.heatPerShot!, 6);
  });

  it('heat drains when not firing', () => {
    const w = new WeaponSystem();
    w.setOverride('turret');
    for (let i = 0; i < 10; i++) {
      w.tryFire();
      step(w, WEAPONS.turret.interval + 0.001);
    }
    const hot = w.heat;
    expect(hot).toBeGreaterThan(0);
    step(w, 2);
    expect(w.heat).toBeLessThan(hot);
  });
});

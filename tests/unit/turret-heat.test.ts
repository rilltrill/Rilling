import { describe, expect, it } from 'vitest';
import { WeaponSystem } from '../../src/gameplay/Weapons';

describe('turret heat (sustained fire really overheats)', () => {
  it('overheats after ~2-4 s of held fire at 60 fps, recovers in ~1-2 s', () => {
    const w = new WeaponSystem();
    w.setOverride('turret');
    const dt = 1 / 60;
    let t = 0;
    while (!w.overheated && t < 10) {
      w.tryFire(true);
      w.update(dt);
      t += dt;
    }
    expect(w.overheated).toBe(true);
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(4);
    let rec = 0;
    while (w.overheated && rec < 10) {
      w.update(dt);
      rec += dt;
    }
    expect(rec).toBeGreaterThan(0.7);
    expect(rec).toBeLessThan(2);
  });

  it('short bursts with pauses never overheat', () => {
    const w = new WeaponSystem();
    w.setOverride('turret');
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 30; i++) {
      const firing = i % 120 < 60; // 1 s on, 1 s off
      if (firing) w.tryFire(true);
      w.update(dt);
      expect(w.overheated).toBe(false);
    }
  });
});

describe('auto fire rate does not depend on the frame rate', () => {
  it.each([30, 60, 120])('held mounted gun / SMG fire 12 rounds per second at %i fps', async (fps) => {
    const { WeaponSystem } = await import('../../src/gameplay/Weapons');
    for (const id of ['turret', 'smg'] as const) {
      const w = new WeaponSystem();
      if (id === 'smg') {
        w.give('smg', 999);
        w.update(0.2); // the weapon-switch delay
      } else w.setOverride('turret');
      const dt = 1 / fps;
      let shots = 0;
      for (let f = 0; f < fps * 2; f++) {
        if (w.tryFire(f > 0).ok) shots++;
        w.update(dt);
        if (id === 'turret') w.heat = 0; // ignore overheating here
      }
      expect(shots, `${id} @ ${fps} fps`).toBeGreaterThanOrEqual(23);
      expect(shots, `${id} @ ${fps} fps`).toBeLessThanOrEqual(25);
    }
  });
});

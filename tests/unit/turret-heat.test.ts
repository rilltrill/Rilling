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

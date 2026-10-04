/** Dynamic resolution (perf-4) and the single output-DPR rule (perf-11 / code-8). */
import { describe, expect, it } from 'vitest';
import { ResolutionGovernor, RES_WINDOW } from '../../src/core/Resolution';
import { outputDpr, resolutionLevel } from '../../src/core/Engine';

/** Feed `seconds` of frames whose interval depends on the current level. */
function run(g: ResolutionGovernor, seconds: number, interval: (level: number) => number, trace?: number[]) {
  let t = 0;
  while (t < seconds) {
    const dt = interval(g.level);
    g.sample(dt);
    t += dt;
    trace?.push(g.level);
  }
}

describe('ResolutionGovernor', () => {
  it('stays at full quality at 60 Hz', () => {
    const g = new ResolutionGovernor();
    g.reset(6);
    run(g, 30, () => 1 / 60);
    expect(g.level).toBe(0);
    expect(g.fps).toBe(60);
  });

  it('a 30 Hz refresh cap (iOS Low Power Mode) does not cost resolution for good', () => {
    const g = new ResolutionGovernor();
    g.reset(6);
    const trace: number[] = [];
    run(g, 40, () => 1 / 30, trace);
    expect(g.level).toBe(0);
    expect(g.capAvg).toBeGreaterThan(0);
    // It may probe a few steps, but only briefly (≤ PROBE_STEPS + 1 windows).
    const lowered = trace.filter((l) => l > 0).length / 30; // seconds below full quality
    expect(lowered).toBeLessThanOrEqual(RES_WINDOW * 4 + 0.1);
    // …and it never probes again while the cap holds.
    const late: number[] = [];
    run(g, 30, () => 1 / 30, late);
    expect(Math.max(...late)).toBe(0);
  });

  it('a GPU-bound device steps down until frames are fast enough, and keeps it', () => {
    const g = new ResolutionGovernor();
    g.reset(6);
    // Each level shaves ~20 % of the GPU time: 34 ms → 27 → 22 → 17.6 …
    const gpu = (l: number) => 0.034 * Math.pow(0.8, l);
    run(g, 30, gpu);
    expect(g.level).toBeGreaterThanOrEqual(2);
    expect(gpu(g.level)).toBeLessThan(1 / 45);
    expect(g.capAvg).toBe(0);
  });

  it('a cap that turns into real overload probes again', () => {
    const g = new ResolutionGovernor();
    g.reset(6);
    run(g, 20, () => 1 / 30);
    expect(g.capAvg).toBeGreaterThan(0);
    run(g, 20, (l) => (l === 0 ? 0.05 : 0.02));
    expect(g.level).toBeGreaterThan(0);
  });

  it('recovers resolution once frames are fast again', () => {
    const g = new ResolutionGovernor();
    g.reset(6);
    run(g, 10, (l) => (l < 3 ? 0.034 : 1 / 60));
    expect(g.level).toBeGreaterThan(0);
    run(g, 60, () => 1 / 60);
    expect(g.level).toBe(0);
  });

  it('ignores hitches and tab switches', () => {
    const g = new ResolutionGovernor();
    g.reset(6);
    for (let i = 0; i < 50; i++) g.sample(2);
    expect(g.level).toBe(0);
  });
});

describe('output pixel ratio policy', () => {
  it('is the same rule at boot and after a settings change (one function)', () => {
    // CRT/PIXEL: enough device pixels per scanline even on LOW (was 1 in-session, 2 at boot).
    expect(outputDpr('low', 'crt', 3)).toBe(1.5);
    expect(outputDpr('medium', 'crt', 3)).toBe(2);
    expect(outputDpr('high', 'pixel', 3)).toBe(2);
    // Clean mode: the quality preset.
    expect(outputDpr('low', 'off', 3)).toBe(1);
    expect(outputDpr('medium', 'off', 3)).toBe(1.5);
    expect(outputDpr('high', 'off', 3)).toBe(2);
    // Never above the device.
    expect(outputDpr('high', 'crt', 1)).toBe(1);
  });

  it('retro ladder drops scene lines first, then the output DPR, down to a floor', () => {
    const l0 = resolutionLevel('medium', 'crt', 3, 0);
    expect(l0).toMatchObject({ scale: 1, dpr: 2 });
    expect(resolutionLevel('medium', 'crt', 3, 3)).toMatchObject({ scale: 0.7, dpr: 2 });
    const floor = resolutionLevel('medium', 'crt', 3, 99);
    expect(floor.scale).toBe(0.7);
    expect(floor.dpr).toBe(1);
    expect(resolutionLevel('medium', 'crt', 3, l0.maxLevel)).toEqual(floor);
    // Clean mode only has DPR steps.
    const off = resolutionLevel('medium', 'off', 3, 99);
    expect(off.scale).toBe(1);
    expect(off.dpr).toBe(0.75);
    // Levels are monotonic: each step is cheaper (or equal).
    let prev = Infinity;
    for (let l = 0; l <= l0.maxLevel; l++) {
      const r = resolutionLevel('medium', 'crt', 3, l);
      const cost = r.scale * r.scale * 10 + r.dpr;
      expect(cost).toBeLessThan(prev);
      prev = cost;
    }
  });
});

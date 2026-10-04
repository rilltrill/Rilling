import { expect, test } from '@playwright/test';
import { requireWebGL, shot, snapshot, trackErrors, waitForBoot } from './helpers';

/**
 * Smoke-plays every stage with the aimbot: ?stage=<id>&autoplay=1&god=1&speed=3.
 * Software-rendered browsers are slow, so this proves the stage boots, runs and
 * scores without errors — the headless simulator (tests/unit/stages.test.ts)
 * covers full completion.
 */
const STAGES = ['z1', 'z2', 'z3', 'd1', 'd2', 'd3'];
const PLAY_MS = 15_000;

for (const id of STAGES) {
  test(`stage ${id} plays without errors`, async ({ page }, info) => {
    const errors = trackErrors(page);
    await page.goto(`/?stage=${id}&autoplay=1&god=1&speed=3&mute=1&seed=7`);
    await requireWebGL(page);
    await waitForBoot(page);
    await expect.poll(async () => (await snapshot(page))?.state, { timeout: 30_000 }).toBe('playing');

    const start = Date.now();
    await page.waitForTimeout(PLAY_MS);
    // Some stages walk a while before the first fight on a slow software renderer: allow extra time to score.
    await expect
      .poll(async () => (await snapshot(page))?.score ?? 0, { timeout: 45_000, intervals: [1000] })
      .toBeGreaterThan(0);
    const s = (await snapshot(page))!;
    await shot(page, info, `stage-${id}`);
    info.annotations.push({ type: 'stage', description: `${id}: ${((Date.now() - start) / 1000).toFixed(0)} s, score ${s.score}, kills ${s.kills}, d ${s.d.toFixed(0)}, frames ${s.frames}` });

    expect(s.frameErrors, 'errors thrown inside the frame loop').toBe(0);
    expect(['playing', 'results']).toContain(s.state);
    expect(s.d).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

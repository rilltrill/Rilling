import { expect, test } from '@playwright/test';
import { press, requireWebGL, seedSave, shot, snapshot, trackErrors, waitForBoot } from './helpers';

test.describe('boot & menus', () => {
  test('title → main menu → stage select → stage 1 → HUD', async ({ page }, info) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await page.goto('/');
    await requireWebGL(page);
    await waitForBoot(page);

    // Title screen.
    await expect(page.locator('#menus .screen.title')).toBeVisible();
    await expect(page.locator('.logo-main')).toHaveText('OVERRUN');
    await shot(page, info, 'title');
    await press(page, '#menus .screen.title');

    // Main menu.
    await expect(page.locator('#menus .screen.main')).toBeVisible();
    await expect(page.getByRole('button', { name: 'STAGE SELECT' })).toBeVisible();
    await shot(page, info, 'main-menu');
    await press(page, 'button:has-text("STAGE SELECT")');

    // Stage select: first stage of each campaign is unlocked.
    await expect(page.locator('#menus .screen.stages')).toBeVisible();
    const first = page.locator('.stage-col').first().locator('.stage-btn').first();
    await expect(first).not.toHaveClass(/locked/);
    await shot(page, info, 'stage-select');
    await first.tap();

    // Stage intro card (skippable) → playing with the HUD up.
    await expect
      .poll(async () => (await snapshot(page))?.state, { timeout: 30_000 })
      .toMatch(/intro|playing/);
    if ((await snapshot(page))?.state === 'intro') await page.locator('#menus .screen.intro').tap().catch(() => {});
    await expect.poll(async () => (await snapshot(page))?.state, { timeout: 30_000 }).toBe('playing');
    const hud = page.locator('.hud');
    await expect(hud).toBeVisible();
    await expect(hud).not.toHaveClass(/hidden/);
    await expect(page.locator('.hud-score')).toBeVisible();
    await expect(page.locator('.hud-pause')).toBeVisible();
    await expect(page.locator('.hud-hearts .heart').first()).toBeVisible();

    // Tap-to-shoot registers a shot.
    const shotsBefore = await page.evaluate(() => (window as any).__game.world.score.shots);
    await page.touchscreen.tap(422, 200);
    await expect.poll(() => page.evaluate(() => (window as any).__game.world.score.shots)).toBeGreaterThan(shotsBefore);
    await shot(page, info, 'playing');

    expect((await snapshot(page))!.frameErrors).toBe(0);
    expect(errors).toEqual([]);
  });

  test('pause and resume', async ({ page }, info) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await page.goto('/?stage=z1&god=1&mute=1');
    await requireWebGL(page);
    await waitForBoot(page);
    await expect.poll(async () => (await snapshot(page))?.state).toBe('playing');
    // Let the rail start moving.
    await page.waitForTimeout(1500);

    await press(page, '.hud-pause');
    await expect.poll(async () => (await snapshot(page))?.state).toBe('paused');
    await expect(page.locator('#menus .screen.pause')).toBeVisible();
    await shot(page, info, 'paused');
    // The world is frozen while paused.
    const d0 = (await snapshot(page))!.d;
    await page.waitForTimeout(1200);
    expect((await snapshot(page))!.d).toBe(d0);

    await press(page, 'button:has-text("RESUME")');
    await expect.poll(async () => (await snapshot(page))?.state).toBe('playing');
    await expect(page.locator('#menus .screen.pause')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('ART defaults to SPRITES; the pause ART chip swaps 3D / SPRITES live and sticks', async ({ page }, info) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await page.goto('/?stage=d2&god=1&mute=1');
    await requireWebGL(page);
    await waitForBoot(page);
    await expect.poll(async () => (await snapshot(page))?.state).toBe('playing');
    await page.waitForTimeout(1500);
    const art = () =>
      page.evaluate(() => {
        const g = (window as any).__game;
        return { style: g.artStyle as string, sprites: !!g.sprites, saved: g.save.settings.art as string };
      });
    // Default: pixel art (the sprite renderer is up), nothing forced by the link.
    expect(await art()).toEqual({ style: 'sprites', sprites: true, saved: 'sprites' });

    await press(page, '.hud-pause');
    await expect(page.locator('#menus .screen.pause')).toBeVisible();
    const chip = page.locator('.pause-art');
    await expect(chip).toBeVisible();
    await expect(chip.locator('.seg.on')).toHaveText('SPRITES');
    await press(page, '.pause-art button[aria-label="ART 3D"]');
    await expect(chip.locator('.seg.on')).toHaveText('3D');
    await expect.poll(art).toEqual({ style: '3d', sprites: false, saved: '3d' });
    await shot(page, info, 'paused-art-3d');
    await press(page, '.pause-art button[aria-label="ART SPRITES"]');
    await expect.poll(art).toEqual({ style: 'sprites', sprites: true, saved: 'sprites' });
    await shot(page, info, 'paused-art-sprites');
    await press(page, 'button:has-text("RESUME")');
    await expect.poll(async () => (await snapshot(page))?.state).toBe('playing');
    expect((await snapshot(page))!.frameErrors).toBe(0);
    expect(errors).toEqual([]);
  });

  test('settings persist across a reload', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await page.goto('/');
    await requireWebGL(page);
    await waitForBoot(page);
    await press(page, '#menus .screen.title');
    await press(page, 'button:has-text("SETTINGS")');
    await expect(page.locator('#menus .screen.settings')).toBeVisible();

    const row = (label: string) => page.locator('.set-row', { hasText: label });
    const toggle = (label: string) => row(label).locator('.set-toggle');
    await expect(toggle('LEFT-HANDED HUD')).toHaveText('OFF');
    await toggle('LEFT-HANDED HUD').tap();
    await expect(toggle('LEFT-HANDED HUD')).toHaveText('ON');
    await row('GRAPHICS').locator('.seg', { hasText: 'LOW' }).tap();
    await expect(row('GRAPHICS').locator('.seg.on')).toHaveText('LOW');

    await page.reload();
    await waitForBoot(page);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('overrun.save.v1') ?? '{}'));
    expect(saved.settings.leftHanded).toBe(true);
    expect(saved.settings.quality).toBe('low');

    await press(page, '#menus .screen.title');
    await press(page, 'button:has-text("SETTINGS")');
    await expect(toggle('LEFT-HANDED HUD')).toHaveText('ON');
    await expect(row('GRAPHICS').locator('.seg.on')).toHaveText('LOW');
    expect(errors).toEqual([]);
  });
});

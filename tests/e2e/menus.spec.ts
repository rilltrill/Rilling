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

  test('ART defaults to PIXEL CAST; the pause ART chip cycles CLASSIC / PIXEL CAST / PIXEL WORLD and sticks', async ({ page }, info) => {
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
        return { style: g.artStyle as string, sprites: !!g.sprites, saved: g.save.settings.art as string, loaded: g.world?.art as string };
      });
    // Default: pixel-art characters on the 3D scenery (the sprite renderer is up), nothing forced by the link.
    expect(await art()).toEqual({ style: 'sprites', sprites: true, saved: 'sprites', loaded: 'sprites' });

    await press(page, '.hud-pause');
    await expect(page.locator('#menus .screen.pause')).toBeVisible();
    const chip = page.locator('.pause-art .art-chip');
    const note = page.locator('.pause-art-note');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText('PIXEL CAST');
    await expect(note).toHaveText('');
    // PIXEL CAST → PIXEL WORLD: characters stay pixel art; the scenery waits for the next stage load (said so).
    await press(page, '.pause-art .art-chip');
    await expect(chip).toHaveText('PIXEL WORLD');
    await expect(chip).toHaveAttribute('aria-label', 'ART PIXEL WORLD');
    await expect(note).toHaveText('SCENERY CHANGES ON THE NEXT STAGE LOAD');
    await expect.poll(art).toEqual({ style: 'pixel', sprites: true, saved: 'pixel', loaded: 'sprites' });
    await shot(page, info, 'paused-art-pixel-world');
    // → CLASSIC: 3D characters at once; the loaded scenery is classic-style 3D already (no note).
    await press(page, '.pause-art .art-chip');
    await expect(chip).toHaveText('CLASSIC');
    await expect(note).toHaveText('');
    await expect.poll(art).toEqual({ style: '3d', sprites: false, saved: '3d', loaded: 'sprites' });
    await shot(page, info, 'paused-art-classic');
    // → PIXEL CAST again.
    await press(page, '.pause-art .art-chip');
    await expect(chip).toHaveText('PIXEL CAST');
    await expect.poll(art).toEqual({ style: 'sprites', sprites: true, saved: 'sprites', loaded: 'sprites' });
    await shot(page, info, 'paused-art-pixel-cast');
    await press(page, 'button:has-text("RESUME")');
    await expect.poll(async () => (await snapshot(page))?.state).toBe('playing');
    expect((await snapshot(page))!.frameErrors).toBe(0);
    expect(errors).toEqual([]);
  });

  test('&art=pixel loads a stage in PIXEL WORLD (painted scenery) without touching the saved setting', async ({ page }, info) => {
    const errors = trackErrors(page);
    await seedSave(page);
    await page.goto('/?stage=z1&god=1&mute=1&art=pixel');
    await requireWebGL(page);
    await waitForBoot(page);
    await expect.poll(async () => (await snapshot(page))?.state).toBe('playing');
    await page.waitForTimeout(1500);
    const st = await page.evaluate(() => {
      const g = (window as any).__game;
      let pw = 0;
      g.world.scene.traverse((o: any) => {
        if (o.userData?.pixelWorld) pw++;
      });
      return { style: g.artStyle as string, loaded: g.world.art as string, saved: g.save.settings.art as string, pw };
    });
    expect(st.style).toBe('pixel');
    expect(st.loaded).toBe('pixel');
    expect(st.saved).toBe('sprites');
    expect(st.pw).toBeGreaterThan(0);
    await shot(page, info, 'art-pixel-world-z1');
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

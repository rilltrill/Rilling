import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireWebGL, seedSave, shot, snapshot, trackErrors, waitForBoot } from './helpers';

test.describe('installable web app', () => {
  test('manifest, icons and iOS launch images are served', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m).toMatchObject({
      name: 'OVERRUN',
      short_name: 'OVERRUN',
      display: 'fullscreen',
      orientation: 'landscape',
      start_url: './',
      scope: './',
      theme_color: '#07080c',
      background_color: '#07080c',
    });
    const purposes = m.icons.map((i: { purpose: string }) => i.purpose);
    expect(purposes).toContain('maskable');
    for (const icon of m.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
    for (const f of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'splash/apple-splash-2556-1179.png', 'splash/apple-splash-1179-2556.png']) {
      const r = await request.get(`/${f}`);
      expect(r.ok(), f).toBe(true);
      expect(r.headers()['content-type']).toContain('image/png');
    }
  });

  test('service worker precaches the shell and the game boots offline', async ({ page, context, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'service-worker offline emulation is Chromium-only in Playwright');
    const errors = trackErrors(page);
    await seedSave(page);
    const sw = await (await page.request.get('/sw.js')).text();
    expect(sw).toContain('./index.html');
    expect(sw).toMatch(/\.\/assets\/index-[\w-]+\.js/);
    expect(sw).not.toContain('__OVERRUN_PRECACHE__');

    await page.goto('/');
    await requireWebGL(page);
    await waitForBoot(page);
    // Wait until the worker is active and controls the page.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((r) => navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true }));
      }
    });
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const c = await caches.open(keys.find((k) => k.startsWith('overrun-'))!);
      return (await c.keys()).map((r) => new URL(r.url).pathname);
    });
    expect(cached).toContain('/index.html');
    expect(cached.some((p) => /\/assets\/index-.*\.js$/.test(p))).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await waitForBoot(page);
    await expect(page.locator('#menus .screen.title')).toBeVisible();
    await shot(page, info, 'offline-title');
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });

  test('iOS install hint: never with debug flags, forced with ?installhint=1, dismissal persists', async ({ page }, info) => {
    // Debug/test sessions (?stage / ?autoplay) never create it — deterministic in
    // both projects, unlike the navigator.webdriver guard.
    await page.goto('/?stage=z1&god=1&mute=1');
    await waitForBoot(page);
    await page.waitForTimeout(2000); // past the 1.6 s reveal delay
    await expect(page.locator('#install-hint')).toHaveCount(0);

    await page.goto('/?installhint=1');
    await waitForBoot(page);
    const hint = page.locator('#install-hint');
    await expect(hint).toHaveClass(/show/);
    await expect(hint).toContainText('Add to Home Screen');
    await page.waitForTimeout(700); // let the slide-in transition finish before the screenshot
    await shot(page, info, 'install-hint');
    await hint.locator('.ih-close').tap();
    await expect(hint).not.toHaveClass(/show/);
    expect(await page.evaluate(() => localStorage.getItem('overrun.installHint.dismissed'))).toBe('1');
    // Off-screen hint is out of the render tree (no blur layer / hit target over the canvas).
    await expect(hint).toBeHidden();
    // The title screen still works underneath.
    await expect(page.locator('#menus .screen.title')).toBeVisible();

    // Dismissal sticks: a normal launch (even on a real iPhone UA) no longer shows it.
    await page.goto('/');
    await waitForBoot(page);
    await page.waitForTimeout(2000);
    await expect(page.locator('#install-hint')).toHaveCount(0);
  });
});

test.describe('single-file build', () => {
  const file = path.resolve('dist-single/overrun.html');
  test('dist-single/overrun.html boots from file:// with no errors', async ({ page }, info) => {
    test.skip(!fs.existsSync(file), 'run `npm run build:single` first');
    const errors = trackErrors(page);
    await page.goto(pathToFileURL(file).href);
    await requireWebGL(page);
    await waitForBoot(page);
    await expect(page.locator('#menus .screen.title')).toBeVisible();
    await expect(page.locator('.logo-main')).toHaveText('OVERRUN');
    // No external requests needed: every <script>/<link> is inline or a data: URI.
    const external = await page.evaluate(() =>
      [...document.querySelectorAll('script[src], link[href]')]
        .map((e) => e.getAttribute('src') ?? e.getAttribute('href') ?? '')
        .filter((u) => !u.startsWith('data:')),
    );
    expect(external).toEqual([]);
    await shot(page, info, 'single-file-title');
    expect((await snapshot(page))!.frameErrors).toBe(0);
    expect(errors).toEqual([]);
  });
});

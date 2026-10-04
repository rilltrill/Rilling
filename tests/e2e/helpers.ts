import { expect, test, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const SAVE_KEY = 'overrun.save.v1';
/** src/platform/installHint.ts — set so the iPhone install pill never overlays menus in the WebKit/iPhone project. */
export const INSTALL_HINT_KEY = 'overrun.installHint.dismissed';

/** Console errors / uncaught exceptions collected for a page. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // Browser-level noise unrelated to the game: favicon fetches, GPU driver
    // chatter, and WebKit refusing to start audio without a real user gesture.
    if (/favicon|Failed to load resource.*(sw\.js|manifest)|GPU stall|WebGL.*performance/i.test(text)) return;
    if (/Unhandled Promise Rejection: NotAllowedError/i.test(text)) return;
    // Chrome intervention when haptics fire before the first tap (only possible with ?autoplay).
    if (/Blocked call to navigator\.vibrate/i.test(text)) return;
    errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/**
 * Seeds the save before the page's scripts run (first load only — a later
 * reload keeps whatever the game persisted): tutorial already seen, iPhone
 * install hint already dismissed (the webkit-iphone project has an iPhone UA,
 * and hiding the hint must not depend on navigator.webdriver).
 */
export async function seedSave(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([key, hintKey, data]) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, seenTutorial: true, ...data }));
        localStorage.setItem(hintKey, '1');
      } catch {
        /* storage unavailable */
      }
    },
    [SAVE_KEY, INSTALL_HINT_KEY, extra] as const,
  );
}

export interface GameSnapshot {
  state: string;
  score: number;
  kills: number;
  d: number;
  frameErrors: number;
  frames: number;
}

export function snapshot(page: Page): Promise<GameSnapshot | null> {
  return page.evaluate(() => {
    const g = (window as unknown as { __game?: any }).__game;
    if (!g) return null;
    return {
      state: g.state,
      score: g.world?.score.score ?? 0,
      kills: g.world?.score.kills ?? 0,
      d: g.world?.rig.d ?? 0,
      frameErrors: g.stats.errors,
      frames: g.stats.frames,
    };
  });
}

/** Skips the test when this browser build has no WebGL (the game shows its boot error). */
export async function requireWebGL(page: Page) {
  const ok = await page.evaluate(() => {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  });
  test.skip(!ok, 'WebGL unavailable in this browser build');
}

/** Waits for the game object and its first rendered frames. */
export async function waitForBoot(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __game?: { stats: { frames: number } } }).__game?.stats.frames! > 2, null, {
    timeout: 60_000,
  });
}

/** Taps an element like a finger would (both projects emulate touch phones). */
export async function press(page: Page, selector: string) {
  const loc = page.locator(selector).first();
  await expect(loc).toBeVisible();
  await loc.tap();
}

/** Saves a named screenshot under test-results/screenshots/<project>/ (uploaded by CI). */
export async function shot(page: Page, info: TestInfo, name: string) {
  const dir = path.join('test-results', 'screenshots', info.project.name);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

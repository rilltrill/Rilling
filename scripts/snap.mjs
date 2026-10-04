#!/usr/bin/env node
/**
 * Screenshot helper for development / agents.
 *
 *   node scripts/snap.mjs --url "http://localhost:5173/?stage=z1&autoplay=1&god=1" \
 *        --out /tmp/shots/z1 --count 4 --interval 3000 [--width 844 --height 390] [--tap 400,200]
 *        [--dpr 2] [--save '{"seenTutorial":true,"settings":{"quality":"high"}}']
 *
 *   --dpr   device pixel ratio (default 1) — 2 for crisp README screenshots
 *   --save  JSON merged into the save (localStorage 'overrun.save.v1') before the page loads
 *
 * Prints a JSON summary (game state, errors, fps) and writes <out>-<i>.png files.
 * Requires a running dev server (`npx vite --port <n>`).
 */
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const url = args.url;
if (!url) {
  console.error('missing --url');
  process.exit(1);
}
const out = args.out ?? '/tmp/snap';
const count = Number(args.count ?? 1);
const interval = Number(args.interval ?? 3000);
const width = Number(args.width ?? 844);
const height = Number(args.height ?? 390);
const dpr = Number(args.dpr ?? 1);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
// Swallow Vite HMR so concurrent edits by others don't reload the page mid-capture.
await page.routeWebSocket(/.*/, () => {});
if (args.save) {
  const seed = JSON.parse(args.save);
  await page.addInitScript((data) => {
    try {
      localStorage.setItem('overrun.save.v1', JSON.stringify({ version: 1, ...data }));
    } catch {
      /* storage unavailable */
    }
  }, seed);
}
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'load' });
if (args.tap) {
  const [x, y] = args.tap.split(',').map(Number);
  await page.waitForTimeout(800);
  await page.touchscreen.tap(x, y);
}
const files = [];
for (let i = 0; i < count; i++) {
  await page.waitForTimeout(interval);
  const f = `${out}-${i}.png`;
  await page.screenshot({ path: f });
  files.push(f);
}
const state = await page.evaluate(() => {
  const g = window.__game;
  if (!g) return null;
  return {
    state: g.state,
    beat: g.runner?.label,
    d: g.world?.rig.d,
    score: g.world?.score.score,
    kills: g.world?.score.kills,
    hp: g.world?.player.hp,
    entities: g.world?.entities.length,
    fps: g.engine.fps,
    frameErrors: g.stats.errors,
    drawCalls: g.engine.renderer.info.render.calls,
    triangles: g.engine.renderer.info.render.triangles,
    geometries: g.engine.renderer.info.memory.geometries,
  };
});
console.log(JSON.stringify({ files, state, errors: errors.slice(0, 20) }, null, 1));
await browser.close();

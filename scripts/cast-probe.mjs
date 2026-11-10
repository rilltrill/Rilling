#!/usr/bin/env node
/**
 * PIXEL CAST look-dev: which painted characters are on screen, how far and how tall, as a
 * stage beat plays with nobody shooting — pick frames for scripts/cast-look.mjs --shot.
 *   node scripts/cast-probe.mjs --base http://localhost:5802 --shots "z1:6,z1:9" [--step 60] [--max 900]
 */
import { chromium } from '@playwright/test';
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const base = args.base ?? 'http://localhost:5802';
const step = Number(args.step ?? 60);
const max = Number(args.max ?? 900);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
for (const sh of (args.shots ?? 'z1:6').split(',')) {
  const [st, beat] = sh.split(':');
  const ctx = await browser.newContext({ viewport: { width: 624, height: 288 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(`${base}/?stage=${st}&beat=${beat}&god=1&seed=7&mute=1&retro=pixel&art=sprites&speed=0.00001`, { waitUntil: 'load' });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await page.waitForTimeout(250);
    if (await page.evaluate(() => window.__game?.state === 'playing' && !!window.__game.world)) break;
  }
  const rows = await page.evaluate(
    ([step, max]) => {
      const g = window.__game;
      const w = g.world;
      w.timeScale = 1;
      const out = [];
      const cam = w.camera;
      const V = cam.position.constructor;
      for (let f = step; f <= max; f += step) {
        for (let i = 0; i < step; i++) g.runner.update(w.update(1 / 60));
        cam.updateMatrixWorld();
        const cp = cam.getWorldPosition(new V());
        const list = [];
        for (const e of w.entities) {
          if (e.removed || !e.paintPixels || !e.root.visible || e.constructor.name === 'Pickup' || e.constructor.name === 'Projectile') continue;
          const p = e.root.getWorldPosition(new V());
          const n = p.clone().setY(p.y + 1).project(cam);
          if (n.z > 1 || Math.abs(n.x) > 0.98 || Math.abs(n.y) > 1.1) continue;
          list.push(`${e.constructor.name}:${p.distanceTo(cp).toFixed(1)}`);
        }
        out.push(`${f} [${g.runner.label}] ${list.join(' ')}`);
      }
      return out;
    },
    [step, max],
  );
  console.log(sh + '\n  ' + rows.join('\n  '));
  await ctx.close();
}
await browser.close();

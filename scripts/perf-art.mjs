#!/usr/bin/env node
/**
 * ART: SPRITES performance probe: plays a stage URL live (autoplay + god), waits
 * for a busy moment, then samples draw calls / triangles and the sprite system's
 * stats for a few seconds in ART: SPRITES and then in ART: 3D (same session).
 *
 *   node scripts/perf-art.mjs --base http://localhost:5501 --shots "d3:16,z2:31,z1:4" [--secs 5]
 *
 * NOTE: run under SwiftShader (software GL) the CPU timings include software
 * rasterisation; compare modes against each other, not against a phone.
 */
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const base = args.base ?? 'http://localhost:5501';
const shots = (args.shots ?? 'z1:4').split(',').map((s) => s.split(':'));
const secs = Number(args.secs ?? 5);
const minOn = Number(args.min ?? 3);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
for (const [stage, beat] of shots) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.routeWebSocket(/.*/, () => {});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    setInterval(() => {
      const g = window.__game;
      if (g?.engine?.retro) g.engine.retro.scale = 1;
    }, 50);
    // Per-frame samples, collected inside the page.
    window.__perf = { on: false, rows: [] };
    const tick = () => {
      const g = window.__game;
      const p = window.__perf;
      if (p.on && g?.world) {
        const i = g.engine.renderer.info.render;
        const sp = g.sprites?.stats;
        p.rows.push({ calls: i.calls, tris: i.triangles, ms: sp ? sp.lastMs : 0, bakes: sp ? sp.bakes : 0, sprites: sp ? sp.drawn : 0, rt: sp ? sp.rtBytes : 0 });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(`${base}/?stage=${stage}&beat=${beat}&god=1&autoplay=1&retro=crt&seed=7&mute=1&art=sprites`, { waitUntil: 'load' });
  const t0 = Date.now();
  while (Date.now() - t0 < 16000) {
    await page.waitForTimeout(250);
    const n = await page.evaluate(() => {
      const g = window.__game;
      if (!g?.world || g.state !== 'playing') return -1;
      if (g.autoplay) g.autoplay.rate = 2;
      let n = 0;
      for (const e of g.world.enemies()) if (!e.removed && e.state !== 'dying' && e.onScreen(0.9)) n += e.isBoss ? 10 : 1;
      return n;
    });
    if (n >= minOn) break;
  }
  const out = { stage, beat };
  for (const mode of ['sprites', '3d']) {
    await page.evaluate((mode) => {
      const g = window.__game;
      g.flags.art = mode;
      g.settingsChanged(g.save.settings);
      window.__perf.rows = [];
      window.__perf.on = true;
    }, mode);
    await page.waitForTimeout(secs * 1000);
    const rows = await page.evaluate(() => {
      window.__perf.on = false;
      return window.__perf.rows;
    });
    const r = rows.slice(3);
    const avg = (k) => +(r.reduce((s, x) => s + x[k], 0) / Math.max(1, r.length)).toFixed(2);
    const max = (k) => +Math.max(0, ...r.map((x) => x[k])).toFixed(2);
    out[mode] = { frames: r.length, calls: avg('calls'), callsMax: max('calls'), tris: Math.round(avg('tris')), trisMax: max('tris'), spriteMs: avg('ms'), spriteMsMax: max('ms'), bakesPerFrame: avg('bakes'), bakesMax: max('bakes'), sprites: avg('sprites'), spritesMax: max('sprites'), rtMB: +(max('rt') / 1048576).toFixed(2) };
  }
  out.errors = errors.slice(0, 5);
  console.log(JSON.stringify(out));
  await ctx.close();
}
await browser.close();

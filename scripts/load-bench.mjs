#!/usr/bin/env node
/**
 * Stage load benchmark: per stage and ART, the main-thread cost of a stage load
 * (world build incl. PixelWorld painting, shader warm-up, first render) on a
 * COLD load (fresh browser profile: nothing persisted) and WARM loads (a reload
 * in the same profile: painted atlases come back from IndexedDB), plus the long
 * tasks (> 50 ms) seen once play has begun (hitches).
 *
 *   node scripts/load-bench.mjs --base http://localhost:5795 --stages z1,d1 --arts sprites,pixel [--warm 2] [--play 8] [--intro]
 *
 * --intro: the real flow (the title, then the stage's 2.8 s intro card; frame gaps
 * under the card show how smooth it stays); default: a deep link (no card, as a
 * RETRY / RESTART). --play N: autoplay N seconds after the load (hitches in play).
 * The dev server keeps the store off: pass --extra "&pwstore=<tag>" (or bench a build).
 *
 * Prints one JSON line per load. Times under SwiftShader on a shared box are
 * only good for comparing loads with each other (a phone is ~2-3x slower).
 */
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const base = args.base ?? 'http://localhost:5795';
const stages = (args.stages ?? 'z1,z2,z3,d1,d2,d3').split(',');
const arts = (args.arts ?? 'pixel').split(',');
const warmRuns = Number(args.warm ?? 2);
const playSecs = Number(args.play ?? 0);
const extra = args.extra ?? '';
const intro = args.intro === 'true';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const rows = [];
for (const stage of stages) {
  for (const art of arts) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.routeWebSocket(/.*/, () => {});
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      // Frame gaps (rAF): how smooth the intro card / loading screen stays, and hitches in play.
      window.__gaps = [];
      let last = 0;
      const tick = (t) => {
        if (last && t - last > 50) window.__gaps.push({ t: Math.round(t), ms: Math.round(t - last), state: window.__game?.state ?? '-' });
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.__long = [];
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__long.push({ t: Math.round(e.startTime), ms: Math.round(e.duration), state: window.__game?.state ?? '-' });
        }).observe({ type: 'longtask', buffered: true });
      } catch {}
    });
    // --intro: a returning player (the first-stage briefing would pause the stage after its card).
    if (intro)
      await page.addInitScript(() => {
        try {
          if (!localStorage.getItem('overrun.save.v1')) localStorage.setItem('overrun.save.v1', JSON.stringify({ seenTutorial: true }));
        } catch {}
      });
    for (let run = 0; run <= warmRuns; run++) {
      // --intro: the real flow (title → the stage's intro card); else a deep link (no card, as a RETRY).
      const url = intro ? `${base}/?art=${art}&mute=1&seed=7&retro=crt${playSecs ? '&god=1' : ''}${extra}` : `${base}/?stage=${stage}&art=${art}&mute=1&seed=7&retro=crt${playSecs ? '&autoplay=1&god=1' : ''}${extra}`;
      if (run === 0) await page.goto(url, { waitUntil: 'load' });
      else await page.reload({ waitUntil: 'load' });
      if (intro) {
        const t1 = Date.now();
        while (Date.now() - t1 < 20000 && !(await page.evaluate(() => window.__game?.state === 'menu'))) await page.waitForTimeout(100);
        await page.waitForTimeout(1500);
        await page.evaluate((id) => {
          const g = window.__game;
          g.flags.seed = 7;
          g.startStage(g.findStage(id).stage);
        }, stage);
      }
      // Long tasks / frame gaps from here on belong to this load (the page's own boot is before).
      await page.evaluate(() => (window.__loadT0 = performance.now()));
      const t0 = Date.now();
      while (Date.now() - t0 < 60000) {
        await page.waitForTimeout(100);
        if (await page.evaluate(() => window.__game?.state === 'playing' && !!window.__game.lastLoad)) break;
      }
      // Let deferred work (after the first frame) finish, then optionally play.
      const playStart = await page.evaluate(() => performance.now());
      await page.waitForTimeout(500 + playSecs * 1000);
      const r = await page.evaluate((ps) => {
        const g = window.__game;
        const pw = window.__pixelWorld ?? {};
        const paint = Object.values(pw).reduce((s, a) => s + (a.ms ?? 0), 0);
        const bytes = Object.values(pw).reduce((s, a) => s + (a.bytes ?? 0), 0);
        return {
          load: g.lastLoad,
          paint: Math.round(paint),
          atlases: Object.fromEntries(Object.entries(pw).map(([k, a]) => [k, `${Math.round(a.ms)}ms${a.cached ? ' (cached)' : ''}${a.stored ? ' (idb)' : ''}`])),
          mb: +(bytes / 1048576).toFixed(1),
          playLong: window.__long.filter((e) => e.t > ps && e.state === 'playing'),
          loadGaps: window.__gaps.filter((e) => e.t > (window.__loadT0 ?? 0) && e.t <= ps && e.state !== 'playing').map((e) => `${e.ms}@${e.state}`).join(' '),
          playGaps: window.__gaps.filter((e) => e.t > ps && e.state === 'playing').map((e) => e.ms),
          loadLong: window.__long.filter((e) => e.t > (window.__loadT0 ?? 0) && e.t <= ps && e.state !== 'playing').map((e) => `${e.ms}@${e.state}`).join(' '),
          heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
          store: window.__pwStore ? { readMs: Math.round(window.__pwStore.readMs), readMB: +window.__pwStore.readMB.toFixed(1), writes: window.__pwStore.writes, writeMs: Math.round(window.__pwStore.writeMs), errors: window.__pwStore.errors } : null,
          maxStep: window.__pwPaint ? `${Math.round(window.__pwPaint.maxStep)}ms ${window.__pwPaint.maxStepAtlas}` : null,
        };
      }, playStart);
      const L = r.load ?? {};
      const row = { stage, art, run: run === 0 ? 'cold' : `warm${run}`, build: Math.round(L.build ?? -1), paint: Math.round(L.paint ?? 0), paintFrames: L.paintFrames ?? 0, storeWrite: Math.round(L.store ?? 0), warmup: Math.round(L.warm ?? -1), render: Math.round(L.render ?? -1), total: Math.round(L.total ?? -1), atlasPaint: r.paint, mb: r.mb, heap: r.heap, maxStep: r.maxStep, atlases: r.atlases, loadGaps: r.loadGaps, playGaps: r.playGaps, loadLong: r.loadLong, playLong: r.playLong, store: r.store, errors: errors.splice(0) };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
    await ctx.close();
  }
}
await browser.close();

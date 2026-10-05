#!/usr/bin/env node
/**
 * Deterministic ART benchmark: loads a stage, waits for a busy moment, optionally
 * spawns extra enemies (--spawn walker:6,raptor:4), hard-freezes the simulation
 * and then renders N frames per art style while advancing only `world.time`, so
 * ART: SPRITES runs its normal 12 fps round-robin schedule. Reports per-frame draw
 * calls / triangles (bakes included), JS time of Game.renderWorld, bakes per
 * frame, repainted texels per frame, impostor bakes and render-target memory.
 *
 *   node scripts/bench-art.mjs --shots "d3:16,z2:31" [--frames 120] [--spawn walker:8] [--noauto]
 *
 * JS times under SwiftShader on a shared box are only good for comparing the two
 * modes with each other (GPU work is excluded: gl.finish() runs outside the timer).
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
const frames = Number(args.frames ?? 120);
const minOn = Number(args.min ?? 3);
const spawn = args.spawn ?? '';
const extra = args.extra ?? '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
for (const [stage, beat] of shots) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.routeWebSocket(/.*/, () => {});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Pin the retro pass at full resolution (no dynamic-resolution steps: SwiftShader is slow).
  await page.addInitScript(() => {
    const iv = setInterval(() => {
      const g = window.__game;
      if (!g?.engine?.retro) return;
      g.engine.applyLevel = () => {};
      g.engine.retro.scale = 1;
      clearInterval(iv);
    }, 20);
  });
  const auto = args.noauto ? '' : '&autoplay=1';
  await page.goto(`${base}/?stage=${stage}&beat=${beat}&god=1${auto}&retro=crt&seed=7&mute=1&art=sprites${extra}`, { waitUntil: 'load' });
  const t0 = Date.now();
  while (Date.now() - t0 < Number(args.wait ?? 16000)) {
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
  if (args.after) await page.waitForTimeout(Number(args.after));
  const res = await page.evaluate(
    async ([frames, spawn]) => {
      const g = window.__game;
      const w = g.world;
      if (spawn) {
        const reg = await import('/src/content/registry.ts');
        const cam = w.camera;
        const fwd = cam.getWorldDirection(cam.position.clone()).setY(0).normalize();
        const right = fwd.clone().set(-fwd.z, 0, fwd.x);
        let k = 0;
        for (const part of spawn.split(',')) {
          const [idv, n] = part.split(':');
          const [id, variant] = idv.split('@');
          for (let i = 0; i < Number(n); i++, k++) {
            const pos = cam.position.clone().addScaledVector(fwd, 5 + (k % 5) * 2.2).addScaledVector(right, ((k * 1.7) % 9) - 4.5);
            pos.y = w.groundAt(pos.x, pos.z);
            w.add(reg.createEnemy(id, w, { pos, frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: variant ? { variant } : { variant: 'random' } }));
          }
        }
        // Let them settle into the scene for a few frames.
        for (let i = 0; i < 20; i++) w.update(1 / 60);
      }
      w.update = () => 0;
      g.runner.update = () => {};
      g.autoplay = null;
      const r = g.engine.renderer;
      const gl = r.getContext();
      const out = {};
      // Two passes: the first one only warms up (shader programs compile asynchronously).
      for (const mode of ['3d', 'sprites', '3d', 'sprites']) {
        g.flags.art = mode;
        g.settingsChanged(g.save.settings);
        const rows = [];
        let fallbacks = 0;
        let pendingMax = 0;
        for (let i = 0; i < frames + 30; i++) {
          w.time += 1 / 60;
          r.info.reset();
          const a = performance.now();
          g.renderWorld(w);
          const b = performance.now();
          gl.finish();
          const st = g.sprites?.stats;
          if (i >= 30) rows.push({ ms: b - a, calls: r.info.render.calls, tris: r.info.render.triangles, bakes: st?.bakes ?? 0, spriteMs: st?.lastMs ?? 0, paints: st?.paints ?? 0, paintMs: st?.paintMsFrame ?? 0, figureMs: st?.figureMsFrame ?? 0, prims: st?.prims ?? 0, texels: st?.texels ?? 0, impostors: st?.impostors ?? 0 });
          // Style pops: characters drawn as 3D models while SPRITES is on (whole pass, warm-up frames included).
          if (g.sprites) {
            fallbacks += g.sprites.stats.fallbacks;
            pendingMax = Math.max(pendingMax, g.sprites.stats.pending);
          }
        }
        const avg = (k) => +(rows.reduce((s, x) => s + x[k], 0) / rows.length).toFixed(2);
        const max = (k) => +Math.max(...rows.map((x) => x[k])).toFixed(2);
        const sorted = rows.map((x) => x.ms).sort((a, b) => a - b);
        out[mode] = {
          renderMsAvg: avg('ms'),
          renderMsP95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
          renderMsMin: +sorted[0].toFixed(2),
          renderMsMedian: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
          spriteMsMin: +Math.min(...rows.map((x) => x.spriteMs)).toFixed(2),
          spriteMsMedian: +rows.map((x) => x.spriteMs).sort((a, b) => a - b)[Math.floor(rows.length / 2)].toFixed(2),
          spriteMsAvg: avg('spriteMs'),
          spriteMsMax: max('spriteMs'),
          callsAvg: avg('calls'),
          callsMax: max('calls'),
          trisAvg: Math.round(avg('tris')),
          trisMax: max('tris'),
          bakesPerFrame: avg('bakes'),
          bakesMax: max('bakes'),
          paintsPerFrame: avg('paints'),
          paintsMax: max('paints'),
          paintMsAvg: avg('paintMs'),
          paintMsMax: max('paintMs'),
          figureMsAvg: avg('figureMs'),
          figureMsMax: max('figureMs'),
          primsMax: max('prims'),
          // Repainted texels per frame (budget ≈ 52 k) and impostor bakes (sprites with no painter: should be 0).
          texelsAvg: Math.round(avg('texels')),
          texelsMax: max('texels'),
          impostors: rows.reduce((s, x) => s + x.impostors, 0),
          characters: w.entities.filter((e) => e.constructor && (e.hostile || e.isBoss || e.constructor.name.includes('Civilian'))).length,
          sprites: g.sprites ? g.sprites.stats.drawn : 0,
          rtMB: g.sprites ? +(g.sprites.stats.rtBytes / 1048576).toFixed(2) : 0,
          fallbacks,
          pendingMax,
        };
      }
      // Silhouette check: sprite opaque area vs the 3D model's area, per character type (±10 % target).
      if (g.sprites) {
        const cov = {};
        for (const c of g.sprites.debugCoverage()) {
          if (c.model < 30) continue; // too small to measure
          (cov[c.name] ??= []).push(+(c.sprite / c.model).toFixed(3));
        }
        out.coverage = cov;
      }
      return out;
    },
    [frames, spawn],
  );
  console.log(JSON.stringify({ stage, beat, spawn, ...res, errors: errors.slice(0, 5) }));
  await ctx.close();
}
await browser.close();

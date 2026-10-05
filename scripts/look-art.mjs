#!/usr/bin/env node
/**
 * ART look-dev captures: loads a stage, places enemies at chosen spots in front
 * of the camera (`--place "runner:0:3,compy:-2:6"` = id:right:forward metres),
 * lets them animate a moment, hard-freezes and screenshots the same instant in
 * every mode, plus a nearest-neighbour zoom of a region (`--crop x,y,w,h --zoom 3`).
 *
 *   node scripts/look-art.mjs --url "/?stage=zoo&zoo=none" --place "walker:-1.5:4,runner:1.5:2.6" \
 *        --modes "3d,sprites" --out /tmp/look/zoo-close [--settle 400] [--retro crt] [--flash]
 *
 * Writes <out>-<mode>.png (and <out>-<mode>-zoom.png with --crop) and prints stats.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const base = args.base ?? 'http://localhost:5501';
const out = args.out ?? '/tmp/look/shot';
const modes = (args.modes ?? '3d,sprites').split(',');
const retro = args.retro ?? 'crt';
const settle = Number(args.settle ?? 400);
const wait = Number(args.wait ?? 0);
const place = (args.place ?? '').split(',').filter(Boolean).map((p) => p.split(':'));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.routeWebSocket(/.*/, () => {});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/403/.test(m.text()) && errors.push(m.text()));
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
const sep = args.url.includes('?') ? '&' : '?';
await page.goto(`${base}${args.url}${sep}god=1&retro=${retro}&seed=7&mute=1&art=3d`, { waitUntil: 'load' });
const t0 = Date.now();
while (Date.now() - t0 < 20000) {
  await page.waitForTimeout(250);
  const ok = await page.evaluate(() => window.__game?.state === 'playing' && !!window.__game.world);
  if (ok) break;
}
if (wait) await page.waitForTimeout(wait);
const info = await page.evaluate(
  async ([place, settle, flash, gore]) => {
    const g = window.__game;
    const w = g.world;
    if (g.autoplay) g.autoplay = null;
    const reg = await import('/src/content/registry.ts');
    const cam = w.camera;
    cam.updateMatrixWorld();
    const fwd = cam.getWorldDirection(cam.position.clone()).setY(0).normalize();
    const right = fwd.clone().set(-fwd.z, 0, fwd.x);
    const camPos = cam.getWorldPosition(cam.position.clone());
    for (const [id, r, f] of place) {
      const pos = camPos.clone().addScaledVector(fwd, Number(f)).addScaledVector(right, Number(r));
      pos.y = w.groundAt(pos.x, pos.z);
      w.add(reg.createEnemy(id, w, { pos, frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: {} }));
    }
    if (gore) {
      // Gore check: a burst of chunks at each enemy's chest, mid-flight when frozen.
      for (const en of w.enemies()) {
        const p = (en.anchor ?? en.root).getWorldPosition(camPos.clone());
        w.fx.gibs(p, 0x9a1a14, 10, 0.12);
      }
    }
    const n = Math.round(settle / 16.7);
    for (let i = 0; i < n; i++) w.update(1 / 60);
    w.timeScale = 0;
    w.update = () => 0;
    g.runner.update = () => {};
    if (flash) {
      const e = w.boss ?? w.enemies().find((x) => x.state !== 'dying');
      e?.flash(flash === 'red');
    }
    return { entities: w.entities.length, beat: g.runner?.label };
  },
  [place, settle, args.flash ?? null, !!args.gore],
);
const rows = {};
for (const mode of modes) {
  await page.evaluate((mode) => {
    const g = window.__game;
    const [art, spec] = mode.split('@');
    g.flags.art = art;
    g.settingsChanged(g.save.settings);
    if (g.sprites) {
      g.sprites.look = { ...(g.__baseLook ??= { ...g.sprites.look }) };
      for (const kv of (spec ?? '').split(';').filter(Boolean)) {
        const [k, v] = kv.split('=');
        g.sprites.look[k === 'k' ? 'pxPerTexel' : k] = Number(v);
      }
      g.sprites.invalidate();
    }
  }, mode);
  await page.waitForTimeout(900);
  const tag = mode.replace(/[@;=]/g, '_');
  const f = `${out}-${tag}.png`;
  await page.screenshot({ path: f });
  rows[mode] = await page.evaluate(() => {
    const g = window.__game;
    const i = g.engine.renderer.info;
    const sp = g.sprites?.stats;
    const c = g.world.camera.getWorldPosition(g.world.camera.position.clone());
    const e = g.world.enemies()[0]?.root.getWorldPosition(c.clone());
    const r3 = (v) => v && [v.x, v.y, v.z].map((n) => +n.toFixed(2));
    const sig = g.world.enemies().map((en) => {
      let s = 0;
      en.root.traverse((o) => o.matrixWorld.elements.forEach((v, i) => (s += v * (i + 1))));
      return +s.toFixed(3);
    });
    return { sig, cam: r3(c), e0: r3(e), fov: g.world.camera.fov, time: +g.world.time.toFixed(2), calls: i.render.calls, tris: i.render.triangles, sprites: sp ? { n: sp.sprites, drawn: sp.drawn, live3d: sp.live3d, pending: sp.pending, fallbacks: sp.fallbacksTotal } : null };
  });
  if (args.crop) {
    const [x, y, w, h] = args.crop.split(',').map(Number);
    const z = Number(args.zoom ?? 3);
    execFileSync('python3', ['-c', `from PIL import Image\nim=Image.open('${f}').crop((${x},${y},${x + w},${y + h}))\nim.resize((${w * z},${h * z}),Image.NEAREST).save('${out}-${tag}-zoom.png')`]);
  }
}
console.log(JSON.stringify({ info, rows, errors: errors.slice(0, 6) }));
await browser.close();

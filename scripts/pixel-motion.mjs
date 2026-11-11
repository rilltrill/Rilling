#!/usr/bin/env node
/**
 * PIXEL WORLD in motion: does the light swim? Consecutive simulation steps of the same shot,
 * compared pixel by pixel (docs/PIXELWORLD2.md §5, "stability").
 *
 *   node scripts/pixel-motion.mjs --base http://localhost:5801 --out /tmp/pw2/motion
 *        --shots "z1:4:120:z1-move,…" [--steps 2] [--extra "&pwlight=0"] [--noauto] [--strip x,y,w,h]
 *
 * A shot is  stage:beat:frames[:label]  (as scripts/pixel-world.mjs); after `frames` steps of
 * 1/60 s it captures the exact 624 × 288 art frame, then again after each of `--steps` further
 * steps — as the game draws it and in the `tone`, `steps` and `fog` debug views. Per pair of
 * consecutive frames it prints, as shares of the painted-world pixels:
 *   moved    metres the rail camera travelled in the step
 *   paint    pixels whose PAINTED tone changed: what the camera's motion alone does to a frame
 *            of pixel art (a texel leaves a pixel, its neighbour arrives)
 *   light    pixels whose light step changed (a band's edge passing, its dither; a lamp flickering)
 *   fog      pixels whose fog band changed
 *   colour   pixels whose colour on screen changed at all / by more than one step of the monitor
 *   swing    the mean change of brightness (luma, of 255) over the painted world: how hard a
 *            flicker hits the eye, whatever it is made of
 * In a hold beat with steady lights `light` and `fog` must be 0. With `&pwlight=0` (the first
 * pass's light) only `paint` and `colour` mean anything. Writes <out>/<label>-f<k>.png (3×) and
 * <out>/<label>-strip.png: the frames side by side (the `--strip` window of the frame, 6×).
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, grid, scale } from './png.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const base = args.base ?? 'http://localhost:5801';
const out = args.out ?? '/tmp/pw2/motion';
const extra = args.extra ?? '';
const noauto = args.noauto === 'true';
const steps = Number(args.steps ?? 2);
const strip = (args.strip ?? '192,96,240,120').split(',').map(Number);
const W = 624;
const H = 288;
const shots = (args.shots ?? 'z1:4:120:z1-move')
  .split(',')
  .filter(Boolean)
  .map((s) => {
    const [stage, beat, frames, label] = s.split(':');
    return { stage, beat: Number(beat), frames: Number(frames), label: label || `${stage}-b${beat}-f${frames}` };
  });

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const rows = [];
for (const shot of shots) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.routeWebSocket(/.*/, () => {});
  page.on('pageerror', (e) => console.error(`${shot.label}: ${e.message}`));
  await page.addInitScript(() => {
    const iv = setInterval(() => {
      const g = window.__game;
      if (!g?.engine?.retro) return;
      g.engine.applyLevel = () => {};
      g.engine.retro.scale = 1;
      clearInterval(iv);
    }, 20);
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = '#hud, #overlay2d { visibility: hidden !important; }';
      document.head.appendChild(s);
    });
  });
  const url = `${base}/?stage=${shot.stage}&beat=${shot.beat}&god=1${noauto ? '' : '&autoplay=1'}&seed=7&mute=1&retro=pixel&art=pixel&speed=0.00001&pwdebug=1${extra}`;
  await page.goto(url, { waitUntil: 'load' });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await page.waitForTimeout(250);
    if (await page.evaluate(() => window.__game?.state === 'playing' && !!window.__game.world)) break;
  }
  const advance = (frames) =>
    page.evaluate((n) => {
      const g = window.__game;
      const w = g.world;
      const ts = w.timeScale;
      w.timeScale = 1;
      for (let i = 0; i < n; i++) {
        g.autoplay?.update(1 / 60);
        const sdt = w.update(1 / 60);
        g.runner.update(sdt);
      }
      w.timeScale = ts;
      g.sprites?.invalidate?.();
      return w.rig.d;
    }, frames);
  const view = async (v) => {
    await page.evaluate((name) => new Promise((res) => (window.__pwDebug(name), requestAnimationFrame(() => requestAnimationFrame(() => res())))), v);
    await page.waitForTimeout(120);
    return decodePng(await page.screenshot());
  };
  const frames = [];
  let d = await advance(shot.frames);
  await page.waitForTimeout(1500);
  for (let k = 0; k <= steps; k++) {
    if (k) {
      d = await advance(1);
      await page.waitForTimeout(300);
    }
    const f = { d, off: await view('off'), tone: await view('tone'), steps: await view('steps'), fog: await view('fog') };
    await page.evaluate(() => window.__pwDebug('off'));
    frames.push(f);
    writeFileSync(`${out}/${shot.label}-f${k}.png`, encodePng(scale(f.off, 3).data, W * 3, H * 3));
  }
  await ctx.close();
  const crop = (im) => {
    const [x, y, w, h] = strip;
    const c = { w, h, data: new Uint8Array(w * h * 4) };
    for (let j = 0; j < h; j++) c.data.set(im.data.subarray(((y + j) * W + x) * 4, ((y + j) * W + x + w) * 4), j * w * 4);
    return scale(c, 6);
  };
  const sheet = grid(frames.map((f) => crop(f.off)), frames.length, 6);
  writeFileSync(`${out}/${shot.label}-strip.png`, encodePng(sheet.data, sheet.w, sheet.h));
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1];
    const b = frames[k];
    let world = 0;
    const n = { paint: 0, light: 0, fog: 0, colour: 0, colour8: 0, swing: 0 };
    const luma = (x, q) => 0.2126 * x.data[q] + 0.7152 * x.data[q + 1] + 0.0722 * x.data[q + 2];
    const diff = (x, y, q) => Math.max(Math.abs(x.data[q] - y.data[q]), Math.abs(x.data[q + 1] - y.data[q + 1]), Math.abs(x.data[q + 2] - y.data[q + 2]));
    for (let q = 0; q < W * H * 4; q += 4) {
      // Painted world in both frames (everything else is black in the views).
      if (a.tone.data[q] + a.tone.data[q + 1] + a.tone.data[q + 2] < 60 || b.tone.data[q] + b.tone.data[q + 1] + b.tone.data[q + 2] < 60) continue;
      world++;
      if (diff(a.tone, b.tone, q) > 40) n.paint++;
      if (diff(a.steps, b.steps, q) > 40) n.light++;
      if (diff(a.fog, b.fog, q) > 8) n.fog++;
      const c = diff(a.off, b.off, q);
      if (c > 0) n.colour++;
      if (c > 9) n.colour8++;
      n.swing += Math.abs(luma(a.off, q) - luma(b.off, q));
    }
    n.swing /= Math.max(1, world);
    const pc = (v) => `${((100 * v) / Math.max(1, world)).toFixed(2)}%`.padStart(7);
    const line = `${shot.label.padEnd(12)} f${k - 1}→f${k}  moved ${(b.d - a.d).toFixed(3)} m   paint ${pc(n.paint)}   light ${pc(n.light)}   fog ${pc(n.fog)}   colour ${pc(n.colour)} (> 1 step ${pc(n.colour8)})   swing ${n.swing.toFixed(2)}`;
    console.log(line);
    rows.push({ shot: shot.label, pair: k, moved: b.d - a.d, world, ...n });
  }
}
await browser.close();
writeFileSync(`${out}/motion.json`, JSON.stringify({ base, extra, rows }, null, 1));

#!/usr/bin/env node
/**
 * PIXEL WORLD mood look-dev: a stage's light levels, and the same frozen frame under several
 * moods (content/pixelworld/light.ts: `PwMood`), without a reload between them.
 *
 *   node scripts/pixel-mood.mjs --base http://localhost:5801 --out /tmp/pw2/mood
 *        --shots "z1:5:150:z1-street,…" [--moods "a=pivot:0.3,steps:0.8;b=pivot:0.4"] [--extra "&pwrt=8"]
 *        [--hud] [--noauto] [--views]
 *
 * A shot is  stage:beat:frames[:label]  (as scripts/pixel-world.mjs). Per shot it prints
 *   light     the luminance of the light on the painted world (the first pass's multiplier of the
 *             paint: irradiance / π × gain), percentiles 5 / 25 / 50 / 75 / 95 — a stage's
 *             `pivot` is chosen from these;
 *   steps     the share of world pixels at each tone step under the stage's mood (and under each
 *             of --moods: `name=key:value,…`, laid over the stage's mood with `__pwMood`).
 * Writes <out>/<label>[-<mood>].png (the exact 624 × 288 art frame, 3×) and, with --views,
 * <label>[-<mood>]-steps.png and <label>-light.png.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, scale } from './png.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const base = args.base ?? 'http://localhost:5801';
const out = args.out ?? '/tmp/pw2/mood';
const extra = args.extra ?? '';
const hud = args.hud === 'true';
const noauto = args.noauto === 'true';
const views = args.views === 'true';
const W = 624;
const H = 288;
const shots = (args.shots ?? 'z1:5:150:z1-street')
  .split(',')
  .filter(Boolean)
  .map((s) => {
    const [stage, beat, frames, label] = s.split(':');
    return { stage, beat: Number(beat), frames: Number(frames), label: label || `${stage}-b${beat}-f${frames}` };
  });
const moods = (args.moods ?? '')
  .split(';')
  .filter(Boolean)
  .map((m) => {
    const [name, kv] = m.split('=');
    return { name, patch: Object.fromEntries(kv.split(',').map((p) => p.split(':')).map(([k, v]) => [k, Number(v)])) };
  });

/** Step of a `steps` view pixel (null: not lit world — black, or a glow texel). */
function stepOf(d, q) {
  const r = d[q];
  const g = d[q + 1];
  const b = d[q + 2];
  if (r + g + b < 60 || (r > 200 && g > 200 && b > 200)) return null;
  if (b > 200) return r > 60 ? -3 : g < 130 ? -2 : -1;
  if (r < 60) return 0;
  return g > 190 ? 1 : g > 60 ? 2 : 3;
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
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
  });
  if (!hud) await page.addInitScript(() => {
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
  await page.evaluate((frames) => {
    const g = window.__game;
    const w = g.world;
    const ts = w.timeScale;
    w.timeScale = 1;
    for (let i = 0; i < frames; i++) {
      g.autoplay?.update(1 / 60);
      const sdt = w.update(1 / 60);
      g.runner.update(sdt);
    }
    w.timeScale = ts;
    g.sprites?.invalidate?.();
  }, shot.frames);
  await page.waitForTimeout(1500);
  const view = async (v) => {
    await page.evaluate((name) => new Promise((res) => (window.__pwDebug(name), requestAnimationFrame(() => requestAnimationFrame(() => res())))), v);
    await page.waitForTimeout(120);
    return decodePng(await page.screenshot());
  };
  const save = (img, name) => writeFileSync(`${out}/${name}.png`, encodePng(scale(img, 3).data, W * 3, H * 3));
  // The light itself: stops on the green channel of the `light` view (−8 … +4), over full red.
  const light = await view('light');
  if (views) save(light, `${shot.label}-light`);
  const stops = [];
  for (let q = 0; q < light.data.length; q += 4) if (light.data[q] > 200 && light.data[q + 2] < 60) stops.push((light.data[q + 1] / 255) * 12 - 8);
  stops.sort((a, b) => a - b);
  const pct = (p) => stops[Math.min(stops.length - 1, Math.floor(stops.length * p))] ?? 0;
  const mood = await page.evaluate(() => window.__pwMood({}));
  console.log(`${shot.label}: light (× paint) p5 ${(2 ** pct(0.05)).toFixed(3)}  p25 ${(2 ** pct(0.25)).toFixed(3)}  p50 ${(2 ** pct(0.5)).toFixed(3)}  p75 ${(2 ** pct(0.75)).toFixed(3)}  p95 ${(2 ** pct(0.95)).toFixed(3)}   mood ${JSON.stringify(mood)}`);
  for (const m of [{ name: '', patch: {} }, ...moods]) {
    await page.evaluate((p) => window.__pwMood(p), { ...mood, ...m.patch });
    const tag = m.name ? `${shot.label}-${m.name}` : shot.label;
    const st = await view('steps');
    if (views) save(st, `${tag}-steps`);
    const cnt = new Map();
    let n = 0;
    for (let q = 0; q < st.data.length; q += 4) {
      const s = stepOf(st.data, q);
      if (s === null) continue;
      cnt.set(s, (cnt.get(s) ?? 0) + 1);
      n++;
    }
    const line = [-3, -2, -1, 0, 1, 2, 3].map((s) => `${s > 0 ? '+' : ''}${s}: ${(((cnt.get(s) ?? 0) / Math.max(1, n)) * 100).toFixed(0).padStart(2)}%`).join('  ');
    console.log(`  ${(m.name || 'stage').padEnd(8)} steps  ${line}`);
    save(await view('off'), tag);
  }
  await ctx.close();
}
await browser.close();

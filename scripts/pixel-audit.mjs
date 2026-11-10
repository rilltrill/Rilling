#!/usr/bin/env node
/**
 * PIXEL WORLD audit: does a frame read as pixel art, in numbers (docs/PIXELWORLD2.md §7–8).
 *
 *   node scripts/pixel-audit.mjs --base http://localhost:5801 --out /tmp/pw2/audit
 *        [--shots "z1:5:150:z1-street,…"] [--json <file>] [--extra "&pwup=0"] [--hud] [--noauto]
 *
 * A shot is  stage:beat:frames[:label]  (as scripts/pixel-world.mjs: the stage loaded at that
 * beat, game time frozen, advanced by exactly `frames` steps of 1/60 s). Without --shots: three
 * views a stage (near ground, walls, props) plus its boss. Each shot is captured as the exact
 * 1:1 art frame (624 × 288, retro=pixel: no CRT, no upscale) three times on the SAME frozen
 * frame: as the game draws it, and in the `mag` and `lvl` debug views (core/debugView.ts:
 * every pixel that is not PixelWorld / FLORA paint is black there, which is also the mask of
 * "world pixels" below).
 *
 * Per shot (and as a table):
 *   world     share of the frame that is painted world
 *   >1.5 >2   share of world pixels whose texel is drawn more than 1.5 / 2 frame pixels wide
 *             (`mid`: inside the middle 80 % of the frame's width and height)
 *   lvl>2     the same for the level texel actually drawn (foreshortened planes: information,
 *             not a pass criterion — a painter cannot change it)
 *   flat      share of 16 × 16 blocks of world (≥ 75 % world pixels) that are flat: at most two
 *             distinct colours (`2col`), or no drawn form — fewer than 12 of the block's 480
 *             adjacent pairs differ by more than two steps of the monitor's 15-bit colour
 *             (17 / 255), so one tone under the monitor's ordered dither or a smooth light
 *             gradient over an empty wall counts as flat, as the eye sees it
 *   colours   distinct colours in the frame
 *   tiny      share of horizontally / vertically adjacent world pixel pairs that differ by a
 *             tiny non-zero amount: 1…9 of 255 on the largest channel, i.e. at most ONE step of
 *             the monitor's 15-bit colour (8.2 / 255) — the fingerprint of smooth gradients and
 *             screen-door dither, which pixel art does not have. (`tiny6`, 1…6 of 255, is kept
 *             in the JSON: it is zero by construction while the monitor pass quantises.)
 * Writes <out>/<label>.png, <label>-mag.png, <label>-lvl.png, <label>-flat.png (the frame
 * with its flat blocks boxed), each 3×, and the JSON.
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
const out = args.out ?? '/tmp/pw2/audit';
const jsonPath = args.json ?? `${out}/audit.json`;
const extra = args.extra ?? '';
const hud = args.hud === 'true';
const noauto = args.noauto === 'true';
const W = 624;
const H = 288;

/** Three views a stage (near ground, walls, props) and its boss. */
const DEFAULT_SHOTS =
  'z1:5:150:z1-street,z1:10:200:z1-alley,z1:14:200:z1-gas,z1:25:240:z1-boss,' +
  'z2:4:240:z2-bay,z2:12:200:z2-inside,z2:19:200:z2-morgue,z2:29:240:z2-boss,' +
  'z3:2:240:z3-pileup,z3:11:200:z3-tunnel,z3:13:200:z3-barricade,z3:16:240:z3-boss,' +
  'd1:4:240:d1-road,d1:7:200:d1-tree,d1:15:200:d1-ford,d1:17:240:d1-boss,' +
  'd2:2:200:d2-lobby,d2:7:240:d2-atrium,d2:11:60:d2-kitchen,d2:25:240:d2-boss,' +
  'd3:4:240:d3-visitor,d3:8:200:d3-roadblock,d3:12:200:d3-mud,d3:16:240:d3-boss';

/**
 * Pass marks. Density is the art bible's rule (§2.1, §3). `flat` and `tiny` are set well under
 * the first pass, measured before anything else changed (/tmp/pw2/audit-v1.json, these 24
 * shots): flat 12.7 % on average (1.0–38.5 %), tiny 65.1 % (54.0–74.4 %) — and >1.5: 20.9 %,
 * >2 mid: 6.3 %, lvl>2: 37.1 %, 1293 colours a frame.
 */
export const THRESHOLDS = {
  /** ≤ 5 % of world pixels with a texel wider than 1.5 frame pixels. */
  mag15: 0.05,
  /** ≤ 1 % wider than 2 pixels inside the middle 80 % of the frame. */
  mag2mid: 0.01,
  /** ≤ 4 % of world blocks flat (a third of the first pass). */
  flat: 0.04,
  /** ≤ 20 % of adjacent world pairs one monitor step apart (under a third of the first pass). */
  tiny: 0.2,
};

const shots = (args.shots ?? DEFAULT_SHOTS)
  .split(',')
  .filter(Boolean)
  .map((s) => {
    const [stage, beat, frames, label] = s.split(':');
    return { stage, beat: Number(beat), frames: Number(frames), label: label || `${stage}-b${beat}-f${frames}` };
  });

/** Density class of a `mag` / `lvl` pixel: 0 = not world, 1 ≤ 1.25, 2 ≤ 1.5, 3 ≤ 2, 4 > 2 pixels a texel. */
function magClass(d, q) {
  const r = d[q] > 127;
  const g = d[q + 1];
  if (!r) return g > 127 ? 1 : 0;
  return g > 191 ? 2 : g > 63 ? 3 : 4;
}

function analyse(frame, mag, lvl) {
  const d = frame.data;
  const n = W * H;
  const cls = new Uint8Array(n);
  const cnt = [0, 0, 0, 0, 0];
  const mid = [0, 0, 0, 0, 0];
  const lv = [0, 0, 0, 0, 0];
  const x0 = Math.round(W * 0.1);
  const x1 = Math.round(W * 0.9);
  const y0 = Math.round(H * 0.1);
  const y1 = Math.round(H * 0.9);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const c = (cls[i] = magClass(mag.data, i * 4));
      cnt[c]++;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) mid[c]++;
      lv[magClass(lvl.data, i * 4)]++;
    }
  }
  const world = n - cnt[0];
  const worldMid = (x1 - x0) * (y1 - y0) - mid[0];
  const lvWorld = n - lv[0];
  // Flat blocks: 16 × 16, at least 75 % world.
  const diff = (a, b) => Math.max(Math.abs(d[a] - d[b]), Math.abs(d[a + 1] - d[b + 1]), Math.abs(d[a + 2] - d[b + 2]));
  let blocks = 0;
  let flat2 = 0;
  let flatForm = 0;
  let flat = 0;
  const seen = new Set();
  const flatMap = [];
  for (let by = 0; by + 16 <= H; by += 16) {
    for (let bx = 0; bx + 16 <= W; bx += 16) {
      let w = 0;
      let edges = 0;
      seen.clear();
      for (let y = by; y < by + 16; y++) {
        for (let x = bx; x < bx + 16; x++) {
          const i = y * W + x;
          if (cls[i]) w++;
          const q = i * 4;
          seen.add((d[q] << 16) | (d[q + 1] << 8) | d[q + 2]);
          if (x + 1 < bx + 16 && diff(q, q + 4) > 17) edges++;
          if (y + 1 < by + 16 && diff(q, q + W * 4) > 17) edges++;
        }
      }
      if (w < 192) continue;
      blocks++;
      const f2 = seen.size <= 2;
      const ff = edges < 12;
      if (f2) flat2++;
      if (ff) flatForm++;
      if (f2 || ff) {
        flat++;
        flatMap.push(bx, by);
      }
    }
  }
  // Colours and adjacent pairs.
  const colours = new Set();
  const worldColours = new Set();
  let pairs = 0;
  let tiny = 0;
  let tiny6 = 0;
  let pairsAll = 0;
  let tinyAll = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const q = i * 4;
      const c = (d[q] << 16) | (d[q + 1] << 8) | d[q + 2];
      colours.add(c);
      if (cls[i]) worldColours.add(c);
      for (const j of [x + 1 < W ? i + 1 : -1, y + 1 < H ? i + W : -1]) {
        if (j < 0) continue;
        const m = diff(q, j * 4);
        pairsAll++;
        if (m >= 1 && m <= 9) tinyAll++;
        if (!cls[i] || !cls[j]) continue;
        pairs++;
        if (m >= 1 && m <= 9) tiny++;
        if (m >= 1 && m <= 6) tiny6++;
      }
    }
  }
  const share = (a, b) => (b ? a / b : 0);
  return {
    world: world / n,
    mag15: share(cnt[3] + cnt[4], world),
    mag2: share(cnt[4], world),
    mag15mid: share(mid[3] + mid[4], worldMid),
    mag2mid: share(mid[4], worldMid),
    lvl2: share(lv[4], lvWorld),
    blocks,
    flat: share(flat, blocks),
    flat2: share(flat2, blocks),
    flatForm: share(flatForm, blocks),
    flatMap,
    colours: colours.size,
    worldColours: worldColours.size,
    tiny: share(tiny, pairs),
    tiny6: share(tiny6, pairs),
    tinyAll: share(tinyAll, pairsAll),
  };
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
for (const shot of shots) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.routeWebSocket(/.*/, () => {});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/403|404/.test(m.text()) && errors.push(m.text()));
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
  // pwdebug=1: the debug views are compiled in, the game is shown as it is until a view is asked for.
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
    // Two frames with the view set, then the capture.
    await page.evaluate((name) => new Promise((res) => (window.__pwDebug(name), requestAnimationFrame(() => requestAnimationFrame(() => res())))), v);
    await page.waitForTimeout(120);
    return decodePng(await page.screenshot());
  };
  const frame = await view('off');
  const mag = await view('mag');
  const lvl = await view('lvl');
  await page.evaluate(() => window.__pwDebug('off'));
  const st = await page.evaluate(() => {
    const g = window.__game;
    const i = g.engine.renderer.info;
    return { calls: i.render.calls, tris: i.render.triangles, pw: window.__pixelWorld ?? null, d: g.world.rig.d, beat: g.runner.label };
  });
  await ctx.close();
  if (frame.w !== W || frame.h !== H) throw new Error(`audit: frame is ${frame.w}×${frame.h}, expected ${W}×${H}`);
  writeFileSync(`${out}/${shot.label}.png`, encodePng(scale(frame, 3).data, W * 3, H * 3));
  writeFileSync(`${out}/${shot.label}-mag.png`, encodePng(scale(mag, 3).data, W * 3, H * 3));
  writeFileSync(`${out}/${shot.label}-lvl.png`, encodePng(scale(lvl, 3).data, W * 3, H * 3));
  const { flatMap, ...m } = analyse(frame, mag, lvl);
  // The flat blocks, boxed on the frame (what to paint next).
  const boxed = { w: W, h: H, data: new Uint8Array(frame.data) };
  for (let k = 0; k < flatMap.length; k += 2) {
    for (let t = 0; t < 16; t++) {
      for (const [x, y] of [[flatMap[k] + t, flatMap[k + 1]], [flatMap[k], flatMap[k + 1] + t]]) boxed.data.set([255, 0, 255, 255], (y * W + x) * 4);
    }
  }
  writeFileSync(`${out}/${shot.label}-flat.png`, encodePng(scale(boxed, 3).data, W * 3, H * 3));
  const pass = {
    mag15: m.mag15 <= THRESHOLDS.mag15,
    mag2mid: m.mag2mid <= THRESHOLDS.mag2mid,
    flat: m.flat <= THRESHOLDS.flat,
    tiny: m.tiny <= THRESHOLDS.tiny,
  };
  results.push({ shot: shot.label, stage: shot.stage, beat: st.beat, d: st.d, ...m, pass, ok: Object.values(pass).every(Boolean), calls: st.calls, tris: st.tris, pw: st.pw, errors });
  process.stderr.write(`${shot.label} done\n`);
}
await browser.close();

const pc = (v) => `${(v * 100).toFixed(1)}%`.padStart(7);
const mark = (ok) => (ok ? ' ' : '!');
const head = `${'shot'.padEnd(14)}  world   >1.5     >2  >2 mid  lvl>2    flat  (2col) colours    tiny  ok`;
const lines = results.map(
  (r) =>
    `${r.shot.padEnd(14)}${pc(r.world)}${pc(r.mag15)}${mark(r.pass.mag15)}${pc(r.mag2)}${pc(r.mag2mid)}${mark(r.pass.mag2mid)}${pc(r.lvl2)} ${pc(r.flat)}${mark(r.pass.flat)}${pc(r.flat2)} ${String(r.colours).padStart(7)} ${pc(r.tiny)}${mark(r.pass.tiny)} ${r.ok ? 'PASS' : 'fail'}`,
);
const mean = (k) => results.reduce((s, r) => s + r[k], 0) / Math.max(1, results.length);
const means = Object.fromEntries(['world', 'mag15', 'mag2', 'mag15mid', 'mag2mid', 'lvl2', 'flat', 'flat2', 'flatForm', 'colours', 'tiny', 'tiny6', 'tinyAll'].map((k) => [k, mean(k)]));
const foot = `${'mean'.padEnd(14)}${pc(means.world)}${pc(means.mag15)} ${pc(means.mag2)}${pc(means.mag2mid)} ${pc(means.lvl2)} ${pc(means.flat)} ${pc(means.flat2)} ${String(Math.round(means.colours)).padStart(7)} ${pc(means.tiny)}`;
const rule = `pass: >1.5 ≤ ${THRESHOLDS.mag15 * 100}% of world pixels · >2 ≤ ${THRESHOLDS.mag2mid * 100}% in the middle 80% · flat blocks ≤ ${THRESHOLDS.flat * 100}% · tiny pairs ≤ ${THRESHOLDS.tiny * 100}%   (! = over)`;
const table = [head, ...lines, foot, rule].join('\n');
console.log(table);
writeFileSync(jsonPath, JSON.stringify({ base, extra, thresholds: THRESHOLDS, means, shots: results, table }, null, 1));
console.log(jsonPath);

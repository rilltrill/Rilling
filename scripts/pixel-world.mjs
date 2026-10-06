#!/usr/bin/env node
/**
 * PixelWorld captures: the same stage instant in several ART modes, for
 * environment look-dev (PIXEL CAST vs PIXEL WORLD) and audits.
 *
 *   node scripts/pixel-world.mjs --base http://localhost:5791 --out /tmp/pixelworld/demo \
 *     --shots "z1:1:240:first-contact,d1:2:300" [--modes sprites,pixel] [--retro crt] [--hud] [--sheet]
 *
 * A shot is  stage:beat:frames[:label]  — the stage is loaded at that beat (god mode,
 * autoplay, seed 7) with game time frozen, then advanced by exactly `frames`
 * simulation steps of 1/60 s (deterministic: every mode shows the same moment),
 * frozen again and captured at 844×390 (phone landscape) with the retro pass
 * pinned at its full line count. ENVIRONMENTS are built at stage load, so every
 * mode is a fresh page load. Writes <out>/<label>-<mode>.png, and with --sheet a
 * contact sheet <out>/sheet.png (rows = shots, columns = modes). Prints stats JSON
 * (draw calls, triangles, PixelWorld atlas bytes / paint ms when present).
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const base = args.base ?? 'http://localhost:5791';
const out = args.out ?? '/tmp/pixelworld/shots';
const modes = (args.modes ?? 'sprites,pixel').split(',');
const retro = args.retro ?? 'crt';
const hud = args.hud === 'true';
mkdirSync(out, { recursive: true });
const shots = (args.shots ?? 'z1:1:240')
  .split(',')
  .filter(Boolean)
  .map((s) => {
    const [stage, beat, frames, label] = s.split(':');
    return { stage, beat: Number(beat), frames: Number(frames), label: label || `${stage}-b${beat}-f${frames}` };
  });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const rows = [];
const stats = [];
for (const shot of shots) {
  const row = [];
  for (const mode of modes) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
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
    // speed=0.00001: game time frozen from the first frame (the steps below are the only time that passes).
    const url = `${base}/?stage=${shot.stage}&beat=${shot.beat}&god=1&autoplay=1&seed=7&mute=1&retro=${retro}&art=${mode}&speed=0.00001`;
    await page.goto(url, { waitUntil: 'load' });
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      await page.waitForTimeout(250);
      if (await page.evaluate(() => window.__game?.state === 'playing' && !!window.__game.world)) break;
    }
    const info = await page.evaluate((frames) => {
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
      return { d: w.rig.d, beat: g.runner.label };
    }, shot.frames);
    await page.waitForTimeout(1500);
    const f = `${out}/${shot.label}-${mode}.png`;
    await page.screenshot({ path: f });
    const st = await page.evaluate(() => {
      const g = window.__game;
      const i = g.engine.renderer.info;
      const pw = window.__pixelWorld ?? null;
      return { calls: i.render.calls, tris: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries, pw };
    });
    stats.push({ shot: shot.label, mode, ...info, ...st, errors });
    row.push(f);
    await ctx.close();
  }
  rows.push(row);
}
await browser.close();
writeFileSync(`${out}/stats.json`, JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 1));
if (args.sheet) {
  const py = `
from PIL import Image, ImageDraw
rows = ${JSON.stringify(rows)}
labels = ${JSON.stringify(shots.map((s) => s.label))}
modes = ${JSON.stringify(modes)}
W, H = 844, 390
s = 0.5 if len(rows) > 4 else 1.0
tw, th = int(W * s), int(H * s)
sheet = Image.new('RGB', (tw * len(modes), (th + 14) * len(rows)), (10, 10, 14))
d = ImageDraw.Draw(sheet)
for r, row in enumerate(rows):
    for c, f in enumerate(row):
        im = Image.open(f).convert('RGB').resize((tw, th), Image.NEAREST if s >= 1 else Image.BILINEAR)
        sheet.paste(im, (c * tw, r * (th + 14) + 14))
        d.text((c * tw + 4, r * (th + 14) + 1), labels[r] + '  ' + modes[c], fill=(230, 230, 230))
sheet.save('${out}/sheet.png')
`;
  execFileSync('python3', ['-c', py]);
  console.log(`${out}/sheet.png`);
}

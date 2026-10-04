#!/usr/bin/env node
/**
 * ART comparison captures: loads a stage URL, waits for a busy moment, freezes
 * the game and screenshots the SAME instant in ART: 3D and ART: SPRITES.
 *
 *   node scripts/snap-art.mjs --base "http://localhost:5501" --out /tmp/shots \
 *        --shots "z1:4,z1:21,z1:25" [--min 3] [--wait 16000] [--after 0] [--retro crt] [--rate 2.5]
 *        [--modes "3d,sprites,sprites@k=2;bands=0"] [--noauto] [--flash] [--extra "&zoo=walker"]
 *
 * Writes <out>/<stage>-b<beat>-3d.png and -sprites.png and prints per-shot
 * stats (draw calls / triangles in both modes, sprite stats).
 */
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const base = args.base ?? 'http://localhost:5501';
const out = args.out ?? '/tmp/snap-art';
const shots = (args.shots ?? 'z1:4').split(',').map((s) => s.split(':'));
const minOn = Number(args.min ?? 3);
const waitMs = Number(args.wait ?? 16000);
const retro = args.retro ?? 'crt';
const rate = Number(args.rate ?? 2.5);
const extra = args.extra ?? '';
const modes = (args.modes ?? '3d,sprites').split(',');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const results = [];
// A shot is stage:beat[:afterMs[:a]] — per-shot extra wait after the busy check, 'a' = autoplay on.
for (const [stage, beat, afterShot, autoShot] of shots) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.routeWebSocket(/.*/, () => {});
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && !/403/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  if (args.flash) await page.addInitScript(() => (window.__snapFlash = true));
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
  const auto = (autoShot ? autoShot === 'a' : !args.noauto) ? '&autoplay=1' : '';
  const url = `${base}/?stage=${stage}&beat=${beat}&god=1${auto}&retro=${retro}&seed=7&art=sprites&mute=1${extra}`;
  await page.goto(url, { waitUntil: 'load' });
  const t0 = Date.now();
  let busy = 0;
  while (Date.now() - t0 < waitMs) {
    await page.waitForTimeout(250);
    busy = await page.evaluate(
      ([rate]) => {
        const g = window.__game;
        const w = g?.world;
        if (!w || g.state !== 'playing') return -1;
        if (g.autoplay) g.autoplay.rate = rate;
        let n = 0;
        for (const e of w.enemies()) if (!e.removed && e.state !== 'dying' && e.hostile && e.onScreen(0.85)) n += e.isBoss ? 10 : 1;
        return n;
      },
      [rate],
    );
    if (busy >= minOn) break;
  }
  const after = Number(afterShot ?? args.after ?? 0);
  if (after > 0) await page.waitForTimeout(after);
  const freeze = await page.evaluate(() => {
    const g = window.__game;
    if (!g?.world) return null;
    // Hard freeze: no entity update at all (some animations ease per frame, not per dt).
    g.world.timeScale = 0;
    g.world.update = () => 0;
    g.runner.update = () => {};
    g.autoplay = null;
    // --flash: the boss (or the nearest enemy) is mid hit-flash in the capture.
    if (window.__snapFlash) {
      const e = g.world.boss ?? g.world.enemies().find((x) => x.state !== 'dying');
      e?.flash(true);
    }
    return { beat: g.runner?.label, entities: g.world.entities.length };
  });
  const row = { stage, beat, busy, freeze, modes: {} };
  for (const mode of modes) {
    // 'sprites@bands=4;inner=0' = ART: SPRITES with a look override (same frozen instant).
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
    const f = `${out}/${stage}-b${beat}-${tag}.png`;
    await page.screenshot({ path: f });
    row.modes[mode] = await page.evaluate(() => {
      const g = window.__game;
      const i = g.engine.renderer.info;
      const sp = g.sprites?.stats;
      return {
        drawCalls: i.render.calls,
        triangles: i.render.triangles,
        textures: i.memory.textures,
        sprites: sp ? { n: sp.sprites, drawn: sp.drawn, rtMB: +(sp.rtBytes / 1048576).toFixed(2) } : null,
      };
    });
    row.modes[mode].file = f;
  }
  row.errors = errors.slice(0, 8);
  results.push(row);
  console.log(JSON.stringify(row));
  await ctx.close();
}
await browser.close();

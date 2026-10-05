#!/usr/bin/env node
/**
 * PixelCast look-dev: places characters in front of the camera, puts them in a
 * pose through REAL game logic (windup, stagger, severed arm, head pop, death,
 * civilians), freezes the game and captures the same instant in every ART mode,
 * plus a montage of zoomed per-character crops (3D | SPRITES side by side).
 *
 *   node scripts/pixel-look.mjs --base http://localhost:5701 --out /tmp/pixel/look/a \
 *     --place "walker@office:-1:3.5,walker@worker:1:4:30:windup=0.9,civ@worker:0:6,raptor@red:2:7::pounce=0.3" \
 *     [--stage "zoo&zooEnv=night"] [--settle 600] [--retro pixel] [--zoom 3] [--dpr 1] [--modes 3d,sprites]
 *
 * A placement is  id[@variant]:right:forward[:yawDeg][:action=arg;action=arg]  (metres from the camera,
 * yaw relative to facing the camera). Actions: windup=progress, stagger=t, sever=L|R|l|r (L/R whole arm,
 * l/r forearm), pop (killing headshot), die=seconds (shot in the chest), pounce=progress (raptors),
 * walk=seconds (keep animating). Writes <out>-<mode>.png and <out>-montage.png; prints stats JSON.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const base = args.base ?? 'http://localhost:5701';
const out = args.out ?? '/tmp/pixel/look/shot';
const modes = (args.modes ?? '3d,sprites').split(',');
const retro = args.retro ?? 'pixel';
const settle = Number(args.settle ?? 500);
const zoom = Number(args.zoom ?? 3);
const dpr = Number(args.dpr ?? 1);
const stage = args.stage ?? 'zoo';
const place = (args.place ?? 'walker:0:4')
  .split(',')
  .filter(Boolean)
  .map((p) => {
    const [idv, r, f, yaw, acts] = p.split(':');
    const [id, variant] = idv.split('@');
    return { id, variant: variant ?? null, r: Number(r), f: Number(f), yaw: Number(yaw || 0), acts: acts ?? '' };
  });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.routeWebSocket(/.*/, () => {});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/403/.test(m.text()) && errors.push(m.text()));
await page.addInitScript(() => {
  const iv = setInterval(() => {
    const g = window.__game;
    if (!g?.engine?.retro) return;
    g.engine.applyLevel = () => {};
    g.engine.retro.scale = 1;
    clearInterval(iv);
  }, 20);
});
const zooArg = stage.startsWith('zoo') ? '&zoo=none' : '';
await page.goto(`${base}/?stage=${stage}${zooArg}&god=1&retro=${retro}&seed=7&mute=1&art=3d`, { waitUntil: 'load' });
const t0 = Date.now();
while (Date.now() - t0 < 25000) {
  await page.waitForTimeout(250);
  if (await page.evaluate(() => window.__game?.state === 'playing' && !!window.__game.world)) break;
}
const info = await page.evaluate(
  async ([place, settle]) => {
    const g = window.__game;
    const w = g.world;
    if (g.autoplay) g.autoplay = null;
    const reg = await import('/src/content/registry.ts');
    // Import the game's OWN Civilian module (the dev server may have cache-busted it with ?t=…).
    const civUrl = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.includes('/src/gameplay/Civilian.ts')).pop() ?? '/src/gameplay/Civilian.ts';
    const { Civilian } = await import(civUrl);
    const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => null);
    const cam = w.camera;
    cam.updateMatrixWorld();
    const V = cam.position.constructor;
    const fwd = cam.getWorldDirection(new V()).setY(0).normalize();
    const right = new V(-fwd.z, 0, fwd.x);
    const camPos = cam.getWorldPosition(new V());
    // Clear the arena.
    for (const e of w.entities) if (e.hostile || e instanceof Civilian) e.removed = true;
    w.update(1 / 60);
    const list = [];
    for (const p of place) {
      const pos = camPos.clone().addScaledVector(fwd, p.f).addScaledVector(right, p.r);
      pos.y = w.groundAt(pos.x, pos.z);
      let e;
      if (p.id === 'civ') {
        e = new Civilian(w, pos, 'world', p.variant ?? 'worker');
        w.add(e);
      } else {
        const opts = p.variant ? { variant: p.variant } : {};
        e = reg.createEnemy(p.id, w, { pos, frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts });
        w.add(e);
      }
      list.push({ e, p });
    }
    const face = () => {
      for (const { e, p } of list) {
        const yaw = Math.atan2(camPos.x - e.root.position.x, camPos.z - e.root.position.z) + (p.yaw * Math.PI) / 180;
        e.root.rotation.y = yaw;
      }
    };
    face();
    const hitAt = (e, obj, part, damage = 1) => {
      const point = obj.getWorldPosition(new V());
      const dir = point.clone().sub(camPos).normalize();
      return { object: obj, part, point, normal: null, dir, distance: point.distanceTo(camPos), damage, weapon: 'pistol', assisted: false, screenX: 400, screenY: 200 };
    };
    // Settle (walk in), keep facing the camera.
    const n = Math.round(settle / 16.7);
    for (let i = 0; i < n; i++) {
      w.update(1 / 60);
      face();
    }
    const done = [];
    for (const { e, p } of list) {
      for (const a of p.acts.split(';').filter(Boolean)) {
        const [k, v] = a.split('=');
        if (k === 'windup' && e.setState) {
          e.setState('windup');
          const T = e.windup * Number(v ?? 0.8);
          for (let t = 0; t < T; t += 1 / 60) e.update(1 / 60);
        } else if (k === 'stagger') {
          e.stagger();
          for (let t = 0; t < Number(v ?? 0.1); t += 1 / 60) e.update(1 / 60);
        } else if (k === 'sever') {
          const side = v === 'L' || v === 'l' ? 1 : -1;
          const whole = v === 'L' || v === 'R';
          const arm = side > 0 ? e.r.armL : e.r.armR;
          const mesh = (whole ? arm.upper : arm.lower) ?? arm.shoulder.children[0];
          e.sever(side, whole, hitAt(e, whole ? arm.shoulder : arm.elbow, 'limb', 4));
          for (let t = 0; t < 0.05; t += 1 / 60) e.update(1 / 60);
          void mesh;
        } else if (k === 'pop') {
          const h = e.headAnchor ?? e.anchor;
          e.onShot(hitAt(e, h, 'head', 9));
          for (let t = 0; t < Number(v || 0.15); t += 1 / 60) w.update(1 / 60);
        } else if (k === 'die') {
          e.onShot(hitAt(e, e.anchor, 'torso', 9));
          for (let t = 0; t < Number(v || 0.4); t += 1 / 60) w.update(1 / 60);
        } else if (k === 'pounce') {
          e.setState('windup');
          for (let t = 0; t < e.windup; t += 1 / 60) e.update(1 / 60);
          for (let t = 0; t < e.pounceDur * Number(v || 0.4); t += 1 / 60) e.update(1 / 60);
        } else if (k === 'walk') {
          for (let t = 0; t < Number(v || 0.3); t += 1 / 60) {
            w.update(1 / 60);
            face();
          }
        } else if (k === 'hit') {
          e.onShot(hitAt(e, e.anchor, 'torso', 0.4));
        }
      }
      done.push(`${p.id}:${e.state ?? '-'}`);
    }
    w.timeScale = 0;
    w.update = () => 0;
    g.runner.update = () => {};
    void THREE;
    window.__lookList = list.map((x) => x.e);
    return { done };
  },
  [place, settle],
);

const boxes = {};
const rows = {};
for (const mode of modes) {
  await page.evaluate((mode) => {
    const g = window.__game;
    const [art, spec] = mode.split('@');
    g.flags.art = art;
    g.settingsChanged(g.save.settings);
    if (g.sprites && spec) {
      for (const kv of spec.split(';').filter(Boolean)) {
        const [k, v] = kv.split('=');
        g.sprites.look[k] = Number(v);
      }
    }
    g.sprites?.invalidate();
  }, mode);
  await page.waitForTimeout(1200);
  const f = `${out}-${mode.replace(/[@;=]/g, '_')}.png`;
  await page.screenshot({ path: f });
  const r = await page.evaluate(() => {
    const g = window.__game;
    const cam = g.world.camera;
    const sp = g.sprites?.stats;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bx = window.__lookList.map((e) => {
      const b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
      const V = cam.position.constructor;
      const v = new V();
      e.root.updateMatrixWorld(true);
      e.root.traverseVisible((o) => {
        if (!o.isMesh || !o.geometry) return;
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld).project(cam);
          const x = (v.x * 0.5 + 0.5) * vw;
          const y = (-v.y * 0.5 + 0.5) * vh;
          b.x0 = Math.min(b.x0, x);
          b.x1 = Math.max(b.x1, x);
          b.y0 = Math.min(b.y0, y);
          b.y1 = Math.max(b.y1, y);
        }
      });
      return b;
    });
    const i = g.engine.renderer.info;
    return { boxes: bx, calls: i.render.calls, sprites: sp ? { drawn: sp.drawn, paints: sp.paints, prims: sp.prims, overflow: sp.primOverflow, rt: sp.rtBytes, fallbacks: sp.fallbacksTotal } : null };
  });
  boxes[mode] = r.boxes;
  rows[mode] = { calls: r.calls, sprites: r.sprites };
}
// Montage: per character, the same crop in every mode side by side (nearest-neighbour zoom).
const crops = (boxes[modes[0]] ?? []).map((b) => {
  const pad = 6;
  return [Math.max(0, Math.floor(b.x0 - pad)), Math.max(0, Math.floor(b.y0 - pad)), Math.min(844, Math.ceil(b.x1 + pad)), Math.min(390, Math.ceil(b.y1 + pad))];
});
const py = `
from PIL import Image
modes = ${JSON.stringify(modes.map((m) => m.replace(/[@;=]/g, '_')))}
crops = ${JSON.stringify(crops)}
z = ${zoom}
d = ${dpr}
ims = {m: Image.open('${out}-' + m + '.png').convert('RGB') for m in modes}
tiles = []
for c in crops:
    x0, y0, x1, y1 = [int(v * d) for v in c]
    if x1 <= x0 or y1 <= y0: continue
    row = [ims[m].crop((x0, y0, x1, y1)) for m in modes]
    row = [r.resize((r.width * z // d, r.height * z // d), Image.NEAREST) for r in row]
    tiles.append(row)
if tiles:
    W = max(sum(r.width for r in row) + 8 * (len(row) - 1) for row in tiles)
    H = sum(row[0].height for row in tiles) + 8 * (len(tiles) - 1)
    out = Image.new('RGB', (W, H), (40, 40, 48))
    y = 0
    for row in tiles:
        x = 0
        for r in row:
            out.paste(r, (x, y)); x += r.width + 8
        y += row[0].height + 8
    out.save('${out}-montage.png')
`;
writeFileSync('/tmp/pixel-look-montage.py', py);
try {
  execFileSync('python3', ['/tmp/pixel-look-montage.py']);
} catch (e) {
  errors.push('montage: ' + e.message);
}
// Raw sprite texels (exact pixel art, ×4) for every painted / baked character sprite.
if (modes.includes('sprites')) {
  await page.evaluate(() => {
    const g = window.__game;
    g.flags.art = 'sprites';
    g.settingsChanged(g.save.settings);
    g.sprites?.invalidate();
  });
  // (Software GL is slow at dpr 2: give every sprite time to repaint.)
  await page.waitForTimeout(1000 + 1500 * (dpr - 1));
  const url = await page.evaluate((bg) => {
    const g = window.__game;
    const sp = g.sprites;
    if (!sp) return null;
    const r = g.engine.renderer;
    const tiles = [];
    for (const e of window.__lookList) {
      const s = sp.sprites.get(e.root);
      if (!s?.rt || !s.ready) continue;
      const buf = new Uint8Array(s.tw * s.th * 4);
      r.readRenderTargetPixels(s.rt, 0, 0, s.tw, s.th, buf);
      tiles.push({ w: s.tw, h: s.th, buf });
    }
    const Z = 4;
    const W = tiles.reduce((a, t) => a + t.w * Z + 12, 12);
    const H = tiles.reduce((a, t) => Math.max(a, t.h * Z + 24), 24);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    let ox = 12;
    for (const t of tiles) {
      for (let j = 0; j < t.h; j++) {
        for (let i = 0; i < t.w; i++) {
          const o = (j * t.w + i) * 4;
          if (t.buf[o + 3] === 0) continue;
          x.fillStyle = `rgb(${t.buf[o]},${t.buf[o + 1]},${t.buf[o + 2]})`;
          x.fillRect(ox + i * Z, 12 + (t.h - 1 - j) * Z, Z, Z);
        }
      }
      ox += t.w * Z + 12;
    }
    return c.toDataURL('image/png');
  }, args.bg ?? '#7a8a96');
  if (url) writeFileSync(`${out}-texels.png`, Buffer.from(url.split(',')[1], 'base64'));
}
console.log(JSON.stringify({ info, rows, errors: errors.slice(0, 6) }));
await browser.close();

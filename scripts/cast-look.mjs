#!/usr/bin/env node
/**
 * PIXEL CAST 2 look-dev sheets: the SAME frozen instant painted in each cast look
 * (`castlook` 0 = the look before, b = the cel look), as RAW SPRITE TEXELS
 * (each texel × zoom, no scene, no CRT) — rows = subjects, columns = looks, labelled.
 * With `--cols N` and one look, the subjects are laid out N to a row instead (view
 * sheets: one outfit per row, front / three-quarter / side / back across).
 *
 *   node scripts/cast-look.mjs --base http://localhost:5802 --out /tmp/pw2/castlook/walkers \
 *     --place "walker@office:-1.4:3.2,walker@worker:0.2:4.5:20:windup=0.8,civ@worker:1.6:4::pose=cower" \
 *     [--looks 0,b] [--cols 4] [--stage "zoo&zooEnv=night"] [--zoom 4] [--settle 500] [--bg "#7a8a96"] [--frames]
 *   node scripts/cast-look.mjs --shot z1:13:420 --pick 2 …      (a real stage instant: its biggest sprites)
 *
 * A placement is  id[@variant]:right:forward[:yawDeg][:action=arg;…]  (as scripts/pixel-look.mjs;
 * civilians also take pose=<phase>[/seconds]: plead, cower, flee, backaway, hide, thanks).
 * Writes <out>-sheet.png, <out>-<look>.png (the frame, with --frames) and prints stats JSON
 * (primitives per figure and texel size per look).
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const base = args.base ?? 'http://localhost:5802';
const out = args.out ?? '/tmp/pw2/castlook/sheet';
const looks = (args.looks ?? '0,b').split(',');
const zoom = Number(args.zoom ?? 4);
const settle = Number(args.settle ?? 500);
const stage = args.stage ?? 'zoo';
const shot = args.shot ? args.shot.split(':') : null;
const pick = Number(args.pick ?? 3);
const vw = Number(args.vw ?? 844);
const vh = Number(args.vh ?? 390);
const dsf = Number(args.dsf ?? 1);
const retro = args.retro ?? 'pixel';
mkdirSync(dirname(out), { recursive: true });
const place = (args.place ?? (shot ? '' : 'walker:0:4'))
  .split(',')
  .filter(Boolean)
  .map((p) => {
    const [idv, r, f, yaw, acts] = p.split(':');
    const [id, variant] = idv.split('@');
    return { id, variant: variant ?? null, r: Number(r), f: Number(f), yaw: Number(yaw || 0), acts: acts ?? '', label: idv + (acts ? ' ' + acts : '') };
  });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
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
if (!args.hud) await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = '#hud, #overlay2d { visibility: hidden !important; }';
    document.head.appendChild(s);
  });
});
let labels = [];
if (shot) {
  const [st, beat, frames] = shot;
  await page.goto(`${base}/?stage=${st}&beat=${beat}&god=1&seed=7&mute=1&retro=${retro}&art=${args.art ?? 'sprites'}&speed=0.00001`, { waitUntil: 'load' });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await page.waitForTimeout(250);
    if (await page.evaluate(() => window.__game?.state === 'playing' && !!window.__game.world)) break;
  }
  labels = await page.evaluate(
    ([frames, pick]) => {
      const g = window.__game;
      const w = g.world;
      w.timeScale = 1;
      for (let i = 0; i < frames; i++) {
        const sdt = w.update(1 / 60);
        g.runner.update(sdt);
      }
      w.timeScale = 0;
      w.update = () => 0;
      g.runner.update = () => {};
      // The on-screen hostiles / civilians nearest the camera.
      const cam = w.camera;
      const V = cam.position.constructor;
      const cp = cam.getWorldPosition(new V());
      const list = [];
      for (const e of w.entities) {
        if (e.removed || !e.paintPixels || !e.root.visible) continue;
        const p = e.root.getWorldPosition(new V());
        const n = p.clone().setY(p.y + 1).project(cam);
        if (n.z > 1 || Math.abs(n.x) > 1.05 || Math.abs(n.y) > 1.2) continue;
        list.push({ e, d: p.distanceTo(cp) });
      }
      list.sort((a, b) => (b.e.constructor.name.includes('Boss') ? 1e3 : 0) - (a.e.constructor.name.includes('Boss') ? 1e3 : 0) + a.d - b.d);
      window.__lookList = list.slice(0, pick).map((x) => x.e);
      return window.__lookList.map((e) => `${e.constructor.name} ${Math.round(e.root.getWorldPosition(new V()).distanceTo(cp) * 10) / 10}m`);
    },
    [Number(frames), pick],
  );
} else {
  const zooArg = stage.startsWith('zoo') ? '&zoo=none' : '';
  await page.goto(`${base}/?stage=${stage}${zooArg}&god=1&retro=${retro}&seed=7&mute=1&art=sprites`, { waitUntil: 'load' });
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    await page.waitForTimeout(250);
    if (await page.evaluate(() => window.__game?.state === 'playing' && !!window.__game.world)) break;
  }
  if (args.pre) await page.waitForTimeout(Number(args.pre));
  await page.evaluate(
    async ([place, settle]) => {
      const g = window.__game;
      const w = g.world;
      if (g.autoplay) g.autoplay = null;
      const reg = await import('/src/content/registry.ts');
      const civUrl = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.includes('/src/gameplay/Civilian.ts')).pop() ?? '/src/gameplay/Civilian.ts';
      const { Civilian } = await import(civUrl);
      const cam = w.camera;
      cam.updateMatrixWorld();
      const V = cam.position.constructor;
      const fwd = cam.getWorldDirection(new V()).setY(0).normalize();
      const right = new V(-fwd.z, 0, fwd.x);
      const camPos = cam.getWorldPosition(new V());
      for (const e of w.entities) if (e.hostile || e instanceof Civilian) e.removed = true;
      w.update(1 / 60);
      const list = [];
      for (const p of place) {
        const pos = camPos.clone().addScaledVector(fwd, p.f).addScaledVector(right, p.r);
        pos.y = w.groundAt(pos.x, pos.z);
        let e;
        if (p.id === 'civ') e = new Civilian(w, pos, 'world', p.variant ?? 'worker');
        else e = reg.createEnemy(p.id, w, { pos, frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: p.variant ? { variant: p.variant } : {} });
        w.add(e);
        list.push({ e, p, pos });
      }
      const face = () => {
        for (const { e, p } of list) e.root.rotation.y = Math.atan2(camPos.x - e.root.position.x, camPos.z - e.root.position.z) + (p.yaw * Math.PI) / 180;
      };
      face();
      const hitAt = (e, obj, part, damage = 1) => {
        const point = obj.getWorldPosition(new V());
        const dir = point.clone().sub(camPos).normalize();
        return { object: obj, part, point, normal: null, dir, distance: point.distanceTo(camPos), damage, weapon: 'pistol', assisted: false, screenX: 400, screenY: 200 };
      };
      const n = Math.round(settle / 16.7);
      for (let i = 0; i < n; i++) {
        w.update(1 / 60);
        face();
      }
      for (const { e, p, pos } of list) {
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
            e.sever(side, whole, hitAt(e, whole ? arm.shoulder : arm.elbow, 'limb', 4));
            for (let t = 0; t < 0.05; t += 1 / 60) e.update(1 / 60);
          } else if (k === 'pop') {
            e.onShot(hitAt(e, e.headAnchor ?? e.anchor, 'head', 9));
            for (let t = 0; t < Number(v || 0.15); t += 1 / 60) w.update(1 / 60);
          } else if (k === 'pounce') {
            e.setState('windup');
            for (let t = 0; t < e.windup; t += 1 / 60) e.update(1 / 60);
            for (let t = 0; t < e.pounceDur * Number(v || 0.4); t += 1 / 60) e.update(1 / 60);
          } else if (k === 'walk') {
            for (let t = 0; t < Number(v || 0.3); t += 1 / 60) {
              w.update(1 / 60);
              face();
            }
          } else if (k === 'pose' && e.debugPose) {
            // Civilians: hold a phase on the spot (plead / cower / flee …), `phase/seconds`.
            const [ph, sec] = (v ?? 'plead').split('/');
            e.root.position.copy(pos);
            e.debugPose(ph, Number(sec ?? (ph === 'cower' ? 1.2 : ph === 'flee' ? 0.4 : 0.3)), ph === 'cower' ? { peek: 0 } : {});
            e.root.position.copy(pos);
            e.root.updateMatrixWorld(true);
          }
        }
      }
      w.timeScale = 0;
      w.update = () => 0;
      g.runner.update = () => {};
      window.__lookList = list.map((x) => x.e);
    },
    [place, settle],
  );
  labels = place.map((p) => p.label);
}

const tiles = {};
const stats = {};
for (const look of looks) {
  await page.evaluate((look) => {
    window.__castLook(look);
    window.__game.sprites?.invalidate();
  }, look);
  await page.waitForTimeout(Number(args.wait ?? 1100));
  if (args.frames) await page.screenshot({ path: `${out}-${look}.png` });
  if (args.notiles) continue;
  const r = await page.evaluate(() => {
    const g = window.__game;
    const sp = g.sprites;
    const r = g.engine.renderer;
    const res = [];
    for (const e of window.__lookList) {
      const s = sp.sprites.get(e.root);
      if (!s?.rt || !s.ready) {
        res.push(null);
        continue;
      }
      const buf = new Uint8Array(s.tw * s.th * 4);
      r.readRenderTargetPixels(s.rt, 0, 0, s.tw, s.th, buf);
      let bin = '';
      for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
      res.push({ w: s.tw, h: s.th, k: s.k, prims: s.prims, data: btoa(bin) });
    }
    return res;
  });
  tiles[look] = r;
  stats[look] = r.map((t) => (t ? { w: t.w, h: t.h, k: t.k, prims: t.prims } : null));
}
await browser.close();
if (args.notiles) {
  console.log(JSON.stringify({ labels, errors: errors.slice(0, 6) }));
  process.exit(0);
}
writeFileSync(`${out}-tiles.json`, JSON.stringify({ looks, labels, zoom, cols: Number(args.cols ?? 0), bg: args.bg ?? '#7a8a96', tiles }));
const py = `
import json, base64, sys
from PIL import Image, ImageDraw
d = json.load(open('${out}-tiles.json'))
looks, labels, Z = d['looks'], d['labels'], d['zoom']
NAMES = {'0': '0  BEFORE (contour)', 'b': 'B  CEL'}
bg = tuple(int(d['bg'][i:i+2], 16) for i in (1, 3, 5))
def tile(t):
    if t is None: return Image.new('RGB', (8, 8), bg)
    raw = base64.b64decode(t['data'])
    im = Image.frombytes('RGBA', (t['w'], t['h']), raw).transpose(Image.FLIP_TOP_BOTTOM)
    out = Image.new('RGB', im.size, bg)
    a = im.split()[3].point(lambda v: 255 if v > 0 else 0)
    out.paste(im.convert('RGB'), (0, 0), a)
    return out.resize((out.width * Z, out.height * Z), Image.NEAREST)
rows = []
rlab = []
N = d.get('cols', 0)
if N and len(looks) == 1:
    ts = [tile(t) for t in d['tiles'][looks[0]]]
    for i in range(0, len(ts), N):
        rows.append(ts[i:i + N] + [Image.new('RGB', (8, 8), bg)] * (N - len(ts[i:i + N])))
        rlab.append('   |   '.join(labels[i:i + N]))
    heads = [NAMES.get(looks[0], looks[0])] + [''] * (N - 1)
else:
    for i, lab in enumerate(labels):
        rows.append([tile(d['tiles'][l][i]) for l in looks])
        rlab.append(lab)
    heads = [NAMES.get(l, l) for l in looks]
pad = 14
nc = len(rows[0])
colw = [max(r[c].width for r in rows) for c in range(nc)]
rowh = [max(t.height for t in r) for r in rows]
W = sum(colw) + pad * (nc + 1)
H = sum(rowh) + (pad + 14) * len(rows) + 30
sheet = Image.new('RGB', (W, H), bg)
dr = ImageDraw.Draw(sheet)
x = pad
for c, l in enumerate(heads):
    dr.text((x, 8), l, fill=(255, 255, 255))
    x += colw[c] + pad
y = 30
for r, row in enumerate(rows):
    x = pad
    dr.text((pad, y), rlab[r], fill=(20, 24, 30))
    y += 14
    for c, t in enumerate(row):
        sheet.paste(t, (x, y + rowh[r] - t.height))
        x += colw[c] + pad
    y += rowh[r] + pad
sheet.save('${out}-sheet.png')
print('${out}-sheet.png', sheet.size)
`;
writeFileSync(`${out}-sheet.py`, py);
try {
  console.log(String(execFileSync('python3', [`${out}-sheet.py`])).trim());
} catch (e) {
  errors.push('sheet: ' + e.message);
}
console.log(JSON.stringify({ labels, stats, errors: errors.slice(0, 6) }));

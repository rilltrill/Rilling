#!/usr/bin/env node
/**
 * PixelCast end-to-end aim check (ART: SPRITES): places characters, paints each
 * one, finds where its SPRITE draws the head / torso (from the exact figure the
 * GPU painted), then shoots a real raycast — the game's own hitboxes, through that
 * screen pixel — and reports which part it hits. A drawn head must be a head hit.
 *
 *   node scripts/pixel-aim.mjs --base http://localhost:5701 \
 *     --place "walker@office:-1:4,walker@worker:1:5:30:windup=0.8,raptor@red:0:8:70"
 */
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const base = args.base ?? 'http://localhost:5701';
const place = (args.place ?? 'walker@office:-1:4,walker@worker:1:5:30,walker@nurse:0:7:-40,raptor@tan:-1.5:8:80,raptor@red:1.5:9:-60')
  .split(',')
  .map((p) => {
    const [idv, r, f, yaw, acts] = p.split(':');
    const [id, variant] = idv.split('@');
    return { id, variant: variant ?? null, r: Number(r), f: Number(f), yaw: Number(yaw || 0), acts: acts ?? '' };
  });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?stage=zoo&zoo=none&god=1&retro=crt&seed=7&mute=1&art=sprites`);
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(250);
  if (await page.evaluate(() => window.__game?.state === 'playing' && !!window.__game.world)) break;
}
await page.evaluate(async (place) => {
  const g = window.__game;
  const w = g.world;
  const reg = await import('/src/content/registry.ts');
  const threeUrl = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /\/deps\/three\.js/.test(n));
  const THREE = await import(threeUrl);
  const cam = w.camera;
  cam.updateMatrixWorld();
  const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const camPos = cam.getWorldPosition(new THREE.Vector3());
  for (const e of w.entities) if (e.hostile) e.removed = true;
  w.update(1 / 60);
  const list = [];
  for (const p of place) {
    const pos = camPos.clone().addScaledVector(fwd, p.f).addScaledVector(right, p.r);
    pos.y = w.groundAt(pos.x, pos.z);
    const e = reg.createEnemy(p.id, w, { pos, frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: p.variant ? { variant: p.variant } : {} });
    w.add(e);
    list.push({ e, p });
  }
  const face = () => {
    for (const { e, p } of list) e.root.rotation.y = Math.atan2(camPos.x - e.root.position.x, camPos.z - e.root.position.z) + (p.yaw * Math.PI) / 180;
  };
  for (let i = 0; i < 20; i++) {
    w.update(1 / 60);
    face();
  }
  for (const { e, p } of list) {
    if (p.acts.startsWith('windup')) {
      e.setState('windup');
      for (let t = 0; t < e.windup * 0.8; t += 1 / 60) e.update(1 / 60);
    }
  }
  w.update = () => 0;
  g.runner.update = () => {};
  g.autoplay = null;
  window.__aim = { list, THREE };
}, place);
// Let a few frames render (sprites are tracked and painted in the frame loop).
await page.waitForTimeout(Number(args.wait ?? 2500));
const res = await page.evaluate(async () => {
  const g = window.__game;
  const w = g.world;
  const { list, THREE } = window.__aim;
  const cam = w.camera;
  w.scene.updateMatrixWorld(true);
  const sp = g.sprites;
  const ray = new THREE.Raycaster();
  const out = [];
  const W = window.innerWidth;
  const H = window.innerHeight;
  for (const { e, p } of list) {
    const s = sp.sprites.get(e.root);
    if (!s) {
      out.push({ who: `${p.id}@${p.variant}`, error: 'no sprite' });
      continue;
    }
    // Paint it now and keep the exact figure the GPU drew.
    sp.gridW = sp.view().grid.width;
    sp.gridH = sp.view().grid.height;
    const ok = sp.paint(s, cam);
    const f = sp.figure;
    if (!ok) {
      out.push({ who: `${p.id}@${p.variant}`, error: 'not painted' });
      continue;
    }
    const want = { head: 1, torso: 2 };
    const row = { who: `${p.id}@${p.variant ?? ''}${p.acts ? ' ' + p.acts : ''}`, texels: `${f.W}x${f.H} k${f.kpx}` };
    for (const [name, code] of Object.entries(want)) {
      // Centroid of the texels the sprite draws as that part, nudged to the nearest such texel.
      let sx = 0;
      let sy = 0;
      let n = 0;
      const pts = [];
      for (let y = 0.5; y < f.H; y++) {
        for (let x = 0.5; x < f.W; x++) {
          const q = f.sample(x, y);
          if (q.layer >= 0 && q.part === code) {
            sx += x;
            sy += y;
            n++;
            pts.push([x, y]);
          }
        }
      }
      if (!n) {
        row[name] = 'not drawn';
        continue;
      }
      let cx = sx / n;
      let cy = sy / n;
      let best = pts[0];
      let bd = Infinity;
      for (const [x, y] of pts) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bd) {
          bd = d;
          best = [x, y];
        }
      }
      [cx, cy] = best;
      // Texel → retro px → NDC → raycast against the game's own hitboxes.
      const rx = f.ox + cx * f.kpx;
      const ry = f.oy + cy * f.kpx;
      const ndc = new THREE.Vector2((rx / sp.gridW) * 2 - 1, (ry / sp.gridH) * 2 - 1);
      ray.setFromCamera(ndc, cam);
      const hits = ray.intersectObjects(w.shootables.active(), false);
      const tag = hits[0]?.object.userData.shot;
      row[name] = tag ? `${tag.part}${tag.owner === e ? '' : ' (other)'}` : 'miss';
      row[name + 'Px'] = [Math.round(((ndc.x + 1) / 2) * W), Math.round(((1 - ndc.y) / 2) * H)];
    }
    out.push(row);
  }
  return out;
});
console.log(JSON.stringify({ res, errors: errors.slice(0, 4) }, null, 1));
await browser.close();

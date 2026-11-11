#!/usr/bin/env node
/**
 * DRAWN FIGURES look-dev (no browser): renders figures to labelled PNG sheets in milliseconds.
 *
 *   node --experimental-strip-types --no-warnings scripts/figure-sheet.mjs --out /tmp/x --sheet turn
 *
 * The figure modules are plain TypeScript (node-safe); this resolves their extensionless imports.
 */
import { registerHooks } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.[a-z]+$/.test(spec)) {
      const url = new URL(spec, ctx.parentURL);
      if (url.protocol === 'file:') {
        const p = fileURLToPath(url);
        if (existsSync(p + '.ts')) return next(spec + '.ts', ctx);
      }
    }
    return next(spec, ctx);
  },
});

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const out = args.out ?? '/tmp/pw3/people/sheet';
mkdirSync(out, { recursive: true });

const { makeFigureRenderer } = await import(`${ROOT}/src/gameplay/pixel/drawn/figure.ts`);
const { WORKER, FLANNEL } = await import(`${ROOT}/src/gameplay/pixel/drawn/outfits.ts`);
const { POSES } = await import(`${ROOT}/src/gameplay/pixel/drawn/poses.ts`);
const { RAMP_TONES } = await import(`${ROOT}/src/gameplay/pixel/drawn/raster.ts`);
const { rampColors } = await import(`${ROOT}/src/gameplay/pixel/drawn/palette.ts`);

const renderer = makeFigureRenderer();
const COLORS = rampColors();

// ─── A tiny sheet: labelled RGB image ─────────────────────────────────────
class Sheet {
  constructor(w, h, bg = 0x6f7f8c) {
    this.w = w;
    this.h = h;
    this.rgb = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) this.put(i, bg);
  }
  put(i, c) {
    this.rgb[i * 3] = (c >> 16) & 255;
    this.rgb[i * 3 + 1] = (c >> 8) & 255;
    this.rgb[i * 3 + 2] = c & 255;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (x + i >= 0 && y + j >= 0 && x + i < this.w && y + j < this.h) this.put((y + j) * this.w + x + i, c);
  }
  /** Blit a rendered figure at scale k, `solid` = filled black silhouette. */
  figure(fig, x, y, k = 1, solid = false) {
    for (let j = 0; j < fig.h; j++) {
      for (let i = 0; i < fig.w; i++) {
        const v = fig.pixels[j * fig.w + i];
        if (!v) continue;
        const c = solid ? 0x101014 : COLORS[v - 1];
        const fx = fig.mirror ? fig.w - 1 - i : i;
        this.rect(x + fx * k, y + j * k, k, k, c);
      }
    }
  }
  text(x, y, s, c = 0xffffff, k = 2) {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = FONT[ch] ?? FONT[' '];
      for (let j = 0; j < 7; j++) {
        for (let i = 0; i < 5; i++) if (g[j]?.[i] === '#') this.rect(cx + i * k, y + j * k, k, k, c);
      }
      cx += 6 * k;
    }
  }
  save(path) {
    const { w, h, rgb } = this;
    const raw = Buffer.alloc(h * (w * 3 + 1));
    for (let j = 0; j < h; j++) {
      raw[j * (w * 3 + 1)] = 0;
      Buffer.from(rgb.buffer, j * w * 3, w * 3).copy(raw, j * (w * 3 + 1) + 1);
    }
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const chunk = (t, d) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(d.length);
      const tb = Buffer.from(t);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(Buffer.concat([tb, d])));
      return Buffer.concat([len, tb, d, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    writeFileSync(path, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
    console.log('wrote', path);
  }
}
let crcT;
function crc32(b) {
  if (!crcT) {
    crcT = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcT[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
const FONT = {};
{
  const src = {
    ' ': '.....|.....|.....|.....|.....|.....|.....',
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.####|#....|#....|#....|#....|#....|.####',
    D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.####|#....|#....|#.###|#...#|#...#|.###.', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '#####|..#..|..#..|..#..|..#..|..#..|#####',
    J: '..###|....#|....#|....#|....#|#...#|.###.', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
    P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
    V: '#...#|#...#|#...#|#...#|.#.#.|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    0: '.###.|#..##|#.#.#|#.#.#|#.#.#|##..#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.', 2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
    3: '####.|....#|....#|.###.|....#|....#|####.', 4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
    6: '.###.|#....|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...', 8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
    9: '.###.|#...#|#...#|.####|....#|....#|.###.', '.': '.....|.....|.....|.....|.....|.##..|.##..', ',': '.....|.....|.....|.....|.##..|..#..|.#...',
    ':': '.....|.##..|.##..|.....|.##..|.##..|.....', '-': '.....|.....|.....|#####|.....|.....|.....', '/': '....#|....#|...#.|..#..|.#...|#....|#....',
    '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##', '(': '..#..|.#...|#....|#....|#....|.#...|..#..', ')': '..#..|...#.|....#|....#|....#|...#.|..#..',
    '=': '.....|.....|#####|.....|#####|.....|.....', '+': '.....|..#..|..#..|#####|..#..|..#..|.....', '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.', '|': '..#..|..#..|..#..|..#..|..#..|..#..|..#..',
  };
  for (const [k, v] of Object.entries(src)) FONT[k] = v.split('|');
}

// ─── Sheets ────────────────────────────────────────────────────────────────
function put(s, fig, cx, base, k, label, solid = false) {
  s.figure(fig, Math.round(cx - (fig.w * k) / 2), base - fig.h * k, k, solid);
  if (label) s.text(Math.round(cx - (label.length * 6 * 2) / 2), base + 6, label);
}

const VIEWS = [
  [0, 'front'],
  [1, '3/4'],
  [2, 'side'],
  [3, '3/4 back'],
  [4, 'back'],
];
const FIGS = [
  ['worker', WORKER],
  ['flannel', FLANNEL],
];

const which = new Set((args.sheet ?? 'turn').split(','));
const px = Number(args.px ?? 180);
const k = Number(args.k ?? 3);
const t0 = performance.now();

if (which.has('turn')) {
  // View turnaround at the working size.
  for (const [name, def] of FIGS) {
    const s = new Sheet(1760, px * k + 60);
    s.text(10, 8, `${name}: turnaround, ${px} texels tall, texels x${k}`);
    VIEWS.forEach(([v, l], i) => put(s, renderer.draw(def, POSES[name === 'worker' ? 'zidle' : 'civstand'], 0, v, px), 180 + i * 340, px * k + 30, k, l));
    s.save(`${out}/turn-${name}.png`);
  }
}
if (which.has('look')) {
  // The working crop: front and three-quarter figure at 180, head / hands enlarged, 110 and 60 at x3.
  const fig = args.fig === 'flannel' ? FLANNEL : WORKER;
  const pose = POSES[args.pose ?? (args.fig === 'flannel' ? 'civstand' : 'zidle')];
  const fr = Number(args.frame ?? 0);
  const s = new Sheet(1760, 900, 0x6f7f8c);
  const v = Number(args.view ?? 0);
  const big = renderer.draw(fig, pose, fr, v, 180);
  s.figure(big, 10, 10, 4);
  s.text(10, 760, `${fig.name} view ${v} 180 x4`);
  // Head crop x8.
  const crop = { ...big };
  const cw = Math.min(big.w, 70);
  const ch = Math.min(big.h, 46);
  const ox = Math.max(0, Math.round((big.w - cw) / 2));
  crop.w = cw; crop.h = ch;
  crop.pixels = new Uint8Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) crop.pixels[j * cw + i] = big.pixels[j * big.w + i + ox];
  s.figure(crop, 760, 10, 8);
  put(s, renderer.draw(fig, pose, fr, v, 110), 900, 860, 3, '110 x3');
  put(s, renderer.draw(fig, pose, fr, v, 60), 1200, 860, 3, '60 x3');
  put(s, renderer.draw(fig, pose, fr, v, 60), 1400, 860, 1, '60');
  put(s, renderer.draw(fig, pose, fr, v, 110), 1520, 860, 1, '110');
  put(s, renderer.draw(fig, pose, fr, v, 180), 1660, 860, 1, '180');
  s.save(`${out}/look-${fig.name}-${v}.png`);
}
if (which.has('anim')) {
  // Animation strips.
  const strips = [
    ['worker', WORKER, 'zshamble', 0],
    ['worker', WORKER, 'zshamble', 2],
    ['flannel', FLANNEL, 'civrun', 0],
    ['flannel', FLANNEL, 'civrun', 2],
  ];
  const k2 = Math.max(1, k - 1);
  const s = new Sheet(1760, (px * k2 + 56) * strips.length);
  strips.forEach(([name, def, pose, view], r) => {
    const frames = POSES[pose];
    const y = (px * k2 + 56) * r + px * k2 + 34;
    s.text(10, y - px * k2 - 26, `${name} ${pose} view ${view} (${frames.length} frames)`);
    frames.forEach((_, i) => put(s, renderer.draw(def, frames, i, view, px), 140 + i * 280, y, k2, `f${i}`));
  });
  s.save(`${out}/anim.png`);
}
if (which.has('states')) {
  // Windup, death, cower, plead.
  const rows = [
    ['worker', WORKER, ['zidle', 'zwindup', 'zlunge', 'zstagger', 'zdeath']],
    ['flannel', FLANNEL, ['civstand', 'civcower', 'civplead', 'civrun']],
  ];
  const k2 = Math.max(1, k - 1);
  const s = new Sheet(1760, (px * k2 + 60) * 2 * 2);
  let row = 0;
  for (const [name, def, poses] of rows) {
    for (const view of [0, 1]) {
      const y = (px * k2 + 60) * row + px * k2 + 34;
      s.text(10, y - px * k2 - 28, `${name} states view ${view}`);
      let x = 100;
      for (const p of poses) {
        const frames = POSES[p];
        for (let i = 0; i < frames.length; i++) {
          if (i > 1 && p !== 'zwindup' && p !== 'zdeath') continue;
          put(s, renderer.draw(def, frames, i, view, px), x, y, k2, `${p}${frames.length > 1 ? ' ' + i : ''}`);
          x += p === 'zdeath' && i === frames.length - 1 ? 340 : 200;
        }
      }
      row++;
    }
  }
  s.save(`${out}/states.png`);
}
if (which.has('sizes')) {
  // Sizes at texel scale, silhouettes.
  const sizes = [60, 110, 180];
  const s = new Sheet(1760, 900);
  let y = 200;
  s.text(10, 8, 'sizes (texels x1 first row, x3 below); solid-black silhouettes');
  for (const [name, def] of FIGS) {
    const pose = POSES[name === 'worker' ? 'zshamble' : 'civrun'];
    let x = 80;
    for (const sz of sizes) {
      for (const v of [0, 1, 2]) {
        put(s, renderer.draw(def, pose, 1, v, sz), x, y, 1, v === 0 ? String(sz) : '');
        put(s, renderer.draw(def, pose, 1, v, sz), x, y + 240, 3, '');
        x += sz * 0.7 + 30;
      }
    }
    y += 0;
    x = 980;
    for (const v of [0, 1, 2, 3]) {
      put(s, renderer.draw(def, pose, 1, v, 60), x, y + 180, 1, '', true);
      x += 60;
    }
    y += 420;
  }
  s.save(`${out}/sizes.png`);
}
if (which.has('solid')) {
  const s = new Sheet(1760, 700);
  s.text(10, 8, 'silhouettes: solid black, the figure at 60 and 110 texels');
  let x = 60;
  for (const [name, def] of FIGS) {
    for (const [pn, fr] of name === 'worker'
      ? [
          ['zidle', 0],
          ['zshamble', 1],
          ['zshamble', 3],
          ['zwindup', 2],
          ['zdeath', 3],
        ]
      : [
          ['civstand', 0],
          ['civrun', 1],
          ['civcower', 0],
          ['civplead', 0],
        ]) {
      for (const v of [0, 1, 2]) {
        put(s, renderer.draw(def, POSES[pn], fr, v, 60), x, 150, 2, '', true);
        put(s, renderer.draw(def, POSES[pn], fr, v, 110), x, 500, 3, '', true);
        x += 120;
      }
    }
    x = 60;
    break;
  }
  s.save(`${out}/solid.png`);
}
console.log(`done in ${(performance.now() - t0).toFixed(0)} ms`);

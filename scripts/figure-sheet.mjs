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
if (which.has('measure')) {
  // Canon, measured on the standing figures at 180 texels tall: the outline of the trunk alone
  // (arms excluded, from the part map) against docs/PIXELWORLD3.md.
  const canon = (name, def, pose) => {
    const f = renderer.draw(def, POSES[pose], 0, 0, 180);
    const headH = 180 / 6.25;
    // (The head as drawn, not a nominal width: rows of the head part below the hat, widest row, ears included.)
    let headW = 0;
    {
      const rows = [];
      for (let y = 0; y < f.h; y++) { let any = false; for (let x = 0; x < f.w; x++) if (f.part[y * f.w + x] === 1) any = true; if (any) rows.push(y); }
      const y0 = rows[0] + Math.floor((rows[rows.length - 1] - rows[0]) * 0.3);
      for (const y of rows) if (y >= y0) { let a = 1e9, b = -1; for (let x = 0; x < f.w; x++) if (f.part[y * f.w + x] === 1) { a = Math.min(a, x); b = Math.max(b, x); } headW = Math.max(headW, b - a + 1); }
    }
    const width = (y, part) => {
      let min = 1e9, max = -1;
      for (let x = 0; x < f.w; x++) {
        const v = f.part[y * f.w + x];
        if (part ? v === part : v !== 0) { if (x < min) min = x; if (x > max) max = x; }
      }
      return max < 0 ? 0 : max - min + 1;
    };
    let crotch = f.h;
    for (let y = f.h - 1; y > f.h * 0.3; y--) {
      let runs = 0, prev = 0;
      for (let x = 0; x < f.w; x++) {
        const on = f.pixels[y * f.w + x] ? 1 : 0;
        if (on && !prev) runs++;
        prev = on;
      }
      if (runs >= 2) crotch = y;
      else if (crotch !== f.h) break;
    }
    const rows = Array.from({ length: f.h }, (_, y) => y);
    const within = (a, b, part) => rows.filter((y) => y > a * f.h && y < b * f.h).map((y) => width(y, part));
    const shoulderAll = Math.max(...within(0.16, 0.3));
    const chest = Math.max(...within(0.2, 0.3, 2));
    const waist = Math.min(...within(0.34, 0.47, 2));
    const hips = Math.max(...within(0.46, 0.55, 2));
    console.log(`${name}: heads tall ${(f.h / headH).toFixed(2)} | shoulders (with arms) ${(shoulderAll / headW).toFixed(2)} head-widths | chest ${(chest / headW).toFixed(2)} | waist ${(waist / headW).toFixed(2)} | hips ${(hips / headW).toFixed(2)} | crotch at ${(((f.h - crotch) / f.h) * 100).toFixed(1)} % of height`);
  };
  canon('worker', WORKER, 'zidle');
  canon('flannel', FLANNEL, 'civstand');
}
if (which.has('perf')) {
  // Raster time per figure (CPU only, single thread): what the frame budget pays for a cache miss.
  for (const [name, def, pose] of [['worker', WORKER, 'zshamble'], ['flannel', FLANNEL, 'civrun']]) {
    for (const size of [60, 110, 180, 300]) {
      let t = 0;
      const N = 200;
      for (let i = 0; i < N; i++) {
        const t0 = performance.now();
        renderer.draw(def, POSES[pose], i % POSES[pose].length, i % 5, size);
        t += performance.now() - t0;
      }
      console.log(`raster ${name} ${size}px: ${(t / N).toFixed(2)} ms`);
    }
  }
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
    ['flannel', FLANNEL, ['civstand', 'civcower', 'civplead']],
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
          if (i > 0 && p !== 'zwindup' && p !== 'zdeath' && p !== 'zstagger') continue;
          put(s, renderer.draw(def, frames, i, view, px), x, y, k2, `${p}${frames.length > 1 ? ' ' + i : ''}`);
          x += p === 'zdeath' && i === frames.length - 1 ? 340 : p === 'zdeath' ? 260 : 200;
        }
      }
      row++;
    }
  }
  s.save(`${out}/states.png`);
}
if (which.has('sizes')) {
  // Texels at x1 (the size the game shows them) and x3; silhouettes at 60.
  const sizes = [60, 110, 180];
  const s = new Sheet(1760, 1060);
  s.text(10, 8, 'sizes: texels x1 (as in the game), x3; solid-black silhouettes at 60');
  let y0 = 40;
  for (const [name, def] of FIGS) {
    const pose = POSES[name === 'worker' ? 'zshamble' : 'civrun'];
    s.text(10, y0, name);
    let x = 110;
    for (const sz of sizes) {
      for (const v of [0, 1, 2]) {
        put(s, renderer.draw(def, pose, 2, v, sz), x, y0 + 210, 1, '');
        x += Math.max(sz * 0.55, 40) + 34;
      }
      x += 30;
    }
    x = 40;
    for (const sz of sizes) {
      for (const v of [0, 1, 2]) {
        const fig = renderer.draw(def, pose, 2, v, sz);
        put(s, fig, x + (fig.w * 3) / 2, y0 + 210 + sz * 3 + 20, 3, `${sz}`);
        x += Math.max(fig.w * 3, 90) + 16;
      }
      x += 10;
    }
    x = 1180;
    for (const v of [0, 1, 2, 3, 4]) {
      put(s, renderer.draw(def, pose, 2, v, 60), x, y0 + 210, 1, '', true);
      x += 52;
    }
    y0 += 530;
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
if (which.has('canon')) {
  // Widths against the head as drawn; tones per ramp (the finish numbers).
  const hu = 180 / 6.25;
  const widths = (name, def) => {
    const TEST = { aL: [0, 62, 0], aR: [0, 62, 0], lL: [0, 3, 0], lR: [0, 3, 0] };
    const f = renderer.draw(def, TEST, 0, 0, 180);
    const rowsOf = (part) => { const r = []; for (let y = 0; y < f.h; y++) { let a = 1e9, b = -1; for (let x = 0; x < f.w; x++) if (f.part[y * f.w + x] === part) { a = Math.min(a, x); b = Math.max(b, x); } if (b >= 0) r.push([y, b - a + 1]); } return r; };
    const head = rowsOf(1);
    const start = head[0][0] + Math.floor((head[head.length - 1][0] - head[0][0]) * 0.3);
    const headW = Math.max(...head.filter(([y]) => y >= start).map(([, w]) => w));
    const tr = rowsOf(2);
    const y0 = tr[0][0], y1 = tr[tr.length - 1][0], n = y1 - y0;
    const up = tr.filter(([y]) => y < y0 + n * 0.35).map(([, w]) => w);
    const mid = tr.filter(([y]) => y > y0 + n * 0.4 && y < y0 + n * 0.72).map(([, w]) => w);
    const lo = tr.filter(([y]) => y >= y0 + n * 0.72).map(([, w]) => w);
    // Standing width over the shoulders, arms included (the idle pose).
    const st = renderer.draw(def, POSES[name === 'worker' ? 'zidle' : 'civstand'], 0, 0, 180);
    const band = []; for (let y = Math.floor(st.h * 0.16); y < st.h * 0.32; y++) { let a = 1e9, b = -1; for (let x = 0; x < st.w; x++) if (st.pixels[y * st.w + x]) { a = Math.min(a, x); b = Math.max(b, x); } band.push(b - a + 1); }
    console.log(`${name}: head ${headW} tx | shoulders standing ${(Math.max(...band) / headW).toFixed(2)} head-widths (${Math.max(...band)} tx) | chest ${Math.max(...up)} tx, waist ${Math.min(...mid)} tx, hips ${Math.max(...lo)} tx = ${(Math.max(...lo) / headW).toFixed(2)} head-widths`);
  };
  widths('worker', WORKER);
  widths('flannel', FLANNEL);
  // Tones used by each ramp in the front idle at 180 (% of that ramp's filled area; tone 0 = ink).
  const NAMES = (await import(`${ROOT}/src/gameplay/pixel/drawn/palette.ts`)).RAMPS.map((r) => r.name);
  for (const [name, def, pose] of [['worker', WORKER, 'zidle'], ['flannel', FLANNEL, 'civstand']]) {
    const f = renderer.draw(def, POSES[pose], 0, 0, 180);
    const hist = {};
    for (let i = 0; i < f.w * f.h; i++) { const v = f.pixels[i]; if (!v) continue; const r = Math.floor((v - 1) / RAMP_TONES); const t = v - 1 - r * RAMP_TONES; (hist[r] ??= [0, 0, 0, 0, 0, 0])[t]++; }
    for (const [r, a] of Object.entries(hist)) {
      const tot = a.reduce((x, y) => x + y, 0);
      if (tot < 180) continue;
      const fill = a.slice(1).reduce((x, y) => x + y, 0);
      console.log(`  ${name} ${NAMES[r].padEnd(10)} ${a.map((v) => String(Math.round((v / tot) * 100)).padStart(3)).join(' ')}   lit (4+5 of fill) ${Math.round(((a[4] + a[5]) / fill) * 100)} %  fill tones ${a.slice(1).filter((v) => v / fill > 0.02).length}`);
    }
  }
}
if (which.has('heads')) {
  // Heads in every view, x6, and hands and feet x4.
  const s = new Sheet(1880, 1040, 0x6f7f8c);
  const crop = (f, y0, h) => ({ ...f, h, pixels: f.pixels.subarray(y0 * f.w, (y0 + h) * f.w), part: f.part.subarray(y0 * f.w, (y0 + h) * f.w) });
  let i = 0;
  for (const [name, def, pose] of [['worker', WORKER, 'zidle'], ['flannel', FLANNEL, 'civstand']]) {
    for (const [v, l] of VIEWS) {
      const f = renderer.draw(def, POSES[pose], 0, v, 180);
      const c = crop(f, 0, Math.min(f.h, 48));
      s.figure(c, 10 + (i % 5) * 370, 20 + Math.floor(i / 5) * 320, 6);
      s.text(10 + (i % 5) * 370, 310 + Math.floor(i / 5) * 320, `${name} ${l}`);
      i++;
    }
  }
  let x = 10;
  for (const [name, def, pose, fr] of [['worker', WORKER, 'zidle', 0], ['flannel', FLANNEL, 'civstand', 0]]) {
    for (const v of [0, 1, 2]) {
      const f = renderer.draw(def, POSES[pose], fr, v, 180);
      s.figure(crop(f, Math.floor(f.h * 0.82), f.h - Math.floor(f.h * 0.82)), x, 660, 3);
      x += 300;
    }
  }
  s.save(`${out}/heads.png`);
}
if (which.has('r2')) {
  // Round two: every thing the judges pointed at, on labelled strips.
  const K = 2;
  const G = 0x6f7f8c;
  const strip = (name, def, pose, views, frames, sz = 180, kk = K, gap = 0) => {
    const f0 = POSES[pose];
    const list = frames ?? f0.map((_, i) => i);
    const s = new Sheet(1880, Math.round(((sz * 1.32) | 0) * kk) * views.length + 40 * views.length, G);
    views.forEach((v, r) => {
      const y0 = (Math.round(sz * 1.32 * kk) + 40) * r;
      s.text(8, y0 + 6, `${def.name} ${pose} view ${v}`);
      list.forEach((i, c) => {
        const fig = renderer.draw(def, f0, i, v, sz);
        const cw = gap || Math.round(1880 / list.length);
        put(s, fig, Math.round(cw * (c + 0.5)), y0 + Math.round(sz * 1.32 * kk) + 8, kk, `${i}`);
      });
    });
    s.save(`${out}/${name}.png`);
  };
  strip('s-shamble', WORKER, 'zshamble', [0, 2], null, 110, 2);
  strip('s-idle-wind', WORKER, 'zwindup', [0, 1, 2], null, 180, 2);
  strip('s-lunge', WORKER, 'zlunge', [0, 1, 2, 3, 4], null, 180, 2);
  strip('s-civrun', FLANNEL, 'civrun', [0, 2], null, 110, 2);
  strip('s-civwalk', FLANNEL, 'civwalk', [0, 2], null, 110, 2);
  strip('s-death', WORKER, 'zdeath', [0, 1, 2], null, 130, 2);
  strip('s-stagger', WORKER, 'zstagger', [0, 2], null, 130, 2);
  strip('s-civ-states', FLANNEL, 'civcower', [0, 1, 2], null, 130, 2);
  strip('s-civ-plead', FLANNEL, 'civplead', [0, 1, 2], null, 130, 2);
}
console.log(`done in ${(performance.now() - t0).toFixed(0)} ms`);

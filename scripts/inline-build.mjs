#!/usr/bin/env node
/**
 * Turns `vite build --mode single` output (dist-single/) into ONE self-contained
 * HTML file: dist-single/overrun.html — JS, CSS, fonts and icons inlined, no
 * service worker, no manifest. Open it from disk (file://), attach it to a
 * message, or host it anywhere (e.g. as a claude.ai artifact) and play.
 *
 *   npm run build:single     # = vite build --mode single && node scripts/inline-build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist-single');
const OUT = path.join(DIST, 'overrun.html');
// Size budget for the one file (it is ≈ 1 MB gzipped). Raised from 3 MB when the six
// PIXEL WORLD stages landed: their environments are painted by code at load (no image
// assets), so the art lives in the script. A claude.ai artifact page takes up to 16 MB.
const LIMIT = 3.5 * 1024 * 1024;
// Size regression check: the committed baseline (the size at HEAD). Growth beyond SLACK fails
// the build so every increase is a conscious one: accept it with
//   SINGLE_SIZE_UPDATE=1 npm run build:single     (rewrites scripts/single-size.json — commit it)
const BASELINE = path.join(ROOT, 'scripts', 'single-size.json');
const SLACK = 64 * 1024;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist-single/index.html not found — run `vite build --mode single` first.');
  process.exit(1);
}

let html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const read = (ref) => {
  const f = path.join(DIST, ref.replace(/^\.?\//, ''));
  if (!fs.existsSync(f)) throw new Error(`referenced file missing: ${ref}`);
  return fs.readFileSync(f, 'utf8');
};
const dataUri = (file, mime) => `data:${mime};base64,${fs.readFileSync(path.join(ROOT, file)).toString('base64')}`;

/** Make text safe inside <script>…</script> without changing what the JS means. */
const scriptSafe = (js) => js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

let scripts = 0;
let styles = 0;

// <script type="module" crossorigin src="./assets/index-*.js"></script>
html = html.replace(/<script\b([^>]*?)\ssrc="([^"]+)"([^>]*)><\/script>/g, (m, pre, src, post) => {
  if (/^(https?:)?\/\//.test(src)) return m;
  scripts++;
  const attrs = `${pre}${post}`.replace(/\s+crossorigin(="[^"]*")?/g, '');
  return `<script${attrs}>${scriptSafe(read(src))}</script>`;
});

// <link rel="stylesheet" crossorigin href="./assets/style-*.css">
html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, (m) => {
  const href = /href="([^"]+)"/.exec(m)?.[1];
  if (!href || /^(https?:)?\/\//.test(href)) return m;
  styles++;
  let css = read(href);
  // Every browser that can run the game reads WOFF2: drop the bulky WOFF fallbacks.
  css = css.replace(/,\s*url\(["']?data:font\/woff;base64,[^)]*\)\s*format\(["']?woff["']?\)/g, '');
  return `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
});

// Module preloads are meaningless once everything is inline.
html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>\s*/g, '');
// No manifest / service worker for a single file.
html = html.replace(/<link\b[^>]*rel="manifest"[^>]*>\s*/g, '');
// Icons as data URIs.
html = html.replace(/(<link\b[^>]*rel="icon"[^>]*href=")[^"]+(")/, `$1${dataUri('public/icon.svg', 'image/svg+xml')}$2`);
html = html.replace(
  /(<link\b[^>]*rel="apple-touch-icon"[^>]*href=")[^"]+(")/,
  `$1${dataUri('public/apple-touch-icon.png', 'image/png')}$2`,
);
html = html.replace(/<link\b[^>]*rel="apple-touch-startup-image"[^>]*>\s*/g, '');

if (scripts === 0) throw new Error('no <script src> found to inline');
const leftovers = html.match(/(src|href)="\.?\/?assets\/[^"]+"/g);
if (leftovers) throw new Error(`un-inlined references remain: ${leftovers.join(', ')}`);

fs.writeFileSync(OUT, html);
const size = Buffer.byteLength(html);
console.log(
  `[single] ${path.relative(ROOT, OUT)}: ${(size / 1024).toFixed(0)} KB ` +
    `(${scripts} script${scripts === 1 ? '' : 's'}, ${styles} stylesheet${styles === 1 ? '' : 's'} inlined)`,
);
if (size > LIMIT) {
  console.error(`[single] WARNING: ${(size / 1048576).toFixed(2)} MB exceeds the ${LIMIT / 1048576} MB budget`);
  process.exitCode = 1;
}
let base = null;
try {
  base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).bytes;
} catch {}
if (process.env.SINGLE_SIZE_UPDATE) {
  fs.writeFileSync(BASELINE, JSON.stringify({ bytes: size, kb: Math.round(size / 1024), note: 'dist-single/overrun.html size at HEAD (scripts/inline-build.mjs size regression check)' }, null, 2) + '\n');
  console.log(`[single] size baseline updated: ${(size / 1024).toFixed(0)} KB${base ? ` (was ${(base / 1024).toFixed(0)} KB)` : ''}`);
} else if (typeof base === 'number') {
  const d = size - base;
  console.log(`[single] ${d >= 0 ? '+' : ''}${(d / 1024).toFixed(1)} KB vs the committed baseline (${(base / 1024).toFixed(0)} KB)`);
  if (d > SLACK) {
    console.error(`[single] SIZE REGRESSION: ${(d / 1024).toFixed(0)} KB over the baseline (slack ${SLACK / 1024} KB). If intended: SINGLE_SIZE_UPDATE=1 npm run build:single, and commit scripts/single-size.json.`);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
/**
 * Side-by-side sheets of two sets of art frames (scripts/pixel-world.mjs captures of the same
 * shots: `<label>-<mode>.png`, each the 624 × 288 frame at 3×), e.g. the first pass against now.
 *
 *   node scripts/pixel-sheet.mjs --a /tmp/pw2/base --b /tmp/pw2/now --out /tmp/pw2/sheet [--mode pixel] [--zoom 2]
 *
 * Writes <out>/<label>-ab.png (A | B, every frame pixel `zoom` × `zoom`), <out>/sheet.png (all
 * shots, 1:1, A left, B right) and prints, per shot, the share of frame pixels that differ at
 * all and by more than 8 / 24 of 255 on a channel (the parity check: a lamp that flickers or a
 * fire moves under 1 % of a frame between two runs of the same build).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, grid, scale, unscale } from './png.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const A = args.a;
const B = args.b;
const out = args.out ?? '/tmp/pw2/sheet';
const mode = args.mode ?? 'pixel';
const zoom = Number(args.zoom ?? 2);
if (!A || !B) throw new Error('usage: pixel-sheet.mjs --a <dir> --b <dir> --out <dir>');
mkdirSync(out, { recursive: true });
const suffix = `-${mode}.png`;
const labels = readdirSync(A)
  .filter((f) => f.endsWith(suffix) && existsSync(`${B}/${f}`))
  .map((f) => f.slice(0, -suffix.length));
/** A capture back to the 1:1 frame (3× art frames; anything else is taken as it is). */
const frame = (file) => {
  const im = decodePng(readFileSync(file));
  return im.w % 624 === 0 && im.w > 624 ? unscale(im, im.w / 624) : im;
};
const rows = [];
let sum = 0;
for (const label of labels) {
  const a = frame(`${A}/${label}${suffix}`);
  const b = frame(`${B}/${label}${suffix}`);
  let any = 0;
  let d8 = 0;
  let d24 = 0;
  const n = Math.min(a.w * a.h, b.w * b.h);
  for (let i = 0; i < n; i++) {
    const q = i * 4;
    const m = Math.max(Math.abs(a.data[q] - b.data[q]), Math.abs(a.data[q + 1] - b.data[q + 1]), Math.abs(a.data[q + 2] - b.data[q + 2]));
    if (m > 0) any++;
    if (m > 8) d8++;
    if (m > 24) d24++;
  }
  const pc = (v) => `${((100 * v) / n).toFixed(2)}%`.padStart(7);
  console.log(`${label.padEnd(14)} differ ${pc(any)}   > 8: ${pc(d8)}   > 24: ${pc(d24)}`);
  sum += d8 / n;
  const pair = grid([scale(a, zoom), scale(b, zoom)], 2, 6);
  writeFileSync(`${out}/${label}-ab.png`, encodePng(pair.data, pair.w, pair.h));
  rows.push(a, b);
}
console.log(`mean > 8: ${((100 * sum) / Math.max(1, labels.length)).toFixed(2)}%`);
if (rows.length) {
  const sheet = grid(rows, 2, 4);
  writeFileSync(`${out}/sheet.png`, encodePng(sheet.data, sheet.w, sheet.h));
  console.log(`${out}/sheet.png  (${labels.join(', ')})`);
}

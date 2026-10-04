#!/usr/bin/env node
/**
 * Turn the single-file build (dist-single/overrun.html) into a page FRAGMENT for
 * hosting inside another page's document skeleton (e.g. a claude.ai artifact):
 * the host supplies <!doctype>, <html>, <head>, <body>, charset and viewport, so
 * we emit <title>, the inlined <style>s, the body markup and the inlined module
 * script(s) — and drop home-screen/PWA-only tags (manifest, icons, launch
 * images, apple-* metas), which a hosted page can't use.
 *
 *   npm run build:single && node scripts/artifact-build.mjs
 *   → dist-single/overrun-artifact.html
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const src = process.argv[2] ?? 'dist-single/overrun.html';
const out = process.argv[3] ?? 'dist-single/overrun-artifact.html';
const html = readFileSync(src, 'utf8');

const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (!headMatch || !bodyMatch) throw new Error('could not find <head>/<body> in ' + src);
const head = headMatch[1];
let body = bodyMatch[1];

const title = (head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? 'Overrun').trim();
const styles = [...head.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map((m) => m[0]);
const scripts = [...head.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0]);
// Body scripts stay where they are; <noscript> is pointless inside a host page.
body = body.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');

// Hosted pages run in the host's (light) skeleton: commit to the game's dark look.
const hostFix = `<style>
:root { color-scheme: dark; background: #07080c; }
html, body { background: #07080c; height: 100%; overflow: hidden; }
</style>`;

const fragment = [
  `<title>${title}</title>`,
  hostFix,
  ...styles,
  body.trim(),
  ...scripts,
].join('\n');

writeFileSync(out, fragment);
const kb = Math.round(statSync(out).size / 1024);
console.log(`[artifact] ${out}: ${kb} KB (${styles.length} style, ${scripts.length} script; title "${title}")`);
if (fragment.indexOf('<title>') > 8192) throw new Error('title must be within the first 8 KB');

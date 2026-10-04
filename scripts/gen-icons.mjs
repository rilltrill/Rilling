#!/usr/bin/env node
/**
 * Renders every app icon / launch image from public/icon.svg with headless
 * Chromium (Playwright) — no image tooling needed.
 *
 *   node scripts/gen-icons.mjs            # web + iOS + Android (native ones only if the folders exist)
 *   node scripts/gen-icons.mjs --print-links   # also print the <link> tags for index.html
 *
 * Outputs
 *   public/icon-192.png, icon-512.png            manifest icons (purpose "any")
 *   public/icon-maskable-512.png                 manifest icon (purpose "maskable", 80 % safe zone)
 *   public/apple-touch-icon.png                  180×180 iOS home-screen icon
 *   public/splash/apple-splash-W-H.png           iOS PWA launch images (landscape + portrait)
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png   1024×1024, no alpha
 *   ios/App/App/Assets.xcassets/Splash.imageset/*.png                   native launch-screen logo
 *   android/app/src/main/res/mipmap-* /ic_launcher*.png                 launcher + adaptive icon layers
 *   android/app/src/main/res/drawable* /splash.png                      pre-Android-12 launch image
 *
 * Every opaque output is re-encoded as RGB (no alpha channel) — App Store
 * Connect rejects icons with alpha.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toOpaqueRgbPng } from './png-opaque.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BG = [7, 8, 12]; // #07080c
const args = new Set(process.argv.slice(2));

const svgSrc = fs.readFileSync(path.join(ROOT, 'public/icon.svg'), 'utf8');
const { devices } = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/platform/ios-devices.json'), 'utf8'));
const fontB64 = fs
  .readFileSync(path.join(ROOT, 'node_modules/@fontsource/black-ops-one/files/black-ops-one-latin-400-normal.woff2'))
  .toString('base64');

/** The icon with the foreground scaled about the centre (maskable safe zone), optionally without background. */
function iconSvg({ scale = 1, background = true, foreground = true } = {}) {
  let s = svgSrc;
  if (!foreground) s = s.replace('<g id="fg">', '<g id="fg" display="none">');
  if (scale !== 1) s = s.replace('<g id="fg">', `<g id="fg" transform="translate(256 256) scale(${scale}) translate(-256 -256)">`);
  if (!background) s = s.replace(/<rect id="bgrect"[^>]*\/>/, '');
  return `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`;
}

const page0 = (body, css = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Black Ops One'; src: url(data:font/woff2;base64,${fontB64}) format('woff2'); }
html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
${css}
</style></head><body>${body}</body></html>`;

function iconHtml(size, opts) {
  return page0(`<img src="${iconSvg(opts)}" width="${size}" height="${size}" style="display:block">`);
}

/**
 * Launch image: dark vignette, the sight and the OVERRUN wordmark centred.
 * `logoFrac` = sight size as a fraction of the short side.
 */
function splashHtml(w, h, { logoFrac = 0.3, word = true, transparent = false } = {}) {
  const short = Math.min(w, h);
  const mark = Math.round(short * logoFrac);
  const font = Math.round(short * 0.105);
  // Flat background (a full-screen gradient makes each launch PNG ~500 KB); the
  // glow comes from the logo's drop-shadow, which stays compact.
  const bg = transparent ? 'transparent' : '#07080c';
  return page0(
    `<div class="s">
       <img src="${iconSvg({ background: false })}" width="${mark}" height="${mark}">
       ${word ? '<div class="w">OVERRUN</div>' : ''}
     </div>`,
    `.s { width:${w}px; height:${h}px; background:${bg}; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:${Math.round(font * 0.12)}px; }
     .s img { display:block; filter: drop-shadow(0 0 ${Math.round(mark * 0.1)}px rgba(255,60,20,.45)); }
     .w { font-family:'Black Ops One'; font-size:${font}px; letter-spacing:.06em; line-height:1;
          background: linear-gradient(180deg,#ffe7a0 0%,#ff9a3b 45%,#c81010 72%,#5a0000 100%);
          -webkit-background-clip:text; background-clip:text; color:transparent;
          filter: drop-shadow(0 ${Math.max(2, Math.round(font * 0.06))}px 0 #000); }`,
  );
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const page = await ctx.newPage();

async function render(html, w, h, { opaque = true } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h }, omitBackground: !opaque });
  return opaque ? toOpaqueRgbPng(png, BG) : png;
}

function write(rel, buf) {
  const f = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buf);
  console.log(`  ${rel.padEnd(72)} ${(buf.length / 1024).toFixed(1).padStart(7)} KB`);
}

// ─── Web / PWA ──────────────────────────────────────────────────────────────
console.log('web:');
write('public/icon-192.png', await render(iconHtml(192), 192, 192));
write('public/icon-512.png', await render(iconHtml(512), 512, 512));
write('public/icon-maskable-512.png', await render(iconHtml(512, { scale: 0.78 }), 512, 512));
write('public/apple-touch-icon.png', await render(iconHtml(180), 180, 180));

const links = [];
fs.rmSync(path.join(ROOT, 'public/splash'), { recursive: true, force: true });
for (const d of devices) {
  for (const orientation of ['landscape', 'portrait']) {
    const pw = (orientation === 'landscape' ? d.h : d.w) * d.dpr;
    const ph = (orientation === 'landscape' ? d.w : d.h) * d.dpr;
    const file = `splash/apple-splash-${pw}-${ph}.png`;
    write(`public/${file}`, await render(splashHtml(pw, ph), pw, ph));
    links.push(
      `<link rel="apple-touch-startup-image" media="(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: ${orientation})" href="./${file}" />`,
    );
  }
}

// ─── iOS (Capacitor) ────────────────────────────────────────────────────────
const xcassets = 'ios/App/App/Assets.xcassets';
if (fs.existsSync(path.join(ROOT, xcassets))) {
  console.log('ios:');
  write(`${xcassets}/AppIcon.appiconset/AppIcon-512@2x.png`, await render(iconHtml(1024), 1024, 1024));
  // Launch screen logo: transparent, drawn centred (aspect-fit) by LaunchScreen.storyboard
  // over the #07080c background colour, so it works in every orientation and size.
  const logo = await render(splashHtml(1200, 900, { logoFrac: 0.56, transparent: true }), 1200, 900, { opaque: false });
  for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    write(`${xcassets}/Splash.imageset/${n}`, logo);
  }
}

// ─── Android (Capacitor, secondary) ─────────────────────────────────────────
const res = 'android/app/src/main/res';
if (fs.existsSync(path.join(ROOT, res))) {
  console.log('android:');
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, k] of Object.entries(dens)) {
    const legacy = Math.round(48 * k);
    const adaptive = Math.round(108 * k);
    write(`${res}/mipmap-${name}/ic_launcher.png`, await render(iconHtml(legacy), legacy, legacy));
    write(
      `${res}/mipmap-${name}/ic_launcher_round.png`,
      await render(
        page0(`<img src="${iconSvg()}" width="${legacy}" height="${legacy}" style="display:block;border-radius:50%">`),
        legacy,
        legacy,
        { opaque: false },
      ),
    );
    // Adaptive icon (Android 8+): 108dp layers, the launcher masks to roughly the centre 72dp.
    write(
      `${res}/mipmap-${name}/ic_launcher_background.png`,
      await render(iconHtml(adaptive, { foreground: false }), adaptive, adaptive),
    );
    write(
      `${res}/mipmap-${name}/ic_launcher_foreground.png`,
      await render(iconHtml(adaptive, { scale: 0.62, background: false }), adaptive, adaptive, { opaque: false }),
    );
  }
  // Native splash (Android 12+ uses the launcher icon; older versions this drawable).
  const port = await render(splashHtml(480, 800, { logoFrac: 0.42 }), 480, 800);
  const land = await render(splashHtml(800, 480, { logoFrac: 0.42 }), 800, 480);
  for (const dir of fs.readdirSync(path.join(ROOT, res))) {
    if (!dir.startsWith('drawable')) continue;
    if (!fs.existsSync(path.join(ROOT, res, dir, 'splash.png'))) continue;
    write(`${res}/${dir}/splash.png`, dir.includes('land') ? land : port);
  }
}

await browser.close();

if (args.has('--print-links')) {
  console.log('\n<!-- index.html <head> -->');
  console.log('<link rel="apple-touch-icon" href="./apple-touch-icon.png" />');
  for (const l of links) console.log(l);
}

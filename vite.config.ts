import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Emits dist/sw.js from src/platform/sw-template.js after the build, with the
 * list of built files (content-hashed JS/CSS/fonts + icons + index.html) to
 * precache and a version derived from their contents. Build-only: the dev
 * server never sees a service worker. Skipped for the single-file build.
 */
function pwaPlugin(): Plugin {
  let config: ResolvedConfig;
  const SKIP = [/^sw\.js$/, /^splash\//, /\.woff$/, /\.map$/, /(^|\/)\.DS_Store$/, /\.webmanifest\.json$/];
  return {
    name: 'overrun-pwa',
    apply: (_cfg, env) => env.command === 'build' && env.mode !== 'single',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      if (!fs.existsSync(path.join(outDir, 'index.html'))) return;
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, e.name);
          if (e.isDirectory()) walk(abs);
          else files.push(path.relative(outDir, abs).split(path.sep).join('/'));
        }
      };
      walk(outDir);
      const precache = files.filter((f) => !SKIP.some((re) => re.test(f))).sort();
      const hash = createHash('sha256');
      let bytes = 0;
      for (const f of precache) {
        const buf = fs.readFileSync(path.join(outDir, f));
        bytes += buf.length;
        hash.update(f).update(buf);
      }
      const version = hash.digest('hex').slice(0, 12);
      const template = fs.readFileSync(path.resolve(config.root, 'src/platform/sw-template.js'), 'utf8');
      const sw = template
        .replace("'__OVERRUN_VERSION__'", JSON.stringify(version))
        .replace('__OVERRUN_PRECACHE__', JSON.stringify(precache.map((f) => `./${f}`), null, 2));
      fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
      config.logger.info(`[pwa] sw.js v${version}: precaching ${precache.length} files (${(bytes / 1024).toFixed(0)} KB)`);
    },
  };
}

/**
 * A hash of every source file: the version painted PixelWorld atlases are stored
 * under (`content/pixelworld/store.ts`) — any code change repaints them once.
 */
function sourceVersion(root: string): string {
  const hash = createHash('sha256');
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (/\.(ts|js|json|css)$/.test(e.name)) hash.update(path.relative(root, abs)).update(fs.readFileSync(abs));
    }
  };
  walk(path.join(root, 'src'));
  return hash.digest('hex').slice(0, 16);
}

// `--mode single` produces a build whose JS/CSS get inlined into one HTML file
// (see scripts/inline-build.mjs) so the game can be shared as a single page.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [pwaPlugin()],
  define: { __PW_VERSION__: JSON.stringify(sourceVersion(path.dirname(fileURLToPath(import.meta.url)))) },
  build: {
    target: 'es2020',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    // The single-file build needs no PWA files (icons, launch images); the
    // inline script embeds what it needs.
    copyPublicDir: mode !== 'single',
    rollupOptions: mode === 'single' ? { output: { inlineDynamicImports: true } } : {},
  },
  server: { host: true },
  preview: { host: true },
}));

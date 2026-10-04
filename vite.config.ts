import { defineConfig } from 'vite';

// `--mode single` produces a build whose JS/CSS get inlined into one HTML file
// (see scripts/inline-build.mjs) so the game can be shared as a single page.
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    target: 'es2020',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: mode === 'single' ? { output: { inlineDynamicImports: true } } : {},
  },
  server: { host: true },
}));

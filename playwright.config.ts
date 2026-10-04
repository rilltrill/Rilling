import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the production build (vite preview), on a
 * landscape phone in Chromium and an emulated iPhone in WebKit.
 *
 *   npx playwright test --project chromium-phone      # what runs locally
 *   npx playwright test                               # CI: both projects
 *
 * Set E2E_SKIP_BUILD=1 to serve an existing dist/ instead of rebuilding.
 * Screenshots land in test-results/screenshots/<project>/.
 */
const PORT = Number(process.env.E2E_PORT ?? 5141);
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/artifacts',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: CI ? 2 : 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium-phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        launchOptions: {
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
        },
      },
    },
    {
      name: 'webkit-iphone',
      use: { ...devices['iPhone 15 Pro landscape'] },
    },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD
      ? `npx vite preview --port ${PORT} --strictPort`
      : `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

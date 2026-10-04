import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:19006';
const isCI = !!process.env.CI;

/**
 * Mobile web E2E: Playwright drives the Expo web export (served on :19006) against a real local
 * API (:8090, isolated database) and the Firebase Auth emulator. Start everything with
 * `npm run test:mobile:e2e` at the repository root; it serves the build itself, so there is no
 * `webServer` here. Phone-sized viewport: this is the mobile app, not the website.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 2,
  reporter: isCI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], browserName: 'chromium' },
    },
  ],
});

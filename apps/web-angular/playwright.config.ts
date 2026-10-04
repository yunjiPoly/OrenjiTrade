import { defineConfig, devices } from '@playwright/test';
import { E2E_WEB_PORT, newRunId } from './e2e/support/isolation';

/**
 * Playwright configuration for the OrenjiTrade web app.
 *
 * The suite runs on its own stack, never against the developer's `npm run dev` (API :8080, web
 * :4200, database `orenjitrade`): `npm run test:e2e` starts the E2E API on :8180 (database
 * `orenjitrade_e2e`) and `ng serve --configuration e2e` on :4300, whose config.json points at it.
 * The global setup refuses any API without the E2E identity block (e2e/support/isolation.ts).
 * Without the harness (CI, or a stack left by `--keep-running`), the webServer below starts the
 * same dev server unless one already answers.
 */
const baseURL = process.env['E2E_BASE_URL'] ?? `http://localhost:${E2E_WEB_PORT}`;
const webPort = new URL(baseURL).port || String(E2E_WEB_PORT);
const isCI = !!process.env['CI'];

// One id per run, inherited by the workers: every account email is `e2e-<run id>-...@example.test`,
// so the run's Auth emulator accounts can be deleted at the end without touching anything else.
process.env['E2E_RUN_ID'] ??= newRunId();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // e2e/.runtime/config.json (E2E_API_URL) replaces public/config.json in this configuration.
    command: `node e2e/support/runtime-config.mjs && npm start -- --configuration e2e --port ${webPort}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

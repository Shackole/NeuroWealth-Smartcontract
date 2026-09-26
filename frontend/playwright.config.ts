import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for NeuroWealth Stellar Testnet user journey.
 * Configured with Chromium, failure screenshots/traces, and staging/local baseURL.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    /* Base URL set to staging deployment, overridable by environment variables */
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.STAGING_URL || 'https://staging.neurowealth.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  /* Run local webserver when not targeting external staging deployment */
  webServer: (process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.STAGING_URL) ? undefined : {
    command: 'npm run start',
    url: 'http://localhost:3000/en',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});

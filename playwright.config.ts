import { defineConfig, devices } from '@playwright/test';

const headed = process.env['HEADED'] === '1';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  retries: headed ? 0 : 1,
  use: {
    headless: !headed,
    launchOptions: { slowMo: headed ? 600 : 0 },
    baseURL: 'http://localhost:4202',
    trace: headed ? 'off' : 'on-first-retry',
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});

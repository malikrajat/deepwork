import { defineConfig, devices } from '@playwright/test';

const headed = process.env['HEADED'] === '1';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  retries: headed ? 0 : 1,
  // One worker on CI: the suite drives a single dev server, and a shared
  // localStorage is part of what it is testing.
  workers: process.env['CI'] ? 1 : undefined,
  // A stray `.only` would quietly shrink the suite to one test.
  forbidOnly: !!process.env['CI'],
  reporter: [['list'], ['html', { open: 'never' }]],
  // The suite drives the real app, so Playwright starts it: the same Angular
  // dev server by hand would make `npm run e2e` and CI depend on whoever
  // remembered to start it. Local runs reuse a server that is already up.
  webServer: {
    command: 'npx ng serve --port 4202',
    url: 'http://localhost:4202',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  use: {
    headless: !headed,
    launchOptions: { slowMo: headed ? 600 : 0 },
    baseURL: 'http://localhost:4202',
    trace: headed ? 'off' : 'on-first-retry',
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { API_PORT, API_URL, E2E_DATABASE_URL, HOST_KEY, TIMEZONE, WEB_PORT, WEB_URL } from './config';

const root = resolve(__dirname, '..');

/**
 * End-to-end tests against the real API and web app, on their own ports and their own database
 * (slotbook_e2e), so they never touch development data. Tests share that database, so they run
 * one at a time.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: TIMEZONE,
  },
  // NFR-2: phone and desktop sizes. iPhone SE runs in Chromium at the iPhone's size, so only one
  // browser engine needs installing.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-se', use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'node e2e/prepare-db.js && node apps/api/dist/main.js',
      cwd: root,
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        HOST_ACCESS_KEY: HOST_KEY,
        APP_TIMEZONE: TIMEZONE,
        PORT: String(API_PORT),
        WEB_ORIGIN: WEB_URL,
        RATE_LIMIT_MAX: '10000',
        GEMINI_API_KEY: '',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: resolve(root, 'apps/web'),
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { API_PROXY_TARGET: API_URL },
    },
  ],
});

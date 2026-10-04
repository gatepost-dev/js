// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig, devices } from '@playwright/test';

// pnpm check runs Chromium. CI also runs Firefox and WebKit, the engine of Safari.
export default defineConfig({
  testDir: 'test/journeys',
  testMatch: '**/*.test.ts',
  forbidOnly: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: {
    command: 'node test/journeys/serve.mjs',
    url: 'http://localhost:3000/form',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // Firefox would hold the location prompt open. A user who refuses it gets this answer.
        launchOptions: { firefoxUserPrefs: { 'permissions.default.geo': 2 } },
      },
    },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
});

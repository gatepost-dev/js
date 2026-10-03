// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// The field is a custom element, so every test runs in Chromium, and the V8 coverage of those
// tests counts for the floor of T-7. The tests read the source of the core and the client, so
// they need no build of either.
export default defineConfig({
  resolve: {
    alias: {
      '@gatepost/core': source('../core/src/index.ts'),
      '@gatepost/client': source('../client/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // Playwright runs the journeys against the built element, in three browser engines.
    exclude: ['test/journeys/**'],
    setupFiles: ['test/setup.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/spec-messages.ts'],
      thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
    },
  },
});

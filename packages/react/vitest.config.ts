// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const BROWSER_TESTS = ['test/browser.test.ts', 'test/readme.test.ts'];
// Each project gets its own copy, because Vitest names the browser instance after the project.
const chromium = () => ({
  enabled: true,
  headless: true,
  provider: playwright(),
  instances: [{ browser: 'chromium' as const }],
});

// The component supports React 18 and React 19 (TS-19). The browser tests run once with each,
// and React 18 comes in through the aliases react-18 and react-dom-18. The server test renders
// in Node, with no DOM, as a server render of a page does.
export default defineConfig({
  resolve: {
    alias: {
      '@gatepost/core': source('../core/src/index.ts'),
      '@gatepost/client': source('../client/src/index.ts'),
      '@gatepost/field': source('../field/src/index.ts'),
      '@gatepost/react': source('src/index.ts'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
    },
    projects: [
      {
        extends: true,
        test: { name: 'server', include: ['test/server.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: { name: 'react-19', include: BROWSER_TESTS, browser: chromium() },
      },
      {
        extends: true,
        resolve: {
          alias: [
            { find: /^react$/, replacement: 'react-18' },
            { find: /^react\/(.*)$/, replacement: 'react-18/$1' },
            { find: /^react-dom$/, replacement: 'react-dom-18' },
            { find: /^react-dom\/(.*)$/, replacement: 'react-dom-18/$1' },
          ],
        },
        test: { name: 'react-18', include: BROWSER_TESTS, browser: chromium() },
      },
    ],
  },
});

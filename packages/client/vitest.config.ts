// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The tests run against the source of the core, so they need no build of it first.
  resolve: {
    alias: { '@gatepost/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: { branches: 90, functions: 90, lines: 90, statements: 90 },
    },
  },
});

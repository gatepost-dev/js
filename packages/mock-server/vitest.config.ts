// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts runs only as a program. test/main.test.ts starts it in a child process.
      exclude: ['src/main.ts'],
      thresholds: { branches: 90, functions: 90, lines: 90, statements: 90 },
    },
  },
});

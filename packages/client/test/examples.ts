// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { startMockServer, type MockServer } from '@gatepost/mock-server';
import { afterAll, beforeAll } from 'vitest';
import type { Sources } from '../../core/test/examples.js';

/** The modules that the examples of this package import: a client of the mock, and the core. */
export const CLIENT_SOURCES: Sources = {
  '@gatepost/client': fileURLToPath(new URL('example-client.ts', import.meta.url)),
  '@gatepost/core': fileURLToPath(new URL('../../core/src/index.ts', import.meta.url)),
};

/**
 * Starts a mock server for the examples of one test file, and stops it after them.
 */
export function useMockServer(): void {
  let mock: MockServer;
  beforeAll(async () => {
    mock = await startMockServer({ port: 0 });
    process.env['GATEPOST_MOCK_URL'] = mock.url;
  });
  afterAll(async () => {
    await mock.close();
  });
}

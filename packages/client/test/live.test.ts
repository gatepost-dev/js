// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// A few calls that hold on any gateway. By default they go to a mock server. The live workflow
// sets GATEPOST_LIVE_URL, GATEPOST_LIVE_KEY and GATEPOST_LIVE_CODE, a test code from NIPOST's
// docs, and so checks the staging gateway each night. No real response enters the repo.
import process from 'node:process';
import { startMockServer, type MockServer } from '@gatepost/mock-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostcodeClient } from '../src/index.js';

const LIVE_URL = process.env['GATEPOST_LIVE_URL'] ?? '';
let mock: MockServer | undefined;
let client: PostcodeClient;
let code = 'FC-01-Z99-ZZ-01';

beforeAll(async () => {
  if (LIVE_URL === '') {
    mock = await startMockServer({ port: 0 });
    client = new PostcodeClient({ baseUrl: mock.url, apiKey: 'nipost_test_mock_l1' });
    return;
  }
  code = process.env['GATEPOST_LIVE_CODE'] ?? '';
  client = new PostcodeClient({ baseUrl: LIVE_URL, apiKey: process.env['GATEPOST_LIVE_KEY'] });
});

afterAll(async () => {
  await mock?.close();
});

describe('a gateway', () => {
  it('knows the test code at lookup level 1', async () => {
    const result = await client.lookup(code);
    // Each check is a boolean, so that a failure prints no value that the gateway sent.
    expect(result.valid && result.status === 'valid' && result.levelReceived === 1).toBe(true);
  });

  it('offers the state of the test code for its first letter', async () => {
    const result = await client.autocomplete(code.slice(0, 1));
    const states = result.suggestions.map((item) => item.postcode?.canonical);
    expect(result.segment === 'state').toBe(true);
    expect(states.includes(code.slice(0, 2))).toBe(true);
  });

  it('finds no postcode at sea, at latitude 0 and longitude 0', async () => {
    const result = await client.reverse(0, 0);
    expect(!result.found && result.unit === null).toBe(true);
  });
});

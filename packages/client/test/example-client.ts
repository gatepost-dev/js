// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// The examples in the README and in the doc comments show calls to NIPOST's gateway. Their
// tests import this module in place of the package, so each call goes to a mock server.
import process from 'node:process';
import { PostcodeClient as GatewayClient, type ClientOptions } from '../src/index.js';

export { PostcodeError, SPEC_VERSION } from '../src/index.js';

/** A client that calls the mock server that `GATEPOST_MOCK_URL` names, with a mock key. */
export class PostcodeClient extends GatewayClient {
  constructor(options: ClientOptions = {}) {
    const baseUrl = process.env['GATEPOST_MOCK_URL'];
    // With no mock server, a call would go to NIPOST. A test must never call it.
    if (baseUrl === undefined) {
      throw new Error('Start the mock server with useMockServer() before the examples run.');
    }
    super({ ...options, baseUrl, apiKey: 'nipost_test_mock_l3' });
  }
}

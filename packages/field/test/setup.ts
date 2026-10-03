// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, vi } from 'vitest';

const unscripted: string[] = [];

// A test that expects a request scripts fetch itself. Any other request would reach the
// gateway of NIPOST, so it fails the test instead, even when the client hides the error.
beforeEach(() => {
  unscripted.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input);
    unscripted.push(url);
    return Promise.reject(new Error(`A test sent an unscripted request to ${url}.`));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (unscripted.length > 0) {
    throw new Error(`A test sent unscripted requests: ${unscripted.join(', ')}.`);
  }
});

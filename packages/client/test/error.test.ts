// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { clientError, errorForResponse } from '../src/error.js';
import { PostcodeError } from '../src/index.js';

describe('the status map of spec/client.md', () => {
  it.each([
    [401, 'auth_required', 'unauthorized'],
    [402, 'insufficient_credits', 'insufficient_credits'],
    [403, 'origin_not_allowed', 'origin_not_allowed'],
    [403, 'level_not_granted', 'forbidden'],
    [403, null, 'forbidden'],
    [429, 'rate_limited', 'rate_limited'],
    [400, 'invalid_request', 'invalid_input'],
    [404, 'not_found', 'invalid_input'],
    [422, null, 'invalid_input'],
    [499, null, 'invalid_input'],
    [500, 'internal', 'server_error'],
    [502, null, 'server_error'],
    [503, null, 'server_error'],
    [504, null, 'server_error'],
    [204, null, 'server_error'],
    [302, null, 'server_error'],
  ] as const)('maps %i with the API code %s to %s', (status, apiCode, code) => {
    const error = errorForResponse({ status, apiCode, retryAfterMs: null });
    expect([error.code, error.status, error.apiCode]).toEqual([code, status, apiCode]);
  });

  it('names the status and the API code in the message, after the advice', () => {
    const error = errorForResponse({
      status: 403,
      apiCode: 'level_not_granted',
      retryAfterMs: null,
    });
    expect(error.message).toBe(
      "The gateway refused the call. Check the key's scope and lookup level." +
        ' (status 403, level_not_granted)',
    );
  });

  it('keeps the wait that Retry-After asked for', () => {
    const error = errorForResponse({ status: 429, apiCode: null, retryAfterMs: 120_000 });
    expect(error.retryAfterMs).toBe(120_000);
    expect(error.message).toContain('(status 429)');
  });
});

describe('PostcodeError', () => {
  it('is an Error with its own name, and keeps its cause', () => {
    const cause = new TypeError('fetch failed');
    const error = new PostcodeError('network_error', 'No response.', { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PostcodeError');
    expect(error.cause).toBe(cause);
    expect([error.status, error.apiCode, error.retryAfterMs]).toEqual([null, null, null]);
  });
});

describe('clientError', () => {
  it('adds the advice for a failure with no response, and keeps its cause', () => {
    const cause = new TypeError('fetch failed');
    const error = clientError('network_error', '', cause);
    expect(error.message).toBe(
      'The request did not reach the gateway. Check the network and the baseUrl.',
    );
    expect([error.status, error.cause]).toEqual([null, cause]);
  });

  it('gives only the detail for input that fails the check of the client', () => {
    expect(clientError('invalid_input', 'The text is empty.').message).toBe('The text is empty.');
  });

  it('adds the detail after the advice for a reply that the client cannot read', () => {
    const error = clientError('unexpected_response', 'The body has no data field.');
    expect(error.code).toBe('unexpected_response');
    expect(error.message).toBe(
      'The gateway sent a reply that this client cannot read. The body has no data field.',
    );
  });
});

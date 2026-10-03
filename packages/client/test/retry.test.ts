// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostcodeError } from '../src/index.js';
import { retryAfterMs, retryWaitMs } from '../src/retry.js';

const NOW = Date.parse('2026-10-14T09:00:00Z');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('retryAfterMs', () => {
  it.each([
    ['1', 1000],
    [' 120 ', 120_000],
    ['0', 0],
    ['Wed, 14 Oct 2026 09:00:05 GMT', 5000],
    ['Wed, 14 Oct 2026 09:00:00 GMT', 0],
  ])('reads %j as %i ms', (header, waitMs) => {
    expect(retryAfterMs(header, NOW)).toBe(waitMs);
  });

  it.each([null, '', '1.5', '-1', 'soon', 'Wed, 14 Oct 2026 08:59:59 GMT'])(
    'gives null for %j',
    (header) => {
      expect(retryAfterMs(header, NOW)).toBeNull();
    },
  );
});

describe('retryWaitMs', () => {
  const error = (
    code: PostcodeError['code'],
    details: { status?: number; retryAfterMs?: number } = {},
  ) => new PostcodeError(code, 'test', details);

  it('doubles the wait before each retry from 500 ms, with up to 250 ms more at random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(retryWaitMs(error('server_error', { status: 503 }), 1, true)).toBe(500);
    expect(retryWaitMs(error('network_error'), 2, true)).toBe(1000);
    expect(retryWaitMs(error('network_error'), 3, true)).toBe(2000);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(retryWaitMs(error('timeout'), 1, true)).toBeCloseTo(749.75);
  });

  it.each([502, 503, 504])('retries the status %i', (status) => {
    expect(retryWaitMs(error('server_error', { status }), 1, true)).not.toBeNull();
  });

  it.each([
    ['server_error', 500],
    ['server_error', 200],
    ['invalid_input', 400],
    ['unauthorized', 401],
    ['forbidden', 403],
  ] as const)('does not retry %s with status %i', (code, status) => {
    expect(retryWaitMs(error(code, { status }), 1, true)).toBeNull();
  });

  it('does not retry a timeout of autocomplete', () => {
    expect(retryWaitMs(error('timeout'), 1, false)).toBeNull();
  });

  it('waits exactly as long as a Retry-After of 10 seconds or less asks', () => {
    expect(retryWaitMs(error('rate_limited', { retryAfterMs: 10_000 }), 2, true)).toBe(10_000);
  });

  it.each([502, 503, 504])('waits as long as a valid Retry-After asks after a %i', (status) => {
    const wait = retryWaitMs(error('server_error', { status, retryAfterMs: 7000 }), 1, true);
    expect(wait).toBe(7000);
  });

  it('uses its own wait after a 503 with no Retry-After, or with one over 10 seconds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(retryWaitMs(error('server_error', { status: 503 }), 1, true)).toBe(500);
    const long = error('server_error', { status: 503, retryAfterMs: 10_001 });
    expect(retryWaitMs(long, 2, true)).toBe(1000);
  });

  it('ends the call at once for a 429 with a longer Retry-After, or with none', () => {
    expect(retryWaitMs(error('rate_limited', { retryAfterMs: 10_001 }), 1, true)).toBeNull();
    expect(retryWaitMs(error('rate_limited'), 1, true)).toBeNull();
  });
});

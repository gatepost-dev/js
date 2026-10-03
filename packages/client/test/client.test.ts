// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// The rules of the client that no contract scenario tests: the defaults, the option errors,
// shared calls that callers leave, and the cache clock (T-5).
import { describe, expect, it, vi } from 'vitest';
import { PostcodeClient, PostcodeError, type ClientOptions } from '../src/index.js';
import { reasonOf, settle, useFakeClock } from './fake-clock.js';
import { fakeTransport, VALID_LOOKUP, type Answer } from './transport.js';

const KEY = 'nipost_test_mock_l3';

useFakeClock();

function clientWith(options: ClientOptions, ...answers: readonly Answer[]) {
  const fake = fakeTransport(...answers);
  const client = new PostcodeClient({ apiKey: KEY, ...options, transport: fake.transport });
  return { client, requests: fake.requests };
}

describe('the defaults of API-8', () => {
  it('calls https://api.postcode.gov.ng, and sends no key when it has none', async () => {
    const fake = fakeTransport(VALID_LOOKUP);
    await new PostcodeClient({ transport: fake.transport }).lookup('FC-01-Z99-ZZ-01');
    expect(fake.requests[0]?.url.href).toBe(
      'https://api.postcode.gov.ng/v1/lookup?code=FC-01-Z99-ZZ-01&level=1',
    );
    expect(fake.requests[0]?.headers.has('X-API-Key')).toBe(false);
  });

  it('ends an attempt after 8000 ms, and makes two retries', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { client, requests } = clientWith({}, 'hang');
    const call = client.lookup('FC-01-Z99-ZZ-01');
    await vi.advanceTimersByTimeAsync(8000 + 500 + 8000 + 1000 + 7999);
    expect(requests).toHaveLength(3);
    const error = reasonOf(await settle(call, 1)) as PostcodeError;
    expect([error.code, error.status]).toEqual(['timeout', null]);
  });

  it('sends at most 4 requests at a time', async () => {
    const { client, requests } = clientWith({ maxRetries: 0 }, 'hang');
    const calls = ['01', '02', '03', '04', '05'].map((unit) =>
      client.lookup(`FC-01-Z99-ZZ-${unit}`),
    );
    await vi.advanceTimersByTimeAsync(7999);
    expect(requests).toHaveLength(4);
    await Promise.allSettled([...calls, vi.advanceTimersByTimeAsync(8001)]);
    expect(requests).toHaveLength(5);
  });

  it('keeps no result when cacheTtlMs is not set', async () => {
    const { client, requests } = clientWith({}, VALID_LOOKUP);
    await client.lookup('FC-01-Z99-ZZ-01');
    await client.lookup('FC-01-Z99-ZZ-01');
    expect(requests).toHaveLength(2);
  });
});

describe('the options', () => {
  it.each([
    [{ timeoutMs: 0 }, 'timeoutMs must be a number above 0. It is 0.'],
    [{ timeoutMs: Number.NaN }, 'timeoutMs must be a number above 0. It is NaN.'],
    [{ maxRetries: -1 }, 'maxRetries must be a whole number of 0 or more. It is -1.'],
    [{ maxRetries: 1.5 }, 'maxRetries must be a whole number of 0 or more. It is 1.5.'],
    [{ cacheTtlMs: -1 }, 'cacheTtlMs must be a number of 0 or more. It is -1.'],
    [{ cacheTtlMs: Number.POSITIVE_INFINITY }, 'cacheTtlMs must be a number of 0 or more.'],
  ] as const)('refuses %j as a programmer error', (options, message) => {
    expect(() => new PostcodeClient(options)).toThrow(RangeError);
    expect(() => new PostcodeClient(options)).toThrow(message);
  });

  it('refuses a secret key in a web page, and allows a publishable key there', () => {
    vi.stubGlobal('document', {});
    expect(() => new PostcodeClient({ apiKey: 'nipost_live_abc' })).toThrow(TypeError);
    expect(() => new PostcodeClient({ apiKey: 'nipost_test_abc' })).toThrow(
      'A web page must not hold a secret key. Use a publishable key here.',
    );
    expect(() => new PostcodeClient({ apiKey: 'nipost_pk_live_abc' })).not.toThrow();
  });

  it('allows a secret key on a server, where no document exists', () => {
    expect(() => new PostcodeClient({ apiKey: 'nipost_live_abc' })).not.toThrow();
  });

  it('gives two clients their own keys and their own caches (API-9)', async () => {
    const first = clientWith({ apiKey: 'nipost_test_mock_l1', cacheTtlMs: 60_000 }, VALID_LOOKUP);
    const second = clientWith({ apiKey: 'nipost_test_mock_l2', cacheTtlMs: 60_000 }, VALID_LOOKUP);
    await first.client.lookup('FC-01-Z99-ZZ-01');
    await second.client.lookup('FC-01-Z99-ZZ-01');
    expect(first.requests[0]?.headers.get('X-API-Key')).toBe('nipost_test_mock_l1');
    expect(second.requests[0]?.headers.get('X-API-Key')).toBe('nipost_test_mock_l2');
    expect(second.requests).toHaveLength(1);
  });
});

describe('cancellation (API-11)', () => {
  it('sends no request when the signal has aborted already', async () => {
    const { client, requests } = clientWith({}, VALID_LOOKUP);
    const reason = new DOMException('The user left.', 'AbortError');
    const call = client.lookup('FC-01-Z99-ZZ-01', { signal: AbortSignal.abort(reason) });
    await expect(call).rejects.toBe(reason);
    expect(requests).toHaveLength(0);
  });
});

describe('shared calls', () => {
  it('gives the result to a caller that stays when another caller leaves', async () => {
    const { client, requests } = clientWith({}, VALID_LOOKUP);
    const controller = new AbortController();
    const leaving = client.lookup('FC-01-Z99-ZZ-01', { signal: controller.signal });
    const staying = client.lookup('fc 01 z99 zz 01');
    controller.abort();
    await expect(leaving).rejects.toBe(controller.signal.reason);
    expect((await staying).valid).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it('stops the request when every caller has left', async () => {
    const { client, requests } = clientWith({}, 'hang');
    const controllers = [new AbortController(), new AbortController()];
    const calls = controllers.map((controller) =>
      client.autocomplete('FC0', { signal: controller.signal }),
    );
    await vi.advanceTimersByTimeAsync(10);
    for (const controller of controllers) {
      controller.abort();
    }
    await Promise.allSettled(calls);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.signal.aborted).toBe(true);
  });

  it('starts a new request for a call that comes after every caller has left', async () => {
    const { client, requests } = clientWith({}, 'hang', VALID_LOOKUP);
    const controller = new AbortController();
    const first = client.lookup('FC-01-Z99-ZZ-01', { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await Promise.allSettled([first]);
    expect((await client.lookup('FC-01-Z99-ZZ-01')).valid).toBe(true);
    expect(requests).toHaveLength(2);
  });
});

describe('the cache', () => {
  it('keeps a result for cacheTtlMs, and no longer', async () => {
    const { client, requests } = clientWith({ cacheTtlMs: 60_000 }, VALID_LOOKUP);
    await client.lookup('FC-01-Z99-ZZ-01');
    await vi.advanceTimersByTimeAsync(59_999);
    await client.lookup('FC-01-Z99-ZZ-01');
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await client.lookup('FC-01-Z99-ZZ-01');
    expect(requests).toHaveLength(2);
  });

  it('forgets every result on clearCache', async () => {
    const reverse = { status: 200, body: { data: { found: false, radius_m: 25 } } };
    const { client, requests } = clientWith({ cacheTtlMs: 60_000 }, reverse);
    await client.reverse(0, 0);
    client.clearCache();
    await client.reverse(0, 0);
    expect(requests).toHaveLength(2);
  });

  it('keeps one result for each set of arguments', async () => {
    const reverse = { status: 200, body: { data: { found: false, radius_m: 25 } } };
    const { client, requests } = clientWith({ cacheTtlMs: 60_000 }, reverse);
    await client.reverse(0, 0);
    await client.reverse(0, 0, { maxDistanceM: 250 });
    await client.reverse(0, 0);
    expect(requests).toHaveLength(2);
  });
});

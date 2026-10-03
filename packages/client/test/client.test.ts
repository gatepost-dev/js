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

  it('answers a call at once when maxRetries is very large', async () => {
    const { client } = clientWith({ maxRetries: Number.MAX_SAFE_INTEGER }, VALID_LOOKUP);
    expect((await client.lookup('FC-01-Z99-ZZ-01')).valid).toBe(true);
  });

  it('keeps no result when cacheTtlMs is not set', async () => {
    const { client, requests } = clientWith({}, VALID_LOOKUP);
    await client.lookup('FC-01-Z99-ZZ-01');
    await client.lookup('FC-01-Z99-ZZ-01');
    expect(requests).toHaveLength(2);
  });
});

describe('the timeout of autocomplete', () => {
  it('ends an attempt after 15000 ms by default, and a lookup after 8000 ms', async () => {
    const { client, requests } = clientWith({ maxRetries: 0 }, 'hang');
    const lookup = client.lookup('FC-01-Z99-ZZ-01');
    const autocomplete = client.autocomplete('FC0');
    const settled = Promise.allSettled([lookup, autocomplete]);
    await vi.advanceTimersByTimeAsync(7999);
    expect(requests.map((request) => request.signal.aborted)).toEqual([false, false]);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests.map((request) => request.signal.aborted)).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(6999);
    expect(requests[1]?.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests[1]?.signal.aborted).toBe(true);
    await settled;
  });

  it('uses timeoutMs for autocomplete when the option is set', async () => {
    const { client, requests } = clientWith({ maxRetries: 0, timeoutMs: 1000 }, 'hang');
    const settled = Promise.allSettled([client.autocomplete('FC0')]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(requests[0]?.signal.aborted).toBe(true);
    await settled;
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

  it('refuses an empty key as a programmer error, because an empty header is no key', () => {
    expect(() => new PostcodeClient({ apiKey: '' })).toThrow(RangeError);
    expect(() => new PostcodeClient({ apiKey: '' })).toThrow('apiKey must not be empty.');
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

// A transport that answers after a delay, and obeys its signal, as fetch does.
function slowTransport(delayMs: number) {
  const requests: URL[] = [];
  const transport: typeof fetch = (input, init) => {
    requests.push(new URL(input instanceof Request ? input.url : input));
    const signal = init?.signal;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve(new Response(JSON.stringify(VALID_LOOKUP_BODY), { status: 200 }));
      }, delayMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason as Error);
      });
    });
  };
  return { transport, requests };
}

const VALID_LOOKUP_BODY = { data: { postcode: 'FC-01-Z99-ZZ-01', valid: true, status: 'valid' } };

describe('shared calls that obey the signal', () => {
  it('keeps the request for a caller that stays when the other caller leaves', async () => {
    const { transport, requests } = slowTransport(50);
    const client = new PostcodeClient({ transport });
    const controller = new AbortController();
    const leaving = client.lookup('FC-01-Z99-ZZ-01', { signal: controller.signal });
    const staying = client.lookup('FC-01-Z99-ZZ-01');
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await expect(leaving).rejects.toBe(controller.signal.reason);
    await vi.advanceTimersByTimeAsync(100);
    expect((await staying).valid).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it('does not keep a result that a clearCache call overtook', async () => {
    const { transport, requests } = slowTransport(50);
    const client = new PostcodeClient({ transport, cacheTtlMs: 60_000 });
    const first = client.lookup('FC-01-Z99-ZZ-01');
    await vi.advanceTimersByTimeAsync(10);
    client.clearCache();
    await vi.advanceTimersByTimeAsync(100);
    await first;
    const second = client.lookup('FC-01-Z99-ZZ-01');
    await vi.advanceTimersByTimeAsync(100);
    await second;
    expect(requests).toHaveLength(2);
  });
});

describe('the lookup level', () => {
  it('shares and keeps a result for each level', async () => {
    const { client, requests } = clientWith({ cacheTtlMs: 60_000 }, VALID_LOOKUP);
    const [one, two] = await Promise.all([
      client.lookup('FC-01-Z99-ZZ-01', { level: 1 }),
      client.lookup('FC-01-Z99-ZZ-01', { level: 2 }),
    ]);
    expect([one.levelRequested, two.levelRequested]).toEqual([1, 2]);
    expect(requests).toHaveLength(2);
    expect((await client.lookup('FC-01-Z99-ZZ-01', { level: 2 })).levelRequested).toBe(2);
    expect((await client.lookup('FC-01-Z99-ZZ-01', { level: 1 })).levelRequested).toBe(1);
    expect(requests).toHaveLength(2);
  });
});

describe('the cache', () => {
  it('holds a bounded number of results', async () => {
    const reverse = { status: 200, body: { data: { found: false, radius_m: 25 } } };
    const { client, requests } = clientWith({ cacheTtlMs: 60_000 }, reverse);
    for (let lat = 0; lat <= 1100; lat += 1) {
      await client.reverse(lat / 100, 0);
    }
    await client.reverse(0, 0);
    expect(requests).toHaveLength(1102);
  });

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

describe('the share and cache key of each method', () => {
  const reverse: Answer = { status: 200, body: { data: { found: false, radius_m: 25 } } };
  const autocomplete: Answer = {
    status: 200,
    body: { data: { segment: 'state', suggestions: [] } },
  };

  it('keeps reverse calls that differ only in lng apart', async () => {
    const shared = clientWith({}, reverse);
    await Promise.all([shared.client.reverse(9, 7), shared.client.reverse(9, 8)]);
    expect(shared.requests).toHaveLength(2);
    const cached = clientWith({ cacheTtlMs: 60_000 }, reverse);
    await cached.client.reverse(9, 7);
    await cached.client.reverse(9, 8);
    expect(cached.requests).toHaveLength(2);
  });

  it('keeps reverse calls that differ only in lat apart', async () => {
    const { client, requests } = clientWith({}, reverse);
    await Promise.all([client.reverse(9, 7), client.reverse(8, 7)]);
    expect(requests).toHaveLength(2);
  });

  it('uses the normalised text as the key of autocomplete', async () => {
    const shared = clientWith({}, autocomplete);
    await Promise.all([shared.client.autocomplete('fc01'), shared.client.autocomplete('FC 01')]);
    expect(shared.requests).toHaveLength(1);
    const cached = clientWith({ cacheTtlMs: 60_000 }, autocomplete);
    await cached.client.autocomplete('fc01');
    await cached.client.autocomplete('FC 01');
    expect(cached.requests).toHaveLength(1);
  });
});

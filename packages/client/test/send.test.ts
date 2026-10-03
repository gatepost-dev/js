// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// The rules of spec/client.md that no contract scenario tests: cancellation, keys in messages,
// HTTP dates and the clock. A scripted transport and a fake clock stand in for the network and
// for real waits (T-5).
import { describe, expect, it, vi } from 'vitest';
import { PostcodeError } from '../src/index.js';
import { createQueue } from '../src/queue.js';
import type { GatewayRequest } from '../src/requests.js';
import { send, type SendSettings } from '../src/send.js';
import { reasonOf, settle, useFakeClock } from './fake-clock.js';
import { fakeTransport, VALID_LOOKUP, type Answer } from './transport.js';

const KEY = 'nipost_test_mock_l3';
const LOOKUP: GatewayRequest = {
  path: '/v1/lookup',
  query: { code: 'FC-01-Z99-ZZ-01', level: '1' },
};

useFakeClock();

function settingsWith(changes: Partial<SendSettings>, ...answers: readonly Answer[]) {
  const fake = fakeTransport(...answers);
  const settings: SendSettings = {
    baseUrl: 'https://gateway.invalid',
    apiKey: KEY,
    transport: fake.transport,
    timeoutMs: 8000,
    maxRetries: 2,
    queue: createQueue(4),
    ...changes,
  };
  return { settings, requests: fake.requests };
}

function sendLookup(
  settings: SendSettings,
  options: { signal?: AbortSignal; timeoutRetried?: boolean } = {},
): Promise<unknown> {
  const { signal = new AbortController().signal, timeoutRetried = true } = options;
  return send(settings, LOOKUP, { signal, timeoutRetried });
}

describe('a request', () => {
  it('adds the path and the query to a base URL with a path and any closing slash', async () => {
    for (const baseUrl of ['http://localhost:4010/gateway', 'http://localhost:4010/gateway/']) {
      const { settings, requests } = settingsWith({ baseUrl }, VALID_LOOKUP);
      await sendLookup(settings);
      expect(requests[0]?.url.href).toBe(
        'http://localhost:4010/gateway/v1/lookup?code=FC-01-Z99-ZZ-01&level=1',
      );
    }
  });

  it('sends the key in X-API-Key, and no such header when the client has no key', async () => {
    const keyed = settingsWith({}, VALID_LOOKUP);
    const keyless = settingsWith({ apiKey: undefined }, VALID_LOOKUP);
    await sendLookup(keyed.settings);
    await sendLookup(keyless.settings);
    expect(keyed.requests[0]?.headers.get('X-API-Key')).toBe(KEY);
    expect(keyless.requests[0]?.headers.has('X-API-Key')).toBe(false);
  });

  it('gives the data field of a response with status 200', async () => {
    const { settings } = settingsWith({}, VALID_LOOKUP);
    expect(await sendLookup(settings)).toEqual({
      postcode: 'FC-01-Z99-ZZ-01',
      valid: true,
      status: 'valid',
    });
  });
});

describe('timeouts', () => {
  it('ends each attempt at timeoutMs, and retries it after 500 ms and 1000 ms', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { settings, requests } = settingsWith({}, 'hang');
    const call = sendLookup(settings);
    await vi.advanceTimersByTimeAsync(8000 + 500 + 8000 + 1000 + 7999);
    expect(requests).toHaveLength(3);
    const error = reasonOf(await settle(call, 1)) as PostcodeError;
    expect([error.code, error.status]).toEqual(['timeout', null]);
    expect(error.message).toContain('8000 ms');
    expect(requests.every((request) => request.signal.aborted)).toBe(true);
  });

  it('does not retry a timeout when the call says so, as autocomplete does', async () => {
    const { settings, requests } = settingsWith({}, 'hang');
    const error = reasonOf(await settle(sendLookup(settings, { timeoutRetried: false }), 20_000));
    expect((error as PostcodeError).code).toBe('timeout');
    expect(requests).toHaveLength(1);
  });
});

describe('the total deadline', () => {
  const unavailable = (retryAfter: string): Answer => ({
    status: 503,
    body: { error: { code: 'unavailable' } },
    headers: { 'Retry-After': retryAfter },
  });

  it('raises the last error at once when the next wait ends after the deadline', async () => {
    // The deadline is 2 x 2000 ms and one wait of up to 750 ms, so 4750 ms.
    const { settings, requests } = settingsWith(
      { timeoutMs: 2000, maxRetries: 1 },
      unavailable('7'),
    );
    const error = reasonOf(await settle(sendLookup(settings), 0)) as PostcodeError;
    expect([error.code, error.status, error.retryAfterMs]).toEqual(['server_error', 503, 7000]);
    expect(requests).toHaveLength(1);
  });

  it('counts the time of earlier attempts and waits', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { settings, requests } = settingsWith({ timeoutMs: 2000, maxRetries: 2 }, 'hang', {
      status: 503,
      body: {},
      headers: { 'Retry-After': '6' },
    });
    // The first attempt times out at 2000 ms and the wait ends at 2500 ms. A wait of 6 s from
    // there ends at 8500 ms, and the deadline is 3 x 2000 + 750 + 1250 = 8000 ms.
    const error = reasonOf(await settle(sendLookup(settings), 2500)) as PostcodeError;
    expect([error.code, error.retryAfterMs]).toEqual(['server_error', 6000]);
    expect(requests).toHaveLength(2);
  });

  it('retries after a Retry-After that ends exactly at the deadline', async () => {
    // The deadline is 2 x 1125 ms and one wait of up to 750 ms, so 3000 ms.
    const { settings, requests } = settingsWith(
      { timeoutMs: 1125, maxRetries: 1 },
      unavailable('3'),
      VALID_LOOKUP,
    );
    const call = sendLookup(settings);
    await vi.advanceTimersByTimeAsync(3000);
    await call;
    expect(requests).toHaveLength(2);
  });
});

describe('a 503 with Retry-After', () => {
  it('waits exactly as long as it asks, then tries again', async () => {
    const answer = { status: 503, body: {}, headers: { 'Retry-After': '1' } };
    const { settings, requests } = settingsWith({}, answer, VALID_LOOKUP);
    const call = sendLookup(settings);
    await vi.advanceTimersByTimeAsync(999);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await call;
    expect(requests).toHaveLength(2);
  });

  it('uses its own wait for an invalid value', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const answer = { status: 503, body: {}, headers: { 'Retry-After': 'soon' } };
    const { settings, requests } = settingsWith({}, answer, VALID_LOOKUP);
    const call = sendLookup(settings);
    await vi.advanceTimersByTimeAsync(499);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await call;
    expect(requests).toHaveLength(2);
  });
});

describe('timers', () => {
  it.each([
    ['a success', [VALID_LOOKUP]],
    ['a failed response', [{ status: 500, body: {} }]],
    ['a dropped connection', ['drop']],
  ] as const)('leaves no timer after %s', async (_, answers) => {
    const { settings } = settingsWith({ maxRetries: 0 }, ...answers);
    await Promise.allSettled([sendLookup(settings)]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no timer after a cancelled attempt, or a cancelled wait', async () => {
    const attempt = settingsWith({ maxRetries: 0 }, 'hang');
    const wait = settingsWith({}, { status: 503, body: {} });
    for (const { settings } of [attempt, wait]) {
      const controller = new AbortController();
      const call = sendLookup(settings, { signal: controller.signal });
      await vi.advanceTimersByTimeAsync(100);
      controller.abort();
      await Promise.allSettled([call]);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('ends an attempt whose body does not arrive in time', async () => {
    const transport: typeof fetch = (_, init) => {
      const signal = init?.signal ?? new AbortController().signal;
      const body = new ReadableStream({
        start(stream) {
          signal.addEventListener('abort', () => {
            stream.error(signal.reason);
          });
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    };
    const { settings } = settingsWith({ transport, timeoutMs: 1000, maxRetries: 0 });
    const error = reasonOf(await settle(sendLookup(settings), 1000)) as PostcodeError;
    expect(error.code).toBe('timeout');
  });
});

describe('error messages', () => {
  const SECRET = 'nipost_live_do_not_show_this_key';
  const failures: readonly (readonly [string, Answer])[] = [
    ['401', { status: 401, body: { error: { code: 'invalid_api_key', message: SECRET } } }],
    ['403', { status: 403, body: { error: { code: 'scope_not_granted' } } }],
    ['429', { status: 429, body: {}, headers: { 'Retry-After': '60' } }],
    ['500', { status: 500, body: 'not json' }],
    ['a body with no data', { status: 200, body: { error: SECRET } }],
    ['a dropped connection', 'drop'],
    ['no answer', 'hang'],
  ];

  it.each(failures)('never hold the API key, for %s', async (_, answer) => {
    const { settings } = settingsWith({ apiKey: SECRET, maxRetries: 0 }, answer);
    const error = reasonOf(await settle(sendLookup(settings), 8000));
    expect(error).toBeInstanceOf(PostcodeError);
    expect((error as PostcodeError).message).not.toContain('do_not_show');
  });
});

describe('cancellation (API-11)', () => {
  it('stops an attempt with the reason of the signal, and does not retry it', async () => {
    const { settings, requests } = settingsWith({}, 'hang');
    const controller = new AbortController();
    const call = sendLookup(settings, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    const reason = reasonOf(await settle(call, 10_000));
    expect(reason).toBe(controller.signal.reason);
    expect(reason).not.toBeInstanceOf(PostcodeError);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.signal.aborted).toBe(true);
  });

  it('stops during the wait before a retry, and sends no more requests', async () => {
    const { settings, requests } = settingsWith({}, { status: 503, body: {} });
    const controller = new AbortController();
    const call = sendLookup(settings, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    // The call ends at once, not when the wait of 500 ms or more ends.
    expect(reasonOf(await settle(call, 0))).toBe(controller.signal.reason);
    expect(requests).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not wait for a retry when the signal aborted during the attempt', async () => {
    const controller = new AbortController();
    const fake = fakeTransport({ status: 503, body: {} });
    const transport: typeof fetch = async (input, init) => {
      const response = await fake.transport(input, init);
      controller.abort();
      return response;
    };
    const { settings } = settingsWith({ transport });
    const call = sendLookup(settings, { signal: controller.signal });
    expect(reasonOf(await settle(call, 0))).toBe(controller.signal.reason);
    expect(fake.requests).toHaveLength(1);
  });

  it('takes a waiting request out of the queue, so the next one takes its place', async () => {
    const { settings, requests } = settingsWith({ maxRetries: 0 }, 'hang');
    const running = [1, 2, 3, 4].map(() => sendLookup(settings));
    const controller = new AbortController();
    const leaving = sendLookup(settings, { signal: controller.signal });
    const next = send(
      settings,
      { ...LOOKUP, path: '/v1/next' },
      {
        signal: new AbortController().signal,
        timeoutRetried: true,
      },
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(requests).toHaveLength(4);
    controller.abort();
    expect(reasonOf(await settle(leaving, 0))).toBe(controller.signal.reason);
    await Promise.allSettled([...running, next, vi.advanceTimersByTimeAsync(16_000)]);
    expect(requests.map((request) => request.url.pathname)).toEqual([
      '/v1/lookup',
      '/v1/lookup',
      '/v1/lookup',
      '/v1/lookup',
      '/v1/next',
    ]);
  });
});

describe('Retry-After', () => {
  it('waits until an HTTP date that is 3 seconds ahead, then tries again', async () => {
    const limited = {
      status: 429,
      body: { error: { code: 'rate_limited' } },
      headers: { 'Retry-After': 'Wed, 14 Oct 2026 09:00:03 GMT' },
    };
    const { settings, requests } = settingsWith({}, limited, VALID_LOOKUP);
    const call = sendLookup(settings);
    await vi.advanceTimersByTimeAsync(2999);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await call;
    expect(requests).toHaveLength(2);
  });

  it('never waits less than it asks, when a timer fires early', async () => {
    const limited = { status: 429, body: {}, headers: { 'Retry-After': '1' } };
    const { settings, requests } = settingsWith({}, limited, VALID_LOOKUP);
    const call = sendLookup(settings);
    await vi.advanceTimersByTimeAsync(0);
    // The timer fires on time, but the finer clock says that half a millisecond is left.
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(performance.now() + 999.5);
    await vi.advanceTimersByTimeAsync(1000);
    expect(clock).toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await call;
    expect(requests).toHaveLength(2);
  });

  it('gives back its place in the queue while it waits', async () => {
    const limited = { status: 429, body: {}, headers: { 'Retry-After': '5' } };
    const answers = [limited, limited, limited, limited, VALID_LOOKUP];
    const { settings, requests } = settingsWith({}, ...answers);
    const waiting = [1, 2, 3, 4].map(() => sendLookup(settings));
    await vi.advanceTimersByTimeAsync(10);
    await sendLookup(settings);
    expect(requests).toHaveLength(5);
    await Promise.allSettled([...waiting, vi.advanceTimersByTimeAsync(5000)]);
  });
});

describe('retryAfterMs of an error', () => {
  const asking = (status: number): Answer => ({
    status,
    body: {},
    headers: { 'Retry-After': '5' },
  });

  it.each([429, 502, 503, 504])('holds the wait of a %i', async (status) => {
    const { settings } = settingsWith({ maxRetries: 0 }, asking(status));
    const error = reasonOf(await settle(sendLookup(settings), 0)) as PostcodeError;
    expect(error.retryAfterMs).toBe(5000);
  });

  it.each([400, 401, 402, 403, 404, 500, 501])('holds no wait for a %i', async (status) => {
    const { settings } = settingsWith({ maxRetries: 0 }, asking(status));
    const error = reasonOf(await settle(sendLookup(settings), 0)) as PostcodeError;
    expect([error.status, error.retryAfterMs]).toEqual([status, null]);
  });
});

describe('a transport that fails with its own abort error', () => {
  it('still gives a timeout, and does not retry it for autocomplete', async () => {
    const attempts = vi.fn();
    const transport: typeof fetch = (_input, init) => {
      attempts();
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    };
    const { settings } = settingsWith({ timeoutMs: 1000, transport });
    const error = reasonOf(await settle(sendLookup(settings, { timeoutRetried: false }), 20_000));
    expect((error as PostcodeError).code).toBe('timeout');
    expect(attempts).toHaveBeenCalledTimes(1);
  });
});

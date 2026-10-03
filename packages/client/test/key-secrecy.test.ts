// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// The README promises that no error message of the client holds the caller's API key. This
// file triggers every error code through the public client, with a key in the options, and
// reads each text that an error carries. A scripted transport and a fake clock stand in for
// the network (T-5).
import { describe, expect, it, vi } from 'vitest';
import { PostcodeClient, type PostcodeErrorCode } from '../src/index.js';
import { reasonOf, settle, useFakeClock } from './fake-clock.js';
import { fakeTransport, type Answer } from './transport.js';

// The sentinel is built at run time, so that no line of this file looks like a real key.
const SECRET_PART = ['sentinel', '8f3a1c'].join('_');
const KEY = ['nipost', 'live', SECRET_PART].join('_');

useFakeClock();

// Every text that an error holds: its name, message, code fields and stack, and the same for
// each error in its cause chain. A cause that is not an Error counts as its text.
function textsOf(error: unknown): string[] {
  const texts: string[] = [];
  let current: unknown = error;
  while (current !== undefined) {
    if (!(current instanceof Error)) {
      texts.push(JSON.stringify(current));
      break;
    }
    const { name, message, stack } = current;
    texts.push(name, message, stack ?? '');
    const { code, apiCode } = current as { code?: unknown; apiCode?: unknown };
    texts.push(String(code), String(apiCode));
    current = current.cause;
  }
  return texts;
}

function expectNoKey(error: unknown): void {
  for (const text of textsOf(error)) {
    expect(text).not.toContain(SECRET_PART);
  }
}

async function failureOf(call: (client: PostcodeClient) => Promise<unknown>, answer: Answer) {
  const { transport } = fakeTransport(answer);
  const client = new PostcodeClient({
    apiKey: KEY,
    baseUrl: 'https://gateway.invalid',
    transport,
    timeoutMs: 1000,
    maxRetries: 0,
  });
  return reasonOf(await settle(call(client), 2000));
}

const lookup = (client: PostcodeClient): Promise<unknown> => client.lookup('FC-01-Z99-ZZ-01');
const failed = (status: number, code?: string): Answer => ({
  status,
  body: code === undefined ? {} : { error: { code, message: KEY } },
});

describe('the API key in an error', () => {
  const paths: readonly (readonly [PostcodeErrorCode, Answer])[] = [
    ['unauthorized', failed(401, 'auth_required')],
    ['insufficient_credits', failed(402, 'insufficient_credits')],
    ['origin_not_allowed', failed(403, 'origin_not_allowed')],
    ['forbidden', failed(403, 'level_not_granted')],
    ['rate_limited', { status: 429, body: {}, headers: { 'Retry-After': '60' } }],
    ['server_error', failed(500, 'internal')],
    ['unexpected_response', { status: 200, body: { data: { valid: 'yes' } } }],
    ['network_error', 'drop'],
    ['timeout', 'hang'],
  ];

  it('is not in the error of any code that a response or a missing response gives', async () => {
    for (const [code, answer] of paths) {
      const error = await failureOf(lookup, answer);
      expect((error as { code: unknown }).code).toBe(code);
      expectNoKey(error);
    }
  });

  it('is not in the message when the gateway echoes the key as its error code', async () => {
    for (const status of [400, 401, 402, 403, 404, 500, 503]) {
      const error = (await failureOf(lookup, failed(status, KEY))) as Error;
      expect(error.message).not.toContain(SECRET_PART);
      expect((error as { apiCode?: string }).apiCode).toBe(KEY);
    }
  });

  it('is not in the error for input that the client refuses', async () => {
    const calls = [
      (client: PostcodeClient) => client.lookup('not a postcode'),
      (client: PostcodeClient) => client.lookup('FC-01-Z99-ZZ-01', { level: 9 as never }),
      (client: PostcodeClient) => client.reverse(Number.NaN, 0),
      (client: PostcodeClient) => client.autocomplete(''),
    ];
    for (const call of calls) {
      const error = await failureOf(call, 'drop');
      expect((error as { code: unknown }).code).toBe('invalid_input');
      expectNoKey(error);
    }
  });

  it('is not in the error of every call kind that reaches the gateway', async () => {
    const calls = [
      (client: PostcodeClient) => client.reverse(9, 7),
      (client: PostcodeClient) => client.autocomplete('fc'),
    ];
    for (const call of calls) {
      expectNoKey(await failureOf(call, failed(401, 'auth_required')));
      expectNoKey(await failureOf(call, 'drop'));
    }
  });

  it('is not in the error that refuses a secret key in a web page', () => {
    vi.stubGlobal('document', {});
    let thrown: unknown;
    try {
      new PostcodeClient({ apiKey: KEY });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TypeError);
    expectNoKey(thrown);
  });

  it('is not in the error of an option that breaks its rule', () => {
    let thrown: unknown;
    try {
      new PostcodeClient({ apiKey: KEY, timeoutMs: 0 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RangeError);
    expectNoKey(thrown);
  });
});

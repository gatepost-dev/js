// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// A transport for unit tests. It answers from a script, with no network, and it records each
// request (T-5).

/** One answer of the script. */
export type Answer =
  | {
      readonly status: number;
      readonly body: unknown;
      readonly headers?: Readonly<Record<string, string>>;
    }
  | 'hang'
  | 'drop';

/** A request that the transport saw. */
export interface SentRequest {
  readonly url: URL;
  readonly headers: Headers;
  readonly signal: AbortSignal;
}

/** A transport with the requests that it saw. */
export interface FakeTransport {
  readonly transport: typeof fetch;
  readonly requests: SentRequest[];
}

/** The body of a lookup at level 1 for a known unit. */
export const VALID_LOOKUP: Answer = {
  status: 200,
  body: { data: { postcode: 'FC-01-Z99-ZZ-01', valid: true, status: 'valid' } },
};

// A request that hangs ends only when its signal aborts, with the signal's reason, as fetch does.
function hang(signal: AbortSignal): Promise<Response> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(signal.reason as Error);
    });
  });
}

/**
 * Makes a transport that gives the answers in order, and repeats the last one.
 *
 * @param answers - The answers.
 * @returns The transport and its record of requests.
 */
export function fakeTransport(...answers: readonly Answer[]): FakeTransport {
  const requests: SentRequest[] = [];
  const transport: typeof fetch = async (input, init) => {
    const signal = init?.signal ?? new AbortController().signal;
    const url = new URL(input instanceof Request ? input.url : input);
    requests.push({ url, headers: new Headers(init?.headers), signal });
    const answer = answers[Math.min(requests.length, answers.length) - 1] ?? 'drop';
    if (answer === 'hang') {
      return await hang(signal);
    }
    if (answer === 'drop') {
      throw new TypeError('fetch failed');
    }
    const headers = new Headers(answer.headers);
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers });
  };
  return { transport, requests };
}

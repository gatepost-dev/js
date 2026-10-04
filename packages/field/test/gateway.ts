// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';
import { commands } from 'vitest/browser';

/** One request that the field sent through fetch. */
export interface SentRequest {
  readonly url: URL;
  readonly headers: Headers;
  readonly signal: AbortSignal | null;
}

/**
 * Reads a synthetic response of the spec's fixtures, such as `lookup/valid-level-1`.
 */
export async function fixture(name: string): Promise<Response> {
  const file = JSON.parse(await commands.readFile(`../../spec/fixtures/${name}.json`)) as {
    status: number;
    body: unknown;
  };
  return Response.json(file.body, { status: file.status });
}

/**
 * Puts a scripted gateway in place of fetch. Each request takes the next answer: a response, an
 * error that fetch throws, or a promise that the test settles later.
 */
export function scriptGateway(...answers: readonly (Response | Error | Promise<Response>)[]): {
  readonly requests: SentRequest[];
} {
  const requests: SentRequest[] = [];
  const queue = [...answers];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    requests.push({
      url: new URL(request.url),
      headers: request.headers,
      signal: init?.signal ?? null,
    });
    const answer = queue.shift();
    if (answer === undefined) {
      throw new Error(`The test gave no answer for ${request.url}.`);
    }
    if (answer instanceof Error) {
      throw answer;
    }
    return await answer;
  });
  return { requests };
}

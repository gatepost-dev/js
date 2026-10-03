// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { clientError, errorForResponse, PostcodeError } from './error.js';
import type { Queue } from './queue.js';
import type { GatewayRequest } from './requests.js';
import { apiCodeOf, dataOf } from './responses.js';
import { FIRST_WAIT_MS, JITTER_MS, retryAfterMs, retryWaitMs } from './retry.js';

/**
 * What every request of one client shares.
 *
 * @internal
 */
export interface SendSettings {
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
  readonly transport: typeof globalThis.fetch;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly queue: Queue;
}

// The base URL can hold a path, such as the address of a staging gateway, so the client adds
// the request's path to it.
function urlOf(baseUrl: string, request: GatewayRequest): string {
  const url = new URL(baseUrl.replace(/\/+$/, '') + request.path);
  for (const [name, text] of Object.entries(request.query)) {
    url.searchParams.set(name, text);
  }
  return url.href;
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A body that is not JSON, such as the HTML page of a captive portal, has no fields.
    return undefined;
  }
}

// The timer and the caller's signal share one controller, so either one stops the request.
// Safari 16.4 lacks AbortSignal.any, so the code joins the two signals itself.
async function attempt(settings: SendSettings, url: string, signal: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const stop = (): void => {
    controller.abort(signal.reason);
  };
  signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => {
    controller.abort(clientError('timeout', `It waited ${String(settings.timeoutMs)} ms.`));
  }, settings.timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (settings.apiKey !== undefined) {
      headers['X-API-Key'] = settings.apiKey;
    }
    const response = await settings.transport(url, { headers, signal: controller.signal });
    const body = readJson(await response.text());
    if (response.status === 200) {
      return dataOf(body);
    }
    const header = response.headers.get('Retry-After');
    throw errorForResponse({
      status: response.status,
      apiCode: apiCodeOf(body),
      retryAfterMs: retryAfterMs(header, Date.now()),
    });
  } catch (error: unknown) {
    throw failureOf(error, controller.signal);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}

// The caller's abort and the timeout end the request with the reason that the controller holds.
// Any other failure of the transport means that no response arrived.
function failureOf(error: unknown, signal: AbortSignal): unknown {
  if (error instanceof PostcodeError) {
    return error;
  }
  if (signal.aborted) {
    return signal.reason;
  }
  return clientError('network_error', '', error);
}

// A timer can fire up to a millisecond early on a finer clock. The client never waits less than
// a Retry-After asks, so it sets a new timer for any time that is left.
function pause(waitMs: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const until = performance.now() + waitMs;
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const stop = (): void => {
      clearTimeout(timer);
      // API-11: a cancelled call ends with the reason of the caller's signal, of any type.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- API-11
      reject(signal.reason);
    };
    const tick = (): void => {
      const leftMs = until - performance.now();
      if (leftMs > 0) {
        timer = setTimeout(tick, leftMs);
        return;
      }
      signal.removeEventListener('abort', stop);
      resolve();
    };
    signal.addEventListener('abort', stop, { once: true });
    tick();
  });
}

// The longest a call lasts from its first attempt: every attempt may use its full timeout, and
// every retry may wait its longest own wait.
function deadlineMs(settings: SendSettings): number {
  let totalMs = (1 + settings.maxRetries) * settings.timeoutMs;
  for (let retry = 1; retry <= settings.maxRetries; retry += 1) {
    totalMs += FIRST_WAIT_MS * 2 ** (retry - 1) + JITTER_MS;
  }
  return totalMs;
}

/**
 * Sends a request, with the retries and the waits of `spec/client.md`. Each attempt takes a
 * place in the queue, and gives it back before the wait.
 *
 * @param settings - The settings of the client.
 * @param request - The path and the query.
 * @param options - The caller's signal, and whether a timeout gets a retry.
 * @returns The `data` field of the response.
 * @throws PostcodeError for a failure that the retries did not cure, or the reason of the
 *   caller's signal when it aborts.
 * @internal
 */
export async function send(
  settings: SendSettings,
  request: GatewayRequest,
  options: Readonly<{ signal: AbortSignal; timeoutRetried: boolean }>,
): Promise<unknown> {
  const url = urlOf(settings.baseUrl, request);
  let deadline = Number.POSITIVE_INFINITY;
  const run = (): Promise<unknown> => {
    // The deadline starts when the first attempt leaves the queue.
    if (deadline === Number.POSITIVE_INFINITY) {
      deadline = performance.now() + deadlineMs(settings);
    }
    return attempt(settings, url, options.signal);
  };
  for (let retry = 1; ; retry += 1) {
    try {
      return await settings.queue(run, options.signal);
    } catch (error: unknown) {
      const waitMs =
        error instanceof PostcodeError ? retryWaitMs(error, retry, options.timeoutRetried) : null;
      if (waitMs === null || retry > settings.maxRetries || performance.now() + waitMs > deadline) {
        throw error;
      }
      await pause(waitMs, options.signal);
    }
  }
}

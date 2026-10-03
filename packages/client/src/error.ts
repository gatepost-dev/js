// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { PostcodeErrorCode } from './types.js';

/**
 * The error that each call of `PostcodeClient` raises when it cannot give a result. A
 * cancelled call raises the platform's own abort error instead.
 *
 * @example
 * ```ts
 * import { PostcodeClient, PostcodeError } from '@gatepost/client';
 *
 * const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
 * try {
 *   await client.lookup('FC-01-Z99');
 * } catch (error) {
 *   if (error instanceof PostcodeError) {
 *     error.code; // 'invalid_input'
 *     error.status; // null
 *   }
 * }
 * ```
 */
export class PostcodeError extends Error {
  /** Always `PostcodeError`, so that a log names the error type. */
  override readonly name: string = 'PostcodeError';
  /** Why the call failed, as a stable code. */
  readonly code: PostcodeErrorCode;
  /** The HTTP status of the response, or null when no response arrived. */
  readonly status: number | null;
  /** The `error.code` of the response body, or null. */
  readonly apiCode: string | null;
  /** The wait that `Retry-After` asked for, in milliseconds, or null. */
  readonly retryAfterMs: number | null;

  /**
   * Makes an error. The client makes each one. A test of code that uses the client can make
   * one too.
   *
   * @param code - Why the call failed.
   * @param message - What happened and what to do, with no API key in it.
   * @param details - The `status`, the `apiCode`, the `retryAfterMs` and the `cause`. Each one
   *   that is missing is null.
   */
  constructor(
    code: PostcodeErrorCode,
    message: string,
    details: Readonly<{
      status?: number | null;
      apiCode?: string | null;
      retryAfterMs?: number | null;
      cause?: unknown;
    }> = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.code = code;
    this.status = details.status ?? null;
    this.apiCode = details.apiCode ?? null;
    this.retryAfterMs = details.retryAfterMs ?? null;
  }
}

/**
 * The part of a response that decides the error: its status, its body and its `Retry-After`.
 *
 * @internal
 */
export interface FailedResponse {
  readonly status: number;
  readonly apiCode: string | null;
  readonly retryAfterMs: number | null;
}

function codeFor({ status, apiCode }: FailedResponse): PostcodeErrorCode {
  if (status === 401) {
    return 'unauthorized';
  }
  if (status === 402) {
    return 'insufficient_credits';
  }
  if (status === 403) {
    return apiCode === 'origin_not_allowed' ? 'origin_not_allowed' : 'forbidden';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  return status >= 400 && status < 500 ? 'invalid_input' : 'server_error';
}

const ADVICE: Readonly<Record<PostcodeErrorCode, string>> = {
  invalid_input: 'The gateway refused the request as invalid. Check the arguments of the call.',
  unauthorized: 'The gateway refused the API key. Check the apiKey option.',
  insufficient_credits: 'The account has no credits for this call. Add credits, or use level 1.',
  origin_not_allowed: "The gateway refused this page's origin. Add it to the publishable key.",
  forbidden: "The gateway refused the call. Check the key's scope and lookup level.",
  rate_limited: 'The gateway limits the requests of this key. Wait, then try again.',
  server_error: 'The gateway failed. Try again later.',
  unexpected_response:
    'The gateway sent a reply that this client cannot read. Try again, or update the client.',
  network_error: 'The request did not reach the gateway. Check the network and the baseUrl.',
  timeout: 'The gateway sent no response in time. Try again, or raise timeoutMs.',
};

/**
 * Maps a response that is not a success to its error, as the table in `spec/client.md` says.
 *
 * @param response - The status, the API's error code and the wait of the response.
 * @returns The error.
 * @internal
 */
export function errorForResponse(response: FailedResponse): PostcodeError {
  const code = codeFor(response);
  const apiCode = response.apiCode === null ? '' : `, ${response.apiCode}`;
  return new PostcodeError(code, `${ADVICE[code]} (status ${String(response.status)}${apiCode})`, {
    status: response.status,
    apiCode: response.apiCode,
    retryAfterMs: response.retryAfterMs,
  });
}

/**
 * Makes an error for a failure with no response, or for a check of the client.
 *
 * @param code - `invalid_input`, `network_error`, `timeout`, `unexpected_response` or
 *   `server_error`.
 * @param detail - A sentence that adds to the advice, or an empty string. For `invalid_input`
 *   the advice is left out, so the detail must be a full message and not empty.
 * @param cause - The error that the platform raised, if any.
 * @returns The error.
 * @internal
 */
export function clientError(
  code: PostcodeErrorCode,
  detail: string,
  cause?: unknown,
): PostcodeError {
  const message = code === 'invalid_input' ? detail : `${ADVICE[code]} ${detail}`.trim();
  return new PostcodeError(code, message, { cause });
}

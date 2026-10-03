// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0

/** A request as the mock server reads it. Header names are in lower case. */
export interface MockRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: string;
}

/**
 * What the mock server does with a request: send a response, keep the connection open with no
 * answer, or close the connection with no answer. `delayMs` is the wait before it acts.
 */
export type Reply =
  | {
      readonly kind: 'send';
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
      readonly delayMs: number;
    }
  | { readonly kind: 'hang' }
  | { readonly kind: 'drop'; readonly delayMs: number };

/** A reply that sends a response. */
export type SendReply = Extract<Reply, { readonly kind: 'send' }>;

const JSON_TYPE = { 'Content-Type': 'application/json' };

/**
 * Builds a reply with a JSON body. The gateway ends each body with a line feed, and so does
 * this reply.
 *
 * @param status - The HTTP status.
 * @param body - The value to send as JSON.
 * @param headers - More response headers.
 * @returns The reply, with no delay.
 * @internal
 */
export function jsonReply(
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): SendReply {
  return {
    kind: 'send',
    status,
    headers: { ...JSON_TYPE, ...headers },
    body: `${JSON.stringify(body)}\n`,
    delayMs: 0,
  };
}

/**
 * Builds a reply with no body, such as the answer to a preflight request.
 *
 * @param status - The HTTP status.
 * @returns The reply, with no delay.
 * @internal
 */
export function emptyReply(status: number): SendReply {
  return { kind: 'send', status, headers: {}, body: '', delayMs: 0 };
}

/**
 * Adds headers to a reply that sends a response. A reply of another kind stays as it is.
 *
 * @param reply - The reply.
 * @param headers - The headers to add. They replace a header of the same name.
 * @returns The reply with the headers.
 * @internal
 */
export function withHeaders(reply: Reply, headers: Readonly<Record<string, string>>): Reply {
  return reply.kind === 'send' ? { ...reply, headers: { ...reply.headers, ...headers } } : reply;
}

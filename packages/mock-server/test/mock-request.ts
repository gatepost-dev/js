// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import type { MockRequest, Reply } from '../src/reply.ts';
import { readSpecFiles, type SpecFiles } from '../src/spec-files.ts';

/** The spec submodule of the js repo. */
export const SPEC_DIR: string = fileURLToPath(new URL('../../../spec/', import.meta.url));

/** The spec files, read once for all tests. */
export const FILES: SpecFiles = readSpecFiles(SPEC_DIR);

/** A response that a test can compare: its status, its headers and its parsed JSON body. */
export interface SentResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

/**
 * Builds a request as the server would read it.
 *
 * @param target - The path and the query, such as `/v1/lookup?code=FC01Z99ZZ01`.
 * @param init - The method, the headers with names in lower case, and the body.
 * @returns The request.
 */
export function mockRequest(
  target: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): MockRequest {
  const url = new URL(target, 'http://mock.invalid');
  return {
    method: init.method ?? 'GET',
    path: url.pathname,
    query: url.searchParams,
    headers: init.headers ?? {},
    body: init.body ?? '',
  };
}

/**
 * Reads a reply that sends a response, and fails the test for any other reply.
 *
 * @param reply - The reply.
 * @returns The status, the headers and the JSON body, or null for an empty body.
 */
export function sent(reply: Reply): SentResponse {
  if (reply.kind !== 'send') {
    throw new Error(`The reply is ${reply.kind}, not a response.`);
  }
  const body: unknown = reply.body === '' ? null : JSON.parse(reply.body);
  return { status: reply.status, headers: reply.headers, body };
}

/**
 * Gives the `error.code` of a response body.
 *
 * @param response - The response.
 * @returns The code.
 */
export function errorCode(response: SentResponse): unknown {
  const body = response.body as { error?: { code?: unknown } } | null;
  return body?.error?.code;
}

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { assemble, disassemble } from './assembly.ts';
import { lookup } from './lookup.ts';
import { createRateLimiter } from './rate-limit.ts';
import { emptyReply, withHeaders, type MockRequest, type Reply } from './reply.ts';
import { autocomplete, nearby, reverse } from './search.ts';
import { fixtureReply, type MockKey, type SpecFiles } from './spec-files.ts';

type Route = (request: MockRequest, files: SpecFiles, key: MockKey) => Reply;

// SEC-4: the mock server serves the documented gateway paths and no other.
const ROUTES: ReadonlyMap<string, Route> = new Map<string, Route>([
  ['GET /v1/lookup', lookup],
  ['GET /v1/search/reverse', reverse],
  ['GET /v1/search/nearby', nearby],
  ['GET /v1/search/autocomplete', autocomplete],
  ['POST /v1/assembly/assemble', assemble],
  ['GET /v1/assembly/disassemble', disassemble],
]);

function keyedReply(request: MockRequest, files: SpecFiles, key: MockKey, left: number): Reply {
  const route = ROUTES.get(`${request.method} ${request.path}`);
  const origin = request.headers['origin'];
  if (route === undefined) {
    return fixtureReply(files, 'errors/unknown-path');
  }
  if (key.origins !== null && origin !== undefined && !key.origins.includes(origin)) {
    return fixtureReply(files, 'errors/origin-not-allowed');
  }
  if (key.rateLimited) {
    return withHeaders(fixtureReply(files, 'errors/rate-limited'), { 'Retry-After': '1' });
  }
  return left < 0 ? fixtureReply(files, 'errors/rate-limited') : route(request, files, key);
}

/**
 * Builds the default behaviour of the mock server: the gateway's answers, from the fixtures and
 * the keys. A request with no key gets 401 with no rate-limit headers, as the gateway gave. Every
 * request with a known key counts against that key's limit for the clock minute.
 *
 * @param files - The spec files.
 * @param now - The clock, in milliseconds since the epoch.
 * @returns A function that answers one request.
 * @internal
 */
export function createGateway(
  files: SpecFiles,
  now: () => number,
): (request: MockRequest) => Reply {
  const count = createRateLimiter(files.requestsPerMinute, now);
  return (request) => {
    if (request.method === 'OPTIONS') {
      return emptyReply(204);
    }
    if (request.method === 'GET' && request.path === '/healthz') {
      return emptyReply(200);
    }
    const apiKey = request.headers['x-api-key'];
    if (apiKey === undefined) {
      return fixtureReply(files, 'errors/auth-required');
    }
    const key = files.keys.get(apiKey);
    if (key === undefined) {
      return fixtureReply(files, 'errors/invalid-api-key');
    }
    const left = count(apiKey);
    return withHeaders(keyedReply(request, files, key, left), {
      'X-RateLimit-Limit': String(files.requestsPerMinute),
      'X-RateLimit-Remaining': String(Math.max(left, 0)),
    });
  };
}

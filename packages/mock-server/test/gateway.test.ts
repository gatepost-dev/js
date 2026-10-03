// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { errorCode, FILES, mockRequest, sent } from './mock-request.ts';

const LOOKUP = '/v1/lookup?code=FC-01-Z99-ZZ-01';
const L3 = { 'x-api-key': 'nipost_test_mock_l3' };

function remaining(response: { headers: Readonly<Record<string, string>> }): string | undefined {
  return response.headers['X-RateLimit-Remaining'];
}

describe('the gateway without a scenario', () => {
  it('answers a request with no key with auth_required and no rate-limit headers', () => {
    const response = sent(createGateway(FILES, () => 0)(mockRequest(LOOKUP)));
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: 'auth_required',
        message: 'send an API key in the X-API-Key header',
      },
    });
    expect(response.headers).not.toHaveProperty('X-RateLimit-Limit');
  });

  it('answers a key that it does not know with invalid_api_key', () => {
    const request = mockRequest(LOOKUP, { headers: { 'x-api-key': 'nipost_test_other' } });
    const response = sent(createGateway(FILES, () => 0)(request));
    expect([response.status, errorCode(response)]).toEqual([401, 'invalid_api_key']);
    expect(response.headers).not.toHaveProperty('X-RateLimit-Remaining');
  });

  it('counts the requests of each key in each clock minute', () => {
    let clock = 59_000;
    const gateway = createGateway(FILES, () => clock);
    const l1 = { 'x-api-key': 'nipost_test_mock_l1' };
    expect(remaining(sent(gateway(mockRequest(LOOKUP, { headers: L3 }))))).toBe('599');
    expect(remaining(sent(gateway(mockRequest(LOOKUP, { headers: L3 }))))).toBe('598');
    expect(remaining(sent(gateway(mockRequest(LOOKUP, { headers: l1 }))))).toBe('599');
    clock = 60_000;
    const response = sent(gateway(mockRequest(LOOKUP, { headers: L3 })));
    expect(response.headers['X-RateLimit-Limit']).toBe('600');
    expect(remaining(response)).toBe('599');
  });

  it('answers the request after the limit with 429 and no Retry-After', () => {
    const gateway = createGateway(FILES, () => 0);
    for (let count = 0; count < 600; count += 1) {
      const counted = sent(gateway(mockRequest(LOOKUP, { headers: L3 })));
      expect([counted.status, remaining(counted)]).toEqual([200, String(599 - count)]);
    }
    const response = sent(gateway(mockRequest(LOOKUP, { headers: L3 })));
    expect([response.status, errorCode(response), remaining(response)]).toEqual([
      429,
      'rate_limited',
      '0',
    ]);
    expect(response.headers).not.toHaveProperty('Retry-After');
  });

  it('answers the rate-limited key with 429 and Retry-After of 1 second', () => {
    const headers = { 'x-api-key': 'nipost_test_mock_rate_limited' };
    const response = sent(createGateway(FILES, () => 0)(mockRequest(LOOKUP, { headers })));
    expect([response.status, errorCode(response)]).toEqual([429, 'rate_limited']);
    expect(response.headers['Retry-After']).toBe('1');
    expect(response.headers['X-RateLimit-Limit']).toBe('600');
    expect(remaining(response)).toBe('0');
  });

  it('refuses a publishable key from an origin that is not on its list, and counts it', () => {
    const headers = { 'x-api-key': 'nipost_pk_test_mock', origin: 'http://localhost:3001' };
    const response = sent(createGateway(FILES, () => 0)(mockRequest(LOOKUP, { headers })));
    expect([response.status, errorCode(response), remaining(response)]).toEqual([
      403,
      'origin_not_allowed',
      '599',
    ]);
  });

  it('accepts a publishable key from its origin, and from an app with no Origin header', () => {
    const gateway = createGateway(FILES, () => 0);
    const allowed = { 'x-api-key': 'nipost_pk_test_mock', origin: 'http://localhost:3000' };
    expect(sent(gateway(mockRequest(LOOKUP, { headers: allowed }))).status).toBe(200);
    const app = { 'x-api-key': 'nipost_pk_test_mock' };
    expect(sent(gateway(mockRequest(LOOKUP, { headers: app }))).status).toBe(200);
  });

  it('answers a preflight request and the health check with no key', () => {
    const gateway = createGateway(FILES, () => 0);
    expect(sent(gateway(mockRequest(LOOKUP, { method: 'OPTIONS' })))).toEqual({
      status: 204,
      headers: {},
      body: null,
    });
    expect(sent(gateway(mockRequest('/healthz'))).status).toBe(200);
  });

  it('answers a path that the gateway does not document with 404', () => {
    const gateway = createGateway(FILES, () => 0);
    const widget = sent(gateway(mockRequest('/v1/widget/lookup', { headers: L3 })));
    expect([widget.status, errorCode(widget)]).toEqual([404, 'not_found']);
    const post = sent(gateway(mockRequest(LOOKUP, { method: 'POST', headers: L3 })));
    expect(post.status).toBe(404);
  });

  it('keeps a count inside one clock minute, however late in it the request comes', () => {
    let clock = 0;
    const gateway = createGateway(FILES, () => clock);
    gateway(mockRequest(LOOKUP, { headers: L3 }));
    clock = 45_000;
    expect(remaining(sent(gateway(mockRequest(LOOKUP, { headers: L3 }))))).toBe('598');
  });

  it('checks the origin of a publishable key after the path and before the limit', () => {
    const gateway = createGateway(FILES, () => 0);
    const bad = { 'x-api-key': 'nipost_pk_test_mock', origin: 'http://localhost:3001' };
    const widget = sent(gateway(mockRequest('/v1/widget/lookup', { headers: bad })));
    expect([widget.status, errorCode(widget)]).toEqual([404, 'not_found']);
    const good = { 'x-api-key': 'nipost_pk_test_mock', origin: 'http://localhost:3000' };
    for (let count = 0; count < 600; count += 1) {
      gateway(mockRequest(LOOKUP, { headers: good }));
    }
    const refused = sent(gateway(mockRequest(LOOKUP, { headers: bad })));
    expect([refused.status, errorCode(refused)]).toEqual([403, 'origin_not_allowed']);
  });

  it('sends the rate-limit headers on a 400 and on a 404 for a known key', () => {
    const gateway = createGateway(FILES, () => 0);
    const bad = sent(gateway(mockRequest('/v1/lookup?level=1', { headers: L3 })));
    const missing = sent(gateway(mockRequest('/v1/widget/lookup', { headers: L3 })));
    for (const response of [bad, missing]) {
      expect(response.headers['X-RateLimit-Limit']).toBe('600');
      expect(remaining(response)).toMatch(/^\d+$/);
    }
  });

  it.each([
    ['/v1/search/reverse?lat=9&lng=7'],
    ['/v1/search/nearby?lat=9&lng=7'],
    ['/v1/search/autocomplete?q=E'],
    ['/v1/assembly/disassemble?code=FC01Z99ZZ01'],
  ])('sends the rate-limit headers on %s', (target) => {
    const response = sent(createGateway(FILES, () => 0)(mockRequest(target, { headers: L3 })));
    expect(response.headers['X-RateLimit-Limit']).toBe('600');
    expect(remaining(response)).toBe('599');
  });

  it('sends the rate-limit headers on assemble', () => {
    const body = '{"state":"FC","lga":"01","district":"Z99","area":"ZZ","unit":"01"}';
    const request = mockRequest('/v1/assembly/assemble', { method: 'POST', headers: L3, body });
    const response = sent(createGateway(FILES, () => 0)(request));
    expect(response.headers['X-RateLimit-Limit']).toBe('600');
  });

  it('serves each route with its own method only, and /healthz with GET only', () => {
    const gateway = createGateway(FILES, () => 0);
    const get = sent(gateway(mockRequest('/v1/assembly/assemble', { headers: L3 })));
    expect(get.status).toBe(404);
    expect(errorCode(sent(gateway(mockRequest('/healthz', { method: 'POST' }))))).toBe(
      'auth_required',
    );
  });

  it('checks the key before the path, and treats an empty key as a key it does not know', () => {
    const gateway = createGateway(FILES, () => 0);
    expect(errorCode(sent(gateway(mockRequest('/v1/widget/lookup'))))).toBe('auth_required');
    const empty = sent(gateway(mockRequest(LOOKUP, { headers: { 'x-api-key': '' } })));
    expect(errorCode(empty)).toBe('invalid_api_key');
  });

  it('refuses a wrong origin before it answers a rate-limited key', () => {
    const key = { ...FILES.keys.get('nipost_pk_test_mock')!, rateLimited: true };
    const files = { ...FILES, keys: new Map([[key.key, key]]) };
    const headers = { 'x-api-key': key.key, origin: 'http://localhost:3001' };
    const response = sent(createGateway(files, () => 0)(mockRequest(LOOKUP, { headers })));
    expect(errorCode(response)).toBe('origin_not_allowed');
  });
});

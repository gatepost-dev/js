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
      gateway(mockRequest(LOOKUP, { headers: L3 }));
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
});

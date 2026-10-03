// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { errorCode, FILES, mockRequest, sent, type SentResponse } from './mock-request.ts';

function lookUp(query: string, key = 'nipost_test_mock_l3'): SentResponse {
  const request = mockRequest(`/v1/lookup?${query}`, { headers: { 'x-api-key': key } });
  return sent(createGateway(FILES, () => 0)(request));
}

function message(response: SentResponse): unknown {
  return (response.body as { error: { message: unknown } }).error.message;
}

describe('lookup', () => {
  it('finds the synthetic unit at level 1 when no level is given', () => {
    expect(lookUp('code=FC-01-Z99-ZZ-01').body).toEqual({
      data: { postcode: 'FC-01-Z99-ZZ-01', valid: true, status: 'valid', verified: false },
    });
  });

  it('echoes the caller text in upper case, as the gateway does', () => {
    const response = lookUp('code=fc+01+z99+zz+01&level=1');
    expect(response.body).toMatchObject({ data: { postcode: 'FC 01 Z99 ZZ 01', valid: true } });
  });

  it('adds the documented address fields at level 2', () => {
    expect(lookUp('code=FC01Z99ZZ01&level=2').body).toEqual({
      data: {
        postcode: 'FC01Z99ZZ01',
        valid: true,
        administrative_address: {
          state_name: 'FEDERAL CAPITAL TERRITORY',
          lga_name: 'SYNTHETIC LGA',
          locality_name: 'SYNTHETIC LOCALITY',
          zone: 'NORTH CENTRAL',
        },
        recent_house_address: { recent: '1 SYNTHETIC STREET, SYNTHETIC LOCALITY' },
      },
    });
  });

  it('adds the building use status at level 3', () => {
    const response = lookUp('code=FC01Z99ZZ01&level=3');
    expect(response.body).toMatchObject({ data: { building_use_status: 'residential' } });
  });

  it('gives valid false with not_found for a well-formed postcode that it does not know', () => {
    expect(lookUp('code=FC-01-Z99-ZZ-02').body).toEqual({
      data: { postcode: 'FC-01-Z99-ZZ-02', valid: false, status: 'not_found', verified: false },
    });
  });

  it.each([
    ['text that is not a postcode', 'HELLO', 'HELLO'],
    ['a unit of 00', 'fc-01-z99-zz-00', 'FC-01-Z99-ZZ-00'],
    ['a state that is not on the list', 'XX01Z99ZZ01', 'XX01Z99ZZ01'],
  ])('gives valid false with invalid for %s', (_name, code, echo) => {
    expect(lookUp(`code=${code}`).body).toEqual({
      data: { postcode: echo, valid: false, status: 'invalid', verified: false },
    });
  });

  it.each([
    ['nipost_test_mock_l1', 2, 'this key cannot read above lookup level 1'],
    ['nipost_test_mock_l2', 3, 'this key cannot read above lookup level 2'],
    ['nipost_test_mock_l3', 4, 'this key cannot read above lookup level 3'],
  ])('refuses %s at level %i with level_not_granted', (key, level, text) => {
    const response = lookUp(`code=FC01Z99ZZ01&level=${String(level)}`, key);
    expect([response.status, errorCode(response), message(response)]).toEqual([
      403,
      'level_not_granted',
      text,
    ]);
  });

  it('refuses a level above 1 with no credits, and serves level 1', () => {
    const refused = lookUp('code=FC01Z99ZZ01&level=2', 'nipost_test_mock_no_credits');
    expect([refused.status, errorCode(refused)]).toEqual([402, 'insufficient_credits']);
    expect(lookUp('code=FC01Z99ZZ01&level=1', 'nipost_test_mock_no_credits').status).toBe(200);
  });

  it('refuses every level to a key with no lookup scope', () => {
    const response = lookUp('code=FC01Z99ZZ01&level=1', 'nipost_test_mock_no_scope');
    expect([response.status, errorCode(response)]).toEqual([403, 'scope_not_granted']);
  });

  it.each([
    ['no code', 'level=1'],
    ['a code of separators only', 'code=+-+'],
    ['level 0', 'code=FC01Z99ZZ01&level=0'],
    ['level 6', 'code=FC01Z99ZZ01&level=6'],
    ['a level that is not a number', 'code=FC01Z99ZZ01&level=two'],
  ])('answers %s with 400', (_name, query) => {
    const response = lookUp(query);
    expect([response.status, errorCode(response)]).toEqual([400, 'invalid_request']);
  });
});

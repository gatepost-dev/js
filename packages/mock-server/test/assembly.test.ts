// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { errorCode, FILES, mockRequest, sent, type SentResponse } from './mock-request.ts';

const KEY = { 'x-api-key': 'nipost_test_mock_l1' };

function assemble(body: string): SentResponse {
  const request = mockRequest('/v1/assembly/assemble', { method: 'POST', headers: KEY, body });
  return sent(createGateway(FILES, () => 0)(request));
}

function disassemble(code: string): SentResponse {
  const request = mockRequest(`/v1/assembly/disassemble?code=${code}`, { headers: KEY });
  return sent(createGateway(FILES, () => 0)(request));
}

describe('assemble', () => {
  it('changes letters to upper case and pads numbers, as the gateway did', () => {
    const segments = { state: 'fc', lga: '1', district: 'z99', area: 'zz', unit: '1' };
    expect(assemble(JSON.stringify(segments)).body).toEqual({
      data: { compact: 'FC01Z99ZZ01', display: 'FC 01 Z99 ZZ 01', postcode: 'FC-01-Z99-ZZ-01' },
    });
  });

  it.each([
    ['a body that is not JSON', '{state'],
    ['a body that is a list', '[]'],
    ['a missing unit', '{"state":"FC","lga":"01","district":"Z99","area":"ZZ"}'],
    ['a unit of 0', '{"state":"FC","lga":"01","district":"Z99","area":"ZZ","unit":"0"}'],
  ])('answers %s with 400', (_name, body) => {
    const response = assemble(body);
    expect([response.status, errorCode(response)]).toEqual([400, 'invalid_request']);
  });
});

describe('disassemble', () => {
  it('splits a postcode into its five segments', () => {
    expect(disassemble('fc01z99zz01').body).toEqual({
      data: { state: 'FC', lga: '01', district: 'Z99', area: 'ZZ', unit: '01' },
    });
  });

  it('answers text that is not a postcode with 400', () => {
    expect(disassemble('HELLO').status).toBe(400);
  });
});

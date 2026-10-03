// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import type { Reply } from '../src/reply.ts';
import { errorCode, FILES, mockRequest, sent, type SentResponse } from './mock-request.ts';

function ask(target: string): Reply {
  const request = mockRequest(target, { headers: { 'x-api-key': 'nipost_test_mock_l1' } });
  return createGateway(FILES, () => 0)(request);
}

function data(response: SentResponse): unknown {
  return (response.body as { data: unknown }).data;
}

describe('reverse', () => {
  it('finds the synthetic unit at its point', () => {
    expect(data(sent(ask('/v1/search/reverse?lat=9&lng=7')))).toEqual({
      found: true,
      coordinate: [7, 9],
      unit: {
        postcode: 'FC-01-Z99-ZZ-01',
        display: 'FC 01 Z99 ZZ 01',
        distance_m: 4.2,
        confidence: 'low',
      },
      area: 'FC-01-Z99-ZZ',
      district: 'FC-01-Z99',
      state: 'FC',
      depth: 'unit',
      radius_m: 25,
    });
  });

  it('matches a point that the client writes as 9.000 and 7.0', () => {
    const found = data(sent(ask('/v1/search/reverse?lat=9.000&lng=7.0')));
    expect(found).toMatchObject({ found: true, coordinate: [7, 9], depth: 'unit' });
  });

  it('finds the area with no unit at its point', () => {
    const found = data(sent(ask('/v1/search/reverse?lat=9.001&lng=7.001&max_distance_m=40')));
    expect(found).toEqual({
      found: true,
      coordinate: [7.001, 9.001],
      area: 'FC-01-Z99-ZZ',
      district: 'FC-01-Z99',
      state: 'FC',
      depth: 'area',
      radius_m: 40,
    });
  });

  it('finds nothing elsewhere, and echoes the point as [lng, lat]', () => {
    expect(data(sent(ask('/v1/search/reverse?lat=4&lng=3')))).toEqual({
      found: false,
      coordinate: [3, 4],
      message: 'no postcode found near this point',
      radius_m: 25,
    });
  });

  it.each([
    ['a latitude that is right and a longitude that is not', 'lat=9&lng=8'],
    ['a longitude that is right and a latitude that is not', 'lat=8&lng=7'],
  ])('finds nothing for %s', (_name, query) => {
    expect(data(sent(ask(`/v1/search/reverse?${query}`)))).toMatchObject({ found: false });
  });

  it.each([
    ['0', false],
    ['1', false],
    ['4.1', false],
    ['4.2', true],
    ['5', true],
  ])('with a radius of %s m, finds the unit at 4.2 m: %s', (radius, found) => {
    const body = data(sent(ask(`/v1/search/reverse?lat=9&lng=7&max_distance_m=${radius}`)));
    expect(body).toMatchObject({ found, radius_m: Number(radius) });
  });

  it('accepts a radius of 0 at a point with nothing near it', () => {
    const found = data(sent(ask('/v1/search/reverse?lat=4&lng=3&max_distance_m=0')));
    expect(found).toMatchObject({ found: false, radius_m: 0 });
  });

  it('reads a number as decimal text only', () => {
    expect(sent(ask('/v1/search/reverse?lat=0x9&lng=7')).status).toBe(400);
    expect(sent(ask('/v1/search/reverse?lat=9&lng=7e0')).status).toBe(200);
  });

  it('lowers a radius above 250 m to 250 m', () => {
    const found = data(sent(ask('/v1/search/reverse?lat=4&lng=3&max_distance_m=900')));
    expect(found).toMatchObject({ radius_m: 250 });
  });

  it.each([
    ['no latitude', 'lng=7'],
    ['a latitude that is not a number', 'lat=north&lng=7'],
    ['an empty longitude', 'lat=9&lng='],
    ['a negative radius', 'lat=9&lng=7&max_distance_m=-1'],
  ])('answers %s with 400', (_name, query) => {
    const response = sent(ask(`/v1/search/reverse?${query}`));
    expect([response.status, errorCode(response)]).toEqual([400, 'invalid_request']);
  });
});

describe('nearby', () => {
  it('gives the empty list, the only body that the gateway has shown', () => {
    expect(sent(ask('/v1/search/nearby?lat=9&lng=7&radius=200')).body).toEqual({ data: [] });
  });

  it.each([
    ['no longitude', 'lat=9'],
    ['no latitude', 'lng=7'],
    ['a latitude that is not a number', 'lat=north&lng=7'],
    ['a negative radius', 'lat=9&lng=7&radius=-1'],
  ])('answers %s with 400', (_name, query) => {
    expect(sent(ask(`/v1/search/nearby?${query}`)).status).toBe(400);
  });
});

describe('autocomplete', () => {
  it.each([
    ['E', 'state', ['EB', 'ED', 'EK', 'EN']],
    ['FC', 'state', ['FC']],
    ['FC0', 'lga', ['01']],
    ['FC01Z', 'district', ['Z99']],
    ['fc 01 z99 z', 'area', ['ZZ']],
    ['FC-01-Z99-ZZ-0', 'unit', ['01']],
    ['EK01', 'lga', []],
  ])('completes %s in the %s segment', (q, segment, codes) => {
    const response = sent(ask(`/v1/search/autocomplete?q=${encodeURIComponent(q)}`));
    expect(data(response)).toEqual({ segment, suggestions: codes.map((code) => ({ code })) });
  });

  it.each([
    ['an empty q', ''],
    ['a q of separators only', '%20-%20'],
  ])('sends no answer to %s, as the gateway did', (_name, q) => {
    expect(ask(`/v1/search/autocomplete?q=${q}`)).toEqual({ kind: 'hang' });
  });

  it.each([
    ['a q of 12 characters', 'FC01Z99ZZ011'],
    ['a q with a character that no postcode has', 'F%21'],
  ])('answers %s with 400', (_name, q) => {
    expect(sent(ask(`/v1/search/autocomplete?q=${q}`)).status).toBe(400);
  });
});

describe('autocomplete with a state list out of order', () => {
  it('sorts the suggestions and lists each code once', () => {
    const files = { ...FILES, states: ['EK', 'ED', 'EK', 'EB'] };
    const request = mockRequest('/v1/search/autocomplete?q=E', {
      headers: { 'x-api-key': 'nipost_test_mock_l1' },
    });
    const body = data(sent(createGateway(files, () => 0)(request)));
    expect(body).toEqual({
      segment: 'state',
      suggestions: [{ code: 'EB' }, { code: 'ED' }, { code: 'EK' }],
    });
  });
});

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { parse } from '@gatepost/core';
import { describe, expect, it } from 'vitest';
import { PostcodeError } from '../src/index.js';
import { autocompleteRequest, lookupRequest, reverseRequest } from '../src/requests.js';

const FORMAT = new URL('../../../spec/data/format.json', import.meta.url);
const { maxInputCodePoints } = JSON.parse(readFileSync(FORMAT, 'utf8')) as {
  readonly maxInputCodePoints: number;
};

function failure(build: () => unknown): PostcodeError {
  try {
    build();
  } catch (error: unknown) {
    if (error instanceof PostcodeError) {
      return error;
    }
  }
  throw new Error('The call raised no PostcodeError.');
}

describe('lookupRequest', () => {
  it('sends the canonical form and the level', () => {
    const { postcode, request } = lookupRequest('fc01 z99 zz01', 2);
    expect(postcode.canonical).toBe('FC-01-Z99-ZZ-01');
    expect(request).toEqual({ path: '/v1/lookup', query: { code: 'FC-01-Z99-ZZ-01', level: '2' } });
  });

  it('uses level 1 when the caller leaves the level out', () => {
    const { level, request } = lookupRequest('FC-01-Z99-ZZ-01', undefined);
    expect(level).toBe(1);
    expect(request.query['level']).toBe('1');
  });

  it('takes a postcode that parse returned', () => {
    const parsed = parse('LA-01-Z99-ZZ-01');
    if (!parsed.ok) {
      throw new Error('The test code does not parse.');
    }
    expect(lookupRequest(parsed.value, 1).request.query['code']).toBe('LA-01-Z99-ZZ-01');
  });

  it('refuses a partial postcode, also one that parse returned, and names the reason', () => {
    const area = parse('FC-01-Z99-ZZ', { allowPartial: true });
    if (!area.ok) {
      throw new Error('The test code does not parse.');
    }
    for (const code of ['FC-01-Z99', area.value]) {
      const error = failure(() => lookupRequest(code, 1));
      expect(error.code).toBe('invalid_input');
      expect(error.status).toBeNull();
      expect(error.message).toContain('(bad_length)');
    }
  });

  it('refuses a legacy postcode', () => {
    expect(failure(() => lookupRequest('900108', 1)).message).toContain('(legacy_code)');
  });

  it.each([0, 6, 2.5, -1, Number.NaN, Number.POSITIVE_INFINITY, '2'])(
    'refuses the level %j',
    (level) => {
      const error = failure(() => lookupRequest('FC-01-Z99-ZZ-01', level as number));
      expect(error.code).toBe('invalid_input');
      expect(error.status).toBeNull();
    },
  );
});

describe('reverseRequest', () => {
  it('writes each number as JavaScript prints it, and adds the radius only when given', () => {
    expect(reverseRequest(9, 7, undefined)).toEqual({
      path: '/v1/search/reverse',
      query: { lat: '9', lng: '7' },
    });
    expect(reverseRequest(9.001, -0.5, 250).query).toEqual({
      lat: '9.001',
      lng: '-0.5',
      max_distance_m: '250',
    });
  });

  it('writes a number in full, with no exponent, and a negative zero as 0', () => {
    expect(reverseRequest(0.0000001, 1.5e-7, undefined).query).toEqual({
      lat: '0.0000001',
      lng: '0.00000015',
    });
    expect(reverseRequest(-0.0000001, -0, 0).query).toEqual({
      lat: '-0.0000001',
      lng: '0',
      max_distance_m: '0',
    });
  });

  it('accepts the limits of each range', () => {
    expect(reverseRequest(-90, 180, 0).query['lat']).toBe('-90');
    expect(reverseRequest(90, -180, 250).query['lng']).toBe('-180');
  });

  it.each([
    [90.5, 7, undefined],
    [-91, 7, undefined],
    [Number.NaN, 7, undefined],
    [Number.POSITIVE_INFINITY, 7, undefined],
    [9, 180.1, undefined],
    [9, -181, undefined],
    [9, Number.NEGATIVE_INFINITY, undefined],
    [9, 7, 251],
    [9, 7, -1],
    [9, 7, Number.NaN],
    [9, '7', undefined],
  ])('refuses lat %j, lng %j and radius %j', (lat, lng, radius) => {
    const error = failure(() => reverseRequest(lat, lng as number, radius));
    expect(error.code).toBe('invalid_input');
    expect(error.status).toBeNull();
  });
});

describe('autocompleteRequest', () => {
  it('sends the normalised text', () => {
    expect(autocompleteRequest(' fc-01 z ')).toEqual({
      typed: 'FC01Z',
      request: { path: '/v1/search/autocomplete', query: { q: 'FC01Z' } },
    });
  });

  it('accepts the 11 characters of a whole code, and refuses a twelfth', () => {
    expect(autocompleteRequest('FC01Z99ZZ01').typed).toBe('FC01Z99ZZ01');
    expect(failure(() => autocompleteRequest('FC01Z99ZZ011')).code).toBe('invalid_input');
  });

  it.each(['', ' - ', 'FC!', `FC 01 ${String.fromCodePoint(0xe9)}`])(
    'refuses %j, which the gateway cannot use',
    (q) => {
      expect(failure(() => autocompleteRequest(q)).code).toBe('invalid_input');
    },
  );

  it('applies the input limit of the spec data before it normalises', () => {
    const atLimit = 'F'.padEnd(maxInputCodePoints);
    const overLimit = 'F'.padEnd(maxInputCodePoints + 1);
    expect(autocompleteRequest(atLimit).typed).toBe('F');
    expect(failure(() => autocompleteRequest(overLimit)).code).toBe('invalid_input');
  });

  it('names the input limit when the text is over it', () => {
    // Five letters after normalize, so only the length is wrong.
    const overLimit = 'FC 10'.padEnd(maxInputCodePoints + 1);
    const { message } = failure(() => autocompleteRequest(overLimit));
    expect(message).toContain(`${String(maxInputCodePoints)} code points`);
    expect(message).not.toContain('1 to 11');
  });

  it('counts code points, not UTF-16 units, for the input limit', () => {
    // Each mathematical bold capital is one code point in two UTF-16 units. NFKC makes it a
    // plain letter, so text at the limit still works.
    const bold = String.fromCodePoint(0x1d405, 0x1d402) + ' '.repeat(maxInputCodePoints - 2);
    expect(bold.length).toBeGreaterThan(maxInputCodePoints);
    expect(autocompleteRequest(bold).typed).toBe('FC');
  });
});

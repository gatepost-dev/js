// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// The contract scenarios cover the shapes that the gateway sends. These tests cover the shapes
// that it might send next, because NIPOST's API is at version 0.1 (API-14).
import { parse, type Postcode } from '@gatepost/core';
import { describe, expect, it } from 'vitest';
import { PostcodeError } from '../src/index.js';
import { apiCodeOf, dataOf, readAutocomplete, readLookup, readReverse } from '../src/responses.js';

function postcode(text: string): Postcode {
  const parsed = parse(text, { allowPartial: true });
  if (!parsed.ok) {
    throw new Error(`${text} does not parse.`);
  }
  return parsed.value;
}

const UNIT = postcode('FC-01-Z99-ZZ-01');

function unexpected(read: () => unknown): PostcodeError {
  try {
    read();
  } catch (error: unknown) {
    if (error instanceof PostcodeError && error.code === 'unexpected_response') {
      return error;
    }
  }
  throw new Error('The reader raised no unexpected_response.');
}

describe('dataOf and apiCodeOf', () => {
  it('reads the data field, which can be any JSON value', () => {
    expect(dataOf({ data: [] })).toEqual([]);
  });

  it.each([undefined, null, [], 'text', { error: {} }, { result: {} }])(
    'gives unexpected_response with status 200 for the body %j',
    (body) => {
      expect(unexpected(() => dataOf(body)).status).toBe(200);
    },
  );

  it.each([
    [{ error: { code: 'level_not_granted', message: 'any' } }, 'level_not_granted'],
    [{ error: { code: 7 } }, null],
    [{ error: 'level_not_granted' }, null],
    [undefined, null],
  ])('reads the API code of %j as %j', (body, apiCode) => {
    expect(apiCodeOf(body)).toBe(apiCode);
  });
});

describe('readLookup', () => {
  const read = (data: unknown) => readLookup(data, { postcode: UNIT, level: 5 });

  it.each([
    [{ valid: true }, 1],
    [{ valid: true, recent_house_address: { recent: 'x' } }, 2],
    [{ valid: true, administrative_address: {} }, 2],
    [{ valid: true, building_use_status: 'residential' }, 3],
    [{ valid: true, other_building_info: {} }, 4],
    [{ valid: true, point_geometry: [7, 9] }, 5],
    [{ valid: true, administrative_address: null, point_geometry: null }, 1],
  ])('reads %j as level %i', (data, level) => {
    expect(read(data).levelReceived).toBe(level);
  });

  it('keeps the level that the caller asked for, and the postcode that the core parsed', () => {
    const result = read({ postcode: 'SOMETHING ELSE', valid: false });
    expect(result.levelRequested).toBe(5);
    expect(result.postcode).toBe(UNIT);
  });

  it('gives null for each address name that is missing, and for an address that is text', () => {
    const result = read({
      valid: true,
      administrative_address: { state_name: 'FEDERAL CAPITAL TERRITORY', zone: 3 },
      recent_house_address: '1 SYNTHETIC STREET',
    });
    expect(result.administrativeAddress).toEqual({
      stateName: 'FEDERAL CAPITAL TERRITORY',
      lgaName: null,
      localityName: null,
      zone: null,
    });
    expect(result.recentHouseAddress).toBeNull();
  });

  it.each(['valid', 'restricted', 'invalid', 'not_found', 'maintenance'])(
    'keeps the status %s as text',
    (status) => {
      expect(read({ valid: false, status }).status).toBe(status);
    },
  );

  it('gives a null status when the response has none', () => {
    expect(read({ valid: true }).status).toBeNull();
    expect(read({ valid: true, status: null }).status).toBeNull();
  });

  it.each([5, true, {}, []])('gives unexpected_response for the status %j', (status) => {
    expect(unexpected(() => read({ valid: true, status })).status).toBe(200);
  });

  it.each([{}, { valid: 'true' }, null, []])('gives unexpected_response for %j', (data) => {
    expect(unexpected(() => read(data)).status).toBe(200);
  });
});

describe('readReverse', () => {
  const base = { found: true, radius_m: 250 };

  it('gives unexpected_response for a unit that it cannot read', () => {
    const units = [
      { postcode: 'FC-01-Z99', distance_m: 4.2 },
      { postcode: 'HELLO', distance_m: 4.2 },
      { distance_m: 4.2 },
      { postcode: 'FC-01-Z99-ZZ-01' },
      { postcode: 'FC-01-Z99-ZZ-01', distance_m: '4.2' },
      'FC-01-Z99-ZZ-01',
    ];
    for (const unit of units) {
      expect(unexpected(() => readReverse({ ...base, unit })).status).toBe(200);
    }
  });

  it('gives a null unit when the gateway sends none', () => {
    expect(readReverse({ ...base, unit: null }).unit).toBeNull();
    expect(readReverse(base).unit).toBeNull();
  });

  it('reads the names and the address of a unit when the gateway sends them', () => {
    const unit = {
      postcode: 'FC-01-Z99-ZZ-01',
      distance_m: 12.5,
      confidence: 'medium',
      state_name: 'FEDERAL CAPITAL TERRITORY',
      lga_name: 'SYNTHETIC LGA',
      locality_name: 'SYNTHETIC LOCALITY',
      address: '1 SYNTHETIC STREET',
    };
    expect(readReverse({ ...base, unit }).unit).toEqual({
      postcode: UNIT,
      distanceM: 12.5,
      confidence: 'medium',
      stateName: 'FEDERAL CAPITAL TERRITORY',
      lgaName: 'SYNTHETIC LGA',
      localityName: 'SYNTHETIC LOCALITY',
      address: '1 SYNTHETIC STREET',
    });
  });

  it('turns an unknown confidence into low', () => {
    const unit = { postcode: 'FC-01-Z99-ZZ-01', distance_m: 1, confidence: 'certain' };
    expect(readReverse({ ...base, unit }).unit?.confidence).toBe('low');
  });

  it('keeps the area and the district as the text that the gateway sent', () => {
    const text = readReverse({ ...base, area: 'FC-01-Z99-ZZ', district: 'FC-01-Z99', state: 'FC' });
    expect([text.area, text.district, text.state]).toEqual(['FC-01-Z99-ZZ', 'FC-01-Z99', 'FC']);
    const other = readReverse({ ...base, area: 'ZZ', district: 99 });
    expect([other.area, other.district, other.state]).toEqual(['ZZ', null, null]);
  });

  it('gives a null radius when the body has none or a radius that is not a number', () => {
    expect(readReverse({ found: false }).radiusM).toBeNull();
    expect(readReverse({ found: false, radius_m: '25' }).radiusM).toBeNull();
    expect(readReverse(base).radiusM).toBe(250);
  });

  it.each([{ radius_m: 25 }, { found: 'yes', radius_m: 25 }, [], null])(
    'gives unexpected_response for %j',
    (data) => {
      expect(unexpected(() => readReverse(data)).status).toBe(200);
    },
  );
});

describe('readAutocomplete', () => {
  it('builds the partial postcode of each segment from the typed text', () => {
    const cases = [
      ['F', 'state', 'FC', 'FC'],
      ['FC', 'state', 'FC', 'FC'],
      ['FC0', 'lga', '01', 'FC-01'],
      ['FC01Z9', 'district', 'Z99', 'FC-01-Z99'],
      // A district can hold letters. Cut one place later, FC01ZZ plus ZZZ reads as an area.
      ['FC01ZZZ', 'district', 'ZZZ', 'FC-01-ZZZ'],
      ['FC01Z99Z', 'area', 'ZZ', 'FC-01-Z99-ZZ'],
      ['FC01Z99ZZ01', 'unit', '01', 'FC-01-Z99-ZZ-01'],
    ] as const;
    for (const [typed, segment, code, canonical] of cases) {
      const result = readAutocomplete({ segment, suggestions: [{ code }] }, typed);
      expect(result.suggestions[0]?.postcode?.canonical).toBe(canonical);
    }
  });

  it('gives a null postcode when no cut of the typed text makes one', () => {
    const result = readAutocomplete({ segment: 'lga', suggestions: [{ code: '00' }] }, 'FC0');
    expect(result.suggestions).toEqual([{ code: '00', label: null, postcode: null }]);
  });

  it('leaves out each item that has no text in code', () => {
    const suggestions = [{ code: 'FC', label: 'SYNTHETIC' }, { label: 'x' }, 'FC', null];
    const result = readAutocomplete({ segment: 'state', suggestions }, 'F');
    expect(result.suggestions.map((item) => [item.code, item.label])).toEqual([
      ['FC', 'SYNTHETIC'],
    ]);
  });

  it.each([
    { segment: 'street', suggestions: [] },
    { segment: 'state' },
    { segment: 'state', suggestions: {} },
    { segment: 'state', suggestions: 'FC' },
    [],
  ])('gives unexpected_response for %j', (data) => {
    expect(unexpected(() => readAutocomplete(data, 'F')).status).toBe(200);
  });
});

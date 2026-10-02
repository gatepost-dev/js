// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { contains, parent, truncate, type Postcode, type Precision } from '../src/index.js';
import { loadVectors, parseVectorCode } from './vectors.js';

type TruncateExpect = { readonly canonical: string } | { readonly rejects: true };

// API-6: a returned postcode is immutable, and so are its segments.
function expectFrozen(code: Postcode): void {
  expect(Object.isFrozen(code)).toBe(true);
  expect(Object.isFrozen(code.segments)).toBe(true);
}

describe('truncate', () => {
  const cases = loadVectors<{ code: string; to: Precision }, TruncateExpect>(
    'truncate',
    'truncate',
  );

  it.each(cases)('$id $description', (vector) => {
    const run = (): Postcode => truncate(parseVectorCode(vector.input.code), vector.input.to);
    if ('rejects' in vector.expect) {
      expect(run).toThrow(RangeError);
    } else {
      const shorter = run();
      expect(shorter.canonical).toBe(vector.expect.canonical);
      expect(shorter).toEqual(parseVectorCode(vector.expect.canonical));
      expectFrozen(shorter);
    }
  });

  it('says how to fix a cut to a more precise segment', () => {
    expect(() => truncate(parseVectorCode('EK-01-A03'), 'unit')).toThrow(
      'Cannot truncate a postcode with district precision to unit. ' +
        'Choose district or a less precise segment.',
    );
  });

  it('says how to fix a cut of an area code to a unit', () => {
    expect(() => truncate(parseVectorCode('EK-01-A03-FK'), 'unit')).toThrow(
      'Cannot truncate a postcode with area precision to unit. ' +
        'Choose area or a less precise segment.',
    );
  });

  it('names an unknown precision that is a symbol, which a template cannot convert', () => {
    const run = (): Postcode => truncate(parseVectorCode('EK-01-A03'), Symbol('area') as never);
    expect(run).toThrow(RangeError);
    expect(run).toThrow('Unknown precision "Symbol(area)".');
  });

  it.each(['street', 'toString'])('names the unknown precision %s', (notPrecision) => {
    const run = (): Postcode => truncate(parseVectorCode('EK-01-A03'), notPrecision as Precision);
    expect(run).toThrow(RangeError);
    expect(run).toThrow(
      `Unknown precision "${notPrecision}". Use one of state, lga, district, area, unit.`,
    );
  });
});

describe('parent', () => {
  const cases = loadVectors<{ code: string }, { canonical: string | null }>('parent', 'parent');

  it.each(cases)('$id $description', (vector) => {
    const parentCode = parent(parseVectorCode(vector.input.code));
    const expectedParent =
      vector.expect.canonical === null ? null : parseVectorCode(vector.expect.canonical);
    expect(parentCode?.canonical ?? null).toBe(vector.expect.canonical);
    expect(parentCode).toEqual(expectedParent);
    if (parentCode !== null) {
      expectFrozen(parentCode);
    }
  });
});

describe('contains', () => {
  const cases = loadVectors<{ prefix: string; code: string }, { value: boolean }>(
    'contains',
    'contains',
  );

  it.each(cases)('$id $description', (vector) => {
    const inside = contains(
      parseVectorCode(vector.input.prefix),
      parseVectorCode(vector.input.code),
    );
    expect(inside).toBe(vector.expect.value);
  });
});

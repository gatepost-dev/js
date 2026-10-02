// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { contains, parent, truncate, type Postcode, type Precision } from '../src/index.js';
import { loadVectors, parseVectorCode } from './vectors.js';

type TruncateExpect = { readonly canonical: string } | { readonly rejects: true };

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
      expect(run().canonical).toBe(vector.expect.canonical);
    }
  });

  it('says how to fix a cut to a more precise segment', () => {
    expect(() => truncate(parseVectorCode('EK-01-A03'), 'unit')).toThrow(
      'Cannot truncate a district postcode to unit. Choose district or a less precise segment.',
    );
  });
});

describe('parent', () => {
  const cases = loadVectors<{ code: string }, { canonical: string | null }>('parent', 'parent');

  it.each(cases)('$id $description', (vector) => {
    const result = parent(parseVectorCode(vector.input.code));
    expect(result === null ? null : result.canonical).toBe(vector.expect.canonical);
  });
});

describe('contains', () => {
  const cases = loadVectors<{ prefix: string; code: string }, { value: boolean }>(
    'contains',
    'contains',
  );

  it.each(cases)('$id $description', (vector) => {
    const result = contains(
      parseVectorCode(vector.input.prefix),
      parseVectorCode(vector.input.code),
    );
    expect(result).toBe(vector.expect.value);
  });
});

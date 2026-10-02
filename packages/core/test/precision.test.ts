// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { precisionForAccuracy, type Precision } from '../src/index.js';
import { loadVectors } from './vectors.js';

type AccuracyInput = number | null | 'NaN' | 'Infinity' | '-Infinity';

function accuracy(input: AccuracyInput): number | null {
  if (input === 'NaN') {
    return Number.NaN;
  }
  if (input === 'Infinity') {
    return Number.POSITIVE_INFINITY;
  }
  if (input === '-Infinity') {
    return Number.NEGATIVE_INFINITY;
  }
  return input;
}

describe('precisionForAccuracy', () => {
  const cases = loadVectors<AccuracyInput, { value: Precision }>(
    'precision-for-accuracy',
    'precisionForAccuracy',
  );

  it.each(cases)('$id $description', (vector) => {
    expect(precisionForAccuracy(accuracy(vector.input))).toBe(vector.expect.value);
  });
});

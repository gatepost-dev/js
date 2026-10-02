// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { isLegacy } from '../src/index.js';
import { loadVectors } from './vectors.js';

describe('isLegacy', () => {
  const cases = loadVectors<string, { value: boolean }>('is-legacy', 'isLegacy');

  it.each(cases)('$id $description', (vector) => {
    expect(isLegacy(vector.input)).toBe(vector.expect.value);
  });
});

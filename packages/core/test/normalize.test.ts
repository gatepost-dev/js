// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { normalize } from '../src/index.js';
import { loadVectors } from './vectors.js';

describe('normalize', () => {
  const cases = loadVectors<string, { value: string }>('normalize', 'normalize');

  it.each(cases)('$id $description', (vector) => {
    expect(normalize(vector.input)).toBe(vector.expect.value);
  });
});

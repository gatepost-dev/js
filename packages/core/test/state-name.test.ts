// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { stateName } from '../src/index.js';
import { loadVectors } from './vectors.js';

describe('stateName', () => {
  const cases = loadVectors<string, { value: string | null }>('state-name', 'stateName');

  it.each(cases)('$id $description', (vector) => {
    expect(stateName(vector.input)).toBe(vector.expect.value);
  });
});

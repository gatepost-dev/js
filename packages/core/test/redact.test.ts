// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { redact } from '../src/index.js';
import { loadVectors, parseVectorCode } from './vectors.js';

describe('redact', () => {
  const cases = loadVectors<{ code: string }, { value: string }>('redact', 'redact');

  it.each(cases)('$id $description', (vector) => {
    expect(redact(parseVectorCode(vector.input.code))).toBe(vector.expect.value);
  });
});

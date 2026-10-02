// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLegacy, parse } from '../src/index.js';
import { MAX_INPUT_CODE_POINTS } from '../src/spec-data.js';
import { loadVectors } from './vectors.js';

describe('isLegacy', () => {
  const cases = loadVectors<string, { value: boolean }>('is-legacy', 'isLegacy');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(cases)('$id $description', (vector) => {
    expect(isLegacy(vector.input)).toBe(vector.expect.value);
  });

  it.each(cases)('$id gives the same answer as parse', (vector) => {
    const parsed = parse(vector.input);
    const parseFoundLegacy = !parsed.ok && parsed.error.code === 'legacy_code';
    expect(isLegacy(vector.input)).toBe(parseFoundLegacy);
  });

  it('skips normalisation over the input limit but not at the limit', () => {
    const normalizeCalls = vi.spyOn(String.prototype, 'normalize');
    isLegacy('900108'.padEnd(MAX_INPUT_CODE_POINTS + 1));
    expect(normalizeCalls).toHaveBeenCalledTimes(0);
    isLegacy('900108'.padEnd(MAX_INPUT_CODE_POINTS));
    expect(normalizeCalls).toHaveBeenCalledTimes(1);
  });
});

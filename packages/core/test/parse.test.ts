// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parse,
  type ParseError,
  type ParseResult,
  type Precision,
  type Segments,
} from '../src/index.js';
import { MAX_INPUT_CODE_POINTS } from '../src/spec-data.js';
import { loadVectors } from './vectors.js';

type ParseExpect =
  | {
      readonly ok: true;
      readonly compact: string;
      readonly canonical: string;
      readonly display: string;
      readonly precision: Precision;
      readonly segments: Segments;
    }
  | { readonly ok: false; readonly error: ParseError };

function expected(vector: ParseExpect): ParseResult {
  if (!vector.ok) {
    return { ok: false, error: vector.error };
  }
  const { compact, canonical, display, precision, segments } = vector;
  return { ok: true, value: { compact, canonical, display, precision, segments } };
}

const PARSE_FILES = ['parse', 'parse-segments', 'parse-states'] as const;

describe.each(PARSE_FILES)('parse with %s.json', (file) => {
  const cases = loadVectors<string, ParseExpect>(file, 'parse');

  it.each(cases)('$id $description', (vector) => {
    const options = vector.options as { readonly allowPartial?: boolean };
    expect(parse(vector.input, options)).toEqual(expected(vector.expect));
  });
});

describe('parse results', () => {
  it('freezes each object in a success and in a failure', () => {
    const success = parse('EK01A03FK01');
    const failure = parse('not a postcode');
    expect({
      success: Object.isFrozen(success),
      postcode: success.ok && Object.isFrozen(success.value),
      segments: success.ok && Object.isFrozen(success.value.segments),
      failure: Object.isFrozen(failure),
      error: !failure.ok && Object.isFrozen(failure.error),
    }).toEqual({ success: true, postcode: true, segments: true, failure: true, error: true });
  });
});

describe('parse input limit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips normalisation over the input limit but not at the limit', () => {
    const normalizeCalls = vi.spyOn(String.prototype, 'normalize');
    parse('EK01A03FK01'.padEnd(MAX_INPUT_CODE_POINTS + 1));
    expect(normalizeCalls).toHaveBeenCalledTimes(0);
    parse('EK01A03FK01'.padEnd(MAX_INPUT_CODE_POINTS));
    expect(normalizeCalls).toHaveBeenCalledTimes(1);
  });
});

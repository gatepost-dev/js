// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  parse,
  type ParseError,
  type ParseResult,
  type Precision,
  type Segments,
} from '../src/index.js';
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

describe.each(['parse', 'parse-states'])('parse with %s.json', (file) => {
  const cases = loadVectors<string, ParseExpect>(file, 'parse');

  it.each(cases)('$id $description', (vector) => {
    const options = vector.options as { readonly allowPartial?: boolean };
    expect(parse(vector.input, options)).toEqual(expected(vector.expect));
  });
});

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { isOverInputLimit } from './input-limit.js';
import { normalize } from './normalize.js';
import { makePostcode } from './postcode.js';
import { LEGACY, PRECISION_ORDER, SEGMENT_BOUNDS } from './spec-data.js';
import type { ParseError, ParseErrorCode, ParseResult } from './types.js';

const CODE_CHARACTERS = /^[A-Z0-9]+$/;
const FULL_LENGTH = SEGMENT_BOUNDS.unit.end;

interface ParseOptions {
  readonly allowPartial?: boolean;
}

/**
 * Reads a postcode that a user typed or pasted. It accepts spaces, hyphens, dashes and any
 * letter case. It never throws. Input with more than 64 code points fails with `bad_length`
 * before it is normalised, so long text cannot stall a server.
 *
 * @param input - Text from a user.
 * @param options - Set `allowPartial` to accept a code that stops after a segment.
 * @returns The postcode, or the reason that the input is not one.
 * @example
 * ```ts
 * const result = parse('ek 01 a03 fk 01');
 * if (result.ok) {
 *   result.value.canonical; // 'EK-01-A03-FK-01'
 * } else {
 *   result.error.code; // for example 'bad_length'
 * }
 * ```
 */
export function parse(input: string, options: ParseOptions = {}): ParseResult {
  if (isOverInputLimit(input)) {
    return failure('bad_length');
  }
  const text = normalize(input);
  if (text === '') {
    return failure('empty');
  }
  if (LEGACY.test(text)) {
    return failure('legacy_code');
  }
  if (!CODE_CHARACTERS.test(text)) {
    return failure('bad_character');
  }
  const precision = PRECISION_ORDER.find((name) => SEGMENT_BOUNDS[name].end === text.length);
  if (precision === undefined || (options.allowPartial !== true && text.length !== FULL_LENGTH)) {
    return failure('bad_length');
  }
  const result: ParseResult = { ok: true, value: makePostcode(text, precision) };
  return Object.freeze(result);
}

function failure(code: ParseErrorCode): ParseResult {
  const error: ParseError = Object.freeze({ code, segment: null, suggestion: null });
  const result: ParseResult = { ok: false, error };
  return Object.freeze(result);
}

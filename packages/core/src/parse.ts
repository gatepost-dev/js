// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { isOverInputLimit } from './input-limit.js';
import { normalize } from './normalize.js';
import { makePostcode, segmentsOf } from './postcode.js';
import {
  DIGIT_FIXES,
  LEGACY,
  LETTER_FIXES,
  PRECISION_ORDER,
  SEGMENT_BOUNDS,
  SEGMENT_RULES,
  STATES,
} from './spec-data.js';
import type {
  ParseError,
  ParseErrorCode,
  ParseResult,
  Precision,
  SegmentRule,
  Segments,
} from './types.js';

const CODE_CHARACTERS = /^[A-Z0-9]+$/;
const LETTERS = /^[A-Z]+$/;
const DIGITS = /^[0-9]+$/;
const FULL_LENGTH = SEGMENT_BOUNDS.unit.end;
const FIXES: Readonly<Record<SegmentRule['characters'], ReadonlyMap<string, string> | null>> = {
  letters: LETTER_FIXES,
  digits: DIGIT_FIXES,
  // NIPOST has not confirmed the district's characters, so a suggestion never changes them.
  'letters-or-digits': null,
};

interface Problem {
  readonly code: ParseErrorCode;
  readonly segment: Precision;
}

/**
 * Reads a postcode that a user typed or pasted. It accepts spaces, hyphens, dashes and any
 * letter case. It never throws for a string. Input over the input limit of the spec fails with
 * `bad_length` before `parse` normalises it, so long text cannot stall a server.
 *
 * After normalisation, `parse` applies these checks in order. The first check that fails sets
 * `error.code`:
 * - `empty`: no character remains.
 * - `legacy_code`: exactly 6 ASCII digits remain. These are old NIPOST postcodes.
 * - `bad_character`: a character other than A to Z and 0 to 9 remains.
 * - `bad_length`: the length is not 11. With `allowPartial`, the lengths 2, 4, 7 and 9 also pass.
 * - `unknown_state`: the first two characters are not a state code.
 * - `bad_segment`: a segment breaks its rule, such as an LGA of 00.
 *
 * For `unknown_state` and `bad_segment`, `error.segment` names the failing segment. Both codes
 * can also set `error.suggestion` to the canonical form of one fixed code. The fix replaces a
 * look-alike character that is in the wrong place, such as the letter O in an LGA. It never
 * changes the district. The suggestion is null when no fix applies, or when the fixed code does
 * not parse. A suggestion is a hint only. `parse` never returns a fixed code as a success.
 *
 * @param input - Text from a user.
 * @param options - Set `allowPartial` to accept a code that stops after a segment.
 * @returns The postcode, or the reason that the input is not one.
 * @example
 * ```ts
 * const parsed = parse('ek 01 a03 fk 01');
 * if (parsed.ok) {
 *   parsed.value.canonical; // 'EK-01-A03-FK-01'
 * }
 *
 * const mistyped = parse('ek o1 a03 fk 01'); // a letter o where a zero belongs
 * if (!mistyped.ok) {
 *   mistyped.error.code; // 'bad_segment'
 *   mistyped.error.segment; // 'lga'
 *   mistyped.error.suggestion; // 'EK-01-A03-FK-01'
 * }
 * ```
 */
export function parse(
  input: string,
  options: Readonly<{ allowPartial?: boolean }> = {},
): ParseResult {
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
  const problem = firstProblem(segmentsOf(text));
  if (problem !== null) {
    return failure(problem.code, problem.segment, suggest(text, options));
  }
  return Object.freeze({ ok: true, value: makePostcode(text, precision) });
}

function firstProblem(segments: Segments): Problem | null {
  if (!STATES.has(segments.state)) {
    return { code: 'unknown_state', segment: 'state' };
  }
  const broken = SEGMENT_RULES.find((rule) => {
    const segment = segments[rule.name];
    return segment !== null && !followsRule(segment, rule);
  });
  return broken === undefined ? null : { code: 'bad_segment', segment: broken.name };
}

function followsRule(segment: string, rule: SegmentRule): boolean {
  switch (rule.characters) {
    case 'letters':
      return LETTERS.test(segment);
    case 'digits':
      return DIGITS.test(segment) && (rule.minimum === null || Number(segment) >= rule.minimum);
    case 'letters-or-digits':
      return CODE_CHARACTERS.test(segment);
  }
}

// A suggestion is a hint for the user. parse never returns the fixed code as a success.
// Fixing a fixed code changes nothing, so the second parse ends the recursion at once.
function suggest(text: string, options: Readonly<{ allowPartial?: boolean }>): string | null {
  const segments = segmentsOf(text);
  const fixed = SEGMENT_RULES.map((rule) => fixSegment(segments[rule.name], rule)).join('');
  if (fixed === text) {
    return null;
  }
  const reparsed = parse(fixed, options);
  return reparsed.ok ? reparsed.value.canonical : null;
}

function fixSegment(segment: string | null, rule: SegmentRule): string {
  if (segment === null) {
    return '';
  }
  const fixes = FIXES[rule.characters];
  if (fixes === null) {
    return segment;
  }
  return Array.from(segment, (character) => fixes.get(character) ?? character).join('');
}

function failure(
  code: ParseErrorCode,
  segment: Precision | null = null,
  suggestion: string | null = null,
): ParseResult {
  const error: ParseError = Object.freeze({ code, segment, suggestion });
  return Object.freeze({ ok: false, error });
}

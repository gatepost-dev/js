// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { normalize, parse, type Postcode, type Precision } from '@gatepost/core';

/**
 * What the field reads in the text of its input: nothing, a whole postcode, a legacy postcode,
 * or a parse error with its suggestion and the count of characters that the message shows.
 *
 * @internal
 */
export type Reading =
  | { readonly kind: 'empty' }
  | { readonly kind: 'postcode'; readonly postcode: Postcode }
  | { readonly kind: 'legacy'; readonly digits: string }
  | {
      readonly kind: 'error';
      readonly code: 'bad_character' | 'bad_length' | 'unknown_state' | 'bad_segment';
      readonly segment: Precision | null;
      readonly suggestion: Postcode | null;
      readonly count: number;
    };

// The core reads at most 64 code points (maxInputCodePoints in spec/data/format.json), and
// normalize has no limit, so the field never normalises a longer text. Such a text is no
// postcode, and its own count is close enough for the message.
const LONG_TEXT = 64;

// The grammar counts code points, not UTF-16 units, so Array.from splits the text.
function countOf(text: string): number {
  const codePoints = Array.from(text).length;
  return codePoints > LONG_TEXT ? codePoints : Array.from(normalize(text)).length;
}

// A suggestion of the core is a canonical form that parses, so the field can show it in the
// display form.
function postcodeOf(suggestion: string | null): Postcode | null {
  const parsed = suggestion === null ? null : parse(suggestion);
  return parsed?.ok === true ? parsed.value : null;
}

/**
 * Reads the text of the input with the core. Partial postcodes do not pass.
 *
 * @param text - The text as the user typed or pasted it.
 * @returns The reading of the text.
 * @internal
 */
export function readText(text: string): Reading {
  const parsed = parse(text);
  if (parsed.ok) {
    return { kind: 'postcode', postcode: parsed.value };
  }
  const { code, segment, suggestion } = parsed.error;
  if (code === 'empty') {
    return { kind: 'empty' };
  }
  if (code === 'legacy_code') {
    return { kind: 'legacy', digits: normalize(text) };
  }
  return { kind: 'error', code, segment, suggestion: postcodeOf(suggestion), count: countOf(text) };
}

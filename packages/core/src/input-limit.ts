// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { MAX_INPUT_CODE_POINTS } from './spec-data.js';

/**
 * Tells whether text has more code points than the input limit allows. It counts code points,
 * not UTF-16 units and not grapheme clusters, and it counts a lone surrogate as one. The cost
 * depends on the limit, not on the length of the text. A string never has more code points than
 * UTF-16 units, so short text passes at once. For longer text, the count stops at one more than
 * the limit.
 *
 * @param input - Text from a user, before any normalisation.
 * @returns True when the text has more than `MAX_INPUT_CODE_POINTS` code points.
 * @internal
 */
export function isOverInputLimit(input: string): boolean {
  if (input.length <= MAX_INPUT_CODE_POINTS) {
    return false;
  }
  const codePoints = input[Symbol.iterator]();
  // Reading one code point past the limit is enough to prove that the text is over it.
  for (let counted = 0; counted <= MAX_INPUT_CODE_POINTS; counted += 1) {
    if (codePoints.next().done === true) {
      return false;
    }
  }
  return true;
}

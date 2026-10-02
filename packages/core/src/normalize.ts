// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { upperAscii } from './ascii.js';
import { SEPARATORS } from './spec-data.js';

/**
 * Cleans text that a user typed or pasted. It applies Unicode NFKC, removes the separators that
 * the spec lists, and makes the ASCII letters a to z upper case. The separators are white space
 * (including tabs and line breaks), hyphens and dashes, the full stop, and some zero-width
 * characters. It keeps every other character, such as the right-to-left override U+202E or a
 * letter with an accent. It does not check the result.
 *
 * @param input - Text from a user.
 * @returns The cleaned text.
 * @example
 * ```ts
 * normalize(' ek-01 a03.fk-01 '); // 'EK01A03FK01'
 * ```
 */
export function normalize(input: string): string {
  return upperAscii(input.normalize('NFKC').replace(SEPARATORS, ''));
}

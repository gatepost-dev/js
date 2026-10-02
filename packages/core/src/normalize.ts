// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { upperAscii } from './ascii.js';
import { SEPARATORS } from './spec-data.js';

/**
 * Cleans text that a user typed or pasted. It applies Unicode NFKC, removes spaces, dashes,
 * dots and zero-width characters, and makes ASCII letters upper case. It does not check the
 * result.
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

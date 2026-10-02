// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { isOverInputLimit } from './input-limit.js';
import { normalize } from './normalize.js';
import { LEGACY } from './spec-data.js';

/**
 * Tells whether text is an old 6-digit NIPOST postcode. A legacy postcode names an area, not
 * a building. Like parse, it does not normalise input with more than 64 code points, so long
 * text cannot stall a server.
 *
 * @param input - Text from a user.
 * @returns True when the input has 64 code points or fewer and exactly 6 digits remain after
 * normalisation.
 * @example
 * ```ts
 * isLegacy('900 108'); // true
 * isLegacy('EK-01-A03-FK-01'); // false
 * ```
 */
export function isLegacy(input: string): boolean {
  if (isOverInputLimit(input)) {
    return false;
  }
  return LEGACY.test(normalize(input));
}

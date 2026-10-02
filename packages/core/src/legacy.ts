// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { parse } from './parse.js';

/**
 * Tells whether text is an old 6-digit NIPOST postcode. A legacy postcode names an area, not
 * a building. Like `parse`, it applies the input limit before it normalises, so long text
 * cannot stall a server.
 *
 * @param input - Text from a user.
 * @returns True when the input is within the input limit and exactly 6 ASCII digits remain
 * after normalisation.
 * @example
 * ```ts
 * isLegacy('900 108'); // true
 * isLegacy('EK-01-A03-FK-01'); // false
 * ```
 */
export function isLegacy(input: string): boolean {
  const parsed = parse(input);
  return !parsed.ok && parsed.error.code === 'legacy_code';
}

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { upperAscii } from './ascii.js';
import { STATES } from './spec-data.js';

/**
 * Returns the English name of a state from its two-letter code. The lookup ignores ASCII letter
 * case only. It does not trim spaces, and it does not change other characters.
 *
 * @param stateCode - A state code, such as `EK`.
 * @returns The state's name, or null for an unknown code.
 * @example
 * ```ts
 * stateName('EK'); // 'Ekiti'
 * stateName('fc'); // 'Federal Capital Territory'
 * stateName('XX'); // null
 * ```
 */
export function stateName(stateCode: string): string | null {
  return STATES.get(upperAscii(stateCode)) ?? null;
}

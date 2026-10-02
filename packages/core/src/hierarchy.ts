// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { makePostcode } from './postcode.js';
import { precisionRank } from './precision.js';
import { PRECISION_ORDER, SEGMENT_BOUNDS } from './spec-data.js';
import type { Postcode, Precision } from './types.js';

/**
 * Cuts a postcode down to a less precise segment, for example from a building to its area.
 *
 * @param code - A parsed postcode.
 * @param to - The precision to keep. It must not be more precise than the code.
 * @returns The shorter postcode.
 * @throws RangeError when `to` is more precise than the code, or is not a precision.
 * @example
 * ```ts
 * const result = parse('EK-01-A03-FK-01');
 * if (result.ok) {
 *   truncate(result.value, 'district').canonical; // 'EK-01-A03'
 * }
 * ```
 */
export function truncate(code: Postcode, to: Precision): Postcode {
  // An untyped JavaScript caller can pass a value that is not a precision.
  if (precisionRank(to) < 0) {
    throw new RangeError(`Unknown precision ${to}.`);
  }
  if (precisionRank(to) > precisionRank(code.precision)) {
    const problem = `Cannot truncate a postcode with ${code.precision} precision to ${to}.`;
    throw new RangeError(`${problem} Choose ${code.precision} or a less precise segment.`);
  }
  return makePostcode(code.compact.slice(0, SEGMENT_BOUNDS[to].end), to);
}

/**
 * Returns the postcode one segment less precise, such as the area of a building.
 *
 * @param code - A parsed postcode.
 * @returns The parent postcode, or null for a state code.
 * @example
 * ```ts
 * const result = parse('EK-01-A03-FK-01');
 * if (result.ok) {
 *   parent(result.value)?.canonical; // 'EK-01-A03-FK'
 * }
 * ```
 */
export function parent(code: Postcode): Postcode | null {
  const larger = PRECISION_ORDER[precisionRank(code.precision) - 1];
  return larger === undefined ? null : truncate(code, larger);
}

/**
 * Tells whether a postcode lies inside another postcode. A postcode contains itself.
 *
 * @param prefix - The larger postcode, such as a district.
 * @param code - The postcode to test.
 * @returns True when `code` has each segment of `prefix` in the same place.
 * @example
 * ```ts
 * const district = parse('EK-01-A03', { allowPartial: true });
 * const building = parse('EK-01-A03-FK-01');
 * if (district.ok && building.ok) {
 *   contains(district.value, building.value); // true
 * }
 * ```
 */
export function contains(prefix: Postcode, code: Postcode): boolean {
  // Each precision has a fixed compact length, so a prefix always ends at a segment boundary.
  return code.compact.startsWith(prefix.compact);
}

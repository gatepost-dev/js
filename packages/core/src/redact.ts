// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { Postcode } from './types.js';

/**
 * Hides the unit of a postcode, so that a log shows the area but not the building. For a code
 * without a unit, it returns the canonical form unchanged.
 *
 * @param code - A parsed postcode.
 * @returns The canonical form, with `**` in place of the unit.
 * @example
 * ```ts
 * const building = parse('EK-01-A03-FK-01');
 * if (building.ok) {
 *   redact(building.value); // 'EK-01-A03-FK-**'
 * }
 * ```
 */
export function redact(code: Postcode): string {
  if (code.segments.unit === null) {
    return code.canonical;
  }
  return `${code.canonical.slice(0, code.canonical.lastIndexOf('-') + 1)}**`;
}

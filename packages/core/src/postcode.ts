// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { PRECISION_ORDER, SEGMENT_BOUNDS } from './spec-data.js';
import type { Postcode, Precision, Segments } from './types.js';

/**
 * Splits a normalised code of a valid length into its segments.
 *
 * @param compact - A normalised code of 2, 4, 7, 9 or 11 characters.
 * @returns The segments. Each missing segment is null.
 * @internal
 */
export function segmentsOf(compact: string): Segments {
  const read = (name: Precision): string | null => {
    const { start, end } = SEGMENT_BOUNDS[name];
    return compact.length >= end ? compact.slice(start, end) : null;
  };
  return Object.freeze({
    state: compact.slice(SEGMENT_BOUNDS.state.start, SEGMENT_BOUNDS.state.end),
    lga: read('lga'),
    district: read('district'),
    area: read('area'),
    unit: read('unit'),
  });
}

/**
 * Builds a frozen postcode from a normalised code that the caller already checked.
 *
 * @param compact - The checked code.
 * @param precision - Its most precise segment.
 * @returns The postcode in every form.
 * @internal
 */
export function makePostcode(compact: string, precision: Precision): Postcode {
  const segments = segmentsOf(compact);
  const presentSegments = PRECISION_ORDER.flatMap((name) => {
    const segment = segments[name];
    return segment === null ? [] : [segment];
  });
  return Object.freeze({
    compact,
    canonical: presentSegments.join('-'),
    display: presentSegments.join(' '),
    segments,
    precision,
  });
}

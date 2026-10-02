// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { PRECISION_FALLBACK, PRECISION_THRESHOLDS } from './spec-data.js';
import type { Precision } from './types.js';

/**
 * Returns the most precise segment that a GPS fix of this accuracy supports. A phone can
 * show a full code only when its fix is accurate to 8 m or better.
 *
 * @param accuracyM - The GPS accuracy radius in metres, or null when it is unknown.
 * @returns `unit`, `area`, `district` or `lga`.
 * @example
 * ```ts
 * precisionForAccuracy(6); // 'unit'
 * precisionForAccuracy(35); // 'district'
 * precisionForAccuracy(null); // 'lga'
 * ```
 */
export function precisionForAccuracy(accuracyM: number | null): Precision {
  if (accuracyM === null || !Number.isFinite(accuracyM) || accuracyM < 0) {
    return PRECISION_FALLBACK;
  }
  const threshold = PRECISION_THRESHOLDS.find((row) => accuracyM <= row.maxAccuracyM);
  return threshold === undefined ? PRECISION_FALLBACK : threshold.precision;
}

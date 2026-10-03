// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { Precision } from '@gatepost/core';
import type { Reading } from './reading.js';
import type { MessageKey } from './spec-messages.js';

const PLACEHOLDER = /\{(\w+)\}/g;

// The grammar lets only the LGA, the area and the unit fail a segment check: the state fails as
// an unknown state, and the district takes any letters and digits.
function segmentKey(segment: Precision | null): MessageKey {
  switch (segment) {
    case 'lga':
      return 'bad_lga';
    case 'area':
      return 'bad_area';
    default:
      return 'bad_unit';
  }
}

/**
 * Gives the key of the message for a reading of the text.
 *
 * @param reading - The reading of the text.
 * @param legacy - Whether the field accepts a legacy postcode.
 * @returns The message key that `spec/field.md` names for the reading.
 * @internal
 */
export function keyForReading(reading: Reading, legacy: 'accept' | 'reject'): MessageKey {
  switch (reading.kind) {
    case 'empty':
      return 'empty';
    case 'postcode':
      return 'valid';
    case 'legacy':
      return legacy === 'accept' ? 'legacy_accepted' : 'legacy_rejected';
    case 'error':
      return reading.code === 'bad_segment' ? segmentKey(reading.segment) : reading.code;
  }
}

/**
 * Puts each value in place of its placeholder. A placeholder with no value stays as it is, so
 * a translation with a wrong name shows the mistake on screen.
 *
 * @param template - A message with placeholders in braces, such as `{count}`.
 * @param values - The value of each placeholder.
 * @returns The message with the values in it.
 * @internal
 */
export function fill(
  template: string,
  values: Readonly<Partial<Record<string, string | number>>>,
): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = values[name];
    return value === undefined ? placeholder : String(value);
  });
}

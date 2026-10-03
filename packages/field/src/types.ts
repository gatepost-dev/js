// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { Postcode } from '@gatepost/core';

/**
 * How the text of the field changed: typed, pasted, taken from the suggestion of a parse error,
 * or filled in from the device's location.
 */
export type ChangeSource = 'typed' | 'pasted' | 'suggestion' | 'gps';

/**
 * The detail of the event `gatepost-change`, which the field raises when its form value changes
 * through the user.
 */
export interface ChangeDetail {
  /** The form value: the canonical form, the digits of a legacy postcode, or the trimmed text. */
  readonly value: string;
  /** The postcode when the text parses as a whole postcode, or null. */
  readonly postcode: Postcode | null;
  /** How the text changed. */
  readonly source: ChangeSource;
  /** The accuracy of the location in metres when `source` is `gps`, or null. */
  readonly accuracyM: number | null;
}

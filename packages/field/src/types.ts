// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { LookupResult, PostcodeErrorCode } from '@gatepost/client';
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

/**
 * The detail of the event `gatepost-confirm`, which the field raises when the gateway knows the
 * postcode.
 */
export interface ConfirmDetail {
  /** The lookup result, with every field that the key's level gave. */
  readonly lookup: LookupResult;
}

/**
 * Why the field raised `gatepost-error`: an error code of the client, a secret key in the page,
 * or a location that the user refused or the device did not give.
 */
export type FieldErrorCode = PostcodeErrorCode | 'secret_key' | 'gps_denied' | 'gps_unavailable';

/**
 * The detail of the event `gatepost-error`.
 */
export interface ErrorDetail {
  /** What failed. */
  readonly code: FieldErrorCode;
}

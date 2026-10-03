// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Call NIPOST's postcode gateway: look up a postcode, find the unit nearest to a coordinate,
 * and complete a postcode that a user is typing.
 *
 * Unofficial. Not made or endorsed by NIPOST.
 *
 * @packageDocumentation
 */
export { PostcodeError } from './error.js';
export type {
  AdministrativeAddress,
  AutocompleteResult,
  ClientOptions,
  Confidence,
  LookupLevel,
  LookupResult,
  LookupStatus,
  PostcodeErrorCode,
  ReverseResult,
  ReverseUnit,
} from './types.js';
export { SPEC_VERSION } from './version.js';

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Parse, check and format Nigeria's digital postcodes without network access.
 *
 * Unofficial. Not made or endorsed by NIPOST.
 *
 * @packageDocumentation
 */
export { contains, parent, truncate } from './hierarchy.js';
export { isLegacy } from './legacy.js';
export { normalize } from './normalize.js';
export { parse } from './parse.js';
export { precisionForAccuracy } from './precision.js';
export { redact } from './redact.js';
export { stateName } from './state-name.js';
export type {
  ParseError,
  ParseErrorCode,
  ParseResult,
  Postcode,
  Precision,
  Segments,
} from './types.js';
export { SPEC_VERSION } from './version.js';

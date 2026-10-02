// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0

/**
 * The most precise segment that a postcode or a result contains.
 */
export type Precision = 'state' | 'lga' | 'district' | 'area' | 'unit';

/**
 * The five segments of a postcode. A partial postcode has null for each missing segment.
 */
export interface Segments {
  /** Two letters for the state, such as `EK`. */
  readonly state: string;
  /** Two digits for the LGA, or null in a code that stops before it. */
  readonly lga: string | null;
  /** Three letters or digits for the district, or null. */
  readonly district: string | null;
  /** Two letters for the area, or null. */
  readonly area: string | null;
  /** Two digits for the unit, or null. */
  readonly unit: string | null;
}

/**
 * A postcode that `parse` accepted. Each form holds the same code.
 */
export interface Postcode {
  /** The code with no separators, for example `EK01A03FK01`. */
  readonly compact: string;
  /** The code with hyphens, for example `EK-01-A03-FK-01`. */
  readonly canonical: string;
  /** The code with spaces, for example `EK 01 A03 FK 01`. */
  readonly display: string;
  /** Each segment on its own. */
  readonly segments: Segments;
  /** The most precise segment in the code. */
  readonly precision: Precision;
}

/**
 * Why `parse` rejected its input. `grammar.md` in the spec repo defines each code.
 */
export type ParseErrorCode =
  'empty' | 'legacy_code' | 'bad_character' | 'bad_length' | 'unknown_state' | 'bad_segment';

/**
 * The reason for a failed parse.
 */
export interface ParseError {
  /** The reason, as a stable code. */
  readonly code: ParseErrorCode;
  /** The failing segment, for `unknown_state` and `bad_segment` only. */
  readonly segment: Precision | null;
  /** The canonical form of one corrected code, or null. It is a hint only. */
  readonly suggestion: string | null;
}

/**
 * The result of `parse`: a postcode, or the reason that there is none.
 */
export type ParseResult =
  | { readonly ok: true; readonly value: Postcode }
  | { readonly ok: false; readonly error: ParseError };

/**
 * The rule for one segment, from `spec/data/format.json`.
 *
 * @internal
 */
export interface SegmentRule {
  readonly name: Precision;
  readonly length: number;
  readonly characters: 'letters' | 'digits' | 'letters-or-digits';
  readonly minimum: number | null;
}

/**
 * Where a segment starts and ends in a compact code.
 *
 * @internal
 */
export interface SegmentBounds {
  readonly start: number;
  readonly end: number;
}

/**
 * The precision that a GPS fix supports up to an accuracy in metres.
 *
 * @internal
 */
export interface PrecisionThreshold {
  readonly maxAccuracyM: number;
  readonly precision: Precision;
}

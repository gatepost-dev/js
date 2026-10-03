// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { SegmentRule, SpecFiles } from './spec-files.ts';

// The mock server reads postcodes as the gateway does, not as the core does. The gateway
// ignores spaces, hyphens and letter case, and it does no NFKC.
const SEPARATORS = /[\s-]/g;
const CHARACTERS: ReadonlyMap<string, RegExp> = new Map([
  ['letters', /^[A-Z]+$/],
  ['digits', /^[0-9]+$/],
  ['letters-or-digits', /^[A-Z0-9]+$/],
]);

/**
 * Removes spaces and hyphens, and changes letters to upper case.
 *
 * @param text - The text of a request.
 * @returns The compact form of the text.
 * @internal
 */
export function compactCode(text: string): string {
  return text.toUpperCase().replace(SEPARATORS, '');
}

function segmentPasses(rule: SegmentRule, text: string): boolean {
  const pattern = CHARACTERS.get(rule.characters);
  return pattern?.test(text) === true && (rule.minimum === null || Number(text) >= rule.minimum);
}

/**
 * Tells whether a compact code has the form of a full postcode, with a known state.
 *
 * @param compact - The code in compact form.
 * @param files - The segment rules and the state codes.
 * @returns True for a full postcode in the right form.
 * @internal
 */
export function isWellFormed(compact: string, files: SpecFiles): boolean {
  const full = files.segments.at(-1)?.end;
  return (
    compact.length === full &&
    files.states.includes(compact.slice(0, 2)) &&
    files.segments.every((rule) => segmentPasses(rule, compact.slice(rule.start, rule.end)))
  );
}

/**
 * Finds the segment that holds the last character of a code of this length.
 *
 * @param length - The length of a compact code.
 * @param segments - The segment rules.
 * @returns The segment, or undefined for a length of 0 or a code that is too long.
 * @internal
 */
export function activeSegment(
  length: number,
  segments: readonly SegmentRule[],
): SegmentRule | undefined {
  return segments.find((rule) => length > rule.start && length <= rule.end);
}

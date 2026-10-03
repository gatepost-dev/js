// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { normalize, parse, type Postcode } from '@gatepost/core';
import { clientError } from './error.js';
import type { LookupLevel } from './types.js';

// A typed prefix of a postcode: letters and digits, at most as many as a whole compact code.
const QUERY = /^[A-Z0-9]{1,11}$/;
// The input limit of the grammar, maxInputCodePoints in spec/data/format.json. A test reads that
// file, so a change there fails CI. normalize has no limit of its own, and long text can stall it.
const INPUT_LIMIT = 64;
// The most that the gateway accepts as a radius, in metres.
const MAX_DISTANCE_M = 250;
// What String prints for a number below 1e-6 or above 1e21.
const EXPONENT_FORM = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/;

// A code point takes one or two UTF-16 units, so the first 2 x (limit + 1) units hold one code
// point more than the limit whenever the whole text does.
function isOverInputLimit(text: string): boolean {
  const head = text.slice(0, 2 * (INPUT_LIMIT + 1));
  return text.length > INPUT_LIMIT && Array.from(head).length > INPUT_LIMIT;
}

// The shortest decimal form that reads back as the same number, with no exponent. Every
// client prints the same query for the same input, whatever its language prints for a number.
function decimal(value: number): string {
  if (value === 0) {
    return '0';
  }
  const printed = String(value);
  const parts = EXPONENT_FORM.exec(printed);
  if (parts === null) {
    return printed;
  }
  const [, sign = '', first = '', rest = '', exponent = '0'] = parts;
  const digits = first + rest;
  const point = 1 + Number(exponent);
  if (point <= 0) {
    return `${sign}0.${'0'.repeat(-point)}${digits}`;
  }
  if (point >= digits.length) {
    return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  }
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

function requireRange(name: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw clientError(
      'invalid_input',
      `${name} must be a number from ${String(min)} to ${String(max)}.`,
    );
  }
  return value;
}

/**
 * One request to the gateway: its path and its query.
 *
 * @internal
 */
export interface GatewayRequest {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
}

/**
 * Builds a lookup request. The code must parse as a whole postcode, so that no request goes
 * out for text that the gateway would only call invalid.
 *
 * @param code - The postcode as text, or as a postcode that `parse` returned.
 * @param level - The lookup level, from 1 to 5. The default is 1.
 * @returns The parsed postcode, the level and the request.
 * @throws PostcodeError `invalid_input` when the code is not a whole postcode, or when the
 *   level is not a whole number from 1 to 5.
 * @internal
 */
export function lookupRequest(
  code: string | Postcode,
  level: number | undefined,
): { readonly postcode: Postcode; readonly level: LookupLevel; readonly request: GatewayRequest } {
  const wanted = level ?? 1;
  if (!Number.isInteger(wanted) || wanted < 1 || wanted > 5) {
    throw clientError('invalid_input', 'The level must be a whole number from 1 to 5.');
  }
  const parsed = parse(typeof code === 'string' ? code : code.canonical);
  if (!parsed.ok) {
    const reason = `The code is not a whole postcode (${parsed.error.code}).`;
    throw clientError('invalid_input', `${reason} Check it with parse from @gatepost/core.`);
  }
  const query = { code: parsed.value.canonical, level: String(wanted) };
  return {
    postcode: parsed.value,
    level: wanted as LookupLevel,
    request: { path: '/v1/lookup', query },
  };
}

/**
 * Builds a reverse geocode request.
 *
 * @param lat - The latitude in degrees, from -90 to 90.
 * @param lng - The longitude in degrees, from -180 to 180.
 * @param maxDistanceM - The radius in metres, from 0 to 250, or undefined for the gateway's
 *   default. The gateway cuts a larger value without a sign, so the client refuses it.
 * @returns The request.
 * @throws PostcodeError `invalid_input` when a number is outside its range or is not finite.
 * @internal
 */
export function reverseRequest(
  lat: number,
  lng: number,
  maxDistanceM: number | undefined,
): GatewayRequest {
  const query: Record<string, string> = {
    lat: decimal(requireRange('The latitude', lat, -90, 90)),
    lng: decimal(requireRange('The longitude', lng, -180, 180)),
  };
  if (maxDistanceM !== undefined) {
    const radius = requireRange('The radius', maxDistanceM, 0, MAX_DISTANCE_M);
    query['max_distance_m'] = decimal(radius);
  }
  return { path: '/v1/search/reverse', query };
}

/**
 * Builds an autocomplete request from the text that a user typed.
 *
 * @param q - The typed text.
 * @returns The normalised text and the request.
 * @throws PostcodeError `invalid_input` when the text is over the input limit, or when the
 *   normalised text is empty, too long, or holds a character other than A to Z and 0 to 9. The
 *   gateway does not answer an empty query.
 * @internal
 */
export function autocompleteRequest(q: string): {
  readonly typed: string;
  readonly request: GatewayRequest;
} {
  const typed = isOverInputLimit(q) ? '' : normalize(q);
  if (!QUERY.test(typed)) {
    const rule = 'The text must hold 1 to 11 letters and digits after normalize.';
    throw clientError('invalid_input', `${rule} Send no call for empty text.`);
  }
  return { typed, request: { path: '/v1/search/autocomplete', query: { q: typed } } };
}

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Each reader narrows the JSON of a response and reads only the fields that it knows (TS-20).
// Unknown fields stay unread. A known field of the wrong type raises unexpected_response, and
// an unknown value of a field that allows one gets its fallback (API-14).
import { parse, type Postcode, type Precision } from '@gatepost/core';
import { PostcodeError } from './error.js';
import type {
  AdministrativeAddress,
  AutocompleteResult,
  Confidence,
  LookupLevel,
  LookupResult,
  ReverseResult,
  ReverseUnit,
} from './types.js';

type Fields = Readonly<Record<string, unknown>>;

const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];
const SEGMENTS: readonly Precision[] = ['state', 'lga', 'district', 'area', 'unit'];

function isFields(json: unknown): json is Fields {
  return typeof json === 'object' && json !== null && !Array.isArray(json);
}

function textOf(fields: Fields, name: string): string | null {
  const field = fields[name];
  return typeof field === 'string' ? field : null;
}

function present(fields: Fields, name: string): boolean {
  return fields[name] !== undefined && fields[name] !== null;
}

function oneOf<T extends string>(allowed: readonly T[], field: unknown): T | null {
  return allowed.find((choice) => choice === field) ?? null;
}

// The readers see only responses with status 200, so the error carries that status.
function unexpected(what: string): never {
  const message = `The gateway sent a reply that this client cannot read: ${what}.`;
  throw new PostcodeError('unexpected_response', message, { status: 200 });
}

/**
 * Reads the API's own error code from the body of a failed response.
 *
 * @param body - The parsed JSON body, or undefined when the body is not JSON.
 * @returns The text in `error.code`, or null.
 * @internal
 */
export function apiCodeOf(body: unknown): string | null {
  const error = isFields(body) ? body['error'] : undefined;
  return isFields(error) ? textOf(error, 'code') : null;
}

/**
 * Reads the `data` field of a successful response.
 *
 * @param body - The parsed JSON body, or undefined when the body is not JSON.
 * @returns The value of `data`.
 * @throws PostcodeError `unexpected_response` when the body is not a JSON object with `data`.
 * @internal
 */
export function dataOf(body: unknown): unknown {
  if (!isFields(body) || body['data'] === undefined) {
    return unexpected('the body is not a JSON object with a data field');
  }
  return body['data'];
}

function levelOf(data: Fields): LookupLevel {
  if (present(data, 'point_geometry')) {
    return 5;
  }
  if (present(data, 'other_building_info')) {
    return 4;
  }
  if (present(data, 'building_use_status')) {
    return 3;
  }
  return present(data, 'administrative_address') || present(data, 'recent_house_address') ? 2 : 1;
}

function addressOf(data: Fields): AdministrativeAddress | null {
  const address = data['administrative_address'];
  if (!isFields(address)) {
    return null;
  }
  return {
    stateName: textOf(address, 'state_name'),
    lgaName: textOf(address, 'lga_name'),
    localityName: textOf(address, 'locality_name'),
    zone: textOf(address, 'zone'),
  };
}

/**
 * Reads the data of a lookup response.
 *
 * @param data - The `data` field of the response.
 * @param request - The parsed postcode and the level that the caller asked for.
 * @returns The lookup result. A `status` of any text stays as it is.
 * @throws PostcodeError `unexpected_response` when `valid` is not a boolean, or when `status`
 *   is present, not null and not text.
 * @internal
 */
export function readLookup(
  data: unknown,
  request: Readonly<{ postcode: Postcode; level: LookupLevel }>,
): LookupResult {
  if (!isFields(data) || typeof data['valid'] !== 'boolean') {
    return unexpected('the lookup has no valid field of type boolean');
  }
  if (present(data, 'status') && typeof data['status'] !== 'string') {
    return unexpected('the lookup has a status that is not text');
  }
  const house = data['recent_house_address'];
  return {
    postcode: request.postcode,
    valid: data['valid'],
    status: textOf(data, 'status'),
    levelRequested: request.level,
    levelReceived: levelOf(data),
    administrativeAddress: addressOf(data),
    recentHouseAddress: isFields(house) ? textOf(house, 'recent') : null,
    buildingUseStatus: textOf(data, 'building_use_status'),
  };
}

function unitOf(unit: unknown): ReverseUnit | null {
  if (unit === undefined || unit === null) {
    return null;
  }
  if (!isFields(unit) || typeof unit['distance_m'] !== 'number') {
    return unexpected('the unit of a reverse result has no distance_m of type number');
  }
  const parsed = parse(textOf(unit, 'postcode') ?? '');
  if (!parsed.ok) {
    return unexpected('the unit of a reverse result has a postcode that does not parse');
  }
  return {
    postcode: parsed.value,
    distanceM: unit['distance_m'],
    confidence: oneOf(CONFIDENCES, unit['confidence']) ?? 'low',
    stateName: textOf(unit, 'state_name'),
    lgaName: textOf(unit, 'lga_name'),
    localityName: textOf(unit, 'locality_name'),
    address: textOf(unit, 'address'),
  };
}

/**
 * Reads the data of a reverse geocode response.
 *
 * @param data - The `data` field of the response.
 * @returns The reverse result.
 * @throws PostcodeError `unexpected_response` when `found` is not a boolean, or when a unit is
 *   present and its postcode does not parse or it has no distance.
 * @internal
 */
export function readReverse(data: unknown): ReverseResult {
  if (!isFields(data) || typeof data['found'] !== 'boolean') {
    return unexpected('the reverse result has no found field of type boolean');
  }
  const radius = data['radius_m'];
  return {
    found: data['found'],
    radiusM: typeof radius === 'number' ? radius : null,
    unit: unitOf(data['unit']),
    area: textOf(data, 'area'),
    district: textOf(data, 'district'),
    state: textOf(data, 'state'),
  };
}

// The gateway sends the value of the active segment only. The typed segments before it, plus
// that value, make a partial postcode of the active segment's precision. Only one cut of the
// typed text gives that precision, so the loop needs no table of segment lengths.
function suggestedPostcode(typed: string, code: string, segment: Precision): Postcode | null {
  for (let end = typed.length - 1; end >= 0; end -= 1) {
    const parsed = parse(typed.slice(0, end) + code, { allowPartial: true });
    if (parsed.ok && parsed.value.precision === segment) {
      return parsed.value;
    }
  }
  return null;
}

/**
 * Reads the data of an autocomplete response.
 *
 * @param data - The `data` field of the response.
 * @param typed - The normalised text that the request sent.
 * @returns The autocomplete result. An item with no text in `code` is left out.
 * @throws PostcodeError `unexpected_response` when `segment` is not a segment name, or
 *   `suggestions` is not a list.
 * @internal
 */
export function readAutocomplete(data: unknown, typed: string): AutocompleteResult {
  const segment = isFields(data) ? oneOf(SEGMENTS, data['segment']) : null;
  const items = isFields(data) ? data['suggestions'] : undefined;
  if (segment === null || !Array.isArray(items)) {
    return unexpected('the autocomplete has no known segment or no suggestions list');
  }
  const suggestions = items.filter(isFields).flatMap((item) => {
    const code = textOf(item, 'code');
    if (code === null) {
      return [];
    }
    const postcode = suggestedPostcode(typed, code, segment);
    return [{ code, label: textOf(item, 'label'), postcode }];
  });
  return { segment, suggestions };
}

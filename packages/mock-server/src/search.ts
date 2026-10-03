// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { knownUnit } from './lookup.ts';
import { activeSegment, compactCode } from './postcodes.ts';
import { jsonReply, type MockRequest, type Reply } from './reply.ts';
import { fixtureData, fixtureReply, type SpecFiles } from './spec-files.ts';

/** NIPOST's docs give the default radius of reverse, and the ceiling that the gateway applies. */
export const REVERSE_RADIUS_M = { default: 25, maximum: 250 } as const;
const PLACES = ['reverse/unit', 'reverse/area'] as const;
const CODE_CHARACTERS = /^[A-Z0-9]+$/;

function numberIn(query: URLSearchParams, name: string): number | null {
  const raw = query.get(name)?.trim() ?? '';
  const parsed = Number(raw);
  return raw === '' || !Number.isFinite(parsed) ? null : parsed;
}

function radiusIn(query: URLSearchParams, name: string, fallback: number): number | null {
  if (query.get(name) === null) {
    return fallback;
  }
  const radius = numberIn(query, name);
  return radius === null || radius < 0 ? null : radius;
}

function samePlace(files: SpecFiles, name: string, lng: number, lat: number): boolean {
  const coordinate = fixtureData(files, name, 'coordinate');
  return Array.isArray(coordinate) && coordinate[0] === lng && coordinate[1] === lat;
}

/**
 * Answers `GET /v1/search/reverse`. A point that a fixture names gets that fixture. Any other
 * point gets the fixture for no postcode in range. The body echoes the coordinate as
 * [lng, lat] and gives the radius that the mock server applied.
 *
 * @param request - The request.
 * @param files - The spec files.
 * @returns The reply.
 * @internal
 */
export function reverse(request: MockRequest, files: SpecFiles): Reply {
  const lat = numberIn(request.query, 'lat');
  const lng = numberIn(request.query, 'lng');
  const radius = radiusIn(request.query, 'max_distance_m', REVERSE_RADIUS_M.default);
  if (lat === null || lng === null || radius === null) {
    return fixtureReply(files, 'errors/invalid-request');
  }
  const name = PLACES.find((place) => samePlace(files, place, lng, lat)) ?? 'reverse/not-found';
  const radiusM = Math.min(radius, REVERSE_RADIUS_M.maximum);
  return fixtureReply(files, name, { coordinate: [lng, lat], radius_m: radiusM });
}

/**
 * Answers `GET /v1/search/nearby` with the one body that the gateway has shown: an empty list.
 *
 * @param request - The request.
 * @param files - The spec files.
 * @returns The reply.
 * @internal
 */
export function nearby(request: MockRequest, files: SpecFiles): Reply {
  const lat = numberIn(request.query, 'lat');
  const lng = numberIn(request.query, 'lng');
  if (lat === null || lng === null || radiusIn(request.query, 'radius', 0) === null) {
    return fixtureReply(files, 'errors/invalid-request');
  }
  return fixtureReply(files, 'nearby/empty');
}

/**
 * Answers `GET /v1/search/autocomplete`. The state segment completes from the state list.
 * The other segments complete from the one unit that the mock server knows. An empty `q` gets
 * no answer, as the gateway gave none.
 *
 * @param request - The request.
 * @param files - The spec files.
 * @returns The reply.
 * @internal
 */
export function autocomplete(request: MockRequest, files: SpecFiles): Reply {
  const typed = compactCode(request.query.get('q') ?? '');
  if (typed === '') {
    return { kind: 'hang' };
  }
  const segment = activeSegment(typed.length, files.segments);
  if (segment === undefined || !CODE_CHARACTERS.test(typed)) {
    return fixtureReply(files, 'errors/invalid-request');
  }
  const before = typed.slice(0, segment.start);
  const unit = knownUnit(files);
  const values =
    segment.start === 0
      ? files.states
      : [unit]
          .filter((code) => code.startsWith(before))
          .map((code) => code.slice(segment.start, segment.end));
  const started = typed.slice(segment.start);
  const codes = [...new Set(values)].filter((value) => value.startsWith(started)).sort();
  const suggestions = codes.map((code) => ({ code }));
  return jsonReply(200, { data: { segment: segment.name, suggestions } });
}

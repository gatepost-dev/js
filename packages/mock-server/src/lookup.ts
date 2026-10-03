// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { compactCode, decimalNumber, isWellFormed } from './postcodes.ts';
import type { MockRequest, Reply } from './reply.ts';
import { fixtureData, fixtureReply, type MockKey, type SpecFiles } from './spec-files.ts';

/**
 * Gives the compact form of the one unit that the mock server knows: the postcode in the
 * fixture `lookup/valid-level-1`.
 *
 * @param files - The spec files.
 * @returns The compact postcode.
 * @internal
 */
export function knownUnit(files: SpecFiles): string {
  const postcode = fixtureData(files, 'lookup/valid-level-1', 'postcode');
  if (typeof postcode !== 'string') {
    throw new TypeError('fixtures/lookup/valid-level-1.json needs a postcode.');
  }
  return compactCode(postcode);
}

// The checks run in the order that the gateway showed: a level above the key's level gets 403
// before a missing credit could give 402.
function refusal(key: MockKey, level: number): string | null {
  if (!key.lookupScope) {
    return 'errors/scope-not-granted';
  }
  if (level > key.lookupLevel) {
    return `errors/level-not-granted-${String(key.lookupLevel)}`;
  }
  return level > 1 && !key.credits ? 'errors/insufficient-credits' : null;
}

// A level is a whole number from 1 to 5, read by value, so 2 and 2.0 are the same level.
function levelIn(query: URLSearchParams): number | null {
  const level = decimalNumber(query.get('level') ?? '1');
  return level !== null && Number.isInteger(level) && level >= 1 && level <= 5 ? level : null;
}

/**
 * Answers `GET /v1/lookup`. The body echoes the caller's text in upper case, as the gateway does.
 *
 * @param request - The request.
 * @param files - The spec files.
 * @param key - The caller's key.
 * @returns The reply.
 * @internal
 */
export function lookup(request: MockRequest, files: SpecFiles, key: MockKey): Reply {
  const code = request.query.get('code') ?? '';
  const level = levelIn(request.query);
  if (compactCode(code) === '' || level === null) {
    return fixtureReply(files, 'errors/invalid-request');
  }
  const refused = refusal(key, level);
  if (refused !== null) {
    return fixtureReply(files, refused);
  }
  const compact = compactCode(code);
  let name = isWellFormed(compact, files) ? 'lookup/not-found' : 'lookup/invalid';
  if (compact === knownUnit(files)) {
    name = `lookup/valid-level-${String(level)}`;
  }
  return fixtureReply(files, name, { postcode: code.toUpperCase() });
}

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { compactCode, isWellFormed } from './postcodes.ts';
import { jsonReply, type MockRequest, type Reply } from './reply.ts';
import { fixtureReply, type SpecFiles } from './spec-files.ts';

function parts(compact: string, files: SpecFiles): string[] {
  return files.segments.map((rule) => compact.slice(rule.start, rule.end));
}

function segmentTexts(body: string, files: SpecFiles): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // A body that is not JSON is a bad request, as a missing field is.
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const record = parsed as Readonly<Record<string, unknown>>;
  const texts = files.segments.map((rule) => {
    const text = record[rule.name];
    return typeof text === 'string' ? text.toUpperCase().padStart(rule.end - rule.start, '0') : '';
  });
  return texts.includes('') ? null : texts;
}

/**
 * Answers `POST /v1/assembly/assemble`. It changes letters to upper case, and pads each segment
 * to its length with zeros, as the gateway does with `"lga": "1"`.
 *
 * @param request - The request.
 * @param files - The spec files.
 * @returns The reply.
 * @internal
 */
export function assemble(request: MockRequest, files: SpecFiles): Reply {
  const texts = segmentTexts(request.body, files);
  if (texts === null || !isWellFormed(texts.join(''), files)) {
    return fixtureReply(files, 'errors/invalid-request');
  }
  return jsonReply(200, {
    data: { compact: texts.join(''), display: texts.join(' '), postcode: texts.join('-') },
  });
}

/**
 * Answers `GET /v1/assembly/disassemble`.
 *
 * @param request - The request.
 * @param files - The spec files.
 * @returns The reply.
 * @internal
 */
export function disassemble(request: MockRequest, files: SpecFiles): Reply {
  const compact = compactCode(request.query.get('code') ?? '');
  if (!isWellFormed(compact, files)) {
    return fixtureReply(files, 'errors/invalid-request');
  }
  const texts = parts(compact, files);
  const data = Object.fromEntries(files.segments.map((rule, index) => [rule.name, texts[index]]));
  return jsonReply(200, { data });
}

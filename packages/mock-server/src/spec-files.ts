// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsonReply, type Reply } from './reply.ts';

/** One gateway response from `spec/fixtures`. */
export interface Fixture {
  readonly status: number;
  readonly body: unknown;
}

/** One key from `spec/fixtures/keys.json`, and the way that the mock server treats it. */
export interface MockKey {
  readonly key: string;
  readonly lookupLevel: number;
  readonly lookupScope: boolean;
  readonly credits: boolean;
  readonly rateLimited: boolean;
  readonly origins: readonly string[] | null;
}

/** One segment of a postcode, with its place in the compact form. */
export interface SegmentRule {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly characters: string;
  readonly minimum: number | null;
}

/** Everything that the mock server reads from the spec folder. */
export interface SpecFiles {
  readonly fixtures: ReadonlyMap<string, Fixture>;
  readonly keys: ReadonlyMap<string, MockKey>;
  readonly requestsPerMinute: number;
  readonly scenarios: ReadonlyMap<string, readonly Reply[]>;
  readonly states: readonly string[];
  readonly segments: readonly SegmentRule[];
}

// A response has exactly one of these fields.
const RESPONSE_KINDS = ['body', 'text', 'fixture', 'hang', 'drop'] as const;

type JsonObject = Readonly<Record<string, unknown>>;

// `where` is the file's path under the spec folder, such as `contract/probe.json`.
function readJson(folder: string, name: string, where: string): unknown {
  try {
    return JSON.parse(readFileSync(join(folder, name), 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SyntaxError(`${where}: ${error.message}`, { cause: error });
    }
    throw error;
  }
}

function sortedNames(folder: string): string[] {
  return readdirSync(folder).sort();
}

function objectIn(value: unknown, where: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${where} must be a JSON object.`);
  }
  return value as JsonObject;
}

function listIn(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${where} must be a JSON array.`);
  }
  return value;
}

function field<T>(
  record: JsonObject,
  name: string,
  where: string,
  check: (value: unknown) => value is T,
): T {
  const value = record[name];
  if (!check(value)) {
    throw new TypeError(`${where}: the field ${name} has the wrong type.`);
  }
  return value;
}

const isNumber = (value: unknown): value is number => typeof value === 'number';
const isIntegerFrom =
  (low: number, high: number) =>
  (value: unknown): value is number =>
    Number.isInteger(value) && (value as number) >= low && (value as number) <= high;
const isStatus = isIntegerFrom(100, 599);
const isDelay = isIntegerFrom(0, Number.MAX_SAFE_INTEGER);
const isCount = isIntegerFrom(1, Number.MAX_SAFE_INTEGER);
const isLevel = isIntegerFrom(1, 5);
const isText = (value: unknown): value is string => typeof value === 'string';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isTextList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isText);
const isTextListOrNull = (value: unknown): value is string[] | null =>
  value === null || isTextList(value);

function textRecord(value: unknown, where: string): Readonly<Record<string, string>> {
  const record = objectIn(value, where);
  for (const name of Object.keys(record)) {
    field(record, name, where, isText);
  }
  return record as Readonly<Record<string, string>>;
}

function readFixtures(folder: string): Map<string, Fixture> {
  const fixtures = new Map<string, Fixture>();
  const groups = readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const group of groups) {
    for (const file of sortedNames(join(folder, group)).filter((n) => n.endsWith('.json'))) {
      const name = `${group}/${file.slice(0, -'.json'.length)}`;
      const where = `fixtures/${name}.json`;
      const record = objectIn(readJson(folder, `${name}.json`, where), where);
      const status = field(record, 'status', where, isStatus);
      if (!('body' in record)) {
        throw new TypeError(`${where}: the field body is missing.`);
      }
      fixtures.set(name, { status, body: record['body'] });
    }
  }
  return fixtures;
}

function readKeys(folder: string): { keys: Map<string, MockKey>; requestsPerMinute: number } {
  const where = 'fixtures/keys.json';
  const document = objectIn(readJson(folder, 'keys.json', where), where);
  const keys = new Map<string, MockKey>();
  const entries: string[] = [];
  for (const [index, entry] of listIn(document['keys'], where).entries()) {
    const here = `${where} (entry ${String(index + 1)})`;
    const record = objectIn(entry, here);
    const key = field(record, 'key', here, isText);
    const first = entries.indexOf(key);
    if (first !== -1) {
      const entry = `entry ${String(first + 1)} and in entry ${String(index + 1)}`;
      throw new TypeError(`${where}: the key ${key} is in ${entry}.`);
    }
    entries.push(key);
    keys.set(key, {
      key,
      lookupLevel: field(record, 'lookupLevel', here, isLevel),
      lookupScope: field(record, 'lookupScope', here, isBoolean),
      credits: field(record, 'credits', here, isBoolean),
      rateLimited: field(record, 'rateLimited', here, isBoolean),
      origins: field(record, 'origins', here, isTextListOrNull),
    });
  }
  return { keys, requestsPerMinute: field(document, 'requestsPerMinute', where, isCount) };
}

function scenarioReply(
  value: unknown,
  fixtures: ReadonlyMap<string, Fixture>,
  where: string,
): Reply {
  const response = objectIn(value, where);
  const kinds = RESPONSE_KINDS.filter((kind) => response[kind] !== undefined);
  if (kinds.length !== 1) {
    const problem =
      kinds.length === 0
        ? 'has no body, text, fixture, hang or drop'
        : `has more than one of ${kinds.join(', ')}`;
    throw new TypeError(`${where}: the response ${problem}.`);
  }
  const delayMs =
    response['delayMs'] === undefined ? 0 : field(response, 'delayMs', where, isDelay);
  if (response['hang'] === true) {
    return { kind: 'hang' };
  }
  if (response['drop'] === true) {
    return { kind: 'drop', delayMs };
  }
  const headers = textRecord(response['headers'] ?? {}, where);
  if (typeof response['fixture'] === 'string') {
    const fixture = fixtures.get(response['fixture']);
    if (fixture === undefined) {
      throw new TypeError(`${where}: no fixture is named ${response['fixture']}.`);
    }
    return { ...jsonReply(fixture.status, fixture.body, headers), delayMs };
  }
  const status = field(response, 'status', where, isStatus);
  if (typeof response['text'] === 'string') {
    const textHeaders = { 'Content-Type': 'text/plain; charset=utf-8', ...headers };
    return { kind: 'send', status, headers: textHeaders, body: response['text'], delayMs };
  }
  return { ...jsonReply(status, response['body'], headers), delayMs };
}

function readScenarios(
  folder: string,
  fixtures: ReadonlyMap<string, Fixture>,
): Map<string, readonly Reply[]> {
  const scenarios = new Map<string, readonly Reply[]>();
  const files = new Map<string, string>();
  for (const file of sortedNames(folder).filter((name) => name.endsWith('.json'))) {
    const where = `contract/${file}`;
    const scenario = objectIn(readJson(folder, file, where), where);
    const id = field(scenario, 'id', where, isText);
    const earlier = files.get(id);
    if (earlier !== undefined) {
      throw new TypeError(`${where}: the id ${id} is already used by ${earlier}.`);
    }
    const stem = file.slice(0, -'.json'.length);
    if (id !== stem) {
      throw new TypeError(`${where}: the id ${id} must equal the file name ${stem}.`);
    }
    files.set(id, where);
    const responses = listIn(scenario['responses'], where);
    scenarios.set(
      id,
      responses.map((response, index) =>
        scenarioReply(response, fixtures, `${where} (response ${String(index + 1)})`),
      ),
    );
  }
  return scenarios;
}

function readSegments(folder: string): SegmentRule[] {
  const where = 'data/format.json';
  const document = objectIn(readJson(folder, 'format.json', where), where);
  let start = 0;
  return listIn(document['segments'], where).map((entry) => {
    const record = objectIn(entry, where);
    const length = field(record, 'length', where, isNumber);
    const minimum =
      record['minimum'] === undefined ? null : field(record, 'minimum', where, isNumber);
    const rule = {
      name: field(record, 'name', where, isText),
      start,
      end: start + length,
      characters: field(record, 'characters', where, isText),
      minimum,
    };
    start += length;
    return rule;
  });
}

function readStates(folder: string): string[] {
  const where = 'data/states.json';
  const document = objectIn(readJson(folder, 'states.json', where), where);
  return listIn(document['states'], where).map((entry) =>
    field(objectIn(entry, where), 'code', where, isText),
  );
}

/**
 * Reads the fixtures, the keys, the scenarios and the postcode data from a spec folder. A file
 * with the wrong shape stops the mock server, with a message that names the file.
 *
 * @param specDir - The spec folder, such as the `spec` submodule.
 * @returns The files, ready for the mock server.
 * @throws TypeError when a file has the wrong shape, and SyntaxError when it is not JSON.
 * @internal
 */
export function readSpecFiles(specDir: string): SpecFiles {
  const fixtures = readFixtures(join(specDir, 'fixtures'));
  const { keys, requestsPerMinute } = readKeys(join(specDir, 'fixtures'));
  return {
    fixtures,
    keys,
    requestsPerMinute,
    scenarios: readScenarios(join(specDir, 'contract'), fixtures),
    states: readStates(join(specDir, 'data')),
    segments: readSegments(join(specDir, 'data')),
  };
}

/**
 * Builds the reply of a fixture. Each change replaces one field of the body's `data` object.
 *
 * @param files - The spec files.
 * @param name - The fixture's path under `spec/fixtures`, without `.json`.
 * @param changes - The fields of `data` to replace, such as the echoed postcode.
 * @returns The reply.
 * @throws Error when the spec has no such fixture, or when changes meet a body with no `data`.
 * @internal
 */
export function fixtureReply(
  files: SpecFiles,
  name: string,
  changes: Readonly<Record<string, unknown>> = {},
): Reply {
  const fixture = files.fixtures.get(name);
  if (fixture === undefined) {
    throw new Error(`The spec has no fixture ${name}.`);
  }
  if (Object.keys(changes).length === 0) {
    return jsonReply(fixture.status, fixture.body);
  }
  const body = objectIn(fixture.body, `fixtures/${name}.json`);
  const data = objectIn(body['data'], `fixtures/${name}.json`);
  return jsonReply(fixture.status, { ...body, data: { ...data, ...changes } });
}

/**
 * Reads one field of the `data` object of a fixture's body.
 *
 * @param files - The spec files.
 * @param name - The fixture's path under `spec/fixtures`, without `.json`.
 * @param fieldName - The field of `data`.
 * @returns The value of the field.
 * @throws Error when the spec has no such fixture, and TypeError when the body has no `data`.
 * @internal
 */
export function fixtureData(files: SpecFiles, name: string, fieldName: string): unknown {
  const fixture = files.fixtures.get(name);
  if (fixture === undefined) {
    throw new Error(`The spec has no fixture ${name}.`);
  }
  const body = objectIn(fixture.body, `fixtures/${name}.json`);
  return objectIn(body['data'], `fixtures/${name}.json`)[fieldName];
}

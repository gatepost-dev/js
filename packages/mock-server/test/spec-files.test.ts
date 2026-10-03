// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureReply, readSpecFiles } from '../src/spec-files.ts';
import { FILES, SPEC_DIR, sent } from './mock-request.ts';

const folders: string[] = [];

// A copy of the spec folder in which one file has new text.
function specWith(file: string, text: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'gatepost-spec-'));
  folders.push(folder);
  for (const part of ['data', 'fixtures', 'contract']) {
    cpSync(join(SPEC_DIR, part), join(folder, part), { recursive: true });
  }
  writeFileSync(join(folder, file), text);
  return folder;
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true });
  }
});

describe('readSpecFiles', () => {
  it('reads each key of keys.json with its behaviour', () => {
    const keys = JSON.parse(readFileSync(join(SPEC_DIR, 'fixtures/keys.json'), 'utf8')) as {
      keys: { key: string }[];
    };
    expect([...FILES.keys.keys()]).toEqual(keys.keys.map((entry) => entry.key));
    expect(FILES.keys.get('nipost_pk_test_mock')).toEqual({
      key: 'nipost_pk_test_mock',
      lookupLevel: 3,
      lookupScope: true,
      credits: true,
      rateLimited: false,
      origins: ['http://localhost:3000'],
    });
    expect(FILES.requestsPerMinute).toBe(600);
  });

  it('places each segment in the compact form', () => {
    const places = FILES.segments.map((rule) => [rule.name, rule.start, rule.end, rule.minimum]);
    expect(places).toEqual([
      ['state', 0, 2, null],
      ['lga', 2, 4, 1],
      ['district', 4, 7, null],
      ['area', 7, 9, null],
      ['unit', 9, 11, 1],
    ]);
  });

  it('reads the 37 state codes', () => {
    expect(FILES.states).toHaveLength(37);
    expect(FILES.states).toContain('FC');
  });

  it('reads every scenario in the contract folder, and does not use a fixed list', () => {
    const ids = readdirSync(join(SPEC_DIR, 'contract'))
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length));
    expect([...FILES.scenarios.keys()].sort()).toEqual(ids.sort());
    expect(ids.length).toBeGreaterThanOrEqual(69);
  });

  it('turns each response of a scenario into a reply', () => {
    expect(FILES.scenarios.get('lookup-timeout')).toEqual([{ kind: 'hang' }]);
    expect(FILES.scenarios.get('lookup-network-error')).toEqual([{ kind: 'drop', delayMs: 0 }]);
    const [first] = FILES.scenarios.get('lookup-shared-request') ?? [];
    expect(first).toMatchObject({ kind: 'send', status: 200, delayMs: 100 });
    const [page] = FILES.scenarios.get('lookup-malformed-body') ?? [];
    expect(page).toMatchObject({
      kind: 'send',
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  });

  it('adds the headers of a scenario response to a fixture', () => {
    const [limited] = FILES.scenarios.get('lookup-retry-after') ?? [];
    expect(limited).toMatchObject({
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '1' },
    });
  });

  it('stops at a fixture with no status, and names the file', () => {
    const folder = specWith('fixtures/lookup/invalid.json', '{"body": {}}');
    expect(() => readSpecFiles(folder)).toThrow(
      'fixtures/lookup/invalid.json: the field status has the wrong type.',
    );
  });

  it('stops at a scenario that names a fixture that does not exist', () => {
    const scenario = { id: 'probe', responses: [{ fixture: 'lookup/valid-level-9' }] };
    const folder = specWith('contract/probe.json', JSON.stringify(scenario));
    expect(() => readSpecFiles(folder)).toThrow(
      'contract/probe.json (response 1): no fixture is named lookup/valid-level-9.',
    );
  });

  it.each([
    ['contract/probe.json'],
    ['fixtures/lookup/probe.json'],
    ['data/states.json'],
    ['fixtures/keys.json'],
  ])('stops at %s when it is not JSON, and names the file', (file) => {
    const run = (): unknown => readSpecFiles(specWith(file, '{'));
    expect(run).toThrow(SyntaxError);
    expect(run).toThrow(new RegExp(`^${file}: .*JSON`));
  });

  it.each([
    ['no kind field', { status: 200 }, 'the response has no body, text, fixture, hang or drop.'],
    [
      'two kind fields',
      { hang: true, drop: true },
      'the response has more than one of hang, drop.',
    ],
    [
      'a fixture and a body',
      { fixture: 'lookup/invalid', body: {} },
      'the response has more than one of body, fixture.',
    ],
  ])('stops at a response with %s, and names the file and the response', (_name, bad, why) => {
    const scenario = { id: 'probe', responses: [{ fixture: 'lookup/invalid' }, bad] };
    const folder = specWith('contract/probe.json', JSON.stringify(scenario));
    expect(() => readSpecFiles(folder)).toThrow(`contract/probe.json (response 2): ${why}`);
  });

  it('stops at a fixture with no body, and names the file', () => {
    const folder = specWith('fixtures/lookup/probe.json', '{"status": 200}');
    expect(() => readSpecFiles(folder)).toThrow(
      'fixtures/lookup/probe.json: the field body is missing.',
    );
  });

  it('stops at a scenario id that another file already uses, and names both files', () => {
    const scenario = { id: 'lookup-timeout', responses: [] };
    const folder = specWith('contract/probe.json', JSON.stringify(scenario));
    expect(() => readSpecFiles(folder)).toThrow(
      'contract/probe.json: the id lookup-timeout is already used by contract/lookup-timeout.json.',
    );
  });

  it('stops at a scenario whose id is not its file name', () => {
    const folder = specWith('contract/probe.json', '{"id": "other", "responses": []}');
    expect(() => readSpecFiles(folder)).toThrow(
      'contract/probe.json: the id other must equal the file name probe.',
    );
  });

  it('stops at a key that appears twice, and says which entries', () => {
    const keys = JSON.parse(readFileSync(join(SPEC_DIR, 'fixtures/keys.json'), 'utf8')) as {
      keys: { key: string }[];
    };
    keys.keys.push({ ...keys.keys[0]! });
    const folder = specWith('fixtures/keys.json', JSON.stringify(keys));
    expect(() => readSpecFiles(folder)).toThrow(
      `fixtures/keys.json: the key ${keys.keys[0]!.key} is in entry 1 and in entry 8.`,
    );
  });

  it('says which key entry has a wrong field', () => {
    const keys = JSON.parse(readFileSync(join(SPEC_DIR, 'fixtures/keys.json'), 'utf8')) as {
      keys: Record<string, unknown>[];
    };
    keys.keys[2]!['lookupLevel'] = 'three';
    const folder = specWith('fixtures/keys.json', JSON.stringify(keys));
    expect(() => readSpecFiles(folder)).toThrow(
      'fixtures/keys.json (entry 3): the field lookupLevel has the wrong type.',
    );
  });

  it.each([
    ['a status of 99999', { status: 99999, body: {} }, 'status'],
    ['a status of 200.5', { status: 200.5, body: {} }, 'status'],
    ['a negative delay', { status: 200, body: {}, delayMs: -5 }, 'delayMs'],
  ])('stops at a response with %s', (_name, response, name) => {
    const folder = specWith(
      'contract/probe.json',
      JSON.stringify({ id: 'probe', responses: [response] }),
    );
    expect(() => readSpecFiles(folder)).toThrow(
      `contract/probe.json (response 1): the field ${name} has the wrong type.`,
    );
  });

  it.each([
    ['requestsPerMinute', -3],
    ['requestsPerMinute', 1.5],
  ])('stops at %s of %s in the key file', (name, value) => {
    const keys = JSON.parse(readFileSync(join(SPEC_DIR, 'fixtures/keys.json'), 'utf8')) as object;
    const folder = specWith('fixtures/keys.json', JSON.stringify({ ...keys, [name]: value }));
    expect(() => readSpecFiles(folder)).toThrow(
      `fixtures/keys.json: the field ${name} has the wrong type.`,
    );
  });

  it('stops at a key with a level above 5', () => {
    const keys = JSON.parse(readFileSync(join(SPEC_DIR, 'fixtures/keys.json'), 'utf8')) as {
      keys: Record<string, unknown>[];
    };
    keys.keys[0]!['lookupLevel'] = 9;
    const folder = specWith('fixtures/keys.json', JSON.stringify(keys));
    expect(() => readSpecFiles(folder)).toThrow('(entry 1): the field lookupLevel');
  });

  it('stops at a scenario file that is not an object, and at responses that are not a list', () => {
    expect(() => readSpecFiles(specWith('contract/probe.json', '[]'))).toThrow(
      'contract/probe.json must be a JSON object.',
    );
    const bad = '{"id": "probe", "responses": {}}';
    expect(() => readSpecFiles(specWith('contract/probe.json', bad))).toThrow(
      'contract/probe.json must be a JSON array.',
    );
  });

  it('stops at a header whose value is not text', () => {
    const response = { status: 200, body: {}, headers: { 'Retry-After': 1 } };
    const folder = specWith(
      'contract/probe.json',
      JSON.stringify({ id: 'probe', responses: [response] }),
    );
    expect(() => readSpecFiles(folder)).toThrow('(response 1): the field Retry-After');
  });

  it('lists scenarios and fixtures in the sorted order of their file names', () => {
    const byFile = (a: string, b: string): number => (`${a}.json` < `${b}.json` ? -1 : 1);
    const ids = [...FILES.scenarios.keys()];
    expect(ids).toEqual([...ids].sort(byFile));
    const names = [...FILES.fixtures.keys()];
    expect(names).toEqual([...names].sort(byFile));
  });
});

describe('fixtureReply', () => {
  it('replaces fields of data and keeps the rest of the body', () => {
    const reply = fixtureReply(FILES, 'lookup/not-found', { postcode: 'FC01Z99ZZ09' });
    expect(sent(reply)).toEqual({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        data: { postcode: 'FC01Z99ZZ09', valid: false, status: 'not_found', verified: false },
      },
    });
  });

  it('fails for a fixture that the spec does not have', () => {
    expect(() => fixtureReply(FILES, 'lookup/valid-level-9')).toThrow(
      'The spec has no fixture lookup/valid-level-9.',
    );
  });

  it('fails when a change meets a body with no data', () => {
    expect(() => fixtureReply(FILES, 'errors/rate-limited', { postcode: 'X' })).toThrow(
      'fixtures/errors/rate-limited.json must be a JSON object.',
    );
  });
});

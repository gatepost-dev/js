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
      'contract/probe.json: no fixture is named lookup/valid-level-9.',
    );
  });

  it('stops at a key file that is not JSON', () => {
    expect(() => readSpecFiles(specWith('fixtures/keys.json', '{'))).toThrow(SyntaxError);
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
});

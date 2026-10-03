// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { SPEC_DIR } from './mock-request.ts';

const PACKAGE = fileURLToPath(new URL('../', import.meta.url));
const README = readFileSync(join(PACKAGE, 'README.md'), 'utf8');
const TEMP = join(PACKAGE, 'temp');

afterAll(() => {
  rmSync(TEMP, { recursive: true, force: true });
});

describe('README', () => {
  // DOC-3: the Quickstart runs, and gives the body that the next sentence names.
  it('runs the Quickstart, which gets the lookup body that it names', async () => {
    const [, block = ''] = /```ts\n([\s\S]*?)```/.exec(README) ?? [];
    const source = block.replace("'@gatepost/mock-server'", "'../src/index.ts'");
    mkdirSync(TEMP, { recursive: true });
    writeFileSync(join(TEMP, 'quickstart.ts'), `${source}\nexport { body };\n`);
    const { body } = (await import(join(TEMP, 'quickstart.ts'))) as { body: unknown };
    expect(body).toEqual({
      data: { postcode: 'FC-01-Z99-ZZ-01', valid: true, status: 'valid', verified: false },
    });
    expect(README).toContain("postcode: 'FC-01-Z99-ZZ-01', valid: true, status: 'valid'");
  });

  it('names the version of the spec in the submodule', () => {
    const version = readFileSync(join(SPEC_DIR, 'VERSION'), 'utf8').trim();
    const pattern = `Gatepost spec\\s*\\|\\s*${version.replaceAll('.', '\\.')}\\s*\\|`;
    expect(README).toMatch(new RegExp(pattern));
  });

  it('uses a key that keys.json holds, and names the six paths of the gateway', () => {
    const keys = JSON.parse(readFileSync(join(SPEC_DIR, 'fixtures', 'keys.json'), 'utf8')) as {
      keys: { key: string }[];
    };
    expect(keys.keys.map((entry) => entry.key)).toContain('nipost_test_mock_l1');
    expect(README).toContain('nipost_test_mock_l1');
    expect(README).toContain('/healthz');
  });
});

describe('image recipe', () => {
  const ROOT = join(PACKAGE, '..', '..');
  const dockerfile = readFileSync(join(PACKAGE, 'Dockerfile'), 'utf8');

  it('copies every spec folder that the server reads, and nothing else of the spec', () => {
    const folders = [...dockerfile.matchAll(/^COPY (spec\/\w+) /gm)].map((match) => match[1] ?? '');
    expect(folders).toEqual(['spec/data', 'spec/fixtures', 'spec/contract']);
    const ignore = readFileSync(join(ROOT, '.dockerignore'), 'utf8');
    for (const folder of folders) {
      expect(ignore).toContain(`!${folder}\n`);
    }
  });

  it('listens on the port that the command and the README name, on every address', () => {
    expect(dockerfile).toContain('HOST=0.0.0.0 PORT=4010');
    expect(dockerfile).toContain('EXPOSE 4010');
    expect(README).toContain('4010');
  });

  it('runs as the node user with no root rights', () => {
    expect(dockerfile).toMatch(/^USER node$/m);
  });
});

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as core from '../src/index.js';
import { MAX_INPUT_CODE_POINTS } from '../src/spec-data.js';

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

// Text between code fences sits at the odd positions of a split on the fence. An example is a
// block that starts with the language name ts.
const EXAMPLES = README.split('```')
  .filter((_, position) => position % 2 === 1)
  .filter((block) => block.startsWith('ts\n'))
  .map((block) => block.slice('ts\n'.length));

// A line such as `canonical; // 'EK-01-A03-FK-01'` states a result. The test turns it into a call
// of `strictEqual`, so the README cannot show a result that the code does not give. A guard such
// as `if (result.ok)` can skip such a call. So the module counts the calls that run, and the test
// compares that count with the number of result lines.
const SHOWN_RESULT = /^(\s*)(.+);\s*\/\/ ('[^']*'|-?\d+(?:\.\d+)?|true|false|null)$/gm;

const COUNTING_PREAMBLE = [
  "import { strictEqual as assertEqual } from 'node:assert/strict';",
  'export let checkedResults = 0;',
  'function strictEqual(actual: unknown, expected: unknown): void {',
  '  assertEqual(actual, expected);',
  '  checkedResults += 1;',
  '}',
].join('\n');

function toModule(example: string): string {
  const source = example
    .replaceAll("'@gatepost/core'", "'../../src/index.js'")
    .replace(SHOWN_RESULT, '$1strictEqual($2, $3);');
  return `${COUNTING_PREAMBLE}\n${source}`;
}

describe('README', () => {
  let folder: string;

  beforeAll(() => {
    // Each run gets its own folder, so that parallel runs do not share files. The temp folder is
    // outside the view of git, Prettier, ESLint and tsc.
    const temp = fileURLToPath(new URL('../temp/', import.meta.url));
    mkdirSync(temp, { recursive: true });
    folder = mkdtempSync(join(temp, 'readme-'));
  });

  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it.each(EXAMPLES.map((source, index) => ({ index, source })))(
    'runs example $index and finds each result that it shows',
    async ({ index, source }) => {
      const file = join(folder, `example-${String(index)}.ts`);
      writeFileSync(file, toModule(source));
      const { checkedResults } = (await import(pathToFileURL(file).href)) as {
        checkedResults: number;
      };
      const shownResults = Array.from(source.matchAll(SHOWN_RESULT)).length;
      const compared = `${String(checkedResults)} of ${String(shownResults)} results`;
      expect(checkedResults, `Example ${String(index)} compared ${compared}.`).toBe(shownResults);
    },
  );

  it.each(Object.keys(core))('shows %s in an example', (name) => {
    expect(EXAMPLES.join('\n')).toMatch(new RegExp(`\\b${name}\\b`));
  });

  it('names the input limit of parse', () => {
    expect(README).toContain(`${String(MAX_INPUT_CODE_POINTS)} code points`);
  });

  it('names the version of the spec that the package implements', () => {
    const version = core.SPEC_VERSION.replaceAll('.', '\\.');
    expect(README).toMatch(new RegExp(`Gatepost spec\\s*\\|\\s*${version}\\s*\\|`));
  });
});

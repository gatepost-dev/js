// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import * as core from '../src/index.js';

/** A code example from the docs: its name for the test report, and the code between the fences. */
export interface Example {
  readonly name: string;
  readonly source: string;
}

// A line such as `canonical; // 'EK-01-A03-FK-01'` states a result. The test turns it into a call
// of `strictEqual`, so the docs cannot show a result that the code does not give. A guard such
// as `if (parsed.ok)` can skip such a call. So the module counts the calls that run, and the test
// compares that count with the number of result lines.
const RESULT_LINE =
  /^(\s*)(.+);\s*\/\/ *('[^']*'|"[^"]*"|-?\d+(?:\.\d+)?|true|false|null|undefined)$/;
const SHOWN_RESULT = new RegExp(RESULT_LINE.source, 'gm');
// A comment that starts like a value, but that RESULT_LINE cannot read, would leave its result
// unchecked. The test fails on such a line, so that the author writes a form that it reads.
const VALUE_COMMENT = /;\s*\/\/ *(['"`[{-]|\d|(?:true|false|null|undefined|NaN|Infinity)\b)/;

const COUNTING_PREAMBLE = [
  "import { strictEqual as assertEqual } from 'node:assert/strict';",
  'export let checkedResults = 0;',
  'function strictEqual(actual: unknown, expected: unknown): void {',
  '  assertEqual(actual, expected);',
  '  checkedResults += 1;',
  '}',
].join('\n');

/**
 * Finds the TypeScript code blocks in text that has code fences.
 *
 * @param text - Markdown, or a doc comment with its asterisks removed.
 * @returns The code of each block that starts with the language name ts, in order.
 */
export function tsBlocks(text: string): readonly string[] {
  // Text between code fences sits at the odd positions of a split on the fence.
  return text
    .split('```')
    .filter((_, position) => position % 2 === 1)
    .filter((block) => block.startsWith('ts\n'))
    .map((block) => block.slice('ts\n'.length));
}

// An example in a doc comment has no import, because the reader sees it next to the function.
function withImports(source: string): string {
  if (/^import /m.test(source)) {
    return source;
  }
  const used = Object.keys(core).filter((name) => new RegExp(`\\b${name}\\b`).test(source));
  return used.length === 0
    ? source
    : `import { ${used.join(', ')} } from '@gatepost/core';\n${source}`;
}

/**
 * Turns an example into a module that checks each result that the example shows.
 *
 * @param example - The code of the example.
 * @returns The text of a TypeScript module that imports the package from its source.
 */
export function toModule(example: string): string {
  const source = withImports(example)
    .replaceAll("'@gatepost/core'", "'../../src/index.js'")
    .replace(SHOWN_RESULT, '$1strictEqual($2, $3);');
  return `${COUNTING_PREAMBLE}\n${source}`;
}

/**
 * Counts the lines of an example that show a result in a form that the test can compare.
 *
 * @param source - The code of the example.
 * @returns The number of lines.
 */
export function countShownResults(source: string): number {
  return Array.from(source.matchAll(SHOWN_RESULT)).length;
}

/**
 * Finds the lines of an example that seem to show a result in a form that the test cannot read.
 *
 * @param source - The code of the example.
 * @returns The lines. A line that shows no result, or a readable one, is not in the list.
 */
export function unreadableResults(source: string): readonly string[] {
  return source.split('\n').filter((line) => VALUE_COMMENT.test(line) && !RESULT_LINE.test(line));
}

/**
 * Registers one test for each example, in the `describe` block that calls it. The test runs the
 * example against the source of the package, and fails when a result that the example shows is
 * wrong or is not compared.
 *
 * @param examples - The examples to run.
 */
export function runExamples(examples: readonly Example[]): void {
  let folder: string;

  beforeAll(() => {
    // Each run gets its own folder, so that parallel runs do not share files. The temp folder is
    // outside the view of git, Prettier, ESLint and tsc.
    const tempFolder = fileURLToPath(new URL('../temp/', import.meta.url));
    mkdirSync(tempFolder, { recursive: true });
    folder = mkdtempSync(join(tempFolder, 'examples-'));
  });

  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it.each(examples.map((example, index) => ({ ...example, index })))(
    'runs $name and finds each result that it shows',
    async ({ name, source, index }) => {
      const unreadable = unreadableResults(source);
      expect(unreadable, `${name} shows a result in a form that this test cannot read.`).toEqual(
        [],
      );
      const file = join(folder, `example-${String(index)}.ts`);
      writeFileSync(file, toModule(source));
      const { checkedResults } = (await import(pathToFileURL(file).href)) as {
        checkedResults: number;
      };
      const shownResults = countShownResults(source);
      const compared = `${String(checkedResults)} of ${String(shownResults)} results`;
      expect(checkedResults, `${name} compared ${compared}.`).toBe(shownResults);
    },
  );
}

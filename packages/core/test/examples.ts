// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import * as core from '../src/index.js';

/** A code example from the docs: its name for the test report, and the code between the fences. */
export interface Example {
  readonly name: string;
  readonly source: string;
}

/**
 * The module that each package name in an example stands for. A path is relative to the folder
 * of the module that the test writes, or absolute.
 */
export type Sources = Readonly<Record<string, string>>;

// The examples of the core run against its source.
const CORE_SOURCES: Sources = { '@gatepost/core': '../../src/index.js' };

/** The doc comments of one source file, each without its asterisks. */
export interface SourceDocs {
  readonly file: string;
  readonly docs: readonly string[];
}

const DOC_COMMENT = /\/\*\*[\s\S]*?\*\//g;

// The text of a doc comment without its asterisks, so that a code fence starts a line.
function docText(comment: string): string {
  return comment
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, ''))
    .join('\n');
}

/**
 * Reads the doc comments of each TypeScript file in a folder.
 *
 * @param folder - The folder, such as the `src` folder of a package.
 * @returns The doc comments of each file, in the order of the file names.
 */
export function readDocComments(folder: URL): readonly SourceDocs[] {
  return readdirSync(folder)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((file) => {
      const text = readFileSync(new URL(file, folder), 'utf8');
      return {
        file,
        docs: Array.from(text.matchAll(DOC_COMMENT), ([comment]) => docText(comment)),
      };
    });
}

/**
 * Finds the code of each `@example` tag. Each tag must hold a code fence, or its code would never
 * run.
 *
 * @param sources - The doc comments of each file.
 * @returns The examples, named after their files.
 */
export function docExamples(sources: readonly SourceDocs[]): readonly Example[] {
  return sources.flatMap(({ file, docs }) => {
    const sections = docs.flatMap((doc) => doc.split(/^@example\b/m).slice(1));
    const blocks = sections.flatMap((section, index) => {
      const inSection = tsBlocks(section);
      if (inSection.length === 0) {
        throw new Error(`The @example number ${String(index)} in ${file} has no ts code fence.`);
      }
      return inSection;
    });
    return blocks.map((source, index) => ({ name: `${file} example ${String(index)}`, source }));
  });
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
 * @param sources - The module for each package name. The default is the source of the core.
 * @returns The text of a TypeScript module that imports each package from its source.
 */
export function toModule(example: string, sources: Sources = CORE_SOURCES): string {
  const imported = Object.entries(sources).reduce(
    (source, [name, module]) => source.replaceAll(`'${name}'`, `'${module}'`),
    withImports(example),
  );
  return `${COUNTING_PREAMBLE}\n${imported.replace(SHOWN_RESULT, '$1strictEqual($2, $3);')}`;
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
 * @param sources - The module for each package name. The default is the source of the core.
 */
export function runExamples(examples: readonly Example[], sources: Sources = CORE_SOURCES): void {
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
      writeFileSync(file, toModule(source, sources));
      const { checkedResults } = (await import(pathToFileURL(file).href)) as {
        checkedResults: number;
      };
      const shownResults = countShownResults(source);
      const compared = `${String(checkedResults)} of ${String(shownResults)} results`;
      expect(checkedResults, `${name} compared ${compared}.`).toBe(shownResults);
    },
  );
}

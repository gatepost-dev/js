// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';
import { runExamples, tsBlocks, type Example } from './examples.js';

const SOURCE_FOLDER = new URL('../src/', import.meta.url);
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

const SOURCES = readdirSync(SOURCE_FOLDER)
  .filter((name) => name.endsWith('.ts'))
  .sort()
  .map((file) => {
    const text = readFileSync(new URL(file, SOURCE_FOLDER), 'utf8');
    return { file, docs: Array.from(text.matchAll(DOC_COMMENT), ([comment]) => docText(comment)) };
  });

// Each @example tag must hold a code fence, or its code would never run.
function examplesOf({ file, docs }: (typeof SOURCES)[number]): readonly Example[] {
  const sections = docs.flatMap((doc) => doc.split(/^@example\b/m).slice(1));
  const blocks = sections.flatMap((section, index) => {
    const found = tsBlocks(section);
    if (found.length === 0) {
      throw new Error(`The @example number ${String(index)} in ${file} has no ts code fence.`);
    }
    return found;
  });
  return blocks.map((source, index) => ({ name: `${file} example ${String(index)}`, source }));
}

const EXAMPLES = SOURCES.flatMap(examplesOf);

describe('TSDoc examples', () => {
  runExamples(EXAMPLES);

  it.each(Object.keys(core))('shows %s in an example', (name) => {
    expect(EXAMPLES.map((example) => example.source).join('\n')).toMatch(
      new RegExp(`\\b${name}\\b`),
    );
  });
});

describe('TSDoc text', () => {
  // The input limit comes from the spec data. A number in a doc comment goes stale when the spec
  // changes it, so the docs say "the input limit".
  it.each(SOURCES)('$file gives no number of code points', ({ docs }) => {
    const lines = docs.flatMap((doc) => doc.split('\n'));
    expect(lines.filter((line) => /\b\d+ code points\b/.test(line))).toEqual([]);
  });
});

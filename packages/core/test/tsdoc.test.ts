// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';
import { docExamples, readDocComments, runExamples } from './examples.js';

const SOURCES = readDocComments(new URL('../src/', import.meta.url));
const EXAMPLES = docExamples(SOURCES);

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

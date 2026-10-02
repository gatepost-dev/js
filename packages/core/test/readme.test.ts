// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';
import { MAX_INPUT_CODE_POINTS } from '../src/spec-data.js';
import { runExamples, tsBlocks } from './examples.js';

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const EXAMPLES = tsBlocks(README).map((source, index) => ({
  name: `README example ${String(index)}`,
  source,
}));

describe('README', () => {
  runExamples(EXAMPLES);

  it.each(Object.keys(core))('shows %s in an example', (name) => {
    expect(EXAMPLES.map((example) => example.source).join('\n')).toMatch(
      new RegExp(`\\b${name}\\b`),
    );
  });

  it('names the input limit of parse', () => {
    expect(README).toContain(`${String(MAX_INPUT_CODE_POINTS)} code points`);
  });

  it('names the version of the spec that the package implements', () => {
    const version = core.SPEC_VERSION.replaceAll('.', '\\.');
    expect(README).toMatch(new RegExp(`Gatepost spec\\s*\\|\\s*${version}\\s*\\|`));
  });
});

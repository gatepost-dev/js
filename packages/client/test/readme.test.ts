// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runExamples, tsBlocks } from '../../core/test/examples.js';
import * as client from '../src/index.js';
import type { PostcodeErrorCode } from '../src/index.js';
import { CLIENT_SOURCES, useMockServer } from './examples.js';

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const EXAMPLES = tsBlocks(README).map((source, index) => ({
  name: `README example ${String(index)}`,
  source,
}));

describe('README', () => {
  useMockServer();
  runExamples(EXAMPLES, CLIENT_SOURCES);

  it.each(Object.keys(client))('shows %s in an example', (name) => {
    expect(EXAMPLES.map((example) => example.source).join('\n')).toMatch(
      new RegExp(`\\b${name}\\b`),
    );
  });

  it('says that the package is unofficial', () => {
    expect(README).toContain('> Unofficial. Not made or endorsed by NIPOST.');
  });

  it('names the version of the spec that the package implements', () => {
    const version = client.SPEC_VERSION.replaceAll('.', '\\.');
    expect(README).toMatch(new RegExp(`Gatepost spec\\s*\\|\\s*${version}\\s*\\|`));
  });

  it('lists every error code, and no other, as the type does', () => {
    // A new or removed code in the type makes this record fail to compile.
    const codes: Record<PostcodeErrorCode, true> = {
      invalid_input: true,
      unauthorized: true,
      insufficient_credits: true,
      origin_not_allowed: true,
      forbidden: true,
      rate_limited: true,
      server_error: true,
      unexpected_response: true,
      network_error: true,
      timeout: true,
    };
    const sentence = /Its `code` is one of ([^.]*)\./.exec(README)?.[1] ?? '';
    const listed = [...sentence.matchAll(/`([a-z_]+)`/g)].map((match) => match[1]);
    expect(listed.sort()).toEqual(Object.keys(codes).sort());
  });
});

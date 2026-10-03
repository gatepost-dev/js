// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { docExamples, readDocComments, runExamples } from '../../core/test/examples.js';
import * as client from '../src/index.js';
import { CLIENT_SOURCES, useMockServer } from './examples.js';

const EXAMPLES = docExamples(readDocComments(new URL('../src/', import.meta.url)));

describe('TSDoc examples', () => {
  useMockServer();
  runExamples(EXAMPLES, CLIENT_SOURCES);

  it.each(Object.keys(client))('shows %s in an example', (name) => {
    expect(EXAMPLES.map((example) => example.source).join('\n')).toMatch(
      new RegExp(`\\b${name}\\b`),
    );
  });
});

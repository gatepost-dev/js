// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VECTOR_FILES, VECTORS_FOLDER } from './vectors.js';

const EXTENSION = '.json';
const TEST_FOLDER = new URL('./', import.meta.url);

// Vitest gives each test file its own modules, so no test can see what another one loads. This
// test reads the runner sources instead. A runner names a file in a call of loadVectors, or in a
// list that it passes to describe.each.
const LOAD_CALL = /loadVectors(?:<[^()]*>)?\(\s*'([^']+)'/g;
const FILE_LIST = /const \w*FILES = \[([^\]]*)\]/g;
const QUOTED_NAME = /'([^']+)'/g;

function namesLoadedBy(source: string): readonly string[] {
  const fromCalls = Array.from(source.matchAll(LOAD_CALL), ([, name]) => name);
  const fromLists = Array.from(source.matchAll(FILE_LIST), ([, items]) => items ?? '').flatMap(
    (items) => Array.from(items.matchAll(QUOTED_NAME), ([, name]) => name),
  );
  return [...fromCalls, ...fromLists].filter((name): name is string => name !== undefined);
}

describe('the vector files', () => {
  const inFolder = readdirSync(VECTORS_FOLDER)
    .filter((name) => name.endsWith(EXTENSION))
    .map((name) => name.slice(0, -EXTENSION.length));
  const listed: readonly string[] = VECTOR_FILES;

  it('have a name in VECTOR_FILES for each file in spec/vectors', () => {
    const unlisted = inFolder.filter((file) => !listed.includes(file));
    const reason = `VECTOR_FILES lacks ${unlisted.join(', ')}, which spec/vectors holds.`;
    expect(unlisted, `${reason} Write a runner, and add the file name to VECTOR_FILES.`).toEqual(
      [],
    );
  });

  it('list only files that spec/vectors holds', () => {
    const absent = listed.filter((file) => !inFolder.includes(file));
    const reason = `VECTOR_FILES names ${absent.join(', ')}, but spec/vectors lacks the file.`;
    expect(absent, `${reason} Rename or remove the name and its runner.`).toEqual([]);
  });

  it('have a runner that loads each listed file', () => {
    const runners = readdirSync(TEST_FOLDER)
      .filter((name) => name.endsWith('.test.ts') && name !== 'vectors.test.ts')
      .map((name) => readFileSync(new URL(name, TEST_FOLDER), 'utf8'));
    const loaded = new Set(runners.flatMap(namesLoadedBy));
    const idle = listed.filter((file) => !loaded.has(file));
    const reason = `VECTOR_FILES names ${idle.join(', ')}, but no runner loads the file.`;
    const hint =
      'A runner names its file in a loadVectors call, or in a list named like PARSE_FILES.';
    expect(idle, `${reason} Write the runner, or remove the name. ${hint}`).toEqual([]);
  });
});

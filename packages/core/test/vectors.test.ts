// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VECTOR_FILES, VECTORS_FOLDER } from './vectors.js';

const EXTENSION = '.json';

describe('the vector files', () => {
  const inFolder = readdirSync(VECTORS_FOLDER)
    .filter((name) => name.endsWith(EXTENSION))
    .map((name) => name.slice(0, -EXTENSION.length));
  const listed: readonly string[] = VECTOR_FILES;

  it('have a runner for each file in spec/vectors', () => {
    const unrun = inFolder.filter((file) => !listed.includes(file));
    const reason = `No runner loads ${unrun.join(', ')} from spec/vectors.`;
    expect(unrun, `${reason} Write a runner, and add the file name to VECTOR_FILES.`).toEqual([]);
  });

  it('list only files that spec/vectors holds', () => {
    const absent = listed.filter((file) => !inFolder.includes(file));
    const reason = `VECTOR_FILES names ${absent.join(', ')}, but spec/vectors lacks the file.`;
    expect(absent, `${reason} Rename or remove the name and its runner.`).toEqual([]);
  });
});

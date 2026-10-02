// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';

/** One shared test case from spec/vectors. */
export interface VectorCase<Input, Expect> {
  readonly id: string;
  readonly description: string;
  readonly input: Input;
  readonly options: Readonly<Record<string, unknown>>;
  readonly expect: Expect;
}

interface VectorFile<Input, Expect> {
  readonly version: number;
  readonly function: string;
  readonly cases: readonly VectorCase<Input, Expect>[];
}

const VECTORS = new URL('../../../spec/vectors/', import.meta.url);

/**
 * Reads one vector file and checks that it has the expected version, tests the expected
 * function and holds at least one case.
 *
 * @param file - The file name without `.json`, for example `parse-segments`.
 * @param fn - The function that the file must test, for example `parse`.
 * @returns The cases in the file.
 */
export function loadVectors<Input, Expect>(
  file: string,
  fn: string,
): readonly VectorCase<Input, Expect>[] {
  const text = readFileSync(new URL(`${file}.json`, VECTORS), 'utf8');
  const vectorFile = JSON.parse(text) as VectorFile<Input, Expect>;
  if (vectorFile.version !== 1) {
    throw new Error(`${file}.json has version ${String(vectorFile.version)}, not 1.`);
  }
  if (vectorFile.function !== fn) {
    throw new Error(`${file}.json tests ${vectorFile.function}, not ${fn}.`);
  }
  if (vectorFile.cases.length === 0) {
    throw new Error(`${file}.json has no cases.`);
  }
  return vectorFile.cases;
}

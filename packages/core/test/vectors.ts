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
 * Reads one vector file and checks that it tests the expected function.
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
  const data = JSON.parse(text) as VectorFile<Input, Expect>;
  if (data.version !== 1 || data.function !== fn) {
    throw new Error(`${file}.json tests ${data.function}, not ${fn}, or uses an unknown format.`);
  }
  return data.cases;
}

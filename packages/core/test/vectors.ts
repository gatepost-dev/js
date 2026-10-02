// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { parse, type Postcode } from '../src/index.js';

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

/** The folder of vector files, in the spec submodule. */
export const VECTORS_FOLDER: URL = new URL('../../../spec/vectors/', import.meta.url);

/**
 * The vector files that have a runner. `loadVectors` takes only these names, and
 * vectors.test.ts compares the list with the folder. So a new vector file fails there until
 * someone writes its runner and adds its name here.
 */
export const VECTOR_FILES = [
  'contains',
  'is-legacy',
  'normalize',
  'parent',
  'parse',
  'parse-segments',
  'parse-states',
  'precision-for-accuracy',
  'redact',
  'state-name',
  'truncate',
] as const;

/** The name of a vector file without `.json`. */
export type VectorFileName = (typeof VECTOR_FILES)[number];

/**
 * Reads one vector file and checks that it has the expected version, tests the expected
 * function and holds at least one case.
 *
 * @param file - The file name without `.json`, for example `parse-segments`.
 * @param fn - The function that the file must test, for example `parse`.
 * @returns The cases in the file.
 */
export function loadVectors<Input, Expect>(
  file: VectorFileName,
  fn: string,
): readonly VectorCase<Input, Expect>[] {
  const text = readFileSync(new URL(`${file}.json`, VECTORS_FOLDER), 'utf8');
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

/**
 * Parses a canonical code from a vector, with partial codes allowed.
 *
 * @param canonical - A code such as `EK-01-A03`.
 * @returns The postcode.
 */
export function parseVectorCode(canonical: string): Postcode {
  const parsed = parse(canonical, { allowPartial: true });
  if (!parsed.ok) {
    throw new Error(`The vector code ${canonical} does not parse: ${parsed.error.code}.`);
  }
  return parsed.value;
}

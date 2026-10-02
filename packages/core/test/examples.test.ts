// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { countShownResults, toModule, unreadableResults } from './examples.js';

describe('toModule', () => {
  it.each([
    ["x; // 'a'", "strictEqual(x, 'a');"],
    ['x; // "a"', 'strictEqual(x, "a");'],
    ['x; // 12', 'strictEqual(x, 12);'],
    ['x; // -1.5', 'strictEqual(x, -1.5);'],
    ['x; // true', 'strictEqual(x, true);'],
    ['x; // false', 'strictEqual(x, false);'],
    ['x; // null', 'strictEqual(x, null);'],
    ['x; // undefined', 'strictEqual(x, undefined);'],
  ])('compares the result in %s', (line, call) => {
    expect(toModule(line)).toContain(call);
  });

  it('keeps the indent of the line that shows the result', () => {
    expect(toModule("if (ok) {\n  x; // 'a'\n}")).toContain("\n  strictEqual(x, 'a');\n");
  });

  it('leaves a comment that is not a result as it is', () => {
    const line = 'const x = f(); // a letter o where a zero belongs';
    expect(toModule(line)).toContain(line);
  });

  it('imports the package from its source, for an example with an import', () => {
    const module = toModule("import { parse } from '@gatepost/core';\nparse('x');");
    expect(module).toContain("from '../../src/index.js'");
    expect(module).not.toContain("'@gatepost/core'");
  });

  it('imports each function that an example without an import uses', () => {
    const module = toModule("parse('x'); // 'y'\nredact(x);");
    expect(module).toContain("import { parse, redact } from '../../src/index.js';");
  });
});

describe('countShownResults', () => {
  it('counts each line that shows a result, in any of the readable forms', () => {
    const source = ["a; // 'x'", 'b; // "y"', 'c; // 3', 'd; // null', 'e; // undefined'].join(
      '\n',
    );
    expect(countShownResults(source)).toBe(5);
  });

  it('does not count a comment that is not a result', () => {
    expect(countShownResults("f(); // for example 'x'\ng(); // a zero")).toBe(0);
  });
});

describe('unreadableResults', () => {
  it.each([
    "x; // 'a' or 'b'",
    '[1, 2]; // [1, 2]',
    'x; // { ok: true }',
    'x; // 1e3',
    'x; // 3 segments',
    'x; // `a`',
    'x; // NaN',
    'x; // Infinity',
    'x; // -Infinity',
    'x; // true or false',
  ])('reports the line %s, because its result form is not readable', (line) => {
    expect(unreadableResults(`const y = 1;\n${line}\n`)).toEqual([line]);
  });

  it.each([
    "x; // 'a'",
    'x; // "a"',
    'x; // undefined',
    'x; // a letter o where a zero belongs',
    "x; // for example 'bad_length'",
    'x;',
  ])('accepts the line %s', (line) => {
    expect(unreadableResults(line)).toEqual([]);
  });
});

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Lints known-bad snippets with the real ESLint config and expects the rule that each one breaks.
// A config edit that drops a rule then fails here, and not in silence.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { ESLint } from 'eslint';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_FILE = 'packages/core/src/probe.ts';
const TEST_FILE = 'packages/core/test/probe.test.ts';

// The two files do not exist. The project service lints them with the options of the package.
const eslint = new ESLint({
  cwd: ROOT,
  overrideConfig: {
    files: ['packages/core/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [SOURCE_FILE, TEST_FILE],
          defaultProject: 'packages/core/tsconfig.json',
        },
      },
    },
  },
});

async function lint(code, filePath = SOURCE_FILE) {
  const [fileReport] = await eslint.lintText(code, { filePath });
  return fileReport.messages;
}

function lines(...rows) {
  return `${rows.join('\n')}\n`;
}

// A doc comment as TS-9 asks: a summary, a blank line, then the tags.
function docComment(...tags) {
  return ['/**', ' * Adds one.', ' *', ...tags.map((tag) => ` * ${tag}`), ' */'].join('\n');
}

const PARAM = '@param n - A number.';
const RETURNS = '@returns The next number.';
const EXAMPLE = ['@example', '```ts', 'addOne(1); // 2', '```'];
const WITH_EXAMPLE = docComment(PARAM, RETURNS, ...EXAMPLE);
const WITHOUT_EXAMPLE = docComment(PARAM, RETURNS);

const FUNCTION = lines('export function addOne(n: number): number {', '  return n + 1;', '}');
const ARROW = lines('export const addOne = (n: number): number => n + 1;');
const EXPRESSION = lines(
  'export const addOne = function (n: number): number {',
  '  return n + 1;',
  '};',
);

// A function that returns n + 1, with the doc comment and the declaration that a case needs.
function withDoc(doc, declaration) {
  return `${doc}\n${lines(`${declaration} {`, '  return n + 1;', '}')}`;
}

// A documented function that imports a module by a dynamic import of `specifier`.
function loader(specifier) {
  const doc = docComment('@returns The module.', '@example', '```ts', 'await load();', '```');
  const declaration = 'export async function load(): Promise<unknown> {';
  return `${doc}\n${lines(declaration, `  return await import(${specifier});`, '}')}`;
}

const GOOD = [
  { name: 'a function with a doc and an example', code: `${WITH_EXAMPLE}\n${FUNCTION}` },
  { name: 'an arrow function with a doc and an example', code: `${WITH_EXAMPLE}\n${ARROW}` },
  {
    name: 'a function expression with a doc and an example',
    code: `${WITH_EXAMPLE}\n${EXPRESSION}`,
  },
  {
    name: 'an internal function with no example',
    code: `${docComment(PARAM, RETURNS, '@internal')}\n${FUNCTION}`,
  },
  { name: 'a dynamic import of a relative file', code: loader("'./index.js'") },
];

// Each snippet breaks the rule in `rule`. A snippet that also breaks another rule is fine.
const BAD = [
  // CS-2: core code uses no Node API.
  {
    rule: 'no-restricted-imports',
    name: 'a Node module with the node: prefix',
    code: lines("import { readFileSync } from 'node:fs';", 'export const read = readFileSync;'),
  },
  {
    rule: 'no-restricted-imports',
    name: 'a Node module by its bare name',
    code: lines("import { readFileSync } from 'fs';", 'export const read = readFileSync;'),
  },
  ...['process', 'Buffer', '__dirname', '__filename', 'global'].map((name) => ({
    rule: 'no-restricted-globals',
    name: `the global ${name}`,
    code: lines(`export const found = ${name};`),
  })),
  {
    rule: 'no-restricted-properties',
    name: 'globalThis.process',
    code: lines('export const environment = globalThis.process.env;'),
  },
  {
    rule: 'no-restricted-properties',
    name: 'globalThis.Buffer',
    code: lines('export const bytes = globalThis.Buffer.alloc(1);'),
  },
  {
    rule: 'no-restricted-properties',
    name: 'globalThis with a quoted name',
    code: lines("export const environment = globalThis['process'];"),
  },
  {
    rule: 'no-restricted-syntax',
    name: 'a dynamic import of a node: module',
    code: loader("'node:os'"),
    message: /dynamic import/,
  },
  {
    rule: 'no-restricted-syntax',
    name: 'a dynamic import of a bare Node module',
    code: loader("'os'"),
    message: /dynamic import/,
  },
  {
    rule: 'no-restricted-syntax',
    name: 'a dynamic import of a computed name',
    code: loader("['node', 'os'].join(':')"),
    message: /dynamic import/,
  },
  // TS-5: no enum and no namespace.
  {
    rule: 'no-restricted-syntax',
    name: 'an enum',
    code: lines('export enum Color {', '  Red,', '}'),
    message: /TSEnumDeclaration/,
  },
  {
    rule: 'no-restricted-syntax',
    name: 'a namespace',
    code: lines('namespace Shapes {', '  export const sides = 4;', '}'),
    message: /TSModuleDeclaration/,
  },
  // TS-1: named exports only.
  {
    rule: 'no-restricted-exports',
    name: 'a default export',
    code: withDoc(WITH_EXAMPLE, 'export default function addOne(n: number): number'),
  },
  // TS-3, TS-4 and TS-8: types.
  {
    rule: '@typescript-eslint/no-explicit-any',
    name: 'the type any',
    code: withDoc(WITHOUT_EXAMPLE, 'export function addOne(n: any): number'),
  },
  {
    rule: '@typescript-eslint/no-non-null-assertion',
    name: 'a non-null assertion in source',
    code: lines('export function first(list: string[]): string {', '  return list[0]!;', '}'),
  },
  {
    rule: '@typescript-eslint/explicit-module-boundary-types',
    name: 'an exported function with no return type',
    code: withDoc(WITH_EXAMPLE, 'export function addOne(n: number)'),
  },
  // TELL-2, TELL-3, TELL-9, TELL-10, TELL-13, TELL-16 and TELL-17.
  {
    rule: 'max-depth',
    name: 'nesting of 4 levels',
    code: lines(
      'function deep(a: boolean): number {',
      '  if (a) {',
      '    if (a) {',
      '      if (a) {',
      '        if (a) {',
      '          return 1;',
      '        }',
      '      }',
      '    }',
      '  }',
      '  return 0;',
      '}',
      'export const run = deep;',
    ),
  },
  {
    rule: 'complexity',
    name: 'a complexity of 11',
    code: lines(
      'function many(n: number): number {',
      ...Array.from({ length: 10 }, () => ['  if (n === 1) {', '    return 1;', '  }']).flat(),
      '  return 0;',
      '}',
      'export const run = many;',
    ),
  },
  {
    rule: 'max-params',
    name: '5 positional parameters',
    code: lines(
      'function sum(a: number, b: number, c: number, d: number, e: number): number {',
      '  return a + b + c + d + e;',
      '}',
      'export const run = sum;',
    ),
  },
  {
    rule: 'no-empty',
    name: 'an empty catch block',
    code: lines(
      'export function quiet(): void {',
      '  try {',
      "    JSON.parse('1');",
      '  } catch {}',
      '}',
    ),
  },
  {
    rule: '@typescript-eslint/no-unnecessary-condition',
    name: 'a check that the type makes certain',
    code: lines('export function present(n: number): boolean {', '  return n !== null;', '}'),
  },
  {
    rule: 'no-console',
    name: 'a console call',
    code: lines('export function shout(): void {', "  console.error('x');", '}'),
  },
  {
    rule: '@typescript-eslint/require-await',
    name: 'an async function with no await',
    code: withDoc(WITH_EXAMPLE, 'export async function addOne(n: number): Promise<number>'),
  },
  {
    rule: 'no-nested-ternary',
    name: 'a nested ternary',
    code: lines(
      'export const size = (n: number): string => {',
      "  return n < 1 ? 'none' : n < 2 ? 'one' : 'many';",
      '};',
    ),
  },
  // TS-13: a reason for each eslint-disable comment.
  {
    rule: '@eslint-community/eslint-comments/require-description',
    name: 'an eslint-disable comment with no reason',
    code: lines(
      '// eslint-disable-next-line no-console',
      "export const log = (): void => console.error('x');",
    ),
  },
  // TS-9: a doc comment on each export, and an example on each exported function.
  { rule: 'jsdoc/require-jsdoc', name: 'an exported function with no doc comment', code: FUNCTION },
  {
    rule: 'jsdoc/require-jsdoc',
    name: 'an exported constant with no doc comment',
    code: lines('export const LIMIT = 4;'),
  },
  {
    rule: 'jsdoc/require-example',
    name: 'an exported function with no example',
    code: `${WITHOUT_EXAMPLE}\n${FUNCTION}`,
  },
  {
    rule: 'jsdoc/require-example',
    name: 'an exported arrow function with no example',
    code: `${WITHOUT_EXAMPLE}\n${ARROW}`,
  },
  {
    rule: 'jsdoc/require-example',
    name: 'an exported function expression with no example',
    code: `${WITHOUT_EXAMPLE}\n${EXPRESSION}`,
  },
  {
    rule: 'jsdoc/check-tag-names',
    name: 'a doc tag that the config does not define',
    code: `${docComment(PARAM, RETURNS, '@bogus')}\n${FUNCTION}`,
  },
  {
    rule: 'jsdoc/tag-lines',
    name: 'a doc comment with no blank line before its tags',
    code: `${lines('/**', ' * Adds one.', ` * ${PARAM}`, ` * ${RETURNS}`, ' */')}${FUNCTION}`,
  },
];

describe('the lint config accepts good snippets', () => {
  for (const { name, code } of GOOD) {
    it(`accepts ${name}`, async () => {
      assert.deepEqual(await lint(code), []);
    });
  }
});

describe('the lint config rejects bad snippets', () => {
  for (const { rule, name, code, message } of BAD) {
    it(`reports ${rule} for ${name}`, async () => {
      const messages = await lint(code);
      assert.ok(!messages.some((reported) => reported.fatal), JSON.stringify(messages));
      const reports = messages.filter((reported) => reported.ruleId === rule);
      assert.ok(reports.length > 0, `No ${rule} report. Reports: ${JSON.stringify(messages)}`);
      if (message !== undefined) {
        assert.ok(
          reports.some((reported) => message.test(reported.message)),
          JSON.stringify(reports),
        );
      }
    });
  }

  it('reports an import of node:test once, and not once for each rule option', async () => {
    const messages = await lint(lines("import test from 'node:test';", 'export const run = test;'));
    assert.equal(
      messages.filter((reported) => reported.ruleId === 'no-restricted-imports').length,
      1,
    );
  });
});

describe('the lint config in test files', () => {
  it('rejects an enum, as TS-5 says for all code', async () => {
    const messages = await lint(lines('enum Color {', '  Red,', '}'), TEST_FILE);
    assert.ok(messages.some((reported) => reported.ruleId === 'no-restricted-syntax'));
  });

  it('allows a non-null assertion, as TS-4 says', async () => {
    const code = lines(
      'export function first(list: string[]): string {',
      '  return list[0]!;',
      '}',
    );
    assert.deepEqual(await lint(code, TEST_FILE), []);
  });
});

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { builtinModules } from 'node:module';
import eslint from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import { defineConfig } from 'eslint/config';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

const message = 'Core code runs in every runtime. Use no Node APIs (CS-2).';
// A constant, because the selector would pass 100 columns inside the rule options (TELL-1).
const exportedArrowFunction =
  'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression';

export default defineConfig(
  { ignores: ['**/dist/**', '**/coverage/**', '**/temp/**', 'spec/**', '**/spec-data.ts'] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  comments.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@eslint-community/eslint-comments/require-description': 'error',
      'max-depth': ['error', 3],
      complexity: ['error', 10],
      'max-params': ['error', 4],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-nested-ternary': 'error',
      '@typescript-eslint/require-await': 'error',
      'no-restricted-syntax': ['error', 'TSEnumDeclaration', 'TSModuleDeclaration'],
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
    },
  },
  {
    files: ['packages/*/src/**/*.{ts,mts,cts,tsx}'],
    extends: [jsdoc.configs['flat/recommended-tsdoc-error']],
    settings: { jsdoc: { tagNamePreference: { template: 'typeParam', abstract: 'virtual' } } },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          contexts: [
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
            'ExportNamedDeclaration > VariableDeclaration',
            'ExportNamedDeclaration > ClassDeclaration',
          ],
        },
      ],
      'jsdoc/require-example': [
        'error',
        {
          contexts: ['ExportNamedDeclaration > FunctionDeclaration', exportedArrowFunction],
          exemptedBy: ['internal'],
        },
      ],
      'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
      'jsdoc/check-tag-names': [
        'error',
        { definedTags: ['packageDocumentation', 'internal', 'defaultValue'] },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: builtinModules.map((name) => ({ name, message })),
          patterns: [{ group: ['node:*'], message }],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message },
        { name: 'Buffer', message },
        { name: '__dirname', message },
        { name: '__filename', message },
        { name: 'global', message },
      ],
    },
  },
  {
    files: ['packages/*/test/**/*.ts'],
    rules: {
      // TS-4 allows non-null assertions in tests.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.config.ts', '**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'no-restricted-exports': 'off',
    },
  },
);

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import eslint from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import { defineConfig } from 'eslint/config';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

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
          restrictDefaultExports: { direct: true, named: true, defaultFrom: true, namedFrom: true },
        },
      ],
    },
  },
  {
    files: ['packages/*/src/**/*.ts'],
    extends: [jsdoc.configs['flat/recommended-typescript-error']],
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          contexts: [
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
            'ExportNamedDeclaration > VariableDeclaration',
          ],
        },
      ],
      'jsdoc/require-example': [
        'error',
        { contexts: ['ExportNamedDeclaration > FunctionDeclaration'], exemptedBy: ['internal'] },
      ],
      'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
      'jsdoc/check-tag-names': ['error', { definedTags: ['packageDocumentation', 'internal'] }],
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message: 'Core code runs in every runtime. Use no Node APIs (CS-2).',
            },
          ],
        },
      ],
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

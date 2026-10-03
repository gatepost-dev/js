// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 72],
    'scope-empty': [2, 'never'],
    'scope-enum': [
      2,
      'always',
      ['core', 'client', 'field', 'react', 'mock', 'repo', 'deps', 'release'],
    ],
    'signed-off-by': [2, 'always', 'Signed-off-by:'],
  },
};

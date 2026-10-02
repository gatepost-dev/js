// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Starts commitlint with the real config on sample messages, so that a config edit cannot drop a
// rule (GIT-1 and GIT-2) in silence.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { describe, it } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const COMMITLINT = fileURLToPath(import.meta.resolve('@commitlint/cli/cli.js'));
const SIGN_OFF = 'Signed-off-by: A Contributor <contributor@example.org>';

function lintMessage(...rows) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [COMMITLINT], {
    cwd: ROOT,
    input: `${rows.join('\n')}\n`,
    encoding: 'utf8',
  });
  return { status, output: stdout + stderr };
}

describe('the commit message config accepts', () => {
  it('a message with a scope, a body and a sign-off', () => {
    const verdict = lintMessage(
      'fix(core): reject a unit of 00',
      '',
      'The unit rule needs a check.',
      '',
      SIGN_OFF,
    );
    assert.deepEqual(verdict, { status: 0, output: '' });
  });

  it('a header with a sign-off and no body', () => {
    assert.deepEqual(lintMessage('fix(core): reject a unit of 00', '', SIGN_OFF), {
      status: 0,
      output: '',
    });
  });
});

describe('the commit message config rejects', () => {
  const cases = [
    {
      name: 'a message with no sign-off',
      rule: 'signed-off-by',
      rows: ['fix(core): reject a unit of 00', '', 'The unit rule needs a check.'],
    },
    {
      name: 'a message whose last line is not the sign-off',
      rule: 'signed-off-by',
      rows: ['fix(core): reject a unit of 00', '', SIGN_OFF, '', 'Closes #12'],
    },
    {
      name: 'a sign-off line with another name',
      rule: 'signed-off-by',
      rows: [
        'fix(core): reject a unit of 00',
        '',
        'Signed-off: A Contributor <contributor@example.org>',
      ],
    },
    {
      name: 'a header with no scope',
      rule: 'scope-empty',
      rows: ['fix: reject a unit of 00', '', SIGN_OFF],
    },
    {
      name: 'a scope that the config does not list',
      rule: 'scope-enum',
      rows: ['fix(parser): reject a unit of 00', '', SIGN_OFF],
    },
    {
      name: 'a header over 72 characters',
      rule: 'header-max-length',
      rows: [`fix(core): ${'a'.repeat(62)}`, '', SIGN_OFF],
    },
    {
      name: 'a type that Conventional Commits does not list',
      rule: 'type-enum',
      rows: ['update(core): reject a unit of 00', '', SIGN_OFF],
    },
  ];

  for (const { name, rule, rows } of cases) {
    it(`${name}, and names the rule ${rule}`, () => {
      const { status, output } = lintMessage(...rows);
      assert.equal(status, 1, output);
      assert.ok(output.includes(`[${rule}]`), output);
    });
  }
});

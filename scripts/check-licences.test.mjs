// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { after, describe, it } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { findViolations } from './check-licences.mjs';

const SCRIPT = fileURLToPath(new URL('./check-licences.mjs', import.meta.url));

function report(licence, ...names) {
  return { [licence]: names.map((name) => ({ name, versions: ['1.2.3'] })) };
}

describe('findViolations', () => {
  const policy = {
    allowed: ['MIT', 'Apache-2.0'],
    exceptions: [{ name: 'data-pack', licence: 'CC-BY-4.0', reason: 'A dev-only data licence.' }],
  };

  it('accepts a dependency with an allowed licence', () => {
    assert.deepEqual(findViolations(report('MIT', 'left-pad'), policy), []);
  });

  it('names the package, its versions and its licence when the licence is not allowed', () => {
    const entries = { 'GPL-3.0': [{ name: 'copyleft', versions: ['1.0.0', '2.0.0'] }] };
    assert.deepEqual(findViolations(entries, policy), [
      'copyleft@1.0.0, 2.0.0 has the licence GPL-3.0.',
    ]);
  });

  it('reports a package that has no licence', () => {
    assert.equal(findViolations(report('Unknown', 'no-licence'), policy).length, 1);
  });

  it('accepts a dual licence when one alternative is allowed', () => {
    assert.deepEqual(findViolations(report('(GPL-3.0 OR MIT)', 'dual'), policy), []);
    assert.deepEqual(findViolations(report('MIT OR Apache-2.0', 'dual'), policy), []);
  });

  it('rejects a dual licence when no alternative is allowed', () => {
    assert.equal(findViolations(report('GPL-3.0 OR AGPL-3.0', 'dual'), policy).length, 1);
  });

  it('rejects an expression that joins licences with AND or with nested parentheses', () => {
    assert.equal(findViolations(report('MIT AND Apache-2.0', 'both'), policy).length, 1);
    const hidden = report('GPL-3.0 AND (MIT OR Apache-2.0)', 'hidden');
    assert.equal(findViolations(hidden, policy).length, 1);
  });

  it('accepts an exception that names the package and its licence', () => {
    assert.deepEqual(findViolations(report('CC-BY-4.0', 'data-pack'), policy), []);
  });

  it('reports a package under the licence of an exception when its name differs', () => {
    assert.equal(findViolations(report('CC-BY-4.0', 'other-pack'), policy).length, 1);
  });

  it('reports an excepted package when its licence changes', () => {
    assert.equal(findViolations(report('GPL-3.0', 'data-pack'), policy).length, 1);
  });

  it('matches the packages of an exception that has a name pattern', () => {
    const withPattern = {
      allowed: [],
      exceptions: [{ name: /^native(-.+)?$/, licence: 'MPL-2.0', reason: 'One per platform.' }],
    };
    const entries = report('MPL-2.0', 'native', 'native-linux-x64', 'nativeish');
    assert.deepEqual(findViolations(entries, withPattern), [
      'nativeish@1.2.3 has the licence MPL-2.0.',
    ]);
  });
});

describe('the default policy', () => {
  // The first six are in the standard. The last three are permissive too (Ruling R31).
  const permissive = [
    'MIT',
    'ISC',
    'Apache-2.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    '0BSD',
    'BlueOak-1.0.0',
    'CC0-1.0',
    'Python-2.0',
  ];

  for (const licence of permissive) {
    it(`allows the permissive licence ${licence}`, () => {
      assert.deepEqual(findViolations(report(licence, 'any-package')), []);
    });
  }

  for (const licence of ['GPL-3.0', 'AGPL-3.0', 'LGPL-3.0', 'MPL-2.0', 'UNLICENSED', 'Unknown']) {
    it(`rejects the licence ${licence} for an unlisted package`, () => {
      assert.equal(findViolations(report(licence, 'any-package')).length, 1);
    });
  }

  it('records caniuse-lite as the one package that may use CC-BY-4.0', () => {
    assert.deepEqual(findViolations(report('CC-BY-4.0', 'caniuse-lite')), []);
    assert.equal(findViolations(report('CC-BY-4.0', 'another-data-set')).length, 1);
  });

  it('records spdx-exceptions as the one package that may use CC-BY-3.0', () => {
    assert.deepEqual(findViolations(report('CC-BY-3.0', 'spdx-exceptions')), []);
    assert.equal(findViolations(report('CC-BY-3.0', 'another-data-set')).length, 1);
    assert.equal(findViolations(report('CC-BY-4.0', 'spdx-exceptions')).length, 1);
  });

  it('records lightningcss and its platform packages as the only users of MPL-2.0', () => {
    const platforms = ['lightningcss', 'lightningcss-darwin-arm64', 'lightningcss-linux-x64-gnu'];
    assert.deepEqual(findViolations(report('MPL-2.0', ...platforms)), []);
    assert.equal(findViolations(report('MPL-2.0', 'lightningcssx', 'another-tool')).length, 2);
  });
});

const folders = [];

after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

function newFolder() {
  const folder = mkdtempSync(join(tmpdir(), 'check-licences-'));
  folders.push(folder);
  return folder;
}

// A pnpm that prints what the test sets in its environment. It stands in for the real pnpm, so
// that the test controls the report and the failures of `pnpm licenses list`.
function folderWithFakePnpm() {
  const folder = newFolder();
  const script = [
    '#!/bin/sh',
    'printf "%s" "$FAKE_PNPM_OUTPUT"',
    'if [ -n "$FAKE_PNPM_ERROR" ]; then printf "%s\\n" "$FAKE_PNPM_ERROR" >&2; fi',
    'exit "${FAKE_PNPM_STATUS:-0}"',
  ].join('\n');
  writeFileSync(join(folder, 'pnpm'), `${script}\n`);
  chmodSync(join(folder, 'pnpm'), 0o755);
  return folder;
}

function runNode(args, env) {
  const { status, stdout, stderr } = spawnSync(process.execPath, args, { env, encoding: 'utf8' });
  return { status, stdout, stderr };
}

// Runs the script with only `pathFolder` on the PATH, so that no real pnpm is found.
function runCheck({ pathFolder, report, pnpmError, pnpmStatus = 0, script = SCRIPT }) {
  return runNode([script], {
    PATH: pathFolder,
    FAKE_PNPM_OUTPUT: report === undefined ? '' : JSON.stringify(report),
    FAKE_PNPM_ERROR: pnpmError ?? '',
    FAKE_PNPM_STATUS: String(pnpmStatus),
  });
}

describe('check-licences.mjs as a command', { skip: process.platform === 'win32' }, () => {
  const pathFolder = folderWithFakePnpm();
  const copyleft = { 'GPL-3.0': [{ name: 'copyleft', versions: ['1.0.0'] }] };

  it('prints the count and exits with 0 when each licence is allowed', () => {
    const report = {
      MIT: [{ name: 'a', versions: ['1.0.0'] }],
      'Apache-2.0': [{ name: 'b', versions: ['2.0.0'] }],
    };
    assert.deepEqual(runCheck({ pathFolder, report }), {
      status: 0,
      stdout: 'Checked 2 packages. Each has an allowed licence or an exception.\n',
      stderr: '',
    });
  });

  it('names the package and exits with 1 for a licence that is not allowed', () => {
    const result = runCheck({ pathFolder, report: copyleft });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^copyleft@1\.0\.0 has the licence GPL-3\.0\.\n/);
    assert.match(result.stderr, /Allow a package only with a recorded exception in this script\./);
  });

  it('still checks when node starts the script through a symbolic link', () => {
    const link = join(newFolder(), 'link.mjs');
    symlinkSync(SCRIPT, link);
    const result = runCheck({ pathFolder, report: copyleft, script: link });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /copyleft@1\.0\.0 has the licence GPL-3\.0\./);
  });

  it('does not run its command when another module imports it', () => {
    const url = new URL('./check-licences.mjs', import.meta.url).href;
    const code = `await import(${JSON.stringify(url)});`;
    const env = { PATH: pathFolder, FAKE_PNPM_OUTPUT: JSON.stringify(copyleft) };
    assert.deepEqual(runNode(['--input-type=module', '-e', code], env), {
      status: 0,
      stdout: '',
      stderr: '',
    });
  });

  it('asks for pnpm install when the report is empty', () => {
    const result = runCheck({ pathFolder, report: {} });
    assert.equal(result.status, 1);
    assert.equal(result.stderr, 'pnpm cannot list the licences. Run pnpm install first.\n');
  });

  it('asks for pnpm install when every licence is Unknown', () => {
    const report = { Unknown: [{ name: 'a', versions: ['1.0.0'] }] };
    const result = runCheck({ pathFolder, report });
    assert.equal(result.status, 1);
    assert.equal(result.stderr, 'pnpm cannot list the licences. Run pnpm install first.\n');
  });

  it('prints the error of pnpm when pnpm fails, and does not ask for pnpm install', () => {
    const pnpmError = 'ERR_PNPM_BROKEN_LOCKFILE  The lockfile is broken.';
    const result = runCheck({ pathFolder, pnpmError, pnpmStatus: 3 });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(pnpmError), result.stderr);
    assert.ok(result.stderr.includes('pnpm licenses list exited with the code 3.'), result.stderr);
    assert.ok(!result.stderr.includes('pnpm install'), result.stderr);
  });

  it('says that pnpm is missing when no pnpm is on the PATH', () => {
    const result = runCheck({ pathFolder: newFolder(), report: {} });
    assert.equal(result.status, 1);
    assert.equal(result.stderr, 'Cannot start pnpm. Enable it with corepack enable.\n');
  });
});

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Starts the two linters that CI runs on a commit message, with the real config of the repo, so
// that a test can show what each one says about a message.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const COMMITLINT = fileURLToPath(import.meta.resolve('@commitlint/cli/cli.js'));
const CHECK_TELLS = fileURLToPath(new URL('../spec/scripts/check-tells', import.meta.url));

/**
 * Lints a message with commitlint, from the root of the repo so that it finds the config.
 *
 * @param message - The whole message, with a line feed at the end.
 * @returns The exit status of commitlint and the text that it printed.
 */
export function lintMessage(message) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [COMMITLINT], {
    cwd: ROOT,
    input: message,
    encoding: 'utf8',
  });
  return { status, output: stdout + stderr };
}

// check-tells reads a message from a file, so each call writes one into a folder of its own.
function runCheckTells(mode, message) {
  const folder = mkdtempSync(join(tmpdir(), 'message-linters-'));
  try {
    const file = join(folder, 'message');
    writeFileSync(file, message);
    const { status, stdout, stderr } = spawnSync('python3', [CHECK_TELLS, mode, file], {
      encoding: 'utf8',
    });
    return { status, output: stdout + stderr };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

// The commits job runs the commit mode on each commit. The pull request job runs the squash mode.
export const checkCommitMessage = (message) => runCheckTells('--commit-msg', message);
export const checkSquashMessage = (message) => runCheckTells('--squash-msg', message);

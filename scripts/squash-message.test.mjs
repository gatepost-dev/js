// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { after, describe, it } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { buildSquashMessage } from './squash-message.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = fileURLToPath(new URL('./squash-message.mjs', import.meta.url));
const COMMITLINT = fileURLToPath(import.meta.resolve('@commitlint/cli/cli.js'));
const CHECK_TELLS = fileURLToPath(new URL('../spec/scripts/check-tells', import.meta.url));
const RENOVATE_CONFIG = fileURLToPath(new URL('../renovate.json', import.meta.url));
const SIGN_OFF = 'Signed-off-by: A Contributor <contributor@example.org>';
const TITLE = 'fix(core): reject a unit of 00';
const BODY = `The unit rule needs a check.\n\n${SIGN_OFF}`;
// Renovate ends its body with this comment. The payload holds each character of base64.
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const RENOVATE_COMMENT = `<!--renovate-debug:${BASE64}==-->`;

const folders = [];

after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

function lintMessage(message) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [COMMITLINT], {
    cwd: ROOT,
    input: message,
    encoding: 'utf8',
  });
  return { status, output: stdout + stderr };
}

function checkTells(message) {
  const folder = mkdtempSync(join(tmpdir(), 'squash-message-'));
  folders.push(folder);
  const file = join(folder, 'message');
  writeFileSync(file, message);
  const { status, stdout, stderr } = spawnSync('python3', [CHECK_TELLS, '--commit-msg', file], {
    encoding: 'utf8',
  });
  return { status, output: stdout + stderr };
}

function runScript(env, script = SCRIPT) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
  return { status, stdout, stderr };
}

describe('buildSquashMessage', () => {
  it('joins the title, the number and the body as GitHub does', () => {
    const message = buildSquashMessage({ title: TITLE, number: 12, body: BODY });
    assert.equal(message, `${TITLE} (#12)\n\n${BODY}\n`);
  });

  it('writes only the subject for an empty body', () => {
    assert.equal(buildSquashMessage({ title: TITLE, number: 12, body: '' }), `${TITLE} (#12)\n`);
  });

  it('turns the line breaks of a web form into line feeds', () => {
    const body = 'First line.\r\n\r\nSecond line.\r\n\r\nSigned-off-by: A <a@example.org>\r\n';
    const message = buildSquashMessage({ title: TITLE, number: 3, body });
    assert.equal(
      message,
      `${TITLE} (#3)\n\nFirst line.\n\nSecond line.\n\nSigned-off-by: A <a@example.org>\n`,
    );
  });

  it('drops the white space around the title and the body', () => {
    const message = buildSquashMessage({
      title: `  ${TITLE}  `,
      number: 3,
      body: `\n\n${BODY}\n\n`,
    });
    assert.equal(message, `${TITLE} (#3)\n\n${BODY}\n`);
  });

  it('drops the comment that Renovate adds to the end of its body', () => {
    const body = `${BODY}\n${RENOVATE_COMMENT}\n`;
    const message = buildSquashMessage({ title: TITLE, number: 12, body });
    assert.equal(message, `${TITLE} (#12)\n\n${BODY}\n`);
  });

  it('keeps the comment of Renovate when text follows it', () => {
    const body = `${RENOVATE_COMMENT}\n\n${BODY}`;
    const message = buildSquashMessage({ title: TITLE, number: 12, body });
    assert.equal(message, `${TITLE} (#12)\n\n${body}\n`);
  });

  it('keeps a comment that starts like the one of Renovate but holds other text', () => {
    const body = `${BODY}\n<!--renovate-debug: Text that is not base64. -->`;
    const message = buildSquashMessage({ title: TITLE, number: 12, body });
    assert.equal(message, `${TITLE} (#12)\n\n${body}\n`);
  });

  it('keeps any other comment, as GitHub keeps it in the message', () => {
    const body = `<!--\nWrite two sentences.\n-->\n\nThe unit rule needs a check.\n\n${SIGN_OFF}`;
    const message = buildSquashMessage({ title: TITLE, number: 12, body });
    assert.equal(message, `${TITLE} (#12)\n\n${body}\n`);
  });

  it('keeps text that holds a comment inside a comment, so that no fragment is left over', () => {
    const body = `<!<!-- x -->-- y -->\n\n${BODY}`;
    const message = buildSquashMessage({ title: TITLE, number: 12, body });
    assert.equal(message, `${TITLE} (#12)\n\n${body}\n`);
  });

  it('looks for the template address inside a comment too', () => {
    const body = `<!-- Signed-off-by: Your Name <you@example.com> -->\n\n${SIGN_OFF}`;
    assert.throws(() => buildSquashMessage({ title: TITLE, number: 12, body }), /template address/);
  });

  for (const address of ['you@example.com', 'You@Example.COM']) {
    it(`rejects a body that still holds the template address ${address}`, () => {
      const body = `Two sentences.\n\nCloses #\n\nSigned-off-by: Your Name <${address}>`;
      assert.throws(
        () => buildSquashMessage({ title: TITLE, number: 12, body }),
        /still holds the template address you@example\.com/i,
      );
    });
  }

  it('accepts another address at example.com', () => {
    const body = 'Signed-off-by: A Contributor <contributor@example.com>';
    assert.ok(buildSquashMessage({ title: TITLE, number: 12, body }).endsWith(`${body}\n`));
  });
});

describe('the squash message and commitlint', () => {
  it('passes for a signed pull request', () => {
    const message = buildSquashMessage({ title: TITLE, number: 12, body: BODY });
    assert.deepEqual(lintMessage(message), { status: 0, output: '' });
  });

  it('fails for a pull request with no sign-off in its body', () => {
    const message = buildSquashMessage({ title: TITLE, number: 12, body: 'No sign-off.' });
    const { status, output } = lintMessage(message);
    assert.equal(status, 1);
    assert.ok(output.includes('[signed-off-by]'), output);
  });

  it('fails when the suffix pushes a title of 72 characters past the limit', () => {
    const title = `fix(core): ${'a'.repeat(61)}`;
    assert.equal(title.length, 72);
    assert.equal(lintMessage(`${title}\n\n${SIGN_OFF}\n`).status, 0);
    const { status, output } = lintMessage(
      buildSquashMessage({ title, number: 12, body: SIGN_OFF }),
    );
    assert.equal(status, 1);
    assert.ok(output.includes('[header-max-length]'), output);
  });

  it('fails when a comment follows the sign-off line, because the sign-off must come last', () => {
    const body = `${BODY}\n<!-- Text that GitHub keeps in the message. -->`;
    const { status, output } = lintMessage(buildSquashMessage({ title: TITLE, number: 12, body }));
    assert.equal(status, 1);
    assert.ok(output.includes('[signed-off-by]'), output);
  });
});

describe('the squash message and check-tells', () => {
  it('passes for a signed pull request', () => {
    const message = buildSquashMessage({ title: TITLE, number: 12, body: BODY });
    assert.deepEqual(checkTells(message), { status: 0, output: '' });
  });

  it('finds a non-ASCII character in a comment before the sign-off line', () => {
    const dash = String.fromCodePoint(0x2013);
    const body = `<!-- A dash ${dash} that a reader of the page does not see. -->\n\n${BODY}`;
    const { status, output } = checkTells(buildSquashMessage({ title: TITLE, number: 12, body }));
    assert.equal(status, 1);
    assert.ok(output.includes('TELL-14'), output);
  });
});

describe('squash-message.mjs as a command', () => {
  const env = { PR_TITLE: TITLE, PR_NUMBER: '12', PR_BODY: BODY };

  it('prints the message from the environment', () => {
    assert.deepEqual(runScript(env), {
      status: 0,
      stdout: `${TITLE} (#12)\n\n${BODY}\n`,
      stderr: '',
    });
  });

  it('prints only the subject when the body is not set', () => {
    const printed = runScript({ PR_TITLE: TITLE, PR_NUMBER: '12' });
    assert.deepEqual(printed, { status: 0, stdout: `${TITLE} (#12)\n`, stderr: '' });
  });

  it('runs through a symbolic link, as a runner may start it', () => {
    const folder = mkdtempSync(join(tmpdir(), 'squash-message-'));
    folders.push(folder);
    const link = join(folder, 'link.mjs');
    symlinkSync(SCRIPT, link);
    assert.equal(runScript(env, link).stdout, `${TITLE} (#12)\n\n${BODY}\n`);
  });

  it('fails and prints nothing for a body with the template address', () => {
    const body = 'Signed-off-by: Your Name <you@example.com>';
    const { status, stdout, stderr } = runScript({ ...env, PR_BODY: body });
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /still holds the template address you@example\.com/);
  });

  it('fails when the title or the number is missing', () => {
    for (const missing of ['PR_TITLE', 'PR_NUMBER']) {
      const rest = Object.entries(env).filter(([name]) => name !== missing);
      const { status, stdout, stderr } = runScript(Object.fromEntries(rest));
      assert.equal(status, 2);
      assert.equal(stdout, '');
      assert.equal(stderr, `Set ${missing}.\n`);
    }
  });
});

describe('the Renovate config', () => {
  const config = JSON.parse(readFileSync(RENOVATE_CONFIG, 'utf8'));
  const title = 'chore(deps): update eslint to v10.12.0';

  it('asks for the weekly schedule, digest pins for actions and the scope deps', () => {
    assert.ok(config.extends.includes('schedule:weekly'));
    assert.ok(config.extends.includes('helpers:pinGitHubActionDigests'));
    assert.equal(config.semanticCommits, 'enabled');
    assert.equal(config.semanticCommitScope, 'deps');
  });

  it('writes a pull request body that passes the checks of the pull request job', () => {
    assert.ok(!config.prBodyTemplate.includes('{{'), 'The test reads the template as the body.');
    // Renovate ends each pull request body with a hidden comment.
    const body = `${config.prBodyTemplate}\n${RENOVATE_COMMENT}\n`;
    const message = buildSquashMessage({ title, number: 25, body });
    assert.deepEqual(lintMessage(message), { status: 0, output: '' });
    assert.deepEqual(checkTells(message), { status: 0, output: '' });
  });

  it('writes a commit message that passes the checks of each commit', () => {
    const message = `${title}\n\n${config.commitBody}\n`;
    assert.deepEqual(lintMessage(message), { status: 0, output: '' });
    assert.deepEqual(checkTells(message), { status: 0, output: '' });
  });
});

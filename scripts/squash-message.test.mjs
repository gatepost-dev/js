// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { after, describe, it } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { checkSquashMessage, lintMessage } from './message-linters.mjs';
import { buildSquashMessage } from './squash-message.mjs';

const SCRIPT = fileURLToPath(new URL('./squash-message.mjs', import.meta.url));
const SIGN_OFF = 'Signed-off-by: A Contributor <contributor@example.org>';
const TITLE = 'fix(core): reject a unit of 00';
const BODY = `The unit rule needs a check.\n\n${SIGN_OFF}`;
// Renovate ends its body with this comment. The payload holds each character of base64.
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const RENOVATE_COMMENT = `<!--renovate-debug:${BASE64}==-->`;
// White space outside ASCII. The pattern \s and the method trim remove most of these characters,
// so check-tells would never see them, although GitHub can keep them in the message.
const UNICODE_SPACES = [0x3000, 0x2028, 0x00a0, 0x0085, 0x2003].map((codePoint) => ({
  name: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
  character: String.fromCodePoint(codePoint),
}));

const folders = [];

after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

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

  it('drops each ASCII white space character around the title and the body', () => {
    for (const space of [' ', '\t', '\r', '\n']) {
      const title = `${space}${TITLE}${space}`;
      const message = buildSquashMessage({ title, number: 3, body: `${space}${BODY}${space}` });
      assert.equal(message, `${TITLE} (#3)\n\n${BODY}\n`, JSON.stringify(space));
    }
  });

  it('keeps a Unicode white space character at the start and at the end of the title', () => {
    for (const { name, character } of UNICODE_SPACES) {
      for (const title of [`${character}${TITLE}`, `${TITLE}${character}`]) {
        const message = buildSquashMessage({ title, number: 3, body: BODY });
        assert.equal(message, `${title} (#3)\n\n${BODY}\n`, name);
      }
    }
  });

  it('keeps a Unicode white space character at the start and at the end of the body', () => {
    for (const { name, character } of UNICODE_SPACES) {
      for (const body of [`${character}${BODY}`, `${BODY}${character}`]) {
        const message = buildSquashMessage({ title: TITLE, number: 3, body });
        assert.equal(message, `${TITLE} (#3)\n\n${body}\n`, name);
      }
    }
  });

  it('drops the comment that Renovate adds to the end of its body', () => {
    const body = `${BODY}\n${RENOVATE_COMMENT}\n`;
    const message = buildSquashMessage({ title: TITLE, number: 12, body });
    assert.equal(message, `${TITLE} (#12)\n\n${BODY}\n`);
  });

  it('drops the ASCII white space after the comment that Renovate adds', () => {
    const body = `${BODY}\n${RENOVATE_COMMENT} \t\r\n\n`;
    const message = buildSquashMessage({ title: TITLE, number: 12, body });
    assert.equal(message, `${TITLE} (#12)\n\n${BODY}\n`);
  });

  it('keeps a Unicode white space character after the comment of Renovate', () => {
    for (const { name, character } of UNICODE_SPACES) {
      const body = `${BODY}\n${RENOVATE_COMMENT}${character}`;
      const message = buildSquashMessage({ title: TITLE, number: 12, body });
      assert.equal(message, `${TITLE} (#12)\n\n${body}\n`, name);
    }
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

  it('leaves the placeholder of the template for check-tells to find', () => {
    const body = 'Signed-off-by: Your Name <you@example.com>';
    const message = buildSquashMessage({ title: TITLE, number: 12, body });
    assert.equal(message, `${TITLE} (#12)\n\n${body}\n`);
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

describe('the squash message and the squash mode of check-tells', () => {
  const build = (body) => buildSquashMessage({ title: TITLE, number: 12, body });
  const TEMPLATE_PARAGRAPH =
    'Write two or three sentences of plain prose that say what this change does and why.';

  it('passes for a signed pull request', () => {
    assert.deepEqual(checkSquashMessage(build(BODY)), { status: 0, output: '' });
  });

  it('finds a non-ASCII character in a comment before the sign-off line', () => {
    const dash = String.fromCodePoint(0x2013);
    const body = `<!-- A dash ${dash} that a reader of the page does not see. -->\n\n${BODY}`;
    const { status, output } = checkSquashMessage(build(body));
    assert.equal(status, 1);
    assert.ok(output.includes('TELL-14'), output);
  });

  // A commit message takes such a line for a git comment. A squash message has no comments.
  it('finds a non-ASCII character in a body line that starts with #', () => {
    const dash = String.fromCodePoint(0x2013);
    const { status, output } = checkSquashMessage(
      build(`# A dash ${dash} in a heading\n\n${BODY}`),
    );
    assert.equal(status, 1);
    assert.ok(output.includes('TELL-14'), output);
  });

  it('finds the placeholder address of the template in the sign-off line', () => {
    const { status, output } = checkSquashMessage(
      build('Two sentences.\n\nSigned-off-by: Your Name <you@example.com>'),
    );
    assert.equal(status, 1);
    assert.ok(output.includes('GIT-2'), output);
  });

  it('finds a sign-off line with no address, which commitlint accepts', () => {
    const message = build('Two sentences.\n\nSigned-off-by: A Contributor');
    assert.equal(lintMessage(message).status, 0);
    const { status, output } = checkSquashMessage(message);
    assert.equal(status, 1);
    assert.ok(output.includes('GIT-2'), output);
  });

  it('finds the paragraph and the Closes line that the template leaves for the author', () => {
    const { status, output } = checkSquashMessage(
      build(`${TEMPLATE_PARAGRAPH}\n\nCloses #\n\n${SIGN_OFF}`),
    );
    assert.equal(status, 1);
    assert.equal(output.match(/TELL-18/g)?.length, 2, output);
  });
});

describe('the pull request job on a body that ends with the comment of Renovate', () => {
  const build = (end) =>
    buildSquashMessage({ title: TITLE, number: 12, body: `${BODY}\n${RENOVATE_COMMENT}${end}` });

  it('passes commitlint and check-tells', () => {
    const message = build('');
    assert.deepEqual(lintMessage(message), { status: 0, output: '' });
    assert.deepEqual(checkSquashMessage(message), { status: 0, output: '' });
  });

  it('fails commitlint and check-tells when U+3000 follows the comment', () => {
    const message = build(String.fromCodePoint(0x3000));
    const linted = lintMessage(message);
    assert.equal(linted.status, 1);
    assert.ok(linted.output.includes('[signed-off-by]'), linted.output);
    const checked = checkSquashMessage(message);
    assert.equal(checked.status, 1);
    assert.ok(checked.output.includes('TELL-14'), checked.output);
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

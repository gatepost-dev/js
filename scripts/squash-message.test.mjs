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
import commitlintConfig from '../commitlint.config.js';
import { buildSquashMessage } from './squash-message.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = fileURLToPath(new URL('./squash-message.mjs', import.meta.url));
const COMMITLINT = fileURLToPath(import.meta.resolve('@commitlint/cli/cli.js'));
const CHECK_TELLS = fileURLToPath(new URL('../spec/scripts/check-tells', import.meta.url));
const RENOVATE_CONFIG = fileURLToPath(new URL('../renovate.json', import.meta.url));
const PACKAGE_FILES = ['../package.json', '../packages/core/package.json'].map((path) =>
  fileURLToPath(new URL(path, import.meta.url)),
);
const SIGN_OFF = 'Signed-off-by: A Contributor <contributor@example.org>';
// The name and the address that the hosted Renovate app uses as the author of its commits.
const RENOVATE_IDENTITY = 'renovate[bot] <29139614+renovate[bot]@users.noreply.github.com>';
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

function runCheckTells(mode, message) {
  const folder = mkdtempSync(join(tmpdir(), 'squash-message-'));
  folders.push(folder);
  const file = join(folder, 'message');
  writeFileSync(file, message);
  const { status, stdout, stderr } = spawnSync('python3', [CHECK_TELLS, mode, file], {
    encoding: 'utf8',
  });
  return { status, output: stdout + stderr };
}

// The commits job runs the commit mode on each commit. The pull request job runs the squash mode.
const checkCommitMessage = (message) => runCheckTells('--commit-msg', message);
const checkSquashMessage = (message) => runCheckTells('--squash-msg', message);

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

describe('the Renovate config', () => {
  const config = JSON.parse(readFileSync(RENOVATE_CONFIG, 'utf8'));
  const title = 'chore(deps): update eslint to v10.12.0';

  it('asks for the weekly schedule, digest pins for actions and the scope deps', () => {
    assert.ok(config.extends.includes('schedule:weekly'));
    assert.ok(config.extends.includes('helpers:pinGitHubActionDigests'));
    assert.equal(config.semanticCommits, 'enabled');
    assert.equal(config.semanticCommitScope, 'deps');
  });

  it('signs off each commit with the preset that Renovate ships for it', () => {
    assert.ok(config.extends.includes(':gitSignOff'));
  });

  // Renovate renders the template with the sections of the body. Only the header holds text here.
  // Renovate also ends each body with a hidden comment.
  function renderBody() {
    const text = config.prBodyTemplate.replace('{{{header}}}', `${config.prHeader}\n\n`).trim();
    assert.ok(!text.includes('{{'), 'The test renders only the section header.');
    return `${text}\n${RENOVATE_COMMENT}\n`;
  }

  it('writes a pull request body that passes the checks of the pull request job', () => {
    const message = buildSquashMessage({ title, number: 25, body: renderBody() });
    assert.deepEqual(lintMessage(message), { status: 0, output: '' });
    assert.deepEqual(checkSquashMessage(message), { status: 0, output: '' });
  });

  it('ends the pull request body with the sign-off of the app that commits', () => {
    assert.equal(config.prHeader, `Signed-off-by: ${RENOVATE_IDENTITY}`);
    assert.ok(config.prBodyTemplate.endsWith('{{{header}}}'));
  });

  it('writes a commit message that passes the checks of each commit', () => {
    // The preset adds the author of the commit as a trailer.
    const message = `${title}\n\nSigned-off-by: ${RENOVATE_IDENTITY}\n`;
    assert.deepEqual(lintMessage(message), { status: 0, output: '' });
    assert.deepEqual(checkCommitMessage(message), { status: 0, output: '' });
  });

  it('keeps the title of each dependency update, with its suffix, within the header limit', () => {
    const limit = commitlintConfig.rules['header-max-length'][2];
    const names = PACKAGE_FILES.flatMap((file) => {
      const { dependencies, devDependencies } = JSON.parse(readFileSync(file, 'utf8'));
      return [...Object.keys(dependencies ?? {}), ...Object.keys(devDependencies ?? {})];
    });
    assert.ok(names.length > 0, 'The test found no dependency.');
    for (const name of names) {
      const rule = config.packageRules?.findLast(
        ({ matchPackageNames, commitMessageTopic }) =>
          commitMessageTopic !== undefined && matchPackageNames?.includes(name),
      );
      const topic = (rule?.commitMessageTopic ?? config.commitMessageTopic).replace(
        '{{depName}}',
        name,
      );
      const type = `${config.semanticCommitType}(${config.semanticCommitScope})`;
      const header = `${type}: update ${topic} to v10.12.0 (#25)`;
      assert.ok(header.length <= limit, `${header} has ${header.length} characters, not ${limit}.`);
    }
  });

  it('holds typescript below 6.1 and @types/node on its major, and gives the reason', () => {
    const ruleFor = (name) =>
      config.packageRules?.find(({ matchPackageNames }) => matchPackageNames?.includes(name));
    const reasonOf = (rule) => rule?.description?.join(' ') ?? '';
    const typescript = ruleFor('typescript');
    const nodeTypes = ruleFor('@types/node');
    assert.equal(typescript?.allowedVersions, '<6.1');
    assert.deepEqual(nodeTypes?.matchUpdateTypes, ['major']);
    assert.equal(nodeTypes?.enabled, false);
    // Each reason names the update that its rule holds. A hold below 6.1 also stops a minor update.
    assert.match(reasonOf(typescript), /standards.*update to 6\.1 or later.*standards/);
    assert.match(reasonOf(nodeTypes), /standards.*major update.*standards/);
  });

  // Renovate applies each match string to the whole file, and each match is one dependency.
  function findPins(text) {
    return (config.customManagers ?? []).flatMap(({ matchStrings }) =>
      matchStrings.flatMap((pattern) =>
        Array.from(text.matchAll(new RegExp(pattern, 'g')), ({ groups }) => groups),
      ),
    );
  }

  it('finds the tools that scripts start with uvx, and their whole versions', () => {
    const found = findPins(readFileSync(PACKAGE_FILES[0], 'utf8'));
    assert.deepEqual(found.map(({ depName }) => depName).toSorted(), [
      'charset-normalizer',
      'reuse',
      'zizmor',
    ]);
    for (const { depName, currentValue } of found) {
      assert.match(currentValue, /^\d+\.\d+\.\d+$/, `The version of ${depName} is not whole.`);
    }
    assert.ok(
      config.customManagers.every(({ datasourceTemplate }) => datasourceTemplate === 'pypi'),
    );
  });

  it('stops a version at the end of the script string, and not after the quote', () => {
    const scripts = '"one": "uvx --with extra==4.5.6 tool@1.2.3", "two": "uvx other@7.8.9"';
    const found = findPins(scripts).map(
      ({ depName, currentValue }) => `${depName} ${currentValue}`,
    );
    assert.deepEqual(found.toSorted(), ['extra 4.5.6', 'other 7.8.9', 'tool 1.2.3']);
  });
});

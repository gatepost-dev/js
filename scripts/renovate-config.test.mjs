// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import commitlintConfig from '../commitlint.config.js';
import { checkCommitMessage, checkSquashMessage, lintMessage } from './message-linters.mjs';
import { buildSquashMessage } from './squash-message.mjs';

const RENOVATE_CONFIG = fileURLToPath(new URL('../renovate.json', import.meta.url));
const PACKAGE_FILES = ['../package.json', '../packages/core/package.json'].map((path) =>
  fileURLToPath(new URL(path, import.meta.url)),
);
// The name and the address that the hosted Renovate app uses as the author of its commits.
const RENOVATE_IDENTITY = 'renovate[bot] <29139614+renovate[bot]@users.noreply.github.com>';
// Renovate ends each pull request body with a hidden comment. It holds the debug data of the
// pull request as base64 text of a JSON object.
const DEBUG_DATA = { createdInVer: '44.132.2', updatedInVer: '44.132.2', targetBranch: 'main' };
const DEBUG_PAYLOAD = Buffer.from(JSON.stringify(DEBUG_DATA)).toString('base64');
const RENOVATE_COMMENT = `<!--renovate-debug:${DEBUG_PAYLOAD}-->`;

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

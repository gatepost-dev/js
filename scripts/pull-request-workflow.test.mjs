// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// A squash merge writes the title and the body of the pull request on main. An edit of either one
// pushes no commit, so the workflow that lints them must start on an edit.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const WORKFLOWS = fileURLToPath(new URL('../.github/workflows/', import.meta.url));
// A list of types replaces the default ones, so it names opened, reopened and synchronize too.
const TYPES = ['edited', 'opened', 'reopened', 'synchronize'];

const builders = readdirSync(WORKFLOWS)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => ({ name, text: readFileSync(join(WORKFLOWS, name), 'utf8') }))
  .filter(({ text }) => text.includes('scripts/squash-message.mjs'));

function pullRequestTypes(text) {
  const listed = /^ {2}pull_request:\n {4}types: \[(?<types>[^\]]*)\]$/m.exec(text);
  return listed === null ? [] : listed.groups.types.split(',').map((type) => type.trim());
}

describe('the workflow that builds the squash message', () => {
  it('is one file', () => {
    assert.equal(builders.length, 1, builders.map(({ name }) => name).join(', '));
  });

  it('runs when a pull request opens, reopens, gets a push or gets a new title or body', () => {
    for (const { name, text } of builders) {
      const reason = `${name} must give pull_request a flow list of the types ${TYPES.join(', ')}.`;
      assert.deepEqual(pullRequestTypes(text).toSorted(), TYPES, reason);
    }
  });

  // The commit mode takes a body line that starts with # for a git comment, and it checks neither
  // the sign-off nor the text of the pull request template. The squash mode does all three.
  it('checks the message in the squash mode of check-tells, and not in the commit mode', () => {
    for (const { name, text } of builders) {
      assert.match(text, /check-tells --squash-msg /, `${name} must run check-tells --squash-msg.`);
      assert.doesNotMatch(text, /check-tells --commit-msg/, `${name} must not use --commit-msg.`);
    }
  });

  it('is not ci.yml, so that an edit does not start the other jobs', () => {
    assert.deepEqual(
      builders.map(({ name }) => name).filter((name) => name === 'ci.yml'),
      [],
    );
  });

  it('cancels the older run of a pull request when a newer one starts', () => {
    for (const { name, text } of builders) {
      assert.match(text, /^concurrency:\n {2}group: .*github\.event\.pull_request\.number/m, name);
      assert.match(text, /^ {2}cancel-in-progress: true$/m, name);
    }
  });
});

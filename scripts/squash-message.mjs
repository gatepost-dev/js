// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Prints the message that GitHub writes when it squash-merges a pull request: the title and
// " (#N)" as the subject, and the body of the pull request as the body. Only this message reaches
// main, so CI lints it (GIT-1 and GIT-2). The environment holds the title, the number and the
// body in PR_TITLE, PR_NUMBER and PR_BODY, because text from a pull request must never sit
// inside a command line.
import process from 'node:process';
import { isMainModule } from './main-module.mjs';

// The pull request template holds this address in its Signed-off-by line.
const TEMPLATE_ADDRESS = 'you@example.com';
// An HTML comment is not text that a reader sees. Renovate ends each pull request body with one,
// and a template can hold instructions in them, so the check leaves them out.
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/**
 * Builds the squash message of a pull request.
 *
 * @param pullRequest - The `title`, the `number` and the `body`. The body can be empty.
 * @returns The message, with a line feed at the end.
 */
export function buildSquashMessage({ title, number, body }) {
  const text = body.replaceAll('\r\n', '\n').replace(HTML_COMMENT, '').trim();
  if (text.toLowerCase().includes(TEMPLATE_ADDRESS)) {
    const problem = `The pull request body still holds the template address ${TEMPLATE_ADDRESS}.`;
    throw new Error(`${problem} Write your own name and address in the Signed-off-by line.`);
  }
  const subject = `${title.trim()} (#${number})`;
  return text === '' ? `${subject}\n` : `${subject}\n\n${text}\n`;
}

function main() {
  const { PR_TITLE: title, PR_NUMBER: number, PR_BODY: body = '' } = process.env;
  const missing = ['PR_TITLE', 'PR_NUMBER'].find((name) => !process.env[name]);
  if (missing !== undefined) {
    process.stderr.write(`Set ${missing}.\n`);
    process.exitCode = 2;
    return;
  }
  try {
    process.stdout.write(buildSquashMessage({ title, number, body }));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}

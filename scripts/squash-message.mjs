// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Prints the message that GitHub writes when it squash-merges a pull request: the title and
// " (#N)" as the subject, and the body of the pull request as the body. Only this message reaches
// main, so CI lints it (GIT-1 and GIT-2) with commitlint and with check-tells in its squash mode.
// This script builds the message and judges nothing. The environment holds the title, the number
// and the body in PR_TITLE, PR_NUMBER and PR_BODY, because text from a pull request must never
// sit inside a command line.
import process from 'node:process';
import { isMainModule } from './main-module.mjs';

// Renovate ends each pull request body with this hidden comment, after the sign-off line, and
// GitHub keeps it in the squash message. It is the only text that the check leaves out, so the
// rest is linted as it will merge. Only ASCII white space may follow the comment, because \s also
// matches characters such as U+3000, and check-tells must see those (TELL-14).
const RENOVATE_COMMENT = /<!--renovate-debug:[A-Za-z0-9+/=]*-->[ \t\r\n]*$/;
const ASCII_WHITE_SPACE = ' \t\r\n';

// The method trim also removes U+3000 and similar characters, and check-tells must see those. A
// loop does the job, because a pattern for the end of a run of white space takes quadratic time,
// and the body of a pull request can hold tens of thousands of spaces.
function trimAscii(text) {
  let start = 0;
  let end = text.length;
  while (start < end && ASCII_WHITE_SPACE.includes(text.charAt(start))) {
    start += 1;
  }
  while (end > start && ASCII_WHITE_SPACE.includes(text.charAt(end - 1))) {
    end -= 1;
  }
  return text.slice(start, end);
}

/**
 * Builds the squash message of a pull request.
 *
 * @param pullRequest - The `title`, the `number` and the `body`. The body can be empty. The
 * message leaves out the hidden comment that Renovate adds to the end of a body, and it trims
 * ASCII white space (space, tab, carriage return and line feed) around the title and the body. It
 * keeps every other white space character, such as U+3000, so that check-tells can reject it.
 * @returns The message, with a line feed at the end.
 */
export function buildSquashMessage({ title, number, body }) {
  const text = trimAscii(body.replaceAll('\r\n', '\n').replace(RENOVATE_COMMENT, ''));
  const subject = `${trimAscii(title)} (#${number})`;
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
  process.stdout.write(buildSquashMessage({ title, number, body }));
}

if (isMainModule(import.meta.url)) {
  main();
}

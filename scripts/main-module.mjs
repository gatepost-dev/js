// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Tells whether node started the module as the program, so that a script runs its command only
 * then and tests can import its functions. A runner can start a script through a symbolic link,
 * so both paths go through `realpathSync`. `import.meta.main` does the same job, but Node 22
 * has it only from 22.18.
 *
 * @param moduleUrl - The `import.meta.url` of the module.
 * @returns True when the program is the module.
 */
export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  return entry !== undefined && realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl));
}

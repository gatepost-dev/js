// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// The mock server is a dev tool that runs on Node, so the lint config lets its source use Node.
// The other rules stay, such as TS-12 on console calls. This file has its own process, because
// typescript-eslint keeps one project service for each process, and eslint-config.test.mjs
// sets that service up for the core package.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { ESLint } from 'eslint';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_FILE = 'packages/mock-server/src/probe.ts';

// The file does not exist. The project service lints it with the options of the package.
const eslint = new ESLint({
  cwd: ROOT,
  overrideConfig: {
    files: ['packages/mock-server/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [SOURCE_FILE],
          defaultProject: 'packages/mock-server/tsconfig.json',
        },
      },
    },
  },
});

async function ruleIds(...rows) {
  const [report] = await eslint.lintText(`${rows.join('\n')}\n`, { filePath: SOURCE_FILE });
  return report.messages.map((reported) => reported.ruleId);
}

describe('the lint config in the mock server', () => {
  it('allows a Node module and the process global', async () => {
    const found = await ruleIds(
      "import { createServer, type Server } from 'node:http';",
      "import process from 'node:process';",
      '/** The server, on the port that PORT names. */',
      'export const server: Server = createServer().listen(Number(process.env.PORT));',
    );
    assert.deepEqual(found, []);
  });

  it('allows the process global through globalThis', async () => {
    const found = await ruleIds(
      '/** The port that PORT names. */',
      'export const port: string | undefined = globalThis.process.env.PORT;',
    );
    assert.deepEqual(found, []);
  });

  it('still rejects a console call, as TS-12 says', async () => {
    const found = await ruleIds(
      '/** Says hello. */',
      'export function hello(): void {',
      "  console.info('hi');",
      '}',
    );
    assert.ok(found.includes('no-console'), JSON.stringify(found));
  });
});

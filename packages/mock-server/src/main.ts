// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import process from 'node:process';
import { startMockServer, type MockServerOptions } from './server.ts';

function wholeNumber(name: string, fallback: number): number {
  const raw = process.env[name] ?? '';
  const parsed = Number(raw);
  if (raw === '') {
    return fallback;
  }
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new RangeError(`${name} must be a whole number of 0 or more. It is ${raw}.`);
  }
  return parsed;
}

function optionsFromEnvironment(): MockServerOptions {
  const specDir = process.env['GATEPOST_SPEC_DIR'] ?? '';
  return {
    port: wholeNumber('PORT', 4010),
    host: process.env['HOST'] ?? '127.0.0.1',
    delayMs: wholeNumber('MOCK_DELAY_MS', 0),
    ...(specDir === '' ? {} : { specDir }),
  };
}

try {
  const server = await startMockServer(optionsFromEnvironment());
  process.stdout.write(`The Gatepost mock server listens on ${server.url}\n`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void server.close();
    });
  }
} catch (error: unknown) {
  // A bad setting or a broken spec file ends the program with a message and no stack trace.
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// These tests start src/main.ts as Node starts it in the container: with no build, through
// Node's type stripping. A syntax that Node cannot strip fails here.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

// Starts the command, calls `whileRunning` with its first line of output, then stops it.
async function run(
  env: Record<string, string>,
  whileRunning: (line: string) => Promise<void> = () => Promise.resolve(),
): Promise<Run> {
  const child = spawn(process.execPath, [MAIN], { env: { ...process.env, ...env } });
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exited = once(child, 'exit');
  const started = new Promise<void>((resolve) => {
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.includes('\n')) {
        resolve();
      }
    });
  });
  await Promise.race([started, exited]);
  if (stdout.includes('\n')) {
    await whileRunning(stdout.trim());
    child.kill('SIGTERM');
  }
  const [code] = (await exited) as [number | null];
  return { code, stdout, stderr };
}

describe('the mock server command', () => {
  it('serves on the port that PORT names, and stops on SIGTERM', async () => {
    let health = 0;
    const result = await run({ PORT: '0' }, async (line) => {
      const url = /http:\/\/\S+/.exec(line)?.[0] ?? '';
      health = (await fetch(`${url}/healthz`)).status;
    });
    expect(result.stdout).toMatch(
      /^The Gatepost mock server listens on http:\/\/127\.0\.0\.1:\d+\n$/,
    );
    expect([health, result.code, result.stderr]).toEqual([200, 0, '']);
  });

  it.each([
    ['PORT', 'abc'],
    ['MOCK_DELAY_MS', '-5'],
  ])('stops with exit code 2 when %s is %s', async (name, value) => {
    const result = await run({ PORT: '0', [name]: value });
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(`${name} must be a whole number of 0 or more. It is ${value}.\n`);
  });

  it('stops with exit code 2 when the spec folder does not exist', async () => {
    const result = await run({ PORT: '0', GATEPOST_SPEC_DIR: '/no/such/spec' });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('/no/such/spec/fixtures');
  });
});

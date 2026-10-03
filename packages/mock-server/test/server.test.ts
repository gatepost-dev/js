// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// These tests start the server on a free port of the loopback address, and call it with fetch.
// They cover what only a real connection shows: headers, delays, held and dropped connections.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startMockServer, type MockServer, type MockServerOptions } from '../src/index.ts';
import { FILES, SPEC_DIR } from './mock-request.ts';

const KEY = { 'X-API-Key': 'nipost_test_mock_l1' };
const servers: MockServer[] = [];
const folders: string[] = [];

async function start(options: MockServerOptions = {}): Promise<MockServer> {
  const server = await startMockServer({ port: 0, ...options });
  servers.push(server);
  return server;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true });
  }
});

interface FileResponse {
  readonly status?: number;
  readonly body?: unknown;
  readonly text?: string;
  readonly fixture?: string;
  readonly headers?: Record<string, string>;
  readonly hang?: true;
  readonly drop?: true;
}

const CONTRACT = join(SPEC_DIR, 'contract');
const contract = readdirSync(CONTRACT)
  .filter((name) => name.endsWith('.json'))
  .map(
    (name) =>
      JSON.parse(readFileSync(join(CONTRACT, name), 'utf8')) as {
        id: string;
        responses: FileResponse[];
      },
  );

// Checks the response that arrived against the spec file.
async function expectAnswer(answer: Response, spec: FileResponse): Promise<void> {
  const fixture = spec.fixture === undefined ? undefined : FILES.fixtures.get(spec.fixture);
  const text = await answer.text();
  expect(answer.status).toBe(fixture?.status ?? spec.status);
  expect(answer.headers.get('access-control-allow-origin')).toBe('*');
  for (const [name, value] of Object.entries(spec.headers ?? {})) {
    expect(answer.headers.get(name)).toBe(value);
  }
  if (spec.text !== undefined) {
    expect(text).toBe(spec.text);
    return;
  }
  expect(JSON.parse(text)).toEqual(fixture === undefined ? spec.body : fixture.body);
  expect(answer.headers.get('content-type')).toBe(
    spec.headers?.['Content-Type'] ?? 'application/json',
  );
}

// Asks for one response of a scenario. A hang and a drop give no response.
async function expectResponse(
  url: string,
  headers: Record<string, string>,
  spec: FileResponse,
): Promise<void> {
  const call = fetch(`${url}/v1/lookup?code=FC01Z99ZZ01`, {
    headers,
    signal: AbortSignal.timeout(spec.hang === true ? 150 : 5000),
  });
  if (spec.hang === true) {
    await expect(call).rejects.toThrow('timeout');
  } else if (spec.drop === true) {
    await expect(call).rejects.toThrow(TypeError);
  } else {
    await expectAnswer(await call, spec);
  }
}

describe('the contract scenarios over HTTP', () => {
  // A client that follows the contract sends one request for each response in the file, and
  // more requests get the last response again. The test sends one request more than that.
  it.each(contract)('sends the responses of $id, as the spec file lists them', async (scenario) => {
    const { url } = await start();
    const headers = { 'X-Scenario-Id': scenario.id, 'X-Scenario-Run': 'run-1' };
    for (const spec of [...scenario.responses, ...scenario.responses.slice(-1)]) {
      await expectResponse(url, headers, spec);
    }
  });

  it('refuses a request for a scenario that expects none', async () => {
    const { url } = await start();
    const headers = { 'X-Scenario-Id': 'lookup-invalid-input', 'X-Scenario-Run': 'run-1' };
    expect((await fetch(`${url}/v1/lookup`, { headers })).status).toBe(400);
  });

  it('keeps the place of each run apart over HTTP', async () => {
    const { url } = await start();
    const send = async (run: string | null): Promise<number> => {
      const headers: Record<string, string> = { 'X-Scenario-Id': 'lookup-retry-503' };
      if (run !== null) {
        headers['X-Scenario-Run'] = run;
      }
      return (await fetch(`${url}/v1/lookup`, { headers })).status;
    };
    expect([await send('a'), await send('b'), await send('a'), await send(null)]).toEqual([
      503, 503, 200, 400,
    ]);
  });
});

describe('the mock server', () => {
  it('answers with the gateway headers and a body that ends with a line feed', async () => {
    const { url } = await start();
    const response = await fetch(`${url}/v1/lookup?code=FC-01-Z99-ZZ-01`, { headers: KEY });
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('content-length')).toBe(String(text.length));
    expect(response.headers.get('x-ratelimit-remaining')).toBe('599');
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('allows the scenario headers in a browser preflight', async () => {
    const { url } = await start();
    const response = await fetch(`${url}/v1/lookup`, { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toContain('X-Scenario-Run');
  });

  it('reads the body of a POST request', async () => {
    const { url } = await start();
    const segments = { state: 'fc', lga: '1', district: 'z99', area: 'zz', unit: '1' };
    const response = await fetch(`${url}/v1/assembly/assemble`, {
      method: 'POST',
      headers: { ...KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(segments),
    });
    expect(await response.json()).toEqual({
      data: { compact: 'FC01Z99ZZ01', display: 'FC 01 Z99 ZZ 01', postcode: 'FC-01-Z99-ZZ-01' },
    });
  });

  it('plays a scenario for a request with the scenario headers', async () => {
    const { url } = await start();
    const headers = { 'X-Scenario-Id': 'lookup-retry-502', 'X-Scenario-Run': 'run-1' };
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      statuses.push((await fetch(`${url}/v1/lookup?code=FC01Z99ZZ01`, { headers })).status);
    }
    expect(statuses).toEqual([502, 200]);
  });

  it('closes the connection with no response for a drop', async () => {
    const { url } = await start();
    const headers = { 'X-Scenario-Id': 'lookup-network-error', 'X-Scenario-Run': 'run-1' };
    await expect(fetch(`${url}/v1/lookup`, { headers })).rejects.toThrow(TypeError);
  });

  it('holds an empty autocomplete until the client gives up, and still closes', async () => {
    const server = await start();
    const signal = AbortSignal.timeout(100);
    const call = fetch(`${server.url}/v1/search/autocomplete?q=`, { headers: KEY, signal });
    await expect(call).rejects.toThrow('The operation was aborted due to timeout');
  });

  it('closes while a request still waits for an answer', async () => {
    const server = await startMockServer({ port: 0 });
    const call = fetch(`${server.url}/v1/search/autocomplete?q=`, { headers: KEY });
    const failed = expect(call).rejects.toThrow(TypeError);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await server.close();
    await failed;
  });

  it('waits the extra delay before every response', async () => {
    const { url } = await start({ delayMs: 150 });
    const started = performance.now();
    await fetch(`${url}/healthz`);
    expect(performance.now() - started).toBeGreaterThanOrEqual(140);
  });

  it('answers 500 with the reason when a fixture is missing from the spec', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'gatepost-spec-'));
    folders.push(folder);
    for (const part of ['data', 'fixtures', 'contract']) {
      cpSync(join(SPEC_DIR, part), join(folder, part), { recursive: true });
    }
    rmSync(join(folder, 'fixtures/errors/unknown-path.json'));
    const { url } = await start({ specDir: folder });
    const response = await fetch(`${url}/v1/other`, { headers: KEY });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'mock_error', message: 'The spec has no fixture errors/unknown-path.' },
    });
  });

  it('gives a URL with localhost when it listens on every address', async () => {
    const { url } = await start({ host: '0.0.0.0' });
    expect(url).toMatch(/^http:\/\/localhost:\d+$/);
    expect((await fetch(`${url}/healthz`)).status).toBe(200);
  });

  it('lets close run twice', async () => {
    const server = await startMockServer({ port: 0 });
    await server.close();
    await expect(server.close()).resolves.toBeUndefined();
  });

  it('gives a URL with brackets for an IPv6 address', async () => {
    const { url } = await start({ host: '::1' });
    expect(url).toMatch(/^http:\/\/\[::1\]:\d+$/);
    expect((await fetch(`${url}/healthz`)).status).toBe(200);
  });

  it('gives a URL with localhost when it listens on every IPv6 address', async () => {
    const { url } = await start({ host: '::' });
    expect(url).toMatch(/^http:\/\/localhost:\d+$/);
  });
});

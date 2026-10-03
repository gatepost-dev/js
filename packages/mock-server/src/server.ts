// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createGateway } from './gateway.ts';
import { jsonReply, type MockRequest, type Reply } from './reply.ts';
import { createScenarioPlayer } from './scenarios.ts';
import { readSpecFiles } from './spec-files.ts';

/** Options for {@link startMockServer}. */
export interface MockServerOptions {
  /** The port. 0 picks a free port. The default is 4010. */
  readonly port?: number;
  /** The address to listen on. The default is 127.0.0.1. */
  readonly host?: string;
  /** A wait in milliseconds before every response, for timeout tests. The default is 0. */
  readonly delayMs?: number;
  /** The spec folder. The default is the `spec` submodule of the js repo. */
  readonly specDir?: string;
  /** The clock of the rate limit, in milliseconds since the epoch. The default is `Date.now`. */
  readonly now?: () => number;
}

/** A running mock server. */
export interface MockServer {
  /** The base URL, such as `http://127.0.0.1:4010`. */
  readonly url: string;
  /** Closes every connection, also the ones that wait for an answer, and stops the server. */
  close(): Promise<void>;
}

// The gateway sends these on every response. The mock server also allows the two headers of a
// contract scenario, so that a browser test can send them.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, X-API-Key, X-Widget-Origin, X-Scenario-Id, X-Scenario-Run',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '300',
};
const DEFAULT_SPEC_DIR = fileURLToPath(new URL('../../../spec/', import.meta.url));

async function readRequest(incoming: IncomingMessage): Promise<MockRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) {
    chunks.push(chunk as Buffer);
  }
  const url = new URL(incoming.url ?? '/', 'http://mock.invalid');
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value !== undefined) {
      headers[name] = Array.isArray(value) ? value.join(', ') : value;
    }
  }
  return {
    method: incoming.method ?? 'GET',
    path: url.pathname,
    query: url.searchParams,
    headers,
    body: Buffer.concat(chunks).toString('utf8'),
  };
}

// Waits for a delay. It ends early, with false, when the server closes or the client leaves.
async function waited(
  ms: number,
  outgoing: ServerResponse,
  stopping: AbortSignal,
): Promise<boolean> {
  const left = new AbortController();
  outgoing.once('close', () => {
    left.abort();
  });
  try {
    await sleep(ms, undefined, { signal: AbortSignal.any([stopping, left.signal]) });
    return true;
  } catch {
    return false;
  }
}

async function send(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  reply: Reply,
  wait: { readonly extraMs: number; readonly stopping: AbortSignal },
): Promise<void> {
  if (reply.kind === 'hang') {
    return;
  }
  if (!(await waited(reply.delayMs + wait.extraMs, outgoing, wait.stopping))) {
    return;
  }
  if (reply.kind === 'drop') {
    incoming.socket.destroy();
    return;
  }
  const length = String(Buffer.byteLength(reply.body));
  outgoing.writeHead(reply.status, { ...CORS_HEADERS, 'Content-Length': length, ...reply.headers });
  outgoing.end(reply.body);
}

// The host part of the URL: every address means localhost, and an IPv6 address has brackets.
function urlHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') {
    return 'localhost';
  }
  return host.includes(':') ? `[${host}]` : host;
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : port);
    });
  });
}

/**
 * Starts the mock server. A request with an `X-Scenario-Id` header gets the next response of
 * that contract scenario. Any other request gets the gateway's answer from the fixtures.
 *
 * @param options - The port, the address, an extra delay, the spec folder and the clock.
 * @returns The running server.
 * @throws TypeError when a file in the spec folder has the wrong shape.
 *
 * @example
 * ```ts
 * import { startMockServer } from '@gatepost/mock-server';
 *
 * const mock = await startMockServer({ port: 0 });
 * const response = await fetch(`${mock.url}/v1/lookup?code=FC-01-Z99-ZZ-01`, {
 *   headers: { 'X-API-Key': 'nipost_test_mock_l1' },
 * });
 * await response.json(); // { data: { postcode: 'FC-01-Z99-ZZ-01', valid: true, ... } }
 * await mock.close();
 * ```
 */
export async function startMockServer(options: MockServerOptions = {}): Promise<MockServer> {
  const files = readSpecFiles(options.specDir ?? DEFAULT_SPEC_DIR);
  const gateway = createGateway(files, options.now ?? Date.now);
  const play = createScenarioPlayer(files.scenarios);
  const extraMs = options.delayMs ?? 0;
  const stopping = new AbortController();
  const choose = (request: MockRequest): Reply => {
    const scenario = request.headers['x-scenario-id'];
    return request.method === 'OPTIONS' || scenario === undefined
      ? gateway(request)
      : play(scenario, request.headers['x-scenario-run']);
  };
  const server = createServer((incoming, outgoing) => {
    readRequest(incoming)
      .then((request) =>
        send(incoming, outgoing, choose(request), { extraMs, stopping: stopping.signal }),
      )
      .catch((error: unknown) => {
        // A broken fixture is a bug in the spec. The test that hit it sees the message.
        const message = error instanceof Error ? error.message : String(error);
        const reply = jsonReply(500, { error: { code: 'mock_error', message } });
        return send(incoming, outgoing, reply, { extraMs: 0, stopping: stopping.signal });
      })
      .catch(() => {
        // The error reply failed too. Close this connection, so that no rejection stays open.
        incoming.socket.destroy();
      });
  });
  const host = options.host ?? '127.0.0.1';
  const port = await listen(server, options.port ?? 4010, host);
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= new Promise((resolve, reject) => {
      stopping.abort();
      server.closeAllConnections();
      server.close((error) => {
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
    return closing;
  };
  return { url: `http://${urlHost(host)}:${String(port)}`, close };
}

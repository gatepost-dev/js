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

async function send(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  reply: Reply,
  extraMs: number,
): Promise<void> {
  if (reply.kind === 'hang') {
    return;
  }
  await sleep(reply.delayMs + extraMs);
  if (reply.kind === 'drop') {
    incoming.socket.destroy();
    return;
  }
  const length = String(Buffer.byteLength(reply.body));
  outgoing.writeHead(reply.status, { ...CORS_HEADERS, 'Content-Length': length, ...reply.headers });
  outgoing.end(reply.body);
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
  const choose = (request: MockRequest): Reply => {
    const scenario = request.headers['x-scenario-id'];
    return request.method === 'OPTIONS' || scenario === undefined
      ? gateway(request)
      : play(scenario, request.headers['x-scenario-run']);
  };
  const server = createServer((incoming, outgoing) => {
    readRequest(incoming)
      .then((request) => send(incoming, outgoing, choose(request), extraMs))
      .catch((error: unknown) => {
        // A broken fixture is a bug in the spec. The test that hit it sees the message.
        const message = error instanceof Error ? error.message : String(error);
        const reply = jsonReply(500, { error: { code: 'mock_error', message } });
        return send(incoming, outgoing, reply, 0);
      });
  });
  const host = options.host ?? '127.0.0.1';
  const port = await listen(server, options.port ?? 4010, host);
  return {
    url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${String(port)}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      }),
  };
}

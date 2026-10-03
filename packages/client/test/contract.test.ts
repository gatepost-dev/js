// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// T-3: the client passes every contract scenario of the spec against the mock server. The
// scenarios measure real waits, so these tests use the real clock. They run at the same time,
// and each run of a scenario has its own place in the mock server.
import { startMockServer, type MockServer } from '@gatepost/mock-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readScenarios, runScenario } from './scenarios.js';

// Timers can fire late, so a wait may pass its maximum by this much. It must not fall short.
const LATE_MS = 100;
// A scenario gets 5 s and the longest waits that it expects, so a client that hangs fails soon.
const BASE_LIMIT_MS = 5000;

let mock: MockServer;

beforeAll(async () => {
  mock = await startMockServer({ port: 0 });
});

afterAll(async () => {
  await mock.close();
});

const scenarios = readScenarios();

describe.concurrent('the contract scenarios', () => {
  it('finds the scenarios of the spec', () => {
    expect(scenarios.length).toBeGreaterThan(0);
  });

  for (const scenario of scenarios) {
    const waitsMs = (scenario.expect.waitsMs ?? []).reduce((sum, bounds) => sum + bounds.max, 0);
    it(
      `${scenario.id}: ${scenario.description}`,
      async () => {
        const run = await runScenario(scenario, mock.url);
        const { expect: wanted } = scenario;
        expect(run.outcomes).toEqual(wanted.outcomes);
        expect(run.attempts).toBe(wanted.attempts);
        if (wanted.request !== undefined) {
          expect(run.request).toEqual(wanted.request);
        }
        if (wanted.maxInFlight !== undefined) {
          expect(run.maxInFlight).toBe(wanted.maxInFlight);
        }
        for (const [index, bounds] of (wanted.waitsMs ?? []).entries()) {
          const waitMs = run.waitsMs[index] ?? Number.NaN;
          expect(waitMs).toBeGreaterThanOrEqual(bounds.min);
          expect(waitMs).toBeLessThanOrEqual(bounds.max + LATE_MS);
        }
      },
      BASE_LIMIT_MS + waitsMs,
    );
  }
});

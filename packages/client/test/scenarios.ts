// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Reads the contract scenarios of the spec, and runs one against a mock server, as
// spec/contract/README.md says. The format is fixed there, so the types below copy it.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { Postcode } from '@gatepost/core';
import { PostcodeClient, PostcodeError } from '../src/index.js';
import type { AutocompleteResult, LookupLevel, LookupResult, ReverseResult } from '../src/index.js';

/** One call of a scenario. */
export type ScenarioCall =
  | { readonly method: 'lookup'; readonly code: string; readonly level: LookupLevel }
  | {
      readonly method: 'reverse';
      readonly lat: number;
      readonly lng: number;
      readonly maxDistanceM?: number;
    }
  | { readonly method: 'autocomplete'; readonly q: string };

/** The first request that reached the transport. */
export interface SeenRequest {
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly apiKey: string | null;
}

/** A scenario file of spec/contract. */
export interface Scenario {
  readonly id: string;
  readonly description: string;
  readonly client: Readonly<{
    apiKey?: string;
    timeoutMs?: number;
    maxRetries?: number;
    cacheTtlMs?: number;
  }>;
  readonly order?: 'parallel' | 'sequential';
  readonly calls: readonly ScenarioCall[];
  readonly expect: {
    readonly attempts: number;
    readonly waitsMs?: readonly { readonly min: number; readonly max: number }[];
    readonly maxInFlight?: number;
    readonly request?: SeenRequest;
    readonly outcomes: readonly unknown[];
  };
}

/** What a run of a scenario saw. */
export interface ScenarioRun {
  readonly outcomes: readonly unknown[];
  readonly attempts: number;
  readonly waitsMs: readonly number[];
  readonly maxInFlight: number;
  readonly request: SeenRequest | undefined;
}

const CONTRACT = new URL('../../../spec/contract/', import.meta.url);

/**
 * Reads every scenario of the spec, in the order of the file names.
 *
 * @returns The scenarios.
 */
export function readScenarios(): readonly Scenario[] {
  return readdirSync(CONTRACT)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, CONTRACT), 'utf8')) as Scenario);
}

function canonical(postcode: Postcode | null): string | null {
  return postcode === null ? null : postcode.canonical;
}

// A result in a scenario writes each postcode in its canonical form.
function lookupOutcome(result: LookupResult): unknown {
  return { ...result, postcode: result.postcode.canonical };
}

function reverseOutcome(result: ReverseResult): unknown {
  const unit =
    result.unit === null ? null : { ...result.unit, postcode: result.unit.postcode.canonical };
  return { ...result, unit };
}

function autocompleteOutcome(result: AutocompleteResult): unknown {
  const suggestions = result.suggestions.map((item) => ({
    ...item,
    postcode: canonical(item.postcode),
  }));
  return { segment: result.segment, suggestions };
}

function radius(call: { readonly maxDistanceM?: number }): { maxDistanceM?: number } {
  return call.maxDistanceM === undefined ? {} : { maxDistanceM: call.maxDistanceM };
}

async function outcomeOf(client: PostcodeClient, call: ScenarioCall): Promise<unknown> {
  try {
    switch (call.method) {
      case 'lookup':
        return { result: lookupOutcome(await client.lookup(call.code, { level: call.level })) };
      case 'reverse':
        return { result: reverseOutcome(await client.reverse(call.lat, call.lng, radius(call))) };
      case 'autocomplete':
        return { result: autocompleteOutcome(await client.autocomplete(call.q)) };
    }
  } catch (error: unknown) {
    if (!(error instanceof PostcodeError)) {
      throw error;
    }
    const { code, status, apiCode, retryAfterMs } = error;
    return { error: { code, status, apiCode, retryAfterMs } };
  }
}

/**
 * Runs a scenario against a mock server. A transport wraps fetch: it adds the scenario headers,
 * with a run value that no other run uses, and it counts the attempts, the waits and the
 * requests in flight.
 *
 * @param scenario - The scenario.
 * @param baseUrl - The mock server's address.
 * @returns What the run saw.
 */
export async function runScenario(scenario: Scenario, baseUrl: string): Promise<ScenarioRun> {
  const run = randomUUID();
  const starts: number[] = [];
  const ends: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let request: SeenRequest | undefined;
  const transport: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const url = new URL(input instanceof Request ? input.url : input);
    request ??= {
      method: init?.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      apiKey: headers.get('X-API-Key'),
    };
    headers.set('X-Scenario-Id', scenario.id);
    headers.set('X-Scenario-Run', run);
    starts.push(performance.now());
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      return await fetch(input, { ...init, headers });
    } finally {
      inFlight -= 1;
      ends.push(performance.now());
    }
  };
  const client = new PostcodeClient({ ...scenario.client, baseUrl, transport });
  const outcomes =
    scenario.order === 'parallel'
      ? await Promise.all(scenario.calls.map((call) => outcomeOf(client, call)))
      : await scenario.calls.reduce<Promise<unknown[]>>(
          async (done, call) => [...(await done), await outcomeOf(client, call)],
          Promise.resolve([]),
        );
  // A wait runs from the end of one attempt to the start of the next one.
  const waitsMs = starts.slice(1).map((start, index) => start - (ends[index] ?? start));
  return { outcomes, attempts: starts.length, waitsMs, maxInFlight, request };
}

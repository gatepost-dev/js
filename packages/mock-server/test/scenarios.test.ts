// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createScenarioPlayer } from '../src/scenarios.ts';
import { errorCode, FILES, SPEC_DIR, sent } from './mock-request.ts';

interface ScenarioResponse {
  readonly status?: number;
  readonly fixture?: string;
  readonly hang?: true;
  readonly drop?: true;
}

const CONTRACT = join(SPEC_DIR, 'contract');
const scenarios = readdirSync(CONTRACT)
  .filter((name) => name.endsWith('.json'))
  .map(
    (name) =>
      JSON.parse(readFileSync(join(CONTRACT, name), 'utf8')) as {
        id: string;
        responses: ScenarioResponse[];
      },
  );

// The kind and the status of the reply that the spec file asks for.
function expected(response: ScenarioResponse): [string, number | null] {
  if (response.hang === true) {
    return ['hang', null];
  }
  if (response.drop === true) {
    return ['drop', null];
  }
  const fixture = response.fixture === undefined ? undefined : FILES.fixtures.get(response.fixture);
  return ['send', fixture?.status ?? response.status ?? null];
}

describe('the scenario player', () => {
  it('knows each scenario file of the spec', () => {
    expect([...FILES.scenarios.keys()].sort()).toEqual(scenarios.map(({ id }) => id).sort());
  });

  it.each(scenarios.filter(({ responses }) => responses.length > 0))(
    'plays the responses of $id in order, then repeats the last',
    ({ id, responses }) => {
      const play = createScenarioPlayer(FILES.scenarios);
      const asked = [...responses, ...responses.slice(-1)].map(expected);
      const played = asked.map(() => {
        const reply = play(id, 'run-1');
        return [reply.kind, reply.kind === 'send' ? reply.status : null];
      });
      expect(played).toEqual(asked);
    },
  );

  it('keeps a place for each run, so a test can run a scenario again', () => {
    const play = createScenarioPlayer(FILES.scenarios);
    expect(sent(play('lookup-retry-503', 'run-1')).status).toBe(503);
    expect(sent(play('lookup-retry-503', 'run-1')).status).toBe(200);
    expect(sent(play('lookup-retry-503', 'run-2')).status).toBe(503);
  });

  it('answers a scenario that it does not know with 400', () => {
    const response = sent(createScenarioPlayer(FILES.scenarios)('lookup-retry-999', 'run-1'));
    expect([response.status, errorCode(response)]).toEqual([400, 'mock_unknown_scenario']);
  });

  it('answers a scenario request with no run with 400', () => {
    const play = createScenarioPlayer(FILES.scenarios);
    for (const run of [undefined, '']) {
      const response = sent(play('lookup-retry-503', run));
      expect([response.status, errorCode(response)]).toEqual([400, 'mock_run_missing']);
    }
  });

  it('answers a request in a scenario that expects none with 400', () => {
    const response = sent(createScenarioPlayer(FILES.scenarios)('lookup-invalid-input', 'run-1'));
    expect([response.status, errorCode(response)]).toEqual([400, 'mock_no_request']);
  });
});

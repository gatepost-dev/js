// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { jsonReply, type Reply } from './reply.ts';

function mockError(code: string, message: string): Reply {
  return jsonReply(400, { error: { code, message } });
}

/**
 * Plays the responses of the contract scenarios. Each run of a scenario keeps its own place
 * in the list of responses, and the last response repeats. The places stay in memory until the
 * player goes away, so a long-lived server grows by one entry for each run.
 *
 * @param scenarios - The responses of each scenario, by its id.
 * @returns A function that takes the values of `X-Scenario-Id` and `X-Scenario-Run`, and
 *   returns the next reply of that run.
 * @internal
 */
export function createScenarioPlayer(
  scenarios: ReadonlyMap<string, readonly Reply[]>,
): (id: string, run: string | undefined) => Reply {
  const positions = new Map<string, number>();
  return (id, run) => {
    const replies = scenarios.get(id);
    if (replies === undefined) {
      return mockError('mock_unknown_scenario', `The mock server has no scenario ${id}.`);
    }
    if (run === undefined || run === '') {
      return mockError('mock_run_missing', 'A scenario request needs the X-Scenario-Run header.');
    }
    const place = JSON.stringify([id, run]);
    const position = positions.get(place) ?? 0;
    positions.set(place, position + 1);
    const reply = replies[Math.min(position, replies.length - 1)];
    return reply ?? mockError('mock_no_request', `The scenario ${id} expects no request.`);
  };
}

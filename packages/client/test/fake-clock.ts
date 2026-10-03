// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// The fake clock of the unit tests. The client measures its waits with performance.now, so the
// fake clock covers it as well as the timers and Date.
import { afterEach, beforeEach, vi } from 'vitest';

/** The time at the start of each test: 09:00:00 GMT on 14 Oct 2026. */
export const START: number = Date.parse('2026-10-14T09:00:00Z');

/**
 * Uses the fake clock in each test of the file that calls it.
 */
export function useFakeClock(): void {
  beforeEach(() => {
    vi.useFakeTimers({ now: START, toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
}

/**
 * Runs the fake clock while a call settles, so that a rejection is never left unhandled.
 *
 * @param call - The call.
 * @param runMs - How far the clock runs, in milliseconds.
 * @returns How the call settled.
 */
export async function settle<T>(call: Promise<T>, runMs: number): Promise<PromiseSettledResult<T>> {
  const outcome = Promise.allSettled([call]);
  await vi.advanceTimersByTimeAsync(runMs);
  const [settled] = await outcome;
  return settled;
}

/**
 * Gives the reason of a call that failed.
 *
 * @param settled - How the call settled.
 * @returns The reason.
 */
export function reasonOf(settled: PromiseSettledResult<unknown>): unknown {
  if (settled.status === 'fulfilled') {
    throw new Error('The call did not fail.');
  }
  return settled.reason;
}

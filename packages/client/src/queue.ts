// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Runs tasks with at most a fixed number at a time. The others wait in the order of their calls.
 *
 * @internal
 */
export type Queue = <T>(task: () => Promise<T>, signal: AbortSignal) => Promise<T>;

/**
 * Makes a queue. A task that waits for its turn leaves the queue when its signal aborts, so a
 * cancelled call never holds a place (API-8, API-11).
 *
 * @param limit - The most tasks that run at one time.
 * @returns The queue.
 * @internal
 */
export function createQueue(limit: number): Queue {
  let running = 0;
  const waiting: (() => void)[] = [];

  const release = (): void => {
    running -= 1;
    waiting.shift()?.();
  };

  const turn = (signal: AbortSignal): Promise<void> => {
    if (running < limit) {
      running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const start = (): void => {
        signal.removeEventListener('abort', leave);
        running += 1;
        resolve();
      };
      const leave = (): void => {
        waiting.splice(waiting.indexOf(start), 1);
        // API-11: a cancelled call ends with the reason of the caller's signal, of any type.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- API-11
        reject(signal.reason);
      };
      waiting.push(start);
      signal.addEventListener('abort', leave, { once: true });
    });
  };

  return async (task, signal) => {
    signal.throwIfAborted();
    await turn(signal);
    try {
      return await task();
    } finally {
      release();
    }
  };
}

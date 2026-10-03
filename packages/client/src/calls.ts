// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0

/**
 * The calls of one method of a client: the requests in flight, which identical calls share,
 * and the kept results.
 *
 * @internal
 */
export interface Calls<T> {
  /**
   * Gives the kept result for the key, joins the request in flight for it, or starts one.
   *
   * @param key - The method's arguments, as text. Equal arguments give an equal key.
   * @param run - Starts the request. Its signal aborts when every caller has left.
   * @param signal - The caller's signal, if any.
   * @returns The result.
   */
  call(key: string, run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>;
  /** Removes every kept result. Requests in flight go on. */
  clear(): void;
}

// A server can call with many different arguments, so a client keeps at most this many results.
const MAX_KEPT = 1000;

interface InFlight<T> {
  readonly promise: Promise<T>;
  readonly controller: AbortController;
  callers: number;
}

/**
 * Makes the store of calls for one method.
 *
 * @param cacheTtlMs - How long a result stays, in milliseconds. 0 keeps nothing.
 * @returns The store.
 * @internal
 */
export function createCalls<T>(cacheTtlMs: number): Calls<T> {
  let epoch = 0;
  const inFlight = new Map<string, InFlight<T>>();
  const kept = new Map<string, { readonly result: T; readonly until: number }>();

  // The key is not in the map, because call() removes a result that has expired.
  // Every result lives for the same time, so the oldest entries are at the front of the map.
  const keep = (key: string, result: T): void => {
    const now = Date.now();
    for (const [oldKey, entry] of kept) {
      if (entry.until > now && kept.size < MAX_KEPT) {
        break;
      }
      kept.delete(oldKey);
    }
    kept.set(key, { result, until: now + cacheTtlMs });
  };

  const start = (key: string, run: (signal: AbortSignal) => Promise<T>): InFlight<T> => {
    const controller = new AbortController();
    const startedIn = epoch;
    const promise = run(controller.signal).then((result) => {
      // A result of a request that started before clearCache must not come back.
      if (cacheTtlMs > 0 && startedIn === epoch) {
        keep(key, result);
      }
      return result;
    });
    const entry = { promise, controller, callers: 0 };
    const forget = (): void => {
      if (inFlight.get(key) === entry) {
        inFlight.delete(key);
      }
    };
    // When every caller has left, nobody reads the outcome. The second callback marks the
    // rejection as handled, so that it is not reported as unhandled.
    promise.then(forget, forget);
    inFlight.set(key, entry);
    return entry;
  };

  // Each caller can leave with its own signal. The request stops when the last caller leaves,
  // so a replaced keystroke frees its place in the queue.
  const join = (key: string, entry: InFlight<T>, signal: AbortSignal | undefined): Promise<T> => {
    entry.callers += 1;
    if (signal === undefined) {
      return entry.promise;
    }
    return new Promise((resolve, reject) => {
      const leave = (): void => {
        entry.callers -= 1;
        if (entry.callers === 0) {
          inFlight.delete(key);
          entry.controller.abort(signal.reason);
        }
        // API-11: a cancelled call ends with the reason of the caller's signal, of any type.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- API-11
        reject(signal.reason);
      };
      signal.addEventListener('abort', leave, { once: true });
      entry.promise.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', leave);
      });
    });
  };

  return {
    async call(key, run, signal) {
      signal?.throwIfAborted();
      const hit = kept.get(key);
      if (hit !== undefined && hit.until > Date.now()) {
        return hit.result;
      }
      kept.delete(key);
      return await join(key, inFlight.get(key) ?? start(key, run), signal);
    },
    clear() {
      epoch += 1;
      kept.clear();
    },
  };
}

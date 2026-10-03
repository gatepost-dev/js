// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
const MINUTE_MS = 60_000;

/**
 * Counts the requests of each key in each clock minute, as the gateway does.
 *
 * @param limit - The requests that one key can make in one minute.
 * @param now - The clock, in milliseconds since the epoch.
 * @returns A function that counts one request of a key, and returns the requests that the key
 *   has left in this minute. The count goes below 0 when the key passes the limit.
 * @internal
 */
export function createRateLimiter(limit: number, now: () => number): (key: string) => number {
  const minutes = new Map<string, { readonly minute: number; readonly count: number }>();
  return (key) => {
    const minute = Math.floor(now() / MINUTE_MS);
    const current = minutes.get(key);
    const count = current?.minute === minute ? current.count + 1 : 1;
    minutes.set(key, { minute, count });
    return limit - count;
  };
}

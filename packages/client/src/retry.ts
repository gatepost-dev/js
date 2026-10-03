// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { PostcodeError } from './error.js';

/** @internal */
export const FIRST_WAIT_MS = 500;
/** @internal */
export const JITTER_MS = 250;
// A longer Retry-After ends the call at once, so a caller can tell a user when to try again.
const LONGEST_RETRY_AFTER_MS = 10_000;
// The statuses that can carry a wait. A 429 is `rate_limited`, and the others are retried.
/** @internal */
export const WAIT_STATUSES: readonly number[] = [429, 502, 503, 504];
const SECONDS = /^\d+$/;
// The three HTTP-date forms of RFC 9110: IMF-fixdate, RFC 850 and asctime. Date.parse also reads
// text that is no HTTP date, such as 2999-01-01, so each form needs its own pattern. The asctime
// form has no zone and means UTC, so Date.parse gets the zone GMT for all three.
const HTTP_DATE =
  /^(?:\w{3}, \d\d [A-Z][a-z]{2} \d{4}|\w+day, \d\d-[A-Z][a-z]{2}-\d\d) [\d:]{8} GMT$|^\w{3} [A-Z][a-z]{2} [ \d]\d [\d:]{8} \d{4}$/; // check-tells: allow TELL-1 because one pattern cannot wrap

/**
 * Reads a `Retry-After` header, which holds seconds or an HTTP date.
 *
 * @param header - The value of the header, or null when the response has none.
 * @param now - The current time in milliseconds since the epoch.
 * @returns The wait in milliseconds, or null for a missing or invalid value. A date in the past
 *   is invalid.
 * @internal
 */
export function retryAfterMs(header: string | null, now: number): number | null {
  if (header === null) {
    return null;
  }
  if (SECONDS.test(header)) {
    return Number(header) * 1000;
  }
  if (!HTTP_DATE.test(header)) {
    return null;
  }
  const date = Date.parse(`${header.replace(' GMT', '')} GMT`);
  return date >= now ? date - now : null;
}

// The wait that Retry-After asked for, when the client accepts it.
function honouredMs(error: PostcodeError): number | null {
  const asked = error.retryAfterMs;
  return asked !== null && asked <= LONGEST_RETRY_AFTER_MS ? asked : null;
}

/**
 * Decides whether a failed attempt gets a retry, and how long the client waits first.
 *
 * @param error - The error of the attempt.
 * @param retry - The number of the next retry. The first retry is 1.
 * @param timeoutRetried - False for `autocomplete`, whose timeout gets no retry.
 * @returns The wait in milliseconds, or null when the call ends with the error.
 * @internal
 */
export function retryWaitMs(
  error: PostcodeError,
  retry: number,
  timeoutRetried: boolean,
): number | null {
  const ownWaitMs = FIRST_WAIT_MS * 2 ** (retry - 1) + Math.random() * JITTER_MS;
  if (error.code === 'rate_limited') {
    return honouredMs(error);
  }
  if (error.code === 'server_error') {
    return WAIT_STATUSES.includes(error.status ?? 0) ? (honouredMs(error) ?? ownWaitMs) : null;
  }
  const retried = error.code === 'network_error' || (error.code === 'timeout' && timeoutRetried);
  return retried ? ownWaitMs : null;
}

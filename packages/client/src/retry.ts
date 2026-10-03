// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { PostcodeError } from './error.js';

/** @internal */
export const FIRST_WAIT_MS = 500;
/** @internal */
export const JITTER_MS = 250;
// A longer Retry-After ends the call at once, so a caller can tell a user when to try again.
const LONGEST_RETRY_AFTER_MS = 10_000;
const RETRIED_STATUSES: readonly number[] = [502, 503, 504];
const SECONDS = /^\d+$/;
// An HTTP date names its day and month in letters. Date.parse also reads text such as 1.5 as a
// date, so text with no letter is not one.
const HAS_LETTER = /[A-Za-z]/;

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
  const text = header.trim();
  if (SECONDS.test(text)) {
    return Number(text) * 1000;
  }
  const date = HAS_LETTER.test(text) ? Date.parse(text) : Number.NaN;
  return Number.isNaN(date) || date < now ? null : date - now;
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
    return RETRIED_STATUSES.includes(error.status ?? 0) ? (honouredMs(error) ?? ownWaitMs) : null;
  }
  const retried = error.code === 'network_error' || (error.code === 'timeout' && timeoutRetried);
  return retried ? ownWaitMs : null;
}

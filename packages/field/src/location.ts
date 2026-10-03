// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { PostcodeError, type PostcodeClient, type ReverseResult } from '@gatepost/client';
import { parse, precisionForAccuracy, truncate, type Postcode } from '@gatepost/core';
import type { FieldErrorCode } from './types.js';

// The gateway searches 25 m by default and accepts at most 250 m (spec/client.md).
const MIN_RADIUS_M = 25;
const MAX_RADIUS_M = 250;
// A user can wait about this long for the device. After that, typing is quicker.
const POSITION_TIMEOUT_MS = 15_000;

/**
 * Gives the radius of a `reverse` call for a location: the accuracy in whole metres, rounded
 * up, from 25 to 250.
 *
 * @param accuracyM - The accuracy of the location in metres.
 * @returns The radius in metres.
 * @internal
 */
export function radiusFor(accuracyM: number): number {
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.ceil(accuracyM)));
}

function partial(text: string | null): Postcode | null {
  if (text === null) {
    return null;
  }
  const parsed = parse(text, { allowPartial: true });
  return parsed.ok ? parsed.value : null;
}

/**
 * Gives the postcode that a location supports: the unit's postcode, or else the area or the
 * district, truncated to the precision of the accuracy.
 *
 * @param result - What `reverse` found at the location.
 * @param accuracyM - The accuracy of the location in metres.
 * @returns The postcode, which can be partial, or null when the result holds none.
 * @internal
 */
export function postcodeAtFix(result: ReverseResult, accuracyM: number): Postcode | null {
  const found = result.unit?.postcode ?? partial(result.area) ?? partial(result.district);
  if (found === null) {
    return null;
  }
  const precision = precisionForAccuracy(accuracyM);
  // A segment of null means that the postcode stops before that precision, so it stays whole.
  return found.segments[precision] === null ? found : truncate(found, precision);
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: POSITION_TIMEOUT_MS,
    });
  });
}

/**
 * What a location request found: a postcode, which can be partial, the message of a failure
 * with the error code for the event, or no client to send the `reverse` call with.
 *
 * @internal
 */
export type Fix =
  | { readonly kind: 'postcode'; readonly postcode: Postcode; readonly accuracyM: number }
  | {
      readonly kind: 'failed';
      readonly key: 'gps_denied' | 'gps_unavailable' | 'gps_not_found';
      readonly code: FieldErrorCode | null;
    }
  | { readonly kind: 'unsent' };

/**
 * Asks the browser for the device's location once, and the gateway for the postcode there.
 *
 * @param currentClient - Gives the client that the field holds, or null when it holds none. It
 *   runs when the position arrives, so a change of the key during the wait counts.
 * @param signal - Cancels the `reverse` call.
 * @returns What the location request found. The kind `unsent` means that the field held no
 *   client when the position arrived.
 * @throws The platform's cancellation error when the signal aborts.
 * @internal
 */
export async function findFix(
  currentClient: () => PostcodeClient | null,
  signal: AbortSignal,
): Promise<Fix> {
  // Some embedded browsers and old WebViews have no location API at all.
  if (!('geolocation' in navigator)) {
    return { kind: 'failed', key: 'gps_unavailable', code: 'gps_unavailable' };
  }
  let position: GeolocationPosition;
  try {
    position = await currentPosition();
  } catch (error) {
    if (!(error instanceof GeolocationPositionError)) {
      // Any other failure of the device call ends the request too, and it has no event code.
      return { kind: 'failed', key: 'gps_unavailable', code: null };
    }
    const key = error.code === error.PERMISSION_DENIED ? 'gps_denied' : 'gps_unavailable';
    return { kind: 'failed', key, code: key };
  }
  signal.throwIfAborted();
  const client = currentClient();
  if (client === null) {
    return { kind: 'unsent' };
  }
  const { latitude, longitude, accuracy } = position.coords;
  let result: ReverseResult;
  try {
    result = await client.reverse(latitude, longitude, {
      maxDistanceM: radiusFor(accuracy),
      signal,
    });
  } catch (error) {
    // A cancelled call is the one failure that ends with no outcome.
    signal.throwIfAborted();
    const code = error instanceof PostcodeError ? error.code : 'network_error';
    return { kind: 'failed', key: 'gps_unavailable', code };
  }
  const postcode = postcodeAtFix(result, accuracy);
  if (postcode === null) {
    return { kind: 'failed', key: 'gps_not_found', code: null };
  }
  return { kind: 'postcode', postcode, accuracyM: accuracy };
}

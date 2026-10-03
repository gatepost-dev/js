// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { Postcode, Precision } from '@gatepost/core';

/**
 * Settings for a `PostcodeClient`. Each one is optional.
 */
export interface ClientOptions {
  /** The key for the `X-API-Key` header. With no key, the client sends no header. */
  readonly apiKey?: string | undefined;
  /** The gateway's address. The default is `https://api.postcode.gov.ng`. */
  readonly baseUrl?: string;
  /** The function that sends each request. The default is the platform's `fetch`. */
  readonly transport?: typeof globalThis.fetch;
  /** The longest wait for one attempt, in milliseconds. The default is 8000. */
  readonly timeoutMs?: number;
  /** The most retries after the first attempt. The default is 2. */
  readonly maxRetries?: number;
  /** How long the client keeps a result, in milliseconds. The default 0 turns the cache off. */
  readonly cacheTtlMs?: number;
}

/**
 * How much data a lookup asks for, from 1 for validity only to 5 for point geometry.
 */
export type LookupLevel = 1 | 2 | 3 | 4 | 5;

/**
 * The gateway's verdict on a postcode. `invalid` means a wrong form, and `not_found` means a
 * right form that the gateway does not know.
 */
export type LookupStatus = 'valid' | 'invalid' | 'not_found' | 'restricted';

/**
 * The names of the places that hold a postcode. The gateway sends them from lookup level 2.
 * A name that the response leaves out is null.
 */
export interface AdministrativeAddress {
  /** The state's name. */
  readonly stateName: string | null;
  /** The LGA's name. */
  readonly lgaName: string | null;
  /** The locality's name. */
  readonly localityName: string | null;
  /** The geopolitical zone. */
  readonly zone: string | null;
}

/**
 * The facts that a lookup returned for one postcode.
 */
export interface LookupResult {
  /** The postcode that the caller asked for, as the core parsed it. */
  readonly postcode: Postcode;
  /** True when the gateway knows the postcode. */
  readonly valid: boolean;
  /** The gateway's verdict, or null when the response has none that this client knows. */
  readonly status: LookupStatus | null;
  /** The lookup level that the caller asked for. */
  readonly levelRequested: LookupLevel;
  /** The lookup level of the data in the response, which the client reads from its fields. */
  readonly levelReceived: LookupLevel;
  /** The names of the places that hold the postcode, from level 2, or null. */
  readonly administrativeAddress: AdministrativeAddress | null;
  /** The most recent house address at the postcode, from level 2, or null. */
  readonly recentHouseAddress: string | null;
  /** What the building is used for, from level 3, or null. */
  readonly buildingUseStatus: string | null;
}

/**
 * How sure the gateway is that a unit holds a coordinate. It falls with the distance.
 */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * The unit nearest to a coordinate.
 */
export interface ReverseUnit {
  /** The unit's postcode. */
  readonly postcode: Postcode;
  /** The distance from the coordinate, in metres. */
  readonly distanceM: number;
  /** How sure the gateway is. An unknown value becomes `low`. */
  readonly confidence: Confidence;
  /** The state's name, or null. */
  readonly stateName: string | null;
  /** The LGA's name, or null. */
  readonly lgaName: string | null;
  /** The locality's name, or null. */
  readonly localityName: string | null;
  /** The address of the unit, or null. */
  readonly address: string | null;
}

/**
 * What the gateway found near a coordinate. `found` can be true while `unit` is null: the
 * gateway then found an area, but no unit within the radius.
 */
export interface ReverseResult {
  /** True when the gateway found a unit or an area within the radius. */
  readonly found: boolean;
  /** The radius that the gateway applied, in metres. */
  readonly radiusM: number;
  /** The nearest unit, or null. */
  readonly unit: ReverseUnit | null;
  /** The area as a partial postcode, or null. */
  readonly area: Postcode | null;
  /** The district as a partial postcode, or null. */
  readonly district: Postcode | null;
  /** The state code, or null. */
  readonly state: string | null;
}

/**
 * The values that the gateway offers for the segment that a user is typing.
 */
export interface AutocompleteResult {
  /** The segment that holds the last character that the user typed. */
  readonly segment: Precision;
  /** The values, in the gateway's order. */
  readonly suggestions: readonly {
    /** The value of the active segment, as the gateway sent it, such as `Z99`. */
    readonly code: string;
    /** A label for the value, or null. The gateway has sent none so far. */
    readonly label: string | null;
    /** The typed segments before the active one, followed by `code`, or null. */
    readonly postcode: Postcode | null;
  }[];
}

/**
 * Why a call failed. `spec/client.md` maps each HTTP status to one code.
 */
export type PostcodeErrorCode =
  | 'invalid_input'
  | 'unauthorized'
  | 'insufficient_credits'
  | 'origin_not_allowed'
  | 'forbidden'
  | 'rate_limited'
  | 'server_error'
  | 'unexpected_response'
  | 'network_error'
  | 'timeout';

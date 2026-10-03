// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { Postcode } from '@gatepost/core';
import { createCalls, type Calls } from './calls.js';
import { createQueue } from './queue.js';
import { autocompleteRequest, lookupRequest, reverseRequest } from './requests.js';
import { readAutocomplete, readLookup, readReverse } from './responses.js';
import { send, type SendSettings } from './send.js';
import type {
  AutocompleteResult,
  ClientOptions,
  LookupLevel,
  LookupResult,
  ReverseResult,
} from './types.js';

// API-8: a client sends at most 4 requests at a time.
const PARALLEL_REQUESTS = 4;
const AUTOCOMPLETE_TIMEOUT_MS = 15_000;
const SECRET_KEY = /^nipost_(test|live)_/;

// The numeric options and the rule for each. A value that breaks its rule is a programmer error.
const NUMBER_RULES = [
  ['timeoutMs', (ms: number) => ms > 0 && Number.isFinite(ms), 'a number above 0'],
  [
    'maxRetries',
    (retries: number) => Number.isSafeInteger(retries) && retries >= 0,
    'a whole number of 0 or more',
  ],
  // NIPOST's rules give every cache a time limit, so Infinity is not allowed.
  ['cacheTtlMs', (ms: number) => ms >= 0 && Number.isFinite(ms), 'a number of 0 or more'],
] as const;

function checkOptions(options: ClientOptions): void {
  for (const [name, isAllowed, rule] of NUMBER_RULES) {
    const option = options[name];
    if (option !== undefined && !isAllowed(option)) {
      throw new RangeError(`${name} must be ${rule}. It is ${String(option)}.`);
    }
  }
  // SEC-1: anyone can read a key that a web page holds. The message names the key's kind only.
  const { apiKey } = options;
  if (apiKey === '') {
    throw new RangeError('apiKey must not be empty.');
  }
  if (apiKey !== undefined && SECRET_KEY.test(apiKey) && 'document' in globalThis) {
    throw new TypeError('A web page must not hold a secret key. Use a publishable key here.');
  }
}

/**
 * Calls NIPOST's postcode gateway. A client retries, waits, shares identical calls and limits
 * its parallel requests as `spec/client.md` says. It sends only the requests that its caller
 * makes, and it never logs.
 *
 * @example
 * ```ts
 * import { PostcodeClient } from '@gatepost/client';
 *
 * const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
 * const result = await client.lookup('fc 01 z99 zz 01');
 * result.postcode.canonical; // 'FC-01-Z99-ZZ-01'
 * ```
 */
export class PostcodeClient {
  readonly #settings: SendSettings;
  readonly #autocompleteSettings: SendSettings;
  readonly #lookups: Calls<LookupResult>;
  readonly #reverses: Calls<ReverseResult>;
  readonly #autocompletes: Calls<AutocompleteResult>;

  /**
   * Makes a client. Two clients share nothing, so each can have its own key and settings.
   *
   * @param options - The key, the gateway's address, the transport, the timeout, the retries
   *   and the cache time. Each one is optional.
   * @throws RangeError for a `timeoutMs` of 0 or less, a `maxRetries` that is not a whole
   *   number of 0 or more, a `cacheTtlMs` that is negative or not finite, or an empty `apiKey`.
   * @throws TypeError for a secret key in a web page.
   */
  constructor(options: ClientOptions = {}) {
    checkOptions(options);
    const cacheTtlMs = options.cacheTtlMs ?? 0;
    this.#settings = {
      baseUrl: options.baseUrl ?? 'https://api.postcode.gov.ng',
      apiKey: options.apiKey,
      transport: options.transport ?? ((input, init) => globalThis.fetch(input, init)),
      timeoutMs: options.timeoutMs ?? 8000,
      maxRetries: options.maxRetries ?? 2,
      queue: createQueue(PARALLEL_REQUESTS),
    };
    // A user waits for each completion, so autocomplete gets a longer timeout than a lookup.
    this.#autocompleteSettings = {
      ...this.#settings,
      timeoutMs: options.timeoutMs ?? AUTOCOMPLETE_TIMEOUT_MS,
    };
    this.#lookups = createCalls(cacheTtlMs);
    this.#reverses = createCalls(cacheTtlMs);
    this.#autocompletes = createCalls(cacheTtlMs);
  }

  /**
   * Asks the gateway about one postcode. The core parses the code first, and a code that does
   * not parse as a whole postcode sends no request. A postcode that the gateway does not know
   * gives a result with `valid` false, not an error.
   *
   * @param code - The postcode as text in any form, or as a postcode that `parse` returned.
   * @param options - The lookup `level`, which is 1 by default, and a `signal` that cancels the
   *   call.
   * @returns The facts about the postcode, up to the level that the key holds.
   * @throws PostcodeError `invalid_input` for a code that does not parse, and the code that the
   *   status map gives for a failed response.
   * @example
   * ```ts
   * import { PostcodeClient } from '@gatepost/client';
   *
   * const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
   * const result = await client.lookup('FC-01-Z99-ZZ-01', { level: 2 });
   * result.levelRequested; // 2
   * if (result.levelReceived >= 2) {
   *   result.administrativeAddress?.stateName;
   * }
   * ```
   */
  async lookup(
    code: string | Postcode,
    options: Readonly<{ level?: LookupLevel; signal?: AbortSignal }> = {},
  ): Promise<LookupResult> {
    const level = options.level ?? 1;
    const { postcode, request } = lookupRequest(code, level);
    const run = async (signal: AbortSignal): Promise<LookupResult> => {
      const answer = await send(this.#settings, request, { signal, timeoutRetried: true });
      return readLookup(answer, { postcode, level });
    };
    return await this.#lookups.call(`${postcode.canonical} ${String(level)}`, run, options.signal);
  }

  /**
   * Asks the gateway for the unit nearest to a coordinate. A point with no postcode in range
   * gives a result with `found` false, not an error.
   *
   * @param lat - The latitude in degrees.
   * @param lng - The longitude in degrees.
   * @param options - The radius `maxDistanceM` in metres, which the gateway sets to 25 when it
   *   is missing, and a `signal` that cancels the call.
   * @returns What the gateway found.
   * @throws PostcodeError with the code that the status map gives for a failed response.
   * @example
   * ```ts
   * import { PostcodeClient } from '@gatepost/client';
   *
   * const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
   * const result = await client.reverse(9, 7, { maxDistanceM: 250 });
   * if (result.unit !== null) {
   *   result.unit.postcode.canonical;
   * }
   * ```
   */
  async reverse(
    lat: number,
    lng: number,
    options: Readonly<{ maxDistanceM?: number; signal?: AbortSignal }> = {},
  ): Promise<ReverseResult> {
    const request = reverseRequest(lat, lng, options.maxDistanceM);
    const run = async (signal: AbortSignal): Promise<ReverseResult> =>
      readReverse(await send(this.#settings, request, { signal, timeoutRetried: true }));
    const key = `${String(lat)} ${String(lng)} ${String(options.maxDistanceM)}`;
    return await this.#reverses.call(key, run, options.signal);
  }

  /**
   * Asks the gateway for the values of the segment that a user is typing. Empty text sends no
   * request, because the gateway does not answer it. A timeout gets no retry, because the next
   * keystroke replaces the call.
   *
   * @param q - The text that the user typed, in any spacing and letter case.
   * @param options - A `signal` that cancels the call.
   * @returns The active segment and the gateway's values for it.
   * @throws PostcodeError `invalid_input` for text that is empty, too long or not letters and
   *   digits, and the code that the status map gives for a failed response.
   * @example
   * ```ts
   * import { PostcodeClient } from '@gatepost/client';
   *
   * const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
   * const result = await client.autocomplete('fc 01 z');
   * result.segment; // 'district'
   * ```
   */
  async autocomplete(
    q: string,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ): Promise<AutocompleteResult> {
    const { typed, request } = autocompleteRequest(q);
    const run = async (signal: AbortSignal): Promise<AutocompleteResult> =>
      readAutocomplete(
        await send(this.#autocompleteSettings, request, { signal, timeoutRetried: false }),
        typed,
      );
    return await this.#autocompletes.call(typed, run, options.signal);
  }

  /**
   * Removes every kept result, so that the next call of each kind sends a request.
   *
   * @example
   * ```ts
   * import { PostcodeClient } from '@gatepost/client';
   *
   * const apiKey = process.env['NIPOST_API_KEY'];
   * const client = new PostcodeClient({ apiKey, cacheTtlMs: 60_000 });
   * await client.lookup('FC-01-Z99-ZZ-01');
   * client.clearCache();
   * ```
   */
  clearCache(): void {
    this.#lookups.clear();
    this.#reverses.clear();
    this.#autocompletes.clear();
  }
}

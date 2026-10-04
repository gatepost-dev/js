// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { AdministrativeAddress, LookupResult } from '@gatepost/client';
import { stateName, type Postcode } from '@gatepost/core';
import { keyForReading } from './messages.js';
import type { Reading } from './reading.js';
import type { MessageKey } from './spec-messages.js';

/**
 * The states of `spec/field.md`, in the form that the style sheet reads.
 *
 * @internal
 */
export type State =
  | 'idle'
  | 'typing'
  | 'invalid'
  | 'legacy'
  | 'checking'
  | 'valid'
  | 'not-found'
  | 'confirmed'
  | 'error'
  | 'locating'
  | 'coarse'
  | 'no-location';

/**
 * A message key with the values of its placeholders.
 *
 * @internal
 */
export interface Note {
  readonly key: MessageKey;
  readonly values?: Readonly<Record<string, string | number>>;
}

/**
 * What a lookup or a location request found. It shows until the text changes.
 *
 * @internal
 */
export interface Outcome {
  readonly state: State;
  readonly note: Note;
}

const WHOLE_LENGTH = 11;

// parse accepts only the codes of known states, so the code itself never shows in practice.
function nameOfState(postcode: Postcode): string {
  return stateName(postcode.segments.state) ?? postcode.segments.state;
}

/**
 * Gives the state for a reading of the text. A parse error shows only after the user leaves
 * the input or submits the form, or when the text is long enough for a whole postcode.
 *
 * @param reading - The reading of the text.
 * @param errorsShown - True after the user left the input or submitted the form.
 * @param required - True when the field needs a value.
 * @returns The state.
 * @internal
 */
export function readingState(reading: Reading, errorsShown: boolean, required: boolean): State {
  switch (reading.kind) {
    case 'empty':
      return errorsShown && required ? 'invalid' : 'idle';
    case 'legacy':
      return 'legacy';
    case 'postcode':
      return 'valid';
    case 'error':
      return errorsShown || reading.count >= WHOLE_LENGTH ? 'invalid' : 'typing';
  }
}

/**
 * Gives the message for a reading of the text, with the values of its placeholders.
 *
 * @param reading - The reading of the text.
 * @param legacy - Whether the field accepts a legacy postcode.
 * @returns The message.
 * @internal
 */
export function readingNote(reading: Reading, legacy: 'accept' | 'reject'): Note {
  const key = keyForReading(reading, legacy);
  if (reading.kind === 'postcode') {
    return { key, values: { state: nameOfState(reading.postcode) } };
  }
  return reading.kind === 'error' ? { key, values: { count: reading.count } } : { key };
}

interface Place {
  readonly locality: string;
  readonly lga: string;
  readonly state: string;
}

function placeOf(address: AdministrativeAddress | null): Place | null {
  if (address === null) {
    return null;
  }
  const { localityName, lgaName, stateName: name } = address;
  if (localityName === null || lgaName === null || name === null) {
    return null;
  }
  return { locality: localityName, lga: lgaName, state: name };
}

/**
 * Gives the outcome of a lookup. The names of the place show only when the lookup gave all
 * three, and the house address never shows.
 *
 * @param lookup - The lookup result.
 * @returns The state `confirmed` or `not-found`, with its message.
 * @internal
 */
export function lookupOutcome(lookup: LookupResult): Outcome {
  if (!lookup.valid) {
    return { state: 'not-found', note: { key: 'not_found' } };
  }
  const place = placeOf(lookup.administrativeAddress);
  if (place === null) {
    const values = { state: nameOfState(lookup.postcode) };
    return { state: 'confirmed', note: { key: 'confirmed', values } };
  }
  return { state: 'confirmed', note: { key: 'confirmed_place', values: { ...place } } };
}

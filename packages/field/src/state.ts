// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
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

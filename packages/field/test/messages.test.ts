// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { fill, keyForReading } from '../src/messages.js';
import { readText, type Reading } from '../src/reading.js';

describe('keyForReading', () => {
  it.each([
    ['', 'accept', 'empty'],
    ['FC-01-Z99-ZZ-01', 'accept', 'valid'],
    ['900108', 'accept', 'legacy_accepted'],
    ['900108', 'reject', 'legacy_rejected'],
    ['FC-01-Z99-ZZ-0!', 'accept', 'bad_character'],
    ['FC-01-Z99', 'accept', 'bad_length'],
    ['XX-01-Z99-ZZ-01', 'accept', 'unknown_state'],
    ['FC-00-Z99-ZZ-01', 'accept', 'bad_lga'],
    ['FC-01-Z99-Z1-01', 'accept', 'bad_area'],
    ['FC-01-Z99-ZZ-00', 'accept', 'bad_unit'],
  ] as const)('gives %j with legacy %s the message %s', (text, legacy, key) => {
    expect(keyForReading(readText(text), legacy)).toBe(key);
  });

  it('refuses a segment error of a segment that the grammar never fails', () => {
    const reading: Reading = {
      kind: 'error',
      code: 'bad_segment',
      segment: 'district',
      suggestion: null,
      count: 11,
    };
    expect(() => keyForReading(reading, 'accept')).toThrow(RangeError);
  });
});

describe('fill', () => {
  it('puts each value in place of its placeholder', () => {
    expect(fill('{lga}, {state}. {state}!', { lga: 'Z99', state: 'Kwara' })).toBe(
      'Z99, Kwara. Kwara!',
    );
  });

  it('writes a number in its plain form', () => {
    expect(fill('You entered {count}.', { count: 7 })).toBe('You entered 7.');
  });

  it('leaves a placeholder with no value in view, so a wrong translation shows', () => {
    expect(fill('Hello {name}.', {})).toBe('Hello {name}.');
  });

  it('does not read a placeholder as the name of an inherited property', () => {
    expect(fill('a {toString} b {constructor}', {})).toBe('a {toString} b {constructor}');
  });
});

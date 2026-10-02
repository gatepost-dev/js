// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { isLegacy, normalize, parse, stateName } from '../src/index.js';
import { MAX_INPUT_CODE_POINTS } from '../src/spec-data.js';

// The grammar says that no shared vector holds text that is not well-formed, so each SDK tests
// that text itself. In JavaScript, a lone surrogate is such text.
const LONE_HIGH = String.fromCharCode(0xd83d);
const LONE_LOW = String.fromCharCode(0xde80);
const POSTCODE = 'EK01A03FK01';
const FULL_WIDTH_AB = String.fromCodePoint(0xff21, 0xff22);
const FULL_WIDTH_CD = String.fromCodePoint(0xff23, 0xff24);
const COMBINING_ACUTE = String.fromCodePoint(0x301);
const MODIFIER_CAPITAL_S = String.fromCodePoint(0xa7f1);
const BAD_CHARACTER = {
  ok: false,
  error: { code: 'bad_character', segment: null, suggestion: null },
};

describe('text that is not well-formed', () => {
  it.each([
    { place: 'after a code', text: `${POSTCODE}${LONE_HIGH}` },
    { place: 'before a code', text: `${LONE_LOW}${POSTCODE}` },
    { place: 'inside a segment', text: `EK01A${LONE_HIGH}3FK01` },
  ])('rejects a lone surrogate $place with bad_character', ({ text }) => {
    expect(parse(text)).toEqual(BAD_CHARACTER);
  });

  it('gives bad_character at 64 lone surrogates and bad_length at 65', () => {
    expect(parse(LONE_HIGH.repeat(MAX_INPUT_CODE_POINTS))).toEqual(BAD_CHARACTER);
    expect(parse(LONE_HIGH.repeat(MAX_INPUT_CODE_POINTS + 1))).toEqual({
      ok: false,
      error: { code: 'bad_length', segment: null, suggestion: null },
    });
  });

  it('gives false from isLegacy', () => {
    expect(isLegacy(`900108${LONE_HIGH}`)).toBe(false);
    expect(isLegacy(`900${LONE_LOW}108`)).toBe(false);
  });

  it('keeps each lone surrogate in normalize and normalises each side of it on its own', () => {
    expect(normalize(`${FULL_WIDTH_AB}${LONE_HIGH}${FULL_WIDTH_CD}`)).toBe(`AB${LONE_HIGH}CD`);
    // A combining mark after a lone surrogate does not join the letter before the surrogate.
    expect(normalize(`a${LONE_HIGH}${COMBINING_ACUTE}`)).toBe(`A${LONE_HIGH}${COMBINING_ACUTE}`);
  });

  it('does not throw for any function', () => {
    expect(() => {
      parse(LONE_HIGH);
      isLegacy(LONE_LOW);
      normalize(LONE_HIGH);
      stateName(LONE_LOW);
    }).not.toThrow();
  });
});

describe('the Unicode version of the runtime', () => {
  // The grammar takes Unicode 17.0 as the baseline. A runtime with an older version can give other
  // results for a character that a later version added. So the test runs only from 17.0.
  const version = Number.parseFloat(process.versions['unicode'] ?? '0');

  it.runIf(version >= 17)('changes the modifier letter capital S of Unicode 17.0 to S', () => {
    expect(normalize(MODIFIER_CAPITAL_S)).toBe('S');
  });
});

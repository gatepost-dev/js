// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import fc from 'fast-check';
import { describe, it } from 'vitest';
import {
  contains,
  isLegacy,
  normalize,
  parent,
  parse,
  truncate,
  type Postcode,
} from '../src/index.js';
import { upperAscii } from '../src/ascii.js';
import { isOverInputLimit } from '../src/input-limit.js';
import {
  MAX_INPUT_CODE_POINTS,
  PRECISION_ORDER,
  SEGMENT_BOUNDS,
  STATES,
} from '../src/spec-data.js';

const LETTERS = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
const DIGITS = Array.from('0123456789');
const INVISIBLE_OR_DASH = [0x2013, 0xa0, 0x200b].map((code) => String.fromCodePoint(code));
const SEPARATORS = [' ', '-', '.', ...INVISIBLE_OR_DASH];

const letter = fc.constantFrom(...LETTERS);
const digit = fc.constantFrom(...DIGITS);
const twoLetters = fc.tuple(letter, letter).map((pair) => pair.join(''));
const number01to99 = fc.integer({ min: 1, max: 99 }).map((n) => String(n).padStart(2, '0'));
const districtCharacter = fc.constantFrom(...LETTERS, ...DIGITS);
const district = fc
  .tuple(districtCharacter, districtCharacter, districtCharacter)
  .map((characters) => characters.join(''));
const validCode = fc
  .tuple(fc.constantFrom(...STATES.keys()), number01to99, district, twoLetters, number01to99)
  .map((segments) => segments.join(''));

describe('parse properties', () => {
  it('parses every valid code and keeps its forms consistent', () => {
    fc.assert(
      fc.property(validCode, (compact) => {
        const result = parse(compact);
        return (
          result.ok &&
          result.value.compact === compact &&
          result.value.canonical.replaceAll('-', '') === compact &&
          result.value.display.replaceAll(' ', '') === compact
        );
      }),
    );
  });

  it('gives the same postcode when separators sit between characters', () => {
    const gaps = fc.array(fc.constantFrom(...SEPARATORS), { minLength: 11, maxLength: 11 });
    fc.assert(
      fc.property(validCode, gaps, (compact, separators) => {
        const spaced = Array.from(compact, (char, index) => char + (separators[index] ?? ''));
        const result = parse(spaced.join(''));
        return result.ok && result.value.compact === compact;
      }),
    );
  });

  it('never throws, whatever the input', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), fc.boolean(), (input, allowPartial) => {
        return typeof parse(input, { allowPartial }).ok === 'boolean';
      }),
    );
  });

  it('suggests only codes that parse', () => {
    const typo = fc.constantFrom('O', 'I', 'L', '0', '1');
    fc.assert(
      fc.property(validCode, fc.integer({ min: 0, max: 10 }), typo, (compact, index, char) => {
        const result = parse(compact.slice(0, index) + char + compact.slice(index + 1));
        if (result.ok || result.error.suggestion === null) {
          return true;
        }
        return parse(result.error.suggestion).ok;
      }),
    );
  });

  it('rejects a digit in the area as a bad segment, wherever it sits', () => {
    const areaIndex = fc.integer({
      min: SEGMENT_BOUNDS.area.start,
      max: SEGMENT_BOUNDS.area.end - 1,
    });
    fc.assert(
      fc.property(validCode, areaIndex, digit, (compact, index, char) => {
        const result = parse(compact.slice(0, index) + char + compact.slice(index + 1));
        return !result.ok && result.error.code === 'bad_segment' && result.error.segment === 'area';
      }),
    );
  });

  it('normalises ASCII input completely in one pass', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary-ascii' }), (input) => {
        return normalize(normalize(input)) === normalize(input);
      }),
    );
  });
});

describe('upperAscii properties', () => {
  // A table lookup per character, so that it shares no logic with the regular expression.
  const upperOf = new Map(LETTERS.map((upper) => [upper.toLowerCase(), upper] as const));
  function referenceUpperAscii(text: string): string {
    return Array.from(text, (character) => upperOf.get(character) ?? character).join('');
  }

  // Random code units rarely give a letter, so the text also draws from a to z and from the
  // characters that toUpperCase changes, such as the dotless i that it turns into an ASCII I.
  const lowerLetter = fc.constantFrom(...upperOf.keys());
  const changedByToUpperCase = fc
    .integer({ min: 0x80, max: 0xffff })
    .map((code) => String.fromCharCode(code))
    .filter((unit) => unit.toUpperCase() !== unit);
  const anyCodeUnit = fc.string({ unit: 'binary', minLength: 1, maxLength: 1 });
  const mixedText = fc.string({
    unit: fc.oneof(lowerLetter, changedByToUpperCase, anyCodeUnit),
  });

  it('changes a to z to upper case and keeps every other code unit', () => {
    fc.assert(
      fc.property(mixedText, (text) => {
        return upperAscii(text) === referenceUpperAscii(text);
      }),
    );
  });
});

describe('input limit properties', () => {
  const astralCharacter = fc
    .integer({ min: 0x10000, max: 0x10ffff })
    .map((code) => String.fromCodePoint(code));
  const surrogate = fc
    .integer({ min: 0xd800, max: 0xdfff })
    .map((code) => String.fromCodePoint(code));
  // Two surrogates side by side can form one pair. The reference counts the finished string.
  const textNearLimit = fc
    .array(fc.oneof(letter, astralCharacter, surrogate), {
      minLength: MAX_INPUT_CODE_POINTS - 3,
      maxLength: MAX_INPUT_CODE_POINTS + 3,
    })
    .map((characters) => characters.join(''));

  it('is over the limit exactly when the text has more code points than the limit', () => {
    fc.assert(
      fc.property(textNearLimit, (text) => {
        return isOverInputLimit(text) === Array.from(text).length > MAX_INPUT_CODE_POINTS;
      }),
    );
  });
});

describe('isLegacy properties', () => {
  const separator = fc.constantFrom(...SEPARATORS);
  const separatorRun = fc.string({ unit: separator, maxLength: 3 });
  function digitsWithGaps(count: { min: number; max: number }): fc.Arbitrary<string> {
    return fc
      .array(fc.tuple(separatorRun, digit), { minLength: count.min, maxLength: count.max })
      .map((groups) => groups.map(([gap, char]) => gap + char).join(''));
  }
  // Six digits make a legacy postcode, so 5 and 7 digits are the near misses.
  const nearLegacy = digitsWithGaps({ min: 5, max: 7 });
  // Six digits padded with separators to a length at, just under and just over the limit.
  const paddedLegacy = fc
    .tuple(
      digitsWithGaps({ min: 6, max: 6 }),
      separator,
      fc.integer({ min: MAX_INPUT_CODE_POINTS - 2, max: MAX_INPUT_CODE_POINTS + 2 }),
    )
    .map(([text, padding, length]) => text.padEnd(length, padding));
  const legacyCandidate = fc.oneof(nearLegacy, paddedLegacy, fc.string({ unit: 'binary' }));

  it('is true exactly when parse fails with legacy_code', () => {
    fc.assert(
      fc.property(legacyCandidate, (input) => {
        const result = parse(input);
        return isLegacy(input) === (!result.ok && result.error.code === 'legacy_code');
      }),
    );
  });
});

describe('hierarchy properties', () => {
  // Counts the parent calls that return a postcode. The bound stops a parent that never ends.
  function countParents(code: Postcode): number {
    let count = 0;
    let next = parent(code);
    while (next !== null && count <= PRECISION_ORDER.length) {
      count += 1;
      next = parent(next);
    }
    return count;
  }

  it('truncate, contains and parent agree for every precision of a valid code', () => {
    fc.assert(
      fc.property(validCode, fc.constantFrom(...PRECISION_ORDER), (compact, to) => {
        const result = parse(compact);
        if (!result.ok) {
          return false;
        }
        const cut = truncate(result.value, to);
        return (
          cut.precision === to &&
          contains(cut, result.value) &&
          countParents(cut) === PRECISION_ORDER.indexOf(to)
        );
      }),
    );
  });
});

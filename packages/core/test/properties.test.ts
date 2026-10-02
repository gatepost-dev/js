// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
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

// 100 runs let a parser that rejects an all-digit district pass 12 executions in 100. 1000 runs
// let it pass none, and they add under 1 second.
fc.configureGlobal({ numRuns: 1000 });

const FORMAT_FILE = new URL('../../../spec/data/format.json', import.meta.url);
const LETTERS = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
const DIGITS = Array.from('0123456789');
const specFormat = JSON.parse(readFileSync(FORMAT_FILE, 'utf8')) as {
  readonly separators: string[];
};
// Every separator that the spec lists, so that a separator that normalize misses fails a property.
const SEPARATORS = specFormat.separators.map((codePoint) =>
  String.fromCodePoint(Number.parseInt(codePoint.slice('U+'.length), 16)),
);
const SEGMENT_ENDS = PRECISION_ORDER.map((name) => SEGMENT_BOUNDS[name].end);

const letter = fc.constantFrom(...LETTERS);
const digit = fc.constantFrom(...DIGITS);
const typo = fc.constantFrom('O', 'I', 'L', '0', '1');
const separator = fc.constantFrom(...SEPARATORS);
const separatorRun = fc.string({ unit: separator, maxLength: 3 });
// One code point of any value, but never a lone surrogate: fast-check's 'binary' unit omits them.
const anyCodePoint = fc.string({ unit: 'binary', minLength: 1, maxLength: 1 });
// A surrogate code unit. Next to a surrogate of the other kind it forms a pair.
const loneSurrogate = fc
  .integer({ min: 0xd800, max: 0xdfff })
  .map((unit) => String.fromCharCode(unit));
const anyCharacter = fc.oneof(anyCodePoint, loneSurrogate);
const twoLetters = fc.tuple(letter, letter).map((pair) => pair.join(''));
const number01to99 = fc.integer({ min: 1, max: 99 }).map((n) => String(n).padStart(2, '0'));
const districtCharacter = fc.constantFrom(...LETTERS, ...DIGITS);
const district = fc
  .tuple(districtCharacter, districtCharacter, districtCharacter)
  .map((characters) => characters.join(''));
const validSegments = fc.tuple(
  fc.constantFrom(...STATES.keys()),
  number01to99,
  district,
  twoLetters,
  number01to99,
);
const validCode = validSegments.map((segments) => segments.join(''));

function parseValid(compact: string): Postcode {
  const result = parse(compact);
  if (!result.ok) {
    throw new Error(`parse rejected the valid code ${compact}: ${result.error.code}`);
  }
  return result.value;
}

// The gap lists are one longer than the code, so a missing gap means a wrong test.
function gapAt(gaps: readonly string[], index: number): string {
  const gap = gaps[index];
  if (gap === undefined) {
    throw new RangeError(`Gap ${String(index)} is missing from a list of ${String(gaps.length)}.`);
  }
  return gap;
}

describe('parse properties', () => {
  it('parses every valid code and keeps its forms consistent', () => {
    fc.assert(
      fc.property(validSegments, (segments) => {
        const compact = segments.join('');
        const code = parseValid(compact);
        expect(code.compact).toBe(compact);
        expect(code.canonical).toBe(segments.join('-'));
        expect(code.display.replaceAll(' ', '')).toBe(compact);
      }),
    );
  });

  it('gives the same postcode when separators sit between characters', () => {
    const gaps = fc.array(separatorRun, {
      minLength: SEGMENT_BOUNDS.unit.end + 1,
      maxLength: SEGMENT_BOUNDS.unit.end + 1,
    });
    fc.assert(
      fc.property(validCode, gaps, (compact, runs) => {
        const spaced = Array.from(compact, (char, index) => gapAt(runs, index) + char);
        const result = parse(spaced.join('') + gapAt(runs, compact.length));
        return result.ok && result.value.compact === compact;
      }),
    );
  });

  it('never throws, whatever the input', () => {
    const cutCode = fc
      .tuple(validCode, fc.constantFrom(...SEGMENT_ENDS))
      .map(([compact, end]) => compact.slice(0, end));
    // The change keeps the code at the length of a segment end, so partial codes get typos too.
    const changedCode = fc
      .tuple(validCode, fc.constantFrom(...SEGMENT_ENDS))
      .chain(([compact, end]) =>
        fc
          .tuple(fc.integer({ min: 0, max: end - 1 }), fc.oneof(letter, digit, typo, anyCharacter))
          .map(([index, char]) => compact.slice(0, index) + char + compact.slice(index + 1, end)),
      );
    const anyInput = fc.oneof(fc.string({ unit: anyCharacter }), cutCode, changedCode);
    fc.assert(
      fc.property(anyInput, fc.boolean(), (input, allowPartial) => {
        return typeof parse(input, { allowPartial }).ok === 'boolean';
      }),
    );
  });

  // Rejects a bad suggestion only. The parse-segments vectors check the suggestions themselves.
  it('suggests only codes that parse', () => {
    fc.assert(
      fc.property(
        validCode,
        fc.integer({ min: 0, max: SEGMENT_BOUNDS.unit.end - 1 }),
        typo,
        (compact, index, char) => {
          const result = parse(compact.slice(0, index) + char + compact.slice(index + 1));
          if (result.ok || result.error.suggestion === null) {
            return true;
          }
          return parse(result.error.suggestion).ok;
        },
      ),
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

  // Rejects a normalize that needs two passes only. The normalize vectors check what it changes.
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

  // Random characters rarely give a letter, and fast-check's 'binary' unit omits lone
  // surrogates. So the text also draws from a to z, from the characters that toUpperCase
  // changes, from look-alikes of ASCII letters and from lone surrogates.
  const lowerLetter = fc.constantFrom(...upperOf.keys());
  const changedByToUpperCase = fc
    .integer({ min: 0x80, max: 0xffff })
    .map((code) => String.fromCharCode(code))
    .filter((unit) => unit.toUpperCase() !== unit);
  // The dotless i, the long s, the Kelvin sign, the sharp s and the fi ligature.
  const lookAlike = fc.constantFrom(
    ...[0x131, 0x17f, 0x212a, 0xdf, 0xfb01].map((code) => String.fromCodePoint(code)),
  );
  const mixedText = fc.string({
    unit: fc.oneof(lowerLetter, changedByToUpperCase, lookAlike, anyCodePoint, loneSurrogate),
  });

  it('changes a to z to upper case and keeps every other character, lone surrogates too', () => {
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
  // Two surrogates side by side can form one pair. The reference counts the finished string.
  const textNearLimit = fc
    .array(fc.oneof(letter, astralCharacter, loneSurrogate), {
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
  const legacyCandidate = fc.oneof(nearLegacy, paddedLegacy, fc.string({ unit: anyCharacter }));

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

  it('truncate, contains, parent and parse agree for every precision of a valid code', () => {
    fc.assert(
      fc.property(validCode, fc.constantFrom(...PRECISION_ORDER), (compact, to) => {
        const code = parseValid(compact);
        const cut = truncate(code, to);
        expect(cut.precision).toBe(to);
        expect(contains(cut, code)).toBe(true);
        expect(countParents(cut)).toBe(PRECISION_ORDER.indexOf(to));
        expect(parse(cut.compact, { allowPartial: true })).toEqual({ ok: true, value: cut });
      }),
    );
  });
});

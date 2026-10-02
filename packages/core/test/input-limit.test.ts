// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { isOverInputLimit } from '../src/input-limit.js';
import { MAX_INPUT_CODE_POINTS } from '../src/spec-data.js';

// U+1D404 takes 2 UTF-16 units. U+D83D is a high surrogate that has no partner.
const BEYOND_BMP = String.fromCodePoint(0x1d404);
const LONE_SURROGATE = String.fromCodePoint(0xd83d);
// A family emoji: 7 code points that show as 1 grapheme cluster.
const FAMILY = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466);

const SINGLE_CODE_POINTS = [
  { description: 'letters', codePoint: 'A' },
  { description: 'letters that take 2 UTF-16 units', codePoint: BEYOND_BMP },
  { description: 'lone surrogates', codePoint: LONE_SURROGATE },
];

describe('isOverInputLimit', () => {
  it.each(SINGLE_CODE_POINTS)(
    'accepts $description up to the limit and rejects one more',
    ({ codePoint }) => {
      expect(isOverInputLimit(codePoint.repeat(MAX_INPUT_CODE_POINTS))).toBe(false);
      expect(isOverInputLimit(codePoint.repeat(MAX_INPUT_CODE_POINTS + 1))).toBe(true);
    },
  );

  it('counts the code points of an emoji sequence, not its grapheme clusters', () => {
    expect(isOverInputLimit(FAMILY.repeat(9))).toBe(false);
    expect(isOverInputLimit(FAMILY.repeat(10))).toBe(true);
  });
});

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { readText } from '../src/reading.js';

describe('readText', () => {
  it('reads a whole postcode in any spacing and letter case', () => {
    const reading = readText(' fc 01 z99-zz 01 ');
    expect(reading.kind === 'postcode' && reading.postcode.canonical).toBe('FC-01-Z99-ZZ-01');
  });

  it('reads text of separators only as empty', () => {
    expect(readText(' - ')).toEqual({ kind: 'empty' });
  });

  it('reads an old 6-digit postcode as legacy, with its digits', () => {
    expect(readText('900 108')).toEqual({ kind: 'legacy', digits: '900108' });
  });

  it('reads a partial postcode as too short, and counts its characters without separators', () => {
    expect(readText('FC-01-Z99')).toEqual({
      kind: 'error',
      code: 'bad_length',
      segment: null,
      suggestion: null,
      count: 7,
    });
  });

  it('keeps the suggestion of the core for a letter O in a digit segment', () => {
    const reading = readText('FCO1Z99ZZ01');
    expect(reading.kind === 'error' && reading.code).toBe('bad_segment');
    expect(reading.kind === 'error' && reading.segment).toBe('lga');
    expect(reading.kind === 'error' && reading.suggestion?.display).toBe('FC 01 Z99 ZZ 01');
  });

  it('counts the normalised text up to the input limit, and the raw text above it', async () => {
    const format = JSON.parse(await commands.readFile('../../spec/data/format.json')) as {
      maxInputCodePoints: number;
    };
    const limit = format.maxInputCodePoints;
    const atLimit = readText('F' + ' '.repeat(limit - 1));
    const overLimit = readText('F' + ' '.repeat(limit));
    expect(atLimit.kind === 'error' && atLimit.count).toBe(1);
    expect(overLimit.kind === 'error' && overLimit.count).toBe(limit + 1);
  });

  it('counts code points, not UTF-16 units, at the limit and above it', () => {
    const emoji = String.fromCodePoint(0x1f600);
    const inside = readText(emoji.repeat(33));
    const above = readText(emoji.repeat(65));
    expect(inside.kind === 'error' && inside.code).toBe('bad_character');
    expect(inside.kind === 'error' && inside.count).toBe(33);
    expect(above.kind === 'error' && above.count).toBe(65);
  });

  it('reads full-width digits of an old postcode as ASCII digits', () => {
    const fullWidth = Array.from('900108', (digit) =>
      String.fromCodePoint(digit.charCodeAt(0) + 0xfee0),
    ).join('');
    expect(readText(fullWidth)).toEqual({ kind: 'legacy', digits: '900108' });
  });
});

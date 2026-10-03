// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { PostcodeFieldElement, SPEC_VERSION } from '../src/index.js';

const BLOCK = /```(\w+)\n([\s\S]*?)```/g;

// The code blocks of the @example tags of one source file, without the leading " * ".
async function examples(file: string): Promise<{ language: string; code: string }[]> {
  const source = await commands.readFile(`src/${file}`);
  const comments = source.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
  const text = comments.map((comment) => comment.replace(/^\s*\* ?/gm, '')).join('\n');
  return [...text.matchAll(BLOCK)].map(([, language, code]) => ({
    language: language!,
    code: code!,
  }));
}

describe('TSDoc examples', () => {
  it('run the HTML example of the element as a page would', async () => {
    const [example] = await examples('element.ts');
    expect(example?.language).toBe('html');
    document.body.innerHTML = example!.code;
    const field = document.querySelector('gatepost-postcode-field');
    expect(field).toBeInstanceOf(PostcodeFieldElement);
    expect(new FormData(document.querySelector('form')!).has('postcode')).toBe(true);
  });

  it('state the spec version that SPEC_VERSION holds', async () => {
    const [example] = await examples('version.ts');
    expect(example?.code).toContain(`SPEC_VERSION; // '${SPEC_VERSION}'`);
  });
});

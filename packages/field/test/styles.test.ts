// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import { mount } from './field.js';

// The relative luminance and the contrast ratio of WCAG 2.2, for colours written #rrggbb.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrast(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

function token(element: Element, name: string): string {
  return getComputedStyle(element).getPropertyValue(`--gatepost-${name}`).trim();
}

describe('the theme tokens', () => {
  it.each(['text', 'muted', 'accent', 'error', 'warning'])(
    'give the %s colour a contrast of 4.5:1 or more on the background',
    (name) => {
      const { field } = mount('<gatepost-postcode-field></gatepost-postcode-field>');
      expect(contrast(token(field, name), token(field, 'background'))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('give the border a contrast of 3:1 or more on the background', () => {
    const { field } = mount('<gatepost-postcode-field></gatepost-postcode-field>');
    expect(contrast(token(field, 'border'), token(field, 'background'))).toBeGreaterThanOrEqual(3);
  });

  it('take the value that the page sets on the element', () => {
    const { field } = mount(
      '<gatepost-postcode-field style="--gatepost-accent: #123456"></gatepost-postcode-field>',
    );
    expect(token(field.shadowRoot!.querySelector('button')!, 'accent')).toBe('#123456');
  });
});

// The rules of the README's dark example, as the text of a style attribute. Reading the README
// keeps the example and the test together.
async function readmeDarkTokens(): Promise<string> {
  const readme = await commands.readFile('README.md');
  const block = /```css\n([\s\S]*?)```/.exec(readme)?.[1];
  const body = block === undefined ? undefined : /\{([\s\S]*)\}/.exec(block)?.[1];
  if (body === undefined) {
    throw new Error('The README holds no css example.');
  }
  return body.replaceAll(/\s+/g, ' ').trim();
}

// The ids of the axe rules that the field breaks, in each state with a colour of its own: quiet,
// valid (accent), a legacy postcode (warning), and a mistake with a suggestion (error).
async function violationsOnDarkPage(style: string): Promise<string[]> {
  document.body.style.background = '#111111';
  try {
    const { input, suggestion } = mount(
      `<gatepost-postcode-field style="${style}"></gatepost-postcode-field>`,
    );
    const ids = new Set<string>();
    const collect = async (): Promise<void> => {
      const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
      const results = await axe.run(document.body, { runOnly: { type: 'tag', values: tags } });
      results.violations.forEach((violation) => ids.add(violation.id));
    };
    await collect();
    for (const text of ['FC01Z99ZZ01', '123456', 'FCO1Z99ZZ01']) {
      await userEvent.clear(input);
      await userEvent.type(input, text);
      await userEvent.tab();
      await collect();
    }
    expect(suggestion.hidden).toBe(false);
    return [...ids];
  } finally {
    document.body.style.background = '';
  }
}

describe('a dark page', () => {
  it('passes axe with the tokens of the README, in each coloured state', async () => {
    expect(await violationsOnDarkPage(await readmeDarkTokens())).toEqual([]);
  });

  it('fails the colour contrast with no tokens, so the test above can fail', async () => {
    expect(await violationsOnDarkPage('')).toContain('color-contrast');
  });
});

describe('the shadow tree', () => {
  it('is built with no HTML string, so a Trusted Types policy accepts it', () => {
    const setter = vi.fn();
    const property = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'innerHTML')!;
    Object.defineProperty(ShadowRoot.prototype, 'innerHTML', { set: setter, configurable: true });
    try {
      const { input } = mount('<gatepost-postcode-field></gatepost-postcode-field>');
      expect(input).toBeInstanceOf(HTMLInputElement);
      expect(setter).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(ShadowRoot.prototype, 'innerHTML', property);
    }
  });
});

describe('the input', () => {
  it('keeps a target of at least 24 by 24 pixels, and a text size of 16 pixels or more', () => {
    const { input } = mount('<gatepost-postcode-field></gatepost-postcode-field>');
    const box = input.getBoundingClientRect();
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
    expect(Number.parseFloat(getComputedStyle(input).fontSize)).toBeGreaterThanOrEqual(16);
  });

  it('keeps the same target size for the suggestion button', async () => {
    const { input, suggestion } = mount('<gatepost-postcode-field></gatepost-postcode-field>');
    await userEvent.type(input, 'FCO1Z99ZZ01');
    const box = suggestion.getBoundingClientRect();
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  });
});

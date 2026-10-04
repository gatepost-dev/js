// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import { SPEC_VERSION } from '../src/index.js';
import { AddressForm } from './readme-example.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('README', () => {
  it('holds the quickstart that this test runs, line for line', async () => {
    const readme = await commands.readFile('README.md');
    const example = await commands.readFile('test/readme-example.tsx');
    const quickstart = /## Quickstart\n\n```tsx\n([\s\S]*?)```/.exec(readme)?.[1];
    expect(quickstart).toBe(example.split('\n').slice(2).join('\n'));
    expect(readme).toContain('> Unofficial. Not made or endorsed by NIPOST.');
    expect(readme).toMatch(new RegExp(`Gatepost spec \\| ${SPEC_VERSION.replaceAll('.', '\\.')} `));
  });

  it('says that the first alpha is not on npm yet', async () => {
    const readme = await commands.readFile('README.md');
    expect(readme).toContain('The first alpha is not on npm yet');
  });

  it('shows the canonical form of a typed postcode, as the quickstart says', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(createElement(AddressForm));
    });
    const field = container.querySelector('gatepost-postcode-field');
    await userEvent.type(field!.shadowRoot!.querySelector('input')!, 'fc 01 z99 zz 01');
    expect(container.querySelector('p')?.textContent).toBe('FC-01-Z99-ZZ-01');
    act(() => {
      root.unmount();
    });
  });
});

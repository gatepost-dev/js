// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import axe from 'axe-core';
import { afterEach, expect } from 'vitest';
import { PostcodeFieldElement, type ChangeDetail } from '../src/index.js';

/** A field in a form, with the parts of its shadow tree that a user sees. */
export interface Mounted {
  readonly form: HTMLFormElement;
  readonly field: PostcodeFieldElement;
  readonly input: HTMLInputElement;
  readonly label: HTMLLabelElement;
  readonly suggestion: HTMLButtonElement;
  /** The text of the live region, as a screen reader reads it. */
  readonly message: () => string;
  /** The details of each `gatepost-change` so far. */
  readonly changes: ChangeDetail[];
}

afterEach(() => {
  document.body.replaceChildren();
});

function part<T extends Element>(
  field: PostcodeFieldElement,
  selector: string,
  type: new () => T,
): T {
  const element = field.shadowRoot!.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`The field has no ${type.name} at ${selector}.`);
  }
  return element;
}

/**
 * Puts the HTML in a form in the page, and returns the first field in it.
 */
export function mount(html: string): Mounted {
  const form = document.createElement('form');
  form.innerHTML = html;
  document.body.append(form);
  const field = form.querySelector('gatepost-postcode-field');
  if (!(field instanceof PostcodeFieldElement)) {
    throw new Error('The HTML holds no gatepost-postcode-field.');
  }
  const changes: ChangeDetail[] = [];
  field.addEventListener('gatepost-change', (event) => {
    changes.push((event as CustomEvent<ChangeDetail>).detail);
  });
  const message = part(field, '#message', HTMLDivElement);
  return {
    form,
    field,
    input: part(field, '#input', HTMLInputElement),
    label: part(field, 'label', HTMLLabelElement),
    suggestion: part(field, '#suggestion', HTMLButtonElement),
    message: () => message.innerText.replace(/\s+/g, ' ').trim(),
    changes,
  };
}

/**
 * Checks the page with axe for the WCAG 2.2 A and AA rules, and expects no violation.
 */
export async function expectAccessible(): Promise<void> {
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  const results = await axe.run(document.body, { runOnly: { type: 'tag', values: tags } });
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

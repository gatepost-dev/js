// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { State } from './state.js';
import { STYLES } from './styles.js';

/**
 * The parts of the shadow tree that the element changes after it builds the tree.
 *
 * @internal
 */
export interface View {
  readonly field: HTMLElement;
  readonly label: HTMLLabelElement;
  readonly hint: HTMLElement;
  readonly input: HTMLInputElement;
  readonly note: HTMLElement;
  readonly didYouMean: HTMLElement;
  readonly suggestion: HTMLButtonElement;
  readonly location: HTMLButtonElement;
}

function make<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  attributes: Readonly<Record<string, string>>,
  ...children: readonly Node[]
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  element.append(...children);
  return element;
}

// The shadow tree is built with DOM calls and no HTML string, so a page with a Trusted Types
// policy can show it. The DOM order is the visual order and the tab order: the input, the
// suggestion button, then the location button. The live region holds the two messages, and not
// the buttons.
function buildTree(): HTMLElement {
  const button = (id: string): HTMLButtonElement =>
    make('button', { id, class: 'link', type: 'button', part: 'button', hidden: '' });
  return make(
    'div',
    { class: 'field', part: 'field', 'data-state': 'idle' },
    make('label', { for: 'input', part: 'label' }),
    make('p', { id: 'hint', class: 'hint', part: 'hint' }),
    make('input', {
      id: 'input',
      part: 'input',
      type: 'text',
      autocomplete: 'postal-code',
      autocapitalize: 'characters',
      spellcheck: 'false',
      enterkeyhint: 'done',
      'aria-describedby': 'hint message',
    }),
    make(
      'div',
      { id: 'message', class: 'message', part: 'message', role: 'status' },
      make('p', { id: 'note' }),
      make('p', { id: 'did-you-mean', hidden: '' }),
    ),
    button('suggestion'),
    button('location'),
  );
}

let sheet: CSSStyleSheet | undefined;

function find<T extends Element>(root: ShadowRoot, selector: string, type: new () => T): T {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) {
    throw new TypeError(`The shadow tree has no ${type.name} at ${selector}.`);
  }
  return element;
}

/**
 * Builds the shadow tree of one field. The fields share one style sheet, which the first field
 * makes, so importing the module does no work (PERF-2).
 *
 * @param root - The shadow root of the field.
 * @returns The parts that the field changes.
 * @internal
 */
export function buildView(root: ShadowRoot): View {
  if (sheet === undefined) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
  }
  root.adoptedStyleSheets = [sheet];
  root.replaceChildren(buildTree());
  return {
    field: find(root, '.field', HTMLDivElement),
    label: find(root, 'label', HTMLLabelElement),
    hint: find(root, '#hint', HTMLParagraphElement),
    input: find(root, '#input', HTMLInputElement),
    note: find(root, '#note', HTMLParagraphElement),
    didYouMean: find(root, '#did-you-mean', HTMLParagraphElement),
    suggestion: find(root, '#suggestion', HTMLButtonElement),
    location: find(root, '#location', HTMLButtonElement),
  };
}

/**
 * What the shadow tree shows. The element works it out, and `renderView` writes it.
 *
 * @internal
 */
export interface Display {
  readonly state: State;
  readonly invalid: boolean;
  readonly required: boolean;
  readonly rejected: boolean;
  readonly label: string;
  readonly hint: string;
  readonly note: string;
  readonly didYouMean: string | null;
  readonly useSuggestion: string;
  readonly useLocation: string | null;
}

// A write of the same text still replaces the text node, and a screen reader can read a live
// region again for it. So the view writes a text only when it differs.
function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

/**
 * Writes a display into the shadow tree. Text goes in as text, never as HTML, because a page
 * can give its own messages.
 *
 * @param view - The parts of the shadow tree.
 * @param display - What to show.
 * @internal
 */
export function renderView(view: View, display: Display): void {
  view.field.dataset['state'] = display.state;
  view.field.toggleAttribute('data-rejected', display.rejected);
  setText(view.label, display.label);
  setText(view.hint, display.hint);
  view.input.setAttribute('aria-invalid', String(display.invalid));
  view.input.setAttribute('aria-required', String(display.required));
  setText(view.note, display.note);
  view.didYouMean.hidden = display.didYouMean === null;
  setText(view.didYouMean, display.didYouMean ?? '');
  view.suggestion.hidden = display.didYouMean === null;
  setText(view.suggestion, display.useSuggestion);
  view.location.hidden = display.useLocation === null;
  setText(view.location, display.useLocation ?? '');
}

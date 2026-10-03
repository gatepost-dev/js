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
}

// The DOM order is the visual order and the tab order. The live region holds the two messages,
// and not the button.
const TEMPLATE = `
<div class="field" part="field" data-state="idle">
  <label for="input" part="label"></label>
  <p id="hint" class="hint" part="hint"></p>
  <input id="input" part="input" type="text" autocomplete="postal-code"
    autocapitalize="characters" spellcheck="false" enterkeyhint="done"
    aria-describedby="hint message">
  <div id="message" class="message" part="message" role="status">
    <p id="note"></p>
    <p id="did-you-mean" hidden></p>
  </div>
  <button id="suggestion" class="link" type="button" part="button" hidden></button>
</div>`;

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
  root.innerHTML = TEMPLATE;
  return {
    field: find(root, '.field', HTMLDivElement),
    label: find(root, 'label', HTMLLabelElement),
    hint: find(root, '#hint', HTMLParagraphElement),
    input: find(root, '#input', HTMLInputElement),
    note: find(root, '#note', HTMLParagraphElement),
    didYouMean: find(root, '#did-you-mean', HTMLParagraphElement),
    suggestion: find(root, '#suggestion', HTMLButtonElement),
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
  readonly rejected: boolean;
  readonly label: string;
  readonly hint: string;
  readonly note: string;
  readonly didYouMean: string | null;
  readonly useSuggestion: string;
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
  view.label.textContent = display.label;
  view.hint.textContent = display.hint;
  view.input.setAttribute('aria-invalid', String(display.invalid));
  view.note.textContent = display.note;
  view.didYouMean.hidden = display.didYouMean === null;
  view.didYouMean.textContent = display.didYouMean ?? '';
  view.suggestion.hidden = display.didYouMean === null;
  view.suggestion.textContent = display.useSuggestion;
}

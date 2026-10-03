// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { fill } from './messages.js';
import { readText, type Reading } from './reading.js';
import { ENGLISH, type Messages } from './spec-messages.js';
import { readingNote, readingState, type Note, type State } from './state.js';
import type { ChangeDetail, ChangeSource } from './types.js';
import { buildView, renderView, type View } from './view.js';

interface Events {
  'gatepost-change': ChangeDetail;
}

// A change of these attributes changes the validity. The others change the view.
const CHECKED_ATTRIBUTES = new Set(['required', 'legacy']);

// A server has no HTMLElement. Object stands in, so a server can import the module, and the
// guard in index.ts keeps the server from defining the element.
const ElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (Object as unknown as typeof HTMLElement) : HTMLElement;

/**
 * The postcode field, `<gatepost-postcode-field>`. A plain HTML form submits its form value: the
 * canonical form of the postcode. It checks the format offline.
 *
 * @example
 * ```html
 * <form method="post" action="/address">
 *   <gatepost-postcode-field name="postcode" required></gatepost-postcode-field>
 *   <button>Save</button>
 * </form>
 * ```
 */
export class PostcodeFieldElement extends ElementBase {
  /** Makes the element a form control, so a form submits its form value. */
  static readonly formAssociated = true;

  /** The attributes that change the field when a page sets them. */
  static readonly observedAttributes: readonly string[] = ['label', 'value', 'required', 'legacy'];

  readonly #internals: ElementInternals;
  readonly #view: View;
  #messages: Messages = ENGLISH;
  #reading: Reading = { kind: 'empty' };
  #value = '';
  #source: ChangeSource = 'typed';
  #connected = false;
  #dirty = false;
  #errorsShown = false;

  /** Builds the shadow tree. The browser calls it when it creates the element. */
  constructor() {
    super();
    this.#internals = this.attachInternals();
    this.#view = buildView(this.attachShadow({ mode: 'open', delegatesFocus: true }));
    const { input, suggestion } = this.#view;
    input.addEventListener('beforeinput', (event) => {
      this.#source = event.inputType === 'insertFromPaste' ? 'pasted' : 'typed';
    });
    input.addEventListener('input', () => {
      this.#update(this.#source, null);
    });
    input.addEventListener('blur', () => {
      this.#leave();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        this.#internals.form?.requestSubmit();
      }
    });
    suggestion.addEventListener('click', () => {
      this.#useSuggestion();
    });
    this.addEventListener('invalid', () => {
      this.#errorsShown = true;
      this.#render();
    });
  }

  /**
   * The form value: the canonical form, the digits of a legacy postcode, or the trimmed text. A
   * new value goes into the input as typed text, and raises no `gatepost-change`.
   */
  get value(): string {
    return this.#value;
  }

  set value(text: string) {
    this.#dirty = true;
    this.#view.input.value = text;
    this.#refresh();
  }

  /**
   * The messages that the field shows, from the English catalogue of the spec. A new object
   * replaces messages by key, and a key that it leaves out keeps its English text.
   */
  get messages(): Messages {
    return this.#messages;
  }

  set messages(messages: Partial<Messages>) {
    this.#messages = { ...ENGLISH, ...messages };
    this.#setValidity();
    this.#render();
  }

  /** The form that holds the field, or null. */
  get form(): HTMLFormElement | null {
    return this.#internals.form;
  }

  /** The validity of the field, as for a native input. */
  get validity(): ValidityState {
    return this.#internals.validity;
  }

  /** The message that the browser shows for an invalid field, or an empty text. */
  get validationMessage(): string {
    return this.#internals.validationMessage;
  }

  /** True when a form checks the field before it submits. */
  get willValidate(): boolean {
    return this.#internals.willValidate;
  }

  /**
   * Checks the field as a form does before it submits.
   *
   * @returns True when the field is valid. Otherwise false, after an `invalid` event.
   */
  checkValidity(): boolean {
    return this.#internals.checkValidity();
  }

  /**
   * Checks the field, and shows its error to the user when it is invalid.
   *
   * @returns True when the field is valid.
   */
  reportValidity(): boolean {
    return this.#internals.reportValidity();
  }

  /** Reads the settings and checks the text. The browser calls it on insertion. */
  connectedCallback(): void {
    this.#connected = true;
    this.#refresh();
  }

  /**
   * Applies a changed attribute. The browser calls it.
   *
   * @param name - The name of the attribute.
   */
  attributeChangedCallback(name: string): void {
    const defaultText = name === 'value' && !this.#dirty;
    if (defaultText) {
      this.#view.input.value = this.getAttribute('value') ?? '';
    }
    if (!this.#connected) {
      return;
    }
    if (defaultText || CHECKED_ATTRIBUTES.has(name)) {
      this.#refresh();
    } else {
      this.#render();
    }
  }

  /** Puts the text of the `value` attribute back. The browser calls it when the form resets. */
  formResetCallback(): void {
    this.#dirty = false;
    this.#errorsShown = false;
    this.#view.input.value = this.getAttribute('value') ?? '';
    this.#refresh();
  }

  /**
   * Turns the controls off or on with the form. The browser calls it.
   *
   * @param disabled - True when the field or its fieldset is disabled.
   */
  formDisabledCallback(disabled: boolean): void {
    for (const control of [this.#view.input, this.#view.suggestion]) {
      control.disabled = disabled;
    }
  }

  /**
   * Puts back the text that the user had typed, for example after the back button. The
   * browser calls it.
   *
   * @param state - The text that the field saved with its form value.
   */
  formStateRestoreCallback(state: unknown): void {
    if (typeof state === 'string') {
      this.#view.input.value = state;
      this.#refresh();
    }
  }

  get #legacy(): 'accept' | 'reject' {
    return this.getAttribute('legacy') === 'reject' ? 'reject' : 'accept';
  }

  #update(source: ChangeSource, accuracyM: number | null): void {
    const before = this.#value;
    this.#dirty = true;
    this.#refresh();
    if (this.#value !== before) {
      const postcode = this.#reading.kind === 'postcode' ? this.#reading.postcode : null;
      this.#raise('gatepost-change', { value: this.#value, postcode, source, accuracyM });
    }
  }

  // The text or a setting changed: read the text again.
  #refresh(): void {
    const text = this.#view.input.value;
    const reading = readText(text);
    this.#reading = reading;
    if (reading.kind === 'postcode') {
      this.#value = reading.postcode.canonical;
    } else if (reading.kind === 'legacy' && this.#legacy === 'accept') {
      this.#value = reading.digits;
    } else {
      this.#value = text.trim();
    }
    this.#internals.setFormValue(this.#value, text);
    this.#setValidity();
    this.#render();
  }

  #setValidity(): void {
    const reading = this.#reading;
    const { input } = this.#view;
    if (reading.kind === 'empty' && this.hasAttribute('required')) {
      this.#internals.setValidity({ valueMissing: true }, this.#messages.empty, input);
    } else if (reading.kind === 'empty' || reading.kind === 'postcode') {
      this.#internals.setValidity({});
    } else if (reading.kind === 'legacy' && this.#legacy === 'accept') {
      this.#internals.setValidity({});
    } else {
      const note = readingNote(reading, this.#legacy);
      this.#internals.setValidity({ customError: true }, this.#text(note), input);
    }
  }

  #leave(): void {
    this.#errorsShown = true;
    if (this.#reading.kind === 'postcode') {
      this.#view.input.value = this.#reading.postcode.display;
      this.#internals.setFormValue(this.#value, this.#view.input.value);
    }
    this.#render();
  }

  #useSuggestion(): void {
    const reading = this.#reading;
    if (reading.kind === 'error' && reading.suggestion !== null) {
      this.#view.input.value = reading.suggestion.display;
      this.#update('suggestion', null);
      this.#view.input.focus();
    }
  }

  // The events bubble, so a page can listen on the form for each field in it.
  #raise<Type extends keyof Events>(type: Type, detail: Events[Type]): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }

  #text(note: Note): string {
    return fill(this.#messages[note.key], note.values ?? {});
  }

  #state(): State {
    const required = this.hasAttribute('required');
    return readingState(this.#reading, this.#errorsShown, required);
  }

  #noteText(state: State): string {
    if (state === 'idle' || state === 'typing') {
      return '';
    }
    return this.#text(readingNote(this.#reading, this.#legacy));
  }

  #suggestionText(state: State): string | null {
    const reading = this.#reading;
    if (state !== 'invalid' || reading.kind !== 'error' || reading.suggestion === null) {
      return null;
    }
    return fill(this.#messages.suggestion, { postcode: reading.suggestion.display });
  }

  #render(): void {
    const state = this.#state();
    const rejected = state === 'legacy' && this.#legacy === 'reject';
    renderView(this.#view, {
      state,
      invalid: state === 'invalid' || rejected,
      rejected,
      label: this.getAttribute('label') ?? this.#messages.label,
      hint: this.#messages.hint,
      note: this.#noteText(state),
      didYouMean: this.#suggestionText(state),
      useSuggestion: this.#messages.use_suggestion,
    });
  }
}

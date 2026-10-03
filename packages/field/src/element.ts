// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { PostcodeClient, PostcodeError } from '@gatepost/client';
import type { Postcode } from '@gatepost/core';
import { findFix } from './location.js';
import { fill } from './messages.js';
import { readText, type Reading } from './reading.js';
import { ENGLISH, type Messages } from './spec-messages.js';
import {
  lookupOutcome,
  readingNote,
  readingState,
  type Note,
  type Outcome,
  type State,
} from './state.js';
import type { ChangeDetail, ChangeSource, ConfirmDetail, ErrorDetail } from './types.js';
import { buildView, renderView, type View } from './view.js';

interface Events {
  'gatepost-change': ChangeDetail;
  'gatepost-confirm': ConfirmDetail;
  'gatepost-error': ErrorDetail;
}

const LEVELS = { level1: 1, level2: 2 } as const;

// A change of these attributes changes the validity or the lookup. The others change the view.
// A change of `base-url` alone makes a new client and starts no lookup.
const CHECKED_ATTRIBUTES = new Set(['required', 'api-key', 'confirm', 'legacy']);

/** The three values that identify a lookup: the postcode, the level and the key. */
interface Asked {
  readonly code: string;
  readonly level: 1 | 2;
  readonly key: string;
}

function sameAsked(left: Asked | null, right: Asked | null): boolean {
  return (
    left !== null &&
    right !== null &&
    left.code === right.code &&
    left.level === right.level &&
    left.key === right.key
  );
}

// A server has no HTMLElement. Object stands in, so a server can import the module, and the
// guard in index.ts keeps the server from defining the element.
const ElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (Object as unknown as typeof HTMLElement) : HTMLElement;

// The types of the input elements that block implicit submission when a form has no submit button.
const BLOCKING_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'date',
  'month',
  'week',
  'time',
  'datetime-local',
  'number',
]);

function isSubmitButton(element: Element): element is HTMLButtonElement | HTMLInputElement {
  return (
    (element instanceof HTMLButtonElement && element.type === 'submit') ||
    (element instanceof HTMLInputElement && (element.type === 'submit' || element.type === 'image'))
  );
}

/**
 * The postcode field, `<gatepost-postcode-field>`. A plain HTML form submits its form value: the
 * canonical form of the postcode. It checks the format offline. With a publishable key in
 * `api-key`, it also asks the gateway about each whole postcode.
 *
 * @example
 * ```html
 * <form method="post" action="/address">
 *   <gatepost-postcode-field name="postcode" required></gatepost-postcode-field>
 *   <button>Save</button>
 * </form>
 * ```
 */
export interface PostcodeFieldElement extends HTMLElement {
  /**
   * The form value: the canonical form, the digits of a legacy postcode, or the trimmed text. A
   * new value goes into the input as typed text, and raises no `gatepost-change`.
   */
  get value(): string;
  set value(text: string);

  /**
   * The messages that the field shows, from the English catalogue of the spec. A new object
   * replaces messages by key, and a key that it leaves out keeps its English text.
   */
  get messages(): Messages;
  set messages(messages: Partial<Messages>);

  /** The form that holds the field, or null. */
  readonly form: HTMLFormElement | null;

  /** The validity of the field, as for a native input. */
  readonly validity: ValidityState;

  /** The message that the browser shows for an invalid field, or an empty text. */
  readonly validationMessage: string;

  /** True when a form checks the field before it submits. */
  readonly willValidate: boolean;

  /**
   * Checks the field as a form does before it submits.
   *
   * @returns True when the field is valid. Otherwise false, after an `invalid` event.
   */
  checkValidity(): boolean;

  /**
   * Checks the field, and shows its error to the user when it is invalid.
   *
   * @returns True when the field is valid.
   */
  reportValidity(): boolean;

  /** Reads the settings and checks the text. The browser calls it on insertion. */
  connectedCallback(): void;

  /**
   * Applies a changed attribute. The browser calls it.
   *
   * @param name - The name of the attribute.
   */
  attributeChangedCallback(name: string): void;

  /** Puts the text of the `value` attribute back. The browser calls it when the form resets. */
  formResetCallback(): void;

  /**
   * Turns the controls off or on with the form. The browser calls it.
   *
   * @param disabled - True when the field or its fieldset is disabled.
   */
  formDisabledCallback(disabled: boolean): void;

  /**
   * Puts back the text that the user had typed, for example after the back button. The
   * browser calls it.
   *
   * @param state - The text that the field saved with its form value.
   */
  formStateRestoreCallback(state: unknown): void;
}

class FieldElement extends ElementBase implements PostcodeFieldElement {
  /** Makes the element a form control, so a form submits its form value. */
  static readonly formAssociated = true;

  /** The attributes that change the field when a page sets them. */
  static readonly observedAttributes: readonly string[] = [
    'label',
    'value',
    'required',
    'api-key',
    'base-url',
    'confirm',
    'gps',
    'legacy',
  ];

  readonly #internals: ElementInternals;
  readonly #view: View;
  #messages: Messages = ENGLISH;
  #reading: Reading = { kind: 'empty' };
  #value = '';
  #connected = false;
  #dirty = false;
  #errorsShown = false;
  #outcome: Outcome | null = null;
  #client: PostcodeClient | null = null;
  #keyRefused = false;
  #work: AbortController | null = null;
  // The lookup in progress, and the last one that the gateway answered.
  #asked: Asked | null = null;
  #remembered: Asked | null = null;
  #lastText = '';

  /** Builds the shadow tree. The browser calls it when it creates the element. */
  constructor() {
    super();
    this.#internals = this.attachInternals();
    this.#view = buildView(this.attachShadow({ mode: 'open', delegatesFocus: true }));
    const { input, suggestion, location } = this.#view;
    input.addEventListener('input', (event) => {
      const pasted = event instanceof InputEvent && event.inputType === 'insertFromPaste';
      this.#update(pasted ? 'pasted' : 'typed', null);
    });
    input.addEventListener('blur', () => {
      // The input also gets a blur when the window loses focus, but it stays the active element.
      if (this.shadowRoot?.activeElement !== input) {
        this.#leave();
      }
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        this.#submit();
      }
    });
    suggestion.addEventListener('click', () => {
      this.#useSuggestion();
    });
    location.addEventListener('click', () => {
      void this.#locate();
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
    this.#makeClient();
    this.#refresh();
  }

  /** Cancels any request and forgets its outcome. The browser calls it on removal. */
  disconnectedCallback(): void {
    this.#connected = false;
    this.#work?.abort();
    this.#work = null;
    this.#asked = null;
    this.#remembered = null;
    this.#outcome = null;
    this.#render();
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
    if (name === 'api-key' || name === 'base-url') {
      this.#makeClient();
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
    for (const control of [this.#view.input, this.#view.suggestion, this.#view.location]) {
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
      this.#dirty = true;
      this.#view.input.value = state;
      this.#refresh();
    }
  }

  get #legacy(): 'accept' | 'reject' {
    return this.getAttribute('legacy') === 'reject' ? 'reject' : 'accept';
  }

  get #level(): 1 | 2 | null {
    const confirm = this.getAttribute('confirm') ?? 'level1';
    return confirm === 'level1' || confirm === 'level2' ? LEVELS[confirm] : null;
  }

  #makeClient(): void {
    const apiKey = this.getAttribute('api-key');
    const baseUrl = this.getAttribute('base-url');
    this.#client = null;
    this.#keyRefused = false;
    if (apiKey === null || apiKey === '') {
      return;
    }
    try {
      this.#client = new PostcodeClient(baseUrl === null ? { apiKey } : { apiKey, baseUrl });
    } catch (error) {
      // The client throws a TypeError for a secret key in a web page (SEC-1).
      if (!(error instanceof TypeError)) {
        throw error;
      }
      this.#keyRefused = true;
      // eslint-disable-next-line no-console -- spec/field.md asks for one error for the developer.
      console.error('gatepost-postcode-field: api-key holds a secret key. Use a publishable key.');
    }
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

  // The lookup that the text and the settings call for, or null when they call for none.
  #wanted(reading: Reading): Asked | null {
    const level = this.#level;
    const key = this.getAttribute('api-key') ?? '';
    if (reading.kind !== 'postcode' || !this.#connected || level === null || key === '') {
      return null;
    }
    return { code: reading.postcode.canonical, level, key };
  }

  // The text or a setting changed: read the text again, and start a lookup when it parses.
  #refresh(): void {
    const text = this.#view.input.value;
    const textChanged = text !== this.#lastText;
    this.#lastText = text;
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
    this.#startLookup(reading, textChanged);
    this.#render();
  }

  // A lookup that matches the one in progress or the remembered one stays. Any other change
  // cancels the lookup in progress and forgets its outcome, except a location request and its
  // outcome, which last until the text changes. A location request in progress starts no lookup.
  #startLookup(reading: Reading, textChanged: boolean): void {
    if (!textChanged && this.#locationOutcome()) {
      return;
    }
    const wanted = this.#wanted(reading);
    if (sameAsked(wanted, this.#asked) || sameAsked(wanted, this.#remembered)) {
      return;
    }
    this.#work?.abort();
    this.#work = null;
    this.#asked = null;
    this.#remembered = null;
    this.#outcome = null;
    if (wanted !== null && reading.kind === 'postcode') {
      void this.#lookUp(reading.postcode, wanted);
    }
  }

  // True while a location request is in progress, and after it, until the text changes.
  #locationOutcome(): boolean {
    const state = this.#outcome?.state;
    return state === 'locating' || state === 'coarse' || state === 'no-location';
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

  // A native text input submits its form on Enter by way of the default button, which is the
  // first submit button. Without one, it submits only when it is the one field that blocks this.
  #submit(): void {
    const form = this.#internals.form;
    if (form === null) {
      return;
    }
    const elements = Array.from(form.elements);
    const button = elements.find(isSubmitButton);
    if (button !== undefined) {
      if (!button.matches(':disabled')) {
        form.requestSubmit(button);
      }
      return;
    }
    const blocking = elements.filter(
      (element) =>
        element instanceof FieldElement ||
        (element instanceof HTMLInputElement && BLOCKING_TYPES.has(element.type)),
    );
    if (blocking.length <= 1) {
      form.requestSubmit();
    }
  }

  #useSuggestion(): void {
    const reading = this.#reading;
    if (reading.kind === 'error' && reading.suggestion !== null) {
      this.#view.input.value = reading.suggestion.display;
      this.#update('suggestion', null);
      this.#view.input.focus();
    }
  }

  async #lookUp(postcode: Postcode, asked: Asked): Promise<void> {
    if (this.#keyRefused) {
      this.#outcome = { state: 'error', note: { key: 'secret_key' } };
      // The event waits for the render and for the change that caused the lookup.
      queueMicrotask(() => {
        this.#raise('gatepost-error', { code: 'secret_key' });
      });
      return;
    }
    if (this.#client === null) {
      return;
    }
    const work = this.#startWork({ state: 'checking', note: { key: 'checking' } });
    this.#asked = asked;
    try {
      const lookup = await this.#client.lookup(postcode, {
        level: asked.level,
        signal: work.signal,
      });
      if (work.signal.aborted) {
        return;
      }
      this.#remembered = asked;
      this.#finish(lookupOutcome(lookup));
      if (lookup.valid) {
        this.#raise('gatepost-confirm', { lookup });
      }
    } catch (error) {
      if (work.signal.aborted) {
        return;
      }
      // Any failure ends the request. An error that is not the client's counts as a network error.
      this.#finish({ state: 'error', note: { key: 'check_failed' } });
      this.#raise('gatepost-error', {
        code: error instanceof PostcodeError ? error.code : 'network_error',
      });
    }
  }

  // A press of the button cancels the lookup in progress and forgets the remembered lookup, so
  // the postcode of the location always gets a lookup.
  async #locate(): Promise<void> {
    if (this.#client === null) {
      return;
    }
    const work = this.#startWork({ state: 'locating', note: { key: 'locating' } });
    this.#asked = null;
    this.#remembered = null;
    this.#render();
    try {
      const fix = await findFix(() => this.#client, work.signal);
      if (work.signal.aborted) {
        return;
      }
      if (fix.kind === 'postcode') {
        this.#placePostcode(fix.postcode, fix.accuracyM);
      } else if (fix.kind === 'failed') {
        this.#finish({ state: 'no-location', note: { key: fix.key } });
        if (fix.code !== null) {
          this.#raise('gatepost-error', { code: fix.code });
        }
      } else if (this.#keyRefused) {
        // The key became a secret key while the field waited for the position.
        this.#finish({ state: 'error', note: { key: 'secret_key' } });
        this.#raise('gatepost-error', { code: 'secret_key' });
      } else {
        // The key is gone: nothing is sent, and the field shows the state that its text gives.
        this.#endRequest();
        this.#render();
      }
    } catch (error) {
      if (!work.signal.aborted) {
        throw error;
      }
    }
  }

  // The request ends before the update, so the update can start the lookup of a whole postcode.
  // A partial postcode ends in a space, so the user can type the next segment at once.
  #placePostcode(postcode: Postcode, accuracyM: number): void {
    const { input } = this.#view;
    const whole = postcode.precision === 'unit';
    this.#endRequest();
    input.value = whole ? postcode.display : `${postcode.display} `;
    this.#update('gps', accuracyM);
    if (!whole) {
      this.#finish({ state: 'coarse', note: { key: 'gps_coarse' } });
      input.focus();
    }
  }

  #startWork(outcome: Outcome): AbortController {
    this.#work?.abort();
    const work = new AbortController();
    this.#work = work;
    this.#outcome = outcome;
    return work;
  }

  #endRequest(): void {
    this.#work = null;
    this.#asked = null;
    this.#outcome = null;
  }

  #finish(outcome: Outcome): void {
    this.#endRequest();
    this.#outcome = outcome;
    this.#render();
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
    return this.#outcome?.state ?? readingState(this.#reading, this.#errorsShown, required);
  }

  #noteText(state: State): string {
    if (state === 'idle' || state === 'typing') {
      return '';
    }
    return this.#text(this.#outcome?.note ?? readingNote(this.#reading, this.#legacy));
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
    const showLocation = this.hasAttribute('gps') && this.#client !== null;
    renderView(this.#view, {
      state,
      invalid: state === 'invalid' || rejected,
      rejected,
      required: this.hasAttribute('required'),
      label: this.getAttribute('label') ?? this.#messages.label,
      hint: this.#messages.hint,
      note: this.#noteText(state),
      didYouMean: this.#suggestionText(state),
      useSuggestion: this.#messages.use_suggestion,
      useLocation: showLocation ? this.#messages.use_location : null,
    });
  }
}

/** The element `<gatepost-postcode-field>`. */
export const PostcodeFieldElement: {
  readonly prototype: PostcodeFieldElement;
  new (): PostcodeFieldElement;
  /** Makes the element a form control, so a form submits its form value. */
  readonly formAssociated: true;
  /** The attributes that change the field when a page sets them. */
  readonly observedAttributes: readonly string[];
} = FieldElement;

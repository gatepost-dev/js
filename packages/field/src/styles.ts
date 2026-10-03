// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0

// The theme tokens of UI-3. A page sets them on the element, and a rule of the page wins over
// these defaults on :host. Each text colour has a contrast of 4.5:1 or more on the background
// token, and the border has 3:1 or more. The host does not paint that background: only the input
// has it. The label, the hint and the messages sit on the page, so the defaults meet WCAG 2.2 AA
// on a light page only. A dark page sets all the colour tokens.
const TOKENS = `
:host {
  --gatepost-text: #0e1513;
  --gatepost-muted: #4d5753;
  --gatepost-background: #ffffff;
  --gatepost-border: #6b7672;
  --gatepost-accent: #0b6e61;
  --gatepost-error: #b42318;
  --gatepost-warning: #8a4b00;
  --gatepost-radius: 0.375rem;
  --gatepost-font: inherit;
}`;

// Sizes are in rem and em, so the field grows with the user's text size (UI-4).
const LAYOUT = `
:host {
  display: block;
  color: var(--gatepost-text);
  font: var(--gatepost-font);
}
:host([hidden]) {
  display: none;
}
.field {
  display: grid;
  gap: 0.375rem;
  justify-items: start;
}
label {
  font-weight: 600;
}
p {
  margin: 0;
}
.hint {
  color: var(--gatepost-muted);
}
input {
  box-sizing: border-box;
  width: 100%;
  max-width: 14em;
  min-height: 2.75rem;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--gatepost-border);
  border-radius: var(--gatepost-radius);
  background: var(--gatepost-background);
  color: var(--gatepost-text);
  font: inherit;
  font-size: max(1rem, 1em);
  letter-spacing: 0.04em;
}
input:focus-visible,
button:focus-visible {
  outline: 3px solid var(--gatepost-accent);
  outline-offset: 2px;
}
.link {
  min-height: 2.75rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--gatepost-accent);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 0.2em;
  cursor: pointer;
}
.link:disabled {
  color: var(--gatepost-muted);
  cursor: default;
}`;

// Each state shows in the text of the message, and colour only repeats it (WCAG 1.4.1).
const STATES = `
[data-state='invalid'] input,
[data-state='legacy'][data-rejected] input {
  border-color: var(--gatepost-error);
}
[data-state='invalid'] .message,
[data-state='legacy'][data-rejected] .message {
  color: var(--gatepost-error);
}
[data-state='legacy'] .message,
[data-state='not-found'] .message,
[data-state='error'] .message,
[data-state='coarse'] .message,
[data-state='no-location'] .message {
  color: var(--gatepost-warning);
}
[data-state='valid'] .message,
[data-state='confirmed'] .message {
  color: var(--gatepost-accent);
}
[data-state='checking'] #note::before,
[data-state='locating'] #note::before {
  content: '';
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  margin-inline-end: 0.5em;
  border: 2px solid currentColor;
  border-inline-end-color: transparent;
  border-radius: 50%;
  vertical-align: -0.1em;
  animation: gatepost-spin 0.8s linear infinite;
}
@keyframes gatepost-spin {
  to {
    transform: rotate(1turn);
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-state] #note::before {
    animation: none;
  }
}
@media (forced-colors: active) {
  input {
    border-color: FieldText;
  }
}`;

/**
 * The style sheet of the field.
 *
 * @internal
 */
export const STYLES: string = TOKENS + LAYOUT + STATES;

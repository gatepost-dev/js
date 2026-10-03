// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { PostcodeFieldElement } from './element.js';

/**
 * A postcode field for any web form: the custom element `gatepost-postcode-field`. It checks the
 * format offline, and with a publishable key it asks NIPOST's gateway about the postcode.
 *
 * Unofficial. Not made or endorsed by NIPOST.
 *
 * @packageDocumentation
 */
export { PostcodeFieldElement };
export type { MessageKey, Messages } from './spec-messages.js';
export type {
  ChangeDetail,
  ChangeSource,
  ConfirmDetail,
  ErrorDetail,
  FieldErrorCode,
} from './types.js';
export { SPEC_VERSION } from './version.js';

// The one global change of the package (PERF-2). A server has no registry, and a page that loads
// two copies of the field keeps the first.
if (
  typeof customElements !== 'undefined' &&
  customElements.get('gatepost-postcode-field') === undefined
) {
  customElements.define('gatepost-postcode-field', PostcodeFieldElement);
}

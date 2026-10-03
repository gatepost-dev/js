// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Starts the built package as a user does: by its name, through the exports map of package.json.
// Node has no DOM, as on a server that renders a page, so this also shows that importing either
// entry does not fail there.
import * as field from '@gatepost/field';
import * as element from '@gatepost/field/element';

for (const [entry, exports] of [
  ['@gatepost/field', field],
  ['@gatepost/field/element', element],
]) {
  if (exports.SPEC_VERSION !== '0.3.0') {
    throw new Error(`${entry} gave the spec version ${String(exports.SPEC_VERSION)}.`);
  }
}

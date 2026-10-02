// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Starts the built package as a user does: by its name, through the exports map of package.json.
// The unit tests import src/, and publint, attw, size-limit and API Extractor only read dist/.
// So this is the one check that runs the built code.
import { parse } from '@gatepost/core';

const parsed = parse('ek 01 a03 fk 01');
if (!parsed.ok || parsed.value.canonical !== 'EK-01-A03-FK-01') {
  throw new Error(`The built package gave ${JSON.stringify(parsed)} for ek 01 a03 fk 01.`);
}

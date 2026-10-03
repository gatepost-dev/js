// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Starts the built package as a user does: by its name, through the exports map of package.json.
// The unit tests import src/, and publint, attw, size-limit and API Extractor only read dist/.
// So this is the one check that runs the built code, with the built core. It sends no request:
// the transport fails the check if the client calls it.
import { PostcodeClient, PostcodeError } from '@gatepost/client';

const transport = () => {
  throw new Error('The built client sent a request for a code that does not parse.');
};
const client = new PostcodeClient({ transport });
const outcome = await client.lookup('ek 01 a03').catch((error) => error);
if (!(outcome instanceof PostcodeError) || outcome.code !== 'invalid_input') {
  throw new Error(`The built package gave ${String(outcome)} for a partial postcode.`);
}

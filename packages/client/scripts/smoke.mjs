// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Starts the built package as a user does: by its name, through the exports map of package.json.
// The unit tests import src/, and publint, attw, size-limit and API Extractor only read dist/.
// So this is the one check that runs the built code.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PostcodeError, SPEC_VERSION } from '@gatepost/client';

const specVersion = readFileSync(join(import.meta.dirname, '../../../spec/VERSION'), 'utf8').trim();

const error = new PostcodeError('timeout', 'The gateway sent no response in time.');
if (!(error instanceof Error) || error.code !== 'timeout' || SPEC_VERSION !== specVersion) {
  throw new Error('The built package does not give the error type and the spec version.');
}

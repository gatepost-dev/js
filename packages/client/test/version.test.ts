// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPEC_VERSION } from '../src/index.js';

describe('SPEC_VERSION', () => {
  it('matches the version of the spec submodule', () => {
    const specVersion = readFileSync(new URL('../../../spec/VERSION', import.meta.url), 'utf8');
    expect(SPEC_VERSION).toBe(specVersion.trim());
  });
});

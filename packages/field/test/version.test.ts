// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { SPEC_VERSION } from '../src/index.js';

describe('SPEC_VERSION', () => {
  it('matches the version of the spec submodule', async () => {
    const specVersion = await commands.readFile('../../spec/VERSION');
    expect(SPEC_VERSION).toBe(specVersion.trim());
  });
});

// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expectTypeOf, it } from 'vitest';
import type { LookupResult, LookupStatus, ReverseResult } from '../src/index.js';

describe('the result types of spec/client.md', () => {
  it('lets a lookup status be any text, because a new gateway can send one', () => {
    expectTypeOf<LookupResult['status']>().toEqualTypeOf<string | null>();
    expectTypeOf<LookupStatus>().toExtend<string>();
  });

  it('gives a reverse result a nullable radius, and the area and district as gateway text', () => {
    expectTypeOf<ReverseResult['radiusM']>().toEqualTypeOf<number | null>();
    expectTypeOf<ReverseResult['area']>().toEqualTypeOf<string | null>();
    expectTypeOf<ReverseResult['district']>().toEqualTypeOf<string | null>();
  });
});

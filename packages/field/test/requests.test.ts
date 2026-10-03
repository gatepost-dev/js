// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { Requests, type Asked } from '../src/requests.js';

const ASKED: Asked = { code: 'FC-01-Z99-ZZ-01', level: 1, key: 'nipost_pk_test_mock' };

describe('Requests', () => {
  it('forgets the lookup in progress when a location request starts', () => {
    const requests = new Requests();
    requests.start({ state: 'checking', note: { key: 'checking' } });
    requests.asked = ASKED;
    requests.startLocation({ state: 'locating', note: { key: 'locating' } });
    expect(requests.asked).toBeNull();
    expect(requests.remembered).toBeNull();
  });

  it('cancels the request in progress when a change does not match, and says so', () => {
    const requests = new Requests();
    const work = requests.start({ state: 'checking', note: { key: 'checking' } });
    requests.asked = ASKED;
    expect(requests.cancelUnlessKept(null, true)).toBe(true);
    expect(work.signal.aborted).toBe(true);
    expect(requests.outcome).toBeNull();
  });

  it('keeps a location request while the text stays', () => {
    const requests = new Requests();
    const work = requests.startLocation({ state: 'locating', note: { key: 'locating' } });
    expect(requests.cancelUnlessKept(ASKED, false)).toBe(false);
    expect(work.signal.aborted).toBe(false);
  });
});

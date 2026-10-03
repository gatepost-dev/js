// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { PostcodeClient, type LookupResult } from '@gatepost/client';
import { parse } from '@gatepost/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { ConfirmDetail, ErrorDetail } from '../src/index.js';
import { expectAccessible, mount } from './field.js';
import { fixture, scriptGateway } from './gateway.js';

// The publishable key of the mock server. The tests answer each request themselves.
const KEY = 'nipost_pk_test_mock';
const FIELD =
  `<gatepost-postcode-field api-key="${KEY}" name="postcode">` + '</gatepost-postcode-field>';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function listen<Detail>(target: EventTarget, type: string): Detail[] {
  const details: Detail[] = [];
  target.addEventListener(type, (event) => {
    details.push((event as CustomEvent<Detail>).detail);
  });
  return details;
}

describe('lookups', () => {
  it('checks a whole postcode at level 1 with the key, and names its state', async () => {
    let answer: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const { requests } = scriptGateway(pending);
    const { form, input, message } = mount(FIELD);
    const confirms = listen<ConfirmDetail>(form, 'gatepost-confirm');
    await userEvent.type(input, 'fc01z99zz01');
    expect(message()).toBe('Checking your postcode.');
    answer(await fixture('lookup/valid-level-1'));
    await vi.waitFor(() => {
      expect(message()).toBe('We found this postcode in Federal Capital Territory.');
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.pathname).toBe('/v1/lookup');
    expect(requests[0]?.url.searchParams.get('code')).toBe('FC-01-Z99-ZZ-01');
    expect(requests[0]?.url.searchParams.get('level')).toBe('1');
    expect(requests[0]?.headers.get('X-API-Key')).toBe(KEY);
    expect(confirms.map((detail) => detail.lookup.valid)).toEqual([true]);
  });

  it('names the place at level 2, and never shows the house address', async () => {
    const { requests } = scriptGateway(await fixture('lookup/valid-level-2'));
    const { field, input, message } = mount(
      `<gatepost-postcode-field api-key="${KEY}" confirm="level2"></gatepost-postcode-field>`,
    );
    await userEvent.type(input, 'FC01Z99ZZ01');
    await vi.waitFor(() => {
      expect(message()).toBe(
        'We found this postcode: SYNTHETIC LOCALITY, SYNTHETIC LGA, FEDERAL CAPITAL TERRITORY.',
      );
    });
    expect(requests[0]?.url.searchParams.get('level')).toBe('2');
    expect(field.shadowRoot?.textContent).not.toContain('SYNTHETIC STREET');
  });

  it('says when the gateway does not know the postcode, and still submits it', async () => {
    scriptGateway(await fixture('lookup/not-found'));
    const { form, field, input, message } = mount(FIELD);
    const confirms = listen<ConfirmDetail>(form, 'gatepost-confirm');
    const errors = listen<ErrorDetail>(form, 'gatepost-error');
    await userEvent.type(input, 'FC01Z99ZZ02');
    await vi.waitFor(() => {
      expect(message()).toBe(
        'We could not find this postcode. Check each part, or continue if you are sure.',
      );
    });
    expect(field.checkValidity()).toBe(true);
    expect(new FormData(form).get('postcode')).toBe('FC-01-Z99-ZZ-02');
    expect([confirms, errors]).toEqual([[], []]);
  });

  it('offline format check: keeps the check and the form when the network fails', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const offline = new TypeError('Failed to fetch');
    const { requests } = scriptGateway(offline, offline, offline);
    const { form, field, input, message } = mount(FIELD);
    const errors = listen<ErrorDetail>(form, 'gatepost-error');
    input.value = 'FC01Z99ZZ01';
    input.dispatchEvent(new InputEvent('input'));
    await vi.runAllTimersAsync();
    expect(requests).toHaveLength(3);
    expect(message()).toBe('We could not check this postcode just now. You can still continue.');
    expect(errors).toEqual([{ code: 'network_error' }]);
    expect(field.checkValidity()).toBe(true);
    expect(new FormData(form).get('postcode')).toBe('FC-01-Z99-ZZ-01');
  });

  it('raises the error code of the client when the gateway refuses the call', async () => {
    scriptGateway(await fixture('errors/rate-limited'));
    const { form, input, message } = mount(FIELD);
    const errors = listen<ErrorDetail>(form, 'gatepost-error');
    await userEvent.type(input, 'FC01Z99ZZ01');
    await vi.waitFor(() => {
      expect(errors).toEqual([{ code: 'rate_limited' }]);
    });
    expect(message()).toBe('We could not check this postcode just now. You can still continue.');
  });

  it('cancels the lookup of the previous text when the text changes', async () => {
    const { requests } = scriptGateway(
      new Promise<Response>(() => undefined),
      await fixture('lookup/not-found'),
    );
    const { form, input, message } = mount(FIELD);
    const confirms = listen<ConfirmDetail>(form, 'gatepost-confirm');
    const errors = listen<ErrorDetail>(form, 'gatepost-error');
    await userEvent.type(input, 'FC01Z99ZZ01');
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    await userEvent.type(input, '{Backspace}2');
    await vi.waitFor(() => {
      expect(message()).toContain('We could not find this postcode.');
    });
    expect(requests[0]?.signal?.aborted).toBe(true);
    expect(requests[1]?.url.searchParams.get('code')).toBe('FC-01-Z99-ZZ-02');
    expect(confirms).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('sends no request when it has no key, or an empty one', async () => {
    const { requests } = scriptGateway();
    for (const html of [
      '<gatepost-postcode-field></gatepost-postcode-field>',
      '<gatepost-postcode-field api-key=""></gatepost-postcode-field>',
    ]) {
      const { input, message } = mount(html);
      await userEvent.type(input, 'FC01Z99ZZ01');
      await userEvent.tab();
      expect(message()).toBe('This postcode is in Federal Capital Territory.');
    }
    expect(requests).toEqual([]);
  });

  it('sends no lookup when confirm is none, or for a legacy postcode', async () => {
    const { requests } = scriptGateway();
    const { input, message } = mount(
      `<gatepost-postcode-field api-key="${KEY}" confirm="none"></gatepost-postcode-field>`,
    );
    await userEvent.type(input, 'FC01Z99ZZ01');
    expect(message()).toBe('This postcode is in Federal Capital Territory.');
    const legacy = mount(FIELD);
    await userEvent.type(legacy.input, '900108');
    expect(requests).toEqual([]);
  });

  it('has no WCAG 2.2 AA violation while checking, confirmed, not found and failed', async () => {
    scriptGateway(
      new Promise<Response>(() => undefined),
      await fixture('lookup/valid-level-1'),
      await fixture('lookup/not-found'),
      await fixture('errors/rate-limited'),
    );
    const { input, message } = mount(FIELD);
    for (const [text, shown] of [
      ['FC01Z99ZZ01', 'Checking'],
      ['{Backspace}1', 'We found'],
      ['{Backspace}2', 'We could not find'],
      ['{Backspace}3', 'We could not check'],
    ] as const) {
      await userEvent.type(input, text);
      await vi.waitFor(() => {
        expect(message()).toContain(shown);
      });
      await expectAccessible();
    }
  });
});

describe('what the field remembers', () => {
  it('sends no new lookup when the text changes but the canonical code stays', async () => {
    const { requests } = scriptGateway(await fixture('lookup/valid-level-1'));
    const { input, message } = mount(FIELD);
    await userEvent.type(input, 'FC01Z99ZZ01');
    await vi.waitFor(() => {
      expect(message()).toBe('We found this postcode in Federal Capital Territory.');
    });
    await userEvent.type(input, ' ');
    expect(requests).toHaveLength(1);
    expect(message()).toBe('We found this postcode in Federal Capital Territory.');
  });

  it('tries a postcode again after a failed lookup', async () => {
    const { requests } = scriptGateway(
      await fixture('errors/rate-limited'),
      await fixture('lookup/valid-level-1'),
    );
    const { field, input, message } = mount(FIELD);
    await userEvent.type(input, 'FC01Z99ZZ01');
    await vi.waitFor(() => {
      expect(message()).toContain('We could not check');
    });
    field.setAttribute('required', '');
    await vi.waitFor(() => {
      expect(message()).toBe('We found this postcode in Federal Capital Territory.');
    });
    expect(requests).toHaveLength(2);
  });

  it('starts the lookup again when the field leaves the page and comes back', async () => {
    const { requests } = scriptGateway(
      new Promise<Response>(() => undefined),
      await fixture('lookup/valid-level-1'),
    );
    const { form, field, input, message } = mount(FIELD);
    await userEvent.type(input, 'FC01Z99ZZ01');
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    field.remove();
    expect(requests[0]?.signal?.aborted).toBe(true);
    form.append(field);
    await vi.waitFor(() => {
      expect(message()).toBe('We found this postcode in Federal Capital Territory.');
    });
    expect(requests).toHaveLength(2);
  });

  it('does not retry a failed lookup when only the gateway address changes', async () => {
    const { requests } = scriptGateway(
      await fixture('errors/rate-limited'),
      await fixture('lookup/valid-level-1'),
    );
    const { field, input, message } = mount(FIELD);
    await userEvent.type(input, 'FC01Z99ZZ01');
    await vi.waitFor(() => {
      expect(message()).toContain('We could not check');
    });
    field.setAttribute('base-url', 'http://127.0.0.1:4010');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toHaveLength(1);
    expect(message()).toContain('We could not check');
    await userEvent.type(input, '{Backspace}1');
    await vi.waitFor(() => {
      expect(message()).toBe('We found this postcode in Federal Capital Territory.');
    });
    expect(requests[1]?.url.origin).toBe('http://127.0.0.1:4010');
  });

  it('keeps a lookup in progress when only the gateway address changes', async () => {
    let answer: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const { requests } = scriptGateway(pending);
    const { field, input, message } = mount(FIELD);
    await userEvent.type(input, 'FC01Z99ZZ01');
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    field.setAttribute('base-url', 'http://127.0.0.1:4010');
    expect(requests[0]?.signal?.aborted).toBe(false);
    expect(message()).toBe('Checking your postcode.');
    answer(await fixture('lookup/valid-level-1'));
    await vi.waitFor(() => {
      expect(message()).toBe('We found this postcode in Federal Capital Territory.');
    });
    expect(requests).toHaveLength(1);
  });

  it('ignores the answer of a cancelled lookup, even one that ignores the signal', async () => {
    scriptGateway(await fixture('lookup/not-found'));
    let answer: (lookup: LookupResult) => void = () => undefined;
    const late = new Promise<LookupResult>((resolve) => {
      answer = resolve;
    });
    vi.spyOn(PostcodeClient.prototype, 'lookup').mockImplementationOnce(async () => await late);
    const { form, input, message } = mount(FIELD);
    const confirms = listen<ConfirmDetail>(form, 'gatepost-confirm');
    await userEvent.type(input, 'FC01Z99ZZ01');
    await userEvent.type(input, '{Backspace}2');
    await vi.waitFor(() => {
      expect(message()).toContain('We could not find this postcode.');
    });
    const parsed = parse('FC-01-Z99-ZZ-01');
    if (!parsed.ok) {
      throw new Error('The test postcode does not parse.');
    }
    answer({
      postcode: parsed.value,
      valid: true,
      status: null,
      levelRequested: 1,
      levelReceived: 1,
      administrativeAddress: null,
      recentHouseAddress: null,
      buildingUseStatus: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(confirms).toEqual([]);
    expect(message()).toContain('We could not find this postcode.');
  });
});

describe('a call that fails', () => {
  const FAILED = 'We could not check this postcode just now. You can still continue.';

  it('ends as a failed lookup when the base-url has no scheme', async () => {
    const { requests } = scriptGateway();
    const { form, field, input, message } = mount(
      `<gatepost-postcode-field api-key="${KEY}" base-url="127.0.0.1:4010">` +
        '</gatepost-postcode-field>',
    );
    const confirms = listen<ConfirmDetail>(form, 'gatepost-confirm');
    await userEvent.type(input, 'FC01Z99ZZ01');
    await vi.waitFor(() => {
      expect(message()).toBe(FAILED);
    });
    expect(confirms).toEqual([]);
    expect(requests).toEqual([]);
    expect(field.checkValidity()).toBe(true);
  });

  it('ends as a failed lookup when the client throws a plain error, and tries again', async () => {
    const lookup = vi.spyOn(PostcodeClient.prototype, 'lookup');
    lookup.mockRejectedValueOnce(new Error('The client broke.'));
    const { requests } = scriptGateway(await fixture('lookup/valid-level-1'));
    const { field, form, input, message } = mount(FIELD);
    const errors = listen<ErrorDetail>(form, 'gatepost-error');
    await userEvent.type(input, 'FC01Z99ZZ01');
    await vi.waitFor(() => {
      expect(message()).toBe(FAILED);
    });
    expect(errors).toEqual([]);
    expect(field.checkValidity()).toBe(true);
    field.setAttribute('required', '');
    await vi.waitFor(() => {
      expect(message()).toBe('We found this postcode in Federal Capital Territory.');
    });
    expect(requests).toHaveLength(1);
  });
});

describe('a secret key in the page', () => {
  const SECRET = 'We cannot check postcodes on this page. You can still continue.';

  it('sends no request, shows the state error, logs one error and raises secret_key', async () => {
    const { requests } = scriptGateway();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { form, field, input, message, changes } = mount(
      '<gatepost-postcode-field api-key="nipost_live_abc"></gatepost-postcode-field>',
    );
    const order: string[] = [];
    form.addEventListener('gatepost-error', () => {
      order.push(`error: ${message()}`);
    });
    field.addEventListener('gatepost-change', () => {
      order.push('change');
    });
    await userEvent.type(input, 'FC01Z99ZZ01');
    expect(message()).toBe(SECRET);
    expect(order.slice(-2)).toEqual(['change', `error: ${SECRET}`]);
    expect(changes).toHaveLength(11);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(String(consoleError.mock.calls[0]?.[0])).not.toContain('nipost_live_abc');
    expect(requests).toEqual([]);
  });

  it('raises secret_key for each lookup, and logs again when base-url changes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { form, field, input } = mount(
      '<gatepost-postcode-field api-key="nipost_live_abc"></gatepost-postcode-field>',
    );
    const errors = listen<ErrorDetail>(form, 'gatepost-error');
    await userEvent.type(input, 'FC01Z99ZZ01');
    await userEvent.type(input, '{Backspace}2');
    expect(errors).toEqual([{ code: 'secret_key' }, { code: 'secret_key' }]);
    field.setAttribute('base-url', 'http://127.0.0.1:4010');
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(errors).toHaveLength(2);
    field.setAttribute('confirm', 'none');
    await userEvent.type(input, '{Backspace}1');
    expect(errors).toHaveLength(2);
    for (const call of consoleError.mock.calls) {
      expect(String(call[0])).not.toContain('nipost_live_abc');
    }
  });
});

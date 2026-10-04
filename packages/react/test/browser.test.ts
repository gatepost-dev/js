// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { ChangeDetail, ErrorDetail, PostcodeFieldElement } from '@gatepost/field';
import { StrictMode, act, createElement, createRef, version } from 'react';
import { version as domVersion } from 'react-dom';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { PostcodeField, type PostcodeFieldProps } from '../src/index.js';

// act() warns unless the test says that it runs in a test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) {
      root.unmount();
    }
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function container(): HTMLFormElement {
  const form = document.createElement('form');
  document.body.append(form);
  return form;
}

function show(props: PostcodeFieldProps, ref = createRef<PostcodeFieldElement>()): HTMLFormElement {
  const form = container();
  const root = createRoot(form);
  roots.push(root);
  act(() => {
    root.render(createElement(PostcodeField, { ...props, ref }));
  });
  return form;
}

function input(form: HTMLFormElement): HTMLInputElement {
  return form.querySelector('gatepost-postcode-field')!.shadowRoot!.querySelector('input')!;
}

describe(`PostcodeField on React ${version}`, () => {
  it('runs on the React version of its test project', () => {
    expect(version).toMatch(/^1[89]\./);
    expect(domVersion.split('.')[0]).toBe(version.split('.')[0]);
  });

  it('submits the canonical form with a plain form', async () => {
    const form = show({ name: 'postcode', required: true });
    await userEvent.type(input(form), 'fc 01 z99 zz 01');
    expect(new FormData(form).get('postcode')).toBe('FC-01-Z99-ZZ-01');
  });

  it('calls onChange with the detail of each change', async () => {
    const onChange = vi.fn<(detail: ChangeDetail) => void>();
    const form = show({ onChange });
    await userEvent.type(input(form), 'FC01Z99ZZ01');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 'FC-01-Z99-ZZ-01', source: 'typed' }),
    );
  });

  it('calls a new onChange once for each change after a render with new props', async () => {
    const form = container();
    const root = createRoot(form);
    roots.push(root);
    const first = vi.fn<(detail: ChangeDetail) => void>();
    const second = vi.fn<(detail: ChangeDetail) => void>();
    act(() => {
      root.render(createElement(PostcodeField, { onChange: first, messages: { label: 'One' } }));
    });
    act(() => {
      root.render(createElement(PostcodeField, { onChange: second, messages: { label: 'Two' } }));
    });
    await userEvent.type(input(form), 'F');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('calls onError for a secret key, and the field sends no request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetch = vi.spyOn(globalThis, 'fetch');
    const onError = vi.fn<(detail: ErrorDetail) => void>();
    const form = show({ apiKey: 'nipost_live_abc', onError });
    await userEvent.type(input(form), 'FC01Z99ZZ01');
    expect(onError).toHaveBeenCalledWith({ code: 'secret_key' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('gives the element through the ref, and passes the messages to it', () => {
    const ref = createRef<PostcodeFieldElement>();
    const form = show({ messages: { label: 'Delivery postcode' } }, ref);
    expect(ref.current).toBe(form.querySelector('gatepost-postcode-field'));
    expect(ref.current?.shadowRoot?.querySelector('label')?.textContent).toBe('Delivery postcode');
  });

  it('takes messages that were set before the element was defined', () => {
    // A document with no registry keeps the element plain, so the effect of the component sets
    // `messages` as an own property, as it does when the script that defines the field loads late.
    const plain = document.implementation.createHTMLDocument('');
    const container = plain.createElement('form');
    const root = createRoot(container);
    roots.push(root);
    act(() => {
      root.render(createElement(PostcodeField, { messages: { label: 'Early' } }));
    });
    const field = container.querySelector('gatepost-postcode-field')!;
    expect(Object.hasOwn(field, 'messages')).toBe(true);
    expect(field.shadowRoot).toBeNull();
    document.body.append(container);
    expect(Object.hasOwn(field, 'messages')).toBe(false);
    expect(field.shadowRoot?.querySelector('label')?.textContent).toBe('Early');
    act(() => {
      root.render(createElement(PostcodeField, { messages: { label: 'Later' } }));
    });
    expect(field.shadowRoot?.querySelector('label')?.textContent).toBe('Later');
  });

  it('turns the field off, and back on, with the disabled prop', () => {
    const form = container();
    const root = createRoot(form);
    roots.push(root);
    act(() => {
      root.render(createElement(PostcodeField, { name: 'postcode', disabled: true }));
    });
    expect(input(form).disabled).toBe(true);
    act(() => {
      root.render(createElement(PostcodeField, { name: 'postcode', disabled: false }));
    });
    expect(input(form).disabled).toBe(false);
  });

  it('gives defaultValue as the first text, and a reset returns to it', async () => {
    const form = show({ name: 'postcode', defaultValue: 'fc01z99zz01' });
    const field = form.querySelector('gatepost-postcode-field')!;
    expect(field.getAttribute('value')).toBe('fc01z99zz01');
    expect(input(form).value).toBe('fc01z99zz01');
    await userEvent.clear(input(form));
    await userEvent.type(input(form), 'LA');
    expect(input(form).value).toBe('LA');
    act(() => {
      form.reset();
    });
    expect(input(form).value).toBe('fc01z99zz01');
  });

  it('keeps the typed text when defaultValue changes, and a reset uses the new one', async () => {
    const form = container();
    const root = createRoot(form);
    roots.push(root);
    act(() => {
      root.render(createElement(PostcodeField, { defaultValue: 'fc01z99zz01' }));
    });
    await userEvent.clear(input(form));
    await userEvent.type(input(form), 'LA');
    act(() => {
      root.render(createElement(PostcodeField, { defaultValue: 'fc01z99zz02' }));
    });
    expect(input(form).value).toBe('LA');
    act(() => {
      form.reset();
    });
    expect(input(form).value).toBe('fc01z99zz02');
  });

  it('goes back to the English messages when the messages prop goes away', () => {
    const form = container();
    const root = createRoot(form);
    roots.push(root);
    act(() => {
      root.render(createElement(PostcodeField, { messages: { label: 'One' } }));
    });
    const label = (): string | null | undefined =>
      form.querySelector('gatepost-postcode-field')?.shadowRoot?.querySelector('label')
        ?.textContent;
    expect(label()).toBe('One');
    act(() => {
      root.render(createElement(PostcodeField, {}));
    });
    expect(label()).toBe('Postcode');
  });

  it('sets the messages of an inline object once, not after every render', () => {
    const form = container();
    const root = createRoot(form);
    roots.push(root);
    act(() => {
      root.render(createElement(PostcodeField, { messages: { label: 'One' } }));
    });
    const field = form.querySelector<PostcodeFieldElement>('gatepost-postcode-field')!;
    const set = vi.spyOn(field, 'messages', 'set');
    act(() => {
      root.render(createElement(PostcodeField, { messages: { label: 'One' } }));
    });
    expect(set).not.toHaveBeenCalled();
  });

  it('calls one handler once for one change inside StrictMode', async () => {
    const form = container();
    const root = createRoot(form);
    roots.push(root);
    const onChange = vi.fn<(detail: ChangeDetail) => void>();
    act(() => {
      root.render(createElement(StrictMode, null, createElement(PostcodeField, { onChange })));
    });
    await userEvent.type(input(form), 'F');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('calls a new onError and a new onConfirm once after a render with new props', () => {
    const form = container();
    const root = createRoot(form);
    roots.push(root);
    const first = { onError: vi.fn(), onConfirm: vi.fn() };
    const second = { onError: vi.fn(), onConfirm: vi.fn() };
    act(() => {
      root.render(createElement(PostcodeField, first));
    });
    act(() => {
      root.render(createElement(PostcodeField, second));
    });
    const field = form.querySelector('gatepost-postcode-field')!;
    act(() => {
      field.dispatchEvent(new CustomEvent('gatepost-error', { detail: { code: 'secret_key' } }));
      field.dispatchEvent(new CustomEvent('gatepost-confirm', { detail: { lookup: {} } }));
    });
    expect(first.onError).not.toHaveBeenCalled();
    expect(first.onConfirm).not.toHaveBeenCalled();
    expect(second.onError).toHaveBeenCalledOnce();
    expect(second.onConfirm).toHaveBeenCalledOnce();
  });

  it('leaves no listener when a handler goes away or the component unmounts', () => {
    const form = container();
    const root = createRoot(form);
    const onChange = vi.fn();
    act(() => {
      root.render(createElement(PostcodeField, { onChange }));
    });
    const field = form.querySelector('gatepost-postcode-field')!;
    const send = (): void => {
      field.dispatchEvent(new CustomEvent('gatepost-change', { detail: { value: 'x' } }));
    };
    send();
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => {
      root.render(createElement(PostcodeField, {}));
    });
    send();
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => {
      root.render(createElement(PostcodeField, { onChange }));
    });
    send();
    expect(onChange).toHaveBeenCalledTimes(2);
    act(() => {
      root.unmount();
    });
    send();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('renders the HTML of every prop on the server with this version of React', () => {
    // The test browser has a document, so React 18 warns about the layout effect. See the
    // hydration test below.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToString(
      createElement(PostcodeField, {
        name: 'postcode',
        defaultValue: 'FC-01-Z99-ZZ-01',
        required: true,
        disabled: false,
        gps: false,
        legacy: 'reject',
      }),
    );
    expect(html).toBe(
      '<gatepost-postcode-field name="postcode" value="FC-01-Z99-ZZ-01" legacy="reject" ' +
        'required=""></gatepost-postcode-field>',
    );
  });

  it('runs the cleanup that a callback ref returns, on React 19', () => {
    const cleanup = vi.fn();
    const ref = vi.fn<(element: PostcodeFieldElement | null) => () => void>(() => cleanup);
    const form = container();
    const root = createRoot(form);
    act(() => {
      root.render(createElement(PostcodeField, { ref }));
    });
    const field = form.querySelector('gatepost-postcode-field');
    act(() => {
      root.unmount();
    });
    if (version.startsWith('19.')) {
      expect(cleanup).toHaveBeenCalledOnce();
      expect(ref).toHaveBeenCalledOnce();
      expect(ref).toHaveBeenCalledWith(field);
    } else {
      expect(ref).toHaveBeenLastCalledWith(null);
    }
  });

  it('hydrates the HTML of a server render with no warning', () => {
    const element = createElement(PostcodeField, { name: 'postcode', defaultValue: 'fc01z99zz01' });
    const form = container();
    // This browser has a document, so React 18 warns that a layout effect does nothing on the
    // server. A real server has no document, and the component then uses a passive effect. So the
    // spy starts after the render to a string.
    form.innerHTML = renderToString(element);
    const consoleError = vi.spyOn(console, 'error');
    act(() => {
      roots.push(hydrateRoot(form, element));
    });
    expect(consoleError.mock.calls).toEqual([]);
    expect(new FormData(form).get('postcode')).toBe('FC-01-Z99-ZZ-01');
    expect(form.querySelector('gatepost-postcode-field')?.getAttribute('value')).toBe(
      'fc01z99zz01',
    );
  });
});

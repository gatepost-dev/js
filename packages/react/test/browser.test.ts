// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { ChangeDetail, ErrorDetail, PostcodeFieldElement } from '@gatepost/field';
import { act, createElement, createRef, version } from 'react';
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

  it('hydrates the HTML of a server render with no warning', () => {
    const consoleError = vi.spyOn(console, 'error');
    const element = createElement(PostcodeField, { name: 'postcode', defaultValue: 'fc01z99zz01' });
    const form = container();
    form.innerHTML = renderToString(element);
    act(() => {
      roots.push(hydrateRoot(form, element));
    });
    expect(consoleError).not.toHaveBeenCalled();
    expect(new FormData(form).get('postcode')).toBe('FC-01-Z99-ZZ-01');
  });
});

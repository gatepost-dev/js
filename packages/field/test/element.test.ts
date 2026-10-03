// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectAccessible, mount } from './field.js';

const FIELD = '<gatepost-postcode-field name="postcode"></gatepost-postcode-field>';

function formValue(form: HTMLFormElement): FormDataEntryValue | null {
  return new FormData(form).get('postcode');
}

describe('the field in a plain form', () => {
  it('names its input with the label, and describes it with the hint', () => {
    const { input, label } = mount(FIELD);
    expect(Array.from(input.labels ?? [])).toEqual([label]);
    expect(label.textContent).toBe('Postcode');
    expect(input.getAttribute('aria-describedby')).toBe('hint message');
  });

  it('shows the label that the page gives', () => {
    const { label } = mount(
      '<gatepost-postcode-field label="Delivery postcode"></gatepost-postcode-field>',
    );
    expect(label.textContent).toBe('Delivery postcode');
  });

  it('submits the canonical form of a typed postcode', async () => {
    const { form, input } = mount(FIELD);
    await userEvent.type(input, 'fc 01 z99 zz 01');
    expect(formValue(form)).toBe('FC-01-Z99-ZZ-01');
  });

  it('shows the display form and the state when the user leaves the input', async () => {
    const { input, message } = mount(FIELD);
    await userEvent.type(input, 'fc01z99zz01');
    await userEvent.tab();
    expect(input.value).toBe('FC 01 Z99 ZZ 01');
    expect(message()).toBe('This postcode is in Federal Capital Territory.');
  });

  it('shows no error while the user types a short text, and shows it on leaving', async () => {
    const { input, message } = mount(FIELD);
    await userEvent.type(input, 'FC01');
    expect(message()).toBe('');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    await userEvent.tab();
    expect(message()).toBe('A postcode has 11 letters and numbers. You entered 4.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows an error at once for a text as long as a whole postcode', async () => {
    const { input, message } = mount(FIELD);
    await userEvent.type(input, 'FC01Z99ZZ001');
    expect(message()).toBe('A postcode has 11 letters and numbers. You entered 12.');
  });

  it('submits the text as typed when it does not parse, and marks the field invalid', async () => {
    const { form, field, input } = mount(FIELD);
    await userEvent.type(input, ' fc01z99 ');
    expect(field.value).toBe('fc01z99');
    expect(field.checkValidity()).toBe(false);
    expect(field.validationMessage).toBe('A postcode has 11 letters and numbers. You entered 7.');
    form.noValidate = true;
    expect(formValue(form)).toBe('fc01z99');
  });

  it('offers the suggestion of the core, and uses it only when the user asks', async () => {
    const { form, field, input, suggestion, message, changes } = mount(FIELD);
    await userEvent.type(input, 'FCO1Z99ZZ01');
    expect(message()).toBe(
      'The second part must be a number from 01 to 99. Did you mean FC 01 Z99 ZZ 01?',
    );
    expect(formValue(form)).toBe('FCO1Z99ZZ01');
    expect(suggestion.textContent).toBe('Use this postcode');
    await userEvent.click(suggestion);
    expect(input.value).toBe('FC 01 Z99 ZZ 01');
    expect(field.value).toBe('FC-01-Z99-ZZ-01');
    expect(changes.at(-1)?.source).toBe('suggestion');
    expect(field.shadowRoot?.activeElement).toBe(input);
  });

  it('takes a pasted postcode with en dashes, no-break spaces and full-width letters', () => {
    const dash = String.fromCodePoint(0x2013);
    const space = String.fromCodePoint(0xa0);
    // U+FF26 and U+FF23 are the full-width letters F and C.
    const wide = String.fromCodePoint(0xff26, 0xff23);
    const { field, input } = mount(FIELD);
    for (const text of [
      `FC${dash}01${dash}Z99${dash}ZZ${dash}01`,
      `FC${space}01 Z99 ZZ 01`,
      `${wide}01Z99ZZ01`,
    ]) {
      input.value = text;
      input.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' }));
      expect(field.value).toBe('FC-01-Z99-ZZ-01');
    }
  });

  it('keeps two fields in one form apart, as for a billing and a delivery address', async () => {
    const { form } = mount(
      '<gatepost-postcode-field name="billing" label="Billing postcode">' +
        '</gatepost-postcode-field>' +
        '<gatepost-postcode-field name="delivery" label="Delivery postcode">' +
        '</gatepost-postcode-field>',
    );
    const [billing, delivery] = Array.from(form.querySelectorAll('gatepost-postcode-field'));
    await userEvent.type(billing!.shadowRoot!.querySelector('input')!, 'FC01Z99ZZ01');
    await userEvent.type(delivery!.shadowRoot!.querySelector('input')!, 'FC01Z99ZZ02');
    expect(new FormData(form).get('billing')).toBe('FC-01-Z99-ZZ-01');
    expect(new FormData(form).get('delivery')).toBe('FC-01-Z99-ZZ-02');
    expect(delivery!.shadowRoot!.querySelector('label')?.textContent).toBe('Delivery postcode');
  });

  it('raises gatepost-change with the source of each change of the form value', async () => {
    const { input, changes } = mount(FIELD);
    await userEvent.type(input, 'F');
    input.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste' }));
    input.value = 'FC-01-Z99-ZZ-01';
    input.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' }));
    expect(changes.map((change) => [change.value, change.source])).toEqual([
      ['F', 'typed'],
      ['FC-01-Z99-ZZ-01', 'pasted'],
    ]);
    expect(changes.at(-1)?.postcode?.display).toBe('FC 01 Z99 ZZ 01');
    expect(changes.at(-1)?.accuracyM).toBeNull();
  });
});

describe('legacy accept and reject', () => {
  it('accepts an old 6-digit postcode by default, and says that a new one exists', async () => {
    const { form, field, input, message } = mount(FIELD);
    await userEvent.type(input, '900 108');
    expect(formValue(form)).toBe('900108');
    expect(field.checkValidity()).toBe(true);
    expect(message()).toBe(
      'This is an old 6-digit postcode. If you know your new one, enter it instead.',
    );
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('rejects an old 6-digit postcode when legacy is reject', async () => {
    const { field, input, message } = mount(
      '<gatepost-postcode-field name="postcode" legacy="reject"></gatepost-postcode-field>',
    );
    await userEvent.type(input, '900108');
    expect(field.checkValidity()).toBe(false);
    expect(message()).toBe(
      'This is an old 6-digit postcode. Enter a new one, such as EK 01 A03 FK 01.',
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('the field and its form', () => {
  it('needs a value when required, and shows why after a submit', async () => {
    const { form, field, input, message } = mount(
      '<gatepost-postcode-field name="postcode" required></gatepost-postcode-field>',
    );
    const submitted = vi.fn((event: Event) => {
      event.preventDefault();
    });
    form.addEventListener('submit', submitted);
    expect(message()).toBe('');
    expect(field.validity.valueMissing).toBe(true);
    input.focus();
    await userEvent.keyboard('{Enter}');
    expect(submitted).not.toHaveBeenCalled();
    expect(message()).toBe('Enter your postcode.');
  });

  it('submits the form when the user presses Enter in the input', async () => {
    const { form, input } = mount(FIELD);
    const submitted = vi.fn((event: Event) => {
      event.preventDefault();
    });
    form.addEventListener('submit', submitted);
    await userEvent.type(input, 'FC01Z99ZZ01');
    await userEvent.keyboard('{Enter}');
    expect(submitted).toHaveBeenCalledOnce();
  });

  it('goes back to the value attribute when the form resets', async () => {
    const { form, field, input } = mount(
      '<gatepost-postcode-field name="postcode" value="fc01z99zz01"></gatepost-postcode-field>',
    );
    expect(field.value).toBe('FC-01-Z99-ZZ-01');
    await userEvent.type(input, 'X');
    form.reset();
    expect(input.value).toBe('fc01z99zz01');
    expect(field.value).toBe('FC-01-Z99-ZZ-01');
  });

  it('takes its text from the value property without a change event', () => {
    const { field, input, changes } = mount(FIELD);
    field.value = 'fc 01 z99 zz 01';
    expect(input.value).toBe('fc 01 z99 zz 01');
    expect(field.value).toBe('FC-01-Z99-ZZ-01');
    expect(changes).toEqual([]);
  });

  it('turns its input off inside a disabled fieldset, and the form leaves it out', () => {
    const { form, input } = mount(
      '<fieldset disabled><gatepost-postcode-field name="postcode" value="FC-01-Z99-ZZ-01">' +
        '</gatepost-postcode-field></fieldset>',
    );
    expect(input.disabled).toBe(true);
    expect(formValue(form)).toBeNull();
  });

  it('shows the messages that the page gives, and English for the rest', async () => {
    const { field, input, label, message } = mount(FIELD);
    field.messages = { label: 'Your postcode', empty: 'Type a postcode.' };
    expect(label.textContent).toBe('Your postcode');
    expect(field.messages.hint).toBe('11 letters and numbers, for example EK 01 A03 FK 01');
    await userEvent.type(input, 'FC01');
    await userEvent.tab();
    expect(message()).toBe('A postcode has 11 letters and numbers. You entered 4.');
  });
});

describe('accessibility', () => {
  it('has no WCAG 2.2 AA violation in the states idle, invalid, legacy and valid', async () => {
    const { input } = mount(FIELD);
    await expectAccessible();
    await userEvent.type(input, 'FCO1Z99ZZ01');
    await expectAccessible();
    await userEvent.clear(input);
    await userEvent.type(input, '900108');
    await expectAccessible();
    await userEvent.clear(input);
    await userEvent.type(input, 'FC01Z99ZZ01');
    await userEvent.tab();
    await expectAccessible();
  });

  it('reaches the input and then the suggestion button with the Tab key alone', async () => {
    const { form, field, input, suggestion } = mount(`<button type="button">Back</button>${FIELD}`);
    form.querySelector('button')?.focus();
    await userEvent.tab();
    expect(field.shadowRoot?.activeElement).toBe(input);
    await userEvent.keyboard('FCO1Z99ZZ01');
    await userEvent.tab();
    expect(field.shadowRoot?.activeElement).toBe(suggestion);
    await userEvent.keyboard('{Enter}');
    expect(input.value).toBe('FC 01 Z99 ZZ 01');
  });
});

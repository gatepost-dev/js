// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectAccessible, mount } from './field.js';

const FIELD = '<gatepost-postcode-field name="postcode"></gatepost-postcode-field>';

function formValue(form: HTMLFormElement): FormDataEntryValue | null {
  return new FormData(form).get('postcode');
}

// Copies the text from a plain input and pastes it into the input of the field, as a user does.
async function pasteInto(input: HTMLInputElement, text: string): Promise<void> {
  const source = document.createElement('input');
  source.value = text;
  document.body.append(source);
  source.select();
  await userEvent.copy();
  source.remove();
  input.focus();
  await userEvent.paste();
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

  it('takes a pasted postcode with en dashes, no-break spaces and full-width letters', async () => {
    const dash = String.fromCodePoint(0x2013);
    const space = String.fromCodePoint(0xa0);
    // U+FF26 and U+FF23 are the full-width letters F and C.
    const wide = String.fromCodePoint(0xff26, 0xff23);
    // The same text with a non-breaking hyphen (U+2011) and full-width digits and letters.
    const mixed = String.fromCodePoint(
      ...[0xff26, 0xff23, 0x2011, 0xff10, 0xff11, 0x20, 0xff3a, 0xff19, 0xff19, 0xa0],
      ...[0xff3a, 0xff3a, 0x2013, 0xff10, 0xff11],
    );
    const { form, input, changes } = mount(FIELD);
    for (const text of [
      `FC${dash}01${dash}Z99${dash}ZZ${dash}01`,
      `FC${space}01 Z99 ZZ 01`,
      `${wide}01Z99ZZ01`,
      mixed,
    ]) {
      await userEvent.clear(input);
      await pasteInto(input, text);
      expect(formValue(form)).toBe('FC-01-Z99-ZZ-01');
      expect(changes.at(-1)?.source).toBe('pasted');
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
    const parts = (field: Element | undefined) => ({
      input: field!.shadowRoot!.querySelector('input')!,
      label: field!.shadowRoot!.querySelector('label')!.textContent,
      message: field!.shadowRoot!.querySelector<HTMLElement>('#message')!.innerText.trim(),
    });
    await userEvent.type(parts(billing).input, 'FC01Z99ZZ01');
    await userEvent.type(parts(delivery).input, 'FC01');
    await userEvent.tab();
    expect(new FormData(form).get('billing')).toBe('FC-01-Z99-ZZ-01');
    expect(new FormData(form).get('delivery')).toBe('FC01');
    expect([parts(billing).label, parts(delivery).label]).toEqual([
      'Billing postcode',
      'Delivery postcode',
    ]);
    expect(parts(billing).message).toBe('This postcode is in Federal Capital Territory.');
    expect(parts(delivery).message).toBe('A postcode has 11 letters and numbers. You entered 4.');
    expect(parts(billing).input.getAttribute('aria-invalid')).toBe('false');
    expect(parts(delivery).input.getAttribute('aria-invalid')).toBe('true');
  });

  it('raises gatepost-change with the source of each change of the form value', async () => {
    const { input, changes } = mount(FIELD);
    await userEvent.type(input, 'F');
    input.value = 'FC-01-Z99-ZZ-01';
    input.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' }));
    // An autofill sends an input event with no event before it, so the paste must not linger.
    input.value = 'FC-01-Z99-ZZ-02';
    input.dispatchEvent(new InputEvent('input', { inputType: 'insertReplacementText' }));
    expect(changes.map((change) => [change.value, change.source])).toEqual([
      ['F', 'typed'],
      ['FC-01-Z99-ZZ-01', 'pasted'],
      ['FC-01-Z99-ZZ-02', 'typed'],
    ]);
    expect(changes.at(-1)?.postcode?.display).toBe('FC 01 Z99 ZZ 02');
    expect(changes.at(-1)?.accuracyM).toBeNull();
  });
});

describe('Enter in the input', () => {
  function watch(form: HTMLFormElement): HTMLButtonElement[] {
    const submitters: HTMLButtonElement[] = [];
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitters.push(event.submitter as HTMLButtonElement);
    });
    return submitters;
  }

  async function enter(input: HTMLInputElement): Promise<void> {
    await userEvent.type(input, 'FC01Z99ZZ01');
    await userEvent.keyboard('{Enter}');
  }

  it('sends the name and value of the default button, as a native input does', async () => {
    const { form, input } = mount(
      `${FIELD}<button type="button" name="other">No</button>` +
        '<button name="go" value="1">Go</button><button name="stop" value="2">Stop</button>',
    );
    const submitters = watch(form);
    await enter(input);
    expect(submitters.map((button) => button.name)).toEqual(['go']);
    expect(new FormData(form, submitters[0]).get('go')).toBe('1');
    expect(new FormData(form, submitters[0]).has('stop')).toBe(false);
  });

  it('also finds a default button that is an input of type submit', async () => {
    const { form, input } = mount(`${FIELD}<input type="submit" name="send" value="Send">`);
    const submitters = watch(form);
    await enter(input);
    expect(new FormData(form, submitters[0]).get('send')).toBe('Send');
  });

  it('does nothing when the default button is disabled, even if a later one is not', async () => {
    const { form, input } = mount(
      `${FIELD}<button name="go" disabled>Go</button><button name="stop">Stop</button>`,
    );
    const submitters = watch(form);
    await enter(input);
    expect(submitters).toEqual([]);
  });

  it('submits a form with no submit button when the field is its only text field', async () => {
    const { form, input } = mount(`${FIELD}<input type="checkbox" name="gift">`);
    const submitters = watch(form);
    await enter(input);
    expect(submitters).toEqual([null]);
  });

  it('does nothing in a form with no submit button and a second text field', async () => {
    const { form, input } = mount(`${FIELD}<input type="text" name="city">`);
    const submitters = watch(form);
    await enter(input);
    expect(submitters).toEqual([]);
  });

  it('does nothing in a form with no submit button and a second postcode field', async () => {
    const { form, field } = mount(`${FIELD}${FIELD.replace('"postcode"', '"other"')}`);
    const submitters = watch(form);
    await enter(field.shadowRoot!.querySelector('input')!);
    expect(submitters).toEqual([]);
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

  it('shows a message that the page gives for the empty required field', async () => {
    const { field, input, message } = mount(
      '<gatepost-postcode-field name="postcode" required></gatepost-postcode-field>',
    );
    field.messages = { empty: 'Type a postcode.' };
    expect(field.validationMessage).toBe('Type a postcode.');
    input.focus();
    await userEvent.tab();
    expect(message()).toBe('Type a postcode.');
  });

  it('puts back the text that the browser saved, and keeps it over the value attribute', () => {
    const { field, input } = mount(
      '<gatepost-postcode-field name="postcode" value="FC-01-Z99-ZZ-02"></gatepost-postcode-field>',
    );
    field.formStateRestoreCallback('fc 01 z99 zz 01');
    expect(input.value).toBe('fc 01 z99 zz 01');
    expect(field.value).toBe('FC-01-Z99-ZZ-01');
    field.setAttribute('value', 'FC-01-Z99-ZZ-03');
    expect(input.value).toBe('fc 01 z99 zz 01');
  });

  it('waits again before it shows an error after a form reset', async () => {
    const { form, input, message } = mount(FIELD);
    await userEvent.type(input, 'FC01');
    await userEvent.tab();
    expect(message()).not.toBe('');
    form.reset();
    expect(message()).toBe('');
    input.focus();
    await userEvent.keyboard('F');
    expect(message()).toBe('');
  });

  it('does not show errors when the window loses focus and the input keeps it', async () => {
    const { input, message } = mount(FIELD);
    await userEvent.type(input, 'FC01');
    input.dispatchEvent(new FocusEvent('blur'));
    expect(message()).toBe('');
    await userEvent.tab();
    expect(message()).toBe('A postcode has 11 letters and numbers. You entered 4.');
  });

  it('marks the input as required for assistive technology, as the field is', () => {
    const { field, input } = mount(
      '<gatepost-postcode-field name="postcode" required></gatepost-postcode-field>',
    );
    expect(input.getAttribute('aria-required')).toBe('true');
    field.removeAttribute('required');
    expect(input.getAttribute('aria-required')).toBe('false');
  });

  it('changes the live region only when the message changes', async () => {
    const { field, input, message } = mount(FIELD);
    const region = field.shadowRoot!.querySelector('#message')!;
    await userEvent.type(input, 'FC01Z99ZZ01');
    expect(message()).toBe('This postcode is in Federal Capital Territory.');
    const writes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => writes.push(...records));
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    await userEvent.type(input, ' ');
    await userEvent.tab();
    field.messages = { label: 'Your postcode' };
    await new Promise((resolve) => setTimeout(resolve));
    observer.disconnect();
    expect(writes).toEqual([]);
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

  it('has no violation in the states legacy rejected and required but empty', async () => {
    const { input } = mount(
      '<gatepost-postcode-field legacy="reject" required></gatepost-postcode-field>',
    );
    input.focus();
    await userEvent.tab();
    await expectAccessible();
    await userEvent.type(input, '900108');
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

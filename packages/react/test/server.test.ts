// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PostcodeField } from '../src/index.js';

describe('a server render', () => {
  it('runs with no DOM, as on a server', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof customElements).toBe('undefined');
  });

  it('writes the element with each setting as an attribute', () => {
    const html = renderToString(
      createElement(PostcodeField, {
        name: 'postcode',
        defaultValue: 'FC-01-Z99-ZZ-01',
        required: true,
        label: 'Delivery postcode',
        apiKey: 'nipost_pk_test_mock',
        baseUrl: 'http://127.0.0.1:4010',
        confirm: 'level2',
        gps: true,
        legacy: 'reject',
      }),
    );
    expect(html).toBe(
      '<gatepost-postcode-field name="postcode" value="FC-01-Z99-ZZ-01" ' +
        'label="Delivery postcode" api-key="nipost_pk_test_mock" ' +
        'base-url="http://127.0.0.1:4010" confirm="level2" legacy="reject" required="" gps="">' +
        '</gatepost-postcode-field>',
    );
  });

  it('leaves out a setting that is false or missing', () => {
    const html = renderToString(createElement(PostcodeField, { required: false, gps: false }));
    expect(html).toBe('<gatepost-postcode-field></gatepost-postcode-field>');
  });
});

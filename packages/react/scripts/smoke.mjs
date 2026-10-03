// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Starts the built package as a user does, on a server with no DOM, and renders the component
// to HTML, as a server render of a Next.js page does.
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { PostcodeField } from '@gatepost/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const first = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8').split('\n')[0];
if (first !== "'use client';") {
  throw new Error(`dist/index.js starts with ${first}, not the directive 'use client'.`);
}
const html = renderToString(createElement(PostcodeField, { name: 'postcode', required: true }));
if (html !== '<gatepost-postcode-field name="postcode" required=""></gatepost-postcode-field>') {
  throw new Error(`The server rendered ${html}.`);
}

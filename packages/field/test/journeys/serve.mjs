// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Serves a plain HTML form with the built field on http://localhost:3000, the origin that the
// mock server allows for its publishable key, and starts the mock server on port 4010.
// The query of /form becomes the attributes of the field, and /submitted shows what the form
// sent. Run `pnpm build` first.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { startMockServer } from '@gatepost/mock-server';

const ELEMENT = new URL('../../dist/element.js', import.meta.url);
const ATTRIBUTES = ['api-key', 'base-url', 'confirm', 'gps', 'label', 'legacy', 'required'];

function escape(text) {
  return text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
}

function page(title, body) {
  return [
    '<!doctype html>',
    '<html lang="en-GB">',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    // The page's own button meets the target size of WCAG 2.2, so axe checks only the field.
    '<style>form > button { min-height: 2.75rem }</style>',
    '<script type="module" src="/element.js"></script>',
    `<main>${body}</main>`,
    '</html>',
  ].join('\n');
}

function formPage(query) {
  const attributes = ATTRIBUTES.filter((name) => query.has(name))
    .map((name) => ` ${name}="${escape(query.get(name) ?? '')}"`)
    .join('');
  return page(
    'Delivery address',
    [
      '<h1>Delivery address</h1>',
      '<form action="/submitted">',
      `  <gatepost-postcode-field name="postcode"${attributes}></gatepost-postcode-field>`,
      '  <button>Continue</button>',
      '</form>',
    ].join('\n'),
  );
}

function submittedPage(query) {
  const sent = JSON.stringify(Object.fromEntries(query));
  return page('Sent', `<h1>Sent</h1><pre id="submitted">${escape(sent)}</pre>`);
}

const routes = {
  '/form': (query) => ['text/html', formPage(query)],
  '/submitted': (query) => ['text/html', submittedPage(query)],
  '/element.js': () => ['text/javascript', readFileSync(ELEMENT)],
};

await startMockServer({ port: 4010 });
createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost:3000');
  const route = routes[url.pathname];
  if (route === undefined) {
    response.writeHead(404).end();
    return;
  }
  const [type, body] = route(url.searchParams);
  response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }).end(body);
}).listen(3000, '127.0.0.1');

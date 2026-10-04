// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const EXAMPLES = [...README.matchAll(/```html\n([\s\S]*?)```/g)].map((match) => match[1] ?? '');
const CDN = 'https://cdn.jsdelivr.net/npm/@gatepost/field/dist/element.js';
const ELEMENT = fileURLToPath(new URL('../../dist/element.js', import.meta.url));
const MOCK = 'http://127.0.0.1:4010';

// Serves one example of the README as a page of the test server's origin, with the CDN file
// in place of the built element. No request leaves the machine.
async function open(page: Page, example: string): Promise<void> {
  await page.route(CDN, (route) =>
    route.fulfill({ path: ELEMENT, contentType: 'text/javascript' }),
  );
  await page.route('http://localhost:3000/readme', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en-GB"><title>README</title><main>${example}</main></html>`,
    }),
  );
  await page.goto('/readme');
}

test('the README holds the four HTML examples that these tests run', () => {
  expect(EXAMPLES).toHaveLength(4);
  expect(README).toContain('> Unofficial. Not made or endorsed by NIPOST.');
  const version = readFileSync(new URL('../../../../spec/VERSION', import.meta.url), 'utf8').trim();
  expect(README).toMatch(new RegExp(`Gatepost spec \\| ${version.replaceAll('.', '\\.')} +\\|`));
  expect(README).toContain('The first alpha is not on npm yet');
  // The CDN address names this file of the package, which the test replaces with the build.
  expect(existsSync(ELEMENT)).toBe(true);
});

test('the quickstart sends the canonical form', async ({ page }) => {
  await open(page, EXAMPLES[0]!);
  await page.getByLabel('Postcode').fill('fc 01 z99 zz 01');
  await page.keyboard.press('Enter');
  // The test server has no /address page, so the test waits for the request, not for a load.
  await page.waitForURL('**/address?postcode=FC-01-Z99-ZZ-01', { waitUntil: 'commit' });
});

test('the NIPOST example confirms the postcode, here through the mock server', async ({ page }) => {
  // The mock server stands in for the gateway, with its own publishable key.
  await page.route('https://api.postcode.gov.ng/**', async (route) => {
    const url = new URL(route.request().url());
    const headers = { ...route.request().headers(), 'x-api-key': 'nipost_pk_test_mock' };
    const response = await route.fetch({ url: `${MOCK}${url.pathname}${url.search}`, headers });
    await route.fulfill({ response });
  });
  await open(page, EXAMPLES[1]!);
  await page.getByLabel('Postcode').fill('FC01Z99ZZ01');
  await expect(page.getByRole('status')).toHaveText(
    'We found this postcode: SYNTHETIC LOCALITY, SYNTHETIC LGA, FEDERAL CAPITAL TERRITORY.',
  );
  await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible();
});

test('the change example shows each new form value', async ({ page }) => {
  await open(page, EXAMPLES[2]!);
  await page.getByLabel('Postcode').fill('fc01z99zz01');
  await expect(page.locator('#chosen')).toHaveText('FC-01-Z99-ZZ-01');
});

test('the theming example changes the label, the messages and the accent colour', async ({
  page,
}) => {
  await open(page, EXAMPLES[3]!);
  const field = page.getByLabel('Delivery postcode');
  await field.focus();
  // The outline of the focused input is the field's own use of the accent token.
  const outline = await field.evaluate((input) => getComputedStyle(input).outlineColor);
  expect(outline).toBe('rgb(91, 42, 134)');
  await field.blur();
  await expect(page.getByRole('status')).toHaveText('Enter the postcode of the delivery.');
});

test('a property set before the element is defined reaches the field, now and later', async ({
  page,
}) => {
  await page.route('http://localhost:3000/early', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: [
        '<!doctype html><html lang="en-GB"><title>Early</title>',
        '<gatepost-postcode-field name="postcode"></gatepost-postcode-field>',
        '<script>',
        "  document.querySelector('gatepost-postcode-field').messages = { label: 'Early' };",
        '</script>',
        '<script type="module" src="/element.js"></script></html>',
      ].join('\n'),
    }),
  );
  await page.goto('/early');
  await expect(page.getByLabel('Early')).toBeVisible();
  await page.evaluate(() => {
    const field = document.querySelector('gatepost-postcode-field');
    Object.assign(field ?? {}, { messages: { label: 'Later' } });
  });
  await expect(page.getByLabel('Later')).toBeVisible();
});

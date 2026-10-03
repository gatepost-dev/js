// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

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
  expect(README).toMatch(/Gatepost spec \| 0\.3\.0 +\|/);
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

test('the theming example changes the label and the accent colour', async ({ page }) => {
  await open(page, EXAMPLES[3]!);
  const field = page.getByLabel('Delivery postcode');
  await expect(field).toBeVisible();
  const accent = await page
    .locator('gatepost-postcode-field')
    .evaluate((element) => getComputedStyle(element).getPropertyValue('--gatepost-accent').trim());
  expect(accent).toBe('#5b2a86');
});

test('a property set before the element is defined is lost, as the README warns', async ({
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
  await expect(page.getByLabel('Postcode')).toBeVisible();
  await expect(page.getByLabel('Early')).toHaveCount(0);
  expect(README).toContain('A property that you set earlier is lost.');
});

test('a property set after whenDefined reaches the element', async ({ page }) => {
  await page.route('http://localhost:3000/late', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: [
        '<!doctype html><html lang="en-GB"><title>Late</title>',
        '<gatepost-postcode-field name="postcode"></gatepost-postcode-field>',
        '<script type="module" src="/element.js"></script>',
        '<script>',
        "  customElements.whenDefined('gatepost-postcode-field').then(() => {",
        "    document.querySelector('gatepost-postcode-field').messages = { label: 'Late' };",
        '  });',
        '</script></html>',
      ].join('\n'),
    }),
  );
  await page.goto('/late');
  await expect(page.getByLabel('Late')).toBeVisible();
});

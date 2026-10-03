// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const MOCK = 'http://127.0.0.1:4010';
const KEY = 'nipost_pk_test_mock';
const LOOKUPS = `/form?api-key=${KEY}&base-url=${MOCK}`;

async function expectAccessible(page: Page): Promise<void> {
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

async function sent(page: Page): Promise<unknown> {
  return JSON.parse(await page.locator('#submitted').innerText());
}

// Counts the submissions of the form and stops each one, so the page stays. A submission is
// synchronous with the key press, so the count is final when the press returns.
async function countSubmissions(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const counter = { count: 0 };
    Object.assign(window, { submissions: counter });
    document.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      counter.count += 1;
    });
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { submissions: { count: number } }).submissions.count,
    );
}

test('a keyboard user types a postcode and sends the canonical form', async ({ page }) => {
  await page.goto('/form?required');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Postcode')).toBeFocused();
  await page.keyboard.type('fc 01 z99 zz 01');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/submitted?**');
  expect(await sent(page)).toEqual({ postcode: 'FC-01-Z99-ZZ-01' });
});

test('a required field stops an empty form and says why', async ({ page }) => {
  await page.goto('/form?required');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('status')).toHaveText('Enter your postcode.');
  await expect(page).toHaveURL(/\/form/);
  await expectAccessible(page);
});

test('legacy accept and reject', async ({ page }) => {
  await page.goto('/form');
  await page.getByLabel('Postcode').fill('900108');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/submitted?**');
  expect(await sent(page)).toEqual({ postcode: '900108' });
  await page.goto('/form?legacy=reject');
  await page.getByLabel('Postcode').fill('900108');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText(
    'This is an old 6-digit postcode. Enter a new one, such as EK 01 A03 FK 01.',
  );
  await expect(page).toHaveURL(/\/form/);
  await expectAccessible(page);
});

test('Enter does nothing while the default button is disabled', async ({ page }) => {
  await page.goto('/form');
  const submissions = await countSubmissions(page);
  await page.getByLabel('Postcode').fill('FC01Z99ZZ01');
  await page.getByRole('button', { name: 'Continue' }).evaluate((button) => {
    (button as HTMLButtonElement).disabled = true;
  });
  await page.keyboard.press('Enter');
  expect(await submissions()).toBe(0);
  await page.getByRole('button', { name: 'Continue' }).evaluate((button) => {
    (button as HTMLButtonElement).disabled = false;
  });
  await page.keyboard.press('Enter');
  expect(await submissions()).toBe(1);
});

test('Enter does nothing while a disabled fieldset holds the default button', async ({ page }) => {
  await page.goto('/form');
  const submissions = await countSubmissions(page);
  await page.getByLabel('Postcode').fill('FC01Z99ZZ01');
  await page.getByRole('button', { name: 'Continue' }).evaluate((button) => {
    const fieldset = document.createElement('fieldset');
    fieldset.disabled = true;
    button.replaceWith(fieldset);
    fieldset.append(button);
  });
  await page.keyboard.press('Enter');
  expect(await submissions()).toBe(0);
});

test('the window losing focus shows no error, and leaving the input does', async ({ page }) => {
  await page.goto('/form');
  const input = page.getByLabel('Postcode');
  await input.fill('FC01');
  // A window that loses focus gives the input a blur, but the input stays the active element.
  await input.evaluate((element) => element.dispatchEvent(new FocusEvent('blur')));
  await expect(page.getByRole('status')).toHaveText('');
  await expect(input).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('status')).toHaveText(
    'A postcode has 11 letters and numbers. You entered 4.',
  );
});

test('confirms a postcode with the mock server at level 2', async ({ page }) => {
  await page.goto(`${LOOKUPS}&confirm=level2`);
  await page.getByLabel('Postcode').fill('fc01z99zz01');
  await expect(page.getByRole('status')).toHaveText(
    'We found this postcode: SYNTHETIC LOCALITY, SYNTHETIC LGA, FEDERAL CAPITAL TERRITORY.',
  );
  await expectAccessible(page);
});

test('offline format check: the form still sends a postcode that it could not check', async ({
  page,
}) => {
  await page.route(`${MOCK}/**`, (route) => route.abort());
  await page.goto(LOOKUPS);
  await page.getByLabel('Postcode').fill('FC01Z99ZZ01');
  await expect(page.getByRole('status')).toHaveText(
    'We could not check this postcode just now. You can still continue.',
  );
  await expectAccessible(page);
  await page.keyboard.press('Enter');
  await page.waitForURL('**/submitted?**');
  expect(await sent(page)).toEqual({ postcode: 'FC-01-Z99-ZZ-01' });
});

test('fills in a whole postcode from a precise location', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 9, longitude: 7, accuracy: 5 });
  await page.goto(`${LOOKUPS}&gps`);
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByLabel('Postcode')).toHaveValue('FC 01 Z99 ZZ 01');
  await expect(page.getByRole('status')).toHaveText(
    'We found this postcode in Federal Capital Territory.',
  );
});

test('coarse GPS: fills in part of the postcode, and the user types the rest', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 9, longitude: 7, accuracy: 40 });
  await page.goto(`${LOOKUPS}&gps`);
  await page.getByRole('button', { name: 'Use my location' }).click();
  const input = page.getByLabel('Postcode');
  await expect(input).toHaveValue('FC 01 Z99 ');
  await expect(input).toBeFocused();
  await expectAccessible(page);
  await page.keyboard.type('ZZ 01');
  await expect(page.getByRole('status')).toHaveText(
    'We found this postcode in Federal Capital Territory.',
  );
});

test('permission denied: says so, and the user types the postcode', async ({ page }) => {
  await page.goto(`${LOOKUPS}&gps`);
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'We cannot use your location. Type your postcode.',
  );
  await expectAccessible(page);
  await page.getByLabel('Postcode').fill('FC01Z99ZZ01');
  await expect(page.getByRole('status')).toHaveText(
    'We found this postcode in Federal Capital Territory.',
  );
});

test('refuses a secret key without a request, and logs one error', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`/form?api-key=nipost_live_abc&base-url=${MOCK}`);
  await page.getByLabel('Postcode').fill('FC01Z99ZZ01');
  await expect(page.getByRole('status')).toHaveText(
    'We cannot check postcodes on this page. You can still continue.',
  );
  expect(errors).toHaveLength(1);
  expect(requests.filter((url) => url.startsWith(MOCK))).toEqual([]);
});

test('fits a screen 320 CSS pixels wide without a sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/form?gps');
  await page.getByLabel('Postcode').fill('FCO1Z99ZZ01');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(320);
});

test('stops the spinner for a user who asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(`${MOCK}/**`, () => undefined);
  await page.goto(LOOKUPS);
  await page.getByLabel('Postcode').fill('FC01Z99ZZ01');
  await expect(page.getByRole('status')).toHaveText('Checking your postcode.');
  const animation = await page
    .locator('gatepost-postcode-field #note')
    .evaluate((note) => getComputedStyle(note, '::before').animationName);
  expect(animation).toBe('none');
});

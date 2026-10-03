// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import {
  test as base,
  expect,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
  type TestType,
} from '@playwright/test';

// The test page and the mock server are the only hosts that a journey may reach.
const OWN_HOSTS = ['http://localhost:3000/', 'http://127.0.0.1:4010/'];

// Every journey uses this test. A request that no route of the journey handles must go to the
// test page or the mock server. Any other request is stopped and fails the journey, so no
// journey can reach NIPOST or another outside host by mistake.
export const test: TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & { outsideRequests: undefined },
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
> = base.extend<{ outsideRequests: undefined }>({
  outsideRequests: [
    async ({ context }, use) => {
      const stray: string[] = [];
      await context.route('**/*', async (route) => {
        const url = route.request().url();
        if (OWN_HOSTS.some((host) => url.startsWith(host))) {
          await route.fallback();
          return;
        }
        stray.push(url);
        await route.abort();
      });
      await use(undefined);
      expect(stray, 'requests to outside hosts').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

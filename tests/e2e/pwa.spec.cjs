'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock } = require('./helpers.cjs');

// Real service workers are needed here; all other specs block them for
// determinism. The worker script itself is served by a context-level route mock.
test.use({ serviceWorkers: 'allow' });

const WORKER_V1 = `// e2e worker v1
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'MZA_SKIP_WAITING') self.skipWaiting();
});
`;

// Byte-different so registration.update() detects a real deployment. This
// version deliberately waits for the user-approved MZA_SKIP_WAITING message.
const WORKER_V2 = `// e2e worker v2
self.addEventListener('install', () => { /* wait for confirmation */ });
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'MZA_SKIP_WAITING') self.skipWaiting();
});
`;

async function startWithControlledWorker(page, context) {
  let workerScript = WORKER_V1;
  // Register before the page-level API boundary so the worker script is always
  // fulfilled locally instead of falling through to the static web server.
  await context.route('**/sw.js*', async route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: workerScript,
  }));
  const mock = await installApiMock(page);

  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration && navigator.serviceWorker.controller);
  }), { timeout: 10000 }).toBe(true);

  return {
    mock,
    deployUpdate() {
      workerScript = WORKER_V2;
      return page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    },
  };
}

async function waitingWorker(page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration && registration.waiting);
  });
}

test('update prompt confirmation activates the intercepted waiting worker', async ({ page, context }) => {
  const { mock, deployUpdate } = await startWithControlledWorker(page, context);
  await deployUpdate();

  const banner = page.locator('.mza-update-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('A new version of MZ Active is available.');
  await expect.poll(() => waitingWorker(page), { timeout: 10000 }).toBe(true);

  await Promise.all([
    page.waitForEvent('load', { timeout: 10000 }),
    banner.locator('.mza-update-confirm').click(),
  ]);
  await expect(page.locator('h1').first()).toBeVisible();
  await expect.poll(() => waitingWorker(page), { timeout: 10000 }).toBe(false);
  await expect(banner).toBeHidden();
  assertOfflineSafe(mock);
});

test('update prompt can be deferred without activating the worker', async ({ page, context }) => {
  const { mock, deployUpdate } = await startWithControlledWorker(page, context);
  await deployUpdate();

  const banner = page.locator('.mza-update-banner');
  await expect(banner).toBeVisible();
  await expect.poll(() => waitingWorker(page), { timeout: 10000 }).toBe(true);

  await banner.locator('.mza-update-later').click();
  await expect(banner).toBeHidden();
  await expect.poll(() => waitingWorker(page), { timeout: 10000 }).toBe(true);
  await expect(page.locator('h1').first()).toBeVisible();
  assertOfflineSafe(mock);
});

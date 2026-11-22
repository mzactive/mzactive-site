'use strict';

const { test, expect } = require('./pw.cjs');
const {
  assertOfflineSafe,
  installApiMock,
  json,
  seedSession,
} = require('./helpers.cjs');

// 1x1 transparent PNG, used only to exercise the browser-side preview.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function openCommunity(page, options = {}) {
  const mock = await installApiMock(page, options);
  await seedSession(page, { storage: 'local' });
  await page.goto('/community.html');
  await expect(page.locator('#sportsProfileSection')).toBeVisible();
  return mock;
}

test('a private member photo is owner-only and rendered from the worker bytes', async ({ page }) => {
  const mock = await openCommunity(page, {
    overrides: {
      'GET /api/me/sports-profile/photo': { status: 200, contentType: 'image/png', body: PNG },
    },
  });

  await expect(page.locator('#sportsPhotoPreview')).toBeVisible();
  await expect(page.locator('#sportsPhotoPreview')).toHaveAttribute('alt', 'Your private profile photo');
  await expect(page.locator('#sportsPhotoEmpty')).toBeHidden();
  await expect(page.locator('#sportsPhotoRemove')).toBeVisible();
  const calls = mock.calls.filter(call => call.path === '/api/me/sports-profile/photo');
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe('GET');
  assertOfflineSafe(mock);
});

test('photo upload and removal use the owner-only binary endpoints', async ({ page }) => {
  let acceptDialog = false;
  page.on('dialog', dialog => acceptDialog ? dialog.accept() : dialog.dismiss());
  const mock = await openCommunity(page, {
    overrides: {
      'PUT /api/me/sports-profile/photo': ctx => json({ saved: true, contentType: ctx.request.headers()['content-type'] }),
      'GET /api/me/sports-profile/photo': { status: 200, contentType: 'image/png', body: PNG },
    },
  });

  await page.locator('#sportsPhoto').setInputFiles({
    name: 'private.png', mimeType: 'image/png', buffer: PNG,
  });
  await page.click('#sportsPhotoUpload');
  await expect(page.locator('#sportsNotice')).toContainText('Private photo saved');
  const uploads = mock.calls.filter(call => call.method === 'PUT' && call.path === '/api/me/sports-profile/photo');
  expect(uploads).toHaveLength(1);

  acceptDialog = true;
  await page.click('#sportsPhotoRemove');
  await expect(page.locator('#sportsNotice')).toContainText('Private photo removed');
  const removals = mock.calls.filter(call => call.method === 'DELETE' && call.path === '/api/me/sports-profile/photo');
  expect(removals).toHaveLength(1);
  assertOfflineSafe(mock);
});

test('sports-profile sharing is opt-in and off by default', async ({ page }) => {
  const mock = await openCommunity(page, {
    sportsProfile: { display_name: 'E2E Athlete', garmin_public_url: 'https://connect.garmin.com/profile/e2e-athlete' },
  });

  await expect(page.locator('#sportsShare')).not.toBeChecked();
  await page.locator('#sportsForm button[type=submit]').click();
  const saves = mock.calls.filter(call => call.method === 'PUT' && call.path === '/api/me/sports-profile');
  expect(saves).toHaveLength(1);
  expect(saves[0].body.share_with_coaches).toBe(false);

  await page.locator('#sportsShare').check();
  await page.locator('#sportsForm button[type=submit]').click();
  const saves2 = mock.calls.filter(call => call.method === 'PUT' && call.path === '/api/me/sports-profile');
  expect(saves2).toHaveLength(2);
  expect(saves2[1].body.share_with_coaches).toBe(true);
  assertOfflineSafe(mock);
});

'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, seedSession } = require('./helpers.cjs');

test('Garmin is displayed as a public link only, with no sync or credential flow', async ({ page }) => {
  const PUBLIC_URL = 'https://connect.garmin.com/profile/e2e-athlete';
  const mock = await installApiMock(page, {
    sportsProfile: { display_name: 'E2E Athlete', garmin_public_url: PUBLIC_URL },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/community.html');

  const section = page.locator('#sportsProfileSection');
  await expect(section).toContainText('public profile link only');
  await expect(section).toContainText('no credentials or health data are collected');
  await expect(page.locator('#sportsForm')).toBeVisible();
  await expect(page.locator('#sportsGarmin')).toHaveAttribute('type', 'url');
  await expect(page.locator('#sportsGarmin')).toHaveValue(PUBLIC_URL);

  const visibleText = await section.innerText();
  expect(visibleText).not.toMatch(/\b(sync|oauth|access token|connect with garmin)\b/i);

  await page.locator('#sportsGarmin').fill('http://connect.garmin.com/profile/e2e-athlete');
  await page.locator('#sportsForm button[type=submit]').click();
  await expect(page.locator('#sportsNotice')).toContainText('public HTTPS Garmin URL');
  expect(mock.calls.filter(call => call.method === 'PUT')).toEqual([]);

  await page.locator('#sportsGarmin').fill(PUBLIC_URL);
  await page.locator('#sportsForm button[type=submit]').click();
  await expect(page.locator('#sportsNotice')).toContainText('Sports profile saved privately');
  const saves = mock.calls.filter(call => call.method === 'PUT' && call.path === '/api/me/sports-profile');
  expect(saves).toHaveLength(1);
  expect(saves[0].body.garmin_public_url).toBe(PUBLIC_URL);
  expect(Object.keys(saves[0].body)).not.toContain('password');
  assertOfflineSafe(mock);
});

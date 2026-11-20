'use strict';

const { test, expect } = require('./pw.cjs');
const {
  assertOfflineSafe,
  installApiMock,
  seedSession,
} = require('./helpers.cjs');

test('mobile menu opens, navigates and closes without a stuck loading state', async ({ page }) => {
  const mock = await installApiMock(page);
  await page.goto('/');

  await expect(page.locator('#menuToggle')).toBeVisible();
  await expect(page.locator('#mainNavigation')).not.toHaveClass(/is-open/);
  await page.locator('#menuToggle').click();
  await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#mainNavigation')).toHaveClass(/is-open/);

  await page.locator('#mainNavigation').getByRole('link', { name: 'Find a Coach' }).click();
  await expect(page).toHaveURL(/\/coaches\.html/);
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('#empty')).not.toContainText('Loading approved profiles');
  await expect(page.locator('#menuToggle')).toHaveCount(0);
  assertOfflineSafe(mock);
});

test('booking, admin and dashboard pages settle instead of loading forever', async ({ page }) => {
  const mock = await installApiMock(page);
  await seedSession(page, { storage: 'local' });

  await page.goto('/pacer.html');
  await expect(page.locator('#bookingSubmit')).toBeEnabled();
  await expect(page.locator('#bookingStatus')).not.toContainText('Saving request');

  await page.goto('/admin.html');
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#notice')).not.toContainText('Loading');

  await page.goto('/dashboard.html');
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#notice')).toBeEmpty();
  await expect(page.locator('#view')).toHaveCount(0);
  expect(mock.calls.filter(call => call.status === 501)).toEqual([]);
  assertOfflineSafe(mock);
});

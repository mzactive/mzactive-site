'use strict';

const { test, expect } = require('./pw.cjs');
const {
  FAKE_TOKEN,
  assertOfflineSafe,
  installApiMock,
  json,
  seedSession,
} = require('./helpers.cjs');

function access(permissions, accountType = 'manager', dashboardPath = '/admin.html') {
  return json({
    user: { id: 'e2e-manager', email: 'manager@example.invalid', role: 'provider' },
    account_type: accountType,
    dashboard_path: dashboardPath,
    management: { enabled: true, permissions },
  });
}

test('ordinary accounts never receive management menu actions', async ({ page }) => {
  const mock = await installApiMock(page);
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');

  const menu = page.locator('[data-account-menu] .account-menu');
  await expect(menu).toBeVisible();
  await menu.locator('.account-menu-button').click();
  const list = menu.locator('.account-menu-list');
  await expect(list).toContainText('Account Settings');
  await expect(list).toContainText('Sign Out');
  await expect(list).not.toContainText('Management Dashboard');
  await expect(list).not.toContainText('MZ AI Brain');
  assertOfflineSafe(mock);
});

test('authorized managers see only the management actions they were granted', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/me/access': access(['management.view']) },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');

  const menu = page.locator('[data-account-menu] .account-menu');
  await expect(menu).toBeVisible();
  await menu.locator('.account-menu-button').click();
  const list = menu.locator('.account-menu-list');
  await expect(list).toContainText('Management Dashboard');
  await expect(list).toContainText('Account Settings');
  await expect(list).toContainText('Sign Out');
  await expect(list).not.toContainText('MZ AI Brain');
  assertOfflineSafe(mock);
});

test('a manager with the AI permission sees MZ AI Brain', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/me/access': access(['management.view', 'management.ai']) },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');

  const button = page.locator('[data-account-menu] .account-menu-button');
  await expect(button).toBeVisible();
  await button.click();
  const aiLink = page.locator('[data-account-menu] .account-menu-list a[href="/admin.html?tab=ai"]');
  await expect(aiLink).toBeVisible();
  await expect(aiLink).toContainText('MZ AI Brain');
  assertOfflineSafe(mock);
});

test('sign-in follows the backend destination, not the page that received it', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'POST /api/auth/login': json({
        token: FAKE_TOKEN,
        user: { id: 'e2e-manager', role: 'provider' },
        account_type: 'manager',
        dashboard_path: '/admin.html',
        management: { enabled: true, permissions: ['management.view'] },
      }),
    },
  });
  await page.goto('/dashboard.html');

  await page.locator('#loginEmail').fill('manager@example.invalid');
  await page.locator('#loginPassword').fill('not-a-real-password');
  await page.locator('#loginForm button[type=submit]').click();

  await page.waitForURL('**/admin.html');
  await expect(page.locator('#workspace')).toBeVisible();
  const storage = await page.evaluate(() => ({
    session: sessionStorage.getItem('mzactive-provider-session'),
    local: localStorage.getItem('mzactive-provider-session'),
  }));
  expect(storage).toEqual({ session: FAKE_TOKEN, local: null });
  assertOfflineSafe(mock);
});

test('professional destinations also come from the backend response', async ({ page }) => {
  const providerAccess = access([], 'provider', '/providers.html');
  providerAccess.body = JSON.stringify({
    user: { id: 'e2e-coach', email: 'coach@example.invalid', role: 'provider' },
    account_type: 'provider',
    dashboard_path: '/providers.html',
    management: { enabled: false, permissions: [] },
  });
  const mock = await installApiMock(page, {
    overrides: {
      'POST /api/auth/login': json({
        token: FAKE_TOKEN,
        user: { id: 'e2e-coach', role: 'admin' },
        account_type: 'provider',
        dashboard_path: '/providers.html',
        management: { enabled: false, permissions: [] },
      }),
      'GET /api/me/access': providerAccess,
    },
  });
  await page.goto('/dashboard.html');

  await page.locator('#loginEmail').fill('coach@example.invalid');
  await page.locator('#loginPassword').fill('not-a-real-password');
  await page.locator('#loginForm button[type=submit]').click();

  await page.waitForURL('**/providers.html');
  await expect(page.locator('#providerProfile')).toBeVisible();
  const storage = await page.evaluate(() => ({
    session: sessionStorage.getItem('mzactive-provider-session'),
    local: localStorage.getItem('mzactive-provider-session'),
  }));
  expect(storage).toEqual({ session: null, local: FAKE_TOKEN });
  assertOfflineSafe(mock);
});

test('the homepage Management Portal link is bilingual inside the PWA shell', async ({ page }) => {
  const mock = await installApiMock(page);
  await page.goto('/');

  const link = page.locator('.management-footer-link').first();
  await expect(link).toHaveAttribute('href', 'https://mzactive.com/admin.html');
  await expect(link.locator('span')).toHaveText('Management Portal');
  await page.locator('.lang-toggle').first().click();
  await expect(link.locator('span')).toHaveText('بوابة الإدارة');
  await expect(link).toHaveAttribute('aria-label', 'بوابة الإدارة');
  assertOfflineSafe(mock);
});

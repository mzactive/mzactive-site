'use strict';

const { test, expect } = require('./pw.cjs');
const { abort, assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  super_admin: true,
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});
const healthyDashboard = json({
  counts: { bookings: 0, coaches: 0, messages: 0, community: 0, articles: 0, ai: 0 },
  notifications: [], unread: 0, total: 0, activity: [],
  generated_at: '2026-11-21T12:00:00.000Z',
});

async function openWithDashboardOverride(page, firstResponse) {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': adminAccess,
      'GET /api/admin/dashboard': [firstResponse, healthyDashboard],
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');
  return mock;
}

test('a failed dashboard load shows the request detail and Retry reloads real data', async ({ page }) => {
  const mock = await openWithDashboardOverride(page, json({ error: 'service_unavailable' }, 500));

  await expect(page.locator('#notice')).toContainText('500 GET admin/dashboard');
  await expect(page.locator('[data-retry="1"]')).toBeVisible();
  await expect(page.locator('#view .dashboard-grid')).toHaveCount(0);

  await page.locator('[data-retry="1"]').click();

  await expect(page.locator('#view .dashboard-grid')).toBeVisible();
  await expect(page.locator('#notice')).toBeEmpty();
  const dashboardCalls = mock.calls.filter(call => call.path === '/api/admin/dashboard');
  expect(dashboardCalls.length).toBeGreaterThanOrEqual(2);
  expect(dashboardCalls.map(call => call.status)).toEqual([500, 200]);
  assertOfflineSafe(mock);
});

test('a transport failure keeps the connection message and Retry recovers', async ({ page }) => {
  const mock = await openWithDashboardOverride(page, abort());

  await expect(page.locator('#notice')).toContainText('Could not reach the service');
  await expect(page.locator('#notice')).toContainText('GET admin/dashboard');
  await expect(page.locator('[data-retry="1"]')).toBeVisible();

  await page.locator('[data-retry="1"]').click();

  await expect(page.locator('#view .dashboard-grid')).toBeVisible();
  assertOfflineSafe(mock);
});

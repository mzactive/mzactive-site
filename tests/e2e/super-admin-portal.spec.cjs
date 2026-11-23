'use strict';

/*
 * Synthetic super-admin portal journeys. Every Worker response is mocked;
 * no production identity, record or statistic is read or changed.
 */

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const superAdminAccess = json({
  user: { id: 'e2e-super', email: 'super@example.invalid', role: 'admin' },
  super_admin: true,
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

const program = {
  id: 'program-e2e',
  athlete_name: 'Synthetic Athlete',
  coach_name: 'Synthetic Coach',
  athlete_type: 'runner',
  week_start: '2026-11-16',
  session_count: 3,
  completion_count: 1,
  access_linked: true,
};

async function openPortal(page, overrides = {}, tab = 'overview') {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': superAdminAccess,
      ...overrides,
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html?tab=' + tab);
  await expect(page.locator('#workspace')).toBeVisible();
  return mock;
}

test('a super admin sees every management tab and live training programs', async ({ page }) => {
  const mock = await openPortal(page, {
    'GET /api/admin/programs': () => json({ programs: [program] }),
  }, 'programs');

  const nav = page.locator('#nav button[data-nav-tab]');
  await expect(nav).toHaveCount(13);
  for (const tab of ['athletes', 'coaches', 'pacers', 'bookings', 'programs', 'messages', 'community', 'ai', 'reports', 'trash', 'settings']) {
    await expect(page.locator('#nav button[data-nav-tab="' + tab + '"]')).toBeVisible();
  }
  const row = page.locator('.program-row[data-record-id="program-e2e"]');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Synthetic Athlete');
  await expect(row).toContainText('Linked');
  assertOfflineSafe(mock);
});

test('Reports reads only audit-table records', async ({ page }) => {
  const reports = {
    history: [],
    authentication: [{ created_at: '2026-11-21T10:00:00.000Z', kind: 'reset_completed', detail: 'synthetic security audit' }],
    accounts: [{ created_at: '2026-11-21T09:00:00.000Z', action: 'account_updated', subject_user_id: 'subject-e2e' }],
    agents: [],
  };
  const mock = await openPortal(page, {
    'GET /api/admin/reports': () => json(reports),
  }, 'reports');

  await expect(page.locator('#view')).toContainText('Every entry below is read from an audit table');
  await expect(page.locator('#view')).toContainText('account_updated');
  await expect(page.locator('#view')).toContainText('subject-e2e');
  await expect(page.locator('#view')).toContainText('synthetic security audit');
  assertOfflineSafe(mock);
});

test('Settings assigns scoped permissions through the audited backend endpoint', async ({ page }) => {
  let acceptDialog = false;
  page.on('dialog', dialog => acceptDialog ? dialog.accept() : dialog.dismiss());
  const writes = [];
  const mock = await openPortal(page, {
    'GET /api/admin/management/permissions': () => json({
      available: ['management.view', 'management.coaches', 'management.audit'],
      grants: [],
    }),
    'PUT /api/admin/management/permissions': ctx => {
      writes.push(ctx.body);
      return json({ ok: true });
    },
  }, 'settings');

  await expect(page.locator('.permission-option input[data-permission]')).toHaveCount(3);
  await page.locator('input[aria-label="Account email"]').fill('manager@example.invalid');
  await page.locator('input[data-permission="management.view"]').check();
  await page.locator('input[data-permission="management.coaches"]').check();
  acceptDialog = true;
  await page.locator('.account-action-button').filter({ hasText: 'Save permissions' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({
    email: 'manager@example.invalid',
    permissions: ['management.view', 'management.coaches'],
  });
  assertOfflineSafe(mock);
});

'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, clickAdminTab, installApiMock, json, seedSession } = require('./helpers.cjs');

const CREATED = '2026-11-22T10:00:00.000Z';
const PACER_ID = 'pacer-admin-e2e';

const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  super_admin: true,
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

const pacers = json({
  pacers: [{
    id: PACER_ID, display_name: 'E2E Pacer Applicant', city: 'Doha', country: 'QA',
    status: 'pending', verified: false, experience: '10 years running',
    distances: ['10K', 'Half Marathon'], paces: { '10K': '4:30' },
    availability: 'Weekend mornings', created_at: CREATED,
  }, {
    id: 'approved-pacer', display_name: 'E2E Approved Pacer', status: 'approved', verified: true,
  }, {
    id: 'rejected-pacer', display_name: 'E2E Rejected Pacer', status: 'rejected', verified: false,
  }],
});

test('Admin Portal reviews independent Pacer applications and requests', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': adminAccess,
      'GET /api/admin/dashboard': json({ counts: {}, notifications: [], activity: [], generated_at: CREATED }),
      'GET /api/admin/agents': json({ snapshot: {}, tasks: [], pending: [], activity: [], status: 'available' }),
      'GET /api/admin/pacers': pacers,
      'GET /api/admin/pacer-requests': json({ requests: [{
        id: 'pacer-request-e2e', pacer_name: 'E2E Pacer Applicant',
        event_name: 'Race pacing', date: '2026-12-01', distance: '10K',
        target_pace: '4:30/km', status: 'pending', created_at: CREATED,
      }] }),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');
  await expect(page.locator('#workspace')).toBeVisible();

  await clickAdminTab(page, 'pacers');
  await expect(page.locator('#title')).toHaveText('Pacers');
  await expect(page.locator('#view')).toContainText('E2E Pacer Applicant');
  await expect(page.locator('#view')).toContainText('Independent Pacer review');
  await expect(page.locator('#view')).toContainText('10K');
  await expect(page.locator('#view')).toContainText('Race pacing');
  const profileButton = page.getByRole('button', { name: 'View profile · E2E Pacer Applicant' });
  await profileButton.click();
  const dialog = page.getByRole('dialog', { name: 'E2E Pacer Applicant' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Weekend mornings');
  await expect(dialog).toContainText('4:30');
  await expect(dialog.getByRole('link', { name: 'Open public profile' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(profileButton).toBeFocused();
  await page.getByRole('button', { name: 'View profile · E2E Approved Pacer' }).click();
  const approved = page.getByRole('dialog', { name: 'E2E Approved Pacer' });
  await expect(approved.getByRole('link', { name: 'Open public profile' })).toHaveAttribute('href', '/pacer-profile.html?id=approved-pacer');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'View profile · E2E Rejected Pacer' }).click();
  const rejected = page.getByRole('dialog', { name: 'E2E Rejected Pacer' });
  await expect(rejected).toContainText('Rejected');
  await expect(rejected.getByRole('link', { name: 'Open public profile' })).toHaveCount(0);
  await expect(mock.calls.filter(call=>call.method==='PATCH')).toHaveLength(0);
  assertOfflineSafe(mock);
});

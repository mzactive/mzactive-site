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
  assertOfflineSafe(mock);
});

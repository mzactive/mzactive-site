'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const access = json({
  user: { id: 'e2e-super', email: 'super@example.invalid', role: 'admin' },
  super_admin: true,
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

const brain = {
  settings: {
    notifications_enabled: true,
    report_time: '07:00',
    timezone: 'Asia/Qatar',
    admin_email: 'mzactive@yahoo.com',
    last_report_at: '2026-11-23T04:00:00.000Z',
    last_report_status: 'sent',
    updated_at: '2026-11-23T04:00:00.000Z',
  },
  status: 'available',
  email: { configured: true, sent: 4, failed: 0, pending: 0 },
  last_execution: '2026-11-23T04:00:00.000Z',
  latest_report: {
    id: 'report-e2e', report_date: '2026-11-23', created_at: '2026-11-23T04:00:00.000Z',
    summary: 'MZ AI Brain daily report', counts: { new_registrations: 2, pending_approvals: 1 },
    recommendations: ['Review 1 pending professional application(s) in the Admin Portal.'],
    email_status: 'sent', error: null,
  },
  reports: [{ id: 'report-e2e', report_date: '2026-11-23', created_at: '2026-11-23T04:00:00.000Z', email_status: 'sent', error: null }],
  errors: [],
};

test('the AI Brain panel shows real status and requires confirmed admin actions', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': access,
      'GET /api/admin/ai-brain': json(brain),
      'PATCH /api/admin/ai-brain': json({ updated: true, settings: { ...brain.settings, report_time: '08:15' } }),
      'POST /api/admin/ai-brain/test-email': json({ delivered: true, provider_id: 'e2e_provider' }),
      'POST /api/admin/ai-brain/run': json({ report_date: '2026-11-23', email: { ok: true } }),
    },
  });
  await seedSession(page, { storage: 'session' });
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/admin.html?tab=ai');
  await expect(page.locator('#workspace')).toBeVisible();

  const panel = page.locator('.command-panel').filter({ hasText: 'MZ AI Brain notifications' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('mzactive@yahoo.com');
  await expect(panel).toContainText('Review 1 pending professional application');
  await expect(panel).toContainText('Configured');

  await panel.locator('input[type="time"]').fill('08:15');
  await panel.getByRole('button', { name: 'Save notification settings' }).click();
  await expect.poll(() => mock.calls.some(call =>
    call.method === 'PATCH' && call.path === '/api/admin/ai-brain' && call.body?.report_time === '08:15' && call.body?.confirm === true
  )).toBe(true);

  await panel.getByRole('button', { name: 'Send test email' }).click();
  await expect.poll(() => mock.calls.some(call =>
    call.method === 'POST' && call.path === '/api/admin/ai-brain/test-email' && call.body?.confirm === true
  )).toBe(true);

  await panel.getByRole('button', { name: 'Run report now' }).click();
  await expect.poll(() => mock.calls.some(call =>
    call.method === 'POST' && call.path === '/api/admin/ai-brain/run' && call.body?.confirm === true
  )).toBe(true);
  assertOfflineSafe(mock);
});

'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, clickAdminTab, installApiMock, json, seedSession } = require('./helpers.cjs');

const COACH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  super_admin: true,
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

function pendingCoach() {
  return {
    id: COACH_ID, provider_type: 'coach', display_name: 'Approval E2E Coach',
    country: 'QA', city: 'Doha', email: 'approval@example.invalid', status: 'pending',
    bio: 'A complete biography for the approval regression test.',
    specialties_json: '["Running"]', languages_json: '["English"]',
    qualifications: 'Certified', services_json: '["Sessions"]', coaching_mode: 'both',
    program_durations_json: '[1]', public_fields_json: '["profile_photo"]',
    has_profile_photo: 0, has_cover: 0, profile_complete: 1,
    updated_at: '2026-11-21T11:00:00.000Z', gallery_slots: '[]',
  };
}

test('approval is authorized, shows feedback and updates status without changing real records', async ({ page }) => {
  const approvedCoach = { ...pendingCoach(), status: 'approved', welcome_email_status: 'sent' };
  let applicationStatus = 'pending';
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': adminAccess,
      'GET /api/admin/applications': () => json({
        providers: applicationStatus === 'pending' ? [pendingCoach()] : [],
        approved_providers: applicationStatus === 'approved' ? [approvedCoach] : [],
        rejected_providers: [], suspended_providers: [], bookings: [],
      }),
      [`PATCH /api/admin/providers/${COACH_ID}`]: ctx => {
        const body = typeof ctx.body === 'object' && ctx.body ? ctx.body : {};
        expect(body.status).toBe('approved');
        expect(body.review_version).toBe('2026-11-21T11:00:00.000Z');
        expect(body.verified).toBe(true);
        applicationStatus = 'approved';
        return json({ updated: true, status: 'approved', welcome_email: { status: 'sent' } });
      },
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');
  await clickAdminTab(page, 'coaches');

  const card = page.locator(`.coach-card[data-record-id="${COACH_ID}"]`);
  await expect(card).toBeVisible();
  await card.locator('summary').click();
  await card.locator('input[type=checkbox]').check();

  const approve = card.getByRole('button', { name: 'Approve' });
  await approve.click();
  await expect(page.locator('#notice')).toContainText('welcome email has been sent');

  await page.getByRole('button', { name: /^Approved \(1\)$/ }).click();
  const approved = page.locator(`.coach-card[data-record-id="${COACH_ID}"]`);
  await expect(approved).toContainText('Approved');
  await expect(approved).toContainText('Welcome email sent');
  const approvalCall = mock.calls.find(call => call.method === 'PATCH' && call.path === `/api/admin/providers/${COACH_ID}`);
  expect(approvalCall).toBeTruthy();
  assertOfflineSafe(mock);
});

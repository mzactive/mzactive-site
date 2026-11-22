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

const applications = json({
  providers: [{
    id: PACER_ID, provider_type: 'pacer', display_name: 'E2E Pacer Applicant',
    email: 'pacer@example.invalid', city: 'Doha', country: 'QA', status: 'pending',
    profile_complete: 1, updated_at: CREATED, review_version: CREATED,
    bio: 'Reviewed endurance pacing background.',
    specialties_json: '["Running"]', languages_json: '["English"]',
    services_json: '["Sessions"]', qualifications: 'Pacing qualification',
    pacer_details: {
      sports: ['running'], services: ['sessions', 'race'], distances: ['10K', 'Half Marathon'],
      running_pace: '4:30/km', cycling_speed: '', achievements: 'Regional race result',
      personal_bests: '10K — 42:30', hourly_rate_qar: 250, race_rate_qar: 600,
      service_areas: 'Doha and Lusail', availability: 'Weekend mornings',
    },
  }],
  approved_providers: [], rejected_providers: [], suspended_providers: [],
  bookings: [{
    id: 'booking-pacer-e2e', provider_id: PACER_ID, provider_type: 'pacer',
    status: 'received', customer_name: 'E2E Athlete', coach_name: 'E2E Pacer Applicant',
    city: 'Doha', session_type: 'race', service_name: 'Race pacing',
    distance: '10K', target_pace: '4:30/km', created_at: CREATED,
  }],
});

test('Admin Portal reviews Pacer applications and their booking requests', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': adminAccess,
      'GET /api/admin/dashboard': json({ counts: {}, notifications: [], activity: [], generated_at: CREATED }),
      'GET /api/admin/agents': json({ snapshot: {}, tasks: [], pending: [], activity: [], status: 'available' }),
      'GET /api/admin/applications': applications,
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');
  await expect(page.locator('#workspace')).toBeVisible();

  await clickAdminTab(page, 'pacers');
  await expect(page.locator('#title')).toHaveText('Pacers');
  await expect(page.locator('#view')).toContainText('E2E Pacer Applicant');
  await expect(page.locator('#view')).toContainText('Champion Pacer');
  await expect(page.locator('#view')).toContainText('Pacer booking requests');
  await expect(page.locator('#view')).toContainText('Race pacing');

  await page.locator('.coach-card').first().locator('summary').click();
  await expect(page.locator('.coach-card').first()).toContainText('4:30/km');
  await expect(page.locator('.coach-card').first()).toContainText('Regional race result');
  await expect(page.locator('.coach-card').first()).toContainText('Weekend mornings');
  assertOfflineSafe(mock);
});

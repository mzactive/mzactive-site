'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const bodybuildingCoach = {
  id: 'bb-coach-e2e', provider_type: 'bodybuilding_coach', status: 'approved',
  display_name: 'E2E Bodybuilding Coach', city: 'Doha', country: 'Qatar',
  specialties: ['Bodybuilding'], languages: ['English'], services: ['Training plan'],
  professional_category: { en: 'Bodybuilding Coach', ar: 'مدرب كمال الأجسام' },
  public_fields: ['city', 'specialties', 'languages', 'bio', 'profile_photo'],
  has_profile_photo: false,
};

test('coach search filters by Bodybuilding Coach category', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/providers': json({ providers: [bodybuildingCoach] }) },
  });
  await page.goto('/coaches.html?type=bodybuilding_coach');
  await expect(page.locator('#typeSearch')).toHaveValue('bodybuilding_coach');
  await expect(page.locator('body')).toContainText('E2E Bodybuilding Coach');
  await expect(page.locator('body')).toContainText('Bodybuilding Coach');
  assertOfflineSafe(mock);
});

test('profile editor supports the Bodybuilding Coach category', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': json({
        user: { id: 'e2e-bb', email: 'bb@example.invalid', role: 'provider' },
        account_type: 'provider', dashboard_path: '/providers.html', management: { enabled: false, permissions: [] },
      }),
      'GET /api/me/profile': json({ profile: {
        id: 'profile-e2e', provider_type: 'bodybuilding_coach', status: 'approved',
        display_name: 'E2E Bodybuilding Coach', city: 'Doha', specialties: ['Bodybuilding'],
        languages: ['English'], program_durations: [1], public_fields: ['city', 'specialties'],
      } }),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/providers.html#provider-portal');
  const option = page.locator('#profileEditor select[name="provider_type"] option[value="bodybuilding_coach"]');
  await expect(option).toHaveCount(1);
  assertOfflineSafe(mock);
});

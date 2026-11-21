'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, clickAdminTab, installApiMock, json, seedSession } = require('./helpers.cjs');

const PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});
const imageBytes = fs.readFileSync(path.join(__dirname, '../../assets/brand/mzactive-logo.webp'));
const imageResponse = { status: 200, contentType: 'image/webp', body: imageBytes };

function applications(overrides = {}) {
  return json({
    providers: [{
      id: PROFILE_ID, provider_type: 'coach', display_name: 'Photo Test Coach',
      country: 'QA', city: 'Doha', email: 'photo@example.invalid', status: 'pending',
      bio: 'A complete biography for the photo regression test.',
      specialties_json: '["Running"]', languages_json: '["English"]',
      qualifications: 'Certified', services_json: '["Sessions"]', coaching_mode: 'both',
      program_durations_json: '[1]', public_fields_json: '["profile_photo"]',
      has_profile_photo: 1, has_cover: 1, profile_complete: 1,
      updated_at: '2026-11-21T11:00:00.000Z', gallery_slots: '[]',
      ...overrides,
    }],
    approved_providers: [], rejected_providers: [], suspended_providers: [], bookings: [],
  });
}

async function openCoachDetails(page) {
  await expect(page.locator('#workspace')).toBeVisible();
  await clickAdminTab(page, 'coaches');
  const card = page.locator(`.coach-card[data-record-id="${PROFILE_ID}"]`);
  await expect(card).toBeVisible();
  await card.locator('summary').click();
  return card;
}

test('stored portrait and cover render as decoded images in an expanded coach card', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': adminAccess,
      'GET /api/admin/applications': applications(),
      [`GET /api/admin/providers/${PROFILE_ID}/photo`]: imageResponse,
      [`GET /api/admin/providers/${PROFILE_ID}/cover`]: imageResponse,
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');

  const card = await openCoachDetails(page);
  const images = card.locator('.coach-details .photo-slot img.thumb');
  await expect(images).toHaveCount(2);
  await expect(images.first()).toBeVisible();
  const decoded = await images.evaluateAll((nodes) => nodes.map((img) => img.naturalWidth));
  expect(decoded.every((width) => width > 0), JSON.stringify(decoded)).toBe(true);
  await expect(card.locator('.coach-details label input[type=file]')).toHaveCount(2);
  await expect(card).toContainText('maximum 1 MB');
  assertOfflineSafe(mock);
});

test('a missing photo keeps the accessible monogram instead of a broken image', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': adminAccess,
      'GET /api/admin/applications': applications({ has_cover: 0 }),
      [`GET /api/admin/providers/${PROFILE_ID}/photo`]: {
        status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'photo_not_found' }),
      },
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');

  const card = await openCoachDetails(page);
  const fallback = card.locator('.coach-details .photo-slot .avatar');
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute('aria-label', 'Photo unavailable for Photo Test Coach');
  await expect(card.locator('.coach-details .photo-slot img')).toHaveCount(0);
  assertOfflineSafe(mock);
});

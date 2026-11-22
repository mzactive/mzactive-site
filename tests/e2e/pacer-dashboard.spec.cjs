'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const CREATED = '2026-11-22T10:00:00.000Z';
const PACER_ID = 'pacer-owner-e2e';

const approvedPacer = {
  id: PACER_ID,
  provider_type: 'pacer',
  status: 'approved',
  display_name: 'E2E Approved Pacer',
  city: 'Doha',
  country: 'Qatar',
  specialties: ['Running', 'Cycling'],
  languages: ['English', 'Arabic'],
  services: ['Training sessions', 'Race pacing'],
  pacer_details: {
    sports: ['running', 'cycling'],
    services: ['sessions', 'race'],
    distances: ['5K', '10K', 'Half Marathon'],
    running_pace: '4:30/km',
    cycling_speed: '32 km/h',
    service_areas: 'Doha and Lusail',
    availability: 'Weekend mornings',
  },
};

const bookings = [
  {
    id: 'booking-open', provider_id: PACER_ID, provider_type: 'pacer', status: 'received',
    customer_name: 'Open Athlete', customer_phone: '97455555555', city: 'Doha',
    session_type: 'training', service_name: 'Training session', distance: '10K',
    target_pace: '4:45/km', goal_summary: 'Steady pacing request', created_at: CREATED,
  },
  {
    id: 'booking-confirmed', provider_id: PACER_ID, provider_type: 'pacer', status: 'accepted',
    customer_name: 'Confirmed Athlete', customer_phone: '97412345678', city: 'Lusail',
    session_type: 'race', service_name: 'Race pacing', distance: 'Half Marathon',
    target_pace: '4:30/km', preferred_date: '2027-03-01', created_at: CREATED,
  },
  {
    id: 'booking-past', provider_id: PACER_ID, provider_type: 'pacer', status: 'accepted',
    customer_name: 'Past Athlete', customer_phone: '97400000000', city: 'Doha',
    session_type: 'training', service_name: 'Training session', distance: '5K',
    target_pace: '5:00/km', preferred_date: '2026-10-01', created_at: CREATED,
  },
];

test('an approved Pacer manages real requests from the account-connected workspace', async ({ page }) => {
  await seedSession(page);
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': json({
        user: { id: 'e2e-pacer', email: 'pacer@example.invalid', role: 'provider' },
        account_type: 'provider', dashboard_path: '/providers.html',
        management: { enabled: false, permissions: [] },
      }),
      'GET /api/me/profile': json({ profile: approvedPacer }),
      'GET /api/dashboard/bookings': json({ bookings }),
    },
  });

  await page.goto('/providers.html');
  await expect(page.locator('#pacerDashboard')).toBeVisible();
  await expect(page.locator('#pacerPublicProfile')).toHaveAttribute('href', 'pacer.html?provider=pacer-owner-e2e');
  await expect(page.locator('#pacerFacts')).toContainText('4:30/km');
  await expect(page.locator('#pacerFacts')).toContainText('32 km/h');
  await expect(page.locator('#pacerBookings')).toContainText('Open Athlete');
  await expect(page.locator('#pacerBookings')).toContainText('Steady pacing request');
  await expect(page.locator('#pacerConfirmed')).toContainText('Confirmed Athlete');
  await expect(page.locator('#pacerPast')).toContainText('Past Athlete');

  await page.locator('#pacerBookings button[data-status="accepted"]').click();
  await expect.poll(() => mock.calls.some(call =>
    call.method === 'PATCH' && call.path === '/api/dashboard/bookings/booking-open' && call.body?.status === 'accepted'
  )).toBe(true);
  assertOfflineSafe(mock);
});

test('the Pacer workspace stays hidden for non-Pacer accounts', async ({ page }) => {
  await seedSession(page);
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': json({
        user: { id: 'e2e-coach', email: 'coach@example.invalid', role: 'provider' },
        account_type: 'provider', dashboard_path: '/providers.html',
        management: { enabled: false, permissions: [] },
      }),
      'GET /api/me/profile': json({ profile: { ...approvedPacer, provider_type: 'coach' } }),
    },
  });

  await page.goto('/providers.html');
  await expect(page.locator('#pacerDashboard')).toHaveCount(0);
  assertOfflineSafe(mock);
});

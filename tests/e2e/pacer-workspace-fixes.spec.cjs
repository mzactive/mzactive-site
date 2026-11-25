'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const CREATED = '2026-11-25T10:00:00.000Z';
const PACER_ID = 'pacer-workspace-e2e';

const profile = {
  id: PACER_ID,
  display_name: 'E2E Workspace Pacer',
  city: 'Doha',
  country: 'Qatar',
  status: 'approved',
  verified: true,
  availability: 'Weekends',
  bio: 'Pacing biography',
  distances: ['10K', 'Marathon'],
  paces: { '10K': '05:00' },
};

const requests = [
  {
    id: 'pacer-req-pending', pacer_id: PACER_ID, status: 'pending',
    event_name: 'Doha Community 10K', date: '2026-12-12', location: 'Doha',
    distance: '10K', target_pace: '05:00', target_time: '50:00',
    message: 'Please hold 5:00 per km', customer_name: 'Runner One',
    customer_phone: '55550001', created_at: CREATED,
  },
  {
    id: 'pacer-req-accepted', pacer_id: PACER_ID, status: 'accepted',
    event_name: 'Race day pacing', date: '2027-01-10', location: 'Lusail',
    distance: 'Marathon', target_pace: '05:15', customer_name: 'Runner Two',
    customer_phone: '55550002', created_at: CREATED,
  },
];

test('Pacer workspace shows real requests using the pacing-request contract', async ({ page }) => {
  await seedSession(page);
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/pacer/profile': json({ profile }),
      'GET /api/pacer/requests': json({ requests }),
      'PATCH /api/pacer/requests/pacer-req-pending': json({ updated: true, status: 'accepted' }),
    },
  });
  await page.goto('/pacer-dashboard.html');

  await expect(page.locator('#pendingList')).toContainText('Doha Community 10K');
  await expect(page.locator('#pendingList')).toContainText('2026-12-12');
  await expect(page.locator('#pendingList')).toContainText('Doha');
  await expect(page.locator('#pendingList')).toContainText('Pending');
  await expect(page.locator('#acceptedList')).toContainText('Race day pacing');
  await expect(page.locator('#eventsList')).toContainText('Race day pacing');
  await expect(page.locator('body')).not.toContainText('undefined');

  await page.locator('#pendingList button').first().click();
  await expect.poll(() => mock.calls.some(c =>
    c.method === 'PATCH' && c.path === '/api/pacer/requests/pacer-req-pending' && c.body?.status === 'accepted'
  )).toBe(true);
  assertOfflineSafe(mock);
});

test('public Pacer profile escapes submitted fields and links back to the directory', async ({ page }) => {
  const attack = '<img src=x onerror="window.__pwned=1">';
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/pacers/pacer-xss': json({ pacer: {
        id: 'pacer-xss', display_name: attack, city: 'Doha', country: 'Qatar',
        bio: attack, achievements: attack, experience: '10 years',
        distances: [attack], paces: { '10K': attack }, availability: attack,
        languages: ['Arabic'], status: 'approved', verified: true, has_photo: false,
      } }),
    },
  });
  await page.goto('/pacer-profile.html?id=pacer-xss');

  await expect(page.locator('#profileCard')).toContainText(attack);
  expect(await page.evaluate(() => Boolean(window.__pwned))).toBe(false);
  expect(await page.locator('#profileCard img[onerror]').count()).toBe(0);
  await expect(page.locator('#profileCard a.button')).toHaveAttribute('href', /pacer\.html\?provider=pacer-xss/);
  await expect(page.locator('a[href="pacer.html"]').first()).toBeVisible();
  assertOfflineSafe(mock);
});

test('Pacer registration stores the session and uploads a raw image', async ({ page }) => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  let photoType = '';
  const mock = await installApiMock(page, {
    overrides: {
      'POST /api/pacer/register': json({
        token: 'pacer-e2e-token', user: { id: 'pacer-e2e', email: 'pacer@example.invalid', role: 'provider' },
        account_type: 'provider', dashboard_path: '/providers.html',
        created: true, id: 'pacer-new-e2e', status: 'pending',
      }, 201),
      'PUT /api/pacer/profile/photo': (ctx) => {
        photoType = ctx.request.headers()['content-type'] || '';
        return json({ updated: true, photo_updated_at: CREATED });
      },
    },
  });
  await page.goto('/pacer-register.html');
  await page.locator('#display_name').fill('New Pacer');
  await page.locator('#email').fill('pacer@example.invalid');
  await page.locator('#password').fill('pacer-e2e-password');
  await page.locator('#phone').fill('55550003');
  await page.locator('#city').fill('Doha');
  await page.locator('#bio').fill('Endurance pacer');
  await page.locator('#photo').setInputFiles({ name: 'pacer.png', mimeType: 'image/png', buffer: png });
  await page.locator('#consent').check();
  await page.locator('button[type="submit"]').click();

  await expect.poll(() => mock.calls.some(c => c.method === 'POST' && c.path === '/api/pacer/register')).toBe(true);
  await expect.poll(() => mock.calls.some(c => c.method === 'PUT' && c.path === '/api/pacer/profile/photo')).toBe(true);
  expect(photoType).toBe('image/png');
  expect(await page.evaluate(() => localStorage.getItem('mzactive-provider-session'))).toBe('pacer-e2e-token');
  await expect(page.locator('#status a')).toHaveAttribute('href', '/providers.html');
  assertOfflineSafe(mock);
});

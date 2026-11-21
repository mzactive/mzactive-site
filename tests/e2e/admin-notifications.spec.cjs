'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const CREATED = '2026-11-21T11:00:00.000Z';
const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const COACH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

function notificationCounts(overrides = {}) {
  return {
    bookings: 2, coaches: 1, messages: 1, community: 0, articles: 0, ai: 0,
    ...overrides,
  };
}

function notificationItems() {
  return [
    {
      id: 'bookings:' + BOOKING_ID, category: 'bookings', event_type: 'booking_request',
      entity_type: 'booking_request', entity_id: BOOKING_ID, name: 'New Booking',
      status: 'received', created_at: CREATED,
      href: '/admin.html?tab=bookings&record=' + BOOKING_ID, read_at: null,
    },
    {
      id: 'coaches:' + COACH_ID, category: 'coaches', event_type: 'coach_application',
      entity_type: 'provider_profile', entity_id: COACH_ID, name: 'Pending Coach',
      status: 'pending', created_at: CREATED,
      href: '/admin.html?tab=coaches&record=' + COACH_ID, read_at: null,
    },
    {
      id: 'messages:' + MESSAGE_ID, category: 'messages', event_type: 'private_message',
      entity_type: 'coach_message', entity_id: MESSAGE_ID, name: 'member@example.invalid',
      status: 'unread', created_at: CREATED,
      href: '/admin.html?tab=messages&record=' + MESSAGE_ID, read_at: null,
    },
  ];
}

function dashboardResponse(counts = notificationCounts(), items = notificationItems()) {
  const unread = items.filter(item => !item.read_at).length;
  return json({
    counts,
    notifications: items,
    unread,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    activity: [
      { source: 'booking', entity_type: 'booking_request', from_status: null, to_status: 'received', created_at: CREATED },
      { source: 'application', entity_type: 'provider_profile', from_status: null, to_status: 'pending', created_at: CREATED },
    ],
    generated_at: CREATED,
  });
}

test('notification badges, center and deep links use live counts and keep read state separate', async ({ page }) => {
  let dashboard = dashboardResponse();
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': adminAccess,
      'GET /api/admin/dashboard': () => dashboard,
      'PATCH /api/admin/notifications': ctx => {
        const items = dashboard.body ? JSON.parse(dashboard.body).notifications : [];
        const id = ctx.body?.id;
        const updated = items.map(item => item.id === id ? { ...item, read_at: CREATED } : item);
        dashboard = dashboardResponse(notificationCounts(), updated);
        return json({ updated: true, count: 1 });
      },
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');

  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#notificationBadge')).toHaveText('3');
  await expect(page.locator('#nav [data-nav-tab=bookings] .nav-badge')).toHaveText('2');
  await expect(page.locator('#nav [data-nav-tab=coaches] .nav-badge')).toHaveText('1');
  await expect(page.locator('#nav [data-nav-tab=messages] .nav-badge')).toHaveText('1');

  await page.locator('#notificationsOpen').click();
  const panel = page.locator('#notificationPanel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Booking request');
  await expect(panel).toContainText('New Booking');
  await expect(panel).toContainText('Pending Coach');
  await expect(panel).toContainText('member@example.invalid');
  await expect(panel.locator('.notification-group-title').first()).toContainText('Needs Action (3)');
  await expect(await panel.locator('.notification-type').allTextContents()).toEqual([
    'Coach application', 'Booking request', 'Private message',
  ]);

  const bookingRow = panel.locator('.notification-item').filter({ hasText: 'New Booking' });
  await expect(bookingRow.locator('[data-record-link]')).toHaveAttribute('href', /tab=bookings&record=/);
  await bookingRow.locator('.notification-read').click();
  await expect(page.locator('#notificationBadge')).toHaveText('2');
  await expect(bookingRow).toContainText('Read');
  const patch = mock.calls.filter(call => call.path === '/api/admin/notifications');
  expect(patch).toHaveLength(1);
  expect(patch[0].body).toEqual({ id: 'bookings:' + BOOKING_ID });
  expect(mock.calls.some(call => call.path.startsWith('/api/admin/bookings/'))).toBe(false);

  // The panel and its deep links must stay visible after a row is replaced.
  const bookingLink = panel.locator('[data-record-link]').filter({ hasText: 'New Booking' });
  await expect(bookingLink).toBeVisible();
  await bookingLink.click();
  await expect(panel).toBeHidden();
  await expect(page.locator('#nav [data-nav-tab=bookings]')).toHaveAttribute('aria-current', 'true');
  await expect(page).toHaveURL(/tab=bookings&record=/);
  assertOfflineSafe(mock);
});

test('a bookings-only manager sees only permitted notification badges and items', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': json({
        user: { id: 'e2e-manager', email: 'manager@example.invalid', role: 'provider' },
        account_type: 'manager',
        dashboard_path: '/admin.html',
        management: { enabled: true, permissions: ['management.view', 'management.bookings'] },
      }),
      'GET /api/admin/dashboard': () => dashboardResponse(notificationCounts({
        coaches: 0, messages: 0, community: 0, articles: 0, ai: 0,
      }), notificationItems().slice(0, 1)),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');

  await expect(page.locator('#notificationBadge')).toHaveText('1');
  await expect(page.locator('#nav [data-nav-tab=bookings] .nav-badge')).toHaveText('2');
  await expect(page.locator('#nav [data-nav-tab=coaches]')).toHaveCount(0);
  await page.locator('#notificationsOpen').click();
  await expect(page.locator('#notificationPanel')).toContainText('New Booking');
  await expect(page.locator('#notificationPanel')).not.toContainText('Pending Coach');
  await expect(page.locator('#notificationPanel')).not.toContainText('member@example.invalid');
  assertOfflineSafe(mock);
});

test('the Management Portal contains no app installation promotion', async ({ page }) => {
  const mock = await installApiMock(page, { overrides: { 'GET /api/me/access': adminAccess } });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');
  await expect(page.locator('[data-mza-install-button], [data-mza-install-promo], .footer-install, #mzaInstallDialog')).toHaveCount(0);
  assertOfflineSafe(mock);
});

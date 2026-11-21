'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const CREATED = '2026-11-21T11:00:00.000Z';
const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

function notificationItems() {
  const items = [];
  for (let index = 0; index < 18; index += 1) {
    const id = `booking-${index}`;
    items.push({
      id: 'bookings:' + id, category: 'bookings', event_type: 'booking_request',
      entity_type: 'booking_request', entity_id: id, name: 'Booking ' + (index + 1),
      status: 'received', created_at: CREATED,
      href: '/admin.html?tab=bookings&record=' + id, read_at: null,
    });
  }
  items.push({
    id: 'ai:recommendation-1', category: 'ai', event_type: 'ai_recommendation',
    entity_type: 'owner_agent_task', entity_id: 'recommendation-1', name: 'AI recommendation',
    status: 'pending', created_at: CREATED,
    href: '/admin.html?tab=ai&record=recommendation-1', read_at: null,
  });
  return items;
}

test('notification panel is anchored, scrollable, grouped and dismissible on every viewport', async ({ page }) => {
  const items = notificationItems();
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': adminAccess,
      'GET /api/admin/dashboard': json({
        counts: { bookings: 18, coaches: 0, messages: 0, community: 0, articles: 0, ai: 1 },
        notifications: items, unread: items.length, total: items.length,
        activity: [], generated_at: CREATED,
      }),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#notificationBadge')).toHaveText('19');

  const bell = await page.locator('#notificationsOpen').boundingBox();
  await page.locator('#notificationsOpen').click();
  const panel = page.locator('#notificationPanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('#notificationsClose')).toBeVisible();

  const view = page.viewportSize();
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(bell.y + bell.height);
  expect(box.y).toBeLessThanOrEqual(bell.y + bell.height + 18);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height + 1);

  if (view.width > 760) {
    expect(box.width).toBeGreaterThanOrEqual(340);
    expect(box.width).toBeLessThanOrEqual(430);
    expect(Math.abs((box.x + box.width) - (bell.x + bell.width))).toBeLessThanOrEqual(24);
  } else {
    expect(box.width).toBeGreaterThanOrEqual(view.width - 20);
    expect(box.x).toBeLessThanOrEqual(10);
  }

  // The open panel reserves its own space, so navigation and controls stay clear.
  // On small screens navigation is a drawer behind the bell-height toggle.
  if (view.width > 760) {
    const nav = await page.locator('#nav').boundingBox();
    expect(nav.y).toBeGreaterThanOrEqual(box.y + box.height - 2);
  } else {
    const toggle = await page.locator('#mobileNavToggle').boundingBox();
    expect(toggle.y + toggle.height).toBeLessThanOrEqual(box.y + 1);
    await page.locator('#mobileNavToggle').click();
    await expect(panel).toBeHidden();
    await expect.poll(async () => (await page.locator('#nav').boundingBox())?.x ?? -999).toBeGreaterThanOrEqual(-1);
    const navBox = await page.locator('#nav').boundingBox();
    expect(navBox.y).toBeGreaterThanOrEqual(-1);
    await expect(page.locator('#nav [data-nav-tab=bookings]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await page.locator('#nav').boundingBox())?.x ?? 0).toBeLessThan(-1);
    await page.locator('#notificationsOpen').click();
    await expect(panel).toBeVisible();
  }

  const list = page.locator('#notificationList');
  const scroll = await list.evaluate(element => ({
    overflow: getComputedStyle(element).overflowY,
    client: element.clientHeight,
    full: element.scrollHeight,
  }));
  expect(scroll.overflow).toBe('auto');
  expect(scroll.full).toBeGreaterThan(scroll.client);

  await expect(panel.locator('.notification-group-title').first()).toContainText('Needs Action (18)');
  await expect(panel.locator('.notification-group-title').last()).toContainText('AI Recommendations (1)');
  const types = await panel.locator('.notification-type').allTextContents();
  expect(types[0]).toBe('Booking request');
  expect(types[types.length - 1]).toBe('AI recommendation');

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.locator('#notificationsOpen').click();
  await expect(panel).toBeVisible();
  await page.mouse.click(1, 1);
  await expect(panel).toBeHidden();
  assertOfflineSafe(mock);
});

test('Arabic RTL notifications keep the same anchored, grouped panel', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mzactive-language-manual', 'ar'));
  const items = [
    {
      id: 'coaches:coach-1', category: 'coaches', event_type: 'coach_application',
      entity_type: 'provider_profile', entity_id: 'coach-1', name: 'مدرب جديد',
      status: 'pending', created_at: CREATED,
      href: '/admin.html?tab=coaches&record=coach-1', read_at: null,
    },
    {
      id: 'ai:recommendation-1', category: 'ai', event_type: 'ai_recommendation',
      entity_type: 'owner_agent_task', entity_id: 'recommendation-1', name: 'توصية الذكاء الاصطناعي',
      status: 'pending', created_at: CREATED,
      href: '/admin.html?tab=ai&record=recommendation-1', read_at: null,
    },
  ];
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': adminAccess,
      'GET /api/admin/dashboard': json({
        counts: { bookings: 0, coaches: 1, messages: 0, community: 0, articles: 0, ai: 1 },
        notifications: items, unread: items.length, total: items.length,
        activity: [], generated_at: CREATED,
      }),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');
  await expect(page.locator('#workspace')).toBeVisible();

  const bell = await page.locator('#notificationsOpen').boundingBox();
  await page.locator('#notificationsOpen').click();
  const panel = page.locator('#notificationPanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.notification-group-title').first()).toContainText('يحتاج إجراءً (1)');
  await expect(panel.locator('.notification-group-title').last()).toContainText('توصيات الذكاء الاصطناعي (1)');
  await expect(panel.locator('#notificationsClose')).toHaveText('إغلاق');

  const view = page.viewportSize();
  const box = await panel.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(bell.y + bell.height);
  expect(box.y).toBeLessThanOrEqual(bell.y + bell.height + 18);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height + 1);
  if (view.width > 760) expect(Math.abs(box.x - bell.x)).toBeLessThanOrEqual(24);
  else expect(box.x).toBeLessThanOrEqual(10);

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  assertOfflineSafe(mock);
});

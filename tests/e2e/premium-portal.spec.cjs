'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, clickAdminTab, installApiMock, json, seedSession } = require('./helpers.cjs');

const CREATED = '2026-11-21T11:00:00.000Z';
const AI_ID = 'ai-task-1';
const BOOKING_ID = 'booking-1';

const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

function snapshot() {
  return {
    pending_provider_profiles: 1, open_booking_requests: 2, pending_coach_articles: 0,
    unlinked_programs: 3, approved_providers: 7, registered_athletes: 11,
    active_training_teams: 4, pending_community_posts: 1, pending_community_comments: 0,
    published_community_posts: 9, weekly_challenges: 2,
  };
}

function agents(pending = true) {
  const task = {
    id: AI_ID, title: 'Scheduling draft', approval_status: 'pending', status: 'completed',
    source: 'scheduled', created_at: CREATED,
    output_json: JSON.stringify({ answer: 'Two open requests can be grouped by city.' }),
  };
  return {
    snapshot: snapshot(),
    tasks: pending ? [task] : [],
    pending: pending ? [task] : [],
    activity: [],
    status: 'available',
  };
}

function dashboard() {
  const items = [{
    id: 'bookings:' + BOOKING_ID, category: 'bookings', event_type: 'booking_request',
    entity_type: 'booking_request', entity_id: BOOKING_ID, name: 'Doha booking',
    status: 'received', created_at: CREATED,
    href: '/admin.html?tab=bookings&record=' + BOOKING_ID, read_at: null,
  }];
  return {
    counts: { bookings: 2, coaches: 1, messages: 0, community: 1, articles: 0, ai: 1 },
    notifications: items, unread: 1, total: 1,
    activity: [{ id: 'activity-1', event_type: 'coach_approved', name: 'Coach approved', created_at: CREATED }],
    generated_at: CREATED,
  };
}

async function portalPage(page, overrides = {}) {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': adminAccess,
      'GET /api/admin/dashboard': json(dashboard()),
      'GET /api/admin/agents': json(agents()),
      'GET /api/admin/applications': json({
        providers: [], approved_providers: [], rejected_providers: [], suspended_providers: [],
        bookings: [{ id: BOOKING_ID, status: 'received', name: 'Doha booking', created_at: CREATED }],
      }),
      ...overrides,
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');
  await expect(page.locator('#workspace')).toBeVisible();
  return mock;
}

test('the overview shows live command metrics and real action records', async ({ page }) => {
  const mock = await portalPage(page);
  await expect(page.locator('[data-overview-card=athletes] .metric')).toHaveText('11');
  await expect(page.locator('[data-overview-card=coaches] .metric')).toHaveText('1');
  await expect(page.locator('[data-overview-card=coaches] .dashboard-card-sub')).toContainText('Approved professionals: 7');
  await expect(page.locator('[data-overview-card=bookings] .metric')).toHaveText('2');
  await expect(page.locator('[data-overview-card=programs] .metric')).toHaveText('3');
  await expect(page.locator('[data-overview-card=actions] .metric')).toHaveText('1');
  await expect(page.locator('[data-overview-card=ai] .metric')).toHaveText('1');

  const center = page.locator('#actionCenter');
  await expect(center).toContainText('Doha booking');
  await expect(center.locator('[data-action-record="' + BOOKING_ID + '"]')).toBeVisible();
  await center.locator('[data-action-record="' + BOOKING_ID + '"]').click();
  await expect(page.locator('#nav [data-nav-tab=bookings]')).toHaveAttribute('aria-current', 'true');
  expect(new URL(page.url()).searchParams.get('record')).toBe(BOOKING_ID);
  await expect(page.locator('.dashboard-grid')).toHaveCount(0);
  assertOfflineSafe(mock);
});

test('an AI draft can be reviewed from the overview and only approved by the owner', async ({ page }) => {
  let approval = null;
  const mock = await portalPage(page, {
    ['PATCH /api/admin/agents/' + AI_ID]: async ctx => {
      approval = ctx.body;
      return json({ updated: true, approval_status: 'approved' });
    },
  });
  await expect(page.locator('[data-ai-record="' + AI_ID + '"]')).toBeVisible();
  await page.locator('[data-ai-record="' + AI_ID + '"]').click();
  await expect(page.locator('#nav [data-nav-tab=ai]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.card[data-record-id="' + AI_ID + '"]')).toContainText('Two open requests can be grouped by city.');
  await page.locator('.card[data-record-id="' + AI_ID + '"]').getByRole('button', { name: 'Approve draft' }).click();
  expect(approval).toEqual({ decision: 'approved' });
  await expect(page.locator('#notice')).toContainText('Saved.');
  assertOfflineSafe(mock);
});

function coach(id, name) {
  return {
    id, provider_type: 'coach', display_name: name, country: 'QA', city: 'Doha',
    email: id + '@example.invalid', status: 'pending',
    bio: 'A complete biography for the directory regression test.',
    specialties_json: '["Running"]', languages_json: '["English"]',
    qualifications: 'Certified', services_json: '["Sessions"]', coaching_mode: 'both',
    program_durations_json: '[1]', public_fields_json: '["profile_photo"]',
    has_profile_photo: 0, has_cover: 0, profile_complete: 1,
    updated_at: CREATED, gallery_json: '[]',
  };
}

test('the coach directory filters records by search text with a clear empty state', async ({ page }) => {
  const mock = await portalPage(page, {
    'GET /api/admin/applications': json({
      providers: [coach('coach-a', 'Runner A'), coach('coach-b', 'Cyclist B')],
      approved_providers: [], rejected_providers: [], suspended_providers: [], bookings: [],
    }),
  });
  await clickAdminTab(page, 'coaches');
  await expect(page.locator('.coach-card')).toHaveCount(2);
  const search = page.locator('.coach-search');
  await search.fill('cyclist');
  await expect(page.locator('.coach-card:visible')).toHaveCount(1);
  await expect(page.locator('.coach-card:visible')).toContainText('Cyclist B');
  await search.fill('nothing-matches');
  await expect(page.locator('.coach-card:visible')).toHaveCount(0);
  await expect(page.locator('.coach-search-empty')).toBeVisible();
  await search.fill('');
  await expect(page.locator('.coach-card:visible')).toHaveCount(2);
  assertOfflineSafe(mock);
});

test('the sidebar collapses persistently on desktop and becomes a drawer on mobile', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('mzactive-sidebar-test-reset')) {
        localStorage.removeItem('mzactive-portal-sidebar-collapsed');
        sessionStorage.setItem('mzactive-sidebar-test-reset', '1');
      }
    } catch {}
  });
  const mock = await portalPage(page);
  const shell = page.locator('.portal-shell');
  const toggle = page.locator('#mobileNavToggle');
  const viewport = page.viewportSize();

  if (viewport.width > 980) {
    await expect(shell).not.toHaveClass(/sidebar-collapsed/);
    await page.locator('#sidebarToggle').click();
    await expect(shell).toHaveClass(/sidebar-collapsed/);
    await page.reload();
    await expect(page.locator('#workspace')).toBeVisible();
    await expect(shell).toHaveClass(/sidebar-collapsed/);
    await page.locator('#sidebarToggle').click();
    await expect(shell).not.toHaveClass(/sidebar-collapsed/);
    await expect(page.locator('#sidebarToggle')).toHaveAttribute('aria-label', 'Collapse sidebar');
  } else {
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(shell).toHaveClass(/mobile-open/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#sidebarScrim')).toBeVisible();
    await expect(page.locator('#nav [data-nav-tab=coaches]')).toBeVisible();
    await page.locator('#nav [data-nav-tab=coaches]').click();
    await expect(shell).not.toHaveClass(/mobile-open/);
    await expect(page.locator('#nav [data-nav-tab=coaches]')).toHaveAttribute('aria-current', 'true');
    await toggle.click();
    await expect(shell).toHaveClass(/mobile-open/);
    await page.keyboard.press('Escape');
    await expect(shell).not.toHaveClass(/mobile-open/);
  }
  assertOfflineSafe(mock);
});

test('Arabic mirrors the sidebar and keeps translated navigation usable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mzactive-language-manual', 'ar'));
  const mock = await portalPage(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.portal-shell')).toHaveClass(/sidebar-rtl/);
  await expect(page.locator('#nav [data-nav-tab=overview]')).toContainText('نظرة عامة');
  await expect(page.locator('#portalSubtitle')).toContainText('سجلات وقرارات مباشرة');
  const sidebar = await page.locator('#sidebar').boundingBox();
  const main = await page.locator('.portal-main').boundingBox();
  expect(sidebar.x).toBeGreaterThan(main.x);
  await clickAdminTab(page, 'coaches');
  await expect(page.locator('#nav [data-nav-tab=coaches]')).toHaveAttribute('aria-current', 'true');
  assertOfflineSafe(mock);
});

test('a restricted manager sees only permitted live metrics and no AI request', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': json({
        user: { id: 'e2e-manager', email: 'manager@example.invalid', role: 'provider' },
        account_type: 'manager',
        dashboard_path: '/admin.html',
        management: { enabled: true, permissions: ['management.view', 'management.bookings'] },
      }),
      'GET /api/admin/dashboard': json(dashboard()),
      'GET /api/admin/agents': json({ error: 'forbidden' }, 403),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('[data-overview-card=bookings] .metric')).toHaveText('2');
  await expect(page.locator('[data-overview-card=actions] .metric')).toHaveText('1');
  await expect(page.locator('[data-overview-card=ai]')).toHaveCount(0);
  await expect(page.locator('[data-overview-card=athletes]')).toHaveCount(0);
  await expect(page.locator('#nav [data-nav-tab=ai]')).toHaveCount(0);
  expect(mock.calls.filter(call => call.path === '/api/admin/agents')).toEqual([]);
  assertOfflineSafe(mock);
});

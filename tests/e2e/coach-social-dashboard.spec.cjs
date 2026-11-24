'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const coachAccess = json({
  user: { id: 'e2e-coach', email: 'coach@example.invalid', role: 'provider' },
  account_type: 'provider', dashboard_path: '/dashboard.html',
  management: { enabled: false, permissions: [] },
});
const dashboard = {
  role: 'provider', user: { id: 'e2e-coach' }, teams: [],
  programs: [{ id: 'prog-e2e', athlete_name: 'E2E Athlete', athlete_type: 'runner', week_start: '2026-11-23', sessions: [{ id: 's1', day_key: 'monday', sport_type: 'run', session_code: 'MON-R01', details: 'Easy 5 km' }] }],
};
const ownProfile = {
  id: 'profile-e2e', status: 'approved', verified: true, display_name: 'Mohcine E2E',
  city: 'Doha', country: 'Qatar', bio: 'Running and endurance coach.',
  professional_category: { en: 'Sports Coach', ar: 'مدرب رياضي' },
  experience_years: 8, program_durations: [1, 2, 3],
};

async function openDashboard(page, options = {}) {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': coachAccess,
      'GET /api/dashboard': () => json(dashboard),
      'GET /api/me/profile': json({ profile: ownProfile }),
      'GET /api/dashboard/analytics': json({ analytics: { followers: 24, booking_requests: 3 } }),
      'GET /api/dashboard/athletes': json({
        athletes: [{ id: 'conn-e2e-1', display_name: 'Athlete One', status: 'pending', bucket: 'pending' }],
        counts: { pending: 1, active: 0, completed: 0 },
      }),
      ...(options.overrides || {}),
    },
  });
  if (options.arabic) await page.addInitScript(() => localStorage.setItem('mzactive-language-manual', 'ar'));
  await seedSession(page, { storage: 'session' });
  await page.goto('/dashboard.html');
  await expect(page.locator('#myProfilePanel')).toBeVisible();
  return mock;
}

test('a signed-in coach sees their own FB-style profile with real stats and a Create menu', async ({ page }) => {
  const mock = await openDashboard(page);
  await expect(page.locator('#ownName')).toHaveText('Mohcine E2E');
  await expect(page.locator('#ownRole')).toContainText('Sports Coach');
  await expect(page.locator('#ownBio')).toHaveText('Running and endurance coach.');
  await expect(page.locator('#ownStats')).toContainText('24');
  await expect(page.locator('#ownStats')).toContainText('1');
  await expect(page.locator('#ownVerified')).toBeVisible();
  await expect(page.locator('#ownPublicProfileLink')).toHaveAttribute('href', 'coach.html?id=profile-e2e');
  await expect(page.locator('#openCoachDashboard')).toBeVisible();

  await page.locator('#createMenuWrap summary').click();
  for (const label of ['Create Post', 'Write a Blog', 'Share Photo', 'Create Training Program']) {
    await expect(page.locator('#createMenuWrap')).toContainText(label);
  }
  await page.locator('#createMenuWrap [data-create="blog"]').click();
  await expect(page.locator('#coachBlogDetails')).toHaveAttribute('open', '');
  await expect(page.locator('#coachBlogTitle')).toBeFocused();
  assertOfflineSafe(mock);
});

test('the dashboard uses a vertical list and shows one section at a time', async ({ page }) => {
  const mock = await openDashboard(page);
  const nav = page.locator('#coachQuickActions');
  await expect(nav).toBeVisible();
  await expect(nav.locator('.quick-action')).toHaveCount(10);
  const columns = await nav.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  for (const label of ['My Athletes', 'Coaching Requests', 'Training Programs', 'Program History', 'Coaching Statistics', 'Messages & Notifications', 'My Posts & Blogs', 'Settings']) {
    await expect(nav).toContainText(label);
  }

  await nav.locator('[data-section="programs"]').click();
  await expect(page.locator('#whatsappTrainingForm')).toBeVisible();
  await expect(page.locator('#coachMyAthletes')).toBeHidden();
  await expect(page.locator('#coachStatistics')).toBeHidden();
  await nav.locator('[data-section="statistics"]').click();
  await expect(page.locator('#coachStatistics')).toContainText('Programs');
  await expect(page.locator('#whatsappTrainingForm')).toBeHidden();
  await nav.locator('[data-section="overview"]').click();
  await expect(page.locator('#coachMyAthletes')).toBeVisible();
  await expect(page.locator('#whatsappTrainingForm')).toBeVisible();
  assertOfflineSafe(mock);
});

test('private profile tabs switch Posts, Blogs, Programs, Community and About', async ({ page }) => {
  const mock = await openDashboard(page);
  const tabs = page.locator('#ownProfileTabs');
  await expect(tabs.locator('button')).toHaveCount(5);
  await tabs.locator('[data-section="blogs"]').click();
  await expect(tabs.locator('[data-section="blogs"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#coachBlogDetails')).toHaveAttribute('open', '');
  await tabs.locator('[data-section="community"]').click();
  await expect(page.locator('#communityWorkspace')).toBeVisible();
  await expect(page.locator('#coachBlogDetails')).toBeHidden();
  await tabs.locator('[data-section="about"]').click();
  await expect(page.locator('#myProfilePanel')).toBeVisible();
  assertOfflineSafe(mock);
});

test('one tap delivery sends a saved program to a connected athlete', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': coachAccess,
      'GET /api/dashboard': () => json(dashboard),
      'GET /api/me/profile': json({ profile: ownProfile }),
      'GET /api/dashboard/analytics': json({ analytics: { followers: 24 } }),
      'GET /api/dashboard/athletes': json({
        athletes: [{ id: 'conn-active-1', display_name: 'Active Athlete', status: 'accepted', bucket: 'active' }],
        counts: { pending: 0, active: 1, completed: 0 },
      }),
      'POST /api/dashboard/programs/prog-e2e/send': json({ sent: true, program_id: 'prog-e2e', sent_at: '2026-11-24T10:00:00.000Z' }),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/dashboard.html');
  await expect(page.locator('#coachMyAthletes')).toBeVisible();
  await page.locator('#athleteTabs').getByRole('button', { name: 'Active Athletes' }).click();
  const card = page.locator('.athlete-row[data-connection-id="conn-active-1"]');
  await card.getByRole('button', { name: 'Send program' }).click();
  const dialog = page.locator('#sendProgramDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="sendChannel"][value="mzactive"]')).toBeChecked();
  await expect(dialog.locator('#sendProgramConfirm')).toBeEnabled();
  await dialog.locator('#sendProgramConfirm').click();
  await expect.poll(() => mock.calls.some(call => call.method === 'POST' && call.path === '/api/dashboard/programs/prog-e2e/send' && call.body?.channel === 'mzactive' && call.body?.athlete_user_id === 'conn-active-1')).toBe(true);
  assertOfflineSafe(mock);
});

test('Arabic private coach profile renders RTL with translated tabs and vertical menu', async ({ page }) => {
  const mock = await openDashboard(page, { arabic: true });
  await expect(page.locator('#ownName')).toHaveText('Mohcine E2E');
  await expect(page.locator('#ownProfileTabs')).toContainText('المنشورات');
  await expect(page.locator('#ownProfileTabs')).toContainText('المجتمع');
  const direction = await page.locator('#myProfilePanel').evaluate(el => getComputedStyle(el).direction);
  expect(direction).toBe('rtl');
  await expect(page.locator('#coachQuickActions')).toContainText('رياضيون');
  await expect(page.locator('#coachQuickActions')).toContainText('طلبات التدريب');
  assertOfflineSafe(mock);
});

test('small screens keep the private profile and vertical navigation free of horizontal overflow', async ({ page }) => {
  const mock = await openDashboard(page);
  await page.setViewportSize({ width: 320, height: 640 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await expect(page.locator('#coachQuickActions')).toBeVisible();
  await expect(page.locator('#ownProfileTabs')).toBeVisible();
  assertOfflineSafe(mock);
});

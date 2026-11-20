'use strict';

const { test, expect } = require('./pw.cjs');
const {
  FAKE_TOKEN,
  assertOfflineSafe,
  dashboardData,
  installApiMock,
  json,
  seedSession,
} = require('./helpers.cjs');

test('mocked sign-in opens the coach dashboard without a real credential', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'provider' }),
  });
  await page.goto('/dashboard.html');

  await expect(page.locator('#loginForm')).toBeVisible();
  // Synthetic credentials; the worker response is mocked, nothing is sent.
  await page.locator('#loginEmail').fill('coach@example.invalid');
  await page.locator('#loginPassword').fill('not-a-real-password');
  await page.locator('#loginForm button[type=submit]').click();

  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#roleLabel')).toContainText('COACH DASHBOARD');
  await expect(page.locator('#coachPanel')).toBeVisible();
  await expect(page.locator('#memberPanel')).toBeHidden();
  await expect(page.locator('#notice')).not.toContainText('Loading');

  const token = await page.evaluate(() => localStorage.getItem('mzactive-provider-session'));
  expect(token).toBe(FAKE_TOKEN);
  expect(mock.calls.filter(call => call.path === '/api/auth/login')).toHaveLength(1);
  expect(mock.calls.filter(call => call.path === '/api/dashboard').length).toBeGreaterThan(0);
  assertOfflineSafe(mock);
});

test('approved coach sees the team tools and an active private workspace', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'provider', teams: [], programs: [] }),
    profile: { id: 'coach-e2e', status: 'approved', display_name: 'E2E Coach' },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');

  await expect(page.locator('#auth')).toBeHidden();
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#coachPanel')).toBeVisible();
  await expect(page.locator('#writeProgramJump')).toBeVisible();
  await expect(page.locator('#editCoachProfile')).toBeVisible();
  await expect(page.locator('#coachAssignment')).toBeHidden();
  await expect(page.locator('#notice')).toBeEmpty();
  await expect(page.locator('#profileShareStatus')).toContainText('Share this link');

  await expect(page.locator('#communityWorkspace')).toBeVisible();
  await expect(page.locator('#wsConnections')).toBeVisible();
  await expect(page.locator('#wsMessages')).toBeVisible();
  await expect(page.locator('#wsCalendar')).toBeVisible();
  await expect(page.locator('#wsAnalytics')).toBeVisible();
  await expect(page.locator('#wsConnectionsBody')).not.toContainText('Loading');

  assertOfflineSafe(mock);
});

test('pending coach cannot create teams or open the admin-only booking inbox', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'provider' }),
    profile: { id: 'coach-e2e', status: 'pending', display_name: 'E2E Coach' },
    overrides: {
      'POST /api/dashboard/teams': json({ error: 'approved_coach_required' }, 403),
    },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');

  await expect(page.locator('#coachPanel')).toBeVisible();
  await expect(page.locator('#profileShareStatus')).toContainText('after it is approved');

  await page.locator('#teamName').fill('E2E Team');
  await page.locator('#createTeamForm button').click();
  await expect(page.locator('#notice')).toContainText('must be approved before you can create teams');

  await expect(page.locator('#wsBookings')).toHaveCount(0);
  await expect(page.locator('#wsAnalytics')).toHaveCount(0);
  const teamCreates = mock.calls.filter(call => call.path === '/api/dashboard/teams');
  expect(teamCreates).toHaveLength(1);
  assertOfflineSafe(mock);
});

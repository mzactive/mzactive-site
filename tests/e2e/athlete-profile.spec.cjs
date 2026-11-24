'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const memberAccess = json({
  user: { id: 'e2e-athlete', email: 'athlete@example.invalid', role: 'provider' },
  account_type: 'member', dashboard_path: '/dashboard.html', management: { enabled: false, permissions: [] },
});
const memberDashboard = {
  role: 'member', user: { id: 'e2e-athlete' }, teams: [{ id: 'team-1', name: 'Doha Runners', display_name: 'Athlete E2E', sessions: [], messages: [], programs: [] }],
  connectedCoaches: [],
  programs: [{ id: 'program-1', athlete_user_id: 'e2e-athlete', week_start: '2026-11-23', sessions: [{ id: 's1', day_key: 'monday', sport_type: 'run', session_code: 'MON-R01', details: 'Easy 5 km', completed_at: '2026-11-24T07:00:00.000Z' }] }],
};
const sportsProfile = {
  user_id: 'e2e-athlete', display_name: 'Athlete E2E', city: 'Doha', country: 'Qatar',
  sports: ['running', 'strength'], experience_level: 'intermediate',
  goals: 'Complete a half marathon in Doha.', share_with_coaches: false,
};

async function openAthleteDashboard(page) {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': memberAccess,
      'GET /api/dashboard': () => json(memberDashboard),
      'GET /api/me/sports-profile': json({ profile: sportsProfile }),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/dashboard.html');
  await expect(page.locator('#athleteProfilePanel')).toBeVisible();
  return mock;
}

test('a member sees a private athlete profile with real sports data and program stats', async ({ page }) => {
  const mock = await openAthleteDashboard(page);
  await expect(page.locator('#athleteName')).toHaveText('Athlete E2E');
  await expect(page.locator('#athleteMeta')).toContainText('Doha');
  await expect(page.locator('#athleteMeta')).toContainText('running');
  await expect(page.locator('#athleteGoals')).toHaveText('Complete a half marathon in Doha.');
  await expect(page.locator('#athleteStats')).toContainText('1');
  await expect(page.locator('#athleteProgramsPanel')).toBeVisible();
  await expect(page.locator('#athleteProgramHistory')).toBeVisible();
  await expect(page.locator('#athleteAboutPanel')).toBeHidden();
  assertOfflineSafe(mock);
});

test('athlete profile tabs switch Programs, Community and About', async ({ page }) => {
  const mock = await openAthleteDashboard(page);
  const tabs = page.locator('#athleteProfileTabs');
  await tabs.locator('[data-athlete-tab="community"]').click();
  await expect(page.locator('#athleteCommunityPanel')).toBeVisible();
  await expect(page.locator('#athleteProgramsPanel')).toBeHidden();
  await tabs.locator('[data-athlete-tab="about"]').click();
  await expect(page.locator('#athleteAboutPanel')).toBeVisible();
  await expect(page.locator('#athleteCommunityPanel')).toBeHidden();
  await tabs.locator('[data-athlete-tab="programs"]').click();
  await expect(page.locator('#athleteProgramsPanel')).toBeVisible();
  assertOfflineSafe(mock);
});

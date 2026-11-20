'use strict';

const { test, expect } = require('./pw.cjs');
const {
  FAKE_TOKEN,
  assertOfflineSafe,
  connection,
  dashboardData,
  installApiMock,
  json,
  message,
  seedSession,
} = require('./helpers.cjs');

test('private messages round-trip through the mocked workspace API', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'member', user: { id: 'e2e-athlete' } }),
    connections: [connection({ id: 'conn-e2e-1', source: 'request', status: 'accepted', workspace_status: 'active' })],
    messages: [message({ sender_user_id: 'coach-e2e', body: 'Welcome to the private workspace.' })],
    overrides: {
      'POST /api/connections/conn-e2e-1/messages': (ctx, state) => {
        state.messages.push(message({ id: 'msg-e2e-2', sender_user_id: 'e2e-athlete', body: ctx.body.body }));
        return json({ id: 'msg-e2e-2', saved: true }, 201);
      },
    },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');

  await expect(page.locator('#wsMessageConnection')).toContainText('E2E Coach');
  await page.locator('#wsConnectionsBody').getByRole('button', { name: 'Open messages' }).click();
  await expect(page.locator('#wsMessagesList')).toContainText('Welcome to the private workspace.');

  const composer = page.locator('#wsMessages').locator('textarea');
  await composer.fill('Synthetic private message for automated checks.');
  await page.locator('#wsMessages').getByRole('button', { name: 'Send message' }).click();

  await expect(page.locator('#wsMessagesList')).toContainText('Synthetic private message for automated checks.');
  await expect(composer).toBeEmpty();
  const sends = mock.calls.filter(call => call.method === 'POST' && call.path === '/api/connections/conn-e2e-1/messages');
  expect(sends).toHaveLength(1);
  expect(sends[0].body).toEqual({ body: 'Synthetic private message for automated checks.' });
  assertOfflineSafe(mock);
});

test('program history and private drafts persist without storing the token', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({
      role: 'provider',
      programs: [{
        id: 'program-e2e-1',
        athlete_name: 'E2E Athlete',
        week_start: '2026-11-16',
        athlete_type: 'runner',
        sessions: [{
          id: 'session-e2e-1',
          day_key: 'monday',
          sport_type: 'run',
          session_code: 'EASY',
          details: 'Easy 5K · [MZ:{"km":5}]',
          completed_at: null,
        }],
      }],
    }),
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');

  await expect(page.locator('#flexProgramHistory')).toBeVisible();
  // The outer <details> wraps one <details> per athlete/week; open both levels.
  await page.locator('#flexProgramHistory > details > summary').first().click();
  await page.locator('#flexProgramHistory details details summary').first().click();
  await expect(page.locator('#flexProgramHistory')).toContainText('E2E Athlete');
  await expect(page.locator('#flexProgramHistory')).toContainText('Easy 5K');

  // The coaching studio enhances the legacy textarea into a workout dialog.
  await page.locator('.studio-add').first().click();
  await page.locator('#studioName').fill('E2E draft session');
  await page.locator('#studioDistance').fill('5');
  await page.locator('#studioDetails').fill('Easy 5K with a relaxed finish.');
  await page.locator('#studioApply').click();
  await expect(page.locator('.studio-draft-status')).toContainText('Draft saved');

  const drafts = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('mz-studio-draft-')));
  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatch(/^mz-studio-draft-[0-9a-f]{64}$/);
  expect(drafts[0]).not.toContain(FAKE_TOKEN);

  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.locator('.studio-draft-status')).toContainText('Draft recovered');
  await expect(page.locator('.studio-workout')).toContainText('E2E draft session');
  assertOfflineSafe(mock);
});

test('member permissions hide coach and admin controls but keep the private workspace', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'member', user: { id: 'e2e-athlete' }, programs: [] }),
    connections: [connection({ id: 'conn-e2e-1', source: 'request', status: 'accepted', workspace_status: 'active' })],
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');

  await expect(page.locator('#roleLabel')).toContainText('MEMBER DASHBOARD');
  await expect(page.locator('#memberPanel')).toBeVisible();
  await expect(page.locator('#coachPanel')).toBeHidden();
  await expect(page.locator('#writeProgramJump')).toBeHidden();
  await expect(page.locator('#editCoachProfile')).toBeHidden();
  await expect(page.locator('#communityWorkspace')).toBeVisible();
  await expect(page.locator('#wsMessages')).toBeVisible();
  await expect(page.locator('#wsBookings')).toHaveCount(0);
  await expect(page.locator('#wsAnalytics')).toHaveCount(0);
  await expect(page.locator('#notice')).toBeEmpty();
  assertOfflineSafe(mock);
});

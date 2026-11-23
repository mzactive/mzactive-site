'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const coachAccess = json({
  user: { id: 'e2e-coach', email: 'coach@example.invalid', role: 'provider' },
  account_type: 'provider', dashboard_path: '/dashboard.html',
  management: { enabled: false, permissions: [] },
});
const dashboard = {
  role: 'provider', user: { id: 'e2e-coach' }, teams: [], coaches: [],
  programs: [{
    id: 'prog-e2e', athlete_name: 'E2E Active Athlete', athlete_type: 'runner',
    week_start: '2026-11-23', coach_note: 'Easy week',
    sessions: [{ id: 's1', day_key: 'monday', sport_type: 'run', session_code: 'MON-R01', details: 'Easy 5 km' }],
  }],
};

test('approved coach sees My Athletes and opens an exact request deep link', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': coachAccess,
      'GET /api/dashboard': () => json(dashboard),
      'GET /api/dashboard/athletes': json({
        athletes: [{ id: 'conn-e2e-1', display_name: 'E2E Pending Athlete', status: 'pending', workspace_status: 'pending', bucket: 'pending', sports: ['running'], city: 'Doha', program_count: 0 }],
        counts: { pending: 1, active: 0, completed: 0 },
      }),
      'PATCH /api/connections/conn-e2e-1': json({ updated: true, status: 'accepted' }),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/dashboard.html?connection=conn-e2e-1#myAthletes');
  await expect(page.locator('#coachMyAthletes')).toBeVisible();
  const card = page.locator('.athlete-row[data-connection-id="conn-e2e-1"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/record-focus/);
  await card.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(() => mock.calls.some(call => call.method === 'PATCH' && call.path === '/api/connections/conn-e2e-1' && call.body?.status === 'accepted')).toBe(true);
  assertOfflineSafe(mock);
});

test('coach sends a saved program to an active athlete', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': coachAccess,
      'GET /api/dashboard': () => json(dashboard),
      'POST /api/dashboard/programs/prog-e2e/send': json({ sent: true, program_id: 'prog-e2e', sent_at: '2026-11-23T12:00:00.000Z', href: '/dashboard.html?program=prog-e2e#athleteProgramHistory' }),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/dashboard.html');
  await expect(page.locator('#coachMyAthletes')).toBeVisible();
  await page.locator('#sendSavedProgram').click();
  const dialog = page.locator('#sendProgramDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#sendProgramSelect')).toHaveValue('prog-e2e');
  await dialog.getByRole('button', { name: 'Choose an athlete' }).click();
  await dialog.getByRole('button', { name: 'Send program' }).click();
  await expect.poll(() => mock.calls.some(call => call.method === 'POST' && call.path === '/api/dashboard/programs/prog-e2e/send' && call.body?.athlete_user_id === 'conn-e2e-2')).toBe(true);
  assertOfflineSafe(mock);
});

test('Arabic coach dashboard is RTL with translated My Athletes', async ({ page }) => {
  const mock = await installApiMock(page, { overrides: { 'GET /api/me/access': coachAccess, 'GET /api/dashboard': () => json(dashboard) } });
  await page.addInitScript(() => { try { localStorage.setItem('mzactive-language-manual', 'ar'); } catch {} });
  await seedSession(page, { storage: 'session' });
  await page.goto('/dashboard.html');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#coachMyAthletes h3')).toHaveText('رياضيون');
  assertOfflineSafe(mock);
});

test('coach quick actions open notification settings and save preferences', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': coachAccess,
      'GET /api/dashboard': () => json(dashboard),
      'PATCH /api/dashboard/notification-preferences': json({ email_enabled: false, dashboard_enabled: true }),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/dashboard.html');
  await expect(page.locator('#coachQuickActions')).toBeVisible();
  await page.locator('#coachQuickActions a[href="#coachSettings"]').click();
  const dialog = page.locator('#coachSettings');
  await expect(dialog).toBeVisible();
  await dialog.locator('#prefEmail').uncheck();
  await dialog.locator('#prefSave').click();
  await expect.poll(() => mock.calls.some(call => call.method === 'PATCH' && call.path === '/api/dashboard/notification-preferences' && call.body?.email_enabled === false)).toBe(true);
  assertOfflineSafe(mock);
});

test('athlete dashboard shows the connected coach', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': json({ user: { id: 'e2e-member' }, account_type: 'member', dashboard_path: '/dashboard.html', management: { enabled: false, permissions: [] } }),
      'GET /api/dashboard': () => json({ role: 'member', teams: [], programs: [], connectedCoaches: [{ id: 'c1', status: 'accepted', workspace_status: 'active', display_name: 'E2E Coach', city: 'Doha' }] }),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/dashboard.html');
  await expect(page.locator('#memberCoachList')).toContainText('E2E Coach');
  assertOfflineSafe(mock);
});

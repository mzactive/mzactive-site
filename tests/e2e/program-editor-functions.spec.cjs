'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const coachAccess = json({
  user: { id: 'e2e-coach', email: 'coach@example.invalid', role: 'provider' },
  account_type: 'provider', dashboard_path: '/dashboard.html', management: { enabled: false, permissions: [] },
});
const dashboard = {
  role: 'provider', user: { id: 'e2e-coach' }, teams: [], coaches: [],
  programs: [{
    id: 'prog-e2e', athlete_name: 'E2E Active Athlete', athlete_type: 'runner', week_start: '2026-11-23',
    start_date: '2026-11-23', end_date: '2026-12-13', duration_value: 3, duration_unit: 'weeks',
    coach_note: 'Three-week block',
    sessions: [{ id: 's1', session_code: 'MON-R01', day_key: 'monday', sport_type: 'run', details: 'Easy 5 km', session_date: '2026-11-23' }],
  }],
};

async function open(page, overrides = {}) {
  const mock = await installApiMock(page, { overrides: {
    'GET /api/me/access': coachAccess,
    'GET /api/dashboard': () => json(dashboard),
    'GET /api/dashboard/athletes': json({
      athletes: [{ id: 'conn-e2e-2', display_name: 'E2E Active Athlete', status: 'accepted', workspace_status: 'active', bucket: 'active', sports: ['running'], city: 'Doha' }],
      counts: { pending: 0, active: 1, completed: 0 },
    }),
    'POST /api/dashboard/programs/prog-e2e/send': json({ sent: true, program_id: 'prog-e2e', href: '/dashboard.html?program=prog-e2e#athleteProgramHistory' }),
    ...overrides,
  } });
  await seedSession(page, { storage: 'session' });
  await page.goto('/dashboard.html');
  await expect(page.locator('#coachMyAthletes')).toBeVisible();
  return mock;
}

test('editor exposes duration, sports and week navigation without layout rebuild', async ({ page }) => {
  await open(page);
  await expect(page.locator('#programDurationUnit')).toBeVisible();
  await expect(page.locator('#programDurationValue')).toBeVisible();
  await expect(page.locator('#athleteType option[value="bodybuilding"]')).toHaveCount(1);
  await expect(page.locator('#athleteType option[value="running_strength"]')).toHaveCount(1);
  await page.locator('#programDurationUnit').selectOption('weeks');
  await page.locator('#programDurationValue').fill('3');
  await expect(page.locator('#programWeekLabel')).toContainText('1 /');
  await page.locator('#programNextWeek').click();
  await expect(page.locator('#programWeekLabel')).toContainText('2 /');
  await page.locator('#programPrevWeek').click();
  await expect(page.locator('#programWeekLabel')).toContainText('1 /');
});

test('Send to My Athlete shows connected athletes immediately and supports WhatsApp choice', async ({ page }) => {
  const mock = await open(page);
  await page.locator('#sendSavedProgram').click();
  const dialog = page.locator('#sendProgramDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#sendProgramList')).toContainText('E2E Active Athlete');
  await dialog.locator('input[name="sendChannel"][value="whatsapp"]').check();
  await dialog.getByRole('button', { name: 'Choose an athlete' }).click();
  await dialog.getByRole('button', { name: 'Send program' }).click();
  await expect.poll(() => mock.calls.some(call => call.method === 'POST' && call.path === '/api/dashboard/programs/prog-e2e/send' && call.body?.channel === 'whatsapp')).toBe(true);
  assertOfflineSafe(mock);
});

test('email and WhatsApp delivery buttons are available in the existing savebar', async ({ page }) => {
  await open(page);
  await expect(page.locator('#programEmailSend')).toBeVisible();
  await expect(page.locator('#programWhatsAppSend')).toBeVisible();
});

'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json } = require('./helpers.cjs');

const assessment = {
  experience: 'beginner', frequency: 3, weekly_km: 15, recent_result: '10K 55:00',
  target_distance: '10K', goal: 'complete', days: ['monday', 'wednesday', 'saturday'],
  limitations: '', city: 'Doha',
};
const preview = {
  level: 'beginner', target: '10K', pace: 5.5, paceLabel: '5:30/km',
  summary: 'Self-reported beginner runner training about 15 km/week.',
  paceAnalysis: 'Reported pace 5:30/km.',
  feasibility: 'Completing 10K is a sound first goal.',
  recommendations: ['Keep easy runs conversational.', 'Increase weekly distance by no more than about 10%.'],
  structure: ['Easy aerobic run', 'Long run at conversational effort'],
  assumptions: ['Based only on self-reported answers; no GPS or medical data was used.'],
};
const plan = {
  assessment, preview,
  program: { id: 'plan-e2e', sessions: [
    { id: 'session-e2e', session_code: 'RIQ-01', day_key: 'monday', details: 'Easy 2-4 km', completed_at: null },
  ] },
  shares: [],
};

test('guest assessment, free preview, registration and saved plan work end to end', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'POST /api/run-iq/preview': json({ assessment, preview }),
      'GET /api/run-iq/coaches': json({ coaches: [{
        id: 'coach-e2e', display_name: 'E2E Running Coach', city: 'Doha', country: 'Qatar',
        specialties: ['Running'], services: ['Training sessions'], languages: ['English', 'Arabic'],
        profile_url: 'coach.html?id=coach-e2e',
      }] }),
      'POST /api/auth/register': json({ token: 'e2e-token', user: { id: 'e2e-member' }, account_type: 'member' }),
      'POST /api/run-iq/save': json({ saved: true, program_id: 'plan-e2e', week_start: '2026-11-23', sessions: 1 }),
      'GET /api/run-iq/me': json(plan),
      'POST /api/run-iq/sessions/session-e2e/log': json({ logged: true, pace: '5:48/km' }),
      'POST /api/run-iq/share': json({ shared: true, coach_id: 'coach-e2e' }),
    },
  });
  await page.goto('/run-iq.html');

  await page.locator('#weeklyKm').fill('15');
  await page.locator('#recent').fill('10K 55:00');
  await page.locator('#previewButton').click();
  await expect(page.locator('#previewResult')).toBeVisible();
  await expect(page.locator('#previewFacts')).toContainText('Self-reported beginner runner');
  await expect(page.locator('#saveResult')).toBeVisible();
  await expect(page.locator('#coachGrid')).toContainText('E2E Running Coach');

  await page.locator('#saveName').fill('E2E Runner');
  await page.locator('#saveEmail').fill('runner@example.invalid');
  await page.locator('#savePassword').fill('local-run-iq-password');
  await page.locator('#saveConsent').check();
  await page.locator('#saveButton').click();
  await expect(page.locator('#planResult')).toBeVisible();
  await expect(page.locator('#planSessions')).toContainText('RIQ-01');
  await expect.poll(() => mock.calls.some(call => call.method === 'POST' && call.path === '/api/run-iq/save')).toBe(true);
  assertOfflineSafe(mock);
});

test('Arabic Run IQ renders RTL with translated static copy', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/run-iq/coaches': json({ coaches: [] }),
    },
  });
  await page.addInitScript(() => {
    try { localStorage.setItem('mzactive-language-manual', 'ar'); } catch {}
  });
  await page.goto('/run-iq.html');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('body')).toHaveClass(/rtl/);
  await expect(page.locator('#assessmentStatus')).toBeVisible();
  assertOfflineSafe(mock);
});

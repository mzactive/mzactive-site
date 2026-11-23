'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json } = require('./helpers.cjs');

const preview = {
  level: 'beginner', target: '10K',
  summary: 'Self-reported beginner runner training about 15 km/week.',
  paceAnalysis: 'Current benchmark 5:30/km from comfortable pace.',
  assumptions: ['Self-reported only.', 'Rounded to 5 seconds.', 'Educational guidance.'],
  paces: { currentPace: 330, easy: [378, 420], long: [360, 400], tempo: null, interval: null, targetPace: 300, targetPaceLabel: '5:00/km', targetKm: 10, targetSeconds: 3000 },
  heart: { method: 'effort', note: 'Use the talk test.' },
  goalAssessment: { status: 'ambitious', text: 'Your goal is ambitious relative to the recent evidence.' },
  weekPlan: [{ day_key: 'monday', sport: 'run', detail: 'Easy 2-4 km.' }],
  advice: [{ title: 'Your Priority', text: 'Build a consistent easy-run base.' }],
  racePrep: { target: '10K', weeks: 3, items: ['Stay relaxed at the start.'] },
  raceCard: { distance: 10, targetTime: '50:00', pace: '5:00/km', splitsLabel: 'Mathematical splits', splits: [{ label: '0–1 km', time: '5:00', cumulative: '5:00' }], strategy: 'Start controlled.', warmup: '10 minutes easy.' },
};
const assessment = { experience: 'beginner', goal: 'time', target_distance: '10K', target_time: '50:00', frequency: 3, weekly_km: 15, days: ['monday', 'wednesday', 'saturday'] };
const plan = { assessment, preview, program: { id: 'plan-e2e', sessions: [{ id: 'session-e2e', session_code: 'RIQ-01', day_key: 'monday', details: 'Easy 2-4 km', completed_at: null }] }, shares: [], advice: [], race_results: [] };

test('guest assessment shows full results before optional account creation', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'POST /api/run-iq/preview': json({ assessment, preview }),
      'GET /api/run-iq/coaches': json({ coaches: [{ id: 'coach-e2e', display_name: 'E2E Running Coach', city: 'Doha', country: 'Qatar', specialties: ['Running'], services: [], languages: [], profile_url: 'coach.html?id=coach-e2e' }] }),
      'POST /api/auth/register': json({ token: 'e2e-token', user: { id: 'e2e-member' }, account_type: 'member' }),
      'POST /api/run-iq/save': json({ saved: true, program_id: 'plan-e2e', week_start: '2026-11-23', sessions: 1 }),
      'GET /api/run-iq/me': json(plan),
      'POST /api/run-iq/race-result': json({ saved: true, result: { summary: 'Completed 10K.', recovery: '3-5 lighter days.' } }),
    },
  });
  await page.goto('/run-iq.html');

  await expect(page.locator('#signupSection')).toBeHidden();
  await page.locator('#levelOptions button[data-value="beginner"]').click();
  await page.locator('#nextButton').click();
  await page.locator('#goalOptions button[data-value="time"]').click();
  await page.locator('#nextButton').click();
  await page.locator('#recentDistance').fill('10K');
  await page.locator('#recentTime').fill('55:00');
  await page.locator('#nextButton').click();
  await page.locator('#nextButton').click();

  await expect(page.locator('#resultsSection')).toBeVisible();
  await expect(page.locator('#dashboard')).toContainText('Self-reported beginner runner');
  await expect(page.locator('#paceCards')).toContainText('5:00/km');
  await expect(page.locator('#adviceCards')).toContainText('Build a consistent easy-run base');
  await expect(page.locator('#raceCard')).toContainText('50:00');
  await expect(page.locator('#signupSection')).toBeVisible();
  await expect(page.locator('#saveForm')).toBeHidden();
  await expect(page.locator('#coachGrid')).toContainText('E2E Running Coach');

  await page.locator('#revealSave').click();
  await expect(page.locator('#saveForm')).toBeVisible();
  await page.locator('#saveName').fill('E2E Runner');
  await page.locator('#saveEmail').fill('runner@example.invalid');
  await page.locator('#savePassword').fill('local-run-iq-password');
  await page.locator('#saveConsent').check();
  await page.locator('#saveButton').click();
  await expect(page.locator('#planResult')).toBeVisible();
  await expect(page.locator('#planSessions')).toContainText('RIQ-01');
  await expect.poll(() => mock.calls.some(call => call.method === 'POST' && call.path === '/api/run-iq/save')).toBe(true);

  await page.locator('#actualDistance').fill('10K');
  await page.locator('#actualTime').fill('52:30');
  await page.locator('#raceButton').click();
  await expect(page.locator('#raceOutcome')).toContainText('Completed 10K');
  assertOfflineSafe(mock);
});

test('Arabic Run IQ renders RTL with translated step cards', async ({ page }) => {
  const mock = await installApiMock(page, { overrides: { 'GET /api/run-iq/coaches': json({ coaches: [] }) } });
  await page.addInitScript(() => { try { localStorage.setItem('mzactive-language-manual', 'ar'); } catch {} });
  await page.goto('/run-iq.html');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('body')).toHaveClass(/rtl/);
  await expect(page.locator('#levelOptions')).toContainText('مبتدئ');
  assertOfflineSafe(mock);
});

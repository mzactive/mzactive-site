'use strict';

const { test, expect } = require('./pw.cjs');
const {
  assertOfflineSafe,
  dashboardData,
  installApiMock,
  json,
  seedSession,
} = require('./helpers.cjs');

function monday(date = new Date()) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}
const WEEK = monday();

function plan(language = 'en', adjusted = false) {
  const ar = language === 'ar';
  const detail = adjusted
    ? (ar ? 'حصة هوائية سهلة · ٣٦ دقيقة · مجود يمكن معه التحدث. توقف عند ظهور ألم.' : 'Easy aerobic session · 36 min · conversational effort. Stop if pain appears.')
    : (ar ? 'وتيرة منضبطة · ٤٥ دقيقة · مجهود منضبط. توقف عند ظهور ألم.' : 'Controlled tempo · 45 min · controlled effort. Stop if pain appears.');
  return {
    provider: 'local',
    week_start: WEEK,
    sessions: [
      { day_key: 'monday', sport_type: 'run', details: detail, minutes: adjusted ? 36 : 45 },
      { day_key: 'wednesday', sport_type: 'recovery', details: detail, minutes: adjusted ? 36 : 45 },
      { day_key: 'friday', sport_type: 'run', details: detail, minutes: adjusted ? 36 : 45 },
    ],
    coach_note: ar ? 'راجع كل حصة قبل الاعتماد. هذه إرشادات عامة وليست نصيحة طبية.' : 'Review every session before approving. General guidance, not medical advice.',
    safety_warnings: [],
    summary: { sport: 'run', level: 'beginner', goal: 'general', sessions: 3, minutes: adjusted ? 108 : 135 },
  };
}

function overrides() {
  return {
    'GET /api/ai-coach/config': json({ athlete_coach_enabled: true, provider: 'local', limits: { per_user_daily: 12, global_daily: 60 } }),
    'GET /api/ai-coach/progress': json({ progress: { completed_sessions: 0, planned_sessions: 0, total_minutes: 0, total_kilometres: 0, weeks: [] } }),
    'POST /api/ai-coach/draft': (ctx) => {
      const body = ctx.body || {};
      return json({ draft_id: body.language === 'ar' ? 'draft-ar-e2e' : 'draft-en-e2e', plan: plan(body.language), requires_approval: true, message: 'Review and approve this draft before it is saved.' }, 201);
    },
    'POST /api/ai-coach/chat': (ctx) => {
      const body = ctx.body || {};
      return json({ draft_id: 'draft-adjusted-e2e', plan: plan(body.language, true), requires_coach_approval: false, message: 'Adjusted draft ready. Review and approve before saving.' }, 201);
    },
    'POST /api/ai-coach/drafts/draft-en-e2e/approve': json({ program_id: 'program-e2e', week_start: WEEK, status: 'saved', source: 'ai_self' }),
    'POST /api/ai-coach/drafts/draft-adjusted-e2e/approve': json({ program_id: 'program-e2e-adjusted', week_start: WEEK, status: 'saved', source: 'ai_self' }),
  };
}

test('athlete reviews an offline plan before approval and can request an adjustment on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'member', user: { id: 'e2e-athlete' } }),
    overrides: overrides(),
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/ai-coach.html');

  await expect(page.locator('.ai-bottom-nav')).toBeVisible();
  await expect(page.locator('#planner')).toBeVisible();
  await expect(page.locator('#dayOptions input')).toHaveCount(7);
  await expect(page.locator('#weekStart')).toHaveValue(WEEK);

  await page.locator('#generatePlan').click();
  await expect(page.locator('#reviewPanel')).toBeVisible();
  await expect(page.locator('#planPreview .plan-day')).toHaveCount(3);
  await expect(page.locator('#planPreview')).toContainText('Review every session before approving');
  expect(mock.calls.filter(call => call.path === '/api/ai-coach/draft')).toHaveLength(1);
  expect(mock.calls.some(call => call.path.endsWith('/approve'))).toBe(false);

  await page.locator('#approvePlan').click();
  await expect(page.locator('#aiStatus')).toContainText('Saved.');
  const approvals = mock.calls.filter(call => call.path.endsWith('/approve'));
  expect(approvals).toHaveLength(1);
  expect(approvals[0].body).toEqual({ approve: true });

  await page.locator('#chatMessage').fill('I felt tired after the last session');
  await page.locator('#chatForm button[type=submit]').click();
  await expect(page.locator('#planPreview')).toContainText('36 min');
  await expect(page.locator('#aiStatus')).toContainText('Adjusted draft ready');
  expect(mock.calls.filter(call => call.path === '/api/ai-coach/chat')).toHaveLength(1);
  assertOfflineSafe(mock);
});

test('Arabic manual preference renders RTL and produces an Arabic draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'member', user: { id: 'e2e-athlete' } }),
    overrides: overrides(),
  });
  await seedSession(page, { storage: 'local' });
  await page.addInitScript(() => {
    try { localStorage.setItem('mzactive-language-manual', 'ar'); } catch { /* storage unavailable */ }
  });
  await page.goto('/ai-coach.html');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#language')).toHaveValue('ar');
  await expect(page.locator('#planner h2').first()).toContainText('أعد أسبوعك');
  await page.locator('#generatePlan').click();
  await expect(page.locator('#planPreview')).toContainText('دقيقة');
  const drafts = mock.calls.filter(call => call.path === '/api/ai-coach/draft');
  expect(drafts[0].body.language).toBe('ar');
  assertOfflineSafe(mock);
});

test('coach accounts are redirected to the coach dashboard instead of the athlete planner', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'provider' }),
    overrides: overrides(),
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/ai-coach.html');
  await expect(page.locator('#coachRedirect')).toBeVisible();
  await expect(page.locator('#planner')).toBeHidden();
  expect(mock.calls.some(call => call.path === '/api/ai-coach/draft')).toBe(false);
  assertOfflineSafe(mock);
});

test('logged-out visitors get a sign-in action instead of a generic unavailable message', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/ai-coach/config': json({ error: 'unauthorized' }, 401) },
  });
  await page.goto('/ai-coach.html');
  await expect(page.locator('#authGate')).toBeVisible();
  await expect(page.locator('#authGate a')).toHaveAttribute('href', /next=\/ai-coach\.html/);
  await expect(page.locator('#planner')).toBeHidden();
  await expect(page.locator('#aiStatus')).toHaveText('');
  assertOfflineSafe(mock);
});

test('disabled and service-unavailable states are clearly separated', async ({ page }) => {
  const disabled = await installApiMock(page, {
    dashboard: dashboardData({ role: 'member' }),
    overrides: { 'GET /api/ai-coach/config': json({ error: 'ai_feature_disabled' }, 403) },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/ai-coach.html');
  await expect(page.locator('#aiStatus')).toContainText('currently disabled');
  await expect(page.locator('#authGate')).toBeHidden();
  await expect(page.locator('#retryInit')).toBeHidden();
  assertOfflineSafe(disabled);
});

test('service failures offer a retry and translated status text follows manual language changes', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('mzactive-language-manual', 'ar'); } catch { /* storage unavailable */ }
  });
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'member' }),
    overrides: { 'GET /api/ai-coach/config': json({ error: 'service_unavailable' }, 503) },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/ai-coach.html');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#aiStatus')).toContainText('غير متاحة مؤقتاً');
  await expect(page.locator('#retryInit')).toBeVisible();
  await page.locator('.lang-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('#aiStatus')).toContainText('temporarily unavailable');
  assertOfflineSafe(mock);
});

test('admin accounts see a role gate instead of the athlete or coach planner', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'admin' }),
    overrides: overrides(),
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/ai-coach.html');
  await expect(page.locator('#roleGate')).toBeVisible();
  await expect(page.locator('#coachRedirect')).toBeHidden();
  await expect(page.locator('#planner')).toBeHidden();
  assertOfflineSafe(mock);
});

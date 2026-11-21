'use strict';

/*
 * Athlete Management CRM journeys. Every Worker call is answered by the local
 * mock in helpers.cjs, so these tests never read or write production records.
 * The athlete consent page is exercised with synthetic invitation tokens only.
 */

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const ATHLETE_ID = 'athlete-e2e-1';
const ATHLETE_ID_2 = 'athlete-e2e-2';
const COACH_ID = 'coach-e2e-approved';
const CONNECTION_ID = 'conn-e2e-1';
const INVITATION_ID = 'inv-e2e-1';
const TOKEN = 'e2e-only-invitation-token-not-a-secret';
const CREATED = '2026-11-21T10:00:00.000Z';

const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  super_admin: true,
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

const completeAthlete = {
  id: ATHLETE_ID,
  name: 'Layla Hassan',
  email: 'layla@example.invalid',
  city: 'Doha',
  sports: ['running', 'triathlon'],
  goals: 'Improve my race pace',
  experience_level: 'intermediate',
  preferred_language: 'en',
  availability_notes: 'Weekday evenings',
  age_range: '30-39',
  gender: 'female',
  last_activity_at: CREATED,
  registered_at: '2026-11-01T10:00:00.000Z',
  assignment_status: 'unassigned',
  active: true,
  onboarding_incomplete: false,
  assigned_coach_name: '',
  program_count: 1,
  booking_count: 2,
};

const incompleteAthlete = {
  ...completeAthlete,
  id: ATHLETE_ID_2,
  name: 'Omar Ali',
  email: 'omar@example.invalid',
  sports: [],
  goals: '',
  assignment_status: 'assigned',
  assigned_coach_name: 'Approved Running Coach',
  active: false,
  onboarding_incomplete: true,
  last_activity_at: '2026-10-01T10:00:00.000Z',
};

const allAthletes = [completeAthlete, incompleteAthlete];

function directoryHandler(athletes) {
  return ctx => {
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    let rows = athletes.filter(athlete => {
      if (q && !(athlete.name + ' ' + athlete.email + ' ' + (athlete.sports || []).join(' '))
        .toLowerCase().includes(String(q).toLowerCase())) return false;
      if (filter === 'assigned') return athlete.assignment_status === 'assigned';
      if (filter === 'unassigned') return athlete.assignment_status !== 'assigned';
      if (filter === 'active') return athlete.active === true;
      if (filter === 'inactive') return athlete.active === false;
      if (filter === 'onboarding_incomplete') return athlete.onboarding_incomplete === true;
      return true;
    });
    if (sort === 'name') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return json({
      athletes: rows,
      total: rows.length,
      q,
      unlinked: [],
      counts: {
        all: athletes.length,
        assigned: athletes.filter(a => a.assignment_status === 'assigned').length,
        unassigned: athletes.filter(a => a.assignment_status !== 'assigned').length,
        active: athletes.filter(a => a.active === true).length,
        inactive: athletes.filter(a => a.active === false).length,
        onboarding_incomplete: athletes.filter(a => a.onboarding_incomplete === true).length,
      },
    });
  };
}

function detailResponse(overrides = {}) {
  return {
    athlete: completeAthlete,
    coaches: [],
    invitations: [],
    programs: [],
    bookings: [],
    messages: [],
    audit: [{ action: 'profile_viewed', created_at: CREATED, actor_user_id: 'e2e-admin' }],
    ...overrides,
  };
}

function recommendationsResponse() {
  return {
    athlete_id: ATHLETE_ID,
    matches: [{
      coach_id: COACH_ID,
      coach_name: 'Approved Running Coach',
      score: 92,
      city: 'Doha',
      coaching_mode: 'both',
      languages: ['English'],
      specialties: ['running'],
      reasons: [
        { code: 'approved_coach', en: 'Approved MZ Active coach', ar: 'مدرب معتمد من MZ Active' },
        { code: 'sport_match', en: 'Shares your sport', ar: 'يتشارك رياضتك' },
        { code: 'location_match', en: 'Matches your city', ar: 'يتطابق مع مدينتك' },
      ],
    }],
    next_steps: [{ en: 'Confirm the athlete profile is complete.', ar: 'تأكد من اكتمال الملف الرياضي.' }],
    drafts: [{
      subject_en: 'A coach suggestion for you', subject_ar: 'اقتراح مدرب لك',
      body_en: 'Would you like an introduction?', body_ar: 'هل ترغب في التعريف؟',
      requires_approval: true,
    }],
    disclaimer: {
      en: 'No medical advice, diagnosis or licensed-coach claim is made.',
      ar: 'لا يتضمن هذا أي نصيحة أو تشخيص طبي أو ادعاء بترخيص تدريبي.',
    },
  };
}

function invitationView(overrides = {}) {
  return {
    invitation: {
      kind: 'coach',
      status: 'pending',
      athlete_name: completeAthlete.name,
      coach_name: 'Approved Running Coach',
      expires_at: '2026-12-05T10:00:00.000Z',
      reason_codes: ['approved_coach', 'sport_match', 'location_match'],
      language: 'en',
      ...overrides,
    },
  };
}

function crmOverrides(extra = {}) {
  return {
    'GET /api/me/access': adminAccess,
    'GET /api/admin/athletes': directoryHandler(allAthletes),
    ['GET /api/admin/athletes/' + ATHLETE_ID]: () => json(detailResponse()),
    ['GET /api/admin/athletes/' + ATHLETE_ID_2]: () => json(detailResponse({
      athlete: incompleteAthlete,
    })),
    ['GET /api/admin/athletes/' + ATHLETE_ID + '/recommendations']: () => json(recommendationsResponse()),
    ['POST /api/admin/athletes/' + ATHLETE_ID + '/invitations/profile']: () => json({ invitation: { id: INVITATION_ID, status: 'pending' } }, 201),
    ['POST /api/admin/athletes/' + ATHLETE_ID + '/invitations/coach']: () => json({ invitation: { id: INVITATION_ID, status: 'pending' } }, 201),
    ['POST /api/admin/athletes/' + ATHLETE_ID + '/connections/' + CONNECTION_ID + '/revoke']: () => json({ ok: true }),
    ['POST /api/admin/athletes/' + ATHLETE_ID + '/invitations/' + INVITATION_ID + '/resend']: () => json({ ok: true }, 201),
    ...extra,
  };
}

async function openPortal(page, overrides, url = '/admin.html?tab=athletes') {
  const mock = await installApiMock(page, { overrides: crmOverrides(overrides) });
  await seedSession(page, { storage: 'session' });
  await page.goto(url);
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#nav [data-nav-tab=athletes]')).toHaveAttribute('aria-current', 'true');
  return mock;
}

test('the athlete directory uses backend-derived counts, search, filters, sorting and clickable cards', async ({ page }) => {
  const mock = await openPortal(page);

  await expect(page.locator('.athlete-search')).toBeVisible();
  await expect(page.locator('.athlete-sort')).toBeVisible();
  await expect(page.locator('.athlete-filter')).toHaveText([
    'All athletes (2)', 'Unassigned (1)', 'Assigned (1)', 'Active (1)', 'Inactive (1)', 'Onboarding incomplete (1)',
  ]);
  await expect(page.locator('.athlete-card')).toHaveCount(2);
  await expect(page.locator('.athlete-card').first()).toContainText('Layla Hassan');
  await expect(page.locator('.athlete-card').first()).toContainText('View profile →');

  await page.locator('.athlete-search').fill('Omar');
  await expect(page.locator('.athlete-card')).toHaveCount(1);
  await expect(page.locator('.athlete-card')).toContainText('Omar Ali');

  await page.locator('.athlete-search').fill('');
  await page.locator('.athlete-filter[data-filter=onboarding_incomplete]').click();
  await expect(page.locator('.athlete-card')).toHaveCount(1);
  await expect(page.locator('.athlete-card')).toContainText('Omar Ali');

  await page.locator('.athlete-filter[data-filter=all]').click();
  await page.locator('.athlete-sort').selectOption('name');
  await expect(page.locator('.athlete-card').first()).toContainText('Layla Hassan');

  await page.locator('.athlete-search').fill('nobody-matches-this');
  await expect(page.locator('.athlete-list')).toContainText('No athletes match these filters.');

  const reads = mock.calls.filter(call => call.path === '/api/admin/athletes' && call.method === 'GET');
  expect(reads.length).toBeGreaterThan(1);
  expect(reads.some(call => call.query.q === 'Omar')).toBe(true);
  expect(reads.some(call => call.query.filter === 'onboarding_incomplete')).toBe(true);
  expect(reads.some(call => call.query.sort === 'name')).toBe(true);
  assertOfflineSafe(mock);
});

test('an athlete deep link opens a verified detail drawer with actions and safe missing values', async ({ page }) => {
  const mock = await openPortal(page, {}, '/admin.html?tab=athletes&record=' + ATHLETE_ID);

  const drawer = page.locator('#athleteDetailDialog');
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('Verified athlete profile');
  await expect(drawer).toContainText('Layla Hassan');
  await expect(drawer).toContainText('Improve my race pace');
  await expect(drawer).toContainText('Weekday evenings');
  await expect(drawer).toContainText('Only verified profile fields are shown.');
  await expect(drawer.locator('#crmProfileSection .crm-field').filter({ hasText: 'Email' })).toContainText('layla@example.invalid');
  await expect(drawer.locator('.crm-actions .crm-action')).toHaveCount(7);

  const emptyDrawer = page.locator('#athleteDetailDialog');
  await emptyDrawer.locator('.crm-close').click();
  await expect(emptyDrawer).toBeHidden();
  await page.locator('.athlete-card[data-record-id="' + ATHLETE_ID_2 + '"]').click();
  await expect(emptyDrawer).toContainText('Omar Ali');
  await expect(emptyDrawer.locator('.crm-field').filter({ hasText: 'Sports' })).toContainText('Not provided');
  await expect(emptyDrawer.locator('.crm-field').filter({ hasText: 'Goals' })).toContainText('Not provided');
  assertOfflineSafe(mock);
});

test('CRM actions show loading, success and error states and never send without approval', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  let inviteStatus = 201;
  const mock = await openPortal(page, {
    ['POST /api/admin/athletes/' + ATHLETE_ID + '/invitations/profile']: ctx => inviteStatus === 201
      ? json({ invitation: { id: INVITATION_ID, status: 'pending' } }, 201)
      : json({ error: 'service_unavailable' }, 503),
  }, '/admin.html?tab=athletes&record=' + ATHLETE_ID);

  const drawer = page.locator('#athleteDetailDialog');
  const invite = drawer.locator('.crm-action').filter({ hasText: 'Invite to complete profile' }).first();
  await invite.click();
  await expect(drawer.locator('.crm-status')).toContainText('Profile invitation sent.');
  const posts = mock.calls.filter(call => call.path.endsWith('/invitations/profile') && call.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toEqual({ language: 'en' });

  inviteStatus = 503;
  await invite.click();
  await expect(drawer.locator('.crm-status').first()).toContainText('temporarily unavailable');
  expect(mock.calls.filter(call => call.path.endsWith('/invitations/profile') && call.method === 'POST')).toHaveLength(2);
  assertOfflineSafe(mock);
});

test('AI recommendations explain why, keep drafts approval-gated and require explicit consent', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  const mock = await openPortal(page, {}, '/admin.html?tab=athletes&record=' + ATHLETE_ID);

  const drawer = page.locator('#athleteDetailDialog');
  await drawer.locator('.crm-action').filter({ hasText: 'Recommend coach' }).first().click();
  await expect(drawer.locator('.crm-recommendations')).toContainText('No medical advice, diagnosis or licensed-coach claim is made.');
  await expect(drawer.locator('.crm-recommendations')).toContainText('Why this recommendation');
  await expect(drawer.locator('.crm-recommendations')).toContainText('Approved MZ Active coach');
  await expect(drawer.locator('.crm-recommendations')).toContainText('Shares your sport');
  await expect(drawer.locator('.crm-draft')).toBeVisible();
  expect(mock.calls.some(call => call.path.endsWith('/recommendations'))).toBe(true);
  expect(mock.calls.some(call => call.method === 'POST')).toBe(false);

  await drawer.locator('.crm-match .crm-action').filter({ hasText: 'Review and send invitation' }).click();
  const invite = mock.calls.find(call => call.method === 'POST' && call.path.endsWith('/invitations/coach'));
  expect(invite).toBeTruthy();
  expect(invite.body.coach_id).toBe(COACH_ID);
  expect(invite.body.reasons).toEqual(['approved_coach', 'sport_match', 'location_match']);
  await expect(drawer.locator('.crm-status')).toContainText('The athlete must accept before any workspace opens.');
  assertOfflineSafe(mock);
});

test('athletes tab follows management permissions and never appears for a coach', async ({ page }) => {
  const limited = json({
    user: { id: 'e2e-manager', email: 'manager@example.invalid', role: 'provider' },
    account_type: 'manager',
    dashboard_path: '/admin.html',
    management: { enabled: true, permissions: ['management.view', 'management.coaches'] },
  });
  const mock = await installApiMock(page, {
    overrides: crmOverrides({ 'GET /api/me/access': limited }),
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html?tab=athletes');
  await expect(page.locator('#nav [data-nav-tab=athletes]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#nav [data-nav-tab=ai]')).toHaveCount(0);
  await expect(page.locator('.athlete-card')).toHaveCount(2);
  assertOfflineSafe(mock);
});

test('the athletes tab never appears for a coach account', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: crmOverrides({
      'GET /api/me/access': json({
        user: { id: 'e2e-coach', email: 'coach@example.invalid', role: 'provider' },
        account_type: 'provider',
        dashboard_path: '/dashboard.html',
        management: { enabled: false, permissions: [] },
      }),
    }),
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html?tab=athletes');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#nav [data-nav-tab=athletes]')).toHaveCount(0);
  await expect(page.locator('.athlete-card')).toHaveCount(0);
  expect(mock.calls.some(call => call.path === '/api/admin/athletes')).toBe(false);
  assertOfflineSafe(mock);
});

test('the athlete consent page accepts or declines locally with a URL-only token', async ({ page }) => {
  const view = json(invitationView());
  const mock = await installApiMock(page, {
    overrides: {
      ['GET /api/athlete-invitations/' + TOKEN]: view,
      ['POST /api/athlete-invitations/' + TOKEN]: () => json({ status: 'accepted', workspace_active: true }),
    },
  });
  await page.goto('/athlete-invitations.html?token=' + TOKEN);
  await expect(page.locator('#invitationDetails')).toBeVisible();
  await expect(page.locator('#invitationTitle')).toHaveText('Coach invitation');
  await expect(page.locator('#invitationMeta')).toContainText(completeAthlete.name);
  await expect(page.locator('#invitationReasons li')).toHaveCount(3);
  await expect(page.locator('#invitationReasons')).toContainText('Approved MZ Active coach');

  const tokenFromDom = await page.evaluate(() => document.body.innerHTML.includes('e2e-only-invitation-token'));
  expect(tokenFromDom).toBe(false);
  await page.locator('#invitationAccept').click();
  await expect(page.locator('#invitationSuccess')).toBeVisible();
  await expect(page.locator('#invitationSuccessTitle')).toHaveText('Invitation accepted');
  await expect(page.locator('#invitationSuccessBody')).toContainText('private coaching workspace is ready');
  assertOfflineSafe(mock);
});

test('the athlete consent page is bilingual with RTL and a safe decline', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mzactive-language-manual', 'ar'));
  const mock = await installApiMock(page, {
    overrides: {
      ['GET /api/athlete-invitations/' + TOKEN]: () => json(invitationView({ kind: 'profile', coach_name: '' })),
      ['POST /api/athlete-invitations/' + TOKEN]: () => json({ status: 'declined', workspace_active: false }),
    },
  });
  await page.goto('/athlete-invitations.html?token=' + TOKEN);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#invitationTitle')).toHaveText('دعوة ملف رياضي');
  await expect(page.locator('#invitationAccept')).toHaveText('قبول');
  await page.locator('#invitationDecline').click();
  await expect(page.locator('#invitationSuccessTitle')).toHaveText('تم رفض الدعوة');
  await expect(page.locator('#invitationSuccessBody')).toContainText('يبقى ملفك الرياضي فارغاً وخاصاً');
  assertOfflineSafe(mock);
});

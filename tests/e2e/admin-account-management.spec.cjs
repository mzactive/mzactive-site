'use strict';

/*
 * Synthetic admin account-management journeys. Every Worker call is mocked;
 * no production identity is read, changed or deleted.
 */

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const ATHLETE_ID = 'athlete-e2e-1';
const COACH_PROFILE_ID = 'coach-profile-e2e';
const COACH_USER_ID = 'coach-e2e';
const ATHLETE_EMAIL = 'athlete-e2e@example.invalid';

const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  super_admin: true,
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

const managerAccess = json({
  user: { id: 'e2e-manager', email: 'manager@example.invalid', role: 'provider' },
  account_type: 'manager',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: ['management.view', 'management.coaches'] },
});

const athlete = {
  id: ATHLETE_ID,
  name: 'Layla Hassan',
  email: ATHLETE_EMAIL,
  city: 'Doha',
  sports: ['running'],
  goals: 'Improve my race pace',
  experience_level: 'intermediate',
  preferred_language: 'en',
  availability_notes: 'Weekday evenings',
  age_range: '30-39',
  gender: 'female',
  last_activity_at: '2026-11-21T10:00:00.000Z',
  registered_at: '2026-11-01T10:00:00.000Z',
  assignment_status: 'unassigned',
  active: true,
  onboarding_incomplete: false,
  assigned_coach_name: '',
  program_count: 1,
  booking_count: 2,
};

const coachApplication = {
  id: COACH_PROFILE_ID,
  user_id: COACH_USER_ID,
  display_name: 'E2E Coach',
  email: 'coach-e2e@example.invalid',
  provider_type: 'coach',
  city: 'Doha',
  country: 'Qatar',
  status: 'pending',
  submission_state: 'submitted',
  profile_complete: true,
  updated_at: '2026-11-21T10:00:00.000Z',
};

function accountFixture(overrides = {}) {
  return {
    account: {
      id: ATHLETE_ID,
      email: ATHLETE_EMAIL,
      role: 'provider',
      account_status: 'active',
      profile_id: null,
      profile_status: null,
      submission_state: null,
      display_name: athlete.name,
      booking_count: 2,
      program_count: 1,
      role_mismatch: true,
      ...overrides,
    },
    events: [],
  };
}

function baseOverrides(extra = {}) {
  return {
    'GET /api/me/access': adminAccess,
    'GET /api/admin/athletes': () => json({
      athletes: [athlete], total: 1, unlinked: [],
      counts: { all: 1, assigned: 0, unassigned: 1, active: 1, inactive: 0, onboarding_incomplete: 0 },
    }),
    ['GET /api/admin/athletes/' + ATHLETE_ID]: () => json({
      athlete, coaches: [], invitations: [], programs: [], bookings: [], messages: [], audit: [],
    }),
    ['GET /api/admin/accounts/' + ATHLETE_ID]: () => json(accountFixture()),
    ['GET /api/admin/accounts/' + COACH_USER_ID]: () => json(accountFixture({
      id: COACH_USER_ID,
      email: 'coach-e2e@example.invalid',
      profile_id: COACH_PROFILE_ID,
      profile_status: 'pending',
      submission_state: 'submitted',
      display_name: coachApplication.display_name,
      role_mismatch: false,
    })),
    'GET /api/admin/applications': () => json({
      providers: [coachApplication], approved_providers: [], rejected_providers: [],
      suspended_providers: [], draft_providers: [], bookings: [],
    }),
    ...extra,
  };
}

async function openPortal(page, overrides = {}, url = '/admin.html?tab=athletes') {
  const mock = await installApiMock(page, { overrides: baseOverrides(overrides) });
  await seedSession(page, { storage: 'session' });
  await page.goto(url);
  await expect(page.locator('#workspace')).toBeVisible();
  return mock;
}

async function openAthleteManage(page, overrides = {}) {
  const mock = await openPortal(page, overrides, '/admin.html?tab=athletes&record=' + ATHLETE_ID);
  const section = page.locator('#athleteDetailDialog #manageAccountSection');
  await expect(section).toBeVisible();
  return { mock, section };
}

test('View Profile has a separate Manage Account section with status and admin-only controls', async ({ page }) => {
  const { mock, section } = await openAthleteManage(page);

  await expect(page.locator('#athleteDetailDialog')).toContainText('Verified athlete profile');
  await expect(section).toContainText('Manage account');
  await expect(section).toContainText('Administrative controls only. Public profile fields are not changed here.');
  await expect(section).toContainText('Active');
  await expect(section).toContainText('Athlete / member');
  await expect(section).toContainText('Not a coach applicant');
  await expect(section.locator('.crm-field').filter({ hasText: 'Bookings retained' })).toContainText('2');
  await expect(section.locator('.crm-field').filter({ hasText: 'Training records retained' })).toContainText('1');
  await expect(section.locator('.account-action-button').filter({ hasText: 'Open coach application' })).toBeVisible();
  await expect(section.locator('.account-action-button').filter({ hasText: 'Suspend access' })).toBeVisible();
  await section.locator('.account-danger summary').click();
  await expect(section.locator('.danger-action')).toBeVisible();
  await expect(section.locator('.account-events')).toContainText('Account audit');

  const manageShortcut = page.locator('#athleteDetailDialog .crm-action').filter({ hasText: 'Manage account' });
  await manageShortcut.click();
  await expect(section).toBeInViewport();
  assertOfflineSafe(mock);
});

test('coach conversion requires confirmation and never fires on cancel', async ({ page }) => {
  let acceptDialog = false;
  page.on('dialog', dialog => acceptDialog ? dialog.accept() : dialog.dismiss());
  const posts = [];
  const capture = ctx => { posts.push({ path: ctx.path, body: ctx.body }); return json({ ok: true }); };
  const { mock, section } = await openAthleteManage(page, {
    ['POST /api/admin/accounts/' + ATHLETE_ID + '/coach-application']: capture,
  });

  const convert = section.locator('.account-action-button').filter({ hasText: 'Open coach application' });
  await section.locator('select.account-convert-type').selectOption('coach');
  await convert.click();
  await expect(section.locator('.account-action-status')).toContainText('Cancelled.');
  expect(posts).toHaveLength(0);

  acceptDialog = true;
  await convert.click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].path).toBe('/api/admin/accounts/' + ATHLETE_ID + '/coach-application');
  expect(posts[0].body.provider_type).toBe('coach');
  assertOfflineSafe(mock);
});

test('suspension requires confirmation and sends the reason only after approval', async ({ page }) => {
  let acceptDialog = false;
  page.on('dialog', dialog => acceptDialog ? dialog.accept() : dialog.dismiss());
  const posts = [];
  const capture = ctx => { posts.push({ path: ctx.path, body: ctx.body }); return json({ ok: true }); };
  const { mock, section } = await openAthleteManage(page, {
    ['POST /api/admin/accounts/' + ATHLETE_ID + '/suspend']: capture,
  });

  await section.locator('input[aria-label="Reason (optional)"]').fill('Synthetic suspension test');
  const suspend = section.locator('.account-action-button').filter({ hasText: 'Suspend access' });
  await suspend.click();
  expect(posts).toHaveLength(0);

  acceptDialog = true;
  await suspend.click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].path).toBe('/api/admin/accounts/' + ATHLETE_ID + '/suspend');
  expect(posts[0].body.reason).toBe('Synthetic suspension test');
  assertOfflineSafe(mock);
});

test('account edit and role controls send audited backend changes', async ({ page }) => {
  let acceptDialog = false;
  page.on('dialog', dialog => acceptDialog ? dialog.accept() : dialog.dismiss());
  const posts = [];
  const capture = ctx => { posts.push({ path: ctx.path, body: ctx.body }); return json({ ok: true }); };
  const { mock, section } = await openAthleteManage(page, {
    ['POST /api/admin/accounts/' + ATHLETE_ID + '/update']: capture,
    ['POST /api/admin/accounts/' + ATHLETE_ID + '/role']: capture,
  });

  await section.locator('.account-edit summary').click();
  const edit = section.locator('.account-edit');
  await edit.locator('input[aria-label="Account email"]').fill('athlete.new@example.invalid');
  await edit.locator('input[aria-label="Display name"]').fill('Synthetic Updated Athlete');
  await edit.locator('input[aria-label="City"]').fill('Doha');
  await edit.locator('input[aria-label="WhatsApp number"]').fill('+974 5555 1234');
  await edit.locator('select.account-language').selectOption('ar');
  await edit.locator('.account-action-button').filter({ hasText: 'Save account details' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].path).toBe('/api/admin/accounts/' + ATHLETE_ID + '/update');
  expect(posts[0].body).toEqual({
    email: 'athlete.new@example.invalid', display_name: 'Synthetic Updated Athlete',
    city: 'Doha', country: '', whatsapp_number: '+974 5555 1234', preferred_language: 'ar',
  });

  await section.locator('.account-role summary').click();
  const role = section.locator('.account-role');
  await expect(role.locator('input[data-super-admin="1"]')).not.toBeChecked();
  await role.locator('select.account-role-select').selectOption('admin');
  acceptDialog = true;
  await role.locator('.account-action-button').filter({ hasText: 'Apply role change' }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].path).toBe('/api/admin/accounts/' + ATHLETE_ID + '/role');
  expect(posts[1].body).toEqual({ role: 'admin', super_admin: false });
  assertOfflineSafe(mock);
});

test('deletion requires typed confirmation and cancel clears the confirmation', async ({ page }) => {
  let acceptDialog = false;
  page.on('dialog', dialog => acceptDialog ? dialog.accept() : dialog.dismiss());
  const posts = [];
  const capture = ctx => { posts.push({ path: ctx.path, body: ctx.body }); return json({ ok: true }); };
  const { mock, section } = await openAthleteManage(page, {
    ['POST /api/admin/accounts/' + ATHLETE_ID + '/delete']: capture,
  });

  await section.locator('.account-danger summary').click();
  const emailConfirm = section.locator('input[aria-label="Type the account email to confirm"]');
  const phraseConfirm = section.locator('input[placeholder="DELETE"]');
  const del = section.locator('.danger-action');
  await emailConfirm.fill(ATHLETE_EMAIL);
  await phraseConfirm.fill('DELETE');
  await section.locator('.account-cancel').click();
  await expect(emailConfirm).toHaveValue('');
  await expect(phraseConfirm).toHaveValue('');
  await section.locator('.account-danger summary').click();
  await del.click();
  expect(posts).toHaveLength(0);

  await emailConfirm.fill(ATHLETE_EMAIL);
  await phraseConfirm.fill('DELETE');
  acceptDialog = true;
  await del.click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].path).toBe('/api/admin/accounts/' + ATHLETE_ID + '/delete');
  expect(posts[0].body).toEqual({ confirm_email: ATHLETE_EMAIL, confirm_phrase: 'DELETE' });
  assertOfflineSafe(mock);
});

test('scoped managers can view account status but see no mutation controls', async ({ page }) => {
  const { mock, section } = await openAthleteManage(page, {
    'GET /api/me/access': managerAccess,
  });

  await expect(section).toContainText('View only. A full administrator must make account changes.');
  await expect(section.locator('.account-action-button')).toHaveCount(0);
  await expect(section.locator('.danger-action')).toHaveCount(0);
  await expect(section).toContainText('Active');
  assertOfflineSafe(mock);
});

test('coach accounts expose the same account controls and audit history', async ({ page }) => {
  const mock = await openPortal(page, {}, '/admin.html?tab=coaches');
  const card = page.locator('.coach-card').filter({ hasText: 'E2E Coach' });
  await card.locator('summary').click();

  const section = card.locator('#manageAccountSection');
  await expect(section).toBeVisible();
  await expect(section).toContainText('Coach applicant — pending review');
  await expect(section.locator('.account-action-button').filter({ hasText: 'Suspend access' })).toBeVisible();
  await section.locator('.account-danger summary').click();
  await expect(section.locator('.danger-action')).toBeVisible();
  await expect(section.locator('.account-events')).toContainText('Account audit');
  assertOfflineSafe(mock);
});

test('Arabic account controls render RTL at 360px with 44px targets', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const mock = await openPortal(page);
  await page.locator('#language').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.locator('.athlete-card[data-record-id="' + ATHLETE_ID + '"]').click();
  const section = page.locator('#athleteDetailDialog #manageAccountSection');
  await expect(section).toContainText('إدارة الحساب');
  await expect(section).toContainText('نشط');
  await expect(section).toContainText('حذف الحساب');

  const heights = await section.locator('.account-action-button, .account-cancel, select, input[type=email], input[type=text]')
    .evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
  assertOfflineSafe(mock);
});

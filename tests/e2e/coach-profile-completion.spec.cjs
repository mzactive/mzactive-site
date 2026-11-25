'use strict';

/*
 * Synthetic coach profile-completion journeys. Every Worker call is mocked;
 * no production account, booking, profile or admin record is read or changed.
 */

const { test, expect } = require('./pw.cjs');
const {
  assertOfflineSafe,
  clickAdminTab,
  installApiMock,
  json,
  seedSession,
} = require('./helpers.cjs');

const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  super_admin: true,
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

const providerAccess = json({
  user: { id: 'coach-e2e', email: 'coach@example.invalid', role: 'provider' },
  account_type: 'provider',
  dashboard_path: '/providers.html',
  management: { enabled: false, permissions: [] },
});

const completion = {
  percent: 40,
  complete: false,
  required: ['bio', 'specialties'],
  recommended: ['profile_photo', 'qualifications', 'cover_photo'],
  score: 55,
};

const complete = {
  percent: 100,
  complete: true,
  required: [],
  recommended: ['profile_photo', 'qualifications', 'cover_photo'],
  score: 100,
};

function completionProfile() {
  return {
    id: 'coach-e2e',
    status: 'approved',
    display_name: 'E2E Coach',
    provider_type: 'coach',
    country: 'Qatar',
    city: 'Doha',
    specialties: [],
    languages: ['English'],
    bio: '',
    qualifications: '',
    services: ['Running sessions'],
    coaching_mode: 'both',
    program_durations: [1],
    public_fields: ['city', 'specialties', 'languages', 'bio', 'profile_photo'],
    whatsapp_number: '97455555555',
    whatsapp_public: true,
    experience_years: 4,
    indicative_rate_qar: 200,
    social_links: [],
    has_cv: 0,
  };
}

function adminCoach() {
  return {
    id: 'coach-e2e',
    user_id: 'coach-e2e',
    display_name: 'E2E Coach',
    email: 'coach@example.invalid',
    provider_type: 'coach',
    city: 'Doha',
    country: 'Qatar',
    status: 'approved',
    submission_state: 'submitted',
    profile_complete: false,
    updated_at: '2026-11-21T10:00:00.000Z',
  };
}

test('coach dashboard shows required checklist, gold bar, and links to real fields', async ({ page }) => {
  const mock = await installApiMock(page, {
    profile: completionProfile(),
    overrides: {
      'GET /api/me/completeness': json({ status: 'approved', completeness: completion }),
    },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html?legacy=1');

  const panel = page.locator('#coachProfilePanel .profile-completion');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.profile-completion-percent')).toHaveText('40%');
  const bar = panel.locator('[role=progressbar]');
  await expect(bar).toHaveAttribute('aria-valuenow', '40');
  expect(await panel.locator('.profile-completion-fill').evaluate(node => node.style.width)).toBe('40%');
  await expect(panel.locator('[data-completion-key="bio"]')).toContainText('Biography and coaching experience');
  await expect(panel.locator('[data-completion-key="specialties"]')).toContainText('Specialties');
  await expect(panel.locator('[data-completion-key="qualifications"]')).toHaveCount(0);
  await expect(panel.locator('[data-completion-key="cover_photo"]')).toHaveCount(0);
  await expect(panel).toContainText('Approval and licence verification are handled separately.');
  await expect(panel.locator('.profile-completion-done')).toHaveCount(0);

  await panel.locator('[data-completion-key="bio"]').click();
  await expect(page).toHaveURL(/#completion-bio$/);
  await expect(page.locator('[data-completion-field="bio"]')).toBeFocused();
  assertOfflineSafe(mock);
});

test('provider editor recalculates from the backend after a successful save', async ({ page }) => {
  let saved = false;
  const mock = await installApiMock(page, {
    profile: completionProfile(),
    overrides: {
      'GET /api/me/access': providerAccess,
      'GET /api/me/completeness': () => json({
        status: 'approved',
        completeness: saved ? complete : completion,
      }),
      'PUT /api/me/profile': () => {
        saved = true;
        return json({ status: 'approved', submission_state: 'submitted', warnings: [] });
      },
    },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/providers.html#provider-portal');

  const panel = page.locator('#providerCompletion');
  await expect(page.locator('#profileEditor')).toBeVisible();
  await expect(panel.locator('.profile-completion-percent')).toHaveText('40%');
  await page.locator('[data-completion-field="bio"]').fill('A complete public biography.');
  await page.locator('[data-completion-field="specialties"]').fill('Running');
  await page.locator('#profileEditor button[type=submit]:not([name=action])').click();
  await expect(page.locator('#profileMessage')).toContainText('approved status is unchanged');
  await expect(panel.locator('.profile-completion-percent')).toHaveText('100%');
  await expect(panel.locator('.profile-completion-done')).toBeVisible();
  expect(mock.calls.filter(call => call.path === '/api/me/completeness').length).toBeGreaterThan(1);
  assertOfflineSafe(mock);
});

test('admin portal and coach dashboard display the same backend completion percentage', async ({ browser }) => {
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const coachContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const adminPage = await adminContext.newPage();
    const adminMock = await installApiMock(adminPage, {
      overrides: {
        'GET /api/me/access': adminAccess,
        'GET /api/admin/applications': json({
          providers: [adminCoach()], approved_providers: [], rejected_providers: [],
          suspended_providers: [], bookings: [],
        }),
        [`GET /api/admin/coaches/coach-e2e/completeness`]: json({
          status: 'approved', completeness: completion,
        }),
      },
    });
    await seedSession(adminPage, { storage: 'session' });
    await adminPage.goto('/admin.html');
    await clickAdminTab(adminPage, 'coaches');
    await adminPage.getByRole('button', { name: /Incomplete/ }).click();
    const adminTag = adminPage.locator('.coach-card .completeness-tag').first();
    await expect(adminTag).toContainText('40%');
    assertOfflineSafe(adminMock);

    const coachPage = await coachContext.newPage();
    const coachMock = await installApiMock(coachPage, {
      profile: completionProfile(),
      overrides: {
        'GET /api/me/completeness': json({ status: 'approved', completeness: completion }),
      },
    });
    await seedSession(coachPage, { storage: 'local' });
    await coachPage.goto('/dashboard.html?legacy=1');
    const coachPercent = coachPage.locator('#coachProfilePanel .profile-completion-percent');
    await expect(coachPercent).toHaveText('40%');
    assertOfflineSafe(coachMock);

    expect((await adminTag.textContent()).match(/\d+%/)[0])
      .toBe((await coachPercent.textContent()).match(/\d+%/)[0]);
  } finally {
    await adminContext.close();
    await coachContext.close();
  }
});

test('Arabic coach completion is RTL, localized, and touch-sized on mobile', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mzactive-language-manual', 'ar'));
  const mock = await installApiMock(page, {
    profile: completionProfile(),
    overrides: {
      'GET /api/me/completeness': json({
        status: 'approved',
        completeness: { ...completion, required: ['display_name'] },
      }),
    },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html?legacy=1');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const panel = page.locator('#coachProfilePanel .profile-completion');
  await expect(panel.locator('h3')).toContainText('اكتمال الملف');
  const link = panel.locator('[data-completion-key="display_name"]');
  await expect(link).toContainText('الاسم المعروض');
  const box = await link.boundingBox();
  expect(box && box.height).toBeGreaterThanOrEqual(44);
  assertOfflineSafe(mock);
});

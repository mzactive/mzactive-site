'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json } = require('./helpers.cjs');

const approvedPacer = {
  id: 'pacer-e2e',
  provider_type: 'pacer',
  display_name: 'E2E Approved Pacer',
  city: 'Doha',
  country: 'Qatar',
  professional_category: { en: 'Champion Pacer', ar: 'مرافق جري' },
  pacer_details: {
    sports: ['running', 'cycling'],
    services: ['sessions', 'race'],
    distances: ['5K', '10K', 'Half Marathon'],
    running_pace: '4:30/km',
    cycling_speed: '32 km/h',
  },
  has_profile_photo: false,
};

test('approved Pacers render from the real directory with a working booking link', async ({ page }) => {
  const mock = await installApiMock(page, { providers: [approvedPacer] });
  await page.goto('/pacer.html');

  await expect(page.locator('#pacerGrid .pacer-card')).toHaveCount(1);
  await expect(page.locator('#pacerGrid')).toContainText('E2E Approved Pacer');
  await expect(page.locator('#pacerGrid')).toContainText('4:30/km');
  await expect(page.locator('#pacerGrid')).toContainText('32 km/h');
  await expect(page.locator('#pacerEmpty')).toBeHidden();
  await expect(page.locator('#pacerGrid .pacer-card a.btn')).toHaveAttribute('href', 'pacer.html?provider=pacer-e2e#request');
  assertOfflineSafe(mock);
});

test('the professional empty state appears when no Pacers are approved', async ({ page }) => {
  const mock = await installApiMock(page);
  await page.goto('/pacer.html');

  await expect(page.locator('#pacerGrid .pacer-card')).toHaveCount(0);
  await expect(page.locator('#pacerEmpty')).toContainText('The first pacer profiles are being reviewed.');
  await expect(page.locator('#pacerEmpty')).not.toContainText('ملفات أول المرافقين قيد المراجعة.');
  assertOfflineSafe(mock);
});

test('directory failures show an accurate unavailable state', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/providers': json({ error: 'service_unavailable' }, 503) },
  });
  await page.goto('/pacer.html');

  await expect(page.locator('#pacerEmpty')).toContainText('Pacer listings are temporarily unavailable.');
  await expect(page.locator('#pacerEmpty')).not.toContainText('الدليل غير متاح مؤقتاً.');
  assertOfflineSafe(mock);
});

test('preselected Pacer bookings use real services and pacing units', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/providers/pacer-e2e': json({ provider: approvedPacer }),
    },
  });
  await page.goto('/pacer.html?provider=pacer-e2e#request');

  await expect(page.locator('#bookingTitle')).toContainText('Send a request to E2E Approved Pacer');
  await expect(page.locator('#sessionType')).toHaveValue('training');
  await expect(page.locator('#serviceField')).toBeVisible();
  await expect(page.locator('#serviceName')).toHaveValue('sessions');
  await expect(page.locator('#date')).not.toHaveAttribute('required', /.*/);
  await expect(page.locator('#paceLabel')).toContainText('optional');
  assertOfflineSafe(mock);
});

test('Arabic mode renders the Pacers page in RTL with translated copy', async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('mzactive-language-manual', 'ar'); } catch { /* storage blocked */ }
  });
  const mock = await installApiMock(page);
  await page.goto('/pacer.html');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('body')).toHaveClass(/rtl/);
  await expect(page.locator('header .main-nav')).toContainText('المرافقون');
  await expect(page.locator('#pacerEmpty')).toContainText('ملفات أول المرافقين قيد المراجعة.');
  await expect(page.locator('#bookingStatus')).toContainText('طلبك ليس حجزاً مؤكداً');
  assertOfflineSafe(mock);
});

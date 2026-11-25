'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json } = require('./helpers.cjs');

const approvedPacer = {
  id: 'pacer-e2e',
  user_id: 'pacer-user-e2e',
  display_name: 'E2E Approved Pacer',
  city: 'Doha',
  country: 'Qatar',
  languages: ['Arabic', 'English'],
  bio: 'Endurance pacer',
  experience: '10 years',
  distances: ['5K', '10K', 'Half Marathon'],
  paces: { '10K': '4:30', 'Half Marathon': '5:00' },
  availability: 'Weekends',
  status: 'approved',
  verified: true,
  has_photo: false,
};

test('approved Pacers render from the independent directory with a working request link', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/pacers': json({ pacers: [approvedPacer] }) },
  });
  await page.goto('/pacer.html');

  await expect(page.locator('#pacerGrid .pacer-card')).toHaveCount(1);
  await expect(page.locator('#pacerGrid')).toContainText('E2E Approved Pacer');
  await expect(page.locator('#pacerGrid')).toContainText('4:30');
  await expect(page.locator('#pacerGrid')).toContainText('5K');
  await expect(page.locator('#pacerEmpty')).toBeHidden();
  await expect(page.locator('#pacerGrid .pacer-card a.btn')).toHaveAttribute('href', 'pacer.html?provider=pacer-e2e#request');
  assertOfflineSafe(mock);
});

test('the professional empty state appears when no Pacers are approved', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/pacers': json({ pacers: [] }) },
  });
  await page.goto('/pacer.html');

  await expect(page.locator('#pacerGrid .pacer-card')).toHaveCount(0);
  await expect(page.locator('#pacerEmpty')).toContainText('The first pacer profiles are being reviewed.');
  await expect(page.locator('#pacerEmpty strong')).toContainText('No approved Pacers yet.');
  await expect(page.locator('#pacerEmpty a.btn')).toHaveAttribute('href', 'pacer-register.html');
  assertOfflineSafe(mock);
});

test('directory failures show an accurate unavailable state', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/pacers': json({ error: 'service_unavailable' }, 503) },
  });
  await page.goto('/pacer.html');

  await expect(page.locator('#pacerEmpty')).toContainText('Pacer listings are temporarily unavailable.');
  await expect(page.locator('#pacerEmpty a.btn')).toBeVisible();
  assertOfflineSafe(mock);
});

test('preselected Pacer requests use real distances and pacing units', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/pacers/pacer-e2e': json({ pacer: approvedPacer }) },
  });
  await page.goto('/pacer.html?provider=pacer-e2e#request');

  await expect(page.locator('#bookingTitle')).toContainText('Send a request to E2E Approved Pacer');
  await expect(page.locator('#sessionType')).toHaveValue('training');
  await expect(page.locator('#serviceField')).toBeVisible();
  await expect(page.locator('#serviceName')).toHaveValue('training');
  await expect(page.locator('#dateLabel')).toContainText('optional');
  await expect(page.locator('#paceLabel')).toContainText('optional');
  assertOfflineSafe(mock);
});

test('Run IQ promo card is visible and links to the assessment', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/pacers': json({ pacers: [] }) },
  });
  await page.goto('/pacer.html');
  const promo = page.locator('#runiqPromo');
  await expect(promo).toBeVisible();
  await expect(promo).toContainText("What's Your Running Pace?");
  await expect(promo.locator('a.btn')).toHaveAttribute('href', 'https://mzactive.com/run-iq.html');
  assertOfflineSafe(mock);
});

test('Arabic mode renders the Pacers page in RTL with translated copy', async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('mzactive-language-manual', 'ar'); } catch { /* storage blocked */ }
  });
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/pacers': json({ pacers: [] }) },
  });
  await page.goto('/pacer.html');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('body')).toHaveClass(/rtl/);
  await expect(page.locator('#pacerEmpty')).toContainText('ملفات أول المرافقين قيد المراجعة.');
  await expect(page.locator('#pacerEmpty a.btn')).toHaveText('انضم كمنظّم وتيرة الجري');
  assertOfflineSafe(mock);
});

test('Pacer request creates a real independent request', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/pacers/pacer-e2e': json({ pacer: approvedPacer }),
      'POST /api/pacer/requests': json({ request_id: 'pacer-request-e2e', status: 'pending' }, 201),
    },
  });
  await page.goto('/pacer.html?provider=pacer-e2e#request');
  await page.locator('#name').fill('Runner E2E');
  await page.locator('#phone').fill('55555555');
  await page.locator('#distance').fill('10K');
  await page.locator('#pace').fill('05:30');
  await page.locator('#bookingConsent').check();
  await page.locator('#bookingSubmit').click();
  await expect.poll(() => mock.calls.some(c => c.method === 'POST' && c.path === '/api/pacer/requests' && c.body.provider_id === 'pacer-e2e')).toBe(true);
});

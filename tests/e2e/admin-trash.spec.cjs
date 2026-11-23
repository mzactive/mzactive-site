'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE = {
  id: ATHLETE_ID, name: 'Layla Hassan', email: 'layla@example.invalid', city: 'Doha',
  sports: ['running'], goals: '', assignment_status: 'unassigned', active: true,
  onboarding_incomplete: false, last_activity_at: '2026-11-22T10:00:00.000Z',
  registered_at: '2026-11-01T10:00:00.000Z', program_count: 1, booking_count: 2,
};
const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  super_admin: true, account_type: 'admin', dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

function overrides(extra = {}) {
  return {
    'GET /api/me/access': adminAccess,
    'GET /api/admin/athletes': () => json({
      athletes: [ATHLETE], total: 1, q: '', unlinked: [],
      counts: { all: 1, assigned: 0, unassigned: 1, active: 1, inactive: 0, onboarding_incomplete: 0 },
    }),
    'GET /api/admin/trash': () => json({
      accounts: [{
        id: ATHLETE_ID, display_name: ATHLETE.name, email: ATHLETE.email,
        account_type: 'athlete', status_reason: 'Mistaken import',
        deleted_at: '2026-11-23T10:00:00.000Z', deleted_by_email: 'admin@example.invalid',
      }],
      type: 'all', counts: { all: 1, athletes: 1, coaches: 0, pacers: 0 },
    }),
    ['POST /api/admin/accounts/' + ATHLETE_ID + '/trash']: json({ ok: true, undoable: true }),
    ['POST /api/admin/accounts/' + ATHLETE_ID + '/restore']: json({ ok: true, account_status: 'restored' }),
    ...extra,
  };
}

async function open(page, url, extra = {}, language = 'en') {
  if (language === 'ar') {
    await page.addInitScript(() => { try { localStorage.setItem('mzactive-language-manual', 'ar'); } catch {} });
  }
  const mock = await installApiMock(page, { overrides: overrides(extra) });
  await seedSession(page, { storage: 'session' });
  await page.goto(url);
  await expect(page.locator('#workspace')).toBeVisible();
  return mock;
}

test('athlete quick trash confirms, records and offers undo', async ({ page }) => {
  const mock = await open(page, '/admin.html?tab=athletes');
  const card = page.locator('.athlete-card[data-record-id="' + ATHLETE_ID + '"]');
  await expect(card).toBeVisible();
  await card.locator('.quick-menu-trigger').click();
  await card.getByRole('button', { name: 'Move to Trash' }).click();
  const dialog = page.locator('.trash-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Layla Hassan');
  await dialog.locator('input').fill('Mistaken import');
  await dialog.getByRole('button', { name: 'Move to Trash' }).click();
  await expect.poll(() => mock.calls.some(call =>
    call.method === 'POST' && call.path === '/api/admin/accounts/' + ATHLETE_ID + '/trash' && call.body?.reason === 'Mistaken import'
  )).toBe(true);
  const toast = page.locator('.admin-toast');
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => mock.calls.some(call =>
    call.method === 'POST' && call.path === '/api/admin/accounts/' + ATHLETE_ID + '/restore' && call.body?.undo === true
  )).toBe(true);
  assertOfflineSafe(mock);
});

test('Trash section lists removed accounts and restores them', async ({ page }) => {
  const mock = await open(page, '/admin.html?tab=trash');
  await expect(page.locator('#nav [data-nav-tab=trash]')).toHaveAttribute('aria-current', 'true');
  const row = page.locator('.trash-row[data-record-id="' + ATHLETE_ID + '"]');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Layla Hassan');
  await expect(row).toContainText('Mistaken import');
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect.poll(() => mock.calls.some(call =>
    call.method === 'POST' && call.path === '/api/admin/accounts/' + ATHLETE_ID + '/restore'
  )).toBe(true);
  assertOfflineSafe(mock);
});

test('Arabic trash quick action is RTL and translated', async ({ page }) => {
  const mock = await open(page, '/admin.html?tab=athletes', {}, 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const card = page.locator('.athlete-card[data-record-id="' + ATHLETE_ID + '"]');
  await card.locator('.quick-menu-trigger').click();
  await card.getByRole('button', { name: 'نقل إلى المهملات' }).click();
  await expect(page.locator('.trash-dialog')).toContainText('Layla Hassan');
  assertOfflineSafe(mock);
});

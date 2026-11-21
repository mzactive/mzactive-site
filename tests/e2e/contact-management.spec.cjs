'use strict';

const { test, expect } = require('./pw.cjs');
const {
  assertOfflineSafe,
  clickAdminTab,
  installApiMock,
  json,
  seedSession,
} = require('./helpers.cjs');

const COACH_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const adminAccess = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  super_admin: true,
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

function approvedCoach() {
  return {
    id: COACH_ID, provider_type: 'coach', display_name: 'WhatsApp E2E Coach',
    country: 'QA', city: 'Doha', email: 'wa-coach@example.invalid', status: 'approved',
    bio: 'A complete biography for the WhatsApp regression test.',
    specialties_json: '["Running"]', languages_json: '["English"]',
    qualifications: 'Certified', services_json: '["Sessions"]', coaching_mode: 'both',
    program_durations_json: '[1]', public_fields_json: '["profile_photo"]',
    whatsapp_number: '97455555555', has_profile_photo: 0, has_cover: 0,
    profile_complete: 1, updated_at: '2026-11-21T11:00:00.000Z', gallery_slots: '[]',
  };
}

test('coach workspace Contact Management opens a prefilled WhatsApp draft', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'POST /api/me/contacts': json({
        id: 'contact-e2e', status: 'drafted',
        link: 'https://wa.me/97400000000?text=Hello%20MZ%20Active%20Management',
      }, 201),
    },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');

  const panel = page.locator('#coachContactPanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('#coachContactSetup')).toContainText('WhatsApp');

  const whatsapp = panel.locator('#coachContactWhatsapp');
  await expect(whatsapp).toBeEnabled();
  await panel.locator('#coachContactMessage').fill('Please review my profile.');
  await page.evaluate(() => {
    window.__openedLinks = [];
    window.open = (url) => { window.__openedLinks.push(url); return null; };
  });
  await whatsapp.click();

  await expect(panel.locator('#coachContactStatus')).toContainText('Draft saved');
  const opened = await page.evaluate(() => window.__openedLinks);
  expect(opened).toEqual(['https://wa.me/97400000000?text=Hello%20MZ%20Active%20Management']);
  const call = mock.calls.find(c => c.method === 'POST' && c.path === '/api/me/contacts');
  expect(call.query.intent).toBe('prepare');
  expect(call.body.channel).toBe('whatsapp');
  assertOfflineSafe(mock);
});

test('admin coach card opens a WhatsApp draft using the coach registered number', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': adminAccess,
      'GET /api/admin/applications': json({
        providers: [], approved_providers: [approvedCoach()],
        rejected_providers: [], suspended_providers: [], bookings: [],
      }),
      [`POST /api/admin/coaches/${COACH_ID}/contacts`]: () => {
        overrideUsed = true;
        return json({
          id: 'contact-e2e', status: 'drafted', recipient: '97455555555',
          link: 'https://wa.me/97455555555?text=Hello%20WhatsApp%20E2E%20Coach',
        }, 201);
      },
    },
  });
  let overrideUsed = false;
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html');
  await clickAdminTab(page, 'coaches');
  await page.getByRole('button', { name: /^Approved \(1\)$/ }).click();

  const card = page.locator(`.coach-card[data-record-id="${COACH_ID}"]`);
  await expect(card).toBeVisible();
  await card.locator('summary').click();

  const whatsapp = card.getByRole('button', { name: 'Prepare WhatsApp' });
  await expect(whatsapp).toBeVisible();
  await card.locator('.contact-tools textarea').fill('Your weekly plan is ready.');
  await page.evaluate(() => {
    window.__openedLinks = [];
    window.open = (url) => { window.__openedLinks.push(url); return null; };
  });
  await whatsapp.click();
  await expect(page.locator('#notice')).toContainText('Draft saved');

  const opened = await page.evaluate(() => window.__openedLinks);
  expect(opened).toEqual(['https://wa.me/97455555555?text=Hello%20WhatsApp%20E2E%20Coach']);
  expect(overrideUsed).toBe(true);
  const call = mock.calls.find(c => c.method === 'POST' && c.path === `/api/admin/coaches/${COACH_ID}/contacts`);
  expect(call.body.channel).toBe('whatsapp');
  expect(call.body.intent).toBe('prepare');
  assertOfflineSafe(mock);
});

'use strict';

const { test, expect } = require('./pw.cjs');

const APPROVED_PROVIDER = {
  id: '11111111-2222-4333-8444-555555555555',
  display_name: 'Approved E2E Runner',
  city: 'Doha',
  country: 'Qatar',
  specialties: ['Fitness and running'],
  services: [],
  public_fields: ['city', 'specialties'],
};

async function openHomepage(page, lang = 'en') {
  await page.addInitScript((language) => {
    try {
      localStorage.setItem('mzactive-language-manual', language);
      localStorage.setItem('mzactive-join-dialog-seen', '1');
      localStorage.setItem('mza-install-promo-dismissed', '1');
      sessionStorage.setItem('mza-install-promo-dismissed', '1');
    } catch {
      // The assertions do not depend on storage being available.
    }
  }, lang);
  await page.goto('/index.html?momo-verify=1');
  await expect(page.locator('#mz-assistant-toggle')).toBeVisible();
}

test('Momo submits chat history and uses real profiles when the assistant API is unavailable', async ({ page }) => {
  let chatPayload;
  await page.route('**/api/assistant/chat', async (route) => {
    chatPayload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'assistant_unavailable' }),
    });
  });
  await page.route('**/api/providers', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [APPROVED_PROVIDER] }) });
  });
  await openHomepage(page);

  await page.locator('#mz-assistant-toggle').click();
  await page.locator('#mz-assistant-input').fill('Find me an approved running coach in Doha');
  await page.locator('#mz-assistant-send').click();

  await expect(page.locator('#mz-assistant-messages')).toContainText('Here are real, approved MZ Active profiles');
  const profileLink = page.locator('.mz-assistant-provider');
  await expect(profileLink).toHaveCount(1);
  await expect(profileLink).toHaveText(/Approved E2E Runner/);
  await expect(profileLink).toHaveAttribute('href', `/coach.html?id=${APPROVED_PROVIDER.id}`);
  await expect(page.locator('#mz-assistant-messages')).not.toContainText('The assistant is unavailable right now.');

  expect(chatPayload).toBeTruthy();
  expect(chatPayload.message).toBe('Find me an approved running coach in Doha');
  expect(Array.isArray(chatPayload.history)).toBe(true);
  expect(chatPayload.history.length).toBeLessThanOrEqual(4);
});

test('Momo renders approved profiles returned by the Worker with its answer', async ({ page }) => {
  await page.route('**/api/assistant/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer: 'I found real approved profiles for you.',
        providers: [{
          id: APPROVED_PROVIDER.id,
          display_name: APPROVED_PROVIDER.display_name,
          city: APPROVED_PROVIDER.city,
        }],
        source: 'ai-with-directory',
      }),
    });
  });
  await openHomepage(page);

  await page.locator('#mz-assistant-toggle').click();
  await page.locator('#mz-assistant-input').fill('Who can coach me in Doha?');
  await page.locator('#mz-assistant-send').click();

  await expect(page.locator('#mz-assistant-messages')).toContainText('I found real approved profiles for you.');
  await expect(page.locator('.mz-assistant-provider')).toHaveCount(1);
  await expect(page.locator('.mz-assistant-provider')).toHaveAttribute('href', `/coach.html?id=${APPROVED_PROVIDER.id}`);
});

test('Momo fallback copy and links are localized for Arabic RTL', async ({ page }) => {
  await page.route('**/api/assistant/chat', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'assistant_unavailable' }) });
  });
  await page.route('**/api/providers', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [APPROVED_PROVIDER] }) });
  });
  await openHomepage(page, 'ar');

  await page.locator('#mz-assistant-toggle').click();
  await page.locator('#mz-assistant-input').fill('أريد مدرب جري في الدوحة');
  await page.locator('#mz-assistant-send').click();

  await expect(page.locator('#mz-assistant-messages')).toContainText('ملفات معتمدة حقيقية');
  await expect(page.locator('.mz-assistant-provider')).toHaveText(/Approved E2E Runner/);
  await expect(page.locator('#mz-assistant')).toHaveAttribute('dir', 'rtl');
});

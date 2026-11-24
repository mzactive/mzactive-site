'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, fillBookingForm, installApiMock, json } = require('./helpers.cjs');

test('booking form validates required fields and consent before saving', async ({ page }) => {
  const mock = await installApiMock(page, { allowWhatsapp: true });
  await page.goto('/pacer.html#request');

  await expect(page.locator('#bookingSubmit')).toBeEnabled();
  await expect(page.locator('#bookingStatus')).toContainText('not a confirmed booking');

  // Missing required fields: the browser must not submit anything.
  await page.locator('#name').fill('E2E Customer');
  await page.locator('#bookingSubmit').click();
  expect(mock.calls.filter(call => call.path === '/api/bookings')).toEqual([]);

  // Complete fields but missing consent: still no API call.
  await fillBookingForm(page);
  await page.locator('#bookingSubmit').click();
  expect(mock.calls.filter(call => call.path === '/api/bookings')).toEqual([]);

  // Valid, synthetic request: exactly one mocked save and no false confirmation.
  await page.locator('#bookingConsent').check();
  await page.locator('#bookingSubmit').click();
  await expect(page.locator('#bookingStatus')).toContainText('Request saved.');
  await expect(page.locator('#bookingStatus')).toContainText('not a confirmed booking');

  const saves = mock.calls.filter(call => call.method === 'POST' && call.path === '/api/bookings');
  expect(saves).toHaveLength(1);
  expect(saves[0].body.customer_name).toBe('E2E Customer');
  expect(saves[0].body.consent).toBe(true);
  expect(mock.whatsapp).toHaveLength(1);
  expect(mock.whatsapp[0]).toContain('wa.me/97400000000');
  const handoff = decodeURIComponent(mock.whatsapp[0]);
  expect(handoff).toContain('https://mzactive.com/dashboard.html?connection=E2E-CONNECTION-1#myAthletes');
  expect(handoff).not.toContain('E2E-REQUEST-1');
  assertOfflineSafe(mock);
});

test('booking API failure shows a clear error and never opens WhatsApp', async ({ page }) => {
  const mock = await installApiMock(page, {
    allowWhatsapp: true,
    overrides: { 'POST /api/bookings': json({ error: 'intake_paused' }, 503) },
  });
  await page.goto('/pacer.html#request');
  await expect(page.locator('#bookingSubmit')).toBeEnabled();

  await fillBookingForm(page);
  await page.locator('#bookingConsent').check();
  await page.locator('#bookingSubmit').click();

  await expect(page.locator('#bookingStatus')).toContainText('Booking is paused');
  await expect(page.locator('#bookingStatus')).toContainText('not saved or sent');
  expect(mock.calls.filter(call => call.method === 'POST' && call.path === '/api/bookings')).toHaveLength(1);
  expect(mock.whatsapp).toEqual([]);
  assertOfflineSafe(mock);
});

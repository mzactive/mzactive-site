'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const profile = { display_name: 'Pacer Test', status: 'pending', city: 'Doha', country: 'Qatar' };
const entry = '/dashboard.html?next=/pacer-dashboard.html#loginForm';

test('an existing athlete email can register a separate Pacer profile and open it directly', async ({ page }) => {
  let registrationCalls = 0;
  const mock = await installApiMock(page, {
    overrides: {
      'POST /api/pacer/register': ctx => {
        registrationCalls++;
        if (registrationCalls === 1) return json({ error: 'account_already_exists' }, 409);
        expect(ctx.request.headers().authorization).toBe('Bearer fixture-member-token');
        expect(ctx.body.consent).toBe(true);
        return json({ status: 'pending' }, 201);
      },
      'POST /api/auth/login': json({ token: 'fixture-member-token', account_type: 'member', dashboard_path: '/dashboard.html' }),
      'GET /api/pacer/profile': json({ profile }),
    },
  });

  await page.goto('/pacer-register.html');
  for (const [id, value] of Object.entries({
    display_name: profile.display_name, email: 'member@example.invalid',
    password: 'test-password', phone: '55550000', city: profile.city,
  })) await page.locator('#' + id).fill(value);
  await page.locator('#consent').check();
  await page.locator('#submitPacer').click();
  await expect(page).toHaveURL(/\/pacer-dashboard\.html$/);
  await expect(page.locator('#pacerName')).toHaveText(profile.display_name);
  await expect(page.locator('#athleteProfilePanel')).toHaveCount(0);
  expect(registrationCalls).toBe(2);
  assertOfflineSafe(mock);
});

test('the Pacer entry uses the owned pending profile even when the primary account is an athlete', async ({ page }) => {
  await seedSession(page);
  const mock = await installApiMock(page, { overrides: {
    'GET /api/me/access': json({ account_type: 'member', dashboard_path: '/dashboard.html' }),
    'GET /api/pacer/profile': json({ profile }),
  } });
  await page.goto(entry);
  await expect(page).toHaveURL(/\/pacer-dashboard\.html$/);
  await expect(page.locator('#pacerName')).toHaveText(profile.display_name);
  await expect(page.locator('#profileEditor summary')).toBeVisible();
  await expect(page.locator('#applyLink')).toBeHidden();
  assertOfflineSafe(mock);
});

test('a signed-in user without a Pacer profile sees the Pacer application on the Pacer route', async ({ page }) => {
  await seedSession(page);
  const mock = await installApiMock(page);
  await page.goto(entry);
  await expect(page).toHaveURL(/\/pacer-dashboard\.html$/);
  await expect(page.locator('#applyLink')).toBeVisible();
  await expect(page.locator('#pacerContent')).toBeHidden();
  assertOfflineSafe(mock);
});

test('the public Pacers page offers sign-in next to registration and opens the dedicated sign-in screen', async ({ page }) => {
  const mock = await installApiMock(page);
  await page.goto('/pacer.html');
  const signIn = page.getByRole('link', { name: 'Pacer sign-in' });
  await expect(signIn).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join as a Pacer', exact: true })).toHaveAttribute('href', 'pacer-register.html');
  await signIn.click();
  await expect(page.getByRole('heading', { name: 'Pacer sign-in' })).toBeVisible();
  await expect(page.locator('#loginEmail')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create an athlete account' })).toBeHidden();
  assertOfflineSafe(mock);
});

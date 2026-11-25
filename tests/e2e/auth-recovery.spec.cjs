'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json } = require('./helpers.cjs');

/*
 * E2E for the frontend password-recovery UI only.
 *
 * IMPORTANT: every /api/auth/* response below is a LOCAL API MOCK installed by
 * helpers.cjs. No email is sent, no token is real, and no production Worker is
 * contacted. Addresses use the reserved .invalid domain on purpose.
 */
const EMAIL_A = 'account-mock-a@example.invalid';
const EMAIL_B = 'account-mock-b@example.invalid';
const NEW_PASSWORD = 'mock-new-password-2026';
const RESET_TOKEN = 'mock-reset-token-2026';

const CONFIRM_EN = 'If an account exists for this email, a reset link has been sent. Check your inbox.';
const CONFIRM_AR = 'إذا كان هناك حساب بهذا البريد، فقد أُرسل رابط إعادة التعيين. تحقق من صندوق الوارد.';

async function openDialog(page) {
  const trigger = page.locator('[data-forgot-password]').first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.locator('#forgotPasswordDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  return dialog;
}

async function requestReset(page, email, expectedText, expectConfirmation = true) {
  const dialog = await openDialog(page);
  await expect(dialog.locator('input[name="key"]')).toHaveCount(0);
  await dialog.locator('input[name="email"]').fill(email);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.locator('#forgotPasswordStatus')).toContainText(expectedText);
  if (expectConfirmation) await expect(dialog).toHaveAttribute('data-result', 'confirmation');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

for (const pagePath of ['/admin.html', '/dashboard.html']) {
  test(`shared forgot dialog works on ${pagePath} without a recovery key`, async ({ page }) => {
    const mock = await installApiMock(page, {
      overrides: { 'POST /api/auth/forgot-password': json({ ok: true, message: CONFIRM_EN }) },
    });
    await page.goto(pagePath);

    const dialog = await openDialog(page);
    await expect(dialog.locator('input[name="key"]')).toHaveCount(0);
    await expect(dialog.getByText('Recovery key', { exact: false })).toHaveCount(0);
    await expect(dialog.locator('#forgotPasswordClose')).toBeVisible();

    await dialog.locator('input[name="email"]').fill(EMAIL_A);
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.locator('#forgotPasswordStatus')).toContainText(CONFIRM_EN);

    const calls = mock.calls.filter(call => call.path === '/api/auth/forgot-password');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toEqual({ email: EMAIL_A });
    expect(mock.calls.filter(call => call.path === '/api/auth/recover')).toEqual([]);
    assertOfflineSafe(mock);
  });
}

for (const language of ['en', 'ar']) {
  const isArabic = language === 'ar';
  test(`forgot confirmation stays generic in ${language}${isArabic ? ' with RTL layout' : ''}`, async ({ page }) => {
    if (isArabic) {
      await page.addInitScript(() => {
        localStorage.setItem('mzactive-language-manual', 'ar');
      });
    }
    // Local API mocks only: both responses are identical even though the
    // submitted addresses differ, so the UI cannot reveal account existence.
    const mock = await installApiMock(page, {
      overrides: {
        'POST /api/auth/forgot-password': [
          json({ ok: true, message: CONFIRM_EN }),
          json({ ok: true, message: CONFIRM_EN }),
        ],
      },
    });
    await page.goto('/dashboard.html');
    if (isArabic) {
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('body')).toHaveAttribute('dir', 'rtl');
    }

    const expected = isArabic ? CONFIRM_AR : CONFIRM_EN;
    await requestReset(page, EMAIL_A, expected);
    await requestReset(page, EMAIL_B, expected);

    const calls = mock.calls.filter(call => call.path === '/api/auth/forgot-password');
    expect(calls.map(call => call.body.email)).toEqual([EMAIL_A, EMAIL_B]);
    assertOfflineSafe(mock);
  });
}

test('forgot dialog maps rate limits, unavailable recovery and network errors', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'POST /api/auth/forgot-password': [
        json({ error: 'rate_limited' }, 429),
        json({ error: 'recovery_unavailable' }, 503),
        { action: 'abort' },
      ],
    },
  });
  await page.goto('/providers.html');
  await page.locator('#providerSignIn a').click();
  await expect(page).toHaveURL(/\/dashboard\.html#loginForm$/);

  const status = page.locator('#forgotPasswordStatus');
  await requestReset(page, EMAIL_A, 'Too many attempts. Wait a minute and try again.', false);
  await requestReset(page, EMAIL_A, 'Password recovery is not configured.', false);

  const dialog = await openDialog(page);
  await dialog.locator('input[name="email"]').fill(EMAIL_A);
  await dialog.locator('button[type="submit"]').click();
  await expect(status).toContainText('Could not reach the service.');
  await expect(dialog).not.toHaveAttribute('data-result', 'confirmation');

  assertOfflineSafe(mock);
});

test('forgot dialog rejects invalid email locally without calling the API', async ({ page }) => {
  const mock = await installApiMock(page);
  await page.goto('/dashboard.html');
  const dialog = await openDialog(page);
  await dialog.locator('input[name="email"]').fill('not-an-email');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.locator('#forgotPasswordStatus')).toContainText('Enter a valid email address.');
  expect(mock.calls.filter(call => call.path === '/api/auth/forgot-password')).toEqual([]);
  assertOfflineSafe(mock);
});

test('reset page validates mismatched passwords and never uses a key field', async ({ page }) => {
  const mock = await installApiMock(page);
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  }, { key: 'mzactive-provider-session', value: 'mock-stale-token' });
  await page.goto(`/reset-password.html?token=${RESET_TOKEN}`);

  await expect(page.locator('input[name="key"]')).toHaveCount(0);
  await expect(page.getByText('Recovery key', { exact: false })).toHaveCount(0);

  const password = page.locator('#resetPasswordInput');
  await expect(password).toHaveAttribute('minlength', '8');
  await page.locator('[data-password-toggle=resetPasswordInput]').click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.locator('[data-password-toggle=resetPasswordInput]').click();
  await expect(password).toHaveAttribute('type', 'password');

  await password.fill(NEW_PASSWORD);
  await page.locator('#resetConfirmInput').fill(`${NEW_PASSWORD}-different`);
  await page.locator('#resetSubmit').click();
  await expect(page.locator('#resetStatus')).toContainText('The new passwords do not match.');
  expect(mock.calls.filter(call => call.path === '/api/auth/reset-password')).toEqual([]);
  assertOfflineSafe(mock);
});

test('successful reset sends the URL token, clears stored sessions and shows sign-in links', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'POST /api/auth/reset-password': json({ ok: true }) },
  });
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  }, { key: 'mzactive-provider-session', value: 'mock-stale-token' });
  await page.goto(`/reset-password.html?token=${RESET_TOKEN}`);

  await page.locator('#resetPasswordInput').fill(NEW_PASSWORD);
  await page.locator('#resetConfirmInput').fill(NEW_PASSWORD);
  await page.locator('#resetSubmit').click();

  await expect(page.locator('#resetSuccess')).toBeVisible();
  await expect(page.locator('#resetStatus')).toContainText('Password updated. Sign in again.');
  await expect(page.locator('#resetSuccess a[href="dashboard.html"]')).toBeVisible();
  await expect(page.locator('#resetSuccess a[href="providers.html"]')).toBeVisible();
  await expect(page.locator('#resetPasswordForm')).toBeHidden();

  const calls = mock.calls.filter(call => call.path === '/api/auth/reset-password');
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toEqual({ token: RESET_TOKEN, new_password: NEW_PASSWORD });
  const stored = await page.evaluate(() => ({
    local: localStorage.getItem('mzactive-provider-session'),
    session: sessionStorage.getItem('mzactive-provider-session'),
  }));
  expect(stored).toEqual({ local: null, session: null });
  assertOfflineSafe(mock);
});

test('reset page maps an invalid token without claiming success', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'POST /api/auth/reset-password': json({ error: 'invalid_token' }, 400) },
  });
  await page.goto(`/reset-password.html?token=${RESET_TOKEN}`);
  await page.locator('#resetPasswordInput').fill(NEW_PASSWORD);
  await page.locator('#resetConfirmInput').fill(NEW_PASSWORD);
  await page.locator('#resetSubmit').click();

  await expect(page.locator('#resetStatus')).toContainText('This reset link is invalid or has expired.');
  await expect(page.locator('#resetSuccess')).toBeHidden();
  expect(mock.calls.filter(call => call.path === '/api/auth/reset-password')).toHaveLength(1);
  assertOfflineSafe(mock);
});

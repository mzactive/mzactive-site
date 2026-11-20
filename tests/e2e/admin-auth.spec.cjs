'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json } = require('./helpers.cjs');

// All values below are deliberately fake. No real administrator email,
// password, setup key or recovery key is ever typed or stored.
const FAKE_EMAIL = 'invalid-admin@example.invalid';
const FAKE_PASSWORD = 'not-a-real-password';
const FAKE_RECOVERY_KEY = 'not-a-real-recovery-key';

test('invalid admin sign-in maps to a clear error and keeps the workspace locked', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'POST /api/auth/login': json({ error: 'invalid_credentials' }, 401) },
  });
  await page.goto('/admin.html');

  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();

  await page.locator('#login input[name=email]').fill(FAKE_EMAIL);
  await page.locator('#loginPassword').fill(FAKE_PASSWORD);

  // Password visibility is a local UI affordance only.
  await page.locator('[data-password-toggle=loginPassword]').click();
  await expect(page.locator('#loginPassword')).toHaveAttribute('type', 'text');
  await page.locator('[data-password-toggle=loginPassword]').click();
  await expect(page.locator('#loginPassword')).toHaveAttribute('type', 'password');

  await page.locator('#login button[type=submit]').click();
  await expect(page.locator('#notice')).toContainText('That email or password is incorrect');
  await expect(page.locator('#workspace')).toBeHidden();

  const attempts = mock.calls.filter(call => call.path === '/api/auth/login');
  expect(attempts).toHaveLength(1);
  expect(attempts[0].body.email).toBe(FAKE_EMAIL);
  const stored = await page.evaluate(() => ({
    session: sessionStorage.getItem('mzactive-provider-session'),
    local: localStorage.getItem('mzactive-provider-session'),
  }));
  expect(stored).toEqual({ session: null, local: null });
  assertOfflineSafe(mock);
});

test('recovery UI rejects mismatched and invalid input without accepting secrets', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'POST /api/auth/recover': json({ error: 'invalid_recovery' }, 400) },
  });
  await page.goto('/admin.html');

  await page.locator('#recoverOpen').click();
  await expect(page.locator('#recover')).toBeVisible();
  await expect(page.locator('#login')).toBeHidden();

  await page.locator('#recover input[name=email]').fill(FAKE_EMAIL);
  await page.locator('#recover input[name=key]').fill(FAKE_RECOVERY_KEY);
  await page.locator('#recoverPassword').fill('invalid-new-password');
  await page.locator('#recover input[name=confirm_password]').fill('different-new-password');
  await page.locator('#recover button[type=submit]').click();

  await expect(page.locator('#notice')).toContainText('passwords do not match');
  expect(mock.calls.filter(call => call.path === '/api/auth/recover')).toEqual([]);

  await page.locator('#recover input[name=confirm_password]').fill('invalid-new-password');
  await page.locator('#recover button[type=submit]').click();

  await expect(page.locator('#notice')).toContainText('email or recovery key is incorrect');
  const attempts = mock.calls.filter(call => call.path === '/api/auth/recover');
  expect(attempts).toHaveLength(1);
  expect(attempts[0].body).toMatchObject({ email: FAKE_EMAIL, key: FAKE_RECOVERY_KEY });

  await page.locator('#recoverCancel').click();
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#recover')).toBeHidden();
  assertOfflineSafe(mock);
});

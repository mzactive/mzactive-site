'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const resetHtml = read('reset-password.html');
const resetJs = read('assets/js/reset-password.js');
const authUi = read('assets/js/auth-ui.js');
const authCss = read('assets/css/auth.css');
const adminHtml = read('admin.html');
const adminJs = read('assets/js/admin.js');
const accountHtml = read('account.html');
const dashboardHtml = read('dashboard.html');
const providersHtml = read('providers.html');

const VERSION = '?v=20261120f';

test('reset-password.html is mobile-first, bilingual and PWA-ready', () => {
  assert.ok(fs.existsSync(path.join(root, 'reset-password.html')));
  assert.match(resetHtml, /name="viewport" content="width=device-width,initial-scale=1(?:,viewport-fit=cover)?"/);
  assert.match(resetHtml, /rel="manifest" href="\/manifest\.json"/);
  assert.match(resetHtml, /apple-touch-icon/);
  assert.match(resetHtml, /pwa-register\.js/);
  assert.match(resetHtml, /assets\/brand\/mzactive-logo\.webp/);
  assert.match(resetHtml, /class="lang-toggle" id="lang"/);
  assert.ok(resetHtml.includes(`auth.css${VERSION}`));
  assert.match(resetHtml, /reset-password\.js\?v=2026112[0-9][a-z]/);
  assert.match(authCss, /#091d21/);
  assert.match(authCss, /#f2b718/);
  assert.match(authCss, /max-width: 640px/);
  assert.match(authCss, /html\[dir="rtl"\]/);
});

test('reset page keeps the normal password-only flow with token handling and toggles', () => {
  assert.match(resetHtml, /data-en="Choose a new password" data-ar="اختر كلمة مرور جديدة"/);
  assert.match(resetHtml, /Password updated\. Sign in again\./);
  assert.match(resetHtml, /تم تحديث كلمة المرور\. سجّل الدخول مجدداً\./);
  assert.match(resetHtml, /data-en="Back to sign in" data-ar="العودة إلى تسجيل الدخول"/);
  assert.equal((resetHtml.match(/minlength="8"/g) || []).length, 2);
  assert.match(resetHtml, /data-password-toggle="resetPasswordInput"/);
  assert.match(resetHtml, /data-password-toggle="resetConfirmInput"/);
  assert.match(resetJs, /URLSearchParams\(location\.search\)\.get\('token'\)/);
  assert.match(resetJs, /\/api\/auth\/reset-password/);
  assert.match(resetJs, /token: tokenValue, new_password: password/);
  assert.match(resetJs, /mzactive-provider-session/);
  assert.match(resetJs, /localStorage, sessionStorage/);
  assert.match(resetHtml, /href="dashboard\.html"/);
  assert.match(resetHtml, /href="providers\.html"/);
  assert.doesNotMatch(resetHtml, /name="key"/);
  assert.doesNotMatch(resetJs, /name="key"|name:\s*['"]key['"]/);
});

test('reset page maps API errors and only shows success after a 200 response', () => {
  for (const code of ['invalid_token', 'invalid_password', 'rate_limited', 'recovery_unavailable']) {
    assert.ok(authUi.includes(code) || resetJs.includes(code), `missing error mapping: ${code}`);
    assert.match(resetJs, new RegExp(code));
  }
  assert.match(resetJs, /if \(response\.ok\) \{[\s\S]*clearAuthStorage\(\)/);
  assert.match(resetJs, /The new passwords do not match\./);
  assert.match(resetJs, /كلمتا المرور الجديدتان غير متطابقتين\./);
  assert.doesNotMatch(resetJs, /Password reset successful|Your password has been reset/i);
});

test('all three login pages load the one shared auth UI and its CSS', () => {
  for (const [name, html] of [
    ['admin.html', adminHtml],
    ['dashboard.html', dashboardHtml],
    ['providers.html', providersHtml],
  ]) {
    assert.ok(html.includes(`auth-ui.js${VERSION}`), name);
    assert.ok(html.includes(`auth.css${VERSION}`), name);
    assert.match(html, /data-forgot-password/, name);
  }
  assert.match(dashboardHtml, /data-en="Forgot password\?" data-ar="هل نسيت كلمة المرور\؟"/);
  assert.match(providersHtml, /data-en="Forgot password\?" data-ar="هل نسيت كلمة المرور\؟"/);
  assert.equal((authUi.match(/id: 'forgotPasswordDialog'/g) || []).length, 1);
  assert.match(authUi, /\/api\/auth\/forgot-password/);
  assert.match(authUi, /'aria-modal': 'true'/);
  assert.match(authUi, /'aria-labelledby': 'forgotPasswordTitle'/);
  assert.match(authUi, /dialog\.addEventListener\('close'/);
  assert.match(authUi, /event\.target === dialog/);
  assert.match(authUi, /emailInput\.focus\(\)/);
});

test('shared dialog is generic, bilingual and never asks for a recovery key', () => {
  assert.match(authUi, /If an account exists for this email, a reset link has been sent\. Check your inbox\./);
  assert.match(authUi, /إذا كان هناك حساب بهذا البريد، فقد أُرسل رابط إعادة التعيين\. تحقق من صندوق الوارد\./);
  assert.match(authUi, /Forgot password\?/);
  assert.match(authUi, /هل نسيت كلمة المرور\؟/);
  for (const code of ['recovery_unavailable', 'rate_limited', 'invalid_email', 'network']) {
    assert.match(authUi, new RegExp(code));
  }
  assert.doesNotMatch(authUi, /name="key"|name:\s*['"]key['"]/);
  assert.doesNotMatch(authUi, /account (does not exist|not found)|No account/i);
  assert.doesNotMatch(authUi, /We have sent an email|Your password has been reset|Password reset successful/i);
  // The confirmation is explicitly conditional, not a claim of real delivery.
  assert.ok(authUi.indexOf("'If an account exists for this email") < authUi.indexOf("'Password reset successful'") || !authUi.includes('Password reset successful'));
});

test('emergency owner recovery lives only in Account Security and is admin-gated', () => {
  assert.doesNotMatch(adminHtml, /emergencyRecovery|auth\/recover|<form id="recover"/);
  assert.doesNotMatch(adminJs, /auth\/recover|\$\('emergencyRecovery'\)/);
  assert.match(adminHtml, /id="forgotPasswordOpen"[^>]*data-forgot-password/);
  const start = accountHtml.indexOf('<details id="emergencyRecovery"');
  const end = accountHtml.indexOf('</details>', start);
  assert.ok(start > -1 && end > start, 'account security emergency details missing');
  const emergency = accountHtml.slice(start, end);
  assert.match(accountHtml, /<details id="emergencyRecovery"[^>]*hidden/);
  assert.match(emergency, /Emergency owner recovery \(offline key only\)/);
  assert.match(emergency, /استعادة مالك الحساب للطوارئ \(مفتاح غير متصل فقط\)/);
  assert.match(emergency, /<form id="recover"/);
  assert.match(emergency, /name="key"/);
  assert.match(accountHtml, /\$\('emergencyRecovery'\)\.hidden\s*=\s*type\s*!==\s*'admin'/);
  assert.match(accountHtml, /api\('\/api\/auth\/recover'/);
  assert.match(authUi, /Older pages used "Forgot your password\?"; normalise to the shared label\./);
  // The normal dialog remains the only forgot-password trigger on the portal.
  assert.doesNotMatch(adminJs, /\$\('forgotPasswordOpen'\)\.onclick/);
});

test('dashboard sign-out calls the logout API before clearing storage', () => {
  assert.match(dashboardHtml, /\/api\/auth\/logout/);
  assert.match(dashboardHtml, /Bearer \$\{current\}/);
  assert.match(dashboardHtml, /localStorage\.removeItem\(key\);sessionStorage\.removeItem\(key\);location\.reload\(\)/);
  assert.ok(dashboardHtml.indexOf('/api/auth/logout') < dashboardHtml.indexOf('localStorage.removeItem(key);sessionStorage.removeItem(key);location.reload()'));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('admin.html');
const js = read('assets/js/admin.js');
const css = read('assets/css/admin.css');

test('admin login and recovery forms are bilingual and keyboard accessible', () => {
  for (const id of ['login', 'recover', 'setup', 'changePassword']) {
    assert.match(html, new RegExp(`<form id="${id}"`));
  }
  assert.match(html, /name="password"[^>]*autocomplete="current-password"/);
  assert.match(html, /name="new_password"[^>]*autocomplete="new-password"/);
  assert.match(html, /name="confirm_password"[^>]*autocomplete="new-password"/);
  assert.equal((html.match(/data-password-toggle=/g) || []).length, 4);
  assert.match(html, /data-en="Show" data-ar="إظهار"/);
  assert.match(html, /data-en="Forgot your password\?" data-ar="هل نسيت كلمة المرور\؟"/);
  assert.match(html, /data-en="Reset admin password" data-ar="إعادة تعيين كلمة مرور المسؤول"/);
  assert.match(css, /\.password-toggle/);
  assert.match(css, /\.link-button/);
});

test('auth failures map to clear English and Arabic messages', () => {
  for (const code of [
    'invalid_credentials', 'unauthorized', 'forbidden', 'rate_limited', 'origin_not_allowed',
    'request_failed', 'connection_error', 'invalid_recovery', 'recovery_unavailable',
    'current_password_incorrect', 'admin_setup_required', 'admin_already_exists',
    'admin_setup_unavailable', 'provider_removed_by_owner', 'invalid_registration', 'intake_paused',
  ]) {
    assert.match(js, new RegExp(`${code}:\\['[^']+','[^']+'\\]`), code);
  }
  assert.match(js, /Could not reach the service\. Check your connection and try again\./);
  assert.match(js, /تعذر الاتصال بالخدمة\. تحقق من اتصالك وحاول مجدداً\./);
  assert.match(js, / administrator email registered for this portal\./);
});

test('admin client reports network failures and invalid responses instead of a generic refresh error', () => {
  assert.match(js, /catch\{throw Error\('connection_error'\)\}/);
  assert.match(js, /r\.status>=500\?'service_unavailable':'request_failed'/);
  assert.match(js, /await r\.json\(\)\}\s*catch\{throw Error\('request_failed'\)\}/);
  assert.match(js, /api\('auth\/recover'/);
  assert.match(js, /api\('auth\/change-password'/);
  assert.match(js, /f\.elements\.new_password\.value!==f\.elements\.confirm_password\.value/);
});

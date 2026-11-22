const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const adminJs = read('assets/js/admin.js');
const adminCss = read('assets/css/admin.css');
const adminHtml = read('admin.html');
const worker = read('backend/worker.js');
const migration = read('backend/migrations/0026_account_management.sql');
const providersHtml = read('providers.html');
const accountHtml = read('account.html');

test('account management is an additive migration with an audit trail', () => {
  assert.match(migration, /ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'/);
  assert.match(migration, /ALTER TABLE users ADD COLUMN status_reason TEXT/);
  assert.match(migration, /ALTER TABLE users ADD COLUMN deleted_at TEXT/);
  assert.match(migration, /ALTER TABLE users ADD COLUMN anonymized_at TEXT/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS account_events/);
  assert.match(migration, /account_events_subject/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|UPDATE users SET/);
  assert.match(worker, /function accountActive\(accountStatus\)/);
  assert.match(worker, /async function recordAccountEvent/);
});

test('admin account endpoints are separate from public athlete profile data', () => {
  assert.match(worker, /path === "\/api\/admin\/accounts"/);
  assert.match(worker, /accountMatch && request\.method === "GET" && !accountMatch\[2\]/);
  assert.match(worker, /\(coach-application\|suspend\|reactivate\|delete\|update\|role\|hide-profile\|restore-profile\)/);
  assert.match(worker, /if \(action === "coach-application"\)/);
  assert.match(worker, /if \(action === "hide-profile" \|\| action === "restore-profile"\)/);
  assert.match(worker, /if \(action === "suspend"\)/);
  assert.match(worker, /if \(action === "reactivate"\)/);
  assert.match(worker, /if \(action === "delete"\)/);
  assert.match(worker, /if \(!isSuperAdmin\(user\)\) return reply\(request, env, \{ error: "admin_required" \}, 403\)/);
  assert.match(worker, /path\.includes\("\/accounts"\)/);
  assert.match(providersHtml, /BUILD YOUR PROFILE/);
  assert.doesNotMatch(providersHtml, /manageAccountSection/);
  assert.doesNotMatch(accountHtml, /manageAccountSection/);
});

test('coach conversion preserves identity, forces onboarding and blocks early approval', () => {
  assert.match(worker, /if \(target\.role !== "provider" \|\| !accountActive\(target\.account_status\)\)/);
  assert.match(worker, /coach_application_exists/);
  assert.match(worker, /INSERT INTO provider_profiles\(id,user_id,provider_type,display_name,country,city,bio,status,submission_state,updated_at,created_at\)/);
  assert.match(worker, /VALUES\(\?,\?,\?,\?,\?,\?,\?,'pending','draft',\?,\?\)/);
  assert.match(worker, /coach_application_opened/);
  assert.match(worker, /if \(status === "approved" && previous\.submission_state === "draft"\)/);
  assert.match(worker, /if \(status === "approved" && !accountActive\(previous\.account_status\)\)/);
});

test('suspension is enforced on every shared access path', () => {
  assert.match(worker, /u\.account_status, u\.is_super_admin FROM sessions s JOIN users u/);
  assert.match(worker, /\(u\.account_status IS NULL OR u\.account_status='active'\)/);
  assert.match(worker, /if \(!accountActive\(user\.account_status\)\) return reply\(request, env, \{ error: "account_unavailable" \}, 403\)/);
  assert.match(worker, /NOT EXISTS\(SELECT 1 FROM users u WHERE u\.id=provider_profiles\.user_id/);
  assert.match(worker, /NOT EXISTS\(SELECT 1 FROM users u WHERE u\.id=provider_profiles\.user_id AND \(u\.profile_visibility<>'public' OR u\.account_status IS NULL OR u\.account_status<>'active'\)\)/);
  assert.match(worker, /function publicVisibility\(alias = "u"\)/);
  assert.match(worker, /profile_visibility='public'/);
  assert.match(worker, /DELETE FROM sessions WHERE user_id=\?/);
  assert.match(worker, /account_suspended/);
  assert.match(worker, /account_reactivated/);
});

test('deletion requires explicit confirmation and preserves related records', () => {
  assert.match(worker, /confirmedEmail !== target\.email\.toLowerCase\(\) \|\| phrase !== "DELETE"/);
  assert.match(worker, /confirmation_required/);
  assert.match(worker, /UPDATE users SET account_status='deleted',status_reason=NULL,profile_visibility='hidden',profile_hidden_at=\?,profile_hidden_reason=\?,deleted_at=\?,anonymized_at=\?,email=\?,password_hash=\?/);
  assert.match(worker, /account_status='deleted',status_reason=NULL,profile_visibility='hidden'/);
  assert.match(worker, /bookings_preserved: true/);
  assert.match(worker, /account_deleted/);
  assert.match(worker, /if \(isSuperAdmin\(target\) \|\| target\.id === user\.id\)/);
  assert.match(worker, /if \(target\.account_status === "deleted"\)/);
  assert.match(worker, /if \(!user \|\| !accountActive\(user\.account_status\)\) return reply\(request, env, generic\)/);
});

test('Manage Account is mounted in both the athlete drawer and coach cards', () => {
  assert.match(adminJs, /manage_account:\['Manage account','إدارة الحساب'\]/);
  assert.match(adminJs, /function mountManageAccount\(host,userId,prefill=\{\},onChanged\)/);
  assert.match(adminJs, /crmAction\(t\(\.\.\.labels\.manage_account\),status/);
  assert.match(adminJs, /mountManageAccount\(body,a\.id,\{name:a\.name,city:a\.city,country:a\.country\}/);
  assert.match(adminJs, /mountManageAccount\(c,p\.user_id,\{name:p\.display_name,city:p\.city,country:p\.country\}/);
  assert.match(adminJs, /dataset\.accountManage='1'/);
  assert.match(adminJs, /Administrative controls only\. Public profile fields are not changed here\./);
});

test('account controls are bilingual, RTL-aware and mobile-sized', () => {
  assert.match(adminJs, /t\('Account status','حالة الدخول'\)|t\('Login status','حالة الدخول'\)/);
  assert.match(adminJs, /t\('Account type','نوع الحساب'\)/);
  assert.match(adminJs, /t\('Bookings retained','الحجوزات المحفوظة'\)/);
  assert.match(adminJs, /t\('Danger Zone — delete account','منطقة الخطر — حذف الحساب'\)/);
  assert.match(adminJs, /t\('Hide public profile','إخفاء الملف العام'\)/);
  assert.match(adminJs, /t\('Restore public profile','استعادة الملف العام'\)/);
  assert.match(adminJs, /t\('Moderation reason','سبب الرقابة'\)/);
  assert.match(adminCss, /\.account-danger-zone\{/);
  assert.match(adminJs, /t\('Type the account email','اكتب بريد الحساب'\)/);
  assert.match(adminCss, /\.account-actions input,\.account-actions select\{min-height:44px/);
  assert.match(adminCss, /@media\(max-width:760px\)\{\.account-actions/);
  assert.match(adminHtml, /id="language"/);
  assert.match(adminJs, /document\.addEventListener\('mzactive:language-change'/);
});

test('account controls are cache-busted and no production identity is hard-coded', () => {
  assert.match(adminHtml, /assets\/js\/admin\.js\?v=20261123b/);
  assert.match(adminHtml, /assets\/css\/admin\.css\?v=20261123b/);
  assert.doesNotMatch(adminJs + worker + migration, /Tamim/i);
});

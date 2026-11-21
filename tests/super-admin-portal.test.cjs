const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const js = read('assets/js/admin.js');
const css = read('assets/css/admin.css');
const worker = read('backend/worker.js');
const migration = read('backend/migrations/0027_super_admin.sql');

test('sidebar exposes the requested management sections', () => {
  for (const tab of ['athletes:', 'coaches:', 'bookings:', 'programs:', 'messages:', 'community:', 'ai:', 'reports:', 'settings:']) {
    assert.match(js, new RegExp(`${tab.replace(':', ':\\s*')}\\[`), tab);
  }
  assert.match(js, /programs:\['Training Programs','برامج التدريب'\]/);
  assert.match(js, /reports:\['Reports & Activity','التقارير والنشاط'\]/);
  assert.match(js, /settings:\['Settings','الإعدادات'\]/);
  assert.match(js, /reports:'management\.audit'/);
  assert.match(js, /managementIsAdmin = access\.super_admin === true/);
});

test('account management includes editing, role changes and audited permission grants', () => {
  assert.match(js, /'account-edit'/);
  assert.match(js, /\+'\/update',\{method:'POST'/);
  assert.match(js, /\+'\/role',\{method:'POST'/);
  assert.match(js, /Grant super administrator status/);
  assert.match(js, /admin\/management\/permissions/);
  assert.match(js, /managementIsAdmin\)\{root\.append/);
  assert.match(css, /\.permission-options/);
  assert.match(css, /\.account-actions \.account-edit/);
});

test('Training Programs and Reports read only backend records', () => {
  assert.match(js, /api\('admin\/programs'\)/);
  assert.match(js, /api\('admin\/reports'\)/);
  assert.match(worker, /requestUrl\.pathname === "\/api\/admin\/programs"/);
  assert.match(worker, /requestUrl\.pathname === "\/api\/admin\/reports"/);
  assert.match(worker, /path\.includes\("\/reports"\)/);
  assert.doesNotMatch(js, /248 athletes|37 coaches/i);
});

test('super-admin migration is additive and preserves existing administrator access', () => {
  assert.match(migration, /ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /UPDATE users SET is_super_admin = 1 WHERE role = 'admin'/);
  assert.match(migration, /ALTER TABLE member_sports_profiles ADD COLUMN whatsapp_number TEXT/);
  assert.match(migration, /ALTER TABLE member_sports_profiles ADD COLUMN country TEXT NOT NULL DEFAULT 'Qatar'/);
  assert.match(worker, /function isSuperAdmin\(user\) \{\s*return Boolean\(user && user\.role === "admin" && user\.is_super_admin === 1\);\s*\}/);
  assert.match(worker, /if \(path === "\/api\/dashboard\/programs" && request\.method === "POST"\) \{\s*const admin=isSuperAdmin\(user\)/);
  assert.match(worker, /Existing admins are marked super admins by migration 0027/);
  assert.match(worker, /admins are limited until a super admin explicitly elevates them/);
  assert.match(worker, /last_super_admin/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('admin.html');
const js = read('assets/js/admin.js');
const css = read('assets/css/admin.css');
const worker = read('backend/worker.js');
const account = read('account.html');

test('Management Portal exposes a notification center instead of install or recovery prompts', () => {
  for (const id of ['notificationsOpen', 'notificationBadge', 'notificationPanel', 'notificationList', 'notificationsClose', 'notificationsMarkAll']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /aria-controls="notificationPanel"/);
  assert.match(html, /data-en-aria-label="Notification center" data-ar-aria-label="مركز الإشعارات"/);
  assert.doesNotMatch(html, /footer-install|pwa-install\.js|mza-install-button|emergencyRecovery|<form id="recover"/);
});

test('the admin client refreshes real counters, badges, read state and record links', () => {
  assert.match(js, /api\('admin\/dashboard'\)/);
  assert.match(js, /api\('admin\/notifications',\{method:'PATCH',body:\{id:item\.id\}\}\)/);
  assert.match(js, /api\('admin\/notifications',\{method:'PATCH',body:\{all:true\}\}\)/);
  assert.match(js, /api\('admin\/messages'\)/);
  assert.match(js, /setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'\)refreshNotifications\(\)\},90000\)/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /paintNotificationBadges\(\)/);
  assert.match(js, /nav-badge/);
  assert.match(js, /badge\.hidden=total<=0/);
  assert.match(js, /data-record-link/);
  assert.match(js, /recordId=targetRecord;go\(targetTab,true\)/);
  assert.match(js, /data-record-id/);
  assert.match(js, /record-focus/);
  assert.match(js, /async function save\([\s\S]{0,200}refreshNotifications\(\)/);
  assert.match(js, /notice\(message,'success'\);render\(\);refreshApplications\(\);refreshNotifications\(\)/);
  assert.match(js, /event\.composedPath\(\)/);
});

test('the overview prioritizes actionable cards and a chronological activity feed', () => {
  assert.match(js, /dashboardCardsFor/);
  for (const label of ['Pending bookings', 'Coach applications', 'Unread messages', 'Community moderation', 'Articles for review', 'AI recommendations']) {
    assert.ok(js.includes(label), label);
  }
  assert.match(js, /ordered=dashboardCardsFor\.filter[\s\S]{0,200}\.sort/);
  assert.match(js, /paintActivity\(root,data\?\.activity\)/);
  assert.match(js, /events\.slice\(0,8\)/);
  assert.match(css, /\.dashboard-grid\{/);
  assert.match(css, /\.dashboard-card\.needs-attention/);
  assert.match(css, /\.activity-list\{/);
});

test('notification and dashboard styles are responsive and RTL-aware', () => {
  assert.match(css, /\.notification-bell\{/);
  assert.match(css, /\.notification-panel\{/);
  assert.match(css, /\.nav-badge\{/);
  assert.match(css, /html\[dir="rtl"\] \.notification-panel/);
  assert.match(css, /@media\(max-width:760px\)\{\.notification-panel\{position:fixed/);
  // The logo rule must not collapse nested notification links to zero height.
  assert.match(css, /\.bar>a\{margin-inline-end:auto;line-height:0\}/);
  assert.match(css, /\.notification-link\{grid-column:1\/-1;font-weight:700;line-height:1\.4/);
});

test('backend notification data is derived from live records and per-manager receipts', () => {
  assert.match(worker, /MANAGEMENT_NOTIFICATION_CATEGORIES/);
  assert.match(worker, /managementNotificationCounts/);
  assert.match(worker, /managementNotificationItems/);
  assert.match(worker, /management_notification_reads/);
  assert.match(worker, /status IN \('received','reviewing'\)/);
  assert.match(worker, /provider_profiles WHERE status='pending'/);
  assert.match(worker, /m\.read_at IS NULL/);
  assert.match(worker, /json_extract\(output_json,'\$\.answer'\) IS NOT NULL/);
  assert.match(worker, /allowedManagementCategories\(user, permissions\)/);
  assert.match(worker, /if \(!categories\.includes\(category\)[\s\S]{0,160}invalid_notification/);
});

test('emergency owner recovery is restricted to Account Security for administrators', () => {
  assert.match(account, /id="security"[^>]*data-en="Security" data-ar="الأمان"/);
  assert.match(account, /<details id="emergencyRecovery"[^>]*hidden/);
  assert.match(account, /\$\('emergencyRecovery'\)\.hidden\s*=\s*type\s*!==\s*'admin'/);
  assert.match(account, /api\('\/api\/auth\/recover'/);
});

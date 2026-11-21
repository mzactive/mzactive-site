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
  assert.doesNotMatch(html, /footer-install|pwa-install(?:-v2)?\.js|mza-install-button|emergencyRecovery|<form id="recover"/);
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
  assert.match(js, /Needs Action','يحتاج إجراءً'/);
  assert.match(js, /AI Recommendations','توصيات الذكاء الاصطناعي'/);
  assert.match(js, /item\.category!=='ai'/);
  assert.match(js, /data-record-id/);
  assert.match(js, /record-focus/);
  assert.match(js, /async function save\([\s\S]{0,200}refreshNotifications\(\)/);
  assert.match(js, /notice\(message,'success'\);render\(\);refreshApplications\(\);refreshNotifications\(\)/);
  assert.match(js, /event\.composedPath\(\)/);
});

test('the portal uses a collapsible sidebar and a live command overview', () => {
  for (const id of ['sidebar', 'sidebarToggle', 'sidebarScrim', 'mobileNavToggle', 'settingsNav', 'portalSubtitle']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /class="portal-shell"/);
  assert.match(html, /assets\/brand\/mzactive-logo-gold\.png/);
  assert.match(css, /\.portal-shell\{display:grid/);
  assert.match(css, /\.portal-shell\.sidebar-collapsed/);
  assert.match(css, /@media\(max-width:980px\)/);
  assert.match(css, /html\[dir="rtl"\] \.portal-sidebar/);
  assert.match(js, /function bindPortalShell\(\)/);
  assert.match(js, /localStorage\.setItem\('mzactive-portal-sidebar-collapsed'/);
  assert.match(js, /mobileNavToggle/);
  assert.match(js, /tabIcons/);
  assert.match(js, /closeMobileNav\(\)/);

  assert.match(js, /dashboardCardsFor/);
  assert.match(js, /command-grid dashboard-grid/);
  assert.match(js, /actionCenter/);
  assert.match(js, /aiOverview/);
  assert.match(js, /businessSnapshot/);
  assert.match(js, /agents\?\.pending/);
  assert.match(js, /snapshot\.registered_athletes/);
  assert.match(js, /snapshot\.approved_providers/);
  assert.match(js, /snapshot\.unlinked_programs/);
  assert.match(js, /data\?\.total/);
  assert.match(js, /api\('admin\/agents'\)/);
  assert.match(js, /const canAi=/);
  assert.match(js, /if\(canAi\(\)\)dashboardCard/);
  assert.match(js, /if\(canAi\(\)\)aiOverview/);
  assert.match(js, /paintActivity\(activity,data\?\.activity,false\)/);
  assert.match(js, /events\.slice\(0,8\)/);
  assert.match(js, /coach-search/);
  assert.match(css, /\.dashboard-grid\{/);
  assert.match(css, /\.dashboard-card\.needs-attention/);
  assert.match(css, /\.activity-list\{/);
  assert.match(css, /\.command-panel\{/);
});

test('notification and dashboard styles are responsive and RTL-aware', () => {
  assert.match(css, /\.notification-bell\{/);
  assert.match(css, /\.notification-panel\{/);
  assert.match(css, /\.nav-badge\{/);
  assert.match(css, /html\[dir="rtl"\] \.notification-panel/);
  assert.match(css, /@media\(max-width:760px\)\{\.notification-panel\{position:fixed/);
  assert.match(css, /body\.notification-open main\{padding-top:calc\(1rem \+ var\(--notification-push,0px\)\)\}/);
  assert.match(css, /#notificationList\{flex:1 1 auto;min-height:0;overflow-y:auto/);
  assert.match(css, /\.notification-panel footer\{flex:0 0 auto/);
  assert.match(js, /function positionNotificationPanel\(\)/);
  assert.match(js, /window\.innerWidth-rect\.right/);
  assert.match(js, /window\.innerHeight-top-12/);
  assert.match(js, /window\.addEventListener\('resize'/);
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

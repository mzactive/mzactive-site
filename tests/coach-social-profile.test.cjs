'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('coach directory uses portrait-led cards with real details and no emojis', () => {
  const html = read('coaches.html');
  assert.match(html, /\.grid\{display:grid;grid-template-columns:repeat\(3,/);
  const css = read('assets/css/coach-directory.css');
  assert.match(css, /\.card\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.photo\s*\{\s*width: 100%/);
  assert.match(html, /object-fit:cover;object-position:center top/);
  assert.match(html, /verified-badge/);
  assert.match(html, /addFact\('pin'/);
  assert.match(html, /addFact\('clock'/);
  assert.match(html, /addFact\('globe'/);
  assert.match(html, /addFact\('list'/);
  assert.match(html, /'View Profile'/);
  assert.match(html, /request.href=view.href\+'&contact=coaching'/);
  assert.doesNotMatch(html, /🏃|🏁|📍|MZ ACTIVE APPROVED/);
});

test('homepage featured coaches use the same compact horizontal design', () => {
  const html = read('index.html');
  const js = read('assets/js/homepage.js');
  assert.match(html, /\.coach-info\{display:grid/);
  assert.match(html, /\.coach-verified\{display:inline-flex/);
  assert.match(html, /\.coach-card-photo,\.coach-card-photo-placeholder\{width:88px!important;height:118px!important/);
  assert.match(html, /width:72px!important;height:96px!important/);
  assert.match(js, /const info = node\('div', 'coach-info'\)/);
  assert.match(js, /icon\('pin'/);
  assert.match(js, /icon\('clock'/);
  assert.match(js, /icon\('globe'/);
  assert.match(js, /icon\('list'/);
  assert.match(html, /homepage\.js\?v=20261124a/);
  assert.doesNotMatch(js, /⌖|🏃|🏁|📍/);
});

test('public coach profile exposes real stats, follow and social tabs', () => {
  const html = read('coach.html');
  const js = read('assets/js/coach-profile.js');
  const css = read('assets/css/coach-profile.css');
  assert.match(html, /id="profileStats"[^>]*data-user-content/);
  assert.match(html, /id="followPublic"/);
  assert.match(html, /id="profileSocialTabs"[^>]*role="tablist"/);
  for (const tab of ['posts', 'blogs', 'programs', 'about']) {
    assert.match(html, new RegExp(`data-social-tab="${tab}"`));
  }
  for (const panel of ['about', 'posts', 'blogs', 'programs', 'community']) {
    assert.match(html, new RegExp(`data-social-panel="${panel}"`));
  }
  assert.match(html, /id="coachBlogs"/);
  assert.match(html, /id="coachPrograms"/);
  assert.match(js, /function renderProfileStats\(p\)/);
  assert.match(js, /function renderCoachBlogs\(\)/);
  assert.match(js, /api\/blog\/posts\?provider=\$\{encodeURIComponent\(id\)\}/);
  assert.match(js, /function mountSocialTabs\(\)/);
  assert.match(js, /follow\.id = 'followCoach'/);
  assert.match(js, /\/api\/coaches\/\$\{encodeURIComponent\(id\)\}\/follow/);
  assert.match(css, /\.profile-stats\{/);
  assert.match(css, /\.profile-social-tabs \.social-tab\[aria-selected="true"\]/);
  assert.match(html, /coach-profile\.css\?v=20261125-contact-colors/);
  assert.match(html, /coach-profile\.js\?v=[^"]+/);
});

test('public blog feed can scope articles to one approved coach provider', () => {
  const worker = read('backend/worker.js');
  assert.match(worker, /params\.get\("provider"\)/);
  assert.match(worker, /\(\?='' OR b\.provider_id=\?\)/);
  assert.match(worker, /bind\(slug,slug,provider,provider\)/);
});

test('private coach profile uses a vertical dashboard list, create menu and FB-style tabs', () => {
  const html = read('dashboard.html');
  const dashboardJs = read('assets/js/coach-dashboard.js');
  const socialJs = read('assets/js/coach-social-dashboard.js');
  const css = read('assets/css/workspace.css');
  const menu = read('assets/js/account-menu.js');
  assert.match(html, /id="myProfilePanel"[^>]*class="panel my-profile-panel/);
  for (const id of ['ownCover', 'ownChangeCover', 'ownCoverInput', 'ownPortrait', 'ownChangePhoto', 'ownStats', 'openCoachDashboard', 'createMenuWrap', 'openCoachSettings', 'ownProfileTabs']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  for (const action of ['post', 'blog', 'photo', 'program']) {
    assert.match(html, new RegExp(`data-create="${action}"`));
  }
  for (const section of ['overview', 'posts', 'blogs', 'programs', 'about']) {
    assert.match(html, new RegExp(`data-section="${section}"`));
  }
  for (const label of ['My Athletes', 'Coaching Requests', 'Training Programs', 'Program History', 'Coaching Statistics', 'Messages & Notifications', 'My Posts & Blogs', 'Settings']) {
    assert.match(dashboardJs, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(read('assets/js/coach-strava-nav.js'), /coachTopNav/);
  assert.match(read('assets/js/coach-strava-nav.js'), /coachBottomNav/);
  assert.match(dashboardJs, /function focusSection\(key\)/);
  assert.match(dashboardJs, /window\.MZActiveCoachDashboard = \{ sendDialog, focusSection, renderStatistics, settingsDialog \}/);
  assert.match(socialJs, /api\/me\/profile/);
  assert.match(socialJs, /api\/me\/profile\/cover/);
  assert.match(socialJs, /api\/me\/profile\/photo/);
  assert.match(socialJs, /focusSection\('posts'\)/);
  assert.match(css, /\.coach-vertical-nav\{display:grid!important/);
  assert.match(css, /\.my-profile-panel \.create-menu-list/);
  assert.match(html, /coach-social-dashboard\.js\?v=20261125a/);
  assert.match(html, /workspace\.css\?v=20261124e/);
  assert.match(menu, /dashboard\.html#myProfile/);
});

test('program delivery can be started in one tap from an active athlete', () => {
  const js = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../assets/js/coach-dashboard.js'), 'utf8');
  assert.match(js, /sendDialog\(null, 'mzactive', a\.id\)/);
  assert.match(js, /let selected = preselectedAthlete \|\| ''/);
  assert.match(js, /confirm\.disabled = c === 'mzactive' \? !selected/);
});

test('private profile shows a real following count from the authenticated API', () => {
  const js = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../assets/js/coach-social-dashboard.js'), 'utf8');
  const worker = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../backend/worker.js'), 'utf8');
  assert.match(js, /api\('\/api\/me\/following\/count'\)/);
  assert.match(js, /t\('Following', 'متابَعون'\)/);
  assert.match(worker, /path === "\/api\/me\/following\/count"/);
  assert.match(worker, /SELECT COUNT\(\*\) AS count FROM user_follows WHERE follower_user_id=\?/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('coach discovery cards use vertical photos, real statistics and compact actions', () => {
  const html = read('coaches.html');
  assert.match(html, /\.photo\{aspect-ratio:3\/4/);
  assert.match(html, /object-position:center 18%/);
  assert.match(html, /make\('div','stat-row'\)/);
  assert.match(html, /addStat\(p\.follower_count/);
  assert.match(html, /addStat\(visible\.has\('experience_years'\)\?p\.experience_years:null/);
  assert.match(html, /'View Profile'/);
  assert.match(html, /'Send Request ↗'/);
  assert.doesNotMatch(html, /Math\.random/);
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
  assert.match(html, /coach-profile\.css\?v=20261124a/);
  assert.match(html, /coach-profile\.js\?v=20261124a/);
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
  for (const section of ['posts', 'blogs', 'programs', 'community', 'about']) {
    assert.match(html, new RegExp(`data-section="${section}"`));
  }
  for (const label of ['My Athletes', 'Coaching Requests', 'Training Programs', 'Program History', 'Coaching Statistics', 'Messages & Notifications', 'My Posts & Blogs', 'Settings']) {
    assert.match(dashboardJs, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(dashboardJs, /coach-quick-actions coach-vertical-nav/);
  assert.match(dashboardJs, /function focusSection\(key\)/);
  assert.match(dashboardJs, /window\.MZActiveCoachDashboard = \{ sendDialog, focusSection, renderStatistics \}/);
  assert.match(socialJs, /api\/me\/profile/);
  assert.match(socialJs, /api\/me\/profile\/cover/);
  assert.match(socialJs, /api\/me\/profile\/photo/);
  assert.match(socialJs, /focusSection\('posts'\)/);
  assert.match(css, /\.coach-vertical-nav\{display:grid!important/);
  assert.match(css, /\.my-profile-panel \.create-menu-list/);
  assert.match(html, /coach-social-dashboard\.js\?v=20261124b/);
  assert.match(html, /workspace\.css\?v=20261124d/);
  assert.match(menu, /dashboard\.html#myProfile/);
});

test('program delivery can be started in one tap from an active athlete', () => {
  const js = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../assets/js/coach-dashboard.js'), 'utf8');
  assert.match(js, /sendDialog\(null, 'mzactive', a\.id\)/);
  assert.match(js, /let selected = preselectedAthlete \|\| ''/);
  assert.match(js, /confirm\.disabled = !selected/);
});

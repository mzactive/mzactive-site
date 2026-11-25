'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('private athlete profile reuses owner-only sports profile data and keeps programs visible', () => {
  const html = read('dashboard.html');
  const js = read('assets/js/athlete-profile.js');
  const css = read('assets/css/workspace.css');
  for (const id of ['athleteProfilePanel', 'athleteAvatar', 'athletePortrait', 'athleteName', 'athleteMeta', 'athleteGoals', 'athleteStats', 'athleteProfileTabs', 'athleteProgramsPanel', 'athleteCommunityPanel', 'athleteAboutPanel']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  for (const tab of ['programs', 'community', 'about']) {
    assert.match(html, new RegExp(`data-athlete-tab="${tab}"`));
  }
  assert.match(html, /href="community\.html#sportsProfileSection"/);
  assert.match(js, /api\('\/api\/me\/sports-profile'\)/);
  assert.match(js, /\/api\/me\/sports-profile\/photo/);
  assert.match(js, /if \(!data \|\| data\.role !== 'member'\) return/);
  assert.match(js, /completed_at/);
  assert.match(css, /\.athlete-profile-panel \.athlete-identity/);
  assert.match(html, /athlete-profile\.js\?v=20261125a/);
  assert.match(html, /workspace\.css\?v=20261124e/);
});

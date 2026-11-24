'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('community feed uses FB-style tabs, a composer and post sharing', () => {
  const html = read('community.html');
  const js = read('assets/js/community-social.js');
  const feed = read('assets/js/community-feed.js');
  for (const tab of ['feed', 'groups', 'blogs', 'challenges']) {
    assert.match(html, new RegExp(`data-feed-tab="${tab}"`));
  }
  for (const action of ['photo', 'video', 'event', 'program']) {
    assert.match(html, new RegExp(`data-compose="${action}"`));
  }
  assert.match(html, /id="fbComposerText"/);
  assert.match(html, /id="communityBlogs"[^>]*data-feed-panel="blogs"/);
  assert.match(js, /api\/blog\/posts/);
  assert.match(js, /data-feed-tab/);
  assert.match(feed, /actionButton\(t\('Share', 'مشاركة'\)/);
  assert.match(html, /community-social\.js\?v=20261124a/);
});

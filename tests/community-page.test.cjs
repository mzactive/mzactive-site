const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'community.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const signup = fs.readFileSync(path.join(root, 'community-signup.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/js/community-feed.js'), 'utf8');
const groups = fs.readFileSync(path.join(root, 'assets/js/community-groups.js'), 'utf8');

test('community page uses the real feed, media and sports profile API', () => {
  assert.match(html, /assets\/js\/api-base\.js/);
  assert.match(html, /id="feedList"/);
  assert.match(html, /id="postForm"/);
  assert.match(html, /id="sportsForm"/);
  assert.match(js, /\/community\/posts/);
  assert.match(js, /\/community\/posts\/\$\{[^}]+\}\/photos/);
  assert.match(js, /\/community\/posts\/\$\{[^}]+\}\/like/);
  assert.match(js, /\/community\/posts\/\$\{[^}]+\}\/comments/);
  assert.match(js, /\/community\/posts\/\$\{[^}]+\}\/rsvp/);
  assert.match(js, /\/me\/sports-profile/);
  assert.match(js, /\/me\/sports-profile\/photo/);
  assert.match(js, /share_with_coaches/);
  assert.match(html, /id="sportsPhoto"/);
  assert.match(html, /id="sportsPhotoPreview"/);
  assert.match(html, /id="sportsPhotoUpload"/);
  assert.match(html, /id="sportsPhotoRemove"/);
  assert.match(html, /id="sportsShare"/);
  assert.match(html, /assets\/js\/community-feed\.js\?v=20261125-activity2/);
  assert.match(js, /garmin_public_url/);
  assert.doesNotMatch(html, /Account creation and notifications are not yet active|Preview only: no membership/);
});

test('community feed follows the selected real community without losing the global feed', () => {
  assert.match(html, /assets\/js\/community-groups\.js/);
  assert.match(html, /id="communityDetail"/);
  assert.match(html, /id="communityEventList"/);
  assert.match(html, /id="chatList"/);
  assert.match(html, /id="postAccessNotice"/);
  assert.match(js, /mzactive:community-change/);
  assert.match(js, /mzactive:community-refresh/);
  assert.match(js, /\/communities\/\$\{encodeURIComponent\(communityState\.id\)\}\/posts/);
  assert.match(js, /\/communities\/\$\{encodeURIComponent\(communityState\.id\)\}\/posts\/\$\{id\}/);
  assert.match(js, /\/rsvp/);
  assert.match(js, /reportEntity\('post'/);
  assert.match(js, /method: 'PATCH'/);
  assert.match(js, /method: 'DELETE'/);
  assert.match(groups, /window\.MZActiveCommunity/);
  assert.match(groups, /\/api\/communities\/\$\{community\.id\}\/messages/);
});

test('community page keeps bilingual labels, RTL and responsive layout', () => {
  assert.match(html, /assets\/js\/language-preference\.js/);
  assert.match(html, /assets\/js\/site-language\.js/);
  assert.match(html, /data-en=/);
  assert.match(html, /data-ar=/);
  assert.match(html, /html\[dir="rtl"\]/);
  assert.match(html, /@media\(max-width:700px\)/);
  assert.match(js, /language\.get\(\) === 'ar'/);
});

test('community page scripts parse', () => {
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new Function(match[1]);
  new Function(js);
});

test('community opens the activity feed and keeps standard signup and login', () => {
  assert.match(index, /href="community\.html#join"[^>]*data-en="Join the community"/);
  assert.match(html, /href="dashboard\.html\?next=%2Fcommunity\.html#registerForm"/);
  assert.match(html, /href="dashboard\.html\?next=%2Fcommunity\.html#loginForm"/);
  assert.match(html, /id="eventAlertSignup"[^>]*hidden/);
  assert.ok(html.indexOf('id="feed"') < html.indexOf('id="discover"'));
  assert.doesNotMatch(index, /href="community-signup\.html"/);
  assert.match(signup, /http-equiv="refresh" content="0;url=dashboard\.html#registerForm"/);
  assert.match(signup, /window\.location\.href='dashboard\.html#registerForm'/);
});

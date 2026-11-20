const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'community.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/js/community-feed.js'), 'utf8');

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
  assert.match(js, /garmin_public_url/);
  assert.doesNotMatch(html, /Account creation and notifications are not yet active|Preview only: no membership/);
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

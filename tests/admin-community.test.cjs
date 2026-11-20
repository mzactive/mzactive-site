const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

test('admin moderates real community posts, comments and achievements', () => {
  assert.match(js, /community:\['Community','المجتمع'\]/);
  assert.match(js, /api\('admin\/community'\)/);
  assert.match(js, /admin\/community\/posts\/\'\+p\.id/);
  assert.match(js, /admin\/community\/comments\/\'\+c\.id/);
  assert.match(js, /admin\/achievements\/\'\+a\.id/);
  assert.match(js, /p\.has_cover\)photo\(c,p\.id,\'cover\'\)/);
  assert.match(js, /upload\(c,p,\'cover\'/);
});

test('admin publishes and drafts weekly challenges through the live API', () => {
  assert.match(js, /admin\/community\/challenges\',\{body:body\.value\.trim\(\)/);
  assert.match(js, /admin\/community\/challenges\/generate/);
  assert.match(js, /pending_community_posts/);
  assert.match(js, /weekly_challenges/);
  assert.match(js, /Assistant draft|Draft saved for review|حُفظت المسودة للمراجعة/);
});

test('admin community tools remain bilingual and parse', () => {
  assert.match(html, /data-en=/);
  assert.match(html, /data-ar=/);
  assert.match(js, /t\('Awaiting review','بانتظار المراجعة'\)/);
  assert.match(js, /t\('Achievements for review','إنجازات للمراجعة'\)/);
  new Function(js);
});

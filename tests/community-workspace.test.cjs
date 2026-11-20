const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/js/community-workspace.js'), 'utf8');

test('dashboard hosts a community workspace for connections, messages, feedback and analytics', () => {
  assert.match(html, /id="communityWorkspace"/);
  assert.match(html, /assets\/js\/community-workspace\.js/);
  assert.match(html, /mzactive:dashboard-ready/);
  assert.match(js, /\/connections/);
  assert.match(js, /\/connections\/\$\{[^}]+\}\/messages/);
  assert.match(js, /\/me\/achievements/);
  assert.match(js, /\/dashboard\/calendar/);
  assert.match(js, /\/dashboard\/feedback/);
  assert.match(js, /\/dashboard\/notifications/);
  assert.match(js, /\/dashboard\/bookings/);
  assert.match(js, /\/dashboard\/analytics/);
});

test('private workspace respects role checks and bilingual labels', () => {
  assert.match(js, /role === 'provider'/);
  assert.match(js, /role === 'member'/);
  assert.match(js, /status === 'approved'/);
  assert.match(js, /language\.get\(\) === 'ar'/);
  assert.match(html, /data-en=/);
  assert.match(html, /data-ar=/);
});

test('dashboard scripts parse', () => {
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new Function(match[1]);
  new Function(js);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'coach.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/coach-profile.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/js/coach-profile.js'), 'utf8');

test('coach profile keeps the existing dynamic coach route and official MZ Active logo', () => {
  assert.match(html, /assets\/brand\/mzactive-logo\.webp/);
  assert.match(js, /new URLSearchParams\(location\.search\)\.get\('id'\)/);
  assert.match(js, /\/api\/providers\/.*encodeURIComponent\(id\)/);
  assert.match(html, /href="coaches\.html"/);
});

test('profile content is rendered from approved API data and verification is explicit', () => {
  assert.match(js, /fetch\(endpoint/);
  assert.match(js, /p\.verified === true/);
  assert.match(js, /This profile is unavailable or is not publicly approved/);
  assert.doesNotMatch(html, /Omar Al-Haddad|128 Followers|100\+ Athletes Coached/);
});

test('existing booking, image, dashboard and team-management paths are reused', () => {
  assert.match(js, /pacer\.html\?provider=/);
  assert.match(js, /\/api\/me\/profile\/photo/);
  assert.match(js, /\/api\/dashboard/);
  assert.match(html, /dashboard\.html#whatsappTrainingForm/);
  assert.match(html, /dashboard\.html#coachTeams/);
});

test('unsupported community, cover, inbox and analytics claims are disclosed rather than simulated', () => {
  assert.match(html, /Cover-photo uploads need secure image-storage support/);
  assert.match(html, /immediate publishing, event posts and community photo uploads need additional backend support/);
  assert.match(html, /coach-specific booking inbox and status controls are not exposed/);
  assert.match(html, /Followers, reach, post engagement and booking analytics are not tracked/);
});

test('profile is responsive and uses the existing automatic English/Arabic language preference', () => {
  assert.match(html, /assets\/js\/language-preference\.js/);
  assert.match(html, /assets\/js\/site-language\.js/);
  assert.match(html, /data-ar=/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /html\[dir="rtl"\]/);
});

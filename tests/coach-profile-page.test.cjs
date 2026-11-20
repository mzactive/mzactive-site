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
  assert.match(js, /fetchWithTimeout\(endpoint/);
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

test('cover, achievements, community, inbox and analytics use live authenticated API paths', () => {
  assert.match(html, /id="coverPhoto"/);
  assert.match(html, /id="changeCover"/);
  assert.match(html, /id="followCoach"/);
  assert.match(html, /id="achievementsList"/);
  assert.match(html, /id="coachPosts"/);
  assert.match(html, /id="bookingInbox"/);
  assert.match(js, /\/api\/me\/profile\/cover/);
  assert.match(js, /\/api\/community\/posts/);
  assert.match(js, /\/api\/coaches\/.*\/follow/);
  assert.match(js, /\/api\/dashboard\/analytics/);
  assert.match(js, /\/api\/dashboard\/bookings/);
  assert.doesNotMatch(html, /secure image-storage support|need additional backend support|status controls are not exposed|analytics are not tracked/);
});

test('profile is responsive and uses the existing automatic English/Arabic language preference', () => {
  assert.match(html, /assets\/js\/language-preference\.js/);
  assert.match(html, /assets\/js\/site-language\.js/);
  assert.match(html, /data-ar=/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /html\[dir="rtl"\]/);
});

test('profile initialization waits for the DOM and never leaves a loading screen stranded', () => {
  assert.match(js, /const \$ = selector => document\.getElementById\(String\(selector\)\.replace\(\/\^#\/, ''\)\)/);
  assert.match(js, /const ready = callback =>/);
  assert.match(js, /ready\(\(\) => \{/);
  assert.match(js, /\$\('#share'\)\?\.addEventListener/);
  assert.match(js, /fetchWithTimeout\(endpoint/);
  assert.match(js, /whenIdle\(loadCommunityPosts\)/);
  assert.doesNotMatch(js, /\$\('\.|\$\("\./);
  assert.match(html, /assets\/js\/language-preference\.js(\?v=[^"]*)?" defer/);
  assert.match(html, /assets\/js\/coach-profile\.js(\?v=[^"]*)?" defer/);
  assert.match(html, /id="coverPhoto"[^>]*fetchpriority="high"/);
  assert.match(html, /mzactive-coaching-session-960w\.webp/);
});

test('profile skeleton reserves layout and clears busy state when loading finishes', () => {
  assert.doesNotMatch(html, /<article class="profile-page" hidden>/);
  assert.match(html, /<article class="profile-page" aria-busy="true">/);
  assert.match(css, /\.profile-page\[aria-busy="true"\] #name::before\{content:"MZ Active Coach"\}/);
  assert.match(css, /html\[dir="rtl"\] \.profile-page\[aria-busy="true"\] #name::before\{content:"مدرب MZ Active"\}/);
  assert.match(js, /q\('\.profile-page'\)\.setAttribute\('aria-busy', 'false'\)/);
  assert.match(css, /\.load-notice\{position:fixed/);
  assert.match(html, /assets\/css\/coach-profile\.css\?v=20261120b/);
  assert.match(html, /assets\/js\/coach-profile\.js\?v=20261120b/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('coach directory searches only on explicit submit and keeps filters recoverable', () => {
  const html = read('coaches.html');
  assert.match(html, /<form[^>]+id="searchForm"/);
  assert.match(html, /id="searchButton"[^>]*type="submit"/);
  assert.match(html, /data-en="Search Coaches" data-ar="ابحث عن مدربين"/);
  assert.match(html, /id="resultsSummary"[^>]*aria-live="polite"/);
  assert.match(html, /id="editSearch"/);
  assert.match(html, /id="resetFilters"/);
  assert.match(html, /id="advancedFilters"/);
  assert.doesNotMatch(html, /typeSearch\.addEventListener\('change',loadProviders\)/);
  assert.doesNotMatch(html, /No approved profiles match/);
  assert.doesNotMatch(html, /Training style filtering matches wording stated in a public profile/);
  assert.match(html, /data-filter="all"/);
  assert.match(html, /suggestionsHead/);
});

test('Momo assistance invitation is once per session, dismissible and bilingual', () => {
  const js = read('assets/js/assistant-chat-v2.js');
  assert.match(js, /mzactive:assistant-search-no-results/);
  assert.match(js, /sessionStorage/);
  assert.match(js, /dismissed/);
  assert.match(js, /inviteGreeting/);
  assert.match(js, /ما نوع المدرب أو الرياضة أو الخدمة التي تبحث عنها/);
  assert.match(js, /What kind of coach, sport or service are you looking for/i);
  assert.match(js, /mzactive:assistant-search-no-results/);
  assert.match(js, /coach\.html\?id=/);
  assert.doesNotMatch(js, /Math\.random\(\)/);
});

test('Momo sends chat history from its own state and falls back to real profiles', () => {
  const js = read('assets/js/assistant-chat-v2.js');
  assert.match(js, /let chatHistory = \[\]/);
  assert.match(js, /history: chatHistory\.slice\(-4\)/);
  assert.match(js, /chatHistory\.push\(/);
  assert.doesNotMatch(js, /history: history\.slice/);
  assert.match(js, /showDirectoryFallback/);
  assert.match(js, /appendProviderLinks/);
  assert.match(js, /rateLimited:/);
  assert.match(js, /directoryIntro:/);

  const worker = read('backend/worker.js');
  assert.match(worker, /momoApprovedProviders/);
  assert.match(worker, /momoDirectoryResult/);
  assert.match(worker, /MOMO_PROFILE_BASE/);
  assert.match(worker, /source: "directory"/);
});

test('new sports and professional services are available across public discovery', () => {
  const worker = read('backend/worker.js');
  assert.match(worker, /boxing/);
  assert.match(worker, /kickboxing/);
  const coaches = read('coaches.html');
  for (const value of ['boxing', 'kickboxing', 'service:physiotherapist', 'service:sports_massage_therapist', 'service:nutritionist']) {
    assert.match(coaches, new RegExp(`value="${value}"`));
  }
  const home = read('index.html');
  assert.match(home, /coaches\.html\?sport=boxing/);
  assert.match(home, /coaches\.html\?sport=kickboxing/);
  assert.match(home, /الملاكمة/);
  assert.match(home, /الكيك بوكسينغ/);
});

test('all changed assets carrying behavior changes are version-busted', () => {
  const html = read('coaches.html');
  assert.match(html, /assistant-chat-v2\.js\?v=/);
  assert.match(read('providers.html'), /password-policy\.js\?v=/);
  const admin = read('admin.html');
  assert.match(admin, /admin\.js\?v=20261122e/);
});

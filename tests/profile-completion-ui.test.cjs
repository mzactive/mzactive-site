'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const dashboard = read('dashboard.html');
const providers = read('providers.html');
const adminJs = read('assets/js/admin.js');
const completionJs = read('assets/js/profile-completion.js');
const completionCss = read('assets/css/profile-completion.css');
const worker = read('backend/worker.js');
const sw = read('sw.js');

test('coach dashboard and provider editor load the same versioned completion UI', () => {
  for (const [name, html] of [['dashboard.html', dashboard], ['providers.html', providers]]) {
    assert.ok(html.includes('assets/css/profile-completion.css?v=20261122c'), name + ' CSS include');
    assert.ok(html.includes('assets/js/profile-completion.js?v=20261122c'), name + ' JS include');
  }
  assert.match(dashboard, /id="profileCompleteness"[^>]*data-profile-completion/);
  assert.match(providers, /id="providerCompletion"[^>]*data-profile-completion/);
  assert.ok(completionJs.includes("fetch(API + '/api/me/completeness'"));
  assert.ok(completionJs.includes('data-completion-field'));
  assert.ok(completionJs.includes('providers.html?edit=profile#completion-'));
  assert.ok(providers.includes("new URLSearchParams(location.search).has('edit')"));
  assert.ok(completionCss.includes('profile-completion-fill'));
  assert.ok(completionCss.includes('min-height:44px'));
  assert.ok(completionCss.includes('html[dir=rtl] .profile-completion-track'));
});

test('completion checklist points only at real editor fields', () => {
  const fields = [
    'display_name', 'bio', 'specialties', 'services', 'license_number', 'license_issuer',
    'profile_photo', 'location', 'experience', 'languages', 'whatsapp_number', 'social_links',
  ];
  for (const field of fields) {
    assert.ok(providers.includes(`data-completion-field="${field}"`), `provider editor field ${field}`);
  }
  assert.ok(providers.includes('href="account.html"') || completionJs.includes("'account.html'"));
  assert.ok(completionJs.includes("new Set(['cv', 'qualifications', 'cover_photo'])"));
});

test('completion recalculates after profile loads and after a successful save', () => {
  const refreshes = providers.match(/window\.MZActiveProfileCompletion\?\.refresh\(\)/g) || [];
  assert.ok(refreshes.length >= 2, `expected editor and save refresh hooks, got ${refreshes.length}`);
  assert.ok(completionJs.includes("document.addEventListener('visibilitychange'"));
  assert.ok(completionJs.includes("window.addEventListener('pageshow', refresh)"));
});

test('coach and admin read one shared completion calculation', () => {
  assert.match(worker, /function profileCompletion\(row = \{\}\)/);
  assert.match(worker, /async function ownerCompleteness[\s\S]*profileCompletion\(row\)/);
  assert.match(worker, /completeness: await ownerCompleteness\(env, user\)/);
  assert.match(worker, /completeness: profileCompletion\(profile\)/);
  assert.ok(adminJs.includes("api('admin/coaches/'+encodeURIComponent(p.id)+'/completeness')"));
  assert.ok(adminJs.includes('c.percent+\'%\''));
  assert.ok(completionJs.includes('percent + \'%\''));
});

test('optional qualifications and private CVs do not reduce the completion score', () => {
  assert.doesNotMatch(worker, /required\.push\("qualifications"\)/);
  assert.match(worker, /recommended\.push\("qualifications"\)/);
  assert.match(providers, /one per line; optional, repeatable/);
  assert.match(providers, /Sports CV — optional, private PDF or DOCX/);
  assert.ok(completionJs.includes('Approval and licence verification are handled separately.'));
});

test('installed MZA PWA caches the completion assets in a fresh shell', () => {
  assert.match(sw, /const CACHE = ['"]mza-shell-v9['"]/);
  assert.ok(sw.includes('/assets/css/profile-completion.css?v=20261122c'));
  assert.ok(sw.includes('/assets/js/profile-completion.js?v=20261122c'));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('registration exposes all professional categories and private license verification fields', () => {
  const html = read('providers.html');
  for (const type of ['coach', 'bodybuilding_coach', 'pacer', 'nutritionist', 'physiotherapist', 'sports_massage_therapist']) {
    assert.match(html, new RegExp(`<option value="${type}">`), type);
  }
  assert.match(html, /name="qualifications"/);
  assert.match(html, /name="services"/);
  for (const field of ['certificate_name', 'certificate_issuer', 'certificate_number', 'license_number', 'license_issuer', 'license_country', 'license_expires_on']) {
    assert.match(html, new RegExp(`name="${field}"`), field);
  }
  assert.match(html, /value="credentials"/);
  assert.match(html, /license_details_incomplete|license_number/);
  assert.match(html, /certificate_name:f\.elements\.certificate_name\.value/);
});

test('directory and homepage render category labels and verified credentials safely', () => {
  const directory = read('coaches.html');
  for (const type of ['coach', 'bodybuilding_coach', 'nutritionist', 'physiotherapist', 'sports_massage_therapist']) {
    assert.match(directory, new RegExp(`<option value="${type}"`), type);
  }
  assert.doesNotMatch(directory, /<option value="pacer"/);
  assert.match(directory, /id="searchForm"/);
  assert.match(directory, /id="searchButton"/);
  assert.doesNotMatch(directory, /typeSearch\.addEventListener\('change',loadProviders\)/);
  assert.match(directory, /api\/providers\$\{query\}/);
  assert.match(directory, /professional_category/);
  assert.match(directory, /license_verified/);
  assert.match(directory, /"credentials"/);

  const homepage = read('assets/js/homepage.js');
  assert.match(homepage, /professional_category\?\.ar/);
  assert.match(homepage, /professional_category\?\.en/);

  const profile = read('assets/js/coach-profile.js');
  assert.match(profile, /professional_category\?\.ar/);
  assert.match(profile, /Verified credentials/);
  assert.match(profile, /license_number_masked/);
});

test('booking flow sends category-aware session types and chosen services', () => {
  const html = read('pacer.html');
  for (const type of ['consultation', 'assessment', 'therapy', 'massage', 'nutrition']) {
    assert.match(html, new RegExp(`value="${type}"`), type);
  }
  assert.match(html, /id="serviceField"/);
  assert.match(html, /event_name:serviceName\|\|'MZ Active pacing request'/);
  assert.match(html, /serviceDefaults/);
  assert.match(html, /defaults\[type\]/);
});

test('admin review keeps human approval for professional licenses and suspension', () => {
  const admin = read('assets/js/admin.js');
  assert.match(admin, /nutritionist','physiotherapist','sports_massage_therapist/);
  assert.match(admin, /license_verified/);
  assert.match(admin, /license_review_note/);
  assert.match(admin, /pending_community_comments/);
  assert.match(admin, /Six specialist agents take turns/);
  assert.match(admin, /restore\?'approved':'suspended'/);
  assert.match(admin, /b\.service_name/);
});

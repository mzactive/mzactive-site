const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const adminJs = read('assets/js/admin.js');
const adminCss = read('assets/css/admin.css');
const providerJs = read('providers.html');
const profileJs = read('assets/js/coach-profile.js');
const worker = read('backend/worker.js');

test('Management Portal keeps a branded fallback until a portrait actually decodes', () => {
  // Regression: the old renderer appended an <img> with no src, so the browser
  // painted its broken-image icon and the coach saw the alt text "Coach photo".
  assert.match(adminJs, /Never paint a src-less <img>/);
  assert.match(adminJs, /const slot=node\('span',null,'photo-slot'\),fallback=avatar\(who\)/);
  assert.match(adminJs, /fallback\.setAttribute\('role','img'\)/);
  assert.match(adminJs, /fallback\.setAttribute\('aria-label',t\('Photo unavailable for '/);
  assert.match(adminJs, /img\.hidden=true/);
  assert.match(adminJs, /if\(ok&&img\.naturalWidth>0\)\{slot\.replaceChildren\(img\);img\.hidden=false\}/);
  assert.match(adminJs, /img\.onload=\(\)=>finish\(true\)/);
  assert.match(adminJs, /img\.decode\(\)\.then\(\(\)=>finish\(true\)\)/);
  assert.match(adminCss, /\.photo-slot\{/);
  assert.match(adminCss, /\.avatar\{/);
});

test('Management Portal upload guidance and errors are explicit and bilingual', () => {
  assert.match(adminJs, /JPG, PNG or WebP · maximum 1 MB\. An invalid file leaves the existing photo unchanged\./);
  assert.match(adminJs, /The file is larger than 1 MB\. Choose a smaller image\./);
  assert.match(adminJs, /Choose a JPG, PNG or WebP image\./);
  assert.match(adminJs, /photo_too_large:\['Use a JPG, PNG or WebP image up to 1 MB\./);
  assert.match(adminJs, /invalid_photo:\['Choose a valid JPG, PNG or WebP image\. The existing photo was kept\./);
  assert.match(adminJs, /photo_not_found:\['No photo has been uploaded for this coach\./);
});

test('provider portal explains photo limits and preserves existing files on failure', () => {
  assert.match(providerJs, /id="photoFileInfo" class="fine" aria-live="polite"/);
  assert.match(providerJs, /function photoErrorMessage\(code\)/);
  assert.match(providerJs, /photo_too_large:'The photo is larger than 1 MB\. Your existing photo was kept\./);
  assert.match(providerJs, /invalid_photo:'Choose a valid JPG, PNG or WebP photo\. Your existing photo was kept\./);
  assert.match(providerJs, /The photo is larger than 1 MB\. Choose a smaller file; your existing photo was not changed\./);
  assert.match(providerJs, /JPG, PNG or WebP photo from your phone or computer \(maximum 1 MB\)/);
  assert.match(providerJs, /photoError=photoErrorMessage\(err\.message\)/);
});

test('public coach profile uses stored images with safe local fallbacks', () => {
  assert.ok(profileJs.includes("else if (p.has_cover) cover.src = `${endpoint}/cover?v=${encodeURIComponent(p.cover_updated_at || '')}`;"));
  assert.ok(profileJs.includes("else cover.removeAttribute('src');"));
  assert.match(profileJs, /cover\.onerror = \(\) => \{[\s\S]{0,160}classList\.add\('no-personal-cover'\)/);
  assert.match(profileJs, /const avatarFallback = \$\('#avatarFallback'\);/);
  assert.match(profileJs, /The photo is larger than 1 MB\. Choose a smaller image; your existing photo was kept\./);
  assert.match(profileJs, /The cover is larger than 1 MB\. Choose a smaller image; your existing cover was kept\./);
  assert.match(profileJs, /Choose a valid JPG, PNG or WebP photo\. Your existing photo was kept\./);
  assert.match(profileJs, /Choose a valid JPG, PNG or WebP cover\. Your existing cover was kept\./);
});

test('photo bytes and timestamps flow from D1 to every admin application list', () => {
  assert.ok(worker.includes('providers\\/([\\w-]{36})\\/photo$'));
  assert.ok(worker.includes('providers\\/([\\w-]{36})\\/cover$'));
  assert.match(worker, /private, no-store/);
  assert.match(worker, /public, max-age=3600/);
  assert.match(worker, /cleanPublicFields\(safeParse\(row\.public_fields_json\)\)\.includes\("profile_photo"\)/);
  assert.ok((worker.match(/profile_photo_updated_at/g) || []).length >= 5);
  assert.ok((worker.match(/AS has_cover/g) || []).length >= 3);
});

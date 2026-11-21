const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('provider portal offers distinct Save Draft and Submit for Approval actions', () => {
  const html = read('providers.html');
  assert.match(html, /Submit for Approval · إرسال للمراجعة/);
  assert.match(html, /name="action" value="draft" formnovalidate>Save Draft · حفظ المسودة/);
  assert.match(html, /const action=e\.submitter\?\.value==='draft'\?'draft':'submit'/);
  assert.match(html, /const body=\{action:action,qualifications:/);
  assert.match(html, /submission_state==='draft'\?'Draft saved/);
  assert.match(html, /'Submitted for approval\./);
});

test('qualifications are repeatable and coaching experience is optional', () => {
  const html = read('providers.html');
  assert.match(html, /Public qualifications and credentials \(one per line; optional, repeatable\)/);
  assert.match(html, /المؤهلات والشهادات المنشورة \(واحدة في كل سطر، اختيارية وقابلة للتكرار\)/);
  assert.match(html, /Biography and coaching experience \(optional\)/);
  assert.match(html, /نبذة وخبرات تدريبية \(اختياري\)/);
  assert.match(html, /name="qualifications" maxlength="1500"/);
});

test('sports CV upload is optional, PDF\/DOCX only and privately reviewed', () => {
  const html = read('providers.html');
  assert.match(html, /name="sports_cv" type="file" accept="application\/pdf,\.pdf,application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document,\.docx"/);
  assert.match(html, /max 5 MB/);
  assert.match(html, /api\/me\/profile\/cv/);
  assert.match(html, /'application\/pdf','application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document'/);
  assert.match(html, /2800000|5000000/);
  assert.match(html, /never shown on your public profile/);
  const admin = read('assets/js/admin.js');
  assert.match(admin, /api\/admin\/providers\/\'\+encodeURIComponent\(p\.id\)\+\'\/cv/);
  assert.match(admin, /View Sports CV \(private\)/);
});

test('submission state and CV storage ship as an additive migration', () => {
  const sql = read('backend/migrations/0025_provider_submission_and_cv.sql');
  assert.match(sql, /ADD COLUMN submission_state TEXT NOT NULL DEFAULT 'submitted'/);
  assert.match(sql, /ADD COLUMN submitted_at TEXT/);
  assert.match(sql, /ADD COLUMN cv_bytes BLOB/);
  assert.match(sql, /ADD COLUMN cv_content_type TEXT/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE provider_profiles SET/);
});

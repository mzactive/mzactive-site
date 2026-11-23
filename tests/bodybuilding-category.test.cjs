const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Bodybuilding Coach is a backend provider category', () => {
  const worker = read('backend/worker.js');
  assert.match(worker, /bodybuilding_coach: \{ en: "Bodybuilding Coach", ar: "مدرب كمال الأجسام"/);
  assert.match(worker, /sessions: \["training", "assessment"\]/);
});

test('Bodybuilding Coach is available in registration and profile editing', () => {
  const providers = read('providers.html');
  assert.equal((providers.match(/<option value="bodybuilding_coach">Bodybuilding Coach · مدرب كمال الأجسام<\/option>/g) || []).length, 2);
});

test('Bodybuilding Coach is available in coach search filters and admin', () => {
  const coaches = read('coaches.html');
  assert.match(coaches, /<option value="bodybuilding_coach" data-en="Bodybuilding Coaches" data-ar="مدربو كمال الأجسام">/);
  assert.match(coaches, /bodybuilding_coach:'مدربو كمال الأجسام'/);
  assert.match(coaches, /bodybuilding_coach:'Bodybuilding Coaches'/);
  assert.match(read('assets/js/admin.js'), /bodybuilding_coach:\['Bodybuilding Coach','مدرب كمال الأجسام'\]/);
});

test('migration preserves existing provider rows while adding the category', () => {
  const sql = read('backend/migrations/0037_bodybuilding_coach_category.sql');
  assert.match(sql, /provider_type IN \([^)]*'bodybuilding_coach'\)/);
  assert.match(sql, /INSERT INTO provider_profiles_new SELECT \* FROM provider_profiles/);
  assert.match(sql, /ALTER TABLE provider_profiles_new RENAME TO provider_profiles/);
  assert.match(sql, /PRAGMA foreign_keys=OFF/);
  assert.match(sql, /PRAGMA foreign_keys=ON/);
});

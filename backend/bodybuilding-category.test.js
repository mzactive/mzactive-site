import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker, { professionalType, professionalLabel } from './worker.js';

function setup(upto = 999) {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/', import.meta.url);
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b));
  for (const file of files) {
    if (parseInt(file) > upto) continue;
    db.exec(readFileSync(new URL(file, dir), 'utf8'));
  }
  const env = {
    DATA_COLLECTION_ENABLED: 'true', ADMIN_EMAILS: 'admin@example.test', ADMIN_SETUP_KEY: 'local-key',
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql); let params = [];
        return {
          bind(...values) { params = values; return this; },
          first() { return stmt.get(...params); },
          all() { return { results: stmt.all(...params) }; },
          run() { return { meta: stmt.run(...params) }; },
        };
      },
      batch(items) {
        db.exec('BEGIN');
        try { const out = items.map((item) => item.run()); db.exec('COMMIT'); return out; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    },
  };
  async function call(path, method = 'GET', body, token, expected = 200, admin = false) {
    const headers = {};
    if (admin) headers['x-admin-setup-key'] = env.ADMIN_SETUP_KEY;
    if (token) headers.authorization = 'Bearer ' + token;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await worker.fetch(new Request('https://example.test/api/' + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    const raw = await response.text();
    assert.equal(response.status, expected, method + ' ' + path + ' → ' + raw);
    return raw ? JSON.parse(raw) : {};
  }
  return { db, env, call };
}

test('Bodybuilding Coach is a recognised professional category', () => {
  assert.equal(professionalType('bodybuilding_coach'), 'bodybuilding_coach');
  assert.equal(professionalLabel('bodybuilding_coach', 'en'), 'Bodybuilding Coach');
  assert.equal(professionalLabel('bodybuilding_coach', 'ar'), 'مدرب كمال الأجسام');
});

test('a Bodybuilding Coach can register, save, be approved and booked', async () => {
  const { db, call } = setup();
  const admin = await call('auth/register', 'POST', {
    email: 'admin@example.test', password: 'local-password-long', consent: true,
  }, null, 201, true);
  const coach = await call('auth/register', 'POST', {
    email: 'bb-coach@example.test', password: 'local-password-long', consent: true,
    provider_type: 'bodybuilding_coach', display_name: 'Bodybuilding Coach', city: 'Doha',
  }, null, 201);
  const profileId = (await call('me/profile', 'GET', undefined, coach.token)).profile.id;
  assert.equal(db.prepare('SELECT provider_type FROM provider_profiles WHERE id=?').get(profileId).provider_type, 'bodybuilding_coach');

  await call('me/profile', 'PUT', {
    provider_type: 'bodybuilding_coach', display_name: 'Bodybuilding Coach', city: 'Doha',
    specialties: ['Bodybuilding'], languages: ['English'], bio: 'Structure and nutrition coaching.',
    services: ['Training plan'], coaching_mode: 'both', program_durations: [1],
  }, coach.token);
  const applications = await call('admin/applications', 'GET', undefined, admin.token);
  const application = applications.providers.find((item) => item.id === profileId);
  await call('admin/providers/' + profileId, 'PATCH', {
    status: 'approved', verified: true, review_version: application.updated_at,
  }, admin.token);

  const publicCoach = (await call('providers?type=bodybuilding_coach')).providers[0];
  assert.equal(publicCoach.display_name, 'Bodybuilding Coach');
  assert.equal(publicCoach.professional_category.en, 'Bodybuilding Coach');
  assert.equal(publicCoach.professional_category.ar, 'مدرب كمال الأجسام');

  await call('bookings', 'POST', {
    provider_id: profileId, customer_name: 'Athlete', customer_phone: '55555555', city: 'Doha',
    session_type: 'training', distance: 'Gym session', goal_summary: 'Bodybuilding plan', consent: true,
  }, null, 201);
});

test('the category migration preserves existing provider rows', () => {
  const before = setup(36);
  const now = new Date().toISOString();
  before.db.prepare("INSERT INTO users(id,email,password_hash,role,created_at) VALUES('u1','a@test','h','provider',?)").run(now);
  before.db.prepare(`INSERT INTO provider_profiles(id,user_id,provider_type,display_name,city,bio,created_at,updated_at)
    VALUES('p1','u1','coach','Existing Coach','Doha','Existing bio',?,?)`).run(now, now);
  const row = before.db.prepare('SELECT * FROM provider_profiles WHERE id=?').get('p1');

  const dir = new URL('./migrations/', import.meta.url);
  const migration = readdirSync(dir).find((file) => parseInt(file) === 37);
  before.db.exec(readFileSync(new URL(migration, dir), 'utf8'));
  const after = before.db.prepare('SELECT * FROM provider_profiles WHERE id=?').get('p1');
  assert.deepEqual(after, row);
  before.db.close();
});

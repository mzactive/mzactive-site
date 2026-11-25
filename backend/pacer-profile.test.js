import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

function setup() {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/', import.meta.url);
  const files = readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b));
  for (const file of files) db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  const env = {
    DATA_COLLECTION_ENABLED: 'true', ADMIN_EMAILS: 'admin@example.test', ADMIN_SETUP_KEY: 'local-test',
    DB: {
      prepare(sql) {
        const statement = db.prepare(sql);
        let args = [];
        return {
          bind(...values) { args = values.map((value) => value instanceof ArrayBuffer ? new Uint8Array(value) : value); return this; },
          first() { return statement.get(...args); },
          all() { return { results: statement.all(...args) }; },
          run() { return { meta: statement.run(...args) }; },
        };
      },
      batch(statements) {
        db.exec('BEGIN');
        try { const result = statements.map((item) => item.run()); db.exec('COMMIT'); return result; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    },
  };
  async function call(path, method = 'GET', body, token, expected = 200) {
    const headers = body?.email === env.ADMIN_EMAILS ? { 'x-admin-setup-key': 'local-test' } : {};
    if (token) headers.authorization = 'Bearer ' + token;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const request = new Request('https://example.test/api/' + path, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, expected, method + ' ' + path + ' -> ' + response.status);
    return response.json();
  }
  return { db, call };
}

const password = 'local-test-password';
const pacerDetails = {
  sports: ['running', 'cycling'],
  services: ['sessions', 'race'],
  distances: ['5K', '10K', 'Half Marathon', '42.2K'],
  running_pace: '4:30/km',
  cycling_speed: '32 km/h',
  achievements: 'Reviewed regional race result',
  personal_bests: '10K — 42:30 (reviewed)',
  hourly_rate_qar: 250,
  race_rate_qar: 600,
  service_areas: 'Doha and Lusail',
  availability: 'Weekday mornings and selected race weekends',
};

function pacerProfile(overrides = {}) {
  return {
    provider_type: 'pacer',
    display_name: 'Approved Pacer',
    country: 'Qatar', city: 'Doha',
    specialties: ['Running', 'Cycling'], languages: ['English', 'Arabic'],
    bio: 'Verified endurance pacing support.',
    qualifications: 'Reviewed pacing qualification',
    services: ['Training sessions', 'Race pacing'],
    coaching_mode: 'both',
    whatsapp_number: '+97455555555', whatsapp_public: true,
    pacer_details: pacerDetails,
    ...overrides,
  };
}

test('Pacer details persist, require review, and publish only after approval', async () => {
  const { db, call } = setup();
  const admin = (await call('auth/register', 'POST', { password, consent: true, email: 'admin@example.test' }, null, 201)).token;
  const token = (await call('auth/register', 'POST', { ...pacerProfile, password, consent: true, email: 'pacer@example.test', provider_type: 'pacer' }, null, 201)).token;
  const id = (await call('me/profile', 'GET', undefined, token)).profile.id;

  await call('me/profile', 'PUT', pacerProfile(), token);
  const stored = db.prepare('SELECT pacer_details_json,status FROM provider_profiles WHERE id=?').get(id);
  assert.equal(stored.status, 'pending');
  assert.equal(JSON.parse(stored.pacer_details_json).running_pace, '4:30/km');
  assert.equal(JSON.parse(stored.pacer_details_json).cycling_speed, '32 km/h');

  const applications = await call('admin/applications', 'GET', undefined, admin);
  const application = applications.providers.find((item) => item.id === id);
  assert.equal(application.provider_type, 'pacer');
  assert.deepEqual(application.pacer_details.sports, ['running', 'cycling']);

  await call('admin/providers/' + id, 'PATCH', {
    status: 'approved', verified: true, review_version: application.updated_at,
  }, admin);

  const [publicPacer] = (await call('providers?type=pacer')).providers;
  assert.equal(publicPacer.provider_type, 'pacer');
  assert.deepEqual(publicPacer.pacer_details.distances, ['5K', '10K', 'Half Marathon', '42.2K']);
  assert.equal(publicPacer.pacer_details.running_pace, '4:30/km');
  assert.equal(publicPacer.pacer_details.cycling_speed, '32 km/h');
  assert.equal(publicPacer.whatsapp_number, '97455555555');

  // Editing public Pacer details returns the profile to the review queue.
  await call('me/profile', 'PUT', pacerProfile({ pacer_details: { ...pacerDetails, running_pace: '4:45/km' } }), token);
  assert.equal(db.prepare('SELECT status FROM provider_profiles WHERE id=?').get(id).status, 'pending');
  assert.equal((await call('providers?type=pacer')).providers.length, 0);
});

test('Pacer details reject incomplete sport metrics and private fields stay gated', async () => {
  const { call } = setup();
  const admin = (await call('auth/register', 'POST', { password, consent: true, email: 'admin@example.test' }, null, 201)).token;
  const token = (await call('auth/register', 'POST', {
    password, consent: true, email: 'pacer-invalid@example.test', provider_type: 'pacer',
  }, null, 201)).token;
  const id = (await call('me/profile', 'GET', undefined, token)).profile.id;

  await call('me/profile', 'PUT', pacerProfile({
    pacer_details: { sports: ['running'], services: ['sessions'], distances: ['5K'] },
  }), token, 400);

  await call('me/profile', 'PUT', pacerProfile({
    public_fields: ['city', 'pacer_details'],
  }), token);
  const application = (await call('admin/applications', 'GET', undefined, admin)).providers.find((item) => item.id === id);
  await call('admin/providers/' + id, 'PATCH', { status: 'approved', review_version: application.updated_at }, admin);
  const [publicPacer] = (await call('providers?type=pacer')).providers;
  assert.deepEqual(publicPacer.pacer_details.sports, ['running', 'cycling']);
  assert.equal(publicPacer.whatsapp_number, null);
  assert.equal(publicPacer.bio, '');
});

test('Admin bookings identify Pacer requests for the Pacers workspace', async () => {
  const { call } = setup();
  const admin = (await call('auth/register', 'POST', { password, consent: true, email: 'admin@example.test' }, null, 201)).token;
  const token = (await call('auth/register', 'POST', {
    password, consent: true, email: 'booking-pacer@example.test', provider_type: 'pacer',
  }, null, 201)).token;
  const id = (await call('me/profile', 'GET', undefined, token)).profile.id;
  await call('me/profile', 'PUT', pacerProfile(), token);
  const application = (await call('admin/applications', 'GET', undefined, admin)).providers.find((item) => item.id === id);
  await call('admin/providers/' + id, 'PATCH', { status: 'approved', review_version: application.updated_at }, admin);

  await call('bookings', 'POST', {
    provider_id: id, customer_name: 'Test athlete', customer_phone: '55555555', city: 'Doha',
    session_type: 'race', service_name: 'Race pacing', distance: '10K', target_pace: '4:30/km',
    goal_summary: 'Race pacing request', consent: true,
  }, null, 201);
  const { bookings } = await call('admin/applications', 'GET', undefined, admin);
  assert.equal(bookings[0].provider_type, 'pacer');
  assert.equal(bookings[0].service_name, 'Race pacing');
});

test('an approved Pacer can manage bookings from the owner inbox', async () => {
  const { call } = setup();
  const token = (await call('auth/register', 'POST', {
    password, consent: true, email: 'pacer-inbox@example.test', provider_type: 'pacer',
  }, null, 201)).token;
  const id = (await call('me/profile', 'GET', undefined, token)).profile.id;
  await call('me/profile', 'PUT', pacerProfile(), token);
  const admin = (await call('auth/register', 'POST', { password, consent: true, email: 'admin@example.test' }, null, 201)).token;
  const application = (await call('admin/applications', 'GET', undefined, admin)).providers.find((item) => item.id === id);
  await call('admin/providers/' + id, 'PATCH', { status: 'approved', review_version: application.updated_at }, admin);
  await call('bookings', 'POST', {
    provider_id: id, customer_name: 'Inbox athlete', customer_phone: '55555555', city: 'Doha',
    session_type: 'race', service_name: 'Race pacing', distance: '10K', target_pace: '4:30/km',
    goal_summary: 'Pacing request', consent: true,
  }, null, 201);

  const { bookings } = await call('dashboard/bookings', 'GET', undefined, token);
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].provider_type, 'pacer');
  assert.equal(bookings[0].service_name, 'Race pacing');
});

test('owners can read and update their saved Pacer details', async () => {
  const { call } = setup();
  const token = (await call('auth/register', 'POST', {
    password, consent: true, email: 'pacer-owner@example.test', provider_type: 'pacer',
  }, null, 201)).token;

  await call('me/profile', 'PUT', pacerProfile(), token);
  const [{ profile }] = await Promise.all([call('me/profile', 'GET', undefined, token)]);
  assert.deepEqual(profile.pacer_details.sports, ['running', 'cycling']);
  assert.equal(profile.pacer_details.running_pace, '4:30/km');
  assert.equal(profile.pacer_details.cycling_speed, '32 km/h');
  assert.equal(profile.pacer_details.race_rate_qar, 600);
});

test('Pacer bookings accept only training and race sessions', async () => {
  const { call } = setup();
  const admin = (await call('auth/register', 'POST', { password, consent: true, email: 'admin@example.test' }, null, 201)).token;
  const token = (await call('auth/register', 'POST', {
    password, consent: true, email: 'pacer-session@example.test', provider_type: 'pacer',
  }, null, 201)).token;
  const id = (await call('me/profile', 'GET', undefined, token)).profile.id;
  await call('me/profile', 'PUT', pacerProfile(), token);
  const application = (await call('admin/applications', 'GET', undefined, admin)).providers.find((item) => item.id === id);
  await call('admin/providers/' + id, 'PATCH', { status: 'approved', review_version: application.updated_at }, admin);

  for (const session_type of ['training', 'race']) {
    await call('bookings', 'POST', {
      provider_id: id, customer_name: 'Test athlete', customer_phone: session_type === 'training' ? '55555555' : '55555556', city: 'Doha',
      session_type, distance: '10K', target_pace: '4:30/km', goal_summary: 'Pacing request', consent: true,
    }, null, 201);
  }
  await call('bookings', 'POST', {
    provider_id: id, customer_name: 'Test athlete', customer_phone: '55555555', city: 'Doha',
    session_type: 'massage', goal_summary: 'Invalid session', consent: true,
  }, null, 400);
});

test('an incomplete Pacer profile can still be saved as a private draft', async () => {
  const { call } = setup();
  const token = (await call('auth/register', 'POST', {
    password, consent: true, email: 'pacer-draft@example.test', provider_type: 'pacer',
  }, null, 201)).token;

  await call('me/profile', 'PUT', pacerProfile({
    pacer_details: { sports: ['running'], services: [] },
    action: 'draft',
  }), token);
  const { profile } = await call('me/profile', 'GET', undefined, token);
  assert.equal(profile.submission_state, 'draft');
  assert.deepEqual(profile.pacer_details.sports, ['running']);
});

test('the Pacer migration is additive and preserves existing provider and booking data', () => {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/', import.meta.url);
  const files = readdirSync(migrations).filter((file) => file.endsWith('.sql'));
  const sorted = files.sort((a, b) => parseInt(a) - parseInt(b));
  for (const file of sorted.filter((file) => parseInt(file) < 31)) {
    db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const now = '2026-11-22T00:00:00.000Z';
  db.prepare(`INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)`)
    .run('legacy-user', 'legacy@example.test', 'hash', 'provider', now);
  db.prepare(`INSERT INTO provider_profiles(id,user_id,provider_type,display_name,city,bio,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run('legacy-profile', 'legacy-user', 'coach', 'Existing Coach', 'Doha', 'Existing approved biography.', 'approved', now, now);
  db.prepare(`INSERT INTO booking_requests(id,provider_id,customer_name,customer_phone,city,goal_summary,consent_at,created_at,session_type,status)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run('legacy-booking', 'legacy-profile', 'Existing Athlete', '55555555', 'Doha', 'Existing request', now, now, 'training', 'accepted');

  const before = {
    profile: db.prepare('SELECT * FROM provider_profiles WHERE id=?').get('legacy-profile'),
    booking: db.prepare('SELECT * FROM booking_requests WHERE id=?').get('legacy-booking'),
  };
  db.exec(readFileSync(new URL(sorted.find((file) => parseInt(file) === 31), migrations), 'utf8'));
  const after = {
    profile: db.prepare('SELECT * FROM provider_profiles WHERE id=?').get('legacy-profile'),
    booking: db.prepare('SELECT * FROM booking_requests WHERE id=?').get('legacy-booking'),
  };

  assert.equal(after.profile.pacer_details_json, '{}');
  for (const [key, value] of Object.entries(before.profile)) assert.deepEqual(after.profile[key], value, key);
  assert.deepEqual(after.booking, before.booking);
  const index = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_provider_profiles_pacer_directory'").get();
  assert.equal(index.name, 'idx_provider_profiles_pacer_directory');
});

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
    if (body !== undefined && !(body instanceof Uint8Array)) headers['content-type'] = 'application/json';
    const request = new Request('https://example.test/api/' + path, {
      method, headers,
      body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
    });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, expected, method + ' ' + path + ' -> ' + response.status);
    return response.json();
  }
  return { db, call };
}

const password = 'local-test-password';
const publicFields = ['city','specialties','languages','bio','experience_years','indicative_rate_qar','profile_photo','social_links','credentials','whatsapp'];

function profileFor(type, overrides = {}) {
  return {
    provider_type: type,
    display_name: `Test ${type}`,
    country: 'Qatar', city: 'Doha', specialties: ['Sport'], languages: ['English'],
    bio: `Licensed ${type} profile`, qualifications: 'Accredited professional qualification',
    services: ['Initial consultation'], coaching_mode: 'both', public_fields: publicFields,
    whatsapp_number: '+97455555555', whatsapp_public: true,
    certificate_name: 'Professional certificate', certificate_issuer: 'Accreditation board',
    certificate_number: 'CERT-100', license_number: 'LIC-98765', license_issuer: 'Qatar licensing board',
    license_country: 'Qatar', license_expires_on: '2028-12-31',
    ...overrides,
  };
}

test('professional categories persist, verify licenses, filter public search and accept category bookings', async () => {
  const { db, call } = setup();
  const signup = { password, consent: true };
  const admin = (await call('auth/register', 'POST', { ...signup, email: 'admin@example.test' }, null, 201)).token;

  for (const type of ['physiotherapist','nutritionist','sports_massage_therapist']) {
    const token = (await call('auth/register', 'POST', { ...signup, email: `${type}@example.test`, provider_type: type }, null, 201)).token;
    const id = (await call('me/profile', 'GET', undefined, token)).profile.id;
    const saved = await call('me/profile', 'PUT', profileFor(type), token);
    assert.ok(Array.isArray(saved.warnings));
    const row = db.prepare('SELECT provider_type,license_status,license_number FROM provider_profiles WHERE id=?').get(id);
    assert.equal(row.provider_type, type);
    assert.equal(row.license_status, 'pending');
    assert.equal(row.license_number, 'LIC-98765');
  }

  const { providers } = await call('admin/applications', 'GET', undefined, admin);
  assert.equal(providers.length, 3);
  const byType = Object.fromEntries(providers.map((item) => [item.provider_type, item]));

  await call('admin/providers/' + byType.physiotherapist.id, 'PATCH', {
    status: 'approved', review_version: byType.physiotherapist.updated_at,
  }, admin, 422);
  await call('admin/providers/' + byType.physiotherapist.id, 'PATCH', {
    status: 'approved', license_verified: true, license_review_note: 'License checked',
    review_version: byType.physiotherapist.updated_at,
  }, admin);

  await call('admin/providers/' + byType.nutritionist.id, 'PATCH', {
    status: 'approved', license_verified: true, review_version: byType.nutritionist.updated_at,
  }, admin);
  await call('admin/providers/' + byType.sports_massage_therapist.id, 'PATCH', {
    status: 'approved', license_verified: true, review_version: byType.sports_massage_therapist.updated_at,
  }, admin);

  const physio = (await call('providers?type=physiotherapist&q=consultation')).providers;
  assert.equal(physio.length, 1);
  assert.equal(physio[0].professional_category.en, 'Physiotherapist');
  assert.equal(physio[0].professional_category.ar, 'أخصائي علاج طبيعي رياضي');
  assert.equal(physio[0].license_verified, true);
  assert.equal(physio[0].credentials.license_number_masked, 'LI•••••65');
  assert.equal(physio[0].credentials.license_number, undefined);

  const massage = (await call('providers?type=sports_massage_therapist')).providers;
  assert.equal(massage.length, 1);
  assert.equal(massage[0].professional_category.en, 'Sports Massage Therapist');

  const booking = await call('bookings', 'POST', {
    provider_id: byType.physiotherapist.id, customer_name: 'Test athlete', customer_phone: '55555555',
    city: 'Doha', session_type: 'therapy', service_name: 'Initial consultation',
    goal_summary: 'Recovery session', consent: true,
  }, null, 201);
  const savedBooking = db.prepare('SELECT session_type,service_name FROM booking_requests WHERE id=?').get(booking.request_id);
  assert.equal(savedBooking.session_type, 'therapy');
  assert.equal(savedBooking.service_name, 'Initial consultation');
  assert.equal(booking.provider_category, 'Physiotherapist');

  await call('bookings', 'POST', {
    provider_id: byType.physiotherapist.id, customer_name: 'Test athlete', customer_phone: '55555555',
    city: 'Doha', session_type: 'race', service_name: 'Initial consultation',
    goal_summary: 'Recovery session', consent: true,
  }, null, 400);
  await call('bookings', 'POST', {
    provider_id: byType.physiotherapist.id, customer_name: 'Test athlete', customer_phone: '55555555',
    city: 'Doha', session_type: 'therapy', service_name: 'Not offered',
    goal_summary: 'Recovery session', consent: true,
  }, null, 400);
});

test('migrations preserve provider references and reject unknown professional types', async () => {
  const { db } = setup();
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.throws(() => db.prepare(`INSERT INTO provider_profiles(id,user_id,provider_type,display_name,country,city,bio,updated_at,created_at)
    VALUES('test-id','missing-user','unknown','Test','Qatar','Doha','Bio','now','now')`).run());
  const columns = db.prepare('PRAGMA table_info(provider_profiles)').all().map((column) => column.name);
  for (const column of ['certificate_name','certificate_issuer','license_number','license_status','license_review_note']) {
    assert.ok(columns.includes(column), column);
  }
  const bookingColumns = db.prepare('PRAGMA table_info(booking_requests)').all().map((column) => column.name);
  assert.ok(bookingColumns.includes('service_name'));
});

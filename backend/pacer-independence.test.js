import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b))) {
    db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const env = {
    DATA_COLLECTION_ENABLED: 'true',
    ADMIN_EMAILS: 'admin@example.test',
    ADMIN_SETUP_KEY: 'local-setup-key',
    PUBLIC_ORIGINS: 'https://mzactive.com',
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql);
        let params = [];
        return {
          bind(...values) { params = values; return this; },
          first() { return stmt.get(...params); },
          async all() { return { results: stmt.all(...params) }; },
          run() { return { meta: stmt.run(...params) }; },
        };
      },
    },
  };
  return { db, env };
}
async function call(env, path, method = 'GET', body, token) {
  const headers = { origin: 'https://mzactive.com' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await worker.fetch(new Request('https://api.example.test/api/' + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  }), env);
  const raw = await response.text();
  return { status: response.status, data: raw ? JSON.parse(raw) : {} };
}
async function tokenFor(db, userId, suffix = 'pacer') {
  const token = `${suffix}-test-token-12345678901234567890`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
    .run(hash, userId, Math.floor(Date.now() / 1000) + 600, new Date().toISOString());
  return token;
}

test('Pacer registration, approval, directory and requests are independent from coaches', async () => {
  const { db, env } = makeEnv();
  const register = await call(env, 'pacer/register', 'POST', {
    display_name: 'Pacer One', email: 'pacer@example.test', password: 'pacer-password',
    phone: '55555555', country: 'Qatar', city: 'Doha', languages: ['Arabic', 'English'],
    bio: 'Pacer bio', experience: '10 years', achievements: 'Marathon finishes',
    distances: ['10K', 'Marathon'], paces: { '10K': '05:30' }, availability: 'Weekends',
    social_links: [], consent: true,
  });
  assert.equal(register.status, 201);
  assert.equal(register.data.status, 'pending');
  const profile = db.prepare('SELECT * FROM pacer_profiles WHERE id=?').get(register.data.id);
  assert.equal(profile.status, 'pending');
  assert.equal(profile.verified, 0);

  const pacerToken = await tokenFor(db, profile.user_id);
  const hidden = await call(env, 'pacers');
  assert.equal(hidden.data.pacers.length, 0, 'unapproved pacers are hidden');

  const admin = await call(env, 'admin/pacers/' + register.data.id, 'PATCH', { status: 'approved', verified: true }, pacerToken);
  assert.equal(admin.status, 403, 'pacer cannot approve own profile');

  const adminUser = 'admin-user';
  db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
    .run(adminUser, env.ADMIN_EMAILS, 'hash', 'admin', new Date().toISOString());
  const adminToken = await tokenFor(db, adminUser, 'admin');
  const approved = await call(env, 'admin/pacers/' + register.data.id, 'PATCH', { status: 'approved', verified: true }, adminToken);
  assert.equal(approved.status, 200);

  const listed = await call(env, 'pacers?city=Doha&distance=Marathon');
  assert.equal(listed.data.pacers.length, 1);
  assert.equal(listed.data.pacers[0].verified, true);

  const access = await call(env, 'me/access', 'GET', undefined, pacerToken);
  assert.equal(access.data.account_type, 'pacer');
  assert.equal(access.data.dashboard_path, '/pacer-dashboard.html');

  const request = await call(env, 'pacer/requests', 'POST', {
    provider_id: register.data.id, customer_name: 'Runner', customer_phone: '55555556',
    event_name: 'Doha 10K', date: '2026-12-01', distance: '10K', target_pace: '05:30',
    location: 'Doha', message: 'Please pace me',
  });
  assert.equal(request.status, 201);
  const ownerRequests = await call(env, 'pacer/requests', 'GET', undefined, pacerToken);
  assert.equal(ownerRequests.data.requests.length, 1);
  const accepted = await call(env, 'pacer/requests/' + request.data.request_id, 'PATCH', { status: 'accepted' }, pacerToken);
  assert.equal(accepted.data.status, 'accepted');

  const other = await call(env, 'pacer/requests/' + request.data.request_id, 'PATCH', { status: 'declined' });
  assert.equal(other.status, 401);
});

test('Pacer registration issues a session for photo upload and accepts flexible request dates', async () => {
  const { db, env } = makeEnv();
  const register = await call(env, 'pacer/register', 'POST', {
    display_name: 'Pacer Two', email: 'pacer2@example.test', password: 'pacer-password',
    phone: '55555557', country: 'Qatar', city: 'Doha', distances: ['10K'],
    paces: { '10K': '05:30' }, consent: true,
  });
  assert.equal(register.status, 201);
  assert.ok(register.data.token, 'registration returns a usable session token');
  assert.equal(register.data.status, 'pending');
  assert.equal(register.data.pacer_status, 'pending');
  assert.ok(register.data.pacer_profile_id);

  // The issued token must authenticate the protected photo endpoint.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  const photo = await worker.fetch(new Request('https://api.example.test/api/pacer/profile/photo', {
    method: 'PUT',
    headers: { origin: 'https://mzactive.com', authorization: `Bearer ${register.data.token}`, 'content-type': 'image/png' },
    body: png,
  }), env);
  assert.equal(photo.status, 200, await photo.text());
  const row = db.prepare('SELECT photo_bytes,photo_content_type FROM pacer_profiles WHERE id=?').get(register.data.pacer_profile_id);
  assert.equal(row.photo_content_type, 'image/png');

  // Approve so public requests can be created.
  const admin = 'admin-user-2';
  db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
    .run(admin, env.ADMIN_EMAILS, 'hash', 'admin', new Date().toISOString());
  const adminToken = await tokenFor(db, admin, 'admin2');
  const approved = await call(env, 'admin/pacers/' + register.data.pacer_profile_id, 'PATCH', { status: 'approved', verified: true }, adminToken);
  assert.equal(approved.status, 200);

  // The UI labels date as optional; the API must accept a flexible request.
  const request = await call(env, 'pacer/requests', 'POST', {
    provider_id: register.data.pacer_profile_id, customer_name: 'Flexible Runner',
    customer_phone: '55555558', event_name: 'Community run', distance: '10K',
    location: 'Doha', message: 'Flexible date',
  });
  assert.equal(request.status, 201);
  assert.equal(request.data.status, 'pending', 'response status matches the stored status');
  const stored = db.prepare('SELECT date,status FROM pacer_requests WHERE id=?').get(request.data.request_id);
  assert.equal(stored.status, 'pending');
  assert.equal(stored.date, '');
});

test('Pacer directory filters by location, pace, availability, language and finishing time', async () => {
  const { db, env } = makeEnv();
  const register = await call(env, 'pacer/register', 'POST', {
    display_name: 'Filter Pacer', email: 'filter@example.test', password: 'pacer-password',
    phone: '55555559', country: 'Qatar', city: 'Doha', languages: ['Arabic'],
    distances: ['10K'], paces: { '10K': '05:00' }, availability: 'Weekends', consent: true,
  });
  assert.equal(register.status, 201);
  const admin = 'filter-admin';
  db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
    .run(admin, env.ADMIN_EMAILS, 'hash', 'admin', new Date().toISOString());
  const adminToken = await tokenFor(db, admin, 'filteradmin');
  const approved = await call(env, `admin/pacers/${register.data.id}`, 'PATCH', { status: 'approved', verified: true }, adminToken);
  assert.equal(approved.status, 200);

  const match = await call(env, 'pacers?city=Doha&distance=10K&pace=05:00&time=00:50&availability=Weekends&language=Arabic');
  assert.equal(match.data.pacers.length, 1);
  const miss = await call(env, 'pacers?time=03:00');
  assert.equal(miss.data.pacers.length, 0);
});

test('identical repeated booking requests are deduplicated but distinct requests are kept', async () => {
  const { db, env } = makeEnv();
  const user = 'booking-user';
  db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
    .run(user, 'booking@example.test', 'hash', 'provider', new Date().toISOString());
  const provider = 'booking-provider';
  db.prepare(`INSERT INTO provider_profiles(id,user_id,provider_type,display_name,city,country,bio,status,program_durations_json,updated_at,created_at)
    VALUES(?,?,?,?,?,?,?,'approved','[]',?,?)`).run(provider, user, 'coach', 'Booking Coach', 'Doha', 'Qatar', 'Coaching bio', new Date().toISOString(), new Date().toISOString());
  const booking = {
    provider_id: provider, customer_name: 'Repeat Runner', customer_phone: '55557777',
    city: 'Doha', session_type: 'training', service_name: 'Coaching',
    goal_summary: 'Repeated request', consent: true,
  };
  const first = await call(env, 'bookings', 'POST', booking);
  assert.equal(first.status, 201);
  const duplicate = await call(env, 'bookings', 'POST', booking);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.error, 'duplicate_request');
  const distinct = await call(env, 'bookings', 'POST', { ...booking, goal_summary: 'A different goal' });
  assert.equal(distinct.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM booking_requests').get().count, 2);
});

test('a requester confirmation email is queued once for coaching and pacing requests', async () => {
  const { db, env } = makeEnv();
  env.RESEND_API_KEY = 'test-only';
  env.EMAIL_FROM = 'MZ Active <no-reply@example.test>';
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options?.body || '{}');
    sent.push({ to: Array.isArray(body.to) ? body.to[0] : body.to, subject: body.subject });
    return new Response(JSON.stringify({ id: 'email-' + sent.length }), { status: 200 });
  };
  try {
    const user = 'email-user';
    db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
      .run(user, 'email-owner@example.test', 'hash', 'provider', new Date().toISOString());
    const provider = 'email-provider';
    db.prepare(`INSERT INTO provider_profiles(id,user_id,provider_type,display_name,city,country,bio,status,program_durations_json,updated_at,created_at)
      VALUES(?,?,?,?,?,?,?,'approved','[]',?,?)`)
      .run(provider, user, 'coach', 'Email Coach', 'Doha', 'Qatar', 'Coaching bio', new Date().toISOString(), new Date().toISOString());
    const booking = await call(env, 'bookings', 'POST', {
      provider_id: provider, customer_name: 'Email Runner', customer_email: 'runner@example.test',
      customer_phone: '55558888', city: 'Doha', session_type: 'training', service_name: 'Coaching',
      goal_summary: 'Email confirmation check', consent: true,
    });
    assert.equal(booking.status, 201);
    assert.ok(sent.some(m => m.to === 'runner@example.test' && /MZ Active request received/.test(m.subject)));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM coach_notification_outbox WHERE event_key=?').get(`booking-request:${booking.data.request_id}`).count, 1);

    const pacer = await call(env, 'pacer/register', 'POST', {
      display_name: 'Email Pacer', email: 'pacer-email@example.test', password: 'pacer-password',
      phone: '55558999', city: 'Doha', consent: true,
    });
    assert.equal(pacer.status, 201);
    const admin = 'email-admin';
    db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
      .run(admin, env.ADMIN_EMAILS, 'hash', 'admin', new Date().toISOString());
    const adminToken = await tokenFor(db, admin, 'emailadmin');
    await call(env, `admin/pacers/${pacer.data.id}`, 'PATCH', { status: 'approved', verified: true }, adminToken);
    const pacing = await call(env, 'pacer/requests', 'POST', {
      provider_id: pacer.data.id, customer_name: 'Email Runner', customer_email: 'runner2@example.test',
      customer_phone: '55558777', event_name: '10K race', distance: '10K', location: 'Doha',
    });
    assert.equal(pacing.status, 201);
    assert.ok(sent.some(m => m.to === 'runner2@example.test' && /pacing request received/i.test(m.subject)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

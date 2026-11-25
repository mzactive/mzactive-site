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

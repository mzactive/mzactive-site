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

async function adminToken(env) {
  const response = await worker.fetch(new Request('https://api.example.test/api/auth/register', {
    method: 'POST', headers: { 'x-admin-setup-key': env.ADMIN_SETUP_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.ADMIN_EMAILS, password: 'samla-campaign-password', consent: true }),
  }), env);
  const data = await response.json();
  // issueSession returns a cookie-like token in the JSON for tests? Use the session table directly.
  return data.token || '';
}

test('SAMLA campaign public state and admin updates are safe and scoped', async () => {
  const { db, env } = makeEnv();
  // Create an admin session directly.
  const stamp = new Date().toISOString();
  const userId = 'admin-user';
  db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(userId, env.ADMIN_EMAILS, 'hash', 'admin', stamp);
  const token = 'samla-admin-token-12345678901234567890';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)).then(b => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''));
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(hash, userId, Math.floor(Date.now() / 1000) + 600, stamp);

  const initial = await call(env, 'public/campaigns/samla');
  assert.equal(initial.status, 200);
  assert.equal(initial.data.active, true);
  assert.equal(initial.data.ends_at, '2026-12-03T06:00:00.000Z');

  const updated = await call(env, 'admin/campaigns/samla', 'PATCH', { enabled: false, ends_at: '2026-12-10T06:00:00.000Z' }, token);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.enabled, false);
  assert.equal(updated.data.ends_at, '2026-12-10T06:00:00.000Z');

  const publicAfter = await call(env, 'public/campaigns/samla');
  assert.equal(publicAfter.data.active, false);
  assert.equal(publicAfter.data.enabled, false);

  const unauthorized = await call(env, 'admin/campaigns/samla', 'PATCH', { enabled: true });
  assert.equal(unauthorized.status, 401);
});

test('SAMLA AI strategy uses validated results and never requires payment', async () => {
  const { env } = makeEnv();
  const valid = await call(env, 'samla/ai-strategy', 'POST', {
    language: 'en',
    results: {
      total: '30:54:00', target: '15.00 hours', transitions: 30,
      nutrition: '840 g total, 56 g/hour', gels: '28 gels of 25 g every 30 minutes',
      stages: [{ name: 'Swim', distance: 3, duration: '01:15:00', pace: '02:30 per 100m', speed: '2.4 km/h' }],
    },
  });
  assert.equal(valid.status, 200);
  assert.match(valid.data.answer, /Estimated strategy/);
  const invalid = await call(env, 'samla/ai-strategy', 'POST', { language: 'en', results: { stages: [] } });
  assert.equal(invalid.status, 400);
});

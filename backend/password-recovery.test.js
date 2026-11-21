import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

function makeEnv({ email = true, recoveryKey = '' } = {}) {
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
          all() { return { results: stmt.all(...params) }; },
          run() { return { meta: stmt.run(...params) }; },
        };
      },
      batch(statements) {
        db.exec('BEGIN');
        try { const results = statements.map((statement) => statement.run()); db.exec('COMMIT'); return results; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    },
  };
  if (email) {
    env.RESEND_API_KEY = 'local-test-resend-key';
    env.EMAIL_FROM = 'MZ Active <no-reply@mzactive.com>';
  }
  if (recoveryKey) env.ADMIN_RECOVERY_KEY = recoveryKey;
  return { db, env };
}

async function call(env, path, method = 'GET', body, token, expected = 200) {
  const headers = body?.email === env.ADMIN_EMAILS && method === 'POST' && path === 'auth/register'
    ? { 'x-admin-setup-key': env.ADMIN_SETUP_KEY } : {};
  if (token) headers.authorization = 'Bearer ' + token;
  const response = await worker.fetch(new Request('https://api.example.test/api/' + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  }), env);
  const text = await response.text();
  assert.equal(response.status, expected, method + ' ' + path + ' → ' + text);
  return text ? JSON.parse(text) : {};
}

function mockEmail(emails) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    emails.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: 're_test_' + emails.length }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  return () => { globalThis.fetch = original; };
}

function resetTokenFrom(email) {
  const match = email.body.text.match(/reset-password\.html\?token=([A-Za-z0-9_-]+)/);
  assert.ok(match, 'email must contain a signed-in reset link');
  return match[1];
}

const ACCOUNTS = [
  { label: 'administrator', email: 'admin@example.test', body: { email: 'admin@example.test', password: 'owner-password-long', consent: true } },
  { label: 'sports coach', email: 'coach@example.test', body: { email: 'coach@example.test', password: 'coach-password-long', consent: true, provider_type: 'coach' } },
  { label: 'nutritionist', email: 'nutrition@example.test', body: { email: 'nutrition@example.test', password: 'nutrition-password-long', consent: true, provider_type: 'nutritionist' } },
  { label: 'physiotherapist', email: 'physio@example.test', body: { email: 'physio@example.test', password: 'physio-password-long', consent: true, provider_type: 'physiotherapist' } },
  { label: 'sports massage therapist', email: 'massage@example.test', body: { email: 'massage@example.test', password: 'massage-password-long', consent: true, provider_type: 'sports_massage_therapist' } },
  { label: 'pacer', email: 'pacer@example.test', body: { email: 'pacer@example.test', password: 'pacer-password-long', consent: true, provider_type: 'pacer' } },
  { label: 'member', email: 'member@example.test', body: { email: 'member@example.test', password: 'member-password-long', consent: true, account_type: 'member' } },
];

test('email recovery fails closed when no mail provider is configured', async () => {
  const { db, env } = makeEnv({ email: false });
  await call(env, 'auth/register', 'POST', ACCOUNTS[1].body, null, 201);
  assert.deepEqual(await call(env, 'auth/forgot-password', 'POST', { email: ACCOUNTS[1].email }, null, 503), { error: 'recovery_unavailable' });
  assert.deepEqual(await call(env, 'auth/reset-password', 'POST', { token: 'any-token', new_password: 'new-password-long' }, null, 503), { error: 'recovery_unavailable' });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM password_reset_tokens').get().count, 0);
  db.close();
});

test('unknown and known emails return the same generic confirmation without leaking accounts', async () => {
  const { db, env } = makeEnv();
  const emails = [];
  const restore = mockEmail(emails);
  try {
    await call(env, 'auth/register', 'POST', ACCOUNTS[1].body, null, 201);
    const known = await call(env, 'auth/forgot-password', 'POST', { email: ACCOUNTS[1].email });
    const unknown = await call(env, 'auth/forgot-password', 'POST', { email: 'missing@example.test' });
    assert.deepEqual(known, unknown);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].body.to[0], ACCOUNTS[1].email);
  } finally {
    restore();
    db.close();
  }
});

for (const account of ACCOUNTS) {
  test(`${account.label} completes centralized emailed password recovery`, async () => {
    const { db, env } = makeEnv();
    const emails = [];
    const restore = mockEmail(emails);
    try {
      await call(env, 'auth/register', 'POST', account.body, null, 201);
      const oldSession = (await call(env, 'auth/login', 'POST', { email: account.email, password: account.body.password })).token;
      const requested = await call(env, 'auth/forgot-password', 'POST', { email: account.email });
      assert.equal(requested.ok, true);
      assert.equal(emails.length, 1);
      assert.equal(emails[0].url, 'https://api.resend.com/emails');
      assert.equal(emails[0].body.to[0], account.email);
      assert.match(emails[0].body.subject, /Reset your MZ Active password/);
      assert.match(emails[0].body.subject, /إعادة تعيين/);
      assert.match(emails[0].body.html, /lang="ar"/);
      assert.match(emails[0].body.text, /إعادة تعيين/);
      const rawToken = resetTokenFrom(emails[0]);
      const stored = db.prepare('SELECT token_hash,email_provider_id,user_id FROM password_reset_tokens').get();
      assert.notEqual(stored.token_hash, rawToken, 'only a hash may be stored');
      assert.equal(stored.email_provider_id, 're_test_1');
      const ttl = db.prepare('SELECT expires_at FROM password_reset_tokens').get().expires_at - Math.floor(Date.now() / 1000);
      assert.ok(ttl > 0 && ttl <= (account.label === 'administrator' ? 300 : 900), 'privileged links expire sooner');

      await call(env, 'auth/reset-password', 'POST', { token: rawToken, new_password: 'replacement-password-long' });
      await call(env, 'auth/login', 'POST', { email: account.email, password: account.body.password }, null, 401);
      const signedIn = await call(env, 'auth/login', 'POST', { email: account.email, password: 'replacement-password-long' });
      assert.ok(signedIn.token);
      assert.equal(signedIn.user.role, account.label === 'administrator' ? 'admin' : 'provider');
      await call(env, 'admin/history', 'GET', undefined, oldSession, 401);
      assert.deepEqual(await call(env, 'auth/reset-password', 'POST', { token: rawToken, new_password: 'another-password-long' }, null, 400), { error: 'invalid_token' });
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id=?').get(stored.user_id).count, 1);
      const events = db.prepare("SELECT kind FROM auth_events WHERE user_id=?").all(stored.user_id).map((e) => e.kind).sort();
      assert.deepEqual(events, ['reset_completed', 'reset_requested']);
    } finally {
      restore();
      db.close();
    }
  });
}

test('a new reset request supersedes earlier unused links', async () => {
  const { db, env } = makeEnv();
  const emails = [];
  const restore = mockEmail(emails);
  try {
    await call(env, 'auth/register', 'POST', ACCOUNTS[4].body, null, 201);
    await call(env, 'auth/forgot-password', 'POST', { email: ACCOUNTS[4].email });
    const firstToken = resetTokenFrom(emails[0]);
    await call(env, 'auth/forgot-password', 'POST', { email: ACCOUNTS[4].email });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM password_reset_tokens WHERE used_at IS NULL').get().count, 1);
    await call(env, 'auth/reset-password', 'POST', { token: firstToken, new_password: 'replacement-password-long' }, null, 400);
    assert.deepEqual(await call(env, 'auth/reset-password', 'POST', { token: resetTokenFrom(emails[1]), new_password: 'replacement-password-long' }), { ok: true });
  } finally {
    restore();
    db.close();
  }
});

test('expired and malformed reset links are rejected and rate limits apply', async () => {
  const { db, env } = makeEnv();
  const emails = [];
  const restore = mockEmail(emails);
  try {
    await call(env, 'auth/register', 'POST', ACCOUNTS[2].body, null, 201);
    await call(env, 'auth/forgot-password', 'POST', { email: ACCOUNTS[2].email });
    db.prepare('UPDATE password_reset_tokens SET expires_at=?').run(Math.floor(Date.now() / 1000) - 1);
    const rawToken = resetTokenFrom(emails[0]);
    assert.deepEqual(await call(env, 'auth/reset-password', 'POST', { token: rawToken, new_password: 'replacement-password-long' }, null, 400), { error: 'invalid_token' });
    assert.deepEqual(await call(env, 'auth/reset-password', 'POST', { token: 'bad', new_password: 'short' }, null, 400), { error: 'invalid_password' });
    await call(env, 'auth/forgot-password', 'POST', { email: 'a@example.test' });
    await call(env, 'auth/forgot-password', 'POST', { email: 'b@example.test' });
    await call(env, 'auth/forgot-password', 'POST', { email: 'c@example.test' });
    await call(env, 'auth/forgot-password', 'POST', { email: 'd@example.test' });
    assert.deepEqual(await call(env, 'auth/forgot-password', 'POST', { email: 'e@example.test' }, null, 429), { error: 'rate_limited' });
  } finally {
    restore();
    db.close();
  }
});

test('the offline admin key stays an emergency-only path and all roles can change their password', async () => {
  const { db, env } = makeEnv({ recoveryKey: 'offline-recovery-key' });
  await call(env, 'auth/register', 'POST', ACCOUNTS[0].body, null, 201);
  await call(env, 'auth/register', 'POST', ACCOUNTS[1].body, null, 201);
  const admin = (await call(env, 'auth/login', 'POST', { email: ACCOUNTS[0].email, password: ACCOUNTS[0].body.password })).token;
  const coach = (await call(env, 'auth/login', 'POST', { email: ACCOUNTS[1].email, password: ACCOUNTS[1].body.password })).token;
  assert.deepEqual(await call(env, 'auth/change-password', 'POST', { current_password: ACCOUNTS[1].body.password, new_password: 'coach-new-password-long' }, coach), { ok: true });
  await call(env, 'auth/login', 'POST', { email: ACCOUNTS[1].email, password: 'coach-new-password-long' });
  const events = await call(env, 'admin/auth-events', 'GET', undefined, admin);
  assert.equal(events.email_delivery, 'configured');
  assert.ok(events.events.some((event) => event.kind === 'password_changed'));
  await call(env, 'admin/auth-events', 'GET', undefined, coach, 403);
  assert.deepEqual(await call(env, 'auth/recover', 'POST', { email: ACCOUNTS[0].email, key: 'offline-recovery-key', new_password: 'owner-new-password-long' }), { ok: true });
  assert.ok(db.prepare("SELECT 1 FROM auth_events WHERE kind='admin_emergency_reset'").get());
  db.close();
});

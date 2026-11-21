import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

function makeEnv({ recoveryKey = '' } = {}) {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b))) {
    db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const env = {
    DATA_COLLECTION_ENABLED: 'true',
    ADMIN_EMAILS: 'admin@example.test',
    ADMIN_SETUP_KEY: 'local-setup-key',
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
        try { const results = statements.map(statement => statement.run()); db.exec('COMMIT'); return results; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    },
  };
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
  assert.equal(response.status, expected, method + ' ' + path + ' → ' + JSON.stringify(await response.clone().json().catch(() => ({}))));
  return response.json();
}

test('login reports invalid credentials without revealing whether the email exists', async () => {
  const { db, env } = makeEnv();
  const password = 'owner-password-long';
  await call(env, 'auth/register', 'POST', { email: env.ADMIN_EMAILS, password, consent: true }, null, 201);
  const sessionsBefore = db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count;
  const unknown = await call(env, 'auth/login', 'POST', { email: 'nobody@example.test', password }, null, 401);
  const wrong = await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password: 'wrong-password-long' }, null, 401);
  assert.deepEqual(unknown, { error: 'invalid_credentials' });
  assert.deepEqual(wrong, { error: 'invalid_credentials' });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, sessionsBefore);
  db.close();
});

test('public registration accepts simple 8-character and long passphrases but rejects weak choices', async () => {
  const { db, env } = makeEnv();
  const short = await call(env, 'auth/register', 'POST', { email: 'short@example.test', password: 'abc1234', consent: true, provider_type: 'coach' }, null, 400);
  assert.deepEqual(short, { error: 'invalid_registration' });
  const common = await call(env, 'auth/register', 'POST', { email: 'common@example.test', password: 'qwerty123', consent: true, account_type: 'member' }, null, 400);
  assert.deepEqual(common, { error: 'weak_password' });
  const simple = 'runner42';
  await call(env, 'auth/register', 'POST', { email: 'coach@example.test', password: simple, consent: true, provider_type: 'coach' }, null, 201);
  const long = ('MzActive42-'.repeat(7)).slice(0, 64);
  assert.equal(long.length, 64);
  await call(env, 'auth/register', 'POST', { email: 'member@example.test', password: long, consent: true, account_type: 'member' }, null, 201);
  await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password: simple });
  await call(env, 'auth/login', 'POST', { email: 'member@example.test', password: long });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 2);
  db.close();
});

test('admin authentication keeps its stricter baseline while public password changes are simpler', async () => {
  const { db, env } = makeEnv();
  await call(env, 'auth/register', 'POST', { email: env.ADMIN_EMAILS, password: 'owner-password-long', consent: true }, null, 201);
  const adminToken = (await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password: 'owner-password-long' })).token;
  assert.deepEqual(await call(env, 'auth/change-password', 'POST', { current_password: 'owner-password-long', new_password: 'runner42' }, adminToken, 400), { error: 'invalid_password' });
  assert.deepEqual(await call(env, 'auth/change-password', 'POST', { current_password: 'owner-password-long', new_password: 'qwerty1234' }, adminToken, 400), { error: 'invalid_password' });

  await call(env, 'auth/register', 'POST', { email: 'coach@example.test', password: 'coach-password-long', consent: true, provider_type: 'coach' }, null, 201);
  const coachToken = (await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password: 'coach-password-long' })).token;
  assert.deepEqual(await call(env, 'auth/change-password', 'POST', { current_password: 'coach-password-long', new_password: 'runner42' }, coachToken), { ok: true });
  await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password: 'runner42' });
  db.close();
});

test('admin recovery needs a configured secret and rejects wrong keys without changing the password', async () => {
  const password = 'owner-password-long';
  const missing = makeEnv();
  await call(missing.env, 'auth/register', 'POST', { email: missing.env.ADMIN_EMAILS, password, consent: true }, null, 201);
  assert.deepEqual(await call(missing.env, 'auth/recover', 'POST', { email: missing.env.ADMIN_EMAILS, key: 'anything', new_password: 'new-password-long' }, null, 503), { error: 'recovery_unavailable' });
  missing.db.close();

  const configured = makeEnv({ recoveryKey: 'offline-recovery-key' });
  await call(configured.env, 'auth/register', 'POST', { email: configured.env.ADMIN_EMAILS, password, consent: true }, null, 201);
  assert.deepEqual(await call(configured.env, 'auth/recover', 'POST', { email: configured.env.ADMIN_EMAILS, key: 'wrong-key', new_password: 'new-password-long' }, null, 400), { error: 'invalid_recovery' });
  await call(configured.env, 'auth/login', 'POST', { email: configured.env.ADMIN_EMAILS, password });
  assert.deepEqual(await call(configured.env, 'auth/recover', 'POST', { email: 'provider@example.test', key: 'offline-recovery-key', new_password: 'new-password-long' }, null, 400), { error: 'invalid_recovery' });
  configured.db.close();
});

test('successful admin recovery rotates the password and signs out every session', async () => {
  const { db, env } = makeEnv({ recoveryKey: 'offline-recovery-key' });
  const oldPassword = 'owner-password-long', newPassword = 'replacement-password-long';
  await call(env, 'auth/register', 'POST', { email: env.ADMIN_EMAILS, password: oldPassword, consent: true }, null, 201);
  const first = (await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password: oldPassword })).token;
  const second = (await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password: oldPassword })).token;
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count >= 2, true);
  assert.deepEqual(await call(env, 'auth/recover', 'POST', { email: env.ADMIN_EMAILS, key: 'offline-recovery-key', new_password: newPassword }), { ok: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
  await call(env, 'admin/history', 'GET', undefined, first, 401);
  await call(env, 'admin/history', 'GET', undefined, second, 401);
  await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password: oldPassword }, null, 401);
  const rotated = await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password: newPassword });
  assert.equal(rotated.user.role, 'admin');
  assert.ok(rotated.token);
  db.close();
});

test('authenticated accounts can change their password and keep only the current session', async () => {
  const { db, env } = makeEnv();
  const password = 'owner-password-long', next = 'changed-password-long';
  await call(env, 'auth/register', 'POST', { email: env.ADMIN_EMAILS, password, consent: true }, null, 201);
  await call(env, 'auth/register', 'POST', { email: 'coach@example.test', password, consent: true, provider_type: 'coach' }, null, 201);
  const admin = (await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password })).token;
  const coach = (await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password })).token;
  await call(env, 'auth/change-password', 'POST', { current_password: password, new_password: next }, coach);
  await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password: next });
  await call(env, 'auth/change-password', 'POST', { current_password: 'wrong-password-long', new_password: next }, admin, 400);
  assert.deepEqual(await call(env, 'auth/change-password', 'POST', { current_password: password, new_password: next }, admin), { ok: true });
  await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password }, null, 401);
  await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password: next });
  db.close();
});

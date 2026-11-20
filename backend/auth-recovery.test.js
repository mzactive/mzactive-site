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

test('authenticated admins can change their password but non-admins cannot', async () => {
  const { db, env } = makeEnv();
  const password = 'owner-password-long', next = 'changed-password-long';
  await call(env, 'auth/register', 'POST', { email: env.ADMIN_EMAILS, password, consent: true }, null, 201);
  await call(env, 'auth/register', 'POST', { email: 'coach@example.test', password, consent: true, provider_type: 'coach' }, null, 201);
  const admin = (await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password })).token;
  const coach = (await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password })).token;
  await call(env, 'auth/change-password', 'POST', { current_password: password, new_password: next }, coach, 403);
  await call(env, 'auth/change-password', 'POST', { current_password: 'wrong-password-long', new_password: next }, admin, 400);
  assert.deepEqual(await call(env, 'auth/change-password', 'POST', { current_password: password, new_password: next }, admin), { ok: true });
  await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password }, null, 401);
  await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password: next });
  db.close();
});

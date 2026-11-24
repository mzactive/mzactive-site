import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker from './worker.js';

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b))) {
    db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const env = {
    DATA_COLLECTION_ENABLED: 'true',
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

async function call(env, path, method = 'GET', token = '') {
  const headers = { origin: 'https://mzactive.com' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await worker.fetch(new Request('https://api.example.test/api/' + path, {
    method, headers,
  }), env);
  const raw = await response.text();
  return { status: response.status, data: raw ? JSON.parse(raw) : {} };
}

test('following count is real, owner-scoped and requires authentication', async () => {
  const { db, env } = makeEnv();
  const stamp = new Date().toISOString();
  const member = '11111111-1111-4111-8111-111111111111';
  const coachUser = '22222222-2222-4222-8222-222222222222';
  const coachProfile = '33333333-3333-4333-8333-333333333333';
  for (const [id, email] of [[member, 'member@example.test'], [coachUser, 'coach@example.test']]) {
    db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
      .run(id, email, 'hash', 'provider', stamp);
  }
  db.prepare(`INSERT INTO provider_profiles(id,user_id,provider_type,display_name,city,bio,status,updated_at,created_at)
    VALUES(?,?,'coach','Coach','Doha','Bio','approved',?,?)`).run(coachProfile, coachUser, stamp, stamp);
  const token = 'e2e-following-count-token-1234567890';
  const tokenHash = createHash('sha256').update(token).digest('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
    .run(tokenHash, member, Math.floor(Date.now() / 1000) + 600, stamp);

  assert.equal((await call(env, 'me/following/count')).status, 401);
  assert.deepEqual((await call(env, 'me/following/count', 'GET', token)).data, { following_count: 0 });
  assert.equal((await call(env, `coaches/${coachProfile}/follow`, 'POST', token)).status, 200);
  assert.deepEqual((await call(env, 'me/following/count', 'GET', token)).data, { following_count: 1 });
  assert.equal((await call(env, `coaches/${coachProfile}/follow`, 'DELETE', token)).status, 200);
  assert.deepEqual((await call(env, 'me/following/count', 'GET', token)).data, { following_count: 0 });
});

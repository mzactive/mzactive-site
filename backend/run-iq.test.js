import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b))) {
    db.exec(readFileSync(new URL(file, dir), 'utf8'));
  }
  const env = {
    DATA_COLLECTION_ENABLED: 'true', ADMIN_EMAILS: 'admin@example.test', ADMIN_SETUP_KEY: 'local-key',
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql); let params = [];
        return { bind(...v) { params = v; return this; }, first() { return stmt.get(...params); }, all() { return { results: stmt.all(...params) }; }, run() { return { meta: stmt.run(...params) }; } };
      },
      batch(items) {
        db.exec('BEGIN');
        try { const out = items.map(i => i.run()); db.exec('COMMIT'); return out; }
        catch (e) { db.exec('ROLLBACK'); throw e; }
      },
    },
  };
  return { db, env };
}

async function call(env, path, method = 'GET', body, token, expected = 200) {
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await worker.fetch(new Request('https://example.test/api/' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const raw = await response.text();
  assert.equal(response.status, expected, method + ' ' + path + ' → ' + raw);
  return raw ? JSON.parse(raw) : {};
}

const assessment = {
  experience: 'beginner', frequency: 3, weekly_km: 15, recent_result: '10K 55:00',
  target_distance: '10K', goal: 'complete', days: ['monday', 'wednesday', 'saturday'],
  limitations: '', city: 'Doha',
};

async function member(env, email) {
  return call(env, 'auth/register', 'POST', {
    account_type: 'member', email, password: 'local-run-iq-password', consent: true,
  }, null, 201);
}

test('Run IQ preview is public, deterministic and rejects invalid input', async () => {
  const { env } = makeEnv();
  await call(env, 'run-iq/preview', 'POST', { experience: 'unknown' }, null, 400);
  const result = await call(env, 'run-iq/preview', 'POST', assessment);
  assert.equal(result.preview.level, 'beginner');
  assert.ok(result.preview.pace > 5 && result.preview.pace < 6);
  assert.ok(result.preview.recommendations.length >= 3);
  assert.match(result.preview.assumptions.join(' '), /self-reported/i);
});

test('saving requires a member account and creates one private calendar plan', async () => {
  const { db, env } = makeEnv();
  await call(env, 'run-iq/save', 'POST', { assessment }, null, 401);
  const token = (await member(env, 'runner@example.test')).token;
  const saved = await call(env, 'run-iq/save', 'POST', { assessment, name: 'Test Runner', phone: '' }, token, 201);
  assert.equal(saved.saved, true);
  assert.equal(db.prepare("SELECT source FROM athlete_programs_v2 WHERE id=?").get(saved.program_id).source, 'ai_self');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM athlete_program_sessions_v2 WHERE program_id=?').get(saved.program_id).count, 3);
  await call(env, 'run-iq/save', 'POST', { assessment }, token, 409);
  const mine = await call(env, 'run-iq/me', 'GET', undefined, token);
  assert.equal(mine.assessment.target_distance, '10K');
  assert.equal(mine.program.sessions.length, 3);
});

test('workout logging records completion without changing the plan', async () => {
  const { db, env } = makeEnv();
  const token = (await member(env, 'logger@example.test')).token;
  await call(env, 'run-iq/save', 'POST', { assessment }, token, 201);
  const mine = await call(env, 'run-iq/me', 'GET', undefined, token);
  const sessionId = mine.program.sessions[0].id;
  await call(env, `run-iq/sessions/${sessionId}/log`, 'POST', {
    actual_km: 6.2, duration_minutes: 36, effort: 'easy', notes: 'Felt relaxed',
  }, token);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM athlete_program_completions_v2 WHERE session_id=?').get(sessionId).count, 1);
  assert.equal(db.prepare('SELECT effort FROM run_iq_workout_logs WHERE session_id=?').get(sessionId).effort, 'easy');
  assert.ok(db.prepare('SELECT pace FROM run_iq_workout_logs WHERE session_id=?').get(sessionId).pace);
});

test('coach recommendations are real and sharing requires consent and can be revoked', async () => {
  const { db, env } = makeEnv();
  const coachId = 'coach-run-iq-test', coachUserId = '11111111-2222-4333-8444-555555555555';
  db.prepare("INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?, 'provider',?)").run(coachUserId, 'coach-iq@example.test', 'hash', new Date().toISOString());
  db.prepare(`INSERT INTO provider_profiles(id,user_id,provider_type,display_name,city,bio,status,specialties_json,services_json,created_at,updated_at)
    VALUES(?,?, 'coach','Real Running Coach','Doha','Real bio','approved','["Running"]','["Training sessions"]',?,?)`).run(coachId, coachUserId, new Date().toISOString(), new Date().toISOString());
  const token = (await member(env, 'sharer@example.test')).token;
  await call(env, 'run-iq/save', 'POST', { assessment }, token, 201);
  const coaches = await call(env, 'run-iq/coaches?city=Doha');
  assert.equal(coaches.coaches.length, 1);
  assert.equal(coaches.coaches[0].display_name, 'Real Running Coach');
  await call(env, 'run-iq/share', 'POST', { coach_user_id: coachId }, token, 400);
  await call(env, 'run-iq/share', 'POST', { coach_user_id: coachId, consent: true }, token);
  const mine = await call(env, 'run-iq/me', 'GET', undefined, token);
  assert.equal(mine.shares[0].status, 'active');
  await call(env, `run-iq/share/${coachUserId}`, 'DELETE', undefined, token);
  assert.equal((await call(env, 'run-iq/me', 'GET', undefined, token)).shares[0].status, 'revoked');
});

test('assessment data never leaks to another member', async () => {
  const { env } = makeEnv();
  const first = (await member(env, 'owner@example.test')).token;
  const second = (await member(env, 'other@example.test')).token;
  await call(env, 'run-iq/save', 'POST', { assessment }, first, 201);
  const other = await call(env, 'run-iq/me', 'GET', undefined, second);
  assert.equal(other.assessment, null);
  assert.equal(other.program, null);
});

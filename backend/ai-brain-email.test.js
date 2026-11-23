import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

const PASSWORD = 'local-ai-brain-test-password';

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b))) {
    db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const env = {
    DATA_COLLECTION_ENABLED: 'true', ADMIN_EMAILS: 'admin@example.test', ADMIN_SETUP_KEY: 'local-setup-key',
    RESEND_API_KEY: 'test-only-mail-key', EMAIL_FROM: 'MZActive <no-reply@example.test>',
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
        try {
          const results = statements.map((statement) => statement.run());
          db.exec('COMMIT');
          return results;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    },
  };
  return { db, env };
}

async function call(env, path, method = 'GET', body, token, expected = 200) {
  const headers = body?.email === env.ADMIN_EMAILS && method === 'POST' && path === 'auth/register'
    ? { 'x-admin-setup-key': env.ADMIN_SETUP_KEY } : {};
  if (token) headers.authorization = 'Bearer ' + token;
  const response = await worker.fetch(new Request('https://api.example.test/api/' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const raw = await response.text();
  assert.equal(response.status, expected, method + ' ' + path + ' → ' + raw);
  return raw ? JSON.parse(raw) : {};
}

function mockResend(emails) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    emails.push({ url: String(url), body: JSON.parse(init?.body || '{}') });
    return new Response(JSON.stringify({ id: 'mock_email_' + emails.length }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  return () => { globalThis.fetch = original; };
}

async function adminToken(env) {
  return (await call(env, 'auth/register', 'POST', {
    email: env.ADMIN_EMAILS, password: PASSWORD, consent: true,
  }, null, 201)).token;
}

test('new registrations notify the admin without exposing personal data', async () => {
  const { env } = makeEnv();
  const emails = [], restore = mockResend(emails);
  try {
    await adminToken(env);
    await call(env, 'auth/register', 'POST', {
      email: 'private-coach@example.test', password: PASSWORD, consent: true, provider_type: 'coach',
    }, null, 201);
    await call(env, 'auth/register', 'POST', {
      email: 'private-athlete@example.test', password: PASSWORD, consent: true, account_type: 'member',
    }, null, 201);

    const adminEmails = emails.filter((item) => item.body.to?.[0] === 'mzactive@yahoo.com');
    assert.equal(adminEmails.length, 3);
    assert.ok(adminEmails.some((item) => item.body.subject.includes('new Sports Coach registration')));
    assert.ok(adminEmails.some((item) => item.body.subject.includes('new Athlete registration')));
    assert.ok(adminEmails.some((item) => item.body.subject.includes('requires approval')));
    for (const item of adminEmails) {
      assert.doesNotMatch(item.body.text, /private-coach@example\.test|private-athlete@example\.test|password/i);
    }
  } finally { restore(); }
});

test('duplicate notifications are prevented by stable event keys', async () => {
  const { env, db } = makeEnv();
  const emails = [], restore = mockResend(emails);
  try {
    await adminToken(env);
    await call(env, 'auth/register', 'POST', {
      email: 'dedupe@example.test', password: PASSWORD, consent: true, provider_type: 'pacer',
    }, null, 201);
    await call(env, 'auth/register', 'POST', {
      email: 'dedupe@example.test', password: PASSWORD, consent: true, provider_type: 'pacer',
    }, null, 409);
    const keys = db.prepare('SELECT event_key FROM ai_brain_outbox').all().map((row) => row.event_key);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(emails.filter((item) => item.body.subject.includes('new Champion Pacer registration')).length, 1);
  } finally { restore(); }
});

test('the daily report runs at 07:00 Asia/Qatar using real database counts', async () => {
  const { env, db } = makeEnv();
  const emails = [], restore = mockResend(emails);
  try {
    await adminToken(env);
    await call(env, 'auth/register', 'POST', {
      email: 'report-coach@example.test', password: PASSWORD, consent: true, provider_type: 'coach',
    }, null, 201);
    const providerId = db.prepare("SELECT id FROM provider_profiles WHERE provider_type='coach'").get().id;
    db.prepare(`INSERT INTO booking_requests(id,provider_id,customer_name,customer_phone,city,goal_summary,consent_at,created_at,session_type,status)
      VALUES(?,?,?,?,?,?,?,?,?,'received')`)
      .run('report-booking', providerId, 'Report Athlete', '55555555', 'Doha', 'Report request',
        new Date().toISOString(), new Date().toISOString(), 'training');

    const wrongTime = Date.UTC(2026, 10, 23, 3, 59, 0);
    await worker.scheduled({ scheduledTime: wrongTime }, env);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ai_brain_reports').get().count, 0);
    assert.equal(emails.filter((item) => item.body.subject.includes('daily report')).length, 0);

    const dueTime = Date.UTC(2026, 10, 23, 4, 0, 0);
    await worker.scheduled({ scheduledTime: dueTime }, env);
    const stored = db.prepare('SELECT * FROM ai_brain_reports').get();
    assert.equal(stored.report_date, '2026-11-23');
    const counts = JSON.parse(stored.counts_json);
    assert.equal(counts.new_coaches, 1);
    assert.equal(counts.booking_requests, 1);
    assert.equal(counts.pending_approvals, 1);
    assert.equal(emails.filter((item) => item.body.subject.includes('daily report')).length, 1);

    await worker.scheduled({ scheduledTime: dueTime }, env);
    assert.equal(emails.filter((item) => item.body.subject.includes('daily report')).length, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ai_brain_reports').get().count, 1);
  } finally { restore(); }
});

test('admin settings and test email require confirmation and super-admin access', async () => {
  const { env } = makeEnv();
  const emails = [], restore = mockResend(emails);
  try {
    const admin = await adminToken(env);
    const coach = await call(env, 'auth/register', 'POST', {
      email: 'settings-coach@example.test', password: PASSWORD, consent: true, provider_type: 'coach',
    }, null, 201);

    await call(env, 'admin/ai-brain', 'PATCH', { report_time: '08:30' }, coach.token, 403);
    await call(env, 'admin/ai-brain', 'PATCH', { report_time: '08:30' }, admin, 400);
    const updated = await call(env, 'admin/ai-brain', 'PATCH', {
      notifications_enabled: true, report_time: '08:30', confirm: true,
    }, admin);
    assert.equal(updated.settings.report_time, '08:30');
    await call(env, 'admin/ai-brain', 'PATCH', { report_time: '25:00', confirm: true }, admin, 400);

    const before = emails.length;
    await call(env, 'admin/ai-brain/test-email', 'POST', {}, admin, 400);
    const sent = await call(env, 'admin/ai-brain/test-email', 'POST', { confirm: true }, admin);
    assert.equal(sent.delivered, true);
    assert.ok(sent.provider_id);
    assert.equal(emails.length, before + 1);
    assert.equal(emails.at(-1).body.to[0], 'mzactive@yahoo.com');

    const overview = await call(env, 'admin/ai-brain', 'GET', undefined, admin);
    assert.equal(overview.settings.report_time, '08:30');
    assert.equal(overview.email.configured, true);
    assert.ok(overview.email.sent >= 1);
  } finally { restore(); }
});

test('disabling notifications stops registration emails but keeps accounts working', async () => {
  const { env } = makeEnv();
  const emails = [], restore = mockResend(emails);
  try {
    const admin = await adminToken(env);
    await call(env, 'admin/ai-brain', 'PATCH', { notifications_enabled: false, confirm: true }, admin);
    const before = emails.length;
    await call(env, 'auth/register', 'POST', {
      email: 'quiet-athlete@example.test', password: PASSWORD, consent: true, account_type: 'member',
    }, null, 201);
    assert.equal(emails.length, before);
    const overview = await call(env, 'admin/ai-brain', 'GET', undefined, admin);
    assert.equal(overview.settings.notifications_enabled, false);
  } finally { restore(); }
});

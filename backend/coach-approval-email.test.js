import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

const SUBJECT = 'Welcome to the MZActive Family! 💛';
const PROFILE_URL = 'https://mzactive.com/dashboard.html#editCoachProfile';
const PASSWORD = 'local-approval-test-password';

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b))) {
    db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const env = {
    DATA_COLLECTION_ENABLED: 'true',
    ADMIN_EMAILS: 'admin@example.test',
    ADMIN_SETUP_KEY: 'local-setup-key',
    // Deliberately fake. No production credential is read or stored by tests.
    RESEND_API_KEY: 'test-only-mail-key',
    EMAIL_FROM: 'MZActive Community <no-reply@example.test>',
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
          const results = statements.map(statement => statement.run());
          db.exec('COMMIT');
          return results;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
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
    method, headers, body: body ? JSON.stringify(body) : undefined,
  }), env);
  const raw = await response.text();
  assert.equal(response.status, expected, method + ' ' + path + ' → ' + raw);
  return raw ? JSON.parse(raw) : {};
}

function mockResend(emails, fail = false) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    emails.push({ url, body: JSON.parse(init.body) });
    if (fail) return new Response(JSON.stringify({ error: 'mock_delivery_failure' }), { status: 500 });
    return new Response(JSON.stringify({ id: 'mock_email_' + emails.length }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  return () => { globalThis.fetch = original; };
}

async function coachFixture(env, { languages = ['English'], edit = true } = {}) {
  const admin = await call(env, 'auth/register', 'POST', { email: env.ADMIN_EMAILS, password: PASSWORD, consent: true }, null, 201);
  const coachEmail = languages.includes('Arabic') ? 'arabic-coach@example.test' : 'coach@example.test';
  const coach = await call(env, 'auth/register', 'POST', {
    email: coachEmail, password: PASSWORD, consent: true, provider_type: 'coach',
  }, null, 201);
  const profile = (await call(env, 'me/profile', 'GET', undefined, coach.token)).profile;
  if (edit) {
    await call(env, 'me/profile', 'PUT', {
      provider_type: 'coach',
      display_name: 'Test Coach',
      specialties: ['Running'],
      languages,
      bio: 'Test biography',
      qualifications: 'Test qualification',
      services: ['Session'],
      coaching_mode: 'both',
    }, coach.token);
  }
  const applications = await call(env, 'admin/applications', 'GET', undefined, admin.token);
  const application = applications.providers.find(item => item.id === profile.id);
  return { adminToken: admin.token, coachToken: coach.token, coachEmail, id: profile.id, application };
}

async function approveCoach(env, fixture, extra = {}) {
  return call(env, 'admin/providers/' + fixture.id, 'PATCH', {
    status: 'approved', verified: true, review_version: fixture.application.updated_at, ...extra,
  }, fixture.adminToken);
}

test('approval sends one exact bilingual welcome email and duplicate clicks are harmless', async () => {
  const { db, env } = makeEnv();
  const emails = [];
  const restore = mockResend(emails);
  try {
    const fixture = await coachFixture(env);
    const result = await approveCoach(env, fixture);
    assert.equal(result.updated, true);
    assert.equal(result.status, 'approved');
    assert.deepEqual(result.welcome_email, { status: 'sent', attempts: 0, error: null });
    assert.equal(emails.length, 1);
    assert.equal(emails[0].url, 'https://api.resend.com/emails');
    assert.equal(emails[0].body.from, env.EMAIL_FROM);
    assert.deepEqual(emails[0].body.to, [fixture.coachEmail]);
    assert.equal(emails[0].body.subject, SUBJECT);
    for (const phrase of [
      'Hi Test Coach,',
      'Welcome to the MZActive family! 💛',
      "We're truly happy to have you with us.",
      'Thank you for believing in our vision and choosing to be part of this journey.',
      'At MZActive, we believe great coaches deserve more opportunities to inspire, connect, and grow.',
      "We're excited to support you as you build your coaching career, reach new athletes, and make a meaningful impact.",
      "Together, let's take your coaching career to the next level.",
      'Welcome aboard!',
      'Complete Your Coach Profile',
      PROFILE_URL,
      'https://mzactive.com/assets/brand/mzactive-logo.webp',
      'lang="en" dir="ltr"',
      'lang="ar" dir="rtl"',
    ]) assert.ok(emails[0].body.html.includes(phrase), phrase);
    assert.equal(emails[0].body.text.includes(PROFILE_URL), true);

    const duplicate = await call(env, 'admin/providers/' + fixture.id, 'PATCH', {
      status: 'approved', verified: true,
    }, fixture.adminToken);
    assert.deepEqual(duplicate, {
      updated: false, already: true, status: 'approved',
      welcome_email: { status: 'sent', attempts: 0, error: null },
    });
    assert.equal(emails.length, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM coach_welcome_emails').get().count, 1);
  } finally {
    restore();
    db.close();
  }
});

test('Arabic-speaking coaches receive Arabic as the primary email body', async () => {
  const { db, env } = makeEnv();
  const emails = [];
  const restore = mockResend(emails);
  try {
    const fixture = await coachFixture(env, { languages: ['Arabic'] });
    await approveCoach(env, fixture);
    assert.equal(emails.length, 1);
    const html = emails[0].body.html;
    assert.equal(emails[0].body.subject, SUBJECT);
    assert.ok(html.indexOf('مرحباً بك في عائلة MZActive! 💛') < html.indexOf('Welcome to the MZActive family! 💛'));
    assert.ok(html.includes('أكمل ملف المدرب'));
    assert.ok(html.includes(PROFILE_URL));
    assert.ok(html.includes('lang="ar" dir="rtl"'));
  } finally {
    restore();
    db.close();
  }
});

test('a mail failure never blocks approval and the queued welcome email retries safely', async () => {
  const { db, env } = makeEnv();
  const emails = [];
  let restore = mockResend(emails, true);
  try {
    const fixture = await coachFixture(env);
    const result = await approveCoach(env, fixture);
    assert.equal(result.status, 'approved');
    assert.deepEqual(result.welcome_email, { status: 'pending', attempts: 1, error: 'email_delivery_failed' });
    assert.equal(db.prepare('SELECT status FROM provider_profiles WHERE id=?').get(fixture.id).status, 'approved');
    const row = db.prepare('SELECT status,attempts,error FROM coach_welcome_emails').get();
    assert.deepEqual({ ...row }, { status: 'pending', attempts: 1, error: 'email_delivery_failed' });

    restore();
    emails.length = 0;
    restore = mockResend(emails);
    db.prepare("UPDATE coach_welcome_emails SET next_attempt_at='2020-01-01T00:00:00.000Z'").run();
    env.AI = { run: async () => ({ response: 'Test recommendation' }) };
    await worker.scheduled({ scheduledTime: 12 * 3600000 }, env);
    assert.equal(emails.length, 1);
    assert.deepEqual({ ...db.prepare('SELECT status,error FROM coach_welcome_emails').get() }, { status: 'sent', error: null });
  } finally {
    restore();
    db.close();
  }
});

test('incomplete coaches can be approved, but a missing name and unverified licenses cannot', async () => {
  const { db, env } = makeEnv();
  const emails = [];
  const restore = mockResend(emails);
  try {
    const fixture = await coachFixture(env, { edit: false });
    db.prepare('UPDATE provider_profiles SET display_name=?,languages_json=? WHERE id=?')
      .run('', '["English"]', fixture.id);
    const missingName = await call(env, 'admin/providers/' + fixture.id, 'PATCH', {
      status: 'approved', verified: true, review_version: fixture.application.updated_at,
    }, fixture.adminToken, 422);
    assert.deepEqual(missingName, { error: 'coach_profile_incomplete' });

    db.prepare('UPDATE provider_profiles SET display_name=? WHERE id=?').run('Incomplete Coach', fixture.id);
    const approved = await approveCoach(env, { ...fixture, application: { ...fixture.application } });
    assert.equal(approved.status, 'approved');
    assert.equal(emails.length, 1);
    assert.equal(db.prepare('SELECT status FROM provider_profiles WHERE id=?').get(fixture.id).status, 'approved');
  } finally {
    restore();
    db.close();
  }
});

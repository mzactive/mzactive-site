import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

function setup() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b))) {
    db.exec(readFileSync(new URL(file, dir), 'utf8'));
  }
  const env = {
    DATA_COLLECTION_ENABLED: 'true', ADMIN_EMAILS: 'admin@example.test', ADMIN_SETUP_KEY: 'local-key',
    RESEND_API_KEY: 'test-only', EMAIL_FROM: 'MZ Active <no-reply@example.test>', PUBLIC_ORIGINS: 'https://mzactive.com',
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql); let params = [];
        return { bind(...v) { params = v; return this; }, first() { return stmt.get(...params); }, all() { return { results: stmt.all(...params) }; }, run() { return { meta: stmt.run(...params) }; } };
      },
      batch(items) { db.exec('BEGIN'); try { const out = items.map(i => i.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    },
  };
  async function call(path, method = 'GET', body, token, expected = 200, admin = false) {
    const headers = {};
    if (admin) headers['x-admin-setup-key'] = env.ADMIN_SETUP_KEY;
    if (token) headers.authorization = 'Bearer ' + token;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await worker.fetch(new Request('https://api.example.test/api/' + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    const raw = await response.text();
    assert.equal(response.status, expected, method + ' ' + path + ' → ' + raw);
    return raw ? JSON.parse(raw) : {};
  }
  return { db, env, call };
}

function mockEmail(emails) {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    emails.push({ url: String(_url), body: JSON.parse(init?.body || '{}') });
    return new Response(JSON.stringify({ id: 'email_' + emails.length }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return () => { globalThis.fetch = original; };
}

const password = 'coach-experience-test-password';

async function fixtures(db, call) {
  const admin = await call('auth/register', 'POST', { email: 'admin@example.test', password, consent: true }, null, 201, true);
  const coach = await call('auth/register', 'POST', { email: 'coach@example.test', password, consent: true, provider_type: 'coach', display_name: 'QA Coach', city: 'Doha' }, null, 201);
  const profileId = (await call('me/profile', 'GET', undefined, coach.token)).profile.id;
  await call('me/profile', 'PUT', {
    provider_type: 'coach', display_name: 'QA Coach', city: 'Doha', specialties: ['Running'],
    languages: ['English'], bio: 'A complete biography for review.', qualifications: 'Certified',
    services: ['Training plan'], coaching_mode: 'both', program_durations: [1],
  }, coach.token);
  const queue = await call('admin/applications', 'GET', undefined, admin.token);
  const application = queue.providers.find(item => item.id === profileId);
  await call('admin/providers/' + profileId, 'PATCH', { status: 'approved', verified: true, review_version: application.updated_at }, admin.token);
  const athlete = await call('auth/register', 'POST', { email: 'athlete@example.test', password, consent: true, account_type: 'member', display_name: 'QA Athlete' }, null, 201);
  return { admin, coach, athlete, profileId };
}

test('approved coaches land on the coach dashboard', async () => {
  const { db, call } = setup();
  try {
    const { coach } = await fixtures(db, call);
    const access = await call('me/access', 'GET', undefined, coach.token);
    assert.equal(access.account_type, 'provider');
    assert.equal(access.dashboard_path, '/dashboard.html');
  } finally { db.close(); }
});

test('coaching request creates exact notification and one email, then appears in My Athletes', async () => {
  const { db, call } = setup();
  const emails = [], restore = mockEmail(emails);
  try {
    const { coach, athlete } = await fixtures(db, call);
    const beforeRequestEmails = emails.length;
    const request = await call('connections', 'POST', { coach_user_id: coach.user.id }, athlete.token, 201);
    const notification = db.prepare("SELECT * FROM user_notifications WHERE user_id=? AND entity_id=?").get(coach.user.id, request.id);
    assert.equal(notification.href, `/dashboard.html?connection=${request.id}#myAthletes`);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM coach_notification_outbox WHERE event_key=?').get(`connection_request:${request.id}`).count, 1);
    assert.equal(emails.length, beforeRequestEmails + 1);
    assert.match(emails.at(-1).body.text, new RegExp(`connection=${request.id}`));

    const mine = await call('dashboard/athletes', 'GET', undefined, coach.token);
    assert.equal(mine.counts.pending, 1);
    assert.equal(mine.athletes[0].id, request.id);
    assert.equal(mine.athletes[0].bucket, 'pending');

    await call('connections/' + request.id, 'PATCH', { status: 'accepted' }, coach.token);
    const active = await call('dashboard/athletes', 'GET', undefined, coach.token);
    assert.equal(active.counts.active, 1);
    const athleteNotice = db.prepare("SELECT href FROM user_notifications WHERE user_id=? AND entity_type='coach_connection' AND entity_id=? ORDER BY created_at DESC LIMIT 1").get(athlete.user.id, request.id);
    assert.match(athleteNotice.href, /#myCoach/);
  } finally { restore(); db.close(); }
});

test('program send confirms delivery, notifies the athlete and prevents duplicates', async () => {
  const { db, call } = setup();
  const emails = [], restore = mockEmail(emails);
  try {
    const { coach, athlete } = await fixtures(db, call);
    const connection = await call('connections', 'POST', { coach_user_id: coach.user.id }, athlete.token, 201);
    await call('connections/' + connection.id, 'PATCH', { status: 'accepted' }, coach.token);
    const program = await call('dashboard/programs', 'POST', {
      athlete_name: 'QA Athlete', athlete_phone: '55555555', athlete_type: 'runner', week_start: '2026-11-23',
      sessions: [{ day_key: 'monday', sport_type: 'run', details: 'Easy 5 km' }],
    }, coach.token, 201);
    assert.equal(program.sent_at, undefined);
    const beforeSendEmails = emails.length;
    const sent = await call('dashboard/programs/' + program.id + '/send', 'POST', { athlete_user_id: athlete.user.id }, coach.token);
    assert.equal(sent.sent, true);
    assert.match(sent.href, new RegExp(`program=${program.id}`));
    assert.equal(db.prepare('SELECT athlete_user_id FROM athlete_programs_v2 WHERE id=?').get(program.id).athlete_user_id, athlete.user.id);
    assert.ok(db.prepare('SELECT sent_at FROM athlete_programs_v2 WHERE id=?').get(program.id).sent_at);
    const notice = db.prepare("SELECT href FROM user_notifications WHERE user_id=? AND entity_type='training_program'").get(athlete.user.id);
    assert.match(notice.href, new RegExp(`program=${program.id}`));
    assert.equal(emails.length, beforeSendEmails + 1);
    await call('dashboard/programs/' + program.id + '/send', 'POST', { athlete_user_id: athlete.user.id }, coach.token, 409);

    await call('connections/' + connection.id + '/close', 'POST', {}, coach.token);
    const completed = await call('dashboard/athletes', 'GET', undefined, coach.token);
    assert.equal(completed.counts.completed, 1);
  } finally { restore(); db.close(); }
});

test('notification preferences can disable dashboard and email delivery', async () => {
  const { db, call } = setup();
  try {
    const { coach, athlete } = await fixtures(db, call);
    const request = await call('connections', 'POST', { coach_user_id: coach.user.id }, athlete.token, 201);
    await call('dashboard/notification-preferences', 'PATCH', { dashboard_enabled: false, email_enabled: false }, coach.token);
    const prefs = await call('dashboard/notification-preferences', 'GET', undefined, coach.token);
    assert.equal(prefs.dashboard_enabled, false);
    assert.equal(prefs.email_enabled, false);
    const notices = db.prepare("SELECT COUNT(*) AS count FROM user_notifications WHERE user_id=? AND entity_id=?").get(coach.user.id, request.id).count;
    assert.ok(notices >= 1, 'existing notice is preserved');
  } finally { db.close(); }
});

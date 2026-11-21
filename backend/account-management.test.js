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

const password = 'account-management-test-password';

async function registerAccounts(env) {
  const admin = await call(env, 'auth/register', 'POST', {
    email: env.ADMIN_EMAILS, password, consent: true,
  }, null, 201);
  const member = await call(env, 'auth/register', 'POST', {
    email: 'athlete@example.test', password, consent: true, account_type: 'member',
  }, null, 201);
  const coach = await call(env, 'auth/register', 'POST', {
    email: 'coach@example.test', password, consent: true, provider_type: 'coach', display_name: 'Test Coach', city: 'Doha',
  }, null, 201);
  return { admin, member, coach };
}

function seedRelated(db, athleteId, coachId) {
  const bookingId = crypto.randomUUID(), programId = crypto.randomUUID();
  db.prepare(`INSERT INTO booking_requests(id,customer_user_id,customer_name,customer_email,customer_phone,city,goal_summary,consent_at,status,created_at,payment_status,session_type,service_name)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(bookingId, athleteId, 'Synthetic Athlete', 'athlete@example.test', '+974 5555 1234', 'Doha', 'Synthetic test booking',
      new Date().toISOString(), 'cancelled', new Date().toISOString(), 'cancelled', 'training', '');
  db.prepare(`INSERT INTO athlete_programs_v2(id,coach_user_id,athlete_user_id,athlete_name,athlete_phone,athlete_type,week_start,created_at)
    VALUES(?,?,?,?,?,?,?,?)`)
    .run(programId, coachId, athleteId, 'Synthetic Athlete', '+97455551234', 'runner', '2026-11-16', new Date().toISOString());
  return { bookingId, programId };
}

async function approveCoach(env, adminToken, profileId) {
  const result = await call(env, 'admin/providers/' + profileId, 'PATCH', {
    status: 'approved', verified: true,
  }, adminToken);
  assert.equal(result.updated, true);
  return result;
}

test('an athlete becomes a coach applicant in place, with no early coach permissions', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, member, coach } = await registerAccounts(env);
    const related = seedRelated(db, member.user.id, coach.user.id);
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;

    const converted = await call(env, 'admin/accounts/' + member.user.id + '/coach-application', 'POST', {
      display_name: 'Synthetic Athlete Coach', city: 'Doha', provider_type: 'coach',
    }, admin.token);
    assert.equal(converted.submission_state, 'draft');
    assert.match(converted.profile_id, /^[\w-]{36}$/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, userCount, 'no duplicate user is created');
    assert.equal(db.prepare('SELECT email,role FROM users WHERE id=?').get(member.user.id).email, 'athlete@example.test');

    const signedIn = await call(env, 'auth/login', 'POST', { email: 'athlete@example.test', password });
    assert.equal(signedIn.user.id, member.user.id, 'same identity and password still sign in');
    assert.equal(signedIn.account_type, 'provider', 'the applicant receives onboarding access only');

    const before = await call(env, 'providers');
    assert.equal(before.providers.some((p) => p.id === converted.profile_id), false, 'draft is not public');
    const queue = await call(env, 'admin/applications', 'GET', undefined, admin.token);
    assert.equal(queue.providers.some((p) => p.id === converted.profile_id), false, 'draft stays out of review queue');
    assert.equal(queue.draft_providers.some((p) => p.id === converted.profile_id), true);

    const draftDecision = await call(env, 'admin/providers/' + converted.profile_id, 'PATCH', {
      status: 'approved', verified: true,
    }, admin.token, 409);
    assert.equal(draftDecision.error, 'profile_not_submitted');

    const submitted = await call(env, 'me/profile', 'PUT', {
      provider_type: 'coach', display_name: 'Synthetic Athlete Coach', city: 'Doha',
      specialties: ['Running'], bio: 'Completed synthetic onboarding.', program_durations: [1],
    }, signedIn.token);
    assert.equal(submitted.submission_state, 'submitted');
    await approveCoach(env, admin.token, converted.profile_id);

    const after = await call(env, 'providers');
    assert.equal(after.providers.some((p) => p.id === converted.profile_id), true, 'public profile opens only after approval');
    const detail = await call(env, 'admin/accounts/' + member.user.id, 'GET', undefined, admin.token);
    assert.equal(detail.account.profile_status, 'approved');
    assert.equal(detail.account.booking_count, 1);
    assert.equal(detail.account.program_count, 1);
    assert.equal(db.prepare('SELECT id FROM booking_requests WHERE id=?').get(related.bookingId)?.id, related.bookingId);
    assert.equal(db.prepare('SELECT id FROM athlete_programs_v2 WHERE id=?').get(related.programId)?.id, related.programId);
    assert.equal(detail.events.some((e) => e.action === 'coach_application_opened'), true);
  } finally { db.close(); }
});

test('suspension revokes sessions and blocks login, listings, bookings and approval', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, coach } = await registerAccounts(env);
    const profileId = db.prepare('SELECT id FROM provider_profiles WHERE user_id=?').get(coach.user.id).id;
    await approveCoach(env, admin.token, profileId);

    const suspended = await call(env, 'admin/accounts/' + coach.user.id + '/suspend', 'POST', {
      reason: 'Synthetic suspension test',
    }, admin.token);
    assert.equal(suspended.account_status, 'suspended');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id=?').get(coach.user.id).count, 0);

    await call(env, 'me/access', 'GET', undefined, coach.token, 401);
    const blockedLogin = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password }, null, 403);
    assert.equal(blockedLogin.error, 'account_unavailable');

    const listings = await call(env, 'providers');
    assert.equal(listings.providers.some((p) => p.id === profileId), false);
    const booking = await call(env, 'bookings', 'POST', {
      provider_id: profileId, customer_name: 'Synthetic Customer', customer_email: 'customer@example.test',
      customer_phone: '+974 5555 9876', city: 'Doha', goal_summary: 'Synthetic booking', session_type: 'training',
      program_duration_months: 1, consent: true,
    }, null, 404);
    assert.equal(booking.error, 'provider_unavailable');
    const approval = await call(env, 'admin/providers/' + profileId, 'PATCH', {
      status: 'approved', verified: true,
    }, admin.token, 409);
    assert.equal(approval.error, 'account_not_active');

    const detail = await call(env, 'admin/accounts/' + coach.user.id, 'GET', undefined, admin.token);
    assert.equal(detail.account.account_status, 'suspended');
    assert.equal(detail.events.some((e) => e.action === 'account_suspended'), true);

    await call(env, 'admin/accounts/' + coach.user.id + '/reactivate', 'POST', {}, admin.token);
    await call(env, 'me/access', 'GET', undefined, coach.token, 401);
    const restored = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password });
    const access = await call(env, 'me/access', 'GET', undefined, restored.token);
    assert.equal(access.account_status, 'active');
  } finally { db.close(); }
});

test('deletion requires typed confirmation, anonymizes identity and retains related records', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, member, coach } = await registerAccounts(env);
    const profileId = db.prepare('SELECT id FROM provider_profiles WHERE user_id=?').get(coach.user.id).id;
    const related = seedRelated(db, member.user.id, coach.user.id);
    await approveCoach(env, admin.token, profileId);

    const wrong = await call(env, 'admin/accounts/' + coach.user.id + '/delete', 'POST', {
      confirm_email: 'wrong@example.test', confirm_phrase: 'DELETE',
    }, admin.token, 400);
    assert.equal(wrong.error, 'confirmation_required');
    assert.equal(db.prepare('SELECT account_status FROM users WHERE id=?').get(coach.user.id).account_status, 'active');

    const deleted = await call(env, 'admin/accounts/' + coach.user.id + '/delete', 'POST', {
      confirm_email: 'coach@example.test', confirm_phrase: 'DELETE',
    }, admin.token);
    assert.equal(deleted.anonymized, true);
    assert.equal(deleted.bookings_preserved, true);
    assert.notEqual(db.prepare('SELECT email FROM users WHERE id=?').get(coach.user.id).email, 'coach@example.test');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id=?').get(coach.user.id).count, 0);
    assert.equal(db.prepare('SELECT status,display_name FROM provider_profiles WHERE id=?').get(profileId).status, 'rejected');
    assert.equal(db.prepare('SELECT id FROM booking_requests WHERE id=?').get(related.bookingId)?.id, related.bookingId);

    await call(env, 'me/access', 'GET', undefined, coach.token, 401);
    const oldLogin = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password }, null, 401);
    assert.equal(oldLogin.error, 'invalid_credentials', 'the old email is no longer an identity');
    const listings = await call(env, 'providers');
    assert.equal(listings.providers.some((p) => p.id === profileId), false);

    const detail = await call(env, 'admin/accounts/' + coach.user.id, 'GET', undefined, admin.token);
    assert.equal(detail.account.account_status, 'deleted');
    assert.equal(detail.events.some((e) => e.action === 'account_deleted'), true);
    const repeat = await call(env, 'admin/accounts/' + coach.user.id + '/delete', 'POST', {
      confirm_email: 'coach@example.test', confirm_phrase: 'DELETE',
    }, admin.token, 409);
    assert.equal(repeat.error, 'account_already_deleted');
  } finally { db.close(); }
});

test('account controls are viewable by scoped management but mutable only by full administrators', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, member, coach } = await registerAccounts(env);
    await call(env, 'admin/management/permissions', 'PUT', {
      email: 'coach@example.test', permissions: ['management.view', 'management.coaches'],
    }, admin.token);
    const manager = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password });
    assert.equal(manager.account_type, 'manager');

    const visible = await call(env, 'admin/accounts/' + member.user.id, 'GET', undefined, manager.token);
    assert.equal(visible.account.email, 'athlete@example.test');
    const denied = await call(env, 'admin/accounts/' + member.user.id + '/suspend', 'POST', {
      reason: 'Synthetic unauthorized action',
    }, manager.token, 403);
    assert.equal(denied.error, 'admin_required');
    assert.equal(db.prepare('SELECT account_status FROM users WHERE id=?').get(member.user.id).account_status, 'active');

    const memberDenied = await call(env, 'admin/accounts/' + member.user.id, 'GET', undefined, member.token, 403);
    assert.equal(memberDenied.error, 'forbidden');
    const protectedAdmin = await call(env, 'admin/accounts/' + admin.user.id + '/suspend', 'POST', {
      reason: 'Synthetic protected action',
    }, admin.token, 409);
    assert.equal(protectedAdmin.error, 'account_protected');

    const duplicate = await call(env, 'admin/accounts/' + coach.user.id + '/coach-application', 'POST', {
      provider_type: 'coach',
    }, admin.token, 409);
    assert.equal(duplicate.error, 'coach_application_exists');
  } finally { db.close(); }
});

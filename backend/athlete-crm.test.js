import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';
import {
  ATHLETE_INVITATION_URL, ATHLETE_INVITATION_TTL_DAYS,
  normalizeTerms, onboardingIncomplete, lastActivityAt, isActive,
  coachMatches, invitationEmail,
} from './athlete-crm.js';

const PASSWORD = 'athlete-crm-local-test-password';
let ipCounter = 0;

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b))) {
    db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const env = {
    DATA_COLLECTION_ENABLED: 'true',
    ADMIN_EMAILS: 'admin@example.test',
    ADMIN_SETUP_KEY: 'local-crm-setup-key',
    PUBLIC_ORIGINS: 'https://mzactive.com',
    // Deliberately fake; no production credential is read by tests.
    RESEND_API_KEY: 'test-only-mail-key',
    EMAIL_FROM: 'MZActive Community <no-reply@example.test>',
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql);
        // Match production D1: bind() returns a NEW prepared statement and
        // must never mutate the statement it was called on.
        const statement = (params = []) => ({
          bind(...values) { return statement(values); },
          first() { return stmt.get(...params); },
          all() { return { results: stmt.all(...params) }; },
          run() { return { meta: stmt.run(...params) }; },
        });
        return statement();
      },
      batch(statements) {
        db.exec('BEGIN');
        try {
          const results = statements.map((statement) => statement.run());
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
  const headers = { 'CF-Connecting-IP': `127.0.0.${(ipCounter++ % 200) + 1}` };
  if (body?.email === env.ADMIN_EMAILS && method === 'POST' && path === 'auth/register') {
    headers['x-admin-setup-key'] = env.ADMIN_SETUP_KEY;
  }
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
    if (typeof fail === 'function' ? fail() : fail) {
      return new Response(JSON.stringify({ error: 'mock_delivery_failure' }), { status: 500 });
    }
    return new Response(JSON.stringify({ id: 'mock_email_' + emails.length }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  return () => { globalThis.fetch = original; };
}

function invitationToken(email) {
  const match = /[?&]token=([\w-]{20,120})/.exec(email.body.text);
  assert.ok(match, 'the invitation email must contain a token link');
  return match[1];
}

async function registerAccounts(env) {
  const register = (email, extra) => call(env, 'auth/register', 'POST', { email, password: PASSWORD, consent: true, ...extra }, null, 201);
  const [admin, manager, athleteA, athleteB, athleteC, coachA, coachB, coachPending] = await Promise.all([
    register(env.ADMIN_EMAILS),
    register('manager@example.test', { account_type: 'member' }),
    register('athlete-a@example.test', { account_type: 'member' }),
    register('athlete-b@example.test', { account_type: 'member' }),
    register('athlete-c@example.test', { account_type: 'member' }),
    register('coach-a@example.test', { provider_type: 'coach' }),
    register('coach-b@example.test', { provider_type: 'coach' }),
    register('coach-pending@example.test', { provider_type: 'coach' }),
  ]);
  return { admin, manager, athleteA, athleteB, athleteC, coachA, coachB, coachPending };
}

function seedProfiles(db, users) {
  const stamp = new Date().toISOString();
  const old = new Date(Date.now() - 60 * 86400000).toISOString();
  const approve = (userId, fields) => db.prepare(`UPDATE provider_profiles SET
    status='approved', verified=1, display_name=?, city=?, specialties_json=?, languages_json=?,
    services_json=?, coaching_mode=?, bio=?, updated_at=? WHERE user_id=?`)
    .run(fields.name, fields.city, JSON.stringify(fields.specialties), JSON.stringify(fields.languages),
      JSON.stringify(fields.services), fields.mode, fields.bio, stamp, userId);
  approve(users.coachA.user.id, {
    name: 'Approved Running Coach', city: 'Doha', specialties: ['running'],
    languages: ['English'], services: ['Running coaching'], mode: 'both', bio: 'Runner and race preparation specialist',
  });
  approve(users.coachB.user.id, {
    name: 'Approved Swimming Coach', city: 'London', specialties: ['swimming'],
    languages: ['Arabic'], services: ['Swimming lessons'], mode: 'online', bio: 'Swimming and technique specialist',
  });
  db.prepare("UPDATE provider_profiles SET display_name='Pending Coach', city='Doha', specialties_json='[\"running\"]' WHERE user_id=?")
    .run(users.coachPending.user.id);

  const insertProfile = (userId, values) => db.prepare(`INSERT INTO member_sports_profiles
    (user_id,display_name,city,sports_json,experience_level,goals,age_range,gender,garmin_public_url,preferred_language,availability_notes,updated_at)
    VALUES(?,?,?,?,?,?,?,?,'',?,?,?)`)
    .run(userId, values.name, values.city, JSON.stringify(values.sports), values.experience,
      values.goals, values.ageRange, values.gender, values.language, values.availability, values.updatedAt);
  insertProfile(users.athleteA.user.id, {
    name: 'Complete Athlete', city: 'Doha', sports: ['running'], experience: 'intermediate',
    goals: 'Improve my race pace', ageRange: '30-39', gender: 'female', language: 'en',
    availability: 'online evenings', updatedAt: stamp,
  });
  insertProfile(users.athleteC.user.id, {
    name: 'Partial Athlete', city: 'Doha', sports: [], experience: '', goals: '',
    ageRange: '', gender: '', language: 'ar', availability: '', updatedAt: stamp,
  });
  // Athlete B intentionally has no sports profile row at all.
  return {
    coachAId: db.prepare('SELECT id FROM provider_profiles WHERE user_id=?').get(users.coachA.user.id).id,
    coachBId: db.prepare('SELECT id FROM provider_profiles WHERE user_id=?').get(users.coachB.user.id).id,
    coachPendingId: db.prepare('SELECT id FROM provider_profiles WHERE user_id=?').get(users.coachPending.user.id).id,
    old,
  };
}

test('CRM helpers normalize verified fields, derive status and explain matches', () => {
  assert.equal(ATHLETE_INVITATION_URL, 'https://mzactive.com/athlete-invitations.html');
  assert.equal(ATHLETE_INVITATION_TTL_DAYS, 14);
  assert.deepEqual(normalizeTerms(['Running', 'soccer', 'a']), ['running', 'football']);

  const stamp = new Date().toISOString();
  assert.equal(onboardingIncomplete(null), true);
  assert.equal(onboardingIncomplete({ updated_at: stamp, display_name: 'Athlete', sports: ['running'], goals: 'Race' }), false);
  assert.equal(onboardingIncomplete({ profile_updated_at: stamp, display_name: 'Athlete', sports: ['running'], goals: 'Race' }), false);
  assert.equal(onboardingIncomplete({ updated_at: stamp, display_name: 'Athlete', sports: [], goals: 'Race' }), true);
  assert.equal(onboardingIncomplete({ updated_at: stamp, display_name: 'Athlete', sports: ['running'], goals: '' }), true);

  const now = Date.now();
  const row = {
    profile_updated_at: new Date(now - 60_000).toISOString(),
    booking_created_at: new Date(now - 86_400_000).toISOString(),
  };
  assert.equal(lastActivityAt(row), row.profile_updated_at);
  assert.equal(isActive(row, now), true);
  assert.equal(isActive({ profile_updated_at: new Date(now - 31 * 86400000).toISOString() }, now), false);

  const matches = coachMatches({
    sports: ['running'], goals: 'Improve my race pace', city: 'Doha',
    preferred_language: 'en', availability_notes: 'online evenings',
  }, [
    { id: 'coach-a', specialties: ['running'], services: ['Running coaching'], bio: 'Race pace', city: 'Doha', languages: ['English'], coaching_mode: 'both' },
    { id: 'coach-b', specialties: ['swimming'], services: ['Swimming'], bio: '', city: 'London', languages: ['Arabic'], coaching_mode: 'online' },
  ]);
  assert.equal(matches[0].coach_id, 'coach-a');
  assert.ok(matches[0].reasons.some((reason) => reason.code === 'approved_coach'));
  assert.ok(matches[0].reasons.some((reason) => reason.code === 'sport_match'));
  assert.ok(matches[0].reasons.some((reason) => reason.code === 'location_match'));
  assert.ok(matches[0].reasons.some((reason) => reason.code === 'language_match'));
  assert.ok(matches.every((match) => match.score <= 100));

  const email = invitationEmail('coach', {
    athleteName: '<script>alert(1)</script>', coachName: 'Approved Running Coach', language: 'ar',
  }, 'example-token-value-1234567890');
  assert.match(email.html, /dir="rtl"/);
  assert.match(email.html, /dir="ltr"/);
  assert.ok(!email.html.includes('<script>'));
  assert.match(email.text, /token=example-token-value-1234567890/);
  assert.match(email.subject, /مدرب مقترح/);
});

test('athlete directory derives counts, filters, search and sorting from live records', async () => {
  const { db, env } = makeEnv();
  try {
    const users = await registerAccounts(env);
    seedProfiles(db, users);
    const directory = await call(env, 'admin/athletes', 'GET', undefined, users.admin.token);
    // The manager fixture is also a member account, so it appears in the CRM.
    assert.equal(directory.counts.all, 4);
    assert.equal(directory.counts.assigned, 0);
    assert.equal(directory.counts.unassigned, 4);
    assert.equal(directory.counts.active, 2);
    assert.equal(directory.counts.inactive, 2);
    assert.equal(directory.counts.onboarding_incomplete, 3);
    for (const athlete of directory.athletes) {
      assert.equal(athlete.role, undefined);
      assert.ok(athlete.id && athlete.email && athlete.assignment_status);
    }

    const incomplete = await call(env, 'admin/athletes?filter=onboarding_incomplete', 'GET', undefined, users.admin.token);
    assert.equal(incomplete.athletes.length, 3);
    assert.ok(incomplete.athletes.some((athlete) => athlete.id === users.manager.user.id));
    assert.ok(incomplete.athletes.some((athlete) => athlete.id === users.athleteB.user.id));
    assert.ok(incomplete.athletes.some((athlete) => athlete.id === users.athleteC.user.id));
    const inactive = await call(env, 'admin/athletes?filter=inactive', 'GET', undefined, users.admin.token);
    assert.deepEqual(inactive.athletes.map((athlete) => athlete.id).sort(), [users.manager.user.id, users.athleteB.user.id].sort());
    const searched = await call(env, 'admin/athletes?q=running', 'GET', undefined, users.admin.token);
    assert.equal(searched.counts.all, 1);
    assert.equal(searched.athletes[0].id, users.athleteA.user.id);
    const sorted = await call(env, 'admin/athletes?sort=name', 'GET', undefined, users.admin.token);
    assert.deepEqual(sorted.athletes.map((athlete) => athlete.name), ['athlete-b', 'Complete Athlete', 'manager', 'Partial Athlete']);
  } finally { db.close(); }
});

test('athlete detail exposes only this account\'s authorized records', async () => {
  const { db, env } = makeEnv();
  try {
    const users = await registerAccounts(env);
    seedProfiles(db, users);
    const detail = await call(env, 'admin/athletes/' + users.athleteA.user.id, 'GET', undefined, users.admin.token);
    assert.equal(detail.athlete.id, users.athleteA.user.id);
    assert.equal(detail.athlete.name, 'Complete Athlete');
    assert.equal(detail.athlete.preferred_language, 'en');
    assert.equal(detail.athlete.availability_notes, 'online evenings');
    assert.deepEqual(detail.athlete.sports, ['running']);
    assert.ok(detail.athlete.registered_at);
    assert.deepEqual(detail.coaches, []);
    assert.deepEqual(detail.invitations, []);
    assert.deepEqual(detail.programs, []);
    assert.deepEqual(detail.bookings, []);
    assert.deepEqual(detail.messages, []);
    assert.equal(JSON.stringify(detail).includes(users.athleteB.email), false);
    await call(env, 'admin/athletes/00000000-0000-4000-8000-000000000000', 'GET', undefined, users.admin.token, 404);
  } finally { db.close(); }
});

test('AI recommendations use approved coaches, verified fields and an explicit disclaimer', async () => {
  const { db, env } = makeEnv();
  try {
    const users = await registerAccounts(env);
    const profiles = seedProfiles(db, users);
    const data = await call(env, 'admin/athletes/' + users.athleteA.user.id + '/recommendations', 'GET', undefined, users.admin.token);
    assert.equal(data.athlete_id, users.athleteA.user.id);
    assert.ok(data.matches.length >= 1);
    assert.ok(data.matches.some((match) => match.coach_id === profiles.coachAId));
    assert.equal(data.matches.some((match) => match.coach_id === profiles.coachPendingId), false);
    assert.ok(data.matches[0].reasons.some((reason) => reason.code === 'approved_coach'));
    assert.ok(data.next_steps.length >= 1);
    assert.ok(data.drafts.length >= 1);
    assert.ok(data.drafts.every((draft) => draft.requires_approval === true));
    assert.match(data.disclaimer.en, /No medical advice/);
    assert.match(data.disclaimer.ar, /تشخيصاً طبياً/);

    const detail = await call(env, 'admin/athletes/' + users.athleteA.user.id, 'GET', undefined, users.admin.token);
    assert.ok(detail.audit.some((event) => event.action === 'recommendations_viewed'));
  } finally { db.close(); }
});

test('a profile invitation is consent-only, hashed, bilingual, and opens no workspace', async () => {
  const { db, env } = makeEnv();
  const emails = [];
  const restore = mockResend(emails);
  try {
    const users = await registerAccounts(env);
    seedProfiles(db, users);
    const result = await call(env, 'admin/athletes/' + users.athleteB.user.id + '/invitations/profile', 'POST',
      { language: 'ar' }, users.admin.token, 201);
    assert.equal(result.invitation.kind, 'profile');
    assert.equal(result.invitation.language, 'ar');
    assert.ok(!JSON.stringify(result).includes('token'));

    const stored = db.prepare('SELECT * FROM athlete_crm_invitations WHERE id=?').get(result.invitation.id);
    assert.equal(stored.language, 'ar');
    assert.equal(stored.token_hash.length, 43);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM athlete_crm_invitations WHERE token_hash=?').get(stored.token_hash).count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM coach_connections WHERE athlete_user_id=?').get(users.athleteB.user.id).count, 0);

    const token = invitationToken(emails[0]);
    const view = await call(env, 'athlete-invitations/' + token, 'GET');
    assert.equal(view.invitation.kind, 'profile');
    assert.equal(view.invitation.status, 'pending');
    assert.equal(view.invitation.athlete_name, 'athlete-b');
    assert.ok(view.invitation.expires_at > view.invitation.created_at);

    const accepted = await call(env, 'athlete-invitations/' + token, 'POST', { action: 'accept' });
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.workspace_active, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM coach_connections WHERE athlete_user_id=?').get(users.athleteB.user.id).count, 0);
    const detail = await call(env, 'admin/athletes/' + users.athleteB.user.id, 'GET', undefined, users.admin.token);
    assert.ok(detail.audit.some((event) => event.action === 'profile_invited'));
    assert.ok(detail.audit.some((event) => event.action === 'profile_invite_accepted'));
    await call(env, 'athlete-invitations/' + token, 'POST', { action: 'accept' }, null, 404);
  } finally { restore(); db.close(); }
});

test('coach workspace opens only on acceptance and can be revoked or reassigned with an audit trail', async () => {
  const { db, env } = makeEnv();
  const emails = [];
  const restore = mockResend(emails);
  try {
    const users = await registerAccounts(env);
    const profiles = seedProfiles(db, users);
    const athleteId = users.athleteA.user.id;

    const first = await call(env, `admin/athletes/${athleteId}/invitations/coach`, 'POST',
      { coach_id: profiles.coachAId, language: 'en', reasons: ['sport_match', 'location_match'] }, users.admin.token, 201);
    assert.equal(first.invitation.status, 'pending');
    const connectionId = db.prepare('SELECT id,status,workspace_status FROM coach_connections WHERE athlete_user_id=?').get(athleteId);
    assert.equal(connectionId.status, 'pending');
    assert.equal(connectionId.workspace_status, 'none');
    await call(env, 'admin/athletes', 'GET', undefined, users.coachA.token, 403);

    const declined = await call(env, 'athlete-invitations/' + invitationToken(emails[0]), 'POST', { action: 'decline' });
    assert.equal(declined.status, 'declined');
    assert.equal(declined.workspace_active, false);
    assert.equal(db.prepare('SELECT workspace_status FROM coach_connections WHERE id=?').get(connectionId.id).workspace_status, 'closed');

    await call(env, `admin/athletes/${athleteId}/invitations/coach`, 'POST',
      { coach_id: profiles.coachAId, language: 'en' }, users.admin.token, 201);
    const accepted = await call(env, 'athlete-invitations/' + invitationToken(emails[1]), 'POST', { action: 'accept' });
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.workspace_active, true);
    assert.equal(db.prepare('SELECT status,workspace_status FROM coach_connections WHERE id=?').get(connectionId.id).workspace_status, 'active');
    assert.ok(db.prepare('SELECT id FROM user_notifications WHERE user_id=?').get(users.coachA.user.id));

    const reassigned = await call(env, `admin/athletes/${athleteId}/reassign`, 'POST',
      { coach_id: profiles.coachBId, language: 'ar' }, users.admin.token, 201);
    assert.equal(reassigned.invitation.kind, 'coach');
    assert.equal(db.prepare('SELECT workspace_status FROM coach_connections WHERE id=?').get(connectionId.id).workspace_status, 'closed');
    const secondConnection = db.prepare("SELECT id FROM coach_connections WHERE athlete_user_id=? AND coach_user_id=?").get(athleteId, users.coachB.user.id);
    assert.ok(secondConnection);
    assert.equal(db.prepare('SELECT status FROM coach_connections WHERE id=?').get(secondConnection.id).status, 'pending');
    await call(env, 'athlete-invitations/' + invitationToken(emails[2]), 'POST', { action: 'accept' });
    assert.equal(db.prepare('SELECT workspace_status FROM coach_connections WHERE id=?').get(secondConnection.id).workspace_status, 'active');

    await call(env, `admin/athletes/${athleteId}/connections/${secondConnection.id}/revoke`, 'POST', {}, users.admin.token);
    assert.equal(db.prepare('SELECT workspace_status FROM coach_connections WHERE id=?').get(secondConnection.id).workspace_status, 'closed');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM coach_connections WHERE athlete_user_id=? AND workspace_status=\'active\'').get(athleteId).count, 0);

    const detail = await call(env, 'admin/athletes/' + athleteId, 'GET', undefined, users.admin.token);
    for (const action of ['coach_invited', 'coach_invite_declined', 'coach_invite_accepted', 'coach_assigned', 'coach_reassigned', 'coach_revoked']) {
      assert.ok(detail.audit.some((event) => event.action === action), action);
    }
  } finally { restore(); db.close(); }
});

test('reassignment requires an existing active workspace and invitations cannot duplicate pending coaches', async () => {
  const { db, env } = makeEnv();
  const emails = [];
  const restore = mockResend(emails);
  try {
    const users = await registerAccounts(env);
    const profiles = seedProfiles(db, users);
    const athleteId = users.athleteA.user.id;
    await call(env, `admin/athletes/${athleteId}/reassign`, 'POST', { coach_id: profiles.coachAId }, users.admin.token, 409);
    const first = await call(env, `admin/athletes/${athleteId}/invitations/coach`, 'POST', { coach_id: profiles.coachAId }, users.admin.token, 201);
    assert.equal(first.invitation.status, 'pending');
    await call(env, `admin/athletes/${athleteId}/invitations/coach`, 'POST', { coach_id: profiles.coachAId }, users.admin.token, 409);
    await call(env, `admin/athletes/${athleteId}/invitations/coach`, 'POST', { coach_id: users.athleteA.user.id }, users.admin.token, 404);
  } finally { restore(); db.close(); }
});

test('failed invitation email is queued as email_failed and a resend rotates the token', async () => {
  const { db, env } = makeEnv();
  const emails = [];
  let fail = true;
  const restore = mockResend(emails, () => fail);
  try {
    const users = await registerAccounts(env);
    seedProfiles(db, users);
    const athleteId = users.athleteA.user.id;
    const result = await call(env, `admin/athletes/${athleteId}/invitations/profile`, 'POST', { language: 'en' }, users.admin.token, 503);
    assert.equal(result.error, 'email_unavailable');
    const stored = db.prepare('SELECT status,email_status,token_hash FROM athlete_crm_invitations WHERE id=?').get(result.invitation.id);
    assert.equal(stored.status, 'email_failed');
    assert.equal(stored.email_status, 'failed');

    fail = false;
    const resent = await call(env, `admin/athletes/${athleteId}/invitations/${result.invitation.id}/resend`, 'POST', {}, users.admin.token, 201);
    assert.equal(resent.ok, true);
    const after = db.prepare('SELECT status,email_status,token_hash FROM athlete_crm_invitations WHERE id=?').get(result.invitation.id);
    assert.equal(after.status, 'pending');
    assert.equal(after.email_status, 'sent');
    assert.notEqual(after.token_hash, stored.token_hash);
    const detail = await call(env, 'admin/athletes/' + athleteId, 'GET', undefined, users.admin.token);
    assert.ok(detail.audit.some((event) => event.action === 'invitation_resent'));
  } finally { restore(); db.close(); }
});

test('CRM routes respect management permissions and never expose athlete data to coaches', async () => {
  const { db, env } = makeEnv();
  try {
    const users = await registerAccounts(env);
    seedProfiles(db, users);
    await call(env, 'admin/management/permissions', 'PUT',
      { email: users.manager.user.email, permissions: ['management.view', 'management.coaches'] }, users.admin.token);

    await call(env, 'admin/athletes', 'GET', undefined, users.manager.token, 200);
    await call(env, 'admin/athletes/' + users.athleteA.user.id, 'GET', undefined, users.manager.token, 200);
    await call(env, 'admin/athletes/' + users.athleteA.user.id + '/recommendations', 'GET', undefined, users.manager.token, 403);
    await call(env, 'admin/athletes', 'GET', undefined, users.coachA.token, 403);
    await call(env, 'admin/athletes/' + users.athleteA.user.id, 'GET', undefined, users.coachA.token, 403);

    await call(env, 'admin/management/permissions', 'PUT',
      { email: users.manager.user.email, permissions: ['management.view', 'management.coaches', 'management.ai'] }, users.admin.token);
    await call(env, 'admin/athletes/' + users.athleteA.user.id + '/recommendations', 'GET', undefined, users.manager.token, 200);
  } finally { db.close(); }
});

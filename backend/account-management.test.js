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

    await call(env, 'admin/accounts/' + coach.user.id + '/reactivate', 'POST', { reason: 'Synthetic reactivation test' }, admin.token);
    await call(env, 'me/access', 'GET', undefined, coach.token, 401);
    const restored = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password });
    const access = await call(env, 'me/access', 'GET', undefined, restored.token);
    assert.equal(access.account_status, 'active');
  } finally { db.close(); }
});

test('hiding a profile removes public surfaces while keeping login and records, and restore is reversible', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, coach } = await registerAccounts(env);
    const profileId = db.prepare('SELECT id FROM provider_profiles WHERE user_id=?').get(coach.user.id).id;
    await approveCoach(env, admin.token, profileId);
    const before = await call(env, 'providers');
    assert.equal(before.providers.some((p) => p.id === profileId), true);

    const missingReason = await call(env, 'admin/accounts/' + coach.user.id + '/hide-profile', 'POST', {}, admin.token, 400);
    assert.equal(missingReason.error, 'reason_required');

    const hidden = await call(env, 'admin/accounts/' + coach.user.id + '/hide-profile', 'POST', {
      reason: 'Synthetic hide test',
    }, admin.token);
    assert.equal(hidden.profile_visibility, 'hidden');
    assert.equal(hidden.sessions_revoked, false);
    const row = db.prepare('SELECT profile_visibility,profile_hidden_at,profile_hidden_reason FROM users WHERE id=?').get(coach.user.id);
    assert.equal(row.profile_visibility, 'hidden');
    assert.ok(row.profile_hidden_at);
    assert.equal(row.profile_hidden_reason, 'Synthetic hide test');

    const after = await call(env, 'providers');
    assert.equal(after.providers.some((p) => p.id === profileId), false, 'hidden profile leaves public discovery');
    const session = await call(env, 'me/access', 'GET', undefined, coach.token);
    assert.equal(session.account_status, 'active', 'hiding does not revoke login');
    const signIn = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password });
    assert.equal(signIn.user.id, coach.user.id, 'hidden account can still sign in');

    const detail = await call(env, 'admin/accounts/' + coach.user.id, 'GET', undefined, admin.token);
    assert.equal(detail.account.profile_visibility, 'hidden');
    assert.equal(detail.events.some((e) => e.action === 'profile_hidden'), true);
    const directory = await call(env, 'admin/accounts?filter=hidden', 'GET', undefined, admin.token);
    assert.equal(directory.counts.hidden, 1);
    assert.equal(directory.accounts.length, 1);

    const duplicate = await call(env, 'admin/accounts/' + coach.user.id + '/hide-profile', 'POST', {
      reason: 'Synthetic repeat hide',
    }, admin.token, 409);
    assert.equal(duplicate.error, 'profile_already_hidden');

    const missingRestoreReason = await call(env, 'admin/accounts/' + coach.user.id + '/restore-profile', 'POST', {}, admin.token, 400);
    assert.equal(missingRestoreReason.error, 'reason_required');
    const restored = await call(env, 'admin/accounts/' + coach.user.id + '/restore-profile', 'POST', {
      reason: 'Synthetic restore test',
    }, admin.token);
    assert.equal(restored.profile_visibility, 'public');
    const restoredRow = db.prepare('SELECT profile_visibility,profile_hidden_at,profile_hidden_reason FROM users WHERE id=?').get(coach.user.id);
    assert.equal(restoredRow.profile_visibility, 'public');
    assert.equal(restoredRow.profile_hidden_at, null);
    assert.equal(restoredRow.profile_hidden_reason, null);
    const publicAfter = await call(env, 'providers');
    assert.equal(publicAfter.providers.some((p) => p.id === profileId), true, 'restore returns the profile to public discovery');
    const events = await call(env, 'admin/accounts/' + coach.user.id, 'GET', undefined, admin.token);
    assert.equal(events.events.some((e) => e.action === 'profile_restored'), true);

    const protectedAdmin = await call(env, 'admin/accounts/' + admin.user.id + '/hide-profile', 'POST', {
      reason: 'Synthetic protected hide',
    }, admin.token, 409);
    assert.equal(protectedAdmin.error, 'account_protected');
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
      confirm_email: 'coach@example.test', confirm_phrase: 'DELETE', reason: 'Synthetic deletion test',
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
      confirm_email: 'coach@example.test', confirm_phrase: 'DELETE', reason: 'Synthetic repeat deletion',
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
    assert.equal(visible.account.email, '[restricted]');
    assert.equal(visible.account.whatsapp_number, null);
    assert.equal(visible.account.identity_restricted, true);
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

test('super admins can edit contact fields with an audit event and session revocation', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, member } = await registerAccounts(env);
    const updated = await call(env, 'admin/accounts/' + member.user.id + '/update', 'POST', {
      email: 'athlete.updated@example.test', display_name: 'Synthetic Athlete', city: 'Doha', preferred_language: 'ar',
    }, admin.token);
    assert.deepEqual(updated.fields.sort(), ['city', 'display_name', 'email', 'preferred_language']);
    assert.equal(updated.sessions_revoked, true);
    assert.equal(db.prepare('SELECT email FROM users WHERE id=?').get(member.user.id).email, 'athlete.updated@example.test');
    assert.equal(db.prepare('SELECT token_hash FROM sessions WHERE user_id=?').get(member.user.id), undefined);
    const memberProfile = db.prepare('SELECT display_name,city,preferred_language FROM member_sports_profiles WHERE user_id=?').get(member.user.id);
    assert.equal(memberProfile.display_name, 'Synthetic Athlete');
    assert.equal(memberProfile.city, 'Doha');
    assert.equal(memberProfile.preferred_language, 'ar');
    const invalidWhatsapp = await call(env, 'admin/accounts/' + member.user.id + '/update', 'POST', {
      whatsapp_number: 'not-a-number',
    }, admin.token, 400);
    assert.equal(invalidWhatsapp.error, 'invalid_whatsapp');
    const contact = await call(env, 'admin/accounts/' + member.user.id + '/update', 'POST', {
      country: 'Qatar', whatsapp_number: '+974 5555 9999',
    }, admin.token);
    assert.equal(contact.fields.includes('whatsapp_number'), true);
    assert.equal(db.prepare('SELECT country,whatsapp_number FROM member_sports_profiles WHERE user_id=?').get(member.user.id).whatsapp_number, '97455559999');
    const clearedLanguage = await call(env, 'admin/accounts/' + member.user.id + '/update', 'POST', {
      preferred_language: '',
    }, admin.token);
    assert.deepEqual(clearedLanguage.fields, ['preferred_language']);
    assert.equal(db.prepare('SELECT preferred_language FROM member_sports_profiles WHERE user_id=?').get(member.user.id).preferred_language, '');
    const audit = await call(env, 'admin/accounts/' + member.user.id, 'GET', undefined, admin.token);
    assert.equal(audit.events.some((event) => event.action === 'account_updated'), true);
    const oldSession = await call(env, 'me/access', 'GET', undefined, member.token, 401);
    assert.equal(oldSession.error, 'unauthorized');

    const duplicate = await call(env, 'admin/accounts/' + member.user.id + '/update', 'POST', {
      email: 'coach@example.test',
    }, admin.token, 409);
    assert.equal(duplicate.error, 'email_in_use');
  } finally { db.close(); }
});

test('role changes create limited admins only and protect the last super admin', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, member, coach } = await registerAccounts(env);
    const promoted = await call(env, 'admin/accounts/' + member.user.id + '/role', 'POST', {
      role: 'admin',
    }, admin.token);
    assert.equal(promoted.super_admin, false);
    assert.equal(db.prepare('SELECT role,is_super_admin FROM users WHERE id=?').get(member.user.id).is_super_admin, 0);

    const limited = await call(env, 'auth/login', 'POST', { email: 'athlete@example.test', password });
    assert.equal(limited.account_type, 'limited_admin');
    assert.equal(limited.super_admin, false);
    await call(env, 'admin/accounts', 'GET', undefined, limited.token, 403);
    await call(env, 'admin/accounts/' + coach.user.id + '/suspend', 'POST', { reason: 'Synthetic' }, limited.token, 403);

    const granted = await call(env, 'admin/management/permissions', 'PUT', {
      email: 'athlete@example.test', permissions: ['management.view', 'management.coaches'],
    }, admin.token);
    assert.equal(granted.role, 'admin');
    const scoped = await call(env, 'auth/login', 'POST', { email: 'athlete@example.test', password });
    assert.equal(scoped.account_type, 'limited_admin');
    assert.deepEqual(scoped.management.permissions.sort(), ['management.coaches', 'management.view']);
    const visible = await call(env, 'admin/accounts', 'GET', undefined, scoped.token);
    assert.equal(Array.isArray(visible.accounts), true);
    await call(env, 'admin/accounts/' + coach.user.id + '/suspend', 'POST', { reason: 'Synthetic' }, scoped.token, 403);

    const elevated = await call(env, 'admin/accounts/' + member.user.id + '/role', 'POST', {
      role: 'admin', super_admin: true,
    }, admin.token);
    assert.equal(elevated.super_admin, true);
    const secondSuper = await call(env, 'auth/login', 'POST', { email: 'athlete@example.test', password });
    const protectedPeer = await call(env, 'admin/accounts/' + admin.user.id + '/update', 'POST', {
      city: 'Unauthorized change',
    }, secondSuper.token, 409);
    assert.equal(protectedPeer.error, 'account_protected');
    await call(env, 'admin/accounts/' + admin.user.id + '/role', 'POST', { role: 'provider' }, secondSuper.token);
    const self = await call(env, 'admin/accounts/' + member.user.id + '/role', 'POST', { role: 'provider' }, secondSuper.token, 409);
    assert.equal(self.error, 'account_protected');
  } finally { db.close(); }
});

test('program and report views expose only stored records to permitted managers', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, member, coach } = await registerAccounts(env);
    const { programId } = seedRelated(db, member.user.id, coach.user.id);
    await call(env, 'admin/accounts/' + member.user.id + '/update', 'POST', { city: 'Doha' }, admin.token);

    const programs = await call(env, 'admin/programs', 'GET', undefined, admin.token);
    assert.equal(programs.programs.length, 1);
    assert.equal(programs.programs[0].id, programId);
    assert.equal(programs.programs[0].athlete_user_id, member.user.id);
    assert.equal(programs.programs[0].access_linked, true);

    const reports = await call(env, 'admin/reports', 'GET', undefined, admin.token);
    assert.equal(reports.accounts.some((event) => event.action === 'account_updated'), true);

    await call(env, 'admin/management/permissions', 'PUT', {
      email: 'coach@example.test', permissions: ['management.view', 'management.coaches'],
    }, admin.token);
    const manager = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password });
    const scopedPrograms = await call(env, 'admin/programs', 'GET', undefined, manager.token);
    assert.equal(scopedPrograms.programs.length, 1);
    await call(env, 'admin/reports', 'GET', undefined, manager.token, 403);

    await call(env, 'admin/management/permissions', 'PUT', {
      email: 'coach@example.test', permissions: ['management.view', 'management.audit'],
    }, admin.token);
    const auditor = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password });
    const redacted = await call(env, 'admin/reports', 'GET', undefined, auditor.token);
    assert.equal(redacted.accounts.length > 0, true);
    assert.equal(redacted.accounts.every((event) => event.detail === null), true);
    assert.equal(redacted.authentication.every((event) => event.detail === null), true);
  } finally { db.close(); }
});

test('athlete quick trash is reversible and preserves identity, history and relationships', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, member, coach } = await registerAccounts(env);
    const related = seedRelated(db, member.user.id, coach.user.id);
    const before = db.prepare('SELECT email,password_hash,created_at FROM users WHERE id=?').get(member.user.id);

    const trashed = await call(env, 'admin/accounts/' + member.user.id + '/trash', 'POST',
      { reason: 'Mistaken import' }, admin.token);
    assert.equal(trashed.undoable, true);
    const deleted = db.prepare('SELECT * FROM users WHERE id=?').get(member.user.id);
    assert.equal(deleted.account_status, 'deleted');
    assert.equal(deleted.deleted_by, admin.user.id);
    assert.equal(deleted.email, before.email, 'email is preserved for restore');
    assert.equal(deleted.password_hash, before.password_hash, 'password is preserved');
    assert.equal(deleted.previous_account_status, 'active');

    await call(env, 'auth/login', 'POST', { email: 'athlete@example.test', password }, null, 403);
    const directory = await call(env, 'admin/athletes', 'GET', undefined, admin.token);
    assert.equal(directory.athletes.some((a) => a.id === member.user.id), false, 'trashed athlete leaves active list');
    const trash = await call(env, 'admin/trash?type=athletes', 'GET', undefined, admin.token);
    assert.equal(trash.accounts.some((a) => a.id === member.user.id), true);
    assert.equal(trash.accounts.find((a) => a.id === member.user.id).status_reason, 'Mistaken import');

    const restored = await call(env, 'admin/accounts/' + member.user.id + '/restore', 'POST', { undo: true }, admin.token);
    assert.equal(restored.ok, true);
    const after = db.prepare('SELECT * FROM users WHERE id=?').get(member.user.id);
    assert.equal(after.id, member.user.id, 'same account id, no duplicate');
    assert.equal(after.account_status, 'active');
    assert.equal(after.email, before.email);
    assert.equal(after.deleted_at, null);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM athlete_programs_v2 WHERE id=?').get(related.programId).count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM booking_requests WHERE id=?').get(related.bookingId).count, 1);
    const events = await call(env, 'admin/reports', 'GET', undefined, admin.token);
    assert.equal(events.accounts.some((e) => e.action === 'account_trashed'), true);
    assert.equal(events.accounts.some((e) => e.action === 'account_restored'), true);
  } finally { db.close(); }
});

test('trash permissions are server-side and admins cannot trash themselves', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, member, coach } = await registerAccounts(env);
    const self = await call(env, 'admin/accounts/' + admin.user.id + '/trash', 'POST', {}, admin.token, 409);
    assert.equal(self.error, 'account_protected');
    await call(env, 'admin/management/permissions', 'PUT', {
      email: 'coach@example.test', permissions: ['management.view'],
    }, admin.token);
    const manager = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password });
    await call(env, 'admin/trash', 'GET', undefined, manager.token);
    const denied = await call(env, 'admin/accounts/' + member.user.id + '/trash', 'POST', {}, manager.token, 403);
    assert.equal(denied.error, 'forbidden');
    const deniedRestore = await call(env, 'admin/accounts/' + member.user.id + '/restore', 'POST', {}, manager.token, 403);
    assert.equal(deniedRestore.error, 'forbidden');
  } finally { db.close(); }
});

test('trashing a coach preserves linked athlete programs', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, member, coach } = await registerAccounts(env);
    const related = seedRelated(db, member.user.id, coach.user.id);
    await call(env, 'admin/accounts/' + coach.user.id + '/trash', 'POST', { reason: 'Role review' }, admin.token);
    assert.equal(db.prepare('SELECT account_status FROM users WHERE id=?').get(coach.user.id).account_status, 'deleted');
    assert.equal(db.prepare('SELECT athlete_user_id FROM athlete_programs_v2 WHERE id=?').get(related.programId).athlete_user_id, member.user.id);
    const trash = await call(env, 'admin/trash?type=coaches', 'GET', undefined, admin.token);
    assert.equal(trash.accounts.some((a) => a.id === coach.user.id), true);
  } finally { db.close(); }
});

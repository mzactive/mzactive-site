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

const password = 'management-test-password';

async function accounts(env) {
  const admin = await call(env, 'auth/register', 'POST', {
    email: env.ADMIN_EMAILS, password, consent: true,
  }, null, 201);
  const coach = await call(env, 'auth/register', 'POST', {
    email: 'coach@example.test', password, consent: true, provider_type: 'coach',
  }, null, 201);
  const member = await call(env, 'auth/register', 'POST', {
    email: 'member@example.test', password, consent: true, account_type: 'member',
  }, null, 201);
  return { admin, coach, member };
}

test('login returns the backend-determined account category and destination', async () => {
  const { db, env } = makeEnv();
  try {
    const created = await accounts(env);
    assert.equal(created.admin.account_type, 'admin');
    assert.equal(created.admin.dashboard_path, '/admin.html');
    assert.equal(created.admin.management.enabled, true);
    assert.deepEqual(created.admin.management.permissions.includes('management.view'), true);

    assert.equal(created.coach.account_type, 'provider');
    assert.equal(created.coach.dashboard_path, '/providers.html');
    assert.equal(created.coach.management.enabled, false);
    assert.deepEqual(created.coach.management.permissions, []);

    assert.equal(created.member.account_type, 'member');
    assert.equal(created.member.dashboard_path, '/dashboard.html');
    assert.equal(created.member.management.enabled, false);

    for (const email of [env.ADMIN_EMAILS, 'coach@example.test', 'member@example.test']) {
      const signedIn = await call(env, 'auth/login', 'POST', { email, password });
      assert.equal(signedIn.dashboard_path, email === env.ADMIN_EMAILS ? '/admin.html' : email.startsWith('coach') ? '/providers.html' : '/dashboard.html');
      assert.equal(signedIn.account_type, email === env.ADMIN_EMAILS ? 'admin' : email.startsWith('coach') ? 'provider' : 'member');
      const access = await call(env, 'me/access', 'GET', undefined, signedIn.token);
      assert.equal(access.dashboard_path, signedIn.dashboard_path);
      assert.equal(access.account_type, signedIn.account_type);
    }
  } finally {
    db.close();
  }
});

test('management grants are explicit, scoped and cannot be self-assigned', async () => {
  const { db, env } = makeEnv();
  try {
    const created = await accounts(env);

    // An ungranted provider is an ordinary account, not a manager.
    await call(env, 'admin/agents', 'GET', undefined, created.coach.token, 403);
    await call(env, 'admin/applications', 'GET', undefined, created.coach.token, 403);

    await call(env, 'admin/management/permissions', 'PUT', {
      email: 'coach@example.test', permissions: ['management.view'],
    }, created.admin.token);
    const manager = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password });
    assert.equal(manager.account_type, 'manager');
    assert.equal(manager.dashboard_path, '/admin.html');
    assert.equal(manager.management.enabled, true);
    assert.deepEqual(manager.management.permissions, ['management.view']);

    const queue = await call(env, 'admin/applications', 'GET', undefined, manager.token);
    assert.equal(queue.providers !== undefined, true);
    await call(env, 'admin/auth-events', 'GET', undefined, manager.token, 403);
    await call(env, 'admin/community', 'GET', undefined, manager.token, 403);
    await call(env, 'admin/management/permissions', 'PUT', {
      email: 'member@example.test', permissions: ['management.view'],
    }, manager.token, 403);

    // Credential documents, contact details and licence numbers stay hidden from
    // delegated managers. Full administrators retain the reviewable source data.
    const profileId = db.prepare("SELECT id FROM provider_profiles WHERE user_id=(SELECT id FROM users WHERE email='coach@example.test')").get().id;
    db.prepare(`UPDATE provider_profiles SET display_name='Private Coach',provider_type='physiotherapist',license_number='LIC-PRIVATE-42',license_issuer='Private Board',certificate_number='CERT-PRIVATE-42',whatsapp_number='+97400000000',social_links_json='["https://private.example.invalid"]' WHERE id=?`).run(profileId);
    const redactedQueue = await call(env, 'admin/applications', 'GET', undefined, manager.token);
    const redacted = redactedQueue.providers.find((row) => row.id === profileId);
    assert.equal(redacted.credentials_restricted, true);
    for (const field of ['email', 'qualifications', 'certificate_name', 'certificate_issuer', 'certificate_number', 'license_number', 'license_issuer', 'license_country', 'license_expires_on', 'license_review_note', 'whatsapp_number', 'whatsapp_public', 'social_links_json', 'cv_file_name', 'cv_byte_size', 'cv_updated_at']) {
      assert.equal(field in redacted, false, 'manager must not receive ' + field);
    }
    const fullQueue = await call(env, 'admin/applications', 'GET', undefined, created.admin.token);
    const full = fullQueue.providers.find((row) => row.id === profileId);
    assert.equal(full.license_number, 'LIC-PRIVATE-42');
    assert.equal(full.email, 'coach@example.test');

    await call(env, 'admin/management/permissions', 'PUT', {
      email: 'coach@example.test', permissions: ['management.view', 'management.coaches'],
    }, created.admin.token);
    const coachManager = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password });
    await call(env, 'admin/providers/' + profileId + '/cv', 'GET', undefined, coachManager.token, 403);
    await call(env, 'admin/providers/' + profileId, 'PATCH', {
      status: 'approved', license_verified: true,
    }, coachManager.token, 403);

    await call(env, 'admin/management/permissions', 'PUT', {
      email: 'coach@example.test', permissions: ['management.view', 'management.audit', 'management.community'],
    }, created.admin.token);
    const scopedManager = await call(env, 'auth/login', 'POST', { email: 'coach@example.test', password });
    assert.deepEqual(scopedManager.management.permissions, ['management.audit', 'management.community', 'management.view']);
    assert.equal((await call(env, 'admin/auth-events', 'GET', undefined, scopedManager.token)).events !== undefined, true);
    assert.equal((await call(env, 'admin/community', 'GET', undefined, scopedManager.token)).pending_posts !== undefined, true);

    await call(env, 'admin/applications', 'GET', undefined, created.member.token, 403);
    await call(env, 'admin/community', 'GET', undefined, created.member.token, 403);
    await call(env, 'admin/management/permissions', 'GET', undefined, created.member.token, 403);
  } finally {
    db.close();
  }
});

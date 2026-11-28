import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

function setup() {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/', import.meta.url);
  const files = readdirSync(migrations).filter(f => f.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b));
  for (const f of files) db.exec(readFileSync(new URL(f, migrations), 'utf8'));
  const env = {
    DATA_COLLECTION_ENABLED: 'true',
    ADMIN_EMAILS: 'owner@example.test',
    ADMIN_SETUP_KEY: 'local-test',
    RESEND_API_KEY: 'test-only-mail-key',
    EMAIL_FROM: 'MZ Active <mail@example.test>',
    MANAGEMENT_CONTACT_EMAIL: 'management@example.test',
    MANAGEMENT_CONTACT_WHATSAPP: '+97451111111',
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql);
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          first() { return stmt.get(...args); },
          all() { return { results: stmt.all(...args) }; },
          run() { return { meta: stmt.run(...args) }; },
        };
      },
      batch(statements) {
        db.exec('BEGIN');
        try {
          const result = statements.map(s => s.run());
          db.exec('COMMIT');
          return result;
        } catch (e) { db.exec('ROLLBACK'); throw e; }
      },
    },
  };
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.resend.com')) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: 'provider-message-id' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return originalFetch(url, init);
  };
  return { db, env, sent, restore: () => { globalThis.fetch = originalFetch; db.close(); } };
}

async function call(env, path, method = 'GET', body, token, expected = 200) {
  const headers = {};
  if (body?.email === env.ADMIN_EMAILS) headers['x-admin-setup-key'] = env.ADMIN_SETUP_KEY;
  if (token) headers.authorization = 'Bearer ' + token;
  const request = new Request('https://example.test/api/' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await worker.fetch(request, env);
  if (result.status !== expected) {
    const body = await result.text();
    assert.fail(`${method} ${path}: ${result.status} !== ${expected}: ${body}`);
  }
  return result.json();
}

test('coach security, contact states, completeness and Momo drafts are enforced end to end', async () => {
  const { db, env, sent, restore } = setup();
  try {
    const signup = { password: 'local-test-password', consent: true, provider_type: 'coach' };
    const coach = (await call(env, 'auth/register', 'POST', { ...signup, email: 'coach@example.test' }, null, 201)).token;
    const other = (await call(env, 'auth/register', 'POST', { ...signup, email: 'other@example.test' }, null, 201)).token;
    const admin = (await call(env, 'auth/register', 'POST', { ...signup, email: env.ADMIN_EMAILS }, null, 201)).token;
    const manager = (await call(env, 'auth/register', 'POST', { ...signup, email: 'manager@example.test', account_type: 'member' }, null, 201)).token;

    const profileId = (await call(env, 'me/profile', 'GET', undefined, coach)).profile.id;
    const otherId = (await call(env, 'me/profile', 'GET', undefined, other)).profile.id;
    await call(env, 'me/profile', 'PUT', {
      provider_type: 'coach', display_name: 'Akram Babanacer', city: 'Doha',
      specialties: ['Running'], languages: ['English'], bio: 'Public biography',
      services: ['Running sessions'], coaching_mode: 'both', program_durations: [1],
      whatsapp_number: '+97455555555', whatsapp_public: true,
    }, coach);
    const queue = await call(env, 'admin/applications', 'GET', undefined, admin);
    const application = queue.providers.find(p => p.id === profileId);
    assert.equal(Number(application.profile_complete), 1);
    await call(env, 'admin/providers/' + profileId, 'PATCH', {
      status: 'approved', verified: true, review_version: application.updated_at,
    }, admin);
    await call(env, 'admin/applications', 'GET', undefined, admin);
    await call(env, 'admin/providers/' + otherId, 'PATCH', {
      status: 'approved', verified: true,
      review_version: (await call(env, 'admin/applications', 'GET', undefined, admin)).providers.find(p => p.id === otherId).updated_at,
    }, admin);

    const directory = (await call(env, 'providers')).providers;
    assert.ok(directory.some(provider => provider.id === profileId));
    assert.ok(!directory.some(provider => provider.id === otherId));
    await call(env, 'providers/' + otherId, 'GET', undefined, null, 404);
    const emptyOwnerView = (await call(env, 'providers/' + otherId, 'GET', undefined, other)).provider;
    assert.equal(emptyOwnerView.viewer.owner, true);
    assert.equal(emptyOwnerView.bio, '');

    // Public reads are public only; ownership is server-declared and cannot be
    // inferred from a query parameter or another account's token.
    const publicView = (await call(env, 'providers/' + profileId + '?owner=1')).provider;
    assert.deepEqual(publicView.viewer, { authenticated: false, owner: false, can_message: false });
    const ownerView = (await call(env, 'providers/' + profileId, 'GET', undefined, coach)).provider;
    assert.equal(ownerView.viewer.owner, true);
    assert.equal(ownerView.whatsapp_number, '97455555555');
    const otherView = (await call(env, 'providers/' + profileId, 'GET', undefined, other)).provider;
    assert.equal(otherView.viewer.owner, false);
    assert.equal(otherView.viewer.can_message, true);
    await call(env, 'admin/providers/' + profileId, 'PATCH', { status: 'suspended' }, other, 403);
    await call(env, 'admin/providers/' + profileId, 'PATCH', { status: 'suspended' }, manager, 403);
    await call(env, 'me/completeness', 'GET', undefined, other);
    const ownCompleteness = (await call(env, 'me/completeness', 'GET', undefined, coach)).completeness;
    assert.equal(ownCompleteness.profile_id, profileId);
    assert.equal(ownCompleteness.complete, true);
    assert.equal(ownCompleteness.percent, 100);

    // Optional qualifications and the private CV never lower public-profile
    // completeness, even for a licensed category. License review stays separate.
    const specialist = (await call(env, 'auth/register', 'POST', {
      ...signup, email: 'specialist@example.test', provider_type: 'nutritionist',
    }, null, 201)).token;
    const specialistId = (await call(env, 'me/profile', 'GET', undefined, specialist)).profile.id;
    await call(env, 'me/profile', 'PUT', {
      provider_type: 'nutritionist', display_name: 'Noor Specialist', city: 'Doha', country: 'Qatar',
      services: ['Nutrition consultation'], license_number: 'LIC-222', license_issuer: 'Test board',
      bio: 'Public biography', specialties: ['Sport nutrition'], program_durations: [1],
    }, specialist);
    const specialistCompletion = (await call(env, 'me/completeness', 'GET', undefined, specialist)).completeness;
    assert.equal(specialistCompletion.percent, 100);
    assert.equal(specialistCompletion.complete, true);
    assert.ok(!specialistCompletion.required.includes('qualifications'));
    assert.ok(specialistCompletion.recommended.includes('qualifications'));
    const specialistApplication = (await call(env, 'admin/applications', 'GET', undefined, admin))
      .providers.find(p => p.id === specialistId);
    assert.equal(Number(specialistApplication.profile_complete), 1);

    // Contact configuration comes only from Worker bindings, never from HTML.
    const coachConfig = (await call(env, 'me/contact-config', 'GET', undefined, coach)).contact;
    assert.equal(coachConfig.email, 'management@example.test');
    assert.equal(coachConfig.whatsapp, '97451111111');
    const adminConfig = (await call(env, 'admin/contact-config', 'GET', undefined, admin)).contact;
    assert.equal(adminConfig.configured, true);
    await call(env, 'admin/contact-config', 'GET', undefined, manager, 403);

    // Management-to-coach workflow: drafted -> opened -> confirmed -> completed.
    const draft = await call(env, 'admin/coaches/' + profileId + '/contacts', 'POST', {
      channel: 'email', purpose: 'profile_support', message: 'Please complete your profile.', intent: 'prepare',
    }, admin, 201);
    assert.equal(draft.status, 'drafted');
    assert.equal(draft.recipient, 'coach@example.test');
    assert.ok(draft.link.startsWith('mailto:'));
    await call(env, 'admin/contacts/' + draft.id, 'PATCH', { status: 'opened' }, admin);
    await call(env, 'admin/contacts/' + draft.id, 'PATCH', { status: 'confirmed_sent' }, admin);
    await call(env, 'admin/contacts/' + draft.id, 'PATCH', { status: 'completed' }, admin);
    await call(env, 'admin/contacts/' + draft.id, 'PATCH', { status: 'opened' }, admin, 409);
    const records = (await call(env, 'admin/coaches/' + profileId + '/contacts', 'GET', undefined, admin)).contacts;
    assert.equal(records[0].status, 'completed');
    await call(env, 'admin/contacts/' + draft.id, 'PATCH', { status: 'drafted' }, manager, 403);

    // Email sending is only confirmed after the provider accepts the message;
    // WhatsApp remains a human-confirmed deep link with no delivery claim.
    const sentEmail = await call(env, 'admin/coaches/' + profileId + '/contacts', 'POST', {
      channel: 'email', purpose: 'bookings', message: 'Booking update.', intent: 'send',
    }, admin, 201);
    assert.equal(sentEmail.status, 'confirmed_sent');
    assert.equal(sentEmail.delivery, 'provider_accepted');
    assert.equal(sent.at(-1).to[0], 'coach@example.test');
    const wa = await call(env, 'admin/coaches/' + profileId + '/contacts', 'POST', {
      channel: 'whatsapp', purpose: 'programs', message: 'Program update.', intent: 'send',
    }, admin, 201);
    assert.equal(wa.status, 'drafted');
    assert.ok(wa.link.startsWith('https://wa.me/'));
    const waRecord = (await call(env, 'admin/coaches/' + profileId + '/contacts', 'GET', undefined, admin)).contacts
      .find(record => record.id === wa.id);
    assert.equal(waRecord.status, 'drafted');
    assert.equal(waRecord.follow_up_status, 'open');

    // Coach-to-management uses the same configured values and explicit states.
    const coachDraft = await call(env, 'me/contacts?intent=prepare', 'POST', {
      channel: 'email', purpose: 'technical_issue', message: 'I cannot upload a photo.',
    }, coach, 201);
    assert.equal(coachDraft.recipient, 'management@example.test');
    assert.equal(coachDraft.status, 'drafted');
    await call(env, 'me/contacts/' + coachDraft.id, 'PATCH', { status: 'confirmed_sent' }, coach);
    await call(env, 'me/contacts/' + coachDraft.id, 'PATCH', { status: 'completed' }, other, 404);
    const coachRecords = (await call(env, 'me/contacts', 'GET', undefined, coach)).contacts;
    assert.equal(coachRecords.find(r => r.id === coachDraft.id).status, 'confirmed_sent');

    // Momo creates a rule-based draft once, respects the check interval, and
    // escalates through the existing agent approval queue instead of sending.
    await call(env, 'me/profile', 'PUT', {
      provider_type: 'coach', display_name: 'Akram Babanacer', city: 'Doha',
      specialties: [], languages: [], bio: '', services: [], program_durations: [1],
    }, coach);
    await worker.scheduled({ scheduledTime: 6 * 3600000 }, env);
    await worker.scheduled({ scheduledTime: 6 * 3600000 }, env);
    const followups = (await call(env, 'admin/momo-followups', 'GET', undefined, admin)).followups;
    assert.equal(followups.length, 2);
    for (const followup of followups) {
      assert.ok(followup.message.includes('Momo'));
      assert.ok(followup.missing_fields.length > 0);
      assert.equal(followup.attempt_count, 1);
    }
    const momoTasks = (await call(env, 'admin/agents', 'GET', undefined, admin)).tasks
      .filter(task => JSON.parse(task.input_json || '{}').agent === 'momo');
    assert.equal(momoTasks.length, 2);
    assert.ok(momoTasks.every(task => task.approval_status === 'pending'));
    await call(env, 'admin/momo-followups', 'GET', undefined, manager, 403);
    const sentBefore = sent.length;
    await call(env, 'admin/momo-followups/' + followups[0].id + '/contact', 'POST', {}, admin);
    assert.equal(sent.length, sentBefore + 1);
    await call(env, 'admin/momo-followups/' + followups[0].id + '/contact', 'POST', {}, admin, 409);
    assert.equal(sent.length, sentBefore + 1);
    await call(env, 'admin/momo-followups/' + followups[0].id + '/dismiss', 'POST', {}, admin);
    const after = (await call(env, 'admin/momo-followups', 'GET', undefined, admin)).followups;
    assert.equal(after.length, 1);

    await call(env, 'admin/coaches/' + profileId + '/completeness', 'GET', undefined, manager, 403);
    const incomplete = (await call(env, 'admin/coaches/' + profileId + '/completeness', 'GET', undefined, admin)).completeness;
    assert.equal(incomplete.complete, false);
    assert.ok(incomplete.required.includes('bio'));
    assert.ok(incomplete.required.includes('specialties'));
    const ownIncomplete = (await call(env, 'me/completeness', 'GET', undefined, coach)).completeness;
    for (const key of ['percent', 'complete', 'required', 'recommended', 'score']) {
      assert.deepEqual(ownIncomplete[key], incomplete[key], 'admin/coach completion mismatch: ' + key);
    }
    const finished = after[0];
    db.prepare('UPDATE provider_profiles SET bio=?,specialties_json=? WHERE id=?')
      .run('I coach athletes preparing for road races.', '["Running"]', finished.coach_profile_id);
    await worker.scheduled({ scheduledTime: 6 * 3600000 }, env);
    assert.ok((await call(env, 'providers')).providers.some(provider => provider.id === finished.coach_profile_id));
    assert.equal((await call(env, 'admin/momo-followups', 'GET', undefined, admin)).followups.length, 0);
    await call(env, 'admin/momo-followups/' + finished.id + '/contact', 'POST', {}, admin, 409);
    assert.equal(sent.length, sentBefore + 1);
  } finally {
    restore();
  }
});

test('WhatsApp contact links use the correct registered number, a professional draft and manual sending', async () => {
  const { db, env, sent, restore } = setup();
  try {
    const signup = { password: 'local-test-password', consent: true, provider_type: 'coach' };
    const coach = (await call(env, 'auth/register', 'POST', { ...signup, email: 'coach@example.test' }, null, 201)).token;
    const privateCoach = (await call(env, 'auth/register', 'POST', { ...signup, email: 'private@example.test' }, null, 201)).token;
    const admin = (await call(env, 'auth/register', 'POST', { ...signup, email: env.ADMIN_EMAILS }, null, 201)).token;

    const profileId = (await call(env, 'me/profile', 'GET', undefined, coach)).profile.id;
    const privateId = (await call(env, 'me/profile', 'GET', undefined, privateCoach)).profile.id;
    await call(env, 'me/profile', 'PUT', {
      provider_type: 'coach', display_name: 'Akram Babanacer', city: 'Doha',
      specialties: ['Running'], languages: ['English'], bio: 'Public biography',
      services: ['Running sessions'], coaching_mode: 'both', program_durations: [1],
      whatsapp_number: '+97455555555', whatsapp_public: true,
    }, coach);
    await call(env, 'me/profile', 'PUT', {
      provider_type: 'coach', display_name: 'Private Coach', city: 'Doha',
      specialties: ['Running'], languages: ['English'], bio: 'Private biography',
      services: ['Running sessions'], coaching_mode: 'both', program_durations: [1],
      whatsapp_number: '+97455556666', whatsapp_public: false,
    }, privateCoach);
    for (const id of [profileId, privateId]) {
      const application = (await call(env, 'admin/applications', 'GET', undefined, admin)).providers.find(p => p.id === id);
      await call(env, 'admin/providers/' + id, 'PATCH', {
        status: 'approved', verified: true, review_version: application.updated_at,
      }, admin);
    }

    // Management -> coach: the deep link targets the coach's own registered
    // number, contains a professional prefilled draft and never sends itself.
    const sentBefore = sent.length;
    const toCoach = await call(env, 'admin/coaches/' + profileId + '/contacts', 'POST', {
      channel: 'whatsapp', purpose: 'programs', message: 'Your weekly plan is ready.', intent: 'prepare',
    }, admin, 201);
    const coachUrl = new URL(toCoach.link);
    assert.equal(coachUrl.hostname, 'wa.me');
    assert.equal(coachUrl.pathname, '/97455555555');
    const coachText = coachUrl.searchParams.get('text');
    assert.match(coachText, /^Hello Akram Babanacer,/);
    assert.match(coachText, /Your weekly plan is ready\./);
    assert.match(coachText, /— MZ Active Management$/);
    assert.equal(toCoach.status, 'drafted');
    assert.equal(toCoach.recipient, '97455555555');
    assert.equal(sent.length, sentBefore, 'preparing WhatsApp must not send email');

    // Coach -> management: the deep link targets the Worker-secret number only.
    const toManagement = await call(env, 'me/contacts?intent=prepare', 'POST', {
      channel: 'whatsapp', purpose: 'profile_support', message: 'Please update my profile.',
    }, coach, 201);
    const managementUrl = new URL(toManagement.link);
    assert.equal(managementUrl.hostname, 'wa.me');
    assert.equal(managementUrl.pathname, '/97451111111');
    const managementText = managementUrl.searchParams.get('text');
    assert.match(managementText, /^Hello MZ Active Management,/);
    assert.match(managementText, /Please update my profile\./);
    assert.equal(toManagement.status, 'drafted');
    assert.equal(toManagement.recipient, '97451111111');
    assert.equal(sent.length, sentBefore);

    // A private number is never returned by the public profile endpoint.
    const publicView = (await call(env, 'providers/' + privateId)).provider;
    assert.equal(publicView.whatsapp_number, null);
    const publicCoachView = (await call(env, 'providers/' + profileId)).provider;
    assert.equal(publicCoachView.whatsapp_number, '97455555555');
  } finally {
    restore();
  }
});

test('public contact config exposes only the management WhatsApp channel', async () => {
  const { env, restore } = setup();
  try {
    const data = await call(env, 'public/contact-config');
    assert.deepEqual(data, { contact: { whatsapp: '97451111111', whatsapp_configured: true } });
    assert.equal('email' in data.contact, false);
    assert.equal('configured' in data.contact, false);
  } finally {
    restore();
  }
});

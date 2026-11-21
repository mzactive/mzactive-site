import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

const password = 'local-test-password';
const image = new Uint8Array(readFileSync(new URL('../assets/brand/mzactive-logo.webp', import.meta.url)));

function setup(options = {}) {
  const db = new DatabaseSync(':memory:');
  if (options.legacyCommunityMembers) {
    db.exec(`CREATE TABLE community_members (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL, locale TEXT NOT NULL CHECK(locale IN ('ar','en')), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active')), verified_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, marketing_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(marketing_opt_in IN (0,1)), age_range TEXT, gender TEXT, city TEXT, sports TEXT, experience TEXT)`);
  }
  const migrations = new URL('./migrations/', import.meta.url);
  const files = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b));
  for (const file of files) db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  const env = {
    DATA_COLLECTION_ENABLED: 'true',
    ADMIN_EMAILS: 'admin-owner@example.test',
    ADMIN_SETUP_KEY: 'local-test',
    DB: {
      prepare(sql) {
        const statement = db.prepare(sql);
        let args = [];
        return {
          bind(...values) { args = values.map((value) => value instanceof ArrayBuffer ? new Uint8Array(value) : value); return this; },
          first() { return statement.get(...args); },
          all() { return { results: statement.all(...args) }; },
          run() { return { meta: statement.run(...args) }; },
        };
      },
      batch(statements) {
        db.exec('BEGIN');
        try { const result = statements.map((item) => item.run()); db.exec('COMMIT'); return result; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    },
  };
  async function call(path, method = 'GET', body, token, expected = 200, headers = {}) {
    const requestHeaders = { ...headers };
    if (path === 'auth/register') requestHeaders['CF-Connecting-IP'] = String(body?.email || 'local-test');
    if (body?.email === env.ADMIN_EMAILS && path === 'auth/register') requestHeaders['x-admin-setup-key'] = env.ADMIN_SETUP_KEY;
    if (token) requestHeaders.authorization = 'Bearer ' + token;
    const binary = body instanceof Uint8Array;
    if (body !== undefined && !binary) requestHeaders['content-type'] = 'application/json';
    const request = new Request('https://example.test/api/' + path, {
      method, headers: requestHeaders,
      body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, expected, `${method} ${path}: expected ${expected}, got ${response.status}: ${await response.clone().text()}`);
    if (response.headers.get('content-type')?.startsWith('image/')) return new Uint8Array(await response.arrayBuffer());
    return response.json();
  }
  return { db, env, call };
}

async function fixtures() {
  const ctx = setup();
  const { call, env } = ctx;
  const admin = await call('auth/register', 'POST', { email: env.ADMIN_EMAILS, password, consent: true }, null, 201);
  const coach = await call('auth/register', 'POST', { email: 'coach@example.test', password, consent: true, provider_type: 'coach' }, null, 201);
  const owner = await call('auth/register', 'POST', { email: 'owner@example.test', password, consent: true, account_type: 'member' }, null, 201);
  const member = await call('auth/register', 'POST', { email: 'member@example.test', password, consent: true, account_type: 'member' }, null, 201);
  const outsider = await call('auth/register', 'POST', { email: 'outsider@example.test', password, consent: true, account_type: 'member' }, null, 201);
  const profileId = (await call('me/profile', 'GET', undefined, coach.token)).profile.id;
  await call('me/profile', 'PUT', {
    provider_type: 'coach', display_name: 'Live Coach', specialties: ['Running'], languages: ['English'],
    bio: 'A complete professional biography for review.', qualifications: 'Certified coach', services: ['Running plans'],
    coaching_mode: 'both', whatsapp_number: '+97455555555', whatsapp_public: true, program_durations: [1],
  }, coach.token);
  const queue = await call('admin/applications', 'GET', undefined, admin.token);
  await call('admin/providers/' + profileId, 'PATCH', { status: 'approved', verified: true, review_version: queue.providers[0].updated_at }, admin.token);
  const manager = await call('auth/register', 'POST', { email: 'manager@example.test', password, consent: true, account_type: 'member' }, null, 201);
  return { ...ctx, admin, coach, owner, member, outsider, manager, profileId };
}

async function createCommunity(call, token, overrides = {}) {
  const name = overrides.name || `Doha Running ${Math.random().toString(36).slice(2, 9)}`;
  const result = await call('communities', 'POST', {
    name, sport: 'running', description: 'A real community for weekly runs in Doha.',
    location: 'Doha', visibility: 'public', rules: 'Be kind and respect the group.', ...overrides,
  }, token, 201);
  return { ...result.community, name };
}

test('community creation is immediate, discoverable, searchable and duplicate-safe', async () => {
  const { call, db, owner, member } = await fixtures();
  const created = await createCommunity(call, owner.token, { name: 'Doha Morning Runners', sport: 'running' });
  assert.equal(created.status, 'active');
  assert.equal(created.member_count, 1);
  assert.equal(created.viewer.owner, true);

  await call('communities', 'POST', { name: 'doha   MORNING runners', sport: 'running', description: 'Duplicate attempt.' }, member.token, 409);
  const privateGroup = await createCommunity(call, owner.token, { name: 'Private Padel Circle', sport: 'padel', visibility: 'private' });

  const discovered = await call('communities?q=morning&sport=running&location=doha');
  assert.ok(discovered.communities.some((item) => item.id === created.id));
  assert.ok(!discovered.communities.some((item) => item.id === privateGroup.id));
  const padel = await call('communities?sport=padel');
  assert.ok(padel.communities.some((item) => item.id === privateGroup.id) === false);

  const mine = await call('communities?scope=mine', 'GET', undefined, owner.token);
  assert.deepEqual(mine.communities.map((item) => item.id).sort(), [created.id, privateGroup.id].sort());
  const outsiderView = await call('communities/' + privateGroup.id, 'GET', undefined, member.token, 403);
  assert.equal(outsiderView.error, 'community_forbidden');

  const join = await call('communities/' + privateGroup.id + '/join', 'POST', {}, member.token, 201);
  assert.equal(join.membership_status, 'pending');
  const pending = await call('communities/' + privateGroup.id, 'GET', undefined, owner.token);
  assert.equal(pending.community.member_count, 1);
  const memberId = db.prepare("SELECT id FROM users WHERE email='member@example.test'").get().id;
  await call('communities/' + privateGroup.id + '/members/' + memberId, 'PATCH', { status: 'active' }, owner.token);
  const approvedView = await call('communities/' + privateGroup.id, 'GET', undefined, member.token);
  assert.equal(approvedView.community.member_count, 2);
  assert.equal(approvedView.community.viewer.member, true);
});

test('private community posts hide media and comments from non-members; reports are moderated', async () => {
  const { call, db, owner, member, outsider, manager, admin } = await fixtures();
  await call('admin/management/permissions', 'PUT', { email: 'manager@example.test', permissions: ['management.view', 'management.community'] }, admin.token);
  const group = await createCommunity(call, owner.token, { name: 'Private Training Room', visibility: 'private' });
  await call('communities/' + group.id + '/join', 'POST', {}, member.token, 201);
  const rows = db.prepare("SELECT id FROM users WHERE email='member@example.test'").all();
  await call('communities/' + group.id + '/members/' + rows[0].id, 'PATCH', { status: 'active' }, owner.token);

  const post = await call('communities/' + group.id + '/posts', 'POST', {
    kind: 'post', body: 'Private training notes for our group.', sport: 'strength', language: 'en',
  }, owner.token, 201);
  assert.equal(post.status, 'published');
  await call('community/posts/' + post.id + '/photos/1', 'PUT', image, owner.token);
  assert.deepEqual(await call('community/posts/' + post.id + '/photos/1', 'GET', undefined, member.token), image);
  await call('community/posts/' + post.id + '/photos/1', 'GET', undefined, outsider.token, 404);
  await call('community/posts/' + post.id + '/comments', 'GET', undefined, outsider.token, 404);

  const feed = await call('community/posts');
  assert.ok(!feed.posts.some((item) => item.id === post.id));
  const memberFeed = await call('communities/' + group.id + '/posts', 'GET', undefined, member.token);
  assert.ok(memberFeed.posts.some((item) => item.id === post.id));

  const report = await call('community/reports', 'POST', {
    community_id: group.id, entity_type: 'post', entity_id: post.id, reason: 'spam', details: 'Repeated link.',
  }, member.token, 201);
  assert.equal(report.status, 'open');
  const queue = await call('admin/community/reports', 'GET', undefined, manager.token);
  assert.ok(queue.reports.some((item) => item.id === report.id));
  await call('admin/community/reports/' + report.id, 'PATCH', { status: 'actioned' }, manager.token);
  const hidden = await call('communities/' + group.id + '/posts', 'GET', undefined, member.token);
  assert.ok(!hidden.posts.some((item) => item.id === post.id));
  const audit = await call('admin/communities/' + group.id + '/audit', 'GET', undefined, manager.token);
  assert.ok(audit.audit.some((item) => item.action === 'report_reviewed'));
});

test('events enforce capacity, create finite weekly occurrences and support individual cancellation', async () => {
  const { call, db, owner, member, coach, profileId } = await fixtures();
  const group = await createCommunity(call, owner.token, { name: 'Weekly Strength Club', sport: 'strength' });
  await call('communities/' + group.id + '/join', 'POST', {}, member.token, 201);
  await call('communities/' + group.id + '/join', 'POST', {}, coach.token, 201);
  const starts = new Date(Date.now() + 86400000).toISOString();
  const event = await call('communities/' + group.id + '/posts', 'POST', {
    kind: 'event', title: 'Saturday strength', body: 'Bring water and a mat.', sport: 'strength',
    starts_at: starts, starts_at_local: 'Saturday 09:00', timezone: 'Asia/Qatar', location: 'Doha',
    capacity: 1, repeat_weekly: true,
  }, owner.token, 201);
  assert.equal(event.occurrences, 8);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM community_posts WHERE series_id=?').get(event.series_id).count, 8);

  const upcoming = await call('community/upcoming');
  assert.ok(upcoming.events.some((item) => item.id === event.id || item.series_id === event.series_id));
  await call('communities/' + group.id + '/posts/' + event.id + '/rsvp', 'POST', { response: 'going' }, member.token);
  const full = await call('communities/' + group.id + '/posts/' + event.id + '/rsvp', 'POST', { response: 'going' }, coach.token, 409);
  assert.equal(full.error, 'event_full');
  await call('communities/' + group.id + '/posts/' + event.id + '/rsvp', 'POST', { response: 'interested' }, coach.token);
  await call('communities/' + group.id + '/posts/' + event.id + '/rsvp', 'POST', { response: 'going' }, member.token);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM community_rsvps WHERE post_id=? AND response='going'").get(event.id).count, 1);

  await call('communities/' + group.id + '/posts/' + event.id, 'PATCH', { cancel: true, body: 'Bring water and a mat.' }, owner.token);
  assert.ok(db.prepare('SELECT cancelled_at FROM community_posts WHERE id=?').get(event.id).cancelled_at);
  await call('communities/' + group.id + '/events/series/' + event.series_id + '/cancel', 'POST', {}, owner.token);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM community_posts WHERE series_id=? AND cancelled_at IS NULL').get(event.series_id).count, 0);

  const publicEvent = await call('me/community/events', 'POST', {
    kind: 'group_session', title: 'Coach open session', body: 'Free public session in Doha.',
    starts_at: new Date(Date.now() + 2 * 86400000).toISOString(), location: 'Online', organizer_profile_id: profileId,
  }, coach.token, 201);
  const coachCommunity = await call('providers/' + profileId + '/community');
  assert.ok(coachCommunity.events.some((item) => item.id === publicEvent.id));
});

test('chat is member-only, paginated, muteable and deletion is authorized', async () => {
  const { call, owner, member, outsider } = await fixtures();
  const peer = await call('auth/register', 'POST', { email: 'peer@example.test', password, consent: true, account_type: 'member' }, null, 201);
  const group = await createCommunity(call, owner.token, { name: 'Chat Between Runners' });
  await call('communities/' + group.id + '/join', 'POST', {}, member.token, 201);
  await call('communities/' + group.id + '/join', 'POST', {}, peer.token, 201);
  await call('communities/' + group.id + '/messages', 'POST', { body: 'Hi runners!' }, outsider.token, 403);
  const sent = await call('communities/' + group.id + '/messages', 'POST', { body: 'Welcome to the group.' }, member.token, 201);
  const photo = await call('communities/' + group.id + '/messages/photo', 'POST', image, member.token, 201);
  assert.equal(photo.has_photo, true);
  assert.deepEqual(await call('communities/' + group.id + '/messages/' + photo.id + '/photo', 'GET', undefined, member.token), image);
  await call('communities/' + group.id + '/messages', 'POST', { body: 'See you Saturday.' }, owner.token, 201);
  await call('communities/' + group.id + '/messages', 'GET', undefined, outsider.token, 403);

  const page = await call('communities/' + group.id + '/messages?limit=2', 'GET', undefined, member.token);
  assert.equal(page.messages.length, 2);
  assert.ok(page.next_cursor);
  const since = await call('communities/' + group.id + '/messages?since=' + encodeURIComponent(sent.created_at), 'GET', undefined, member.token);
  assert.ok(since.messages.length >= 1);

  const prefs = await call('communities/' + group.id + '/notifications', 'PATCH', { mark_read: true, muted: true }, member.token);
  assert.equal(prefs.notifications.muted, true);
  await call('communities/' + group.id + '/messages/' + sent.id, 'DELETE', undefined, peer.token, 403);
  await call('communities/' + group.id + '/messages/' + sent.id, 'DELETE', undefined, member.token);
  const after = await call('communities/' + group.id + '/messages', 'GET', undefined, member.token);
  assert.ok(!after.messages.some((item) => item.id === sent.id));
});

test('management and moderation powers are scoped by permission and role', async () => {
  const { call, db, owner, member, admin, manager } = await fixtures();
  const group = await createCommunity(call, owner.token, { name: 'Permission Boundaries' });
  await call('admin/communities', 'GET', undefined, member.token, 403);
  await call('admin/communities', 'GET', undefined, manager.token, 403);
  await call('admin/management/permissions', 'PUT', { email: 'manager@example.test', permissions: ['management.view', 'management.community'] }, admin.token);
  const allowed = await call('admin/communities', 'GET', undefined, manager.token);
  assert.ok(allowed.communities.some((item) => item.id === group.id));

  await call('communities/' + group.id + '/join', 'POST', {}, member.token, 201);
  const memberRows = db.prepare("SELECT id FROM users WHERE email='member@example.test'").all();
  await call('communities/' + group.id + '/members/' + memberRows[0].id + '/moderator', 'POST', { role: 'moderator' }, owner.token);
  const post = await call('communities/' + group.id + '/posts', 'POST', { kind: 'post', body: 'A post to review.' }, owner.token, 201);
  await call('communities/' + group.id + '/posts/' + post.id, 'DELETE', undefined, member.token);
  await call('communities/' + group.id + '/members/' + memberRows[0].id + '/moderator', 'POST', { role: 'member' }, member.token, 403);

  await call('admin/communities/' + group.id, 'PATCH', { status: 'removed', reason: 'Abuse confirmed.' }, manager.token, 403);
  await call('admin/communities/' + group.id, 'PATCH', { status: 'suspended', reason: 'Under review.' }, manager.token);
  assert.equal((await call('communities/' + group.id, 'GET', undefined, owner.token, 403)).error, 'community_forbidden');
  await call('admin/communities/' + group.id, 'PATCH', { status: 'active' }, manager.token);
  await call('admin/communities/' + group.id, 'PATCH', { status: 'removed', reason: 'Abuse confirmed.' }, admin.token);
  assert.equal(db.prepare('SELECT status FROM communities WHERE id=?').get(group.id).status, 'removed');
});

test('group membership migration does not collide with the legacy community signup table', () => {
  const { db } = setup({ legacyCommunityMembers: true });
  const legacyColumns = db.prepare('PRAGMA table_info(community_members)').all().map((column) => column.name);
  assert.equal(legacyColumns[0], 'id');
  assert.ok(legacyColumns.includes('email'));
  assert.ok(!legacyColumns.includes('community_id'));

  const groupColumns = db.prepare('PRAGMA table_info(community_group_members)').all().map((column) => column.name);
  assert.deepEqual(groupColumns, ['community_id', 'user_id', 'role', 'status', 'joined_at', 'updated_at']);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM community_group_members').get().total, 0);
});

test('member and chat identities never fall back to registered email addresses', async () => {
  const { call, owner, member } = await fixtures();
  const group = await createCommunity(call, owner.token, { name: 'Identity Privacy Circle' });
  await call('communities/' + group.id + '/join', 'POST', {}, member.token, 201);
  const members = await call('communities/' + group.id + '/members', 'GET', undefined, member.token);
  assert.ok(members.members.every((item) => !String(item.display_name).includes('@')));
  await call('communities/' + group.id + '/messages', 'POST', { body: 'Hello without an email.' }, member.token, 201);
  const chat = await call('communities/' + group.id + '/messages', 'GET', undefined, member.token);
  assert.ok(chat.messages.every((item) => !String(item.sender_name).includes('@')));
});

test('public surfaces drop community events and posts after a private visibility flip', async () => {
  const { call, db, owner, coach, profileId } = await fixtures();
  const group = await createCommunity(call, owner.token, { name: 'Visibility Boundary Runs' });
  await call('communities/' + group.id + '/join', 'POST', {}, coach.token, 201);
  const coachUserId = db.prepare("SELECT id FROM users WHERE email='coach@example.test'").get().id;
  await call('communities/' + group.id + '/members/' + coachUserId + '/moderator', 'POST', { role: 'moderator' }, owner.token);
  const startsAt = new Date(Date.now() + 86400000).toISOString();
  const event = await call('communities/' + group.id + '/posts', 'POST', {
    kind: 'event', title: 'Boundary Run', body: 'A public community event.',
    starts_at: startsAt, location: 'Doha',
  }, coach.token, 201);
  const post = await call('communities/' + group.id + '/posts', 'POST', {
    kind: 'post', body: 'A public community note.',
  }, coach.token, 201);
  assert.ok((await call('community/upcoming')).events.some((item) => item.id === event.id));
  const before = await call('providers/' + profileId + '/community');
  assert.ok(before.events.some((item) => item.id === event.id));
  assert.ok(before.posts.some((item) => item.id === post.id));

  await call('communities/' + group.id, 'PATCH', {
    name: group.name, sport: group.sport, description: group.description,
    location: group.location, rules: group.rules, visibility: 'private',
  }, owner.token);
  assert.ok(!(await call('community/upcoming')).events.some((item) => item.id === event.id));
  const after = await call('providers/' + profileId + '/community');
  assert.ok(!after.events.some((item) => item.id === event.id));
  assert.ok(!after.posts.some((item) => item.id === post.id));
});

test('suspension blocks member writes until the community is restored', async () => {
  const { call, owner, member, coach, admin } = await fixtures();
  const group = await createCommunity(call, owner.token, { name: 'Suspension Boundary Group' });
  await call('communities/' + group.id + '/join', 'POST', {}, member.token, 201);
  await call('communities/' + group.id + '/join', 'POST', {}, coach.token, 201);
  const event = await call('communities/' + group.id + '/posts', 'POST', {
    kind: 'event', title: 'Before suspension', body: 'An event created before review.',
    starts_at: new Date(Date.now() + 86400000).toISOString(), location: 'Doha',
  }, owner.token, 201);

  await call('admin/communities/' + group.id, 'PATCH', { status: 'suspended', reason: 'Under review.' }, admin.token);
  await call('communities/' + group.id + '/posts', 'POST', { body: 'Blocked post.' }, member.token, 403);
  await call('communities/' + group.id + '/messages', 'POST', { body: 'Blocked message.' }, member.token, 403);
  await call('communities/' + group.id + '/posts/' + event.id + '/rsvp', 'POST', { response: 'going' }, member.token, 403);
  await call('me/community/posts', 'POST', { community_id: group.id, body: 'Blocked workspace post.' }, coach.token, 403);
  await call('me/community/events', 'POST', {
    community_id: group.id, kind: 'group_session', title: 'Blocked event',
    body: 'An event blocked by suspension.', starts_at: new Date(Date.now() + 2 * 86400000).toISOString(), location: 'Doha',
  }, coach.token, 403);
  await call('communities/' + group.id, 'PATCH', {
    name: group.name, sport: group.sport, description: group.description, visibility: 'public',
  }, owner.token, 403);

  await call('admin/communities/' + group.id, 'PATCH', { status: 'active' }, admin.token);
  await call('communities/' + group.id + '/messages', 'POST', { body: 'Allowed after restoration.' }, member.token, 201);
});

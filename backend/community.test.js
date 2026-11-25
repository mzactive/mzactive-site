import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

function setup() {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/', import.meta.url);
  const files = readdirSync(migrations).filter(f => f.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b));
  for (const file of files) db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  const env = {
    DATA_COLLECTION_ENABLED: 'true', ADMIN_EMAILS: 'admin@example.test', ADMIN_SETUP_KEY: 'local-test',
    DB: {
      prepare(sql) {
        const statement = db.prepare(sql);
        let args = [];
        return {
          bind(...values) { args = values.map(v => v instanceof ArrayBuffer ? new Uint8Array(v) : v); return this; },
          first() { return statement.get(...args); },
          all() { return { results: statement.all(...args) }; },
          run() { return { meta: statement.run(...args) }; },
        };
      },
      batch(statements) {
        db.exec('BEGIN');
        try { const result = statements.map(item => item.run()); db.exec('COMMIT'); return result; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    },
  };
  async function call(path, method = 'GET', body, token, expected = 200, headers = {}) {
    const requestHeaders = { ...headers };
    if (token) requestHeaders.authorization = 'Bearer ' + token;
    const binary = body instanceof Uint8Array;
    if (body !== undefined && !binary) requestHeaders['content-type'] = 'application/json';
    const request = new Request('https://example.test/api/' + path, {
      method, headers: requestHeaders,
      body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, expected, method + ' ' + path + ' -> ' + response.status);
    return response.headers.get('content-type')?.startsWith('image/')
      ? new Uint8Array(await response.arrayBuffer()) : response.json();
  }
  return { db, env, call };
}

const password = 'local-test-password';
const image = new Uint8Array(readFileSync(new URL('../assets/brand/mzactive-logo.webp', import.meta.url)));

async function approvedFixtures() {
  const ctx = setup();
  const { call } = ctx;
  const coach = await call('auth/register', 'POST', { email: 'coach@example.test', password, consent: true, provider_type: 'coach' }, null, 201);
  const admin = await call('auth/register', 'POST', { email: 'admin@example.test', password, consent: true }, null, 201, { 'x-admin-setup-key': 'local-test' });
  const member = await call('auth/register', 'POST', { email: 'athlete@example.test', password, consent: true, account_type: 'member' }, null, 201);
  const profileId = (await call('me/profile', 'GET', undefined, coach.token)).profile.id;
  await call('me/profile', 'PUT', {
    provider_type: 'coach', display_name: 'Live Coach', specialties: ['Running'], languages: ['English'],
    bio: 'A complete professional biography for review.', qualifications: 'Certified coach', services: ['Running plans'],
    coaching_mode: 'both', whatsapp_number: '+97455555555', whatsapp_public: true, program_durations: [1],
  }, coach.token);
  const queue = await call('admin/applications', 'GET', undefined, admin.token);
  await call('admin/providers/' + profileId, 'PATCH', { status: 'approved', verified: true, review_version: queue.providers[0].updated_at }, admin.token);
  return { ...ctx, coach, admin, member, profileId };
}

test('approved coaches publish cover images, achievements and community posts immediately', async () => {
  const { call, coach, admin, member, profileId, db } = await approvedFixtures();
  const cover = await call('me/profile/cover', 'PUT', image, coach.token);
  assert.equal(cover.status, 'approved');
  assert.deepEqual(await call('providers/' + profileId + '/cover'), image);
  assert.deepEqual(await call('admin/providers/' + profileId + '/cover', 'GET', undefined, admin.token), image);
  const adminQueue = await call('admin/applications', 'GET', undefined, admin.token);
  const adminRow = adminQueue.approved_providers.find((item) => item.id === profileId);
  assert.equal(adminRow.has_cover, 1);
  assert.ok(adminRow.has_profile_photo === 0 || adminRow.has_profile_photo === 1);
  assert.ok(adminRow.profile_photo_updated_at === null || typeof adminRow.profile_photo_updated_at === 'string');

  const achievement = await call('me/achievements', 'POST', { title: 'National champion', details: '2024 10K', awarded_year: 2024 }, coach.token, 201);
  assert.equal(achievement.status, 'published');
  const publicProfile = (await call('providers/' + profileId)).provider;
  assert.equal(publicProfile.achievements[0].title, 'National champion');
  assert.equal(publicProfile.has_cover, true);

  const post = await call('community/posts', 'POST', { kind: 'post', body: 'Weekend long run recap', sport: 'running', language: 'en' }, coach.token, 201);
  assert.equal(post.status, 'published');
  await call('community/posts/' + post.id + '/photos/1', 'PUT', image, coach.token);
  assert.deepEqual(await call('community/posts/' + post.id + '/photos/1'), image);
  await call('community/posts/' + post.id + '/like', 'POST', {}, member.token);
  await call('community/posts/' + post.id + '/comments', 'POST', { body: 'Well done!' }, member.token, 201);
  const detail = await call('community/posts/' + post.id);
  assert.equal(detail.post.likes, 1);
  assert.equal(detail.post.comments, 1);
  assert.deepEqual(detail.post.photos, [1]);
  const feed = await call('community/posts?sport=running');
  assert.ok(feed.posts.some(item => item.id === post.id));

  const event = await call('community/posts', 'POST', { kind: 'event', body: 'Community run', starts_at: '2026-11-28T07:00:00Z', location: 'Corniche' }, coach.token, 201);
  await call('community/posts/' + event.id + '/rsvp', 'POST', { response: 'going' }, member.token);
  assert.equal((await call('community/posts/' + event.id)).post.going, 1);
  await call('community/posts/' + event.id + '/rsvp', 'DELETE', undefined, member.token);

  await call('community/posts', 'POST', { kind: 'challenge', body: 'Run twice this week' }, coach.token, 403);
  const challenge = await call('admin/community/challenges', 'POST', { body: 'Move for 20 minutes each day', language: 'en' }, admin.token, 201);
  assert.equal(challenge.status, 'published');
  assert.ok((await call('community/challenges')).challenges.some(item => item.id === challenge.id));

  await call('coaches/' + profileId + '/follow', 'POST', {}, member.token);
  await call('community/posts?scope=following', 'GET', undefined, undefined, 401);
  const followingFeed = await call('community/posts?scope=following', 'GET', undefined, member.token);
  assert.ok(followingFeed.posts.some(item => item.id === post.id));
  assert.ok(!followingFeed.posts.some(item => item.id === challenge.id));
  assert.equal((await call('community/posts?scope=following', 'GET', undefined, coach.token)).posts.length, 0);
  const followed = (await call('providers/' + profileId)).provider;
  assert.equal(followed.follower_count, 1);
  assert.equal(followed.is_following, false);
  const analytics = (await call('dashboard/analytics', 'GET', undefined, coach.token)).analytics;
  assert.equal(analytics.followers, 1);
  assert.equal(analytics.post_likes, 1);
  assert.equal(analytics.post_comments, 1);
  assert.ok(analytics.profile_views >= 1);
  db.close();
});

test('member content is moderated and private connections require acceptance', async () => {
  const { call, coach, admin, member, profileId, db } = await approvedFixtures();
  const sports = await call('me/sports-profile', 'PUT', {
    display_name: 'Athlete One', city: 'Doha', sports: ['running', 'boxing'], goals: 'First half marathon',
    garmin_public_url: 'http://example.test/profile',
  }, member.token, 400);
  assert.equal(sports.error, 'invalid_garmin_url');
  await call('me/sports-profile', 'PUT', {
    display_name: 'Athlete One', city: 'Doha', sports: ['running', 'boxing'], goals: 'First half marathon',
    garmin_public_url: 'https://connect.garmin.com/profile/athlete',
  }, member.token);
  const saved = (await call('me/sports-profile', 'GET', undefined, member.token)).profile;
  assert.deepEqual(saved.sports, ['running', 'boxing']);
  assert.match(saved.garmin_public_url, /^https:/);

  const pendingPost = await call('community/posts', 'POST', { kind: 'post', body: 'My first community post' }, member.token, 201);
  assert.equal(pendingPost.status, 'pending');
  assert.equal((await call('community/posts')).posts.some(item => item.id === pendingPost.id), false);
  await call('admin/community/posts/' + pendingPost.id, 'PATCH', { status: 'published' }, admin.token);
  assert.equal((await call('community/posts')).posts.some(item => item.id === pendingPost.id), true);

  const connection = await call('connections', 'POST', { coach_id: profileId }, member.token, 201);
  assert.equal(connection.status, 'pending');
  await call('connections/' + connection.id + '/messages', 'POST', { body: 'Hello' }, member.token, 409);
  await call('connections/' + connection.id, 'PATCH', { status: 'accepted' }, coach.token);
  await call('connections/' + connection.id + '/messages', 'POST', { body: 'Hello coach' }, member.token, 201);
  const messages = (await call('connections/' + connection.id + '/messages', 'GET', undefined, coach.token)).messages;
  assert.equal(messages[0].body, 'Hello coach');
  const notifications = (await call('dashboard/notifications', 'GET', undefined, coach.token)).notifications;
  assert.ok(notifications.some(item => item.type === 'connection_request' || item.type === 'new_message'));
  db.close();
});

test('coach booking inbox, feedback and admin moderation respect permissions', async () => {
  const { call, coach, admin, member, profileId, db } = await approvedFixtures();
  const booking = await call('bookings', 'POST', {
    provider_id: profileId, customer_name: 'Test athlete', customer_phone: '55555555', city: 'Doha',
    session_type: 'training', goal_summary: 'Build a base', consent: true, program_duration_months: 1,
  }, null, 201);
  const inbox = await call('dashboard/bookings', 'GET', undefined, coach.token);
  assert.equal(inbox.bookings.length, 1);
  await call('dashboard/bookings/' + booking.request_id, 'PATCH', { status: 'accepted' }, coach.token);
  assert.equal((await call('dashboard/bookings', 'GET', undefined, coach.token)).bookings[0].status, 'accepted');
  await call('dashboard/bookings/' + booking.request_id, 'PATCH', { status: 'declined' }, coach.token, 409);
  await call('dashboard/bookings', 'GET', undefined, member.token, 403);

  const plan = await call('dashboard/programs', 'POST', {
    athlete_name: 'Athlete One', athlete_phone: '+97455555555', athlete_type: 'runner', week_start: '2026-11-23',
    sessions: [{ day_key: 'monday', sport_type: 'run', details: 'Easy 5 km' }],
  }, coach.token, 201);
  const adminAthletes = await call('admin/athletes', 'GET', undefined, admin.token);
  assert.ok(adminAthletes.unlinked.some(item => item.id === plan.id));
  await call('admin/programs/' + plan.id + '/athlete', 'PATCH', { athlete_id: member.user.id }, admin.token);
  await call('dashboard/feedback', 'POST', { program_id: plan.id, rating: 5, body: 'Clear and useful plan' }, member.token, 201);
  assert.equal((await call('dashboard/feedback', 'GET', undefined, coach.token)).feedback.length, 1);
  const calendar = await call('dashboard/calendar', 'GET', undefined, member.token);
  assert.ok(calendar.events.some(item => item.source === 'training_program'));

  const pending = await call('community/posts', 'POST', { kind: 'post', body: 'Needs moderation' }, member.token, 201);
  await call('admin/community/posts/' + pending.id, 'PATCH', { status: 'hidden' }, admin.token);
  assert.equal((await call('community/posts')).posts.some(item => item.id === pending.id), false);
  db.close();
});

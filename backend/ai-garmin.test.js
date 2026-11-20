import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker, { cleanGarminPublicUrl } from './worker.js';

const migrationDir = new URL('./migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b));
const password = 'local-test-password';

function makeDb() {
  return new DatabaseSync(':memory:');
}

function applyMigrations(db, files = migrationFiles) {
  for (const file of files) db.exec(readFileSync(new URL(file, migrationDir), 'utf8'));
}

function setup({ withAI = false } = {}) {
  const db = makeDb();
  applyMigrations(db);
  const env = {
    DATA_COLLECTION_ENABLED: 'true', ADMIN_EMAILS: 'admin@example.test', ADMIN_SETUP_KEY: 'local-test',
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
  const aiCalls = [];
  if (withAI) env.AI = { async run(model, input) { aiCalls.push({ model, input }); return { response: 'A safe draft for owner review.' }; } };
  async function call(path, method = 'GET', body, token, expected = 200) {
    const headers = {};
    if (body?.email === env.ADMIN_EMAILS) headers['x-admin-setup-key'] = 'local-test';
    if (token) headers.authorization = 'Bearer ' + token;
    if (body !== undefined && !(body instanceof Uint8Array)) headers['content-type'] = 'application/json';
    const request = new Request('https://example.test/api/' + path, {
      method, headers,
      body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
    });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, expected, method + ' ' + path + ' -> ' + response.status);
    return response.json();
  }
  return { db, env, call, aiCalls };
}

async function registerAdmin(call) {
  return (await call('auth/register', 'POST', { email: 'admin@example.test', password, consent: true }, null, 201)).token;
}

async function approvedCoachFixture(call, admin) {
  const registered = await call('auth/register', 'POST', {
    email: 'coach@example.test', password, consent: true, provider_type: 'coach',
  }, null, 201);
  const profileId = (await call('me/profile', 'GET', undefined, registered.token)).profile.id;
  await call('me/profile', 'PUT', {
    provider_type: 'coach', display_name: 'Test Coach', city: 'Doha', specialties: ['Running'],
    languages: ['English'], bio: 'Approved coach profile', program_durations: [1, 2, 3],
  }, registered.token);
  const { providers } = await call('admin/applications', 'GET', undefined, admin);
  const application = providers.find((item) => item.id === profileId);
  await call('admin/providers/' + profileId, 'PATCH', {
    status: 'approved', verified: true, review_version: application.updated_at,
  }, admin);
  return { profileId, token: registered.token, user: registered.user };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function rateLimitBucket(label) {
  return createHash('sha256').update(`${label}:unknown`).digest('base64url');
}

test('0016 preserves owner task history and stores growth and community agent types', () => {
  const db = makeDb();
  applyMigrations(db, migrationFiles.filter((file) => !file.startsWith('0016')));
  db.prepare(`INSERT INTO owner_agent_tasks(id,agent_type,source,title,status,approval_status,input_json,created_at)
    VALUES('old-task','operations','scheduled','Operations review','completed','pending','{}','2026-01-01T00:00:00.000Z')`).run();
  db.exec(readFileSync(new URL('0016_owner_agent_task_types.sql', migrationDir), 'utf8'));

  const old = db.prepare('SELECT id,agent_type,status,approval_status FROM owner_agent_tasks WHERE id=?').get('old-task');
  assert.deepEqual({ ...old }, { id: 'old-task', agent_type: 'operations', status: 'completed', approval_status: 'pending' });
  for (const type of ['growth', 'community']) {
    db.prepare(`INSERT INTO owner_agent_tasks(id,agent_type,source,title,status,approval_status,input_json,created_at)
      VALUES(?,?,'manual','Draft','running','not_required','{}','2026-01-02T00:00:00.000Z')`).run(`new-${type}`, type);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM owner_agent_tasks').get().count, 3);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('AI quotas are isolated by surface and challenge generation checks limits in a safe order', async () => {
  const { db, env, call, aiCalls } = setup({ withAI: true });
  const admin = await registerAdmin(call);

  db.prepare('INSERT INTO ai_chat_usage(usage_date,request_count) VALUES(?,60)').run(`${today()}:public`);
  const publicChat = await call('assistant/chat', 'POST', { message: 'Hello' }, null, 429);
  assert.equal(publicChat.error, 'daily_limit_reached');

  const owner = await call('admin/assistant', 'POST', { task: 'operations', prompt: 'Review the queue.' }, admin);
  assert.ok(owner.answer);
  const storedTasks = db.prepare('SELECT agent_type,input_json FROM owner_agent_tasks').all();
  assert.equal(storedTasks[0].agent_type, 'operations');
  assert.match(storedTasks[0].input_json, /Review the queue/);

  const usage = Object.fromEntries(db.prepare('SELECT usage_date,request_count FROM ai_chat_usage').all().map((row) => [row.usage_date, row.request_count]));
  assert.equal(usage[`${today()}:public`], 60);
  assert.equal(usage[`${today()}:owner`], 1);

  const beforeRateLimit = aiCalls.length;
  const bucket = rateLimitBucket('community-challenge');
  db.prepare(`INSERT INTO rate_limit_buckets(bucket,window_start,request_count) VALUES(?,?,5)
    ON CONFLICT(bucket) DO UPDATE SET window_start=excluded.window_start,request_count=5`)
    .run(bucket, Math.floor(Date.now() / 60_000));
  db.prepare('INSERT INTO ai_chat_usage(usage_date,request_count) VALUES(?,60)').run(`${today()}:community-challenge`);
  const limited = await call('admin/community/challenges/generate', 'POST', { prompt: 'A challenge' }, admin, 429);
  assert.equal(limited.error, 'rate_limited');
  assert.equal(aiCalls.length, beforeRateLimit);

  const noAI = setup();
  const noAIAdmin = await registerAdmin(noAI.call);
  const unavailable = await noAI.call('admin/community/challenges/generate', 'POST', { prompt: 'A challenge' }, noAIAdmin, 503);
  assert.equal(unavailable.error, 'assistant_unavailable');
  assert.equal(noAI.db.prepare('SELECT COUNT(*) AS count FROM ai_chat_usage').get().count, 0);
});

test('public community endpoints do not expose member emails and record logged-in views correctly', async () => {
  const { db, call } = setup();
  const admin = await registerAdmin(call);
  const { profileId } = await approvedCoachFixture(call, admin);
  const member = await call('auth/register', 'POST', {
    email: 'member@example.test', password, consent: true, account_type: 'member',
  }, null, 201);

  await call(`coaches/${profileId}/follow`, 'POST', {}, member.token);
  const post = await call('community/posts', 'POST', { kind: 'post', body: 'Community update from admin' }, admin, 201);
  await call(`community/posts/${post.id}/comments`, 'POST', { body: 'Well done!' }, member.token, 201);

  const followers = await call(`coaches/${profileId}/followers`);
  const detail = await call(`community/posts/${post.id}`, 'GET', undefined, member.token);
  const comments = await call(`community/posts/${post.id}/comments`);
  for (const payload of [followers, detail, comments]) {
    assert.equal(JSON.stringify(payload).includes('member@example.test'), false);
  }
  assert.equal(followers.follower_count, 1);
  assert.equal(followers.followers[0].display_name, 'MZ Active member');
  assert.equal(detail.comments[0].author_name, 'MZ Active member');
  assert.equal(comments.comments[0].author_name, 'MZ Active member');

  const view = db.prepare('SELECT viewer_key FROM community_post_views WHERE post_id=?').get(post.id);
  assert.equal(view.viewer_key, `user:${member.user.id}`);
});

test('Garmin preparation accepts only official Garmin HTTPS profile URLs', () => {
  assert.equal(cleanGarminPublicUrl('https://connect.garmin.com/modern/profile/athlete'), 'https://connect.garmin.com/modern/profile/athlete');
  assert.equal(cleanGarminPublicUrl('https://www.garmin.com/en-US/profile/athlete'), 'https://www.garmin.com/en-US/profile/athlete');
  assert.equal(cleanGarminPublicUrl(''), '');
  assert.equal(cleanGarminPublicUrl('http://connect.garmin.com/profile/athlete'), null);
  assert.equal(cleanGarminPublicUrl('https://example.test/connect.garmin.com'), null);
  assert.equal(cleanGarminPublicUrl('https://connect.garmin.com.evil.test/profile'), null);
});

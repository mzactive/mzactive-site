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
    PUBLIC_ORIGINS: 'https://mzactive.com',
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql);
        let params = [];
        return {
          bind(...values) { params = values; return this; },
          first() { return stmt.get(...params); },
          async all() { return { results: stmt.all(...params) }; },
          run() { return { meta: stmt.run(...params) }; },
        };
      },
    },
  };
  return { db, env };
}

async function call(env, path) {
  const response = await worker.fetch(new Request('https://api.example.test/api/' + path, {
    headers: { origin: 'https://mzactive.com' },
  }), env);
  assert.equal(response.status, 200, path);
  return response.json();
}

test('published coach articles can be filtered by provider for a public profile', async () => {
  const { db, env } = makeEnv();
  const stamp = new Date().toISOString();
  const coachA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const coachB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const hiddenCoach = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  for (const [id, email] of [[coachA, 'a@example.test'], [coachB, 'b@example.test'], [hiddenCoach, 'c@example.test']]) {
    db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
      .run(id, email, 'hash', 'provider', stamp);
  }
  db.prepare("UPDATE users SET profile_visibility='hidden' WHERE id=?").run(hiddenCoach);
  for (const [userId, profileId, name] of [
    [coachA, 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa', 'Coach A'],
    [coachB, 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb', 'Coach B'],
    [hiddenCoach, 'cccccccc-1111-4ccc-8ccc-cccccccccccc', 'Hidden Coach'],
  ]) {
    db.prepare(`INSERT INTO provider_profiles(id,user_id,provider_type,display_name,city,bio,status,updated_at,created_at)
      VALUES(?,?,'coach',?,'Doha','Bio','approved',?,?)`).run(profileId, userId, name, stamp, stamp);
  }
  const insertPost = (id, coachUserId, providerId, title, status) =>
    db.prepare(`INSERT INTO coach_blog_posts(id,coach_user_id,provider_id,title,summary,body,language,status,created_at,updated_at,published_at)
      VALUES(?,?,?,?,'Summary','Body','en',?,?,?,?)`).run(id, coachUserId, providerId, title, status, stamp, stamp, stamp);
  insertPost('11111111-1111-4111-8111-111111111111', coachA, 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa', 'Coach A first', 'published');
  insertPost('22222222-2222-4222-8222-222222222222', coachA, 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa', 'Coach A second', 'published');
  insertPost('33333333-3333-4333-8333-333333333333', coachB, 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb', 'Coach B article', 'published');
  insertPost('44444444-4444-4444-8444-444444444444', coachA, 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa', 'Coach A draft', 'pending');
  insertPost('55555555-5555-4555-8555-555555555555', hiddenCoach, 'cccccccc-1111-4ccc-8ccc-cccccccccccc', 'Hidden article', 'published');

  const all = await call(env, 'blog/posts');
  assert.equal(all.posts.length, 3, 'only published public articles are listed');
  const coachPosts = await call(env, 'blog/posts?provider=aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(coachPosts.posts.length, 2);
  assert.deepEqual(coachPosts.posts.map((post) => post.title).sort(), ['Coach A first', 'Coach A second']);
  const otherPosts = await call(env, 'blog/posts?provider=bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb');
  assert.deepEqual(otherPosts.posts.map((post) => post.title), ['Coach B article']);
  const bySlug = await call(env, 'blog/posts?slug=11111111-1111-4111-8111-111111111111');
  assert.deepEqual(bySlug.posts.map((post) => post.title), ['Coach A first']);
});

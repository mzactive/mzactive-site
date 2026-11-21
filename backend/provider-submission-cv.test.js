import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

function harness() {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/', import.meta.url);
  const files = readdirSync(migrations).filter(f => f.endsWith('.sql')).sort((a, b) => parseInt(a) - parseInt(b));
  for (const f of files) db.exec(readFileSync(new URL(f, migrations), 'utf8'));
  const env = { DATA_COLLECTION_ENABLED: 'true', ADMIN_EMAILS: 'admin@example.test', ADMIN_SETUP_KEY: 'local-test',
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql); let args = [];
        return {
          bind(...values) { args = values.map(v => v instanceof ArrayBuffer ? new Uint8Array(v) : v); return this; },
          first() { return stmt.get(...args); },
          all() { return { results: stmt.all(...args) }; },
          run() { return { meta: stmt.run(...args) }; }
        };
      },
      batch(statements) { db.exec('BEGIN'); try { const r = statements.map(s => s.run()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } }
    }
  };
  async function request(path, { method = 'GET', body, token, headers = {}, expected = 200 } = {}) {
    const h = { ...headers };
    if (token) h.authorization = 'Bearer ' + token;
    if (body?.email === env.ADMIN_EMAILS && method === 'POST') h['x-admin-setup-key'] = 'local-test';
    const isBinary = body instanceof Uint8Array;
    if (!isBinary && body !== undefined) h['content-type'] = 'application/json';
    const res = await worker.fetch(new Request('https://example.test/api/' + path, {
      method, headers: h, body: body === undefined ? undefined : isBinary ? body : JSON.stringify(body)
    }), env);
    assert.equal(res.status, expected, method + ' ' + path + ' -> ' + (await res.clone().text()).slice(0, 200));
    const contentType = res.headers.get('content-type') || '';
    return contentType.startsWith('application/pdf') || contentType.startsWith('application/') && contentType.includes('wordprocessingml')
      ? new Uint8Array(await res.arrayBuffer()) : res.json();
  }
  return { db, env, request };
}

const signup = { password: 'local-test-password', consent: true, provider_type: 'coach' };
const profileEdit = {
  provider_type: 'coach', display_name: 'Draft coach', specialties: ['Running'], languages: ['Arabic'],
  bio: 'Coaching experience', qualifications: 'Level 2 certificate', services: ['Session'],
  coaching_mode: 'both', program_durations: [1]
};

test('draft stays out of the review queue and cannot be approved until submitted', async () => {
  const { request } = harness();
  const coach = (await request('auth/register', { method: 'POST', body: { ...signup, email: 'coach@example.test' }, expected: 201 })).token;
  const admin = (await request('auth/register', { method: 'POST', body: { ...signup, email: 'admin@example.test' }, expected: 201 })).token;
  const id = (await request('me/profile', { token: coach })).profile.id;

  const draft = await request('me/profile', { method: 'PUT', token: coach, body: { ...profileEdit, action: 'draft' } });
  assert.equal(draft.submission_state, 'draft');
  assert.equal(draft.status, 'pending_review');
  const me = (await request('me/profile', { token: coach })).profile;
  assert.equal(me.submission_state, 'draft');
  assert.equal(me.submitted_at, null);

  const queueBefore = await request('admin/applications', { token: admin });
  assert.equal(queueBefore.providers.some(p => p.id === id), false);
  await request('admin/providers/' + id, { method: 'PATCH', token: admin, body: { status: 'approved' }, expected: 409 });

  const submitted = await request('me/profile', { method: 'PUT', token: coach, body: { ...profileEdit, action: 'submit' } });
  assert.equal(submitted.submission_state, 'submitted');
  assert.ok(submitted.submitted_at);
  const queueAfter = await request('admin/applications', { token: admin });
  const row = queueAfter.providers.find(p => p.id === id);
  assert.ok(row, 'submitted profile appears in the review queue');
  assert.equal(row.qualifications, profileEdit.qualifications);
  await request('admin/providers/' + id, { method: 'PATCH', token: admin,
    body: { status: 'approved', verified: true, review_version: row.updated_at } });
  const approvedMe = (await request('me/profile', { token: coach })).profile;
  assert.equal(approvedMe.status, 'approved');
  assert.ok((await request('providers/' + id)).provider, 'approved coach is publicly discoverable');
});

test('existing qualifications survive a later save that omits the field', async () => {
  const { request } = harness();
  const coach = (await request('auth/register', { method: 'POST', body: { ...signup, email: 'coach@example.test' }, expected: 201 })).token;
  await request('me/profile', { method: 'PUT', token: coach, body: { ...profileEdit, action: 'submit' } });
  await request('me/profile', { method: 'PUT', token: coach, body: { ...profileEdit, qualifications: undefined, action: 'submit' } });
  const me = (await request('me/profile', { token: coach })).profile;
  assert.equal(me.qualifications, profileEdit.qualifications);
});

test('Sports CV is private, validated by content and never unpublishes an approved coach', async () => {
  const { request, db } = harness();
  const coach = (await request('auth/register', { method: 'POST', body: { ...signup, email: 'coach@example.test' }, expected: 201 })).token;
  const admin = (await request('auth/register', { method: 'POST', body: { ...signup, email: 'admin@example.test' }, expected: 201 })).token;
  const id = (await request('me/profile', { token: coach })).profile.id;
  await request('me/profile', { method: 'PUT', token: coach, body: { ...profileEdit, action: 'submit' } });
  const queue = await request('admin/applications', { token: admin });
  const row = queue.providers.find(p => p.id === id);
  await request('admin/providers/' + id, { method: 'PATCH', token: admin,
    body: { status: 'approved', verified: true, review_version: row.updated_at } });

  const fake = new TextEncoder().encode('not a document');
  await request('me/profile/cv', { method: 'PUT', token: coach, body: fake,
    headers: { 'content-type': 'application/pdf' }, expected: 400 });
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
  const uploaded = await request('me/profile/cv', { method: 'PUT', token: coach, body: pdf,
    headers: { 'content-type': 'application/pdf', 'x-file-name': 'my cv.pdf' } });
  assert.equal(uploaded.cv_uploaded, true);
  assert.equal(uploaded.file_name, 'my cv.pdf');
  assert.equal(db.prepare('SELECT status,submission_state FROM provider_profiles WHERE id=?').get(id).status, 'approved');
  const me = (await request('me/profile', { token: coach })).profile;
  assert.equal(me.has_cv, 1);
  assert.deepEqual(await request('me/profile/cv', { token: coach }), pdf);
  assert.deepEqual(await request('admin/providers/' + id + '/cv', { token: admin }), pdf);
  await request('providers/' + id + '/cv', { expected: 404 });
  await request('me/profile/cv', { method: 'DELETE', token: coach });
  await request('me/profile/cv', { token: coach, expected: 404 });
});

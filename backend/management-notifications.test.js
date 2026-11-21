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
          async all() { return { results: stmt.all(...params) }; },
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
  const raw = await response.text();
  assert.equal(response.status, expected, method + ' ' + path + ' → ' + raw);
  return raw ? JSON.parse(raw) : {};
}

const password = 'management-notification-password';
const now = (offset = 0) => new Date(Date.UTC(2026, 10, 21, 12, 0, offset)).toISOString();

async function accounts(env) {
  const admin = await call(env, 'auth/register', 'POST', { email: env.ADMIN_EMAILS, password, consent: true }, null, 201);
  const manager = await call(env, 'auth/register', 'POST', { email: 'manager@example.test', password, consent: true, account_type: 'member' }, null, 201);
  const applicant = await call(env, 'auth/register', 'POST', { email: 'applicant@example.test', password, consent: true, account_type: 'member' }, null, 201);
  const approved = await call(env, 'auth/register', 'POST', { email: 'approved@example.test', password, consent: true, account_type: 'member' }, null, 201);
  return { admin, manager, applicant, approved };
}

function seed(db, users) {
  const stamp = now();
  const insertProfile = (id, userId, displayName, status) => db.prepare(`INSERT INTO provider_profiles
    (id,user_id,provider_type,display_name,city,bio,status,updated_at,created_at)
    VALUES(?,?,'coach',?,?,?,?,?,?)`).run(id, userId, displayName, 'Doha', 'Bio', status, stamp, stamp);
  db.prepare(`INSERT INTO booking_requests
    (id,customer_name,customer_phone,city,goal_summary,consent_at,status,created_at,session_type)
    VALUES(?,?,?,?,?,?,?,?,'training')`).run('11111111-1111-4111-8111-111111111111', 'New Booking', '55555555', 'Doha', 'Goal', stamp, 'received', stamp);
  db.prepare(`INSERT INTO booking_requests
    (id,customer_name,customer_phone,city,goal_summary,consent_at,status,created_at,session_type)
    VALUES(?,?,?,?,?,?,?,?,'training')`).run('22222222-2222-4222-8222-222222222222', 'Review Booking', '55555556', 'Doha', 'Goal', stamp, 'reviewing', stamp);
  db.prepare(`INSERT INTO booking_requests
    (id,customer_name,customer_phone,city,goal_summary,consent_at,status,created_at,session_type)
    VALUES(?,?,?,?,?,?,?,?,'training')`).run('33333333-3333-4333-8333-333333333333', 'Cancelled Booking', '55555557', 'Doha', 'Goal', stamp, 'cancelled', stamp);
  insertProfile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', users.applicant.user.id, 'Pending Coach', 'pending');
  insertProfile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', users.approved.user.id, 'Approved Coach', 'approved');
  db.prepare(`INSERT INTO coach_connections(id,coach_user_id,athlete_user_id,status,created_at,updated_at,workspace_status)
    VALUES(?,?,?,'accepted',?,?,'active')`).run('cccccccc-cccc-4ccc-8ccc-cccccccccccc', users.approved.user.id, users.manager.user.id, stamp, stamp);
  db.prepare('INSERT INTO coach_messages(id,connection_id,sender_user_id,body,created_at) VALUES(?,?,?,?,?)')
    .run('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', users.manager.user.id, 'private body', stamp);
  db.prepare('INSERT INTO coach_messages(id,connection_id,sender_user_id,body,created_at,read_at) VALUES(?,?,?,?,?,?)')
    .run('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', users.manager.user.id, 'already read', stamp, stamp);
  db.prepare(`INSERT INTO community_posts(id,author_user_id,kind,body,status,created_at,updated_at)
    VALUES(?,?,'post','Pending post','pending',?,?)`).run('ffffffff-ffff-4fff-8fff-ffffffffffff', users.manager.user.id, stamp, stamp);
  db.prepare(`INSERT INTO community_comments(id,post_id,user_id,body,status,created_at,updated_at)
    VALUES(?,?,?,'Hidden comment','hidden',?,?)`).run('12121212-1212-4212-8212-121212121212', 'ffffffff-ffff-4fff-8fff-ffffffffffff', users.manager.user.id, stamp, stamp);
  db.prepare(`INSERT INTO provider_achievements(id,provider_id,title,details,status,created_at,updated_at)
    VALUES(?,?,'Award','Details','pending',?,?)`).run('13131313-1313-4313-8313-131313131313', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', stamp, stamp);
  db.prepare(`INSERT INTO coach_blog_posts(id,coach_user_id,provider_id,title,summary,body,language,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'en','pending',?,?)`).run('14141414-1414-4414-8414-141414141414', users.applicant.user.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Article', 'Summary', 'Body', stamp, stamp);
  db.prepare(`INSERT INTO owner_agent_tasks(id,agent_type,title,status,approval_status,input_json,output_json,created_at)
    VALUES(?,'operations','Draft','completed','pending','{}',?,?)`).run('15151515-1515-4515-8515-151515151515', JSON.stringify({ answer: 'Recommendation' }), stamp);
  db.prepare(`INSERT INTO owner_agent_tasks(id,agent_type,title,status,approval_status,input_json,output_json,created_at)
    VALUES(?,'operations','No answer','completed','not_required','{}',?,?)`).run('16161616-1616-4516-8516-161616161616', JSON.stringify({ snapshot: {} }), stamp);
}

test('management dashboard counts genuine actionable records only', async () => {
  const { db, env } = makeEnv();
  try {
    const users = await accounts(env); seed(db, users);
    const data = await call(env, 'admin/dashboard', 'GET', undefined, users.admin.token);
    assert.deepEqual(data.counts, { bookings: 2, coaches: 1, messages: 1, community: 3, articles: 1, ai: 1 });
    assert.equal(data.unread, data.notifications.length);
    assert.equal(data.notifications.some(item => item.name === 'Cancelled Booking'), false);
    assert.equal(data.notifications.some(item => item.name === 'Approved Coach'), false);
    assert.equal(data.notifications.some(item => item.name === 'private body'), false);
    assert.equal(data.notifications.find(item => item.category === 'messages').name, 'manager@example.test');
    assert.ok(data.activity.every((event, index) => index === 0 || data.activity[index - 1].created_at >= event.created_at));
  } finally { db.close(); }
});

test('the bell total stays accurate beyond the bounded notification panel', async () => {
  const { db, env } = makeEnv();
  try {
    const users = await accounts(env); seed(db, users);
    const stamp = now();
    for (let index = 0; index < 55; index += 1) {
      const id = 'b' + String(index).padStart(8, '0') + '-1111-4111-8111-111111111111';
      db.prepare(`INSERT INTO booking_requests
        (id,customer_name,customer_phone,city,goal_summary,consent_at,status,created_at,session_type)
        VALUES(?,?,?,?,?,?,'received',?,'training')`)
        .run(id, 'Extra Booking ' + index, '55555555', 'Doha', 'Goal', stamp, stamp);
    }
    const data = await call(env, 'admin/dashboard', 'GET', undefined, users.admin.token);
    assert.equal(data.counts.bookings, 57);
    assert.equal(data.unreadCounts.bookings, 57);
    assert.ok(data.notifications.length <= 50);
    assert.ok(data.unread > data.notifications.length);
  } finally { db.close(); }
});

test('mark all clears the true actionable total beyond the 1000-item panel bound', async () => {
  const { db, env } = makeEnv();
  try {
    const users = await accounts(env); seed(db, users);
    const stamp = now();
    for (let index = 0; index < 1005; index += 1) {
      const id = 'c' + String(index).padStart(7, '0') + '-1111-4111-8111-111111111111';
      db.prepare(`INSERT INTO booking_requests
        (id,customer_name,customer_phone,city,goal_summary,consent_at,status,created_at,session_type)
        VALUES(?,?,?,?,?,?,'received',?,'training')`)
        .run(id, 'Bulk Booking ' + index, '55555555', 'Doha', 'Goal', stamp, stamp);
    }
    const before = await call(env, 'admin/dashboard', 'GET', undefined, users.admin.token);
    assert.equal(before.unreadCounts.bookings, 1007);
    assert.ok(before.unread > 1000);
    assert.ok(before.notifications.length <= 50);
    const result = await call(env, 'admin/notifications', 'PATCH', { all: true }, users.admin.token);
    assert.equal(result.updated, true);
    assert.ok(result.count >= 1007, result.count);
    const after = await call(env, 'admin/dashboard', 'GET', undefined, users.admin.token);
    assert.equal(after.unread, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM management_notification_reads WHERE category='bookings'").get().count, 1007);
    assert.equal(db.prepare("SELECT status FROM booking_requests WHERE id='11111111-1111-4111-8111-111111111111'").get().status, 'received');
  } finally { db.close(); }
});

test('notification visibility and read receipts respect management roles and stay separate from resolution', async () => {
  const { db, env } = makeEnv();
  try {
    const users = await accounts(env); seed(db, users);
    await call(env, 'admin/management/permissions', 'PUT', { email: 'manager@example.test', permissions: ['management.view', 'management.bookings'] }, users.admin.token);

    const manager = await call(env, 'admin/dashboard', 'GET', undefined, users.manager.token);
    assert.deepEqual(manager.counts, { bookings: 2 });
    assert.equal(manager.notifications.every(item => item.category === 'bookings'), true);
    await call(env, 'admin/messages', 'GET', undefined, users.manager.token, 403);
    await call(env, 'admin/notifications', 'PATCH', { id: 'coaches:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, users.manager.token, 400);

    const id = 'bookings:11111111-1111-4111-8111-111111111111';
    await call(env, 'admin/notifications', 'PATCH', { id }, users.admin.token);
    const read = await call(env, 'admin/dashboard', 'GET', undefined, users.admin.token);
    assert.equal(read.unread, 8);
    assert.equal(read.counts.bookings, 2);
    assert.ok(read.notifications.find(item => item.id === id).read_at);
    assert.equal(db.prepare("SELECT status FROM booking_requests WHERE id='11111111-1111-4111-8111-111111111111'").get().status, 'received');

    db.prepare("UPDATE booking_requests SET status='accepted' WHERE id='11111111-1111-4111-8111-111111111111'").run();
    const resolved = await call(env, 'admin/dashboard', 'GET', undefined, users.admin.token);
    assert.equal(resolved.counts.bookings, 1);
    assert.equal(resolved.notifications.some(item => item.id === id), false);

    await call(env, 'admin/notifications', 'PATCH', { all: true }, users.admin.token);
    const allRead = await call(env, 'admin/dashboard', 'GET', undefined, users.admin.token);
    assert.equal(allRead.unread, 0);
    assert.deepEqual(allRead.counts, { bookings: 1, coaches: 1, messages: 1, community: 3, articles: 1, ai: 1 });
  } finally { db.close(); }
});

test('dashboard queries stay within the D1 five-term compound SELECT limit', async () => {
  const { db, env } = makeEnv();
  try {
    const users = await accounts(env); seed(db, users);
    const statements = [], prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => { statements.push(sql); return prepare(sql); };
    await call(env, 'admin/dashboard', 'GET', undefined, users.admin.token);
    const dashboardStatements = statements.filter((sql) => sql.includes('booking_requests') || sql.includes('coach_blog_posts'));
    assert.ok(dashboardStatements.some((sql) => sql.includes('AS bookings') && sql.includes('AS ai')));
    assert.ok(dashboardStatements.every((sql) => (sql.match(/UNION ALL/g) || []).length < 5));
    // Six read-receipt placeholders must still bind to the same manager.
    const unread = dashboardStatements.find((sql) => sql.includes('management_notification_reads') && sql.includes('AS ai'));
    assert.equal((unread.match(/user_id=\?/g) || []).length, 6);
  } finally { db.close(); }
});

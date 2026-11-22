import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';
import { buildLocalPlan, generateTrainingPlan, generateCoachText } from './ai-provider.js';

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
  const raw = await response.text();
  assert.equal(response.status, expected, method + ' ' + path + ' → ' + raw);
  return raw ? JSON.parse(raw) : {};
}

const password = 'ai-coach-test-password';
const WEEK = '2026-11-23';

async function accounts(env) {
  const admin = await call(env, 'auth/register', 'POST', { email: env.ADMIN_EMAILS, password, consent: true }, null, 201);
  const athlete = await call(env, 'auth/register', 'POST', { email: 'athlete@example.test', password, consent: true, account_type: 'member' }, null, 201);
  const other = await call(env, 'auth/register', 'POST', { email: 'other@example.test', password, consent: true, account_type: 'member' }, null, 201);
  const coach = await call(env, 'auth/register', 'POST', { email: 'coach@example.test', password, consent: true, provider_type: 'coach', display_name: 'Test Coach', city: 'Doha' }, null, 201);
  return { admin, athlete, other, coach };
}

async function approvedCoach(db, env, coach) {
  const profile = db.prepare('SELECT id FROM provider_profiles WHERE user_id=?').get(coach.user.id);
  await call(env, 'admin/providers/' + profile.id, 'PATCH', { status: 'approved', verified: true }, (await call(env, 'auth/login', 'POST', { email: env.ADMIN_EMAILS, password })).token);
  return profile.id;
}

async function linkAthlete(env, coachToken, athleteToken) {
  const team = await call(env, 'dashboard/teams', 'POST', { name: 'Synthetic AI team' }, coachToken, 201);
  await call(env, 'dashboard/teams/join', 'POST', { join_code: team.join_code, display_name: 'Synthetic Athlete' }, athleteToken);
}

const draftBody = { sport: 'run', level: 'beginner', goal: 'general', days: ['monday', 'wednesday', 'friday'], duration: 45, language: 'en', week_start: WEEK };

test('local planner is deterministic, bilingual and applies conservative safety limits', () => {
  const plan = buildLocalPlan({ ...draftBody, language: 'ar', days: ['monday', 'tuesday', 'wednesday', 'thursday'], message: 'أشعر بإجهاد' });
  assert.equal(plan.provider, 'local');
  assert.equal(plan.sessions.length, 4);
  assert.ok(plan.sessions.every((session) => session.minutes <= 60));
  assert.equal(new Set(plan.sessions.map((session) => session.day_key)).size, 4);
  assert.ok(plan.sessions.some((session) => session.session_kind === 'recovery'));
  assert.ok(plan.sessions.every((session) => /دقيقة|استشفاء|سهلة|ثابتة|حركة/.test(session.details)));
  const injury = buildLocalPlan({ ...draftBody, message: 'my knee pain is worse' });
  assert.ok(injury.safety_warnings.length > 0);
  assert.ok(injury.sessions.every((session) => session.minutes <= 45));
});

test('optional providers fall back to the conservative local plan on medical claims or oversized loads', async () => {
  const unsafe = { AI_PROVIDER: 'workers', AI: { run: async () => ({ response: JSON.stringify({
    sessions: [
      { day_key: 'monday', sport_type: 'run', details: 'You have a stress injury; keep running hard.', minutes: 120 },
      { day_key: 'wednesday', sport_type: 'recovery', details: 'Easy movement.', minutes: 120 },
    ],
    coach_note: 'This will cure your injury.',
  }) }) } };
  const plan = await generateTrainingPlan(unsafe, { ...draftBody, language: 'en' });
  assert.match(plan.provider, /safety_fallback/);
  assert.equal(plan.sessions[0].minutes, draftBody.duration);
  assert.ok(plan.safety_warnings.length > 0);

  const capped = await generateTrainingPlan({ AI_PROVIDER: 'workers', AI: { run: async () => ({ response: JSON.stringify({
    sessions: [
      { day_key: 'monday', sport_type: 'run', details: 'Controlled run.', minutes: 180 },
      { day_key: 'wednesday', sport_type: 'recovery', details: 'Easy movement.', minutes: 180 },
    ], coach_note: 'Review before approving.',
  }) }) } }, draftBody);
  assert.ok(capped.sessions.every(session => session.minutes <= draftBody.duration));
  const note = await generateCoachText(unsafe, { system: 'x', prompt: 'Write a note' });
  assert.match(note.provider, /safety_fallback/);
  assert.match(note.text, /offline mode/i);
});

test('athlete generates, reviews and approves a plan that appears in the existing calendar', async () => {
  const { db, env } = makeEnv();
  try {
    const { athlete, other } = await accounts(env);
    const draft = await call(env, 'ai-coach/draft', 'POST', draftBody, athlete.token, 201);
    assert.equal(draft.requires_approval, true);
    assert.equal(draft.plan.provider, 'local');
    assert.equal(draft.plan.week_start, WEEK);
    assert.equal(db.prepare('SELECT status FROM ai_training_drafts WHERE id=?').get(draft.draft_id).status, 'draft');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM athlete_programs_v2').get().count, 0, 'draft is not saved before approval');

    const denied = await call(env, `ai-coach/drafts/${draft.draft_id}/approve`, 'POST', { approve: true }, other.token, 403);
    assert.equal(denied.error, 'forbidden');
    const missing = await call(env, `ai-coach/drafts/${draft.draft_id}/approve`, 'POST', {}, athlete.token, 400);
    assert.equal(missing.error, 'approval_required');

    const saved = await call(env, `ai-coach/drafts/${draft.draft_id}/approve`, 'POST', { approve: true, athlete_name: 'Synthetic Athlete' }, athlete.token);
    assert.equal(saved.source, 'ai_self');
    const program = db.prepare("SELECT source,athlete_user_id,week_start FROM athlete_programs_v2 WHERE id=?").get(saved.program_id);
    assert.equal(program.source, 'ai_self');
    assert.equal(program.athlete_user_id, athlete.user.id);
    const sessions = db.prepare('SELECT id FROM athlete_program_sessions_v2 WHERE program_id=?').all(saved.program_id);
    assert.equal(sessions.length, draft.plan.sessions.length);

    const calendar = await call(env, 'dashboard', 'GET', undefined, athlete.token);
    assert.equal(calendar.programs.some((item) => item.id === saved.program_id), true, 'approved plan is in the existing calendar');
    const duplicate = await call(env, 'ai-coach/draft', 'POST', draftBody, athlete.token, 201);
    const duplicateBlocked = await call(env, `ai-coach/drafts/${duplicate.draft_id}/approve`, 'POST', { approve: true }, athlete.token, 409);
    assert.equal(duplicateBlocked.error, 'weekly_program_exists');
    await call(env, `dashboard/program-sessions/${sessions[0].id}/complete`, 'POST', { completed: true, actual_km: 5, duration_minutes: 30 }, athlete.token);
    const progress = await call(env, 'ai-coach/progress', 'GET', undefined, athlete.token);
    assert.equal(progress.progress.completed_sessions, 1);
    assert.equal(progress.progress.total_minutes, 30);
  } finally { db.close(); }
});

test('adjustment chat creates a new reviewable draft and safety messages avoid progression', async () => {
  const { db, env } = makeEnv();
  try {
    const { athlete } = await accounts(env);
    const initial = await call(env, 'ai-coach/draft', 'POST', draftBody, athlete.token, 201);
    const adjusted = await call(env, 'ai-coach/chat', 'POST', {
      draft_id: initial.draft_id, message: 'I am tired, please make it easier', language: 'en', week_start: WEEK,
    }, athlete.token, 201);
    assert.equal(adjusted.requires_coach_approval, false);
    assert.ok(adjusted.plan.sessions.every((session) => session.minutes < 45 || session.minutes === 36));
    assert.notEqual(adjusted.draft_id, initial.draft_id);
    assert.equal(db.prepare('SELECT status FROM ai_training_drafts WHERE id=?').get(initial.draft_id).status, 'superseded');
    const danger = await call(env, 'ai-coach/chat', 'POST', { message: 'My chest hurts and I feel dizzy', language: 'en', week_start: WEEK }, athlete.token, 201);
    assert.ok(danger.plan.safety_warnings.length > 0);
    assert.ok(danger.plan.sessions.every((session) => session.minutes <= 38));
  } finally { db.close(); }
});

test('coach drafts require coach approval and athlete self-plans cannot overwrite coach-managed weeks', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, athlete, coach } = await accounts(env);
    await approvedCoach(db, env, coach);
    await linkAthlete(env, coach.token, athlete.token);
    const draft = await call(env, 'dashboard/ai-coach/draft', 'POST', {
      ...draftBody, athlete_user_id: athlete.user.id,
    }, coach.token, 201);
    assert.equal(db.prepare('SELECT role FROM ai_training_drafts WHERE id=?').get(draft.draft_id).role, 'coach');
    const athleteDenied = await call(env, `ai-coach/drafts/${draft.draft_id}/approve`, 'POST', { approve: true }, athlete.token, 403);
    assert.equal(athleteDenied.error, 'forbidden');
    const saved = await call(env, `dashboard/ai-coach/drafts/${draft.draft_id}/approve`, 'POST', { approve: true }, coach.token);
    assert.equal(saved.source, 'ai_coach_draft');
    const event = db.prepare("SELECT action FROM account_events WHERE action='ai_plan_approved_by_coach'").get();
    assert.ok(event);

    const conflict = await call(env, 'ai-coach/draft', 'POST', draftBody, athlete.token, 409);
    assert.equal(conflict.error, 'coach_managed_program');
    const chat = await call(env, 'ai-coach/chat', 'POST', { message: 'Can we make it easier?', week_start: WEEK }, athlete.token, 201);
    assert.equal(chat.requires_coach_approval, true);
    const blocked = await call(env, `ai-coach/drafts/${chat.draft_id}/approve`, 'POST', { approve: true }, athlete.token, 409);
    assert.equal(blocked.error, 'coach_approval_required');
    const note = await call(env, 'dashboard/ai-coach/note', 'POST', { task: 'session_note', prompt: 'Write a short easy run note in English.' }, coach.token);
    assert.equal(note.provider, 'local');
    assert.ok(note.draft.length > 10);
  } finally { db.close(); }
});

test('admin flags disable both coach and athlete planning, and settings stay super-admin-only', async () => {
  const { db, env } = makeEnv();
  try {
    const { admin, athlete, coach } = await accounts(env);
    await approvedCoach(db, env, coach);
    await linkAthlete(env, coach.token, athlete.token);
    const settings = await call(env, 'admin/ai/settings', 'GET', undefined, admin.token);
    assert.equal(settings.settings.find((item) => item.key === 'athlete_coach_enabled').value, 'true');
    await call(env, 'admin/ai/settings', 'PATCH', { athlete_coach_enabled: false, coach_planner_enabled: false }, admin.token);
    const disabledAthlete = await call(env, 'ai-coach/draft', 'POST', draftBody, athlete.token, 403);
    assert.equal(disabledAthlete.error, 'ai_feature_disabled');
    const disabledCoach = await call(env, 'dashboard/ai-coach/draft', 'POST', { ...draftBody, athlete_user_id: athlete.user.id }, coach.token, 403);
    assert.equal(disabledCoach.error, 'ai_feature_disabled');
    await call(env, 'admin/ai/settings', 'PATCH', { athlete_coach_enabled: true }, athlete.token, 403);
  } finally { db.close(); }
});

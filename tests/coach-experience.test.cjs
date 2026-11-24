const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('approved coaches are routed to the real dashboard', () => {
  const worker = read('backend/worker.js');
  const match = /await isApprovedCoach\(env, user\)\) \{\s*accountType = "provider";\s*dashboardPath = "([^"]+)"/.exec(worker);
  assert.ok(match, 'approved coach branch exists');
  assert.equal(match[1], '/dashboard.html');
});

test('coach dashboard has My Athletes and confirmed program delivery UI', () => {
  const html = read('dashboard.html');
  assert.match(html, /assets\/js\/coach-dashboard\.js/);
  assert.match(html, /week\.dataset\.programId=p\.id/);
  const js = read('assets/js/coach-dashboard.js');
  for (const marker of [
    'dashboard/athletes', 'data-connection-id', 'programs/\' + encodeURIComponent(state.programId) + \'/send',
    'athlete_user_id', 'record-focus', 'data-en="My Athletes"',
  ]) assert.ok(js.includes(marker), marker);
});

test('notifications and manual WhatsApp handoff carry exact deep links', () => {
  const worker = read('backend/worker.js');
  assert.match(worker, /INSERT INTO user_notifications\(id,user_id,type,title,body,entity_type,entity_id,href,created_at\)/);
  assert.match(worker, /dashboard\.html\?connection=\$\{id\}#myAthletes/);
  assert.match(worker, /dashboard\.html\?program=\$\{programId\}#athleteProgramHistory/);
  assert.match(read('dashboard.html'), /dashboard\.html\?program='\+encodeURIComponent\(saved\.id\|\|''\)\+'#athleteProgramHistory/);
});

test('additive migration is present and safe', () => {
  const sql = read('backend/migrations/0038_coach_experience.sql');
  assert.match(sql, /ALTER TABLE user_notifications ADD COLUMN href TEXT/);
  assert.match(sql, /ALTER TABLE athlete_programs_v2 ADD COLUMN sent_at TEXT/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS coach_notification_outbox/);
});

test('coach quick actions, settings and athlete coach display are wired', () => {
  const js = read('assets/js/coach-strava-nav.js');
  for (const marker of ['coachTopNav', 'coachBottomNav', 'My Profile', 'Settings', 'Log Out']) {
    assert.ok(js.includes(marker), marker);
  }
  const worker = read('backend/worker.js');
  assert.match(worker, /CREATE TABLE|user_notification_preferences/);
  assert.match(worker, /connectedCoaches = rows\.results/);
  assert.match(read('backend/migrations/0039_user_notification_preferences.sql'), /user_notification_preferences/);
});

test('program editor supports flexible duration, sports and channel choice', () => {
  const html = read('dashboard.html');
  assert.match(html, /assets\/js\/program-editor-enhancements\.js/);
  const js = read('assets/js/program-editor-enhancements.js');
  for (const marker of ['programDurationUnit', 'programDurationValue', 'programWeekLabel', 'programPrevWeek', 'programNextWeek', 'session_date', 'programSendTo', 'programSend', 'programSaveDraft', 'program-more', 'program-draft', 'bodybuilding']) {
    assert.ok(js.includes(marker), marker);
  }
  const admin = read('assets/js/coach-dashboard.js');
  assert.match(admin, /sendChannel/);
  assert.match(admin, /Edit program/);
  const worker = read('backend/worker.js');
  assert.match(worker, /duration_value/);
  assert.match(worker, /session_date/);
  assert.match(worker, /program-draft/);
  assert.match(read('backend/migrations/0040_program_editor_functional.sql'), /duration_value/);
  assert.match(read('backend/migrations/0041_program_drafts.sql'), /program_drafts/);
});

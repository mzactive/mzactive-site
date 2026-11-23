const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Run IQ migration is additive and private by default', () => {
  const sql = read('backend/migrations/0033_run_iq.sql') + read('backend/migrations/0034_run_iq_intelligence.sql');
  for (const marker of [
    'CREATE TABLE IF NOT EXISTS run_iq_assessments',
    'CREATE TABLE IF NOT EXISTS run_iq_plans',
    'CREATE TABLE IF NOT EXISTS run_iq_workout_logs',
    'CREATE TABLE IF NOT EXISTS run_iq_shares',
    'CREATE TABLE IF NOT EXISTS run_iq_advice_history',
    'CREATE TABLE IF NOT EXISTS run_iq_race_results',
    "CHECK (status IN ('active', 'revoked'))",
    'UNIQUE(user_id, coach_user_id)',
  ]) assert.ok(sql.includes(marker), marker);
});

test('Run IQ is a Resources item and preserves the training programme route', () => {
  const home = read('index.html');
  assert.match(home, /<a href="run-iq\.html" data-en="MZA Run IQ"/);
  const resources = home.split('data-en="Resources"')[1].split('</details>')[0];
  assert.match(resources, /run-iq\.html/);
  assert.doesNotMatch(resources, /training-programmes\.html/);
  assert.match(home, /href="training-programmes\.html"[^>]*data-en="Training programs"/);
});

test('RunIQ 2.0 keeps guest results free and uses existing infrastructure', () => {
  const html = read('run-iq.html');
  for (const marker of [
    'api/run-iq/preview', 'api/run-iq/save', 'api/run-iq/me', 'api/run-iq/coaches',
    'api/auth/register', 'account_type:\'member\'', 'id="nextButton"', 'id="saveForm"', 'id="paceCards"', 'id="raceCard"', 'id="revealSave"',
    'data-en="MZA Run IQ"', 'id="privacyTitle"',
  ]) assert.ok(html.includes(marker), marker);
  assert.match(html, /key==='target'&&!p\.paces\.targetPace/);
  assert.match(html, /window\.MZACTIVE_API_BASE/);
  assert.match(html, /assets\/js\/site-language\.js/);
  assert.doesNotMatch(html, /stripe|paypal|checkout|payment\.intent/i);
});

test('Run IQ worker reuses athlete calendar and enforces consent', () => {
  const worker = read('backend/worker.js');
  for (const marker of [
    'async function handleRunIqApi',
    'url.pathname.startsWith("/api/run-iq")',
    'athlete_programs_v2',
    "source)\n        VALUES(?,?,?,?,?, 'runner', ?,?,?,'ai_self')",
    "if (body?.consent !== true) return reply(request, env, { error: \"consent_required\" }, 400)",
    "lower(p.specialties_json) LIKE '%run%'",
    'if (!await isMemberAccount(env, user))',
  ]) assert.ok(worker.includes(marker), marker);
});

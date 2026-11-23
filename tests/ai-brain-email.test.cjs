const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('AI Brain email migration is additive and configured for Qatar', () => {
  const sql = read('backend/migrations/0032_mz_ai_brain_email.sql');
  for (const marker of [
    'CREATE TABLE IF NOT EXISTS ai_brain_settings',
    "report_time TEXT NOT NULL DEFAULT '07:00'",
    "timezone TEXT NOT NULL DEFAULT 'Asia/Qatar'",
    "admin_email TEXT NOT NULL DEFAULT 'mzactive@yahoo.com'",
    'CREATE TABLE IF NOT EXISTS ai_brain_outbox',
    'event_key TEXT NOT NULL UNIQUE',
    'CREATE TABLE IF NOT EXISTS ai_brain_reports',
    'report_date TEXT NOT NULL UNIQUE',
    'CREATE TABLE IF NOT EXISTS ai_brain_errors',
  ]) assert.ok(sql.includes(marker), marker);
});

test('registration, approval and daily report email paths use real data', () => {
  const worker = read('backend/worker.js');
  for (const marker of [
    'const AI_BRAIN_ADMIN_EMAIL = "mzactive@yahoo.com"',
    'async function queueAiBrainEmail',
    'async function notifyAiBrainRegistration',
    'async function runAiBrainDailyReport',
    'eventKey: `registration:${userId}`',
    'eventKey: `approval:${userId}`',
    'eventKey: `daily-report:${clock.date}',
    'async function recordAiBrainError',
    'notifyAiBrainRegistration(env, userId',
    'runAiBrainDailyReport(env, event.scheduledTime',
    'if (path.includes("/ai-brain")) return "management.ai"',
  ]) assert.ok(worker.includes(marker), marker);
  assert.match(worker, /new_registrations: await count\("SELECT COUNT\(\*\) AS count FROM users/);
  assert.match(worker, /pending_approvals: await count\("SELECT COUNT\(\*\) AS count FROM provider_profiles/);
  assert.match(worker, /booking_requests: await count\("SELECT COUNT\(\*\) AS count FROM booking_requests/);
});

test('admin AI panel exposes status, settings, errors and human confirmation', () => {
  const admin = read('assets/js/admin.js');
  for (const marker of [
    "async function aiBrainPanel(root)",
    "api('admin/ai-brain')",
    "api('admin/ai-brain/test-email'",
    "api('admin/ai-brain/run'",
    "window.confirm(t('Save AI Brain notification settings?",
    "window.confirm(t('Send a real test email to the administrator?",
    "window.confirm(t('Generate and email the AI Brain report now?",
    "t('Enable email notifications'",
    "t('Daily report time (Asia/Qatar)'",
    "t('Recent errors'",
  ]) assert.ok(admin.includes(marker), marker);
});

test('AI Brain notifications introduce no paid service or WhatsApp channel', () => {
  const changes = [
    read('backend/migrations/0032_mz_ai_brain_email.sql'),
    read('backend/ai-brain-email.test.js'),
    read('tests/e2e/admin-ai-brain.spec.cjs'),
  ].join('\n');
  assert.doesNotMatch(changes, /stripe|paypal|checkout\.js|wa\.me|whatsapp/i);
  assert.match(changes, /mzactive@yahoo\.com/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('ai-coach.html');
const dashboard = read('dashboard.html');
const ui = read('assets/js/ai-coach.js');
const coachUi = read('assets/js/dashboard-ai-coach.js');
const admin = read('assets/js/admin.js');
const api = read('backend/ai-coach.js');
const adapter = read('backend/ai-provider.js');
const worker = read('backend/worker.js');
const migration = read('backend/migrations/0029_ai_coach.sql');
const readme = read('backend/README.md');
const research = read('docs/ai-provider-research.md');

test('AI Coach migration is additive and keeps approval state separate', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_coach_settings/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_training_drafts/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'draft'/);
  assert.match(migration, /requires_coach_approval INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /ALTER TABLE athlete_programs_v2 ADD COLUMN source TEXT NOT NULL DEFAULT 'coach'/);
  assert.match(migration, /source IN \('coach','ai_self','ai_coach_draft'\)/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|UPDATE users/);
  assert.match(readme, /0029_ai_coach\.sql/);
});

test('AI adapter defaults to offline local mode and guards paid providers', () => {
  assert.match(adapter, /providerName\(env\).*\"local\"/s);
  assert.match(adapter, /if \(provider === \"local\" \|\| provider === \"mock\"\) return null/);
  assert.match(adapter, /DEEPSEEK_MODEL = \"deepseek-flash\"/);
  assert.match(adapter, /if \(!env\?\.DEEPSEEK_API_KEY\) throw Error\(\"provider_unconfigured\"\)/);
  assert.match(adapter, /if \(!env\?\.AI_BASE_URL\) throw Error\(\"provider_unconfigured\"\)/);
  assert.match(adapter, /Progression is capped at 10% per week/);
  assert.match(adapter, /MEDICAL_CLAIM/);
  assert.match(adapter, /_safety_fallback/);
  assert.match(adapter, /not medical advice/);
  assert.doesNotMatch(adapter, /AI_PROVIDER\s*=\s*['\"]deepseek/);
  assert.doesNotMatch(research, /free tier is available/);
  assert.match(research, /No genuinely free developer API tier/);
  assert.match(research, /Linger is not a hosted AI model API/);
});

test('API enforces approval, isolation, linked coaches and super-admin flags', () => {
  assert.match(api, /handleAiCoachApi/);
  assert.match(api, /if \(!user\) return deps\.reply\(request, env, \{ error: \"unauthorized\" \}, 401\)/);
  assert.match(api, /athlete_coach_enabled/);
  assert.match(api, /coach_planner_enabled/);
  assert.match(api, /if \(!await deps\.isMemberAccount\(env, user\)\)/);
  assert.match(api, /if \(!await deps\.isApprovedCoach\(env, user\)\)/);
  assert.match(api, /if \(!deps\.isSuperAdmin\(user\)\)/);
  assert.match(api, /if \(body\?\.approve !== true\).*approval_required/s);
  assert.match(api, /draft\.owner_user_id !== user\.id/);
  assert.match(api, /coach_approval_required/);
  assert.match(api, /athlete_programs_v2/);
  assert.match(api, /source<>'ai_self'/);
  assert.match(api, /rateLimitScoped/);
  assert.match(worker, /import \{ handleAiCoachApi \} from \"\.\/ai-coach\.js\"/);
  assert.match(worker, /const aiCoachResponse = await handleAiCoachApi/);
});

test('athlete page is mobile-first, bilingual and uses the existing calendar', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/);
  assert.match(html, /<link rel="manifest" href="\/manifest\.json">/);
  assert.match(html, /data-en="[^"]+" data-ar="[^"]+"/);
  assert.match(html, /class="ai-bottom-nav"/);
  for (const label of ['Home', 'Plan', 'AI Coach', 'Community', 'Profile']) {
    assert.match(html, new RegExp(`data-en="${label}"`));
  }
  assert.match(html, /dashboard\.html#athleteProgramHistory/);
  assert.match(html, /Nothing is saved until you approve it/);
  assert.match(html, /data-en-placeholder/);
  assert.match(html, /assets\/js\/site-language\.js/);
  assert.match(html, /assets\/js\/language-preference\.js/);
  assert.match(html, /assets\/js\/pwa-register\.js/);
  assert.match(ui, /window\.MZActiveAuth\?\.token/);
  assert.match(ui, /ai-coach\/draft/);
  assert.match(ui, /ai-coach\/chat/);
  assert.match(ui, /ai-coach\/progress/);
  assert.match(ui, /approve: true/);
  assert.match(dashboard, /href="ai-coach\.html"/);
});

test('athlete page distinguishes logged-out, disabled, unauthorized and service states', () => {
  assert.match(html, /id="authGate"/);
  assert.match(html, /href="dashboard\.html\?next=\/ai-coach\.html#loginForm"/);
  assert.match(html, /id="retryInit"/);
  assert.match(html, /id="roleGate"/);
  assert.match(dashboard, /next==='\/ai-coach\.html'/);
  assert.match(ui, /error\?\.status === 401/);
  assert.match(ui, /ai_feature_disabled/);
  assert.match(ui, /reportError\(/);
  assert.match(ui, /COPY\.unavailable/);
  assert.match(ui, /localize\(\$\('aiStatus'\)/);
  assert.match(ui, /mzactive:language-change/);
  for (const copy of ['signIn', 'disabled', 'unavailable', 'verifyFailed', 'memberOnly', 'coachOnly', 'coachManaged']) {
    assert.match(ui, new RegExp(`${copy}:`));
  }
});

test('coach planner requires a linked athlete and explicit approval in the dashboard', () => {
  assert.match(dashboard, /id="coachPlanAiPanel"/);
  assert.match(dashboard, /id="coachPlanAthlete"/);
  assert.match(dashboard, /id="coachPlanApprove"/);
  assert.match(coachUi, /dashboard\/ai-coach\/draft/);
  assert.match(coachUi, /dashboard\/ai-coach\/drafts\/\$\{draftId\}\/approve/);
  assert.match(coachUi, /approve: true/);
  assert.match(coachUi, /Choose a linked athlete first/);
  assert.match(admin, /aiCoachSettings/);
  assert.match(admin, /admin\/ai\/settings/);
});

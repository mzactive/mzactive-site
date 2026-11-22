const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const adminHtml = read('admin.html');
const adminJs = read('assets/js/admin.js');
const adminCss = read('assets/css/admin.css');
const worker = read('backend/worker.js');
const crm = read('backend/athlete-crm.js');
const migration = read('backend/migrations/0022_athlete_crm.sql');
const invitationHtml = read('athlete-invitations.html');
const invitationJs = read('assets/js/athlete-invitations.js');
const communityHtml = read('community.html');
const communityJs = read('assets/js/community-feed.js');

test('the management portal exposes an Athletes tab with cache-busted CRM assets', () => {
  assert.match(adminHtml, /id="nav"/);
  assert.match(adminHtml, /id="view"/);
  assert.match(adminHtml, /assets\/css\/admin\.css\?v=20261123b/);
  assert.match(adminHtml, /assets\/js\/admin\.js\?v=20261124a/);
  assert.match(adminJs, /athletes:\['Athletes','الرياضيون'\]/);
  assert.match(adminJs, /athletes:'management\.coaches'/);
});

test('the athlete directory is searchable, filterable, sortable and every athlete is clickable', () => {
  assert.match(adminJs, /node\('input',null,'athlete-search'\)/);
  assert.match(adminJs, /'athlete-filter'/);
  assert.match(adminJs, /\['all',labels\.all_athletes\][\s\S]{0,420}\['onboarding_incomplete',labels\.onboarding_incomplete\]/);
  assert.match(adminJs, /node\('select',null,'athlete-sort'\)/);
  assert.match(adminJs, /dataset\.recordId=a\.id/);
  assert.match(adminJs, /b\.onclick=\(\)=>openAthleteDetail\(a\.id\)/);
  assert.match(adminJs, /api\('admin\/athletes\?'\+athleteParams\(\)\.toString\(\)\)/);
  assert.match(adminJs, /recordId&&\(data\.athletes\|\|\[\]\)\.some\(a=>a\.id===recordId\)/);
  assert.match(adminJs, /focusRecord\(\)/);
});

test('the athlete drawer shows verified fields, safe next steps and all required actions', () => {
  for (const action of ['view_profile', 'recommend_coach', 'invite_profile', 'view_programs', 'view_bookings', 'revoke_coach', 'resend_invitation']) {
    assert.match(adminJs, new RegExp(`labels\\.${action}`), action);
  }
  assert.match(adminJs, /labels\.not_provided/);
  assert.match(adminJs, /crmField\(t\('Name','الاسم'\),a\.name\)/);
  assert.match(adminJs, /Verified athlete profile/);
  assert.match(adminJs, /crm-recommendations/);
  assert.match(adminJs, /labels\.why_recommended/);
  assert.match(adminJs, /labels\.audit_history/);
  assert.match(adminJs, /labels\.consent_notice/);
  assert.match(adminJs, /requires_approval|Invitation saved\. The athlete must accept/);
  assert.match(adminJs, /No medical advice/);
});

test('CRM actions expose loading, success, error and cancelled states', () => {
  assert.match(adminJs, /function crmAction\(label,statusNode,fn,successPair\)/);
  assert.match(adminJs, /b\.setAttribute\('aria-busy','true'\)/);
  assert.match(adminJs, /setCrmStatus\(statusNode,t\('Working…','جارٍ التنفيذ…'\),'busy'\)/);
  assert.match(adminJs, /setCrmStatus\(statusNode,successPair\?t\(\.\.\.successPair\)/);
  assert.match(adminJs, /e\?\.cancelled/);
  assert.match(adminJs, /errorMessage\(e\)\.split\(' · '\)\[0\],'error'/);
});

test('CRM DOM helpers use node(tag,text,class) correctly and define every label', () => {
  // Regression: class names must never be passed as the text argument of
  // node(tag,text,class). That silently hid the whole directory and drawer.
  assert.doesNotMatch(adminJs, /node\('[a-z]+','(?:crm|athlete)[-a-z]*'\)/);
  assert.doesNotMatch(adminJs, /node\('[a-z]+','(?:crm|athlete)[-a-z]*,/);
  const defined = new Set([...adminJs.matchAll(/([a-zA-Z_]+):\['/g)].map(m => m[1]));
  const used = new Set([...adminJs.matchAll(/labels\.([a-zA-Z_]+)/g)].map(m => m[1]));
  assert.deepEqual([...used].filter(key => !defined.has(key)), []);
  for (const key of ['active', 'inactive', 'assigned', 'unassigned', 'onboarding_incomplete']) {
    assert.ok(used.has(key) && defined.has(key), key);
  }
});

test('CRM styles are premium, responsive and RTL aware', () => {
  assert.match(adminCss, /\.athlete-toolbar\{/);
  assert.match(adminCss, /\.athlete-card\{/);
  assert.match(adminCss, /\.athlete-drawer\{/);
  assert.match(adminCss, /html\[dir="rtl"\] \.athlete-drawer/);
  assert.match(adminCss, /\.crm-dialog\{/);
  assert.match(adminCss, /\.crm-field \.crm-missing\{/);
  assert.match(adminCss, /\.crm-reasons\{/);
  assert.match(adminCss, /@media\(max-width:760px\)\{[\s\S]*\.athlete-drawer\{width:100vw\}/);
});

test('backend CRM derives status server-side and protects permission boundaries', () => {
  assert.match(worker, /athleteCrmDirectory\(env/);
  assert.match(worker, /onboarding_incomplete: onboardingIncomplete\(profile\)/);
  assert.match(worker, /active: isActive\(row\)/);
  assert.match(worker, /assignment_status: assigned \? "assigned"/);
  assert.match(worker, /status IN \('received','reviewing',\)\.replace|status IN \('received','reviewing'\)/);
  assert.match(worker, /path\.includes\("\/athletes\/"\) && path\.includes\("\/recommendations"\)\) return "management\.ai"/);
  assert.match(worker, /No medical advice, diagnosis or licensed-coach claim is made/);
  assert.match(worker, /coach_user_id\?\?|coach\.user_id === athlete\.id/);
  assert.match(worker, /await sha256\(token\)/);
  assert.match(worker, /newInvitationToken\(\)/);
  assert.doesNotMatch(worker, /console\.(log|info)\(.*token/);
  assert.match(worker, /WHERE p\.status='approved' AND p\.provider_type='coach'/);
});

test('CRM detail queries use the statement returned by D1 bind()', () => {
  // Production D1 bind() is immutable. Discarding its return value caused the
  // athlete detail endpoint to fail with "Wrong number of parameter bindings".
  assert.match(worker, /const statement = params\.length[\s\S]{0,240}?\.bind\(\.\.\.params\)/);
  assert.doesNotMatch(worker, /if\s*\(params\.length\)\s*statement\.bind\(\.\.\.params\)/);
});

test('CRM helpers never claim a diagnosis and invitation emails carry a signed-out link', () => {
  assert.match(crm, /You decide\. Nothing is shared and no workspace opens until you accept/);
  assert.match(crm, /ATHLETE_INVITATION_URL = "https:\/\/mzactive\.com\/athlete-invitations\.html"/);
  assert.match(crm, /ATHLETE_INVITATION_TTL_DAYS = 14/);
  assert.match(crm, /You decide\. Nothing is shared and no workspace opens until you accept/);
  assert.match(crm, /arabicFirst \? "rtl" : "ltr"/);
});

test('the athlete consent page keeps tokens URL-only and never stores them', () => {
  assert.match(invitationHtml, /id="invitationAccept"/);
  assert.match(invitationHtml, /id="invitationDecline"/);
  assert.match(invitationHtml, /data-en="Accept" data-ar="قبول"/);
  assert.match(invitationHtml, /data-en="Decline" data-ar="رفض"/);
  assert.match(invitationJs, /location\.search/);
  assert.match(invitationJs, /URLSearchParams\(location\.search\)\.get\('token'\)/);
  assert.doesNotMatch(invitationJs, /localStorage|sessionStorage/);
  assert.doesNotMatch(invitationJs, /console\.(log|info|debug)/);
  assert.match(invitationHtml, /No coaching workspace opens unless you accept\. Nothing here is a medical claim or diagnosis/);
});

test('member profile forms save preferred language and availability without changing branding', () => {
  assert.match(communityHtml, /id="sportsLanguage"/);
  assert.match(communityHtml, /id="sportsAvailability"/);
  assert.match(communityJs, /sportsLanguage/);
  assert.match(communityJs, /sportsAvailability/);
  assert.match(communityJs, /preferred_language/);
  assert.match(communityJs, /availability_notes/);
});

test('the athlete CRM migration is additive and consent-safe', () => {
  assert.match(migration, /ALTER TABLE member_sports_profiles ADD COLUMN preferred_language/);
  assert.match(migration, /ALTER TABLE member_sports_profiles ADD COLUMN availability_notes/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS athlete_crm_invitations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS athlete_crm_events/);
  assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(migration, /status TEXT NOT NULL CHECK \(status IN \('pending','accepted','declined','revoked','expired','email_failed'\)\)/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|UPDATE users/);
});

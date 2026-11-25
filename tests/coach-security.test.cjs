'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('coach.html');
const profileJs = read('assets/js/coach-profile.js');
const worker = read('backend/worker.js');
const adminJs = read('assets/js/admin.js');
const dashboard = read('dashboard.html');
const providers = read('providers.html');
const contactJs = read('assets/js/coach-contact.js');
const completionJs = read('assets/js/profile-completion.js');
const completionCss = read('assets/css/profile-completion.css');
const migration = read('backend/migrations/0023_coach_communications.sql');
const communityGroups = read('backend/community-groups.js');

test('public coach markup contains guest contact but no private owner controls', () => {
  for (const marker of [
    'id="editProfile"', 'id="changePhoto"', 'id="photoInput"',
    'id="changeCover"', 'id="coverInput"', 'id="followCoach"',
    'id="bookingInbox"', 'id="ownerMetrics"',
    'id="snapshotMetrics"', 'id="upcomingSessions"', 'dashboard.html#coachTeams',
    'dashboard.html#whatsappTrainingForm',
  ]) assert.doesNotMatch(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), marker);
  assert.match(html, /id="ownerRail"[^>]*hidden><\/aside>/);
  assert.match(html, /id="share"/);
  assert.match(html, /id="book"/);
  assert.match(html, /id="connectCoach"/);
  assert.match(html, /<dialog id="coachContact"/);
  assert.match(profileJs, /if \(!profile \|\| profile\.viewer\?\.owner/);
});

test('coach profile gates private controls on server-supplied viewer state', () => {
  assert.match(profileJs, /p\.viewer\?\.owner/);
  assert.match(profileJs, /p\.viewer\?\.can_message/);
  assert.match(profileJs, /me\.profile\?\.id !== p\.id\) return/);
  assert.match(profileJs, /if \(p\.viewer\?\.owner\) exposeOwnerTools\(p\)/);
});

test('public coach community data is limited to published public events and posts', () => {
  assert.ok(communityGroups.includes(String.raw`/^\/api\/providers\/([\w-]{36})\/community$/`));
  assert.match(communityGroups, /p\.visibility='public'/);
  assert.match(communityGroups, /p\.cancelled_at IS NULL/);
  assert.match(communityGroups, /p\.status='published'/);
  assert.doesNotMatch(communityGroups, /\/api\/providers\/[\w-]{36}\/community\/contacts/);
  assert.match(html, /id="coachCommunityEvents"/);
});

test('public API exposes viewer permissions but keeps profile reads public-only', () => {
  assert.match(worker, /viewer: \{[\s\S]*authenticated: Boolean\(viewer\)[\s\S]*owner: Boolean\(viewer && viewer\.id === row\.user_id\)[\s\S]*can_message: Boolean\(viewer && viewer\.id !== row\.user_id\)/);
  assert.match(worker, /publicProviders\(url, request, env/);
  assert.doesNotMatch(worker, /\/api\/providers\/[\w-]{36}\/profile/);
});

test('completeness is calculated from stored fields and separated from approval', () => {
  assert.match(worker, /function profileCompletion\(row = \{\}\)/);
  assert.match(worker, /required,\s*recommended,\s*score/);
  assert.match(worker, /\/api\/me\/completeness/);
  assert.match(worker, /coachContactMatch = \/\^\\\/api\\\/admin\\\/coaches/);
  assert.match(dashboard, /id="profileCompleteness"[^>]*data-profile-completion/);
  assert.match(providers, /id="providerCompletion"[^>]*data-profile-completion/);
  assert.match(completionJs, /\/api\/me\/completeness/);
  assert.match(completionJs, /data-completion-field/);
  assert.match(completionCss, /profile-completion-fill/);
});

test('management and coach contact flows use configured details and explicit states', () => {
  assert.match(worker, /MANAGEMENT_CONTACT_EMAIL/);
  assert.match(worker, /MANAGEMENT_CONTACT_WHATSAPP/);
  assert.match(worker, /function managementContactConfig\(env\)/);
  assert.match(worker, /COACH_CONTACT_PURPOSES = \["profile_support","bookings","programs","technical_issue","other"\]/);
  assert.match(worker, /COACH_CONTACT_STATES = \["drafted","opened","confirmed_sent","completed","failed"\]/);
  assert.match(worker, /\/api\/admin\/contact-config/);
  assert.match(worker, /\/api\/me\/contact-config/);
  assert.match(worker, /\/api\/me\/contacts/);
  assert.match(adminJs, /Contact management/);
  assert.match(adminJs, /Mark opened/);
  assert.match(adminJs, /Mark sent/);
  assert.match(dashboard, /id="coachContactPanel"/);
  assert.match(contactJs, /management_contact_not_configured/);
  assert.match(worker, /Hello MZ Active Management/);
  assert.match(worker, /Hello \$\{target\.name\}/);
  assert.match(worker, /whatsappLink\(detail, prepared\)/);
  assert.match(worker, /whatsappLink\(target\.whatsapp, prepared\)/);
});

test('Momo is rule-based, draft-only, deduplicated and scheduled through the Worker', () => {
  assert.match(worker, /async function runMomoCoachFollowUps\(env\)/);
  assert.match(worker, /momo_followup_id: followupId/);
  assert.match(worker, /'completed','pending'/);
  assert.match(worker, /next_check_at/);
  assert.match(worker, /await runMomoCoachFollowUps\(env\)/);
  assert.ok(worker.includes('path.includes("/momo")) return "management.ai"'));
  assert.match(migration, /CREATE TABLE IF NOT EXISTS momo_coach_followups/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS coach_contact_records/);
  assert.match(adminJs, /Momo prepares rule-based profile follow-up drafts only/);
  assert.match(adminJs, /Send approved email/);
  assert.doesNotMatch(worker, /sendManagementEmail\(env,[^)]*\);\s*\/\/ auto/);
});

test('new migration is additive and preserves existing tables', () => {
  assert.doesNotMatch(migration, /DROP TABLE|ALTER TABLE|DELETE FROM|UPDATE /);
  assert.match(migration, /ON DELETE CASCADE/);
});

test('community media is authorization-aware and never publicly cached', () => {
  assert.ok(worker.includes('binaryReply(request, env, row.bytes, row.content_type, "private, no-store")'));
  assert.ok(worker.includes('headers.set("vary", `${headers.get("vary") || "Origin"}, Authorization`)'));
  assert.ok(communityGroups.includes('"private, no-store"'));
  assert.doesNotMatch(communityGroups, /public, max-age=3600/);
});

test('community identities and public surfaces never fall back to registered emails', () => {
  assert.doesNotMatch(communityGroups, /COALESCE\(msp\.display_name,pp\.display_name,u\.email\)/);
  assert.ok(communityGroups.includes("COALESCE(NULLIF(msp.display_name,''),NULLIF(pp.display_name,''),'Member')"));
  assert.ok(communityGroups.includes("c.status='active' AND c.visibility='public'"));
  assert.doesNotMatch(worker, /COACH_PROFILE_EDIT_URL/);
});

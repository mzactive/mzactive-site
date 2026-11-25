import { handleCommunityEventAlerts, deliverCommunityEventAlerts } from "./community-event-alerts.js";
import { wellnessApi } from "./athlete-wellness.js";
import { coachLibraryApi } from "./coach-library.js";
import { ATHLETE_INVITATION_TTL_DAYS, onboardingIncomplete, lastActivityAt, isActive, coachMatches, invitationEmail } from "./athlete-crm.js";
import { handleCommunityGroupsApi } from "./community-groups.js";
import { handleAiCoachApi } from "./ai-coach.js";
import { cleanAssessment, analyzeAssessment, buildStarterPlan, mondayOf, assessmentFingerprint, buildAdvice, analyzeRaceResult, formatPace } from "./run-iq.js";

const SESSION_TTL_SECONDS = 60 * 60 * 12;
const PASSWORD_RESET_TTL_SECONDS = 15 * 60;
// Administrator links expire sooner and get a tighter rate limit; the offline
// owner key stays available only as an emergency fallback.
const ADMIN_PASSWORD_RESET_TTL_SECONDS = 5 * 60;
const RESET_EMAIL_SUBJECT = "Reset your MZ Active password / إعادة تعيين كلمة مرور MZ Active";
const WELCOME_EMAIL_SUBJECT = "Welcome to the MZActive Family! 💛";
const COACH_PROFILE_URL = "https://mzactive.com/dashboard.html#editCoachProfile";
const MOMO_PROFILE_BASE = "https://mzactive.com/coach.html?id=";
const WELCOME_MAX_ATTEMPTS = 5;
// Cloudflare Workers Web Crypto caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;
const MAX_BODY_BYTES = 16_384;
const MAX_PROFILE_PHOTO_BYTES = 1_000_000;
const MAX_CV_BYTES = 5_000_000;
const CV_PDF_TYPE = "application/pdf";
const CV_DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DAILY_ASSISTANT_REQUESTS = 60;
const MAX_WORKSPACE_ATTACHMENT_BYTES = 1_000_000;
const WORKSPACE_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]);
const WORKSPACE_PROGRESS_METRICS = new Set(["distance_km", "duration_minutes", "sessions_completed", "average_pace", "planned_sessions", "completed_sessions", "note"]);
const ATHLETE_CRM_INVITE_LIMIT = 10;
const MOMO_REMINDER_INTERVAL_DAYS = 7;
const MOMO_ESCALATE_AFTER_DAYS = 14;
const MOMO_MAX_ATTEMPTS = 3;
const AI_BRAIN_ADMIN_EMAIL = "mzactive@yahoo.com";
const MANAGEMENT_PERMISSION_CODES = ["management.view", "management.coaches", "management.bookings", "management.community", "management.articles", "management.ai", "management.audit"];
// Each notification category maps to an existing least-privilege permission.
// There is no new role and no broad "see everything" shortcut.
const MANAGEMENT_NOTIFICATION_CATEGORIES = {
  bookings: { permission: "management.bookings", tab: "bookings" },
  coaches: { permission: "management.coaches", tab: "coaches" },
  messages: { permission: "management.coaches", tab: "messages" },
  community: { permission: "management.community", tab: "community" },
  articles: { permission: "management.articles", tab: "articles" },
  ai: { permission: "management.ai", tab: "ai" },
};

const PROFESSIONAL_CATEGORIES = {
  coach: { en: "Sports Coach", ar: "مدرب رياضي", sessions: ["training", "race"] },
  bodybuilding_coach: { en: "Bodybuilding Coach", ar: "مدرب كمال الأجسام", sessions: ["training", "assessment"] },
  pacer: { en: "Champion Pacer", ar: "مرافق جري", sessions: ["training", "race"] },
  nutritionist: { en: "Nutritionist", ar: "أخصائي تغذية رياضية", sessions: ["nutrition", "consultation"] },
  physiotherapist: { en: "Physiotherapist", ar: "أخصائي علاج طبيعي رياضي", sessions: ["assessment", "therapy"] },
  sports_massage_therapist: { en: "Sports Massage Therapist", ar: "معالج تدليك رياضي", sessions: ["massage", "therapy"] },
};
const LICENSED_PROVIDER_TYPES = ["nutritionist", "physiotherapist", "sports_massage_therapist"];
const BOOKING_SESSION_TYPES = ["race", "training", "consultation", "assessment", "therapy", "massage", "nutrition"];
function professionalType(value) {
  return Object.prototype.hasOwnProperty.call(PROFESSIONAL_CATEGORIES, value) ? value : "";
}
function professionalLabel(type, language = "en") {
  return PROFESSIONAL_CATEGORIES[type]?.[language] || PROFESSIONAL_CATEGORIES.coach[language];
}
function cleanCredentialDate(value) {
  const date = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}
function maskLicenseNumber(value) {
  const number = text(value, 80);
  return number.length <= 4 ? number : `${number.slice(0, 2)}${"•".repeat(Math.max(2, number.length - 4))}${number.slice(-2)}`;
}

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
});

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.PUBLIC_ORIGINS || "https://mzactive.com,https://www.mzactive.com")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) return null;
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-admin-setup-key, x-file-name",
    "access-control-max-age": "600",
    "vary": "Origin",
  });
  if (origin) headers.set("access-control-allow-origin", origin);
  return headers;
}

function reply(request, env, body, status = 200) {
  const headers = corsHeaders(request, env);
  if (!headers) return json({ error: "origin_not_allowed" }, 403);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  return json(body, status, Object.fromEntries(headers));
}

const text = (value, max) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const MAX_PASSWORD_LENGTH = 256;
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "12345678", "123456789", "1234567890",
  "87654321", "987654321", "qwerty", "qwerty123", "qwertyuiop", "asdfghjkl", "zxcvbnm",
  "letmein", "welcome", "welcome1", "admin", "admin123", "administrator", "iloveyou",
  "trustno1", "monkey", "dragon", "sunshine", "princess", "football", "baseball", "master",
  "login", "mzactive", "mzactive1", "abc12345", "11111111", "00000000", "1q2w3e4r",
]);
// Returns null when acceptable, "length" for a length violation and "common"
// for a known-weak choice. Admin accounts keep their stricter 12-character
// baseline; public coach and member accounts need only eight characters.
function passwordIssue(value, admin = false) {
  if (typeof value !== "string" || value.length < (admin ? 12 : 8) || value.length > MAX_PASSWORD_LENGTH) return "length";
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (COMMON_PASSWORDS.has(compact)) return "common";
  if (compact.length >= 8 && /^(.)\1+$/.test(compact)) return "common";
  if (/^(?:\d+|0123456789|1234567890|9876543210|abcdefghijklmnopqrstuvwxyz|zyxwvutsrqponmlkjihgfedcba|qwertyuiop|asdfghjkl|zxcvbnm)$/.test(compact)) return "common";
  return null;
}
const emailValue = (value) => {
  const email = text(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};
const randomId = () => crypto.randomUUID();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const fromB64 = (value) => { const normalized = value.replaceAll("-", "+").replaceAll("_", "/"); return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), (c) => c.charCodeAt(0)); };

async function sha256(value) {
  return b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

async function verifyPassword(password, encoded) {
  const [scheme, iterations, salt, expected] = (encoded || "").split("$");
  if (scheme !== "pbkdf2-sha256" || Number(iterations) !== PASSWORD_ITERATIONS || !salt || !expected) return false;
  const actual = await hashPassword(password, fromB64(salt));
  const bytesA = new TextEncoder().encode(actual.split("$")[3]);
  const bytesB = new TextEncoder().encode(expected);
  let mismatch = bytesA.length ^ bytesB.length;
  for (let i = 0; i < Math.max(bytesA.length, bytesB.length); i++) mismatch |= (bytesA[i] || 0) ^ (bytesB[i] || 0);
  return mismatch === 0;
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function rateLimit(request, env, label, max = 12) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const bucket = await sha256(`${label}:${ip}`);
  const windowStart = Math.floor(Date.now() / 60_000);
  const row = await env.DB.prepare(`INSERT INTO rate_limit_buckets(bucket, window_start, request_count)
    VALUES(?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET
    request_count = CASE WHEN window_start = excluded.window_start THEN request_count + 1 ELSE 1 END,
    window_start = excluded.window_start RETURNING request_count`).bind(bucket, windowStart).first();
  await env.DB.prepare("DELETE FROM rate_limit_buckets WHERE window_start < ?").bind(windowStart - 1440).run();
  return row?.request_count <= max;
}

// IP-independent bucket for per-email and per-token abuse limits. The bucket
// key is a hash, so raw email addresses and reset tokens are never persisted.
async function rateLimitScoped(env, label, max, windowMinutes = 1) {
  const minutes = Math.max(1, Math.floor(windowMinutes));
  const bucket = await sha256(`scoped:${label}`);
  const windowStart = Math.floor(Date.now() / (60_000 * minutes));
  const row = await env.DB.prepare(`INSERT INTO rate_limit_buckets(bucket, window_start, request_count)
    VALUES(?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET
    request_count = CASE WHEN window_start = excluded.window_start THEN request_count + 1 ELSE 1 END,
    window_start = excluded.window_start RETURNING request_count`).bind(bucket, windowStart).first();
  return row?.request_count <= max;
}

async function currentUser(request, env) {
  const match = /^Bearer ([\w-]{30,80})$/.exec(request.headers.get("Authorization") || "");
  if (!match) return null;
  const tokenHash = await sha256(match[1]);
  return env.DB.prepare(`SELECT u.id, u.email, u.role, u.account_status, u.is_super_admin FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND (u.account_status IS NULL OR u.account_status='active')
    AND NOT EXISTS(SELECT 1 FROM provider_profiles p WHERE p.user_id=u.id AND p.status='rejected' AND p.review_note='Removed by owner')`).bind(tokenHash, Math.floor(Date.now() / 1000)).first();
}

function accountActive(accountStatus) {
  return !accountStatus || accountStatus === "active";
}

// Public visibility is enforced in SQL, never by CSS. Hidden accounts keep
// their login and all records; only public discovery and content are filtered.
function publicVisibility(alias = "u") {
  return `(${alias}.profile_visibility='public' AND (${alias}.account_status IS NULL OR ${alias}.account_status='active'))`;
}

// Existing admins are marked super admins by migration 0027. Newly promoted
// admins are limited until a super admin explicitly elevates them.
function isSuperAdmin(user) {
  return Boolean(user && user.role === "admin" && user.is_super_admin === 1);
}

async function recordAccountEvent(env, actorId, subjectId, action, detail) {
  await env.DB.prepare("INSERT INTO account_events(id,actor_user_id,subject_user_id,action,detail,created_at) VALUES(?,?,?,?,?,?)")
    .bind(randomId(), actorId, subjectId || null, action, detail ? JSON.stringify(detail) : null, new Date().toISOString()).run();
}

async function collectionEnabled(env) {
  return env.DATA_COLLECTION_ENABLED === "true";
}

async function reserveAssistantRequest(env, surface = "public") {
  // Surfaces have separate buckets so public traffic cannot exhaust the owner Brain.
  const bucket = `${new Date().toISOString().slice(0, 10)}:${surface}`;
  const row = await env.DB.prepare(`INSERT INTO ai_chat_usage(usage_date,request_count) VALUES(?,1)
    ON CONFLICT(usage_date) DO UPDATE SET request_count=request_count+1
    WHERE request_count < ? RETURNING request_count`).bind(bucket, MAX_DAILY_ASSISTANT_REQUESTS).first();
  return Boolean(row);
}

const MOMO_STOP_WORDS = new Set([
  "a", "an", "and", "any", "are", "available", "can", "coach", "coaches", "could", "do", "does", "find",
  "for", "from", "get", "give", "have", "help", "how", "i", "in", "is", "it", "me", "my", "need", "of",
  "on", "or", "please", "recommend", "show", "some", "that", "the", "there", "to", "want", "who", "with",
  "ابحث", "ابغى", "اريد", "أريد", "اي", "أي", "about", "من", "في", "على", "عن", "مع", "هل", "لي", "ليس", "هذا", "هذه", "مدرب", "مدربين", "مدربة", "درب", "المدرب", "المدربين",
]);
const MOMO_SEARCH_ALIASES = [
  { key: "running", terms: ["running", "runner", "jogging", "جري", "عدو", "عداء"] },
  { key: "fitness", terms: ["fitness", "gym", "workout", "لياقة", "بدنية", "تمرين"] },
  { key: "swimming", terms: ["swimming", "swim", "سباحة", "سبح"] },
  { key: "cycling", terms: ["cycling", "bike", "bicycle", "دراجات", "دراجة"] },
  { key: "triathlon", terms: ["triathlon", "ثلاثي"] },
  { key: "hyrox", terms: ["hyrox", "هايروكس"] },
  { key: "crossfit", terms: ["crossfit", "كروسفيت", "كروس فيت"] },
  { key: "boxing", terms: ["boxing", "boxer", "ملاكمة", "ملاكم"] },
  { key: "kickboxing", terms: ["kickboxing", "muay", "thai", "كيك", "بوكس", "كيكبوكس", "مواب", "تايلاند"] },
  { key: "padel", terms: ["padel", "بادل"] },
  { key: "doha", terms: ["doha", "الدوحة", "دوحة"] },
  { key: "lusail", terms: ["lusail", "لوسيل"] },
  { key: "qatar", terms: ["qatar", "قطر", "القطر"] },
];

function momoIsArabic(message) {
  return /[\u0600-\u06FF]/.test(String(message || ""));
}

function momoSearchTokens(message) {
  const tokens = new Set();
  for (const piece of String(message || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
    if (piece.length < 2 || MOMO_STOP_WORDS.has(piece)) continue;
    tokens.add(piece);
    for (const alias of MOMO_SEARCH_ALIASES) {
      if (alias.terms.some(term => piece.includes(term) || term.includes(piece))) tokens.add(alias.key);
    }
  }
  return [...tokens];
}

function momoProviderSummary(row) {
  return {
    id: text(row.id, 80),
    display_name: text(row.display_name, 100),
    city: text(row.city, 80),
    country: text(row.country, 80),
    provider_type: text(row.provider_type, 40),
    specialties: cleanList(safeParse(row.specialties_json), 8, 80),
    services: cleanList(safeParse(row.services_json), 8, 80),
    profile_url: `${MOMO_PROFILE_BASE}${encodeURIComponent(text(row.id, 80))}`,
  };
}

function momoProviderScore(provider, tokens) {
  const haystack = [
    provider.display_name, provider.city, provider.country, provider.provider_type,
    professionalLabel(provider.provider_type, "en"), professionalLabel(provider.provider_type, "ar"),
    provider.specialties.join(" "), provider.services.join(" "),
  ].join(" ").toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

async function momoApprovedProviders(env, message) {
  let rows;
  try {
    rows = await env.DB.prepare(`SELECT id,display_name,city,country,provider_type,specialties_json,services_json
      FROM provider_profiles WHERE status='approved'
      AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=provider_profiles.user_id AND (u.profile_visibility<>'public' OR u.account_status IS NULL OR u.account_status<>'active'))
      AND (provider_type NOT IN ('nutritionist','physiotherapist','sports_massage_therapist') OR (license_status='verified' AND (license_expires_on IS NULL OR license_expires_on>=date('now'))))
      ORDER BY display_name LIMIT 50`).all();
  } catch {
    return null;
  }
  const providers = (rows.results || []).map(momoProviderSummary).filter(provider => provider.id && provider.display_name);
  const tokens = momoSearchTokens(message);
  const scored = providers.map(provider => ({ provider, score: momoProviderScore(provider, tokens) }));
  const matches = scored.filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.provider.display_name.localeCompare(b.provider.display_name))
    .map(item => item.provider);
  return { providers, matches, tokens };
}

function momoDirectoryResult(message, directory) {
  const arabic = momoIsArabic(message);
  if (!directory) {
    return {
      answer: arabic
        ? `تعذر الوصول إلى الدليل الحالي. يمكنك تصفح الملفات المعتمدة هنا: https://mzactive.com/coaches.html`
        : `I could not reach the live directory right now. You can browse approved profiles here: https://mzactive.com/coaches.html`,
      providers: [],
      source: "directory-unavailable",
    };
  }
  const selected = (directory.matches.length ? directory.matches : directory.providers).slice(0, 5);
  if (!selected.length) {
    return {
      answer: arabic
        ? `لا توجد ملفات معتمدة حالياً. تصفح دليل المدربين: https://mzactive.com/coaches.html`
        : `There are no approved profiles right now. Browse the coach directory: https://mzactive.com/coaches.html`,
      providers: [],
      source: "directory-empty",
    };
  }
  const intro = arabic
    ? (directory.matches.length ? "وجدت ملفات معتمدة حقيقية من دليل MZ Active:" : "إليك ملفات معتمدة حقيقية من دليل MZ Active:")
    : (directory.matches.length ? "I found real approved profiles in the MZ Active directory:" : "Here are real approved profiles from the MZ Active directory:");
  const lines = selected.map(provider => {
    const details = [provider.city, provider.specialties.slice(0, 2).join(" · ")].filter(Boolean).join(" · ");
    return `${provider.display_name}${details ? ` — ${details}` : ""}\n${provider.profile_url}`;
  });
  return {
    answer: `${intro}\n\n${lines.join("\n\n")}\n\nhttps://mzactive.com/coaches.html`,
    providers: selected.map(({ id, display_name, city, specialties, profile_url }) => ({
      id, display_name, city, specialties, profile_url,
    })),
    source: "directory",
  };
}

async function assistantChat(request, env) {
  const body = await readJson(request), message = text(body?.message, 1000);
  if (!body || !message) return reply(request, env, { error: "message_required" }, 400);
  if (!await rateLimit(request, env, "assistant-chat", 8)) return reply(request, env, { error: "rate_limited" }, 429);
  const history = Array.isArray(body.history) ? body.history.slice(-4).flatMap((item) => {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : "";
    const content = text(item?.content, 400);
    return role && content ? [{ role, content }] : [];
  }) : [];
  if (!await reserveAssistantRequest(env, "public")) return reply(request, env, { error: "daily_limit_reached" }, 429);
  const directory = await momoApprovedProviders(env, message);
  if (!env.AI || typeof env.AI.run !== "function") {
    const fallback = momoDirectoryResult(message, directory);
    return reply(request, env, fallback);
  }
  const verifiedProfiles = directory?.matches.slice(0, 5) || [];
  const verifiedContext = verifiedProfiles.length
    ? `\n\nVerified approved profiles currently in the public directory (if you mention a profile, use only these names and URLs):\n${verifiedProfiles.map(provider => `- ${provider.display_name} — ${[provider.city, provider.specialties.slice(0, 2).join(" · ")].filter(Boolean).join(" · ")} — ${provider.profile_url}`).join("\n")}`
    : "";
  const system = `You are the MZ Active website assistant for athletes and coaches. Be brief, kind, and practical. Reply in the language of the user's message (English or Arabic). Use only these verified facts: MZ Active helps people find coaches and pacers in Qatar; only profiles approved by MZ Active appear publicly; coaches can create or update a profile at https://mzactive.com/providers.html; profile photo uploads accept JPG, PNG, or WebP up to 1 MB, and Qatar local WhatsApp numbers can be entered as 8 digits; a coach's profile remains private until Admin approval. Clients can browse https://mzactive.com/coaches.html and send a request at https://mzactive.com/pacer.html. A request is not a confirmed booking, the site does not collect payments, and payment/availability must be coordinated separately. Never invent a coach name or profile URL. Do not promise a coach's availability, rates, approval, booking, payment, medical result, or reply time. Do not claim to have accessed a user's account or contacted MZ Active. Never make approval or rejection decisions. Do not ask for passwords, payment credentials, identity documents, health records, or other sensitive details. For information you cannot verify, say so plainly and offer the relevant page link. Do not send routine questions to the site owner when the self-service pages can help.${verifiedContext}`;
  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: message }],
      max_tokens: 180,
      temperature: 0.2,
    });
    const answer = text(result?.response, 3000);
    if (!answer) return reply(request, env, momoDirectoryResult(message, directory));
    if (!verifiedProfiles.length) return reply(request, env, { answer });
    return reply(request, env, {
      answer,
      providers: verifiedProfiles.map(({ id, display_name, city, specialties, profile_url }) => ({ id, display_name, city, specialties, profile_url })),
      source: "ai-with-directory",
    });
  } catch (error) {
    console.error("Momo AI provider failed; using approved directory fallback:", error);
    return reply(request, env, momoDirectoryResult(message, directory));
  }
}

async function coachAssistant(request, env, user) {
  if (!await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
  if (!env.AI || typeof env.AI.run !== "function") return reply(request, env, { error: "assistant_unavailable" }, 503);
  if (!await rateLimit(request, env, `coach-assistant:${user.id}`, 6)) return reply(request, env, { error: "rate_limited" }, 429);
  const body = await readJson(request), task = body?.task;
  const prompt = text(body?.prompt, 1200);
  if (!body || !["help","training","weekly","blog"].includes(task) || !prompt) return reply(request, env, { error: "assistant_prompt_required" }, 400);
  if (!await reserveAssistantRequest(env, "coach")) return reply(request, env, { error: "daily_limit_reached" }, 429);
  const taskGuide = task === "weekly"
    ? "Create a clear, conservative 7-day training week from the coach's goal and availability. Include recovery/rest days and avoid sudden high loads. Return only one valid JSON object, without markdown, with exactly these keys: {\"days\":{\"monday\":\"...\",\"tuesday\":\"...\",\"wednesday\":\"...\",\"thursday\":\"...\",\"friday\":\"...\",\"saturday\":\"...\",\"sunday\":\"...\"},\"coach_note\":\"...\"}. Keep each day to at most 350 characters. Use the language of the coach's prompt. This is a draft for the coach to review and adapt. Do not diagnose or prescribe injury treatment."
    : task === "blog"
    ? "Write an original, useful sports blog draft with a clear title, short summary, and readable section headings. Do not invent research, credentials, events, or statistics. Mention uncertainty when facts may vary. This is a draft for the coach to review and submit for MZ Active approval; never say it is published."
    : task === "training"
      ? "Give a practical, general training suggestion. Keep it conservative and adaptable; ask the coach to adjust it to the athlete's level and context. Do not diagnose injuries or prescribe treatment."
      : "Give concise, practical help for a coach using MZ Active, writing a client message, or communicating with a team. Do not claim to have accessed any account or contacted anyone.";
    const system = `You are the private MZ Active assistant for an approved coach. Reply in the language used in the prompt (English or Arabic). ${taskGuide} Do not request client names, phone numbers, passwords, medical histories, or other sensitive personal data. You only know the text in this request. For injury, illness, or medical questions, recommend a qualified health professional. Keep the answer clear and ready for the coach to review.`;
  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      max_tokens: task === "blog" ? 700 : task === "weekly" ? 760 : task === "training" ? 360 : 240,
      temperature: 0.3,
    });
    const draft = text(result?.response, 7000);
    if (!draft) return reply(request, env, { error: "assistant_unavailable" }, 503);
    if (task === "weekly") {
      let parsed;
      try { parsed = JSON.parse(draft.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
      catch { return reply(request, env, { error: "assistant_format_error" }, 502); }
      const keys = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"], days = {};
      for (const key of keys) {
        days[key] = text(parsed?.days?.[key], 350);
        if (!days[key]) return reply(request, env, { error: "assistant_format_error" }, 502);
      }
      return reply(request, env, { days, coach_note: text(parsed?.coach_note, 800), task });
    }
    return reply(request, env, { draft, task });
  } catch {
    return reply(request, env, { error: "assistant_unavailable" }, 503);
  }
}

function taskPromptTitle(task) {
  return ({
    operations: "Operations queue review",
    marketing: "Marketing draft",
    support: "Customer support draft",
    growth: "Growth experiment", community: "Community engagement draft",
    monitoring: "Website monitoring review",
    analytics: "Business analytics summary",
  })[task] || "Owner agent task";
}

async function ownerBusinessSnapshot(env) {
  const firstCount = async (sql) => {
    const row = await env.DB.prepare(sql).first();
    return Number(row?.count || 0);
  };
  const [pendingProviderProfiles, approvedProviders, openBookingRequests, pendingCoachArticles, registeredAthletes,
    unlinkedPrograms, activeTrainingTeams, pendingCommunityPosts, publishedCommunityPosts, pendingCommunityComments, weeklyChallenges] = await Promise.all([
    firstCount("SELECT COUNT(*) AS count FROM provider_profiles WHERE status='pending'"),
    firstCount("SELECT COUNT(*) AS count FROM provider_profiles p JOIN users u ON u.id=p.user_id WHERE p.status='approved' AND u.profile_visibility='public'"),
    firstCount("SELECT COUNT(*) AS count FROM booking_requests WHERE status IN ('received','reviewing')"),
    firstCount("SELECT COUNT(*) AS count FROM coach_blog_posts WHERE status='pending'"),
    firstCount("SELECT COUNT(*) AS count FROM users u WHERE role='provider' AND NOT EXISTS(SELECT 1 FROM provider_profiles p WHERE p.user_id=u.id)"),
    firstCount("SELECT COUNT(*) AS count FROM athlete_programs_v2 WHERE athlete_user_id IS NULL"),
    firstCount("SELECT COUNT(*) AS count FROM training_teams"),
    firstCount("SELECT COUNT(*) AS count FROM community_posts WHERE status='pending'"),
    firstCount("SELECT COUNT(*) AS count FROM community_posts c JOIN users u ON u.id=c.author_user_id WHERE c.status='published' AND u.profile_visibility='public'"),
    firstCount("SELECT COUNT(*) AS count FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE c.status='published' AND p.status='pending'"),
    firstCount("SELECT COUNT(*) AS count FROM community_posts WHERE kind='challenge' AND status='published' AND created_at>=datetime('now','-7 days')"),
  ]);
  return {
    pending_provider_profiles: pendingProviderProfiles,
    approved_providers: approvedProviders,
    open_booking_requests: openBookingRequests,
    pending_coach_articles: pendingCoachArticles,
    registered_athletes: registeredAthletes,
    unlinked_programs: unlinkedPrograms,
    active_training_teams: activeTrainingTeams,
    pending_community_posts: pendingCommunityPosts,
    published_community_posts: publishedCommunityPosts,
    pending_community_comments: pendingCommunityComments,
    weekly_challenges: weeklyChallenges,
  };
}

async function failOwnerTask(env, taskId, message) {
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE owner_agent_tasks SET status='failed',approval_status='not_required',error_message=?,completed_at=? WHERE id=?")
    .bind(message,now,taskId).run();
  await env.DB.prepare(`INSERT INTO owner_agent_activity(id,agent_type,action,status,details_json,created_at)
    VALUES(?, 'owner', 'run_failed', 'failed', ?, ?)`)
    .bind(randomId(),JSON.stringify({ task_id: taskId, error: message }),now).run();
}

async function ownerAssistant(request, env) {
  if (!await rateLimit(request, env, "owner-assistant", 8)) return reply(request, env, { error: "rate_limited" }, 429);
  const body = await readJson(request), task = body?.task;
  const prompt = text(body?.prompt, 1600);
  if (!body || !["operations","marketing","support","monitoring","analytics","growth","community"].includes(task) || !prompt) {
    return reply(request, env, { error: "assistant_prompt_required" }, 400);
  }
  const outcome = await runOwnerAnalysis(env, task, prompt, "manual");
  return reply(request, env, outcome, outcome.answer ? 200 : outcome.error === "daily_limit_reached" ? 429 : 503);
}

async function runOwnerAnalysis(env, task, prompt, source, taskId=randomId()) {
  const now = new Date().toISOString();
  const claim = await env.DB.prepare(`INSERT INTO owner_agent_tasks(id,agent_type,source,title,status,approval_status,input_json,created_at,started_at)
    VALUES(?,?,?,?,'running','not_required',?,?,?) ON CONFLICT(id) DO NOTHING`)
    .bind(taskId,task,source,taskPromptTitle(task),JSON.stringify({prompt, agent:task}),now,now).run();
  if (!claim.meta.changes) return {task_id:taskId};
  const guides = {
    operations: "Turn the request into a concise operational checklist with owners, priorities, and verification steps. Do not claim that changes were made.",
    marketing: "Draft practical bilingual-ready marketing copy or a campaign plan for MZ Active. Preserve a respectful, athletic brand tone and do not invent offers, reviews, or results.",
    support: "Draft a clear customer-support response for MZ Active. State uncertainty plainly, avoid promises, and direct the user to the correct self-service page only when relevant.",
    growth: "Use the current funnel counts to recommend one measurable growth experiment. Do not invent conversions or historical trends.",
    community: "Use the supplied real community counts to propose one safe engagement action or weekly challenge. Refer only to verified counts; do not invent members, events, participation or outcomes. Any member-facing draft still requires owner approval before publication.",
    monitoring: "Turn the supplied website or service observations into a prioritized monitoring review with risks, likely next checks, and safe escalation steps.",
    analytics: "Turn the supplied business data into a short decision summary with trends, caveats, and concrete next metrics to track. Do not infer causation or invent missing data.",
  };
  try {
    const snapshot = await ownerBusinessSnapshot(env);
    if (task === "monitoring") {
      snapshot.website = {};
      for (const page of ["", "coaches.html", "admin.html"]) {
        try {
          const response = await fetch("https://mzactive.com/" + page,{method:"HEAD",signal:AbortSignal.timeout(4000)});
          snapshot.website[page || "homepage"] = response.status;
        } catch { snapshot.website[page || "homepage"] = "check_failed"; }
      }
    }
    await env.DB.prepare("UPDATE owner_agent_tasks SET output_json=? WHERE id=?").bind(JSON.stringify({snapshot}),taskId).run();
    if (!env.AI?.run) throw Error("assistant_unavailable");
    if (!await reserveAssistantRequest(env, "owner")) throw Error("daily_limit_reached");
    const system = `You are the private MZ Active Owner AI Brain for business operations. ${guides[task]} Reply in the language used in the prompt (English or Arabic). Use only the supplied request and this verified live MZ Active snapshot: ${JSON.stringify(snapshot)}. Do not invent customers, revenue, bookings, health outcomes, or system status. Never request passwords, payment credentials, identity documents, or health records. Do not make approval decisions or claim to have taken actions.`;

    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.2,
    });
    const answer = text(result?.response, 5000);
    if (!answer) throw Error("assistant_unavailable");
    const completedAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE owner_agent_tasks SET status='completed',approval_status='pending',output_json=?,completed_at=? WHERE id=?")
        .bind(JSON.stringify({snapshot,answer}),completedAt,taskId),
      env.DB.prepare("INSERT INTO owner_agent_activity(id,agent_type,action,status,details_json,created_at) VALUES(?,?,'run_completed','completed',?,?)")
        .bind(randomId(),task,JSON.stringify({task_id:taskId}),completedAt)
    ]);
    return { answer, task_id:taskId };
  } catch (err) {
    const error = err.message === "daily_limit_reached" ? err.message : "assistant_unavailable";
    await failOwnerTask(env, taskId, error);
    return {error, task_id:taskId};
  }
}

async function publicBlogPosts(request, env) {
  const params = new URL(request.url).searchParams;
  const slug = text(params.get("slug") || "", 80).replace(/^coach-/, "");
  // A public coach profile can list only its own published articles. Existing
  // callers that do not pass ?provider keep the full published feed.
  const provider = text(params.get("provider") || "", 80);
  const query = `SELECT b.id,b.title,b.summary,b.body,b.language,b.created_at,b.published_at,p.display_name AS coach_name,b.provider_id
    FROM coach_blog_posts b JOIN provider_profiles p ON p.id=b.provider_id JOIN users u ON u.id=p.user_id
    WHERE b.status='published' AND ${publicVisibility("u")} AND (?='' OR b.id=?) AND (?='' OR b.provider_id=?) ORDER BY b.published_at DESC LIMIT 100`;
  const result = await env.DB.prepare(query).bind(slug,slug,provider,provider).all();
  return reply(request, env, { posts: result.results || [] });
}

function validCampaignDate(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

async function publicCampaign(request, env) {
  const id = text(new URL(request.url).pathname.split("/").pop() || "samla", 40);
  const row = await env.DB.prepare("SELECT enabled,starts_at,ends_at,updated_at FROM site_campaigns WHERE id=?").bind(id).first();
  if (!row) return reply(request, env, { error: "campaign_not_found" }, 404);
  const now = Date.now();
  const active = row.enabled === 1 && Date.parse(row.starts_at) <= now && now < Date.parse(row.ends_at);
  return reply(request, env, {
    id, enabled: row.enabled === 1, starts_at: row.starts_at, ends_at: row.ends_at,
    updated_at: row.updated_at, active,
  });
}

async function samlaAiStrategy(request, env) {
  if (!await rateLimit(request, env, "samla-ai", 6)) return reply(request, env, { error: "rate_limited" }, 429);
  if (!await reserveAssistantRequest(env, "public")) return reply(request, env, { error: "daily_limit_reached" }, 429);
  const body = await readJson(request);
  const results = body?.results && typeof body.results === "object" ? body.results : null;
  if (!results || !Array.isArray(results.stages) || results.stages.length === 0) {
    return reply(request, env, { error: "invalid_strategy_results" }, 400);
  }
  const language = body?.language === "ar" ? "ar" : "en";
  const stageLines = results.stages.map((stage) => {
    const name = text(stage?.name, 40) || "Stage";
    const distance = Number(stage?.distance);
    const duration = text(stage?.duration, 12);
    const pace = text(stage?.pace, 24);
    const speed = text(stage?.speed, 24);
    return `${name}: ${Number.isFinite(distance) ? distance + " km" : "shooting"}, duration ${duration}, pace ${pace}, speed ${speed}`;
  }).join("\n");
  const total = text(results.total, 12);
  const target = text(results.target, 12);
  const transitions = text(results.transitions, 12);
  const nutrition = text(results.nutrition, 240);
  const gels = text(results.gels, 240);
  const userMessage = `Validated SAMLA 200 calculator results:
Finishing time: ${total}
Target finishing time: ${target || "not provided"}
Transitions: ${transitions} minutes
Stages:
${stageLines}
Nutrition: ${nutrition || "not provided"}
Gels: ${gels || "not provided"}

Generate a concise professional race execution strategy for each stage.`;
  const system = language === "ar"
    ? "أنت مساعد MZ Active لاستراتيجية سباق صملة 200. استخدم فقط نتائج الحاسبة المُدخلة. اكتب استراتيجية مختصرة واحترافية لكل مرحلة: إدارة الوتيرة والجهد، تجنب البدء بسرعة، حفظ الطاقة، التعب التراكمي، إدارة الانتقالات، التغذية الآمنة، تنفيذ المرحلة الأخيرة، وتحذيرات من وتيرة غير واقعية. لا تضمن الأداء ولا تغير الأوقات المحسوبة. لا تختلق معلومات."
    : "You are MZ Active Race Strategy. Use only the validated SAMLA 200 calculator results. Generate a concise professional race execution strategy for each stage: pace and effort management, avoiding starting too fast, energy conservation, accumulated fatigue, transition management, safe nutrition timing, final-stage execution, and warnings about potentially unrealistic pacing. Do not guarantee performance, do not change calculated times, and do not invent information.";
  if (!env.AI || typeof env.AI.run !== "function") {
    return reply(request, env, { answer: language === "ar"
      ? "استراتيجية مقدّرة: ابدأ بوتيرة متحفظة، حافظ على وتيرة ثابتة، تغذّى بانتظام، وأبقِ الانتقالات قصيرة. هذه ليست ضمانة للأداء."
      : "Estimated strategy: start conservatively, hold steady pacing, fuel regularly, and keep transitions short. This is not a guarantee." });
  }
  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [{ role: "system", content: system }, { role: "user", content: userMessage }],
      max_tokens: 700,
      temperature: 0.2,
    });
    const answer = text(result?.response, 5000);
    if (!answer) return reply(request, env, { error: "assistant_unavailable" }, 503);
    return reply(request, env, { answer });
  } catch (error) {
    console.error("SAMLA AI strategy failed:", error);
    return reply(request, env, { error: "assistant_unavailable" }, 503);
  }
}

async function adminCampaign(request, env) {
  const user = await currentUser(request, env);
  if (!user) return reply(request, env, { error: "unauthorized" }, 401);
  if (user.role !== "admin") return reply(request, env, { error: "forbidden" }, 403);
  const id = text(new URL(request.url).pathname.split("/").pop() || "samla", 40);
  const row = await env.DB.prepare("SELECT enabled,starts_at,ends_at,updated_at FROM site_campaigns WHERE id=?").bind(id).first();
  if (!row) return reply(request, env, { error: "campaign_not_found" }, 404);
  if (request.method === "GET") {
    return reply(request, env, { id, enabled: row.enabled === 1, starts_at: row.starts_at, ends_at: row.ends_at, updated_at: row.updated_at });
  }
  const body = await readJson(request);
  const enabled = body?.enabled === undefined ? row.enabled === 1 : Boolean(body.enabled);
  const startsAt = body?.starts_at === undefined ? row.starts_at : validCampaignDate(body.starts_at);
  const endsAt = body?.ends_at === undefined ? row.ends_at : validCampaignDate(body.ends_at);
  if (!startsAt || !endsAt) return reply(request, env, { error: "invalid_campaign_dates" }, 400);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) return reply(request, env, { error: "invalid_campaign_range" }, 400);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE site_campaigns SET enabled=?,starts_at=?,ends_at=?,updated_at=? WHERE id=?")
    .bind(enabled ? 1 : 0, startsAt, endsAt, now, id).run();
  return reply(request, env, { id, enabled, starts_at: startsAt, ends_at: endsAt, updated_at: now });
}

function pacerPublic(row) {
  return {
    id: row.id, user_id: row.user_id, display_name: row.display_name,
    country: row.country, city: row.city,
    languages: safeParse(row.languages_json), bio: row.bio, experience: row.experience,
    achievements: row.achievements, distances: safeParse(row.distances_json),
    paces: safeParse(row.paces_json), availability: row.availability,
    social_links: safeParse(row.social_links_json),
    status: row.status, verified: row.verified === 1,
    has_photo: Boolean(row.photo_bytes), photo_updated_at: row.photo_updated_at,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}
async function pacerProfileForUser(env, userId) {
  return env.DB.prepare('SELECT * FROM pacer_profiles WHERE user_id=?').bind(userId).first();
}
async function isApprovedPacerUser(env, userId) {
  if (!userId) return false;
  const row = await pacerProfileForUser(env, userId);
  return row ? row.status === 'approved' : false;
}
function pacerText(value, max = 2000) { return text(value, max); }
function cleanStringList(value, allowed, max = 12) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => pacerText(item, 60)).filter((item) => !allowed || allowed.includes(item)))].slice(0, max);
}
const PACER_DISTANCES = ['5K', '10K', 'Half Marathon', 'Marathon', 'Ultra Running', 'Community Runs'];
async function publicPacers(url, request, env, id = '') {
  const q = text(url.searchParams.get('q') || '', 80).toLowerCase();
  const country = text(url.searchParams.get('country') || '', 80).toLowerCase();
  const city = text(url.searchParams.get('city') || '', 80).toLowerCase();
  const distance = text(url.searchParams.get('distance') || '', 40);
  const pace = text(url.searchParams.get('pace') || '', 20);
  const availability = text(url.searchParams.get('availability') || '', 40).toLowerCase();
  const language = text(url.searchParams.get('language') || '', 40).toLowerCase();
  if (id) {
    const row = await env.DB.prepare("SELECT * FROM pacer_profiles WHERE id=? AND status='approved'").bind(id).first();
    return row ? reply(request, env, { pacer: pacerPublic(row) }) : reply(request, env, { error: 'pacer_not_found' }, 404);
  }
  const rows = (await env.DB.prepare("SELECT * FROM pacer_profiles WHERE status='approved' ORDER BY created_at DESC LIMIT 200").all()).results || [];
  const pacers = rows.map(pacerPublic).filter((p) => {
    const haystack = [p.display_name, p.city, p.country, p.bio, p.experience, (p.distances || []).join(' '), (p.languages || []).join(' ')].join(' ').toLowerCase();
    const distances = (p.distances || []).map((item) => String(item));
    const paces = Object.values(p.paces || {}).map((item) => String(item));
    return (!q || haystack.includes(q)) && (!country || p.country.toLowerCase().includes(country)) &&
      (!city || p.city.toLowerCase().includes(city)) && (!distance || distances.some((item) => item.toLowerCase().includes(distance.toLowerCase()))) &&
      (!pace || paces.some((item) => item.includes(pace))) && (!availability || (p.availability || '').toLowerCase().includes(availability)) &&
      (!language || (p.languages || []).some((item) => String(item).toLowerCase().includes(language)));
  });
  return reply(request, env, { pacers });
}
async function pacerPhoto(request, env, id) {
  const row = await env.DB.prepare("SELECT photo_bytes,photo_content_type FROM pacer_profiles WHERE id=? AND status='approved'").bind(id).first();
  if (!row || !row.photo_bytes) return reply(request, env, { error: 'photo_not_found' }, 404);
  return binaryReply(request, env, row.photo_bytes, row.photo_content_type || 'image/jpeg', 'public, max-age=3600');
}
async function pacerRegister(request, env) {
  const body = await readJson(request);
  const displayName = pacerText(body?.display_name || body?.full_name, 100);
  const email = emailValue(body?.email);
  const password = pacerText(body?.password, 200);
  if (!displayName || !email || !body?.consent) return reply(request, env, { error: 'invalid_registration' }, 400);
  if (password.length < 8) return reply(request, env, { error: 'weak_password' }, 400);
  const viewer = await currentUser(request, env);
  let user = viewer;
  const now = new Date().toISOString();
  if (!user) {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
    if (existing) return reply(request, env, { error: 'account_already_exists' }, 409);
    const userId = randomId();
    await env.DB.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
      .bind(userId, email, await hashPassword(password), 'provider', now).run();
    user = { id: userId, email, role: 'provider' };
  }
  const existing = await pacerProfileForUser(env, user.id);
  if (existing) return reply(request, env, { error: 'pacer_profile_exists' }, 409);
  const id = randomId();
  const distances = cleanStringList(body?.distances, PACER_DISTANCES);
  const paces = {};
  for (const [key, value] of Object.entries(body?.paces || {})) {
    const pace = pacerText(value, 20);
    if (/^\d{1,2}:[0-5]\d(?:\/[^\s]+)?$/.test(pace)) paces[pacerText(key, 30)] = pace;
  }
  await env.DB.prepare(`INSERT INTO pacer_profiles(id,user_id,display_name,email,phone,country,city,languages_json,bio,experience,achievements,distances_json,paces_json,availability,social_links_json,status,verified,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',0,?,?)`)
    .bind(id, user.id, displayName, user.email || email, pacerText(body?.phone, 40),
      pacerText(body?.country, 80) || 'Qatar', pacerText(body?.city, 80),
      JSON.stringify(cleanStringList(body?.languages)), pacerText(body?.bio, 4000),
      pacerText(body?.experience, 2000), pacerText(body?.achievements, 2000),
      JSON.stringify(distances), JSON.stringify(paces), pacerText(body?.availability, 2000),
      JSON.stringify(cleanSocialLinks(body?.social_links)), now, now).run();
  try { await createNotification(env, user.id, 'pacer_application_received', 'Pacer application received', 'Your Pacer profile is pending review.', 'pacer_profile', id); } catch {}
  return reply(request, env, { created: true, id, status: 'pending' }, 201);
}
async function ownerPacer(request, env) {
  const auth = await authenticated(request, env);
  if (auth.response) return auth.response;
  const row = await pacerProfileForUser(env, auth.user.id);
  if (!row) return reply(request, env, { error: 'pacer_profile_required' }, 404);
  if (request.method === 'GET') return reply(request, env, { profile: pacerPublic(row) });
  const body = await readJson(request);
  const distances = body?.distances === undefined ? safeParse(row.distances_json) : cleanStringList(body.distances, PACER_DISTANCES);
  const paces = body?.paces === undefined ? safeParse(row.paces_json) : body.paces;
  await env.DB.prepare(`UPDATE pacer_profiles SET display_name=?,phone=?,country=?,city=?,languages_json=?,bio=?,experience=?,achievements=?,distances_json=?,paces_json=?,availability=?,social_links_json=?,updated_at=?,verified=0 WHERE id=?`)
    .bind(body?.display_name ? pacerText(body.display_name, 100) : row.display_name,
      body?.phone !== undefined ? pacerText(body.phone, 40) : row.phone,
      body?.country ? pacerText(body.country, 80) : row.country,
      body?.city !== undefined ? pacerText(body.city, 80) : row.city,
      body?.languages ? JSON.stringify(cleanStringList(body.languages)) : row.languages_json,
      body?.bio !== undefined ? pacerText(body.bio, 4000) : row.bio,
      body?.experience !== undefined ? pacerText(body.experience, 2000) : row.experience,
      body?.achievements !== undefined ? pacerText(body.achievements, 2000) : row.achievements,
      JSON.stringify(distances), JSON.stringify(paces),
      body?.availability !== undefined ? pacerText(body.availability, 2000) : row.availability,
      body?.social_links ? JSON.stringify(cleanSocialLinks(body.social_links)) : row.social_links_json,
      new Date().toISOString(), row.id).run();
  return reply(request, env, { saved: true });
}
async function publicPacerRequest(request, env) {
  const body = await readJson(request);
  const providerId = text(body?.provider_id, 60);
  const provider = await env.DB.prepare("SELECT id,user_id FROM pacer_profiles WHERE id=? AND status='approved'").bind(providerId).first();
  if (!provider) return reply(request, env, { error: 'pacer_unavailable' }, 404);
  const name = pacerText(body?.customer_name, 100), phone = pacerText(body?.customer_phone, 40), email = emailValue(body?.customer_email);
  const event = pacerText(body?.event_name, 140), date = text(body?.date, 10), distance = pacerText(body?.distance, 60);
  const pace = pacerText(body?.target_pace, 30), targetTime = pacerText(body?.target_time, 20);
  const location = pacerText(body?.location, 140), message = pacerText(body?.message, 2000);
  if (!name || !phone || !event || !date || !distance || !location) return reply(request, env, { error: 'invalid_request' }, 400);
  const id = randomId(), now = new Date().toISOString();
  const viewer = await currentUser(request, env);
  const goal = [event, distance, pace ? `Pace ${pace}` : '', targetTime ? `Target ${targetTime}` : '', message].filter(Boolean).join(' · ');
  await env.DB.prepare(`INSERT INTO pacer_requests(id,pacer_id,customer_user_id,customer_name,customer_email,customer_phone,location,event_name,date,distance,target_pace,target_time,message,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`)
    .bind(id, providerId, viewer?.id || null, name, email || null, phone, location, event, date, distance, pace || null, targetTime || null, message, now, now).run();
  try { await createNotification(env, provider.user_id, 'pacer_request_received', 'New pacing request', `${name} · ${distance}`, 'pacer_request', id); } catch {}
  return reply(request, env, { request_id: id, status: 'received' }, 201);
}
async function pacerPhotoUpload(request, env) {
  const auth = await authenticated(request, env);
  if (auth.response) return auth.response;
  const profile = await pacerProfileForUser(env, auth.user.id);
  if (!profile) return reply(request, env, { error: 'pacer_profile_required' }, 404);
  if (request.method === 'DELETE') {
    await env.DB.prepare('UPDATE pacer_profiles SET photo_bytes=NULL,photo_content_type=NULL,photo_updated_at=NULL,updated_at=? WHERE id=?').bind(new Date().toISOString(), profile.id).run();
    return reply(request, env, { removed: true });
  }
  const image = await readImageBody(request);
  if (image.error) return reply(request, env, { error: image.error }, image.status);
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE pacer_profiles SET photo_bytes=?,photo_content_type=?,photo_updated_at=?,updated_at=? WHERE id=?')
    .bind(image.bytes, image.contentType, now, now, profile.id).run();
  return reply(request, env, { updated: true, photo_updated_at: now });
}
async function pacerRequests(request, env, id = '') {
  const auth = await authenticated(request, env);
  if (auth.response) return auth.response;
  const profile = await pacerProfileForUser(env, auth.user.id);
  if (!profile) return reply(request, env, { error: 'pacer_profile_required' }, 404);
  if (request.method === 'GET') {
    const rows = (await env.DB.prepare(`SELECT * FROM pacer_requests WHERE pacer_id=? ORDER BY created_at DESC LIMIT 200`).bind(profile.id).all()).results || [];
    return reply(request, env, { requests: rows });
  }
  if (!id) return reply(request, env, { error: 'request_required' }, 400);
  const body = await readJson(request);
  const status = pacerText(body?.status, 20);
  if (!['accepted', 'declined', 'completed', 'cancelled'].includes(status)) return reply(request, env, { error: 'invalid_status' }, 400);
  const updated = await env.DB.prepare('UPDATE pacer_requests SET status=?,updated_at=? WHERE id=? AND pacer_id=?').bind(status, new Date().toISOString(), id, profile.id).run();
  if (!updated.meta.changes) return reply(request, env, { error: 'request_not_found' }, 404);
  const row = await env.DB.prepare('SELECT customer_user_id FROM pacer_requests WHERE id=?').bind(id).first();
  if (row?.customer_user_id) await createNotification(env, row.customer_user_id, 'pacer_request_updated', 'Pacing request updated', `Your request is now ${status}.`, 'pacer_request', id);
  return reply(request, env, { updated: true, status });
}
async function adminPacers(request, env, id = '') {
  const auth = await authenticated(request, env);
  if (auth.response) return auth.response;
  const permissions = await managementPermissionCodes(env, auth.user);
  if (auth.user.role !== 'admin' && !permissions.includes('management.coaches')) return reply(request, env, { error: 'forbidden' }, 403);
  if (!id) {
    const rows = (await env.DB.prepare('SELECT * FROM pacer_profiles ORDER BY created_at DESC LIMIT 200').all()).results || [];
    return reply(request, env, { pacers: rows.map(pacerPublic) });
  }
  const row = await env.DB.prepare('SELECT * FROM pacer_profiles WHERE id=?').bind(id).first();
  if (!row) return reply(request, env, { error: 'pacer_not_found' }, 404);
  if (request.method === 'GET') return reply(request, env, { pacer: pacerPublic(row) });
  const body = await readJson(request);
  const status = body?.status ? pacerText(body.status, 20) : row.status;
  if (!['pending', 'approved', 'rejected', 'suspended'].includes(status)) return reply(request, env, { error: 'invalid_status' }, 400);
  const verified = status === 'approved' ? (body?.verified === undefined ? row.verified : (body.verified ? 1 : 0)) : 0;
  await env.DB.prepare('UPDATE pacer_profiles SET status=?,verified=?,updated_at=? WHERE id=?')
    .bind(status, verified, new Date().toISOString(), id).run();
  try { await createNotification(env, row.user_id, 'pacer_review', 'Pacer profile reviewed', `Your Pacer profile is now ${status}.`, 'pacer_profile', id); } catch {}
  return reply(request, env, { updated: true, status, verified: Boolean(verified) });
}
async function adminPacerRequests(request, env) {
  const auth = await authenticated(request, env);
  if (auth.response) return auth.response;
  const permissions = await managementPermissionCodes(env, auth.user);
  if (auth.user.role !== 'admin' && !permissions.includes('management.coaches')) return reply(request, env, { error: 'forbidden' }, 403);
  const rows = (await env.DB.prepare("SELECT r.*, p.display_name AS pacer_name FROM pacer_requests r JOIN pacer_profiles p ON p.id=r.pacer_id ORDER BY r.created_at DESC LIMIT 200").all()).results || [];
  return reply(request, env, { requests: rows });
}
async function register(request, env) {
  if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
  if (!await rateLimit(request, env, "register", 5)) return reply(request, env, { error: "rate_limited" }, 429);
  const body = await readJson(request);
  const email = emailValue(body?.email), password = text(body?.password, MAX_PASSWORD_LENGTH);
  const isMember = body?.account_type === "member";
  const type = professionalType(body?.provider_type);
  const displayName = text(body?.display_name, 100) || "Coach profile", city = text(body?.city, 80), bio = text(body?.bio, 4000) || "Profile awaiting completion by the provider.";
  const whatsappInput = text(body?.whatsapp_number, 32), whatsapp = normalizeWhatsApp(whatsappInput), whatsappPublic = body?.whatsapp_public === true;
  const canPublishWhatsApp = Boolean(whatsapp && whatsappPublic);
  const socialLinks = cleanSocialLinks(body?.social_links) || [];
  const adminEmails = (env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const isAdminEmail = adminEmails.includes(email);
  if (!body || !email || body.consent !== true || (!isAdminEmail && !type && !isMember)) {
    return reply(request, env, { error: "invalid_registration" }, 400);
  }
  const passwordProblem = passwordIssue(password, isAdminEmail);
  if (passwordProblem) return reply(request, env, { error: passwordProblem === "common" ? "weak_password" : "invalid_registration" }, 400);
  if (request.headers.has("x-admin-setup-key") && !isAdminEmail) return reply(request,env,{error:"admin_setup_unavailable"},403);
  if (isAdminEmail && await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first()) return reply(request,env,{error:"admin_already_exists"},409);
  if (isAdminEmail && (!env.ADMIN_SETUP_KEY || !(await safeEqual(request.headers.get("x-admin-setup-key") || "", env.ADMIN_SETUP_KEY)))) {
    return reply(request, env, { error: "admin_setup_required" }, 403);
  }
  const now = new Date().toISOString(), userId = randomId(), profileId = randomId();
  // The existing D1 users.role constraint allows only provider/admin. Member
  // accounts are providers without a public provider_profiles row.
  const role = isAdminEmail ? "admin" : "provider";
  const passwordHash = await hashPassword(password);
  const specialties = cleanList(body.specialties, 12, 60), languages = cleanList(body.languages, 8, 40);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users(id,email,password_hash,role,is_super_admin,created_at) VALUES(?,?,?,?,?,?)")
        .bind(userId, email, passwordHash, role, isAdminEmail ? 1 : 0, now),
      ...(!isAdminEmail && !isMember ? [env.DB.prepare(`INSERT INTO provider_profiles(id,user_id,provider_type,display_name,country,city,specialties_json,languages_json,bio,experience_years,indicative_rate_qar,whatsapp_number,whatsapp_public,social_links_json,status,updated_at,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(profileId,userId,type,displayName,text(body.country,80)||"Qatar",city,JSON.stringify(specialties),JSON.stringify(languages),bio,clampInt(body.experience_years,0,60),clampNullableInt(body.indicative_rate_qar,0,100000),canPublishWhatsApp?whatsapp:null,canPublishWhatsApp?1:0,JSON.stringify(socialLinks),"pending",now,now)] : []),
    ]);
  } catch {
    return reply(request, env, { error: "account_already_exists_or_storage_error" }, 409);
  }
  if (isMember) await linkBookingsToUser(env, { id: userId, email, role });
  if (!isAdminEmail) {
    try { await notifyAiBrainRegistration(env, userId, isMember ? "Athlete" : professionalLabel(type, "en")); }
    catch (error) { await recordAiBrainError(env, "registration_notification", error.message, { user_id: userId }, true); }
  }
  return issueSession(request, env, userId, email, isAdminEmail ? "admin" : isMember ? "member" : role, 201);
}

function cleanList(value, maxItems, maxLength) {
  return Array.isArray(value) ? value.slice(0, maxItems).map((item) => text(item, maxLength)).filter(Boolean) : [];
}
function cleanProgramDurations(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(Number).filter((months) => [1,2,3].includes(months)))].sort();
}
const PUBLIC_PROFILE_FIELDS = ["city","specialties","languages","bio","experience_years","indicative_rate_qar","profile_photo","social_links","program_durations","whatsapp","credentials","qualifications","services","pacer_details"];
function cleanPublicFields(value) {
  const fields = [...new Set((Array.isArray(value) ? value : []).filter((field) => PUBLIC_PROFILE_FIELDS.includes(field)))];
  // Qualifications and services were shown on every approved profile before
  // field-level privacy existed. Legacy stored lists predate those options and
  // cannot express an opt-out, so they remain public for stored profiles.
  if (fields.length && !fields.includes("qualifications")) fields.push("qualifications");
  if (fields.length && !fields.includes("services")) fields.push("services");
  return fields;
}
const DEFAULT_PUBLIC_FIELDS = ["city","specialties","languages","bio","experience_years","indicative_rate_qar","profile_photo","social_links","program_durations","whatsapp","qualifications","services","pacer_details"];
function clampInt(value, min, max) { return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : 0; }
function clampNullableInt(value, min, max) { return value === null || value === "" || value === undefined ? null : Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : null; }

const PACER_SPORTS = ["running", "cycling"];
const PACER_SERVICES = ["sessions", "race"];
function cleanPacerDetails(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const sports = [...new Set(cleanList(value.sports, 2, 20).filter((item) => PACER_SPORTS.includes(item)))];
  const services = [...new Set(cleanList(value.services, 2, 24).filter((item) => PACER_SERVICES.includes(item)))];
  const distances = [...new Set(cleanList(value.distances, 8, 40))];
  let runningPace = text(value.running_pace, 24).replace(/\s+/g, " ").trim();
  let cyclingSpeed = text(value.cycling_speed, 24).replace(/\s+/g, " ").trim();
  if (/^\d{1,2}(?::[0-5]\d){1,2}$/.test(runningPace)) runningPace += "/km";
  if (/^\d{1,3}(?:\.\d)?$/.test(cyclingSpeed)) cyclingSpeed += " km/h";
  if (runningPace && !/^\d{1,2}:[0-5]\d(?::[0-5]\d)?\s*\/\s*(km|kilometre|kilometer)s?$/i.test(runningPace)) runningPace = "";
  if (cyclingSpeed && !/^\d{1,3}(?:\.\d)?\s*(km\/h|kph|kmph)$/i.test(cyclingSpeed)) cyclingSpeed = "";
  return {
    sports,
    services,
    distances,
    running_pace: sports.includes("running") ? runningPace : "",
    cycling_speed: sports.includes("cycling") ? cyclingSpeed : "",
    achievements: text(value.achievements, 1500),
    personal_bests: text(value.personal_bests, 1500),
    hourly_rate_qar: clampNullableInt(value.hourly_rate_qar, 0, 100000),
    race_rate_qar: clampNullableInt(value.race_rate_qar, 0, 100000),
    service_areas: text(value.service_areas, 500),
    availability: text(value.availability, 500),
  };
}
function pacerDetailsKey(value) {
  const clean = cleanPacerDetails(value);
  return JSON.stringify(Object.keys(clean).sort().map((key) => [key, clean[key]]));
}

async function safeEqual(left, right) {
  const [a, b] = await Promise.all([sha256(left), sha256(right)]);
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function issueSession(request, env, userId, email, role, status = 200) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  const stored = await env.DB.prepare("SELECT role,is_super_admin FROM users WHERE id=?").bind(userId).first();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Math.floor(Date.now()/1000)).run();
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
    .bind(await sha256(token), userId, Math.floor(Date.now()/1000)+SESSION_TTL_SECONDS, new Date().toISOString()).run();
  const access = await managementAccess(env, { id: userId, email, role: stored?.role || role, is_super_admin: stored?.is_super_admin });
  return reply(request, env, {
    token,
    user: { id: userId, email, role },
    expires_in: SESSION_TTL_SECONDS,
    account_type: access.account_type,
    super_admin: access.super_admin,
    dashboard_path: access.dashboard_path,
    management: access.management,
  }, status);
}

async function login(request, env) {
  const body = await readJson(request), email = emailValue(body?.email), password = text(body?.password, MAX_PASSWORD_LENGTH);
  if (!body || !email || !password) return reply(request, env, { error: "invalid_credentials" }, 400);
  if (!await rateLimit(request, env, "login", 12) || !await rateLimit(request, env, `login:${email}`, 8)) return reply(request, env, { error: "rate_limited" }, 429);
  const user = await env.DB.prepare("SELECT id,email,password_hash,role,account_status FROM users WHERE email=?").bind(email).first();
  // Accept both the trimmed and the verbatim value so a password containing
  // leading/trailing spaces can still sign in after the original setup.
  const rawPassword = typeof body.password === "string" && body.password.length <= MAX_PASSWORD_LENGTH ? body.password : password;
  const matches = user && (await verifyPassword(password, user.password_hash) || (rawPassword !== password && await verifyPassword(rawPassword, user.password_hash)));
  if (!user || !matches) return reply(request, env, { error: "invalid_credentials" }, 401);
  if (!accountActive(user.account_status)) return reply(request, env, { error: "account_unavailable" }, 403);
  if (user.role === "provider" && await env.DB.prepare("SELECT 1 AS removed FROM provider_profiles WHERE user_id=? AND status='rejected' AND review_note='Removed by owner'").bind(user.id).first()) return reply(request,env,{error:"provider_removed_by_owner"},403);
  await linkBookingsToUser(env, user);
  return issueSession(request, env, user.id, user.email, user.role);
}

// No email provider is configured, so recovery uses a pre-shared one-time
// secret held only by the owner. It is compared in constant time, rate limited,
// and never returned to the browser. No paid service or new account is needed.
async function recoverAdminPassword(request, env) {
  if (!env.ADMIN_RECOVERY_KEY) return reply(request, env, { error: "recovery_unavailable" }, 503);
  const body = await readJson(request), email = emailValue(body?.email);
  if (!await rateLimit(request, env, "recovery", 5) || (email && !await rateLimit(request, env, `recovery:${email}`, 3))) return reply(request, env, { error: "rate_limited" }, 429);
  const key = typeof body?.key === "string" && body.key.length <= 256 ? body.key : "";
  const newPassword = text(body?.new_password, MAX_PASSWORD_LENGTH);
  const admin = email ? await env.DB.prepare("SELECT id,email,role FROM users WHERE email=? AND role='admin'").bind(email).first() : null;
  if (!admin || passwordIssue(newPassword, true) || !await safeEqual(key, env.ADMIN_RECOVERY_KEY)) return reply(request, env, { error: "invalid_recovery" }, 400);
  await env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(await hashPassword(newPassword), admin.id).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(admin.id).run();
  await recordAuthEvent(env, admin.id, "admin_emergency_reset", "offline owner key");
  return reply(request, env, { ok: true });
}

async function changePassword(request, env) {
  const user = await currentUser(request, env);
  if (!user) return reply(request, env, { error: "unauthorized" }, 401);
  if (!await rateLimit(request, env, "change-password", 5)) return reply(request, env, { error: "rate_limited" }, 429);
  const body = await readJson(request), current = text(body?.current_password, MAX_PASSWORD_LENGTH), next = text(body?.new_password, MAX_PASSWORD_LENGTH);
  const nextIssue = passwordIssue(next, user.role === "admin");
  if (!current || nextIssue) return reply(request, env, { error: nextIssue === "common" ? "weak_password" : "invalid_password" }, 400);
  const stored = await env.DB.prepare("SELECT password_hash FROM users WHERE id=?").bind(user.id).first();
  if (!stored || !await verifyPassword(current, stored.password_hash)) return reply(request, env, { error: "current_password_incorrect" }, 400);
  await env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(await hashPassword(next), user.id).run();
  const token = request.headers.get("Authorization").slice(7);
  await env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").bind(user.id, await sha256(token)).run();
  await recordAuthEvent(env, user.id, "password_changed", "authenticated change");
  return reply(request, env, { ok: true });
}

function emailDeliveryConfigured(env) {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

async function recordAuthEvent(env, userId, kind, detail = "") {
  await env.DB.prepare("INSERT INTO auth_events(id,user_id,kind,detail,created_at) VALUES(?,?,?,?,?)")
    .bind(randomId(), userId || null, kind, text(detail, 120), new Date().toISOString()).run();
}

function resetEmailHtml(link) {
  const url = link.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return `<div style="background:#091d21;color:#f0f5f3;font-family:Arial,sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#103538;border:1px solid #2e6567;border-radius:14px;padding:24px">
    <p style="color:#f2b718;font-weight:700;margin:0 0 12px">MZ Active · password reset</p>
    <p style="margin:0 0 10px">Reset your MZ Active password. This link expires shortly (15 minutes, 5 minutes for administrators) and can be used once. If you did not request it, ignore this email.</p>
    <p style="margin:0 0 18px"><a href="${url}" style="background:#f2b718;color:#172a22;border-radius:999px;padding:10px 18px;text-decoration:none;font-weight:700">Reset password</a></p>
    <p style="margin:0;color:#b8cbc6" dir="rtl" lang="ar">إعادة تعيين كلمة مرور MZ Active. تنتهي صلاحية هذا الرابط قريباً (١٥ دقيقة، و٥ دقائق للمسؤولين) ويمكن استخدامه مرة واحدة فقط. إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>
  </div></div>`;
}

async function sendPasswordResetEmail(env, email, token) {
  const link = `https://mzactive.com/reset-password.html?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: RESET_EMAIL_SUBJECT,
      html: resetEmailHtml(link),
      text: `Reset your MZ Active password: ${link}\n\nإعادة تعيين كلمة مرور MZ Active: ${link}`,
    }),
  });
  if (!response.ok) throw new Error("email_delivery_failed");
  const result = await response.json().catch(() => ({}));
  return text(result?.id, 120);
}

function escapeHtml(value) {
  return text(value, 100).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function coachWelcomeEmail(firstName, language = "en") {
  const name = escapeHtml(firstName) || "Coach";
  const arabicFirst = language === "ar";
  const english = `<p style="margin:0 0 12px">Hi ${name},</p>
  <h1 style="margin:0 0 16px;color:#172a22;font-size:24px">Welcome to the MZActive family! 💛</h1>
  <p style="margin:0 0 12px">We're truly happy to have you with us.</p>
  <p style="margin:0 0 12px">Thank you for believing in our vision and choosing to be part of this journey.</p>
  <p style="margin:0 0 12px">At MZActive, we believe great coaches deserve more opportunities to inspire, connect, and grow.</p>
  <p style="margin:0 0 12px">We're excited to support you as you build your coaching career, reach new athletes, and make a meaningful impact.</p>
  <p style="margin:0 0 16px"><strong>Together, let's take your coaching career to the next level.</strong></p>
  <p style="margin:0 0 18px">Welcome aboard!</p>`;
  const arabic = `<p style="margin:0 0 12px">مرحباً ${name}،</p>
  <h1 style="margin:0 0 16px;color:#172a22;font-size:24px">مرحباً بك في عائلة MZActive! 💛</h1>
  <p style="margin:0 0 12px">يسعدنا انضمامك إلينا حقاً.</p>
  <p style="margin:0 0 12px">شكراً لإيمانك برؤيتنا واختيارك أن تكون جزءاً من هذه الرحلة.</p>
  <p style="margin:0 0 12px">نؤمن في MZActive بأن المختصين المتميزين يستحقون المزيد من الفرص للإلهام والتواصل والنمو.</p>
  <p style="margin:0 0 12px">يسعدنا دعمك في مسيرتك التدريبية، والوصول إلى رياضيين جدد، وترك أثر إيجابي.</p>
  <p style="margin:0 0 16px"><strong>معاً، لنرتِ بمسيرتك التدريبية إلى المستوى التالي.</strong></p>
  <p style="margin:0 0 18px">مرحباً بك على متن الفريق!</p>`;
  const primary = arabicFirst ? arabic : english;
  const secondary = arabicFirst ? english : arabic;
  const html = `<div style="background:#f4f1e8;padding:24px 12px;font-family:Arial,sans-serif"><table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:auto;width:100%;background:#ffffff;border-radius:14px;overflow:hidden"><tr><td style="background:#091d21;padding:22px 28px"><img src="https://mzactive.com/assets/brand/mzactive-logo.webp" alt="MZ Active" width="180" style="display:block;max-width:70%;height:auto"></td></tr><tr><td style="padding:28px;color:#22352e;line-height:1.6"><div lang="${arabicFirst ? "ar" : "en"}" dir="${arabicFirst ? "rtl" : "ltr"}">${primary}</div><p style="margin:24px 0 0"><a href="${COACH_PROFILE_URL}" style="background:#f2b718;color:#172a22;border-radius:999px;padding:12px 22px;text-decoration:none;font-weight:700;display:inline-block">${arabicFirst ? "أكمل ملف المدرب" : "Complete Your Coach Profile"}</a></p><hr style="border:0;border-top:1px solid #e3e7e2;margin:26px 0"><div lang="${arabicFirst ? "en" : "ar"}" dir="${arabicFirst ? "ltr" : "rtl"}" style="color:#5b6d64;font-size:14px">${secondary}</div></td></tr><tr><td style="background:#091d21;color:#f2b718;padding:18px 28px;font-size:13px">The MZActive Team<br><em>Train Smart. Perform Strong.</em></td></tr></table></div>`;
  const plain = `${arabicFirst ? "مرحباً بك في عائلة MZActive! 💛" : "Welcome to the MZActive family! 💛"}\n\n${name},\n\nWe're truly happy to have you with us.\nThank you for believing in our vision and choosing to be part of this journey.\nWe're excited to support you as you build your coaching career, reach new athletes, and make a meaningful impact.\nTogether, let's take your coaching career to the next level.\n\nComplete Your Coach Profile: ${COACH_PROFILE_URL}\n\nThe MZActive Team — Train Smart. Perform Strong.\n\nمرحباً بك في عائلة MZActive! 💛\nأكمل ملف المدرب: ${COACH_PROFILE_URL}`;
  return { subject: WELCOME_EMAIL_SUBJECT, html, text: plain };
}

async function sendCoachWelcomeEmail(env, details) {
  const message = coachWelcomeEmail(details.first_name, details.language);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [details.email],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  if (!response.ok) throw new Error("email_delivery_failed");
  const result = await response.json().catch(() => ({}));
  return text(result?.id, 120);
}

async function welcomeEmailStatus(env, profileId) {
  const row = await env.DB.prepare("SELECT status,attempts,error FROM coach_welcome_emails WHERE profile_id=? ORDER BY created_at DESC LIMIT 1").bind(profileId).first();
  return row
    ? { status: row.status, attempts: Number(row.attempts || 0), error: row.error || null }
    : { status: "none", attempts: 0, error: null };
}

function welcomeRetryAt(attempts) {
  const hours = Math.min(2 ** Math.max(0, attempts - 1), 24);
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

// A unique approval_event_id makes duplicate clicks and worker retries safe.
// Email failures never fail the approval that created the event.
async function enqueueCoachWelcome(env, details) {
  const now = new Date().toISOString();
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO coach_welcome_emails
    (id,profile_id,approval_event_id,user_id,email,first_name,language,status,attempts,provider_id,error,created_at,next_attempt_at,sent_at)
    VALUES(?,?,?,?,?,?,?,'pending',0,NULL,NULL,?,NULL,NULL)`)
    .bind(randomId(), details.profile_id, details.approval_event_id, details.user_id, details.email,
      text(details.first_name, 100) || "Coach", details.language === "ar" ? "ar" : "en", now).run();
  if (!inserted.meta?.changes) return welcomeEmailStatus(env, details.profile_id);
  if (!emailDeliveryConfigured(env)) {
    await env.DB.prepare("UPDATE coach_welcome_emails SET status='pending',attempts=1,error='email_unavailable',next_attempt_at=? WHERE approval_event_id=?")
      .bind(welcomeRetryAt(1), details.approval_event_id).run();
    return { status: "pending", attempts: 1, error: "email_unavailable" };
  }
  try {
    const providerId = await sendCoachWelcomeEmail(env, details);
    await env.DB.prepare("UPDATE coach_welcome_emails SET status='sent',provider_id=?,sent_at=?,error=NULL WHERE approval_event_id=?")
      .bind(providerId, new Date().toISOString(), details.approval_event_id).run();
    return { status: "sent", attempts: 0, error: null };
  } catch {
    await env.DB.prepare("UPDATE coach_welcome_emails SET status='pending',attempts=1,error='email_delivery_failed',next_attempt_at=? WHERE approval_event_id=?")
      .bind(welcomeRetryAt(1), details.approval_event_id).run();
    return { status: "pending", attempts: 1, error: "email_delivery_failed" };
  }
}

async function retryCoachWelcomeEmails(env) {
  if (!emailDeliveryConfigured(env)) return 0;
  const due = await env.DB.prepare(`SELECT * FROM coach_welcome_emails WHERE status<>'sent' AND attempts<?
    AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT 20`)
    .bind(WELCOME_MAX_ATTEMPTS, new Date().toISOString()).all();
  let sent = 0;
  for (const row of due.results || []) {
    try {
      const providerId = await sendCoachWelcomeEmail(env, row);
      await env.DB.prepare("UPDATE coach_welcome_emails SET status='sent',provider_id=?,sent_at=?,error=NULL WHERE id=?")
        .bind(providerId, new Date().toISOString(), row.id).run();
      sent += 1;
    } catch {
      const attempts = Number(row.attempts || 0) + 1;
      await env.DB.prepare("UPDATE coach_welcome_emails SET attempts=?,error='email_delivery_failed',next_attempt_at=?,status=? WHERE id=?")
        .bind(attempts, welcomeRetryAt(attempts), attempts >= WELCOME_MAX_ATTEMPTS ? "failed" : "pending", row.id).run();
    }
  }
  return sent;
}

function parsedList(value) {
  const items = safeParse(value);
  return Array.isArray(items) ? items : [];
}

function requestLanguage(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("lang") === "ar") return "ar";
  } catch { /* use header below */ }
  return /\bar\b/i.test(request.headers.get("Accept-Language") || "") ? "ar" : "en";
}

// Completeness is deliberately separate from approval. These are the same
// business rules the review queue already uses; they never block approval.
function profileCompletion(row = {}) {
  const type = String(row.provider_type || "");
  const licensed = LICENSED_PROVIDER_TYPES.includes(type);
  const services = cleanList(parsedList(row.services_json), 12, 120);
  const specialties = cleanList(parsedList(row.specialties_json), 20, 80);
  const languages = cleanList(parsedList(row.languages_json), 10, 40);
  const socialLinks = cleanList(parsedList(row.social_links_json), 5, 300);
  const bio = String(row.bio || "").trim();
  const bioReady = Boolean(bio && bio !== "Profile awaiting completion by the provider.");
  const required = [];
  if (!String(row.display_name || "").trim()) required.push("display_name");
  if (!emailValue(row.email || "")) required.push("email");
  if (licensed) {
    if (!services.length) required.push("services");
    if (!String(row.license_number || "").trim()) required.push("license_number");
    if (!String(row.license_issuer || "").trim()) required.push("license_issuer");
  } else {
    if (!bioReady) required.push("bio");
    if (!specialties.length) required.push("specialties");
  }
  const recommended = [];
  if (!Number(row.has_profile_photo)) recommended.push("profile_photo");
  if (!Number(row.has_cover)) recommended.push("cover_photo");
  if (!String(row.city || "").trim() && !String(row.country || "").trim()) recommended.push("location");
  if (!Number(row.experience_years || 0)) recommended.push("experience");
  if (!languages.length) recommended.push("languages");
  if (!licensed && !services.length) recommended.push("services");
  // Qualifications and the private Sports CV are optional. For licensed
  // categories they are still checked separately during admin approval.
  if (!String(row.qualifications || "").trim()) recommended.push("qualifications");
  if (!normalizeWhatsApp(row.whatsapp_number)) recommended.push("whatsapp_number");
  if (!socialLinks.length) recommended.push("social_links");
  const requiredTotal = 2 + (licensed ? 3 : 2);
  const recommendedTotal = licensed ? 8 : 9;
  const requiredDone = requiredTotal - required.length;
  const recommendedDone = recommendedTotal - recommended.length;
  return {
    percent: requiredTotal ? Math.round((requiredDone / requiredTotal) * 100) : 100,
    complete: required.length === 0,
    required,
    recommended,
    score: Math.round(((requiredDone + recommendedDone) / (requiredTotal + recommendedTotal)) * 100),
  };
}

// Contact details are read from Worker bindings by name only. Nothing is
// hardcoded in source, and a missing binding produces a visible setup state.
function managementContactConfig(env) {
  const email = emailValue(env.MANAGEMENT_CONTACT_EMAIL || "");
  const whatsapp = normalizeWhatsApp(env.MANAGEMENT_CONTACT_WHATSAPP || "") || "";
  return {
    email,
    whatsapp,
    email_configured: Boolean(email),
    whatsapp_configured: Boolean(whatsapp),
    configured: Boolean(email || whatsapp),
  };
}

function whatsappLink(number, message) {
  const digits = normalizeWhatsApp(number);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text(message, 1200))}`;
}

async function sendManagementEmail(env, to, subject, message, idempotencyKey = "") {
  if (!emailDeliveryConfigured(env)) return { ok: false, error: "email_unavailable" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: text(subject, 180) || "MZ Active management message",
        text: text(message, 4000),
      }),
    });
    if (!response.ok) return { ok: false, error: "email_delivery_failed" };
    const result = await response.json().catch(() => ({}));
    return { ok: true, provider_id: text(result?.id, 120) };
  } catch {
    return { ok: false, error: "email_delivery_failed" };
  }
}


async function aiBrainSettings(env) {
  try {
    const existing = await env.DB.prepare("SELECT * FROM ai_brain_settings WHERE id=1").first();
    if (existing) return existing;
    await env.DB.prepare("INSERT OR IGNORE INTO ai_brain_settings(id,updated_at) VALUES(1,?)").bind(new Date().toISOString()).run();
    const created = await env.DB.prepare("SELECT * FROM ai_brain_settings WHERE id=1").first();
    if (created) return created;
  } catch { /* A lightweight test stub may not implement this table. */ }
  return {
    id: 1, notifications_enabled: 1, report_time: "07:00", timezone: "Asia/Qatar",
    admin_email: AI_BRAIN_ADMIN_EMAIL, last_report_at: null,
    last_report_status: "never_run", updated_at: new Date().toISOString(),
  };
}

function qatarClock(value = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Qatar", hour: "2-digit", minute: "2-digit",
    year: "numeric", month: "2-digit", day: "2-digit", hour12: false,
  }).formatToParts(new Date(value));
  const get = type => parts.find((part) => part.type === type)?.value || "";
  return { time: `${get("hour")}:${get("minute")}`, date: `${get("year")}-${get("month")}-${get("day")}` };
}

async function recordAiBrainError(env, source, message, context = {}, notify = false) {
  await env.DB.prepare("INSERT INTO ai_brain_errors(id,source,message,context_json,created_at) VALUES(?,?,?,?,?)")
    .bind(randomId(), text(source, 60), text(message, 180), JSON.stringify(context), new Date().toISOString()).run();
  if (notify) {
    await queueAiBrainEmail(env, {
      eventKey: `critical-error:${source}:${Math.floor(Date.now() / 3600000)}`,
      subject: "MZ AI Brain critical error",
      body: aiBrainEmailText("MZ AI Brain critical error", [
        `Source: ${source}`,
        `Time: ${new Date().toISOString()}`,
        `Error: ${text(message, 180)}`,
        "No personal data or payment action is included. Review the Admin Portal for details.",
      ]),
      kind: "critical_error",
    });
  }
}

async function deliverAiBrainEmail(env, id) {
  const row = await env.DB.prepare("SELECT * FROM ai_brain_outbox WHERE id=?").bind(id).first();
  if (!row) return { ok: false, error: "email_not_found" };
  if (row.status === "sent") return { ok: true, status: "sent", provider_id: row.provider_id, duplicate: true };
  if (!emailDeliveryConfigured(env)) {
    await env.DB.prepare("UPDATE ai_brain_outbox SET status='failed',error='email_unavailable',attempts=attempts+1 WHERE id=?").bind(id).run();
    return { ok: false, error: "email_unavailable" };
  }
  const result = await sendManagementEmail(env, row.recipient, row.subject, row.body);
  const now = new Date().toISOString();
  if (result.ok) {
    await env.DB.prepare("UPDATE ai_brain_outbox SET status='sent',provider_id=?,error=NULL,sent_at=? WHERE id=?")
      .bind(result.provider_id || "", now, id).run();
    return { ok: true, status: "sent", provider_id: result.provider_id || "" };
  }
  await env.DB.prepare("UPDATE ai_brain_outbox SET status='failed',error=?,attempts=attempts+1 WHERE id=?")
    .bind(result.error || "email_delivery_failed", id).run();
  return { ok: false, status: "failed", error: result.error || "email_delivery_failed" };
}

async function queueAiBrainEmail(env, { eventKey, subject, body, kind = "ai_brain", recipient = AI_BRAIN_ADMIN_EMAIL }) {
  const settings = await aiBrainSettings(env);
  if (!settings.notifications_enabled) return { queued: false, reason: "disabled" };
  const id = randomId(), now = new Date().toISOString();
  const claim = await env.DB.prepare(`INSERT OR IGNORE INTO ai_brain_outbox
    (id,event_key,recipient,kind,subject,body,status,attempts,created_at)
    VALUES(?,?,?,?,?,?,'pending',0,?)`)
    .bind(id, text(eventKey, 180), recipient, text(kind, 60), text(subject, 180), text(body, 8000), now).run();
  if (!claim.meta.changes) return { queued: false, reason: "duplicate" };
  const delivery = await deliverAiBrainEmail(env, id);
  if (!delivery.ok) await recordAiBrainError(env, kind, delivery.error || "email_delivery_failed", { event_key: text(eventKey, 180) });
  return { queued: true, ...delivery };
}

async function notifyAiBrainRegistration(env, userId, category) {
  const now = new Date().toISOString();
  const registrationBody = aiBrainEmailText("New MZ Active registration", [
    `Account category: ${category}`,
    `Registered at: ${now}`,
    "No name, email address, phone number or document was included in this notice.",
  ]);
  await queueAiBrainEmail(env, {
    eventKey: `registration:${userId}`,
    subject: `MZ AI Brain: new ${category} registration`,
    body: registrationBody,
    kind: "registration",
  });
  if (category !== "Athlete") {
    await queueAiBrainEmail(env, {
      eventKey: `approval:${userId}`,
      subject: "MZ AI Brain: application requires approval",
      body: aiBrainEmailText("Application requires approval", [
        `Category: ${category}`,
        `Submitted at: ${now}`,
        "Review it in the Admin Portal. No personal contact details are included here.",
      ]),
      kind: "approval",
    });
  }
}

function aiBrainEmailText(title, lines) {
  return `${title}\n\n${lines.filter(Boolean).join("\n")}\n\nMZ AI Brain · MZ Active · Train Smart. Perform Strong.`;
}

async function runAiBrainDailyReport(env, scheduledTime = Date.now(), options = {}) {
  const settings = await aiBrainSettings(env);
  const clock = qatarClock(scheduledTime);
  if (!options.force && clock.time !== settings.report_time) return { skipped: "not_due", time: clock.time };
  const existing = await env.DB.prepare("SELECT id FROM ai_brain_reports WHERE report_date=?").bind(clock.date).first();
  if (existing && !options.force) return { skipped: "already_sent", report_date: clock.date };
  const since = settings.last_report_at || new Date(scheduledTime - 86400000).toISOString();
  const count = async (sql, bindings = []) => Number((await env.DB.prepare(sql).bind(...bindings).first())?.count || 0);
  const counts = {
    new_registrations: await count("SELECT COUNT(*) AS count FROM users WHERE role!='admin' AND created_at>=?", [since]),
    new_coaches: await count("SELECT COUNT(*) AS count FROM provider_profiles WHERE provider_type='coach' AND created_at>=?", [since]),
    new_pacers: await count("SELECT COUNT(*) AS count FROM provider_profiles WHERE provider_type='pacer' AND created_at>=?", [since]),
    new_athletes: await count("SELECT COUNT(*) AS count FROM users u WHERE u.role='provider' AND u.created_at>=? AND NOT EXISTS(SELECT 1 FROM provider_profiles p WHERE p.user_id=u.id)", [since]),
    pending_approvals: await count("SELECT COUNT(*) AS count FROM provider_profiles WHERE status='pending' AND COALESCE(submission_state,'submitted')<>'draft'"),
    booking_requests: await count("SELECT COUNT(*) AS count FROM booking_requests WHERE created_at>=?", [since]),
    open_bookings: await count("SELECT COUNT(*) AS count FROM booking_requests WHERE status IN ('received','reviewing')"),
    system_errors: await count("SELECT COUNT(*) AS count FROM ai_brain_errors WHERE created_at>=? AND resolved=0", [since]),
    failed_emails: await count("SELECT COUNT(*) AS count FROM ai_brain_outbox WHERE status='failed'"),
    ai_tasks: await count("SELECT COUNT(*) AS count FROM owner_agent_tasks WHERE created_at>=?", [since]),
  };
  const recommendations = [];
  if (counts.pending_approvals) recommendations.push(`Review ${counts.pending_approvals} pending professional application(s) in the Admin Portal.`);
  if (counts.open_bookings) recommendations.push(`Triage ${counts.open_bookings} open booking request(s) before confirming availability.`);
  if (counts.failed_emails) recommendations.push(`Check ${counts.failed_emails} failed email delivery record(s); no personal data is included in the report.`);
  if (counts.system_errors) recommendations.push(`Investigate ${counts.system_errors} unresolved AI Brain error(s) recorded since the last report.`);
  if (!recommendations.length) recommendations.push("No urgent action is indicated by the current verified counts.");
  const summary = aiBrainEmailText("MZ AI Brain daily report", [
    `Date (Asia/Qatar): ${clock.date}`,
    `Generated at: ${clock.time} Asia/Qatar`,
    `New registrations: ${counts.new_registrations}`,
    `New coaches: ${counts.new_coaches} · New pacers: ${counts.new_pacers} · New athletes: ${counts.new_athletes}`,
    `Pending approvals: ${counts.pending_approvals}`,
    `New booking requests: ${counts.booking_requests} · Open bookings: ${counts.open_bookings}`,
    `System errors: ${counts.system_errors} · Failed emails: ${counts.failed_emails}`,
    `AI tasks since last report: ${counts.ai_tasks}`,
    "Recommendations:",
    ...recommendations.map((item) => `- ${item}`),
    "All figures come from live MZ Active database records. No payment or WhatsApp action was taken.",
  ]);
  const reportId = randomId(), now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO ai_brain_reports
    (id,report_date,report_time,summary,counts_json,recommendations_json,email_status,created_at)
    VALUES(?,?,?,?,?,?,'pending',?)`)
    .bind(reportId, clock.date, settings.report_time, summary, JSON.stringify(counts), JSON.stringify(recommendations), now).run();
  const delivery = await queueAiBrainEmail(env, {
    eventKey: `daily-report:${clock.date}:${options.force ? "manual" : "scheduled"}`,
    subject: `MZ AI Brain daily report — ${clock.date}`,
    body: summary,
    kind: "daily_report",
  });
  const emailStatus = delivery.reason === "disabled" ? "disabled" : delivery.ok ? "sent" : "failed";
  await env.DB.prepare("UPDATE ai_brain_reports SET email_status=?,provider_id=?,error=? WHERE id=?")
    .bind(emailStatus, delivery.provider_id || "", delivery.error || null, reportId).run();
  await env.DB.prepare("UPDATE ai_brain_settings SET last_report_at=?,last_report_status=?,updated_at=? WHERE id=1")
    .bind(now, emailStatus, now).run();
  return { report_id: reportId, report_date: clock.date, counts, recommendations, email: delivery };
}

async function aiBrainOverview(env) {
  const [settings, reports, outbox, errors, latestTask] = await Promise.all([
    aiBrainSettings(env),
    env.DB.prepare("SELECT * FROM ai_brain_reports ORDER BY created_at DESC LIMIT 10").all(),
    env.DB.prepare("SELECT status,COUNT(*) AS count FROM ai_brain_outbox GROUP BY status").all(),
    env.DB.prepare("SELECT id,source,message,created_at FROM ai_brain_errors WHERE resolved=0 ORDER BY created_at DESC LIMIT 10").all(),
    env.DB.prepare("SELECT created_at FROM owner_agent_tasks ORDER BY created_at DESC LIMIT 1").first(),
  ]);
  const delivery = Object.fromEntries((outbox.results || []).map((row) => [row.status, Number(row.count || 0)]));
  const latest = (reports.results || [])[0] || null;
  return {
    settings: {
      notifications_enabled: Boolean(settings.notifications_enabled),
      report_time: settings.report_time,
      timezone: settings.timezone,
      admin_email: settings.admin_email,
      last_report_at: settings.last_report_at || null,
      last_report_status: settings.last_report_status,
      updated_at: settings.updated_at,
    },
    status: env.AI?.run ? "available" : "not_configured",
    email: {
      configured: emailDeliveryConfigured(env),
      sent: Number(delivery.sent || 0), failed: Number(delivery.failed || 0), pending: Number(delivery.pending || 0),
    },
    last_execution: latest?.created_at || latestTask?.created_at || null,
    latest_report: latest ? {
      id: latest.id, report_date: latest.report_date, created_at: latest.created_at,
      summary: latest.summary, counts: safeParse(latest.counts_json) || {},
      recommendations: safeParse(latest.recommendations_json) || [],
      email_status: latest.email_status, error: latest.error || null,
    } : null,
    reports: (reports.results || []).map((row) => ({
      id: row.id, report_date: row.report_date, created_at: row.created_at,
      email_status: row.email_status, error: row.error || null,
    })),
    errors: errors.results || [],
  };
}

async function queueCoachEmail(env, { eventKey, to, subject, body }) {
  if (!emailDeliveryConfigured(env) || !to) return { ok: false, error: "email_unavailable" };
  const recipient = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(to.toLowerCase()).first();
  if (recipient) {
    const prefs = await userNotificationPreferences(env, recipient.id);
    if (!prefs.email_enabled) return { ok: false, error: "email_disabled" };
  }
  const id = randomId(), now = new Date().toISOString();
  const claim = await env.DB.prepare(`INSERT OR IGNORE INTO coach_notification_outbox
    (id,event_key,recipient,subject,body,status,created_at) VALUES(?,?,?,?,?,'pending',?)`)
    .bind(id, text(eventKey, 180), to, text(subject, 180), text(body, 4000), now).run();
  if (!claim.meta.changes) return { ok: true, duplicate: true };
  const result = await sendManagementEmail(env, to, subject, body);
  if (result.ok) {
    await env.DB.prepare("UPDATE coach_notification_outbox SET status='sent',provider_id=?,sent_at=? WHERE id=?")
      .bind(result.provider_id || "", new Date().toISOString(), id).run();
    return { ok: true, provider_id: result.provider_id };
  }
  await env.DB.prepare("UPDATE coach_notification_outbox SET status='failed',error=? WHERE id=?")
    .bind(result.error || "email_delivery_failed", id).run();
  return { ok: false, error: result.error };
}

const COACH_CONTACT_PURPOSES = ["profile_support","bookings","programs","technical_issue","other"];
const COACH_CONTACT_STATES = ["drafted","opened","confirmed_sent","completed","failed"];
const MOMO_FIELD_LABELS = {
  display_name: ["profile name", "اسم الملف"],
  email: ["registered email", "البريد المسجل"],
  bio: ["professional biography", "النبذة المهنية"],
  specialties: ["sports and specialties", "الرياضات والتخصصات"],
  qualifications: ["qualifications", "المؤهلات"],
  services: ["published services", "الخدمات المعلنة"],
  license_number: ["professional license number", "رقم الترخيص المهني"],
  license_issuer: ["license issuer", "جهة الترخيص"],
  profile_photo: ["profile photograph", "صورة الملف"],
  cover_photo: ["cover photograph", "صورة الغلاف"],
  location: ["location", "الموقع"],
  experience: ["years of experience", "سنوات الخبرة"],
  languages: ["languages", "اللغات"],
  whatsapp_number: ["contact number", "رقم التواصل"],
  social_links: ["professional links", "الروابط المهنية"],
};

function momoMessage(name, missing, language = "en") {
  const labels = missing.slice(0, 6).map(field => (MOMO_FIELD_LABELS[field] || [field, field])[language === "ar" ? 1 : 0]);
  const list = labels.map(label => language === "ar" ? `• ${label}` : `- ${label}`).join("\n");
  if (language === "ar") {
    return `مرحباً ${name || "المدرب"}،\n\nلاحظنا أن ملفك في MZ Active يحتاج إلى بعض المعلومات قبل أن يكتمل ظهوره للرياضيين.\n\nالمعلومات المطلوبة:\n${list}\n\nيمكنك تحديث ملفك من هنا: ${COACH_PROFILE_URL}\n\nهذه رسالة مساعدة من Momo، مساعد MZ Active. لم يتم إرسال أي تحديث أو نشر نيابة عنك.\n\nفريق MZ Active`;
  }
  return `Hi ${name || "Coach"},\n\nA few details are still missing from your MZ Active profile before it is complete for athletes.\n\nMissing information:\n${list}\n\nUpdate your profile here: ${COACH_PROFILE_URL}\n\nThis is an automated reminder from Momo, the MZ Active assistant. Nothing has been published or changed on your behalf.\n\nThe MZ Active Team`;
}

function momoPriority(completion, followup, now) {
  const attempts = Number(followup?.attempt_count || 0) + 1;
  const age = followup?.created_at ? (Date.parse(now) - Date.parse(followup.created_at)) / 86400000 : 0;
  if (attempts >= MOMO_MAX_ATTEMPTS || age >= MOMO_ESCALATE_AFTER_DAYS) return "escalated";
  if (completion.required.length) return "high";
  return "normal";
}

// Momo only writes drafts and task records. It never sends a message and never
// changes a coach profile, approval status, booking, or assignment.
async function runMomoCoachFollowUps(env) {
  const rows = await env.DB.prepare(`SELECT p.id,p.provider_type,p.display_name,p.city,p.country,p.bio,p.specialties_json,p.languages_json,p.qualifications,p.services_json,p.license_number,p.license_issuer,p.experience_years,p.whatsapp_number,p.social_links_json,
    CASE WHEN p.profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,
    CASE WHEN EXISTS(SELECT 1 FROM provider_covers c WHERE c.provider_id=p.id) THEN 1 ELSE 0 END AS has_cover,
    u.email FROM provider_profiles p JOIN users u ON u.id=p.user_id
    WHERE p.status='approved' AND u.profile_visibility='public' ORDER BY p.updated_at DESC LIMIT 200`).all();
  const now = new Date().toISOString();
  let created = 0, resolved = 0;
  for (const row of rows.results || []) {
    const completion = profileCompletion(row);
    const existing = await env.DB.prepare("SELECT * FROM momo_coach_followups WHERE coach_profile_id=?").bind(row.id).first();
    if (completion.complete) {
      if (existing && !["resolved", "dismissed"].includes(existing.status)) {
        await env.DB.prepare("UPDATE momo_coach_followups SET status='resolved',updated_at=?,next_check_at=NULL WHERE id=?").bind(now, existing.id).run();
        resolved += 1;
      }
      continue;
    }
    if (existing?.status === "dismissed") continue;
    if (existing && existing.next_check_at && Date.parse(existing.next_check_at) > Date.parse(now)) continue;
    const missing = completion.required.length ? completion.required : completion.recommended.slice(0, 4);
    const priority = momoPriority(completion, existing, now);
    const messageEn = momoMessage(row.display_name, missing, "en");
    const messageAr = momoMessage(row.display_name, missing, "ar");
    const attempts = Number(existing?.attempt_count || 0) + 1;
    const nextCheck = new Date(Date.parse(now) + MOMO_REMINDER_INTERVAL_DAYS * 86400000).toISOString();
    const followupId = existing?.id || randomId();
    if (existing) {
      await env.DB.prepare(`UPDATE momo_coach_followups SET missing_fields_json=?,priority=?,message_en=?,message_ar=?,status=?,attempt_count=?,next_check_at=?,updated_at=? WHERE id=?`)
        .bind(JSON.stringify(missing), priority, messageEn, messageAr, priority === "escalated" ? "escalated" : "open", attempts, nextCheck, now, followupId).run();
    } else {
      await env.DB.prepare(`INSERT INTO momo_coach_followups(id,coach_profile_id,missing_fields_json,priority,message_en,message_ar,status,task_id,attempt_count,last_contacted_at,next_check_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'open',NULL,?,NULL,?,?,?)`)
        .bind(followupId, row.id, JSON.stringify(missing), priority, messageEn, messageAr, attempts, nextCheck, now, now).run();
    }
    const pending = await env.DB.prepare(`SELECT id FROM owner_agent_tasks WHERE status='completed' AND approval_status='pending'
      AND json_extract(input_json,'$.momo_followup_id')=? LIMIT 1`).bind(followupId).first();
    if (pending) {
      await env.DB.prepare("UPDATE momo_coach_followups SET task_id=? WHERE id=?").bind(pending.id, followupId).run();
      continue;
    }
    const taskId = randomId();
    const draft = priority === "escalated"
      ? `${messageEn}\n\nHuman review: this coach has been reminded ${attempts} times and the profile is still incomplete.`
      : messageEn;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO owner_agent_tasks(id,agent_type,source,title,status,approval_status,input_json,output_json,created_at,completed_at)
        VALUES(?,'support','scheduled',?,'completed','pending',?,?,?,?)`)
        .bind(taskId, `Momo coach follow-up: ${row.display_name || "Coach"}`,
          JSON.stringify({ agent: "momo", momo_followup_id: followupId, coach_id: row.id, priority }),
          JSON.stringify({ answer: draft, message_en: messageEn, message_ar: messageAr, missing, priority, coach_id: row.id, profile_edit_url: COACH_PROFILE_URL }),
          now, now),
      env.DB.prepare("UPDATE momo_coach_followups SET task_id=?,updated_at=? WHERE id=?").bind(taskId, now, followupId),
      env.DB.prepare(`INSERT INTO owner_agent_activity(id,agent_type,action,status,details_json,created_at)
        VALUES(?,'support','momo_followup_drafted','completed',?,?)`)
        .bind(randomId(), JSON.stringify({ coach_id: row.id, followup_id: followupId, priority }), now),
    ]);
    created += 1;
  }
  return { created, resolved, checked: (rows.results || []).length };
}

async function coachContactTargets(env, profileId) {
  const row = await env.DB.prepare(`SELECT p.id,p.display_name,p.user_id,u.email,p.whatsapp_number
    FROM provider_profiles p JOIN users u ON u.id=p.user_id WHERE p.id=?`).bind(profileId).first();
  if (!row) return null;
  return {
    id: row.id,
    name: row.display_name || "Coach",
    user_id: row.user_id,
    email: emailValue(row.email || ""),
    whatsapp: normalizeWhatsApp(row.whatsapp_number || "") || "",
  };
}

async function createCoachContactRecord(env, target, actor, channel, purpose, preparedMessage, result, forcedStatus = "") {
  const id = randomId(), now = new Date().toISOString();
  const status = forcedStatus || (result.ok ? "confirmed_sent" : "failed");
  const followUp = "open";
  await env.DB.prepare(`INSERT INTO coach_contact_records(id,coach_profile_id,actor_user_id,channel,purpose,prepared_message,status,follow_up_status,provider_message_id,error,followup_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, target.id, actor.id, channel, purpose, text(preparedMessage, 4000), status, followUp,
      result.provider_id || null, result.error || null, null, now, now).run();
  return { id, status, follow_up_status: followUp, updated_at: now };
}

async function ownerCompleteness(env, user) {
  const row = await env.DB.prepare(`SELECT p.*,u.email,CASE WHEN p.profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,
    CASE WHEN EXISTS(SELECT 1 FROM provider_covers c WHERE c.provider_id=p.id) THEN 1 ELSE 0 END AS has_cover
    FROM provider_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=?`).bind(user.id).first();
  return row ? { ...profileCompletion(row), status: row.status, profile_id: row.id } : null;
}

async function ownerContactRequest(request, env, user, intent) {
  const body = await readJson(request);
  if (!body || !["email","whatsapp"].includes(body.channel) || !COACH_CONTACT_PURPOSES.includes(body.purpose)) {
    return reply(request, env, { error: "invalid_contact_request" }, 400);
  }
  const config = managementContactConfig(env);
  const detail = body.channel === "email" ? config.email : config.whatsapp;
  if (!detail) return reply(request, env, { error: "management_contact_not_configured", contact: config }, 422);
  const message = text(body.message, 4000);
  if (!message) return reply(request, env, { error: "invalid_contact_request" }, 400);
  const profile = await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=?").bind(user.id).first();
  if (!profile) return reply(request, env, { error: "profile_not_found" }, 404);
  const prepared = `Hello MZ Active Management,\n\n${message}\n\n— Coach account: ${user.email || "MZ Active coach"}`;
  const now = new Date().toISOString();
  if (intent !== "send") {
    const id = randomId();
    await env.DB.prepare(`INSERT INTO coach_contact_records(id,coach_profile_id,actor_user_id,channel,purpose,prepared_message,status,follow_up_status,provider_message_id,error,followup_id,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'drafted','open',NULL,NULL,?,?,?)`)
      .bind(id, profile.id, user.id, body.channel, body.purpose, prepared, null, now, now).run();
    return reply(request, env, {
      id, status: "drafted", contact: config, recipient: detail,
      link: body.channel === "email"
        ? `mailto:${encodeURIComponent(detail)}?subject=${encodeURIComponent(`MZ Active · ${body.purpose.replaceAll("_"," ")}`)}&body=${encodeURIComponent(prepared)}`
        : whatsappLink(detail, prepared),
    }, 201);
  }
  if (body.channel === "email" && emailDeliveryConfigured(env)) {
    const result = await sendManagementEmail(env, detail, `MZ Active · ${body.purpose.replaceAll("_"," ")}`, prepared);
    const recordId = randomId();
    await env.DB.prepare(`INSERT INTO coach_contact_records(id,coach_profile_id,actor_user_id,channel,purpose,prepared_message,status,follow_up_status,provider_message_id,error,followup_id,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,'open',?,?,?,?,?)`)
      .bind(recordId, profile.id, user.id, body.channel, body.purpose, prepared, result.ok ? "confirmed_sent" : "failed",
        result.provider_id || null, result.error || null, null, now, now).run();
    return result.ok
      ? reply(request, env, { id: recordId, status: "confirmed_sent", delivery: "provider_accepted", contact: config }, 201)
      : reply(request, env, { id: recordId, status: "failed", error: result.error, contact: config }, 503);
  }
  const id = randomId();
  await env.DB.prepare(`INSERT INTO coach_contact_records(id,coach_profile_id,actor_user_id,channel,purpose,prepared_message,status,follow_up_status,provider_message_id,error,followup_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'drafted','open',NULL,?,NULL,?,?)`)
    .bind(id, profile.id, user.id, body.channel, body.purpose, prepared, body.channel === "whatsapp" ? "awaiting_human_confirmation" : null, now, now).run();
  return reply(request, env, { id, status: "drafted", contact: config, recipient: detail, link: whatsappLink(detail, prepared) }, 201);
}

// One identity system for admins, members and every professional category:
// all roles share this request/reset flow and are keyed by registered email.
async function forgotPassword(request, env) {
  if (!emailDeliveryConfigured(env)) return reply(request, env, { error: "recovery_unavailable" }, 503);
  const body = await readJson(request);
  const email = emailValue(body?.email);
  if (!email) return reply(request, env, { error: "invalid_email" }, 400);
  if (!await rateLimit(request, env, "forgot-password", 5) ||
      !await rateLimitScoped(env, `forgot:${await sha256(email)}`, 3, 60)) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const generic = { ok: true, message: "If an account exists for this email, a reset link has been sent. Check your inbox." };
  const user = await env.DB.prepare("SELECT id,email,role,account_status FROM users WHERE email=?").bind(email).first();
  // Suspended and deleted accounts get the same generic response so the
  // endpoint cannot be used to enumerate their existence.
  if (!user || !accountActive(user.account_status)) return reply(request, env, generic);
  const now = Math.floor(Date.now() / 1000);
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const expiresAt = now + (user.role === "admin" ? ADMIN_PASSWORD_RESET_TTL_SECONDS : PASSWORD_RESET_TTL_SECONDS);
  await env.DB.prepare("DELETE FROM password_reset_tokens WHERE expires_at<? OR used_at IS NOT NULL").bind(now).run();
  // A new request supersedes any earlier unused link for the same identity.
  await env.DB.prepare("DELETE FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL").bind(user.id).run();
  await env.DB.prepare("INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,used_at,created_at,email_provider_id) VALUES(?,?,?,?,NULL,?,NULL)")
    .bind(randomId(), user.id, tokenHash, expiresAt, new Date().toISOString()).run();
  try {
    const providerId = await sendPasswordResetEmail(env, user.email, token);
    await env.DB.prepare("UPDATE password_reset_tokens SET email_provider_id=? WHERE token_hash=?").bind(providerId, tokenHash).run();
  } catch {
    await env.DB.prepare("DELETE FROM password_reset_tokens WHERE token_hash=?").bind(tokenHash).run();
    return reply(request, env, { error: "recovery_unavailable" }, 503);
  }
  await recordAuthEvent(env, user.id, "reset_requested", user.role === "admin" ? "admin link" : "account link");
  return reply(request, env, generic);
}

async function resetPassword(request, env) {
  if (!emailDeliveryConfigured(env)) return reply(request, env, { error: "recovery_unavailable" }, 503);
  const body = await readJson(request);
  const token = text(body?.token, 200), newPassword = text(body?.new_password, MAX_PASSWORD_LENGTH);
  if (!token || !newPassword) return reply(request, env, { error: "invalid_password" }, 400);
  const tokenHash = await sha256(token);
  if (!await rateLimit(request, env, "reset-password", 8) ||
      !await rateLimitScoped(env, `reset:${tokenHash}`, 5, 60)) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const row = await env.DB.prepare("SELECT id,user_id FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?")
    .bind(tokenHash, Math.floor(Date.now() / 1000)).first();
  if (!row) return reply(request, env, { error: "invalid_token" }, 400);
  const user = await env.DB.prepare("SELECT id,email,role,account_status FROM users WHERE id=?").bind(row.user_id).first();
  if (!user || !accountActive(user.account_status)) return reply(request, env, { error: "invalid_token" }, 400);
  const resetIssue = passwordIssue(newPassword, user.role === "admin");
  if (resetIssue) return reply(request, env, { error: resetIssue === "common" ? "weak_password" : "invalid_password" }, 400);
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(newPassword);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(passwordHash, user.id),
    env.DB.prepare("UPDATE password_reset_tokens SET used_at=? WHERE id=?").bind(now, row.id),
    env.DB.prepare("DELETE FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
    env.DB.prepare("INSERT INTO auth_events(id,user_id,kind,detail,created_at) VALUES(?,?,?,?,?)")
      .bind(randomId(), user.id, "reset_completed", user.role === "admin" ? "admin email link" : "email link", now),
  ]);
  return reply(request, env, { ok: true });
}

async function publicProviders(url, request, env, id = null) {
  const type = url.searchParams.get("type") || "", city = text(url.searchParams.get("city") || "",80);
  const query = text(url.searchParams.get("q") || "",80);
  const viewer = await currentUser(request, env);
  const rows = await env.DB.prepare(`SELECT id,user_id,verified,qualifications,services_json,coaching_mode,certificate_name,certificate_issuer,license_number,license_issuer,license_expires_on,license_status,(SELECT json_group_array(slot) FROM provider_gallery WHERE provider_id=provider_profiles.id) AS gallery_slots,provider_type,display_name,country,city,specialties_json,languages_json,bio,experience_years,indicative_rate_qar,program_durations_json,pacer_details_json,CASE WHEN profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,profile_photo_updated_at,whatsapp_number,whatsapp_public,social_links_json,public_fields_json
    FROM provider_profiles WHERE status='approved'
    AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=provider_profiles.user_id AND (u.profile_visibility<>'public' OR u.account_status IS NULL OR u.account_status<>'active'))
    AND (provider_type NOT IN ('nutritionist','physiotherapist','sports_massage_therapist') OR (license_status='verified' AND (license_expires_on IS NULL OR license_expires_on>=date('now'))))
    AND (? IS NULL OR id=?) AND (?='' OR provider_type=?) AND (?='' OR city LIKE ?)
    AND (?='' OR display_name LIKE ? OR bio LIKE ? OR specialties_json LIKE ? OR qualifications LIKE ? OR services_json LIKE ? OR certificate_name LIKE ?) ORDER BY display_name LIMIT 50`)
    .bind(id,id,type,type,city,`%${city}%`,query,`%${query}%`,`%${query}%`,`%${query}%`,`%${query}%`,`%${query}%`,`%${query}%`).all();
  const viewerKeyPromise = id && viewer?.id ? viewerKey(request, env, viewer) : Promise.resolve("");
  const providers = await Promise.all((rows.results || []).map(async (row) => {
    const fields = cleanPublicFields(safeParse(row.public_fields_json));
    const show = (field) => fields.includes(field);
    const [achievements, cover, followerRow, following] = await Promise.all([
      env.DB.prepare("SELECT id,title,details,awarded_year FROM provider_achievements WHERE provider_id=? AND status='published' ORDER BY awarded_year DESC,created_at DESC LIMIT 12").bind(row.id).all(),
      env.DB.prepare("SELECT updated_at FROM provider_covers WHERE provider_id=?").bind(row.id).first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM user_follows WHERE coach_user_id=?").bind(row.user_id).first(),
      viewer?.id ? env.DB.prepare("SELECT 1 AS yes FROM user_follows WHERE follower_user_id=? AND coach_user_id=?").bind(viewer.id,row.user_id).first() : Promise.resolve(null),
    ]);
    if (id && viewer?.id !== row.user_id) {
      await env.DB.prepare("INSERT OR IGNORE INTO provider_profile_views(provider_id,viewer_key,created_at) VALUES(?,?,?)")
        .bind(row.id, await viewerKeyPromise, new Date().toISOString()).run();
    }
    return {
      id: row.id, provider_type: row.provider_type, display_name: row.display_name,
      professional_category: { en: professionalLabel(row.provider_type, "en"), ar: professionalLabel(row.provider_type, "ar") },
      verified: row.verified === 1,
      qualifications: show("qualifications") ? row.qualifications : "",
      services: show("services") ? cleanList(safeParse(row.services_json), 12, 120) : [],
      coaching_mode: row.coaching_mode,
      credentials: show("credentials") && row.license_status === "verified" ? {
        certificate_name: row.certificate_name, certificate_issuer: row.certificate_issuer,
        license_issuer: row.license_issuer, license_expires_on: row.license_expires_on,
        license_number_masked: maskLicenseNumber(row.license_number),
      } : null,
      license_verified: row.license_status === "verified" && show("credentials"),
      gallery_slots: safeParse(row.gallery_slots),
      country: show("city") ? row.country : "", city: show("city") ? row.city : "",
      specialties: show("specialties") ? safeParse(row.specialties_json) : [],
      languages: show("languages") ? safeParse(row.languages_json) : [],
      bio: show("bio") ? row.bio : "",
      experience_years: show("experience_years") ? row.experience_years : null,
      indicative_rate_qar: show("indicative_rate_qar") ? row.indicative_rate_qar : null,
      program_durations: show("program_durations") && row.provider_type === "coach" ? safeParse(row.program_durations_json).filter((months) => [1,2,3].includes(months)) : [],
      pacer_details: show("pacer_details") && row.provider_type === "pacer" ? cleanPacerDetails(safeParse(row.pacer_details_json)) : {},
      has_profile_photo: show("profile_photo") ? row.has_profile_photo : 0,
      profile_photo_updated_at: show("profile_photo") ? row.profile_photo_updated_at : null,
      has_cover: Boolean(cover), cover_updated_at: cover?.updated_at || null,
      achievements: achievements.results || [],
      follower_count: Number(followerRow?.count || 0),
      is_following: Boolean(following?.yes),
      whatsapp_number: show("whatsapp") && row.whatsapp_public ? row.whatsapp_number : null,
      social_links: show("social_links") ? safeParse(row.social_links_json) : [],
      public_fields: fields,
      // The server decides ownership from the session, never from a query
      // parameter or a client-side comparison of profile IDs.
      viewer: {
        authenticated: Boolean(viewer),
        owner: Boolean(viewer && viewer.id === row.user_id),
        can_message: Boolean(viewer && viewer.id !== row.user_id),
      },
    };
  }));
  if (id) return providers.length ? reply(request, env, { provider: providers[0] }) : reply(request, env, { error: "provider_unavailable" }, 404);
  return reply(request, env, { providers });
}
function normalizeWhatsApp(value) {
  const raw = text(value, 32).replace(/[\s().-]/g, "");
  if (!raw) return "";
  if (/^\d{8}$/.test(raw)) return `974${raw}`;
  // Stored numbers are normalized digits, so this helper must be idempotent.
  if (/^974\d{8}$/.test(raw)) return raw;
  if (!/^\+[1-9]\d{7,14}$/.test(raw)) return null;
  return raw.slice(1);
}
function cleanSocialLinks(value) {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  const links = items.map((item) => text(item, 300)).filter(Boolean);
  if (links.length > 5) return null;
  const result = [];
  for (const link of links) {
    try {
      const url = new URL(link);
      if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
      result.push(url.href);
    } catch { return null; }
  }
  return [...new Set(result)];
}
function cleanProfilePhotoUrl(value) {
  const raw = text(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
    return url.href;
  } catch { return null; }
}
function cleanGarminPublicUrl(value) {
  const url = cleanProfilePhotoUrl(value);
  if (!url) return url;
  const host = new URL(url).hostname.toLowerCase();
  return host === "garmin.com" || host.endsWith(".garmin.com") ? url : null;
}
function safeParse(value) { try { return JSON.parse(value); } catch { return []; } }

const COMMUNITY_KINDS = ["post", "event", "group_session", "challenge"];
const SPORTS = ["running", "walking", "fitness", "strength", "cycling", "swimming", "padel", "triathlon", "hyrox", "boxing", "kickboxing", "football", "other"];

async function viewerKey(request, env, user) {
  if (user?.id) return `user:${user.id}`;
  const token = /^Bearer ([\w-]{30,80})$/.exec(request.headers.get("Authorization") || "");
  if (token) return `token:${await sha256(token[1])}`;
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  return `ip:${await sha256(ip)}`;
}

async function userNotificationPreferences(env, userId) {
  const row = await env.DB.prepare("SELECT email_enabled,dashboard_enabled FROM user_notification_preferences WHERE user_id=?").bind(userId).first();
  if (row) return row;
  await env.DB.prepare("INSERT OR IGNORE INTO user_notification_preferences(user_id,email_enabled,dashboard_enabled,updated_at) VALUES(?,1,1,?)")
    .bind(userId, new Date().toISOString()).run();
  return { email_enabled: 1, dashboard_enabled: 1 };
}

async function createNotification(env, userId, type, title, body = "", entityType = "", entityId = "", href = "") {
  if (!userId) return;
  const prefs = await userNotificationPreferences(env, userId);
  if (!prefs.dashboard_enabled) return;
  await env.DB.prepare(`INSERT INTO user_notifications(id,user_id,type,title,body,entity_type,entity_id,href,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(randomId(), userId, type, text(title, 160), text(body, 500),
    text(entityType, 40), text(entityId, 36), text(href, 240), new Date().toISOString()).run();
}

async function coachProfileForUser(env, userId) {
  return env.DB.prepare("SELECT id,user_id,display_name,status,provider_type FROM provider_profiles WHERE user_id=?").bind(userId).first();
}

// Member accounts deliberately reuse the legacy provider role without a public
// provider profile. Link bookings made before sign-up so a confirmed booking can
// later become a private workspace for the same person.
async function linkBookingsToUser(env, user) {
  const email = emailValue(user?.email);
  if (!email || user?.role !== "provider") return;
  if (await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=?").bind(user.id).first()) return;
  await env.DB.prepare("UPDATE booking_requests SET customer_user_id=? WHERE lower(customer_email)=? AND customer_user_id IS NULL")
    .bind(user.id, email).run();
}

async function bookingAthleteUser(env, booking) {
  if (booking.customer_user_id) {
    return env.DB.prepare("SELECT id,email,role FROM users WHERE id=?").bind(booking.customer_user_id).first();
  }
  const email = emailValue(booking.customer_email);
  if (!email) return null;
  return env.DB.prepare(`SELECT u.id,u.email,u.role FROM users u WHERE u.email=? AND u.role='provider'
    AND NOT EXISTS(SELECT 1 FROM provider_profiles p WHERE p.user_id=u.id)`).bind(email).first();
}

// A confirmed booking supplies the coach's confirmation. The member must also
// accept the connection (or must have requested it originally) before a private
// workspace becomes active.
async function activateWorkspaceForBooking(env, bookingId) {
  const booking = await env.DB.prepare("SELECT * FROM booking_requests WHERE id=?").bind(bookingId).first();
  if (!booking || booking.status !== "accepted") return { activated: false, reason: "booking_not_confirmed" };
  const provider = await env.DB.prepare("SELECT user_id FROM provider_profiles WHERE id=? AND status='approved' AND provider_type='coach'")
    .bind(booking.provider_id).first();
  if (!provider) return { activated: false, reason: "coach_unavailable" };
  const athlete = await bookingAthleteUser(env, booking);
  if (!athlete || athlete.id === provider.user_id || athlete.role !== "provider") return { activated: false, reason: "athlete_account_required" };
  if (await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=?").bind(athlete.id).first()) return { activated: false, reason: "athlete_account_required" };

  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT * FROM coach_connections WHERE coach_user_id=? AND athlete_user_id=?")
    .bind(provider.user_id, athlete.id).first();
  if (!existing) {
    const id = randomId();
    await env.DB.prepare(`INSERT INTO coach_connections
      (id,coach_user_id,athlete_user_id,status,created_at,updated_at,booking_id,source,athlete_accepted_at,workspace_status,workspace_created_at)
      VALUES(?,?,?,'pending',?,?,?,'booking',NULL,'pending',NULL)`)
      .bind(id, provider.user_id, athlete.id, now, now, bookingId).run();
    await createNotification(env, athlete.id, "workspace_review", "Confirm your coaching workspace",
      "Your confirmed booking created a private workspace. Open your dashboard to accept it.", "coach_connection", id);
    return { activated: false, reason: "awaiting_athlete_acceptance", connection_id: id };
  }
  if (existing.status === "declined") {
    await env.DB.prepare(`UPDATE coach_connections SET status='pending',source='booking',booking_id=?,
      athlete_accepted_at=NULL,workspace_status='pending',workspace_created_at=NULL,updated_at=? WHERE id=?`)
      .bind(bookingId, now, existing.id).run();
    await createNotification(env, athlete.id, "workspace_review", "Confirm your coaching workspace",
      "Your confirmed booking created a private workspace. Open your dashboard to accept it.", "coach_connection", existing.id);
    return { activated: false, reason: "awaiting_athlete_acceptance", connection_id: existing.id };
  }
  if (existing.status === "accepted") {
    await env.DB.prepare(`UPDATE coach_connections SET booking_id=?,workspace_status='active',
      athlete_accepted_at=COALESCE(athlete_accepted_at,?),workspace_created_at=COALESCE(workspace_created_at,?),updated_at=? WHERE id=?`)
      .bind(bookingId, now, now, now, existing.id).run();
    await createNotification(env, athlete.id, "workspace_ready", "Private coaching workspace ready", "", "coach_connection", existing.id);
    await createNotification(env, provider.user_id, "workspace_ready", "Private coaching workspace ready", "", "coach_connection", existing.id);
    return { activated: true, connection_id: existing.id };
  }
  // An athlete-requested connection plus a confirmed booking is mutual acceptance.
  if (existing.source === "request") {
    await env.DB.prepare(`UPDATE coach_connections SET status='accepted',booking_id=?,athlete_accepted_at=?,
      workspace_status='active',workspace_created_at=?,updated_at=? WHERE id=?`)
      .bind(bookingId, now, now, now, existing.id).run();
    await createNotification(env, athlete.id, "workspace_ready", "Private coaching workspace ready", "", "coach_connection", existing.id);
    await createNotification(env, provider.user_id, "workspace_ready", "Private coaching workspace ready", "", "coach_connection", existing.id);
    return { activated: true, connection_id: existing.id };
  }
  await env.DB.prepare("UPDATE coach_connections SET booking_id=?,updated_at=? WHERE id=?").bind(bookingId, now, existing.id).run();
  await createNotification(env, athlete.id, "workspace_review", "Confirm your coaching workspace",
    "Your confirmed booking created a private workspace. Open your dashboard to accept it.", "coach_connection", existing.id);
  return { activated: false, reason: "awaiting_athlete_acceptance", connection_id: existing.id };
}

async function closeWorkspaceForBooking(env, bookingId) {
  await env.DB.prepare("UPDATE coach_connections SET workspace_status='closed',updated_at=? WHERE booking_id=? AND workspace_status='active'")
    .bind(new Date().toISOString(), bookingId).run();
}

async function workspaceAccess(request, env, connectionId) {
  const auth = await authenticated(request, env);
  if (auth.response) return { response: auth.response };
  if (auth.user.role === "admin") return { response: reply(request, env, { error: "forbidden" }, 403) };
  const connection = await env.DB.prepare("SELECT * FROM coach_connections WHERE id=?").bind(connectionId).first();
  if (!connection || (connection.coach_user_id !== auth.user.id && connection.athlete_user_id !== auth.user.id)) {
    return { response: reply(request, env, { error: "connection_not_found" }, 404) };
  }
  const athlete = connection.athlete_user_id === auth.user.id
    ? auth.user
    : await env.DB.prepare("SELECT id,email,role FROM users WHERE id=?").bind(connection.athlete_user_id).first();
  const member = athlete?.role === "provider" && !await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=?").bind(athlete.id).first();
  if (!await isApprovedCoachUser(env, connection.coach_user_id) || !member) {
    return { response: reply(request, env, { error: "connection_not_found" }, 404) };
  }
  if (connection.status !== "accepted" || connection.workspace_status !== "active") {
    return { response: reply(request, env, { error: "workspace_not_active" }, 409) };
  }
  return { auth, connection };
}

function cleanAttachmentName(value) {
  return text(value, 120).replace(/\\/g, "/").split("/").pop().replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 120) || "attachment";
}

function workspaceAttachmentType(bytes, declared) {
  const type = text(declared, 80).toLowerCase();
  if (!WORKSPACE_ATTACHMENT_TYPES.has(type)) return "";
  const buffer = new Uint8Array(bytes);
  if (type.startsWith("image/")) return profilePhotoType(bytes) === type ? type : "";
  if (type === "application/pdf") return new TextDecoder().decode(buffer.slice(0, 5)) === "%PDF-" ? type : "";
  return type === "text/plain" ? type : "";
}

async function workspacePayload(request, env, connection, viewer) {
  const athleteId = connection.athlete_user_id, coachId = connection.coach_user_id;
  const [bookingRow, sportsRow, coachRow, athleteRow, messages, attachments, progress, programs, sessions, feedback, teamEvents] = await Promise.all([
    env.DB.prepare("SELECT id,customer_name,city,session_type,preferred_date,status,created_at FROM booking_requests WHERE id=?").bind(connection.booking_id || "").first(),
    env.DB.prepare("SELECT display_name,garmin_public_url,goals,experience_level,sports_json,share_with_coaches FROM member_sports_profiles WHERE user_id=?").bind(athleteId).first(),
    env.DB.prepare("SELECT display_name FROM provider_profiles WHERE user_id=?").bind(coachId).first(),
    env.DB.prepare("SELECT email FROM users WHERE id=?").bind(athleteId).first(),
    env.DB.prepare("SELECT id,sender_user_id,body,created_at,read_at FROM coach_messages WHERE connection_id=? ORDER BY created_at LIMIT 200").bind(connection.id).all(),
    env.DB.prepare("SELECT id,uploader_user_id,file_name,content_type,byte_size,created_at FROM coach_workspace_attachments WHERE connection_id=? ORDER BY created_at DESC LIMIT 100").bind(connection.id).all(),
    env.DB.prepare("SELECT id,author_user_id,metric,value,unit,note,recorded_at,created_at FROM coach_workspace_progress WHERE connection_id=? ORDER BY recorded_at DESC LIMIT 100").bind(connection.id).all(),
    env.DB.prepare("SELECT id,athlete_name,athlete_user_id,week_start,coach_note,athlete_type FROM athlete_programs_v2 WHERE coach_user_id=? AND athlete_user_id=? ORDER BY week_start DESC LIMIT 60").bind(coachId, athleteId).all(),
    env.DB.prepare(`SELECT s.program_id,s.id,s.session_code,s.day_key,s.sport_type,s.details,
        c.completed_at,c.actual_km,c.duration_minutes
      FROM athlete_programs_v2 p JOIN athlete_program_sessions_v2 s ON s.program_id=p.id
      LEFT JOIN athlete_program_completions_v2 c ON c.session_id=s.id AND c.athlete_user_id=p.athlete_user_id
      WHERE p.coach_user_id=? AND p.athlete_user_id=? ORDER BY p.week_start DESC,s.sort_order LIMIT 500`).bind(coachId, athleteId).all(),
    env.DB.prepare(`SELECT f.id,f.program_id,f.rating,f.body,f.created_at,p.week_start,p.athlete_name
      FROM training_feedback f JOIN athlete_programs_v2 p ON p.id=f.program_id
      WHERE p.coach_user_id=? AND p.athlete_user_id=? ORDER BY f.created_at DESC LIMIT 100`).bind(coachId, athleteId).all(),
    env.DB.prepare(`SELECT s.id,s.title,s.starts_at,s.location,s.description,s.status
      FROM training_sessions s JOIN training_teams t ON t.id=s.team_id
      JOIN training_team_members m ON m.team_id=t.id AND m.user_id=?
      WHERE t.coach_user_id=? AND s.status!='cancelled' ORDER BY s.starts_at LIMIT 100`).bind(athleteId, coachId).all(),
  ]);
  const programMap = new Map((programs.results || []).map((program) => [program.id, { ...program, sessions: [] }]));
  for (const session of sessions.results || []) programMap.get(session.program_id)?.sessions.push(session);
  const programList = [...programMap.values()];
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const calendar = (teamEvents.results || []).map((event) => ({ ...event, source: "team_session" }));
  for (const program of programList) {
    const base = Date.parse(`${program.week_start}T00:00:00Z`);
    for (const session of program.sessions) {
      const index = days.indexOf(session.day_key);
      if (index < 0 || !Number.isFinite(base)) continue;
      calendar.push({ id: `${session.id}:${session.session_code}`, title: `${session.session_code} · ${program.athlete_name || "Athlete"}`,
        description: session.details, location: "", starts_at: new Date(base + index * 86400000).toISOString(),
        status: session.completed_at ? "completed" : "planned", source: "training_program" });
    }
  }
  calendar.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const who = (userId) => userId === coachId ? "coach" : "athlete";
  const history = [
    ...(messages.results || []).map((row) => ({ type: "message", at: row.created_at, actor: who(row.sender_user_id), title: "Private message", detail: row.body })),
    ...(attachments.results || []).map((row) => ({ type: "attachment", at: row.created_at, actor: who(row.uploader_user_id), title: row.file_name, detail: row.content_type })),
    ...(progress.results || []).map((row) => ({ type: "progress", at: row.recorded_at, actor: who(row.author_user_id), title: `${row.metric}: ${row.value}${row.unit ? " " + row.unit : ""}`, detail: row.note })),
    ...(feedback.results || []).map((row) => ({ type: "feedback", at: row.created_at, actor: "athlete", title: `${row.rating || "—"}/5 · ${row.week_start || ""}`, detail: row.body })),
    ...programList.flatMap((program) => program.sessions.filter((session) => session.completed_at).map((session) => ({
      type: "session_completed", at: session.completed_at, actor: "athlete", title: `${program.week_start} · ${session.session_code}`,
      detail: [session.actual_km ? `${session.actual_km} km` : "", session.duration_minutes ? `${session.duration_minutes} min` : ""].filter(Boolean).join(" · "),
    }))),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 200);
  const sportsShared = sportsRow?.share_with_coaches === 1 || sportsRow?.share_with_coaches === true;
  const publicUrl = sportsShared ? (sportsRow?.garmin_public_url || "") : "";
  return reply(request, env, {
    workspace: {
      id: connection.id,
      status: connection.workspace_status,
      created_at: connection.workspace_created_at,
      coach: { user_id: coachId, name: coachRow?.display_name || "MZ Active coach" },
      athlete: { user_id: athleteId, name: sportsShared ? (sportsRow?.display_name || athleteRow?.email?.split("@")[0] || "MZ Active member") : "MZ Active member" },
      booking: bookingRow || null,
      viewing_as: who(viewer.id),
      permissions: { coach: viewer.id === coachId, athlete: viewer.id === athleteId, admin: false },
      garmin: {
        public_url: publicUrl,
        sync_status: publicUrl ? "public_profile_link_only" : "not_provided",
        sync_enabled: false,
        share_enabled: sportsShared,
        note: sportsShared
          ? "Official Garmin Connect authorization and activity sync are not enabled. Only an athlete-provided public profile link is shown."
          : "The member has not chosen to share sports profile details with this coach.",
      },
      messages: messages.results || [],
      attachments: attachments.results || [],
      progress: progress.results || [],
      programs: programList,
      feedback: feedback.results || [],
      calendar: calendar.slice(0, 300),
      history,
    },
  });
}

async function handleWorkspaceApi(request, env, url) {
  const path = url.pathname, method = request.method;
  let match = /^\/api\/connections\/([\w-]{36})\/workspace$/.exec(path);
  if (match && method === "GET") {
    const access = await workspaceAccess(request, env, match[1]);
    if (access.response) return access.response;
    return workspacePayload(request, env, access.connection, access.auth.user);
  }
  match = /^\/api\/connections\/([\w-]{36})\/attachments$/.exec(path);
  if (match && method === "GET") {
    const access = await workspaceAccess(request, env, match[1]);
    if (access.response) return access.response;
    const rows = await env.DB.prepare("SELECT id,uploader_user_id,file_name,content_type,byte_size,created_at FROM coach_workspace_attachments WHERE connection_id=? ORDER BY created_at DESC LIMIT 100")
      .bind(access.connection.id).all();
    return reply(request, env, { attachments: rows.results || [] });
  }
  if (match && method === "POST") {
    const access = await workspaceAccess(request, env, match[1]);
    if (access.response) return access.response;
    if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
    if (!await rateLimit(request, env, "workspace-attachment", 20)) return reply(request, env, { error: "rate_limited" }, 429);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_WORKSPACE_ATTACHMENT_BYTES) return reply(request, env, { error: "attachment_too_large" }, 413);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_WORKSPACE_ATTACHMENT_BYTES) return reply(request, env, { error: "attachment_too_large" }, 413);
    const declared = request.headers.get("content-type") || "";
    const contentType = workspaceAttachmentType(bytes, declared);
    if (!contentType) return reply(request, env, { error: "invalid_attachment" }, 400);
    const id = randomId(), now = new Date().toISOString();
    const fileName = cleanAttachmentName(request.headers.get("x-file-name") || "attachment");
    await env.DB.prepare(`INSERT INTO coach_workspace_attachments(id,connection_id,uploader_user_id,file_name,content_type,bytes,byte_size,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(id, access.connection.id, access.auth.user.id, fileName, contentType, bytes, bytes.byteLength, now).run();
    const other = access.auth.user.id === access.connection.coach_user_id ? access.connection.athlete_user_id : access.connection.coach_user_id;
    await createNotification(env, other, "workspace_attachment", "New workspace attachment", fileName, "coach_connection", access.connection.id);
    return reply(request, env, { id, file_name: fileName, content_type: contentType, byte_size: bytes.byteLength, created_at: now }, 201);
  }
  match = /^\/api\/connections\/([\w-]{36})\/attachments\/([\w-]{36})$/.exec(path);
  if (match && method === "GET") {
    const access = await workspaceAccess(request, env, match[1]);
    if (access.response) return access.response;
    const row = await env.DB.prepare("SELECT bytes,content_type,file_name FROM coach_workspace_attachments WHERE id=? AND connection_id=?")
      .bind(match[2], access.connection.id).first();
    if (!row) return reply(request, env, { error: "attachment_not_found" }, 404);
    const response = binaryReply(request, env, row.bytes, row.content_type, "private, no-store");
    response.headers.set("content-disposition", `inline; filename="${cleanAttachmentName(row.file_name).replace(/"/g, "")}"`);
    return response;
  }
  match = /^\/api\/connections\/([\w-]{36})\/progress$/.exec(path);
  if (match && method === "GET") {
    const access = await workspaceAccess(request, env, match[1]);
    if (access.response) return access.response;
    const rows = await env.DB.prepare("SELECT id,author_user_id,metric,value,unit,note,recorded_at,created_at FROM coach_workspace_progress WHERE connection_id=? ORDER BY recorded_at DESC LIMIT 100")
      .bind(access.connection.id).all();
    return reply(request, env, { progress: rows.results || [] });
  }
  if (match && method === "POST") {
    const access = await workspaceAccess(request, env, match[1]);
    if (access.response) return access.response;
    if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
    if (!await rateLimit(request, env, "workspace-progress", 30)) return reply(request, env, { error: "rate_limited" }, 429);
    const body = await readJson(request);
    const metric = text(body?.metric, 40), value = text(body?.value, 40), unit = text(body?.unit, 20), note = text(body?.note, 300);
    const recordedAt = text(body?.recorded_at, 10);
    if (!body || !WORKSPACE_PROGRESS_METRICS.has(metric) || !value || !/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
      return reply(request, env, { error: "invalid_progress" }, 400);
    }
    const id = randomId(), now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO coach_workspace_progress(id,connection_id,author_user_id,metric,value,unit,note,recorded_at,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(id, access.connection.id, access.auth.user.id, metric, value, unit, note, recordedAt, now).run();
    const other = access.auth.user.id === access.connection.coach_user_id ? access.connection.athlete_user_id : access.connection.coach_user_id;
    await createNotification(env, other, "workspace_progress", "New progress update", `${metric}: ${value}${unit ? " " + unit : ""}`, "coach_connection", access.connection.id);
    return reply(request, env, { id, created_at: now }, 201);
  }
  return null;
}

async function canPublishImmediately(env, user) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const profile = await coachProfileForUser(env, user.id);
  return profile?.status === "approved";
}

async function isApprovedCoachUser(env, userId) {
  const user = await env.DB.prepare("SELECT id,email,role FROM users WHERE id=?").bind(userId).first();
  return user ? isApprovedCoach(env, user) : false;
}

function displayName(row) {
  return row?.display_name || row?.athlete_name || row?.customer_name || row?.email?.split("@")[0] || "MZ Active member";
}

function sanitizeYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null;
}

function cleanSports(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => SPORTS.includes(item)))].slice(0, 8);
}

function postStatusFor(user, canPublish) {
  return canPublish ? "published" : "pending";
}

async function communityCounts(env, postIds) {
  if (!postIds.length) return new Map();
  const placeholders = postIds.map(() => "?").join(",");
  const [likeRows, commentRows, photoRows] = await Promise.all([
    env.DB.prepare(`SELECT post_id,COUNT(*) AS count FROM community_likes WHERE post_id IN (${placeholders}) GROUP BY post_id`).bind(...postIds).all(),
    env.DB.prepare(`SELECT post_id,COUNT(*) AS count FROM community_comments WHERE post_id IN (${placeholders}) AND status='published' GROUP BY post_id`).bind(...postIds).all(),
    env.DB.prepare(`SELECT post_id,json_group_array(slot) AS slots FROM community_post_photos WHERE post_id IN (${placeholders}) GROUP BY post_id`).bind(...postIds).all(),
  ]);
  const result = new Map(postIds.map((id) => [id, { likes: 0, comments: 0, photos: [] }]));
  for (const row of likeRows.results || []) { const item = result.get(row.post_id); if (item) item.likes = Number(row.count || 0); }
  for (const row of commentRows.results || []) { const item = result.get(row.post_id); if (item) item.comments = Number(row.count || 0); }
  for (const row of photoRows.results || []) { const item = result.get(row.post_id); if (item) item.photos = safeParse(row.slots).sort(); }
  return result;
}

async function enrichPosts(env, rows, userId = "") {
  const ids = (rows || []).map((row) => row.id);
  const counts = await communityCounts(env, ids);
  const rsvps = userId && ids.length
    ? await env.DB.prepare(`SELECT post_id,response FROM community_rsvps WHERE user_id=? AND post_id IN (${ids.map(() => "?").join(",")})`).bind(userId, ...ids).all()
    : { results: [] };
  const liked = userId && ids.length
    ? await env.DB.prepare(`SELECT post_id FROM community_likes WHERE user_id=? AND post_id IN (${ids.map(() => "?").join(",")})`).bind(userId, ...ids).all()
    : { results: [] };
  const rsvpMap = new Map((rsvps.results || []).map((row) => [row.post_id, row.response]));
  const likedSet = new Set((liked.results || []).map((row) => row.post_id));
  return (rows || []).map((row) => {
    const value = counts.get(row.id) || { likes: 0, comments: 0, photos: [] };
    return {
      id: row.id, kind: row.kind, body: row.body, sport: row.sport, language: row.language,
      title: row.title || "", community_id: row.community_id || "", visibility: row.visibility || "public",
      series_id: row.series_id || "", recurrence: row.recurrence || "none",
      starts_at: row.starts_at, starts_at_local: row.starts_at_local || "",
      timezone: row.timezone || "Asia/Qatar", organizer_profile_id: row.organizer_profile_id || "",
      online_details: row.online_details || "", cancelled_at: row.cancelled_at || "", edited_at: row.edited_at || "",
      location: row.location, capacity: row.capacity,
      status: row.status, created_at: row.created_at, published_at: row.published_at,
      author_user_id: row.author_user_id,
      author_name: row.display_name || row.email?.split("@")[0] || "MZ Active member",
      author_verified: row.verified === 1,
      likes: value.likes, comments: value.comments, photos: value.photos,
      liked: likedSet.has(row.id), rsvp: rsvpMap.get(row.id) || "",
      going: Number(row.going || 0), interested: Number(row.interested || 0),
    };
  });
}

async function recordPostView(env, postId, request, envUser) {
  await env.DB.prepare("INSERT OR IGNORE INTO community_post_views(post_id,viewer_key,created_at) VALUES(?,?,?)")
    .bind(postId, await viewerKey(request, env, envUser), new Date().toISOString()).run();
}

function profilePhotoType(bytes) {
  const view = new Uint8Array(bytes);
  if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) return "image/jpeg";
  if (view.length >= 8 && view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47 && view[4] === 0x0d && view[5] === 0x0a && view[6] === 0x1a && view[7] === 0x0a) return "image/png";
  if (view.length >= 12 && String.fromCharCode(...view.slice(0, 4)) === "RIFF" && String.fromCharCode(...view.slice(8, 12)) === "WEBP") return "image/webp";
  return "";
}

// Only real PDF and DOCX containers are accepted. DOCX is a ZIP archive, so the
// central directory is checked for Word parts rather than trusting the declared
// MIME type or file extension.
function cvFileType(bytes) {
  const view = new Uint8Array(bytes);
  if (view.length >= 5 && view[0] === 0x25 && view[1] === 0x50 && view[2] === 0x44 && view[3] === 0x46 && view[4] === 0x2d) return CV_PDF_TYPE;
  if (view.length >= 4 && view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04) {
    const tailStart = Math.max(0, view.length - 65536);
    const tail = new TextDecoder("latin1").decode(view.subarray(tailStart));
    if (tail.includes("word/") && tail.includes("[Content_Types].xml")) return CV_DOCX_TYPE;
  }
  return "";
}

function safeCvFileName(value) {
  const name = text(value, 160).split(/[\\/]/).pop().replace(/[^\w.\- ]/g, "").trim();
  return name.slice(0, 120) || "sports-cv";
}

function binaryReply(request, env, bytes, contentType, cacheControl, disposition = "inline") {
  const headers = corsHeaders(request, env);
  if (!headers) return json({ error: "origin_not_allowed" }, 403);
  headers.set("content-type", contentType);
  headers.set("cache-control", cacheControl);
  headers.set("vary", `${headers.get("vary") || "Origin"}, Authorization`);
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-disposition", disposition);
  // D1 can materialize BLOB columns as plain number arrays in real runtimes.
  // Response does not accept those as a body, so normalize every binary result.
  const body = Array.isArray(bytes) ? Uint8Array.from(bytes)
    : ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : bytes;
  return new Response(body, { headers });
}

async function uploadProfilePhoto(request, env, user) {
  if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
  const profile = await env.DB.prepare("SELECT status,review_note FROM provider_profiles WHERE user_id=?").bind(user.id).first();
  if (profile?.status === "rejected" && profile.review_note === "Removed by owner") return reply(request, env, { error: "provider_removed_by_owner" }, 403);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_PROFILE_PHOTO_BYTES) return reply(request, env, { error: "photo_too_large" }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_PROFILE_PHOTO_BYTES) return reply(request, env, { error: "photo_too_large" }, 413);
  const contentType = profilePhotoType(bytes);
  if (!contentType) return reply(request, env, { error: "invalid_photo" }, 400);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE provider_profiles SET profile_photo_bytes=?,profile_photo_content_type=?,profile_photo_updated_at=?,status='pending',review_note=NULL,updated_at=? WHERE user_id=?")
    .bind(bytes, contentType, now, now, user.id).run();
  return reply(request, env, { status: "pending_review", photo_uploaded: true, updated_at: now });
}

async function ownerCv(request, env, user, method) {
  if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
  const profile = await env.DB.prepare("SELECT id,status,review_note,cv_bytes,cv_content_type,cv_file_name,cv_byte_size,cv_updated_at FROM provider_profiles WHERE user_id=?").bind(user.id).first();
  if (!profile) return reply(request, env, { error: "profile_not_found" }, 404);
  if (profile.status === "rejected" && profile.review_note === "Removed by owner") return reply(request, env, { error: "provider_removed_by_owner" }, 403);
  if (method === "GET") {
    if (!profile.cv_bytes || !profile.cv_content_type) return reply(request, env, { error: "cv_not_found" }, 404);
    const disposition = `attachment; filename="${safeCvFileName(profile.cv_file_name)}"`;
    return binaryReply(request, env, profile.cv_bytes, profile.cv_content_type, "private, no-store", disposition);
  }
  if (method === "DELETE") {
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE provider_profiles SET cv_bytes=NULL,cv_content_type=NULL,cv_file_name=NULL,cv_byte_size=NULL,cv_updated_at=NULL,updated_at=? WHERE user_id=?").bind(now, user.id).run();
    return reply(request, env, { cv_removed: true });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_CV_BYTES) return reply(request, env, { error: "cv_too_large" }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_CV_BYTES) return reply(request, env, { error: "cv_too_large" }, 413);
  const detected = cvFileType(bytes);
  if (!detected) return reply(request, env, { error: "invalid_cv" }, 400);
  const declared = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (declared && declared !== detected) return reply(request, env, { error: "invalid_cv" }, 400);
  const now = new Date().toISOString();
  const fileName = safeCvFileName(request.headers.get("x-file-name") || "sports-cv");
  await env.DB.prepare("UPDATE provider_profiles SET cv_bytes=?,cv_content_type=?,cv_file_name=?,cv_byte_size=?,cv_updated_at=?,updated_at=? WHERE user_id=?")
    .bind(bytes, detected, fileName, bytes.byteLength, now, now, user.id).run();
  // A CV is private review material. Uploading one never unpublishes an
  // approved profile and never adds a second public application.
  return reply(request, env, { cv_uploaded: true, file_name: fileName, byte_size: bytes.byteLength, updated_at: now });
}

async function publicProfilePhoto(id, request, env) {
  const row = await env.DB.prepare(`SELECT profile_photo_bytes,profile_photo_content_type,public_fields_json FROM provider_profiles
    WHERE id=? AND status='approved' AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=provider_profiles.user_id AND u.profile_visibility<>'public')`).bind(id).first();
  if (!row?.profile_photo_bytes || !row.profile_photo_content_type || !cleanPublicFields(safeParse(row.public_fields_json)).includes("profile_photo")) return reply(request, env, { error: "photo_not_found" }, 404);
  return binaryReply(request, env, row.profile_photo_bytes, row.profile_photo_content_type, "private, no-cache");
}

async function galleryImage(id, slot, request, env, approvedOnly) {
  const row = await env.DB.prepare(`SELECT g.bytes,g.content_type FROM provider_gallery g
    JOIN provider_profiles p ON p.id=g.provider_id WHERE p.id=? AND g.slot=? AND (?=0 OR p.status='approved')
    AND (?=0 OR NOT EXISTS(SELECT 1 FROM users u WHERE u.id=p.user_id AND u.profile_visibility<>'public'))`)
    .bind(id,slot,Number(approvedOnly),Number(approvedOnly)).first();
  return row ? binaryReply(request, env, row.bytes, row.content_type, "private, no-store")
    : reply(request, env, { error: "photo_not_found" }, 404);
}

async function manageGallery(slot, request, env) {
  const user = await currentUser(request, env);
  if (user?.role !== "provider") return reply(request, env, { error: "unauthorized" }, 401);
  const p = await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=? AND COALESCE(review_note,'')!='Removed by owner'").bind(user.id).first();
  if (!p) return reply(request, env, { error: "provider_unavailable" }, 404);
  if (request.method === "GET") return galleryImage(p.id, slot, request, env, false);
  if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
  if (Number(request.headers.get("content-length")) > MAX_PROFILE_PHOTO_BYTES) return reply(request, env, { error: "photo_too_large" }, 413);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_PROFILE_PHOTO_BYTES) return reply(request, env, { error: "photo_too_large" }, 413);
  const mime = profilePhotoType(bytes);
  if (bytes.byteLength && !mime) return reply(request, env, { error: "invalid_photo" }, 400);
  const edit = bytes.byteLength
    ? env.DB.prepare("INSERT OR REPLACE INTO provider_gallery(provider_id,slot,bytes,content_type) VALUES(?,?,?,?)").bind(p.id,slot,bytes,mime)
    : env.DB.prepare("DELETE FROM provider_gallery WHERE provider_id=? AND slot=?").bind(p.id,slot);
  await env.DB.batch([edit, env.DB.prepare("UPDATE provider_profiles SET status='pending',review_note=NULL,updated_at=? WHERE id=? AND COALESCE(review_note,'')!='Removed by owner'").bind(new Date().toISOString(),p.id)]);
  return reply(request, env, { status: "pending_review" });
}

async function saveProfile(request, env, user) {
  if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
  const existing = await env.DB.prepare(`SELECT status,review_note,program_durations_json,provider_type,qualifications,services_json,
    certificate_name,certificate_issuer,certificate_number,license_number,license_issuer,license_country,license_expires_on,license_status,
    submission_state,submitted_at,pacer_details_json
    FROM provider_profiles WHERE user_id=?`).bind(user.id).first();
  if (existing?.status === "rejected" && existing.review_note === "Removed by owner") return reply(request, env, { error: "provider_removed_by_owner" }, 403);
  const body = await readJson(request);
  // "draft" keeps the profile out of the review queue; every other value is a
  // submission, which preserves the historical single-button save behaviour.
  const savingDraft = body?.action === "draft";
  const submissionState = savingDraft ? "draft" : "submitted";
  const submittedAt = savingDraft ? (existing?.submitted_at || null) : (existing?.submitted_at || new Date().toISOString());
  const type = professionalType(body?.provider_type);
  const submittedProgramDurations = body && Object.prototype.hasOwnProperty.call(body, "program_durations")
    ? cleanProgramDurations(body.program_durations)
    : null;
  const programDurations = type === "coach"
    ? (submittedProgramDurations || cleanProgramDurations(safeParse(existing?.program_durations_json)))
    : [];
  if (body?.coaching_mode !== undefined && !["","online","in-person","both"].includes(body.coaching_mode)) return reply(request, env, { error: "invalid_coaching_mode" }, 400);
  if (body?.license_expires_on !== undefined && body.license_expires_on && !cleanCredentialDate(body.license_expires_on)) return reply(request, env, { error: "invalid_license_date" }, 400);
  const publicFields = cleanPublicFields(body?.public_fields || DEFAULT_PUBLIC_FIELDS);
  const name = text(body?.display_name,100), city = text(body?.city,80), bio = text(body?.bio,4000);
  const whatsappInput = text(body?.whatsapp_number,32), whatsapp = normalizeWhatsApp(whatsappInput), whatsappPublic = body?.whatsapp_public === true;
  const canPublishWhatsApp = Boolean(whatsapp && whatsappPublic);
  const socialLinks = cleanSocialLinks(body?.social_links);
  if (!body || !type) return reply(request, env, { error: "invalid_profile_type" }, 400);
  if (type === "coach" && !programDurations.length) return reply(request, env, { error: "coach_program_required" }, 400);
  const credentials = {
    certificate_name: text(body?.certificate_name,120), certificate_issuer: text(body?.certificate_issuer,120),
    certificate_number: text(body?.certificate_number,80), license_number: text(body?.license_number,80),
    license_issuer: text(body?.license_issuer,120), license_country: text(body?.license_country,80),
    license_expires_on: cleanCredentialDate(body?.license_expires_on),
  };
  const credentialKeys = Object.keys(credentials);
  const credentialsSubmitted = credentialKeys.some((key) => body[key] !== undefined);
  const credentialsChanged = credentialsSubmitted && credentialKeys.some((key) => (existing?.[key] || "") !== credentials[key]);
  const qualifications = body.qualifications === undefined ? null : text(body.qualifications,1500);
  const services = body.services === undefined ? null : cleanList(body.services,12,120);
  const pacerDetailsSubmitted = type === "pacer" && body.pacer_details !== undefined;
  const pacerDetails = pacerDetailsSubmitted ? cleanPacerDetails(body.pacer_details) : cleanPacerDetails(safeParse(existing?.pacer_details_json));
  if (pacerDetailsSubmitted && !savingDraft && (!pacerDetails.sports.length || !pacerDetails.services.length)) return reply(request, env, { error: "invalid_pacer_details" }, 400);
  if (pacerDetailsSubmitted && !savingDraft && pacerDetails.sports.includes("running") && !pacerDetails.running_pace) return reply(request, env, { error: "invalid_pacer_details" }, 400);
  if (pacerDetailsSubmitted && !savingDraft && pacerDetails.sports.includes("cycling") && !pacerDetails.cycling_speed) return reply(request, env, { error: "invalid_pacer_details" }, 400);
  const pacerDetailsChanged = pacerDetailsSubmitted && pacerDetailsKey(pacerDetails) !== pacerDetailsKey(existing?.pacer_details_json);
  const warnings = [];
  if (whatsappInput && (!whatsapp || !whatsappPublic)) warnings.push("whatsapp_not_saved");
  if (socialLinks === null) warnings.push("social_links_skipped");
  if (LICENSED_PROVIDER_TYPES.includes(type) && credentialsSubmitted && (!credentials.license_number || !credentials.license_issuer)) warnings.push("license_details_incomplete");
  // A category change, credential change, or edit to a licensed profile that is
  // not verified must always return to human review. Verification for one
  // category must never authorise a different category or an expired licence.
  const typeChanged = Boolean(existing && existing.provider_type && existing.provider_type !== type);
  const licensedNeedsReview = LICENSED_PROVIDER_TYPES.includes(type) && existing?.license_status !== "verified";
  const reReview = Boolean(existing && (credentialsChanged || typeChanged || licensedNeedsReview || pacerDetailsChanged));
  const nextStatus = existing?.status === "approved" && !reReview ? "approved" : "pending";
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE provider_profiles SET provider_type=?,display_name=CASE WHEN ?='' THEN display_name ELSE ? END,country=?,city=?,specialties_json=?,languages_json=?,bio=?,experience_years=?,indicative_rate_qar=?,program_durations_json=?,pacer_details_json=?,whatsapp_number=?,whatsapp_public=?,social_links_json=?,public_fields_json=?,qualifications=COALESCE(?,qualifications),services_json=COALESCE(?,services_json),coaching_mode=COALESCE(?,coaching_mode),certificate_name=CASE WHEN ?=1 THEN ? ELSE certificate_name END,certificate_issuer=CASE WHEN ?=1 THEN ? ELSE certificate_issuer END,certificate_number=CASE WHEN ?=1 THEN ? ELSE certificate_number END,license_number=CASE WHEN ?=1 THEN ? ELSE license_number END,license_issuer=CASE WHEN ?=1 THEN ? ELSE license_issuer END,license_country=CASE WHEN ?=1 THEN ? ELSE license_country END,license_expires_on=CASE WHEN ?=1 THEN ? ELSE license_expires_on END,license_status=CASE WHEN ?=1 THEN 'pending' ELSE license_status END,license_review_note=CASE WHEN ?=1 THEN '' ELSE license_review_note END,submission_state=?,submitted_at=?,status=?,review_note=NULL,updated_at=? WHERE user_id=?`)
    .bind(type,name,name,text(body.country,80)||"Qatar",city,JSON.stringify(cleanList(body.specialties,12,60)),JSON.stringify(cleanList(body.languages,8,40)),bio,clampInt(body.experience_years,0,60),clampNullableInt(body.indicative_rate_qar,0,100000),JSON.stringify(programDurations),JSON.stringify(type === "pacer" ? pacerDetails : {}),canPublishWhatsApp?whatsapp:null,canPublishWhatsApp?1:0,JSON.stringify(socialLinks||[]),JSON.stringify(publicFields),
      qualifications,services === null ? null : JSON.stringify(services),body.coaching_mode === undefined ? null : body.coaching_mode,
      Number(credentialsSubmitted),credentials.certificate_name,
      Number(credentialsSubmitted),credentials.certificate_issuer,
      Number(credentialsSubmitted),credentials.certificate_number,
      Number(credentialsSubmitted),credentials.license_number,
      Number(credentialsSubmitted),credentials.license_issuer,
      Number(credentialsSubmitted),credentials.license_country,
      Number(credentialsSubmitted),credentials.license_expires_on || null,
      Number(reReview),Number(reReview),submissionState,submittedAt,nextStatus,now,user.id).run();
  return reply(request, env, { status: nextStatus === "approved" ? "approved" : "pending_review", submission_state: submissionState, submitted_at: submittedAt, warnings, profile_updated: nextStatus === "approved" });
}

async function createBooking(request, env) {
  if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
  if (!await rateLimit(request, env, "booking", 5)) return reply(request, env, { error: "rate_limited" }, 429);
  const body = await readJson(request), email = emailValue(body?.customer_email);
  const name = text(body?.customer_name,100), phone = text(body?.customer_phone,40), city = text(body?.city,80), goal = text(body?.goal_summary,1000);
  const digits = phone.replace(/\D/g, "");
  const validMobile = /^\+?[\d\s()-]+$/.test(phone) && /^\d{7,15}$/.test(digits);
  const sessionType = BOOKING_SESSION_TYPES.includes(body?.session_type) ? body.session_type : "";
  const serviceName = text(body?.service_name,120), distance = text(body?.distance,60), targetPace = text(body?.target_pace,40);
  if (!body || !validMobile || !/\p{L}/u.test(name) || !city || !goal || !sessionType || body.consent !== true) return reply(request, env, { error: "invalid_booking_request" }, 400);
  let providerId = text(body.provider_id,36) || null, programDuration = Number(body.program_duration_months) || null;
  if (providerId) {
    const provider = await env.DB.prepare("SELECT id,display_name,provider_type,services_json,public_fields_json,program_durations_json,CASE WHEN whatsapp_public=1 THEN whatsapp_number ELSE NULL END AS public_whatsapp FROM provider_profiles WHERE id=? AND status='approved' AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=provider_profiles.user_id AND (u.profile_visibility<>'public' OR u.account_status IS NULL OR u.account_status<>'active')) AND (provider_type NOT IN ('nutritionist','physiotherapist','sports_massage_therapist') OR (license_status='verified' AND (license_expires_on IS NULL OR license_expires_on>=date('now'))))").bind(providerId).first();
    if (!provider) return reply(request, env, { error: "provider_unavailable" }, 404);
    const visibility = cleanPublicFields(safeParse(provider.public_fields_json));
    const offeredServices = cleanList(safeParse(provider.services_json),12,120);
    if (!PROFESSIONAL_CATEGORIES[provider.provider_type]?.sessions.includes(sessionType)) return reply(request, env, { error: "invalid_session_for_provider" }, 400);
    if (LICENSED_PROVIDER_TYPES.includes(provider.provider_type)) {
      if (!serviceName || (offeredServices.length && !offeredServices.includes(serviceName))) return reply(request, env, { error: "service_required" }, 400);
    }
    if (provider.provider_type === "coach" && sessionType === "training") {
      const offered = cleanProgramDurations(safeParse(provider.program_durations_json));
      if (offered.length && visibility.includes("program_durations")) {
        if (!offered.includes(programDuration)) return reply(request, env, { error: "coach_program_required" }, 400);
      } else programDuration = null;
    } else programDuration = null;
    body.provider_name = provider.display_name;
    body.provider_category = professionalLabel(provider.provider_type, "en");
    body.provider_whatsapp = visibility.includes("whatsapp") ? provider.public_whatsapp : null;
  }
  const id = randomId();
  const viewer = await currentUser(request, env);
  const customerUserId = viewer && await isMemberAccount(env, viewer) ? viewer.id : null;
  await env.DB.prepare(`INSERT INTO booking_requests(id,provider_id,customer_user_id,customer_name,customer_email,customer_phone,city,preferred_date,goal_summary,consent_at,status,created_at,payment_status,session_type,service_name,distance,target_pace,program_duration_months)
    VALUES(?,?,?,?,?,?,?,?,?,?,'received',?,'pending_payment',?,?,?,?,?)`).bind(id,providerId,customerUserId,name,email||null,phone,city,text(body.preferred_date,10)||null,goal,new Date().toISOString(),new Date().toISOString(),sessionType,serviceName,distance,targetPace,programDuration).run();
  let coachOwnerId = null, coachOwnerType = null;
  if (providerId) {
    const owner = await env.DB.prepare("SELECT user_id,provider_type FROM provider_profiles WHERE id=?").bind(providerId).first();
    coachOwnerId = owner?.user_id || null;
    coachOwnerType = owner?.provider_type || null;
    await createNotification(env, coachOwnerId, "booking_received", "New booking request", `${name} · ${city}`, "booking_request", id);
  }
  // Coaching requests keep a real coach connection so the WhatsApp handoff can
  // deep-link the coach to the exact pending request instead of exposing a raw id.
  let coachConnectionId = null;
  let deepLink = null;
  if (["coach", "bodybuilding_coach"].includes(coachOwnerType || "")) {
    const athleteUser = await bookingAthleteUser(env, { customer_user_id: customerUserId, customer_email: email || null });
    if (coachOwnerId && athleteUser?.id && athleteUser.id !== coachOwnerId) {
      const existing = await env.DB.prepare("SELECT id FROM coach_connections WHERE coach_user_id=? AND athlete_user_id=?").bind(coachOwnerId, athleteUser.id).first();
      coachConnectionId = existing?.id || null;
      if (!coachConnectionId) {
        coachConnectionId = randomId();
        await env.DB.prepare(`INSERT INTO coach_connections(id,coach_user_id,athlete_user_id,status,created_at,updated_at,booking_id,source,athlete_accepted_at,workspace_status,workspace_created_at) VALUES(?,?,?,'pending',?,?,?,'booking',NULL,'pending',NULL)`)
          .bind(coachConnectionId, coachOwnerId, athleteUser.id, new Date().toISOString(), new Date().toISOString(), id).run();
      }
      deepLink = coachConnectionId ? `https://mzactive.com/dashboard.html?connection=${coachConnectionId}#myAthletes` : null;
    }
  }
  if (deepLink) {
    const coachUser = await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(coachOwnerId).first();
    await queueCoachEmail(env, {
      eventKey: `booking_received:${id}`,
      to: coachUser?.email || "",
      subject: "New coaching request on MZ Active",
      body: `A member sent you a coaching request on MZ Active.\n\nOpen the exact request: ${deepLink}`,
    });
  }
  return reply(request, env, { request_id: id, connection_id: coachConnectionId, status: "received_pending_payment", provider_name: body.provider_name || "MZ Active Champion Pacer", provider_category: body.provider_category || "Sports Coach", provider_whatsapp: body.provider_whatsapp || null, provider_type: coachOwnerType || null, deep_link: deepLink }, 201);
}

function newJoinCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join("");
}

async function isApprovedCoach(env, user) {
  if (user.role !== "provider") return false;
  const profile = await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=? AND status='approved'").bind(user.id).first();
  return Boolean(profile);
}

async function isMemberAccount(env, user) {
  if (user.role !== "provider") return false;
  const profile = await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=?").bind(user.id).first();
  return !profile;
}

async function hasManagementPermission(env, user, code) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const row = await env.DB.prepare("SELECT 1 AS allowed FROM user_management_permissions WHERE user_id=? AND permission_code=?")
    .bind(user.id, code).first();
  return Boolean(row?.allowed);
}

function allowedManagementCategories(user, permissions) {
  return Object.keys(MANAGEMENT_NOTIFICATION_CATEGORIES).filter((category) =>
    isSuperAdmin(user) || permissions.includes(MANAGEMENT_NOTIFICATION_CATEGORIES[category].permission));
}

// Actionable items are derived from live records, never from a cached number.
// A resolved booking/application/message simply stops appearing; read receipts
// live in a separate per-manager table and never mutate the underlying record.
async function managementNotificationCounts(env, categories) {
  // D1 caps compound SELECTs at five terms; this dashboard has six categories,
  // so use one row of scalar subqueries instead of six UNION ALL branches.
  const row = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM booking_requests WHERE status IN ('received','reviewing')) AS bookings,
    (SELECT COUNT(*) FROM provider_profiles WHERE status='pending') AS coaches,
    (SELECT COUNT(*) FROM coach_messages m JOIN coach_connections c ON c.id=m.connection_id
      WHERE m.read_at IS NULL AND c.workspace_status IN ('pending','active')) AS messages,
    (SELECT COUNT(*) FROM community_posts WHERE status='pending') +
      (SELECT COUNT(*) FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE c.status='hidden' OR p.status='pending') +
      (SELECT COUNT(*) FROM provider_achievements WHERE status='pending') AS community,
    (SELECT COUNT(*) FROM coach_blog_posts WHERE status='pending') AS articles,
    (SELECT COUNT(*) FROM owner_agent_tasks WHERE status='completed' AND approval_status='pending'
      AND json_valid(output_json) AND json_extract(output_json,'$.answer') IS NOT NULL) AS ai`).first();
  return Object.fromEntries(categories.map((category) => [category, Number(row?.[category] || 0)]));
}

// The bell shows the true actionable total, even when the panel is bounded to
// the most recent 50 items. A read receipt only counts while its record is
// still actionable, so resolving a record removes it from both numbers.
async function managementUnreadCounts(env, user, categories) {
  // Same D1 five-term limit as above, with the per-manager read receipts kept
  // strictly separate from the underlying record state.
  const row = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM booking_requests b WHERE b.status IN ('received','reviewing')
      AND NOT EXISTS (SELECT 1 FROM management_notification_reads r WHERE r.user_id=? AND r.category='bookings' AND r.entity_id=b.id)) AS bookings,
    (SELECT COUNT(*) FROM provider_profiles p WHERE p.status='pending'
      AND NOT EXISTS (SELECT 1 FROM management_notification_reads r WHERE r.user_id=? AND r.category='coaches' AND r.entity_id=p.id)) AS coaches,
    (SELECT COUNT(*) FROM coach_messages m JOIN coach_connections c ON c.id=m.connection_id
      WHERE m.read_at IS NULL AND c.workspace_status IN ('pending','active')
        AND NOT EXISTS (SELECT 1 FROM management_notification_reads r WHERE r.user_id=? AND r.category='messages' AND r.entity_id=m.id)) AS messages,
    (SELECT COUNT(*) FROM (
      SELECT p.id FROM community_posts p WHERE p.status='pending'
      UNION ALL SELECT c.id FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE c.status='hidden' OR p.status='pending'
      UNION ALL SELECT a.id FROM provider_achievements a WHERE a.status='pending'
      ) AS community_rows
      WHERE NOT EXISTS (SELECT 1 FROM management_notification_reads r WHERE r.user_id=? AND r.category='community' AND r.entity_id=community_rows.id)) AS community,
    (SELECT COUNT(*) FROM coach_blog_posts b WHERE b.status='pending'
      AND NOT EXISTS (SELECT 1 FROM management_notification_reads r WHERE r.user_id=? AND r.category='articles' AND r.entity_id=b.id)) AS articles,
    (SELECT COUNT(*) FROM owner_agent_tasks t WHERE t.status='completed' AND t.approval_status='pending' AND json_valid(t.output_json)
      AND json_extract(t.output_json,'$.answer') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM management_notification_reads r WHERE r.user_id=? AND r.category='ai' AND r.entity_id=t.id)) AS ai`)
    .bind(user.id, user.id, user.id, user.id, user.id, user.id).first();
  return Object.fromEntries(categories.map((category) => [category, Number(row?.[category] || 0)]));
}

async function managementNotificationItems(env, categories, limit = 50) {
  const items = [];
  const bounded = Math.min(Math.max(Number(limit) || 50, 1), 1000);
  const add = (rows, category, eventType, entityType, hrefTab) => {
    for (const row of rows.results || []) {
      items.push({
        id: category + ':' + row.id,
        category,
        event_type: eventType,
        entity_type: entityType || category,
        entity_id: row.id,
        name: String(row.name || row.title || "MZ Active").slice(0, 160),
        status: String(row.status || "pending"),
        created_at: row.created_at,
        href: '/admin.html?tab=' + hrefTab + '&record=' + encodeURIComponent(row.id),
      });
    }
  };
  const queries = [];
  if (categories.includes('bookings')) queries.push(
    env.DB.prepare("SELECT id,customer_name AS name,status,created_at FROM booking_requests WHERE status IN ('received','reviewing') ORDER BY created_at DESC LIMIT ?").bind(bounded)
      .all().then((rows) => add(rows, 'bookings', 'booking_request', 'booking_request', 'bookings')));
  if (categories.includes('coaches')) queries.push(
    env.DB.prepare("SELECT id,display_name AS name,status,created_at FROM provider_profiles WHERE status='pending' ORDER BY created_at LIMIT ?").bind(bounded)
      .all().then((rows) => add(rows, 'coaches', 'coach_application', 'provider_profile', 'coaches')));
  if (categories.includes('messages')) queries.push(
    env.DB.prepare(`SELECT m.id,m.created_at,
      COALESCE(NULLIF(ms.display_name,''),NULLIF(pd.display_name,''),u.email,'MZ Active member') AS name,
      'unread' AS status FROM coach_messages m
      JOIN coach_connections c ON c.id=m.connection_id
      JOIN users u ON u.id=m.sender_user_id
      LEFT JOIN member_sports_profiles ms ON ms.user_id=u.id
      LEFT JOIN provider_profiles pd ON pd.user_id=u.id
      WHERE m.read_at IS NULL AND c.workspace_status IN ('pending','active')
      ORDER BY m.created_at DESC LIMIT ?`).bind(bounded)
      .all().then((rows) => add(rows, 'messages', 'private_message', 'coach_message', 'messages')));
  if (categories.includes('community')) queries.push(
    env.DB.prepare(`SELECT * FROM (
      SELECT 'community_post' AS entity_type,p.id,
        COALESCE(NULLIF(ms.display_name,''),NULLIF(pd.display_name,''),u.email,'MZ Active member') AS name,
        p.status,p.created_at FROM community_posts p
        JOIN users u ON u.id=p.author_user_id
        LEFT JOIN member_sports_profiles ms ON ms.user_id=u.id
        LEFT JOIN provider_profiles pd ON pd.user_id=u.id WHERE p.status='pending'
      UNION ALL
      SELECT 'community_comment' AS entity_type,c.id,
        COALESCE(NULLIF(ms.display_name,''),NULLIF(pd.display_name,''),u.email,'MZ Active member') AS name,
        c.status,c.created_at FROM community_comments c
        JOIN users u ON u.id=c.user_id JOIN community_posts p ON p.id=c.post_id
        LEFT JOIN member_sports_profiles ms ON ms.user_id=u.id
        LEFT JOIN provider_profiles pd ON pd.user_id=u.id WHERE c.status='hidden' OR p.status='pending'
      UNION ALL
      SELECT 'provider_achievement' AS entity_type,a.id,pd.display_name AS name,a.status,a.created_at
        FROM provider_achievements a JOIN provider_profiles pd ON pd.id=a.provider_id WHERE a.status='pending'
      ) AS community_items ORDER BY created_at DESC LIMIT ?`).bind(bounded)
      .all().then((rows) => {
        for (const row of rows.results || []) items.push({
          id: 'community:' + row.id,
          category: 'community',
          event_type: row.entity_type === 'community_comment' ? 'community_comment'
            : row.entity_type === 'provider_achievement' ? 'achievement' : 'community_post',
          entity_type: row.entity_type,
          entity_id: row.id,
          name: String(row.name || 'MZ Active member').slice(0, 160),
          status: String(row.status || 'pending'),
          created_at: row.created_at,
          href: '/admin.html?tab=community&record=' + encodeURIComponent(row.id),
        });
      }));
  if (categories.includes('articles')) queries.push(
    env.DB.prepare(`SELECT b.id,b.title AS name,b.status,b.created_at FROM coach_blog_posts b
      JOIN users u ON u.id=b.coach_user_id LEFT JOIN provider_profiles p ON p.id=b.provider_id
      WHERE b.status='pending' ORDER BY b.created_at LIMIT ?`).bind(bounded)
      .all().then((rows) => add(rows, 'articles', 'article', 'coach_blog_post', 'articles')));
  if (categories.includes('ai')) queries.push(
    env.DB.prepare(`SELECT id,title AS name,approval_status AS status,created_at FROM owner_agent_tasks
      WHERE status='completed' AND approval_status='pending' AND json_valid(output_json)
      AND json_extract(output_json,'$.answer') IS NOT NULL ORDER BY created_at LIMIT ?`).bind(bounded)
      .all().then((rows) => add(rows, 'ai', 'ai_recommendation', 'owner_agent_task', 'ai')));
  await Promise.all(queries);
  items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return items.slice(0, bounded);
}

// Mark-all must cover every actionable record, not just the bounded panel.
// Read receipts are written with INSERT ... SELECT so the badge can reach zero
// without loading thousands of rows into memory or touching record state.
async function markAllManagementNotifications(env, user, categories) {
  const now = new Date().toISOString(), statements = [];
  const add = (sql) => statements.push(env.DB.prepare(sql).bind(user.id, now));
  if (categories.includes('bookings')) add(`INSERT OR IGNORE INTO management_notification_reads(user_id,category,entity_id,read_at)
    SELECT ?, 'bookings', b.id, ? FROM booking_requests b WHERE b.status IN ('received','reviewing')`);
  if (categories.includes('coaches')) add(`INSERT OR IGNORE INTO management_notification_reads(user_id,category,entity_id,read_at)
    SELECT ?, 'coaches', p.id, ? FROM provider_profiles p WHERE p.status='pending'`);
  if (categories.includes('messages')) add(`INSERT OR IGNORE INTO management_notification_reads(user_id,category,entity_id,read_at)
    SELECT ?, 'messages', m.id, ? FROM coach_messages m JOIN coach_connections c ON c.id=m.connection_id
      WHERE m.read_at IS NULL AND c.workspace_status IN ('pending','active')`);
  if (categories.includes('community')) add(`INSERT OR IGNORE INTO management_notification_reads(user_id,category,entity_id,read_at)
    SELECT ?, 'community', rows.id, ? FROM (
      SELECT p.id FROM community_posts p WHERE p.status='pending'
      UNION ALL SELECT c.id FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE c.status='hidden' OR p.status='pending'
      UNION ALL SELECT a.id FROM provider_achievements a WHERE a.status='pending'
    ) AS rows`);
  if (categories.includes('articles')) add(`INSERT OR IGNORE INTO management_notification_reads(user_id,category,entity_id,read_at)
    SELECT ?, 'articles', b.id, ? FROM coach_blog_posts b WHERE b.status='pending'`);
  if (categories.includes('ai')) add(`INSERT OR IGNORE INTO management_notification_reads(user_id,category,entity_id,read_at)
    SELECT ?, 'ai', t.id, ? FROM owner_agent_tasks t
      WHERE t.status='completed' AND t.approval_status='pending' AND json_valid(t.output_json)
        AND json_extract(t.output_json,'$.answer') IS NOT NULL`);
  if (!statements.length) return 0;
  const results = await env.DB.batch(statements);
  return results.reduce((sum, result) => sum + Number(result?.meta?.changes || 0), 0);
}

async function managementDashboard(env, user, permissions) {
  const categories = allowedManagementCategories(user, permissions);
  const [counts, unreadCounts, items, readRows, activity] = await Promise.all([
    managementNotificationCounts(env, categories),
    managementUnreadCounts(env, user, categories),
    managementNotificationItems(env, categories, 50),
    env.DB.prepare("SELECT category,entity_id,read_at FROM management_notification_reads WHERE user_id=?").bind(user.id).all(),
    env.DB.prepare(`SELECT 'moderation' AS source,entity_type,from_status,to_status,created_at FROM moderation_events
      UNION ALL SELECT 'registration','user',NULL,'received',created_at FROM users WHERE role!='admin'
      UNION ALL SELECT 'booking','booking_request',NULL,'received',created_at FROM booking_requests
      UNION ALL SELECT 'application','provider_profile',NULL,status,created_at FROM provider_profiles WHERE status IN ('pending','approved','rejected')
      UNION ALL SELECT 'ai',agent_type,NULL,status,created_at FROM owner_agent_activity
      ORDER BY created_at DESC LIMIT 20`).all(),
  ]);
  const reads = new Map();
  for (const row of readRows.results || []) reads.set(row.category + ':' + row.entity_id, row.read_at);
  const notifications = items.map((item) => ({ ...item, read_at: reads.get(item.id) || null }));
  // The panel is capped; the badge is not. This keeps the bell accurate when
  // there are more than 50 actionable records.
  const unread = Object.values(unreadCounts).reduce((sum, count) => sum + Number(count || 0), 0);
  return {
    counts,
    unreadCounts,
    notifications,
    unread,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    activity: (activity.results || []).map((row) => ({ ...row })),
    generated_at: new Date().toISOString(),
  };
}

async function managementPermissionCodes(env, user) {
  if (!user) return [];
  if (isSuperAdmin(user)) return [...MANAGEMENT_PERMISSION_CODES];
  const row = await env.DB.prepare("SELECT json_group_array(permission_code) AS codes FROM user_management_permissions WHERE user_id=?")
    .bind(user.id).first();
  let codes = [];
  try { codes = JSON.parse(row?.codes || "[]"); } catch { /* fail closed on malformed data */ }
  return Array.isArray(codes) ? codes.filter((code) => MANAGEMENT_PERMISSION_CODES.includes(code)) : [];
}

// The backend is the only source of account type and destination. No login
// form or query parameter can choose a role or grant management access.
async function managementAccess(env, user) {
  const superAdmin = isSuperAdmin(user);
  const adminRole = user.role === "admin";
  const permissions = await managementPermissionCodes(env, user);
  const manager = superAdmin || adminRole || permissions.includes("management.view");
  let accountType = "member", dashboardPath = "/dashboard.html";
  if (manager) {
    accountType = superAdmin ? "admin" : adminRole ? "limited_admin" : "manager";
    dashboardPath = "/admin.html";
  } else if (await isApprovedPacerUser(env, user.id)) {
    accountType = "pacer";
    dashboardPath = "/pacer-dashboard.html";
  } else if (await isApprovedCoach(env, user)) {
    accountType = "provider";
    dashboardPath = "/dashboard.html";
  } else if (user.role === "provider" && !await isMemberAccount(env, user)) {
    accountType = "provider";
    dashboardPath = "/providers.html";
  }
  return {
    user: { id: user.id, email: user.email, role: user.role },
    account_type: accountType,
    super_admin: superAdmin,
    account_status: user.account_status || "active",
    dashboard_path: dashboardPath,
    management: {
      enabled: manager,
      permissions: manager ? permissions : [],
    },
  };
}

async function dashboardOverview(request, env, user) {
  let teams, dashboardRole, coaches = [];
  if (isSuperAdmin(user)) {
    dashboardRole = "admin";
    const rows = await env.DB.prepare(`SELECT t.id,t.name,t.join_code,t.created_at,p.display_name AS coach_name,COUNT(m.user_id) AS member_count
      FROM training_teams t LEFT JOIN training_team_members m ON m.team_id=t.id
      LEFT JOIN provider_profiles p ON p.user_id=t.coach_user_id
      GROUP BY t.id ORDER BY t.created_at DESC LIMIT 200`).all();
    teams = (rows.results || []).map((team) => ({ ...team, is_coach: true, is_admin: true }));
    const coachRows = await env.DB.prepare(`SELECT u.id AS user_id,p.display_name FROM provider_profiles p
      JOIN users u ON u.id=p.user_id WHERE p.status='approved' ORDER BY p.display_name LIMIT 200`).all();
    coaches = coachRows.results || [];
  } else if (await isApprovedCoach(env, user)) {
    dashboardRole = "provider";
    const rows = await env.DB.prepare(`SELECT t.id,t.name,t.join_code,t.created_at,COUNT(m.user_id) AS member_count
      FROM training_teams t LEFT JOIN training_team_members m ON m.team_id=t.id
      WHERE t.coach_user_id=? GROUP BY t.id ORDER BY t.created_at DESC LIMIT 50`).bind(user.id).all();
    teams = (rows.results || []).map((team) => ({ ...team, is_coach: true }));
  } else if (await isMemberAccount(env, user)) {
    dashboardRole = "member";
    const rows = await env.DB.prepare(`SELECT t.id,t.name,t.created_at,m.display_name,m.joined_at
      FROM training_team_members m JOIN training_teams t ON t.id=m.team_id
      WHERE m.user_id=? ORDER BY m.joined_at DESC LIMIT 50`).bind(user.id).all();
    teams = (rows.results || []).map((team) => ({ ...team, is_coach: false }));
  } else {
    return reply(request, env, { error: "dashboard_role_required" }, 403);
  }
  for (const team of teams) {
    const [sessions, messages, members, programs] = await Promise.all([
      env.DB.prepare(`SELECT s.id,s.title,s.description,s.location,s.starts_at,s.status,
        (SELECT COUNT(*) FROM training_completions c WHERE c.session_id=s.id) AS completion_count,
        CASE WHEN mine.user_id IS NULL THEN 0 ELSE 1 END AS completed_by_me
        FROM training_sessions s LEFT JOIN training_completions mine ON mine.session_id=s.id AND mine.user_id=?
        WHERE s.team_id=? AND s.status!='cancelled' ORDER BY s.starts_at DESC LIMIT 40`).bind(user.id, team.id).all(),
      env.DB.prepare("SELECT id,body,created_at FROM training_messages WHERE team_id=? ORDER BY created_at DESC LIMIT 30").bind(team.id).all(),
      team.is_coach
        ? env.DB.prepare("SELECT user_id,display_name,joined_at FROM training_team_members WHERE team_id=? ORDER BY display_name LIMIT 200").bind(team.id).all()
        : Promise.resolve(null),
      team.is_coach
        ? env.DB.prepare(`SELECT p.id,p.athlete_user_id,p.week_start,p.coach_note,p.created_at,m.display_name AS athlete_name
            FROM athlete_programs p JOIN training_team_members m ON m.team_id=p.team_id AND m.user_id=p.athlete_user_id
            WHERE p.team_id=? ORDER BY p.week_start DESC LIMIT 60`).bind(team.id).all()
        : env.DB.prepare(`SELECT p.id,p.athlete_user_id,p.week_start,p.coach_note,p.created_at,m.display_name AS athlete_name
            FROM athlete_programs p JOIN training_team_members m ON m.team_id=p.team_id AND m.user_id=p.athlete_user_id
            WHERE p.team_id=? AND p.athlete_user_id=? ORDER BY p.week_start DESC LIMIT 30`).bind(team.id,user.id).all(),
    ]);
    team.sessions = sessions.results || [];
    team.messages = messages.results || [];
    if (team.is_coach) team.members = members?.results || [];
    const teamPrograms = programs.results || [];
    const sessionRows = await Promise.all(teamPrograms.map((program) => env.DB.prepare(`SELECT s.id,s.session_code,s.day_key,s.session_type,s.details,s.planned_km,
        c.completed_at,c.actual_km,c.duration_minutes
      FROM athlete_program_sessions s LEFT JOIN athlete_program_completions c
        ON c.session_id=s.id AND c.athlete_user_id=?
      WHERE s.program_id=? ORDER BY s.sort_order`).bind(program.athlete_user_id, program.id).all()));
    team.programs = teamPrograms.map((program, index) => ({ ...program, sessions: sessionRows[index].results || [] }));
  }
  let programRows;
  if (dashboardRole === "admin") {
    programRows = await env.DB.prepare(`SELECT p.*,u.email AS athlete_email FROM athlete_programs_v2 p LEFT JOIN users u ON u.id=p.athlete_user_id ORDER BY p.week_start DESC LIMIT 300`).all();
  } else if (dashboardRole === "provider") {
    programRows = await env.DB.prepare(`SELECT p.*,u.email AS athlete_email FROM athlete_programs_v2 p LEFT JOIN users u ON u.id=p.athlete_user_id WHERE p.coach_user_id=? ORDER BY p.week_start DESC LIMIT 200`).bind(user.id).all();
  } else {
    programRows = await env.DB.prepare(`SELECT p.*,u.email AS athlete_email FROM athlete_programs_v2 p LEFT JOIN users u ON u.id=p.athlete_user_id WHERE p.athlete_user_id=? ORDER BY p.week_start DESC LIMIT 100`).bind(user.id).all();
  }
  const allPrograms = programRows.results || [];
  const sessionRows = await Promise.all(allPrograms.map((program) => env.DB.prepare(`SELECT s.id,s.session_code,s.day_key,s.sport_type,s.details,s.session_date,c.completed_at,c.actual_km,c.duration_minutes
      FROM athlete_program_sessions_v2 s LEFT JOIN athlete_program_completions_v2 c
        ON c.session_id=s.id AND c.athlete_user_id=?
      WHERE s.program_id=? ORDER BY s.sort_order`).bind(program.athlete_user_id, program.id).all()));
  const programs = allPrograms.map((program, index) => ({ ...program, sessions: sessionRows[index].results || [] }));
  let connectedCoaches = [];
  if (dashboardRole === "member") {
    const rows = await env.DB.prepare(`SELECT c.id,c.status,c.workspace_status,p.display_name,p.city,p.provider_type
      FROM coach_connections c JOIN provider_profiles p ON p.user_id=c.coach_user_id
      WHERE c.athlete_user_id=? ORDER BY c.updated_at DESC LIMIT 20`).bind(user.id).all();
    connectedCoaches = rows.results || [];
  }
  return reply(request, env, { role: dashboardRole, teams, programs, connectedCoaches, ...(dashboardRole === "admin" ? { coaches } : {}) });
}

async function canManageTeam(env, user, teamId) {
  if (isSuperAdmin(user)) return Boolean(await env.DB.prepare("SELECT id FROM training_teams WHERE id=?").bind(teamId).first());
  if (!await isApprovedCoach(env, user)) return false;
  return Boolean(await env.DB.prepare("SELECT id FROM training_teams WHERE id=? AND coach_user_id=?").bind(teamId,user.id).first());
}

async function dashboardApi(request, env, user) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method === "GET" && path === "/api/dashboard") return dashboardOverview(request, env, user);
  if (path === "/api/dashboard/wellness" || path.startsWith("/api/dashboard/wellness/")) return wellnessApi(request,env,user,reply,readJson,isMemberAccount);
  if (path === "/api/dashboard/coach-library" || path.startsWith("/api/dashboard/coach-library/")) return coachLibraryApi(request, env, user, reply, readJson);
  if (path === "/api/dashboard/program-draft") {
    if (request.method === "PUT") {
      const body = await readJson(request);
      await env.DB.prepare(`INSERT INTO program_drafts(user_id,payload_json,updated_at) VALUES(?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
        .bind(user.id, JSON.stringify(body?.payload || {}), new Date().toISOString()).run();
      return reply(request, env, { saved: true });
    }
    const row = await env.DB.prepare("SELECT payload_json,updated_at FROM program_drafts WHERE user_id=?").bind(user.id).first();
    return reply(request, env, { draft: row ? safeParse(row.payload_json) : null, updated_at: row?.updated_at || null });
  }
  if (path === "/api/dashboard/notification-preferences") {
    const prefs = await userNotificationPreferences(env, user.id);
    if (request.method === "PATCH") {
      const body = await readJson(request);
      const email = body?.email_enabled === undefined ? prefs.email_enabled : Number(body.email_enabled === true || body.email_enabled === 1);
      const dashboard = body?.dashboard_enabled === undefined ? prefs.dashboard_enabled : Number(body.dashboard_enabled === true || body.dashboard_enabled === 1);
      await env.DB.prepare(`INSERT INTO user_notification_preferences(user_id,email_enabled,dashboard_enabled,updated_at)
        VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email_enabled=excluded.email_enabled,dashboard_enabled=excluded.dashboard_enabled,updated_at=excluded.updated_at`)
        .bind(user.id, email, dashboard, new Date().toISOString()).run();
      return reply(request, env, { email_enabled: Boolean(email), dashboard_enabled: Boolean(dashboard) });
    }
    return reply(request, env, { email_enabled: Boolean(prefs.email_enabled), dashboard_enabled: Boolean(prefs.dashboard_enabled) });
  }
  if (path === "/api/dashboard/athletes" && request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT c.id,c.status,c.workspace_status,c.created_at,c.updated_at,c.athlete_accepted_at,
        a.display_name,a.city,a.sports_json,a.preferred_language,a.photo_updated_at,
        (SELECT COUNT(*) FROM athlete_programs_v2 p WHERE p.athlete_user_id=c.athlete_user_id AND p.coach_user_id=c.coach_user_id) AS program_count,
        (SELECT MAX(cp.completed_at) FROM athlete_program_completions_v2 cp
          JOIN athlete_program_sessions_v2 s ON s.id=cp.session_id
          JOIN athlete_programs_v2 p ON p.id=s.program_id AND p.coach_user_id=c.coach_user_id
          WHERE cp.athlete_user_id=c.athlete_user_id) AS last_activity_at
      FROM coach_connections c LEFT JOIN member_sports_profiles a ON a.user_id=c.athlete_user_id
      WHERE c.coach_user_id=? ORDER BY c.updated_at DESC LIMIT 100`).bind(user.id).all();
    const athletes = (rows.results || []).map(row => ({
      ...row, sports: safeParse(row.sports_json) || [],
      bucket: row.status === "pending" ? "pending" : row.workspace_status === "closed" ? "completed" : row.status === "accepted" ? "active" : "completed",
    }));
    return reply(request, env, {
      athletes,
      counts: {
        pending: athletes.filter(a => a.bucket === "pending").length,
        active: athletes.filter(a => a.bucket === "active").length,
        completed: athletes.filter(a => a.bucket === "completed").length,
      },
    });
  }
  const programSendMatch = /^\/api\/dashboard\/programs\/([\w-]{36})\/send$/.exec(path);
  if (programSendMatch && request.method === "POST") {
    const sendAuth = await authenticated(request, env);
    if (sendAuth.response) return sendAuth.response;
    const body = await readJson(request);
    const channel = text(body?.channel, 20) || "mzactive";
    const athleteId = text(body?.athlete_user_id, 36);
    const recipientEmail = emailValue(body?.recipient_email);
    const recipientPhone = text(body?.recipient_phone, 32);
    const now = new Date().toISOString();
    const programId = programSendMatch[1];
    if (athleteId) {
      const allowed = await env.DB.prepare(`SELECT 1 FROM coach_connections
        WHERE coach_user_id=? AND athlete_user_id=? AND status='accepted'`).bind(sendAuth.user.id, athleteId).first();
      if (!allowed) return reply(request, env, { error: "athlete_not_connected" }, 403);
      const updated = await env.DB.prepare(`UPDATE athlete_programs_v2 SET athlete_user_id=?,sent_at=?,
        athlete_name=COALESCE((SELECT display_name FROM member_sports_profiles WHERE user_id=?),athlete_name)
        WHERE id=? AND coach_user_id=? AND sent_at IS NULL`)
        .bind(athleteId, now, athleteId, programId, sendAuth.user.id).run();
      if (!updated.meta.changes) return reply(request, env, { error: "program_already_sent_or_missing" }, 409);
      const href = `/dashboard.html?program=${programId}#athleteProgramHistory`;
      await createNotification(env, athleteId, "program_assigned", "New training program", "Your coach sent you a training program.", "training_program", programId, href);
      if (channel !== "whatsapp") {
        const athleteUser = await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(athleteId).first();
        await queueCoachEmail(env, {
          eventKey: `program_sent:${programId}`,
          to: recipientEmail || athleteUser?.email || "",
          subject: "New training program on MZ Active",
          body: `Your coach sent you a training program on MZ Active.\n\nOpen it here: https://mzactive.com${href}`,
        });
      }
      return reply(request, env, { sent: true, program_id: programId, sent_at: now, href, channel });
    }
    if (channel === "email" && recipientEmail) {
      const updated = await env.DB.prepare(`UPDATE athlete_programs_v2 SET sent_at=?
        WHERE id=? AND coach_user_id=? AND sent_at IS NULL`).bind(now, programId, sendAuth.user.id).run();
      if (!updated.meta.changes) return reply(request, env, { error: "program_already_sent_or_missing" }, 409);
      const href = `/dashboard.html?program=${programId}#athleteProgramHistory`;
      await queueCoachEmail(env, {
        eventKey: `program_sent_external:${programId}:${recipientEmail}`,
        to: recipientEmail,
        subject: "Training program from your MZ Active coach",
        body: `Your coach sent you a training program on MZ Active.\n\nOpen MZ Active to view it: https://mzactive.com/dashboard.html#loginForm`,
      });
      return reply(request, env, { sent: true, program_id: programId, sent_at: now, href, channel, recipient_email: recipientEmail });
    }
    if (channel === "whatsapp" && recipientPhone) {
      const updated = await env.DB.prepare(`UPDATE athlete_programs_v2 SET sent_at=?
        WHERE id=? AND coach_user_id=? AND sent_at IS NULL`).bind(now, programId, sendAuth.user.id).run();
      if (!updated.meta.changes) return reply(request, env, { error: "program_already_sent_or_missing" }, 409);
      return reply(request, env, { sent: true, program_id: programId, sent_at: now, channel, recipient_phone: recipientPhone, whatsapp_url: `https://wa.me/${recipientPhone.replace(/\D/g, "")}?text=${encodeURIComponent("Training program from your MZ Active coach: https://mzactive.com/dashboard.html#loginForm")}` });
    }
    return reply(request, env, { error: "athlete_required" }, 400);
  }
const PROGRAM_ATHLETE_TYPES = new Set(["runner","triathlon","running","cycling","swimming","fitness","strength","bodybuilding","hyrox","crossfit","general","running_strength","swim_bike"]);
function addDays(iso, days) { const d=new Date(iso+"T00:00:00Z"); if(!Number.isFinite(d.getTime())) return null; d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
function addMonths(iso, months) { const d=new Date(iso+"T00:00:00Z"); if(!Number.isFinite(d.getTime())) return null; d.setUTCMonth(d.getUTCMonth()+months); d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); }
function prepareProgram(body) {
  const days=["monday","tuesday","wednesday","thursday","friday","saturday","sunday"], sports=new Set(["run","bike","swim","strength","recovery","other"]);
  const athleteType=text(body?.athlete_type,30);
  if (!PROGRAM_ATHLETE_TYPES.has(athleteType)) return null;
  const unit=["days","weeks","months"].includes(body?.duration_unit) ? body.duration_unit : "weeks";
  const value=Math.max(1, Math.min(36, Number(body?.duration_value)||1));
  const startDate=text(body?.start_date || body?.week_start,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(startDate+"T00:00:00Z"))) return null;
  const endDate = unit === "days" ? addDays(startDate, value-1) : unit === "weeks" ? addDays(startDate, value*7-1) : addMonths(startDate, value);
  if (!endDate) return null;
  const weekSources = Array.isArray(body?.weeks) && body.weeks.length
    ? body.weeks
    : [{ week_start: text(body?.week_start || startDate,10), sessions: Array.isArray(body?.sessions) ? body.sessions : [] }];
  const sessions=[];
  for (const week of weekSources) {
    const weekStart=text(week?.week_start,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !Number.isFinite(Date.parse(weekStart+"T00:00:00Z"))) return null;
    for (const item of Array.isArray(week?.sessions) ? week.sessions : []) {
      const dayKey=item?.day_key, sport=item?.sport_type;
      const details = item?.details;
      const studioDetails = typeof details === "string" && /^[^\n]+\n\[MZ:\{[^\n]*"exerciseLength":\d+\}\]\n/.test(details);
      if (!days.includes(dayKey) || !sports.has(sport) || !text(details,1600) || (studioDetails && details.length > 1600)) return null;
      const sessionDate=text(item?.session_date,10) || addDays(weekStart, days.indexOf(dayKey));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || sessionDate < startDate || sessionDate > endDate) return null;
      sessions.push({ day_key:dayKey, sport_type:sport, details:studioDetails?details:text(details,1600), session_date:sessionDate });
    }
  }
  if (!sessions.length || sessions.length > 500) return null;
  return { athleteType, unit, value, startDate, endDate, weekStart: weekSources[0].week_start, sessions };
}

  if (path === "/api/dashboard/programs" && request.method === "POST") {
    const admin=isSuperAdmin(user);
    if(!admin&&!await isApprovedCoach(env,user))return reply(request,env,{error:"approved_coach_required"},403);
    const body=await readJson(request), prepared=prepareProgram(body);
    const athleteName=text(body?.athlete_name,80),athletePhone=normalizeWhatsApp(body?.athlete_phone||"");
    if(!prepared||!athleteName||!athletePhone)return reply(request,env,{error:"invalid_flexible_program"},400);
    const teamId=text(body?.team_id,36)||null,athleteId=text(body?.athlete_user_id,36)||null;
    const id=randomId(),now=new Date().toISOString(),codes=[],statements=[
      env.DB.prepare(`INSERT INTO athlete_programs_v2(id,coach_user_id,team_id,athlete_user_id,athlete_name,athlete_phone,athlete_type,week_start,coach_note,created_at,source,duration_value,duration_unit,start_date,end_date,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'coach',?,?,?,?,?)`)
        .bind(id,user.id,teamId,athleteId,athleteName,athletePhone,prepared.athleteType,prepared.weekStart,text(body?.coach_note,1200),now,
          prepared.value,prepared.unit,prepared.startDate,prepared.endDate,now),
    ];
    prepared.sessions.forEach((item,index)=>{
      const prefix=(item.day_key.slice(0,3)+"-"+item.sport_type.slice(0,1)).toUpperCase();
      const count=codes.filter(code=>code.startsWith(prefix)).length+1,code=prefix+String(count).padStart(2,"0"),sessionId=randomId();
      codes.push(code);
      statements.push(env.DB.prepare(`INSERT INTO athlete_program_sessions_v2(id,program_id,session_code,day_key,sport_type,details,sort_order,session_date)
        VALUES(?,?,?,?,?,?,?,?)`).bind(sessionId,id,code,item.day_key,item.sport_type,item.details,index,item.session_date));
    });
    await env.DB.batch(statements);
    return reply(request,env,{id,week_start:prepared.weekStart,start_date:prepared.startDate,end_date:prepared.endDate,duration_value:prepared.value,duration_unit:prepared.unit,athlete_name:athleteName,athlete_type:prepared.athleteType,session_codes:codes,status:"saved"},201);
  }
  const programUpdateMatch=/^\/api\/dashboard\/programs\/([\w-]{36})$/.exec(path);
  if (programUpdateMatch && request.method === "PATCH") {
    if (!await isApprovedCoach(env,user)) return reply(request,env,{error:"approved_coach_required"},403);
    const existing=await env.DB.prepare("SELECT id FROM athlete_programs_v2 WHERE id=? AND coach_user_id=?").bind(programUpdateMatch[1],user.id).first();
    if(!existing)return reply(request,env,{error:"program_not_found"},404);
    const body=await readJson(request),prepared=prepareProgram(body);
    if(!prepared)return reply(request,env,{error:"invalid_flexible_program"},400);
    const now=new Date().toISOString(),codes=[],statements=[
      env.DB.prepare(`UPDATE athlete_programs_v2 SET athlete_type=?,week_start=?,coach_note=?,duration_value=?,duration_unit=?,start_date=?,end_date=?,updated_at=? WHERE id=? AND coach_user_id=?`)
        .bind(prepared.athleteType,prepared.weekStart,text(body?.coach_note,1200),prepared.value,prepared.unit,prepared.startDate,prepared.endDate,now,existing.id,user.id),
      env.DB.prepare("DELETE FROM athlete_program_sessions_v2 WHERE program_id=?").bind(existing.id),
    ];
    prepared.sessions.forEach((item,index)=>{
      const prefix=(item.day_key.slice(0,3)+"-"+item.sport_type.slice(0,1)).toUpperCase();
      const count=codes.filter(code=>code.startsWith(prefix)).length+1,code=prefix+String(count).padStart(2,"0"),sessionId=randomId();
      codes.push(code);
      statements.push(env.DB.prepare(`INSERT INTO athlete_program_sessions_v2(id,program_id,session_code,day_key,sport_type,details,sort_order,session_date)
        VALUES(?,?,?,?,?,?,?,?)`).bind(sessionId,existing.id,code,item.day_key,item.sport_type,item.details,index,item.session_date));
    });
    await env.DB.batch(statements);
    return reply(request,env,{id:existing.id,start_date:prepared.startDate,end_date:prepared.endDate,duration_value:prepared.value,duration_unit:prepared.unit,session_codes:codes,status:"updated"});
  }
  if (request.method === "POST" && path === "/api/dashboard/assistant") return coachAssistant(request, env, user);
  if ((request.method === "GET" || request.method === "POST") && path === "/api/dashboard/blog") {
    if (!await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    if (request.method === "GET") {
      const posts = await env.DB.prepare("SELECT id,title,summary,body,language,status,created_at,published_at FROM coach_blog_posts WHERE coach_user_id=? ORDER BY created_at DESC LIMIT 50").bind(user.id).all();
      return reply(request, env, { posts: posts.results || [] });
    }
    const body = await readJson(request), title = text(body?.title, 120), summary = text(body?.summary, 400), content = text(body?.body, 8000), language = body?.language === "ar" ? "ar" : "en";
    if (!body || !title || !summary || !content || content.length < 100) return reply(request, env, { error: "blog_fields_required" }, 400);
    const profile = await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=? AND status='approved'").bind(user.id).first();
    if (!profile) return reply(request, env, { error: "approved_coach_required" }, 403);
    const id = randomId(), now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO coach_blog_posts(id,coach_user_id,provider_id,title,summary,body,language,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending',?,?)")
      .bind(id,user.id,profile.id,title,summary,content,language,now,now).run();
    return reply(request, env, { id, status: "pending", message: "submitted_for_review" }, 201);
  }
  const coachBlogEdit = /^\/api\/dashboard\/blog\/([\w-]{36})$/.exec(path);
  if (coachBlogEdit && request.method === "PUT") {
    if (!await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await readJson(request), title = text(body?.title, 120), summary = text(body?.summary, 400), content = text(body?.body, 8000), language = body?.language === "ar" ? "ar" : "en";
    if (!body || !title || !summary || !content || content.length < 100) return reply(request, env, { error: "blog_fields_required" }, 400);
    const now = new Date().toISOString();
    const result = await env.DB.prepare("UPDATE coach_blog_posts SET title=?,summary=?,body=?,language=?,status='pending',updated_at=? WHERE id=? AND coach_user_id=? AND status='draft'")
      .bind(title,summary,content,language,now,coachBlogEdit[1],user.id).run();
    return result.meta?.changes
      ? reply(request, env, { id: coachBlogEdit[1], status: "pending", message: "submitted_for_review" })
      : reply(request, env, { error: "draft_not_found" }, 404);
  }

  if (request.method === "POST" && path === "/api/dashboard/teams") {
    const admin = isSuperAdmin(user);
    if (!admin && !await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    if (!await rateLimit(request, env, "dashboard-team", 5)) return reply(request, env, { error: "rate_limited" }, 429);
    const body = await readJson(request), name = text(body?.name, 80);
    if (!body || !name) return reply(request, env, { error: "team_name_required" }, 400);
    const coachUserId = admin ? text(body.coach_user_id, 36) : user.id;
    if (!coachUserId || (admin && !await env.DB.prepare("SELECT user_id FROM provider_profiles WHERE user_id=? AND status='approved'").bind(coachUserId).first())) return reply(request, env, { error: "approved_coach_required" }, 403);
    const now = new Date().toISOString(), id = randomId();
    let joinCode = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      joinCode = newJoinCode();
      try {
        await env.DB.prepare("INSERT INTO training_teams(id,coach_user_id,name,join_code,created_at) VALUES(?,?,?,?,?)").bind(id,coachUserId,name,joinCode,now).run();
        break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
    return reply(request, env, { id, name, join_code: joinCode, created_at: now }, 201);
  }

  if (request.method === "POST" && path === "/api/dashboard/teams/join") {
    if (!await isMemberAccount(env, user)) return reply(request, env, { error: "member_account_required" }, 403);
    const body = await readJson(request), code = text(body?.join_code, 24).replace(/[\s-]/g, "").toUpperCase(), displayName = text(body?.display_name, 80);
    if (!body || !/^[2-9A-HJ-NP-Z]{8}$/.test(code) || !displayName) return reply(request, env, { error: "join_code_and_name_required" }, 400);
    const team = await env.DB.prepare("SELECT id,name FROM training_teams WHERE join_code=?").bind(code).first();
    if (!team) return reply(request, env, { error: "invalid_join_code" }, 404);
    await env.DB.prepare("INSERT INTO training_team_members(team_id,user_id,display_name,joined_at) VALUES(?,?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET display_name=excluded.display_name")
      .bind(team.id,user.id,displayName,new Date().toISOString()).run();
    return reply(request, env, { team_id: team.id, team_name: team.name });
  }

  if (request.method === "POST" && path === "/api/dashboard/sessions") {
    if (!isSuperAdmin(user) && !await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await readJson(request), teamId = text(body?.team_id, 36), title = text(body?.title, 120), startsAt = text(body?.starts_at, 40);
    if (!body || !teamId || !title || !startsAt || !Number.isFinite(Date.parse(startsAt))) return reply(request, env, { error: "invalid_training_session" }, 400);
    if (!await canManageTeam(env, user, teamId)) return reply(request, env, { error: "team_not_found" }, 404);
    const now = new Date().toISOString(), id = randomId();
    await env.DB.prepare("INSERT INTO training_sessions(id,team_id,title,description,location,starts_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'scheduled',?,?)")
      .bind(id,teamId,title,text(body.description,500),text(body.location,120),new Date(startsAt).toISOString(),now,now).run();
    return reply(request, env, { id, status: "scheduled" }, 201);
  }

  if (request.method === "POST" && path === "/api/dashboard/messages") {
    if (!isSuperAdmin(user) && !await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await readJson(request), teamId = text(body?.team_id, 36), message = text(body?.body, 1000);
    if (!body || !teamId || !message) return reply(request, env, { error: "team_and_message_required" }, 400);
    if (!await canManageTeam(env, user, teamId)) return reply(request, env, { error: "team_not_found" }, 404);
    const id = randomId(), now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO training_messages(id,team_id,coach_user_id,body,created_at) VALUES(?,?,?,?,?)").bind(id,teamId,user.id,message,now).run();
    return reply(request, env, { id, created_at: now }, 201);
  }

  const sessionMatch = /^\/api\/dashboard\/sessions\/([\w-]{36})$/.exec(path);
  if (sessionMatch && request.method === "PATCH") {
    if (!isSuperAdmin(user) && !await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await readJson(request), status = body?.status;
    if (!body || !["scheduled","completed","cancelled"].includes(status)) return reply(request, env, { error: "invalid_session_status" }, 400);
    const session = isSuperAdmin(user)
      ? await env.DB.prepare("SELECT id FROM training_sessions WHERE id=?").bind(sessionMatch[1]).first()
      : await env.DB.prepare("SELECT s.id FROM training_sessions s JOIN training_teams t ON t.id=s.team_id WHERE s.id=? AND t.coach_user_id=?").bind(sessionMatch[1],user.id).first();
    if (!session) return reply(request, env, { error: "session_not_found" }, 404);
    await env.DB.prepare("UPDATE training_sessions SET status=?,updated_at=? WHERE id=?").bind(status,new Date().toISOString(),session.id).run();
    return reply(request, env, { updated: true, status });
  }

  const programComplete = /^\/api\/dashboard\/program-sessions\/([\w-]{36})\/complete$/.exec(path);
  if(programComplete&&request.method==="POST"){
    if(!await isMemberAccount(env,user))return reply(request,env,{error:"member_account_required"},403);
    const body=await readJson(request),sid=programComplete[1];
    const flex=await env.DB.prepare(`SELECT s.id FROM athlete_program_sessions_v2 s JOIN athlete_programs_v2 p ON p.id=s.program_id WHERE s.id=? AND p.athlete_user_id=?`).bind(sid,user.id).first();
    const legacy=flex?null:await env.DB.prepare(`SELECT s.id FROM athlete_program_sessions s JOIN athlete_programs p ON p.id=s.program_id WHERE s.id=? AND p.athlete_user_id=?`).bind(sid,user.id).first();
    const session=flex||legacy;if(!session)return reply(request,env,{error:"session_unavailable"},404);
    const table=flex?"athlete_program_completions_v2":"athlete_program_completions";
    if(body?.completed===false){await env.DB.prepare(`DELETE FROM ${table} WHERE session_id=? AND athlete_user_id=?`).bind(session.id,user.id).run();return reply(request,env,{completed:false})}
    const km=body?.actual_km===undefined?0:Number(body.actual_km),minutes=body?.duration_minutes===undefined?0:Number(body.duration_minutes);
    if(!Number.isFinite(km)||km<0||km>500||!Number.isInteger(minutes)||minutes<0||minutes>720)return reply(request,env,{error:"invalid_session_log"},400);
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO ${table}(session_id,athlete_user_id,completed_at,actual_km,duration_minutes) VALUES(?,?,?,?,?)
      ON CONFLICT(session_id,athlete_user_id) DO UPDATE SET completed_at=excluded.completed_at,actual_km=excluded.actual_km,duration_minutes=excluded.duration_minutes`)
      .bind(session.id,user.id,now,km,minutes).run();
    return reply(request,env,{completed:true,actual_km:km,duration_minutes:minutes});
  }

  const completeMatch = /^\/api\/dashboard\/sessions\/([\w-]{36})\/complete$/.exec(path);
  if (completeMatch && request.method === "POST") {
    if (!await isMemberAccount(env, user)) return reply(request, env, { error: "member_account_required" }, 403);
    const session = await env.DB.prepare(`SELECT s.id FROM training_sessions s JOIN training_team_members m ON m.team_id=s.team_id
      WHERE s.id=? AND m.user_id=? AND s.status!='cancelled' AND s.starts_at<=?`).bind(completeMatch[1],user.id,new Date().toISOString()).first();
    if (!session) return reply(request, env, { error: "session_unavailable" }, 404);
    await env.DB.prepare("INSERT INTO training_completions(session_id,user_id,completed_at) VALUES(?,?,?) ON CONFLICT(session_id,user_id) DO NOTHING")
      .bind(session.id,user.id,new Date().toISOString()).run();
    return reply(request, env, { completed: true });
  }
  return reply(request, env, { error: "not_found" }, 404);
}

const ATHLETE_CRM_SELECT = `SELECT u.id,u.email,u.created_at AS registered_at,
  ms.display_name,ms.city,ms.sports_json,ms.experience_level,ms.goals,ms.age_range,ms.gender,
  ms.garmin_public_url,ms.preferred_language,ms.availability_notes,ms.updated_at AS profile_updated_at,
  (SELECT MAX(c.updated_at) FROM coach_connections c JOIN provider_profiles cp ON cp.user_id=c.coach_user_id
    WHERE c.athlete_user_id=u.id AND cp.status='approved' AND cp.provider_type='coach') AS connection_updated_at,
  (SELECT MAX(created_at) FROM athlete_programs_v2 WHERE athlete_user_id=u.id) AS program_created_at,
  (SELECT MAX(created_at) FROM booking_requests WHERE customer_user_id=u.id) AS booking_created_at,
  (SELECT MAX(m.created_at) FROM coach_messages m JOIN coach_connections c ON c.id=m.connection_id
    WHERE c.athlete_user_id=u.id) AS message_created_at,
  (SELECT MAX(created_at) FROM athlete_crm_invitations WHERE athlete_user_id=u.id) AS invitation_created_at,
  (SELECT COUNT(*) FROM athlete_programs_v2 WHERE athlete_user_id=u.id) AS program_count,
  (SELECT COUNT(*) FROM booking_requests WHERE customer_user_id=u.id) AS booking_count,
  (SELECT COUNT(*) FROM coach_connections c JOIN provider_profiles cp ON cp.user_id=c.coach_user_id
    WHERE c.athlete_user_id=u.id AND c.status='accepted' AND c.workspace_status='active'
      AND cp.status='approved' AND cp.provider_type='coach') AS assigned_coach_count,
  (SELECT COUNT(*) FROM athlete_crm_invitations WHERE athlete_user_id=u.id AND status='pending') AS pending_invite_count,
  (SELECT cp.display_name FROM coach_connections c JOIN provider_profiles cp ON cp.user_id=c.coach_user_id
    WHERE c.athlete_user_id=u.id AND c.status='accepted' AND c.workspace_status='active'
      AND cp.status='approved' AND cp.provider_type='coach' ORDER BY c.updated_at DESC LIMIT 1) AS assigned_coach_name
  FROM users u LEFT JOIN member_sports_profiles ms ON ms.user_id=u.id
  WHERE u.role='provider' AND (u.account_status IS NULL OR u.account_status<>'deleted')
    AND NOT EXISTS(SELECT 1 FROM provider_profiles p WHERE p.user_id=u.id)`;

function shapeAthleteRow(row) {
  const sports = safeParse(row.sports_json);
  const profile = { ...row, sports };
  const lastActivity = lastActivityAt(row);
  const assigned = Number(row.assigned_coach_count || 0) > 0;
  return {
    ...row,
    sports,
    name: row.display_name || String(row.email || "").split("@")[0] || "MZ Active member",
    onboarding_incomplete: onboardingIncomplete(profile),
    last_activity_at: lastActivity,
    active: isActive(row),
    assigned,
    assignment_status: assigned ? "assigned" : Number(row.pending_invite_count || 0) > 0 ? "invitation_pending" : "unassigned",
  };
}

async function athleteCrmRows(env, suffix = "", params = []) {
  // D1 bind() returns a new prepared statement; it does not mutate the original.
  const statement = params.length
    ? env.DB.prepare(ATHLETE_CRM_SELECT + suffix).bind(...params)
    : env.DB.prepare(ATHLETE_CRM_SELECT + suffix);
  const result = await statement.all();
  return (result.results || []).map(shapeAthleteRow);
}

async function athleteCrmById(env, athleteId) {
  const rows = await athleteCrmRows(env, " AND u.id=?", [athleteId]);
  return rows[0] || null;
}

async function athleteCrmDirectory(env, options = {}) {
  const rows = await athleteCrmRows(env);
  const q = text(options.q, 80).toLowerCase();
  const searched = q ? rows.filter((row) => [
    row.name, row.email, row.city, row.assigned_coach_name,
    (row.sports || []).join(" "), row.goals,
  ].some((value) => String(value || "").toLowerCase().includes(q))) : rows;
  const counts = {
    all: searched.length,
    unassigned: searched.filter((row) => !row.assigned).length,
    assigned: searched.filter((row) => row.assigned).length,
    active: searched.filter((row) => row.active).length,
    inactive: searched.filter((row) => !row.active).length,
    onboarding_incomplete: searched.filter((row) => row.onboarding_incomplete).length,
  };
  const filter = ["all", "unassigned", "assigned", "active", "inactive", "onboarding_incomplete"].includes(options.filter) ? options.filter : "all";
  let filtered = searched;
  if (filter === "unassigned") filtered = searched.filter((row) => !row.assigned);
  if (filter === "assigned") filtered = searched.filter((row) => row.assigned);
  if (filter === "active") filtered = searched.filter((row) => row.active);
  if (filter === "inactive") filtered = searched.filter((row) => !row.active);
  if (filter === "onboarding_incomplete") filtered = searched.filter((row) => row.onboarding_incomplete);
  const sort = ["recent", "name", "status"].includes(options.sort) ? options.sort : "recent";
  filtered = [...filtered].sort((a, b) => {
    if (sort === "name") return String(a.name).localeCompare(String(b.name));
    if (sort === "status") return Number(b.assigned) - Number(a.assigned) || Number(b.onboarding_incomplete) - Number(a.onboarding_incomplete);
    return String(b.last_activity_at || "").localeCompare(String(a.last_activity_at || ""));
  });
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
  const offset = Math.max(Number(options.offset) || 0, 0);
  return { athletes: filtered.slice(offset, offset + limit), total: filtered.length, counts, filter, sort, q };
}

async function recordAthleteCrmEvent(env, athleteId, actorId, action, entityType = "", entityId = "", details = {}) {
  await env.DB.prepare(`INSERT INTO athlete_crm_events(id,athlete_user_id,actor_user_id,action,entity_type,entity_id,details_json,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(randomId(), athleteId, actorId || null, action, text(entityType, 40), text(entityId, 36),
      JSON.stringify(details || {}), new Date().toISOString()).run();
}

async function markCrmEmail(env, invitationId, status) {
  await env.DB.prepare("UPDATE athlete_crm_invitations SET email_status=?,status=CASE WHEN ?='sent' AND status='email_failed' THEN 'pending' WHEN ?='failed' THEN 'email_failed' ELSE status END,updated_at=? WHERE id=?")
    .bind(status, status, status, new Date().toISOString(), invitationId).run();
}

async function sendAthleteCrmInvitation(env, invitation, athlete, token, coachName) {
  if (!emailDeliveryConfigured(env)) {
    await markCrmEmail(env, invitation.id, "failed");
    return false;
  }
  const message = invitationEmail(invitation.kind, {
    athleteName: athlete.name,
    coachName: coachName || invitation.coach_name || "",
    language: invitation.language,
  }, token);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [athlete.email], subject: message.subject, html: message.html, text: message.text }),
    });
    if (!response.ok) throw new Error("email_delivery_failed");
    await markCrmEmail(env, invitation.id, "sent");
    return true;
  } catch {
    await markCrmEmail(env, invitation.id, "failed");
    return false;
  }
}

async function revokeActiveAthleteAssignment(env, athleteId, actorId, action = "coach_revoked") {
  const active = await env.DB.prepare(`SELECT c.id,c.coach_user_id,c.booking_id,p.display_name AS coach_name
    FROM coach_connections c JOIN provider_profiles p ON p.user_id=c.coach_user_id
    WHERE c.athlete_user_id=? AND c.status='accepted' AND c.workspace_status='active'
      AND p.status='approved' AND p.provider_type='coach' ORDER BY c.updated_at DESC LIMIT 1`).bind(athleteId).first();
  if (!active) return null;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE coach_connections SET status='declined',workspace_status='closed',updated_at=? WHERE id=?").bind(now, active.id),
    env.DB.prepare("UPDATE athlete_crm_invitations SET status='revoked',updated_at=? WHERE connection_id=? AND status='pending'").bind(now, active.id),
    env.DB.prepare(`INSERT INTO athlete_crm_events(id,athlete_user_id,actor_user_id,action,entity_type,entity_id,details_json,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(randomId(), athleteId, actorId || null, action, "coach_connection", active.id, JSON.stringify({ coach_user_id: active.coach_user_id }), now),
  ]);
  await createNotification(env, active.coach_user_id, "connection_reviewed", "Coaching workspace closed",
    "A manager closed a coaching workspace. No athlete details were shared.", "coach_connection", active.id);
  return active;
}

function newInvitationToken() {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}

async function createAthleteCrmInvitation(request, env, manager, athleteId, kind, options = {}) {
  const body = await readJson(request);
  if (!body) return { response: reply(request, env, { error: "invalid_invitation" }, 400) };
  if (!await collectionEnabled(env)) return { response: reply(request, env, { error: "intake_paused" }, 503) };
  if (!await rateLimit(request, env, "athlete-crm-invite", ATHLETE_CRM_INVITE_LIMIT)) return { response: reply(request, env, { error: "rate_limited" }, 429) };
  const athlete = await athleteCrmById(env, athleteId);
  if (!athlete) return { response: reply(request, env, { error: "athlete_not_found" }, 404) };
  const language = body.language === "ar" ? "ar" : "en";
  const reasons = Array.isArray(body.reasons)
    ? [...new Set(body.reasons.map((code) => text(code, 40)).filter(Boolean))].slice(0, 8) : [];

  let coach = null, connectionId = null, action = "profile_invited";
  if (kind === "coach") {
    const coachProfileId = text(body.coach_id, 36);
    coach = await env.DB.prepare(`SELECT id,user_id,display_name,city,status,provider_type FROM provider_profiles
      WHERE id=? AND status='approved' AND provider_type='coach'`).bind(coachProfileId).first();
    if (!coach) return { response: reply(request, env, { error: "coach_unavailable" }, 404) };
    if (coach.user_id === athlete.id) return { response: reply(request, env, { error: "cannot_invite_self" }, 400) };
    if (await env.DB.prepare("SELECT id FROM athlete_crm_invitations WHERE athlete_user_id=? AND coach_user_id=? AND status='pending'")
      .bind(athlete.id, coach.user_id).first()) return { response: reply(request, env, { error: "invitation_exists" }, 409) };

    if (options.reassign) {
      const revoked = await revokeActiveAthleteAssignment(env, athlete.id, manager.id, "coach_reassigned");
      if (!revoked) return { response: reply(request, env, { error: "no_active_assignment" }, 409) };
      action = "coach_reassigned";
    } else {
      action = "coach_invited";
      const active = await env.DB.prepare(`SELECT id FROM coach_connections WHERE athlete_user_id=? AND status='accepted' AND workspace_status='active'`)
        .bind(athlete.id).first();
      if (active) return { response: reply(request, env, { error: "assignment_exists" }, 409) };
    }

    const existing = await env.DB.prepare("SELECT id,status,workspace_status FROM coach_connections WHERE coach_user_id=? AND athlete_user_id=?")
      .bind(coach.user_id, athlete.id).first();
    const now = new Date().toISOString();
    if (existing && existing.status === "pending") return { response: reply(request, env, { error: "invitation_exists" }, 409) };
    if (existing) {
      await env.DB.prepare(`UPDATE coach_connections SET status='pending',source='admin_invite',booking_id=NULL,
        athlete_accepted_at=NULL,workspace_status='none',workspace_created_at=NULL,updated_at=? WHERE id=?`).bind(now, existing.id).run();
      connectionId = existing.id;
    } else {
      connectionId = randomId();
      await env.DB.prepare(`INSERT INTO coach_connections
        (id,coach_user_id,athlete_user_id,status,created_at,updated_at,booking_id,source,athlete_accepted_at,workspace_status,workspace_created_at)
        VALUES(?,?,?,'pending',?,?,NULL,'admin_invite',NULL,'none',NULL)`)
        .bind(connectionId, coach.user_id, athlete.id, now, now).run();
    }
  }

  const token = newInvitationToken();
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const invitationId = randomId();
  await env.DB.prepare(`INSERT INTO athlete_crm_invitations
    (id,kind,athlete_user_id,coach_user_id,connection_id,invited_by_user_id,token_hash,language,status,email_status,reason_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,'pending','pending',?,?,?)`)
    .bind(invitationId, kind, athlete.id, coach?.user_id || null, connectionId, manager?.id || null, tokenHash, language,
      JSON.stringify(reasons), now, now).run();
  await recordAthleteCrmEvent(env, athlete.id, manager?.id, action, kind === "coach" ? "coach_invitation" : "profile_invitation",
    invitationId, { language, reason_codes: reasons, connection_id: connectionId || "" });

  const invitation = { id: invitationId, kind, language, coach_name: coach?.display_name || "", email_status: "pending" };
  const delivered = await sendAthleteCrmInvitation(env, invitation, athlete, token, coach?.display_name || "");
  const payload = {
    id: invitationId, kind, language, status: delivered ? "pending" : "email_failed",
    email_status: delivered ? "sent" : "failed", coach_id: coach?.id || null,
    athlete_id: athlete.id, created_at: now,
  };
  if (!delivered) return { response: reply(request, env, { error: "email_unavailable", invitation: payload }, 503), invitation: payload };
  return { response: reply(request, env, { invitation: payload }, 201), invitation: payload };
}

async function athleteCrmRecommendations(request, env, manager, athlete) {
  await recordAthleteCrmEvent(env, athlete.id, manager?.id, "recommendations_viewed", "athlete", athlete.id, { source: "verified_profile" });
  const coaches = await env.DB.prepare(`SELECT p.id,p.user_id,p.display_name,p.city,p.specialties_json,p.languages_json,
      p.bio,p.services_json,p.coaching_mode,p.provider_type,p.experience_years
    FROM provider_profiles p WHERE p.status='approved' AND p.provider_type='coach' AND p.user_id<>?
      AND EXISTS(SELECT 1 FROM users u WHERE u.id=p.user_id AND ${publicVisibility("u")})
      AND NOT EXISTS(SELECT 1 FROM coach_connections c WHERE c.athlete_user_id=? AND c.coach_user_id=p.user_id AND c.status IN ('pending','accepted'))
      AND NOT EXISTS(SELECT 1 FROM athlete_crm_invitations i WHERE i.athlete_user_id=? AND i.coach_user_id=p.user_id AND i.status='pending')
    ORDER BY p.display_name LIMIT 100`).bind(athlete.id, athlete.id, athlete.id).all();
  const matches = coachMatches(athlete, (coaches.results || []).map((coach) => ({
    ...coach,
    specialties: safeParse(coach.specialties_json),
    languages: safeParse(coach.languages_json),
    services: safeParse(coach.services_json),
  })));
  const nextSteps = [];
  if (athlete.onboarding_incomplete) nextSteps.push({ code: "complete_profile", en: "Invite the athlete to complete their sports profile.", ar: "ادعُ الرياضي لإكمال ملفه الرياضي." });
  if (athlete.assigned) nextSteps.push({ code: "review_assignment", en: "Review the current coach connection before recommending a change.", ar: "راجع ارتباط المدرب الحالي قبل اقتراح تغيير." });
  else nextSteps.push({ code: "invite_coach", en: "Invite a recommended coach and wait for the athlete's consent.", ar: "ادعُ مدرباً مقترحاً وانتظر موافقة الرياضي." });
  if (!athlete.active) nextSteps.push({ code: "reengage", en: "Send a gentle re-engagement invitation.", ar: "أرسل دعوة لطيفة للتفاعل مجدداً." });
  const drafts = [
    {
      kind: "profile", requires_approval: true,
      subject_en: "Complete your sports profile", subject_ar: "أكمل ملفك الرياضي",
      body_en: "Add your sports, goals and preferred language to help MZ Active suggest suitable coaches. Your profile stays private.",
      body_ar: "أضف رياضاتك وأهدافك ولغتك المفضلة لمساعدة MZ Active في اقتراح مدربين مناسبين. يبقى ملفك خاصاً.",
    },
    ...matches.slice(0, 1).map((match) => ({
      kind: "coach", coach_id: match.coach_id, requires_approval: true,
      subject_en: "A coach has been recommended to you", subject_ar: "مدرب مقترح لك",
      body_en: `${match.coach_name} can open a private workspace with you. You decide whether to accept or decline.`,
      body_ar: `يمكن لـ ${match.coach_name} فتح مساحة تدريب خاصة معك. أنت من يقرر القبول أو الرفض.`,
    })),
  ];
  return reply(request, env, {
    athlete_id: athlete.id,
    generated_at: new Date().toISOString(),
    matches,
    next_steps: nextSteps,
    drafts,
    disclaimer: {
      en: "Assistive suggestions based on verified profile fields only. No medical advice, diagnosis or licensed-coach claim is made.",
      ar: "اقتراحات مساعدة مبنية على حقول الملف الموثقة فقط. لا تتضمن تشخيصاً طبياً أو ادعاءً بأن المدرب مرخص.",
    },
  });
}

async function athleteCrmDetail(request, env, athlete) {
  const [connections, invitations, programs, sessions, bookings, messages, events] = await Promise.all([
    env.DB.prepare(`SELECT c.id,c.status,c.workspace_status,c.updated_at,c.source,c.athlete_accepted_at,
      p.id AS coach_profile_id,p.display_name AS coach_name,p.city,p.provider_type,p.specialties_json,p.languages_json,p.coaching_mode
      FROM coach_connections c JOIN provider_profiles p ON p.user_id=c.coach_user_id
      WHERE c.athlete_user_id=? ORDER BY c.updated_at DESC LIMIT 50`).bind(athlete.id).all(),
    env.DB.prepare(`SELECT i.id,i.kind,i.status,i.email_status,i.language,i.created_at,i.responded_at,i.reason_json,
      p.display_name AS coach_name FROM athlete_crm_invitations i
      LEFT JOIN provider_profiles p ON p.user_id=i.coach_user_id
      WHERE i.athlete_user_id=? ORDER BY i.created_at DESC LIMIT 50`).bind(athlete.id).all(),
    env.DB.prepare("SELECT id,week_start,coach_note,athlete_type,created_at FROM athlete_programs_v2 WHERE athlete_user_id=? ORDER BY week_start DESC LIMIT 40")
      .bind(athlete.id).all(),
    env.DB.prepare(`SELECT s.program_id,s.id,s.session_code,s.day_key,s.sport_type,s.details,
      c.completed_at,c.actual_km,c.duration_minutes FROM athlete_programs_v2 p
      JOIN athlete_program_sessions_v2 s ON s.program_id=p.id
      LEFT JOIN athlete_program_completions_v2 c ON c.session_id=s.id AND c.athlete_user_id=p.athlete_user_id
      WHERE p.athlete_user_id=? ORDER BY p.week_start DESC,s.sort_order LIMIT 500`).bind(athlete.id).all(),
    env.DB.prepare(`SELECT id,provider_id,customer_name,status,session_type,preferred_date,city,created_at
      FROM booking_requests WHERE customer_user_id=? ORDER BY created_at DESC LIMIT 50`).bind(athlete.id).all(),
    env.DB.prepare(`SELECT m.id,m.connection_id,m.created_at,m.read_at,c.workspace_status,p.display_name AS coach_name
      FROM coach_messages m JOIN coach_connections c ON c.id=m.connection_id
      LEFT JOIN provider_profiles p ON p.user_id=c.coach_user_id
      WHERE c.athlete_user_id=? ORDER BY m.created_at DESC LIMIT 100`).bind(athlete.id).all(),
    env.DB.prepare("SELECT id,actor_user_id,action,entity_type,entity_id,details_json,created_at FROM athlete_crm_events WHERE athlete_user_id=? ORDER BY created_at DESC LIMIT 100")
      .bind(athlete.id).all(),
  ]);
  const sessionRows = sessions.results || [];
  const programMap = new Map((programs.results || []).map((program) => [program.id, { ...program, sessions: [] }]));
  for (const session of sessionRows) programMap.get(session.program_id)?.sessions.push(session);
  const completed = sessionRows.filter((session) => session.completed_at);
  const stats = {
    programs: programMap.size,
    sessions: sessionRows.length,
    completed_sessions: completed.length,
    total_km: Number(completed.reduce((sum, session) => sum + Number(session.actual_km || 0), 0).toFixed(1)),
    total_minutes: completed.reduce((sum, session) => sum + Number(session.duration_minutes || 0), 0),
    bookings: (bookings.results || []).length,
    messages: (messages.results || []).length,
  };
  return reply(request, env, {
    athlete,
    summary: stats,
    coaches: (connections.results || []).map((row) => ({ ...row, specialties: safeParse(row.specialties_json), languages: safeParse(row.languages_json) })),
    invitations: (invitations.results || []).map((row) => ({ ...row, reasons: safeParse(row.reason_json) })),
    programs: [...programMap.values()],
    bookings: bookings.results || [],
    messages: messages.results || [],
    audit: (events.results || []).map((row) => ({ ...row, details: safeParse(row.details_json) })),
  });
}

async function handleAthleteInvitationApi(request, env, url) {
  const match = /^\/api\/athlete-invitations\/([\w-]{20,120})$/.exec(url.pathname);
  if (!match) return null;
  if (!["GET", "POST"].includes(request.method)) return reply(request, env, { error: "not_found" }, 404);
  if (!await rateLimit(request, env, "athlete-invitation", 20)) return reply(request, env, { error: "rate_limited" }, 429);
  const tokenHash = await sha256(match[1]);
  const invitation = await env.DB.prepare(`SELECT i.*,u.email,u.id AS athlete_id,
      COALESCE(NULLIF(ms.display_name,''),substr(u.email,1,instr(u.email,'@')-1)) AS athlete_name,
      p.display_name AS coach_name
    FROM athlete_crm_invitations i JOIN users u ON u.id=i.athlete_user_id
    LEFT JOIN member_sports_profiles ms ON ms.user_id=u.id
    LEFT JOIN provider_profiles p ON p.user_id=i.coach_user_id WHERE i.token_hash=?`).bind(tokenHash).first();
  if (!invitation || !["pending", "email_failed"].includes(invitation.status)) return reply(request, env, { error: "invitation_not_found" }, 404);
  const cutoff = new Date(Date.now() - ATHLETE_INVITATION_TTL_DAYS * 86400000).toISOString();
  if (String(invitation.created_at) < cutoff) {
    await env.DB.prepare("UPDATE athlete_crm_invitations SET status='expired',updated_at=? WHERE id=?").bind(new Date().toISOString(), invitation.id).run();
    return reply(request, env, { error: "invitation_expired" }, 410);
  }
  if (request.method === "GET") return reply(request, env, {
    invitation: {
      id: invitation.id, kind: invitation.kind, language: invitation.language, status: "pending",
      athlete_name: invitation.athlete_name, coach_name: invitation.coach_name || "",
      created_at: invitation.created_at, expires_at: new Date(Date.parse(invitation.created_at) + ATHLETE_INVITATION_TTL_DAYS * 86400000).toISOString(),
      reason_codes: safeParse(invitation.reason_json),
    },
  });

  const body = await readJson(request);
  const action = body?.action === "decline" ? "declined" : body?.action === "accept" ? "accepted" : "";
  if (!action) return reply(request, env, { error: "invalid_action" }, 400);
  const now = new Date().toISOString();
  let workspaceActive = false;

  if (action === "accepted" && invitation.kind === "coach") {
    const coach = await env.DB.prepare("SELECT user_id FROM provider_profiles WHERE user_id=? AND status='approved' AND provider_type='coach'")
      .bind(invitation.coach_user_id).first();
    if (!coach) return reply(request, env, { error: "coach_unavailable" }, 409);
    const other = await env.DB.prepare(`SELECT id FROM coach_connections WHERE athlete_user_id=? AND coach_user_id<>?
      AND status='accepted' AND workspace_status='active'`).bind(invitation.athlete_id, invitation.coach_user_id).first();
    if (other) return reply(request, env, { error: "active_assignment_exists" }, 409);
    const updated = await env.DB.prepare(`UPDATE coach_connections SET status='accepted',workspace_status='active',
      athlete_accepted_at=?,workspace_created_at=COALESCE(workspace_created_at,?),updated_at=?
      WHERE id=? AND status='pending' AND athlete_user_id=? AND coach_user_id=?`)
      .bind(now, now, now, invitation.connection_id, invitation.athlete_id, invitation.coach_user_id).run();
    if (!updated.meta?.changes) return reply(request, env, { error: "invitation_unavailable" }, 409);
    workspaceActive = true;
  } else if (action === "declined" && invitation.kind === "coach") {
    await env.DB.prepare(`UPDATE coach_connections SET status='declined',workspace_status='closed',updated_at=?
      WHERE id=? AND athlete_user_id=?`).bind(now, invitation.connection_id, invitation.athlete_id).run();
  }

  const saved = await env.DB.prepare(`UPDATE athlete_crm_invitations SET status=?,updated_at=?,responded_at=?
    WHERE id=? AND status IN ('pending','email_failed')`).bind(action, now, now, invitation.id).run();
  if (!saved.meta?.changes) return reply(request, env, { error: "invitation_unavailable" }, 409);
  const auditAction = invitation.kind === "coach"
    ? action === "accepted" ? "coach_invite_accepted" : "coach_invite_declined"
    : action === "accepted" ? "profile_invite_accepted" : "profile_invite_declined";
  await recordAthleteCrmEvent(env, invitation.athlete_id, invitation.athlete_id, auditAction,
    "athlete_crm_invitation", invitation.id, { kind: invitation.kind });
  if (action === "accepted" && workspaceActive) {
    await recordAthleteCrmEvent(env, invitation.athlete_id, invitation.athlete_id, "coach_assigned", "coach_connection", invitation.connection_id, {});
    await createNotification(env, invitation.coach_user_id, "workspace_ready", "Private coaching workspace ready", "", "coach_connection", invitation.connection_id);
  } else if (invitation.kind === "coach") {
    await createNotification(env, invitation.coach_user_id, "connection_reviewed", "Coach invitation reviewed", "", "athlete_crm_invitation", invitation.id);
  }
  return reply(request, env, {
    ok: true, status: action, workspace_active: workspaceActive,
    message: invitation.kind === "profile" && action === "accepted"
      ? { en: "Open your sports profile to continue.", ar: "افتح ملفك الرياضي للمتابعة." }
      : null,
  });
}

function requiredManagementPermission(path) {
  if (path.includes("/ai-brain")) return "management.ai";
  if (path.includes("/assistant") || path.includes("/agents") || path.includes("/momo")) return "management.ai";
  if (path.includes("/athletes/") && path.includes("/recommendations")) return "management.ai";
  if (path.includes("/auth-events") || path.includes("/reports")) return "management.audit";
  if (path.includes("/community") || path.includes("/communities") || path.includes("/achievements")) return "management.community";
  if (path.includes("/blog")) return "management.articles";
  if (path.includes("/booking")) return "management.bookings";
  if (path.includes("/messages")) return "management.coaches";
  if (path.includes("/accounts") || path.includes("/provider") || path.includes("/athletes") || path.includes("/programs")) return "management.coaches";
  return "management.view";
}

// Delegated managers may see workflow status, but credential documents and the
// identity details needed to verify them stay with the full administrator role
// until access is explicitly granted by policy.
const RESTRICTED_APPLICATION_FIELDS = [
  "email", "qualifications", "certificate_name", "certificate_issuer", "certificate_number",
  "license_number", "license_issuer", "license_country", "license_expires_on",
  "license_review_note", "whatsapp_number", "whatsapp_public", "social_links_json",
  "cv_file_name", "cv_byte_size", "cv_updated_at",
];

function applicationForViewer(row, user) {
  if (isSuperAdmin(user)) return row;
  const visible = { ...row, credentials_restricted: true };
  for (const field of RESTRICTED_APPLICATION_FIELDS) delete visible[field];
  return visible;
}

// Account directory rows carry the same identity details that are withheld on
// application rows. Delegated managers may see workflow state, not contact PII.
function accountForViewer(row, user) {
  if (isSuperAdmin(user)) return row;
  return {
    ...row,
    email: "[restricted]",
    whatsapp_number: null,
    profile_hidden_reason: null,
    identity_restricted: true,
  };
}

async function adminApplications(request, env, user) {
  const requestUrl = new URL(request.url);
  const path = requestUrl.pathname;

  // Only the protected administrator role may change management grants. This
  // endpoint is deliberately outside the general manager permission check.
  if (path === "/api/admin/management/permissions" && request.method === "GET") {
    if (!isSuperAdmin(user)) return reply(request, env, { error: "forbidden" }, 403);
    const rows = await env.DB.prepare(`SELECT u.id,u.email,u.role,u.is_super_admin,ump.permission_code,p.label_en,p.label_ar,ump.granted_at
      FROM user_management_permissions ump JOIN users u ON u.id=ump.user_id
      JOIN management_permissions p ON p.code=ump.permission_code
      ORDER BY u.email,ump.permission_code`).all();
    return reply(request, env, { grants: rows.results || [], available: MANAGEMENT_PERMISSION_CODES });
  }
  if (path === "/api/admin/management/permissions" && request.method === "PUT") {
    if (!isSuperAdmin(user)) return reply(request, env, { error: "forbidden" }, 403);
    const body = await readJson(request);
    const email = emailValue(body?.email);
    const codes = Array.isArray(body?.permissions)
      ? [...new Set(body.permissions.filter((code) => MANAGEMENT_PERMISSION_CODES.includes(code)))]
      : [];
    const target = email
      ? await env.DB.prepare("SELECT id,email,role,is_super_admin FROM users WHERE email=?").bind(email).first()
      : null;
    if (!target || isSuperAdmin(target)) return reply(request, env, { error: "invalid_target" }, 400);
    const now = new Date().toISOString();
    const statements = [
      env.DB.prepare("DELETE FROM user_management_permissions WHERE user_id=?").bind(target.id),
      ...codes.map((code) => env.DB.prepare(`INSERT INTO user_management_permissions(user_id,permission_code,granted_by,granted_at)
        VALUES(?,?,?,?) ON CONFLICT(user_id,permission_code) DO NOTHING`).bind(target.id, code, user.id, now)),
      env.DB.prepare(`INSERT INTO account_events(id,actor_user_id,subject_user_id,action,detail,created_at)
        VALUES(?,?,?,'management_permissions_changed',?,?)`)
        .bind(randomId(), user.id, target.id, JSON.stringify({ email: target.email, permissions: codes }), now),
      env.DB.prepare(`INSERT INTO owner_agent_activity(id,actor_user_id,agent_type,action,status,details_json,created_at)
        VALUES(?,?,'owner','management_permissions_changed','completed',?,?)`)
        .bind(randomId(), user.id, JSON.stringify({ email: target.email, permissions: codes }), now),
    ];
    await env.DB.batch(statements);
    return reply(request, env, { ok: true, email: target.email, role: target.role, permissions: codes });
  }

  if (!await hasManagementPermission(env, user, "management.view")) return reply(request, env, { error: "forbidden" }, 403);
  const needed = requiredManagementPermission(path);
  if (needed !== "management.view" && !await hasManagementPermission(env, user, needed)) return reply(request, env, { error: "forbidden" }, 403);

  // Account management is deliberately separated from the public athlete
  // profile. Viewing needs management.view; every state change needs a full
  // administrator session so a scoped manager cannot escalate roles.
  const accountFields = `u.id,u.email,u.role,u.is_super_admin,u.account_status,u.status_reason,u.deleted_at,u.created_at,u.profile_visibility,u.profile_hidden_at,u.profile_hidden_reason,
    p.id AS profile_id,p.status AS profile_status,p.submission_state,p.provider_type,
    COALESCE(p.display_name,(SELECT ms.display_name FROM member_sports_profiles ms WHERE ms.user_id=u.id)) AS display_name,
    COALESCE(p.city,(SELECT ms.city FROM member_sports_profiles ms WHERE ms.user_id=u.id)) AS city,
    COALESCE(p.country,(SELECT ms.country FROM member_sports_profiles ms WHERE ms.user_id=u.id),'Qatar') AS country,
    COALESCE(p.whatsapp_number,(SELECT ms.whatsapp_number FROM member_sports_profiles ms WHERE ms.user_id=u.id)) AS whatsapp_number,
    COALESCE((SELECT ms.preferred_language FROM member_sports_profiles ms WHERE ms.user_id=u.id),'') AS preferred_language,
    (SELECT COUNT(*) FROM booking_requests b WHERE b.customer_user_id=u.id OR b.provider_id=p.id) AS booking_count,
    (SELECT COUNT(*) FROM athlete_programs_v2 ap WHERE ap.athlete_user_id=u.id OR ap.coach_user_id=u.id) AS program_count`;
  const withMismatch = row => ({ ...row, role_mismatch: row.role === "provider" && !row.profile_id && (row.booking_count > 0 || row.program_count > 0) });
  if (request.method === "GET" && path === "/api/admin/accounts") {
    const filter = requestUrl.searchParams.get("filter") || "all";
    const q = text(requestUrl.searchParams.get("q") || "", 80).toLowerCase();
    const rows = await env.DB.prepare(`SELECT ${accountFields} FROM users u LEFT JOIN provider_profiles p ON p.user_id=u.id ORDER BY u.created_at DESC LIMIT 200`).all();
    const all = (rows.results || []).map(withMismatch);
    const counts = {
      all: all.length,
      members: all.filter(a => !a.profile_id).length,
      coaches: all.filter(a => Boolean(a.profile_id)).length,
      suspended: all.filter(a => a.account_status === "suspended").length,
      hidden: all.filter(a => a.profile_visibility === "hidden").length,
      deleted: all.filter(a => a.account_status === "deleted").length,
      mismatch: all.filter(a => a.role_mismatch).length,
    };
    const matchesFilter = a => {
      if (filter === "members") return !a.profile_id;
      if (filter === "coaches") return Boolean(a.profile_id);
      if (filter === "suspended") return a.account_status === "suspended";
      if (filter === "hidden") return a.profile_visibility === "hidden";
      if (filter === "deleted") return a.account_status === "deleted";
      if (filter === "mismatch") return a.role_mismatch;
      return true;
    };
    const accounts = all.filter(a => !q || a.email.toLowerCase().includes(q) || (a.display_name || "").toLowerCase().includes(q))
      .filter(matchesFilter)
      .map((row) => accountForViewer(row, user));
    return reply(request, env, { accounts, counts });
  }
  const accountMatch = /^\/api\/admin\/accounts\/([\w-]{36})(?:\/(coach-application|suspend|reactivate|delete|trash|restore|update|role|hide-profile|restore-profile))?$/.exec(path);
  if (accountMatch && request.method === "GET" && !accountMatch[2]) {
    const row = await env.DB.prepare(`SELECT ${accountFields} FROM users u LEFT JOIN provider_profiles p ON p.user_id=u.id WHERE u.id=?`).bind(accountMatch[1]).first();
    if (!row) return reply(request, env, { error: "account_not_found" }, 404);
    const events = await env.DB.prepare("SELECT id,actor_user_id,action,detail,created_at FROM account_events WHERE subject_user_id=? ORDER BY created_at DESC LIMIT 50").bind(row.id).all();
    const visibleEvents = isSuperAdmin(user)
      ? events.results || []
      : (events.results || []).map((event) => ({ ...event, detail: null }));
    return reply(request, env, { account: accountForViewer(withMismatch(row), user), events: visibleEvents });
  }
  if (request.method === "GET" && path === "/api/admin/trash") {
    const type = ["all", "athletes", "coaches", "pacers"].includes(requestUrl.searchParams.get("type") || "")
      ? requestUrl.searchParams.get("type") : "all";
    const rows = await env.DB.prepare(`SELECT u.id,u.email,u.role,u.account_status,u.status_reason,u.deleted_at,u.deleted_by,
        COALESCE(p.display_name,ms.display_name,SUBSTR(u.email,1,INSTR(u.email,'@')-1)) AS display_name,
        COALESCE(p.provider_type,'athlete') AS account_type,
        (SELECT m.email FROM users m WHERE m.id=u.deleted_by) AS deleted_by_email
      FROM users u LEFT JOIN provider_profiles p ON p.user_id=u.id
      LEFT JOIN member_sports_profiles ms ON ms.user_id=u.id
      WHERE u.account_status='deleted' ORDER BY u.deleted_at DESC LIMIT 200`).all();
    const all = rows.results || [];
    const filtered = type === "all" ? all : all.filter((row) => row.account_type === ({ athletes: "athlete", coaches: "coach", pacers: "pacer" })[type]);
    return reply(request, env, {
      accounts: filtered.map((row) => accountForViewer(row, user)), type,
      counts: {
        all: all.length,
        athletes: all.filter((row) => row.account_type === "athlete").length,
        coaches: all.filter((row) => row.account_type === "coach").length,
        pacers: all.filter((row) => row.account_type === "pacer").length,
      },
    });
  }
  if (accountMatch && request.method === "POST" && accountMatch[2]) {
    if (!isSuperAdmin(user)) return reply(request, env, { error: "admin_required" }, 403);
    const target = await env.DB.prepare("SELECT id,email,role,is_super_admin,account_status,profile_visibility,profile_hidden_reason FROM users WHERE id=?").bind(accountMatch[1]).first();
    if (!target) return reply(request, env, { error: "account_not_found" }, 404);
    const action = accountMatch[2], body = await readJson(request), now = new Date().toISOString();

    if (action === "update") {
      if (target.account_status === "deleted") return reply(request, env, { error: "account_not_active" }, 409);
      // A peer super admin's login email must not be changed out from under
      // them; all other accounts remain editable by a super administrator.
      if (isSuperAdmin(target) && target.id !== user.id) return reply(request, env, { error: "account_protected" }, 409);
      const nextEmail = body?.email === undefined ? target.email : emailValue(body.email);
      if (!nextEmail) return reply(request, env, { error: "invalid_email" }, 400);
      if (nextEmail !== target.email.toLowerCase()) {
        const duplicate = await env.DB.prepare("SELECT id FROM users WHERE email=? AND id<>?").bind(nextEmail, target.id).first();
        if (duplicate) return reply(request, env, { error: "email_in_use" }, 409);
      }
      const profile = await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=?").bind(target.id).first();
      const member = await env.DB.prepare("SELECT user_id FROM member_sports_profiles WHERE user_id=?").bind(target.id).first();
      const displayName = body?.display_name === undefined ? null : text(body.display_name, 100);
      const city = body?.city === undefined ? null : text(body.city, 80);
      const country = body?.country === undefined ? null : text(body.country, 80);
      const whatsappProvided = body?.whatsapp_number !== undefined;
      let whatsapp = null;
      if (whatsappProvided) {
        const raw = text(body.whatsapp_number, 32);
        if (raw && !normalizeWhatsApp(raw)) return reply(request, env, { error: "invalid_whatsapp" }, 400);
        whatsapp = raw ? normalizeWhatsApp(raw) : null;
      }
      const languageProvided = body?.preferred_language !== undefined;
      const language = body?.preferred_language === 'ar' ? 'ar' : body?.preferred_language === 'en' ? 'en' : '';
      const emailChanged = nextEmail !== target.email.toLowerCase();
      const profileFieldsPresent = displayName !== null || city !== null || country !== null || whatsappProvided;
      const memberFieldsPresent = profileFieldsPresent || languageProvided;
      const statements = [env.DB.prepare("UPDATE users SET email=? WHERE id=?").bind(nextEmail, target.id)];
      if (profile && profileFieldsPresent) statements.push(env.DB.prepare(`UPDATE provider_profiles
        SET display_name=COALESCE(?,display_name),city=COALESCE(?,city),country=COALESCE(?,country),
        whatsapp_number=CASE WHEN ?=1 THEN ? ELSE whatsapp_number END,updated_at=? WHERE user_id=?`)
        .bind(displayName, city, country, whatsappProvided ? 1 : 0, whatsapp, now, target.id));
      if (!profile && member && memberFieldsPresent) statements.push(env.DB.prepare(`UPDATE member_sports_profiles
        SET display_name=COALESCE(?,display_name),city=COALESCE(?,city),country=COALESCE(?,country),
        whatsapp_number=CASE WHEN ?=1 THEN ? ELSE whatsapp_number END,
        preferred_language=CASE WHEN ?=1 THEN ? ELSE preferred_language END,updated_at=? WHERE user_id=?`)
        .bind(displayName, city, country, whatsappProvided ? 1 : 0, whatsapp,
          languageProvided ? 1 : 0, language, now, target.id));
      if (!member && (languageProvided || (!profile && memberFieldsPresent))) statements.push(env.DB.prepare(`INSERT INTO member_sports_profiles
        (user_id,display_name,city,country,whatsapp_number,preferred_language,updated_at)
        VALUES(?,?,?,?,?,?,?)`)
        .bind(target.id, displayName || '', city || '', country || 'Qatar', whatsapp, language, now));
      if (profile && languageProvided && member) statements.push(env.DB.prepare("UPDATE member_sports_profiles SET preferred_language=?,updated_at=? WHERE user_id=?").bind(language, now, target.id));
      if (emailChanged) statements.push(env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id));
      await env.DB.batch(statements);
      const changed = [
        emailChanged ? 'email' : null,
        displayName !== null ? 'display_name' : null,
        city !== null ? 'city' : null,
        country !== null ? 'country' : null,
        whatsappProvided ? 'whatsapp_number' : null,
        languageProvided ? 'preferred_language' : null,
      ].filter(Boolean);
      await recordAccountEvent(env, user.id, target.id, 'account_updated', { fields: changed });
      return reply(request, env, { ok: true, fields: changed, sessions_revoked: emailChanged });
    }

    if (action === "role") {
      if (target.id === user.id || target.account_status === "deleted") return reply(request, env, { error: "account_protected" }, 409);
      const nextRole = body?.role === 'admin' || body?.role === 'provider' ? body.role : null;
      if (!nextRole) return reply(request, env, { error: "invalid_role" }, 400);
      const elevate = nextRole === 'admin' && body?.super_admin === true;
      const nextSuper = nextRole === 'admin' && elevate ? 1 : 0;
      const demotesSuper = isSuperAdmin(target) && (nextRole !== 'admin' || !elevate);
      // The count and demotion happen in one statement so two concurrent
      // demotions cannot both pass and leave the portal with no super admin.
      const lastSuperGuard = demotesSuper
        ? "AND (SELECT COUNT(*) FROM users WHERE role='admin' AND is_super_admin=1) > 1"
        : '';
      const updated = await env.DB.prepare(`UPDATE users SET role=?,is_super_admin=? WHERE id=? ${lastSuperGuard}`)
        .bind(nextRole, nextSuper, target.id).run();
      if (!(updated.meta?.changes || updated.changes)) return reply(request, env, { error: "last_super_admin" }, 409);
      try {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id),
        ]);
      } catch (error) {
        await env.DB.prepare("UPDATE users SET role=?,is_super_admin=? WHERE id=?")
          .bind(target.role, target.is_super_admin || 0, target.id).run();
        throw error;
      }
      await recordAccountEvent(env, user.id, target.id, 'account_role_changed', { from: target.role, to: nextRole, super_admin: Boolean(nextSuper) });
      return reply(request, env, { ok: true, role: nextRole, super_admin: Boolean(nextSuper), sessions_revoked: true });
    }

    if (action === "coach-application") {
      if (target.role !== "provider" || !accountActive(target.account_status)) return reply(request, env, { error: "account_not_eligible" }, 409);
      if (await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=?").bind(target.id).first()) return reply(request, env, { error: "coach_application_exists" }, 409);
      const type = professionalType(body?.provider_type || "coach");
      if (!type) return reply(request, env, { error: "invalid_profile_type" }, 400);
      const profileId = randomId();
      // A draft forces onboarding and an explicit submission; no coach
      // permission or public profile is granted by the conversion itself.
      await env.DB.prepare(`INSERT INTO provider_profiles(id,user_id,provider_type,display_name,country,city,bio,status,submission_state,updated_at,created_at)
        VALUES(?,?,?,?,?,?,?,'pending','draft',?,?)`)
        .bind(profileId, target.id, type, text(body?.display_name, 100) || "Coach profile awaiting completion",
          text(body?.country, 80) || "Qatar", text(body?.city, 80) || "", "Profile awaiting completion by the provider.", now, now).run();
      await recordAccountEvent(env, user.id, target.id, "coach_application_opened", { provider_type: type });
      return reply(request, env, { ok: true, profile_id: profileId, submission_state: "draft" });
    }
    if (action === "hide-profile" || action === "restore-profile") {
      const hiding = action === "hide-profile";
      if (isSuperAdmin(target) || target.id === user.id) return reply(request, env, { error: "account_protected" }, 409);
      if (target.account_status === "deleted") return reply(request, env, { error: "account_not_active" }, 409);
      const reason = text(body?.reason, 300);
      if (!reason) return reply(request, env, { error: "reason_required" }, 400);
      if (hiding && target.profile_visibility === "hidden") return reply(request, env, { error: "profile_already_hidden" }, 409);
      if (!hiding && target.profile_visibility !== "hidden") return reply(request, env, { error: "profile_not_hidden" }, 409);
      await env.DB.prepare("UPDATE users SET profile_visibility=?,profile_hidden_at=?,profile_hidden_reason=? WHERE id=?")
        .bind(hiding ? "hidden" : "public", hiding ? now : null, hiding ? reason : null, target.id).run();
      await recordAccountEvent(env, user.id, target.id, hiding ? "profile_hidden" : "profile_restored", { reason });
      return reply(request, env, { ok: true, profile_visibility: hiding ? "hidden" : "public", sessions_revoked: false });
    }
    if (action === "suspend") {
      if (isSuperAdmin(target) || target.id === user.id) return reply(request, env, { error: "account_protected" }, 409);
      if (!accountActive(target.account_status)) return reply(request, env, { error: "account_not_active" }, 409);
      const reason = text(body?.reason, 300);
      if (!reason) return reply(request, env, { error: "reason_required" }, 400);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET account_status='suspended',status_reason=? WHERE id=?").bind(reason, target.id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id),
      ]);
      await recordAccountEvent(env, user.id, target.id, "account_suspended", { reason });
      return reply(request, env, { ok: true, account_status: "suspended" });
    }
    if (action === "reactivate") {
      if (target.account_status !== "suspended") return reply(request, env, { error: "account_not_suspended" }, 409);
      const reason = text(body?.reason, 300);
      if (!reason) return reply(request, env, { error: "reason_required" }, 400);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET account_status='active',status_reason=NULL WHERE id=?").bind(target.id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id),
      ]);
      await recordAccountEvent(env, user.id, target.id, "account_reactivated", { reason });
      return reply(request, env, { ok: true, account_status: "active" });
    }
    if (action === "delete") {
      if (isSuperAdmin(target) || target.id === user.id) return reply(request, env, { error: "account_protected" }, 409);
      if (target.account_status === "deleted") return reply(request, env, { error: "account_already_deleted" }, 409);
      const confirmedEmail = emailValue(body?.confirm_email), phrase = text(body?.confirm_phrase, 40);
      const reason = text(body?.reason, 300);
      if (confirmedEmail !== target.email.toLowerCase() || phrase !== "DELETE") return reply(request, env, { error: "confirmation_required" }, 400);
      if (!reason) return reply(request, env, { error: "reason_required" }, 400);
      const profile = await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=?").bind(target.id).first();
      const statements = [
        env.DB.prepare("UPDATE users SET account_status='deleted',status_reason=NULL,profile_visibility='hidden',profile_hidden_at=?,profile_hidden_reason=?,deleted_at=?,anonymized_at=?,email=?,password_hash=? WHERE id=?")
          .bind(now, `Account deleted: ${reason}`, now, now, `deleted+${target.id}@invalid`, await hashPassword("deleted-" + randomId()), target.id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id),
        env.DB.prepare("DELETE FROM password_reset_tokens WHERE user_id=?").bind(target.id),
      ];
      if (profile) statements.push(env.DB.prepare(`UPDATE provider_profiles SET display_name='Deleted account',country='',city='',specialties_json='[]',languages_json='[]',bio='',qualifications='',services_json='[]',coaching_mode='',whatsapp_number=NULL,whatsapp_public=0,social_links_json='[]',public_fields_json='[]',certificate_name='',certificate_issuer='',certificate_number='',license_number='',license_issuer='',license_country='',license_expires_on=NULL,license_status='not_submitted',license_review_note='',status='rejected',review_note='Removed by owner',profile_photo_url='',profile_photo_bytes=NULL,profile_photo_content_type=NULL,profile_photo_updated_at=NULL,cv_bytes=NULL,cv_content_type=NULL,cv_file_name=NULL,cv_byte_size=NULL,cv_updated_at=NULL,verified=0,updated_at=? WHERE id=?`).bind(now, profile.id));
      await env.DB.batch(statements);
      await recordAccountEvent(env, user.id, target.id, "account_deleted", { reason, profile_anonymized: Boolean(profile), bookings_preserved: true });
      return reply(request, env, { ok: true, anonymized: true, bookings_preserved: true });
    }
    if (action === "trash") {
      if (isSuperAdmin(target) || target.id === user.id) return reply(request, env, { error: "account_protected" }, 409);
      if (target.account_status === "deleted") return reply(request, env, { error: "account_already_deleted" }, 409);
      const reason = text(body?.reason, 300);
      const updated = await env.DB.prepare(`UPDATE users SET account_status='deleted',status_reason=?,
        profile_visibility='hidden',profile_hidden_at=?,profile_hidden_reason=?,deleted_at=?,deleted_by=?,
        previous_account_status=COALESCE(account_status,'active'),previous_profile_visibility=COALESCE(profile_visibility,'public')
        WHERE id=? AND account_status<>'deleted'`)
        .bind(reason || null, now, 'Moved to trash', now, user.id, target.id).run();
      if (!updated.meta.changes) return reply(request, env, { error: "account_status_changed" }, 409);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id),
        env.DB.prepare("DELETE FROM password_reset_tokens WHERE user_id=?").bind(target.id),
      ]);
      await recordAccountEvent(env, user.id, target.id, "account_trashed", { reason: reason || null, undoable: true });
      return reply(request, env, { ok: true, account_status: "deleted", undoable: true });
    }
    if (action === "restore") {
      if (!isSuperAdmin(user)) return reply(request, env, { error: "admin_required" }, 403);
      if (isSuperAdmin(target) && target.id !== user.id) return reply(request, env, { error: "account_protected" }, 409);
      if (target.account_status !== "deleted") return reply(request, env, { error: "account_not_deleted" }, 409);
      const updated = await env.DB.prepare(`UPDATE users SET
        account_status=COALESCE(previous_account_status,'active'),status_reason=NULL,
        profile_visibility=COALESCE(previous_profile_visibility,'public'),profile_hidden_at=NULL,
        profile_hidden_reason=NULL,deleted_at=NULL,deleted_by=NULL,
        previous_account_status=NULL,previous_profile_visibility=NULL
        WHERE id=? AND account_status='deleted'`).bind(target.id).run();
      if (!updated.meta.changes) return reply(request, env, { error: "account_status_changed" }, 409);
      await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id).run();
      await recordAccountEvent(env, user.id, target.id, "account_restored", { undone: body?.undo === true });
      return reply(request, env, { ok: true, account_status: "restored" });
    }
    return reply(request, env, { error: "unknown_account_action" }, 400);
  }

  if (request.method === "GET" && path === "/api/admin/contact-config") {
    return reply(request, env, { contact: managementContactConfig(env), email_delivery: emailDeliveryConfigured(env) });
  }
  const coachContactMatch = /^\/api\/admin\/coaches\/([\w-]{36})\/(completeness|contacts)$/.exec(path);
  if (coachContactMatch) {
    const profile = await env.DB.prepare(`SELECT p.*,u.email,CASE WHEN p.profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,
      CASE WHEN EXISTS(SELECT 1 FROM provider_covers c WHERE c.provider_id=p.id) THEN 1 ELSE 0 END AS has_cover
      FROM provider_profiles p JOIN users u ON u.id=p.user_id WHERE p.id=?`).bind(coachContactMatch[1]).first();
    if (!profile) return reply(request, env, { error: "coach_not_found" }, 404);
    if (coachContactMatch[2] === "completeness" && request.method === "GET") {
      return reply(request, env, { completeness: profileCompletion(profile), status: profile.status });
    }
    if (coachContactMatch[2] === "contacts" && request.method === "GET") {
      const records = await env.DB.prepare(`SELECT c.*,u.email AS actor_email FROM coach_contact_records c
        JOIN users u ON u.id=c.actor_user_id WHERE c.coach_profile_id=? ORDER BY c.created_at DESC LIMIT 100`)
        .bind(profile.id).all();
      return reply(request, env, { contacts: records.results || [] });
    }
    if (coachContactMatch[2] === "contacts" && request.method === "POST") {
      const body = await readJson(request);
      if (!body || !["email","whatsapp"].includes(body.channel) || !COACH_CONTACT_PURPOSES.includes(body.purpose)) {
        return reply(request, env, { error: "invalid_contact_request" }, 400);
      }
      const target = await coachContactTargets(env, profile.id);
      const message = text(body.message, 4000);
      if (!target || !message) return reply(request, env, { error: "invalid_contact_request" }, 400);
      if (body.channel === "email" && !target.email) return reply(request, env, { error: "coach_email_unavailable", contact: managementContactConfig(env) }, 422);
      if (body.channel === "whatsapp" && !target.whatsapp) return reply(request, env, { error: "coach_whatsapp_unavailable" }, 422);
      const intent = ["prepare","open","send"].includes(body.intent) ? body.intent : "prepare";
      const prepared = `Hello ${target.name},\n\n${message}\n\n— MZ Active Management` +
        (body.channel === "email" && managementContactConfig(env).email ? `\n${managementContactConfig(env).email}` : "");
      if (intent !== "send") {
        const id = randomId(), now = new Date().toISOString();
        await env.DB.prepare(`INSERT INTO coach_contact_records(id,coach_profile_id,actor_user_id,channel,purpose,prepared_message,status,follow_up_status,provider_message_id,error,followup_id,created_at,updated_at)
          VALUES(?,?,?,?,?,?,'drafted','open',NULL,NULL,?,?,?)`)
          .bind(id, profile.id, user.id, body.channel, body.purpose, prepared, null, now, now).run();
        return reply(request, env, {
          id, status: "drafted", channel: body.channel,
          link: body.channel === "email"
            ? `mailto:${encodeURIComponent(target.email)}?subject=${encodeURIComponent("MZ Active · profile follow-up")}&body=${encodeURIComponent(prepared)}`
            : whatsappLink(target.whatsapp, prepared),
          recipient: body.channel === "email" ? target.email : target.whatsapp,
          contact: managementContactConfig(env),
        }, 201);
      }
      if (body.channel === "email") {
        const result = await sendManagementEmail(env, target.email, "MZ Active · profile follow-up", prepared);
        const record = await createCoachContactRecord(env, target, user, "email", body.purpose, prepared, result);
        return result.ok
          ? reply(request, env, { ...record, status: "confirmed_sent", delivery: "provider_accepted" }, 201)
          : reply(request, env, { ...record, error: result.error }, 503);
      }
      const record = await createCoachContactRecord(env, target, user, "whatsapp", body.purpose, prepared, { ok: false }, "drafted");
      return reply(request, env, { ...record, link: whatsappLink(target.whatsapp, prepared), recipient: target.whatsapp }, 201);
    }
  }
  const contactStateMatch = /^\/api\/admin\/contacts\/([\w-]{36})$/.exec(path);
  if (contactStateMatch && request.method === "PATCH") {
    const body = await readJson(request), status = body?.status;
    if (!COACH_CONTACT_STATES.includes(status)) return reply(request, env, { error: "invalid_contact_status" }, 400);
    const result = await env.DB.prepare("UPDATE coach_contact_records SET status=?,updated_at=? WHERE id=? AND status<>'completed'")
      .bind(status, new Date().toISOString(), contactStateMatch[1]).run();
    return result.meta?.changes ? reply(request, env, { updated: true, status }) : reply(request, env, { error: "contact_not_updatable" }, 409);
  }
  if (request.method === "GET" && path === "/api/admin/momo-followups") {
    if (!await hasManagementPermission(env, user, "management.ai")) return reply(request, env, { error: "forbidden" }, 403);
    const rows = await env.DB.prepare(`SELECT f.*,p.display_name AS coach_name,u.email AS coach_email
      FROM momo_coach_followups f JOIN provider_profiles p ON p.id=f.coach_profile_id JOIN users u ON u.id=p.user_id
      WHERE f.status IN ('open','contacted','escalated') ORDER BY CASE f.priority WHEN 'escalated' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,f.created_at LIMIT 100`).all();
    return reply(request, env, { followups: (rows.results || []).map((row) => ({
      ...row,
      missing_fields: parsedList(row.missing_fields_json),
      message: requestLanguage(request) === "ar" ? row.message_ar : row.message_en,
    })) });
  }
  const momoActionMatch = /^\/api\/admin\/momo-followups\/([\w-]{36})\/(dismiss|contact)$/.exec(path);
  if (momoActionMatch && request.method === "POST") {
    if (!await hasManagementPermission(env, user, "management.ai")) return reply(request, env, { error: "forbidden" }, 403);
    const followup = await env.DB.prepare("SELECT * FROM momo_coach_followups WHERE id=?").bind(momoActionMatch[1]).first();
    if (!followup) return reply(request, env, { error: "followup_not_found" }, 404);
    const now = new Date().toISOString();
    if (momoActionMatch[2] === "dismiss") {
      await env.DB.prepare("UPDATE momo_coach_followups SET status='dismissed',updated_at=? WHERE id=?").bind(now, followup.id).run();
      return reply(request, env, { updated: true, status: "dismissed" });
    }
    const target = await coachContactTargets(env, followup.coach_profile_id);
    if (!target?.email) return reply(request, env, { error: "coach_email_unavailable" }, 422);
    const message = requestLanguage(request) === "ar" ? followup.message_ar : followup.message_en;
    const result = await sendManagementEmail(env, target.email, "MZ Active · complete your profile", message);
    const record = await createCoachContactRecord(env, target, user, "email", "profile_support", message, result);
    await env.DB.prepare(`UPDATE momo_coach_followups SET status=?,last_contacted_at=?,task_id=?,updated_at=? WHERE id=?`)
      .bind(result.ok ? "contacted" : "escalated", now, record.id, now, followup.id).run();
    return result.ok
      ? reply(request, env, { updated: true, status: "contacted", contact: record })
      : reply(request, env, { error: result.error, contact: record }, 503);
  }
  if (request.method === "GET" && path === "/api/admin/dashboard") {
    const permissions = await managementPermissionCodes(env, user);
    return reply(request, env, await managementDashboard(env, user, permissions));
  }
  if (request.method === "PATCH" && path === "/api/admin/notifications") {
    const permissions = await managementPermissionCodes(env, user);
    const categories = allowedManagementCategories(user, permissions);
    const body = await readJson(request);
    if (!body) return reply(request, env, { error: "invalid_notification" }, 400);
    let targets = [];
    if (body.all === true) {
      const updated = await markAllManagementNotifications(env, user, categories);
      return reply(request, env, { updated: true, count: updated });
    } else {
      const id = text(body.id, 120), colon = id.indexOf(':');
      const category = colon > 0 ? id.slice(0, colon) : '';
      const entityId = colon > 0 ? id.slice(colon + 1) : '';
      if (!categories.includes(category) || !/^[\w-]{36}$/.test(entityId)) return reply(request, env, { error: "invalid_notification" }, 400);
      targets = [{ category, entity_id: entityId }];
    }
    const now = new Date().toISOString();
    if (targets.length) await env.DB.batch(targets.map((target) =>
      env.DB.prepare("INSERT OR IGNORE INTO management_notification_reads(user_id,category,entity_id,read_at) VALUES(?,?,?,?)")
        .bind(user.id, target.category, target.entity_id, now)));
    return reply(request, env, { updated: true, count: targets.length });
  }
  if (request.method === "GET" && path === "/api/admin/messages") {
    const rows = await env.DB.prepare(`SELECT m.id,m.connection_id,m.created_at,m.read_at,
      COALESCE(NULLIF(ms.display_name,''),NULLIF(sp.display_name,''),su.email,'MZ Active member') AS sender_name,
      COALESCE(NULLIF(rm.display_name,''),NULLIF(rp.display_name,''),ru.email,'MZ Active member') AS recipient_name,
      c.workspace_status FROM coach_messages m
      JOIN coach_connections c ON c.id=m.connection_id
      JOIN users su ON su.id=m.sender_user_id
      LEFT JOIN users ru ON ru.id = CASE WHEN m.sender_user_id=c.coach_user_id THEN c.athlete_user_id ELSE c.coach_user_id END
      LEFT JOIN member_sports_profiles ms ON ms.user_id=su.id
      LEFT JOIN provider_profiles sp ON sp.user_id=su.id
      LEFT JOIN member_sports_profiles rm ON rm.user_id=ru.id
      LEFT JOIN provider_profiles rp ON rp.user_id=ru.id
      WHERE c.workspace_status IN ('pending','active')
      ORDER BY (m.read_at IS NULL) DESC, m.created_at DESC LIMIT 100`).all();
    return reply(request, env, { messages: rows.results || [] });
  }
  if (request.method === "GET" && path === "/api/admin/run-iq-metrics") {
    const requestedDays = Number(requestUrl.searchParams.get("days") || 30);
    const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(1, Math.round(requestedDays))) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [rows, totals, feedback] = await Promise.all([
      env.DB.prepare(`SELECT event_name,COUNT(*) AS count,COUNT(DISTINCT visitor_key) AS visitors,
        COUNT(DISTINCT user_id) AS registered FROM run_iq_events WHERE created_at>=? GROUP BY event_name`).bind(since).all(),
      env.DB.prepare(`SELECT COUNT(DISTINCT visitor_key) AS visitors,
        COUNT(DISTINCT CASE WHEN user_id IS NULL THEN visitor_key END) AS anonymous,
        COUNT(DISTINCT user_id) AS registered FROM run_iq_events WHERE created_at>=?`).bind(since).first(),
      env.DB.prepare(`SELECT rating,COUNT(*) AS count FROM run_iq_feedback WHERE created_at>=? GROUP BY rating`).bind(since).all(),
    ]);
    const events = {};
    for (const row of rows.results || []) events[row.event_name] = {
      count: Number(row.count || 0), visitors: Number(row.visitors || 0), registered: Number(row.registered || 0),
    };
    const starts = events.assessment_started?.count || 0;
    return reply(request, env, {
      days, from: since, to: new Date().toISOString(),
      visitors: Number(totals?.visitors || 0),
      anonymous_visitors: Number(totals?.anonymous || 0),
      registered_visitors: Number(totals?.registered || 0),
      events,
      completion_rate: starts ? Math.round((events.assessment_completed?.count || 0) / starts * 100) : 0,
      feedback: Object.fromEntries((feedback.results || []).map((row) => [row.rating, Number(row.count || 0)])),
      note: "Aggregate first-party events only. No names, answers, race results or contact details are collected.",
    });
  }
  if (request.method === "GET" && path === "/api/admin/ai-brain") {
    return reply(request, env, await aiBrainOverview(env));
  }
  if (request.method === "PATCH" && path === "/api/admin/ai-brain") {
    if (!isSuperAdmin(user)) return reply(request, env, { error: "admin_required" }, 403);
    const body = await readJson(request);
    if (body?.confirm !== true) return reply(request, env, { error: "confirmation_required" }, 400);
    const enabled = body.notifications_enabled;
    const reportTime = body.report_time;
    if (enabled !== undefined && typeof enabled !== "boolean") return reply(request, env, { error: "invalid_notification_setting" }, 400);
    if (reportTime !== undefined && (typeof reportTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(reportTime))) {
      return reply(request, env, { error: "invalid_report_time" }, 400);
    }
    if (enabled === undefined && reportTime === undefined) return reply(request, env, { error: "no_settings_provided" }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE ai_brain_settings SET notifications_enabled=COALESCE(?,notifications_enabled),report_time=COALESCE(?,report_time),updated_at=? WHERE id=1")
      .bind(enabled === undefined ? null : Number(enabled), reportTime || null, now).run();
    await env.DB.prepare("INSERT INTO owner_agent_activity(id,actor_user_id,agent_type,action,status,details_json,created_at) VALUES(?,?,'owner','ai_brain_settings_updated','completed',?,?)")
      .bind(randomId(), user.id, JSON.stringify({ notifications_enabled: enabled, report_time: reportTime }), now).run();
    return reply(request, env, { updated: true, settings: (await aiBrainOverview(env)).settings });
  }
  if (request.method === "POST" && path === "/api/admin/ai-brain/test-email") {
    if (!isSuperAdmin(user)) return reply(request, env, { error: "admin_required" }, 403);
    const body = await readJson(request);
    if (body?.confirm !== true) return reply(request, env, { error: "confirmation_required" }, 400);
    const delivery = await queueAiBrainEmail(env, {
      eventKey: `test-email:${Date.now()}`,
      subject: "MZ AI Brain test email",
      body: aiBrainEmailText("MZ AI Brain test email", [
        "This is a real delivery test from the MZ Active Admin Portal.",
        "No personal data, payment action or WhatsApp action is included.",
      ]),
      kind: "test_email",
    });
    if (!delivery.queued || !delivery.ok) return reply(request, env, { error: delivery.error || delivery.reason || "email_delivery_failed" }, 502);
    return reply(request, env, { delivered: true, provider_id: delivery.provider_id || "" });
  }
  if (request.method === "POST" && path === "/api/admin/ai-brain/run") {
    if (!isSuperAdmin(user)) return reply(request, env, { error: "admin_required" }, 403);
    const body = await readJson(request);
    if (body?.confirm !== true) return reply(request, env, { error: "confirmation_required" }, 400);
    const result = await runAiBrainDailyReport(env, Date.now(), { force: true });
    return reply(request, env, result);
  }
  if (request.method === "POST" && path === "/api/admin/assistant") {
    return ownerAssistant(request, env);
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/auth-events") {
    // Privileged accounts get a tamper-evident, privacy-safe audit view.
    const events = await env.DB.prepare("SELECT id,user_id,kind,detail,created_at FROM auth_events ORDER BY created_at DESC LIMIT 50").all();
    return reply(request, env, { events: events.results || [], email_delivery: emailDeliveryConfigured(env) ? "configured" : "not_configured" });
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/agents") {
    const snapshot = await ownerBusinessSnapshot(env);
    const tasks = await env.DB.prepare(`SELECT id,agent_type,source,title,status,approval_status,input_json,output_json,error_message,created_at,started_at,completed_at
      FROM owner_agent_tasks ORDER BY created_at DESC LIMIT 100`).all();
    const activity = await env.DB.prepare(`SELECT id,agent_type,action,status,details_json,created_at
      FROM owner_agent_activity ORDER BY created_at DESC LIMIT 100`).all();
    const pending = await env.DB.prepare(`SELECT id,agent_type,title,status,source,approval_status,input_json,output_json,created_at FROM owner_agent_tasks
      WHERE status='completed' AND approval_status='pending' AND json_valid(output_json) AND json_extract(output_json,'$.answer') IS NOT NULL ORDER BY created_at`).all();
    return reply(request, env, { snapshot, pending:pending.results || [], status: env.AI?.run ? "available" : "not_configured", tasks: tasks.results || [], activity: activity.results || [] });
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/athletes") {
    const directory = await athleteCrmDirectory(env, {
      q: requestUrl.searchParams.get("q"), filter: requestUrl.searchParams.get("filter"),
      sort: requestUrl.searchParams.get("sort"), limit: requestUrl.searchParams.get("limit"),
      offset: requestUrl.searchParams.get("offset"),
    });
    const unlinked = await env.DB.prepare("SELECT id,athlete_name,week_start FROM athlete_programs_v2 WHERE athlete_user_id IS NULL ORDER BY week_start DESC").all();
    return reply(request, env, { ...directory, unlinked: unlinked.results || [] });
  }
  const athleteRecommendationMatch = /^\/api\/admin\/athletes\/([\w-]{36})\/recommendations$/.exec(requestUrl.pathname);
  if (request.method === "GET" && athleteRecommendationMatch) {
    const athlete = await athleteCrmById(env, athleteRecommendationMatch[1]);
    if (!athlete) return reply(request, env, { error: "athlete_not_found" }, 404);
    return athleteCrmRecommendations(request, env, user, athlete);
  }
  const athleteInvitationMatch = /^\/api\/admin\/athletes\/([\w-]{36})\/invitations\/(profile|coach)$/.exec(requestUrl.pathname);
  if (request.method === "POST" && athleteInvitationMatch) {
    return (await createAthleteCrmInvitation(request, env, user, athleteInvitationMatch[1], athleteInvitationMatch[2])).response;
  }
  const athleteResendMatch = /^\/api\/admin\/athletes\/([\w-]{36})\/invitations\/([\w-]{36})\/resend$/.exec(requestUrl.pathname);
  if (request.method === "POST" && athleteResendMatch) {
    const invitation = await env.DB.prepare(`SELECT i.*,p.display_name AS coach_name FROM athlete_crm_invitations i
      LEFT JOIN provider_profiles p ON p.user_id=i.coach_user_id WHERE i.id=? AND i.athlete_user_id=?`)
      .bind(athleteResendMatch[2], athleteResendMatch[1]).first();
    if (!invitation) return reply(request, env, { error: "invitation_not_found" }, 404);
    if (!["pending", "email_failed"].includes(invitation.status)) return reply(request, env, { error: "invitation_not_pending" }, 409);
    const athlete = await athleteCrmById(env, athleteResendMatch[1]);
    const token = newInvitationToken();
    await env.DB.prepare("UPDATE athlete_crm_invitations SET token_hash=?,status='pending',updated_at=? WHERE id=?")
      .bind(await sha256(token), new Date().toISOString(), invitation.id).run();
    await recordAthleteCrmEvent(env, athlete.id, user.id, "invitation_resent", "athlete_crm_invitation", invitation.id, { kind: invitation.kind });
    const delivered = await sendAthleteCrmInvitation(env, invitation, athlete, token, invitation.coach_name);
    return delivered
      ? reply(request, env, { ok: true, status: "pending" }, 201)
      : reply(request, env, { error: "email_unavailable", invitation_id: invitation.id }, 503);
  }
  const athleteRevokeMatch = /^\/api\/admin\/athletes\/([\w-]{36})\/connections\/([\w-]{36})\/revoke$/.exec(requestUrl.pathname);
  if (request.method === "POST" && athleteRevokeMatch) {
    const connection = await env.DB.prepare(`SELECT c.id FROM coach_connections c JOIN provider_profiles p ON p.user_id=c.coach_user_id
      WHERE c.id=? AND c.athlete_user_id=? AND c.status='accepted' AND c.workspace_status='active'
        AND p.status='approved' AND p.provider_type='coach'`).bind(athleteRevokeMatch[2], athleteRevokeMatch[1]).first();
    if (!connection) return reply(request, env, { error: "assignment_not_found" }, 404);
    await revokeActiveAthleteAssignment(env, athleteRevokeMatch[1], user.id);
    return reply(request, env, { ok: true, revoked_connection_id: connection.id });
  }
  const athleteReassignMatch = /^\/api\/admin\/athletes\/([\w-]{36})\/reassign$/.exec(requestUrl.pathname);
  if (request.method === "POST" && athleteReassignMatch) {
    return (await createAthleteCrmInvitation(request, env, user, athleteReassignMatch[1], "coach", { reassign: true })).response;
  }
  const athleteDetailMatch = /^\/api\/admin\/athletes\/([\w-]{36})$/.exec(requestUrl.pathname);
  if (request.method === "GET" && athleteDetailMatch) {
    const athlete = await athleteCrmById(env, athleteDetailMatch[1]);
    if (!athlete) return reply(request, env, { error: "athlete_not_found" }, 404);
    return athleteCrmDetail(request, env, athlete);
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/programs") {
    const rows = await env.DB.prepare(`SELECT ap.id,ap.athlete_user_id,ap.athlete_name,ap.athlete_type,ap.week_start,ap.coach_note,ap.created_at,
      p.display_name AS coach_name,au.email AS athlete_email,
      (SELECT COUNT(*) FROM athlete_program_sessions_v2 s WHERE s.program_id=ap.id) AS session_count,
      (SELECT COUNT(*) FROM athlete_program_completions_v2 c JOIN athlete_program_sessions_v2 s ON s.id=c.session_id WHERE s.program_id=ap.id) AS completion_count
      FROM athlete_programs_v2 ap
      LEFT JOIN provider_profiles p ON p.user_id=ap.coach_user_id
      LEFT JOIN users au ON au.id=ap.athlete_user_id
      ORDER BY ap.week_start DESC,ap.created_at DESC LIMIT 300`).all();
    return reply(request, env, {
      programs: (rows.results || []).map((row) => ({ ...row, access_linked: Boolean(row.athlete_user_id) })),
    });
  }
  const assign = /^\/api\/admin\/programs\/([\w-]{36})\/athlete$/.exec(requestUrl.pathname);
  if (request.method === "PATCH" && assign) {
    const body = await readJson(request), athlete = text(body?.athlete_id,36);
    const [update] = await env.DB.batch([
      env.DB.prepare(`UPDATE athlete_programs_v2 SET athlete_user_id=? WHERE id=? AND athlete_user_id IS NULL
        AND EXISTS(SELECT 1 FROM users u WHERE u.id=? AND role='provider' AND NOT EXISTS(SELECT 1 FROM provider_profiles p WHERE p.user_id=u.id))`).bind(athlete,assign[1],athlete),
      env.DB.prepare("INSERT INTO owner_agent_activity(id,actor_user_id,agent_type,action,status,details_json,created_at) SELECT ?,?,'owner','program_assigned','completed',?,? WHERE changes()=1")
        .bind(randomId(),user.id,JSON.stringify({program_id:assign[1],athlete_id:athlete}),new Date().toISOString())
    ]);
    return update.meta.changes ? reply(request,env,{updated:true}) : reply(request,env,{error:"assignment_unavailable"},409);
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/history") {
    const rows = await env.DB.prepare(`SELECT entity_type,from_status,to_status,created_at FROM moderation_events
      UNION ALL SELECT 'registration',NULL,'received',created_at FROM users WHERE role!='admin'
      UNION ALL SELECT 'booking_request',NULL,'received',created_at FROM booking_requests
      ORDER BY created_at DESC LIMIT 100`).all();
    return reply(request,env,{events:rows.results});
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/reports") {
    const [history, authentication, accounts, agents] = await Promise.all([
      env.DB.prepare(`SELECT entity_type,from_status,to_status,created_at FROM moderation_events
        UNION ALL SELECT 'registration',NULL,'received',created_at FROM users WHERE role!='admin'
        UNION ALL SELECT 'booking_request',NULL,'received',created_at FROM booking_requests
        ORDER BY created_at DESC LIMIT 100`).all(),
      env.DB.prepare("SELECT id,user_id,kind,detail,created_at FROM auth_events ORDER BY created_at DESC LIMIT 100").all(),
      env.DB.prepare("SELECT id,actor_user_id,subject_user_id,action,detail,created_at FROM account_events ORDER BY created_at DESC LIMIT 100").all(),
      env.DB.prepare("SELECT id,agent_type,action,status,created_at FROM owner_agent_activity ORDER BY created_at DESC LIMIT 100").all(),
    ]);
    const fullAdmin = isSuperAdmin(user);
    const forViewer = rows => fullAdmin
      ? rows
      : rows.map((row) => ({ ...row, detail: null }));
    return reply(request, env, {
      history: history.results || [],
      authentication: forViewer(authentication.results || []),
      accounts: forViewer(accounts.results || []),
      agents: agents.results || [],
    });
  }
  const agentTaskMatch = /^\/api\/admin\/agents\/([\w-]{36})$/.exec(requestUrl.pathname);
  if (agentTaskMatch && request.method === "PATCH") {
    const body = await readJson(request), decision = body?.decision;
    if (!body || !["approved","rejected"].includes(decision)) return reply(request, env, { error: "invalid_agent_decision" }, 400);
    const task = await env.DB.prepare("SELECT id,status,approval_status,output_json FROM owner_agent_tasks WHERE id=?")
      .bind(agentTaskMatch[1]).first();
    if (!task) return reply(request, env, { error: "agent_task_not_found" }, 404);
    if (!safeParse(task.output_json)?.answer || task.status !== "completed" || task.approval_status !== "pending") return reply(request, env, { error: "agent_task_not_pending" }, 409);
    const now = new Date().toISOString();
    const [updated] = await env.DB.batch([
      env.DB.prepare("UPDATE owner_agent_tasks SET approval_status=? WHERE id=? AND approval_status='pending'").bind(decision,task.id),
      env.DB.prepare("INSERT INTO owner_agent_activity(id,actor_user_id,agent_type,action,status,details_json,created_at) SELECT ?,?,'owner',?,?,?,? WHERE changes()=1")
        .bind(randomId(),user.id,decision,decision,JSON.stringify({task_id:task.id}),now)
    ]);
    if (!updated.meta.changes) return reply(request,env,{error:"agent_task_not_pending"},409);
    return reply(request, env, { updated: true, decision, task_id: task.id });
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/blog") {
    const posts = await env.DB.prepare(`SELECT b.id,b.title,b.summary,b.body,b.language,b.status,b.created_at,p.display_name AS coach_name
      FROM coach_blog_posts b JOIN provider_profiles p ON p.id=b.provider_id WHERE b.status='pending' ORDER BY b.created_at LIMIT 100`).all();
    return reply(request, env, { posts: posts.results || [] });
  }
  const blogReview = /^\/api\/admin\/blog\/([\w-]{36})$/.exec(requestUrl.pathname);
  if (blogReview && request.method === "PATCH") {
    const body = await readJson(request), action = body?.action;
    if (!body || !["publish","return"].includes(action)) return reply(request, env, { error: "invalid_blog_review_action" }, 400);
    const status = action === "publish" ? "published" : "draft", now = new Date().toISOString();
    const result = await env.DB.prepare("UPDATE coach_blog_posts SET status=?,updated_at=?,published_at=? WHERE id=? AND status='pending'")
      .bind(status,now,action === "publish" ? now : null,blogReview[1]).run();
    return result.meta?.changes ? reply(request, env, { updated:true, status }) : reply(request,env,{error:"article_already_reviewed"},409);
  }
  const gallery = /^\/api\/admin\/providers\/([\w-]{36})\/gallery\/([1-3])$/.exec(requestUrl.pathname);
  if (gallery && request.method === "GET") return galleryImage(gallery[1], Number(gallery[2]), request, env, false);
  const cvMatch = /^\/api\/admin\/providers\/([\w-]{36})\/cv$/.exec(requestUrl.pathname);
  if (cvMatch && request.method === "GET") {
    if (!isSuperAdmin(user)) return reply(request, env, { error: "admin_required" }, 403);
    const cv = await env.DB.prepare("SELECT cv_bytes,cv_content_type,cv_file_name,cv_byte_size,cv_updated_at FROM provider_profiles WHERE id=?").bind(cvMatch[1]).first();
    if (!cv?.cv_bytes || !cv.cv_content_type) return reply(request, env, { error: "cv_not_found" }, 404);
    const disposition = `attachment; filename="${safeCvFileName(cv.cv_file_name)}"`;
    return binaryReply(request, env, cv.cv_bytes, cv.cv_content_type, "private, no-store", disposition);
  }
  const photoMatch = /^\/api\/admin\/providers\/([\w-]{36})\/photo$/.exec(new URL(request.url).pathname);
  if (photoMatch && request.method === "GET") {
    const photo = await env.DB.prepare("SELECT profile_photo_bytes,profile_photo_content_type FROM provider_profiles WHERE id=?")
      .bind(photoMatch[1]).first();
    if (!photo?.profile_photo_bytes || !photo.profile_photo_content_type) return reply(request, env, { error: "photo_not_found" }, 404);
    return binaryReply(request, env, photo.profile_photo_bytes, photo.profile_photo_content_type, "private, no-store");
  }
  if (photoMatch && request.method === "PUT") {
    const profile = await env.DB.prepare("SELECT id,status FROM provider_profiles WHERE id=?").bind(photoMatch[1]).first();
    if (!profile || ["rejected","suspended"].includes(profile.status)) return reply(request, env, { error: "provider_not_found" }, 404);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_PROFILE_PHOTO_BYTES) return reply(request, env, { error: "photo_too_large" }, 413);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_PROFILE_PHOTO_BYTES) return reply(request, env, { error: "photo_too_large" }, 413);
    const contentType = profilePhotoType(bytes);
    if (!contentType) return reply(request, env, { error: "invalid_photo" }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE provider_profiles SET profile_photo_bytes=?,profile_photo_content_type=?,profile_photo_updated_at=?,updated_at=? WHERE id=?")
      .bind(bytes, contentType, now, now, profile.id).run();
    return reply(request, env, { photo_uploaded: true, status: profile.status, updated_at: now });
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/applications") {
    const welcomeFields = `w.status AS welcome_email_status,w.attempts AS welcome_attempts,w.error AS welcome_error`;
    const welcomeJoin = `LEFT JOIN coach_welcome_emails w ON w.id=(SELECT id FROM coach_welcome_emails WHERE profile_id=p.id ORDER BY created_at DESC LIMIT 1)`;
    const completeness = `CASE WHEN p.provider_type='coach' THEN (p.specialties_json NOT IN ('[]','') AND p.bio NOT IN ('','Profile awaiting completion by the provider.'))
      WHEN p.provider_type IN ('nutritionist','physiotherapist','sports_massage_therapist') THEN (p.services_json NOT IN ('[]','') AND p.license_number<>'' AND p.license_issuer<>'')
      ELSE (p.bio NOT IN ('','Profile awaiting completion by the provider.')) END AS profile_complete`;
    const providers = await env.DB.prepare(`SELECT p.id,p.user_id,p.qualifications,p.services_json,p.coaching_mode,p.certificate_name,p.certificate_issuer,p.certificate_number,p.license_number,p.license_issuer,p.license_country,p.license_expires_on,p.license_status,p.license_review_note,(SELECT json_group_array(slot) FROM provider_gallery WHERE provider_id=p.id) AS gallery_slots,p.provider_type,p.display_name,p.country,p.city,p.specialties_json,p.languages_json,p.bio,p.experience_years,p.indicative_rate_qar,CASE WHEN p.profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,p.profile_photo_updated_at,CASE WHEN EXISTS(SELECT 1 FROM provider_covers WHERE provider_id=p.id) THEN 1 ELSE 0 END AS has_cover,p.whatsapp_number,p.whatsapp_public,p.social_links_json,p.status,p.review_note,p.submission_state,p.submitted_at,p.pacer_details_json,CASE WHEN p.cv_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_cv,p.cv_file_name,p.cv_byte_size,p.cv_updated_at,p.updated_at,u.email,${completeness},${welcomeFields}
      FROM provider_profiles p JOIN users u ON u.id=p.user_id ${welcomeJoin} WHERE (u.account_status IS NULL OR u.account_status<>'deleted') AND p.status='pending' AND COALESCE(p.submission_state,'submitted')<>'draft' ORDER BY p.created_at LIMIT 100`).all();
    const draftProviders = await env.DB.prepare(`SELECT p.id,p.user_id,p.provider_type,p.display_name,p.country,p.city,p.submission_state,p.submitted_at,p.updated_at,u.email,${completeness}
      FROM provider_profiles p JOIN users u ON u.id=p.user_id WHERE (u.account_status IS NULL OR u.account_status<>'deleted') AND p.status='pending' AND p.submission_state='draft' ORDER BY p.created_at LIMIT 100`).all();
    const approvedProviders = await env.DB.prepare(`SELECT p.id,p.user_id,p.provider_type,p.display_name,p.country,p.city,CASE WHEN p.profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,p.profile_photo_updated_at,CASE WHEN EXISTS(SELECT 1 FROM provider_covers WHERE provider_id=p.id) THEN 1 ELSE 0 END AS has_cover,p.updated_at,u.email,${welcomeFields}
      FROM provider_profiles p JOIN users u ON u.id=p.user_id ${welcomeJoin} WHERE (u.account_status IS NULL OR u.account_status<>'deleted') AND p.status='approved' ORDER BY p.updated_at DESC LIMIT 100`).all();
    const rejectedProviders = await env.DB.prepare(`SELECT p.id,p.user_id,p.provider_type,p.display_name,p.country,p.city,p.review_note,CASE WHEN p.profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,p.profile_photo_updated_at,CASE WHEN EXISTS(SELECT 1 FROM provider_covers WHERE provider_id=p.id) THEN 1 ELSE 0 END AS has_cover,p.updated_at,u.email,${welcomeFields}
      FROM provider_profiles p JOIN users u ON u.id=p.user_id ${welcomeJoin} WHERE (u.account_status IS NULL OR u.account_status<>'deleted') AND p.status='rejected' AND (p.review_note IS NULL OR p.review_note<>'Removed by owner') ORDER BY p.updated_at DESC LIMIT 100`).all();
    const suspendedProviders = await env.DB.prepare(`SELECT p.id,p.user_id,p.provider_type,p.display_name,p.country,p.city,p.review_note,CASE WHEN p.profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,p.profile_photo_updated_at,CASE WHEN EXISTS(SELECT 1 FROM provider_covers WHERE provider_id=p.id) THEN 1 ELSE 0 END AS has_cover,p.updated_at,u.email,${welcomeFields}
      FROM provider_profiles p JOIN users u ON u.id=p.user_id ${welcomeJoin} WHERE (u.account_status IS NULL OR u.account_status<>'deleted') AND p.status='rejected' AND p.review_note='Removed by owner' ORDER BY p.updated_at DESC LIMIT 100`).all();
    const bookings = await env.DB.prepare(`SELECT id,provider_id,(SELECT display_name FROM provider_profiles WHERE id=booking_requests.provider_id) AS coach_name,(SELECT provider_type FROM provider_profiles WHERE id=booking_requests.provider_id) AS provider_type,customer_name,customer_email,customer_phone,city,preferred_date,goal_summary,status,payment_status,session_type,service_name,distance,target_pace,program_duration_months,created_at
      FROM booking_requests ORDER BY CASE WHEN status IN ('received','reviewing') THEN 0 ELSE 1 END, created_at DESC LIMIT 100`).all();
    return reply(request, env, {
      providers: (providers.results || []).map((row) => applicationForViewer({
        ...row, pacer_details: cleanPacerDetails(safeParse(row.pacer_details_json)),
      }, user)),
      draft_providers: (draftProviders.results || []).map((row) => applicationForViewer(row, user)),
      approved_providers: (approvedProviders.results || []).map((row) => applicationForViewer(row, user)),
      rejected_providers: (rejectedProviders.results || []).map((row) => applicationForViewer(row, user)),
      suspended_providers: (suspendedProviders.results || []).map((row) => applicationForViewer(row, user)),
      bookings: bookings.results || [],
    });
  }
  const match = /^\/api\/admin\/providers\/([\w-]{36})$/.exec(new URL(request.url).pathname);
  if (match && request.method === "PATCH") {
    const body = await readJson(request), status = body?.status;
    if (!body || !["approved","rejected","suspended"].includes(status)) return reply(request, env, { error: "invalid_review_status" }, 400);
    const previous = await env.DB.prepare(`SELECT status,provider_type,display_name,review_note,bio,specialties_json,languages_json,qualifications,services_json,license_number,license_issuer,license_expires_on,license_status,license_review_note,submission_state,user_id,(SELECT account_status FROM users WHERE id=user_id) AS account_status
      FROM provider_profiles WHERE id=?`).bind(match[1]).first();
    if (!previous) return reply(request, env, { updated: false }, 404);
    if (status === "approved" && LICENSED_PROVIDER_TYPES.includes(previous.provider_type) && !isSuperAdmin(user)) {
      return reply(request, env, { error: "admin_required" }, 403);
    }
    if (status === "approved" && !accountActive(previous.account_status)) return reply(request, env, { error: "account_not_active" }, 409);
    if (status === "approved" && previous.submission_state === "draft") return reply(request, env, { error: "profile_not_submitted" }, 409);
    const fromStatus = previous.status;
    const ownerRemoved = fromStatus === "rejected" && previous.review_note === "Removed by owner";
    const isSameDecision = (row) => status === "approved" ? row?.status === "approved"
      : status === "rejected" ? row?.status === "rejected" && row.review_note !== "Removed by owner"
        : row?.status === "rejected" && row.review_note === "Removed by owner";
    const allowed = (fromStatus === "pending" && ["approved","rejected"].includes(status))
      || (fromStatus === "approved" && status === "suspended")
      || (ownerRemoved && status === "approved");
    if (!allowed) {
      // A repeated click on the same decision is a no-op, never a second event
      // or a second welcome email.
      if (isSameDecision(previous)) return reply(request, env, { updated: false, already: true, status, welcome_email: await welcomeEmailStatus(env, match[1]) });
      return reply(request, env, { error: "invalid_provider_status_change" }, 409);
    }
    // Incomplete applications can be approved too: the coach then completes the
    // profile from the dashboard. A missing name is the only hard blocker.
    if (status === "approved" && !previous.display_name?.trim()) return reply(request, env, { error: "coach_profile_incomplete" }, 422);
    const licensed = LICENSED_PROVIDER_TYPES.includes(previous.provider_type);
    if (status === "approved" && licensed && (
      !previous.qualifications?.trim() || !cleanList(safeParse(previous.services_json),12,120).length
      || !previous.license_number?.trim() || !previous.license_issuer?.trim() || body.license_verified !== true
    )) return reply(request, env, { error: "professional_license_incomplete" }, 422);
    if (status === "approved" && licensed && previous.license_expires_on && previous.license_expires_on < new Date().toISOString().slice(0,10)) {
      return reply(request, env, { error: "professional_license_expired" }, 422);
    }
    const storedStatus = status === "suspended" ? "rejected" : status;
    const note = status === "suspended" ? "Removed by owner" : status === "approved" ? null : text(body.note,500)||null;
    const verified = status === "approved" && (
      (previous.provider_type === "coach" && body.verified === true)
      || (licensed && body.license_verified === true)
      || (!licensed && previous.provider_type !== "coach" && body.verified === true)
    );
    const nextLicenseStatus = licensed && status === "approved" && body.license_verified === true ? "verified"
      : licensed && status === "rejected" && body.license_verified === false ? "rejected"
        : licensed && status === "suspended" ? "pending" : previous.license_status;
    const nextLicenseNote = licensed && body.license_review_note !== undefined ? text(body.license_review_note,300) : previous.license_review_note || "";
    const now = new Date().toISOString(), approvalEventId = randomId();
    const result = await env.DB.prepare("UPDATE provider_profiles SET status=?,review_note=?,updated_at=?,verified=?,license_status=?,license_review_note=? WHERE id=? AND status=? AND (? IS NULL OR updated_at=?)")
      .bind(storedStatus,note,now,Number(verified),nextLicenseStatus,nextLicenseNote,match[1],fromStatus,body.review_version ?? null,body.review_version ?? null).run();
    const updated = Boolean(result.meta?.changes);
    if (!updated) {
      // Two simultaneous clicks can both read the old status. Only one UPDATE
      // wins; the loser reports the already-completed decision instead of a
      // confusing stale-version error or a second email.
      const current = await env.DB.prepare("SELECT status,review_note FROM provider_profiles WHERE id=?").bind(match[1]).first();
      if (isSameDecision(current)) return reply(request, env, { updated: false, already: true, status, welcome_email: await welcomeEmailStatus(env, match[1]) });
      return reply(request, env, { error: "profile_changed_reload_review" }, 409);
    }
    await env.DB.prepare(`INSERT INTO moderation_events(id,actor_user_id,entity_type,entity_id,from_status,to_status,created_at) VALUES(?,?,'provider_profile',?,?,?,?)`)
      .bind(approvalEventId,user.id,match[1],fromStatus,status,now).run();
    let welcome_email = null;
    if (status === "approved" && previous.provider_type === "coach") {
      const account = await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(previous.user_id).first();
      if (account?.email) {
        welcome_email = await enqueueCoachWelcome(env, {
          profile_id: match[1], approval_event_id: approvalEventId, user_id: previous.user_id,
          email: account.email, first_name: previous.display_name,
          language: /arabic|عربي/i.test(previous.languages_json || "") ? "ar" : "en",
        });
      }
    }
    return reply(request, env, { updated, status, welcome_email });
  }
  const bookingMatch = /^\/api\/admin\/bookings\/([\w-]{36})$/.exec(new URL(request.url).pathname);
  if (bookingMatch && request.method === "PATCH") {
    const body = await readJson(request), status = body?.status;
    const allowed = {received:["reviewing","accepted","declined","cancelled"],reviewing:["accepted","declined","cancelled"],accepted:["cancelled"]};
    if (!body || body.payment_status || !["reviewing","accepted","declined","cancelled"].includes(status)) return reply(request,env,{error:"invalid_booking_status"},400);
    const previous = await env.DB.prepare("SELECT status,payment_status FROM booking_requests WHERE id=?").bind(bookingMatch[1]).first();
    if (!previous) return reply(request,env,{error:"booking_not_found"},404);
    if (!allowed[previous.status]?.includes(status)) return reply(request,env,{error:"booking_status_changed"},409);
    const [result] = await env.DB.batch([
      env.DB.prepare("UPDATE booking_requests SET status=? WHERE id=? AND status=?").bind(status,bookingMatch[1],previous.status),
      env.DB.prepare("INSERT INTO moderation_events(id,actor_user_id,entity_type,entity_id,from_status,to_status,created_at) SELECT ?,?,'booking_request',?,?,?,? WHERE changes()=1")
        .bind(randomId(),user.id,bookingMatch[1],previous.status,status,new Date().toISOString())
    ]);
    if (!result.meta.changes) return reply(request,env,{error:"booking_status_changed"},409);
    if (status === "accepted") {
      const workspace = await activateWorkspaceForBooking(env, bookingMatch[1]);
      return reply(request,env,{updated:true,status,workspace});
    }
    if (status === "cancelled") await closeWorkspaceForBooking(env, bookingMatch[1]);
    return reply(request,env,{updated:true,status});
  }
  return reply(request, env, { error: "not_found" }, 404);
}

async function authenticated(request, env) {
  const user = await currentUser(request, env);
  return user ? { user } : { response: reply(request, env, { error: "unauthorized" }, 401) };
}

async function readImageBody(request, max = MAX_PROFILE_PHOTO_BYTES) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > max) return { error: "photo_too_large", status: 413 };
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > max) return { error: "invalid_photo", status: 400 };
  const contentType = profilePhotoType(bytes);
  if (!contentType) return { error: "invalid_photo", status: 400 };
  return { bytes, contentType };
}

const POST_SELECT = `SELECT p.*,u.email,pp.display_name,pp.verified,
  (SELECT COUNT(*) FROM community_rsvps r WHERE r.post_id=p.id AND r.response='going') AS going,
  (SELECT COUNT(*) FROM community_rsvps r WHERE r.post_id=p.id AND r.response='interested') AS interested
  FROM community_posts p JOIN users u ON u.id=p.author_user_id
  LEFT JOIN provider_profiles pp ON pp.user_id=p.author_user_id`;

async function loadPost(env, id) {
  return env.DB.prepare(`${POST_SELECT} WHERE p.id=?`).bind(id).first();
}

// Posts inside private communities are never public, including their media and
// comments. Legacy routes predate communities, so enforce the group audience here.
async function postVisibleToViewer(env, post, viewer) {
  if (!post) return false;
  if (!isSuperAdmin(viewer) && viewer?.id !== post.author_user_id) {
    const author = await env.DB.prepare("SELECT profile_visibility FROM users WHERE id=?").bind(post.author_user_id).first();
    if (author?.profile_visibility !== "public") return false;
  }
  if (!post?.community_id) return true;
  if (isSuperAdmin(viewer)) return true;
  const community = await env.DB.prepare("SELECT status,visibility FROM communities WHERE id=?")
    .bind(post.community_id).first();
  if (!community || community.status !== "active") return false;
  if (community.visibility === "public") return true;
  if (!viewer) return false;
  const member = await env.DB.prepare("SELECT 1 AS allowed FROM community_group_members WHERE community_id=? AND user_id=? AND status='active'")
    .bind(post.community_id, viewer.id).first();
  return Boolean(member?.allowed);
}

async function canModifyPost(env, user, post) {
  if (!user || !post) return false;
  if (isSuperAdmin(user)) return true;
  if (post.author_user_id === user.id) return true;
  return false;
}


async function handleRunIqApi(request, env, url) {
  const path = url.pathname, method = request.method;
  if (path === "/api/run-iq/preview" && method === "POST") {
    if (!await rateLimit(request, env, "run-iq-preview", 12)) return reply(request, env, { error: "rate_limited" }, 429);
    const assessment = cleanAssessment(await readJson(request));
    if (!assessment) return reply(request, env, { error: "invalid_assessment" }, 400);
    const preview = analyzeAssessment(assessment);
    const advice = buildAdvice(assessment, preview, []);
    preview.advice = advice.advice;
    return reply(request, env, { assessment, preview });
  }
  if (path === "/api/run-iq/coaches" && method === "GET") {
    const city = text(url.searchParams.get("city") || "", 80).toLowerCase();
    const rows = await env.DB.prepare(`SELECT p.id,p.display_name,p.city,p.country,p.specialties_json,p.services_json,p.languages_json
      FROM provider_profiles p JOIN users u ON u.id=p.user_id
      WHERE p.status='approved' AND p.provider_type='coach' AND ${publicVisibility("u")}
        AND lower(p.specialties_json) LIKE '%run%'
      ORDER BY CASE WHEN lower(p.city)=? THEN 0 ELSE 1 END, p.display_name LIMIT 3`).bind(city).all();
    return reply(request, env, { coaches: (rows.results || []).map(row => ({
      id: row.id, display_name: row.display_name, city: row.city, country: row.country,
      specialties: safeParse(row.specialties_json) || [], services: safeParse(row.services_json) || [],
      languages: safeParse(row.languages_json) || [], profile_url: MOMO_PROFILE_BASE + encodeURIComponent(row.id),
    })) });
  }

  if (path === "/api/run-iq/events" && method === "POST") {
    if (!await rateLimit(request, env, "run-iq-events", 60)) return reply(request, env, { error: "rate_limited" }, 429);
    const body = await readJson(request);
    const names = ["page_view", "assessment_started", "assessment_completed", "results_viewed", "save_plan_clicked", "registration_completed", "plan_saved", "coach_profile_clicked"];
    if (!body || !names.includes(body.event_name) || !text(body.visitor_key, 80) || !text(body.event_key, 180)) {
      return reply(request, env, { error: "invalid_event" }, 400);
    }
    const viewer = await currentUser(request, env);
    const claim = await env.DB.prepare(`INSERT OR IGNORE INTO run_iq_events(id,event_key,event_name,visitor_key,user_id,created_at)
      VALUES(?,?,?,?,?,?)`).bind(randomId(), text(body.event_key, 180), body.event_name,
      text(body.visitor_key, 80), viewer?.id || null, new Date().toISOString()).run();
    return reply(request, env, { recorded: Boolean(claim.meta.changes) });
  }
  if (path === "/api/run-iq/feedback" && method === "POST") {
    if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
    const body = await readJson(request);
    const ratings = ["yes", "somewhat", "not_yet"];
    if (!body || !ratings.includes(body.rating) || !text(body.visitor_key, 80)) return reply(request, env, { error: "invalid_feedback" }, 400);
    const viewer = body.identify === true ? await currentUser(request, env) : null;
    await env.DB.prepare(`INSERT INTO run_iq_feedback(id,visitor_key,user_id,rating,comment,created_at) VALUES(?,?,?,?,?,?)`)
      .bind(randomId(), text(body.visitor_key, 80), viewer?.id || null, body.rating, text(body.comment, 500), new Date().toISOString()).run();
    return reply(request, env, { saved: true });
  }

  const sharedMatch = /^\/api\/run-iq\/shared\/([\w-]{36})$/.exec(path);
  if (sharedMatch && method === "GET") {
    const coachAuth = await authenticated(request, env);
    if (coachAuth.response) return coachAuth.response;
    const coach = await coachProfileForUser(env, coachAuth.user.id);
    if (!coach || coach.status !== "approved" || coach.provider_type !== "coach") {
      return reply(request, env, { error: "approved_coach_required" }, 403);
    }
    const share = await env.DB.prepare("SELECT id FROM run_iq_shares WHERE user_id=? AND coach_user_id=? AND status='active'")
      .bind(sharedMatch[1], coachAuth.user.id).first();
    if (!share) return reply(request, env, { error: "consent_required" }, 403);
    const [record, progress, results, advice] = await Promise.all([
      env.DB.prepare("SELECT assessment_json,preview_json FROM run_iq_assessments WHERE user_id=?").bind(sharedMatch[1]).first(),
      env.DB.prepare(`SELECT COUNT(*) AS planned, SUM(CASE WHEN c.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
        FROM athlete_program_sessions_v2 s JOIN athlete_programs_v2 p ON p.id=s.program_id
        LEFT JOIN athlete_program_completions_v2 c ON c.session_id=s.id AND c.athlete_user_id=p.athlete_user_id
        WHERE p.athlete_user_id=? AND p.source='ai_self'`).bind(sharedMatch[1]).first(),
      env.DB.prepare("SELECT distance_km,time_seconds,pace_label,effort,created_at FROM run_iq_race_results WHERE user_id=? ORDER BY created_at DESC LIMIT 10")
        .bind(sharedMatch[1]).all(),
      env.DB.prepare("SELECT advice_json,created_at FROM run_iq_advice_history WHERE user_id=? ORDER BY created_at DESC LIMIT 3")
        .bind(sharedMatch[1]).all(),
    ]);
    if (!record) return reply(request, env, { error: "report_unavailable" }, 404);
    const assessment = safeParse(record.assessment_json) || {}, preview = safeParse(record.preview_json) || {};
    return reply(request, env, {
      athlete: { level: preview.level || assessment.experience, goal: preview.target || assessment.custom_goal || "" },
      training: { weekly_km: assessment.weekly_km || 0, frequency: assessment.frequency || 0, pace_guidance: preview.paces || null },
      progress: { planned: Number(progress?.planned || 0), completed: Number(progress?.completed || 0) },
      recent_results: (results.results || []).map(row => ({
        distance_km: row.distance_km, time_seconds: row.time_seconds, pace_label: row.pace_label,
        effort: row.effort, created_at: row.created_at,
      })),
      recommendations: (advice.results || []).map(row => ({ advice: safeParse(row.advice_json) || [], created_at: row.created_at })),
      note: "Decision support only. No private notes, limitations, location or contact details are shared.",
    });
  }

  const auth = await authenticated(request, env);
  if (auth.response) return auth.response;
  const user = auth.user;
  if (!await isMemberAccount(env, user)) return reply(request, env, { error: "member_account_required" }, 403);

  if (path === "/api/run-iq/save" && method === "POST") {
    if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
    const body = await readJson(request), assessment = cleanAssessment(body?.assessment);
    if (!assessment) return reply(request, env, { error: "invalid_assessment" }, 400);
    const preview = analyzeAssessment(assessment), weekStart = mondayOf();
    const advice = buildAdvice(assessment, preview, []);
    preview.advice = advice.advice;
    const existing = await env.DB.prepare("SELECT program_id FROM run_iq_plans WHERE user_id=?").bind(user.id).first();
    if (existing) return reply(request, env, { error: "plan_exists", program_id: existing.program_id }, 409);
    const plan = buildStarterPlan(assessment, preview, weekStart);
    const programId = randomId(), now = new Date().toISOString();
    const statements = [
      env.DB.prepare(`INSERT INTO run_iq_assessments(user_id,assessment_json,preview_json,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET assessment_json=excluded.assessment_json,preview_json=excluded.preview_json,updated_at=excluded.updated_at`)
        .bind(user.id, JSON.stringify(assessment), JSON.stringify(preview), now),
      env.DB.prepare(`INSERT INTO athlete_programs_v2(id,coach_user_id,athlete_user_id,athlete_name,athlete_phone,athlete_type,week_start,coach_note,created_at,source)
        VALUES(?,?,?,?,?, 'runner', ?,?,?,'ai_self')`)
        .bind(programId, user.id, user.id, text(body?.name, 80) || "MZActive Athlete",
          text(body?.phone, 40) || "", weekStart, plan.coach_note, now),
    ];
    plan.sessions.forEach((session, index) => {
      statements.push(env.DB.prepare(`INSERT INTO athlete_program_sessions_v2(id,program_id,session_code,day_key,sport_type,details,sort_order)
        VALUES(?,?,?,?,?,?,?)`).bind(randomId(), programId, `RIQ-${String(index + 1).padStart(2, "0")}`,
          session.day_key, session.sport === "recovery" ? "recovery" : session.sport === "strength" ? "strength" : "run",
          session.detail, index));
    });
    statements.push(env.DB.prepare("INSERT INTO run_iq_plans(user_id,assessment_id,program_id,created_at) VALUES(?,?,?,?)")
      .bind(user.id, user.id, programId, now));
    statements.push(env.DB.prepare("INSERT INTO run_iq_advice_history(id,user_id,fingerprint,advice_json,created_at) VALUES(?,?,?,?,?)")
      .bind(randomId(), user.id, advice.fingerprint, JSON.stringify(advice.advice), now));
    await env.DB.batch(statements);
    return reply(request, env, { saved: true, program_id: programId, week_start: weekStart, sessions: plan.sessions.length }, 201);
  }

  if (path === "/api/run-iq/me" && method === "GET") {
    const [assessment, planRow, adviceRows, raceRows] = await Promise.all([
      env.DB.prepare("SELECT * FROM run_iq_assessments WHERE user_id=?").bind(user.id).first(),
      env.DB.prepare("SELECT * FROM run_iq_plans WHERE user_id=?").bind(user.id).first(),
      env.DB.prepare("SELECT advice_json,created_at FROM run_iq_advice_history WHERE user_id=? ORDER BY created_at DESC LIMIT 6").bind(user.id).all(),
      env.DB.prepare("SELECT * FROM run_iq_race_results WHERE user_id=? ORDER BY created_at DESC LIMIT 10").bind(user.id).all(),
    ]);
    if (!assessment) return reply(request, env, { assessment: null, preview: null, program: null, shares: [], advice: [], race_results: [] });
    let program = null;
    if (planRow) {
      const rows = await env.DB.prepare(`SELECT s.id,s.session_code,s.day_key,s.sport_type,s.details,s.sort_order,
          c.completed_at,c.actual_km,c.duration_minutes,l.effort,l.notes,l.pace
        FROM athlete_program_sessions_v2 s
        LEFT JOIN athlete_program_completions_v2 c ON c.session_id=s.id AND c.athlete_user_id=?
        LEFT JOIN run_iq_workout_logs l ON l.session_id=s.id AND l.user_id=?
        WHERE s.program_id=? ORDER BY s.sort_order`).bind(user.id, user.id, planRow.program_id).all();
      program = { id: planRow.program_id, sessions: rows.results || [] };
    }
    const shares = await env.DB.prepare(`SELECT s.id,s.coach_user_id,s.status,s.created_at,s.revoked_at,p.display_name AS coach_name,p.city
      FROM run_iq_shares s JOIN provider_profiles p ON p.user_id=s.coach_user_id WHERE s.user_id=? ORDER BY s.created_at DESC`)
      .bind(user.id).all();
    return reply(request, env, {
      assessment: safeParse(assessment.assessment_json), preview: safeParse(assessment.preview_json),
      program, shares: shares.results || [],
      advice: (adviceRows.results || []).map(row => ({ advice: safeParse(row.advice_json) || [], created_at: row.created_at })),
      race_results: raceRows.results || [],
    });
  }

  if (path === "/api/run-iq/race-result" && method === "POST") {
    if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
    const body = await readJson(request);
    const record = await env.DB.prepare("SELECT preview_json FROM run_iq_assessments WHERE user_id=?").bind(user.id).first();
    const storedTarget = safeParse(record?.preview_json)?.paces?.targetPace || null;
    const target = Number(body?.target_pace) || storedTarget || null;
    const result = analyzeRaceResult({ distance: body?.distance, time: body?.time, effort: body?.effort }, target);
    if (!result) return reply(request, env, { error: "invalid_race_result" }, 400);
    await env.DB.prepare(`INSERT INTO run_iq_race_results(id,user_id,distance_km,time_seconds,pace_label,target_pace_label,effort,notes,result_json,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(randomId(), user.id, result.distance_km, result.time_seconds,
      result.pace_label, target ? formatPace(target) : "", result.effort, text(body?.notes, 500), JSON.stringify(result), new Date().toISOString()).run();
    return reply(request, env, { saved: true, result }, 201);
  }

  const logMatch = /^\/api\/run-iq\/sessions\/([\w-]{36})\/log$/.exec(path);
  if (logMatch && method === "POST") {
    if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
    const session = await env.DB.prepare(`SELECT s.id FROM athlete_program_sessions_v2 s
      JOIN athlete_programs_v2 p ON p.id=s.program_id WHERE s.id=? AND p.athlete_user_id=?`)
      .bind(logMatch[1], user.id).first();
    if (!session) return reply(request, env, { error: "session_unavailable" }, 404);
    const body = await readJson(request), km = Number(body?.actual_km), minutes = Number(body?.duration_minutes);
    const effort = ["easy", "moderate", "hard"].includes(body?.effort) ? body.effort : "";
    if (!Number.isFinite(km) || km < 0 || km > 500 || !Number.isInteger(minutes) || minutes < 0 || minutes > 720 || !effort) {
      return reply(request, env, { error: "invalid_workout_log" }, 400);
    }
    const pace = km > 0 && minutes > 0
      ? `${Math.floor(minutes / km)}:${String(Math.round((minutes / km - Math.floor(minutes / km)) * 60)).padStart(2, "0")}/km`
      : null;
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO athlete_program_completions_v2(session_id,athlete_user_id,completed_at,actual_km,duration_minutes)
        VALUES(?,?,?,?,?) ON CONFLICT(session_id,athlete_user_id) DO UPDATE SET
        completed_at=excluded.completed_at,actual_km=excluded.actual_km,duration_minutes=excluded.duration_minutes`)
        .bind(session.id, user.id, now, km, minutes),
      env.DB.prepare(`INSERT INTO run_iq_workout_logs(id,user_id,session_id,effort,notes,pace,created_at)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET effort=excluded.effort,notes=excluded.notes,pace=excluded.pace,created_at=excluded.created_at`)
        .bind(randomId(), user.id, session.id, effort, text(body?.notes, 500), pace, now),
    ]);
    return reply(request, env, { logged: true, pace });
  }

  if (path === "/api/run-iq/share" && method === "POST") {
    if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
    const body = await readJson(request);
    if (body?.consent !== true) return reply(request, env, { error: "consent_required" }, 400);
    const coach = await env.DB.prepare(`SELECT p.id,p.user_id FROM provider_profiles p JOIN users u ON u.id=p.user_id
      WHERE p.id=? AND p.status='approved' AND p.provider_type='coach' AND ${publicVisibility("u")}
      AND lower(p.specialties_json) LIKE '%run%'`).bind(text(body?.coach_user_id, 36)).first();
    if (!coach) return reply(request, env, { error: "coach_unavailable" }, 404);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO run_iq_shares(id,user_id,coach_user_id,status,created_at,revoked_at)
      VALUES(?,?,?,'active',?,NULL) ON CONFLICT(user_id,coach_user_id) DO UPDATE SET status='active',revoked_at=NULL,created_at=excluded.created_at`)
      .bind(randomId(), user.id, coach.user_id, now).run();
    return reply(request, env, { shared: true, coach_user_id: coach.user_id });
  }
  const revokeMatch = /^\/api\/run-iq\/share\/([\w-]{36})$/.exec(path);
  if (revokeMatch && method === "DELETE") {
    const updated = await env.DB.prepare("UPDATE run_iq_shares SET status='revoked',revoked_at=? WHERE user_id=? AND coach_user_id=? AND status='active'")
      .bind(new Date().toISOString(), user.id, revokeMatch[1]).run();
    return updated.meta.changes ? reply(request, env, { revoked: true }) : reply(request, env, { error: "share_not_active" }, 404);
  }
  return reply(request, env, { error: "not_found" }, 404);
}

async function handleCommunityApi(request, env, url) {
  const path = url.pathname, method = request.method;

  // Public cover image for an approved provider.
  let match = /^\/api\/providers\/([\w-]{36})\/cover$/.exec(path);
  if (match && method === "GET") {
    const row = await env.DB.prepare(`SELECT c.bytes,c.content_type FROM provider_covers c
      JOIN provider_profiles p ON p.id=c.provider_id JOIN users u ON u.id=p.user_id
      WHERE c.provider_id=? AND p.status='approved' AND ${publicVisibility("u")}`).bind(match[1]).first();
    return row ? binaryReply(request, env, row.bytes, row.content_type, "public, max-age=3600")
      : reply(request, env, { error: "photo_not_found" }, 404);
  }

  // Private cover image management. Approved coaches keep public visibility.
  if (path === "/api/me/profile/cover" && ["GET", "PUT", "DELETE"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const user = auth.user;
    if (isSuperAdmin(user)) return reply(request, env, { error: "provider_profile_required" }, 403);
    const profile = await coachProfileForUser(env, user.id);
    if (!profile) return reply(request, env, { error: "provider_unavailable" }, 404);
    if (method === "GET") {
      const row = await env.DB.prepare("SELECT bytes,content_type,updated_at FROM provider_covers WHERE provider_id=?").bind(profile.id).first();
      return row ? binaryReply(request, env, row.bytes, row.content_type, "private, no-store")
        : reply(request, env, { error: "photo_not_found" }, 404);
    }
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM provider_covers WHERE provider_id=?").bind(profile.id).run();
      return reply(request, env, { cover_removed: true });
    }
    const image = await readImageBody(request);
    if (image.error) return reply(request, env, { error: image.error }, image.status);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO provider_covers(provider_id,bytes,content_type,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(provider_id) DO UPDATE SET bytes=excluded.bytes,content_type=excluded.content_type,updated_at=excluded.updated_at`)
      .bind(profile.id, image.bytes, image.contentType, now).run();
    return reply(request, env, { cover_uploaded: true, status: profile.status, updated_at: now });
  }

  // Public and private achievement lists. Approved coach entries publish immediately.
  match = /^\/api\/providers\/([\w-]{36})\/achievements$/.exec(path);
  if (match && method === "GET") {
    const rows = await env.DB.prepare(`SELECT a.id,a.title,a.details,a.awarded_year FROM provider_achievements a
      JOIN provider_profiles p ON p.id=a.provider_id JOIN users u ON u.id=p.user_id
      WHERE a.provider_id=? AND a.status='published' AND p.status='approved' AND ${publicVisibility("u")}
      ORDER BY a.awarded_year DESC,a.created_at DESC LIMIT 12`).bind(match[1]).all();
    return reply(request, env, { achievements: rows.results || [] });
  }
  if (path === "/api/me/achievements" && ["GET", "POST"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const profile = await coachProfileForUser(env, auth.user.id);
    if (!profile) return reply(request, env, { error: "provider_unavailable" }, 404);
    if (method === "GET") {
      const rows = await env.DB.prepare("SELECT id,title,details,awarded_year,status,created_at FROM provider_achievements WHERE provider_id=? ORDER BY created_at DESC LIMIT 50").bind(profile.id).all();
      return reply(request, env, { achievements: rows.results || [] });
    }
    const body = await readJson(request), title = text(body?.title, 120), details = text(body?.details, 600);
    if (!body || !title) return reply(request, env, { error: "achievement_title_required" }, 400);
    const status = profile.status === "approved" ? "published" : "pending", now = new Date().toISOString(), id = randomId();
    await env.DB.prepare(`INSERT INTO provider_achievements(id,provider_id,title,details,awarded_year,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(id, profile.id, title, details, sanitizeYear(body.awarded_year), status, now, now).run();
    return reply(request, env, { id, status }, 201);
  }
  match = /^\/api\/me\/achievements\/([\w-]{36})$/.exec(path);
  if (match && ["PUT", "DELETE"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const profile = await coachProfileForUser(env, auth.user.id);
    const item = await env.DB.prepare("SELECT id,provider_id,status FROM provider_achievements WHERE id=?").bind(match[1]).first();
    if (!profile || !item || item.provider_id !== profile.id) return reply(request, env, { error: "achievement_not_found" }, 404);
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM provider_achievements WHERE id=?").bind(item.id).run();
      return reply(request, env, { removed: true });
    }
    const body = await readJson(request), title = text(body?.title, 120), details = text(body?.details, 600);
    if (!body || !title) return reply(request, env, { error: "achievement_title_required" }, 400);
    const status = profile.status === "approved" ? "published" : "pending";
    const result = await env.DB.prepare("UPDATE provider_achievements SET title=?,details=?,awarded_year=?,status=?,updated_at=? WHERE id=? AND provider_id=?")
      .bind(title, details, sanitizeYear(body.awarded_year), status, new Date().toISOString(), item.id, profile.id).run();
    return result.meta?.changes ? reply(request, env, { updated: true, status }) : reply(request, env, { error: "achievement_not_found" }, 404);
  }

  // Private member profile photo. Only the authenticated owner can read or
  // change it; bytes stay in the existing member sports profile row.
  if (path === "/api/me/sports-profile/photo" && ["GET", "PUT", "DELETE"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (isSuperAdmin(auth.user)) return reply(request, env, { error: "member_profile_unavailable" }, 403);
    if (method === "GET") {
      const row = await env.DB.prepare("SELECT photo_bytes,photo_content_type,photo_updated_at FROM member_sports_profiles WHERE user_id=?").bind(auth.user.id).first();
      if (!row?.photo_bytes) return reply(request, env, { error: "photo_not_found" }, 404);
      return binaryReply(request, env, row.photo_bytes, row.photo_content_type || "image/jpeg", "private, no-store");
    }
    if (method === "DELETE") {
      await env.DB.prepare("UPDATE member_sports_profiles SET photo_bytes=NULL,photo_content_type=NULL,photo_updated_at=NULL,updated_at=? WHERE user_id=?")
        .bind(new Date().toISOString(), auth.user.id).run();
      return reply(request, env, { removed: true });
    }
    const uploaded = await readImageBody(request);
    if (uploaded.error) return reply(request, env, { error: uploaded.error }, uploaded.status);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO member_sports_profiles(user_id,updated_at) VALUES(?,?)").bind(auth.user.id, now).run();
    await env.DB.prepare("UPDATE member_sports_profiles SET photo_bytes=?,photo_content_type=?,photo_updated_at=?,updated_at=? WHERE user_id=?")
      .bind(new Uint8Array(uploaded.bytes), uploaded.contentType, now, now, auth.user.id).run();
    return reply(request, env, { updated: true, photo_updated_at: now });
  }
  if (path === "/api/me/sports-profile" && ["GET", "PUT"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (isSuperAdmin(auth.user)) return reply(request, env, { error: "member_profile_unavailable" }, 403);
    if (method === "GET") {
      const row = await env.DB.prepare("SELECT user_id,display_name,city,sports_json,experience_level,goals,age_range,gender,garmin_public_url,preferred_language,availability_notes,whatsapp_number,country,photo_updated_at,share_with_coaches,updated_at FROM member_sports_profiles WHERE user_id=?").bind(auth.user.id).first();
      const profile = row ? { ...row, share_with_coaches: row.share_with_coaches === 1 || row.share_with_coaches === true, sports: safeParse(row.sports_json) } : {
        user_id: auth.user.id, display_name: "", city: "", sports: [], experience_level: "", goals: "",
        age_range: "", gender: "", garmin_public_url: "", preferred_language: "", availability_notes: "",
        whatsapp_number: "", country: "Qatar", photo_updated_at: null, share_with_coaches: false, updated_at: null,
      };
      return reply(request, env, { profile });
    }
    const body = await readJson(request);
    if (!body) return reply(request, env, { error: "invalid_profile" }, 400);
    const garmin = cleanGarminPublicUrl(body.garmin_public_url);
    if (garmin === null) return reply(request, env, { error: "invalid_garmin_url" }, 400);
    const preferred = text(body.preferred_language, 20).toLowerCase();
    const preferredLanguage = ["en", "ar", "english", "arabic"].includes(preferred) ? (preferred.startsWith("a") ? "ar" : "en") : "";
    const shareWithCoaches = body.share_with_coaches === true || body.share_with_coaches === 1 || body.share_with_coaches === "true" ? 1 : 0;
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO member_sports_profiles(user_id,display_name,city,sports_json,experience_level,goals,age_range,gender,garmin_public_url,preferred_language,availability_notes,share_with_coaches,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
      display_name=excluded.display_name,city=excluded.city,sports_json=excluded.sports_json,
      experience_level=excluded.experience_level,goals=excluded.goals,age_range=excluded.age_range,
      gender=excluded.gender,garmin_public_url=excluded.garmin_public_url,
      preferred_language=excluded.preferred_language,availability_notes=excluded.availability_notes,
      share_with_coaches=excluded.share_with_coaches,updated_at=excluded.updated_at`)
      .bind(auth.user.id, text(body.display_name, 80), text(body.city, 80), JSON.stringify(cleanSports(body.sports)),
        text(body.experience_level, 60), text(body.goals, 600), text(body.age_range, 40), text(body.gender, 40), garmin || "",
        preferredLanguage, text(body.availability_notes, 300), shareWithCoaches, now).run();
    const pendingInvites = await env.DB.prepare("SELECT id FROM athlete_crm_invitations WHERE athlete_user_id=? AND kind='profile' AND status IN ('pending','email_failed')")
      .bind(auth.user.id).all();
    if ((pendingInvites.results || []).length) {
      const auditStatements = (pendingInvites.results || []).flatMap((invitation) => [
        env.DB.prepare(`INSERT INTO athlete_crm_events(id,athlete_user_id,actor_user_id,action,entity_type,entity_id,details_json,created_at)
          VALUES(?,?,?,'profile_invite_accepted','athlete_crm_invitation',?,'{}',?)`)
          .bind(randomId(), auth.user.id, auth.user.id, invitation.id, now),
        env.DB.prepare("UPDATE athlete_crm_invitations SET status='accepted',updated_at=?,responded_at=? WHERE id=?")
          .bind(now, now, invitation.id),
      ]);
      await env.DB.batch(auditStatements);
    }
    return reply(request, env, { saved: true, updated_at: now });
  }

  // Follow an approved coach.
  let follow = /^\/api\/(?:coaches|providers)\/([\w-]{36})\/follow$/.exec(path);
  if (follow && ["POST", "DELETE"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const target = await env.DB.prepare(`SELECT id,user_id FROM provider_profiles WHERE id=? AND status='approved' AND provider_type='coach'
      AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=provider_profiles.user_id AND u.profile_visibility<>'public')`).bind(follow[1]).first();
    if (!target) return reply(request, env, { error: "coach_unavailable" }, 404);
    if (target.user_id === auth.user.id) return reply(request, env, { error: "cannot_follow_self" }, 400);
    if (method === "POST") {
      const inserted = await env.DB.prepare("INSERT OR IGNORE INTO user_follows(follower_user_id,coach_user_id,created_at) VALUES(?,?,?)")
        .bind(auth.user.id, target.user_id, new Date().toISOString()).run();
      if (inserted.meta?.changes) await createNotification(env, target.user_id, "new_follower", "New follower", "A community member now follows your profile.", "provider_profile", follow[1]);
    } else {
      await env.DB.prepare("DELETE FROM user_follows WHERE follower_user_id=? AND coach_user_id=?").bind(auth.user.id, target.user_id).run();
    }
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM user_follows WHERE coach_user_id=?").bind(target.user_id).first();
    return reply(request, env, { following: method === "POST", follower_count: Number(count?.count || 0) });
  }
  match = /^\/api\/(?:coaches|providers)\/([\w-]{36})\/followers$/.exec(path);
  if (match && method === "GET") {
    const target = await env.DB.prepare(`SELECT user_id FROM provider_profiles WHERE id=? AND status='approved'
      AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=provider_profiles.user_id AND u.profile_visibility<>'public')`).bind(match[1]).first();
    if (!target) return reply(request, env, { error: "coach_unavailable" }, 404);
    const rows = await env.DB.prepare(`SELECT f.follower_user_id,msp.display_name,f.created_at FROM user_follows f
      JOIN users u ON u.id=f.follower_user_id LEFT JOIN member_sports_profiles msp ON msp.user_id=f.follower_user_id
      WHERE f.coach_user_id=? AND u.profile_visibility='public' ORDER BY f.created_at DESC LIMIT 100`).bind(target.user_id).all();
    const followers = (rows.results || []).map((row) => ({
      follower_user_id: row.follower_user_id,
      display_name: row.display_name || "MZ Active member",
      created_at: row.created_at,
    }));
    return reply(request, env, { followers, follower_count: followers.length });
  }

  // The signed-in member's real following count, used by the private profile.
  if (path === "/api/me/following/count" && method === "GET") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM user_follows WHERE follower_user_id=?").bind(auth.user.id).first();
    return reply(request, env, { following_count: Number(row?.count || 0) });
  }

  // Community feed, posts and media.
  if (path === "/api/community/posts" && ["GET", "POST"].includes(method)) {
    const viewer = await currentUser(request, env);
    if (method === "GET") {
      const kind = text(url.searchParams.get("kind") || "", 30), sport = text(url.searchParams.get("sport") || "", 40);
      const coachId = text(url.searchParams.get("coach_id") || "", 36);
      let coachUser = "";
      if (coachId) coachUser = (await env.DB.prepare("SELECT user_id FROM provider_profiles WHERE id=? AND status='approved'").bind(coachId).first())?.user_id || "";
      const rows = await env.DB.prepare(`${POST_SELECT}
        WHERE p.status='published' AND ${publicVisibility("u")} AND (p.community_id IS NULL OR EXISTS(
          SELECT 1 FROM communities c WHERE c.id=p.community_id AND c.status='active' AND c.visibility='public'))
        AND (?='' OR p.kind=?) AND (?='' OR p.sport=?) AND (?='' OR p.author_user_id=?)
        ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT 100`)
        .bind(kind, COMMUNITY_KINDS.includes(kind) ? kind : kind, sport, sport, coachUser, coachUser).all();
      return reply(request, env, { posts: await enrichPosts(env, rows.results, viewer?.id || "") });
    }
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const body = await readJson(request);
    const kind = COMMUNITY_KINDS.includes(body?.kind) ? body.kind : "post";
    if (kind === "challenge" && !isSuperAdmin(auth.user)) return reply(request, env, { error: "admin_required" }, 403);
    const content = text(body?.body, 4000), sport = SPORTS.includes(text(body?.sport, 40)) ? text(body.sport, 40) : "";
    const language = body?.language === "ar" ? "ar" : "en";
    let startsAt = null;
    if (kind === "event" || kind === "group_session") {
      startsAt = text(body?.starts_at, 40);
      if (!startsAt || !Number.isFinite(Date.parse(startsAt))) return reply(request, env, { error: "start_time_required" }, 400);
      startsAt = new Date(startsAt).toISOString();
    }
    if (!content) return reply(request, env, { error: "post_body_required" }, 400);
    const status = postStatusFor(auth.user, await canPublishImmediately(env, auth.user));
    const now = new Date().toISOString(), id = randomId();
    await env.DB.prepare(`INSERT INTO community_posts(id,author_user_id,kind,body,sport,language,starts_at,location,capacity,status,created_at,updated_at,published_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, auth.user.id, kind, content, sport, language, startsAt,
        text(body?.location, 120), body?.capacity === undefined || body?.capacity === null || body?.capacity === "" ? null : clampInt(body.capacity, 1, 10000),
        status, now, now, status === "published" ? now : null).run();
    return reply(request, env, { id, status, kind }, 201);
  }
  match = /^\/api\/community\/posts\/([\w-]{36})$/.exec(path);
  if (match && ["GET", "PATCH", "DELETE"].includes(method)) {
    const viewer = await currentUser(request, env);
    const post = await loadPost(env, match[1]);
    if (!post || !await postVisibleToViewer(env, post, viewer)) return reply(request, env, { error: "post_not_found" }, 404);
    if (post.status !== "published" && !viewer && method === "GET") return reply(request, env, { error: "post_not_found" }, 404);
    if (post.status !== "published" && viewer?.id !== post.author_user_id && !isSuperAdmin(viewer) && method === "GET") return reply(request, env, { error: "post_not_found" }, 404);
    if (method === "GET") {
      if (post.status === "published" && viewer?.id !== post.author_user_id) await recordPostView(env, post.id, request, viewer);
      const [enriched] = await enrichPosts(env, [post], viewer?.id || "");
      const comments = await env.DB.prepare(`SELECT c.id,c.user_id,c.body,c.status,c.created_at,msp.display_name,pp.display_name AS coach_name
        FROM community_comments c JOIN users u ON u.id=c.user_id
        LEFT JOIN member_sports_profiles msp ON msp.user_id=c.user_id
        LEFT JOIN provider_profiles pp ON pp.user_id=c.user_id
        WHERE c.post_id=? AND (?=1 OR c.status='published') AND u.profile_visibility='public' ORDER BY c.created_at LIMIT 200`)
        .bind(post.id, isSuperAdmin(viewer) || viewer?.id === post.author_user_id ? 1 : 0).all();
      const safeComments = (comments.results || []).map((row) => ({
        id: row.id, user_id: row.user_id, body: row.body, status: row.status, created_at: row.created_at,
        author_name: displayName(row),
      }));
      return reply(request, env, { post: enriched, comments: safeComments });
    }
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await canModifyPost(env, auth.user, post)) return reply(request, env, { error: "forbidden" }, 403);
    if (method === "DELETE") {
      await env.DB.prepare("UPDATE community_posts SET status='hidden',updated_at=? WHERE id=?").bind(new Date().toISOString(), post.id).run();
      return reply(request, env, { hidden: true });
    }
    const body = await readJson(request), content = text(body?.body, 4000);
    if (!content) return reply(request, env, { error: "post_body_required" }, 400);
    // Never resurrect a post a moderator hid just because its author edited it.
    const status = post.status === "hidden" ? "hidden"
      : isSuperAdmin(auth.user) ? post.status : postStatusFor(auth.user, await canPublishImmediately(env, auth.user));
    await env.DB.prepare("UPDATE community_posts SET body=?,sport=?,language=?,status=?,updated_at=? WHERE id=?")
      .bind(content, SPORTS.includes(text(body?.sport, 40)) ? text(body.sport, 40) : post.sport,
        body?.language === "ar" ? "ar" : post.language, status, new Date().toISOString(), post.id).run();
    return reply(request, env, { updated: true, status });
  }
  match = /^\/api\/community\/posts\/([\w-]{36})\/photos\/([1-3])$/.exec(path);
  if (match && ["GET", "PUT"].includes(method)) {
    const post = await env.DB.prepare("SELECT id,author_user_id,status,community_id,visibility FROM community_posts WHERE id=?").bind(match[1]).first();
    if (!post) return reply(request, env, { error: "post_not_found" }, 404);
    const viewer = await currentUser(request, env);
    if (!await postVisibleToViewer(env, post, viewer)) return reply(request, env, { error: "post_not_found" }, 404);
    if (method === "GET") {
      if (post.status !== "published") {
        if (!viewer || (viewer.id !== post.author_user_id && !isSuperAdmin(viewer))) return reply(request, env, { error: "post_not_found" }, 404);
      }
      const row = await env.DB.prepare("SELECT bytes,content_type FROM community_post_photos WHERE post_id=? AND slot=?").bind(post.id, Number(match[2])).first();
      return row ? binaryReply(request, env, row.bytes, row.content_type, "private, no-store")
        : reply(request, env, { error: "photo_not_found" }, 404);
    }
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await canModifyPost(env, auth.user, post)) return reply(request, env, { error: "forbidden" }, 403);
    if (post.status === "hidden") return reply(request, env, { error: "post_hidden" }, 409);
    const image = await readImageBody(request);
    if (image.error) return reply(request, env, { error: image.error }, image.status);
    await env.DB.prepare(`INSERT INTO community_post_photos(id,post_id,slot,bytes,content_type,created_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(post_id,slot) DO UPDATE SET bytes=excluded.bytes,content_type=excluded.content_type,created_at=excluded.created_at`)
      .bind(randomId(), post.id, Number(match[2]), image.bytes, image.contentType, new Date().toISOString()).run();
    return reply(request, env, { photo_uploaded: true, slot: Number(match[2]), status: post.status });
  }
  match = /^\/api\/community\/posts\/([\w-]{36})\/(like|likes)$/.exec(path);
  if (match && ["POST", "DELETE"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const post = await env.DB.prepare("SELECT id,author_user_id,status,community_id FROM community_posts WHERE id=? AND status='published'").bind(match[1]).first();
    if (!post || !await postVisibleToViewer(env, post, auth.user)) return reply(request, env, { error: "post_not_found" }, 404);
    if (method === "POST") {
      await env.DB.prepare("INSERT OR IGNORE INTO community_likes(post_id,user_id,created_at) VALUES(?,?,?)").bind(post.id, auth.user.id, new Date().toISOString()).run();
      if (post.author_user_id !== auth.user.id) await createNotification(env, post.author_user_id, "post_like", "New post like", "A community member liked your post.", "community_post", post.id);
    } else {
      await env.DB.prepare("DELETE FROM community_likes WHERE post_id=? AND user_id=?").bind(post.id, auth.user.id).run();
    }
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM community_likes WHERE post_id=?").bind(post.id).first();
    return reply(request, env, { liked: method === "POST", likes: Number(count?.count || 0) });
  }
  match = /^\/api\/community\/posts\/([\w-]{36})\/comments$/.exec(path);
  if (match && ["GET", "POST"].includes(method)) {
    const post = await env.DB.prepare("SELECT id,author_user_id,status,community_id FROM community_posts WHERE id=?").bind(match[1]).first();
    if (!post || post.status !== "published") return reply(request, env, { error: "post_not_found" }, 404);
    const viewer = await currentUser(request, env);
    if (!await postVisibleToViewer(env, post, viewer)) return reply(request, env, { error: "post_not_found" }, 404);
    if (method === "GET") {
      const rows = await env.DB.prepare(`SELECT c.id,c.user_id,c.body,c.created_at,msp.display_name,pp.display_name AS coach_name
        FROM community_comments c JOIN users u ON u.id=c.user_id
        LEFT JOIN member_sports_profiles msp ON msp.user_id=c.user_id LEFT JOIN provider_profiles pp ON pp.user_id=c.user_id
        WHERE c.post_id=? AND c.status='published' AND u.profile_visibility='public' ORDER BY c.created_at LIMIT 200`).bind(post.id).all();
      const comments = (rows.results || []).map((row) => ({
        id: row.id, user_id: row.user_id, body: row.body, created_at: row.created_at, author_name: displayName(row),
      }));
      return reply(request, env, { comments });
    }
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const body = await readJson(request), content = text(body?.body, 1000);
    if (!content) return reply(request, env, { error: "comment_required" }, 400);
    const now = new Date().toISOString(), id = randomId();
    await env.DB.prepare("INSERT INTO community_comments(id,post_id,user_id,body,status,created_at,updated_at) VALUES(?,?,?,?,'published',?,?)")
      .bind(id, post.id, auth.user.id, content, now, now).run();
    if (post.author_user_id !== auth.user.id) await createNotification(env, post.author_user_id, "new_comment", "New community comment", "A member commented on your post.", "community_post", post.id);
    return reply(request, env, { id, created_at: now }, 201);
  }
  match = /^\/api\/community\/posts\/([\w-]{36})\/rsvp$/.exec(path);
  if (match && ["POST", "DELETE"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const post = await env.DB.prepare("SELECT id,kind,status,community_id,capacity,title,body,author_user_id,cancelled_at FROM community_posts WHERE id=? AND status='published'").bind(match[1]).first();
    if (!post || !["event", "group_session"].includes(post.kind) || post.cancelled_at) return reply(request, env, { error: "event_not_found" }, 404);
    if (!await postVisibleToViewer(env, post, auth.user)) return reply(request, env, { error: "event_not_found" }, 404);
    if (method === "POST") {
      const body = await readJson(request), response = body?.response === "interested" ? "interested" : "going";
      const previous = await env.DB.prepare("SELECT response FROM community_rsvps WHERE post_id=? AND user_id=?").bind(post.id, auth.user.id).first();
      if (response === "going" && previous?.response !== "going" && post.capacity != null) {
        const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM community_rsvps WHERE post_id=? AND response='going'").bind(post.id).first();
        if (Number(count?.count || 0) >= Number(post.capacity)) return reply(request, env, { error: "event_full" }, 409);
      }
      await env.DB.prepare(`INSERT INTO community_rsvps(post_id,user_id,response,created_at) VALUES(?,?,?,?)
        ON CONFLICT(post_id,user_id) DO UPDATE SET response=excluded.response`)
        .bind(post.id, auth.user.id, response, new Date().toISOString()).run();
      if (response === "going" && post.author_user_id !== auth.user.id) {
        await createNotification(env, post.author_user_id, "event_rsvp", "New event RSVP", `${post.title || post.body || "A member"} – going`, "community_post", post.id);
      }
      return reply(request, env, { rsvp: response });
    }
    await env.DB.prepare("DELETE FROM community_rsvps WHERE post_id=? AND user_id=?").bind(post.id, auth.user.id).run();
    return reply(request, env, { rsvp: "" });
  }
  if (path === "/api/community/challenges" && method === "GET") {
    const viewer = await currentUser(request, env);
    const rows = await env.DB.prepare(`${POST_SELECT} WHERE p.status='published' AND p.kind='challenge' ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT 20`).all();
    return reply(request, env, { challenges: await enrichPosts(env, rows.results, viewer?.id || "") });
  }

  // Private coach-athlete connections and messages.
  if (path === "/api/connections" && ["GET", "POST"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (method === "GET") {
      const rows = await env.DB.prepare(`SELECT c.*,coach.display_name AS coach_name,athlete.display_name AS athlete_name,
        (SELECT COUNT(*) FROM coach_messages m WHERE m.connection_id=c.id AND m.sender_user_id<>? AND m.read_at IS NULL) AS unread
        FROM coach_connections c LEFT JOIN provider_profiles coach ON coach.user_id=c.coach_user_id
        LEFT JOIN member_sports_profiles athlete ON athlete.user_id=c.athlete_user_id
        WHERE c.coach_user_id=? OR c.athlete_user_id=? ORDER BY c.updated_at DESC LIMIT 100`)
        .bind(auth.user.id, auth.user.id, auth.user.id).all();
      return reply(request, env, { connections: rows.results || [] });
    }
    const body = await readJson(request);
    const coachId = text(body?.coach_id, 36), coachUserId = text(body?.coach_user_id, 36);
    let coach = coachUserId
      ? await env.DB.prepare("SELECT p.user_id,p.display_name FROM provider_profiles p WHERE p.user_id=? AND p.status='approved' AND p.provider_type='coach'").bind(coachUserId).first()
      : await env.DB.prepare("SELECT p.user_id,p.display_name FROM provider_profiles p WHERE p.id=? AND p.status='approved' AND p.provider_type='coach'").bind(coachId).first();
    if (!coach) return reply(request, env, { error: "coach_unavailable" }, 404);
    if (coach.user_id === auth.user.id) return reply(request, env, { error: "cannot_connect_self" }, 400);
    if (!await isMemberAccount(env, auth.user)) return reply(request, env, { error: "member_account_required" }, 403);
    const now = new Date().toISOString(), id = randomId();
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO coach_connections(id,coach_user_id,athlete_user_id,status,created_at,updated_at)
      VALUES(?,?,?,'pending',?,?)`).bind(id, coach.user_id, auth.user.id, now, now).run();
    if (result.meta?.changes) {
      const href = `/dashboard.html?connection=${id}#myAthletes`;
      await createNotification(env, coach.user_id, "connection_request", "New coaching request", "Open the request in My Athletes.", "coach_connection", id, href);
      const coachUser = await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(coach.user_id).first();
      await queueCoachEmail(env, {
        eventKey: `connection_request:${id}`,
        to: coachUser?.email || "",
        subject: "New coaching request on MZ Active",
        body: `A member sent you a coaching request on MZ Active.\n\nOpen the exact request: https://mzactive.com${href}`,
      });
    }
    const existing = result.meta?.changes ? null : await env.DB.prepare("SELECT id,status FROM coach_connections WHERE coach_user_id=? AND athlete_user_id=?").bind(coach.user_id, auth.user.id).first();
    return reply(request, env, { id: existing?.id || id, status: existing?.status || "pending" }, result.meta?.changes ? 201 : 200);
  }
  match = /^\/api\/connections\/([\w-]{36})$/.exec(path);
  if (match && method === "PATCH") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (isSuperAdmin(auth.user)) return reply(request, env, { error: "forbidden" }, 403);
    const body = await readJson(request), decision = body?.status;
    if (!["accepted", "declined"].includes(decision)) return reply(request, env, { error: "invalid_connection_status" }, 400);
    const connection = await env.DB.prepare("SELECT * FROM coach_connections WHERE id=?").bind(match[1]).first();
    if (!connection || (connection.coach_user_id !== auth.user.id && connection.athlete_user_id !== auth.user.id)) return reply(request, env, { error: "connection_not_found" }, 404);
    if (connection.status !== "pending") return reply(request, env, { error: "connection_already_reviewed" }, 409);
    const athleteDecision = connection.source === "booking" && connection.athlete_user_id === auth.user.id;
    const coachDecision = connection.coach_user_id === auth.user.id;
    if (!athleteDecision && !coachDecision) return reply(request, env, { error: "forbidden" }, 403);
    const booking = connection.booking_id ? await env.DB.prepare("SELECT id,status FROM booking_requests WHERE id=?").bind(connection.booking_id).first() : null;
    if (athleteDecision && decision === "accepted" && (!booking || booking.status !== "accepted")) return reply(request, env, { error: "booking_not_confirmed" }, 409);
    const now = new Date().toISOString();
    const athleteAcceptedAt = athleteDecision || connection.source === "request" ? now : connection.athlete_accepted_at;
    const activate = decision === "accepted" && booking?.status === "accepted" && (athleteDecision || Boolean(athleteAcceptedAt));
    await env.DB.prepare(`UPDATE coach_connections SET status=?,athlete_accepted_at=?,workspace_status=?,workspace_created_at=?,updated_at=? WHERE id=?`)
      .bind(decision, athleteAcceptedAt || null, activate ? "active" : decision === "declined" ? "none" : connection.workspace_status,
        activate ? connection.workspace_created_at || now : null, now, connection.id).run();
    const recipient = athleteDecision ? connection.coach_user_id : connection.athlete_user_id;
    const decisionHref = coachDecision ? "/dashboard.html#myCoach" : `/dashboard.html?connection=${connection.id}#myAthletes`;
    await createNotification(env, recipient, decision === "accepted" && activate ? "workspace_ready" : "connection_reviewed",
      decision === "accepted" && activate ? "Private coaching workspace ready" : decision === "accepted" ? "Connection accepted" : "Connection declined",
      "", "coach_connection", connection.id, decisionHref);
    if (coachDecision) {
      const athleteUser = await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(connection.athlete_user_id).first();
      await queueCoachEmail(env, {
        eventKey: `connection_decision:${connection.id}:${decision}`,
        to: athleteUser?.email || "",
        subject: decision === "accepted" ? "Your coaching request was accepted" : "Your coaching request was declined",
        body: `Your MZ Active coaching request was ${decision}.\n\nView your dashboard: https://mzactive.com${decisionHref}`,
      });
    }
    return reply(request, env, { updated: true, status: decision, workspace_active: Boolean(activate) });
  }
  const closeMatch = /^\/api\/connections\/([\w-]{36})\/close$/.exec(path);
  if (closeMatch && method === "POST") {
    const closeAuth = await authenticated(request, env);
    if (closeAuth.response) return closeAuth.response;
    const updated = await env.DB.prepare(`UPDATE coach_connections SET workspace_status='closed',updated_at=?
      WHERE id=? AND coach_user_id=? AND status='accepted' AND workspace_status<>'closed'`)
      .bind(new Date().toISOString(), closeMatch[1], closeAuth.user.id).run();
    if (!updated.meta.changes) return reply(request, env, { error: "relationship_not_active" }, 409);
    return reply(request, env, { closed: true });
  }
  match = /^\/api\/connections\/([\w-]{36})\/messages$/.exec(path);
  if (match && ["GET", "POST"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const connection = await env.DB.prepare("SELECT * FROM coach_connections WHERE id=?").bind(match[1]).first();
    if (!connection || (connection.coach_user_id !== auth.user.id && connection.athlete_user_id !== auth.user.id)) return reply(request, env, { error: "connection_not_found" }, 404);
    if (connection.status !== "accepted") return reply(request, env, { error: "connection_not_accepted" }, 409);
    if (method === "GET") {
      const rows = await env.DB.prepare("SELECT id,sender_user_id,body,created_at,read_at FROM coach_messages WHERE connection_id=? ORDER BY created_at LIMIT 200").bind(connection.id).all();
      await env.DB.prepare("UPDATE coach_messages SET read_at=? WHERE connection_id=? AND sender_user_id<>? AND read_at IS NULL")
        .bind(new Date().toISOString(), connection.id, auth.user.id).run();
      return reply(request, env, { messages: rows.results || [] });
    }
    const body = await readJson(request), content = text(body?.body, 2000);
    if (!content) return reply(request, env, { error: "message_required" }, 400);
    const now = new Date().toISOString(), id = randomId();
    const recipient = auth.user.id === connection.coach_user_id ? connection.athlete_user_id : connection.coach_user_id;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO coach_messages(id,connection_id,sender_user_id,body,created_at) VALUES(?,?,?,?,?)").bind(id, connection.id, auth.user.id, content, now),
      env.DB.prepare(`INSERT INTO user_notifications(id,user_id,type,title,body,entity_type,entity_id,created_at)
        VALUES(?,?,'new_message','New private message','', 'coach_connection',?,?)`).bind(randomId(), recipient, connection.id, now),
    ]);
    await env.DB.prepare("UPDATE coach_connections SET updated_at=? WHERE id=?").bind(now, connection.id).run();
    return reply(request, env, { id, created_at: now }, 201);
  }

  // Coach booking inbox, notifications and real engagement analytics.
  if (path === "/api/dashboard/bookings" && method === "GET") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const profile = await coachProfileForUser(env, auth.user.id);
    if (!isSuperAdmin(auth.user) && profile?.status !== "approved") return reply(request, env, { error: "approved_coach_required" }, 403);
    const rows = isSuperAdmin(auth.user)
      ? await env.DB.prepare(`SELECT b.*,p.display_name AS coach_name,p.provider_type AS provider_type FROM booking_requests b LEFT JOIN provider_profiles p ON p.id=b.provider_id ORDER BY b.created_at DESC LIMIT 200`).all()
      : await env.DB.prepare(`SELECT b.*,p.display_name AS coach_name,p.provider_type AS provider_type FROM booking_requests b JOIN provider_profiles p ON p.id=b.provider_id WHERE p.user_id=? ORDER BY b.created_at DESC LIMIT 200`).bind(auth.user.id).all();
    return reply(request, env, { bookings: rows.results || [] });
  }
  match = /^\/api\/dashboard\/bookings\/([\w-]{36})$/.exec(path);
  if (match && method === "PATCH") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const profile = await coachProfileForUser(env, auth.user.id);
    if (!isSuperAdmin(auth.user) && profile?.status !== "approved") return reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await readJson(request), status = body?.status;
    const allowed = { received: ["reviewing", "accepted", "declined", "cancelled"], reviewing: ["accepted", "declined", "cancelled"], accepted: ["cancelled"] };
    if (!body || body.payment_status || !["reviewing", "accepted", "declined", "cancelled"].includes(status)) return reply(request, env, { error: "invalid_booking_status" }, 400);
    const booking = isSuperAdmin(auth.user)
      ? await env.DB.prepare("SELECT id,status FROM booking_requests WHERE id=?").bind(match[1]).first()
      : await env.DB.prepare(`SELECT b.id,b.status FROM booking_requests b JOIN provider_profiles p ON p.id=b.provider_id WHERE b.id=? AND p.user_id=?`).bind(match[1], auth.user.id).first();
    if (!booking) return reply(request, env, { error: "booking_not_found" }, 404);
    if (!allowed[booking.status]?.includes(status)) return reply(request, env, { error: "booking_status_changed" }, 409);
    const [updated] = await env.DB.batch([
      env.DB.prepare("UPDATE booking_requests SET status=? WHERE id=? AND status=?").bind(status, booking.id, booking.status),
      env.DB.prepare("INSERT INTO moderation_events(id,actor_user_id,entity_type,entity_id,from_status,to_status,created_at) SELECT ?,?,'booking_request',?,?,?,? WHERE changes()=1")
        .bind(randomId(), auth.user.id, booking.id, booking.status, status, new Date().toISOString()),
    ]);
    if (!updated.meta?.changes) return reply(request, env, { error: "booking_status_changed" }, 409);
    if (status === "accepted") {
      const workspace = await activateWorkspaceForBooking(env, booking.id);
      return reply(request, env, { updated: true, status, workspace });
    }
    if (status === "cancelled") await closeWorkspaceForBooking(env, booking.id);
    return reply(request, env, { updated: true, status });
  }
  match = /^\/api\/dashboard\/notifications(?:\/([\w-]{36}))?$/.exec(path);
  if (match && ["GET", "PATCH"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (method === "GET") {
      const rows = await env.DB.prepare("SELECT id,type,title,body,entity_type,entity_id,read_at,created_at FROM user_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(auth.user.id).all();
      const unread = await env.DB.prepare("SELECT COUNT(*) AS count FROM user_notifications WHERE user_id=? AND read_at IS NULL").bind(auth.user.id).first();
      return reply(request, env, { notifications: rows.results || [], unread: Number(unread?.count || 0) });
    }
    const body = match[1] ? {} : await readJson(request);
    const id = match[1] || text(body?.id, 36);
    if (id) {
      await env.DB.prepare("UPDATE user_notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL").bind(new Date().toISOString(), id, auth.user.id).run();
    } else {
      await env.DB.prepare("UPDATE user_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL").bind(new Date().toISOString(), auth.user.id).run();
    }
    return reply(request, env, { updated: true });
  }
  if (path === "/api/dashboard/analytics" && method === "GET") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const profile = await coachProfileForUser(env, auth.user.id);
    if (!isSuperAdmin(auth.user) && profile?.status !== "approved") return reply(request, env, { error: "approved_coach_required" }, 403);
    const coachUser = isSuperAdmin(auth.user) ? null : auth.user.id;
    const provider = isSuperAdmin(auth.user) ? null : profile?.id;
    const first = async (sql, ...args) => Number((await env.DB.prepare(sql).bind(...args).first())?.count || 0);
    const analytics = {
      followers: await first("SELECT COUNT(*) AS count FROM user_follows WHERE coach_user_id=?", coachUser || ""),
      profile_views: await first("SELECT COUNT(*) AS count FROM provider_profile_views WHERE provider_id=?", provider || ""),
      posts: await first("SELECT COUNT(*) AS count FROM community_posts WHERE author_user_id=? AND status='published'", coachUser || ""),
      events: await first("SELECT COUNT(*) AS count FROM community_posts WHERE author_user_id=? AND status='published' AND kind IN ('event','group_session')", coachUser || ""),
      post_likes: await first("SELECT COUNT(*) AS count FROM community_likes l JOIN community_posts p ON p.id=l.post_id WHERE p.author_user_id=? AND p.status='published'", coachUser || ""),
      post_comments: await first("SELECT COUNT(*) AS count FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE p.author_user_id=? AND p.status='published' AND c.status='published'", coachUser || ""),
      booking_requests: await first("SELECT COUNT(*) AS count FROM booking_requests WHERE provider_id=?", provider || ""),
      open_bookings: await first("SELECT COUNT(*) AS count FROM booking_requests WHERE provider_id=? AND status IN ('received','reviewing')", provider || ""),
      accepted_bookings: await first("SELECT COUNT(*) AS count FROM booking_requests WHERE provider_id=? AND status='accepted'", provider || ""),
    };
    return reply(request, env, { analytics });
  }
  if (path === "/api/dashboard/calendar" && method === "GET") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const rows = await env.DB.prepare(`SELECT s.id,s.title,s.description,s.location,s.starts_at,s.status,s.team_id,t.name AS team_name
      FROM training_sessions s JOIN training_teams t ON t.id=s.team_id
      LEFT JOIN training_team_members m ON m.team_id=t.id AND m.user_id=?
      WHERE (t.coach_user_id=? OR m.user_id=?) AND s.status!='cancelled' ORDER BY s.starts_at LIMIT 200`)
      .bind(auth.user.id, auth.user.id, auth.user.id).all();
    const events = (rows.results || []).map((row) => ({ ...row, source: "team_session" }));
    const programRows = await env.DB.prepare(`SELECT p.id,p.athlete_name,p.week_start,s.day_key,s.details,s.sport_type,s.session_code
      FROM athlete_programs_v2 p JOIN athlete_program_sessions_v2 s ON s.program_id=p.id
      WHERE p.coach_user_id=? OR p.athlete_user_id=? ORDER BY p.week_start LIMIT 300`)
      .bind(auth.user.id, auth.user.id).all();
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    for (const row of programRows.results || []) {
      const index = days.indexOf(row.day_key);
      const base = Date.parse(`${row.week_start}T00:00:00Z`);
      if (index < 0 || !Number.isFinite(base)) continue;
      events.push({ id: row.id + ":" + row.session_code, title: `${row.session_code} · ${row.athlete_name}`, description: row.details,
        location: "", starts_at: new Date(base + index * 86400000).toISOString(), status: "planned", source: "training_program" });
    }
    events.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    return reply(request, env, { events: events.slice(0, 300) });
  }
  if (path === "/api/dashboard/feedback" && ["GET", "POST"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (method === "GET") {
      const rows = isSuperAdmin(auth.user)
        ? await env.DB.prepare("SELECT f.*,p.athlete_name FROM training_feedback f JOIN athlete_programs_v2 p ON p.id=f.program_id ORDER BY f.created_at DESC LIMIT 200").all()
        : await env.DB.prepare("SELECT f.*,p.athlete_name FROM training_feedback f JOIN athlete_programs_v2 p ON p.id=f.program_id WHERE f.coach_user_id=? OR f.athlete_user_id=? ORDER BY f.created_at DESC LIMIT 200")
          .bind(auth.user.id, auth.user.id).all();
      return reply(request, env, { feedback: rows.results || [] });
    }
    const body = await readJson(request), programId = text(body?.program_id, 36), content = text(body?.body, 2000);
    const rating = body?.rating === undefined || body?.rating === null || body?.rating === "" ? null : clampInt(body.rating, 1, 5);
    if (!body || !programId || !content || (body.rating != null && !Number.isInteger(Number(body.rating)))) return reply(request, env, { error: "feedback_required" }, 400);
    const program = await env.DB.prepare("SELECT id,coach_user_id,athlete_user_id FROM athlete_programs_v2 WHERE id=? AND athlete_user_id=?").bind(programId, auth.user.id).first();
    if (!program) return reply(request, env, { error: "program_unavailable" }, 404);
    const id = randomId(), now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO training_feedback(id,program_id,coach_user_id,athlete_user_id,rating,body,created_at) VALUES(?,?,?,?,?,?,?)`)
      .bind(id, program.id, program.coach_user_id, auth.user.id, rating, content, now).run();
    await createNotification(env, program.coach_user_id, "training_feedback", "New athlete feedback", "An athlete shared feedback on a training program.", "training_program", program.id);
    return reply(request, env, { id, created_at: now }, 201);
  }
  if (path === "/api/dashboard/inbox" && method === "GET") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    const profile = await coachProfileForUser(env, auth.user.id);
    const canSeeBookings = isSuperAdmin(auth.user) || profile?.status === "approved";
    const [bookings, notifications] = await Promise.all([
      canSeeBookings
        ? (isSuperAdmin(auth.user)
          ? env.DB.prepare("SELECT id,customer_name,status,city,created_at FROM booking_requests ORDER BY created_at DESC LIMIT 50").all()
          : env.DB.prepare(`SELECT b.id,b.customer_name,b.status,b.city,b.created_at FROM booking_requests b
              JOIN provider_profiles p ON p.id=b.provider_id WHERE p.user_id=? ORDER BY b.created_at DESC LIMIT 50`).bind(auth.user.id).all())
        : Promise.resolve({ results: [] }),
      env.DB.prepare("SELECT id,type,title,body,entity_type,entity_id,read_at,created_at FROM user_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(auth.user.id).all(),
    ]);
    return reply(request, env, { notifications: notifications.results || [], bookings: bookings.results || [] });
  }

  // Admin community moderation and AI-assisted challenge drafting.
  if (path === "/api/admin/community" && method === "GET") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await hasManagementPermission(env, auth.user, "management.view") || !await hasManagementPermission(env, auth.user, requiredManagementPermission(path))) return reply(request, env, { error: "forbidden" }, 403);
    const [pendingPosts, recentPosts, pendingComments, achievements] = await Promise.all([
      env.DB.prepare(`${POST_SELECT} WHERE p.status='pending' ORDER BY p.created_at LIMIT 100`).all(),
      env.DB.prepare(`${POST_SELECT} ORDER BY p.created_at DESC LIMIT 100`).all(),
      env.DB.prepare(`SELECT c.id,c.body,c.status,c.created_at,u.email FROM community_comments c JOIN users u ON u.id=c.user_id WHERE c.status='hidden' OR EXISTS(SELECT 1 FROM community_posts p WHERE p.id=c.post_id AND p.status='pending') ORDER BY c.created_at DESC LIMIT 100`).all(),
      env.DB.prepare(`SELECT a.id,a.title,a.details,a.status,u.email,p.display_name FROM provider_achievements a JOIN provider_profiles p ON p.id=a.provider_id JOIN users u ON u.id=p.user_id WHERE a.status='pending' ORDER BY a.created_at LIMIT 100`).all(),
    ]);
    return reply(request, env, { snapshot: await ownerBusinessSnapshot(env), pending_posts: await enrichPosts(env, pendingPosts.results, auth.user.id), posts: await enrichPosts(env, recentPosts.results, auth.user.id), comments: pendingComments.results || [], achievements: achievements.results || [] });
  }
  match = /^\/api\/admin\/community\/posts\/([\w-]{36})$/.exec(path);
  if (match && method === "PATCH") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await hasManagementPermission(env, auth.user, "management.view") || !await hasManagementPermission(env, auth.user, requiredManagementPermission(path))) return reply(request, env, { error: "forbidden" }, 403);
    const body = await readJson(request), status = body?.status;
    if (!["pending", "published", "hidden"].includes(status)) return reply(request, env, { error: "invalid_moderation_status" }, 400);
    const now = new Date().toISOString();
    const result = await env.DB.prepare("UPDATE community_posts SET status=?,published_at=?,updated_at=? WHERE id=?")
      .bind(status, status === "published" ? now : null, now, match[1]).run();
    if (!result.meta?.changes) return reply(request, env, { error: "post_not_found" }, 404);
    const post = await env.DB.prepare("SELECT author_user_id FROM community_posts WHERE id=?").bind(match[1]).first();
    await createNotification(env, post?.author_user_id, "post_reviewed", status === "published" ? "Post published" : "Post updated", "", "community_post", match[1]);
    return reply(request, env, { updated: true, status });
  }
  match = /^\/api\/admin\/community\/comments\/([\w-]{36})$/.exec(path);
  if (match && method === "PATCH") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await hasManagementPermission(env, auth.user, "management.view") || !await hasManagementPermission(env, auth.user, requiredManagementPermission(path))) return reply(request, env, { error: "forbidden" }, 403);
    const body = await readJson(request), status = body?.status;
    if (!["published", "hidden"].includes(status)) return reply(request, env, { error: "invalid_moderation_status" }, 400);
    const result = await env.DB.prepare("UPDATE community_comments SET status=?,updated_at=? WHERE id=?").bind(status, new Date().toISOString(), match[1]).run();
    return result.meta?.changes ? reply(request, env, { updated: true, status }) : reply(request, env, { error: "comment_not_found" }, 404);
  }
  if (path === "/api/admin/community/challenges" && ["GET", "POST"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await hasManagementPermission(env, auth.user, "management.view") || !await hasManagementPermission(env, auth.user, requiredManagementPermission(path))) return reply(request, env, { error: "forbidden" }, 403);
    if (method === "GET") {
      const rows = await env.DB.prepare(`${POST_SELECT} WHERE p.kind='challenge' ORDER BY p.created_at DESC LIMIT 50`).all();
      return reply(request, env, { challenges: await enrichPosts(env, rows.results, auth.user.id) });
    }
    const body = await readJson(request), content = text(body?.body, 2000);
    if (!content) return reply(request, env, { error: "challenge_required" }, 400);
    const now = new Date().toISOString(), id = randomId();
    await env.DB.prepare(`INSERT INTO community_posts(id,author_user_id,kind,body,sport,language,status,created_at,updated_at,published_at)
      VALUES(?,?,'challenge',?,?,?,'published',?,?,?)`).bind(id, auth.user.id, content,
        SPORTS.includes(text(body?.sport, 40)) ? text(body.sport, 40) : "", body?.language === "ar" ? "ar" : "en", now, now, now).run();
    return reply(request, env, { id, status: "published" }, 201);
  }
  if (path === "/api/admin/community/challenges/generate" && method === "POST") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await hasManagementPermission(env, auth.user, "management.view") || !await hasManagementPermission(env, auth.user, requiredManagementPermission(path))) return reply(request, env, { error: "forbidden" }, 403);
    if (!env.AI || typeof env.AI.run !== "function") return reply(request, env, { error: "assistant_unavailable" }, 503);
    if (!await rateLimit(request, env, "community-challenge", 5)) return reply(request, env, { error: "rate_limited" }, 429);
    if (!await reserveAssistantRequest(env, "community-challenge")) return reply(request, env, { error: "daily_limit_reached" }, 429);
    const body = await readJson(request), prompt = text(body?.prompt, 1200), language = body?.language === "ar" ? "ar" : "en";
    try {
      const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
        messages: [{ role: "system", content: "Create one conservative, inclusive weekly MZ Active community challenge. Return only JSON: {\"body\":\"...\",\"sport\":\"running\"}. No medical claims, prizes, payments or invented participation. Use the requested language." },
          { role: "user", content: prompt || (language === "ar" ? "تحدٍ أسبوعي لمجتمع رياضي في قطر" : "A weekly challenge for a sports community in Qatar") }],
        max_tokens: 240, temperature: 0.3,
      });
      const parsed = JSON.parse(String(result?.response || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
      const content = text(parsed?.body, 2000);
      if (!content) throw Error("invalid_draft");
      const now = new Date().toISOString(), id = randomId();
      await env.DB.prepare(`INSERT INTO community_posts(id,author_user_id,kind,body,sport,language,status,created_at,updated_at)
        VALUES(?,?,'challenge',?,?,?,'pending',?,?)`).bind(id, auth.user.id, content,
          SPORTS.includes(text(parsed?.sport, 40)) ? text(parsed.sport, 40) : "", language, now, now).run();
      return reply(request, env, { id, status: "pending" }, 201);
    } catch {
      return reply(request, env, { error: "assistant_format_error" }, 502);
    }
  }
  if (path === "/api/admin/achievements" && method === "GET") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await hasManagementPermission(env, auth.user, "management.view") || !await hasManagementPermission(env, auth.user, requiredManagementPermission(path))) return reply(request, env, { error: "forbidden" }, 403);
    const rows = await env.DB.prepare(`SELECT a.id,a.title,a.details,a.awarded_year,a.status,p.display_name,u.email FROM provider_achievements a
      JOIN provider_profiles p ON p.id=a.provider_id JOIN users u ON u.id=p.user_id WHERE a.status='pending' ORDER BY a.created_at LIMIT 100`).all();
    return reply(request, env, { achievements: rows.results || [] });
  }
  match = /^\/api\/admin\/achievements\/([\w-]{36})$/.exec(path);
  if (match && method === "PATCH") {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await hasManagementPermission(env, auth.user, "management.view") || !await hasManagementPermission(env, auth.user, requiredManagementPermission(path))) return reply(request, env, { error: "forbidden" }, 403);
    const body = await readJson(request), status = body?.status;
    if (!["published", "hidden"].includes(status)) return reply(request, env, { error: "invalid_moderation_status" }, 400);
    const result = await env.DB.prepare("UPDATE provider_achievements SET status=?,updated_at=? WHERE id=? AND status='pending'")
      .bind(status, new Date().toISOString(), match[1]).run();
    if (!result.meta?.changes) return reply(request, env, { error: "achievement_already_reviewed" }, 409);
    const owner = await env.DB.prepare("SELECT p.user_id FROM provider_achievements a JOIN provider_profiles p ON p.id=a.provider_id WHERE a.id=?").bind(match[1]).first();
    await createNotification(env, owner?.user_id, "achievement_reviewed", status === "published" ? "Achievement published" : "Achievement returned", "", "provider_achievement", match[1]);
    return reply(request, env, { updated: true, status });
  }
  match = /^\/api\/admin\/providers\/([\w-]{36})\/cover$/.exec(path);
  if (match && ["GET", "PUT"].includes(method)) {
    const auth = await authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await hasManagementPermission(env, auth.user, "management.view") || !await hasManagementPermission(env, auth.user, requiredManagementPermission(path))) return reply(request, env, { error: "forbidden" }, 403);
    if (method === "GET") {
      const row = await env.DB.prepare("SELECT bytes,content_type FROM provider_covers WHERE provider_id=?").bind(match[1]).first();
      return row ? binaryReply(request, env, row.bytes, row.content_type, "private, no-store")
        : reply(request, env, { error: "photo_not_found" }, 404);
    }
    const image = await readImageBody(request);
    if (image.error) return reply(request, env, { error: image.error }, image.status);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO provider_covers(provider_id,bytes,content_type,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(provider_id) DO UPDATE SET bytes=excluded.bytes,content_type=excluded.content_type,updated_at=excluded.updated_at`)
      .bind(match[1], image.bytes, image.contentType, now).run();
    return reply(request, env, { cover_uploaded: true, updated_at: now });
  }

  return null;
}

const communityEventAlertApi = {
  authenticated, emailDeliveryConfigured, emailValue, isSuperAdmin, rateLimit, rateLimitScoped,
  randomId, readJson, reply, sendEmail: sendManagementEmail, sha256, text,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (!cors) return json({ error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: Object.fromEntries(cors) });
    const eventAlertResponse = await handleCommunityEventAlerts(request, env, url, communityEventAlertApi, ctx);
    if (eventAlertResponse) return eventAlertResponse;
    const invitationResponse = await handleAthleteInvitationApi(request, env, url);
    if (invitationResponse) return invitationResponse;
    const communityResponse = await handleCommunityApi(request, env, url);
    if (communityResponse) return communityResponse;
    const communityGroupsResponse = await handleCommunityGroupsApi(request, env, url, {
      text, randomId, safeParse, cleanList, clampInt, reply, binaryReply, currentUser, authenticated,
      readJson, readImageBody, createNotification, rateLimit, rateLimitScoped, coachProfileForUser,
      isApprovedCoachUser, canPublishImmediately, postStatusFor, enrichPosts, displayName,
      hasManagementPermission, postSelect: POST_SELECT, sports: SPORTS, now: () => new Date().toISOString(),
    });
    if (communityGroupsResponse) return communityGroupsResponse;
    const workspaceResponse = await handleWorkspaceApi(request, env, url);
    if (workspaceResponse) return workspaceResponse;
    const aiCoachResponse = await handleAiCoachApi(request, env, url, {
      text, randomId, reply, readJson, currentUser, isSuperAdmin, isApprovedCoach, isMemberAccount,
      rateLimitScoped, reserveAssistantRequest, recordAccountEvent,
    });
    if (aiCoachResponse) return aiCoachResponse;
    if (request.method === "GET" && url.pathname === "/api/auth/setup-status") {
      const existing = await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
      return reply(request,env,{setup_available:!existing && Boolean(env.ADMIN_EMAILS && env.ADMIN_SETUP_KEY)});
    }
    if (request.method === "GET" && url.pathname === "/health") return reply(request, env, { ok: true, intake_enabled: env.DATA_COLLECTION_ENABLED === "true" });
    if (request.method === "GET" && url.pathname === "/api/public/contact-config") {
      const contact = managementContactConfig(env);
      return reply(request, env, { contact: { whatsapp: contact.whatsapp, whatsapp_configured: contact.whatsapp_configured } });
    }
    if (url.pathname.startsWith("/api/run-iq")) return handleRunIqApi(request, env, url);
    if (request.method === "POST" && url.pathname === "/api/assistant/chat") return assistantChat(request, env);
    if (request.method === "GET" && url.pathname === "/api/blog/posts") return publicBlogPosts(request, env);
    const publicCampaignMatch = /^\/api\/public\/campaigns\/([\w-]{1,40})$/.exec(url.pathname);
    if (request.method === "GET" && publicCampaignMatch) return publicCampaign(request, env);
    const adminCampaignMatch = /^\/api\/admin\/campaigns\/([\w-]{1,40})$/.exec(url.pathname);
    if (adminCampaignMatch && ["GET","PATCH"].includes(request.method)) return adminCampaign(request, env);
    if (request.method === "POST" && url.pathname === "/api/samla/ai-strategy") return samlaAiStrategy(request, env);
    if (request.method === "GET" && url.pathname === "/api/providers") return publicProviders(url, request, env);
    const profileMatch = /^\/api\/providers\/([\w-]{36})$/.exec(url.pathname);
    if (request.method === "GET" && profileMatch) return publicProviders(url, request, env, profileMatch[1]);
    const gallery = /^\/api\/providers\/([\w-]{36})\/gallery\/([1-3])$/.exec(url.pathname);
    if (request.method === "GET" && gallery) return galleryImage(gallery[1], Number(gallery[2]), request, env, true);
    const ownGallery = /^\/api\/me\/profile\/gallery\/([1-3])$/.exec(url.pathname);
    if (ownGallery && ["GET","PUT"].includes(request.method)) return manageGallery(Number(ownGallery[1]), request, env);
    const publicPhotoMatch = /^\/api\/providers\/([\w-]{36})\/photo$/.exec(url.pathname);
    if (request.method === "GET" && publicPhotoMatch) return publicProfilePhoto(publicPhotoMatch[1], request, env);
    if (request.method === "POST" && url.pathname === "/api/auth/register") return register(request, env);
    if (request.method === "GET" && url.pathname === "/api/pacers") return publicPacers(url, request, env);
    const pacerMatch = /^\/api\/pacers\/([\w-]{1,60})$/.exec(url.pathname);
    if (request.method === "GET" && pacerMatch) return publicPacers(url, request, env, pacerMatch[1]);
    const pacerPhotoMatch = /^\/api\/pacers\/([\w-]{1,60})\/photo$/.exec(url.pathname);
    if (request.method === "GET" && pacerPhotoMatch) return pacerPhoto(request, env, pacerPhotoMatch[1]);
    if (request.method === "POST" && url.pathname === "/api/pacer/register") return pacerRegister(request, env);
    if (url.pathname === "/api/pacer/profile" && ["GET","PUT"].includes(request.method)) return ownerPacer(request, env);
    if (url.pathname === "/api/pacer/profile/photo" && ["PUT","DELETE"].includes(request.method)) return pacerPhotoUpload(request, env);
    if (url.pathname === "/api/pacer/requests" && ["GET","PATCH"].includes(request.method)) return pacerRequests(request, env);
    if (request.method === "POST" && url.pathname === "/api/pacer/requests") return publicPacerRequest(request, env);
    const pacerRequestMatch = /^\/api\/pacer\/requests\/([\w-]{36})$/.exec(url.pathname);
    if (request.method === "PATCH" && pacerRequestMatch) return pacerRequests(request, env, pacerRequestMatch[1]);
    if (url.pathname === "/api/admin/pacers" && request.method === "GET") return adminPacers(request, env);
    const adminPacerMatch = /^\/api\/admin\/pacers\/([\w-]{1,60})$/.exec(url.pathname);
    if (adminPacerMatch && ["GET","PATCH"].includes(request.method)) return adminPacers(request, env, adminPacerMatch[1]);
    if (request.method === "GET" && url.pathname === "/api/admin/pacer-requests") return adminPacerRequests(request, env);
    if (request.method === "POST" && url.pathname === "/api/auth/login") return login(request, env);
    if (request.method === "POST" && url.pathname === "/api/auth/recover") return recoverAdminPassword(request, env);
    if (request.method === "POST" && url.pathname === "/api/auth/forgot-password") return forgotPassword(request, env);
    if (request.method === "POST" && url.pathname === "/api/auth/reset-password") return resetPassword(request, env);
    if (request.method === "POST" && url.pathname === "/api/auth/change-password") return changePassword(request, env);
    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      const user = await currentUser(request, env);
      if (user) {
        const token = request.headers.get("Authorization").slice(7);
        await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
      }
      return reply(request, env, { ok: true });
    }
    if (request.method === "GET" && url.pathname === "/api/me/access") {
      const user = await currentUser(request, env);
      if (!user) return reply(request, env, { error: "unauthorized" }, 401);
      return reply(request, env, await managementAccess(env, user));
    }
    if (request.method === "GET" && url.pathname === "/api/me/completeness") {
      const user = await currentUser(request, env);
      if (!user) return reply(request, env, { error: "unauthorized" }, 401);
      return reply(request, env, { completeness: await ownerCompleteness(env, user) });
    }
    if (request.method === "GET" && url.pathname === "/api/me/contact-config") {
      const user = await currentUser(request, env);
      if (!user) return reply(request, env, { error: "unauthorized" }, 401);
      return reply(request, env, { contact: managementContactConfig(env), purposes: COACH_CONTACT_PURPOSES });
    }
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/me/contacts") {
      const user = await currentUser(request, env);
      if (!user) return reply(request, env, { error: "unauthorized" }, 401);
      if (request.method === "POST") return ownerContactRequest(request, env, user, url.searchParams.get("intent") || "prepare");
      const rows = await env.DB.prepare(`SELECT c.* FROM coach_contact_records c JOIN provider_profiles p ON p.id=c.coach_profile_id
        WHERE p.user_id=? ORDER BY c.created_at DESC LIMIT 50`).bind(user.id).all();
      return reply(request, env, { contacts: rows.results || [] });
    }
    const ownerContactState = /^\/api\/me\/contacts\/([\w-]{36})$/.exec(url.pathname);
    if (ownerContactState && request.method === "PATCH") {
      const user = await currentUser(request, env);
      if (!user) return reply(request, env, { error: "unauthorized" }, 401);
      const body = await readJson(request), status = body?.status;
      if (!COACH_CONTACT_STATES.includes(status)) return reply(request, env, { error: "invalid_contact_status" }, 400);
      const result = await env.DB.prepare(`UPDATE coach_contact_records SET status=?,updated_at=? WHERE id=? AND status<>'completed'
        AND coach_profile_id IN (SELECT id FROM provider_profiles WHERE user_id=?)`)
        .bind(status, new Date().toISOString(), ownerContactState[1], user.id).run();
      return result.meta?.changes ? reply(request, env, { updated: true, status }) : reply(request, env, { error: "contact_not_found" }, 404);
    }
    if ((request.method === "GET" || request.method === "PUT") && url.pathname === "/api/me/profile") {
      const user = await currentUser(request, env);
      if (!user) return reply(request, env, { error: "unauthorized" }, 401);
      if (isSuperAdmin(user)) return reply(request, env, { user: { email:user.email, role:user.role } });
      if (request.method === "PUT") return saveProfile(request, env, user);
      const profile = await env.DB.prepare(`SELECT id,verified,qualifications,services_json,coaching_mode,certificate_name,certificate_issuer,certificate_number,license_number,license_issuer,license_country,license_expires_on,license_status,license_review_note,(SELECT json_group_array(slot) FROM provider_gallery WHERE provider_id=provider_profiles.id) AS gallery_slots,provider_type,display_name,country,city,specialties_json,languages_json,bio,experience_years,indicative_rate_qar,program_durations_json,pacer_details_json,CASE WHEN profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,profile_photo_updated_at,whatsapp_number,whatsapp_public,social_links_json,public_fields_json,status,review_note,submission_state,submitted_at,CASE WHEN cv_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_cv,cv_file_name,cv_byte_size,cv_updated_at,updated_at FROM provider_profiles WHERE user_id=?`).bind(user.id).first();
      return reply(request, env, { profile: profile ? { ...profile, professional_category:{ en:professionalLabel(profile.provider_type,"en"), ar:professionalLabel(profile.provider_type,"ar") }, services:safeParse(profile.services_json), gallery_slots:safeParse(profile.gallery_slots), specialties:safeParse(profile.specialties_json), languages:safeParse(profile.languages_json), program_durations:safeParse(profile.program_durations_json), pacer_details:cleanPacerDetails(safeParse(profile.pacer_details_json)), social_links:safeParse(profile.social_links_json), public_fields:cleanPublicFields(safeParse(profile.public_fields_json)) } : null });
    }
    if (request.method === "PUT" && url.pathname === "/api/me/profile/photo") {
      const user = await currentUser(request, env);
      if (!user || user.role !== "provider") return reply(request, env, { error: "unauthorized" }, 401);
      return uploadProfilePhoto(request, env, user);
    }
    if (["GET", "PUT", "DELETE"].includes(request.method) && url.pathname === "/api/me/profile/cv") {
      const user = await currentUser(request, env);
      if (!user || user.role !== "provider") return reply(request, env, { error: "unauthorized" }, 401);
      return ownerCv(request, env, user, request.method);
    }
    if (request.method === "POST" && url.pathname === "/api/bookings") return createBooking(request, env);
    if (url.pathname.startsWith("/api/admin/")) {
      const user = await currentUser(request, env);
      if (!user) return reply(request, env, { error: "unauthorized" }, 401);
      return adminApplications(request, env, user);
    }
    if (url.pathname.startsWith("/api/dashboard")) {
      const user = await currentUser(request, env);
      if (!user) return reply(request, env, { error: "unauthorized" }, 401);
      return dashboardApi(request, env, user);
    }
    return reply(request, env, { error: "not_found" }, 404);
  },
  async scheduled(event, env) {
    try { await deliverCommunityEventAlerts(env, communityEventAlertApi); } catch { /* never block other scheduled tasks */ }
    // Failed welcome deliveries retry safely; approval itself is never retried.
    try { await retryCoachWelcomeEmails(env); } catch { /* never block the scheduled analysis */ }
    try { await runMomoCoachFollowUps(env); } catch { /* never block the scheduled analysis */ }
    try { await runAiBrainDailyReport(env, event.scheduledTime || Date.now()); }
    catch (error) { try { await recordAiBrainError(env, "daily_report", error.message, {}, true); } catch { /* never block */ } }
    const hour = Math.floor((event.scheduledTime || Date.now()) / 3600000);
    const tasks = ["operations","monitoring","analytics","marketing","growth","community"];
    const task = tasks[hour % tasks.length];
    const id = "00000000-0000-4000-8000-" + hour.toString(16).padStart(12,"0");
    await runOwnerAnalysis(env,task,"Review current aggregate platform data. Give one specific recommendation and draft the owner's next action in English and Arabic.","scheduled",id);
  },
};

export { hashPassword, verifyPassword, emailValue, readJson, cleanList, clampInt, clampNullableInt, normalizeWhatsApp, cleanSocialLinks, cleanProfilePhotoUrl, cleanGarminPublicUrl, professionalType, professionalLabel, profilePhotoType };


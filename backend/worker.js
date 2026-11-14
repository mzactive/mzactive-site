const SESSION_TTL_SECONDS = 60 * 60 * 12;
// Cloudflare Workers Web Crypto caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;
const MAX_BODY_BYTES = 16_384;
const MAX_PROFILE_PHOTO_BYTES = 1_000_000;
const MAX_DAILY_ASSISTANT_REQUESTS = 60;

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
    "access-control-allow-methods": "GET, POST, PUT, PATCH, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-admin-setup-key",
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

async function currentUser(request, env) {
  const match = /^Bearer ([\w-]{30,80})$/.exec(request.headers.get("Authorization") || "");
  if (!match) return null;
  const tokenHash = await sha256(match[1]);
  return env.DB.prepare(`SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).bind(tokenHash, Math.floor(Date.now() / 1000)).first();
}

async function collectionEnabled(env) {
  return env.DATA_COLLECTION_ENABLED === "true";
}

async function reserveAssistantRequest(env) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(`INSERT INTO ai_chat_usage(usage_date,request_count) VALUES(?,1)
    ON CONFLICT(usage_date) DO UPDATE SET request_count=request_count+1
    WHERE request_count < ? RETURNING request_count`).bind(day, MAX_DAILY_ASSISTANT_REQUESTS).first();
  return Boolean(row);
}

async function assistantChat(request, env) {
  if (!env.AI || typeof env.AI.run !== "function") return reply(request, env, { error: "assistant_unavailable" }, 503);
  if (!await rateLimit(request, env, "assistant-chat", 8)) return reply(request, env, { error: "rate_limited" }, 429);
  const body = await readJson(request), message = text(body?.message, 1000);
  if (!body || !message) return reply(request, env, { error: "message_required" }, 400);
  const history = Array.isArray(body.history) ? body.history.slice(-4).flatMap((item) => {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : "";
    const content = text(item?.content, 400);
    return role && content ? [{ role, content }] : [];
  }) : [];
  if (!await reserveAssistantRequest(env)) return reply(request, env, { error: "daily_limit_reached" }, 429);
  const system = `You are the MZ Active website assistant for athletes and coaches. Be brief, kind, and practical. Reply in the language of the user's message (English or Arabic). Use only these verified facts: MZ Active helps people find coaches and pacers in Qatar; only profiles approved by MZ Active appear publicly; coaches can create or update a profile at https://mzactive.com/providers.html; profile photo uploads accept JPG, PNG, or WebP up to 1 MB, and Qatar local WhatsApp numbers can be entered as 8 digits; a coach's profile remains private until Admin approval. Clients can browse https://mzactive.com/coaches.html and send a request at https://mzactive.com/pacer.html. A request is not a confirmed booking, the site does not collect payments, and payment/availability must be coordinated separately. Do not promise a coach's availability, rates, approval, booking, payment, medical result, or reply time. Do not claim to have accessed a user's account or contacted MZ Active. Never make approval or rejection decisions. Do not ask for passwords, payment credentials, identity documents, health records, or other sensitive details. For information you cannot verify, say so plainly and offer the relevant page link. Do not send routine questions to the site owner when the self-service pages can help.`;
  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: message }],
      max_tokens: 180,
      temperature: 0.2,
    });
    const answer = text(result?.response, 3000);
    if (!answer) return reply(request, env, { error: "assistant_unavailable" }, 503);
    return reply(request, env, { answer });
  } catch {
    return reply(request, env, { error: "assistant_unavailable" }, 503);
  }
}

async function register(request, env) {
  if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
  if (!await rateLimit(request, env, "register", 5)) return reply(request, env, { error: "rate_limited" }, 429);
  const body = await readJson(request);
  const email = emailValue(body?.email), password = text(body?.password, 128);
  const isMember = body?.account_type === "member";
  const type = body?.provider_type === "pacer" ? "pacer" : body?.provider_type === "coach" ? "coach" : "";
  const displayName = text(body?.display_name, 100) || "Coach profile", city = text(body?.city, 80), bio = text(body?.bio, 4000) || "Profile awaiting completion by the provider.";
  const whatsappInput = text(body?.whatsapp_number, 32), whatsapp = normalizeWhatsApp(whatsappInput), whatsappPublic = body?.whatsapp_public === true;
  const canPublishWhatsApp = Boolean(whatsapp && whatsappPublic);
  const socialLinks = cleanSocialLinks(body?.social_links) || [];
  const adminEmails = (env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const isAdminEmail = adminEmails.includes(email);
  if (!body || !email || password.length < 12 || body.consent !== true || (!isAdminEmail && !type && !isMember)) {
    return reply(request, env, { error: "invalid_registration" }, 400);
  }
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
      env.DB.prepare("INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)")
        .bind(userId, email, passwordHash, role, now),
      ...(!isAdminEmail && !isMember ? [env.DB.prepare(`INSERT INTO provider_profiles(id,user_id,provider_type,display_name,country,city,specialties_json,languages_json,bio,experience_years,indicative_rate_qar,whatsapp_number,whatsapp_public,social_links_json,status,updated_at,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(profileId,userId,type,displayName,text(body.country,80)||"Qatar",city,JSON.stringify(specialties),JSON.stringify(languages),bio,clampInt(body.experience_years,0,60),clampNullableInt(body.indicative_rate_qar,0,100000),canPublishWhatsApp?whatsapp:null,canPublishWhatsApp?1:0,JSON.stringify(socialLinks),"pending",now,now)] : []),
    ]);
  } catch {
    return reply(request, env, { error: "account_already_exists_or_storage_error" }, 409);
  }
  return issueSession(request, env, userId, email, isAdminEmail ? "admin" : isMember ? "member" : role, 201);
}

function cleanList(value, maxItems, maxLength) {
  return Array.isArray(value) ? value.slice(0, maxItems).map((item) => text(item, maxLength)).filter(Boolean) : [];
}
function clampInt(value, min, max) { return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : 0; }
function clampNullableInt(value, min, max) { return value === null || value === "" || value === undefined ? null : Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : null; }

async function safeEqual(left, right) {
  const [a, b] = await Promise.all([sha256(left), sha256(right)]);
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function issueSession(request, env, userId, email, role, status = 200) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Math.floor(Date.now()/1000)).run();
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
    .bind(await sha256(token), userId, Math.floor(Date.now()/1000)+SESSION_TTL_SECONDS, new Date().toISOString()).run();
  return reply(request, env, { token, user: { id: userId, email, role }, expires_in: SESSION_TTL_SECONDS }, status);
}

async function login(request, env) {
  const body = await readJson(request), email = emailValue(body?.email), password = text(body?.password, 128);
  if (!body || !email || !password) return reply(request, env, { error: "invalid_credentials" }, 400);
  if (!await rateLimit(request, env, "login", 12) || !await rateLimit(request, env, `login:${email}`, 8)) return reply(request, env, { error: "rate_limited" }, 429);
  const user = await env.DB.prepare("SELECT id,email,password_hash,role FROM users WHERE email=?").bind(email).first();
  if (!user || !await verifyPassword(password, user.password_hash)) return reply(request, env, { error: "invalid_credentials" }, 401);
  return issueSession(request, env, user.id, user.email, user.role);
}

async function publicProviders(url, request, env) {
  const type = url.searchParams.get("type") || "", city = text(url.searchParams.get("city") || "",80);
  const query = text(url.searchParams.get("q") || "",80);
  const rows = await env.DB.prepare(`SELECT id,provider_type,display_name,country,city,specialties_json,languages_json,bio,experience_years,indicative_rate_qar,CASE WHEN profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,profile_photo_updated_at,CASE WHEN whatsapp_public=1 THEN whatsapp_number ELSE NULL END AS whatsapp_number,social_links_json
    FROM provider_profiles WHERE status='approved' AND (?='' OR provider_type=?) AND (?='' OR city LIKE ?)
    AND (?='' OR display_name LIKE ? OR bio LIKE ? OR specialties_json LIKE ?) ORDER BY display_name LIMIT 50`)
    .bind(type,type,city,`%${city}%`,query,`%${query}%`,`%${query}%`,`%${query}%`).all();
  const providers = (rows.results || []).map((row) => ({ ...row, specialties: safeParse(row.specialties_json), languages: safeParse(row.languages_json), social_links: safeParse(row.social_links_json), specialties_json: undefined, languages_json: undefined, social_links_json: undefined }));
  return reply(request, env, { providers });
}
function normalizeWhatsApp(value) {
  const raw = text(value, 32).replace(/[\s().-]/g, "");
  if (!raw) return "";
  if (/^\d{8}$/.test(raw)) return `974${raw}`;
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
function safeParse(value) { try { return JSON.parse(value); } catch { return []; } }

function profilePhotoType(bytes) {
  const view = new Uint8Array(bytes);
  if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) return "image/jpeg";
  if (view.length >= 8 && view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47 && view[4] === 0x0d && view[5] === 0x0a && view[6] === 0x1a && view[7] === 0x0a) return "image/png";
  if (view.length >= 12 && String.fromCharCode(...view.slice(0, 4)) === "RIFF" && String.fromCharCode(...view.slice(8, 12)) === "WEBP") return "image/webp";
  return "";
}

function binaryReply(request, env, bytes, contentType, cacheControl) {
  const headers = corsHeaders(request, env);
  if (!headers) return json({ error: "origin_not_allowed" }, 403);
  headers.set("content-type", contentType);
  headers.set("cache-control", cacheControl);
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-disposition", "inline");
  return new Response(bytes, { headers });
}

async function uploadProfilePhoto(request, env, user) {
  if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
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

async function publicProfilePhoto(id, request, env) {
  const row = await env.DB.prepare("SELECT profile_photo_bytes,profile_photo_content_type FROM provider_profiles WHERE id=? AND status='approved'").bind(id).first();
  if (!row?.profile_photo_bytes || !row.profile_photo_content_type) return reply(request, env, { error: "photo_not_found" }, 404);
  return binaryReply(request, env, row.profile_photo_bytes, row.profile_photo_content_type, "public, max-age=86400");
}

async function saveProfile(request, env, user) {
  if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
  const body = await readJson(request);
  const type = body?.provider_type === "pacer" ? "pacer" : body?.provider_type === "coach" ? "coach" : "";
  const name = text(body?.display_name,100), city = text(body?.city,80), bio = text(body?.bio,4000);
  const whatsappInput = text(body?.whatsapp_number,32), whatsapp = normalizeWhatsApp(whatsappInput), whatsappPublic = body?.whatsapp_public === true;
  const canPublishWhatsApp = Boolean(whatsapp && whatsappPublic);
  const socialLinks = cleanSocialLinks(body?.social_links);
  if (!body || !type) return reply(request, env, { error: "invalid_profile_type" }, 400);
  const warnings = [];
  if (whatsappInput && (!whatsapp || !whatsappPublic)) warnings.push("whatsapp_not_saved");
  if (socialLinks === null) warnings.push("social_links_skipped");
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE provider_profiles SET provider_type=?,display_name=CASE WHEN ?='' THEN display_name ELSE ? END,country=?,city=?,specialties_json=?,languages_json=?,bio=?,experience_years=?,indicative_rate_qar=?,whatsapp_number=?,whatsapp_public=?,social_links_json=?,status='pending',review_note=NULL,updated_at=? WHERE user_id=?`)
    .bind(type,name,name,text(body.country,80)||"Qatar",city,JSON.stringify(cleanList(body.specialties,12,60)),JSON.stringify(cleanList(body.languages,8,40)),bio,clampInt(body.experience_years,0,60),clampNullableInt(body.indicative_rate_qar,0,100000),canPublishWhatsApp?whatsapp:null,canPublishWhatsApp?1:0,JSON.stringify(socialLinks||[]),now,user.id).run();
  return reply(request, env, { status: "pending_review", warnings });
}

async function createBooking(request, env) {
  if (!await collectionEnabled(env)) return reply(request, env, { error: "intake_paused" }, 503);
  if (!await rateLimit(request, env, "booking", 5)) return reply(request, env, { error: "rate_limited" }, 429);
  const body = await readJson(request), email = emailValue(body?.customer_email);
  const name = text(body?.customer_name,100), phone = text(body?.customer_phone,40), city = text(body?.city,80), goal = text(body?.goal_summary,1000);
  const sessionType = ["race","training"].includes(body?.session_type) ? body.session_type : "";
  const distance = text(body?.distance,60), targetPace = text(body?.target_pace,40);
  if (!body || !/^\+?[\d\s()-]{7,40}$/.test(phone) || !name || !city || !goal || !sessionType || body.consent !== true) return reply(request, env, { error: "invalid_booking_request" }, 400);
  let providerId = text(body.provider_id,36) || null;
  if (providerId) {
    const provider = await env.DB.prepare("SELECT id,display_name FROM provider_profiles WHERE id=? AND status='approved'").bind(providerId).first();
    if (!provider) return reply(request, env, { error: "provider_unavailable" }, 404);
    body.provider_name = provider.display_name;
  }
  const id = randomId();
  await env.DB.prepare(`INSERT INTO booking_requests(id,provider_id,customer_name,customer_email,customer_phone,city,preferred_date,goal_summary,consent_at,status,created_at,payment_status,session_type,distance,target_pace)
    VALUES(?,?,?,?,?,?,?,?,?,'received',?,'pending_payment',?,?,?)`).bind(id,providerId,name,email||null,phone,city,text(body.preferred_date,10)||null,goal,new Date().toISOString(),new Date().toISOString(),sessionType,distance,targetPace).run();
  return reply(request, env, { request_id: id, status: "received_pending_payment", provider_name: body.provider_name || "MZ Active Champion Pacer" }, 201);
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

async function dashboardOverview(request, env, user) {
  let teams, dashboardRole;
  if (await isApprovedCoach(env, user)) {
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
    const sessions = await env.DB.prepare(`SELECT s.id,s.title,s.description,s.location,s.starts_at,s.status,
      (SELECT COUNT(*) FROM training_completions c WHERE c.session_id=s.id) AS completion_count,
      CASE WHEN mine.user_id IS NULL THEN 0 ELSE 1 END AS completed_by_me
      FROM training_sessions s LEFT JOIN training_completions mine ON mine.session_id=s.id AND mine.user_id=?
      WHERE s.team_id=? AND s.status!='cancelled' ORDER BY s.starts_at DESC LIMIT 40`).bind(user.id, team.id).all();
    const messages = await env.DB.prepare("SELECT id,body,created_at FROM training_messages WHERE team_id=? ORDER BY created_at DESC LIMIT 30").bind(team.id).all();
    team.sessions = sessions.results || [];
    team.messages = messages.results || [];
    if (team.is_coach) {
      const members = await env.DB.prepare("SELECT user_id,display_name,joined_at FROM training_team_members WHERE team_id=? ORDER BY display_name LIMIT 200").bind(team.id).all();
      team.members = members.results || [];
    }
  }
  return reply(request, env, { role: dashboardRole, teams });
}

async function dashboardApi(request, env, user) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method === "GET" && path === "/api/dashboard") return dashboardOverview(request, env, user);

  if (request.method === "POST" && path === "/api/dashboard/teams") {
    if (!await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    if (!await rateLimit(request, env, "dashboard-team", 5)) return reply(request, env, { error: "rate_limited" }, 429);
    const body = await readJson(request), name = text(body?.name, 80);
    if (!body || !name) return reply(request, env, { error: "team_name_required" }, 400);
    const now = new Date().toISOString(), id = randomId();
    let joinCode = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      joinCode = newJoinCode();
      try {
        await env.DB.prepare("INSERT INTO training_teams(id,coach_user_id,name,join_code,created_at) VALUES(?,?,?,?,?)").bind(id,user.id,name,joinCode,now).run();
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
    if (!await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await readJson(request), teamId = text(body?.team_id, 36), title = text(body?.title, 120), startsAt = text(body?.starts_at, 40);
    if (!body || !teamId || !title || !startsAt || !Number.isFinite(Date.parse(startsAt))) return reply(request, env, { error: "invalid_training_session" }, 400);
    const team = await env.DB.prepare("SELECT id FROM training_teams WHERE id=? AND coach_user_id=?").bind(teamId,user.id).first();
    if (!team) return reply(request, env, { error: "team_not_found" }, 404);
    const now = new Date().toISOString(), id = randomId();
    await env.DB.prepare("INSERT INTO training_sessions(id,team_id,title,description,location,starts_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'scheduled',?,?)")
      .bind(id,teamId,title,text(body.description,500),text(body.location,120),new Date(startsAt).toISOString(),now,now).run();
    return reply(request, env, { id, status: "scheduled" }, 201);
  }

  if (request.method === "POST" && path === "/api/dashboard/messages") {
    if (!await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await readJson(request), teamId = text(body?.team_id, 36), message = text(body?.body, 1000);
    if (!body || !teamId || !message) return reply(request, env, { error: "team_and_message_required" }, 400);
    const team = await env.DB.prepare("SELECT id FROM training_teams WHERE id=? AND coach_user_id=?").bind(teamId,user.id).first();
    if (!team) return reply(request, env, { error: "team_not_found" }, 404);
    const id = randomId(), now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO training_messages(id,team_id,coach_user_id,body,created_at) VALUES(?,?,?,?,?)").bind(id,teamId,user.id,message,now).run();
    return reply(request, env, { id, created_at: now }, 201);
  }

  const sessionMatch = /^\/api\/dashboard\/sessions\/([\w-]{36})$/.exec(path);
  if (sessionMatch && request.method === "PATCH") {
    if (!await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await readJson(request), status = body?.status;
    if (!body || !["scheduled","completed","cancelled"].includes(status)) return reply(request, env, { error: "invalid_session_status" }, 400);
    const session = await env.DB.prepare("SELECT s.id FROM training_sessions s JOIN training_teams t ON t.id=s.team_id WHERE s.id=? AND t.coach_user_id=?").bind(sessionMatch[1],user.id).first();
    if (!session) return reply(request, env, { error: "session_not_found" }, 404);
    await env.DB.prepare("UPDATE training_sessions SET status=?,updated_at=? WHERE id=?").bind(status,new Date().toISOString(),session.id).run();
    return reply(request, env, { updated: true, status });
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

async function adminApplications(request, env, user) {
  if (user.role !== "admin") return reply(request, env, { error: "forbidden" }, 403);
  const photoMatch = /^\/api\/admin\/providers\/([\w-]{36})\/photo$/.exec(new URL(request.url).pathname);
  if (photoMatch && request.method === "GET") {
    const photo = await env.DB.prepare("SELECT profile_photo_bytes,profile_photo_content_type FROM provider_profiles WHERE id=?")
      .bind(photoMatch[1]).first();
    if (!photo?.profile_photo_bytes || !photo.profile_photo_content_type) return reply(request, env, { error: "photo_not_found" }, 404);
    return binaryReply(request, env, photo.profile_photo_bytes, photo.profile_photo_content_type, "private, no-store");
  }
  if (photoMatch && request.method === "PUT") {
    const profile = await env.DB.prepare("SELECT id,status FROM provider_profiles WHERE id=?").bind(photoMatch[1]).first();
    if (!profile || profile.status === "rejected") return reply(request, env, { error: "provider_not_found" }, 404);
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
  if (request.method === "GET") {
    const providers = await env.DB.prepare(`SELECT p.id,p.provider_type,p.display_name,p.country,p.city,p.specialties_json,p.languages_json,p.bio,p.experience_years,p.indicative_rate_qar,CASE WHEN p.profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,p.whatsapp_number,p.whatsapp_public,p.social_links_json,p.status,p.review_note,p.updated_at,u.email
      FROM provider_profiles p JOIN users u ON u.id=p.user_id WHERE p.status='pending' ORDER BY p.created_at LIMIT 100`).all();
    const approvedProviders = await env.DB.prepare(`SELECT p.id,p.provider_type,p.display_name,p.country,p.city,CASE WHEN p.profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,p.updated_at,u.email
      FROM provider_profiles p JOIN users u ON u.id=p.user_id WHERE p.status='approved' ORDER BY p.updated_at DESC LIMIT 100`).all();
    const bookings = await env.DB.prepare(`SELECT id,provider_id,customer_name,customer_email,customer_phone,city,preferred_date,goal_summary,status,payment_status,session_type,distance,target_pace,created_at
      FROM booking_requests WHERE status IN ('received','reviewing') OR payment_status='pending_payment' ORDER BY created_at LIMIT 100`).all();
    return reply(request, env, { providers: providers.results || [], approved_providers: approvedProviders.results || [], bookings: bookings.results || [] });
  }
  const match = /^\/api\/admin\/providers\/([\w-]{36})$/.exec(new URL(request.url).pathname);
  if (match && request.method === "PATCH") {
    const body = await readJson(request), status = body?.status;
    if (!body || !["approved","rejected"].includes(status)) return reply(request, env, { error: "invalid_review_status" }, 400);
    const previous = await env.DB.prepare("SELECT status FROM provider_profiles WHERE id=?").bind(match[1]).first();
    if (!previous) return reply(request, env, { updated: false }, 404);
    const result = await env.DB.prepare("UPDATE provider_profiles SET status=?,review_note=?,updated_at=? WHERE id=? AND status='pending'")
      .bind(status,text(body.note,500)||null,new Date().toISOString(),match[1]).run();
    const updated = Boolean(result.meta?.changes);
    if (updated) await env.DB.prepare(`INSERT INTO moderation_events(id,actor_user_id,entity_type,entity_id,from_status,to_status,created_at) VALUES(?,?,'provider_profile',?,?,?,?)`)
      .bind(randomId(),user.id,match[1],previous.status,status,new Date().toISOString()).run();
    return reply(request, env, { updated, status });
  }
  const bookingMatch = /^\/api\/admin\/bookings\/([\w-]{36})$/.exec(new URL(request.url).pathname);
  if (bookingMatch && request.method === "PATCH") {
    const body = await readJson(request), status = body?.status, paymentStatus = body?.payment_status;
    if (!body || (!(["reviewing","accepted","declined","cancelled"].includes(status)) && !("payment_status" in body && ["pending_payment","confirmed","cancelled"].includes(paymentStatus)))) return reply(request, env, { error: "invalid_booking_status" }, 400);
    const previous = await env.DB.prepare("SELECT status,payment_status FROM booking_requests WHERE id=?").bind(bookingMatch[1]).first();
    if (!previous) return reply(request, env, { updated: false }, 404);
    const result = status && ["reviewing","accepted","declined","cancelled"].includes(status)
      ? await env.DB.prepare("UPDATE booking_requests SET status=? WHERE id=?").bind(status,bookingMatch[1]).run()
      : await env.DB.prepare("UPDATE booking_requests SET payment_status=? WHERE id=?").bind(paymentStatus,bookingMatch[1]).run();
    const updated = Boolean(result.meta?.changes);
    const from = status ? previous.status : previous.payment_status, to = status || paymentStatus;
    if (updated) await env.DB.prepare(`INSERT INTO moderation_events(id,actor_user_id,entity_type,entity_id,from_status,to_status,created_at) VALUES(?,?,'booking_request',?,?,?,?)`)
      .bind(randomId(),user.id,bookingMatch[1],from,to,new Date().toISOString()).run();
    return reply(request, env, { updated, status: status || previous.status, payment_status: paymentStatus || previous.payment_status });
  }
  return reply(request, env, { error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (!cors) return json({ error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: Object.fromEntries(cors) });
    if (request.method === "GET" && url.pathname === "/health") return reply(request, env, { ok: true, intake_enabled: env.DATA_COLLECTION_ENABLED === "true" });
    if (request.method === "POST" && url.pathname === "/api/assistant/chat") return assistantChat(request, env);
    if (request.method === "GET" && url.pathname === "/api/providers") return publicProviders(url, request, env);
    const publicPhotoMatch = /^\/api\/providers\/([\w-]{36})\/photo$/.exec(url.pathname);
    if (request.method === "GET" && publicPhotoMatch) return publicProfilePhoto(publicPhotoMatch[1], request, env);
    if (request.method === "POST" && url.pathname === "/api/auth/register") return register(request, env);
    if (request.method === "POST" && url.pathname === "/api/auth/login") return login(request, env);
    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      const user = await currentUser(request, env);
      if (user) {
        const token = request.headers.get("Authorization").slice(7);
        await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
      }
      return reply(request, env, { ok: true });
    }
    if ((request.method === "GET" || request.method === "PUT") && url.pathname === "/api/me/profile") {
      const user = await currentUser(request, env);
      if (!user) return reply(request, env, { error: "unauthorized" }, 401);
      if (user.role === "admin") return reply(request, env, { user: { email:user.email, role:user.role } });
      if (request.method === "PUT") return saveProfile(request, env, user);
      const profile = await env.DB.prepare(`SELECT id,provider_type,display_name,country,city,specialties_json,languages_json,bio,experience_years,indicative_rate_qar,CASE WHEN profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,profile_photo_updated_at,whatsapp_number,whatsapp_public,social_links_json,status,review_note,updated_at FROM provider_profiles WHERE user_id=?`).bind(user.id).first();
      return reply(request, env, { profile: profile ? { ...profile, specialties:safeParse(profile.specialties_json), languages:safeParse(profile.languages_json), social_links:safeParse(profile.social_links_json) } : null });
    }
    if (request.method === "PUT" && url.pathname === "/api/me/profile/photo") {
      const user = await currentUser(request, env);
      if (!user || user.role !== "provider") return reply(request, env, { error: "unauthorized" }, 401);
      return uploadProfilePhoto(request, env, user);
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
};

export { hashPassword, verifyPassword, emailValue, readJson, cleanList, clampInt, clampNullableInt, normalizeWhatsApp, cleanSocialLinks, cleanProfilePhotoUrl, profilePhotoType };

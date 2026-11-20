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
    WHERE s.token_hash=? AND s.expires_at>? AND NOT EXISTS(SELECT 1 FROM provider_profiles p WHERE p.user_id=u.id AND p.status='rejected' AND p.review_note='Removed by owner')`).bind(tokenHash, Math.floor(Date.now() / 1000)).first();
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
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
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

async function coachAssistant(request, env, user) {
  if (!await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
  if (!env.AI || typeof env.AI.run !== "function") return reply(request, env, { error: "assistant_unavailable" }, 503);
  if (!await rateLimit(request, env, `coach-assistant:${user.id}`, 6)) return reply(request, env, { error: "rate_limited" }, 429);
  const body = await readJson(request), task = body?.task;
  const prompt = text(body?.prompt, 1200);
  if (!body || !["help","training","weekly","blog"].includes(task) || !prompt) return reply(request, env, { error: "assistant_prompt_required" }, 400);
  if (!await reserveAssistantRequest(env)) return reply(request, env, { error: "daily_limit_reached" }, 429);
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
  return {
    pending_provider_profiles: await firstCount("SELECT COUNT(*) AS count FROM provider_profiles WHERE status='pending'"),
    approved_providers: await firstCount("SELECT COUNT(*) AS count FROM provider_profiles WHERE status='approved'"),
    open_booking_requests: await firstCount("SELECT COUNT(*) AS count FROM booking_requests WHERE status IN ('received','reviewing')"),
    pending_coach_articles: await firstCount("SELECT COUNT(*) AS count FROM coach_blog_posts WHERE status='pending'"),
    registered_athletes: await firstCount("SELECT COUNT(*) AS count FROM users u WHERE role='provider' AND NOT EXISTS(SELECT 1 FROM provider_profiles p WHERE p.user_id=u.id)"),
    unlinked_programs: await firstCount("SELECT COUNT(*) AS count FROM athlete_programs_v2 WHERE athlete_user_id IS NULL"),
    active_training_teams: await firstCount("SELECT COUNT(*) AS count FROM training_teams"),
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
  const storageType = ({growth:"analytics",community:"marketing"})[task] || task;
  const claim = await env.DB.prepare(`INSERT INTO owner_agent_tasks(id,agent_type,source,title,status,approval_status,input_json,created_at,started_at)
    VALUES(?,?,?,?,'running','not_required',?,?,?) ON CONFLICT(id) DO NOTHING`)
    .bind(taskId,storageType,source,taskPromptTitle(task),JSON.stringify({prompt, agent:task}),now,now).run();
  if (!claim.meta.changes) return {task_id:taskId};
  const guides = {
    operations: "Turn the request into a concise operational checklist with owners, priorities, and verification steps. Do not claim that changes were made.",
    marketing: "Draft practical bilingual-ready marketing copy or a campaign plan for MZ Active. Preserve a respectful, athletic brand tone and do not invent offers, reviews, or results.",
    support: "Draft a clear customer-support response for MZ Active. State uncertainty plainly, avoid promises, and direct the user to the correct self-service page only when relevant.",
    growth: "Use the current funnel counts to recommend one measurable growth experiment. Do not invent conversions or historical trends.",
    community: "Draft a community engagement proposal. Community moderation and verified event data are unavailable. Do not invent members or events.",
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
    if (!await reserveAssistantRequest(env)) throw Error("daily_limit_reached");
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
  const slug = text(new URL(request.url).searchParams.get("slug") || "", 80).replace(/^coach-/, "");
  const query = `SELECT b.id,b.title,b.summary,b.body,b.language,b.created_at,b.published_at,p.display_name AS coach_name
    FROM coach_blog_posts b JOIN provider_profiles p ON p.id=b.provider_id
    WHERE b.status='published' AND (?='' OR b.id=?) ORDER BY b.published_at DESC LIMIT 100`;
  const result = await env.DB.prepare(query).bind(slug,slug).all();
  return reply(request, env, { posts: result.results || [] });
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
function cleanProgramDurations(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(Number).filter((months) => [1,2,3].includes(months)))].sort();
}
const PUBLIC_PROFILE_FIELDS = ["city","specialties","languages","bio","experience_years","indicative_rate_qar","profile_photo","social_links","program_durations","whatsapp"];
function cleanPublicFields(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((field) => PUBLIC_PROFILE_FIELDS.includes(field)))];
}
const DEFAULT_PUBLIC_FIELDS = ["city","specialties","languages","bio","experience_years","indicative_rate_qar","profile_photo","social_links","program_durations","whatsapp"];
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
  if (user.role === "provider" && await env.DB.prepare("SELECT 1 AS removed FROM provider_profiles WHERE user_id=? AND status='rejected' AND review_note='Removed by owner'").bind(user.id).first()) return reply(request,env,{error:"provider_removed_by_owner"},403);
  return issueSession(request, env, user.id, user.email, user.role);
}

async function publicProviders(url, request, env, id = null) {
  const type = url.searchParams.get("type") || "", city = text(url.searchParams.get("city") || "",80);
  const query = text(url.searchParams.get("q") || "",80);
  const rows = await env.DB.prepare(`SELECT id,verified,qualifications,services_json,coaching_mode,(SELECT json_group_array(slot) FROM provider_gallery WHERE provider_id=provider_profiles.id) AS gallery_slots,provider_type,display_name,country,city,specialties_json,languages_json,bio,experience_years,indicative_rate_qar,program_durations_json,CASE WHEN profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,profile_photo_updated_at,whatsapp_number,whatsapp_public,social_links_json,public_fields_json
    FROM provider_profiles WHERE status='approved' AND (? IS NULL OR id=?) AND (?='' OR provider_type=?) AND (?='' OR city LIKE ?)
    AND (?='' OR display_name LIKE ? OR bio LIKE ? OR specialties_json LIKE ?) ORDER BY display_name LIMIT 50`)
    .bind(id,id,type,type,city,`%${city}%`,query,`%${query}%`,`%${query}%`,`%${query}%`).all();
  const providers = (rows.results || []).map((row) => {
    const fields = cleanPublicFields(safeParse(row.public_fields_json));
    const show = (field) => fields.includes(field);
    return {
      id: row.id, provider_type: row.provider_type, display_name: row.display_name,
      verified: row.verified === 1, qualifications: row.qualifications, services: safeParse(row.services_json), coaching_mode: row.coaching_mode,
      gallery_slots: safeParse(row.gallery_slots),
      country: show("city") ? row.country : "", city: show("city") ? row.city : "",
      specialties: show("specialties") ? safeParse(row.specialties_json) : [],
      languages: show("languages") ? safeParse(row.languages_json) : [],
      bio: show("bio") ? row.bio : "",
      experience_years: show("experience_years") ? row.experience_years : null,
      indicative_rate_qar: show("indicative_rate_qar") ? row.indicative_rate_qar : null,
      program_durations: show("program_durations") && row.provider_type === "coach" ? safeParse(row.program_durations_json).filter((months) => [1,2,3].includes(months)) : [],
      has_profile_photo: show("profile_photo") ? row.has_profile_photo : 0,
      profile_photo_updated_at: show("profile_photo") ? row.profile_photo_updated_at : null,
      whatsapp_number: show("whatsapp") && row.whatsapp_public ? row.whatsapp_number : null,
      social_links: show("social_links") ? safeParse(row.social_links_json) : [],
      public_fields: fields,
    };
  });
  if (id) return providers.length ? reply(request, env, { provider: providers[0] }) : reply(request, env, { error: "provider_unavailable" }, 404);
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

async function publicProfilePhoto(id, request, env) {
  const row = await env.DB.prepare("SELECT profile_photo_bytes,profile_photo_content_type,public_fields_json FROM provider_profiles WHERE id=? AND status='approved'").bind(id).first();
  if (!row?.profile_photo_bytes || !row.profile_photo_content_type || !cleanPublicFields(safeParse(row.public_fields_json)).includes("profile_photo")) return reply(request, env, { error: "photo_not_found" }, 404);
  return binaryReply(request, env, row.profile_photo_bytes, row.profile_photo_content_type, "private, no-cache");
}

async function galleryImage(id, slot, request, env, approvedOnly) {
  const row = await env.DB.prepare(`SELECT g.bytes,g.content_type FROM provider_gallery g
    JOIN provider_profiles p ON p.id=g.provider_id WHERE p.id=? AND g.slot=? AND (?=0 OR p.status='approved')`)
    .bind(id,slot,Number(approvedOnly)).first();
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
  const existing = await env.DB.prepare("SELECT status,review_note,program_durations_json FROM provider_profiles WHERE user_id=?").bind(user.id).first();
  if (existing?.status === "rejected" && existing.review_note === "Removed by owner") return reply(request, env, { error: "provider_removed_by_owner" }, 403);
  const body = await readJson(request);
  const type = body?.provider_type === "pacer" ? "pacer" : body?.provider_type === "coach" ? "coach" : "";
  const submittedProgramDurations = body && Object.prototype.hasOwnProperty.call(body, "program_durations")
    ? cleanProgramDurations(body.program_durations)
    : null;
  const programDurations = type === "coach"
    ? (submittedProgramDurations || cleanProgramDurations(safeParse(existing?.program_durations_json)))
    : [];
  if (body?.coaching_mode !== undefined && !["","online","in-person","both"].includes(body.coaching_mode)) return reply(request, env, { error: "invalid_coaching_mode" }, 400);
  const publicFields = cleanPublicFields(body?.public_fields || DEFAULT_PUBLIC_FIELDS);
  const name = text(body?.display_name,100), city = text(body?.city,80), bio = text(body?.bio,4000);
  const whatsappInput = text(body?.whatsapp_number,32), whatsapp = normalizeWhatsApp(whatsappInput), whatsappPublic = body?.whatsapp_public === true;
  const canPublishWhatsApp = Boolean(whatsapp && whatsappPublic);
  const socialLinks = cleanSocialLinks(body?.social_links);
  if (!body || !type) return reply(request, env, { error: "invalid_profile_type" }, 400);
  if (type === "coach" && !programDurations.length) return reply(request, env, { error: "coach_program_required" }, 400);
  const warnings = [];
  if (whatsappInput && (!whatsapp || !whatsappPublic)) warnings.push("whatsapp_not_saved");
  if (socialLinks === null) warnings.push("social_links_skipped");
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE provider_profiles SET provider_type=?,display_name=CASE WHEN ?='' THEN display_name ELSE ? END,country=?,city=?,specialties_json=?,languages_json=?,bio=?,experience_years=?,indicative_rate_qar=?,program_durations_json=?,whatsapp_number=?,whatsapp_public=?,social_links_json=?,public_fields_json=?,qualifications=COALESCE(?,qualifications),services_json=COALESCE(?,services_json),coaching_mode=COALESCE(?,coaching_mode),status='pending',review_note=NULL,updated_at=? WHERE user_id=?`)
    .bind(type,name,name,text(body.country,80)||"Qatar",city,JSON.stringify(cleanList(body.specialties,12,60)),JSON.stringify(cleanList(body.languages,8,40)),bio,clampInt(body.experience_years,0,60),clampNullableInt(body.indicative_rate_qar,0,100000),JSON.stringify(programDurations),canPublishWhatsApp?whatsapp:null,canPublishWhatsApp?1:0,JSON.stringify(socialLinks||[]),JSON.stringify(publicFields),
      body.qualifications === undefined ? null : text(body.qualifications,1000),
      body.services === undefined ? null : JSON.stringify(cleanList(body.services,12,120)),
      body.coaching_mode === undefined ? null : body.coaching_mode,now,user.id).run();
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
  let providerId = text(body.provider_id,36) || null, programDuration = Number(body.program_duration_months) || null;
  if (providerId) {
    const provider = await env.DB.prepare("SELECT id,display_name,provider_type,public_fields_json,program_durations_json,CASE WHEN whatsapp_public=1 THEN whatsapp_number ELSE NULL END AS public_whatsapp FROM provider_profiles WHERE id=? AND status='approved'").bind(providerId).first();
    if (!provider) return reply(request, env, { error: "provider_unavailable" }, 404);
    const visibility = cleanPublicFields(safeParse(provider.public_fields_json));
    if (provider.provider_type === "coach" && sessionType === "training") {
      const offered = cleanProgramDurations(safeParse(provider.program_durations_json));
      if (offered.length && visibility.includes("program_durations")) {
        if (!offered.includes(programDuration)) return reply(request, env, { error: "coach_program_required" }, 400);
      } else programDuration = null;
    } else programDuration = null;
    body.provider_name = provider.display_name;
    body.provider_whatsapp = visibility.includes("whatsapp") ? provider.public_whatsapp : null;
  }
  const id = randomId();
  await env.DB.prepare(`INSERT INTO booking_requests(id,provider_id,customer_name,customer_email,customer_phone,city,preferred_date,goal_summary,consent_at,status,created_at,payment_status,session_type,distance,target_pace,program_duration_months)
    VALUES(?,?,?,?,?,?,?,?,?,'received',?,'pending_payment',?,?,?,?)`).bind(id,providerId,name,email||null,phone,city,text(body.preferred_date,10)||null,goal,new Date().toISOString(),new Date().toISOString(),sessionType,distance,targetPace,programDuration).run();
  return reply(request, env, { request_id: id, status: "received_pending_payment", provider_name: body.provider_name || "MZ Active Champion Pacer", provider_whatsapp: body.provider_whatsapp || null }, 201);
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
  let teams, dashboardRole, coaches = [];
  if (user.role === "admin") {
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
    const programs = team.is_coach
      ? await env.DB.prepare(`SELECT p.id,p.athlete_user_id,p.week_start,p.coach_note,p.created_at,m.display_name AS athlete_name
          FROM athlete_programs p JOIN training_team_members m ON m.team_id=p.team_id AND m.user_id=p.athlete_user_id
          WHERE p.team_id=? ORDER BY p.week_start DESC LIMIT 60`).bind(team.id).all()
      : await env.DB.prepare(`SELECT p.id,p.athlete_user_id,p.week_start,p.coach_note,p.created_at,m.display_name AS athlete_name
          FROM athlete_programs p JOIN training_team_members m ON m.team_id=p.team_id AND m.user_id=p.athlete_user_id
          WHERE p.team_id=? AND p.athlete_user_id=? ORDER BY p.week_start DESC LIMIT 30`).bind(team.id,user.id).all();
    team.programs = [];
    for (const program of programs.results || []) {
      const rows = await env.DB.prepare(`SELECT s.id,s.session_code,s.day_key,s.session_type,s.details,s.planned_km,
          c.completed_at,c.actual_km,c.duration_minutes
        FROM athlete_program_sessions s LEFT JOIN athlete_program_completions c
          ON c.session_id=s.id AND c.athlete_user_id=?
        WHERE s.program_id=? ORDER BY s.sort_order`).bind(program.athlete_user_id,program.id).all();
      team.programs.push({ ...program, sessions: rows.results || [] });
    }
  }
  let programRows;
  if (dashboardRole === "admin") {
    programRows = await env.DB.prepare(`SELECT p.*,u.email AS athlete_email FROM athlete_programs_v2 p LEFT JOIN users u ON u.id=p.athlete_user_id ORDER BY p.week_start DESC LIMIT 300`).all();
  } else if (dashboardRole === "provider") {
    programRows = await env.DB.prepare(`SELECT p.*,u.email AS athlete_email FROM athlete_programs_v2 p LEFT JOIN users u ON u.id=p.athlete_user_id WHERE p.coach_user_id=? ORDER BY p.week_start DESC LIMIT 200`).bind(user.id).all();
  } else {
    programRows = await env.DB.prepare(`SELECT p.*,u.email AS athlete_email FROM athlete_programs_v2 p LEFT JOIN users u ON u.id=p.athlete_user_id WHERE p.athlete_user_id=? ORDER BY p.week_start DESC LIMIT 100`).bind(user.id).all();
  }
  const programs = [];
  for (const program of programRows.results || []) {
    const completionOwner = program.athlete_user_id;
    const rows = await env.DB.prepare(`SELECT s.id,s.session_code,s.day_key,s.sport_type,s.details,c.completed_at,c.actual_km,c.duration_minutes
      FROM athlete_program_sessions_v2 s LEFT JOIN athlete_program_completions_v2 c
        ON c.session_id=s.id AND c.athlete_user_id=?
      WHERE s.program_id=? ORDER BY s.sort_order`).bind(completionOwner,program.id).all();
    programs.push({...program,sessions:rows.results||[]});
  }
  return reply(request, env, { role: dashboardRole, teams, programs, ...(dashboardRole === "admin" ? { coaches } : {}) });
}

async function canManageTeam(env, user, teamId) {
  if (user.role === "admin") return Boolean(await env.DB.prepare("SELECT id FROM training_teams WHERE id=?").bind(teamId).first());
  if (!await isApprovedCoach(env, user)) return false;
  return Boolean(await env.DB.prepare("SELECT id FROM training_teams WHERE id=? AND coach_user_id=?").bind(teamId,user.id).first());
}

async function dashboardApi(request, env, user) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method === "GET" && path === "/api/dashboard") return dashboardOverview(request, env, user);
  if (path === "/api/dashboard/programs" && request.method === "POST") {
    const admin=user.role==="admin";
    if(!admin&&!await isApprovedCoach(env,user))return reply(request,env,{error:"approved_coach_required"},403);
    const body=await readJson(request);
    const athleteName=text(body?.athlete_name,80),athletePhone=normalizeWhatsApp(body?.athlete_phone||"");
    const athleteType=body?.athlete_type==="triathlon"?"triathlon":body?.athlete_type==="runner"?"runner":"";
    const weekStart=text(body?.week_start,10),coachNote=text(body?.coach_note,1200);
    let teamId=text(body?.team_id,36)||null,athleteId=text(body?.athlete_user_id,36)||null,team=null;
    if(athleteId&&!teamId){
      team=await env.DB.prepare("SELECT t.id,t.coach_user_id FROM training_teams t JOIN training_team_members m ON m.team_id=t.id WHERE m.user_id=? AND t.coach_user_id=? ORDER BY m.joined_at DESC LIMIT 1").bind(athleteId,user.id).first();
      if(team)teamId=team.id;
    }
    if(teamId)team=await env.DB.prepare("SELECT id,coach_user_id FROM training_teams WHERE id=?").bind(teamId).first();
    if(teamId&&(!team||(!admin&&team.coach_user_id!==user.id)))return reply(request,env,{error:"team_unavailable"},404);
    if(athleteId){
      const member=teamId?await env.DB.prepare("SELECT user_id,display_name FROM training_team_members WHERE team_id=? AND user_id=?").bind(teamId,athleteId).first():null;
      if(!member)return reply(request,env,{error:"athlete_not_in_team"},404);
    } else {
      teamId=null;
    }
    const monday=/^\d{4}-\d{2}-\d{2}$/.test(weekStart)&&Number.isFinite(Date.parse(weekStart+"T00:00:00Z"))&&new Date(weekStart+"T00:00:00Z").getUTCDay()===1;
    const days=["monday","tuesday","wednesday","thursday","friday","saturday","sunday"],sports=["run","bike","swim","strength","recovery","other"];
    const sessions=Array.isArray(body?.sessions)?body.sessions:[];
    if(!athleteName||!athletePhone||!athleteType||!monday||sessions.length<1||sessions.length>35||
      sessions.some((x)=>!days.includes(x?.day_key)||!sports.includes(x?.sport_type)||!text(x?.details,1600)))
      return reply(request,env,{error:"invalid_flexible_program"},400);
    const existing=await env.DB.prepare("SELECT id FROM athlete_programs_v2 WHERE coach_user_id=? AND athlete_phone=? AND week_start=?").bind(user.id,athletePhone,weekStart).first();
    if(existing)return reply(request,env,{error:"weekly_program_exists"},409);
    const id=randomId(),now=new Date().toISOString(),statements=[
      env.DB.prepare("INSERT INTO athlete_programs_v2(id,coach_user_id,team_id,athlete_user_id,athlete_name,athlete_phone,athlete_type,week_start,coach_note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(id,user.id,teamId,athleteId,athleteName,athletePhone,athleteType,weekStart,coachNote,now)
    ],codes=[],used=new Map();
    for(const [index,item] of sessions.entries()){
      const prefix=item.day_key.slice(0,3).toUpperCase()+"-"+item.sport_type.slice(0,1).toUpperCase();
      const count=(used.get(prefix)||0)+1;used.set(prefix,count);
      const code=prefix+String(count).padStart(2,"0"),sessionId=randomId();
      codes.push({id:sessionId,day_key:item.day_key,sport_type:item.sport_type,session_code:code,details:text(item.details,1600)});
      statements.push(env.DB.prepare("INSERT INTO athlete_program_sessions_v2(id,program_id,session_code,day_key,sport_type,details,sort_order) VALUES(?,?,?,?,?,?,?)")
        .bind(sessionId,id,code,item.day_key,item.sport_type,text(item.details,1600),index));
    }
    await env.DB.batch(statements);
    return reply(request,env,{id,week_start:weekStart,athlete_name:athleteName,athlete_type:athleteType,session_codes:codes,status:"saved"},201);
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
    const admin = user.role === "admin";
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
    if (user.role !== "admin" && !await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await readJson(request), teamId = text(body?.team_id, 36), title = text(body?.title, 120), startsAt = text(body?.starts_at, 40);
    if (!body || !teamId || !title || !startsAt || !Number.isFinite(Date.parse(startsAt))) return reply(request, env, { error: "invalid_training_session" }, 400);
    if (!await canManageTeam(env, user, teamId)) return reply(request, env, { error: "team_not_found" }, 404);
    const now = new Date().toISOString(), id = randomId();
    await env.DB.prepare("INSERT INTO training_sessions(id,team_id,title,description,location,starts_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'scheduled',?,?)")
      .bind(id,teamId,title,text(body.description,500),text(body.location,120),new Date(startsAt).toISOString(),now,now).run();
    return reply(request, env, { id, status: "scheduled" }, 201);
  }

  if (request.method === "POST" && path === "/api/dashboard/messages") {
    if (user.role !== "admin" && !await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await readJson(request), teamId = text(body?.team_id, 36), message = text(body?.body, 1000);
    if (!body || !teamId || !message) return reply(request, env, { error: "team_and_message_required" }, 400);
    if (!await canManageTeam(env, user, teamId)) return reply(request, env, { error: "team_not_found" }, 404);
    const id = randomId(), now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO training_messages(id,team_id,coach_user_id,body,created_at) VALUES(?,?,?,?,?)").bind(id,teamId,user.id,message,now).run();
    return reply(request, env, { id, created_at: now }, 201);
  }

  const sessionMatch = /^\/api\/dashboard\/sessions\/([\w-]{36})$/.exec(path);
  if (sessionMatch && request.method === "PATCH") {
    if (user.role !== "admin" && !await isApprovedCoach(env, user)) return reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await readJson(request), status = body?.status;
    if (!body || !["scheduled","completed","cancelled"].includes(status)) return reply(request, env, { error: "invalid_session_status" }, 400);
    const session = user.role === "admin"
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

async function adminApplications(request, env, user) {
  if (user.role !== "admin") return reply(request, env, { error: "forbidden" }, 403);
  const requestUrl = new URL(request.url);
  if (request.method === "POST" && requestUrl.pathname === "/api/admin/assistant") {
    return ownerAssistant(request, env);
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
    const athletes = await env.DB.prepare(`SELECT u.id,u.email, (SELECT COUNT(*) FROM athlete_programs_v2 WHERE athlete_user_id=u.id) AS programs
      FROM users u WHERE role='provider' AND NOT EXISTS(SELECT 1 FROM provider_profiles p WHERE p.user_id=u.id) ORDER BY u.email`).all();
    const unlinked = await env.DB.prepare("SELECT id,athlete_name,week_start FROM athlete_programs_v2 WHERE athlete_user_id IS NULL ORDER BY week_start DESC").all();
    return reply(request,env,{athletes:athletes.results,unlinked:unlinked.results});
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
    const providers = await env.DB.prepare(`SELECT p.id,p.qualifications,p.services_json,p.coaching_mode,(SELECT json_group_array(slot) FROM provider_gallery WHERE provider_id=p.id) AS gallery_slots,p.provider_type,p.display_name,p.country,p.city,p.specialties_json,p.languages_json,p.bio,p.experience_years,p.indicative_rate_qar,CASE WHEN p.profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,p.whatsapp_number,p.whatsapp_public,p.social_links_json,p.status,p.review_note,p.updated_at,u.email
      FROM provider_profiles p JOIN users u ON u.id=p.user_id WHERE p.status='pending' ORDER BY p.created_at LIMIT 100`).all();
    const approvedProviders = await env.DB.prepare(`SELECT p.id,p.provider_type,p.display_name,p.country,p.city,CASE WHEN p.profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,p.updated_at,u.email
      FROM provider_profiles p JOIN users u ON u.id=p.user_id WHERE p.status='approved' ORDER BY p.updated_at DESC LIMIT 100`).all();
    const suspendedProviders = await env.DB.prepare(`SELECT p.id,p.provider_type,p.display_name,p.country,p.city,p.review_note,p.updated_at,u.email\n      FROM provider_profiles p JOIN users u ON u.id=p.user_id WHERE p.status='rejected' AND p.review_note='Removed by owner' AND p.provider_type='coach' ORDER BY p.updated_at DESC LIMIT 100`).all();
    const bookings = await env.DB.prepare(`SELECT id,provider_id,(SELECT display_name FROM provider_profiles WHERE id=booking_requests.provider_id) AS coach_name,customer_name,customer_email,customer_phone,city,preferred_date,goal_summary,status,payment_status,session_type,distance,target_pace,program_duration_months,created_at
      FROM booking_requests ORDER BY CASE WHEN status IN ('received','reviewing') THEN 0 ELSE 1 END, created_at DESC LIMIT 100`).all();
    return reply(request, env, { providers: providers.results || [], approved_providers: approvedProviders.results || [], suspended_providers: suspendedProviders.results || [], bookings: bookings.results || [] });
  }
  const match = /^\/api\/admin\/providers\/([\w-]{36})$/.exec(new URL(request.url).pathname);
  if (match && request.method === "PATCH") {
    const body = await readJson(request), status = body?.status;
    if (!body || !["approved","rejected","suspended"].includes(status)) return reply(request, env, { error: "invalid_review_status" }, 400);
    const previous = await env.DB.prepare("SELECT status,provider_type,review_note,bio,specialties_json FROM provider_profiles WHERE id=?").bind(match[1]).first();
    if (!previous) return reply(request, env, { updated: false }, 404);
    const ownerRemoved = previous.status === "rejected" && previous.review_note === "Removed by owner";
    const allowed = (previous.status === "pending" && ["approved","rejected"].includes(status))
      || (previous.provider_type === "coach" && previous.status === "approved" && status === "suspended")
      || (previous.provider_type === "coach" && ownerRemoved && status === "approved");
    if (!allowed) return reply(request, env, { error: "invalid_provider_status_change" }, 409);
    if (status==="approved" && previous.provider_type==="coach" && (!safeParse(previous.specialties_json)?.length || !previous.bio?.trim() || previous.bio==="Profile awaiting completion by the provider.")) return reply(request,env,{error:"coach_profile_incomplete"},422);
    const storedStatus = status === "suspended" ? "rejected" : status;
    const note = status === "suspended" ? "Removed by owner" : status === "approved" ? null : text(body.note,500)||null;
    const result = await env.DB.prepare("UPDATE provider_profiles SET status=?,review_note=?,updated_at=?,verified=? WHERE id=? AND status=? AND (? IS NULL OR updated_at=?)")
      .bind(storedStatus,note,new Date().toISOString(),Number(status === "approved" && previous.provider_type === "coach" && body.verified === true),match[1],previous.status,body.review_version ?? null,body.review_version ?? null).run();
    const updated = Boolean(result.meta?.changes);
    if (!updated) return reply(request, env, { error: "profile_changed_reload_review" }, 409);
    await env.DB.prepare(`INSERT INTO moderation_events(id,actor_user_id,entity_type,entity_id,from_status,to_status,created_at) VALUES(?,?,'provider_profile',?,?,?,?)`)
      .bind(randomId(),user.id,match[1],previous.status,status,new Date().toISOString()).run();
    return reply(request, env, { updated, status });
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
    return result.meta.changes ? reply(request,env,{updated:true,status}) : reply(request,env,{error:"booking_status_changed"},409);
  }
  return reply(request, env, { error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (!cors) return json({ error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: Object.fromEntries(cors) });
    if (request.method === "GET" && url.pathname === "/api/auth/setup-status") {
      const existing = await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
      return reply(request,env,{setup_available:!existing && Boolean(env.ADMIN_EMAILS && env.ADMIN_SETUP_KEY)});
    }
    if (request.method === "GET" && url.pathname === "/health") return reply(request, env, { ok: true, intake_enabled: env.DATA_COLLECTION_ENABLED === "true" });
    if (request.method === "POST" && url.pathname === "/api/assistant/chat") return assistantChat(request, env);
    if (request.method === "GET" && url.pathname === "/api/blog/posts") return publicBlogPosts(request, env);
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
      const profile = await env.DB.prepare(`SELECT id,verified,qualifications,services_json,coaching_mode,(SELECT json_group_array(slot) FROM provider_gallery WHERE provider_id=provider_profiles.id) AS gallery_slots,provider_type,display_name,country,city,specialties_json,languages_json,bio,experience_years,indicative_rate_qar,program_durations_json,CASE WHEN profile_photo_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_profile_photo,profile_photo_updated_at,whatsapp_number,whatsapp_public,social_links_json,public_fields_json,status,review_note,updated_at FROM provider_profiles WHERE user_id=?`).bind(user.id).first();
      return reply(request, env, { profile: profile ? { ...profile, services:safeParse(profile.services_json), gallery_slots:safeParse(profile.gallery_slots), specialties:safeParse(profile.specialties_json), languages:safeParse(profile.languages_json), program_durations:safeParse(profile.program_durations_json), social_links:safeParse(profile.social_links_json), public_fields:cleanPublicFields(safeParse(profile.public_fields_json)) } : null });
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
  async scheduled(event, env) {
    const hour = Math.floor((event.scheduledTime || Date.now()) / 3600000);
    const tasks = ["operations","monitoring","analytics","marketing","growth","community"];
    const task = tasks[hour % tasks.length];
    const id = "00000000-0000-4000-8000-" + hour.toString(16).padStart(12,"0");
    await runOwnerAnalysis(env,task,"Review current aggregate platform data. Give one specific recommendation and draft the owner's next action in English and Arabic.","scheduled",id);
  },
};

export { hashPassword, verifyPassword, emailValue, readJson, cleanList, clampInt, clampNullableInt, normalizeWhatsApp, cleanSocialLinks, cleanProfilePhotoUrl, profilePhotoType };


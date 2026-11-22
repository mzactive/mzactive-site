// MZA AI Coach API. Three separate surfaces share one adapter but never share
// data or permissions: athlete self-planning, approved-coach planning, and
// super-admin settings/monitoring. Momo and the Owner Brain remain in worker.js.
import { buildLocalPlan, generateTrainingPlan, generateCoachText, normalizeTrainingInput, mondayOf } from "./ai-provider.js";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const SPORTS = new Set(["run", "bike", "swim", "strength", "multi"]);
const LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const GOALS = new Set(["consistency", "endurance", "strength", "race", "general"]);
const SESSION_TYPES = new Set(["run", "bike", "swim", "strength", "recovery", "other"]);
const FLAG_KEYS = new Set(["athlete_coach_enabled", "coach_planner_enabled"]);

const asText = (value, max = 200) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";

async function flag(env, key, fallback = true) {
  const row = await env.DB.prepare("SELECT value FROM ai_coach_settings WHERE key=?").bind(key).first();
  return row ? row.value === "true" : fallback;
}

function monday(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && new Date(`${value}T00:00:00Z`).getUTCDay() === 1 ? value : "";
}

function parsePlan(raw) {
  let plan = raw;
  if (typeof plan === "string") { try { plan = JSON.parse(plan); } catch { return null; } }
  if (!plan || !Array.isArray(plan.sessions)) return null;
  const sessions = plan.sessions.slice(0, 35).map((session) => {
    const day_key = DAYS.includes(session?.day_key) ? session.day_key : "";
    const sport_type = SESSION_TYPES.has(session?.sport_type) ? session.sport_type : "";
    const details = asText(session?.details, 500);
    const minutes = Math.min(180, Math.max(5, Math.round(Number(session?.minutes) || 30)));
    return day_key && sport_type && details ? { day_key, sport_type, details, minutes } : null;
  }).filter(Boolean);
  if (!sessions.length) return null;
  return {
    provider: asText(plan.provider, 40) || "local",
    week_start: monday(plan.week_start) || mondayOf(),
    sessions,
    coach_note: asText(plan.coach_note, 1000),
    safety_warnings: Array.isArray(plan.safety_warnings) ? plan.safety_warnings.slice(0, 4).map((item) => asText(item, 300)).filter(Boolean) : [],
    summary: plan.summary && typeof plan.summary === "object" ? plan.summary : {},
  };
}

async function athleteName(env, userId) {
  const row = await env.DB.prepare(`SELECT COALESCE(NULLIF(ms.display_name,''),NULLIF(p.display_name,''),'Athlete') AS name
    FROM users u LEFT JOIN member_sports_profiles ms ON ms.user_id=u.id
    LEFT JOIN provider_profiles p ON p.user_id=u.id WHERE u.id=?`).bind(userId).first();
  return asText(row?.name, 80) || "Athlete";
}

async function linkedCoach(env, coachId, athleteId) {
  if (!coachId || !athleteId) return false;
  return Boolean(await env.DB.prepare(`SELECT 1 FROM training_team_members m JOIN training_teams t ON t.id=m.team_id
    WHERE m.user_id=? AND t.coach_user_id=? UNION
    SELECT 1 FROM athlete_programs_v2 p WHERE p.athlete_user_id=? AND p.coach_user_id=? LIMIT 1`)
    .bind(athleteId, coachId, athleteId, coachId).first());
}

async function coachManagedWeek(env, athleteId, weekStart) {
  return Boolean(await env.DB.prepare(`SELECT 1 FROM athlete_programs_v2
    WHERE athlete_user_id=? AND week_start=? AND source<>'ai_self' LIMIT 1`).bind(athleteId, weekStart).first());
}

async function quota(env, deps, user, surface) {
  if (!await deps.rateLimitScoped(env, `ai-coach:${surface}:${user.id}`, 12, 1440)) return false;
  return deps.reserveAssistantRequest(env, surface);
}

async function createDraft(env, deps, input) {
  const id = deps.randomId(), now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO ai_training_drafts(id,owner_user_id,actor_user_id,role,purpose,week_start,days_json,plan_json,source_draft_id,status,requires_coach_approval,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,'draft',?,?,?)`)
    .bind(id, input.owner, input.actor, input.role, input.purpose, input.week_start,
      JSON.stringify(input.days), JSON.stringify(input.plan), input.source_draft_id || null,
      input.requires_coach_approval ? 1 : 0, now, now).run();
  return id;
}

function draftView(row) {
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    role: row.role,
    purpose: row.purpose,
    week_start: row.week_start,
    days: JSON.parse(row.days_json || "[]"),
    plan: parsePlan(row.plan_json),
    status: row.status,
    requires_coach_approval: Boolean(row.requires_coach_approval),
    created_at: row.created_at,
    approved_program_id: row.approved_program_id || null,
  };
}

async function progressFor(env, athleteId) {
  const rows = await env.DB.prepare(`SELECT p.week_start,COUNT(c.session_id) AS completed,
      COALESCE(SUM(c.actual_km),0) AS kilometres,COALESCE(SUM(c.duration_minutes),0) AS minutes,COUNT(s.id) AS planned
    FROM athlete_programs_v2 p JOIN athlete_program_sessions_v2 s ON s.program_id=p.id
    LEFT JOIN athlete_program_completions_v2 c ON c.session_id=s.id AND c.athlete_user_id=p.athlete_user_id
    WHERE p.athlete_user_id=? GROUP BY p.id ORDER BY p.week_start DESC LIMIT 20`).bind(athleteId).all();
  const weeks = rows.results || [];
  return {
    completed_sessions: weeks.reduce((sum, week) => sum + Number(week.completed || 0), 0),
    planned_sessions: weeks.reduce((sum, week) => sum + Number(week.planned || 0), 0),
    total_minutes: weeks.reduce((sum, week) => sum + Number(week.minutes || 0), 0),
    total_kilometres: Number(weeks.reduce((sum, week) => sum + Number(week.kilometres || 0), 0).toFixed(1)),
    weeks: weeks.slice(0, 8),
  };
}

async function draftRequest(request, env, deps, role, user) {
  const body = await deps.readJson(request);
  if (!body) return deps.reply(request, env, { error: "invalid_request" }, 400);
  const key = role === "athlete" ? "athlete_coach_enabled" : "coach_planner_enabled";
  if (!await flag(env, key)) return deps.reply(request, env, { error: "ai_feature_disabled" }, 403);
  if (!await quota(env, deps, user, role === "athlete" ? "athlete_coach" : "coach_planner")) {
    return deps.reply(request, env, { error: "daily_limit_reached" }, 429);
  }

  let owner = user.id;
  if (role === "coach") {
    owner = deps.text(body.athlete_user_id, 36);
    if (!owner || !await linkedCoach(env, user.id, owner)) return deps.reply(request, env, { error: "athlete_unavailable" }, 404);
  }
  const weekStart = monday(body.week_start);
  if (!weekStart) return deps.reply(request, env, { error: "week_start_required" }, 400);
  if (role === "athlete" && await coachManagedWeek(env, owner, weekStart)) {
    return deps.reply(request, env, { error: "coach_managed_program", message: "Your coach manages this week. Ask your coach for an adjustment." }, 409);
  }
  const days = Array.isArray(body.days) ? body.days.filter((day) => DAYS.includes(day)).slice(0, 6) : [];
  const input = normalizeTrainingInput({
    sport: SPORTS.has(body.sport) ? body.sport : "run",
    level: LEVELS.has(body.level) ? body.level : "beginner",
    goal: GOALS.has(body.goal) ? body.goal : "general",
    language: body.language === "ar" ? "ar" : "en",
    days, duration: body.duration, week_start: weekStart,
    message: deps.text(body.message, 500),
  });
  const generated = await generateTrainingPlan(env, input);
  const plan = parsePlan(generated);
  if (!plan) return deps.reply(request, env, { error: "plan_unavailable" }, 503);
  const id = await createDraft(env, deps, {
    owner, actor: user.id, role, purpose: body.purpose === "adjustment" ? "adjustment" : role === "coach" ? "coach_draft" : "initial",
    week_start: weekStart, days: input.days, plan,
  });
  return deps.reply(request, env, {
    draft_id: id, plan, requires_approval: true,
    message: role === "coach" ? "Draft ready for coach review." : "Review and approve this draft before it is saved.",
  }, 201);
}

async function chatRequest(request, env, deps, user) {
  const body = await deps.readJson(request);
  const message = deps.text(body?.message, 500);
  if (!message) return deps.reply(request, env, { error: "message_required" }, 400);
  if (!await flag(env, "athlete_coach_enabled")) return deps.reply(request, env, { error: "ai_feature_disabled" }, 403);
  if (!await quota(env, deps, user, "athlete_coach")) return deps.reply(request, env, { error: "daily_limit_reached" }, 429);
  const sourceId = deps.text(body?.draft_id, 36);
  const source = sourceId ? await env.DB.prepare("SELECT * FROM ai_training_drafts WHERE id=? AND owner_user_id=? AND role='athlete'").bind(sourceId, user.id).first() : null;
  if (sourceId && !source) return deps.reply(request, env, { error: "draft_not_found" }, 404);
  const plan = parsePlan(source?.plan_json) || parsePlan((await env.DB.prepare(`SELECT plan_json FROM ai_training_drafts
    WHERE owner_user_id=? AND role='athlete' AND status='approved' ORDER BY created_at DESC LIMIT 1`).bind(user.id).first())?.plan_json);
  const weekStart = monday(body.week_start) || plan?.week_start || mondayOf();
  const previous = (plan?.sessions || []).map((session) => ({ ...session, completed_at: null }));
  const generated = await generateTrainingPlan(env, {
    ...normalizeTrainingInput({
      sport: body.sport || plan?.summary?.sport || "run",
      level: body.level || plan?.summary?.level || "beginner",
      goal: body.goal || plan?.summary?.goal || "general",
      language: body.language, days: body.days || plan?.days || [], duration: body.duration || 40,
      week_start: weekStart, message, previous_sessions: previous,
    }),
  });
  const next = parsePlan(generated);
  if (!next) return deps.reply(request, env, { error: "plan_unavailable" }, 503);
  const coachManaged = await coachManagedWeek(env, user.id, weekStart);
  const id = await createDraft(env, deps, {
    owner: user.id, actor: user.id, role: "athlete", purpose: "adjustment", week_start: weekStart,
    days: body.days || plan?.days || [], plan: next, source_draft_id: sourceId || null,
    requires_coach_approval: coachManaged,
  });
  await env.DB.prepare("UPDATE ai_training_drafts SET status='superseded',updated_at=? WHERE id=? AND status='draft'")
    .bind(new Date().toISOString(), sourceId).run();
  return deps.reply(request, env, {
    draft_id: id, plan: next, requires_coach_approval: coachManaged,
    message: coachManaged
      ? "Your coach manages this week. Send this adjustment request to your coach; nothing was saved automatically."
      : "Adjusted draft ready. Review and approve before saving.",
  }, 201);
}

async function approveRequest(request, env, deps, role, user, draftId) {
  const draft = await env.DB.prepare("SELECT * FROM ai_training_drafts WHERE id=? AND status='draft'").bind(draftId).first();
  if (!draft) return deps.reply(request, env, { error: "draft_not_found" }, 404);
  const body = await deps.readJson(request);
  if (body?.approve !== true) return deps.reply(request, env, { error: "approval_required" }, 400);
  if (role === "athlete") {
    if (draft.owner_user_id !== user.id || draft.actor_user_id !== user.id) return deps.reply(request, env, { error: "forbidden" }, 403);
    if (draft.requires_coach_approval) return deps.reply(request, env, { error: "coach_approval_required" }, 409);
  } else {
    if (draft.actor_user_id !== user.id || !await linkedCoach(env, user.id, draft.owner_user_id)) {
      return deps.reply(request, env, { error: "forbidden" }, 403);
    }
  }
  const plan = parsePlan(draft.plan_json);
  if (!plan) return deps.reply(request, env, { error: "plan_unavailable" }, 503);
  const existing = await env.DB.prepare(`SELECT source FROM athlete_programs_v2
    WHERE athlete_user_id=? AND week_start=? LIMIT 1`).bind(draft.owner_user_id, draft.week_start).first();
  if (existing) return deps.reply(request, env, { error: "weekly_program_exists" }, 409);
  const name = deps.text(body?.athlete_name, 80) || await athleteName(env, draft.owner_user_id);
  const phone = deps.text(body?.athlete_phone, 40) || `ai:${draft.owner_user_id}`;
  const source = role === "coach" ? "ai_coach_draft" : "ai_self";
  const id = deps.randomId(), now = new Date().toISOString(), statements = [
    env.DB.prepare(`INSERT INTO athlete_programs_v2(id,coach_user_id,team_id,athlete_user_id,athlete_name,athlete_phone,athlete_type,week_start,coach_note,created_at,source)
      VALUES(?,?,NULL,?,?,?,?,?,?,?,?)`)
      .bind(id, user.id, draft.owner_user_id, name, phone,
        plan.summary?.sport === "multi" ? "triathlon" : "runner", draft.week_start, plan.coach_note || "", now, source),
  ];
  const used = new Map();
  for (const [index, session] of plan.sessions.entries()) {
    const prefix = session.day_key.slice(0, 3).toUpperCase() + "-" + session.sport_type.slice(0, 1).toUpperCase();
    const count = (used.get(prefix) || 0) + 1;
    used.set(prefix, count);
    statements.push(env.DB.prepare(`INSERT INTO athlete_program_sessions_v2(id,program_id,session_code,day_key,sport_type,details,sort_order)
      VALUES(?,?,?,?,?,?,?)`).bind(deps.randomId(), id, `${prefix}${String(count).padStart(2, "0")}`,
      session.day_key, session.sport_type, session.details, index));
  }
  statements.push(env.DB.prepare("UPDATE ai_training_drafts SET status='approved',approved_at=?,approved_program_id=?,updated_at=? WHERE id=?")
    .bind(now, id, now, draftId));
  await env.DB.batch(statements);
  await deps.recordAccountEvent(env, user.id, draft.owner_user_id, role === "coach" ? "ai_plan_approved_by_coach" : "ai_plan_approved_by_athlete",
    { draft_id: draftId, program_id: id, week_start: draft.week_start });
  return deps.reply(request, env, { program_id: id, week_start: draft.week_start, status: "saved", source });
}

async function adminSettings(request, env, deps, user) {
  if (!deps.isSuperAdmin(user)) return deps.reply(request, env, { error: "admin_required" }, 403);
  if (request.method === "GET") {
    const settings = await env.DB.prepare("SELECT key,value,updated_at FROM ai_coach_settings ORDER BY key").all();
    const usage = await env.DB.prepare(`SELECT usage_date,request_count FROM ai_chat_usage
      WHERE usage_date LIKE '%athlete_coach%' OR usage_date LIKE '%coach_planner%'
      ORDER BY usage_date DESC LIMIT 14`).all();
    const drafts = await env.DB.prepare("SELECT status,COUNT(*) AS count FROM ai_training_drafts GROUP BY status").all();
    return deps.reply(request, env, { settings: settings.results || [], usage: usage.results || [], drafts: drafts.results || [] });
  }
  if (request.method === "PATCH") {
    const body = await deps.readJson(request);
    if (!body) return deps.reply(request, env, { error: "invalid_request" }, 400);
    const changes = {};
    for (const key of FLAG_KEYS) {
      if (typeof body[key] !== "boolean") continue;
      changes[key] = String(body[key]);
    }
    if (!Object.keys(changes).length) return deps.reply(request, env, { error: "no_settings_changed" }, 400);
    const now = new Date().toISOString();
    await env.DB.batch(Object.entries(changes).map(([key, value]) => env.DB.prepare(
      "UPDATE ai_coach_settings SET value=?,updated_at=?,updated_by=? WHERE key=?")
      .bind(value, now, user.id, key)));
    await deps.recordAccountEvent(env, user.id, user.id, "ai_settings_updated", { changes });
    return deps.reply(request, env, { updated: changes });
  }
  return deps.reply(request, env, { error: "not_found" }, 404);
}

export async function handleAiCoachApi(request, env, url, deps) {
  const path = url.pathname;
  if (path === "/api/admin/ai/settings") {
    const user = await deps.currentUser(request, env);
    if (!user) return deps.reply(request, env, { error: "unauthorized" }, 401);
    return adminSettings(request, env, deps, user);
  }
  if (!path.startsWith("/api/ai-coach") && !path.startsWith("/api/dashboard/ai-coach")) return null;
  const user = await deps.currentUser(request, env);
  if (!user) return deps.reply(request, env, { error: "unauthorized" }, 401);

  if (path === "/api/ai-coach/config" && request.method === "GET") {
    return deps.reply(request, env, {
      athlete_coach_enabled: await flag(env, "athlete_coach_enabled"),
      provider: deps.text(env.AI_PROVIDER, 30).toLowerCase() || "local",
      limits: { per_user_daily: 12, global_daily: 60 },
    });
  }
  if (path === "/api/ai-coach/draft" && request.method === "POST") {
    if (!await deps.isMemberAccount(env, user)) return deps.reply(request, env, { error: "member_account_required" }, 403);
    return draftRequest(request, env, deps, "athlete", user);
  }
  if (path === "/api/ai-coach/chat" && request.method === "POST") {
    if (!await deps.isMemberAccount(env, user)) return deps.reply(request, env, { error: "member_account_required" }, 403);
    return chatRequest(request, env, deps, user);
  }
  if (path === "/api/ai-coach/progress" && request.method === "GET") {
    if (!await deps.isMemberAccount(env, user)) return deps.reply(request, env, { error: "member_account_required" }, 403);
    return deps.reply(request, env, { progress: await progressFor(env, user.id) });
  }
  const approve = /^\/api\/ai-coach\/drafts\/([\w-]{36})\/approve$/.exec(path);
  if (approve && request.method === "POST") {
    if (!await deps.isMemberAccount(env, user)) return deps.reply(request, env, { error: "member_account_required" }, 403);
    return approveRequest(request, env, deps, "athlete", user, approve[1]);
  }

  if (path === "/api/dashboard/ai-coach/draft" && request.method === "POST") {
    if (!await deps.isApprovedCoach(env, user)) return deps.reply(request, env, { error: "approved_coach_required" }, 403);
    return draftRequest(request, env, deps, "coach", user);
  }
  if (path === "/api/dashboard/ai-coach/note" && request.method === "POST") {
    if (!await deps.isApprovedCoach(env, user)) return deps.reply(request, env, { error: "approved_coach_required" }, 403);
    if (!await flag(env, "coach_planner_enabled")) return deps.reply(request, env, { error: "ai_feature_disabled" }, 403);
    if (!await quota(env, deps, user, "coach_planner")) return deps.reply(request, env, { error: "daily_limit_reached" }, 429);
    const body = await deps.readJson(request);
    const prompt = deps.text(body?.prompt, 1200);
    if (!prompt) return deps.reply(request, env, { error: "assistant_prompt_required" }, 400);
    const task = deps.text(body?.task, 40) || "session_note";
    const guides = {
      session_note: "Write one clear, professional session description a coach can paste into a plan. No medical claims.",
      progress: "Summarise the supplied training progress in neutral language and suggest one safe question for the coach to ask. No diagnosis.",
      adjustment: "Suggest one conservative training adjustment for the coach to review. Never increase load by more than 10% and avoid injury treatment.",
    };
    const result = await generateCoachText(env, {
      system: `You are the private MZActive coaching assistant. ${guides[task] || guides.session_note} Reply in the language of the prompt. The coach must review everything. Do not claim to have accessed an account or contacted an athlete.`,
      prompt, maxTokens: 500, temperature: 0.2,
    });
    return deps.reply(request, env, { draft: result.text, provider: result.provider, task });
  }
  const coachApprove = /^\/api\/dashboard\/ai-coach\/drafts\/([\w-]{36})\/approve$/.exec(path);
  if (coachApprove && request.method === "POST") {
    if (!await deps.isApprovedCoach(env, user)) return deps.reply(request, env, { error: "approved_coach_required" }, 403);
    return approveRequest(request, env, deps, "coach", user, coachApprove[1]);
  }
  if (path === "/api/dashboard/ai-coach/progress" && request.method === "GET") {
    if (!await deps.isApprovedCoach(env, user)) return deps.reply(request, env, { error: "approved_coach_required" }, 403);
    const athleteId = deps.text(url.searchParams.get("athlete_user_id"), 36);
    if (!athleteId || !await linkedCoach(env, user.id, athleteId)) return deps.reply(request, env, { error: "athlete_unavailable" }, 404);
    return deps.reply(request, env, { progress: await progressFor(env, athleteId) });
  }
  return deps.reply(request, env, { error: "not_found" }, 404);
}

export { draftView, progressFor, linkedCoach };

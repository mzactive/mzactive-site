// Provider-independent AI adapter for MZActive.
// Default mode is a deterministic, offline local planner: no API key, no paid
// call, and no third-party data transfer. Founder-configured providers can be
// selected later with AI_PROVIDER without changing any route or UI code.

export const AI_SURFACES = new Set(["athlete_coach", "coach_planner", "owner_brain", "momo"]);
export const WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
export const DEEPSEEK_MODEL = "deepseek-flash";
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const SPORTS = new Set(["run", "bike", "swim", "strength", "multi"]);
const LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const GOALS = new Set(["consistency", "endurance", "strength", "race", "general"]);
const SESSION_TYPES = new Set(["easy", "tempo", "intervals", "long", "strength", "recovery", "other"]);
const SAFETY_WORDS = /\b(injur\w*|pain\w*|chest|dizz\w*|fever|sick|fractur\w*|pregnan\w*| medically|doctor)\b|ألم|إصابة|مكسور|دوخة|حمى|مريض|طبيب/i;
const EASIER_WORDS = /\b(easier|tired|fatigue|sore|reduce|less)\b|أخف|متعب|إجهاد|أقل|تعبان/i;
const HARDER_WORDS = /\b(harder|more|increase|faster)\b|أصعب|أكثر|أسرع|أطول/i;
const MEDICAL_CLAIM = /\byou (?:have|are suffering from)\b|\bdiagnos\w+|\btreat\w+|\bcure\w+|\bprescrib\w+\b|لديك|تشخيص|علاج|وصفة/i;

const value = (input, max = 200) => typeof input === "string" && input.trim().length <= max ? input.trim() : "";
const mondayOf = (date = new Date()) => {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
};

export function normalizeTrainingInput(input = {}) {
  const sport = SPORTS.has(input.sport) ? input.sport : "run";
  const level = LEVELS.has(input.level) ? input.level : "beginner";
  const goal = GOALS.has(input.goal) ? input.goal : "general";
  const language = input.language === "ar" ? "ar" : "en";
  const days = Array.isArray(input.days) ? [...new Set(input.days.filter((day) => DAYS.includes(day)))] : [];
  const selectedDays = days.length ? DAYS.filter((day) => days.includes(day)) : ["monday", "wednesday", "friday"];
  const maxDuration = { beginner: 60, intermediate: 90, advanced: 120 }[level];
  const duration = Math.min(maxDuration, Math.max(20, Math.round(Number(input.duration) || 40)));
  return {
    sport, level, goal, language,
    days: selectedDays.slice(0, 6),
    duration,
    week_start: /^\d{4}-\d{2}-\d{2}$/.test(input.week_start || "") ? input.week_start : mondayOf(),
    message: value(input.message, 500),
    previous_sessions: Array.isArray(input.previous_sessions) ? input.previous_sessions.slice(0, 35) : [],
  };
}

const label = (language, en, ar) => language === "ar" ? ar : en;
const dayLabel = (day, language) => label(language, day.charAt(0).toUpperCase() + day.slice(1),
  ({ monday: "الاثنين", tuesday: "الثلاثاء", wednesday: "الأربعاء", thursday: "الخميس", friday: "الجمعة", saturday: "السبت", sunday: "الأحد" })[day]);

function sessionDetails(type, minutes, input) {
  const names = {
    easy: label(input.language, "Easy aerobic session", "حصة هوائية سهلة"),
    tempo: label(input.language, "Controlled tempo", "وتيرة منضبطة"),
    intervals: label(input.language, "Short intervals", "فترات قصيرة"),
    long: label(input.language, "Longer steady session", "حصة أطول بوتيرة ثابتة"),
    strength: label(input.language, "Strength and mobility", "قوة ومرونة"),
    recovery: label(input.language, "Recovery and mobility", "استشفاء وحركة"),
  };
  const effort = {
    easy: label(input.language, "conversational effort, RPE 3–4", "مجهود يمكن معه التحدث، شدة ٣–٤"),
    tempo: label(input.language, "controlled effort, RPE 5–6", "مجهود منضبط، شدة ٥–٦"),
    intervals: label(input.language, "short repetitions with full recovery, RPE 6–7", "تكرارات قصيرة مع استشفاء كامل، شدة ٦–٧"),
    long: label(input.language, "steady and unhurried, RPE 3–4", "ثابتة وغير متسرعة، شدة ٣–٤"),
    strength: label(input.language, "bodyweight or light equipment, RPE 4–5", "وزن الجسم أو أدوات خفيفة، شدة ٤–٥"),
    recovery: label(input.language, "gentle movement, RPE 2–3", "حركة خفيفة، شدة ٢–٣"),
  };
  const note = label(input.language,
    "Stop if pain or dizziness appears. This is general training guidance, not medical advice.",
    "توقف عند ظهور ألم أو دوخة. هذه إرشادات تدريب عامة وليست نصيحة طبية.");
  return `${names[type]} · ${minutes} ${label(input.language, "min", "دقيقة")} · ${effort[type]}. ${note}`;
}

function sportForSession(type, input) {
  if (type === "strength") return "strength";
  if (type === "recovery") return "recovery";
  if (input.sport === "multi") return ({ tempo: "run", intervals: "run", long: "bike", easy: "run" })[type] || "other";
  if (input.sport === "strength") return type === "easy" ? "recovery" : "strength";
  return input.sport === "run" ? "run" : input.sport === "bike" ? "bike" : "swim";
}

function planType(index, count, input) {
  if (count === 1 || (index === 0 && input.level === "beginner")) return "easy";
  if (index === count - 1 && count >= 3) return "long";
  if (count >= 4 && index === Math.floor(count / 2)) return input.level === "beginner" ? "recovery" : "strength";
  if (index % 2 === 1 && input.level !== "beginner" && input.goal !== "strength") return count <= 3 ? "tempo" : "intervals";
  return "easy";
}

function formatSessions(types, input) {
  return types.map((type, index) => ({
    day_key: input.days[index],
    sport_type: sportForSession(type, input),
    details: sessionDetails(type, input.duration, input),
    minutes: input.duration,
    session_kind: type,
  }));
}

// Local mock planner. It is intentionally conservative: no medical inference,
// no sudden load jump, and at least one easy/recovery day for busier weeks.
export function buildLocalPlan(rawInput) {
  const input = normalizeTrainingInput(rawInput);
  const warnings = [];
  const message = input.message;
  let types = input.days.map((_, index) => planType(index, input.days.length, input));
  let duration = input.duration;
  if (input.previous_sessions.length && !message) {
    const completed = input.previous_sessions.filter((session) => session.completed_at).length;
    if (completed >= 8) duration = Math.min(duration, Math.round(input.duration * 1.05));
    else if (completed <= 2) duration = Math.max(20, Math.round(duration * 0.9));
  }
  if (SAFETY_WORDS.test(message)) {
    types = types.map((type) => type === "intervals" || type === "tempo" ? "recovery" : type);
    duration = Math.max(20, Math.round(duration * 0.85));
    warnings.push(label(input.language,
      "Because you mentioned pain or illness, this draft keeps the session easy. Ask a qualified health professional before increasing training.",
      "لأنك ذكرت ألماً أو مرضاً، أبقينا الحصص سهلة. استشر مختصاً صحياً مؤهلاً قبل زيادة التدريب."));
  } else if (EASIER_WORDS.test(message)) {
    types = types.map((type) => type === "intervals" || type === "tempo" ? "easy" : type);
    duration = Math.max(20, Math.round(duration * 0.8));
  } else if (HARDER_WORDS.test(message)) {
    const quality = types.filter((type) => type === "intervals" || type === "tempo").length;
    const limit = { beginner: 1, intermediate: 2, advanced: 3 }[input.level];
    if (quality < limit) types[Math.floor(types.length / 2)] = input.level === "beginner" ? "tempo" : "intervals";
    duration = Math.min({ beginner: 60, intermediate: 90, advanced: 120 }[input.level], Math.round(duration * 1.1));
    warnings.push(label(input.language,
      "Progression is capped at 10% per week to reduce injury risk.",
      "الزيادة محدودة بـ١٠٪ أسبوعياً لتقليل خطر الإصابة."));
  }
  const sessions = formatSessions(types, { ...input, duration });
  if (input.days.length >= 4 && !sessions.some((session) => session.session_kind === "recovery")) {
    sessions[Math.floor(sessions.length / 2)].session_kind = "recovery";
    sessions[Math.floor(sessions.length / 2)].sport_type = "recovery";
    sessions[Math.floor(sessions.length / 2)].details = sessionDetails("recovery", duration, input);
  }
  const note = label(input.language,
    "Review every session before approving. Keep easy days easy, sleep well, and stop if something hurts. This plan is general training guidance, not a medical diagnosis or treatment.",
    "راجع كل حصة قبل الاعتماد. حافظ على سهولة الأيام السهلة، ونم جيداً، وتوقف عند أي ألم. هذه خطة تدريب عامة وليست تشخيصاً أو علاجاً طبياً.");
  return {
    provider: "local",
    week_start: input.week_start,
    sessions,
    coach_note: note,
    safety_warnings: warnings,
    summary: {
      sport: input.sport, level: input.level, goal: input.goal,
      sessions: sessions.length, minutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
    },
  };
}

function providerName(env) {
  return value(env?.AI_PROVIDER, 30).toLowerCase() || "local";
}

async function providerText(env, { system, prompt, expectJson = false, maxTokens = 600, temperature = 0.2 }) {
  const provider = providerName(env);
  if (provider === "local" || provider === "mock") return null;
  if (provider === "workers") {
    if (typeof env?.AI?.run !== "function") throw Error("provider_unavailable");
    const result = await env.AI.run(WORKERS_AI_MODEL, {
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      max_tokens: maxTokens, temperature,
    });
    return value(result?.response, 8000);
  }
  if (provider === "deepseek") {
    // Explicit founder setup is required: AI_PROVIDER=deepseek plus a configured
    // key. This MVP never sets either value and never makes a paid call by default.
    if (!env?.DEEPSEEK_API_KEY) throw Error("provider_unconfigured");
    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: value(env.DEEPSEEK_MODEL, 60) || DEEPSEEK_MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        max_tokens: maxTokens, temperature, stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error("provider_unavailable");
    const data = await response.json();
    return value(data?.choices?.[0]?.message?.content, 8000);
  }
  if (provider === "openai-compatible") {
    // Generic opt-in adapter for a founder-approved local or hosted endpoint.
    if (!env?.AI_BASE_URL) throw Error("provider_unconfigured");
    const response = await fetch(env.AI_BASE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...(env.AI_COMPATIBLE_KEY ? { authorization: `Bearer ${env.AI_COMPATIBLE_KEY}` } : {}) },
      body: JSON.stringify({
        model: value(env.AI_MODEL, 80) || "local-model",
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        max_tokens: maxTokens, temperature, stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error("provider_unavailable");
    const data = await response.json();
    return value(data?.choices?.[0]?.message?.content, 8000);
  }
  throw Error("provider_unavailable");
}

export async function generateTrainingPlan(env, rawInput) {
  const input = normalizeTrainingInput(rawInput);
  const local = buildLocalPlan(input);
  if (providerName(env) === "local" || providerName(env) === "mock") return local;
  const system = `You are MZA AI Coach. Produce a conservative weekly training draft in the requested language. Never diagnose, treat injury, promise results, or increase weekly load by more than 10%. Keep at least one easy/recovery day when four or more days are selected. Return only JSON: {"sessions":[{"day_key":"monday","sport_type":"run","details":"...","minutes":30}],"coach_note":"..."}. Use only these sport_type values: run,bike,swim,strength,recovery,other. Use only lowercase day_key values.`;
  const prompt = JSON.stringify({ input, safety: input.message });
  try {
    const text = await providerText(env, { system, prompt, expectJson: true, maxTokens: 900, temperature: 0.2 });
    if (!text) return local;
    if (MEDICAL_CLAIM.test(text)) {
      return {
        ...local,
        provider: `${providerName(env)}_safety_fallback`,
        safety_warnings: [...local.safety_warnings, label(input.language,
          "The AI response included a medical claim, so the offline conservative plan was used instead.",
          "تضمن رد الذكاء الاصطناعي ادعاءً طبياً، لذلك استخدمنا الخطة المحلية المحافظة بدلاً منه.")],
      };
    }
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    const ceiling = local.sessions[0]?.minutes || input.duration;
    const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions.slice(0, 12).map((session, index) => {
      const day = DAYS.includes(session?.day_key) ? session.day_key : input.days[index % input.days.length];
      const sport_type = ["run", "bike", "swim", "strength", "recovery", "other"].includes(session?.sport_type)
        ? session.sport_type : sportForSession("easy", input);
      return { day_key: day, sport_type, details: value(session?.details, 350), minutes: Math.min(ceiling, Math.max(10, Math.round(Number(session?.minutes) || input.duration))) };
    }).filter((session) => session.details) : [];
    if (!sessions.length) return local;
    return {
      provider: providerName(env),
      week_start: input.week_start,
      sessions: sessions.map((session) => ({ ...session, session_kind: "other" })),
      coach_note: value(parsed?.coach_note, 800) || local.coach_note,
      safety_warnings: local.safety_warnings,
      summary: { ...local.summary, sessions: sessions.length },
    };
  } catch {
    return { ...local, provider: `${providerName(env)}_fallback_local` };
  }
}

export async function generateCoachText(env, { system, prompt, maxTokens = 600, temperature = 0.2 }) {
  const local = label("en", "Draft unavailable in offline mode. Write the note yourself and review it before sharing.",
    "المسودة غير متاحة في الوضع المحلي. اكتب الملاحظة بنفسك وراجعها قبل المشاركة.");
  try {
    const text = await providerText(env, { system, prompt, maxTokens, temperature });
    if (!text) return { provider: providerName(env), text: local };
    if (MEDICAL_CLAIM.test(text)) {
      return { provider: `${providerName(env)}_safety_fallback`, text: local };
    }
    return { provider: providerName(env), text };
  } catch {
    return { provider: `${providerName(env)}_fallback_local`, text: local };
  }
}

export { DAYS, SESSION_TYPES, mondayOf };

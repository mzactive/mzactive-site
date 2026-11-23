// Deterministic, explainable running guidance. No external API, no medical advice.
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const EXPERIENCE = ["beginner", "intermediate", "advanced"];
const DISTANCES = ["5K", "10K", "half", "marathon", "general"];
const GOALS = ["complete", "fitness", "time"];

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
function cleanText(value, max = 500) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function paceFrom(value) {
  const raw = cleanText(value, 120);
  let match = /(\d{1,2}):([0-5]\d)\s*\/\s*km/i.exec(raw);
  if (match) return Number(match[1]) + Number(match[2]) / 60;
  match = /(\d+(?:\.\d+)?)\s*km?[^0-9]{0,20}(\d{1,2}):([0-5]\d)/i.exec(raw);
  if (match) {
    const km = Number(match[1]), seconds = Number(match[2]) * 60 + Number(match[3]);
    const pace = seconds / 60 / km;
    if (pace >= 3 && pace <= 12) return Math.round(pace * 100) / 100;
  }
  return null;
}
function paceLabel(pace) {
  if (!pace) return "";
  const minutes = Math.floor(pace), seconds = Math.round((pace - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

export function cleanAssessment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const experience = EXPERIENCE.includes(value.experience) ? value.experience : "";
  const frequency = clampNumber(value.frequency, 0, 7, 0);
  const weeklyKm = clampNumber(value.weekly_km, 0, 300, 0);
  const targetDistance = DISTANCES.includes(value.target_distance) ? value.target_distance : "";
  const goal = GOALS.includes(value.goal) ? value.goal : "";
  const days = Array.isArray(value.days) ? [...new Set(value.days.filter((day) => DAYS.includes(day)))].slice(0, 6) : [];
  if (!experience || !targetDistance || !goal) return null;
  return {
    experience, frequency, weekly_km: weeklyKm,
    recent_result: cleanText(value.recent_result, 120),
    comfortable_pace: cleanText(value.comfortable_pace, 40),
    target_distance: targetDistance, goal,
    days, limitations: cleanText(value.limitations, 500),
    city: cleanText(value.city, 80),
  };
}

export function analyzeAssessment(a) {
  const pace = paceFrom(a.recent_result) || paceFrom(a.comfortable_pace);
  const level = a.experience === "advanced" && a.weekly_km >= 40
    ? "advanced"
    : (a.experience === "beginner" || a.weekly_km < 15 ? "beginner" : "intermediate");
  const target = a.target_distance === "half" ? "Half Marathon" : a.target_distance === "marathon" ? "Marathon" : a.target_distance.toUpperCase();
  const cap = Math.max(3, Math.round(a.weekly_km * 1.1));
  const base = a.weekly_km || (level === "advanced" ? 40 : level === "intermediate" ? 20 : 10);
  const summary = `Self-reported ${level} runner training about ${a.weekly_km || base} km/week, ${a.frequency || 3} sessions/week, working toward ${target}.`;
  const paceAnalysis = pace
    ? `Reported pace ${paceLabel(pace)}. Use it only as a planning reference; no race-time guarantee is made.`
    : "No reliable pace was supplied. Keep easy runs conversational and use effort, not a predicted race time.";
  const feasibility = a.goal === "time"
    ? target === "general"
      ? "Build consistency first; a time goal needs a defined distance."
      : "A time goal is reasonable to explore after 4 consistent weeks, with conservative progression."
    : a.goal === "complete"
      ? `Completing ${target === "GENERAL" ? "your target event" : target} is a sound first goal; prioritize consistency and recovery.`
      : "Fitness and confidence are realistic goals with gradual, low-risk progression.";
  const recommendations = [
    `Keep most running at conversational effort.`,
    `Increase weekly distance by no more than about 10% when recovery is good.`,
    a.frequency >= 4 ? "One gentle quality session is enough; avoid stacking hard days." : "Add a quality session only after four consistent easy weeks.",
    "Include at least one recovery or strength day when schedule allows.",
    ...(a.limitations ? ["Respect the self-reported limitation and stop if symptoms worsen; this is not a medical assessment."] : []),
  ];
  const structure = [
    "Easy aerobic run",
    "Easy run with short relaxed strides",
    a.frequency >= 4 ? "Gentle tempo or interval session" : "Easy run or strength/mobility",
    "Long run at conversational effort",
  ];
  const assumptions = [
    "Based only on self-reported answers; no GPS, heart-rate or medical data was used.",
    "No performance, health or injury outcome is guaranteed.",
    "The plan is educational and does not replace professional medical or coaching advice.",
  ];
  return { level, target, pace, paceLabel: paceLabel(pace), summary, paceAnalysis, feasibility, recommendations, structure, assumptions, suggestedWeeklyKm: cap, base };
}

export function buildStarterPlan(a, analysis, weekStart) {
  const days = a.days.length >= 3 ? a.days.slice(0, Math.min(6, a.frequency || a.days.length)) : ["monday", "wednesday", "saturday"];
  const base = analysis.base;
  const longKm = Math.max(3, Math.round(base * 0.32));
  const easyKm = Math.max(2, Math.round(base * 0.16));
  const qualityKm = Math.max(2, Math.round(base * 0.14));
  const templates = [
    { sport: "run", km: easyKm, detail: `Easy ${easyKm}-${easyKm + 2} km, conversational effort.` },
    { sport: "run", km: easyKm, detail: `Easy ${easyKm}-${easyKm + 2} km with 4 short relaxed strides if you feel fresh.` },
    { sport: "recovery", km: 0, detail: "Recovery: 20-30 min mobility, light strength or complete rest." },
    { sport: "run", km: qualityKm, detail: `Gentle tempo: 10 min easy, 15-20 min comfortably hard, 10 min easy. Keep it controlled.` },
    { sport: "run", km: longKm, detail: `Long run ${longKm}-${longKm + 2} km at conversational effort.` },
    { sport: "strength", km: 0, detail: "Strength and mobility: 20-30 min, low impact." },
  ];
  const chosen = days.map((day, index) => ({ day_key: day, ...templates[index % templates.length] }));
  return { week_start: weekStart, sessions: chosen, coach_note: `${analysis.summary} ${analysis.assumptions[0]}` };
}

export function mondayOf(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getUTCDay();
  const diff = (day + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - diff);
  return copy.toISOString().slice(0, 10);
}

// Deterministic, explainable running guidance. No external API, no medical advice.
// All paces are min/km. Calculations use published general training principles,
// rounded to 5 seconds to avoid false precision.
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const EXPERIENCE = ["beginner", "intermediate", "advanced"];
const DISTANCES = ["5K", "10K", "half", "marathon", "custom", "general"];
const GOALS = ["start", "fitness", "distance", "finish", "time", "custom", "complete"];
const LEGACY_GOALS = { complete: "finish", fitness: "fitness", time: "time" };

function clampNumber(value, min, max, fallback = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
function cleanText(value, max = 500) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function roundPace(seconds) {
  return seconds == null ? null : Math.round(seconds / 5) * 5;
}
export function formatPace(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}/km`;
}
export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}
export function parseDuration(value) {
  if (value == null || value === "") return null;
  const raw = cleanText(String(value), 40).toLowerCase();
  let match = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/.exec(raw);
  if (match) return match[3] !== undefined
    ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    : Number(match[1]) * 60 + Number(match[2]);
  match = /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)$/.exec(raw);
  if (match) return Math.round(Number(match[1]) * 3600);
  match = /^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)$/.exec(raw);
  if (match) return Math.round(Number(match[1]) * 60);
  match = /^(\d+)\s*(?:h|hr)\s*(\d+)\s*(?:m|min)?$/.exec(raw);
  if (match) return Number(match[1]) * 3600 + Number(match[2]) * 60;
  return null;
}
export function distanceKm(value, custom = "") {
  const key = cleanText(value, 20).toLowerCase();
  if (key === "5k" || key === "5 km") return 5;
  if (key === "10k" || key === "10 km") return 10;
  if (key === "half" || key === "half marathon" || key === "21.1") return 21.0975;
  if (key === "marathon" || key === "42.2") return 42.195;
  if (key === "custom") {
    const raw = cleanText(custom, 20).toLowerCase();
    const number = Number.parseFloat(raw);
    if (!Number.isFinite(number) || number <= 0 || number > 500) return null;
    return raw.includes("m") && !raw.includes("km") ? number / 1000 : number;
  }
  const number = Number.parseFloat(key);
  return Number.isFinite(number) && number > 0 && number <= 500 ? number : null;
}
function paceFromText(value) {
  const raw = cleanText(value, 120);
  let match = /(\d{1,2}):([0-5]\d)\s*\/\s*km/i.exec(raw);
  if (match) return (Number(match[1]) * 60 + Number(match[2])) / 60;
  match = /(\d+(?:\.\d+)?)\s*km?[^0-9]{0,20}(\d{1,2}):([0-5]\d)/i.exec(raw);
  if (match) {
    const pace = (Number(match[2]) * 60 + Number(match[3])) / 60 / Number(match[1]);
    if (pace >= 3 && pace <= 12) return pace;
  }
  return null;
}
function currentBenchmark(a) {
  if (a.recent_distance && a.recent_time) {
    const km = distanceKm(a.recent_distance, a.recent_distance);
    const seconds = parseDuration(a.recent_time);
    if (km && seconds) {
      const pace = seconds / 60 / km;
      if (pace >= 3 && pace <= 12) return { pace, source: "recent_result", recency: a.recent_when || "recent" };
    }
  }
  const comfortable = paceFromText(a.comfortable_pace);
  if (comfortable) return { pace: comfortable, source: "comfortable_pace", recency: "self_reported" };
  const legacy = paceFromText(a.recent_result);
  if (legacy) return { pace: legacy, source: "recent_result", recency: a.recent_when || "recent" };
  return null;
}
function weeksUntil(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return null;
  const target = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(target)) return null;
  return Math.round((target - Date.now()) / 604800000);
}
export function assessmentFingerprint(a) {
  return JSON.stringify({
    experience: a.experience, goal: a.goal, target_distance: a.target_distance,
    target_time: a.target_time, race_date: a.race_date, weeks: a.weeks,
    weekly_km: a.weekly_km, frequency: a.frequency, benchmark: currentBenchmark(a)?.pace,
    days: a.days, custom_goal: a.custom_goal, limitations: a.limitations,
  });
}

export function cleanAssessment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const experience = EXPERIENCE.includes(value.experience) ? value.experience : "";
  const goal = GOALS.includes(value.goal) ? value.goal : LEGACY_GOALS[value.goal] || "";
  const targetDistance = DISTANCES.includes(value.target_distance) ? value.target_distance : "";
  const days = Array.isArray(value.days) ? [...new Set(value.days.filter((day) => DAYS.includes(day)))].slice(0, 6) : [];
  if (!experience || !goal) return null;
  if (goal !== "fitness" && goal !== "custom" && !targetDistance) return null;
  return {
    experience, goal,
    target_distance: targetDistance,
    target_time: cleanText(value.target_time, 20),
    custom_distance: cleanText(value.custom_distance, 20),
    custom_goal: cleanText(value.custom_goal, 300),
    race_date: /^\d{4}-\d{2}-\d{2}$/.test(value.race_date || "") ? value.race_date : "",
    frequency: clampNumber(value.frequency, 0, 7, 0),
    weekly_km: clampNumber(value.weekly_km, 0, 300, 0) ?? 0,
    recent_distance: cleanText(value.recent_distance, 20),
    recent_time: cleanText(value.recent_time, 20),
    recent_when: ["recent", "year", "older", "never", "unknown"].includes(value.recent_when) ? value.recent_when : "unknown",
    recent_result: cleanText(value.recent_result, 120),
    comfortable_pace: cleanText(value.comfortable_pace, 40),
    days,
    resting_hr: clampNumber(value.resting_hr, 30, 120),
    max_hr: clampNumber(value.max_hr, 120, 230),
    hr_zones: cleanText(value.hr_zones, 120),
    limitations: cleanText(value.limitations, 500),
    city: cleanText(value.city, 80),
    weeks: weeksUntil(value.race_date),
  };
}

export function calculatePaces(a, level) {
  const benchmark = currentBenchmark(a);
  const current = benchmark?.pace || null;
  const factors = {
    beginner: { easy: [1.18, 1.32], long: [1.12, 1.25], tempo: null, interval: null },
    intermediate: { easy: [1.15, 1.28], long: [1.10, 1.22], tempo: [0.92, 0.98], interval: [0.85, 0.92] },
    advanced: { easy: [1.12, 1.25], long: [1.08, 1.18], tempo: [0.90, 0.96], interval: [0.82, 0.89] },
  }[level];
  const range = (lo, hi) => current ? [roundPace(current * lo * 60), roundPace(current * hi * 60)] : null;
  const targetKm = distanceKm(a.target_distance, a.custom_distance);
  const targetSeconds = parseDuration(a.target_time);
  const targetPace = targetKm && targetSeconds ? roundPace(targetSeconds / targetKm) : null;
  return {
    benchmark,
    currentPace: current ? roundPace(current * 60) : null,
    easy: range(...factors.easy),
    long: range(...factors.long),
    tempo: factors.tempo ? range(...factors.tempo) : null,
    interval: factors.interval ? range(...factors.interval) : null,
    targetPace,
    targetPaceLabel: formatPace(targetPace),
    targetKm, targetSeconds,
  };
}

export function heartRateGuide(a) {
  if (a.max_hr && a.resting_hr && a.max_hr > a.resting_hr) {
    const reserve = a.max_hr - a.resting_hr;
    const zone = (low, high) => [Math.round(a.resting_hr + reserve * low), Math.round(a.resting_hr + reserve * high)];
    return { method: "heart-rate-reserve", easy: zone(0.6, 0.7), tempo: zone(0.8, 0.9), note: "Estimated from the heart-rate values you entered (heart-rate reserve method), not a measured lab test." };
  }
  if (a.max_hr) {
    return { method: "max-percent", easy: [Math.round(a.max_hr * 0.6), Math.round(a.max_hr * 0.7)], tempo: [Math.round(a.max_hr * 0.8), Math.round(a.max_hr * 0.9)], note: "Estimated as a percentage of the maximum heart rate you entered, not an individual measurement." };
  }
  return { method: "effort", note: "Use the talk test: easy means full sentences, tempo means short phrases, hard means a few words." };
}

export function assessGoal(a, paces, level) {
  if (!paces.targetPace) return { status: "insufficient", text: "Add a target finish time to assess this goal numerically. Until then, train by effort." };
  if (!paces.currentPace) return { status: "insufficient", text: `Your target pace is ${paces.targetPaceLabel}, but without a recent result or comfortable pace we cannot compare it with current ability. Treat it as a desired pace, not validated training guidance.` };
  const ratio = paces.targetPace / paces.currentPace;
  let status = "aligned", text = "Your goal appears reasonably aligned with the performance information you supplied.";
  if (ratio < 0.88) { status = "ambitious"; text = "Your goal is ambitious relative to the recent evidence. A safer intermediate milestone is recommended first."; }
  else if (ratio < 0.97) { status = "challenging"; text = "Your goal is challenging but plausible with steady, conservative preparation."; }
  if (a.weeks != null && a.weeks < 4 && status !== "aligned") {
    status = "short-window";
    text += " The race is close, so prioritize consistent training, freshness and recovery rather than aggressive fitness building.";
  }
  if (level === "beginner" && status === "ambitious") text += " Beginners should not chase this pace in training; use effort-based running.";
  return { status, text, ratio: Math.round(ratio * 100) / 100 };
}

export function buildAdvice(a, analysis, history = []) {
  const fingerprint = assessmentFingerprint(a);
  const previous = Array.isArray(history) ? history : [];
  const unchanged = previous[0] && previous[0].fingerprint === fingerprint;
  if (unchanged && Array.isArray(previous[0].advice) && previous[0].advice.length) {
    return { fingerprint, advice: previous[0].advice, reused: true };
  }
  const used = new Set(previous.slice(0, 3).flatMap((row) => (row.advice || []).map((item) => item.key)));
  const status = analysis.goalAssessment?.status;
  const priority = analysis.level === "beginner"
    ? { key: "consistent-base", title: "Your Priority", text: "Build a consistent easy-run base before adding speed work." }
    : analysis.level === "advanced"
      ? { key: "advanced-quality", title: "Your Priority", text: "With your current volume, protect recovery and keep quality to one focused session per week." }
      : { key: "intermediate-rhythm", title: "Your Priority", text: "Build a steady weekly rhythm with one controlled quality session and protected easy days." };
  const avoid = status === "ambitious" || status === "short-window"
    ? { key: "avoid-goal-pace", title: "Avoid This", text: "Do not run your target race pace in training just because it is your goal." }
    : analysis.level === "advanced"
      ? { key: "avoid-second-hard", title: "Avoid This", text: "Avoid adding a second hard day; your recent 10K evidence already shows meaningful intensity." }
      : analysis.level === "intermediate"
        ? { key: "avoid-every-run-fast", title: "Avoid This", text: "Avoid turning every run into a tempo run; most sessions should stay conversational." }
        : { key: "avoid-hard-early", title: "Avoid This", text: "Avoid stacking hard days; recovery is part of the plan." };
  const next = a.race_date && a.weeks != null && a.weeks <= 6
    ? { key: "race-taper", title: "Next Step", text: "In the final weeks, reduce volume gradually, keep familiar short sessions and arrive fresh." }
    : analysis.level === "advanced"
      ? { key: "advanced-sharpen", title: "Next Step", text: "Keep one short, controlled faster session after a full warm-up, then reassess recovery before adding anything." }
      : a.frequency < 4
        ? { key: "weekly-step", title: "Next Step", text: "Add one short easy run or mobility session this week." }
        : { key: "weekly-review", title: "Next Step", text: "Hold weekly volume steady and keep the long run unhurried for two consistent weeks." };
  const pool = [priority, avoid, next, { key: "hr-effort", title: "Your Priority", text: "Use the talk test on easy runs; pace numbers are planning references only." }];
  const advice = pool.filter((item) => !used.has(item.key)).slice(0, 3);
  return { fingerprint, advice: advice.length ? advice : pool.slice(0, 3), reused: false };
}

export function buildRaceCard(a, paces) {
  if (!paces.targetKm || !paces.targetSeconds) return null;
  const segment = paces.targetKm <= 15 ? 1 : 5;
  const splits = [];
  for (let done = 0; done < paces.targetKm - 0.01; done += segment) {
    const next = Math.min(paces.targetKm, done + segment);
    splits.push({
      label: `${Number(done.toFixed(1))}–${Number(next.toFixed(1))} km`,
      time: formatDuration((next - done) * paces.targetPace),
      cumulative: formatDuration(next * paces.targetPace),
    });
  }
  return {
    distance: paces.targetKm,
    targetTime: formatDuration(paces.targetSeconds),
    pace: paces.targetPaceLabel,
    splitsLabel: "Mathematical splits from your target time — not a prediction or personalized pacing recommendation.",
    splits,
    strategy: paces.targetKm <= 10 ? "Start controlled, settle into rhythm, and increase effort only in the final third if you feel strong." : "Hold back early, keep the long middle section relaxed, and adjust to conditions and perceived effort.",
    warmup: "Warm up with 10 minutes of easy running, gentle mobility and a few short strides.",
    caution: "Heat, humidity, wind and hills change race pace. Use effort and breathing as your final guide.",
  };
}

export function analyzeRaceResult(result, targetPace = null) {
  const km = distanceKm(result.distance, result.distance);
  const seconds = parseDuration(result.time);
  if (!km || !seconds) return null;
  const pace = roundPace(seconds / km);
  const effort = ["easy", "moderate", "hard", "max"].includes(result.effort) ? result.effort : "";
  const comparison = targetPace && pace
    ? pace <= targetPace
      ? `Actual pace ${formatPace(pace)} was at or faster than your target ${formatPace(targetPace)}.`
      : `Actual pace ${formatPace(pace)} was slower than your target ${formatPace(targetPace)}.`
    : "No target pace was available for comparison.";
  const recoveryDays = km <= 5 ? "2–3 lighter days" : km <= 10 ? "3–5 lighter days" : km <= 21.1 ? "1–2 easier weeks" : "2–4 easier weeks";
  return {
    distance_km: km, time_seconds: seconds, pace_label: formatPace(pace), effort,
    summary: `Completed ${Number(km.toFixed(1))} km in ${formatDuration(seconds)}. ${comparison}`,
    recovery: `Plan ${recoveryDays} with easy movement, sleep and normal meals. Seek professional care if pain or unusual symptoms persist.`,
    lessons: [
      "Judge the result against the conditions and your preparation, not one number.",
      targetPace ? "Use the pace difference as information for the next cycle, not proof of a single cause." : "Add a target time next time to compare pacing.",
      effort ? `Your reported effort was ${effort}; combine it with how you felt, not pace alone.` : "Record perceived effort next time for better context.",
    ],
  };
}


function buildRacePrep(a, target, level) {
  const km = distanceKm(a.target_distance, a.custom_distance) || 0;
  const weeks = a.weeks;
  const common = [
    "Keep the final weeks consistent rather than adding new hard sessions.",
    "Prioritize sleep and normal hydration; avoid untested race-day changes.",
    "Prepare kit early: shoes, clothing, bib and a simple warm-up plan.",
  ];
  const specific = km <= 10
    ? ["Stay relaxed at the start; build effort gradually after the first third.", "Include a short warm-up with easy running, mobility and a few strides."]
    : km <= 21.1
      ? ["Practice relaxed pacing over long runs; do not chase goal pace in every session.", "Plan a simple fueling approach only if you have practiced it; keep it conservative."]
      : ["Respect the long distance: build the long run gradually and protect recovery.", "Practice your race-day fluid and fueling plan in training; never try something new on race day."];
  const taper = weeks != null && weeks <= 2
    ? ["With two weeks or less, reduce volume and keep short, familiar efforts. Freshness matters more than fitness now."]
    : ["Gradually reduce training volume in the final 1-2 weeks while keeping a short familiar session."];
  const heat = ["Adjust pace to heat, humidity, wind and hills; use effort and breathing as your guide."];
  return { target, weeks, items: [...common, ...specific, ...taper, ...heat] };
}

export function analyzeAssessment(a) {
  const level = a.experience === "advanced" && a.weekly_km >= 40
    ? "advanced"
    : (a.experience === "beginner" || a.weekly_km < 15 ? "beginner" : "intermediate");
  const paces = calculatePaces(a, level);
  const target = a.target_distance === "half" ? "Half Marathon"
    : a.target_distance === "marathon" ? "Marathon"
    : a.target_distance === "custom" ? (a.custom_distance || "Custom distance")
    : a.target_distance === "general" ? "General running" : a.target_distance.toUpperCase();
  const goalAssessment = assessGoal(a, paces, level);
  const heart = heartRateGuide(a);
  const base = a.weekly_km || (level === "advanced" ? 40 : level === "intermediate" ? 20 : 10);
  const summary = `Self-reported ${level} runner training about ${base} km/week, ${a.frequency || 3} sessions/week, working toward ${target}.`;
  const paceAnalysis = paces.currentPace
    ? `Current benchmark ${formatPace(paces.currentPace)} from ${paces.benchmark.source.replace(/_/g, " ")}. Training ranges are conservative estimates.`
    : "No reliable current pace was supplied. Use talk-test and perceived effort; add a recent result later for specific training paces.";
  const recommendations = [
    paces.easy ? `Easy runs: ${formatPace(paces.easy[0])}–${formatPace(paces.easy[1])}. You should speak in full sentences.` : "Easy runs: conversational pace; you should speak in full sentences.",
    paces.tempo ? `Tempo: ${formatPace(paces.tempo[0])}–${formatPace(paces.tempo[1])} for experienced runners only.` : "Tempo: delay controlled faster work until you have a consistent easy-run base.",
    "Increase weekly distance by no more than about 10% when recovery is good.",
    ...(a.limitations ? ["Respect the self-reported limitation and stop if symptoms worsen; this is not a medical assessment."] : []),
  ];
  const structure = [
    "Easy aerobic run",
    "Easy run with short relaxed strides",
    level === "beginner" ? "Recovery or mobility" : "Gentle tempo or controlled intervals",
    "Long run at conversational effort",
  ];
  const assumptions = [
    "Based only on self-reported answers; no GPS, laboratory or medical data was used.",
    "Pace ranges use simple conservative ratios from your reported benchmark, rounded to 5 seconds.",
    "No performance, health or injury outcome is guaranteed. This is educational guidance, not medical advice or a replacement for a qualified coach.",
  ];
  const raceCard = buildRaceCard(a, paces);
  const racePrep = a.race_date ? buildRacePrep(a, target, level) : null;
  const weekPlan = buildStarterPlan(a, { level, base, paces, summary, assumptions }, mondayOf()).sessions;
  return {
    level, target, summary, paceAnalysis, paces, heart, goalAssessment,
    raceCard, racePrep, weekPlan,
    recommendations, structure, assumptions,
    suggestedWeeklyKm: Math.max(3, Math.round(base * 1.1)), base,
  };
}

export function buildStarterPlan(a, analysis, weekStart) {
  const days = a.days.length >= 3 ? a.days.slice(0, Math.min(6, a.frequency || a.days.length)) : ["monday", "wednesday", "saturday"];
  const base = analysis.base;
  const longKm = Math.max(3, Math.round(base * 0.32));
  const easyKm = Math.max(2, Math.round(base * 0.16));
  const templates = [
    { sport: "run", km: easyKm, detail: `Easy ${easyKm}-${easyKm + 2} km. ${analysis.paces.easy ? formatPace(analysis.paces.easy[0]) + "–" + formatPace(analysis.paces.easy[1]) : "Conversational effort."}` },
    { sport: "run", km: easyKm, detail: `Easy ${easyKm}-${easyKm + 2} km with 4 short relaxed strides if you feel fresh.` },
    { sport: "recovery", km: 0, detail: "Recovery: 20-30 min mobility, light strength or complete rest." },
    { sport: "run", km: Math.max(2, Math.round(base * 0.12)), detail: analysis.level === "beginner" ? "Easy run or strength/mobility; no hard session yet." : `Controlled tempo: 10 min easy, 15 min comfortably hard, 10 min easy.` },
    { sport: "run", km: longKm, detail: `Long run ${longKm}-${longKm + 2} km at conversational effort.` },
    { sport: "strength", km: 0, detail: "Strength and mobility: 20-30 min, low impact." },
  ];
  const chosen = days.map((day, index) => ({ day_key: day, ...templates[index % templates.length] }));
  return { week_start: weekStart, sessions: chosen, coach_note: `${analysis.summary} ${analysis.assumptions[0]}` };
}

export function mondayOf(date = new Date()) {
  const copy = new Date(date);
  const diff = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - diff);
  return copy.toISOString().slice(0, 10);
}

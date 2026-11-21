// Pure, side-effect-free helpers for the athlete CRM. All outbound invitations
// are drafts/requests: the athlete decides, and no helper here changes a record.
export const ATHLETE_INVITATION_URL = "https://mzactive.com/athlete-invitations.html";
export const ATHLETE_INVITATION_TTL_DAYS = 14;

const SYNONYMS = {
  run: "running", runner: "running", jog: "running", jogging: "running",
  bike: "cycling", biker: "cycling", ride: "cycling",
  swim: "swimming", swimmer: "swimming",
  gym: "strength", weights: "strength", weightlifting: "strength",
  football: "football", soccer: "football",
  padel: "padel", boxing: "boxing", kickboxing: "kickboxing", walk: "walking", walking: "walking",
};

const GOAL_KEYWORDS = {
  race: ["race", "racing", "marathon", "half marathon", "10k", "5k", "parkrun"],
  strength: ["strength", "stronger", "weights", "gym", "muscle"],
  consistency: ["consistent", "routine", "regular", "habit", "plan"],
  confidence: ["confidence", "confident", "start", "beginner", "new to"],
  performance: ["pace", "faster", "pb", "personal best", "performance", "endurance"],
};

const esc = (value) => String(value || "")
  .replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]))
  .slice(0, 160);

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "")).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "")).filter(Boolean) : [value];
  } catch {
    return [value];
  }
}

export function normalizeTerms(value) {
  const words = asArray(value).join(" ").toLowerCase().match(/[a-z0-9]+/g) || [];
  return [...new Set(words.filter((word) => word.length > 2).map((word) => SYNONYMS[word] || word))];
}

function samePlace(a, b) {
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  return Boolean(left && right && left === right);
}

export function onboardingIncomplete(profile) {
  // CRM rows alias the profile timestamp as profile_updated_at; direct profile
  // records use updated_at. Accept either so a complete profile is never
  // mislabeled as incomplete.
  if (!profile || !(profile.updated_at || profile.profile_updated_at)) return true;
  const sports = asArray(profile.sports);
  return !String(profile.display_name || "").trim()
    || sports.length === 0
    || !String(profile.goals || "").trim();
}

export function lastActivityAt(row) {
  return [
    row?.profile_updated_at,
    row?.connection_updated_at,
    row?.program_created_at,
    row?.booking_created_at,
    row?.message_created_at,
    row?.invitation_created_at,
  ].filter(Boolean).sort().at(-1) || null;
}

export function isActive(row, now = Date.now()) {
  const at = lastActivityAt(row);
  if (!at) return false;
  const time = Date.parse(at);
  return Number.isFinite(time) && now - time <= 30 * 24 * 60 * 60 * 1000;
}

function reason(code, en, ar) { return { code, en, ar }; }

export function coachMatches(athlete, coaches) {
  const sports = normalizeTerms(athlete?.sports);
  const goals = String(athlete?.goals || "").toLowerCase();
  const athleteCity = String(athlete?.city || "").trim();
  const athleteLanguage = String(athlete?.preferred_language || "").trim().toLowerCase();
  const availability = String(athlete?.availability_notes || "").toLowerCase();

  return (Array.isArray(coaches) ? coaches : []).map((coach) => {
    const coachTerms = normalizeTerms([
      ...asArray(coach.specialties),
      ...asArray(coach.services),
      String(coach.bio || ""),
    ]);
    const reasons = [reason("approved_coach", "Approved MZ Active coach", "مدرب معتمد من MZ Active")];
    let score = 20;

    const sportOverlap = sports.filter((sport) => coachTerms.includes(sport));
    if (sportOverlap.length) {
      score += 35;
      reasons.push(reason("sport_match", `Shares your sport: ${sportOverlap.slice(0, 3).join(", ")}`, `يتشارك رياضتك: ${sportOverlap.slice(0, 3).join("، ")}`));
    }

    const matchedGoals = Object.entries(GOAL_KEYWORDS)
      .filter(([, words]) => words.some((word) => goals.includes(word) && coachTerms.some((term) => term.includes(word.split(" ")[0]))))
      .map(([key]) => key);
    if (matchedGoals.length) {
      score += 18;
      reasons.push(reason("goal_match", "Experience aligned with your stated goals", "خبرة مرتبطة بأهدافك المعلنة"));
    }

    if (samePlace(athleteCity, coach.city)) {
      score += 15;
      reasons.push(reason("location_match", `Based in ${coach.city}`, `مقيم في ${coach.city}`));
    }

    const languages = asArray(coach.languages).map((item) => item.toLowerCase());
    if (athleteLanguage && languages.some((language) => language.includes(athleteLanguage) || athleteLanguage.includes(language))) {
      score += 15;
      reasons.push(reason("language_match", "Speaks your preferred language", "يتحدث لغتك المفضلة"));
    }

    const mode = String(coach.coaching_mode || "").toLowerCase();
    const online = availability.includes("online") || availability.includes("عن بعد");
    const inPerson = availability.includes("in person") || availability.includes("in-person") || availability.includes("حضوري");
    if (mode && (online || inPerson) && ((online && mode.includes("online")) || (inPerson && (mode.includes("person") || mode.includes("both"))))) {
      score += 12;
      reasons.push(reason("availability_match", "Offers the session format you noted", "يوفر نمط الجلسات الذي ذكرته"));
    } else if (mode) {
      score += 4;
      reasons.push(reason("delivery_mode", `Offers ${mode} sessions`, `يقدم جلسات ${mode}`));
    }

    if (!sports.length) reasons.push(reason("limited_profile", "Add sports to your profile for a closer match", "أضف رياضات إلى ملفك للحصول على تطابق أدق"));
    if (!athleteLanguage) reasons.push(reason("language_not_provided", "Preferred language not provided", "اللغة المفضلة غير متوفرة"));
    if (!athlete.availability_notes) reasons.push(reason("availability_not_provided", "Availability not provided", "أوقات التدريب غير متوفرة"));

    return {
      coach_id: coach.id,
      coach_user_id: coach.user_id,
      coach_name: coach.display_name || "MZ Active coach",
      city: coach.city || "",
      coaching_mode: mode || "",
      languages: asArray(coach.languages),
      specialties: asArray(coach.specialties),
      score: Math.min(100, score),
      reasons,
    };
  }).sort((a, b) => b.score - a.score).slice(0, 6);
}

export function invitationEmail(kind, details, token) {
  const link = `${ATHLETE_INVITATION_URL}?token=${encodeURIComponent(token)}`;
  const name = esc(details.athleteName) || "Athlete";
  const coach = esc(details.coachName) || "an approved MZ Active coach";
  const isCoach = kind === "coach";
  const primary = isCoach
    ? `<p style="margin:0 0 12px">Hi ${name},</p>
       <h1 style="margin:0 0 16px;color:#172a22;font-size:23px">A coach has been recommended to you</h1>
       <p style="margin:0 0 12px">${coach} would like to open a private coaching workspace with you.</p>
       <p style="margin:0 0 12px">You decide. Nothing is shared and no workspace opens until you accept. You can also decline.</p>`
    : `<p style="margin:0 0 12px">Hi ${name},</p>
       <h1 style="margin:0 0 16px;color:#172a22;font-size:23px">Complete your sports profile</h1>
       <p style="margin:0 0 12px">A few optional details help MZ Active suggest suitable coaches and training support.</p>
       <p style="margin:0 0 12px">Your profile stays private and is never published.</p>`;
  const secondary = isCoach
    ? `<p style="margin:0 0 10px">مرحباً ${name}،</p><p>تم ترشيح مدرب معتمد للتواصل معك عبر مساحة تدريب خاصة. أنت من يقرر؛ لا تتم مشاركة أي بيانات ولا تُفتح المساحة إلا بعد قبولك، ويمكنك الرفض.</p>`
    : `<p style="margin:0 0 10px">مرحباً ${name}،</p><p>أضف بعض التفاصيل الاختيارية إلى ملفك الرياضي لمساعدة MZ Active في اقتراح مدربين مناسبين. يبقى ملفك خاصاً ولا يُنشر.</p>`;
  const arabicFirst = details.language === "ar";
  const ctaEn = isCoach ? "Review and respond" : "Open my profile";
  const ctaAr = isCoach ? "مراجعة والرد" : "فتح ملفي";
  const html = `<div style="background:#f4f1e8;padding:24px 12px;font-family:Arial,sans-serif"><table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:auto;width:100%;background:#fff;border-radius:14px;overflow:hidden"><tr><td style="background:#091d21;padding:22px 28px"><img src="https://mzactive.com/assets/brand/mzactive-logo.webp" alt="MZ Active" width="180" style="display:block;max-width:70%;height:auto"></td></tr><tr><td style="padding:28px;color:#22352e;line-height:1.6"><div lang="${arabicFirst ? "ar" : "en"}" dir="${arabicFirst ? "rtl" : "ltr"}">${arabicFirst ? secondary : primary}</div><p style="margin:22px 0"><a href="${link}" style="background:#f2b718;color:#172a22;border-radius:999px;padding:12px 22px;text-decoration:none;font-weight:700;display:inline-block">${arabicFirst ? ctaAr : ctaEn}</a></p><hr style="border:0;border-top:1px solid #e3e7e2;margin:24px 0"><div lang="${arabicFirst ? "en" : "ar"}" dir="${arabicFirst ? "ltr" : "rtl"}" style="color:#5b6d64;font-size:14px">${arabicFirst ? primary : secondary}</div></td></tr><tr><td style="background:#091d21;color:#f2b718;padding:18px 28px;font-size:13px">The MZActive Team<br><em>Train Smart. Perform Strong.</em></td></tr></table></div>`;
  const text = `${isCoach ? "A coach has been recommended to you" : "Complete your sports profile"}\n\n${name},\n\n${isCoach ? `${coach} would like to open a private coaching workspace. You decide; nothing is shared until you accept.` : "Add optional details to help MZ Active suggest suitable coaches. Your profile stays private."}\n\n${ctaEn}: ${link}\n\n${isCoach ? "تم ترشيح مدرب معتمد للتواصل معك. أنت من يقرر؛ لا تتم مشاركة أي بيانات قبل قبولك." : "أضف تفاصيل اختيارية لمساعدتنا في اقتراح مدربين مناسبين. يبقى ملفك خاصاً."}\n\n${ctaAr}: ${link}\n\nThe MZActive Team`;
  return {
    subject: isCoach
      ? "A recommended coach / مدرب مقترح لك"
      : "Complete your sports profile / أكمل ملفك الرياضي",
    html,
    text,
  };
}

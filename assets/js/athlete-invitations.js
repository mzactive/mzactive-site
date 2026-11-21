/* Athlete-facing consent page. The invitation token comes only from the URL;
 * it is never written to storage, analytics or the DOM beyond the address bar.
 * Accepting a coach invitation is the athlete's explicit consent that opens a
 * private workspace; nothing is auto-assigned. */
(() => {
  const COPY = {
    coach_title: ['Coach invitation', 'دعوة مدرب'],
    profile_title: ['Sports profile invitation', 'دعوة ملف رياضي'],
    from: ['From', 'من'],
    for: ['For', 'إلى'],
    expires: ['Expires', 'تنتهي في'],
    accept: ['Accept', 'قبول'],
    decline: ['Decline', 'رفض'],
    working: ['Working…', 'جارٍ التنفيذ…'],
    missing_token: ['This link is missing an invitation token. Open the link from your email.', 'لا يحتوي هذا الرابط على رمز دعوة. افتح الرابط من بريدك الإلكتروني.'],
    not_found: ['This invitation is invalid, expired or already answered.', 'هذه الدعوة غير صالحة أو منتهية أو تمت الإجابة عليها.'],
    rate_limited: ['Too many attempts. Wait a minute and try again.', 'محاولات كثيرة. انتظر دقيقة ثم حاول مجدداً.'],
    network: ['Could not reach the service. Check your connection and try again.', 'تعذر الاتصال بالخدمة. تحقق من اتصالك وحاول مجدداً.'],
    generic: ['The service returned an unexpected response. Try again shortly.', 'عادت الخدمة باستجابة غير متوقعة. حاول بعد قليل.'],
    accepted_coach: ['Invitation accepted', 'تم قبول الدعوة'],
    accepted_coach_body: ['Your private coaching workspace is ready. You can open it from your dashboard.', 'مساحة التدريب الخاصة بك جاهزة. يمكنك فتحها من لوحة التحكم.'],
    declined_coach: ['Invitation declined', 'تم رفض الدعوة'],
    declined_coach_body: ['No workspace was opened and no coach was assigned.', 'لم تُفتح أي مساحة ولم يتم تعيين أي مدرب.'],
    accepted_profile: ['Invitation accepted', 'تم قبول الدعوة'],
    accepted_profile_body: ['Open your sports profile to add optional details.', 'افتح ملفك الرياضي لإضافة تفاصيل اختيارية.'],
    declined_profile: ['Invitation declined', 'تم رفض الدعوة'],
    declined_profile_body: ['Your sports profile remains empty and private.', 'يبقى ملفك الرياضي فارغاً وخاصاً.'],
    next_profile: ['Open sports profile', 'فتح الملف الرياضي'],
    next_dashboard: ['Go to dashboard', 'الذهاب إلى لوحة التحكم'],
    reasons: {
      approved_coach: ['Approved MZ Active coach', 'مدرب معتمد من MZ Active'],
      sport_match: ['Shares your sport', 'يتشارك رياضتك'],
      goal_match: ['Aligned with your goals', 'مرتبط بأهدافك'],
      location_match: ['Matches your city', 'يتطابق مع مدينتك'],
      language_match: ['Speaks your preferred language', 'يتحدث لغتك المفضلة'],
      availability_match: ['Offers your preferred session format', 'يوفر نمط الجلسات المفضل لديك'],
      delivery_mode: ['Offers a clear session format', 'يوفر نمط جلسات واضحاً'],
      limited_profile: ['Add sports for a closer match', 'أضف رياضات لتطابق أدق'],
      language_not_provided: ['Preferred language not provided', 'اللغة المفضلة غير متوفرة'],
      availability_not_provided: ['Availability not provided', 'الأوقات المناسبة غير متوفرة'],
    },
  };
  const lang = () => (window.MZActiveLanguage?.get?.() === 'ar' ? 'ar' : 'en');
  const t = (pair) => Array.isArray(pair) ? pair[lang() === 'ar' ? 1 : 0] : pair;
  const $ = (id) => document.getElementById(id);
  const setText = (node, pair) => { node.dataset.en = Array.isArray(pair) ? pair[0] : pair; node.dataset.ar = Array.isArray(pair) ? pair[1] : pair; node.textContent = t(pair); };
  const localize = () => {
    for (const node of document.querySelectorAll('[data-en][data-ar]')) {
      if (node.dataset.en != null && node.dataset.ar != null) node.textContent = node.dataset[lang()];
    }
  };
  document.addEventListener('mzactive:language-change', localize);

  const token = new URLSearchParams(location.search).get('token')?.trim() || '';
  const statusNode = $('invitationStatus');
  const details = $('invitationDetails');
  const success = $('invitationSuccess');
  const loading = $('invitationLoading');
  let invitation = null;

  const status = (pair, tone = '') => {
    setText(statusNode, pair);
    if (tone) statusNode.dataset.tone = tone; else delete statusNode.dataset.tone;
  };
  const errorCopy = (code) => COPY[code] || COPY.generic;
  const api = async (path, options = {}) => {
    const base = window.MZACTIVE_API_BASE || '';
    let response;
    try {
      response = await fetch(base + path, {
        ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
        cache: 'no-store',
      });
    } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { code: data.error });
    return data;
  };

  async function load() {
    if (!token) { loading.hidden = true; status(COPY.missing_token, 'error'); return; }
    try {
      const data = await api(`/api/athlete-invitations/${encodeURIComponent(token)}`);
      invitation = data.invitation;
      loading.hidden = true;
      setText($('invitationTitle'), invitation.kind === 'coach' ? COPY.coach_title : COPY.profile_title);
      const meta = [
        `${t(COPY.for)}: ${invitation.athlete_name}`,
        ...(invitation.coach_name ? [`${t(COPY.from)}: ${invitation.coach_name}`] : []),
        `${t(COPY.expires)}: ${new Intl.DateTimeFormat(lang() === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'medium' }).format(new Date(invitation.expires_at))}`,
      ].join(' · ');
      $('invitationMeta').textContent = meta;
      const reasons = $('invitationReasons');
      reasons.replaceChildren();
      for (const code of invitation.reason_codes || []) {
        const item = document.createElement('li');
        item.textContent = t(COPY.reasons[code] || [code, code]);
        reasons.append(item);
      }
      details.hidden = false;
    } catch (error) {
      loading.hidden = true;
      status(errorCopy(error.code), 'error');
    }
  }

  async function respond(action, button) {
    if (!invitation) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const original = { en: button.dataset.en, ar: button.dataset.ar };
    setText(button, COPY.working);
    status('');
    try {
      const data = await api(`/api/athlete-invitations/${encodeURIComponent(token)}`, {
        method: 'POST', body: JSON.stringify({ action }),
      });
      details.hidden = true;
      success.hidden = false;
      const accepted = data.status === 'accepted';
      const titleKey = `${accepted ? 'accepted' : 'declined'}_${invitation.kind}`;
      const bodyKey = `${accepted ? 'accepted' : 'declined'}_${invitation.kind}_body`;
      setText($('invitationSuccessTitle'), COPY[titleKey]);
      setText($('invitationSuccessBody'), COPY[bodyKey]);
      setText($('invitationNext'), invitation.kind === 'profile' && accepted ? COPY.next_profile : COPY.next_dashboard);
      $('invitationNext').setAttribute('href', invitation.kind === 'profile' && accepted ? 'community.html#sportsProfileSection' : 'dashboard.html');
      $('invitationSuccessTitle').focus({ preventScroll: true });
    } catch (error) {
      status(errorCopy(error.code), 'error');
      button.disabled = false;
      button.removeAttribute('aria-busy');
      setText(button, [original.en, original.ar]);
    }
  }

  $('invitationAccept').addEventListener('click', (event) => respond('accept', event.currentTarget));
  $('invitationDecline').addEventListener('click', (event) => respond('decline', event.currentTarget));
  load();
})();

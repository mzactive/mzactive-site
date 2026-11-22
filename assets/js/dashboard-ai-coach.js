/* Coach-side MZA AI Coach planner. Drafts stay invisible to the athlete until
 * this approved coach explicitly approves and saves them. */
(() => {
  const $ = id => document.getElementById(id);
  const t = (en, ar) => window.MZActiveLanguage?.get() === 'ar' ? ar : en;
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const DAY_AR = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
  let draftId = '';

  async function api(path, options = {}) {
    const token = window.MZActiveAuth?.token?.() || localStorage.getItem('mzactive-provider-session') || sessionStorage.getItem('mzactive-provider-session');
    const headers = { ...(options.headers || {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
    if (options.body) headers['content-type'] = 'application/json';
    const response = await fetch(`${window.MZACTIVE_API_BASE}/api/${path}`, {
      ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || data.message || `Request failed (${response.status})`);
    return data;
  }

  function status(message) { $('coachPlanStatus').textContent = message || ''; }

  function monday(date = new Date()) {
    const value = new Date(date);
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
    return value.toISOString().slice(0, 10);
  }

  function fillAthletes() {
    const target = $('coachPlanAthlete');
    const source = $('programAthlete');
    if (!target || !source) return;
    const selected = target.value;
    target.replaceChildren(new Option(t('Select a linked athlete', 'اختر رياضياً مرتبطاً'), ''));
    for (const option of source.options) {
      if (!option.value) continue;
      target.append(new Option(option.textContent, option.value));
    }
    if ([...target.options].some(option => option.value === selected)) target.value = selected;
  }

  function renderPlan(plan) {
    const box = $('coachPlanPreview');
    box.replaceChildren();
    for (const session of plan.sessions || []) {
      const card = document.createElement('article');
      card.className = 'panel';
      const title = document.createElement('h3');
      const index = DAYS.indexOf(session.day_key);
      title.textContent = t(session.day_key.charAt(0).toUpperCase() + session.day_key.slice(1), DAY_AR[index] || session.day_key);
      const details = document.createElement('p');
      details.className = 'muted';
      details.textContent = session.details;
      card.append(title, details);
      box.append(card);
    }
    if ((plan.safety_warnings || []).length) {
      const note = document.createElement('p');
      note.className = 'notice';
      note.textContent = plan.safety_warnings.join(' ');
      box.append(note);
    }
    box.hidden = false;
    $('coachPlanApprove').classList.remove('hidden');
  }

  function init() {
    if (!$('coachPlanGenerate')) return;
    $('coachPlanWeek').value = monday();
    document.addEventListener('mzactive:dashboard-ready', fillAthletes);
    fillAthletes();
    $('coachPlanGenerate').addEventListener('click', async () => {
      const athleteId = $('coachPlanAthlete').value;
      if (!athleteId) { status(t('Choose a linked athlete first.', 'اختر رياضياً مرتبطاً أولاً.')); return; }
      $('coachPlanGenerate').disabled = true;
      status(t('Preparing an AI draft…', 'جارٍ إعداد مسودة الذكاء الاصطناعي…'));
      try {
        const data = await api('dashboard/ai-coach/draft', { method: 'POST', body: {
          athlete_user_id: athleteId,
          sport: $('coachPlanSport').value, level: $('coachPlanLevel').value, goal: $('coachPlanGoal').value,
          duration: Number($('coachPlanDuration').value), week_start: $('coachPlanWeek').value,
          language: window.MZActiveLanguage?.get() === 'ar' ? 'ar' : 'en',
          message: $('coachPlanNotes').value.trim(),
        } });
        draftId = data.draft_id;
        renderPlan(data.plan);
        status(t('Draft ready. Review it carefully before approving.', 'المسودة جاهزة. راجعها بعناية قبل الاعتماد.'));
      } catch (error) { status(error.message); }
      finally { $('coachPlanGenerate').disabled = false; }
    });
    $('coachPlanApprove').addEventListener('click', async () => {
      if (!draftId) return;
      $('coachPlanApprove').disabled = true;
      status(t('Saving the approved program…', 'جارٍ حفظ البرنامج المعتمد…'));
      try {
        const data = await api(`dashboard/ai-coach/drafts/${draftId}/approve`, { method: 'POST', body: { approve: true } });
        draftId = '';
        $('coachPlanPreview').hidden = true;
        $('coachPlanApprove').classList.add('hidden');
        status(t(`Saved for week ${data.week_start}. The athlete can see it in their calendar.`, `تم الحفظ لأسبوع ${data.week_start}. يمكن للرياضي رؤيته في تقويمه.`));
      } catch (error) { status(error.message); }
      finally { $('coachPlanApprove').disabled = false; }
    });
  }

  init();
})();

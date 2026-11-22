(() => {
  const $ = id => document.getElementById(id);
  const t = (en, ar) => window.MZActiveLanguage?.get() === 'ar' ? ar : en;
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const DAY_AR = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
  const dayName = (day, i) => t(day.charAt(0).toUpperCase() + day.slice(1), DAY_AR[i]);
  const state = { draft: null, weekStart: '' };

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

  function status(message) { $('aiStatus').textContent = message || ''; }

  function monday(date = new Date()) {
    const value = new Date(date);
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
    return value.toISOString().slice(0, 10);
  }

  function renderPlan(plan) {
    const box = $('planPreview');
    box.replaceChildren();
    if (!plan) return;
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = plan.coach_note || '';
    box.append(note);
    for (const warning of plan.safety_warnings || []) {
      const item = document.createElement('p');
      item.className = 'fine plan-warning';
      item.textContent = '⚠ ' + warning;
      box.append(item);
    }
    for (const session of plan.sessions || []) {
      const card = document.createElement('article');
      card.className = 'plan-day';
      const heading = document.createElement('strong');
      heading.textContent = dayName(session.day_key, DAYS.indexOf(session.day_key));
      card.append(heading);
      const details = document.createElement('p');
      details.textContent = session.details;
      card.append(details);
      box.append(card);
    }
    $('reviewPanel').hidden = false;
    $('chatSection').hidden = false;
  }

  async function loadProgress() {
    try {
      const data = await api('ai-coach/progress');
      const progress = data.progress || {};
      const metrics = [
        [t('Completed sessions', 'الحصص المكتملة'), progress.completed_sessions || 0],
        [t('Planned sessions', 'الحصص المخططة'), progress.planned_sessions || 0],
        [t('Training minutes', 'دقائق التدريب'), progress.total_minutes || 0],
        [t('Distance (km)', 'المسافة (كم)'), progress.total_kilometres || 0],
      ];
      const box = $('progressView');
      box.replaceChildren();
      for (const [label, value] of metrics) {
        const metric = document.createElement('div');
        metric.className = 'metric';
        const span = document.createElement('span');
        span.textContent = label;
        const strong = document.createElement('strong');
        strong.textContent = String(value);
        metric.append(span, strong);
        box.append(metric);
      }
      $('progressSection').hidden = false;
    } catch { $('progressSection').hidden = true; }
  }

  async function init() {
    const config = await api('ai-coach/config').catch(() => null);
    if (!config || !config.athlete_coach_enabled) {
      status(t('The AI Coach is currently unavailable.', 'المساعد الذكي غير متاح حالياً.'));
      return;
    }
    let session;
    try { session = await api('dashboard'); } catch {
      $('authGate').hidden = false;
      return;
    }
    if (session.role !== 'member') {
      $('coachRedirect').hidden = false;
      return;
    }
    $('planner').hidden = false;
    state.weekStart = monday();
    $('weekStart').value = state.weekStart;
    const options = $('dayOptions');
    DAYS.forEach((day, index) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox'; input.name = 'days'; input.value = day;
      if (['monday', 'wednesday', 'friday'].includes(day)) input.checked = true;
      const text = document.createElement('span');
      text.textContent = dayName(day, index);
      label.append(input, text);
      options.append(label);
    });
    const language = window.MZActiveLanguage?.get();
    if (language === 'ar') $('language').value = 'ar';
    $('duration').addEventListener('input', () => { $('durationOutput').textContent = $('duration').value; });
    $('planForm').addEventListener('submit', async event => {
      event.preventDefault();
      status(t('Preparing your draft…', 'جارٍ إعداد مسودتك…'));
      $('generatePlan').disabled = true;
      try {
        const body = {
          sport: $('sport').value, level: $('level').value, goal: $('goal').value,
          days: [...$('planForm').querySelectorAll('input[name=days]:checked')].map(input => input.value),
          duration: Number($('duration').value), week_start: $('weekStart').value,
          language: $('language').value, purpose: 'initial',
        };
        const data = await api('ai-coach/draft', { method: 'POST', body });
        state.draft = data.draft_id;
        state.weekStart = data.plan.week_start;
        renderPlan(data.plan);
        status(t('Draft ready. Review it below, then approve to save it to your calendar.', 'المسودة جاهزة. راجعها أدناه ثم اعتمدها لحفظها في تقويمك.'));
      } catch (error) { status(error.message); }
      finally { $('generatePlan').disabled = false; }
    });
    $('approvePlan').addEventListener('click', async () => {
      if (!state.draft) return;
      status(t('Saving your approved plan…', 'جارٍ حفظ خطتك المعتمدة…'));
      try {
        await api(`ai-coach/drafts/${state.draft}/approve`, { method: 'POST', body: { approve: true } });
        state.draft = null;
        $('reviewPanel').hidden = true;
        status(t('Saved. Open your calendar to see the plan.', 'تم الحفظ. افتح تقويمك لعرض الخطة.'));
        await loadProgress();
      } catch (error) { status(error.message); }
    });
    $('chatForm').addEventListener('submit', async event => {
      event.preventDefault();
      const message = $('chatMessage').value.trim();
      if (!message) return;
      status(t('Preparing your adjustment…', 'جارٍ إعداد التعديل…'));
      try {
        const data = await api('ai-coach/chat', { method: 'POST', body: {
          message, draft_id: state.draft || undefined, week_start: $('weekStart').value || state.weekStart,
          language: $('language').value,
        } });
        state.draft = data.draft_id;
        state.weekStart = data.plan.week_start;
        renderPlan(data.plan);
        status(data.message || t('Adjusted draft ready for review.', 'المسودة المعدّلة جاهزة للمراجعة.'));
      } catch (error) { status(error.message); }
    });
    await loadProgress();
  }

  document.addEventListener('mzactive:language-change', () => {
    const language = window.MZActiveLanguage?.get();
    if ($('language')) $('language').value = language === 'ar' ? 'ar' : 'en';
    document.querySelectorAll('#dayOptions label span').forEach((span, index) => { span.textContent = dayName(DAYS[index], index); });
  });
  init();
})();

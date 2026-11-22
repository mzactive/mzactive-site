(() => {
  const $ = id => document.getElementById(id);
  const lang = () => window.MZActiveLanguage?.get() === 'ar' ? 'ar' : 'en';
  const t = (en, ar) => lang() === 'ar' ? ar : en;
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const DAY_AR = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
  const dayName = (day, i) => t(day.charAt(0).toUpperCase() + day.slice(1), DAY_AR[i]);
  const state = { draft: null, weekStart: '' };
  const dynamicText = new Set();

  const COPY = {
    signIn: ['Your session has expired. Sign in again to continue.', 'انتهت جلستك. سجّل الدخول مجدداً للمتابعة.'],
    disabled: ['The AI Coach is currently disabled. Please try again later.', 'المساعد الذكي معطل حالياً. يُرجى المحاولة لاحقاً.'],
    unavailable: ['The AI Coach service is temporarily unavailable. Please try again.', 'خدمة المساعد الذكي غير متاحة مؤقتاً. يُرجى المحاولة مجدداً.'],
    verifyFailed: ['Your account could not be verified. Please try again.', 'تعذر التحقق من حسابك. يُرجى المحاولة مجدداً.'],
    memberOnly: ['The AI Coach is available to signed-in athlete accounts only.', 'المساعد الذكي متاح لحسابات الرياضيين المسجلين فقط.'],
    coachOnly: ['This action requires an approved coach account.', 'يتطلب هذا الإجراء حساب مدرب معتمد.'],
    coachManaged: ['Your coach manages this week. Ask your coach for an adjustment.', 'مدربك يدير هذا الأسبوع. اطلب منه تعديلاً.'],
    weekExists: ['A program already exists for this week. Open your calendar to review it.', 'يوجد برنامج بالفعل لهذا الأسبوع. افتح تقويمك لمراجعته.'],
    limit: ['The daily AI Coach limit has been reached. Try again tomorrow.', 'تم بلوغ الحد اليومي للمساعد الذكي. حاول مرة أخرى غداً.'],
    planUnavailable: ['The AI Coach could not create a plan right now. Please try again.', 'تعذر إنشاء خطة الآن. يُرجى المحاولة مجدداً.'],
    invalid: ['That request could not be completed. Please review your choices and try again.', 'تعذر إكمال الطلب. راجع اختياراتك وحاول مجدداً.'],
    generic: ['Something went wrong. Please try again.', 'حدث خطأ. يُرجى المحاولة مجدداً.'],
    preparing: ['Preparing your draft…', 'جارٍ إعداد مسودتك…'],
    draftReady: ['Draft ready. Review it below, then approve to save it to your calendar.', 'المسودة جاهزة. راجعها أدناه ثم اعتمدها لحفظها في تقويمك.'],
    saving: ['Saving your approved plan…', 'جارٍ حفظ خطتك المعتمدة…'],
    saved: ['Saved. Open your calendar to see the plan.', 'تم الحفظ. افتح تقويمك لعرض الخطة.'],
    adjusting: ['Preparing your adjustment…', 'جارٍ إعداد التعديل…'],
    adjusted: ['Adjusted draft ready for review.', 'المسودة المعدّلة جاهزة للمراجعة.'],
    adjustedCoach: ['Your coach manages this week. Send this adjustment request to your coach; nothing was saved automatically.', 'مدربك يدير هذا الأسبوع. أرسل طلب التعديل إلى مدربك؛ لم يُحفظ شيء تلقائياً.'],
    completed: ['Completed sessions', 'الحصص المكتملة'],
    planned: ['Planned sessions', 'الحصص المخططة'],
    minutes: ['Training minutes', 'دقائق التدريب'],
    distance: ['Distance (km)', 'المسافة (كم)'],
  };
  const ERROR_COPY = {
    unauthorized: COPY.signIn,
    ai_feature_disabled: COPY.disabled,
    member_account_required: COPY.memberOnly,
    approved_coach_required: COPY.coachOnly,
    coach_managed_program: COPY.coachManaged,
    weekly_program_exists: COPY.weekExists,
    daily_limit_reached: COPY.limit,
    plan_unavailable: COPY.planUnavailable,
    invalid_request: COPY.invalid,
  };

  function localize(node, en, ar = en) {
    if (!node) return;
    node.dataset.en = en;
    node.dataset.ar = ar;
    node.textContent = t(en, ar);
    dynamicText.add(node);
  }

  function setStatus(pair, retry = false) {
    const [en, ar] = Array.isArray(pair) ? pair : [String(pair || ''), String(pair || '')];
    localize($('aiStatus'), en, ar);
    if ($('retryInit')) $('retryInit').hidden = !retry;
  }

  function clearStatus() { setStatus(['', ''], false); }

  function clearGates() {
    ['authGate', 'coachRedirect', 'roleGate', 'planner', 'reviewPanel', 'chatSection', 'progressSection']
      .forEach(id => { if ($(id)) $(id).hidden = true; });
  }

  function showAuthGate() {
    clearGates();
    clearStatus();
    $('authGate').hidden = false;
  }

  function showRoleGate(role) {
    clearGates();
    const admin = role === 'admin';
    localize($('roleGateTitle'),
      admin ? 'This account cannot use the athlete AI Coach' : 'This account is not eligible for the athlete AI Coach',
      admin ? 'لا يمكن لهذا الحساب استخدام مدرب MZA الذكي' : 'هذا الحساب غير مؤهل لاستخدام مدرب MZA الذكي');
    localize($('roleGateCopy'),
      'Sign in with an athlete account to build and approve a weekly plan.',
      'سجّل الدخول بحساب رياضي لإعداد خطة أسبوعية واعتمادها.');
    localize($('roleGateLink'), admin ? 'Open Admin Portal' : 'Open dashboard', admin ? 'افتح بوابة الإدارة' : 'افتح لوحة التحكم');
    $('roleGateLink').href = admin ? 'admin.html' : 'dashboard.html';
    $('roleGate').hidden = false;
  }

  function reportError(error, fallback = COPY.generic, retry = false) {
    if (error?.status === 401 || error?.code === 'unauthorized') { showAuthGate(); return; }
    const status = error?.status || 0;
    setStatus(ERROR_COPY[error?.code] || fallback, retry || status >= 500 || status === 0);
  }

  async function api(path, options = {}) {
    const token = window.MZActiveAuth?.token?.() || localStorage.getItem('mzactive-provider-session') || sessionStorage.getItem('mzactive-provider-session');
    const headers = { ...(options.headers || {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
    if (options.body) headers['content-type'] = 'application/json';
    const response = await fetch(`${window.MZACTIVE_API_BASE}/api/${path}`, {
      ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || data.message || `Request failed (${response.status})`);
      error.code = data.error || '';
      error.status = response.status;
      throw error;
    }
    return data;
  }

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
        [COPY.completed, progress.completed_sessions || 0],
        [COPY.planned, progress.planned_sessions || 0],
        [COPY.minutes, progress.total_minutes || 0],
        [COPY.distance, progress.total_kilometres || 0],
      ];
      const box = $('progressView');
      box.replaceChildren();
      for (const [label, value] of metrics) {
        const metric = document.createElement('div');
        metric.className = 'metric';
        const span = document.createElement('span');
        localize(span, label[0], label[1]);
        const strong = document.createElement('strong');
        strong.textContent = String(value);
        metric.append(span, strong);
        box.append(metric);
      }
      $('progressSection').hidden = false;
    } catch (error) {
      if (error?.status === 401) showAuthGate();
      else $('progressSection').hidden = true;
    }
  }

  async function init() {
    let config;
    try {
      config = await api('ai-coach/config');
    } catch (error) {
      reportError(error, COPY.unavailable);
      return;
    }
    if (!config.athlete_coach_enabled) { setStatus(COPY.disabled); return; }

    let session;
    try {
      session = await api('dashboard');
    } catch (error) {
      reportError(error, COPY.verifyFailed, true);
      return;
    }
    if (session.role === 'provider') { clearGates(); $('coachRedirect').hidden = false; return; }
    if (session.role !== 'member') { showRoleGate(session.role); return; }

    clearGates();
    $('planner').hidden = false;
    state.weekStart = monday();
    $('weekStart').value = state.weekStart;
    const options = $('dayOptions');
    options.replaceChildren();
    DAYS.forEach((day, index) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox'; input.name = 'days'; input.value = day;
      if (['monday', 'wednesday', 'friday'].includes(day)) input.checked = true;
      const text = document.createElement('span');
      localize(text, dayName(day, index), DAY_AR[index]);
      label.append(input, text);
      options.append(label);
    });
    const language = lang();
    if (language === 'ar') $('language').value = 'ar';
    $('duration').addEventListener('input', () => { $('durationOutput').textContent = $('duration').value; });
    $('planForm').addEventListener('submit', async event => {
      event.preventDefault();
      setStatus(COPY.preparing);
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
        setStatus(COPY.draftReady);
      } catch (error) { reportError(error, COPY.planUnavailable); }
      finally { $('generatePlan').disabled = false; }
    });
    $('approvePlan').addEventListener('click', async () => {
      if (!state.draft) return;
      setStatus(COPY.saving);
      try {
        await api(`ai-coach/drafts/${state.draft}/approve`, { method: 'POST', body: { approve: true } });
        state.draft = null;
        $('reviewPanel').hidden = true;
        setStatus(COPY.saved);
        await loadProgress();
      } catch (error) { reportError(error, COPY.generic); }
    });
    $('chatForm').addEventListener('submit', async event => {
      event.preventDefault();
      const message = $('chatMessage').value.trim();
      if (!message) return;
      setStatus(COPY.adjusting);
      try {
        const data = await api('ai-coach/chat', { method: 'POST', body: {
          message, draft_id: state.draft || undefined, week_start: $('weekStart').value || state.weekStart,
          language: $('language').value,
        } });
        state.draft = data.draft_id;
        state.weekStart = data.plan.week_start;
        renderPlan(data.plan);
        setStatus(data.requires_coach_approval ? COPY.adjustedCoach : COPY.adjusted);
      } catch (error) { reportError(error, COPY.planUnavailable); }
    });
    await loadProgress();
  }

  $('retryInit')?.addEventListener('click', () => { clearStatus(); init(); });

  document.addEventListener('mzactive:language-change', () => {
    const language = lang();
    if ($('language')) $('language').value = language === 'ar' ? 'ar' : 'en';
    for (const node of dynamicText) {
      if (node.isConnected !== false) node.textContent = t(node.dataset.en || '', node.dataset.ar || '');
    }
  });
  init();
})();

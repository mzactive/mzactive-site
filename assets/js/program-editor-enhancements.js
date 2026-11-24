(() => {
  'use strict';
  const API = window.MZACTIVE_API_BASE;
  const $ = id => document.getElementById(id);
  const form = $('whatsappTrainingForm'); if (!form) return;
  const key = 'mzactive-provider-session';
  const token = () => sessionStorage.getItem(key) || localStorage.getItem(key);
  const ar = () => document.documentElement.lang === 'ar';
  const t = (en, a) => ar() ? a : en;
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const sports = [['run','Run','جري'],['bike','Cycling','دراجات'],['swim','Swimming','سباحة'],['strength','Strength','قوة'],['recovery','Recovery','استشفاء'],['other','Other','أخرى']];
  const athleteTypes = [
    ['runner','Runner / الجري'],['triathlon','Triathlon / الترايثلون'],['running','Running / الجري'],
    ['cycling','Cycling / ركوب الدراجات'],['swimming','Swimming / السباحة'],['fitness','Fitness / اللياقة'],
    ['strength','Strength Training / تدريب القوة'],['bodybuilding','Bodybuilding / كمال الأجسام'],
    ['hyrox','HYROX / هايروكس'],['crossfit','CrossFit / كروس فت'],['general','General Fitness / لياقة عامة'],
    ['running_strength','Running + Strength / جري وقوة'],['swim_bike','Swim + Bike / سباحة ودراجات'],
  ];
  let weeks = new Map(), current = '', editingId = '', saveTimer;

  function api(path, options = {}) {
    const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
    if (token()) headers.authorization = 'Bearer ' + token();
    return fetch(API + path, { ...options, headers }).then(async r => {
      let data = {}; try { data = await r.json(); } catch {}
      if (!r.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: r.status });
      return data;
    });
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function monday(isoDate) { const d = new Date(isoDate + 'T00:00:00Z'); const diff = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - diff); return iso(d); }
  function addDays(isoDate, n) { const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function unit() { return $('programDurationUnit')?.value || 'weeks'; }
  function value() { return Math.max(1, Math.min(36, Number($('programDurationValue')?.value) || 1)); }
  function startDate() { return $('programStartDate')?.value || $('trainingWeekStart')?.value || ''; }
  function endDate() {
    const s = startDate(); if (!s) return '';
    if (unit() === 'days') return addDays(s, value() - 1);
    if (unit() === 'weeks') return addDays(s, value() * 7 - 1);
    const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + value()); d.setUTCDate(d.getUTCDate() - 1); return iso(d);
  }
  function weekKeys() {
    const s = startDate(), e = endDate(); if (!s || !e) return [];
    const keys = [];
    for (let date = s; date <= e; date = addDays(date, 1)) { const m = monday(date); if (!keys.includes(m)) keys.push(m); }
    return keys;
  }
  function sessionValues(day) {
    const field = form.querySelector('[data-day="' + day + '"]'); if (!field) return [];
    const card = field.closest('.session-day');
    return [{ field, sport: card.querySelector('[data-session-type]') }, ...[...card.querySelectorAll('[data-extra-session]')].map(row => ({ field: row.querySelector('textarea'), sport: row.querySelector('select') }))];
  }
  function captureWeek() {
    if (!current) return;
    const sessions = [];
    for (const [i, day] of days.entries()) {
      for (const item of sessionValues(day)) {
        if (!item.field.value.trim()) continue;
        sessions.push({ day_key: day, sport_type: item.sport.value, details: item.field.value.trim(), session_date: addDays(current, i) });
      }
    }
    weeks.set(current, sessions);
  }
  function clearFields() {
    for (const day of days) {
      const list = sessionValues(day); if (!list.length) continue;
      list[0].field.value = ''; list[0].field.closest('.session-day').querySelector('[data-extra-sessions]').replaceChildren();
    }
  }
  function showWeek(weekStart) {
    captureWeek(); clearFields(); current = weekStart;
    $('trainingWeekStart').value = weekStart;
    const rows = weeks.get(weekStart) || [];
    for (const item of rows) {
      const index = days.indexOf(item.day_key); if (index < 0) continue;
      const list = sessionValues(item.day_key);
      let target = list.find(x => !x.field.value.trim());
      if (!target) { form.querySelector('[data-day="' + item.day_key + '"]').closest('.session-day').querySelector('[data-session-add]').click(); target = sessionValues(item.day_key).at(-1); }
      target.field.value = item.details; target.sport.value = item.sport_type;
    }
    $('trainingWeekStart').value = weekStart;
    updateNav(); document.dispatchEvent(new Event('mzactive:program-edited'));
  }
  function payload() {
    captureWeek();
    const list = weekKeys().map(week_start => ({ week_start, sessions: weeks.get(week_start) || [] })).filter(w => w.sessions.length);
    if (!list.length) return null;
    return {
      athlete_name: $('trainingClientName').value.trim(), athlete_phone: $('trainingClientPhone').value.trim(),
      athlete_type: $('athleteType').value, team_id: $('programTeam').value || null, athlete_user_id: $('programAthlete').value || null,
      coach_note: $('weeklyCoachNote').value.trim(), duration_unit: unit(), duration_value: value(),
      start_date: startDate(), end_date: endDate(), week_start: startDate(), weeks: list,
    };
  }
  function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(async () => { try { await api('/api/dashboard/program-draft', { method: 'PUT', body: JSON.stringify({ payload: payload() || {} }) }); } catch {} }, 700); }
  function updateNav() {
    const keys = weekKeys(), index = keys.indexOf(current), label = $('programWeekLabel');
    if (label) label.textContent = keys.length ? `${t('Week','أسبوع')} ${index + 1} / ${keys.length} · ${current}` : t('Program dates','تواريخ البرنامج');
    const prev = $('programPrevWeek'), next = $('programNextWeek');
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= keys.length - 1;
  }
  function mount() {
    if ($('programDurationUnit')) return;
    const startField = $('trainingWeekStart').closest('.field');
    if (!$('programStartDate')) { const hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.id = 'programStartDate'; hidden.value = $('trainingWeekStart').value; startField.before(hidden); }
    const row = document.createElement('div'); row.className = 'form-row';
    row.innerHTML = `<div class="field"><label for="programDurationUnit">${t('Duration unit','وحدة المدة')}</label><select id="programDurationUnit"><option value="days">${t('Days','أيام')}</option><option value="weeks" selected>${t('Weeks','أسابيع')}</option><option value="months">${t('Months','أشهر')}</option></select></div><div class="field"><label for="programDurationValue">${t('Number','العدد')}</label><input id="programDurationValue" type="number" min="1" max="36" value="1"></div>`;
    startField.before(row);
    const label = startField.querySelector('label'); if (label) label.textContent = t('Program start date','تاريخ بداية البرنامج');
    const type = $('athleteType'); const previous = type.value;
    type.replaceChildren(); for (const [v, text] of athleteTypes) { const o = document.createElement('option'); o.value = v; o.textContent = text; type.append(o); }
    if ([...type.options].some(o => o.value === previous)) type.value = previous;
    const toolbar = form.parentElement.querySelector('.studio-toolbar') || document.querySelector('.studio-toolbar');
    if (toolbar) {
      const nav = document.createElement('div'); nav.className = 'program-week-nav';
      nav.innerHTML = `<button id="programPrevWeek" class="secondary" type="button">${t('Previous week','الأسبوع السابق')}</button><strong id="programWeekLabel"></strong><button id="programNextWeek" class="secondary" type="button">${t('Next week','الأسبوع التالي')}</button>`;
      toolbar.append(nav);
      $('programPrevWeek').onclick = () => { const keys = weekKeys(), i = keys.indexOf(current); if (i > 0) showWeek(keys[i - 1]); };
      $('programNextWeek').onclick = () => { const keys = weekKeys(), i = keys.indexOf(current); if (i >= 0 && i < keys.length - 1) showWeek(keys[i + 1]); };
    }
    const savebar = $('whatsappFallback').parentElement;
    const email = document.createElement('button'); email.type = 'button'; email.className = 'btn'; email.textContent = t('Save & send via Email','حفظ وإرسال بالبريد'); email.id = 'programEmailSend';
    const whats = document.createElement('button'); whats.type = 'button'; whats.className = 'btn secondary'; whats.textContent = t('Save & prepare WhatsApp','حفظ وتحضير واتساب'); whats.id = 'programWhatsAppSend';
    savebar.append(email, whats);
    email.onclick = () => deliver('email');
    whats.onclick = () => deliver('whatsapp');
  }
  async function deliver(channel) {
    const data = payload(); if (!data) { $('notice').textContent = t('Add at least one workout first.','أضف حصة واحدة على الأقل.'); return; }
    $('notice').textContent = t('Saving…','جارٍ الحفظ…');
    try {
      let id = editingId;
      if (id) { await api('/api/dashboard/programs/' + id, { method: 'PATCH', body: JSON.stringify(data) }); }
      else { const saved = await api('/api/dashboard/programs', { method: 'POST', body: JSON.stringify(data) }); id = saved.id; editingId = id; }
      const athleteId = $('programAthlete').value || window.MZActiveProgramEditor?.selectedAthlete || '';
      let result = null;
      if (athleteId) result = await api('/api/dashboard/programs/' + id + '/send', { method: 'POST', body: JSON.stringify({ athlete_user_id: athleteId, channel }) });
      $('notice').textContent = channel === 'email'
        ? (result?.sent ? t('Saved and emailed to the athlete.','تم الحفظ وإرسال البريد للرياضي.') : t('Saved. Choose an athlete to send by email.','تم الحفظ. اختر رياضياً لإرسال البريد.'))
        : t('Saved. Review the WhatsApp message and send it yourself.','تم الحفظ. راجع رسالة واتساب وأرسلها بنفسك.');
      if (channel === 'whatsapp' && result?.href) {
        const url = 'https://mzactive.com' + result.href;
        $('whatsappFallback').href = url; $('whatsappFallback').textContent = t('Open secure program link','افتح رابط البرنامج الآمن'); $('whatsappFallback').classList.remove('hidden');
      }
      document.dispatchEvent(new Event('mzactive:program-saved'));
    } catch (error) { $('notice').textContent = error.message || t('Could not save the program.','تعذر حفظ البرنامج.'); }
  }
  function loadProgram(program) {
    editingId = program.id || ''; weeks = new Map();
    $('trainingClientName').value = program.athlete_name || ''; $('weeklyCoachNote').value = program.coach_note || '';
    $('athleteType').value = program.athlete_type || 'runner'; $('trainingClientPhone').value = program.athlete_phone || '';
    $('programDurationUnit').value = program.duration_unit || 'weeks'; $('programDurationValue').value = program.duration_value || 1;
    $('trainingWeekStart').value = program.start_date || program.week_start || '';
    for (const session of program.sessions || []) {
      const week = monday(session.session_date || program.week_start || startDate());
      if (!weeks.has(week)) weeks.set(week, []);
      weeks.get(week).push({ day_key: session.day_key, sport_type: session.sport_type, details: session.details, session_date: session.session_date || addDays(week, days.indexOf(session.day_key)) });
    }
    const keys = weekKeys(); showWeek(keys[0] || monday(startDate())); $('notice').textContent = t('Program loaded for editing.','تم تحميل البرنامج للتعديل.');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  window.MZActiveProgramEditor = { payload, loadProgram, showWeek, setAthlete: id => { const select = $('programAthlete'); if ([...select.options].some(o => o.value === id)) select.value = id; }, get selectedAthlete() { return $('programAthlete')?.value || ''; } };

  form.addEventListener('input', () => { updateNav(); persist(); });
  form.addEventListener('change', event => { if (event.target?.id === 'trainingWeekStart' && $('programStartDate')) $('programStartDate').value = event.target.value; current = monday(startDate()); updateNav(); persist(); });
  document.addEventListener('mzactive:dashboard-loaded', async () => {
    mount();
    $('trainingWeekStart').value = $('trainingWeekStart').value || monday(new Date().toISOString().slice(0, 10));
    if ($('programStartDate') && !$('programStartDate').value) $('programStartDate').value = $('trainingWeekStart').value;
    current = monday(startDate()); updateNav();
    try { const data = await api('/api/dashboard/program-draft'); if (data.draft?.weeks?.length && !editingId) { weeks = new Map(data.draft.weeks.map(w => [w.week_start, w.sessions])); $('programDurationUnit').value = data.draft.duration_unit || 'weeks'; $('programDurationValue').value = data.draft.duration_value || 1; $('trainingWeekStart').value = data.draft.start_date || startDate(); showWeek(weekKeys()[0]); } } catch {}
  });
})();

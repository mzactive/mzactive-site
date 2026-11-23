(() => {
  'use strict';
  const API = window.MZACTIVE_API_BASE;
  const $ = id => document.getElementById(id);
  const key = 'mzactive-provider-session';
  const token = () => sessionStorage.getItem(key) || localStorage.getItem(key);
  const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const words = {
    title: ['My Athletes', 'رياضيون'], subtitle: ['Manage requests, active athletes and past relationships.', 'أدر الطلبات والرياضيين النشطين والعلاقات السابقة.'],
    pending: ['Pending Requests', 'طلبات معلقة'], active: ['Active Athletes', 'رياضيون نشطون'], completed: ['Completed', 'مكتملة'],
    search: ['Search athletes', 'ابحث عن رياضيين'], accept: ['Accept', 'قبول'], decline: ['Decline', 'رفض'],
    create: ['Create Program', 'إنشاء برنامج'], calendar: ['View Calendar', 'عرض التقويم'], manage: ['Manage Relationship', 'إدارة العلاقة'],
    close: ['Mark Completed', 'تحديد كمكتمل'], none: ['No athletes in this group yet.', 'لا يوجد رياضيون في هذه المجموعة بعد.'],
    send: ['Send to My Athlete', 'إرسال إلى رياضي'], saveFirst: ['Save the program before sending it.', 'احفظ البرنامج قبل إرساله.'],
    chooseAthlete: ['Choose an athlete', 'اختر رياضياً'], sendNow: ['Send program', 'إرسال البرنامج'], sent: ['Program sent to the athlete.', 'تم إرسال البرنامج إلى الرياضي.'],
    failed: ['That action could not be completed. Try again.', 'تعذر إتمام الإجراء. حاول مجدداً.'],
    date: ['Updated', 'آخر تحديث'],
  };
  const t = k => words[k]?.[lang() === 'ar' ? 1 : 0] || k;
  let state = { athletes: [], bucket: 'pending', q: '', programId: '' };

  async function api(path, options = {}) {
    const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
    if (token()) headers.authorization = 'Bearer ' + token();
    const response = await fetch(API + path, { ...options, headers });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: response.status });
    return data;
  }
  function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
  function statusName(a) { return a.bucket === 'pending' ? t('pending') : a.bucket === 'active' ? t('active') : t('completed'); }
  function fmt(value) { try { return new Intl.DateTimeFormat(lang() === 'ar' ? 'ar-QA' : 'en-QA', { dateStyle: 'medium' }).format(new Date(value)); } catch { return value || ''; } }

  function mount() {
    if ($('coachMyAthletes') || !$('coachPanel')) return null;
    const section = el('section', 'panel my-athletes'); section.id = 'coachMyAthletes';
    section.innerHTML = `<div class="panel-head"><div><h3 data-en="My Athletes" data-ar="رياضيون">My Athletes</h3><p class="muted" data-en="Manage requests, active athletes and past relationships." data-ar="أدر الطلبات والرياضيين النشطين والعلاقات السابقة.">Manage requests, active athletes and past relationships.</p></div><div class="actions"><span id="athleteBadge" class="badge"></span><button id="sendSavedProgram" class="btn" type="button">Send to My Athlete</button></div></div>
      <div class="athlete-toolbar"><input id="athleteSearch" class="athlete-search" type="search" aria-label="Search athletes"><div id="athleteTabs" class="athlete-filters" role="group"></div></div>
      <div id="athleteList" class="cards"></div>`;
    $('coachPanel').prepend(section);
    $('sendSavedProgram').onclick = () => sendDialog();
    return section;
  }

  function render() {
    const host = $('athleteList'); if (!host) return;
    $('athleteSearch').placeholder = t('search');
    const tabs = $('athleteTabs'); tabs.replaceChildren();
    for (const bucket of ['pending', 'active', 'completed']) {
      const b = el('button', 'athlete-filter' + (state.bucket === bucket ? ' active' : ''), t(bucket));
      b.type = 'button'; b.onclick = () => { state.bucket = bucket; render(); }; tabs.append(b);
    }
    $('athleteBadge').textContent = String(state.athletes.filter(a => a.bucket === state.bucket).length);
    const q = state.q.toLowerCase();
    const rows = state.athletes.filter(a => a.bucket === state.bucket && (!q || String(a.display_name || '').toLowerCase().includes(q)));
    host.replaceChildren();
    if (!rows.length) { host.append(el('p', 'muted', t('none'))); return; }
    for (const a of rows) {
      const card = el('article', 'crm-row athlete-row'); card.dataset.connectionId = a.id;
      if (new URLSearchParams(location.search).get('connection') === a.id) card.classList.add('record-focus');
      card.append(el('strong', '', a.display_name || 'MZ Active athlete'));
      const meta = [statusName(a), (a.sports || []).join(', '), a.city, a.last_activity_at ? t('date') + ': ' + fmt(a.last_activity_at) : ''].filter(Boolean).join(' · ');
      card.append(el('span', 'athlete-meta', meta));
      const actions = el('div', 'actions');
      if (a.bucket === 'pending') {
        actions.append(el('button', '', t('accept'))); actions.lastChild.type = 'button';
        actions.lastChild.onclick = () => decide(a.id, 'accepted');
        actions.append(el('button', 'secondary', t('decline'))); actions.lastChild.type = 'button';
        actions.lastChild.onclick = () => decide(a.id, 'declined');
      } else if (a.bucket === 'active') {
        const create = el('a', 'btn', t('create')); create.href = '#whatsappTrainingForm'; create.onclick = () => prefill(a); actions.append(create);
        const calendar = el('a', 'btn secondary', t('calendar')); calendar.href = '#flexProgramHistory'; actions.append(calendar);
        const close = el('button', 'secondary', t('close')); close.type = 'button'; close.onclick = () => closeRelationship(a.id); actions.append(close);
      } else {
        const calendar = el('a', 'btn secondary', t('calendar')); calendar.href = '#flexProgramHistory'; actions.append(calendar);
      }
      card.append(actions); host.append(card);
    }
  }

  function prefill(a) {
    const name = $('trainingClientName'); if (name) name.value = a.display_name || '';
    const athlete = $('programAthlete'); if (athlete && [...athlete.options].some(o => o.value === a.id)) athlete.value = a.id;
    $('whatsappTrainingForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function decide(id, status) {
    try { await api('/api/connections/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); }
    catch (error) { ($('notice') || $('coachMyAthletes')).textContent = error.message || t('failed'); }
  }
  async function closeRelationship(id) {
    try { await api('/api/connections/' + encodeURIComponent(id) + '/close', { method: 'POST', body: '{}' }); await load(); }
    catch (error) { ($('notice') || $('coachMyAthletes')).textContent = error.message || t('failed'); }
  }
  async function load() {
    if (!token()) return;
    try {
      const data = await api('/api/dashboard/athletes');
      state.athletes = data.athletes || []; render(); decoratePrograms();
      const connectionId = new URLSearchParams(location.search).get('connection');
      if (connectionId) {
        const target = $('athleteList').querySelector(`[data-connection-id="${CSS.escape(connectionId)}"]`);
        if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.classList.add('record-focus'); }
      }
    } catch {}
  }

  function sendDialog(programId) {
    const programs = window.mzStudioDashboard?.programs || [];
    if (!programId && !programs.length) { ($('notice') || document.body).textContent = t('saveFirst'); return; }
    let dialog = $('sendProgramDialog');
    if (!dialog) {
      dialog = el('dialog', 'crm-dialog'); dialog.id = 'sendProgramDialog';
      dialog.innerHTML = `<h3>${t('send')}</h3><select id="sendProgramSelect" aria-label="Program"></select><input id="sendProgramSearch" class="athlete-search" type="search" placeholder="${t('search')}"><div id="sendProgramList" class="cards"></div><button id="sendProgramConfirm" class="btn" type="button" disabled>${t('sendNow')}</button>`;
      document.body.append(dialog);
    }
    state.programId = programId || programs[0]?.id;
    const select = $('sendProgramSelect'); select.replaceChildren();
    for (const p of programs) { const option = document.createElement('option'); option.value = p.id; option.textContent = `${p.athlete_name || 'Program'} · ${p.week_start}`; select.append(option); }
    if (state.programId) select.value = state.programId;
    select.onchange = () => { state.programId = select.value; };
    let selected = '';
    const list = $('sendProgramList'), search = $('sendProgramSearch'), confirm = $('sendProgramConfirm');
    search.oninput = () => paint();
    function paint() {
      const q = search.value.toLowerCase(); list.replaceChildren();
      for (const a of state.athletes.filter(a => a.bucket === 'active' && (!q || String(a.display_name || '').toLowerCase().includes(q)))) {
        const card = el('article', 'crm-row'); card.append(el('strong', '', a.display_name || 'MZ Active athlete'));
        const pick = el('button', 'secondary', selected === a.id ? '✓' : t('chooseAthlete')); pick.type = 'button';
        pick.onclick = () => { selected = a.id; confirm.disabled = false; paint(); };
        card.append(pick); list.append(card);
      }
      if (!list.children.length) list.append(el('p', 'muted', t('none')));
    }
    confirm.onclick = async () => {
      if (!selected) return; confirm.disabled = true;
      try {
        await api('/api/dashboard/programs/' + encodeURIComponent(state.programId) + '/send', { method: 'POST', body: JSON.stringify({ athlete_user_id: selected }) });
        ($('notice') || document.body).textContent = t('sent'); dialog.close(); await load();
      } catch (error) { ($('notice') || document.body).textContent = error.message || t('failed'); confirm.disabled = false; }
    };
    paint(); if (!dialog.open) dialog.showModal();
  }
  function decoratePrograms() {
    document.querySelectorAll('#flexProgramHistory [data-program-id]').forEach(card => {
      if (card.querySelector('[data-send-program]')) return;
      const b = el('button', 'btn secondary', t('send')); b.type = 'button'; b.dataset.sendProgram = '1';
      b.onclick = () => sendDialog(card.dataset.programId); card.append(b);
    });
  }

  function quickActions() {
    if ($('coachQuickActions') || !$('coachPanel')) return;
    const nav = el('nav', 'coach-quick-actions'); nav.id = 'coachQuickActions';
    const items = [
      ['#coachProfilePanel', 'My Profile', 'ملفي'],
      ['#coachMyAthletes', 'My Athletes', 'رياضيون'],
      ['#whatsappTrainingForm', 'Training Programs', 'البرامج التدريبية'],
      ['#communityWorkspace', 'Messages & Requests', 'الرسائل والطلبات'],
      ['#coachCommunityPanel', 'My Posts', 'منشوراتي'],
      ['#coachSettings', 'Settings', 'الإعدادات'],
    ];
    for (const [href, en, ar] of items) {
      const a = el('a', 'quick-action', lang() === 'ar' ? ar : en); a.href = href; nav.append(a);
    }
    $('coachPanel').prepend(nav);
  }
  async function settingsDialog() {
    let dialog = $('coachSettings');
    if (!dialog) {
      dialog = el('dialog', 'crm-dialog'); dialog.id = 'coachSettings';
      dialog.innerHTML = `<h3>${lang() === 'ar' ? 'الإعدادات' : 'Settings'}</h3>
        <label><input id="prefEmail" type="checkbox" checked> ${lang() === 'ar' ? 'إشعارات البريد' : 'Email notifications'}</label>
        <label><input id="prefDashboard" type="checkbox" checked> ${lang() === 'ar' ? 'إشعارات لوحة التحكم' : 'Dashboard notifications'}</label>
        <div class="actions"><button id="prefSave" class="btn" type="button">${lang() === 'ar' ? 'حفظ' : 'Save'}</button></div>`;
      document.body.append(dialog);
    }
    try {
      const prefs = await api('/api/dashboard/notification-preferences');
      $('prefEmail').checked = Boolean(prefs.email_enabled);
      $('prefDashboard').checked = Boolean(prefs.dashboard_enabled);
    } catch {}
    $('prefSave').onclick = async () => {
      try {
        await api('/api/dashboard/notification-preferences', { method: 'PATCH', body: JSON.stringify({ email_enabled: $('prefEmail').checked, dashboard_enabled: $('prefDashboard').checked }) });
        ($('notice') || document.body).textContent = lang() === 'ar' ? 'تم حفظ الإعدادات.' : 'Settings saved.'; dialog.close();
      } catch (error) { ($('notice') || document.body).textContent = error.message || t('failed'); }
    };
    if (!dialog.open) dialog.showModal();
  }
  function memberCoaches(data) {
    if (!$('memberPanel') || $('memberCoachList')) return;
    const section = el('section', 'panel'); section.id = 'memberCoachList';
    section.append(el('h3', '', lang() === 'ar' ? 'مدربي' : 'My coaches'));
    const list = el('div', 'cards');
    for (const c of data.connectedCoaches || []) {
      const row = el('article', 'crm-row');
      row.append(el('strong', '', c.display_name || 'MZ Active coach'));
      row.append(el('span', 'athlete-meta', [c.status, c.workspace_status, c.city].filter(Boolean).join(' · ')));
      list.append(row);
    }
    if (!list.children.length) list.append(el('p', 'muted', lang() === 'ar' ? 'لا يوجد مدرب مرتبط بعد.' : 'No connected coach yet.'));
    section.append(list); $('memberPanel').prepend(section);
  }

  document.addEventListener('mzactive:dashboard-loaded', () => {
    const data = window.mzStudioDashboard;
    if (!data) return;
    if (data.role === 'provider') { quickActions(); $('coachQuickActions')?.querySelector('[href="#coachSettings"]')?.addEventListener('click', event => { event.preventDefault(); settingsDialog(); }); mount(); load(); }
    if (data.role === 'member') memberCoaches(data);
  });
  document.addEventListener('mzactive:language-change', () => { if ($('coachMyAthletes')) render(); });
})();

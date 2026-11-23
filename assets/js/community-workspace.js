(() => {
  const $ = id => document.getElementById(id);
  const base = window.MZACTIVE_API_BASE;
  const key = 'mzactive-provider-session';
  const language = window.MZActiveLanguage;
  const t = (en, ar) => language.get() === 'ar' ? ar : en;
  const statusLabels = {
    pending: ['Pending', 'قيد الانتظار'], accepted: ['Accepted', 'مقبول'], declined: ['Declined', 'مرفوض'],
    received: ['Received', 'تم الاستلام'], reviewing: ['Under review', 'قيد المراجعة'],
    cancelled: ['Cancelled', 'ملغى'], published: ['Published', 'منشور'], hidden: ['Hidden', 'مخفي'],
  };
  const workspaceStatusLabels = {
    none: ['Not started', 'لم يبدأ'], pending: ['Waiting for acceptance', 'بانتظار القبول'],
    active: ['Active', 'نشط'], closed: ['Closed', 'مغلق'],
  };
  const MAX_ATTACHMENT_BYTES = 1024 * 1024;
  const attachmentTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']);
  const attachmentAccept = 'image/jpeg,image/png,image/webp,application/pdf,text/plain';
  const progressMetrics = {
    distance_km: ['Distance (km)', 'المسافة (كم)'],
    duration_minutes: ['Duration (minutes)', 'المدة (دقائق)'],
    sessions_completed: ['Sessions completed', 'الحصص المكتملة'],
    average_pace: ['Average pace', 'متوسط الوتيرة'],
    planned_sessions: ['Planned sessions', 'الحصص المخططة'],
    completed_sessions: ['Completed sessions', 'الحصص المنجزة'],
    note: ['Note', 'ملاحظة'],
  };
  let token = '', role = '', approved = false, connections = [], loading = false;

  function node(tag, text, className) {
    const item = document.createElement(tag);
    // A few workspace panels pass (tag, className, text) by mistake. Normalize
    // class-only/class-first calls here so the rendered DOM stays correct.
    const classLike = typeof text === "string" && (/^ws-/.test(text) || ["actions", "field", "muted"].includes(text));
    if (classLike) {
      if (className === undefined) {
        item.className = text;
        return item;
      }
      [text, className] = [className, text];
    }
    if (text !== undefined && text !== null) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function label(code) { return statusLabels[code] ? t(...statusLabels[code]) : String(code || ''); }
  function button(text, fn, className = 'secondary') {
    const item = node('button', text, className);
    item.type = 'button';
    item.addEventListener('click', fn);
    return item;
  }
  function date(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat(language.get() === 'ar' ? 'ar-QA' : 'en-QA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return String(value); }
  }
  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.body !== undefined && !(options.body instanceof Blob) && !(options.body instanceof File)) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}/api${path}`, {
      ...options, headers,
      body: options.body === undefined || options.body instanceof Blob || options.body instanceof File ? options.body : JSON.stringify(options.body),
      cache: 'no-store',
    });
    let data = {};
    try { data = await response.json(); } catch { /* some endpoints return binary data */ }
    if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: response.status });
    return data;
  }
  function section(id, title) {
    const item = node('section', null, 'panel');
    item.id = id;
    item.append(node('h2', title));
    const body = node('div');
    body.id = id + 'Body';
    item.append(body);
    item.body = body;
    return item;
  }
  function item(title, details) {
    const card = node('article', null, 'item');
    card.append(node('strong', title));
    if (details) card.append(node('p', details, 'muted'));
    return card;
  }
  function empty(root, message) { root.append(node('p', message, 'muted')); }
  function workspaceLabel(code) { return workspaceStatusLabels[code] ? t(...workspaceStatusLabels[code]) : String(code || ''); }
  function metricLabel(code) { return progressMetrics[code] ? t(...progressMetrics[code]) : String(code || ''); }
  function activeConnections() { return connections.filter(connection => connection.status === 'accepted' && connection.workspace_status === 'active'); }
  function canUseWorkspace() { return (role === 'provider' && approved) || role === 'member'; }
  function workspaceMessage(text, kind = '') {
    const status = $('wsWorkspaceStatus');
    if (!status) return;
    status.textContent = text;
    status.className = 'ws-status' + (kind ? ` ws-${kind}` : '');
  }
  function jumpTo(id) { $(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function authorLabel(userId, workspace) {
    if (!userId) return '';
    if (userId === workspace?.coach?.user_id) return t('Coach', 'المدرب');
    if (userId === workspace?.athlete?.user_id) return t('Athlete', 'الرياضي');
    return '';
  }
  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
  }

  async function loadAchievements() {
    const root = $('wsAchievementsBody');
    if (!root) return;
    const list = root.querySelector('[data-list]');
    try {
      const data = await api('/me/achievements');
      list.replaceChildren();
      for (const achievement of data.achievements || []) {
        const card = item([achievement.title, achievement.awarded_year].filter(Boolean).join(' · '), achievement.details || label(achievement.status));
        card.append(button(t('Delete', 'حذف'), async () => {
          try { await api(`/me/achievements/${encodeURIComponent(achievement.id)}`, { method: 'DELETE' }); await loadAchievements(); }
          catch (error) { alert(error.message); }
        }));
        list.append(card);
      }
      if (!(data.achievements || []).length) empty(list, t('No achievements added yet.', 'لم تتم إضافة إنجازات بعد.'));
    } catch (error) { list.replaceChildren(node('p', error.message, 'muted')); }
  }
  function achievementsPanel() {
    const root = section('wsAchievements', t('Your achievements', 'إنجازاتك'));
    const body = root.body;
    const form = node('form', null, 'form-grid');
    const fields = [['title', t('Title', 'العنوان'), 'text'], ['details', t('Details', 'التفاصيل'), 'text'], ['awarded_year', t('Year', 'السنة'), 'number']];
    for (const [name, text, type] of fields) {
      const wrap = node('div', null, 'field'), input = node('input');
      input.name = name; input.type = type; input.maxLength = name === 'details' ? 600 : 120;
      if (type === 'number') { input.min = '1900'; input.max = '2100'; }
      input.setAttribute('aria-label', text);
      wrap.append(node('label', text), input);
      form.append(wrap);
    }
    form.append(node('button', t('Add achievement', 'أضف إنجازاً')));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form), submit = form.querySelector('button[type="submit"]') || form.querySelector('button');
      submit.disabled = true;
      try {
        await api('/me/achievements', { method: 'POST', body: { title: data.get('title'), details: data.get('details'), awarded_year: data.get('awarded_year') } });
        form.reset();
        await loadAchievements();
      } catch (error) { alert(error.message); }
      finally { submit.disabled = false; }
    });
    const list = node('div', null, 'cards');
    list.dataset.list = '';
    body.append(node('p', t('Approved coaches publish immediately. Other entries are reviewed by MZ Active.', 'ينشر المدربون المعتمدون فوراً. تُراجع الإدخالات الأخرى من قِبل MZ Active.'), 'muted'), form, list);
    return root;
  }

  function decisionButtons(connection) {
    const actions = node('div', 'actions');
    for (const decision of ['accepted', 'declined']) actions.append(button(label(decision), async () => {
      try {
        const result = await api(`/connections/${encodeURIComponent(connection.id)}`, { method: 'PATCH', body: { status: decision } });
        await loadConnections();
        if (result?.workspace_active) openWorkspace(connection.id);
      } catch (error) { alert(error.message); }
    }));
    return actions;
  }
  function renderConnections() {
    const root = $('wsConnectionsBody');
    if (!root) return;
    const list = root.querySelector('[data-list]');
    list.replaceChildren();
    for (const connection of connections) {
      const other = role === 'provider' ? connection.athlete_name : connection.coach_name;
      const meta = [label(connection.status), workspaceLabel(connection.workspace_status), date(connection.updated_at)].filter(Boolean).join(' · ');
      const card = item(other || t('MZ Active member', 'عضو MZ Active'), meta);
      if (connection.unread) card.append(node('span', t(`Unread messages: ${connection.unread}`, `رسائل غير مقروءة: ${connection.unread}`), 'ws-unread'));
      if (connection.status === 'pending' && role === 'member' && connection.source === 'booking') {
        card.append(node('p', t('A confirmed booking created this private workspace. Both the coach’s booking confirmation and your acceptance are required before it becomes active.', 'أنشأ حجز مؤكد مساحة العمل الخاصة هذه. يلزم تأكيد المدرب للحجز وقبولك قبل تفعيلها.'), 'ws-notice'));
        card.append(decisionButtons(connection));
      } else if (connection.status === 'pending' && role === 'provider' && connection.source !== 'booking') {
        card.append(node('p', 'muted', t('Review this connection request.', 'راجع طلب التواصل هذا.')));
        card.append(decisionButtons(connection));
      } else if (connection.status === 'pending' && role === 'provider' && connection.source === 'booking') {
        card.append(node('p', 'muted', t('Booking confirmed. Waiting for the athlete to accept this private workspace.', 'تم تأكيد الحجز. بانتظار قبول الرياضي لمساحة العمل الخاصة.')));
      }
      if (connection.status === 'accepted' && connection.workspace_status === 'active') {
        card.append(button(t('Open private workspace', 'افتح مساحة العمل الخاصة'), () => openWorkspace(connection.id)));
      }
      if (connection.status === 'accepted') card.append(button(t('Open messages', 'فتح الرسائل'), () => {
        const select = $('wsMessageConnection');
        if (select) { select.value = connection.id; select.dispatchEvent(new Event('change')); }
        jumpTo('wsMessages');
      }));
      list.append(card);
    }
    if (!connections.length) empty(list, t('No coach connections yet.', 'لا توجد روابط مع مدربين بعد.'));
    renderMessageTargets();
    renderWorkspaceTargets();
    renderWorkspaceAccess();
  }
  function renderWorkspaceAccess() {
    const jump = $('workspaceJump');
    if (jump) jump.classList.toggle('hidden', !(canUseWorkspace() && activeConnections().length));
  }
  function openWorkspace(id) {
    const select = $('wsWorkspaceConnection');
    if (!select) return;
    if (id && [...select.options].some(option => option.value === id)) select.value = id;
    if (select.value) select.dispatchEvent(new Event('change'));
    jumpTo('wsShared');
  }
  async function loadConnections() {
    const root = $('wsConnectionsBody');
    if (!root) return;
    try { connections = (await api('/connections')).connections || []; renderConnections(); }
    catch (error) { root.querySelector('[data-list]').replaceChildren(node('p', error.message, 'muted')); }
  }
  function connectionsPanel() {
    const root = section('wsConnections', t('Private coach connections', 'روابط خاصة مع المدربين'));
    const body = root.body;
    if (role === 'member') {
      const form = node('form', null, 'form-row'), select = node('select');
      select.id = 'wsCoachSelect';
      select.setAttribute('aria-label', t('Approved coach', 'مدرب معتمد'));
      form.append(select, node('button', t('Request connection', 'طلب تواصل')));
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!select.value) return;
        try { await api('/connections', { method: 'POST', body: { coach_id: select.value } }); await loadConnections(); }
        catch (error) { alert(error.message); }
      });
      body.append(form);
      api('/providers?type=coach').then(data => {
        select.replaceChildren(new Option(t('Choose an approved coach', 'اختر مدرباً معتمداً'), ''));
        for (const coach of data.providers || []) select.append(new Option(coach.display_name, coach.id));
      }).catch(() => {});
    }
    const list = node('div', null, 'cards');
    list.dataset.list = '';
    body.append(list);
    return root;
  }

  function renderMessageTargets() {
    const select = $('wsMessageConnection');
    if (!select) return;
    const prior = select.value;
    const accepted = connections.filter(connection => connection.status === 'accepted');
    select.replaceChildren(new Option(t('Choose a connection', 'اختر رابطاً'), ''));
    for (const connection of accepted) {
      const other = role === 'provider' ? connection.athlete_name : connection.coach_name;
      select.append(new Option(other || t('MZ Active member', 'عضو MZ Active'), connection.id));
    }
    if (accepted.some(connection => connection.id === prior)) select.value = prior;
    if (select.value) loadMessages();
  }
  async function loadMessages() {
    const select = $('wsMessageConnection'), list = $('wsMessagesList');
    if (!select || !list) return;
    if (!select.value) { list.replaceChildren(node('p', t('Choose an accepted connection first.', 'اختر رابطاً مقبولاً أولاً.'), 'muted')); return; }
    try {
      const data = await api(`/connections/${encodeURIComponent(select.value)}/messages`);
      list.replaceChildren();
      for (const message of data.messages || []) {
        const mine = message.sender_user_id === (window.mzStudioDashboard?.user?.id || '');
        list.append(item(`${mine ? t('You', 'أنت') : t('Coach', 'المدرب')} · ${date(message.created_at)}`, message.body));
      }
      if (!(data.messages || []).length) empty(list, t('No messages yet.', 'لا توجد رسائل بعد.'));
    } catch (error) { list.replaceChildren(node('p', error.message, 'muted')); }
  }
  function messagesPanel() {
    const root = section('wsMessages', t('Private messages', 'الرسائل الخاصة'));
    const body = root.body;
    const form = node('form', null, 'form-grid');
    const select = node('select');
    select.id = 'wsMessageConnection';
    select.setAttribute('aria-label', t('Connection', 'الرابط'));
    const text = node('textarea');
    text.rows = 3; text.maxLength = 2000;
    text.placeholder = t('Write a private message', 'اكتب رسالة خاصة');
    text.setAttribute('aria-label', text.placeholder);
    select.addEventListener('change', loadMessages);
    form.append(select, text, node('button', t('Send message', 'أرسل الرسالة')));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!select.value || !text.value.trim()) return;
      try { await api(`/connections/${encodeURIComponent(select.value)}/messages`, { method: 'POST', body: { body: text.value } }); text.value = ''; await loadMessages(); }
      catch (error) { alert(error.message); }
    });
    const list = node('div', null, 'cards');
    list.id = 'wsMessagesList';
    body.append(form, list);
    return root;
  }

  function renderWorkspaceTargets() {
    const select = $('wsWorkspaceConnection');
    if (!select) return;
    const active = activeConnections(), prior = select.value;
    select.replaceChildren(new Option(t('Choose an active workspace', 'اختر مساحة عمل نشطة'), ''));
    for (const connection of active) {
      const other = role === 'provider' ? connection.athlete_name : connection.coach_name;
      select.append(new Option(other || t('MZ Active member', 'عضو MZ Active'), connection.id));
    }
    if (active.some(connection => connection.id === prior)) select.value = prior;
    else if (active.length) select.value = active[0].id;
    if (select.value) loadWorkspace();
    else {
      const content = $('wsWorkspaceContent');
      if (content) { content.hidden = true; content.replaceChildren(); }
      workspaceMessage(t('No active shared workspace yet.', 'لا توجد مساحة عمل مشتركة نشطة بعد.'));
    }
  }
  function workspacePanel() {
    const root = section('wsShared', t('Private shared workspace', 'مساحة العمل الخاصة المشتركة'));
    root.classList.add('ws-panel');
    const body = root.body;
    body.append(node('p', t('Private space for the approved coach and the athlete only. This is not a public feed.', 'مساحة خاصة بالمدرب المعتمد والرياضي فقط. ليست موجزاً عاماً.'), 'ws-notice'));
    const toolbar = node('div', 'ws-toolbar');
    const select = node('select');
    select.id = 'wsWorkspaceConnection';
    select.setAttribute('aria-label', t('Active workspace', 'مساحة عمل نشطة'));
    const status = node('span', 'ws-status');
    status.id = 'wsWorkspaceStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    toolbar.append(select, status);
    const content = node('div', 'ws-content');
    content.id = 'wsWorkspaceContent';
    content.hidden = true;
    select.addEventListener('change', loadWorkspace);
    body.append(toolbar, content);
    return root;
  }
  async function loadWorkspace() {
    const select = $('wsWorkspaceConnection'), content = $('wsWorkspaceContent');
    if (!select || !content) return;
    if (!select.value) { content.hidden = true; content.replaceChildren(); return; }
    workspaceMessage(t('Loading private workspace…', 'جارٍ تحميل مساحة العمل الخاصة…'));
    try {
      const data = await api(`/connections/${encodeURIComponent(select.value)}/workspace`);
      const workspace = data.workspace || {};
      content.hidden = false;
      content.replaceChildren(
        workspaceIntro(workspace),
        garminSection(workspace.garmin || {}),
        attachmentsSection(workspace.id || select.value, workspace.attachments || [], workspace),
        progressSection(workspace.id || select.value, workspace.progress || [], workspace),
        sharedDataSection(workspace)
      );
      workspaceMessage(`${t('Active workspace', 'مساحة عمل نشطة')} · ${workspace.coach?.name || ''} / ${workspace.athlete?.name || ''}`);
    } catch (error) {
      content.hidden = false;
      content.replaceChildren(node('p', error.message || t('Could not load the private workspace.', 'تعذر تحميل مساحة العمل الخاصة.'), 'ws-error'));
      workspaceMessage(t('Could not load the private workspace.', 'تعذر تحميل مساحة العمل الخاصة.'), 'error');
    }
  }
  function workspaceIntro(workspace) {
    const block = node('section', 'ws-section');
    block.append(node('h3', null, t('Workspace members', 'أعضاء مساحة العمل')));
    const row = node('article', 'ws-row');
    row.append(node('strong', `${t('Coach', 'المدرب')}: ${workspace.coach?.name || '—'}`));
    row.append(node('div', 'ws-muted', `${t('Athlete', 'الرياضي')}: ${workspace.athlete?.name || '—'}`));
    row.append(node('div', 'ws-muted', `${t('Viewing as', 'تظهر كـ')}: ${workspace.viewing_as === 'coach' ? t('Coach', 'المدرب') : t('Athlete', 'الرياضي')}`));
    block.append(row);
    return block;
  }
  function garminSection(garmin) {
    const block = node('section', 'ws-section');
    block.append(node('h3', null, t('Garmin public profile', 'ملف Garmin العام')));
    block.append(node('p', t('Public profile link only. Automatic Garmin activity sync is not enabled. Official Garmin Connect authorization is required to sync activities.', 'رابط ملف عام فقط. مزامنة أنشطة Garmin التلقائية غير مفعّلة. يلزم الحصول على تفويض رسمي من Garmin Connect لمزامنة الأنشطة.'), 'ws-notice'));
    const raw = typeof garmin.public_url === 'string' ? garmin.public_url.trim() : '';
    let href = '';
    if (raw) {
      try {
        const parsed = new URL(raw);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') href = parsed.href;
      } catch { /* ignore malformed links */ }
    }
    if (!href) {
      block.append(node('p', 'ws-muted', raw
        ? t('The provided Garmin link is not a valid web address.', 'رابط Garmin المقدم ليس عنوان ويب صالحاً.')
        : t('No public Garmin profile link has been provided.', 'لم يتم تقديم رابط ملف Garmin عام.')));
      return block;
    }
    const link = node('a', t('Open public Garmin profile', 'افتح ملف Garmin العام'), 'ws-link');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    block.append(link);
    return block;
  }
  function attachmentsSection(connectionId, attachments, workspace) {
    const block = node('section', 'ws-section');
    block.append(node('h3', null, t('Shared files', 'الملفات المشتركة')));
    block.append(node('p', 'ws-muted', t('JPG, PNG, WebP, PDF or TXT. Maximum 1 MB per file.', 'JPG أو PNG أو WebP أو PDF أو TXT. بحد أقصى 1 ميغابايت للملف.')));
    const form = node('form', 'ws-form');
    const field = node('div', 'field');
    const input = node('input');
    input.type = 'file'; input.id = 'wsAttachmentFile'; input.accept = attachmentAccept;
    input.setAttribute('aria-label', t('Choose a file', 'اختر ملفاً'));
    const label = node('label', null, t('Choose a file', 'اختر ملفاً'));
    label.htmlFor = input.id;
    field.append(label, input);
    const submit = node('button', t('Upload file', 'ارفع الملف'));
    submit.type = 'submit';
    form.append(field, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const file = input.files?.[0];
      if (!file) { workspaceMessage(t('Choose a file first.', 'اختر ملفاً أولاً.'), 'error'); return; }
      if (file.size > MAX_ATTACHMENT_BYTES) { workspaceMessage(t('Files must be 1 MB or smaller.', 'يجب ألا يتجاوز حجم الملف 1 ميغابايت.'), 'error'); return; }
      if (!attachmentTypes.has(file.type)) { workspaceMessage(t('Use JPG, PNG, WebP, PDF or TXT only.', 'استخدم JPG أو PNG أو WebP أو PDF أو TXT فقط.'), 'error'); return; }
      submit.disabled = true;
      try {
        await api(`/connections/${encodeURIComponent(connectionId)}/attachments`, { method: 'POST', body: file, headers: { 'content-type': file.type, 'x-file-name': file.name } });
        await loadWorkspace();
        workspaceMessage(t('File uploaded.', 'تم رفع الملف.'), 'success');
      } catch (error) {
        const message = error.status === 413 ? t('Files must be 1 MB or smaller.', 'يجب ألا يتجاوز حجم الملف 1 ميغابايت.')
          : error.status === 400 ? t('Unsupported file type. Use JPG, PNG, WebP, PDF or TXT.', 'نوع الملف غير مدعوم. استخدم JPG أو PNG أو WebP أو PDF أو TXT.')
            : error.message || t('Upload failed.', 'فشل الرفع.');
        workspaceMessage(message, 'error');
      } finally { submit.disabled = false; }
    });
    const list = node('div', 'ws-list');
    if (!attachments.length) list.append(node('p', 'ws-muted', t('No files shared yet.', 'لم تتم مشاركة ملفات بعد.')));
    for (const file of attachments) {
      const row = node('article', 'ws-row');
      const head = node('div', 'ws-row-head');
      head.append(node('strong', file.file_name || t('Attachment', 'مرفق')), node('span', 'ws-muted', [formatBytes(file.byte_size), date(file.created_at), authorLabel(file.uploader_user_id, workspace)].filter(Boolean).join(' · ')));
      row.append(head);
      const actions = node('div', 'ws-actions');
      actions.append(button(t('Download', 'تنزيل'), () => downloadAttachment(connectionId, file), 'secondary'));
      row.append(actions);
      list.append(row);
    }
    block.append(form, list);
    return block;
  }
  async function downloadAttachment(connectionId, file) {
    try {
      const response = await fetch(`${base}/api/connections/${encodeURIComponent(connectionId)}/attachments/${encodeURIComponent(file.id)}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {}, cache: 'no-store',
      });
      if (!response.ok) {
        let detail = response.statusText;
        try { detail = (await response.json()).error || detail; } catch { /* binary error body */ }
        throw new Error(detail || t('Download failed.', 'فشل التنزيل.'));
      }
      const href = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = String(file.file_name || 'attachment').replace(/[^\w.\- ]+/g, '_');
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (error) { alert(error.message || t('Download failed.', 'فشل التنزيل.')); }
  }
  function progressSection(connectionId, entries, workspace) {
    const block = node('section', 'ws-section');
    block.append(node('h3', null, t('Progress log', 'سجل التقدم')));
    const form = node('form', 'ws-form');
    const metricField = node('div', 'field'), valueField = node('div', 'field'), unitField = node('div', 'field'), noteField = node('div', 'field'), dateField = node('div', 'field');
    const metric = node('select'), value = node('input'), unit = node('input'), note = node('textarea'), recordedAt = node('input');
    metric.id = 'wsProgressMetric'; metric.setAttribute('aria-label', t('Metric', 'المؤشر'));
    for (const [code, labels] of Object.entries(progressMetrics)) metric.append(new Option(t(...labels), code));
    value.id = 'wsProgressValue'; value.type = 'text'; value.maxLength = 40; value.required = true;
    value.setAttribute('aria-label', t('Value', 'القيمة'));
    unit.id = 'wsProgressUnit'; unit.type = 'text'; unit.maxLength = 20;
    unit.setAttribute('aria-label', t('Unit (optional)', 'الوحدة (اختياري)'));
    note.id = 'wsProgressNote'; note.rows = 2; note.maxLength = 300;
    note.setAttribute('aria-label', t('Note (optional)', 'ملاحظة (اختياري)'));
    recordedAt.id = 'wsProgressDate'; recordedAt.type = 'date'; recordedAt.required = true;
    const today = new Date();
    recordedAt.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    recordedAt.setAttribute('aria-label', t('Date', 'التاريخ'));
    metricField.append(node('label', null, t('Metric', 'المؤشر')), metric);
    valueField.append(node('label', null, t('Value', 'القيمة')), value);
    unitField.append(node('label', null, t('Unit (optional)', 'الوحدة (اختياري)')), unit);
    noteField.append(node('label', null, t('Note (optional)', 'ملاحظة (اختياري)')), note);
    dateField.append(node('label', null, t('Date', 'التاريخ')), recordedAt);
    form.append(metricField, valueField, unitField, dateField, noteField);
    const submit = node('button', t('Add progress', 'أضف تقدماً'));
    submit.type = 'submit';
    form.append(submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!progressMetrics[metric.value] || !value.value.trim()) { workspaceMessage(t('Enter a value.', 'أدخل قيمة.'), 'error'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt.value) || Number.isNaN(Date.parse(`${recordedAt.value}T00:00:00Z`))) {
        workspaceMessage(t('Choose a valid date.', 'اختر تاريخاً صالحاً.'), 'error'); return;
      }
      submit.disabled = true;
      try {
        await api(`/connections/${encodeURIComponent(connectionId)}/progress`, {
          method: 'POST', body: { metric: metric.value, value: value.value.trim(), unit: unit.value.trim(), note: note.value.trim(), recorded_at: recordedAt.value },
        });
        await loadWorkspace();
        workspaceMessage(t('Recorded progress.', 'تم تسجيل التقدم.'), 'success');
      } catch (error) { workspaceMessage(error.message || t('Could not save progress.', 'تعذر حفظ التقدم.'), 'error'); }
      finally { submit.disabled = false; }
    });
    const list = node('div', 'ws-list');
    if (!entries.length) list.append(node('p', 'ws-muted', t('No progress recorded yet.', 'لم يتم تسجيل تقدم بعد.')));
    for (const entry of entries) {
      const row = node('article', 'ws-row');
      row.append(node('strong', `${metricLabel(entry.metric)}: ${entry.value}${entry.unit ? ` ${entry.unit}` : ''}`));
      row.append(node('div', 'ws-muted', [date(entry.recorded_at), authorLabel(entry.author_user_id, workspace), entry.note].filter(Boolean).join(' · ')));
      list.append(row);
    }
    block.append(form, list);
    return block;
  }
  function sharedGroup(title, rows, action) {
    const group = node('section', 'ws-section');
    group.append(node('h3', null, title));
    const list = node('div', 'ws-list');
    for (const row of rows) list.append(row);
    group.append(list);
    if (action) {
      const actions = node('div', 'ws-actions');
      actions.append(button(action.label, action.run, 'secondary'));
      group.append(actions);
    }
    return group;
  }
  function sharedDataSection(workspace) {
    const block = node('section', 'ws-section');
    block.append(node('h3', null, t('Messages, plans, feedback and calendar', 'الرسائل والخطط والملاحظات والتقويم')));
    block.append(node('p', 'ws-muted', t('These records are managed in your dashboard tools. Use those tools to reply or add new items.', 'تُدار هذه السجلات في أدوات لوحة التحكم. استخدمها للرد أو إضافة عناصر جديدة.')));
    const grid = node('div', 'ws-grid');
    const messages = (workspace.messages || []).slice(-10).reverse();
    grid.append(sharedGroup(t('Recent messages', 'الرسائل الأخيرة'), messages.length
      ? messages.map(message => node('article', 'ws-row', `${authorLabel(message.sender_user_id, workspace) || (workspace.viewing_as === 'coach' ? t('Athlete', 'الرياضي') : t('Coach', 'المدرب'))} · ${date(message.created_at)} — ${message.body || ''}`))
      : [node('p', 'ws-muted', t('No messages yet.', 'لا توجد رسائل بعد.'))], {
      label: t('Open messages', 'فتح الرسائل'),
      run: () => { const select = $('wsMessageConnection'); if (select) { select.value = workspace.id; select.dispatchEvent(new Event('change')); } jumpTo('wsMessages'); },
    }));
    const programs = (workspace.programs || []).slice(0, 8);
    grid.append(sharedGroup(t('Recent plans', 'الخطط الأخيرة'), programs.length
      ? programs.map(program => node('article', 'ws-row', `${program.week_start || ''} · ${(program.sessions || []).length} ${t('sessions', 'حصص')}${program.coach_note ? ` — ${program.coach_note}` : ''}`))
      : [node('p', 'ws-muted', t('No programs yet.', 'لا توجد برامج بعد.'))], {
      label: t('Open program history', 'فتح سجل البرامج'),
      run: () => jumpTo(role === 'provider' ? 'flexProgramHistory' : 'athleteProgramHistory'),
    }));
    const feedback = (workspace.feedback || []).slice(0, 8);
    grid.append(sharedGroup(t('Training feedback', 'ملاحظات التدريب'), feedback.length
      ? feedback.map(entry => node('article', 'ws-row', `${entry.rating || '—'}/5 · ${entry.week_start || date(entry.created_at)} — ${entry.body || ''}`))
      : [node('p', 'ws-muted', t('No feedback yet.', 'لا توجد ملاحظات بعد.'))], role === 'member'
      ? { label: t('Open feedback', 'فتح الملاحظات'), run: () => jumpTo('wsFeedback') } : null));
    const calendar = (workspace.calendar || []).slice(0, 8);
    grid.append(sharedGroup(t('Upcoming calendar', 'التقويم القادم'), calendar.length
      ? calendar.map(event => node('article', 'ws-row', `${event.title || ''} · ${date(event.starts_at)}${event.location ? ` · ${event.location}` : ''}`))
      : [node('p', 'ws-muted', t('No upcoming sessions.', 'لا توجد حصص قادمة.'))], {
      label: t('Open calendar', 'فتح التقويم'),
      run: () => jumpTo('wsCalendar'),
    }));
    block.append(grid);
    return block;
  }

  async function loadCalendar() {
    const root = $('wsCalendarBody');
    if (!root) return;
    try {
      const data = await api('/dashboard/calendar');
      root.replaceChildren();
      const events = (data.events || []).slice(0, 50);
      for (const event of events) root.append(item(event.title, [date(event.starts_at), event.location, event.description].filter(Boolean).join(' · ')));
      if (!events.length) empty(root, t('No upcoming sessions.', 'لا توجد حصص قادمة.'));
    } catch (error) { root.replaceChildren(node('p', error.message, 'muted')); }
  }
  function calendarPanel() {
    const root = section('wsCalendar', t('Your calendar', 'تقويمك'));
    root.body;
    return root;
  }

  async function loadFeedback(programs) {
    const root = $('wsFeedbackBody');
    if (!root) return;
    try {
      const data = await api('/dashboard/feedback');
      const list = root.querySelector('[data-list]');
      list.replaceChildren();
      for (const feedback of data.feedback || []) list.append(item(`${feedback.athlete_name || ''} · ${feedback.rating || '—'}/5 · ${date(feedback.created_at)}`, feedback.body));
      if (!(data.feedback || []).length) empty(list, t('No feedback yet.', 'لا توجد ملاحظات بعد.'));
      const select = root.querySelector('select');
      const prior = select.value;
      select.replaceChildren(new Option(t('Choose a program', 'اختر برنامجاً'), ''));
      for (const program of programs || []) select.append(new Option(`${program.athlete_name || ''} · ${program.week_start}`, program.id));
      if ((programs || []).some(program => program.id === prior)) select.value = prior;
    } catch (error) { root.querySelector('[data-list]').replaceChildren(node('p', error.message, 'muted')); }
  }
  function feedbackPanel(programs) {
    const root = section('wsFeedback', t('Training feedback', 'ملاحظات التدريب'));
    const body = root.body;
    const form = node('form', null, 'form-grid');
    const select = node('select'), rating = node('select'), text = node('textarea');
    select.setAttribute('aria-label', t('Program', 'البرنامج'));
    rating.setAttribute('aria-label', t('Rating', 'التقييم'));
    for (const value of ['5', '4', '3', '2', '1']) rating.append(new Option(`${value}/5`, value));
    text.rows = 3; text.maxLength = 2000;
    text.placeholder = t('Share what worked and what could improve', 'شارك ما نجح وما يمكن تحسينه');
    text.setAttribute('aria-label', text.placeholder);
    form.append(select, rating, text, node('button', t('Send feedback', 'أرسل الملاحظات')));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!select.value || !text.value.trim()) return;
      try { await api('/dashboard/feedback', { method: 'POST', body: { program_id: select.value, rating: Number(rating.value), body: text.value } }); text.value = ''; await loadFeedback(programs); }
      catch (error) { alert(error.message); }
    });
    const list = node('div', null, 'cards');
    list.dataset.list = '';
    body.append(form, list);
    return root;
  }

  async function loadNotifications() {
    const root = $('wsNotificationsBody');
    if (!root) return;
    try {
      const data = await api('/dashboard/notifications');
      const list = root.querySelector('[data-list]');
      list.replaceChildren();
      root.querySelector('[data-count]').textContent = `${t('Unread', 'غير مقروء')}: ${data.unread || 0}`;
      for (const notice of data.notifications || []) {
        const card = item(notice.title, [notice.body, date(notice.created_at)].filter(Boolean).join(' · '));
        if (notice.href) {
          const link = document.createElement('a'); link.href = notice.href;
          link.className = 'btn'; link.textContent = t('Open', 'فتح'); card.append(link);
        }
        if (!notice.read_at) card.append(button(t('Mark read', 'تحديد كمقروء'), async () => {
          try { await api(`/dashboard/notifications/${encodeURIComponent(notice.id)}`, { method: 'PATCH' }); await loadNotifications(); }
          catch (error) { alert(error.message); }
        }));
        list.append(card);
      }
      if (!(data.notifications || []).length) empty(list, t('No notifications yet.', 'لا توجد إشعارات بعد.'));
    } catch (error) { root.querySelector('[data-list]').replaceChildren(node('p', error.message, 'muted')); }
  }
  function notificationsPanel() {
    const root = section('wsNotifications', t('Notifications', 'الإشعارات'));
    const body = root.body;
    const head = node('div', null, 'actions');
    const count = node('strong'); count.dataset.count = '';
    head.append(count, button(t('Mark all read', 'تحديد الكل كمقروء'), async () => {
      try { await api('/dashboard/notifications', { method: 'PATCH' }); await loadNotifications(); }
      catch (error) { alert(error.message); }
    }));
    const list = node('div', null, 'cards');
    list.dataset.list = '';
    body.append(head, list);
    return root;
  }

  async function loadBookings() {
    const root = $('wsBookingsBody');
    if (!root) return;
    try {
      const data = await api('/dashboard/bookings');
      root.replaceChildren();
      const transitions = { received: ['reviewing', 'accepted', 'declined', 'cancelled'], reviewing: ['accepted', 'declined', 'cancelled'], accepted: ['cancelled'] };
      for (const booking of data.bookings || []) {
        const card = item(`${booking.customer_name} · ${label(booking.status)}`, [booking.city, booking.session_type, booking.preferred_date, date(booking.created_at)].filter(Boolean).join(' · '));
        for (const status of transitions[booking.status] || []) card.append(button(label(status), async () => {
          try { await api(`/dashboard/bookings/${encodeURIComponent(booking.id)}`, { method: 'PATCH', body: { status } }); await loadBookings(); }
          catch (error) { alert(error.message); }
        }));
        root.append(card);
      }
      if (!(data.bookings || []).length) empty(root, t('No booking requests yet.', 'لا توجد طلبات حجز بعد.'));
    } catch (error) { root.replaceChildren(node('p', error.message, 'muted')); }
  }
  function bookingsPanel() {
    const root = section('wsBookings', t('Booking inbox', 'صندوق الحجوزات'));
    root.body;
    return root;
  }

  async function loadAnalytics() {
    const root = $('wsAnalyticsBody');
    if (!root) return;
    try {
      const data = await api('/dashboard/analytics');
      const names = {
        followers: ['Followers', 'المتابعون'], profile_views: ['Profile views', 'مشاهدات الملف'], posts: ['Posts', 'المنشورات'],
        events: ['Events', 'الفعاليات'], post_likes: ['Likes', 'الإعجابات'], post_comments: ['Comments', 'التعليقات'],
        booking_requests: ['Booking requests', 'طلبات الحجز'], open_bookings: ['Open bookings', 'طلبات مفتوحة'], accepted_bookings: ['Confirmed', 'مؤكدة'],
      };
      root.replaceChildren();
      for (const [key, value] of Object.entries(data.analytics || {})) {
        const tile = node('div', null, 'metric');
        tile.append(node('strong', String(value)), node('span', names[key] ? t(...names[key]) : key));
        root.append(tile);
      }
    } catch (error) { root.replaceChildren(node('p', error.message, 'muted')); }
  }
  function analyticsPanel() {
    const root = section('wsAnalytics', t('Real engagement analytics', 'تحليلات تفاعل حقيقية'));
    const body = root.body;
    body.className = 'progress-metrics';
    return root;
  }

  async function loadAll() {
    const root = $('communityWorkspace');
    if (!root || loading) return;
    loading = true;
    token = localStorage.getItem(key) || sessionStorage.getItem(key) || '';
    if (!token) {
      connections = [];
      root.hidden = true;
      root.classList.add('hidden');
      renderWorkspaceAccess();
      loading = false;
      return;
    }
    let dashboard = window.mzStudioDashboard;
    try { dashboard = dashboard || await api('/dashboard'); }
    catch {
      connections = [];
      root.hidden = true;
      root.classList.add('hidden');
      renderWorkspaceAccess();
      loading = false;
      return;
    }
    role = dashboard.role || '';
    approved = role === 'admin';
    if (role === 'provider') {
      try { approved = (await api('/me/profile')).profile?.status === 'approved'; }
      catch { approved = false; }
    }
    root.replaceChildren();
    root.hidden = false;
    root.classList.remove('hidden');
    const programs = dashboard.programs || [];
    if (role === 'provider') root.append(achievementsPanel());
    if (role === 'provider' || role === 'member') root.append(connectionsPanel());
    if (canUseWorkspace()) root.append(workspacePanel());
    if (role === 'provider' || role === 'member') root.append(messagesPanel());
    root.append(calendarPanel());
    if (role === 'member') root.append(feedbackPanel(programs));
    root.append(notificationsPanel());
    if (approved) root.append(bookingsPanel(), analyticsPanel());
    renderWorkspaceAccess();
    await Promise.all([
      role === 'provider' ? loadAchievements() : Promise.resolve(),
      (role === 'provider' || role === 'member') ? loadConnections() : Promise.resolve(),
      loadCalendar(),
      role === 'member' ? loadFeedback(programs) : Promise.resolve(),
      loadNotifications(),
      approved ? loadBookings() : Promise.resolve(),
      approved ? loadAnalytics() : Promise.resolve(),
    ]);
    loading = false;
  }

  $('workspaceJump')?.addEventListener('click', () => openWorkspace());
  document.addEventListener('mzactive:dashboard-ready', loadAll);
  document.addEventListener('mzactive:language-change', () => { if (!($('communityWorkspace')?.hidden)) loadAll(); });
  window.addEventListener('storage', event => { if (event.key === key) loadAll(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAll);
  else loadAll();
})();

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
  let token = '', role = '', approved = false, connections = [], loading = false;

  function node(tag, text, className) {
    const item = document.createElement(tag);
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

  function renderConnections() {
    const root = $('wsConnectionsBody');
    if (!root) return;
    const list = root.querySelector('[data-list]');
    list.replaceChildren();
    for (const connection of connections) {
      const other = role === 'provider' ? connection.athlete_name : connection.coach_name;
      const card = item(other || t('MZ Active member', 'عضو MZ Active'), `${label(connection.status)} · ${date(connection.updated_at)}`);
      if (role === 'provider' && connection.status === 'pending') {
        for (const decision of ['accepted', 'declined']) card.append(button(label(decision), async () => {
          try { await api(`/connections/${encodeURIComponent(connection.id)}`, { method: 'PATCH', body: { status: decision } }); await loadConnections(); }
          catch (error) { alert(error.message); }
        }));
      }
      if (connection.status === 'accepted') card.append(button(t('Open messages', 'فتح الرسائل'), () => {
        const select = $('wsMessageConnection');
        if (select) { select.value = connection.id; select.dispatchEvent(new Event('change')); }
        $('wsMessages')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
      list.append(card);
    }
    if (!connections.length) empty(list, t('No coach connections yet.', 'لا توجد روابط مع مدربين بعد.'));
    renderMessageTargets();
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
    if (!token) { root.hidden = true; loading = false; return; }
    let dashboard = window.mzStudioDashboard;
    try { dashboard = dashboard || await api('/dashboard'); }
    catch { root.hidden = true; loading = false; return; }
    role = dashboard.role || '';
    approved = role === 'admin';
    if (role === 'provider') {
      try { approved = (await api('/me/profile')).profile?.status === 'approved'; }
      catch { approved = false; }
    }
    root.replaceChildren();
    root.hidden = false;
    const programs = dashboard.programs || [];
    if (role === 'provider') root.append(achievementsPanel());
    if (role === 'provider' || role === 'member') root.append(connectionsPanel(), messagesPanel());
    root.append(calendarPanel());
    if (role === 'member') root.append(feedbackPanel(programs));
    root.append(notificationsPanel());
    if (approved) root.append(bookingsPanel(), analyticsPanel());
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

  document.addEventListener('mzactive:dashboard-ready', loadAll);
  document.addEventListener('mzactive:language-change', () => { if (!($('communityWorkspace')?.hidden)) loadAll(); });
  window.addEventListener('storage', event => { if (event.key === key) loadAll(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAll);
  else loadAll();
})();

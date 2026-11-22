(() => {
  'use strict';

  const tokenKey = 'mzactive-provider-session';
  const apiBase = window.MZACTIVE_API_BASE || '';
  const readToken = () => localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey);
  if (!readToken()) return;

  const $ = id => document.getElementById(id);
  const isArabic = () => document.documentElement.lang === 'ar';
  const text = (en, ar) => isArabic() ? ar : en;
  const statusLabels = {
    received: ['Received', 'مستلمة'],
    reviewing: ['Under review', 'قيد المراجعة'],
    accepted: ['Confirmed', 'مؤكدة'],
    declined: ['Declined', 'مرفوضة'],
    cancelled: ['Cancelled', 'ملغية'],
    completed: ['Completed', 'مكتملة'],
  };
  const transitions = {
    received: [['reviewing', 'Mark reviewing', 'تحديد قيد المراجعة'], ['accepted', 'Accept request', 'قبول الطلب'], ['declined', 'Decline', 'رفض'], ['cancelled', 'Cancel', 'إلغاء']],
    reviewing: [['accepted', 'Accept request', 'قبول الطلب'], ['declined', 'Decline', 'رفض'], ['cancelled', 'Cancel', 'إلغاء']],
    accepted: [['cancelled', 'Cancel', 'إلغاء']],
  };
  const labels = {
    sports: ['Sports', 'الرياضات'], services: ['Services', 'الخدمات'],
    distances: ['Distances', 'المسافات'], pace: ['Running pace', 'وتيرة الجري'],
    speed: ['Cycling speed', 'سرعة الدراجات'], areas: ['Service areas', 'مناطق الخدمة'],
    availability: ['Availability', 'التوفر'], customer: ['Athlete', 'الرياضي'],
    phone: ['Phone', 'الهاتف'], session: ['Session', 'الجلسة'],
    service: ['Service', 'الخدمة'], date: ['Preferred date', 'التاريخ المفضل'],
    city: ['City', 'المدينة'], distance: ['Distance', 'المسافة'],
    target: ['Target pace / speed', 'الوتيرة / السرعة المستهدفة'],
    goal: ['Goal', 'الهدف'], created: ['Received', 'تاريخ الاستلام'],
  };

  let profile = null;
  let bookings = [];

  async function api(path, options = {}) {
    const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
    const token = readToken();
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(apiBase + path, { ...options, headers });
    let data = {};
    try { data = await response.json(); } catch { /* empty response */ }
    if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: response.status });
    return data;
  }

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function mount() {
    if ($('pacerDashboard')) return $('pacerDashboard');
    const section = element('section', 'pacer-dashboard');
    section.id = 'pacerDashboard';
    section.hidden = true;
    section.innerHTML = `
      <div class="pacer-dashboard-head">
        <div>
          <p class="eyebrow" data-en="PACER WORKSPACE" data-ar="مساحة المرافق">PACER WORKSPACE</p>
          <h3 data-en="Your Pacer dashboard" data-ar="لوحة تحكم المرافق">Your Pacer dashboard</h3>
          <p class="muted" data-en="This workspace uses your MZ Active Pacer account. Requests stay private to you and MZ Active." data-ar="تعمل هذه المساحة بحساب المرافق في MZ Active. تبقى الطلبات خاصة بك ولـ MZ Active.">This workspace uses your MZ Active Pacer account. Requests stay private to you and MZ Active.</p>
        </div>
        <a id="pacerPublicProfile" class="btn secondary" target="_blank" rel="noopener noreferrer" data-en="View public profile" data-ar="عرض الملف العام">View public profile</a>
      </div>
      <div id="pacerDashboardMessage" class="fine" role="status" aria-live="polite"></div>
      <div id="pacerFacts" class="pacer-facts-grid"></div>
      <div class="pacer-workspace-grid">
        <div class="pacer-panel">
          <h4 data-en="Booking requests" data-ar="طلبات الحجز">Booking requests</h4>
          <div id="pacerBookings"></div>
        </div>
        <div class="pacer-panel">
          <h4 data-en="Confirmed sessions" data-ar="الجلسات المؤكدة">Confirmed sessions</h4>
          <div id="pacerConfirmed"></div>
          <h4 data-en="Past sessions" data-ar="الجلسات السابقة">Past sessions</h4>
          <div id="pacerPast"></div>
        </div>
      </div>`;
    const wrap = $('provider-portal')?.querySelector('.wrap');
    if (!wrap) return null;
    wrap.append(section);
    return section;
  }

  function fact(labelEn, labelAr, value) {
    if (!value) return null;
    const card = element('div', 'pacer-fact');
    card.append(element('b', '', text(labelEn, labelAr)), element('span', '', value));
    return card;
  }

  function renderFacts() {
    const grid = $('pacerFacts');
    const details = profile?.pacer_details || {};
    grid.replaceChildren();
    const cards = [
      fact(labels.sports[0], labels.sports[1], (details.sports || []).join(' · ')),
      fact(labels.services[0], labels.services[1], (details.services || []).join(' · ')),
      fact(labels.distances[0], labels.distances[1], (details.distances || []).join(' · ')),
      fact(labels.pace[0], labels.pace[1], details.running_pace),
      fact(labels.speed[0], labels.speed[1], details.cycling_speed),
      fact(labels.areas[0], labels.areas[1], details.service_areas),
      fact(labels.availability[0], labels.availability[1], details.availability),
    ].filter(Boolean);
    grid.append(...cards);
    if (!cards.length) grid.append(element('p', 'pacer-empty', text('No Pacer details have been published yet.', 'لم تُنشر بيانات مرافق بعد.')));
  }

  function statusPill(status) {
    const pair = statusLabels[status] || [status || 'Pending', status || 'قيد الانتظار'];
    return element('span', 'status-pill', text(pair[0], pair[1]));
  }

  function detailLine(labelEn, labelAr, value) {
    if (!value) return null;
    const line = element('div', 'pacer-booking-detail');
    line.append(element('b', '', text(labelEn, labelAr) + ': '), document.createTextNode(String(value)));
    return line;
  }

  function bookingCard(booking, actions = true) {
    const card = element('article', 'pacer-booking');
    const meta = element('div', 'pacer-booking-meta');
    meta.append(statusPill(booking.status));
    if (booking.customer_name) meta.append(element('span', '', booking.customer_name));
    if (booking.created_at) meta.append(element('span', '', detailDate(booking.created_at)));
    card.append(meta);
    const details = element('div', 'pacer-booking-details');
    const lines = [
      detailLine(labels.phone[0], labels.phone[1], booking.customer_phone),
      detailLine(labels.session[0], labels.session[1], booking.session_type),
      detailLine(labels.service[0], labels.service[1], booking.service_name),
      detailLine(labels.date[0], labels.date[1], booking.preferred_date),
      detailLine(labels.city[0], labels.city[1], booking.city),
      detailLine(labels.distance[0], labels.distance[1], booking.distance),
      detailLine(labels.target[0], labels.target[1], booking.target_pace),
      detailLine(labels.goal[0], labels.goal[1], booking.goal_summary),
    ].filter(Boolean);
    details.append(...lines);
    card.append(details);
    if (actions && transitions[booking.status]) {
      const buttons = element('div', 'pacer-booking-actions');
      for (const [status, en, ar] of transitions[booking.status]) {
        const button = element('button', 'btn secondary', text(en, ar));
        button.type = 'button';
        button.dataset.bookingId = booking.id;
        button.dataset.status = status;
        buttons.append(button);
      }
      card.append(buttons);
    }
    return card;
  }

  function detailDate(value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString(isArabic() ? 'ar' : 'en-GB');
  }

  function dateKey(value) {
    return value ? String(value).slice(0, 10) : '';
  }

  async function updateStatus(id, status) {
    const message = $('pacerDashboardMessage');
    message.textContent = text('Updating request…', 'جارٍ تحديث الطلب…');
    try {
      await api('/api/dashboard/bookings/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadBookings();
    } catch (error) {
      message.textContent = text('Could not update this request. No payment was changed.', 'تعذر تحديث الطلب. لم يتم تغيير أي دفعة.');
    }
  }

  function renderBookings() {
    const inbox = $('pacerBookings');
    const confirmed = $('pacerConfirmed');
    const past = $('pacerPast');
    if (!inbox || !confirmed || !past) return;
    inbox.replaceChildren();
    confirmed.replaceChildren();
    past.replaceChildren();

    const pending = bookings.filter(item => !['accepted', 'declined', 'cancelled', 'completed'].includes(item.status));
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = bookings.filter(item => item.status === 'accepted' && (!dateKey(item.preferred_date) || dateKey(item.preferred_date) >= today));
    const history = bookings.filter(item => item.status === 'completed' || (item.status === 'accepted' && dateKey(item.preferred_date) && dateKey(item.preferred_date) < today));

    if (pending.length) {
      for (const booking of pending) inbox.append(bookingCard(booking));
    } else {
      inbox.append(element('p', 'pacer-empty', text('No open booking requests.', 'لا توجد طلبات حجز مفتوحة.')));
    }
    if (upcoming.length) {
      for (const booking of upcoming) confirmed.append(bookingCard(booking, false));
    } else {
      confirmed.append(element('p', 'pacer-empty', text('No confirmed sessions yet.', 'لا توجد جلسات مؤكدة بعد.')));
    }
    if (history.length) {
      for (const booking of history) past.append(bookingCard(booking, false));
    } else {
      past.append(element('p', 'pacer-empty', text('No past sessions yet.', 'لا توجد جلسات سابقة بعد.')));
    }
  }

  async function loadBookings() {
    try {
      const data = await api('/api/dashboard/bookings');
      bookings = Array.isArray(data.bookings) ? data.bookings : [];
      renderBookings();
    } catch {
      bookings = [];
      renderBookings();
      $('pacerDashboardMessage').textContent = text('Requests are temporarily unavailable.', 'الطلبات غير متاحة مؤقتاً.');
    }
  }

  async function init() {
    try {
      const me = await api('/api/me/profile');
      profile = me.profile || null;
      if (!profile || profile.provider_type !== 'pacer' || profile.status !== 'approved') return;
      const section = mount();
      if (!section) return;
      $('pacerPublicProfile').href = 'pacer.html?provider=' + encodeURIComponent(profile.id);
      $('pacerDashboardMessage').textContent = text(
        'A request is not a confirmed booking. No payment is collected here.',
        'الطلب ليس حجزاً مؤكداً. لا يتم تحصيل أي دفع هنا.',
      );
      renderFacts();
      section.hidden = false;
      await loadBookings();
    } catch {
      /* Signed-out or unavailable API: the normal provider portal stays usable. */
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-booking-id][data-status]');
    if (!button) return;
    event.preventDefault();
    button.disabled = true;
    updateStatus(button.dataset.bookingId, button.dataset.status);
  });
  document.addEventListener('mzactive:language-change', () => {
    if (!profile) return;
    renderFacts();
    renderBookings();
  });
  init();
})();

(() => {
  const $ = id => document.getElementById(id);
  const key = 'mzactive-provider-session';
  const base = window.MZACTIVE_API_BASE;
  const lang = window.MZActiveLanguage;
  const t = (en, ar) => lang?.get?.() === 'ar' ? ar : en;
  let token = '';
  let config = null;

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}), accept: 'application/json', authorization: `Bearer ${token}` };
    let body = options.body;
    if (body !== undefined && !(body instanceof Blob)) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${path}`, { ...options, headers, body });
    let data = {};
    try { data = await response.json(); } catch { /* ignore empty responses */ }
    if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: response.status });
    return data;
  }

  function statusName(value) {
    return String(value || '').replaceAll('_', ' ');
  }

  async function loadCompleteness() {
    const target = $('profileCompleteness');
    if (!target) return;
    try {
      const data = await api('/api/me/completeness');
      const c = data.completeness;
      if (!c) { target.textContent = t('No coach profile found yet.','لم يتم إنشاء ملف مدرب بعد.'); return; }
      const missing = [...(c.required || []), ...(c.recommended || [])].slice(0, 6);
      target.textContent = t('Profile completeness: ', 'اكتمال الملف: ') + c.percent + '%' +
        (c.complete ? '' : ' · ' + t('Missing: ', 'ناقص: ') + missing.join(', '));
      target.dataset.complete = String(c.complete);
    } catch {
      target.textContent = t('Profile completeness is unavailable.','اكتمال الملف غير متاح.');
    }
  }

  async function loadConfig() {
    const setup = $('coachContactSetup');
    if (!setup) return;
    try {
      const data = await api('/api/me/contact-config');
      config = data.contact || {};
      const channels = [config.email_configured ? t('email', 'البريد') : '', config.whatsapp_configured ? t('WhatsApp', 'واتساب') : ''].filter(Boolean);
      setup.textContent = channels.length
        ? t('Use the configured MZ Active contact details only: ', 'استخدم بيانات تواصل MZ Active المعدة فقط: ') + channels.join(' · ')
        : t('Management contact details are not configured yet. Ask the platform owner to set them before using this form.','لم يتم إعداد بيانات تواصل الإدارة بعد. اطلب من مالك المنصة إعدادها قبل استخدام هذا النموذج.');
      setup.dataset.configured = String(Boolean(config.configured));
      $('coachContactEmail').disabled = !config.email_configured;
      $('coachContactWhatsapp').disabled = !config.whatsapp_configured;
    } catch {
      setup.textContent = t('Contact configuration could not be loaded.','تعذر تحميل إعدادات التواصل.');
    }
  }

  async function loadHistory() {
    const root = $('coachContactHistory');
    if (!root) return;
    root.replaceChildren();
    try {
      const data = await api('/api/me/contacts');
      for (const record of (data.contacts || []).slice(0, 10)) {
        const item = document.createElement('p');
        item.textContent = [record.channel, statusName(record.status), new Date(record.created_at).toLocaleString()].join(' · ');
        root.append(item);
      }
    } catch { /* history is optional */ }
  }

  async function prepare(channel) {
    const status = $('coachContactStatus');
    const message = $('coachContactMessage').value.trim();
    if (!message) { status.textContent = t('Write a message first.','اكتب الرسالة أولاً.'); return; }
    try {
      const data = await api(`/api/me/contacts?intent=prepare`, { method: 'POST', body: {
        channel, purpose: $('coachContactReason').value, message,
      } });
      if (data.link) window.open(data.link, '_blank', 'noopener,noreferrer');
      status.textContent = t('Draft saved. Confirm sending in the opened app.','حُفظت المسودة. أكّد الإرسال في التطبيق الذي فُتح.');
      status.dataset.state = data.status;
      await loadHistory();
    } catch (err) {
      status.textContent = err.message === 'management_contact_not_configured'
        ? t('Management contact details are not configured.','بيانات تواصل الإدارة غير معدّة.')
        : t('The message could not be prepared.','تعذر إعداد الرسالة.');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    token = localStorage.getItem(key) || sessionStorage.getItem(key) || '';
    if (!token || !$('coachContactPanel')) return;
    try {
      const access = await api('/api/me/access');
      if (access.account_type !== 'provider') return;
    } catch { return; }
    await Promise.all([loadCompleteness(), loadConfig(), loadHistory()]);
    $('coachContactEmail')?.addEventListener('click', () => prepare('email'));
    $('coachContactWhatsapp')?.addEventListener('click', () => prepare('whatsapp'));
    document.addEventListener('mzactive:language-change', () => { loadConfig(); loadCompleteness(); });
  });
})();

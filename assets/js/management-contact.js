(() => {
  if (window.MZActiveManagementContact) return;
  const state = { whatsapp: '', configured: false, loaded: false };
  const listeners = new Set();

  function normalize(number) {
    return String(number || '').replace(/\D/g, '');
  }

  function link(number, message) {
    const digits = normalize(number);
    if (!digits) return '';
    const url = `https://wa.me/${digits}`;
    return message ? `${url}?text=${encodeURIComponent(message)}` : url;
  }

  function messageFor(element) {
    const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
    return element.dataset[`waMessage${lang === 'ar' ? 'Ar' : 'En'}`] || element.dataset.waMessage || '';
  }

  function setFallback(element) {
    const arabic = document.documentElement.lang === 'ar';
    if (element.classList.contains('wa-chat-float')) {
      element.setAttribute('aria-disabled', 'true');
      element.tabIndex = -1;
      element.removeAttribute('href');
      const label = element.querySelector('span');
      if (label) label.textContent = arabic ? 'واتساب غير متاح' : 'WhatsApp unavailable';
      element.setAttribute('aria-label', arabic ? 'واتساب غير متاح' : 'WhatsApp unavailable');
      return;
    }
    element.setAttribute('aria-disabled', 'true');
    element.tabIndex = -1;
    element.removeAttribute('href');
    if (element.dataset.waFallback === 'hide') element.hidden = true;
  }

  function apply() {
    document.querySelectorAll('[data-management-whatsapp]').forEach(element => {
      const href = link(state.whatsapp, messageFor(element));
      if (!href) {
        setFallback(element);
        return;
      }
      element.removeAttribute('aria-disabled');
      element.removeAttribute('tabindex');
      element.hidden = false;
      element.href = href;
    });
    listeners.forEach(listener => {
      try { listener({ ...state }); } catch { /* keep other listeners alive */ }
    });
  }

  function subscribe(listener) {
    listeners.add(listener);
    if (state.loaded) listener({ ...state });
    return () => listeners.delete(listener);
  }

  async function load() {
    if (state.loaded) return;
    state.loaded = true;
    try {
      const base = window.MZACTIVE_API_BASE || '';
      const response = await fetch(`${base}/api/public/contact-config`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        state.whatsapp = normalize(data?.contact?.whatsapp);
        state.configured = Boolean(state.whatsapp);
      }
    } catch { /* keep the honest unavailable fallback */ }
    apply();
  }

  window.MZActiveManagementContact = {
    subscribe,
    link,
    get: () => ({ ...state }),
    refresh: () => { state.loaded = false; return load(); },
  };

  const start = () => { load(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  document.addEventListener('mzactive:language-change', apply);
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();

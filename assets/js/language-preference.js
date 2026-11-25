(() => {
  const storageKey = 'mzactive-language-manual';
  const isLanguage = value => value === 'en' || value === 'ar';
  const detectLanguage = () => {
    // SAMLA primarily serves Arabic-speaking athletes in Qatar. On a first
    // visit with no explicit preference, default this campaign to Arabic.
    // Explicit manual choices (stored above) always take priority.
    const path = typeof location !== 'undefined' && location ? String(location.pathname || '') : '';
    if (/(\/|^)samla(\/|$|\.html$)/i.test(path)) return 'ar';
    const preferred = navigator.languages?.[0] || navigator.language || '';
    return /^ar(?:-|$)/i.test(preferred) ? 'ar' : 'en';
  };
  const readManualPreference = () => {
    try {
      const current = localStorage.getItem(storageKey);
      if (isLanguage(current)) return current;
      const legacy = localStorage.getItem('mzactive-language');
      if (!isLanguage(legacy)) return null;
      localStorage.setItem(storageKey, legacy);
      return legacy;
    } catch {
      return null;
    }
  };

  let language = readManualPreference() || detectLanguage();
  const applyBodyDirection = () => {
    if (!document.body) return;
    document.body.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.body.classList.toggle('rtl', language === 'ar');
  };
  const setLanguage = (next, { manual = false } = {}) => {
    if (!isLanguage(next)) throw new TypeError('Language must be "en" or "ar".');
    const changed = next !== language;
    language = next;
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    applyBodyDirection();
    if (manual) {
      try {
        localStorage.setItem(storageKey, language);
      } catch {
        // Keep the current selection even when browser storage is unavailable.
      }
    }
    if (changed) {
      document.dispatchEvent(new CustomEvent('mzactive:language-change', {
        detail: { lang: language, manual }
      }));
    }
  };

  window.MZActiveLanguage = Object.freeze({
    get: () => language,
    set: setLanguage,
    detect: detectLanguage,
    storageKey
  });
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  if (document.body) applyBodyDirection();
  else document.addEventListener('DOMContentLoaded', applyBodyDirection, { once: true });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    setLanguage(isLanguage(event.newValue) ? event.newValue : detectLanguage());
  });
})();

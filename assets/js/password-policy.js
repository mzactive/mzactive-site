(() => {
  // Keep this list and the length rules aligned with backend/worker.js.
  const MAX_PASSWORD_LENGTH = 256;
  const COMMON_PASSWORDS = new Set([
    'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789', '1234567890',
    '87654321', '987654321', 'qwerty', 'qwerty123', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
    'letmein', 'welcome', 'welcome1', 'admin', 'admin123', 'administrator', 'iloveyou',
    'trustno1', 'monkey', 'dragon', 'sunshine', 'princess', 'football', 'baseball', 'master',
    'login', 'mzactive', 'mzactive1', 'abc12345', '11111111', '00000000', '1q2w3e4r',
  ]);
  const COPY = {
    en: {
      guide: 'Use at least {min} characters. A longer phrase is stronger. Password managers and pasting are supported.',
      short: 'Use at least {min} characters.',
      common: 'That password is too common. Choose a longer phrase or a different one.',
      long: 'Use {max} characters or fewer.',
    },
    ar: {
      guide: 'استخدم {min} أحرف على الأقل. العبارة الأطول أقوى. يمكنك استخدام مدير كلمات المرور أو اللصق.',
      short: 'استخدم {min} أحرف على الأقل.',
      common: 'كلمة المرور هذه شائعة جداً. اختر عبارة أطول أو كلمة مختلفة.',
      long: 'استخدم {max} حرفاً أو أقل.',
    },
  };
  const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const format = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
  function validate(value, { admin = false } = {}) {
    const min = admin ? 12 : 8;
    if (typeof value !== 'string' || value.length < min) return { ok: false, kind: 'short', message: format(COPY[lang()].short, { min }) };
    if (value.length > MAX_PASSWORD_LENGTH) return { ok: false, kind: 'long', message: format(COPY[lang()].long, { max: MAX_PASSWORD_LENGTH }) };
    const compact = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (COMMON_PASSWORDS.has(compact)) return { ok: false, kind: 'common', message: COPY[lang()].common };
    if (compact.length >= 8 && /^(.)\1+$/.test(compact)) return { ok: false, kind: 'common', message: COPY[lang()].common };
    if (/^(?:\d+|0123456789|1234567890|9876543210|abcdefghijklmnopqrstuvwxyz|zyxwvutsrqponmlkjihgfedcba|qwertyuiop|asdfghjkl|zxcvbnm)$/.test(compact)) return { ok: false, kind: 'common', message: COPY[lang()].common };
    return { ok: true, kind: null, message: '' };
  }
  function guide(admin = false) {
    return format(COPY[lang()].guide, { min: admin ? 12 : 8, max: MAX_PASSWORD_LENGTH });
  }
  function isAdminInput(input) {
    return ['setupPassword', 'changePasswordInput', 'recoverPassword'].includes(input.id) ||
      ['admin.html', 'change-password.html'].includes(location.pathname.split('/').pop() || '');
  }
  function attach(input) {
    if (input.dataset.passwordPolicyBound) return;
    input.dataset.passwordPolicyBound = 'true';
    const admin = isAdminInput(input);
    input.minLength = admin ? 12 : 8;
    input.maxLength = MAX_PASSWORD_LENGTH;
    const hint = document.createElement('small');
    hint.className = 'password-guidance';
    hint.setAttribute('aria-live', 'polite');
    hint.style.cssText = 'display:block;color:var(--muted,#929b93);font-size:12px;margin:4px 0 0';
    (input.closest('.auth-password-field') || input).insertAdjacentElement('afterend', hint);
    const refresh = () => {
      hint.textContent = guide(admin);
      input.dataset.enHint = admin ? COPY.en.guide.replace('{min}', '12').replace('{max}', String(MAX_PASSWORD_LENGTH)) : COPY.en.guide.replace('{min}', '8').replace('{max}', String(MAX_PASSWORD_LENGTH));
      input.dataset.arHint = admin ? COPY.ar.guide.replace('{min}', '12').replace('{max}', String(MAX_PASSWORD_LENGTH)) : COPY.ar.guide.replace('{min}', '8').replace('{max}', String(MAX_PASSWORD_LENGTH));
    };
    refresh();
    document.addEventListener('mzactive:language-change', refresh);
    input.addEventListener('input', () => input.setCustomValidity(''));
    input.form?.addEventListener('submit', (event) => {
      const result = validate(input.value, { admin });
      input.setCustomValidity(result.ok ? '' : result.message);
      if (!result.ok) {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.reportValidity();
        input.focus();
      }
    }, true);
  }
  function bindAll() {
    document.querySelectorAll('input[autocomplete="new-password"]:not([name="confirm_password"]):not([name="confirm_password_confirmation"])').forEach(attach);
  }
  window.MZActivePasswordPolicy = Object.freeze({ validate, guide, MAX_PASSWORD_LENGTH, bindAll });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindAll, { once: true });
  else bindAll();
})();

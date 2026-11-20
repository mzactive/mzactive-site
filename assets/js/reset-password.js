/* Standalone password-reset page logic. The reset token comes only from the
 * URL and is sent to POST /api/auth/reset-password with the new password.
 * All copy is bilingual; no recovery key is ever requested in this flow. */
(() => {
  const SESSION_KEY = 'mzactive-provider-session';
  const COPY = {
    title: ['Choose a new password', 'اختر كلمة مرور جديدة'],
    intro: [
      'Use at least 12 characters. After a successful reset you will need to sign in again.',
      'استخدم ١٢ حرفاً على الأقل. بعد نجاح إعادة التعيين سيتعين عليك تسجيل الدخول مجدداً.'
    ],
    password: ['New password', 'كلمة المرور الجديدة'],
    confirm: ['Confirm new password', 'تأكيد كلمة المرور الجديدة'],
    show: ['Show', 'إظهار'],
    hide: ['Hide', 'إخفاء'],
    submit: ['Update password', 'تحديث كلمة المرور'],
    working: ['Updating…', 'جارٍ التحديث…'],
    missing_token: [
      'This reset link is missing a token. Open the link from your email or request a new one from the sign-in page.',
      'رابط إعادة التعيين هذا لا يتضمن رمزاً. افتح الرابط من بريدك أو اطلب رابطاً جديداً من صفحة الدخول.'
    ],
    password_short: ['Use at least 12 characters.', 'استخدم ١٢ حرفاً على الأقل.'],
    password_match: ['The new passwords do not match.', 'كلمتا المرور الجديدتان غير متطابقتين.'],
    invalid_token: [
      'This reset link is invalid or has expired. Request a new one from the sign-in page.',
      'هذا الرابط غير صالح أو منتهٍ. اطلب رابطاً جديداً من صفحة الدخول.'
    ],
    invalid_password: ['Use a new password of at least 12 characters.', 'استخدم كلمة مرور جديدة من ١٢ حرفاً على الأقل.'],
    rate_limited: ['Too many attempts. Wait a minute and try again.', 'محاولات كثيرة. انتظر دقيقة ثم حاول مجدداً.'],
    recovery_unavailable: [
      'Password recovery is not configured. Contact the account owner.',
      'استعادة كلمة المرور غير مهيأة. تواصل مع صاحب الحساب.'
    ],
    network: [
      'Could not reach the service. Check your connection and try again.',
      'تعذر الاتصال بالخدمة. تحقق من اتصالك وحاول مجدداً.'
    ],
    generic: [
      'The service returned an unexpected response. Try again shortly.',
      'عادت الخدمة باستجابة غير متوقعة. حاول بعد قليل.'
    ],
    success: ['Password updated. Sign in again.', 'تم تحديث كلمة المرور. سجّل الدخول مجدداً.'],
    dashboard: ['Go to dashboard', 'الذهاب إلى لوحة التحكم'],
    providers: ['Go to provider portal', 'الذهاب إلى بوابة مقدمي الخدمات'],
    sign_in: ['Back to sign in', 'العودة إلى تسجيل الدخول']
  };

  const lang = () => (window.MZActiveLanguage?.get?.() === 'ar' ? 'ar' : 'en');
  const t = pair => pair[lang() === 'ar' ? 1 : 0];
  const setBilingual = (node, pair) => {
    node.dataset.en = pair[0];
    node.dataset.ar = pair[1];
    node.textContent = t(pair);
    return node;
  };
  const setBilingualAttr = (node, attr, pair) => {
    const suffix = attr === 'aria-label'
      ? 'AriaLabel'
      : attr.charAt(0).toUpperCase() + attr.slice(1);
    node.dataset[`en${suffix}`] = pair[0];
    node.dataset[`ar${suffix}`] = pair[1];
    node.setAttribute(attr, t(pair));
    return node;
  };
  const $ = id => document.getElementById(id);
  const localize = () => {
    for (const node of [document.body, ...document.body.querySelectorAll('[data-en][data-ar]')]) {
      if (node.dataset.en != null && node.dataset.ar != null) node.textContent = node.dataset[lang()];
    }
    for (const node of document.querySelectorAll('[data-en-placeholder],[data-en-aria-label]')) {
      if (node.dataset.enPlaceholder != null) node.setAttribute('placeholder', t([node.dataset.enPlaceholder, node.dataset.arPlaceholder]));
      if (node.dataset.enAriaLabel != null) node.setAttribute('aria-label', t([node.dataset.enAriaLabel, node.dataset.arAriaLabel]));
    }
  };
  document.addEventListener('mzactive:language-change', localize);

  const form = $('resetPasswordForm');
  if (!form) return;
  const status = $('resetStatus');
  const submit = $('resetSubmit');
  const success = $('resetSuccess');
  const tokenValue = new URLSearchParams(location.search).get('token')?.trim() || '';

  const setStatus = (pair, tone = '') => {
    setBilingual(status, pair);
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
  };

  // Remove the shared auth token from every local/session auth-shaped key, but
  // never touch the saved language preference.
  const clearAuthStorage = () => {
    for (const store of [localStorage, sessionStorage]) {
      try {
        const keys = Object.keys(store).filter(key =>
          !/language/i.test(key) && (key === SESSION_KEY || /auth|token|session/i.test(key)));
        for (const key of keys) store.removeItem(key);
      } catch { /* storage may be unavailable; UI still shows the success state */ }
    }
  };

  for (const button of document.querySelectorAll('[data-password-toggle]')) {
    const input = $(button.dataset.passwordToggle);
    if (!input) continue;
    button.addEventListener('click', () => {
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      setBilingual(button, isText ? COPY.show : COPY.hide);
      setBilingualAttr(button, 'aria-label', isText ? COPY.show : COPY.hide);
    });
  }

  if (!tokenValue) {
    submit.disabled = true;
    setStatus(COPY.missing_token, 'error');
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!tokenValue) {
      setStatus(COPY.missing_token, 'error');
      return;
    }
    const password = $('resetPasswordInput').value;
    const confirmation = $('resetConfirmInput').value;
    if (password.length < 12) {
      setStatus(COPY.password_short, 'error');
      $('resetPasswordInput').focus();
      return;
    }
    if (password !== confirmation) {
      setStatus(COPY.password_match, 'error');
      $('resetConfirmInput').focus();
      return;
    }
    submit.disabled = true;
    setStatus(COPY.working, 'info');
    try {
      const response = await fetch(`${window.MZACTIVE_API_BASE || ''}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: tokenValue, new_password: password }),
        cache: 'no-store'
      });
      if (response.ok) {
        clearAuthStorage();
        form.hidden = true;
        success.hidden = false;
        setStatus(COPY.success, 'success');
        $('resetSuccessHeading').focus();
        return;
      }
      let code = '';
      try { code = (await response.json())?.error || ''; } catch { /* generic fallback */ }
      const errors = {
        invalid_token: COPY.invalid_token,
        invalid_password: COPY.invalid_password,
        rate_limited: COPY.rate_limited,
        recovery_unavailable: COPY.recovery_unavailable
      };
      setStatus(errors[code] || COPY.generic, 'error');
    } catch {
      setStatus(COPY.network, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  localize();
})();

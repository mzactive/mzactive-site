/* Shared, email-based forgot-password UI for admin.html, dashboard.html and
 * providers.html. One dialog is created per page and reused by every login
 * form. No recovery key is requested and account existence is never revealed.
 * All user-facing strings are bilingual so site-language.js / language-preference.js
 * can translate them (including nodes inserted after page load). */
(() => {
  const COPY = {
    trigger: ['Forgot password?', 'هل نسيت كلمة المرور؟'],
    title: ['Reset your password', 'إعادة تعيين كلمة المرور'],
    intro: [
      'Enter your account email. If an account exists, we will send a password reset link.',
      'أدخل بريد حسابك. إذا كان هناك حساب، سنرسل رابطاً لإعادة تعيين كلمة المرور.'
    ],
    email: ['Email', 'البريد الإلكتروني'],
    emailPlaceholder: ['you@example.com', 'you@example.com'],
    submit: ['Send reset link', 'إرسال رابط إعادة التعيين'],
    sending: ['Sending…', 'جارٍ الإرسال…'],
    cancel: ['Cancel', 'إلغاء'],
    close: ['Close', 'إغلاق'],
    confirmation: [
      'If an account exists for this email, a reset link has been sent. Check your inbox.',
      'إذا كان هناك حساب بهذا البريد، فقد أُرسل رابط إعادة التعيين. تحقق من صندوق الوارد.'
    ],
    invalid_email: ['Enter a valid email address.', 'أدخل بريداً إلكترونياً صحيحاً.'],
    recovery_unavailable: [
      'Password recovery is not configured. Contact the account owner.',
      'استعادة كلمة المرور غير مهيأة. تواصل مع صاحب الحساب.'
    ],
    rate_limited: ['Too many attempts. Wait a minute and try again.', 'محاولات كثيرة. انتظر دقيقة ثم حاول مجدداً.'],
    network: [
      'Could not reach the service. Check your connection and try again.',
      'تعذر الاتصال بالخدمة. تحقق من اتصالك وحاول مجدداً.'
    ],
    generic: [
      'The service returned an unexpected response. Try again shortly.',
      'عادت الخدمة باستجابة غير متوقعة. حاول بعد قليل.'
    ],
    show: ['Show', 'إظهار'],
    hide: ['Hide', 'إخفاء']
  };

  const lang = () => (window.MZActiveLanguage?.get?.() === 'ar'
    ? 'ar'
    : (/^ar(?:-|$)/i.test(document.documentElement.lang || '') ? 'ar' : 'en'));
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
  const element = (tag, className, pair, attrs = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (pair) setBilingual(node, pair);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === true) node.setAttribute(key, '');
      else if (value !== false && value != null) node.setAttribute(key, value);
    }
    return node;
  };

  // Keep our own dynamic nodes in sync when the page language changes. Pages
  // that load site-language.js have their own full pass; admin.html does not,
  // so this local pass makes the dialog behave identically everywhere.
  const localize = () => {
    const roots = [...document.querySelectorAll('.auth-forgot-trigger, #forgotPasswordDialog')];
    for (const root of roots) {
      const nodes = [root, ...root.querySelectorAll('[data-en][data-ar]')];
      for (const node of nodes) {
        if (node.dataset.en != null && node.dataset.ar != null) node.textContent = node.dataset[lang()];
      }
      for (const node of [root, ...root.querySelectorAll('[data-en-placeholder]')]) {
        const pair = [node.dataset.enPlaceholder, node.dataset.arPlaceholder];
        if (pair[0] != null && pair[1] != null) node.setAttribute('placeholder', t(pair));
      }
      for (const node of [root, ...root.querySelectorAll('[data-en-aria-label]')]) {
        const pair = [node.dataset.enAriaLabel, node.dataset.arAriaLabel];
        if (pair[0] != null && pair[1] != null) node.setAttribute('aria-label', t(pair));
      }
    }
  };
  document.addEventListener('mzactive:language-change', localize);

  let dialog = null;
  let statusNode = null;
  let emailInput = null;
  let submitButton = null;
  let form = null;
  let lastTrigger = null;

  const status = (pair, tone = '') => {
    statusNode.textContent = t(pair);
    statusNode.dataset.en = pair[0];
    statusNode.dataset.ar = pair[1];
    if (tone) statusNode.dataset.tone = tone;
    else delete statusNode.dataset.tone;
  };

  const resetDialog = () => {
    if (!form) return;
    form.hidden = false;
    form.reset();
    status(['', ''], '');
    delete dialog.dataset.result;
    if (submitButton) submitButton.disabled = false;
    if (submitButton) setBilingual(submitButton, COPY.submit);
  };

  const errorCopy = code => COPY[code] || COPY.generic;

  function buildDialog() {
    dialog = element('dialog', 'auth-dialog', null, {
      id: 'forgotPasswordDialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'forgotPasswordTitle',
      'aria-describedby': 'forgotPasswordIntro'
    });
    const panel = element('div', 'auth-dialog__panel');
    const close = element('button', 'auth-dialog__close', null, {
      id: 'forgotPasswordClose', type: 'button'
    });
    setBilingual(close, ['×', '×']);
    setBilingualAttr(close, 'aria-label', COPY.close);
    panel.append(close);
    panel.append(element('h2', 'auth-dialog__title', COPY.title, { id: 'forgotPasswordTitle' }));
    panel.append(element('p', 'auth-dialog__intro', COPY.intro, { id: 'forgotPasswordIntro' }));

    form = element('form', 'auth-dialog__form', null, { id: 'forgotPasswordForm', novalidate: true });
    const field = element('div', 'auth-dialog__field');
    field.append(element('label', null, COPY.email, { for: 'forgotPasswordEmail' }));
    emailInput = element('input', 'auth-dialog__input', null, {
      id: 'forgotPasswordEmail',
      name: 'email',
      type: 'email',
      inputmode: 'email',
      autocomplete: 'email',
      maxlength: '254',
      required: true
    });
    setBilingualAttr(emailInput, 'placeholder', COPY.emailPlaceholder);
    setBilingualAttr(emailInput, 'aria-label', COPY.email);
    field.append(emailInput);
    form.append(field);

    statusNode = element('p', 'auth-dialog__status', null, {
      id: 'forgotPasswordStatus', role: 'status', 'aria-live': 'polite'
    });
    form.append(statusNode);

    const actions = element('div', 'auth-dialog__actions');
    submitButton = element('button', 'auth-dialog__submit', COPY.submit, {
      id: 'forgotPasswordSubmit', type: 'submit'
    });
    const cancel = element('button', 'auth-dialog__secondary', COPY.cancel, {
      id: 'forgotPasswordCancel', type: 'button'
    });
    actions.append(submitButton, cancel);
    form.append(actions);
    panel.append(form);
    dialog.append(panel);
    document.body.append(dialog);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const email = emailInput.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        status(COPY.invalid_email, 'error');
        emailInput.focus();
        return;
      }
      submitButton.disabled = true;
      status(COPY.sending, 'info');
      try {
        const base = window.MZACTIVE_API_BASE || '';
        const response = await fetch(`${base}/api/auth/forgot-password`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email }),
          cache: 'no-store'
        });
        if (response.ok) {
          dialog.dataset.result = 'confirmation';
          form.hidden = true;
          status(COPY.confirmation, 'success');
          setBilingual(close, COPY.close);
          setBilingualAttr(close, 'aria-label', COPY.close);
          close.focus();
          return;
        }
        let code = '';
        try { code = (await response.json())?.error || ''; } catch { /* keep generic fallback */ }
        status(errorCopy(code), 'error');
      } catch {
        status(COPY.network, 'error');
      } finally {
        submitButton.disabled = false;
      }
    });

    cancel.addEventListener('click', () => dialog.close());
    close.addEventListener('click', () => dialog.close());
    // Native <dialog> handles Escape through the cancel/close events. A click
    // whose target is the dialog itself landed on the backdrop.
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      resetDialog();
      lastTrigger?.focus();
      lastTrigger = null;
    });
  }

  function open(trigger) {
    if (!dialog) buildDialog();
    lastTrigger = trigger || null;
    resetDialog();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    localize();
    emailInput.focus();
  }

  const LOGIN_SELECTORS = ['#login', '#loginForm', '#providerLogin', 'form[id*="login" i]'];
  function loginForms() {
    const forms = [];
    for (const selector of LOGIN_SELECTORS) {
      for (const node of document.querySelectorAll(selector)) {
        if (node.tagName === 'FORM' && !forms.includes(node)) forms.push(node);
      }
    }
    return forms;
  }

  function ensureTriggers() {
    for (const loginForm of loginForms()) {
      let trigger = loginForm.querySelector('[data-forgot-password]');
      if (!trigger) {
        trigger = element('button', 'link-button auth-forgot-trigger', COPY.trigger, {
          id: `forgotPassword_${loginForm.id || 'login'}`,
          type: 'button'
        });
        loginForm.append(trigger);
      } else {
        // Older pages used "Forgot your password?"; normalise to the shared label.
        setBilingual(trigger, COPY.trigger);
        trigger.classList.add('auth-forgot-trigger');
      }
      trigger.dataset.forgotPassword = '';
      if (!trigger.dataset.authBound) {
        trigger.dataset.authBound = '1';
        trigger.addEventListener('click', () => open(trigger));
      }
    }
  }

  // Shared local password-visibility affordance for pages that do not already
  // bind one (admin.js binds its own toggles and marks them data-bound).
  function bindPasswordToggles() {
    for (const button of document.querySelectorAll('[data-password-toggle]:not([data-bound])')) {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) continue;
      button.dataset.bound = 'auth-ui';
      button.addEventListener('click', () => {
        const isText = input.type === 'text';
        input.type = isText ? 'password' : 'text';
        setBilingual(button, isText ? COPY.show : COPY.hide);
        setBilingualAttr(button, 'aria-label', isText ? COPY.show : COPY.hide);
      });
    }
  }

  const init = () => {
    ensureTriggers();
    bindPasswordToggles();
    localize();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.MZActiveAuthUI = Object.freeze({ open, localize });
})();

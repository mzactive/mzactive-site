/* One install experience for the MZA web app. It never claims an install that
 * did not happen: Chromium browsers get the native beforeinstallprompt only
 * when the browser fires it; iOS Safari gets exact manual steps; other browsers
 * get accurate guidance. Installed/standalone sessions hide install controls. */
(() => {
  // The homepage keeps its critical CSS fully inline, so the install styles are
  // attached from this single module instead of adding a blocking stylesheet.
  const script = document.currentScript;
  const cssHref = script
    ? new URL('../css/pwa-install.css?v=20261120f', script.src).href
    : '/assets/css/pwa-install.css?v=20261120f';
  const injectStyles = () => {
    if (document.querySelector('link[data-mza-install-styles]') || !document.head) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    link.dataset.mzaInstallStyles = '';
    document.head.append(link);
  };

  const pair = (en, ar) => ({ en, ar });
  const COPY = {
    download: pair('Download MZA App', 'تنزيل تطبيق MZA'),
    title: pair('Install MZA on your device', 'ثبّت MZA على جهازك'),
    close: pair('Close', 'إغلاق'),
    gotIt: pair('Got it', 'حسناً'),
    ios: pair(
      'On iPhone, tap the Share button in Safari, then choose “Add to Home Screen”. MZA will open like an app.',
      'على iPhone، اضغط زر المشاركة في Safari ثم اختر «إضافة إلى الشاشة الرئيسية». سيفتح MZA كتطبيق.'
    ),
    android: pair(
      'In Chrome, tap the three-dot menu, then choose “Install app” or “Add to Home Screen”.',
      'في Chrome، اضغط قائمة النقاط الثلاث ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».'
    ),
    social: pair(
      'This in-app browser cannot install MZA. Open this page in Safari on iPhone or Chrome on Android, then use the browser menu to add it to your home screen.',
      'لا يمكن لهذا المتصفح داخل التطبيق تثبيت MZA. افتح هذه الصفحة في Safari على iPhone أو Chrome على Android، ثم استخدم قائمة المتصفح للإضافة إلى الشاشة الرئيسية.'
    ),
    unsupported: pair(
      'Use Safari on iPhone or Chrome on Android to add MZA to your home screen.',
      'استخدم Safari على iPhone أو Chrome على Android لإضافة MZA إلى الشاشة الرئيسية.'
    ),
  };

  const lang = () => (window.MZActiveLanguage?.get?.() === 'ar'
    ? 'ar'
    : (/^ar(?:-|$)/i.test(document.documentElement.lang || '') ? 'ar' : 'en'));
  const t = value => value[lang() === 'ar' ? 'ar' : 'en'];
  const setPair = (node, value) => {
    node.dataset.en = value.en;
    node.dataset.ar = value.ar;
    node.textContent = t(value);
    return node;
  };
  const setAttrPair = (node, attr, value) => {
    const suffix = attr === 'aria-label'
      ? 'AriaLabel'
      : attr.charAt(0).toUpperCase() + attr.slice(1);
    node.dataset[`en${suffix}`] = value.en;
    node.dataset[`ar${suffix}`] = value.ar;
    node.setAttribute(attr, t(value));
    return node;
  };

  const ua = navigator.userAgent || '';
  const SOCIAL_BROWSER = /(FBAN|FBAV|Instagram|LinkedInApp|Twitter|TwitterAndroid|TikTok|Snapchat|Line\/|WeChat|MicroMessenger|Telegram|Discord|Pinterest|Reddit)/i;
  const IOS_DEVICE = /iP(hone|od|ad)/i;
  const SAFARI = /Safari/i;
  const IOS_THIRD_PARTY = /(CriOS|FxiOS|EdgiOS|OPiOS|Mercury|AppleWebView)/i;
  const ANDROID = /Android/i;
  const CHROMIUM = /(Chrome|CriOS)/i;

  let deferredPrompt = null;
  let relatedAppsInstalled = false;
  let dialog = null;
  let dialogMessage = null;
  let lastTrigger = null;

  function platformMode() {
    if (SOCIAL_BROWSER.test(ua)) return 'social';
    if (IOS_DEVICE.test(ua) && SAFARI.test(ua) && !IOS_THIRD_PARTY.test(ua)) return 'ios';
    if (ANDROID.test(ua) && CHROMIUM.test(ua)) return 'android';
    return 'unsupported';
  }

  const currentMode = () => (deferredPrompt ? 'native' : platformMode());

  function standaloneNow() {
    try {
      return Boolean((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches)
        || navigator.standalone === true);
    } catch {
      return navigator.standalone === true;
    }
  }

  function applyState() {
    const installed = standaloneNow() || relatedAppsInstalled;
    const mode = currentMode();
    const root = document.documentElement;
    root.dataset.mzaLaunch = installed ? 'standalone' : 'browser';
    root.dataset.mzaInstallMode = mode;
    root.classList.toggle('mza-is-installed', installed);
    for (const button of document.querySelectorAll('[data-mza-install-button]')) {
      button.dataset.installMode = mode;
      button.hidden = installed;
      setPair(button, COPY.download);
      setAttrPair(button, 'aria-label', COPY.download);
    }
    for (const region of document.querySelectorAll('.footer-install')) region.hidden = installed;
  }

  function buildDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'mza-install-dialog';
    dialog.id = 'mzaInstallDialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'mzaInstallTitle');
    dialog.setAttribute('aria-describedby', 'mzaInstallMessage');

    const panel = document.createElement('div');
    panel.className = 'mza-install-dialog__panel';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'mza-install-dialog__close';
    close.id = 'mzaInstallClose';
    setPair(close, pair('×', '×'));
    setAttrPair(close, 'aria-label', COPY.close);
    close.addEventListener('click', () => dialog.close());

    const title = document.createElement('h2');
    title.id = 'mzaInstallTitle';
    title.className = 'mza-install-dialog__title';
    setPair(title, COPY.title);
    dialogMessage = document.createElement('p');
    dialogMessage.id = 'mzaInstallMessage';
    dialogMessage.className = 'mza-install-dialog__message';

    const actions = document.createElement('div');
    actions.className = 'mza-install-dialog__actions';
    const gotIt = document.createElement('button');
    gotIt.type = 'button';
    gotIt.className = 'mza-install-dialog__confirm';
    setPair(gotIt, COPY.gotIt);
    gotIt.addEventListener('click', () => dialog.close());
    actions.append(gotIt);

    panel.append(close, title, dialogMessage, actions);
    dialog.append(panel);
    document.body.append(dialog);

    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      lastTrigger?.focus();
      lastTrigger = null;
    });
  }

  function openInstructions(trigger, mode) {
    if (!dialog) buildDialog();
    lastTrigger = trigger || null;
    setPair(dialogMessage, COPY[mode] || COPY.unsupported);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.getElementById('mzaInstallClose')?.focus();
  }

  async function activate(event) {
    const trigger = event.currentTarget;
    if (deferredPrompt) {
      const promptEvent = deferredPrompt;
      try {
        promptEvent.prompt?.();
        const choice = await Promise.resolve(promptEvent.userChoice || {});
        deferredPrompt = null;
        if (choice.outcome === 'accepted') relatedAppsInstalled = true;
        applyState();
      } catch {
        deferredPrompt = null;
        openInstructions(trigger, platformMode());
      }
      return;
    }
    openInstructions(trigger, trigger.dataset.installMode || platformMode());
  }

  function newButton(className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.mzaInstallButton = '';
    button.disabled = true;
    setPair(button, COPY.download);
    setAttrPair(button, 'aria-label', COPY.download);
    return button;
  }

  function bind(button) {
    if (button.dataset.installBound) return;
    button.dataset.installBound = '1';
    button.disabled = false;
    button.addEventListener('click', activate);
  }

  function ensureButtons() {
    const hero = document.querySelector('.hero-actions');
    if (hero && !hero.querySelector('[data-mza-install-button]')) {
      hero.append(newButton('button button-primary mza-install-button'));
    }
    for (const region of document.querySelectorAll('.footer-install')) {
      const host = region.querySelector('div') || region;
      if (!host.querySelector('[data-mza-install-button]')) {
        host.append(newButton('mza-install-button footer-install-button'));
      }
    }
    for (const button of document.querySelectorAll('[data-mza-install-button]')) bind(button);
  }

  const localize = () => {
    for (const button of document.querySelectorAll('[data-mza-install-button]')) {
      setPair(button, COPY.download);
      setAttrPair(button, 'aria-label', COPY.download);
    }
    if (dialog) {
      for (const node of dialog.querySelectorAll('[data-en][data-ar]')) {
        node.textContent = node.dataset[lang()];
      }
      for (const node of dialog.querySelectorAll('[data-en-aria-label]')) {
        node.setAttribute('aria-label', node.dataset[`${lang()}AriaLabel`]);
      }
      if (dialogMessage && dialogMessage.dataset.en) {
        const mode = Object.keys(COPY).find(key => COPY[key] && COPY[key].en === dialogMessage.dataset.en);
        if (mode) setPair(dialogMessage, COPY[mode]);
      }
    }
  };

  function init() {
    injectStyles();
    ensureButtons();
    applyState();
    localize();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    applyState();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    relatedAppsInstalled = true;
    applyState();
  });
  if (typeof navigator.getInstalledRelatedApps === 'function') {
    navigator.getInstalledRelatedApps().then(apps => {
      if (apps && apps.length) {
        relatedAppsInstalled = true;
        applyState();
      }
    }).catch(() => {});
  }
  window.addEventListener('mzactive:language-change', localize);
  document.addEventListener('mzactive:language-change', localize);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.MZActiveInstallUI = Object.freeze({ getMode: currentMode, refresh: applyState });
})();

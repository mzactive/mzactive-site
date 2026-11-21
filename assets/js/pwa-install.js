/* Unified MZA website-app install experience.
 * MZA is installed from the website: Chromium browsers receive the native
 * prompt only when the browser offers it; iPhone Safari gets exact manual
 * steps; in-app browsers get a safe open-in-browser path. Nothing opens on
 * page load, dismissal is remembered, and no store listing is implied. */
(() => {
  // The homepage keeps its critical CSS inline, so the install styles are
  // attached from this single module instead of adding a blocking stylesheet.
  const script = document.currentScript;
  const cssHref = script
    ? new URL('../css/pwa-install.css?v=20261122a', script.src).href
    : '/assets/css/pwa-install.css?v=20261122a';
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
    install: pair('Install app', 'تثبيت التطبيق'),
    header: pair('Get app', 'التطبيق'),
    getApp: pair('Get MZA App', 'احصل على تطبيق MZA'),
    dismiss: pair('Dismiss app promotion', 'إخفاء عرض التطبيق'),
    title: pair('Get the MZA App', 'احصل على تطبيق MZA'),
    websiteNote: pair(
      'This is a website app installed from MZA. There is no official App Store or Google Play app to download.',
      'هذا تطبيق ويب يُثبَّت من موقع MZA. لا يوجد تطبيق رسمي للتنزيل من متجر التطبيقات.'
    ),
    close: pair('Close', 'إغلاق'),
    gotIt: pair('Got it', 'حسناً'),
    ios: pair(
      'Open this page in Safari on iPhone. Tap the Share button, scroll down, then choose “Add to Home Screen”. MZA will open like an app.',
      'افتح هذه الصفحة في Safari على iPhone. اضغط زر المشاركة، ثم مرّر للأسفل واختر «إضافة إلى الشاشة الرئيسية». سيفتح MZA كتطبيق.'
    ),
    iosBrowser: pair(
      'This browser cannot add MZA to the home screen. Open the page in Safari, tap Share, then choose “Add to Home Screen”.',
      'لا يمكن لهذا المتصفح إضافة MZA إلى الشاشة الرئيسية. افتح الصفحة في Safari، واضغط المشاركة، ثم اختر «إضافة إلى الشاشة الرئيسية».'
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
    openBrowser: pair('Open in browser', 'فتح في المتصفح'),
    copyLink: pair('Copy link', 'نسخ الرابط'),
    linkCopied: pair('Link copied', 'تم نسخ الرابط'),
    copyFailed: pair('Copy failed — long-press the link', 'تعذّر النسخ — اضغط مطوّلاً على الرابط'),
  };
  const KEYS = {
    dismissed: 'mza-install-promo-dismissed',
    installed: 'mza-install-installed',
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
  // Includes Instagram, Facebook, WhatsApp, Messenger and the common mail/social
  // in-app browsers visitors use to reach MZA links.
  const SOCIAL_BROWSER = /(FBAN|FBAV|Instagram|LinkedInApp|Twitter|TwitterAndroid|TikTok|Snapchat|Line\/|WeChat|MicroMessenger|Telegram|Discord|Pinterest|Reddit|WhatsApp|Viber|Slack|Gmail|Outlook|AppleWebView)/i;
  const IOS_DEVICE = /iP(hone|od|ad)/i;
  const IPAD_DESKTOP = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  const IOS = IOS_DEVICE.test(ua) || IPAD_DESKTOP;
  const SAFARI = /Safari/i;
  const IOS_THIRD_PARTY = /(CriOS|FxiOS|EdgiOS|OPiOS|Mercury)/i;
  const ANDROID = /Android/i.test(ua);
  const CHROMIUM = /(Chrome|CriOS)/i.test(ua);

  let deferredPrompt = null;
  let relatedAppsInstalled = false;
  let prompting = false;
  let dismissedHere = false;
  let installedHere = false;
  let dialog = null;
  let dialogMessage = null;
  let dialogOpenLink = null;
  let dialogCopyLink = null;
  let lastTrigger = null;

  function flag(key) {
    try {
      return localStorage.getItem(key) === '1' || sessionStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  function remember(key) {
    try { localStorage.setItem(key, '1'); } catch { /* private mode */ }
    try { sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
  }

  function standaloneNow() {
    try {
      return Boolean((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches)
        || navigator.standalone === true);
    } catch {
      return navigator.standalone === true;
    }
  }

  const promoDismissed = () => dismissedHere || flag(KEYS.dismissed);
  const installedNow = () => standaloneNow() || relatedAppsInstalled || installedHere || flag(KEYS.installed);

  function markDismissed() {
    dismissedHere = true;
    remember(KEYS.dismissed);
  }

  function markInstalled() {
    installedHere = true;
    remember(KEYS.installed);
  }

  function platformMode() {
    if (SOCIAL_BROWSER.test(ua)) return 'social';
    if (IOS && SAFARI.test(ua) && !IOS_THIRD_PARTY.test(ua)) return 'ios';
    if (IOS) return 'ios-browser';
    if (ANDROID && CHROMIUM) return 'android';
    return 'unsupported';
  }

  // In-app browsers keep their accurate guidance even if they emit a prompt.
  const currentMode = () => (SOCIAL_BROWSER.test(ua) ? 'social'
    : (deferredPrompt ? 'native' : platformMode()));

  const buttonCopy = button => {
    switch (button.dataset.mzaInstallLabel) {
      case 'install': return COPY.install;
      case 'header': return COPY.header;
      default: return COPY.getApp;
    }
  };

  function injectHeaderControl() {
    const actions = document.querySelector('.header-actions');
    if (!actions || document.querySelector('[data-mza-install-button].mza-header-install')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mza-install-button mza-header-install';
    button.dataset.mzaInstallButton = '';
    button.dataset.mzaInstallLabel = 'header';
    actions.insertBefore(button, actions.querySelector('.menu-toggle') || null);
  }

  function applyState() {
    const installed = installedNow();
    const dismissed = promoDismissed();
    const mode = currentMode();
    const root = document.documentElement;
    root.dataset.mzaLaunch = installed ? 'standalone' : 'browser';
    root.dataset.mzaInstallMode = mode;
    root.classList.toggle('mza-is-installed', installed);
    for (const button of document.querySelectorAll('[data-mza-install-button]')) {
      button.dataset.installMode = mode;
      button.hidden = installed || (dismissed && !button.hasAttribute('data-mza-install-link'));
      setPair(button, buttonCopy(button));
      setAttrPair(button, 'aria-label', buttonCopy(button));
    }
    // The card and the permanent link are mutually exclusive. Both disappear
    // once MZA is installed or running in standalone mode.
    for (const promo of document.querySelectorAll('[data-mza-install-promo]')) promo.hidden = installed || dismissed;
    for (const link of document.querySelectorAll('[data-mza-install-link]')) link.hidden = installed || !dismissed;
  }

  function closeDialog(dismiss) {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    }
    if (dismiss) {
      markDismissed();
      applyState();
    }
  }

  function browserUrl() {
    try {
      const url = new URL(window.location.href);
      if (!/^https?:$/.test(url.protocol)) return null;
      if (IOS) {
        return url.href.replace(/^http:/, 'x-safari-http:').replace(/^https:/, 'x-safari-https:');
      }
      if (ANDROID) {
        const scheme = url.protocol.slice(0, -1);
        const path = `${url.host}${url.pathname}${url.search}${url.hash}`;
        return `intent://${path}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
      }
      return null;
    } catch {
      return null;
    }
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
    close.textContent = '×';
    setAttrPair(close, 'aria-label', COPY.close);
    close.addEventListener('click', () => closeDialog(false));

    const title = document.createElement('h2');
    title.id = 'mzaInstallTitle';
    title.className = 'mza-install-dialog__title';
    setPair(title, COPY.title);

    const note = document.createElement('p');
    note.className = 'mza-install-dialog__note';
    setPair(note, COPY.websiteNote);

    dialogMessage = document.createElement('p');
    dialogMessage.id = 'mzaInstallMessage';
    dialogMessage.className = 'mza-install-dialog__message';

    const actions = document.createElement('div');
    actions.className = 'mza-install-dialog__actions';

    dialogOpenLink = document.createElement('a');
    dialogOpenLink.className = 'mza-install-dialog__open';
    dialogOpenLink.id = 'mzaInstallOpen';
    dialogOpenLink.rel = 'noopener noreferrer';
    setPair(dialogOpenLink, COPY.openBrowser);

    dialogCopyLink = document.createElement('button');
    dialogCopyLink.type = 'button';
    dialogCopyLink.className = 'mza-install-dialog__copy';
    dialogCopyLink.id = 'mzaInstallCopy';
    setPair(dialogCopyLink, COPY.copyLink);
    dialogCopyLink.addEventListener('click', async () => {
      let copied = false;
      try {
        await navigator.clipboard.writeText(window.location.href);
        copied = true;
      } catch {
        try {
          const field = document.createElement('textarea');
          field.value = window.location.href;
          field.setAttribute('readonly', '');
          field.style.position = 'fixed';
          field.style.opacity = '0';
          document.body.append(field);
          field.select();
          copied = document.execCommand('copy');
          field.remove();
        } catch { copied = false; }
      }
      setPair(dialogCopyLink, copied ? COPY.linkCopied : COPY.copyFailed);
    });

    const gotIt = document.createElement('button');
    gotIt.type = 'button';
    gotIt.className = 'mza-install-dialog__confirm';
    gotIt.id = 'mzaInstallGotIt';
    setPair(gotIt, COPY.gotIt);
    gotIt.addEventListener('click', () => closeDialog(true));

    actions.append(dialogOpenLink, dialogCopyLink, gotIt);
    panel.append(close, title, note, dialogMessage, actions);
    dialog.append(panel);
    document.body.append(dialog);

    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeDialog(false);
    });
    dialog.addEventListener('close', () => {
      lastTrigger?.focus();
      lastTrigger = null;
    });
  }

  function openInstructions(trigger, mode) {
    if (!dialog) buildDialog();
    lastTrigger = trigger || null;
    const key = COPY[mode] ? mode : 'unsupported';
    dialogMessage.dataset.mzaInstallMode = key;
    setPair(dialogMessage, COPY[key]);
    const needsBrowserHandoff = key === 'social' || key === 'ios-browser';
    const openUrl = needsBrowserHandoff ? browserUrl() : null;
    dialogOpenLink.hidden = !openUrl;
    if (openUrl) dialogOpenLink.href = openUrl;
    dialogCopyLink.hidden = !openUrl;
    setPair(dialogCopyLink, COPY.copyLink);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.getElementById('mzaInstallClose')?.focus();
  }

  async function activate(event) {
    const trigger = event.currentTarget;
    if (prompting) return;
    const mode = currentMode();
    if (mode === 'native' && deferredPrompt) {
      prompting = true;
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      try {
        promptEvent.prompt?.();
        const choice = await Promise.resolve(promptEvent.userChoice || {});
        if (choice.outcome === 'accepted') markInstalled();
      } catch {
        openInstructions(trigger, platformMode());
      } finally {
        prompting = false;
        applyState();
      }
      return;
    }
    openInstructions(trigger, mode);
  }

  function bindControls() {
    for (const button of document.querySelectorAll('[data-mza-install-button]')) {
      if (button.dataset.installBound) continue;
      button.dataset.installBound = '1';
      button.disabled = false;
      button.addEventListener('click', activate);
    }
    for (const button of document.querySelectorAll('[data-mza-install-dismiss]')) {
      if (button.dataset.installDismissBound) continue;
      button.dataset.installDismissBound = '1';
      setAttrPair(button, 'aria-label', COPY.dismiss);
      button.addEventListener('click', () => {
        markDismissed();
        applyState();
        document.querySelector('[data-mza-install-link]')?.focus();
      });
    }
  }

  const localize = () => {
    for (const button of document.querySelectorAll('[data-mza-install-button]')) {
      setPair(button, buttonCopy(button));
      setAttrPair(button, 'aria-label', buttonCopy(button));
    }
    for (const button of document.querySelectorAll('[data-mza-install-dismiss]')) {
      setAttrPair(button, 'aria-label', COPY.dismiss);
    }
    if (dialog) {
      for (const node of dialog.querySelectorAll('[data-en][data-ar]')) {
        if (node === dialogMessage && dialogMessage.dataset.mzaInstallMode) continue;
        node.textContent = node.dataset[lang()];
      }
      for (const node of dialog.querySelectorAll('[data-en-aria-label]')) {
        node.setAttribute('aria-label', node.dataset[`${lang()}AriaLabel`]);
      }
      const mode = dialogMessage?.dataset.mzaInstallMode;
      if (mode && COPY[mode]) setPair(dialogMessage, COPY[mode]);
      if (dialogOpenLink && !dialogOpenLink.hidden) setPair(dialogOpenLink, COPY.openBrowser);
      if (dialogCopyLink && !dialogCopyLink.hidden && dialogCopyLink.dataset.mzaCopyState !== 'done') {
        setPair(dialogCopyLink, COPY.copyLink);
      }
    }
  };

  function init() {
    injectStyles();
    injectHeaderControl();
    bindControls();
    applyState();
    localize();
  }

  window.addEventListener('beforeinstallprompt', event => {
    // Store the browser event; never prompt without the visitor's click.
    event.preventDefault();
    deferredPrompt = event;
    applyState();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    markInstalled();
    applyState();
  });
  if (typeof navigator.getInstalledRelatedApps === 'function') {
    navigator.getInstalledRelatedApps().then(apps => {
      if (apps && apps.length) {
        markInstalled();
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

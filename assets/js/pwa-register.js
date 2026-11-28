(() => {
  if (!('serviceWorker' in navigator)) return;

  const UPDATE_MESSAGE = 'MZA_SKIP_WAITING';
  const CHECK_INTERVAL = 15 * 60 * 1000;
  let registration = null;
  let waitingWorker = null;
  let banner = null;
  let dismissed = false;
  let updateRequested = false;
  let reloading = false;

  // coaching-studio.js already saves its sessionStorage draft on form input/change.
  // Dispatch those events and flush the pending debounced write before an update or unload.
  function preserveStudioDraft() {
    const form = document.getElementById('whatsappTrainingForm');
    if (!form) return;
    const nativeSetTimeout = window.setTimeout;
    let flush;
    window.setTimeout = function (callback, delay, ...args) {
      if (typeof callback === 'function' && delay === 350 && String(callback).includes('sessionStorage.setItem')) {
        flush = () => callback(...args);
      }
      return nativeSetTimeout.call(window, callback, delay, ...args);
    };
    try {
      form.dispatchEvent(new Event('input', { bubbles: true }));
    } finally {
      window.setTimeout = nativeSetTimeout;
    }
    if (flush) flush();
  }

  const label = (node, en, ar) => {
    node.textContent = en;
    node.setAttribute('data-en', en);
    node.setAttribute('data-ar', ar);
  };

  function hideBanner() {
    if (banner) banner.hidden = true;
  }

  function reloadAfterUpdate() {
    if (reloading) return;
    reloading = true;
    preserveStudioDraft();
    window.location.reload();
  }

  function applyUpdate() {
    if (!waitingWorker) {
      reloadAfterUpdate();
      return;
    }
    updateRequested = true;
    preserveStudioDraft();
    hideBanner();
    // controllerchange performs the reload once the new worker takes control.
    waitingWorker.postMessage({ type: UPDATE_MESSAGE });
  }

  function showBanner(worker) {
    // First installs have nothing to replace and must not prompt for a reload.
    if (banner || dismissed || !navigator.serviceWorker.controller || !document.body) return;
    waitingWorker = worker || (registration && registration.waiting);
    banner = document.createElement('aside');
    banner.className = 'mza-update-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    const message = document.createElement('p');
    message.className = 'mza-update-message';
    label(message, 'A new version of MZ Active is available.', 'يتوفر إصدار جديد من MZ Active.');
    const actions = document.createElement('div');
    actions.className = 'mza-update-actions';
    const update = document.createElement('button');
    update.type = 'button';
    update.className = 'mza-update-confirm';
    label(update, 'Update & reload', 'تحديث وإعادة تحميل');
    update.addEventListener('click', applyUpdate);
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'mza-update-later';
    label(later, 'Later', 'لاحقاً');
    later.addEventListener('click', () => { dismissed = true; hideBanner(); });
    actions.append(update, later);
    banner.append(message, actions);
    document.body.append(banner);
  }

  function checkForUpdate() {
    if (registration && document.visibilityState !== 'hidden') registration.update().catch(() => {});
  }

  function watchRegistration(reg) {
    registration = reg;
    if (reg.waiting) showBanner(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          showBanner(reg.waiting || installing);
        }
      });
    });
    checkForUpdate();
    window.setInterval(checkForUpdate, CHECK_INTERVAL);
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only a user-approved update may reload; normal activation must never do it.
    if (!updateRequested) return;
    reloadAfterUpdate();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') preserveStudioDraft();
    else checkForUpdate();
  });
  window.addEventListener('pagehide', preserveStudioDraft);

  const register = () => {
    // The release query bypasses old CDN entries. Update checks also bypass
    // the browser's HTTP cache for the worker and any imported scripts.
    navigator.serviceWorker.register('/sw.js?v=20261128a', { scope: '/', updateViaCache: 'none' }).then(watchRegistration).catch(() => {
      // The site remains fully usable if the app shell is unavailable.
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
})();

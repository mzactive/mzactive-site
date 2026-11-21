/* Shared account menu. Management actions come only from /api/me/access, so
 * ordinary accounts never receive management links and no query parameter can
 * grant access to them. */
(() => {
  const KEY = 'mzactive-provider-session';
  const API = window.MZACTIVE_API_BASE;
  const COPY = {
    account: ['Account', 'الحساب'],
    dashboard: ['Management Dashboard', 'لوحة الإدارة'],
    ai: ['MZ AI Brain', 'دماغ MZ الذكي'],
    settings: ['Account Settings', 'إعدادات الحساب'],
    signOut: ['Sign Out', 'تسجيل الخروج'],
  };
  const ICONS = {
    account: '<circle cx="12" cy="8" r="3.2"></circle><path d="M5.5 19c.8-3.3 3.3-5.2 6.5-5.2s5.7 1.9 6.5 5.2"></path>',
    dashboard: '<path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z"></path>',
    ai: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"></path><circle cx="12" cy="12" r="4"></circle>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.4 7 7.2 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10.2 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path>',
    signOut: '<path d="M9 5H5v14h4M14 8l4 4-4 4M18 12H9"></path>',
  };
  const lang = () => (window.MZActiveLanguage?.get() === 'ar' ? 1 : 0);
  const text = (key) => COPY[key][lang()];
  const token = () => sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || '';
  const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  function item(href, label, icon, external = false) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = href;
    if (external) link.target = '_blank';
    link.innerHTML = svg(icon) + '<span></span>';
    link.querySelector('span').textContent = label;
    li.append(link);
    return li;
  }

  function action(label, icon, onClick) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = svg(icon) + '<span></span>';
    button.querySelector('span').textContent = label;
    button.addEventListener('click', onClick);
    li.append(button);
    return li;
  }

  async function signOut() {
    const current = token();
    try {
      if (current && API) {
        await fetch(API + '/api/auth/logout', {
          method: 'POST',
          headers: { authorization: `Bearer ${current}`, 'content-type': 'application/json' },
          body: '{}',
          cache: 'no-store',
        });
      }
    } catch { /* Always clear the local session, even when offline. */ }
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    location.assign('/index.html');
  }

  async function getAccess() {
    if (!API || !token()) return null;
    try {
      const response = await fetch(API + '/api/me/access', {
        headers: { authorization: `Bearer ${token()}` },
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const access = await response.json();
      return access?.user ? access : null;
    } catch {
      return null;
    }
  }

  function close(menu, button) {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  let renderSequence = 0;

  async function render() {
    const host = document.querySelector('[data-account-menu]');
    if (!host) return;
    const sequence = ++renderSequence;
    host._mzaAccountMenu?.cleanup();
    host.replaceChildren();
    host.hidden = true;
    const access = await getAccess();
    if (sequence !== renderSequence || !access) return;

    const menu = document.createElement('div');
    menu.className = 'account-menu';
    const button = document.createElement('button');
    button.className = 'account-menu-button';
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = svg('account') + '<span></span>';
    button.querySelector('span').textContent = text('account');

    const list = document.createElement('ul');
    list.className = 'account-menu-list';
    list.setAttribute('role', 'menu');
    list.hidden = true;
    const permissions = Array.isArray(access.management?.permissions) ? access.management.permissions : [];
    if (access.management?.enabled && permissions.includes('management.view')) {
      list.append(item('/admin.html', text('dashboard'), 'dashboard'));
    }
    if (access.management?.enabled && permissions.includes('management.ai')) {
      list.append(item('/admin.html?tab=ai', text('ai'), 'ai'));
    }
    list.append(item('/account.html', text('settings'), 'settings'));
    list.append(action(text('signOut'), 'signOut', signOut));

    button.addEventListener('click', () => {
      list.hidden = !list.hidden;
      button.setAttribute('aria-expanded', String(!list.hidden));
    });
    const outside = (event) => {
      if (!menu.contains(event.target)) close(list, button);
    };
    const escape = (event) => {
      if (event.key === 'Escape') close(list, button);
    };
    document.addEventListener('click', outside);
    document.addEventListener('keydown', escape);

    menu.append(button, list);
    host.append(menu);
    host.hidden = false;
    // Keep the menu current when the language choice is changed after sign-in.
    host._mzaAccountMenu = {
      menu, list, button,
      cleanup() {
        document.removeEventListener('click', outside);
        document.removeEventListener('keydown', escape);
      },
    };
  }

  function refresh() { return render(); }
  window.MZActiveAccountMenu = { refresh };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
  document.addEventListener('mzactive:language-change', refresh);
})();

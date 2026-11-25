(() => {
  'use strict';
  const API = window.MZACTIVE_API_BASE;
  const $ = id => document.getElementById(id);
  const key = 'mzactive-provider-session';
  const token = () => sessionStorage.getItem(key) || localStorage.getItem(key) || '';
  const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const t = (en, ar) => lang() === 'ar' ? ar : en;

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token()) headers.authorization = `Bearer ${token()}`;
    const response = await fetch(API + path, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch { /* empty or non-JSON response */ }
    if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: response.status });
    return data;
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function menu(title, items, key) {
    const details = make('details', 'coach-menu');
    if (key) details.dataset.menu = key;
    const summary = make('summary', '', title);
    details.append(summary);
    const panel = make('div', 'coach-menu-panel');
    for (const item of items) {
      if (item.href) {
        const link = make('a', 'coach-menu-item', item.label);
        link.href = item.href;
        if (item.target) link.target = item.target;
        if (item.rel) link.rel = item.rel;
        panel.append(link);
      } else {
        const button = make('button', 'coach-menu-item', item.label);
        button.type = 'button';
        if (item.nav) button.dataset.nav = item.nav;
        if (item.profile) button.dataset.profile = item.profile;
        button.addEventListener('click', () => {
          details.removeAttribute('open');
          item.action?.();
        });
        panel.append(button);
      }
    }
    details.append(panel);
    return details;
  }

  function openSheet(title, items) {
    const sheet = $('coachActionSheet');
    if (!sheet) return;
    const itemsHost = $('coachSheetItems');
    itemsHost.replaceChildren();
    for (const item of items) {
      const button = make('button', 'coach-sheet-item', item.label);
      button.type = 'button';
      button.addEventListener('click', () => {
        sheet.hidden = true;
        item.action?.();
      });
      itemsHost.append(button);
    }
    sheet.hidden = false;
  }

  function focus(section) {
    window.MZActiveCoachDashboard?.focusSection?.(section);
  }

  async function loadProfile() {
    try {
      const result = await api('/api/me/profile');
      const profile = result.profile;
      if (!profile) return;
      const avatar = $('coachNavAvatar');
      if (avatar) avatar.textContent = String(profile.display_name || 'MZ').trim().charAt(0).toUpperCase();
      const publicLink = $('coachNavPublicProfile');
      if (publicLink) publicLink.href = `coach.html?id=${encodeURIComponent(profile.id)}`;
    } catch { /* the navigation remains usable without profile details */ }
    try {
      const access = await api('/api/me/access');
      const panel = document.querySelector('#coachTopNav details[data-menu="profile"] .coach-menu-panel');
      if (!panel) return;
      const logout = [...panel.querySelectorAll('button')].find(b => b.textContent.includes('Log Out') || b.textContent.includes('تسجيل الخروج'));
      if (access?.management?.enabled && access.management.permissions.includes('management.view')) {
        const link = document.createElement('a');
        link.className = 'coach-menu-item';
        link.href = '/admin.html';
        link.textContent = t('Management Dashboard', 'لوحة الإدارة');
        panel.insertBefore(link, logout || null);
      }
      if (access?.management?.enabled && access.management.permissions.includes('management.ai')) {
        const link = document.createElement('a');
        link.className = 'coach-menu-item';
        link.href = '/admin.html?tab=ai';
        link.textContent = t('MZ AI Brain', 'دماغ MZ الذكي');
        panel.insertBefore(link, logout || null);
      }
    } catch { /* access data is optional for navigation */ }
  }

  async function loadNotifications() {
    const bell = $('coachNotificationBell');
    const count = $('coachNotificationCount');
    if (!bell || !count) return;
    try {
      const result = await api('/api/dashboard/notifications');
      const unread = Number(result?.unread || 0);
      count.textContent = unread > 9 ? '9+' : String(unread);
      count.hidden = unread === 0;
    } catch { count.hidden = true; }
  }

  function openStudioTool(id) { focus('programs');const b=$(id);if(b&&!b.hidden)b.click(); }
  function buildTopNav() {
    const nav = $('coachTopNav');
    if (!nav || nav.dataset.mounted) return;
    nav.dataset.mounted = 'true';
    const menus = nav.querySelector('.coach-top-menus');
    // Replace the static placeholder menus with functional ones.
    menus.replaceChildren();
    menus.append(menu(t('Dashboard', 'لوحة التحكم'), [
      { label: t('Overview', 'نظرة عامة'), nav: 'overview', action: () => focus('overview') },
      { label: t('Activity Feed', 'خلاصة النشاط'), nav: 'posts', action: () => focus('posts') },
      { label: t('My Athletes', 'رياضيون'), nav: 'athletes', action: () => focus('athletes') },
      { label: t('Coaching Requests', 'طلبات التدريب'), nav: 'requests', action: () => focus('requests') },
      { label: t('Coaching Statistics', 'إحصاءات التدريب'), nav: 'statistics', action: () => focus('statistics') },
      { label: t('Community', 'المجتمع'), nav: 'messages', action: () => focus('messages') },
    ], 'dashboard'));
    menus.append(menu(t('Training', 'التدريب'), [
      { label: t('Training Calendar', 'تقويم التدريب'), nav: 'programs', action: () => focus('programs') },
      { label: t('Create Training Program', 'أنشئ برنامجاً تدريبياً'), nav: 'programs', action: () => focus('programs') },
      { label: t('Program History', 'سجل البرامج'), nav: 'history', action: () => focus('history') },
      { label: t('Saved Drafts', 'مسودات محفوظة'), nav: 'programs', action: () => focus('programs') },
      { label: t('Workout Library', 'مكتبة التمارين'), nav: 'programs', action: () => openStudioTool('studioExerciseLibrary') },
      { label: t('Program Templates', 'قوالب البرامج'), nav: 'programs', action: () => openStudioTool('programTemplates') },
    ], 'training'));
    const createWrap = make('div', 'coach-create-wrap');
    const createButton = make('button', 'coach-create-button', t('Create +', 'إنشاء +'));
    createButton.type = 'button';
    const createMenu = make('div', 'coach-create-menu');
    createMenu.hidden = true;
    for (const item of [
      { label: t('Create Post', 'أنشئ منشوراً'), action: () => { focus('posts'); document.getElementById('coachCommunityPostBody')?.focus(); } },
      { label: t('Write a Blog', 'اكتب مقالاً'), action: () => { focus('posts'); const details = document.getElementById('coachBlogDetails'); if (details) details.open = true; document.getElementById('coachBlogTitle')?.focus(); } },
      { label: t('Share Photo or Video', 'شارك صورة أو فيديو'), action: () => { focus('posts'); document.getElementById('coachCommunityPostPhotos')?.click(); } },
      { label: t('Create Training Program', 'أنشئ برنامجاً تدريبياً'), action: () => focus('programs') },
    ]) {
      const button = make('button', 'coach-menu-item', item.label);
      button.type = 'button';
      if (item.nav) button.dataset.nav = item.nav;
      button.addEventListener('click', () => { createMenu.hidden = true; item.action(); });
      createMenu.append(button);
    }
    createButton.addEventListener('click', event => { event.stopPropagation(); createMenu.hidden = !createMenu.hidden; });
    document.addEventListener('click', () => { createMenu.hidden = true; });
    createWrap.append(createButton, createMenu);
    menus.append(createWrap);

    const bell = make('button', 'coach-notification-bell', '🔔');
    bell.type = 'button';
    bell.id = 'coachNotificationBell';
    bell.setAttribute('aria-label', t('Notifications', 'الإشعارات'));
    const badge = make('span', 'coach-notification-count');
    badge.id = 'coachNotificationCount';
    badge.hidden = true;
    bell.append(badge);
    bell.addEventListener('click', () => window.MZActiveCoachInbox?.open?.());
    menus.append(bell);

    const profileMenu = menu(t('Profile', 'الملف'), [
      { label: t('My Profile', 'ملفي'), profile: 'profile', action: () => focus('profile') },
      { label: t('Edit Profile', 'تعديل الملف'), profile: 'edit', href: 'providers.html?edit=1#provider-portal' },
      { label: t('Change profile picture', 'تغيير الصورة الشخصية'), href: 'providers.html?edit=1#profilePhotoEditor' },
      { label: t('Manage profile photos', 'إدارة صور الملف'), href: 'providers.html?edit=1#galleryEditor' },
      { label: t('Settings', 'الإعدادات'), profile: 'settings', action: () => window.MZActiveCoachDashboard?.settingsDialog?.() },
      { label: t('View Public Profile', 'عرض الملف العام'), href: 'coach.html', target: '_blank', rel: 'noopener noreferrer' },
      { label: t('Log Out', 'تسجيل الخروج'), profile: 'logout', action: () => { localStorage.removeItem(key); sessionStorage.removeItem(key); location.assign('/index.html'); } },
    ]);
    const summary = profileMenu.querySelector('summary');
    const avatar = make('span', 'coach-nav-avatar', '');
    avatar.id = 'coachNavAvatar';
    summary.prepend(avatar);
    // profile menu key
    profileMenu.dataset.menu = 'profile';
    menus.append(profileMenu);

    nav.classList.remove('hidden');
    nav.hidden = false;
    loadProfile();
    loadNotifications();
  }

  function buildBottomNav() {
    const nav = $('coachBottomNav');
    if (!nav || nav.dataset.mounted) return;
    nav.dataset.mounted = 'true';
    const trainingItems = [
      { label: t('Training Calendar', 'تقويم التدريب'), action: () => focus('programs') },
      { label: t('Create Training Program', 'أنشئ برنامجاً تدريبياً'), action: () => focus('programs') },
      { label: t('Program History', 'سجل البرامج'), action: () => focus('history') },
      { label: t('Saved Drafts', 'مسودات محفوظة'), action: () => focus('programs') },
      { label: t('Workout Library', 'مكتبة التمارين'), action: () => openStudioTool('studioExerciseLibrary') },
      { label: t('Program Templates', 'قوالب البرامج'), action: () => openStudioTool('programTemplates') },
    ];
    const profileItems = [
      { label: t('My Profile', 'ملفي'), action: () => focus('profile') },
      { label: t('Edit Profile', 'تعديل الملف'), action: () => { location.assign('providers.html?edit=1#provider-portal'); } },
      { label: t('Change profile picture', 'تغيير الصورة الشخصية'), action: () => location.assign('providers.html?edit=1#profilePhotoEditor') },
      { label: t('Manage profile photos', 'إدارة صور الملف'), action: () => location.assign('providers.html?edit=1#galleryEditor') },
      { label: t('Settings', 'الإعدادات'), action: () => window.MZActiveCoachDashboard?.settingsDialog?.() },
      { label: t('View Public Profile', 'عرض الملف العام'), action: () => { const link = document.getElementById('coachNavPublicProfile'); if (link) window.open(link.href, '_blank', 'noopener'); } },
      { label: t('Create Post', 'أنشئ منشوراً'), action: () => { focus('posts'); document.getElementById('coachCommunityPostBody')?.focus(); } },
      { label: t('Write a Blog', 'اكتب مقالاً'), action: () => { focus('posts'); const details = document.getElementById('coachBlogDetails'); if (details) details.open = true; document.getElementById('coachBlogTitle')?.focus(); } },
      { label: t('Share Photo or Video', 'شارك صورة أو فيديو'), action: () => { focus('posts'); document.getElementById('coachCommunityPostPhotos')?.click(); } },
      { label: t('Create Training Program', 'أنشئ برنامجاً تدريبياً'), action: () => focus('programs') },
      { label: t('Log Out', 'تسجيل الخروج'), action: () => { localStorage.removeItem(key); sessionStorage.removeItem(key); location.assign('/index.html'); } },
    ];
    for (const button of nav.querySelectorAll('button')) {
      button.addEventListener('click', () => {
        const section = button.dataset.bottom;
        if (section === 'training') openSheet(t('Training', 'التدريب'), trainingItems);
        else if (section === 'profile') openSheet(t('Profile', 'الملف'), profileItems);
        else if (section === 'athletes') focus('athletes');
        else if (section === 'community') focus('messages');
        else focus('profile');
      });
    }
    const backdrop = document.querySelector('.coach-sheet-backdrop');
    const close = document.querySelector('.coach-sheet-close');
    if (backdrop) backdrop.addEventListener('click', () => { $('coachActionSheet').hidden = true; });
    if (close) close.addEventListener('click', () => { $('coachActionSheet').hidden = true; });
    nav.classList.remove('hidden');
    nav.hidden = false;
  }

  function initNav(data) {
    if (!data || data.role !== 'provider') return;
    const nav = $('coachTopNav');
    if (!nav || nav.dataset.stravaMounted) return;
    nav.dataset.stravaMounted = 'true';
    document.body.classList.add('coach-light');
    document.getElementById('dashboard')?.classList.add('coach-light');
    buildTopNav();
    buildBottomNav();
    const oldNav = document.getElementById('coachQuickActions');
    if (oldNav) oldNav.hidden = true;
  }
  function startNav() {
    if (window.mzStudioDashboard) initNav(window.mzStudioDashboard);
    else {
      const timer = setInterval(() => {
        if (window.mzStudioDashboard) { clearInterval(timer); initNav(window.mzStudioDashboard); }
      }, 50);
      setTimeout(() => clearInterval(timer), 10000);
    }
  }
  startNav();
  document.addEventListener('mzactive:dashboard-loaded', event => initNav(event.detail));
})();

(() => {
  'use strict';
  const API = window.MZACTIVE_API_BASE;
  const $ = id => document.getElementById(id);
  const token = () => sessionStorage.getItem('mzactive-provider-session') || localStorage.getItem('mzactive-provider-session') || '';
  const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const t = (en, ar) => lang() === 'ar' ? ar : en;

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token()) headers.authorization = `Bearer ${token()}`;
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch { /* binary or empty response */ }
    if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: response.status });
    return data;
  }

  function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toLocaleUpperCase();
  }

  function renderStats(detail) {
    const host = $('athleteStats');
    if (!host) return;
    const programs = detail?.programs || [];
    const completed = programs.reduce((sum, program) =>
      sum + (program.sessions || []).filter(session => session.completed_at).length, 0);
    const cells = [
      [programs.length, t('Programs', 'برامج')],
      [(detail?.teams || []).length, t('Teams', 'فرق')],
      [completed, t('Sessions done', 'حصص مكتملة')],
    ];
    host.replaceChildren();
    for (const [value, label] of cells) {
      const cell = document.createElement('div');
      const strong = document.createElement('b'); strong.textContent = String(value);
      const small = document.createElement('span'); small.textContent = label;
      cell.append(strong, small); host.append(cell);
    }
  }

  async function renderPhoto(profile) {
    const avatar = $('athleteAvatar'), portrait = $('athletePortrait');
    if (!avatar || !portrait) return;
    avatar.textContent = initials(profile.display_name);
    try {
      const headers = token() ? { authorization: `Bearer ${token()}` } : {};
      const response = await fetch(`${API}/api/me/sports-profile/photo`, { headers, cache: 'no-store' });
      if (!response.ok) return;
      const url = URL.createObjectURL(await response.blob());
      portrait.onload = () => { portrait.hidden = false; avatar.hidden = true; };
      portrait.src = url;
    } catch { /* initials remain visible when the private photo is unavailable */ }
  }

  async function render(detail) {
    const panel = $('athleteProfilePanel');
    if (!panel || panel.hidden) return;
    renderStats(detail);
    try {
      const result = await api('/api/me/sports-profile');
      const profile = result.profile || {};
      $('athleteName').textContent = profile.display_name || t('Your athlete profile', 'ملفك كرياضي');
      $('athleteMeta').textContent = [profile.city, profile.country, ...(profile.sports || []), profile.experience_level]
        .filter(Boolean).join(' · ');
      $('athleteGoals').textContent = profile.goals || '';
      $('athleteGoals').hidden = !profile.goals;
      const aboutSports = $('athleteAboutSports'), aboutLevel = $('athleteAboutLevel'), aboutShare = $('athleteAboutShare');
      if (aboutSports) aboutSports.textContent = (profile.sports || []).join(' · ') || t('No sports added yet.', 'لم تتم إضافة رياضات بعد.');
      if (aboutLevel) aboutLevel.textContent = profile.experience_level || t('Not provided', 'غير محدد');
      if (aboutShare) aboutShare.textContent = profile.share_with_coaches
        ? t('Shared with your coaches in the private workspace.', 'تتم المشاركة مع مدربيك في مساحة العمل الخاصة.')
        : t('Private — only you can see these details and your photo.', 'خاص — أنت فقط ترى هذه التفاصيل وصورتك.');
      await renderPhoto(profile);
    } catch (error) {
      $('athleteProfileStatus').textContent = error.message || t('Profile details are unavailable right now.', 'تفاصيل الملف غير متاحة حالياً.');
    }
  }

  function wireTabs() {
    for (const tab of document.querySelectorAll('#athleteProfileTabs [data-athlete-tab]')) {
      tab.addEventListener('click', () => {
        const key = tab.dataset.athleteTab;
        for (const item of document.querySelectorAll('#athleteProfileTabs [data-athlete-tab]')) {
          item.setAttribute('aria-selected', String(item === tab));
        }
        document.querySelectorAll('[data-athlete-panel]').forEach(panel => {
          panel.hidden = panel.dataset.athletePanel !== key;
        });
      });
    }
  }

  function initAthlete(data) {
    if (!data || data.role !== 'member') return;
    const panel = $('athleteProfilePanel');
    if (!panel || panel.dataset.stravaMounted) return;
    panel.dataset.stravaMounted = 'true';
    wireTabs();
    render(data);
  }
  function startAthlete() {
    if (window.mzStudioDashboard) initAthlete(window.mzStudioDashboard);
    else {
      const timer = setInterval(() => {
        if (window.mzStudioDashboard) { clearInterval(timer); initAthlete(window.mzStudioDashboard); }
      }, 50);
      setTimeout(() => clearInterval(timer), 10000);
    }
  }
  startAthlete();
  document.addEventListener('mzactive:dashboard-loaded', event => initAthlete(event.detail));
})();

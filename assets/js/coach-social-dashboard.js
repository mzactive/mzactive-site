(() => {
  'use strict';
  const API = window.MZACTIVE_API_BASE;
  const $ = id => document.getElementById(id);
  const key = 'mzactive-provider-session';
  const token = () => sessionStorage.getItem(key) || localStorage.getItem(key);
  const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const t = (en, ar) => lang() === 'ar' ? ar : en;
  let ownProfile = null;

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token()) headers.authorization = `Bearer ${token()}`;
    const binary = options.body instanceof Blob || options.body instanceof ArrayBuffer;
    if (options.body !== undefined && !binary) headers['content-type'] = 'application/json';
    const response = await fetch(API + path, { ...options, headers });
    let data = {};
    try { data = await response.json(); } catch { /* binary upload response */ }
    if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: response.status });
    return data;
  }

  function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toLocaleUpperCase();
  }

  function renderStats(data) {
    const host = $('ownStats');
    if (!host) return;
    const programs = (data?.programs || []).length;
    const cells = [
      [ownProfile?.follower_count, t('Followers', 'متابعون')],
      [ownProfile?.following_count, t('Following', 'متابَعون')],
      [data?.athleteCount, t('Athletes', 'رياضيون')],
      [programs, t('Programs', 'برامج')],
    ].filter(([value]) => value !== undefined && value !== null && Number(value) > 0);
    host.replaceChildren();
    for (const [value, label] of cells) {
      const cell = document.createElement('div');
      const strong = document.createElement('b'); strong.textContent = String(value);
      const small = document.createElement('span'); small.textContent = label;
      cell.append(strong, small); host.append(cell);
    }
    host.hidden = host.children.length === 0;
  }

  async function renderOwnProfile(data) {
    const panel = $('myProfilePanel');
    if (!panel || panel.hidden) return;
    try {
      const result = await api('/api/me/profile');
      ownProfile = result.profile || null;
      if (!ownProfile) return;
      $('ownName').textContent = ownProfile.display_name || t('Your coach profile', 'ملفك كمدرب');
      const category = lang() === 'ar' ? ownProfile.professional_category?.ar : ownProfile.professional_category?.en;
      $('ownRole').textContent = [category, ownProfile.city, ownProfile.country].filter(Boolean).join(' · ');
      $('ownBio').textContent = ownProfile.bio || '';
      $('ownBio').hidden = !ownProfile.bio;
      $('ownVerified').hidden = ownProfile.verified !== true;
      $('ownAvatar').textContent = initials(ownProfile.display_name);
      const link = $('ownPublicProfileLink');
      if (link) link.href = `coach.html?id=${encodeURIComponent(ownProfile.id)}`;
      if (ownProfile.has_profile_photo && ownProfile.id) {
        const portrait = $('ownPortrait');
        portrait.alt = t('Your profile photo', 'صورتك الشخصية');
        portrait.onload = () => { portrait.hidden = false; $('ownAvatar').hidden = true; };
        portrait.onerror = () => { portrait.hidden = true; $('ownAvatar').hidden = false; };
        portrait.src = `${API}/api/providers/${encodeURIComponent(ownProfile.id)}/photo?v=${encodeURIComponent(ownProfile.profile_photo_updated_at || '')}`;
      }
      if (ownProfile.has_cover && ownProfile.id) {
        const cover = $('ownCover');
        cover.hidden = true; cover.onload = () => { cover.hidden = false; }; cover.onerror = () => { cover.hidden = true; };
        cover.src = `${API}/api/providers/${encodeURIComponent(ownProfile.id)}/cover?v=${encodeURIComponent(ownProfile.cover_updated_at || '')}`;
      }
    } catch (error) {
      $('ownProfileStatus').textContent = error.message || t('Profile details are unavailable right now.', 'تفاصيل الملف غير متاحة حالياً.');
    }
    try {
      const analytics = await api('/api/dashboard/analytics');
      ownProfile.follower_count = analytics?.analytics?.followers ?? analytics?.followers ?? 0;
    } catch { /* the profile stays usable without analytics */ }
    try {
      const following = await api('/api/me/following/count');
      ownProfile.following_count = following.following_count || 0;
    } catch { /* the profile stays usable without the following count */ }
    renderStats({ programs: data?.programs || [], athleteCount: (data?.teams || []).length });
    const recent = $('ownRecentActivity');
    if (recent) {
      recent.replaceChildren();
      const items = (data?.programs || []).slice(0, 5);
      for (const program of items) {
        const card = document.createElement('article');
        card.className = 'card';
        const title = document.createElement('strong');
        title.textContent = `${program.athlete_name || t('Athlete', '\u0631\u064A\u0627\u0636\u064A')} · ${program.week_start || ''}`;
        const meta = document.createElement('small');
        meta.textContent = `${(program.sessions || []).length} ${t('sessions', 'sessions')}`;
        card.append(title, meta);
        recent.append(card);
      }
      $('ownRecentEmpty').hidden = items.length > 0;
    }
    try {
      const athletes = await api('/api/dashboard/athletes');
      renderStats({ programs: data?.programs || [], athleteCount: athletes?.athletes?.length ?? (data?.teams || []).length });
    } catch { /* keep the first render */ }
  }

  function uploadImage(path, file, status) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 1024 * 1024) {
      status.textContent = t('Use a JPG, PNG or WebP image under 1 MB.', 'استخدم صورة JPG أو PNG أو WebP أقل من 1 ميجابايت.');
      return;
    }
    status.textContent = t('Saving…', 'جارٍ الحفظ…');
    api(path, { method: 'PUT', body: file, headers: { 'content-type': file.type } }).then(result => {
      const preview = URL.createObjectURL(file);
      if (path.includes('/cover')) {
        $('ownCover').hidden = false; $('ownCover').src = preview;
        if (result.status && result.status !== 'approved') status.textContent = t('Cover saved for review.', 'تم حفظ الغلاف للمراجعة.');
      } else {
        $('ownPortrait').src = preview;
        $('ownPortrait').hidden = false;
        $('ownAvatar').hidden = true;
        if (result.status && result.status !== 'approved') status.textContent = t('Photo saved for review.', 'تم حفظ الصورة للمراجعة.');
      }
      if (!result.status || result.status === 'approved') status.textContent = t('Saved.', 'تم الحفظ.');
    }).catch(error => { status.textContent = error.message || t('Could not save the image.', 'تعذر حفظ الصورة.'); });
  }

  function wireControls() {
    const status = $('ownProfileStatus');
    $('ownChangeCover')?.addEventListener('click', () => $('ownCoverInput')?.click());
    $('ownChangePhoto')?.addEventListener('click', () => $('ownPhotoInput')?.click());
    $('ownCoverInput')?.addEventListener('change', event => uploadImage('/api/me/profile/cover', event.target.files?.[0], status));
    $('ownPhotoInput')?.addEventListener('change', event => uploadImage('/api/me/profile/photo', event.target.files?.[0], status));
    $('openCoachSettings')?.addEventListener('click', () => $('coachQuickActions')?.querySelector('[href="#coachSettings"]')?.click());
    $('openCoachDashboard')?.addEventListener('click', () => window.MZActiveCoachDashboard?.focusSection('overview'));

    for (const tab of document.querySelectorAll('#ownProfileTabs [data-section]')) {
      tab.addEventListener('click', () => {
        const section = tab.dataset.section;
        for (const item of document.querySelectorAll('#ownProfileTabs [data-section]')) {
          item.setAttribute('aria-selected', String(item === tab));
        }
        const target = section === 'blogs' ? 'posts' : section === 'about' ? 'profile' : section === 'overview' ? 'profile' : section === 'community' ? 'messages' : section;
        window.MZActiveCoachDashboard?.focusSection(target);
        if (section === 'blogs') {
          const details = $('coachBlogDetails');
          if (details) details.open = true;
          $('coachBlogTitle')?.focus();
        }
      });
    }

    for (const item of document.querySelectorAll('#createMenuWrap [data-create]')) {
      item.addEventListener('click', () => {
        const action = item.dataset.create;
        document.querySelector('#createMenuWrap')?.removeAttribute('open');
        if (action === 'program') { window.MZActiveCoachDashboard?.focusSection('programs'); return; }
        window.MZActiveCoachDashboard?.focusSection('posts');
        if (action === 'blog') {
          const details = $('coachBlogDetails');
          if (details) details.open = true;
          $('coachBlogTitle')?.focus();
        } else if (action === 'post') {
          $('coachCommunityPostBody')?.focus();
        } else if (action === 'photo') {
          $('coachCommunityPostPhotos')?.click();
        }
      });
    }
  }

  function initProfile(data) {
    if (!data || data.role !== 'provider') return;
    const panel = $('myProfilePanel');
    if (!panel || panel.dataset.stravaMounted) return;
    panel.dataset.stravaMounted = 'true';
    wireControls();
    renderOwnProfile(data);
  }
  function startProfile() {
    if (window.mzStudioDashboard) initProfile(window.mzStudioDashboard);
    else {
      const timer = setInterval(() => {
        if (window.mzStudioDashboard) { clearInterval(timer); initProfile(window.mzStudioDashboard); }
      }, 50);
      setTimeout(() => clearInterval(timer), 10000);
    }
  }
  startProfile();
  document.addEventListener('mzactive:dashboard-loaded', event => initProfile(event.detail));
})();

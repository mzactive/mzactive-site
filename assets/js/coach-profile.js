(() => {
  const $ = selector => document.getElementById(String(selector).replace(/^#/, ''));
  const q = selector => document.querySelector(selector);
  const ready = callback => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  };
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      return await fetch(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const whenIdle = callback => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(callback, { timeout: 1200 });
    else setTimeout(callback, 0);
  };
  const id = new URLSearchParams(location.search).get('id') || '';
  const apiBase = window.MZACTIVE_API_BASE;
  const endpoint = `${apiBase}/api/providers/${encodeURIComponent(id)}`;
  const language = window.MZActiveLanguage;
  const tokenKey = 'mzactive-provider-session';
  const t = (en, ar) => language.get() === 'ar' ? ar : en;
  let profile = null;
  let failure = 0;
  let ownerToken = '';
  let ownerData = null;
  let privatePhotoPreview = '';
  let privateCoverPreview = '';
  let analyticsData = null;
  let communityPosts = null;

  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined && text !== null) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function safeProfileUrl(raw) {
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' && !url.username && !url.password ? url : null;
    } catch { return null; }
  }
  function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toLocaleUpperCase();
  }
  function roleName(p) {
    const category = language.get() === 'ar' ? p.professional_category?.ar : p.professional_category?.en;
    if (category) return category;
    if (p.provider_type === 'pacer') return t('Pacer','مرافق جري');
    return t('Sports Coach','مدرب رياضي');
  }
  function updateStaticLabels() {
    document.querySelectorAll('[data-en][data-ar]').forEach(el => {
      if (el.closest('[data-user-content]')) return;
      el.textContent = el.dataset[language.get()];
    });
  }
  function setUnavailable() {
    q('.profile-page').hidden = true;
    q('.load-notice').hidden = true;
    $('#unavailable').hidden = false;
    $('#unavailableMessage').textContent = failure === 404
      ? t('This profile is unavailable or is not publicly approved.','هذا الملف غير متاح أو لم تتم الموافقة على نشره.')
      : t('We could not load this profile. Please try again later.','تعذر تحميل هذا الملف. يرجى المحاولة لاحقاً.');
  }
  function addFact(root, label, value) {
    if (value === undefined || value === null || value === '') return;
    const row = node('div');
    const term = node('dt', label);
    const detail = node('dd', String(value));
    row.append(term, detail);
    root.append(row);
  }
  function renderProfile() {
    updateStaticLabels();
    if (!profile) {
      q('.load-notice').hidden = false;
      q('.load-notice').textContent = failure
        ? t('Could not load this coach profile.','تعذر تحميل ملف المدرب.')
        : t('Loading coach profile…','جارٍ تحميل ملف المدرب…');
      return;
    }
    const p = profile;
    q('.load-notice').hidden = true;
    q('.profile-page').hidden = false;
    document.title = `${p.display_name} | MZ Active`;
    $('#name').textContent = p.display_name || '';
    $('#headline').textContent = [roleName(p), ...(p.specialties || []).slice(0, 2)].filter(Boolean).join(' · ');
    $('#location').textContent = [p.city, p.country].filter(Boolean).join(t(', ',', '));
    $('#tagline').textContent = p.bio || '';
    $('#tagline').hidden = !p.bio;
    $('#verified').hidden = !(p.verified === true);
    $('#photoVerified').hidden = !(p.verified === true);
    $('#coachType').textContent = roleName(p);

    const cover = $('#coverPhoto');
    if (cover) {
      if (privateCoverPreview) cover.src = privateCoverPreview;
      else if (p.has_cover) cover.src = `${endpoint}/cover?v=${encodeURIComponent(p.cover_updated_at || '')}`;
      else cover.src = 'assets/images/mzactive-coaching-session.jpg';
    }
    const avatarFallback = $('#avatarFallback');
    avatarFallback.textContent = initials(p.display_name);
    const portrait = $('#portrait');
    portrait.hidden = true;
    if (privatePhotoPreview) {
      portrait.hidden = false;
      portrait.src = privatePhotoPreview;
      avatarFallback.hidden = true;
    } else if (p.has_profile_photo && (!Array.isArray(p.public_fields) || p.public_fields.includes('profile_photo'))) {
      portrait.alt = t(`${p.display_name} profile photo`, `صورة الملف الشخصي لـ ${p.display_name}`);
      portrait.onerror = () => { portrait.hidden = true; avatarFallback.hidden = false; };
      portrait.onload = () => { avatarFallback.hidden = true; portrait.hidden = false; };
      portrait.src = `${endpoint}/photo?v=${encodeURIComponent(p.profile_photo_updated_at || '')}`;
    } else {
      avatarFallback.hidden = false;
      portrait.removeAttribute('src');
    }

    const bookingHref = `pacer.html?provider=${encodeURIComponent(id)}#request`;
    $('#book').href = bookingHref;
    $('#bookSectionLink').href = bookingHref;
    const bio = $('#bio');
    bio.textContent = p.bio || '';
    bio.hidden = !p.bio;
    $('#bioEmpty').hidden = Boolean(p.bio);

    const facts = $('#facts');
    facts.replaceChildren();
    addFact(facts, t('Location','الموقع'), [p.city,p.country].filter(Boolean).join(t(', ','، ')));
    addFact(facts, t('Languages','اللغات'), (p.languages || []).join(' · '));
    addFact(facts, t('Experience','الخبرة'), Number(p.experience_years) > 0 ? `${p.experience_years}${t(' years',' سنوات')}` : '');
    addFact(facts, t('Coaching mode','أسلوب التدريب'), ({online:t('Online','عن بُعد'),'in-person':t('In person','حضوري'),both:t('Online & in person','عن بُعد وحضوري')}[p.coaching_mode] || ''));
    addFact(facts, t('Program lengths','مدد البرامج'), (p.program_durations || []).map(months => `${months}${t(' mo',' شهر')}`).join(' · '));
    addFact(facts, t('Indicative rate','السعر الاسترشادي'), p.indicative_rate_qar ? `${p.indicative_rate_qar}${t(' QAR',' ر.ق.')}` : '');
    const qualifications = String(p.qualifications || '').trim();
    if (qualifications) addFact(facts, t('Qualifications','المؤهلات'), qualifications);
    if (p.credentials) {
      const parts = [p.credentials.certificate_name, p.credentials.certificate_issuer, p.credentials.license_issuer,
        p.credentials.license_number_masked, p.credentials.license_expires_on].filter(Boolean);
      addFact(facts, t('Verified credentials','مؤهلات موثقة'), parts.join(' · '));
    }
    $('#credentialsEmpty').hidden = facts.children.length > 0;
    renderAchievements();
    renderCommunityPosts();
    renderAnalytics();

    const specialties = $('#specialties');
    specialties.replaceChildren();
    for (const specialty of p.specialties || []) specialties.append(node('span', specialty, 'service-chip'));
    const services = $('#services');
    services.replaceChildren();
    for (const service of p.services || []) services.append(node('span', service, 'service-chip'));
    $('#servicesEmpty').hidden = Boolean((p.services || []).length);

    const socialRoot = $('#socialLinks');
    socialRoot.replaceChildren();
    for (const raw of p.social_links || []) {
      const url = safeProfileUrl(raw);
      if (!url) continue;
      const anchor = node('a', `${url.hostname.replace(/^www\./, '')} ↗`, 'social-link');
      anchor.href = url.href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer nofollow';
      socialRoot.append(anchor);
    }
    $('#socialEmpty').hidden = socialRoot.children.length > 0;

    const gallery = $('#gallery');
    gallery.replaceChildren();
    for (const slot of p.gallery_slots || []) {
      if (![1, 2, 3].includes(Number(slot))) continue;
      const image = node('img');
      image.alt = t(`Training gallery photo ${slot} from ${p.display_name}`, `صورة تدريب ${slot} من ${p.display_name}`);
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = `${endpoint}/gallery/${slot}`;
      image.addEventListener('error', () => image.remove(), { once: true });
      gallery.append(image);
    }
    $('#gallerySection').hidden = gallery.children.length === 0;

    const number = String(p.whatsapp_number || '').replace(/\D/g, '');
    const social = (p.social_links || []).find(value => safeProfileUrl(value));
    $('#contact')?.remove();
    $('#share')?.setAttribute('aria-label', t('Share coach profile','مشاركة ملف المدرب'));

    document.dispatchEvent(new CustomEvent('mzactive:coach-profile-rendered', { detail: { id: p.id } }));
    exposeOwnerTools(p);
  }
  function renderAchievements() {
    const root = $('#achievementsList');
    if (!root || !profile) return;
    root.replaceChildren();
    const items = profile.achievements || [];
    for (const item of items) {
      const card = node('div', undefined, 'service-chip');
      card.append(node('strong', item.title));
      if (item.awarded_year) card.append(node('span', ` · ${item.awarded_year}`));
      if (item.details) card.append(node('span', ` — ${item.details}`));
      root.append(card);
    }
    $('#achievementsEmpty').hidden = items.length > 0;
  }
  function renderCommunityPosts() {
    const root = $('#coachPosts');
    if (!root) return;
    root.replaceChildren();
    const posts = communityPosts || [];
    for (const post of posts) {
      const card = node('article', undefined, 'card');
      const kind = ({ event: t('Event','فعالية'), group_session: t('Group session','جلسة جماعية'), challenge: t('Challenge','تحدٍ') })[post.kind] || t('Post','منشور');
      card.append(node('strong', kind), node('p', post.body));
      if (post.photos?.length) {
        const image = node('img');
        image.src = `${apiBase}/api/community/posts/${encodeURIComponent(post.id)}/photos/${post.photos[0]}`;
        image.alt = t('Community photo','صورة المجتمع');
        image.loading = 'lazy';
        card.append(image);
      }
      card.append(node('small', [post.likes ? `${post.likes} ${t('likes','إعجاب')}` : '', post.comments ? `${post.comments} ${t('comments','تعليق')}` : ''].filter(Boolean).join(' · ')));
      root.append(card);
    }
    $('#coachPostsEmpty').hidden = posts.length > 0;
  }
  async function loadCommunityPosts() {
    communityPosts = [];
    renderCommunityPosts();
    try {
      const data = await fetchWithTimeout(`${apiBase}/api/community/posts?coach_id=${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } });
      if (data.ok) communityPosts = (await data.json()).posts || [];
    } catch { /* keep the public profile usable when the feed is unavailable */ }
    renderCommunityPosts();
  }
  function metricTile(value, label) {
    const tile = node('div', undefined, 'metric');
    tile.append(node('strong', String(value)), node('span', label));
    return tile;
  }
  function renderAnalytics() {
    const root = $('#ownerMetrics');
    if (!root || !analyticsData) return;
    const a = analyticsData;
    root.replaceChildren();
    for (const [value, label] of [
      [a.followers, t('Followers','المتابعون')], [a.profile_views, t('Profile views','مشاهدات الملف')],
      [a.posts, t('Posts','المنشورات')], [a.post_likes, t('Likes','الإعجابات')],
      [a.post_comments, t('Comments','التعليقات')], [a.booking_requests, t('Booking requests','طلبات الحجز')],
      [a.accepted_bookings, t('Confirmed','مؤكدة')],
    ]) root.append(metricTile(value, label));
    root.hidden = false;
    $('#analyticsUnavailable').hidden = true;
  }
  function renderBookingInbox() {
    const root = $('#bookingInbox');
    if (!root) return;
    root.replaceChildren();
    const bookings = ownerData?.bookings || [];
    const label = code => ({ received: t('Received','تم الاستلام'), reviewing: t('Under review','قيد المراجعة'), accepted: t('Confirmed','مؤكد'), declined: t('Declined','مرفوض'), cancelled: t('Cancelled','ملغى') })[code] || code;
    const transitions = { received: ['reviewing','accepted','declined','cancelled'], reviewing: ['accepted','declined','cancelled'], accepted: ['cancelled'] };
    if (!bookings.length) { root.append(node('p', t('No booking requests yet.','لا توجد طلبات حجز بعد.'), 'empty-copy')); return; }
    for (const booking of bookings) {
      const card = node('article', undefined, 'card');
      card.append(node('strong', booking.customer_name), node('p', [label(booking.status), booking.city, booking.session_type, booking.program_duration_months ? `${booking.program_duration_months}${t(' mo',' شهر')}` : ''].filter(Boolean).join(' · ')));
      card.append(node('small', booking.goal_summary || ''));
      if (booking.customer_phone) card.append(node('a', booking.customer_phone, 'text-link'));
      for (const status of transitions[booking.status] || []) {
        const action = node('button', label(status));
        action.type = 'button';
        action.addEventListener('click', async () => {
          action.disabled = true;
          try {
            await api(`/api/dashboard/bookings/${encodeURIComponent(booking.id)}`, ownerToken, { method: 'PATCH', body: { status } });
            ownerData.bookings = (ownerData.bookings || []).map(item => item.id === booking.id ? { ...item, status } : item);
            renderBookingInbox();
          } catch { action.disabled = false; }
        });
        card.append(action);
      }
      root.append(card);
    }
  }
  async function api(path, token, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    const binary = options.body instanceof Blob || options.body instanceof ArrayBuffer || options.body instanceof Uint8Array;
    const body = options.body !== undefined && !binary ? JSON.stringify(options.body) : options.body;
    if (body !== undefined && !binary) headers['content-type'] = 'application/json';
    const response = await fetch(`${apiBase}${path}`, { ...options, body, headers });
    let data = {};
    try { data = await response.json(); } catch { /* some API responses are binary */ }
    if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: response.status });
    return data;
  }
  function renderOwnerSummary(data) {
    if (data.role !== 'provider') return;
    const teams = Array.isArray(data.teams) ? data.teams : [];
    const programs = Array.isArray(data.programs) ? data.programs : [];
    const athletes = new Set(teams.flatMap(team => (team.members || []).map(member => member.user_id).filter(Boolean)));
    const sessions = teams.flatMap(team => team.sessions || []);
    const target = $('#snapshotMetrics');
    target.replaceChildren();
    for (const [value, label] of [
      [athletes.size, t('Athletes','رياضيون')],
      [programs.length, t('Programs','برامج')],
      [teams.length, t('Teams','فرق')]
    ]) {
      const tile = node('div', undefined, 'metric');
      tile.append(node('strong', String(value)), node('span', label));
      target.append(tile);
    }
    const ownMetricRoot = $('#ownerMetrics');
    ownMetricRoot.replaceChildren();
    for (const [value, label] of [
      [athletes.size, t('Assigned athletes','رياضيون مرتبطون')],
      [programs.length, t('Saved programs','برامج محفوظة')],
      [sessions.length, t('Team sessions','جلسات الفريق')]
    ]) {
      const tile = node('div', undefined, 'metric');
      tile.append(node('strong', String(value)), node('span', label));
      ownMetricRoot.append(tile);
    }
    ownMetricRoot.hidden = false;
    renderUpcomingSessions(sessions);
  }
  async function exposeOwnerTools(p) {
    const token = localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey) || '';
    if (!token || ownerToken === token) return;
    try {
      const me = await api('/api/me/profile', token);
      if (me.profile?.id !== p.id) {
        setupViewerActions(p, token);
        return;
      }
      ownerToken = token;
      $('#changePhoto').hidden = false;
      $('#changeCover').hidden = false;
      $('#snapshotMetrics').hidden = false;
      $('#coachSnapshot').hidden = true;
      const data = await api('/api/dashboard', token);
      ownerData = data;
      renderOwnerSummary(ownerData);
      await loadPrivateData(token);
    } catch {
      // The public profile remains usable if the private dashboard is unavailable.
    }
  }
  function setupViewerActions(p, token) {
    const follow = $('#followCoach'), connect = $('#connectCoach');
    if (!follow || !connect) return;
    follow.hidden = false;
    connect.hidden = false;
    connect.href = 'dashboard.html#connections';
    const label = following => following ? t('Following','متابَع') : t('Follow','متابعة');
    follow.firstElementChild.textContent = label(p.is_following === true);
    follow.addEventListener('click', async () => {
      follow.disabled = true;
      try {
        const result = await api(`/api/coaches/${encodeURIComponent(p.id)}/follow`, token, { method: p.is_following ? 'DELETE' : 'POST', body: {} });
        p.is_following = result.following;
        p.follower_count = result.follower_count;
        follow.firstElementChild.textContent = label(result.following);
      } finally { follow.disabled = false; }
    });
  }
  async function loadPrivateData(token) {
    try {
      const [analytics, bookings] = await Promise.all([
        api('/api/dashboard/analytics', token), api('/api/dashboard/bookings', token),
      ]);
      analyticsData = analytics.analytics;
      ownerData = { ...(ownerData || {}), bookings: bookings.bookings || [] };
      renderAnalytics();
      renderBookingInbox();
    } catch {
      // Public profile details remain visible when private analytics are unavailable.
    }
  }
  function renderUpcomingSessions(sessions) {
    const now = Date.now();
    const future = sessions.filter(session => session.status === 'scheduled' && Date.parse(session.starts_at) >= now)
      .sort((a,b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)).slice(0,3);
    const root = $('#upcomingSessions');
    root.replaceChildren();
    if (!future.length) {
      root.append(node('p', t('No upcoming team sessions are listed in the coach workspace.','لا توجد جلسات فريق قادمة مدرجة في مساحة المدرب.'), 'empty-copy'));
      return;
    }
    for (const session of future) {
      const item = node('div', undefined, 'upcoming-item');
      const title = node('strong', session.title || t('Training session','جلسة تدريبية'));
      const date = new Date(session.starts_at);
      const dateText = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(language.get() === 'ar' ? 'ar' : 'en', { weekday:'short', day:'numeric', month:'short', hour:'numeric', minute:'2-digit' }).format(date) : '';
      item.append(title, node('span', [dateText,session.location].filter(Boolean).join(' · ')));
      root.append(item);
    }
  }
  async function uploadPhoto(file) {
    const output = $('#photoStatus');
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 1_000_000) {
      output.textContent = t('Choose a JPG, PNG or WebP image up to 1 MB.','اختر صورة JPG أو PNG أو WebP بحجم يصل إلى 1 ميغابايت.');
      return;
    }
    $('#changePhoto').disabled = true;
    output.textContent = t('Uploading photo…','جارٍ تحميل الصورة…');
    try {
      const result = await api('/api/me/profile/photo', ownerToken, { method:'PUT', headers:{ 'content-type':file.type }, body:file });
      const awaitingReview = result.status === 'pending_review';
      output.textContent = awaitingReview
        ? t('Photo saved for review. The current API returns the profile to pending review before it can appear publicly again.','تم حفظ الصورة للمراجعة. يعيد الخادم الحالي الملف إلى حالة انتظار المراجعة قبل ظهوره للعامة مجدداً.')
        : t('Profile photo updated.','تم تحديث صورة الملف.');
      if (awaitingReview) {
        $('#verified').hidden = true;
        $('#photoVerified').hidden = true;
      }
      const image = $('#portrait');
      if (privatePhotoPreview) URL.revokeObjectURL(privatePhotoPreview);
      privatePhotoPreview = URL.createObjectURL(file);
      image.onerror = () => { image.hidden = true; $('#avatarFallback').hidden = false; };
      image.src = privatePhotoPreview;
      image.hidden = false;
      $('#avatarFallback').hidden = true;
    } catch (err) {
      output.textContent = err.message === 'unauthorized'
        ? t('Please sign in again through the coach portal.','يرجى تسجيل الدخول مجدداً عبر بوابة المدرب.')
        : t('The profile photo could not be saved. Use the coach portal to retry.','تعذر حفظ صورة الملف. استخدم بوابة المدرب للمحاولة مجدداً.');
    } finally {
      $('#changePhoto').disabled = false;
      $('#photoInput').value = '';
    }
  }
  async function uploadCover(file) {
    const output = $('#photoStatus');
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 1_000_000) {
      output.textContent = t('Choose a JPG, PNG or WebP image up to 1 MB.','اختر صورة JPG أو PNG أو WebP بحجم يصل إلى 1 ميغابايت.');
      return;
    }
    $('#changeCover').disabled = true;
    output.textContent = t('Uploading cover…','جارٍ تحميل صورة الغلاف…');
    try {
      const result = await api('/api/me/profile/cover', ownerToken, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (privateCoverPreview) URL.revokeObjectURL(privateCoverPreview);
      privateCoverPreview = URL.createObjectURL(file);
      $('#coverPhoto').src = privateCoverPreview;
      profile.has_cover = true;
      profile.cover_updated_at = result.updated_at;
      output.textContent = result.status === 'approved'
        ? t('Cover photo published.','تم نشر صورة الغلاف.')
        : t('Cover photo saved and sent for review.','تم حفظ صورة الغلاف وإرسالها للمراجعة.');
    } catch {
      output.textContent = t('The cover photo could not be saved.','تعذر حفظ صورة الغلاف.');
    } finally {
      $('#changeCover').disabled = false;
      $('#coverInput').value = '';
    }
  }
  ready(() => {
    $('#share')?.addEventListener('click', async () => {
      const url = new URL('coach.html', location.href);
      url.searchParams.set('id', id);
      const status = $('#shared');
      try {
        if (navigator.share) await navigator.share({ title:document.title, url:url.href });
        else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url.href);
          status.textContent = t('Profile link copied.','تم نسخ رابط الملف.');
        } else status.textContent = url.href;
      } catch (err) {
        if (err.name !== 'AbortError') status.textContent = url.href;
      }
    });
    $('#changePhoto')?.addEventListener('click', () => $('#photoInput').click());
    $('#photoInput')?.addEventListener('change', event => uploadPhoto(event.target.files?.[0]));
    $('#changeCover')?.addEventListener('click', () => $('#coverInput').click());
    $('#coverInput')?.addEventListener('change', event => uploadCover(event.target.files?.[0]));
    document.addEventListener('mzactive:language-change', () => {
      renderProfile();
      if (ownerData) renderOwnerSummary(ownerData);
      if (ownerData?.bookings) renderBookingInbox();
    });
    load();
  });

  async function load() {
    if (!/^[\w-]{36}$/.test(id)) { failure = 404; setUnavailable(); return; }
    try {
      const response = await fetchWithTimeout(endpoint, { headers:{ accept:'application/json' } });
      if (!response.ok) { failure = response.status; setUnavailable(); return; }
      const payload = await response.json();
      profile = payload.provider || null;
      if (!profile) { failure = 404; setUnavailable(); return; }
      renderProfile();
      whenIdle(loadCommunityPosts);
    } catch {
      failure = 503;
      setUnavailable();
    }
  }
})();

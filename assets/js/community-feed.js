(() => {
  const $ = id => document.getElementById(id);
  const base = window.MZACTIVE_API_BASE;
  const key = 'mzactive-provider-session';
  const language = window.MZActiveLanguage;
  const t = (en, ar) => language.get() === 'ar' ? ar : en;
  const sports = ['running', 'walking', 'cycling', 'swimming', 'strength', 'boxing', 'padel', 'football', 'other'];
  let token = '';
  let posts = [];
  let currentUserId = '';
  let communityState = { id: '', name: '', member: false, can_manage: false };

  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined && text !== null) item.textContent = text;
    if (className) item.className = className;
    return item;
  }

  function updateStaticLabels() {
    document.querySelectorAll('[data-en][data-ar]').forEach(el => {
      if (el.closest('[data-user-content]')) return;
      el.textContent = el.dataset[language.get()];
    });
  }

  function notice(message) {
    const target = $('feedNotice');
    if (target) target.textContent = message;
  }

  function sportsNotice(message) {
    const target = $('sportsNotice');
    if (target) target.textContent = message;
  }

  function formatDate(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat(language.get() === 'ar' ? 'ar-QA' : 'en-QA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return String(value); }
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    const binary = options.body instanceof Blob || options.body instanceof File;
    if (options.body !== undefined && !binary) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}/api${path}`, {
      ...options, headers,
      body: options.body === undefined || binary ? options.body : JSON.stringify(options.body),
      cache: 'no-store',
    });
    let data = {};
    try { data = await response.json(); } catch { /* binary responses are not expected here */ }
    if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: response.status });
    return data;
  }

  function currentToken() {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || '';
  }

  async function loadViewer() {
    if (!token) { currentUserId = ''; return; }
    try {
      const data = await api('/me/community');
      currentUserId = data.user_id || '';
    } catch { currentUserId = ''; }
  }

  function kindLabel(kind) {
    return ({ post: t('Update', 'تحديث'), event: t('Event', 'فعالية'), group_session: t('Group session', 'جلسة جماعية'), challenge: t('Challenge', 'تحدٍ') })[kind] || kind;
  }

  function actionButton(label, fn, disabled = false, className = '') {
    const button = node('button', label, className);
    button.type = 'button';
    button.disabled = disabled;
    button.addEventListener('click', fn);
    return button;
  }

  function scopedPostPath(post, suffix = '') {
    const id = encodeURIComponent(post.id);
    if (communityState.id && post.community_id === communityState.id) {
      return `/communities/${encodeURIComponent(communityState.id)}/posts/${id}${suffix}`;
    }
    return `/community/posts/${id}${suffix}`;
  }

  async function toggleLike(post) {
    try {
      // Likes are keyed by post id; the server still checks private-community access.
      const result = await api(`/community/posts/${encodeURIComponent(post.id)}/like`, { method: post.liked ? 'DELETE' : 'POST', body: post.liked ? undefined : {} });
      post.liked = result.liked;
      post.likes = result.likes;
      await loadFeed();
    } catch (error) { notice(error.message); }
  }

  async function sendComment(post, input) {
    const body = input.value.trim();
    if (!body) return;
    try {
      // Comments are keyed by post id; the server still checks private-community access.
      await api(`/community/posts/${encodeURIComponent(post.id)}/comments`, { method: 'POST', body: { body } });
      input.value = '';
      post.comments += 1;
      await loadFeed();
    } catch (error) { notice(error.message); }
  }

  async function deleteComment(post, comment, root) {
    if (!post.community_id) return;
    try {
      await api(scopedPostPath(post, `/comments/${encodeURIComponent(comment.id)}`), { method: 'DELETE' });
      const item = [...root.querySelectorAll('[data-comment-id]')].find(row => row.dataset.commentId === comment.id);
      if (item) item.remove();
      post.comments = Math.max(0, post.comments - 1);
    } catch (error) { notice(error.message); }
  }

  async function setRsvp(post, response) {
    try {
      const path = communityState.id && post.community_id === communityState.id
        ? scopedPostPath(post, '/rsvp')
        : `/community/posts/${encodeURIComponent(post.id)}/rsvp`;
      if (post.rsvp === response) {
        await api(path, { method: 'DELETE' });
        post.rsvp = '';
      } else {
        const result = await api(path, { method: 'POST', body: { response } });
        post.rsvp = result.rsvp;
      }
      await loadFeed();
    } catch (error) { notice(error.message); }
  }

  async function toggleComments(card, post) {
    const existing = card.querySelector('.feed-comments');
    if (existing) { existing.remove(); return; }
    const root = node('div', undefined, 'feed-comments');
    root.dataset.userContent = '';
    root.append(node('p', t('Loading comments…', 'جارٍ تحميل التعليقات…'), 'note'));
    card.append(root);
    try {
      const data = await api(`/community/posts/${encodeURIComponent(post.id)}/comments`);
      root.replaceChildren();
      for (const comment of data.comments || []) {
        const row = node('div', `${comment.author_name || ''}\n${comment.body}\n${formatDate(comment.created_at)}`, 'comment');
        row.dataset.commentId = comment.id;
        if (token && comment.user_id && comment.user_id === currentUserId && post.community_id) {
          row.append(actionButton(t('Delete', 'حذف'), () => deleteComment(post, comment, root), false, 'danger'));
        }
        root.append(row);
      }
      if (!(data.comments || []).length) root.append(node('p', t('No comments yet.', 'لا توجد تعليقات بعد.'), 'note'));
      if (token) {
        const form = node('form', undefined, 'feed-comment'), input = node('input');
        input.type = 'text'; input.maxLength = 1000;
        input.placeholder = t('Write a comment', 'اكتب تعليقاً');
        input.setAttribute('aria-label', t('Write a comment', 'اكتب تعليقاً'));
        form.append(input, node('button', t('Send', 'إرسال')));
        form.addEventListener('submit', async event => { event.preventDefault(); await sendComment(post, input); });
        root.append(form);
      }
    } catch (error) { root.replaceChildren(node('p', error.message, 'note')); }
  }

  async function editPost(post) {
    if (!token) return;
    const body = window.prompt(t('Edit your post', 'عدّل منشورك'), post.body || '');
    if (body === null) return;
    const content = body.trim();
    if (!content) { notice(t('Write a post first.', 'اكتب المنشور أولاً.')); return; }
    try {
      const payload = { body: content, sport: post.sport || '', language: post.language || language.get() };
      if (communityState.id && post.community_id === communityState.id) {
        payload.title = post.title || '';
        await api(scopedPostPath(post), { method: 'PATCH', body: payload });
      } else {
        await api(`/community/posts/${encodeURIComponent(post.id)}`, { method: 'PATCH', body: payload });
      }
      await loadFeed();
    } catch (error) { notice(error.message); }
  }

  async function deletePost(post) {
    if (!token) return;
    if (!window.confirm(t('Delete this post?', 'حذف هذا المنشور؟'))) return;
    try {
      await api(scopedPostPath(post), { method: 'DELETE' });
      await loadFeed();
    } catch (error) { notice(error.message); }
  }

  function reportPost(post) {
    if (!token) return;
    if (!post.community_id) {
      notice(t('Open the community to report this post.', 'افتح المجتمع للإبلاغ عن هذا المنشور.'));
      return;
    }
    if (window.MZActiveCommunity?.reportEntity) window.MZActiveCommunity.reportEntity('post', post.id, post.community_id);
    else notice(t('Reporting is unavailable right now.', 'الإبلاغ غير متاح الآن.'));
  }

  function renderPost(post) {
    const card = node('article', undefined, 'card feed-card');
    card.dataset.userContent = '';
    const head = node('div', undefined, 'team-head');
    head.append(node('strong', post.author_name || 'MZ Active member'), node('small', [kindLabel(post.kind), formatDate(post.published_at || post.created_at)].filter(Boolean).join(' · ')));
    card.append(head);
    if (post.title && post.title !== post.body) card.append(node('strong', post.title));
    card.append(node('p', post.body));
    if (post.photos?.length) {
      const photos = node('div', undefined, 'feed-photos');
      for (const slot of post.photos) {
        const image = node('img');
        image.loading = 'lazy';
        image.alt = t(`Community photo ${slot}`, `صورة المجتمع ${slot}`);
        image.src = `${base}/api/community/posts/${encodeURIComponent(post.id)}/photos/${slot}`;
        photos.append(image);
      }
      card.append(photos);
    }
    const meta = [post.sport, post.location || post.online_details, post.starts_at ? formatDate(post.starts_at) : ''].filter(Boolean).join(' · ');
    if (meta) card.append(node('small', meta));
    if (post.cancelled_at) card.append(node('small', t('Cancelled', 'ملغى')));
    if (post.kind === 'event' || post.kind === 'group_session') card.append(node('small', `${t('Going', 'مشارك')}: ${post.going || 0} · ${t('Interested', 'مهتم')}: ${post.interested || 0}`));
    const actions = node('div', undefined, 'feed-actions');
    actions.append(actionButton(`${post.liked ? '♥' : '♡'} ${post.likes || 0}`, () => toggleLike(post), !token));
    actions.append(actionButton(`${t('Comments', 'التعليقات')} (${post.comments || 0})`, () => toggleComments(card, post)));
    if (post.kind === 'event' || post.kind === 'group_session') {
      actions.append(actionButton(t('Going', 'مشارك'), () => setRsvp(post, 'going'), !token || Boolean(post.cancelled_at)));
      actions.append(actionButton(t('Interested', 'مهتم'), () => setRsvp(post, 'interested'), !token || Boolean(post.cancelled_at)));
    }
    const own = Boolean(token && post.author_user_id && post.author_user_id === currentUserId);
    if (post.community_id && (own || communityState.can_manage)) {
      actions.append(actionButton(t('Edit', 'تعديل'), () => editPost(post), false));
      actions.append(actionButton(t('Delete', 'حذف'), () => deletePost(post), false, 'danger'));
    }
    if (token && post.community_id) actions.append(actionButton(t('Report', 'ابلغ'), () => reportPost(post), false, 'danger'));
    card.append(actions);
    return card;
  }

  function filterScopedPosts(items) {
    const kind = $('feedKind')?.value || '';
    const sport = $('feedSport')?.value || '';
    return (items || []).filter(post => (!kind || post.kind === kind) && (!sport || post.sport === sport));
  }

  async function loadFeed() {
    const params = new URLSearchParams();
    if ($('feedKind').value) params.set('kind', $('feedKind').value);
    if ($('feedSport').value) params.set('sport', $('feedSport').value);
    try {
      let data;
      if (communityState.id) {
        params.set('limit', '60');
        data = await api(`/communities/${encodeURIComponent(communityState.id)}/posts?${params}`);
        posts = filterScopedPosts(data.posts || []);
      } else {
        const query = params.toString();
        data = await api(`/community/posts${query ? '?' + query : ''}`);
        posts = data.posts || [];
      }
      const root = $('feedList');
      root.replaceChildren(...posts.map(renderPost));
      $('feedEmpty').hidden = posts.length > 0;
    } catch (error) { notice(error.message); }
  }

  function syncComposerFields() {
    const kind = $('postKind').value, timed = ['event', 'group_session'].includes(kind);
    $('postStartsWrap').hidden = !timed;
    $('postEventFields').hidden = !timed;
    $('postStartsAt').required = timed;
  }

  function syncComposerAccess() {
    const form = $('postForm'), prompt = $('signInPrompt'), access = $('postAccessNotice'), label = $('composerCommunityLabel');
    if (!form || !prompt) return;
    if (communityState.id) {
      const allowed = Boolean(communityState.member || communityState.can_manage);
      form.hidden = !token || !allowed;
      if (access) {
        access.hidden = !token || allowed;
        access.textContent = t('Join this community to post, comment and join events.', 'انضم إلى هذا المجتمع للنشر والتعليق وحضور الفعاليات.');
      }
      prompt.hidden = Boolean(token);
      if (label) label.textContent = `${t('Posting to', 'النشر في')}: ${communityState.name || t('this community', 'هذا المجتمع')}`;
    } else {
      form.hidden = !token;
      if (access) access.hidden = true;
      prompt.hidden = Boolean(token);
      if (label) label.textContent = '';
    }
  }

  async function createPost(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = $('postBody').value.trim();
    if (!body) return;
    const kind = $('postKind').value, timed = ['event', 'group_session'].includes(kind);
    const payload = { kind, body, sport: $('postSport').value, language: language.get() };
    if (timed) {
      if (!$('postStartsAt').value) { notice(t('Choose a valid start time.', 'اختر وقت بداية صحيحاً.')); return; }
      payload.starts_at = new Date($('postStartsAt').value).toISOString();
      payload.starts_at_local = $('postStartsAt').value;
      payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Qatar';
      payload.location = $('postLocation').value;
      if ($('postCapacity').value) payload.capacity = Number($('postCapacity').value);
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const path = communityState.id
        ? `/communities/${encodeURIComponent(communityState.id)}/posts`
        : '/community/posts';
      const result = await api(path, { method: 'POST', body: payload });
      const files = [...($('postPhotos').files || [])].slice(0, 3);
      for (const [index, file] of files.entries()) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1000000) continue;
        await api(`/community/posts/${encodeURIComponent(result.id)}/photos/${index + 1}`, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      }
      form.reset();
      syncComposerFields();
      notice(result.status === 'published'
        ? t('Published. Your post is now visible in the community.', 'تم النشر. أصبح منشورك ظاهراً في المجتمع.')
        : t('Submitted. MZ Active will review it before it appears publicly.', 'تم الإرسال. ستراجعه MZ Active قبل ظهوره للعامة.'));
      window.MZActiveCommunity?.refresh();
      await loadFeed();
    } catch (error) { notice(error.message); }
    finally { submit.disabled = false; }
  }

  async function loadSportsProfile() {
    if (!token) return;
    try {
      const data = await api('/me/sports-profile');
      const p = data.profile || {};
      $('sportsName').value = p.display_name || '';
      $('sportsCity').value = p.city || '';
      $('sportsList').value = (p.sports || []).join(', ');
      $('sportsLevel').value = p.experience_level || '';
      $('sportsGoals').value = p.goals || '';
      $('sportsLanguage').value = p.preferred_language || '';
      $('sportsAvailability').value = p.availability_notes || '';
      $('sportsAge').value = p.age_range || '';
      $('sportsGender').value = p.gender || '';
      $('sportsGarmin').value = p.garmin_public_url || '';
    } catch { /* the form stays usable */ }
  }

  async function saveSportsProfile(event) {
    event.preventDefault();
    const garmin = $('sportsGarmin').value.trim();
    if (garmin && !/^https:\/\//i.test(garmin)) {
      sportsNotice(t('Use a public HTTPS Garmin URL, or leave it empty.', 'استخدم رابط Garmin عاماً بصيغة HTTPS أو اتركه فارغاً.'));
      return;
    }
    const submit = event.currentTarget.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await api('/me/sports-profile', {
        method: 'PUT',
        body: {
          display_name: $('sportsName').value, city: $('sportsCity').value,
          sports: $('sportsList').value.split(',').map(item => item.trim()),
          experience_level: $('sportsLevel').value, goals: $('sportsGoals').value,
          preferred_language: $('sportsLanguage').value, availability_notes: $('sportsAvailability').value,
          age_range: $('sportsAge').value, gender: $('sportsGender').value, garmin_public_url: garmin,
        },
      });
      sportsNotice(t('Sports profile saved privately.', 'تم حفظ الملف الرياضي بشكل خاص.'));
    } catch (error) { sportsNotice(error.message); }
    finally { submit.disabled = false; }
  }

  function applySession() {
    token = currentToken();
    $('signInPrompt').hidden = Boolean(token);
    $('sportsForm').hidden = !token;
    if (token) loadSportsProfile();
    syncComposerAccess();
    loadViewer().finally(loadFeed);
  }

  window.addEventListener('mzactive:community-change', event => {
    const detail = event.detail || {};
    communityState = {
      id: detail.id || '', name: detail.name || '',
      member: Boolean(detail.member), can_manage: Boolean(detail.can_manage),
    };
    if (detail.user_id) currentUserId = detail.user_id;
    syncComposerAccess();
    loadFeed();
  });
  window.addEventListener('mzactive:community-refresh', () => loadFeed());
  $('postKind').addEventListener('change', syncComposerFields);
  $('postForm').addEventListener('submit', createPost);
  $('sportsForm').addEventListener('submit', saveSportsProfile);
  $('feedKind').addEventListener('change', loadFeed);
  $('feedSport').addEventListener('change', loadFeed);
  document.addEventListener('mzactive:language-change', () => { updateStaticLabels(); loadFeed(); });
  window.addEventListener('storage', event => { if (event.key === key) applySession(); });
  updateStaticLabels();
  syncComposerFields();
  applySession();
})();

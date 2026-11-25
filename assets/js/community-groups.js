(() => {
  const $ = (id) => document.getElementById(id);
  const base = window.MZACTIVE_API_BASE;
  const key = 'mzactive-provider-session';
  const language = window.MZActiveLanguage;
  const t = (en, ar) => (language && language.get() === 'ar' ? ar : en);
  const REASONS = ['spam', 'harassment', 'unsafe', 'misinformation', 'other'];
  let token = '';
  let community = null;
  let tab = 'feed';
  let chatTimer = null;
  let lastChatId = '';
  let unreadCount = 0;
  let currentUserId = '';

  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined && text !== null) item.textContent = String(text);
    if (className) item.className = className;
    return item;
  }

  function currentToken() {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || '';
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
    }).catch(cause => {
      throw new Error(t('Could not connect. Please try again.', 'تعذّر الاتصال. يرجى المحاولة مرة أخرى.'), { cause });
    });
    let data = {};
    try { data = await response.json(); } catch { /* binary or empty response */ }
    if (!response.ok) throw Object.assign(new Error(data.error || t('Request failed', 'فشل الطلب')), { status: response.status });
    return data;
  }

  function applyLabels(root = document) {
    root.querySelectorAll('[data-en][data-ar]').forEach((el) => {
      if (el.closest('[data-user-content]') && el !== root) return;
      const value = el.dataset[language && language.get() === 'ar' ? 'ar' : 'en'];
      if (value !== undefined) el.textContent = value;
    });
    root.querySelectorAll('[data-en-placeholder][data-ar-placeholder]').forEach((el) => {
      el.placeholder = el.dataset[language && language.get() === 'ar' ? 'arPlaceholder' : 'enPlaceholder'];
    });
  }

  function discoverNotice(message) {
    const target = $('discoverNotice');
    if (target) target.textContent = message;
  }

  function detailNotice(message) {
    const target = $('communityNotice');
    if (target) target.textContent = message;
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat(language && language.get() === 'ar' ? 'ar-QA' : 'en-QA',
        { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch { return String(value); }
  }

  function button(label, onClick, className = 'button small') {
    const item = node('button', label, className);
    item.type = 'button';
    item.addEventListener('click', onClick);
    return item;
  }

  function setUrl(id) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('community', id);
    else url.searchParams.delete('community');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }

  function announceCommunity(id) {
    window.dispatchEvent(new CustomEvent('mzactive:community-change', {
      detail: {
        id: id || '', active: Boolean(id), name: community?.name || '', user_id: currentUserId,
        member: Boolean(community?.viewer?.member), can_manage: Boolean(community?.viewer?.can_manage),
      },
    }));
  }

  function reportEntity(entityType, entityId, targetId) {
    const reason = window.prompt(
      t('Reason: spam, harassment, unsafe, misinformation or other', 'السبب: spam أو harassment أو unsafe أو misinformation أو other'),
      'spam'
    );
    if (!reason) return Promise.resolve(false);
    const value = reason.trim().toLowerCase();
    if (!REASONS.includes(value)) {
      detailNotice(t('Choose spam, harassment, unsafe, misinformation or other.', 'اختر spam أو harassment أو unsafe أو misinformation أو other.'));
      return Promise.resolve(false);
    }
    return api('/community/reports', {
      method: 'POST',
      body: {
        community_id: targetId || community?.id || '', entity_type: entityType,
        entity_id: entityId, reason: value,
      },
    }).then(() => {
      detailNotice(t('Report sent to moderators. Thank you.', 'أُرسل البلاغ إلى المراجعين. شكراً لك.'));
      return true;
    }).catch((error) => { detailNotice(error.message); return false; });
  }

  function communityCard(item) {
    const card = node('article', undefined, 'card');
    card.dataset.userContent = '';
    const head = node('div', undefined, 'team-head');
    head.append(node('strong', item.name), node('small', [item.sport, item.location].filter(Boolean).join(' · ')));
    card.append(head);
    card.append(node('p', item.description.slice(0, 180) + (item.description.length > 180 ? '…' : '')));
    const badges = node('div');
    badges.append(node('span', `${item.member_count} ${t('members', 'أعضاء')}`, 'badge'));
    badges.append(node('span', item.visibility === 'private' ? t('Private', 'خاص') : t('Public', 'عام'), 'badge'));
    if (item.viewer?.role === 'owner') badges.append(node('span', t('Owner', 'المالك'), 'badge'));
    else if (item.viewer?.role === 'moderator') badges.append(node('span', t('Moderator', 'مراجع'), 'badge'));
    else if (item.viewer?.member) badges.append(node('span', t('Member', 'عضو'), 'badge'));
    card.append(badges);
    const actions = node('div', undefined, 'inline-actions');
    actions.append(button(t('Open community', 'افتح المجتمع'), () => openCommunity(item.id)));
    if (token && !item.viewer?.member && item.viewer?.membership_status !== 'pending') {
      actions.append(button(t('Join', 'انضم'), async () => {
        try { await api(`/communities/${item.id}/join`, { method: 'POST', body: {} }); await loadCommunities(); }
        catch (error) { discoverNotice(error.message); }
      }, 'button small alt'));
    }
    card.append(actions);
    return card;
  }

  async function loadCommunities() {
    const params = new URLSearchParams();
    const q = $('communitySearch').value.trim();
    const sport = $('communitySport').value;
    const location = $('communityLocation').value.trim();
    const scope = $('communityScope').value;
    if (q) params.set('q', q);
    if (sport) params.set('sport', sport);
    if (location) params.set('location', location);
    if (scope === 'mine') {
      params.set('scope', 'mine');
      if (!token) { $('communityList').replaceChildren(); $('communityEmpty').hidden = false; return; }
    }
    try {
      const data = await api(`/communities${params.size ? '?' + params : ''}`);
      const list = data.communities || [];
      $('communityList').replaceChildren(...list.map(communityCard));
      $('communityEmpty').hidden = list.length > 0;
    } catch (error) {
      discoverNotice(error.message);
      $('communityEmpty').hidden = false;
    }
  }

  async function loadUpcoming() {
    try {
      const data = await api('/community/upcoming');
      const events = data.events || [];
      $('upcomingList').replaceChildren(...events.map((event) => {
        const card = node('article', undefined, 'card');
        card.dataset.userContent = '';
        card.append(node('strong', event.title || t('Community event', 'فعالية مجتمعية')));
        card.append(node('p', event.body.slice(0, 160)));
        card.append(node('small', [formatDate(event.starts_at), event.location, event.sport].filter(Boolean).join(' · ')));
        if (event.community_id) {
          const open = button(t('Open community', 'افتح المجتمع'), () => openCommunity(event.community_id), 'button small');
          card.append(open);
        }
        return card;
      }));
      $('upcomingEmpty').hidden = events.length > 0;
    } catch (error) {
      $('upcomingEmpty').textContent = error.message;
      $('upcomingEmpty').hidden = false;
    }
  }

  function renderCommunity() {
    if (!community) return;
    const detail = $('communityDetail');
    detail.hidden = false;
    $('communityName').textContent = community.name;
    $('communityMeta').textContent = [community.sport, community.location, `${community.member_count} ${t('members', 'أعضاء')}`,
      community.visibility === 'private' ? t('Private', 'خاص') : t('Public', 'عام')].filter(Boolean).join(' · ');
    $('communityDescription').textContent = community.description;
    $('communityRules').textContent = community.rules ? `${t('Rules', 'القواعد')}: ${community.rules}` : '';
    const cover = $('communityCover');
    cover.style.backgroundImage = community.has_cover
      ? `linear-gradient(#091d2166,#091d2166),url('${base}/api/communities/${community.id}/cover')`
      : '';
    const viewer = community.viewer || {};
    const join = $('joinButton');
    join.textContent = viewer.member ? t('Leave community', 'اترك المجتمع')
      : viewer.membership_status === 'pending' ? t('Request pending', 'الطلب قيد المراجعة')
        : t('Join community', 'انضم للمجتمع');
    join.disabled = viewer.membership_status === 'pending' || viewer.owner;
    $('communityLeaders').textContent = viewer.role
      ? `${t('Your role', 'دورك')}: ${viewer.role}`
      : t('Join to post, chat and RSVP.', 'انضم للنشر والمحادثة وتأكيد الحضور.');
    document.querySelector('[data-community-tab="manage"]').hidden = !viewer.can_manage;
    $('moderatorForm').hidden = !viewer.owner;
    $('chatForm').hidden = !viewer.member;
    const composer = $('composerCommunityLabel');
    composer.textContent = `${t('Posting to', 'النشر في')}: ${community.name}`;

    const settings = community.notificationPrefs || {};
    $('muteCommunity').checked = Boolean(settings.muted);
    $('activityCommunity').checked = settings.activity_enabled !== 0;
    $('eventsCommunity').checked = settings.event_reminders !== 0;

    $('editCommunityName').value = community.name;
    $('editCommunityDescription').value = community.description;
    $('editCommunityLocation').value = community.location || '';
    $('editCommunityVisibility').value = community.visibility;
    $('editCommunityRules').value = community.rules || '';
  }

  async function openCommunity(id, options = {}) {
    if (!id) return;
    try {
      const data = await api(`/communities/${id}`);
      community = data.community;
      community.notificationPrefs = data.notifications || {};
      community.moderators = data.moderators || [];
      community.members = data.members || [];
      setUrl(id);
      renderCommunity();
      announceCommunity(id);
      if (!options.keepTab) selectTab('feed');
      if (community.viewer?.member) await refreshMemberViews();
      $('communityDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      detailNotice(error.message);
      if (community?.id === id) {
        community = null;
        $('communityDetail').hidden = true;
        setUrl('');
        announceCommunity('');
      }
    }
  }

  async function refreshMemberViews() {
    if (!community) return;
    await Promise.allSettled([loadEvents(), loadMessages(), loadMembers(), loadSettings(), loadUnread()]);
  }

  async function createCommunity(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const created = await api('/communities', {
        method: 'POST',
        body: {
          name: $('newCommunityName').value,
          sport: $('newCommunitySport').value,
          description: $('newCommunityDescription').value,
          location: $('newCommunityLocation').value,
          visibility: $('newCommunityVisibility').value,
          rules: $('newCommunityRules').value,
        },
      });
      const cover = $('newCommunityCover').files?.[0];
      if (cover && ['image/jpeg', 'image/png', 'image/webp'].includes(cover.type) && cover.size <= 1000000) {
        await api(`/communities/${created.community.id}/cover`, { method: 'PUT', headers: { 'content-type': cover.type }, body: cover });
      }
      form.reset();
      await loadCommunities();
      await openCommunity(created.community.id);
      discoverNotice(t('Community created and active now.', 'تم إنشاء المجتمع وتفعيله الآن.'));
    } catch (error) { $('createCommunityNotice').textContent = error.message; }
    finally { submit.disabled = false; }
  }

  async function toggleJoin() {
    if (!community) return;
    try {
      await api(`/communities/${community.id}/join`, {
        method: community.viewer?.member ? 'DELETE' : 'POST',
        body: community.viewer?.member ? undefined : {},
      });
      await openCommunity(community.id, { keepTab: true });
      await loadCommunities();
    } catch (error) { detailNotice(error.message); }
  }

  function eventCard(event) {
    const card = node('article', undefined, 'card');
    card.dataset.userContent = '';
    card.append(node('strong', event.title || t('Community event', 'فعالية مجتمعية')));
    card.append(node('p', event.body));
    card.append(node('small', [formatDate(event.starts_at), event.location || event.online_details, `${t('Going', 'مشارك')}: ${event.going || 0}`].filter(Boolean).join(' · ')));
    const actions = node('div', undefined, 'inline-actions');
    if (community?.viewer?.can_manage) {
      actions.append(button(t('Cancel occurrence', 'ألغِ الموعد'), async () => {
        try {
          await api(`/communities/${community.id}/posts/${event.id}`, {
            method: 'PATCH', body: { cancel: true, body: event.body },
          });
          await refreshMemberViews();
          window.MZActiveCommunity?.refreshFeed();
        } catch (error) { detailNotice(error.message); }
      }, 'button small alt'));
      if (event.series_id) actions.append(button(t('Cancel series', 'ألغِ السلسلة'), async () => {
        try {
          await api(`/communities/${community.id}/events/series/${event.series_id}/cancel`, { method: 'POST', body: {} });
          await refreshMemberViews();
          window.MZActiveCommunity?.refreshFeed();
        } catch (error) { detailNotice(error.message); }
      }, 'button small alt'));
    }
    actions.append(button(t('Report', 'ابلغ'), () => reportEntity('post', event.id), 'button small alt'));
    card.append(actions);
    return card;
  }

  async function loadEvents() {
    if (!community) return;
    try {
      const data = await api(`/communities/${community.id}/events`);
      const events = data.events || [];
      $('communityEventList').replaceChildren(...events.map(eventCard));
      $('communityEventEmpty').hidden = events.length > 0;
    } catch (error) { $('communityEventEmpty').textContent = error.message; }
  }

  async function createEvent(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!$('communityEventStarts').value) return;
    const starts = new Date($('communityEventStarts').value).toISOString();
    const place = $('communityEventLocation').value.trim();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await api(`/communities/${community.id}/posts`, {
        method: 'POST',
        body: {
          kind: 'group_session', title: $('communityEventTitle').value, body: $('communityEventBody').value,
          sport: community.sport, starts_at: starts, starts_at_local: $('communityEventStarts').value,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Qatar',
          location: place.includes('://') ? '' : place,
          online_details: place.includes('://') ? place : '',
          capacity: $('communityEventCapacity').value ? Number($('communityEventCapacity').value) : undefined,
          repeat_weekly: $('communityEventRepeat').checked,
        },
      });
      form.reset();
      await refreshMemberViews();
      window.MZActiveCommunity?.refreshFeed();
      await loadUpcoming();
      detailNotice(t('Event created.', 'تم إنشاء الفعالية.'));
    } catch (error) { detailNotice(error.message); }
    finally { submit.disabled = false; }
  }

  async function loadMessages() {
    if (!community) return;
    try {
      const data = await api(`/communities/${community.id}/messages?limit=40`);
      const messages = data.messages || [];
      const root = $('chatList');
      root.replaceChildren(...messages.map((item) => {
        const row = node('div', undefined, `chat-row${item.sender_user_id === window.MZActiveCommunity?.userId ? ' mine' : ''}`);
        const head = node('div', undefined, 'team-head');
        head.append(node('strong', item.sender_name || t('Member', 'عضو')), node('small', formatDate(item.created_at)));
        row.append(head);
        if (item.body) row.append(node('p', item.body));
        if (item.has_photo) {
          const image = node('img');
          image.loading = 'lazy';
          image.alt = t('Community chat photo', 'صورة محادثة المجتمع');
          image.src = `${base}/api/communities/${community.id}/messages/${item.id}/photo`;
          row.append(image);
        }
        const actions = node('div', undefined, 'inline-actions');
        actions.append(button(t('Report', 'ابلغ'), () => reportEntity('message', item.id), 'button small alt'));
        if (item.sender_user_id === window.MZActiveCommunity?.userId || community.viewer?.can_manage) {
          actions.append(button(t('Delete', 'احذف'), async () => {
            try {
              await api(`/communities/${community.id}/messages/${item.id}`, { method: 'DELETE' });
              await loadMessages();
            } catch (error) { $('chatNotice').textContent = error.message; }
          }, 'button small alt'));
        }
        row.append(actions);
        return row;
      }));
      $('chatEmpty').hidden = messages.length > 0;
      lastChatId = messages[messages.length - 1]?.id || '';
    } catch (error) { $('chatNotice').textContent = error.message; }
  }

  async function pollMessages() {
    if (!community || !community.viewer?.member || tab !== 'chat' || document.visibilityState !== 'visible') return;
    try {
      const data = await api(`/communities/${community.id}/messages?limit=40`);
      const messages = data.messages || [];
      if (messages.length && messages[messages.length - 1].id !== lastChatId) await loadMessages();
      await loadUnread();
    } catch { /* polling must stay quiet */ }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const input = $('chatInput'), file = $('chatPhoto').files?.[0];
    const body = input.value.trim();
    if (!body && !file) return;
    const submit = event.currentTarget.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      let created;
      if (body) created = await api(`/communities/${community.id}/messages`, { method: 'POST', body: { body } });
      if (file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 1000000) {
        if (created) await api(`/communities/${community.id}/messages/${created.id}/photo`, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
        else await api(`/communities/${community.id}/messages/photo`, { method: 'POST', headers: { 'content-type': file.type }, body: file });
      }
      input.value = '';
      $('chatPhoto').value = '';
      await loadMessages();
    } catch (error) { $('chatNotice').textContent = error.message; }
    finally { submit.disabled = false; }
  }

  async function loadMembers() {
    if (!community) return;
    try {
      const data = await api(`/communities/${community.id}/members`);
      const members = data.members || [];
      $('communityMemberList').replaceChildren(...members.map((member) => {
        const row = node('div', undefined, 'member-row');
        const left = node('div');
        left.append(node('strong', member.display_name || t('Member', 'عضو')), node('small', member.role));
        row.append(left);
        if (community.viewer?.owner && member.role !== 'owner') {
          row.append(button(member.role === 'moderator' ? t('Remove moderator', 'أزل المراجع') : t('Make moderator', 'اجعله مراجعاً'), async () => {
            try {
              await api(`/communities/${community.id}/members/${member.user_id}/moderator`, {
                method: 'POST', body: { role: member.role === 'moderator' ? 'member' : 'moderator' },
              });
              await loadMembers();
            } catch (error) { detailNotice(error.message); }
          }, 'button small alt'));
        }
        return row;
      }));
    } catch (error) { detailNotice(error.message); }
  }

  async function loadSettings() {
    if (!community || !community.viewer?.member) return;
    try {
      const data = await api(`/communities/${community.id}/notifications`);
      const prefs = data.notifications || {};
      $('muteCommunity').checked = Boolean(prefs.muted);
      $('activityCommunity').checked = prefs.activity_enabled !== 0;
      $('eventsCommunity').checked = prefs.event_reminders !== 0;
      unreadCount = Number(prefs.unread_messages || 0);
      const chatTab = document.querySelector('[data-community-tab="chat"]');
      if (chatTab) chatTab.textContent = `${t('Group chat', 'محادثة المجموعة')}${unreadCount ? ` (${unreadCount})` : ''}`;
    } catch { /* settings remain at defaults */ }
  }

  async function loadUnread() { await loadSettings(); }

  async function saveSettings() {
    try {
      await api(`/communities/${community.id}/notifications`, {
        method: 'PATCH',
        body: {
          muted: $('muteCommunity').checked,
          activity_enabled: $('activityCommunity').checked,
          event_reminders: $('eventsCommunity').checked,
          mark_read: tab === 'chat',
        },
      });
      await loadSettings();
      detailNotice(t('Preferences saved.', 'تم حفظ التفضيلات.'));
    } catch (error) { detailNotice(error.message); }
  }

  async function loadAudit() {
    if (!community?.viewer?.can_manage) return;
    try {
      const data = await api(`/admin/communities/${community.id}/audit`);
      $('communityAuditWrap').hidden = false;
      $('communityAuditList').replaceChildren(...(data.audit || []).map((item) => {
        const row = node('div', undefined, 'member-row');
        row.append(node('strong', item.action), node('small', `${formatDate(item.created_at)} · ${item.entity_type}`));
        return row;
      }));
    } catch { $('communityAuditWrap').hidden = true; }
  }

  async function editCommunity(event) {
    event.preventDefault();
    try {
      await api(`/communities/${community.id}`, {
        method: 'PATCH',
        body: {
          name: $('editCommunityName').value, sport: community.sport,
          description: $('editCommunityDescription').value, location: $('editCommunityLocation').value,
          visibility: $('editCommunityVisibility').value, rules: $('editCommunityRules').value,
        },
      });
      const cover = $('editCommunityCover').files?.[0];
      if (cover && ['image/jpeg', 'image/png', 'image/webp'].includes(cover.type) && cover.size <= 1000000) {
        await api(`/communities/${community.id}/cover`, { method: 'PUT', headers: { 'content-type': cover.type }, body: cover });
      }
      await openCommunity(community.id, { keepTab: true });
      await loadCommunities();
      detailNotice(t('Community updated.', 'تم تحديث المجتمع.'));
    } catch (error) { detailNotice(error.message); }
  }

  async function setModerator(event) {
    event.preventDefault();
    try {
      await api(`/communities/${community.id}/members/${$('moderatorUserId').value.trim()}/moderator`, {
        method: 'POST', body: { role: $('moderatorRole').value },
      });
      $('moderatorUserId').value = '';
      await loadMembers();
      detailNotice(t('Member role updated.', 'تم تحديث دور العضو.'));
    } catch (error) { detailNotice(error.message); }
  }

  function selectTab(name) {
    tab = name;
    document.querySelectorAll('[data-community-tab]').forEach((item) => {
      item.setAttribute('aria-selected', item.dataset.communityTab === name ? 'true' : 'false');
    });
    $('communityEventsPanel').hidden = name !== 'events';
    $('communityChatPanel').hidden = name !== 'chat';
    $('communityMembersPanel').hidden = name !== 'members';
    $('communitySettingsPanel').hidden = name !== 'settings';
    $('communityManagePanel').hidden = name !== 'manage';
    if (!community) return;
    if (name === 'feed') $('feed').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (name === 'events') loadEvents();
    if (name === 'chat') { loadMessages().then(() => api(`/communities/${community.id}/notifications`, { method: 'PATCH', body: { mark_read: true } }).then(loadUnread).catch(() => {})); }
    if (name === 'members') loadMembers();
    if (name === 'settings') loadSettings();
    if (name === 'manage') loadAudit();
  }

  function applySession() {
    token = currentToken();
    currentUserId = '';
    $('createCommunityForm').hidden = !token;
    $('createPrompt').hidden = Boolean(token);
    if (!token && $('communityScope').value === 'mine') $('communityScope').value = 'discover';
    if (token) api('/me/community').then(data => { currentUserId = data.user_id || ''; }).catch(() => {});
    loadCommunities();
    loadUpcoming();
    const requested = new URL(window.location.href).searchParams.get('community');
    if (requested) openCommunity(requested);
  }

  ['communitySearch', 'communitySport', 'communityLocation', 'communityScope'].forEach((id) => {
    $(id).addEventListener(id === 'communitySearch' ? 'input' : 'change', loadCommunities);
  });
  $('createCommunityForm').addEventListener('submit', createCommunity);
  $('joinButton').addEventListener('click', toggleJoin);
  $('reportCommunityButton').addEventListener('click', () => community && reportEntity('community', community.id));
  $('shareCommunityButton').addEventListener('click', () => {
    if (!community) return;
    const url = new URL(window.location.href);
    url.searchParams.set('community', community.id);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url.href).then(() => detailNotice(t('Link copied.', 'تم نسخ الرابط.'))).catch(() => detailNotice(url.href));
    else detailNotice(url.href);
  });
  document.querySelectorAll('[data-community-tab]').forEach((item) => item.addEventListener('click', () => selectTab(item.dataset.communityTab)));
  $('communityEventForm').addEventListener('submit', createEvent);
  $('chatForm').addEventListener('submit', sendMessage);
  $('saveCommunitySettings').addEventListener('click', saveSettings);
  $('communityEditForm').addEventListener('submit', editCommunity);
  $('moderatorForm').addEventListener('submit', setModerator);
  document.addEventListener('mzactive:language-change', () => { applyLabels(); if (community) renderCommunity(); });
  window.addEventListener('storage', (event) => { if (event.key === key) applySession(); });

  window.MZActiveCommunity = {
    get id() { return community?.id || ''; },
    get name() { return community?.name || ''; },
    get userId() { return currentUserId; },
    get canManage() { return Boolean(community?.viewer?.can_manage); },
    get isMember() { return Boolean(community?.viewer?.member); },
    reportEntity,
    refreshFeed() { window.dispatchEvent(new CustomEvent('mzactive:community-refresh')); },
    refresh() { if (community) openCommunity(community.id, { keepTab: true }); },
  };
  chatTimer = window.setInterval(pollMessages, 10000);
  applyLabels();
  applySession();
})();

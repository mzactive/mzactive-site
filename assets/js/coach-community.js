(() => {
  const $ = id => document.getElementById(id);
  const base = window.MZACTIVE_API_BASE;
  const key = 'mzactive-provider-session';
  const language = window.MZActiveLanguage;
  const t = (en, ar) => language?.get?.() === 'ar' ? ar : en;
  let token = '';
  let communities = [];

  const node = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text !== undefined && text !== null) item.textContent = String(text);
    if (className) item.className = className;
    return item;
  };

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}), accept: 'application/json', authorization: `Bearer ${token}` };
    let body = options.body;
    if (body !== undefined && !(body instanceof Blob)) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${path}`, { ...options, headers, body, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch { /* empty response */ }
    if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: response.status });
    return data;
  }

  function status(target, message) {
    if (target) target.textContent = message;
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat(language?.get?.() === 'ar' ? 'ar-QA' : 'en-QA',
        { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch { return String(value); }
  }

  function roleLabel(role) {
    return ({ owner: t('Owner', 'المالك'), moderator: t('Moderator', 'المراجع'), member: t('Member', 'عضو') })[role] || role || '';
  }

  function renderCommunities() {
    const list = $('coachCommunityList');
    if (!list) return;
    list.replaceChildren(...communities.map(item => {
      const row = node('div', undefined, 'card');
      row.append(node('strong', item.name));
      row.append(node('small', [item.sport, item.visibility === 'private' ? t('Private', 'خاص') : t('Public', 'عام'),
        `${item.member_count || 0} ${t('members', 'أعضاء')}`, roleLabel(item.role)].filter(Boolean).join(' · ')));
      return row;
    }));
    const postTarget = $('coachCommunityPostTarget'), eventTarget = $('coachEventCommunity');
    if (postTarget) {
      postTarget.replaceChildren(...communities.filter(item => item.role).map(item => {
        const option = node('option', item.name);
        option.value = item.id;
        return option;
      }));
    }
    if (eventTarget) {
      const publicOption = node('option', t('Public MZ Active event', 'فعالية عامة لـ MZ Active'));
      publicOption.value = '';
      eventTarget.replaceChildren(publicOption, ...communities.filter(item => item.role).map(item => {
        const option = node('option', item.name);
        option.value = item.id;
        return option;
      }));
    }
  }

  async function loadEvents() {
    const root = $('coachEventList');
    if (!root) return;
    try {
      const data = await api('/api/me/community/events');
      const events = data.events || [];
      root.replaceChildren(...events.map(event => {
        const row = node('div', undefined, 'card');
        row.dataset.userContent = '';
        row.append(node('strong', event.title || event.body.slice(0, 80)));
        row.append(node('small', [formatDate(event.starts_at), event.location || event.online_details,
          event.recurrence === 'weekly' ? t('Weekly series', 'سلسلة أسبوعية') : '',
          event.cancelled_at ? t('Cancelled', 'ملغى') : t('Scheduled', 'مجدولة')].filter(Boolean).join(' · ')));
        row.append(node('p', event.body));
        const actions = node('div', undefined, 'inline-actions');
        const button = node('button', event.cancelled_at ? t('Restore', 'استعادة') : t('Cancel event', 'ألغِ الفعالية'));
        button.type = 'button';
        button.className = 'secondary';
        button.addEventListener('click', async () => {
          try {
            await api(`/api/me/community/events/${encodeURIComponent(event.id)}`, {
              method: event.cancelled_at ? 'PATCH' : 'DELETE',
              body: event.cancelled_at ? { cancelled: false } : undefined,
            });
            await loadEvents();
          } catch (error) { status($('coachCommunityEventStatus'), error.message); }
        });
        actions.append(button);
        row.append(actions);
        return row;
      }));
      $('coachEventEmpty').hidden = events.length > 0;
    } catch (error) {
      status($('coachCommunityEventStatus'), error.message);
    }
  }

  async function createPost(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const created = await api('/api/me/community/posts', {
        method: 'POST',
        body: {
          community_id: $('coachCommunityPostTarget').value,
          kind: 'post',
          body: $('coachCommunityPostBody').value.trim(),
          sport: $('coachCommunityPostSport').value,
          language: language?.get?.() === 'ar' ? 'ar' : 'en',
        },
      });
      const files = [...($('coachCommunityPostPhotos').files || [])].slice(0, 3);
      for (const [index, file] of files.entries()) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1000000) continue;
        const response = await fetch(`${base}/api/community/posts/${encodeURIComponent(created.id)}/photos/${index + 1}`, {
          method: 'PUT',
          headers: { authorization: `Bearer ${token}` },
          body: file,
        });
        if (!response.ok) throw new Error('photo_upload_failed');
      }
      form.reset();
      status($('coachCommunityPostStatus'), created.status === 'published'
        ? t('Post published.', 'تم نشر المنشور.')
        : t('Post submitted for review.', 'تم إرسال المنشور للمراجعة.'));
    } catch (error) {
      status($('coachCommunityPostStatus'), error.message === 'membership_required'
        ? t('Join the selected community before posting there.', 'انضم إلى المجتمع المحدد قبل النشر فيه.')
        : error.message);
    } finally { button.disabled = false; }
  }

  async function createEvent(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const start = $('coachEventStart').value;
    if (!start) return;
    const place = $('coachEventLocation').value.trim();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/me/community/events', {
        method: 'POST',
        body: {
          kind: 'group_session',
          community_id: $('coachEventCommunity').value || undefined,
          title: $('coachEventTitle').value.trim(),
          body: $('coachEventBody').value.trim(),
          starts_at: new Date(start).toISOString(),
          starts_at_local: start,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Qatar',
          location: place.includes('://') ? '' : place,
          online_details: place.includes('://') ? place : '',
          capacity: $('coachEventCapacity').value ? Number($('coachEventCapacity').value) : undefined,
          repeat_weekly: $('coachEventRepeat').checked,
          language: language?.get?.() === 'ar' ? 'ar' : 'en',
        },
      });
      form.reset();
      status($('coachCommunityEventStatus'), t('Event created.', 'تم إنشاء الفعالية.'));
      await loadEvents();
    } catch (error) {
      status($('coachCommunityEventStatus'), error.message === 'membership_required'
        ? t('Join the selected community before hosting there.', 'انضم إلى المجتمع المحدد قبل استضافة فعالية فيه.')
        : error.message);
    } finally { button.disabled = false; }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    token = localStorage.getItem(key) || sessionStorage.getItem(key) || '';
    if (!token || !$('coachCommunityPanel')) return;
    try {
      const access = await api('/api/me/community');
      if (!access.can_create_event) return;
      communities = access.communities || [];
      $('coachCommunityPanel').hidden = false;
      status($('coachCommunityStatus'), communities.length
        ? t('Your communities are listed below. Events can also be public without a community.', 'مجتمعاتك أدناه. يمكن أن تكون الفعاليات عامة دون مجتمع.')
        : t('You have not joined a community yet. Public events are still available.', 'لم تنضم إلى مجتمع بعد. الفعاليات العامة متاحة.'));
      renderCommunities();
      await loadEvents();
      $('coachCommunityPostForm').addEventListener('submit', createPost);
      $('coachCommunityEventForm').addEventListener('submit', createEvent);
    } catch {
      $('coachCommunityPanel').hidden = true;
    }
  });
})();

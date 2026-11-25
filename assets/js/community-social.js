(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const language = window.MZActiveLanguage;
  const t = (en, ar) => language?.get() === 'ar' ? ar : en;
  const token = () => sessionStorage.getItem('mzactive-provider-session') || localStorage.getItem('mzactive-provider-session') || '';

  function openComposer(kind) {
    const text = $('fbComposerText'), body = $('postBody'), form = $('postForm');
    if (text && body && text.value.trim()) {
      body.value = text.value.trim();
      text.value = '';
    }
    if (!token()) {
      $('signInPrompt')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!form) return;
    if (form.hidden) {
      $('postAccessNotice')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (kind === 'activity') {
      $('postKind').value = 'post';
      $('postKind').dispatchEvent(new Event('change', { bubbles: true }));
      $('activityMetrics').open = true;
      const now = new Date();
      $('activityDate').value = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
    } else if (kind === 'post') {
      $('postKind').value = 'post';
      $('postKind').dispatchEvent(new Event('change', { bubbles: true }));
      $('activityMetrics').open = false;
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (kind === 'photo') $('postPhotos')?.click();
    else if (kind === 'event') {
      const select = $('postKind');
      if (select) { select.value = 'event'; select.dispatchEvent(new Event('change', { bubbles: true })); }
      $('postBody')?.focus();
    } else $('postBody')?.focus();
  }

  async function loadBlogs() {
    const root = $('communityBlogs');
    if (!root || root.dataset.loaded) return;
    root.dataset.loaded = 'true';
    try {
      const response = await fetch(`${window.MZACTIVE_API_BASE}/api/blog/posts`, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('blog_unavailable');
      const posts = (await response.json()).posts || [];
      root.replaceChildren();
      for (const post of posts) {
        const card = document.createElement('article');
        card.className = 'card feed-card';
        card.dataset.userContent = '';
        const heading = document.createElement('strong');
        heading.textContent = post.title;
        const summary = document.createElement('p');
        summary.textContent = post.summary || '';
        const author = document.createElement('small');
        author.textContent = post.coach_name || '';
        const link = document.createElement('a');
        link.className = 'text-link';
        link.href = `blog.html?slug=${encodeURIComponent(post.slug || post.id || '')}`;
        link.textContent = t('Read article ↗', 'اقرأ المقال ↗');
        card.append(heading, summary, author, link);
        root.append(card);
      }
      $('communityBlogsEmpty').hidden = root.children.length > 0;
    } catch {
      $('communityBlogsEmpty').hidden = false;
    }
  }

  function selectTab(key, button) {
    for (const item of document.querySelectorAll('#communitySocialTabs [data-feed-tab]')) {
      item.setAttribute('aria-selected', String(item === button));
    }
    const feed = $('feedList'), blogs = $('communityBlogs');
    if (blogs) blogs.hidden = key !== 'blogs';
    if ($('communityBlogsEmpty')) $('communityBlogsEmpty').hidden = key !== 'blogs';
    if (feed) feed.hidden = key === 'blogs';
    if ($('feedEmpty')) $('feedEmpty').hidden = key === 'blogs';
    if (key === 'groups') {
      $('discover')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (key === 'blogs') { loadBlogs(); return; }
    if (key === 'challenges' && $('feedKind')) {
      $('feedKind').value = 'challenge';
      $('feedKind').dispatchEvent(new Event('change', { bubbles: true }));
    } else if (key === 'feed' && $('feedKind')) {
      $('feedKind').value = '';
      $('feedKind').dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function ready(callback) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  }

  ready(() => {
    for (const button of document.querySelectorAll('#communitySocialTabs [data-feed-tab]')) {
      button.addEventListener('click', () => selectTab(button.dataset.feedTab, button));
    }
    for (const button of document.querySelectorAll('[data-compose]')) {
      button.addEventListener('click', event => {
        if (button.tagName === 'A') return;
        event.preventDefault();
        openComposer(button.dataset.compose);
      });
    }
    document.addEventListener('mzactive:language-change', () => {
      const root = $('communityBlogs');
      if (root?.dataset.loaded) { delete root.dataset.loaded; loadBlogs(); }
    });
  });
})();

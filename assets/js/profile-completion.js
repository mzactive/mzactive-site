(() => {
  const API = window.MZACTIVE_API_BASE || '';
  const lang = window.MZActiveLanguage;
  const t = (en, ar) => lang?.get?.() === 'ar' ? ar : en;
  const tokenKey = 'mzactive-provider-session';

  const labels = {
    display_name: ['Display name', 'الاسم المعروض'],
    email: ['Account email', 'بريد الحساب'],
    bio: ['Biography and coaching experience', 'النبذة وخبرات التدريب'],
    specialties: ['Specialties', 'التخصصات'],
    services: ['Public services', 'الخدمات المنشورة'],
    qualifications: ['Qualifications', 'المؤهلات'],
    license_number: ['Professional license number', 'رقم الترخيص المهني'],
    license_issuer: ['License issuer', 'جهة الترخيص'],
    profile_photo: ['Profile photo', 'صورة الملف الشخصي'],
    cover_photo: ['Cover photo', 'صورة الغلاف'],
    location: ['City or area', 'المدينة أو المنطقة'],
    experience: ['Experience in years', 'سنوات الخبرة'],
    languages: ['Languages', 'اللغات'],
    whatsapp_number: ['WhatsApp number', 'رقم واتساب'],
    social_links: ['Social links', 'روابط التواصل'],
  };
  // Private CVs are never part of public completeness. Cover photo has no
  // direct field in the provider editor, so it is not offered as a checklist
  // item. Qualifications are optional and are checked separately at approval.
  const hiddenRecommendations = new Set(['cv', 'qualifications', 'cover_photo']);

  function token() {
    return localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey) || '';
  }

  function element(tag, className, textValue) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined) node.append(document.createTextNode(textValue));
    return node;
  }

  function clampPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
  }

  function labelFor(key) {
    const pair = labels[key] || [key, key];
    return t(pair[0], pair[1]);
  }

  function inEditor() {
    return Boolean(document.getElementById('profileEditor'));
  }

  function completionLink(key, action) {
    const link = element('a', null, labelFor(key));
    link.href = inEditor() && key !== 'email'
      ? '#completion-' + key
      : key === 'email' ? 'account.html' : 'providers.html?edit=profile#completion-' + key;
    link.dataset.completionKey = key;
    link.append(element('span', null, action));
    link.onclick = event => {
      if (inEditor() && key !== 'email') event.preventDefault();
      focusWhenReady(key);
    };
    return link;
  }

  function render(host, completion) {
    const percent = clampPercent(completion?.percent);
    if (!completion) {
      host.replaceChildren(element('p', 'profile-completion-note', t(
        'No coach profile found yet.',
        'لم يتم إنشاء ملف مدرب بعد.',
      )));
      return;
    }
    const required = Array.isArray(completion.required) ? completion.required : [];
    const recommended = (Array.isArray(completion.recommended) ? completion.recommended : [])
      .filter(key => !hiddenRecommendations.has(key) && !required.includes(key))
      .slice(0, 3);
    const complete = Boolean(completion.complete) || (!required.length && percent === 100);

    const head = element('div', 'profile-completion-head');
    head.append(
      element('h3', null, t('Profile completion', 'اكتمال الملف')),
      element('strong', 'profile-completion-percent', percent + '%'),
    );
    const track = element('div', 'profile-completion-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(percent));
    track.setAttribute('aria-label', t('Profile completion', 'اكتمال الملف'));
    const fill = element('div', 'profile-completion-fill');
    fill.style.width = percent + '%';
    track.append(fill);

    host.replaceChildren(head, track);
    host.append(element('p', 'profile-completion-note', t(
      'Required public-profile details only. Your private CV and optional qualifications do not lower this score. Approval and licence verification are handled separately.',
      'تشمل التفاصيل المطلوبة للملف العام فقط. لا تؤثر السيرة الذاتية الخاصة والمؤهلات الاختيارية في هذه النسبة. تتم المراجعة والتحقق من الترخيص بشكل منفصل.',
    )));

    if (complete) {
      host.append(element('p', 'profile-completion-done', t(
        'Your public profile is complete. Thank you for keeping it clear for athletes.',
        'ملفك العام مكتمل. شكراً لحرصك على وضوحه للرياضيين.',
      )));
      return;
    }

    const list = element('ul', 'profile-completion-list');
    for (const key of required) {
      const item = element('li');
      item.append(completionLink(key, t('Fix', 'إصلاح')));
      list.append(item);
    }
    for (const key of recommended) {
      const item = element('li');
      item.append(completionLink(key, t('Optional', 'اختياري')));
      list.append(item);
    }
    if (list.children.length) {
      host.append(element('p', 'profile-completion-kicker', t('What to do next', 'الخطوة التالية')));
      host.append(list);
    }
  }

  function unavailable(host) {
    host.replaceChildren(element('p', 'profile-completion-note', t(
      'Profile completion is unavailable. Please refresh.',
      'اكتمال الملف غير متاح حالياً. يرجى التحديث.',
    )));
  }

  async function refresh() {
    const hosts = [...document.querySelectorAll('[data-profile-completion]')];
    if (!hosts.length) return;
    if (!token()) {
      for (const host of hosts) {
        host.replaceChildren(element('p', 'profile-completion-note', t(
          'Sign in to see your profile completion.',
          'سجّل الدخول لمعرفة اكتمال ملفك.',
        )));
      }
      return;
    }
    let completion = null;
    try {
      const response = await fetch(API + '/api/me/completeness', {
        headers: { accept: 'application/json', authorization: 'Bearer ' + token() },
      });
      if (!response.ok) throw Error('completion_unavailable');
      const data = await response.json();
      completion = data.completeness || null;
    } catch {
      for (const host of hosts) unavailable(host);
      return;
    }
    for (const host of hosts) render(host, completion);
  }

  function focus(key) {
    const field = document.querySelector('[data-completion-field="' + key + '"]');
    if (!field || !field.getClientRects().length) return false;
    field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    field.focus({ preventScroll: true });
    field.classList.add('completion-target-flash');
    window.setTimeout(() => field.classList.remove('completion-target-flash'), 1800);
    return true;
  }

  function focusWhenReady(key, attempts = 0) {
    if (focus(key)) return;
    if (attempts < 40) window.setTimeout(() => focusWhenReady(key, attempts + 1), 150);
  }

  function focusFromHash() {
    const match = /^#completion-([a-z_]+)$/.exec(location.hash || '');
    if (match) focusWhenReady(match[1]);
  }

  window.MZActiveProfileCompletion = { refresh, focus, focusWhenReady, focusFromHash };

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('[data-profile-completion]')) return;
    refresh();
    focusFromHash();
    document.addEventListener('mzactive:language-change', () => { refresh(); focusFromHash(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('pageshow', refresh);
    window.addEventListener('hashchange', focusFromHash);
  });
})();

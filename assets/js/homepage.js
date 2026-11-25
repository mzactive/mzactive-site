(() => {
  const menuButton = document.getElementById('menuToggle');
  const navigation = document.getElementById('mainNavigation');
  const setMenuOpen = open => {
    if (!menuButton || !navigation) return;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', document.documentElement.lang === 'ar' ? 'قائمة التنقل' : 'Navigation menu');
    navigation.classList.toggle('is-open', open);
  };

  if (menuButton && navigation) {
    menuButton.addEventListener('click', () => {
      setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
    });
    navigation.addEventListener('click', event => {
      if (event.target.closest('a')) setMenuOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') setMenuOpen(false);
    });
    document.addEventListener('mzactive:language-change', () => {
      setMenuOpen(menuButton.getAttribute('aria-expanded') === 'true');
    });
  }

  const directory = document.getElementById('featuredCoachGrid');
  if (directory) {
    const api = window.MZACTIVE_API_BASE;
    const locationList = document.getElementById('coachLocations');
    const labels = {
      en: {
        loading: 'Loading approved coaches…',
        unavailable: 'Approved coach profiles are temporarily unavailable. Please try the directory again later.',
        empty: 'There are no approved coach profiles to feature right now.',
        coach: 'Sports Coach',
        pacer: 'Champion Pacer',
        location: 'Location not listed',
        view: 'View profile'
      },
      ar: {
        loading: 'جارٍ تحميل المدربين المعتمدين…',
        unavailable: 'ملفات المدربين المعتمدة غير متاحة مؤقتاً. يرجى تجربة الدليل لاحقاً.',
        empty: 'لا توجد حالياً ملفات مدربين معتمدة لعرضها.',
        coach: 'مدرب رياضي',
        pacer: 'مرافق جري',
        location: 'الموقع غير مذكور',
        view: 'عرض الملف'
      }
    };
    let lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
    let profiles = null;
    let directoryError = false;
    const currentLabels = () => labels[lang];
    const node = (tag, className, text) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const authoredNode = (tag, className, text) => {
      const element = node(tag, className, text);
      element.dataset.languageSkip = '';
      return element;
    };
    const ICONS = {
      pin: '<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
      check: '<path d="M9.6 16.6 5 12l1.4-1.4 3.2 3.2L17.6 6 19 7.4 9.6 16.6Z"/>'
    };
    const icon = (name, className) => {
      const wrap = node('span', className);
      wrap.setAttribute('aria-hidden', 'true');
      wrap.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
      return wrap;
    };

    function renderFeatured() {
      directory.replaceChildren();
      if (profiles === null) {
        directory.append(node('p', 'directory-status', currentLabels().loading));
        return;
      }
      if (directoryError) {
        directory.append(node('p', 'directory-status', currentLabels().unavailable));
        return;
      }
      if (!profiles.length) {
        directory.append(node('p', 'directory-status', currentLabels().empty));
        return;
      }

      for (const profile of profiles.slice(0, 4)) {
        const publicFields = new Set(Array.isArray(profile.public_fields) ? profile.public_fields : []);
        const card = node('a', 'coach-card');
        const brand = node('img', 'smart-card-brand');
        brand.src = 'assets/brand/mzactive-logo.webp';
        brand.alt = '';
        card.append(brand);
        if (profile.has_profile_photo && publicFields.has('profile_photo')) {
          const image = node('img', 'coach-card-photo');
          image.src = `${api}/api/providers/${encodeURIComponent(profile.id)}/photo?v=${encodeURIComponent(profile.profile_photo_updated_at || '')}`;
          image.alt = lang === 'ar' ? `صورة الملف الشخصي لـ ${profile.display_name}` : `${profile.display_name} profile photo`;
          image.loading = 'lazy';
          image.addEventListener('error', () => {
            image.replaceWith(makePhotoPlaceholder());
          }, { once: true });
          card.append(image);
        } else {
          card.append(makePhotoPlaceholder());
        }

        const info = node('div', 'coach-info');
        if (profile.verified === true) {
          const badge = node('span', 'coach-verified');
          badge.append(icon('check', 'badge-icon'), node('span', '', lang === 'ar' ? 'معتمد' : 'Verified'));
          info.append(badge);
        }
        const category = lang === 'ar' ? profile.professional_category?.ar : profile.professional_category?.en;
        const type = category || (profile.provider_type === 'pacer' ? currentLabels().pacer : currentLabels().coach);
        info.append(authoredNode('h3', '', profile.display_name));
        info.append(node('p', 'coach-type', type));

        const specialties = publicFields.has('specialties') && Array.isArray(profile.specialties)
          ? profile.specialties.filter(Boolean).slice(0, 2).join(' · ') : '';
        if (specialties) info.append(authoredNode('p', 'coach-specialty', specialties));
        if (publicFields.has('city')) {
          const location = [profile.city, profile.country].filter(Boolean).join(', ');
          const row = authoredNode('p', 'coach-location', location || currentLabels().location);
          row.prepend(icon('pin', 'coach-fact-icon'));
          info.append(row);
        }
        if (publicFields.has('experience_years') && Number(profile.experience_years) > 0) {
          const row = authoredNode('p', 'coach-experience', `${profile.experience_years} ${lang === 'ar' ? 'سنوات خبرة' : 'years exp.'}`);
          row.prepend(icon('clock', 'coach-fact-icon'));
          info.append(row);
        }
        if (publicFields.has('languages') && Array.isArray(profile.languages) && profile.languages.length) {
          const row = authoredNode('p', 'coach-languages', profile.languages.slice(0, 3).join(' · '));
          row.prepend(icon('globe', 'coach-fact-icon'));
          info.append(row);
        }
        if (publicFields.has('services') && Array.isArray(profile.services) && profile.services.length) {
          const row = authoredNode('p', 'coach-services', profile.services.slice(0, 2).join(' · '));
          row.prepend(icon('list', 'coach-fact-icon'));
          info.append(row);
        }
        info.append(node('span', 'coach-view', currentLabels().view + ' ↗'));
        card.append(info);

        card.href = `coach.html?id=${encodeURIComponent(profile.id)}`;
        card.setAttribute('aria-label', currentLabels().view + ' · ' + profile.display_name);
        directory.append(card);
      }
    }

    function makePhotoPlaceholder() {
      const placeholder = node('div', 'coach-card-photo-placeholder');
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.innerHTML = '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="13" r="7"></circle><path d="M7 35c1-8 6-12 13-12s12 4 13 12"></path></svg>';
      return placeholder;
    }

    renderFeatured();
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;
    fetch(`${api}/api/providers`, controller ? { signal: controller.signal } : {})
      .finally(() => { if (timeout) clearTimeout(timeout); })
      .then(response => {
        if (!response.ok) throw new Error(`provider_directory_http_${response.status}`);
        return response.json();
      })
      .then(data => {
        if (!Array.isArray(data.providers)) throw new Error('provider_directory_invalid_response');
        profiles = data.providers;
        directoryError = false;
        const locations = new Set();
        for (const profile of profiles) {
          if (!Array.isArray(profile.public_fields) || !profile.public_fields.includes('city')) continue;
          const label = [profile.city, profile.country].filter(Boolean).join(', ');
          if (label) locations.add(label);
        }
        locationList?.replaceChildren(...[...locations].sort().map(label => {
          const option = document.createElement('option');
          option.value = label;
          return option;
        }));
        renderFeatured();
      })
      .catch(error => {
        console.error('Unable to load approved coach profiles:', error);
        profiles = [];
        directoryError = true;
        renderFeatured();
      });

    document.addEventListener('mzactive:language-change', event => {
      lang = event.detail.lang === 'ar' ? 'ar' : 'en';
      renderFeatured();
    });
  }

  const joinDialog = document.getElementById('joinDialog');
  if (joinDialog && typeof joinDialog.showModal === 'function') {
    const closeButton = document.getElementById('joinDialogClose');
    const hasActiveSession = () => {
      try {
        return Boolean(
          localStorage.getItem('mzactive-provider-session') ||
          sessionStorage.getItem('mzactive-provider-session')
        );
      } catch {
        return false;
      }
    };
    const hasBeenSeen = () => {
      try {
        return localStorage.getItem('mzactive-join-dialog-seen') === '1';
      } catch {
        return false;
      }
    };
    const rememberDismissal = () => {
      try {
        localStorage.setItem('mzactive-join-dialog-seen', '1');
      } catch {
        // The dialog remains usable when browser storage is unavailable.
      }
    };

    closeButton.addEventListener('click', () => joinDialog.close());
    joinDialog.addEventListener('click', event => {
      if (event.target === joinDialog) joinDialog.close();
    });
    joinDialog.addEventListener('close', rememberDismissal);
    joinDialog.querySelectorAll('a').forEach(link => link.addEventListener('click', rememberDismissal));

    if (!hasActiveSession() && !hasBeenSeen()) {
      window.setTimeout(() => {
        if (!hasActiveSession() && !hasBeenSeen() && !joinDialog.open) joinDialog.showModal();
      }, 10_000);
    }
  }
})();

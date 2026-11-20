(() => {
  const byId = id => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('id') || '';
  const endpoint = window.MZACTIVE_API_BASE + '/api/providers/' + encodeURIComponent(id);
  const language = window.MZActiveLanguage;
  const t = (en, ar) => language.get() === 'ar' ? ar : en;
  let profile, error;
  function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }
  function render() {
    for (const node of document.querySelectorAll('[data-en]')) node.textContent = node.dataset[language.get()];
    byId('language').textContent = t('العربية','English');
    byId('notice').textContent = error === 404 ? t('This profile is unavailable.','هذا الملف غير متاح.')
      : error ? t('Could not load this profile. Please try again.','تعذر تحميل الملف. يرجى المحاولة مجدداً.')
      : profile ? '' : t('Loading profile…','جارٍ تحميل الملف…');
    if (!profile) return;
    const p = profile;
    document.title = p.display_name + ' | MZ Active';
    document.querySelector('article').hidden = false;
    byId('name').textContent = p.display_name;
    byId('sports').textContent = p.specialties.join(' · ');
    byId('location').textContent = [p.city,p.country].filter(Boolean).join(t(', ','، '));
    if (p.has_profile_photo) {
      const photo = byId('portrait');
      photo.alt = p.display_name;
      photo.onerror = () => { photo.hidden = true; };
      photo.hidden = false;
      photo.src = endpoint + '/photo?v=' + encodeURIComponent(p.profile_photo_updated_at || '');
    }
    byId('book').href = 'pacer.html?provider=' + encodeURIComponent(id) + '#request';
    const contact = byId('contact');
    const number = String(p.whatsapp_number || '').replace(/\D/g,'');
    const social = p.social_links.find(url => /^https:\/\//i.test(url));
    contact.href = number ? 'https://wa.me/' + number : social || 'https://wa.me/97466297954?text=' +
      encodeURIComponent(t('I would like to contact ','أرغب في التواصل مع ') + p.display_name + ' · ' + location.href);
    if (!number && !social) contact.textContent = t('Contact via MZ Active','تواصل عبر MZ Active');
    const facts = byId('facts'), sections = byId('sections');
    facts.replaceChildren(); sections.replaceChildren();
    function fact(label, value) {
      if (!value) return;
      const item = element('div');
      item.append(element('dt',label),element('dd',value)); facts.append(item);
    }
    if (p.verified) fact(t('Verification','التحقق'),t('Verified Coach','مدرب موثّق'));
    fact(t('Coaching','نوع التدريب'), {online:t('Online','عن بُعد'),'in-person':t('In person','حضوري'),both:t('Online and in person','عن بُعد وحضوري')}[p.coaching_mode]);
    fact(t('Experience','الخبرة'), p.experience_years > 0 && p.experience_years + t(' years',' سنوات'));
    fact(t('Languages','اللغات'), p.languages.join(' · '));
    fact(t('Indicative rate','السعر الاسترشادي'), p.indicative_rate_qar && p.indicative_rate_qar + t(' QAR',' ر.ق.'));
    fact(t('Program lengths','مدد البرامج'),p.program_durations.map(n=>n+t(' mo',' شهر')).join(' · '));
    function section(label, content) { sections.append(element('h2',label),content); }
    if (p.bio) section(t('About me','نبذة عني'),element('p',p.bio));
    if (p.qualifications) section(t('Qualifications','المؤهلات'),element('p',p.qualifications));
    if (p.services.length) {
      const list = element('ul');
      for (const service of p.services) list.append(element('li',service));
      section(t('Coaching services','خدمات التدريب'),list);
    }
    if (p.social_links.length) {
      const links = element('ul');
      for (const href of p.social_links) {
        if (!/^https:\/\//i.test(href)) continue;
        const item = element('li'), link = element('a',new URL(href).hostname);
        link.href = href; item.append(link); links.append(item);
      }
      section(t('Coach links','روابط المدرب'),links);
    }
    if (p.gallery_slots.length) {
      const gallery = element('div'); gallery.className = 'gallery';
      for (const slot of p.gallery_slots) {
        const img = element('img'); img.loading = 'lazy'; img.decoding = 'async';
        img.alt = t('Training photo ','صورة تدريب ') + slot + ' · ' + p.display_name;
        img.src = endpoint + '/gallery/' + slot; gallery.append(img);
      }
      section(t('Training gallery','معرض صور التدريب'),gallery);
    }
  }
  byId('language').onclick = () => language.set(t('ar','en'),{manual:true});
  document.addEventListener('mzactive:language-change',render);
  byId('share').onclick = async () => {
    const url = new URL('coach.html',location.href); url.searchParams.set('id',id);
    try {
      if (navigator.share) await navigator.share({title:document.title,url:url.href});
      else { await navigator.clipboard.writeText(url.href); byId('shared').textContent = t('Link copied.','تم نسخ الرابط.'); }
    } catch (err) { if (err.name !== 'AbortError') byId('shared').textContent = url.href; }
  };
  async function load() {
    render();
    if (!/^[\w-]{36}$/.test(id)) error = 404;
    else try {
      const response = await fetch(endpoint);
      if (response.ok) profile = (await response.json()).provider;
      else error = response.status;
    } catch { error = 503; }
    render();
  }
  load();
})();

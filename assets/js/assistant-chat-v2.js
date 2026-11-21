(() => {
  if (document.getElementById('mz-assistant')) return;
  const API = window.MZACTIVE_API_BASE;
  const style = document.createElement('style');
  style.textContent = `#mz-assistant{position:fixed;inset-inline-end:calc(16px + env(safe-area-inset-right));inset-block-end:calc(74px + env(safe-area-inset-bottom));z-index:1000;font:13px/1.5 Arial,sans-serif;color:#f0f5f3}#mz-assistant *{box-sizing:border-box}#mz-assistant button,#mz-assistant textarea{font:inherit}#mz-assistant-toggle{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:7px 12px;border:1px solid #d9ac4c;border-radius:999px;background:#064541;color:#f7f1df;font-size:12px;font-weight:750;line-height:1;box-shadow:0 5px 16px #0005;cursor:pointer}#mz-assistant-toggle:hover{background:#07564f}#mz-assistant-toggle .momo-icon{width:18px;height:18px;flex:none;display:grid;place-items:center;border-radius:50%;background:#f2b718;color:#064541;font-size:11px}#mz-assistant-panel{position:absolute;inset-inline-end:0;inset-block-end:56px;width:min(348px,calc(100vw - 32px));height:min(480px,calc(100dvh - 110px));display:flex;flex-direction:column;background:#103538;border:1px solid #465048;border-radius:14px;box-shadow:0 14px 42px #000a;overflow:hidden}#mz-assistant-panel[hidden]{display:none}#mz-assistant-panel header{padding:12px 14px;background:#205456;border-bottom:1px solid #2e6567;display:flex;justify-content:space-between;align-items:center}#mz-assistant-panel header strong{color:#f2b718}#mz-assistant-close{background:transparent;color:#f0f5f3;border:0;font-size:22px;cursor:pointer}#mz-assistant-note{margin:0;padding:8px 14px;color:#c4cbc5;background:#131a16;font-size:11px;border-bottom:1px solid #2e6567}#mz-assistant-messages{padding:12px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:9px}#mz-assistant-messages p{margin:0;padding:9px 11px;border-radius:10px;max-width:92%;white-space:pre-wrap;overflow-wrap:anywhere}.mz-assistant-user{align-self:flex-end;background:#f2b718;color:#172c28}.mz-assistant-bot{align-self:flex-start;background:#205456;color:#f0f5f3}#mz-assistant-form{padding:10px;display:flex;gap:8px;border-top:1px solid #2e6567}#mz-assistant-input{flex:1;resize:none;min-height:42px;max-height:100px;padding:9px;background:#080b09;color:#fff;border:1px solid #4a554d;border-radius:8px}#mz-assistant-send{border:0;border-radius:8px;background:#f2b718;color:#172c28;font-weight:800;padding:0 13px;cursor:pointer}#mz-assistant-send:disabled{opacity:.55;cursor:wait}@media(max-width:900px){#mz-assistant{position:static;inset:auto;display:flex;justify-content:center;width:100%;margin:0 auto 8px;pointer-events:auto}#mz-assistant-toggle{width:42px;height:42px;min-height:42px;padding:0;justify-content:center}#mz-assistant-toggle .momo-icon{width:20px;height:20px}#mz-assistant-toggle .momo-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}#mz-assistant-panel{position:fixed;inset-inline:12px;inset-block-end:calc(12px + env(safe-area-inset-bottom));width:auto;height:min(62dvh,480px);max-height:calc(100dvh - 40px);border-radius:18px}}`;
  style.textContent += `#mz-assistant-invite{position:absolute;inset-inline-end:0;inset-block-end:56px;width:min(300px,calc(100vw - 32px));background:#103538;border:1px solid #d9ac4c;border-radius:12px;padding:12px;box-shadow:0 12px 30px #000a}#mz-assistant-invite[hidden]{display:none}#mz-assistant-invite strong{display:block;color:#f2b718;margin-bottom:4px}#mz-assistant-invite p{margin:0 0 10px;color:#c4cbc5;font-size:12px}#mz-assistant-invite-actions{display:flex;gap:8px}#mz-assistant-invite-actions button{min-height:44px;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:700}#mz-assistant-invite-accept{background:#f2b718;color:#111;border:0}#mz-assistant-invite-dismiss{background:transparent;color:#f0f5f3;border:1px solid #465048}.mz-assistant-providers{border-top:1px solid #2e6567;margin-top:4px;padding-top:8px}.mz-assistant-providers-title{color:#f2b718;font-weight:700;margin-bottom:4px}.mz-assistant-provider{display:block;padding:5px 0;color:#f0f5f3;text-decoration:underline;overflow-wrap:anywhere}.mz-assistant-suggestions{align-self:flex-start;max-width:92%;padding:9px 11px;border-radius:10px;background:#205456;color:#f0f5f3;overflow-wrap:anywhere}.mz-assistant-suggestions button{display:inline-block;min-height:44px;margin:8px 6px 0 0;padding:8px 10px;border:1px solid #d9ac4c;border-radius:8px;background:transparent;color:#f0f5f3;cursor:pointer;font-weight:700}`;
  document.head.append(style);
  const COPY = {
    en: {
      panel: 'Momo AI help',
      close: 'Close help',
      note: 'Ask about coaches, bookings, or joining. AI answers may be mistaken. Don’t share passwords or sensitive details.',
      input: 'Your message',
      placeholder: 'Type your question…',
      send: 'Send',
      toggle: 'Ask Momo AI',
      greeting: 'Hello! I’m Momo. I can help you find a coach, send a booking request, or set up a coach profile.',
      limit: 'The assistant has reached today’s usage limit. You can still browse the help pages.',
      unavailable: 'The assistant is unavailable right now. Please try again shortly.',
      answerFailed: 'I couldn’t prepare an answer. Please try again.',
      inviteTitle: 'Need a hand finding someone?',
      inviteBody: 'Momo can help you refine your search using real approved profiles.',
      inviteAccept: 'Ask Momo',
      inviteDismiss: 'Not now',
      inviteGreeting: 'Hi! What kind of coach, sport or service are you looking for? I can suggest real approved profiles and help you adjust your search. Use Edit Search or Reset Filters above to try again.',
      suggestionsTitle: 'Real approved profiles',
      noProviders: 'No approved providers are available right now. I can help you explore the other options on the site.',
      noExact: 'I could not find an exact match among the approved profiles. Try a different sport or city, or adjust the search above.',
      showAll: 'Show all approved providers',
      broaden: 'Broaden search',
    },
    ar: {
      panel: 'مساعدة مومو للذكاء الاصطناعي',
      close: 'إغلاق المساعدة',
      note: 'اسأل عن المدربين أو الحجوزات أو الانضمام. قد تكون إجابات الذكاء الاصطناعي غير دقيقة. لا تشارك كلمات المرور أو البيانات الحساسة.',
      input: 'رسالتك',
      placeholder: 'اكتب سؤالك…',
      send: 'إرسال',
      toggle: 'اسأل مومو',
      greeting: 'مرحباً! أنا مومو. يمكنني مساعدتك في العثور على مدرب أو إرسال طلب حجز أو إعداد ملف مدرب.',
      limit: 'وصل المساعد إلى حد الاستخدام اليومي. لا يزال يمكنك تصفح صفحات المساعدة.',
      unavailable: 'المساعد غير متاح حالياً. يُرجى المحاولة بعد قليل.',
      answerFailed: 'لم أتمكن من تجهيز إجابة. يُرجى المحاولة مرة أخرى.',
      inviteTitle: 'هل تحتاج مساعدة في البحث؟',
      inviteBody: 'يمكن لمومو مساعدتك في تحسين بحثك باستخدام ملفات معتمدة حقيقية.',
      inviteAccept: 'اسأل مومو',
      inviteDismiss: 'ليس الآن',
      inviteGreeting: 'مرحباً! ما نوع المدرب أو الرياضة أو الخدمة التي تبحث عنها؟ يمكنني اقتراح ملفات معتمدة حقيقية ومساعدتك في تعديل البحث. استخدم زر تعديل البحث أو إعادة ضبط عوامل التصفية أعلاه للمحاولة مرة أخرى.',
      suggestionsTitle: 'ملفات معتمدة حقيقية',
      noProviders: 'لا يوجد مقدمون معتمدون حالياً. يمكنني مساعدتك في استكشاف الخيارات الأخرى في الموقع.',
      noExact: 'لم أجد تطابقاً مباشراً بين الملفات المعتمدة. جرّب رياضة أو مدينة أخرى، أو عدّل البحث أعلاه.',
      showAll: 'عرض كل الملفات المعتمدة',
      broaden: 'توسيع البحث',
    },
  };
  const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const t = key => COPY[lang()][key];
  const root = document.createElement('div');
  root.id = 'mz-assistant';
  root.innerHTML = `<section id="mz-assistant-panel" aria-label="${COPY.en.panel}" data-en-aria-label="${COPY.en.panel}" data-ar-aria-label="${COPY.ar.panel}" hidden>
    <header><strong>Momo AI</strong><button id="mz-assistant-close" type="button" aria-label="${COPY.en.close}" data-en-aria-label="${COPY.en.close}" data-ar-aria-label="${COPY.ar.close}">×</button></header>
    <p id="mz-assistant-note" data-en="${COPY.en.note}" data-ar="${COPY.ar.note}">${COPY.en.note}</p>
    <div id="mz-assistant-messages" role="log" aria-live="polite"></div>
    <form id="mz-assistant-form"><textarea id="mz-assistant-input" maxlength="1000" rows="1" aria-label="${COPY.en.input}" data-en-aria-label="${COPY.en.input}" data-ar-aria-label="${COPY.ar.input}" placeholder="${COPY.en.placeholder}" data-en-placeholder="${COPY.en.placeholder}" data-ar-placeholder="${COPY.ar.placeholder}" required></textarea><button id="mz-assistant-send" type="submit" data-en="${COPY.en.send}" data-ar="${COPY.ar.send}">${COPY.en.send}</button></form>
  </section><div id="mz-assistant-invite" role="status" aria-live="polite" hidden><strong data-en="Need a hand finding someone?" data-ar="هل تحتاج مساعدة في البحث؟">Need a hand finding someone?</strong><p data-en="Momo can help you refine your search using real approved profiles." data-ar="يمكن لمومو مساعدتك في تحسين بحثك باستخدام ملفات معتمدة حقيقية.">Momo can help you refine your search using real approved profiles.</p><div id="mz-assistant-invite-actions"><button id="mz-assistant-invite-accept" type="button" data-en="Ask Momo" data-ar="اسأل مومو">Ask Momo</button><button id="mz-assistant-invite-dismiss" type="button" data-en="Not now" data-ar="ليس الآن">Not now</button></div></div><button id="mz-assistant-toggle" type="button" aria-expanded="false" aria-label="${COPY.en.toggle}"><span class="momo-icon" aria-hidden="true">✦</span><span class="momo-label" data-en="${COPY.en.toggle}" data-ar="${COPY.ar.toggle}">${COPY.en.toggle}</span></button>`;
  document.body.append(root);
  const panel = root.querySelector('#mz-assistant-panel');
  const toggle = root.querySelector('#mz-assistant-toggle');
  const label = toggle.querySelector('.momo-label');
  const close = root.querySelector('#mz-assistant-close');
  const note = root.querySelector('#mz-assistant-note');
  const form = root.querySelector('#mz-assistant-form');
  const input = root.querySelector('#mz-assistant-input');
  const send = root.querySelector('#mz-assistant-send');
  const messages = root.querySelector('#mz-assistant-messages');
  const invite = root.querySelector('#mz-assistant-invite');
  const inviteAccept = root.querySelector('#mz-assistant-invite-accept');
  const inviteDismiss = root.querySelector('#mz-assistant-invite-dismiss');
  const INVITE_KEY = 'mzactive-momo-invite-shown';
  let providerData = [];
  function setInviteCopy() {
    const current = lang();
    invite.querySelector('strong').textContent = COPY[current].inviteTitle;
    invite.querySelector('p').textContent = COPY[current].inviteBody;
    inviteAccept.textContent = COPY[current].inviteAccept;
    inviteDismiss.textContent = COPY[current].inviteDismiss;
  }
  function applyCopy() {
    const current = lang();
    setInviteCopy();
    panel.setAttribute('aria-label', COPY[current].panel);
    close.setAttribute('aria-label', COPY[current].close);
    note.textContent = COPY[current].note;
    input.setAttribute('aria-label', COPY[current].input);
    input.setAttribute('placeholder', COPY[current].placeholder);
    send.textContent = send.disabled ? '…' : COPY[current].send;
    label.textContent = COPY[current].toggle;
    toggle.setAttribute('aria-label', COPY[current].toggle);
    messages.querySelectorAll('[data-momo-key]').forEach(item => {
      item.textContent = COPY[current][item.dataset.momoKey];
    });
  }
  function updateDirection() {
    root.dir = document.documentElement.dir || 'ltr';
    applyCopy();
  }
  updateDirection();
  new MutationObserver(updateDirection).observe(document.documentElement, { attributes: true, attributeFilter: ['dir', 'lang'] });
  document.addEventListener('mzactive:language-change', applyCopy);
  function addMessage(role, content, key) {
    const item = document.createElement('p');
    item.className = role === 'user' ? 'mz-assistant-user' : 'mz-assistant-bot';
    if (key) {
      item.dataset.momoKey = key;
      item.dataset.en = COPY.en[key];
      item.dataset.ar = COPY.ar[key];
      item.textContent = COPY[lang()][key];
    } else {
      item.textContent = content;
    }
    messages.append(item);
    messages.scrollTop = messages.scrollHeight;
  }
  addMessage('assistant', '', 'greeting');
  function setOpen(open) { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) input.focus(); }
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || send.disabled) return;
    input.value = '';
    addMessage('user', message);
    send.disabled = true;
    send.textContent = '…';
    try {
      const response = await fetch(`${API}/api/assistant/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, history: history.slice(-4) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        addMessage('assistant', '', data.error === 'daily_limit_reached' ? 'limit' : 'unavailable');
        return;
      }
      const answer = typeof data.answer === 'string' ? data.answer : t('answerFailed');
      addMessage('assistant', answer);
      history.push({ role: 'user', content: message }, { role: 'assistant', content: answer });
    } catch {
      addMessage('assistant', '', 'unavailable');
    } finally {
      send.disabled = false;
      send.textContent = COPY[lang()].send;
      input.focus();
    }
  });
  function storedInviteState() {
    try { return sessionStorage.getItem(INVITE_KEY); } catch { return null; }
  }
  function markInviteState(value) {
    try { sessionStorage.setItem(INVITE_KEY, value); } catch {}
  }
  function hideInvite() { invite.hidden = true; }
  function openAssistance(detail) {
    providerData = Array.isArray(detail?.providers) ? detail.providers.filter(item => item && /^[A-Za-z0-9_-]+$/.test(String(item.id || '')) && typeof item.display_name === 'string') : [];
    hideInvite();
    setOpen(true);
    addMessage('assistant', '', detail?.reason === 'no-providers' ? 'noProviders' : 'noExact');
    addMessage('assistant', '', 'inviteGreeting');
    if (providerData.length) {
      const block = document.createElement('div');
      block.className = 'mz-assistant-suggestions';
      const title = document.createElement('div');
      title.className = 'mz-assistant-providers-title';
      title.textContent = t('suggestionsTitle');
      block.append(title);
      for (const provider of providerData.slice(0, 4)) {
        const link = document.createElement('a');
        link.className = 'mz-assistant-provider';
        link.href = `/coach.html?id=${encodeURIComponent(String(provider.id))}`;
        link.textContent = `${provider.display_name} ↗`;
        block.append(link);
      }
      const broaden = document.createElement('button');
      broaden.type = 'button';
      broaden.dataset.momoKey = 'broaden';
      broaden.textContent = t('broaden');
      broaden.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('mzactive:assistant-apply-filters', { detail: { q: '', sport: '', country: '', location: '', mode: '', type: '' } }));
        hideInvite();
      });
      block.append(broaden);
      messages.append(block);
      messages.scrollTop = messages.scrollHeight;
    }
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.dataset.momoKey = 'showAll';
    reset.textContent = t('showAll');
    reset.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('mzactive:assistant-reset-filters'));
      hideInvite();
    });
    const resetRow = document.createElement('div');
    resetRow.className = 'mz-assistant-suggestions';
    resetRow.append(reset);
    messages.append(resetRow);
    messages.scrollTop = messages.scrollHeight;
  }
  document.addEventListener('mzactive:assistant-search-no-results', event => {
    if (storedInviteState() === 'dismissed') return;
    if (!invite.hidden || storedInviteState() === 'shown') return;
    markInviteState('shown');
    providerData = Array.isArray(event.detail?.providers) ? event.detail.providers : [];
    const context = {
      reason: event.detail?.reason || (providerData.length ? 'no-exact' : 'no-providers'),
      providers: providerData.slice(0, 6).map(item => ({ id: item.id, display_name: item.display_name })),
    };
    try { sessionStorage.setItem('mzactive-momo-invite-context', JSON.stringify(context)); } catch {}
    setInviteCopy();
    invite.hidden = false;
  });
  document.addEventListener('mzactive:assistant-search-success', hideInvite);
  inviteAccept.addEventListener('click', () => {
    let detail = { providers: providerData, reason: providerData.length ? 'no-exact' : 'no-providers' };
    try { detail = JSON.parse(sessionStorage.getItem('mzactive-momo-invite-context') || 'null') || detail; } catch {}
    openAssistance(detail);
  });
  inviteDismiss.addEventListener('click', () => {
    markInviteState('dismissed');
    hideInvite();
  });
  document.addEventListener('mzactive:assistant-apply-filters', event => {
    if (!event.detail || typeof event.detail !== 'object') return;
    providerData = Array.isArray(event.detail.providers) ? event.detail.providers : providerData;
  });
})();

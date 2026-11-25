(() => {
  'use strict';
  const signup = document.getElementById('eventAlertSignup');
  if (!signup) return;
  const status = document.getElementById('eventAlertStatus');
  const authActions = document.getElementById('communityAuthActions');
  const token = () => window.MZActiveAuth?.token() || sessionStorage.getItem('mzactive-provider-session') || localStorage.getItem('mzactive-provider-session') || '';
  const hasSession = Boolean(token());
  signup.hidden = !hasSession;
  authActions.hidden = hasSession;
  const endpoint = window.MZACTIVE_API_BASE + '/api/community/event-alerts';
  const messages = {
    waiting: ['Please wait…', 'يرجى الانتظار…'],
    signup: ['Check your email to confirm your subscription. If you already confirmed, you’re subscribed.', 'افتح بريدك الإلكتروني لتأكيد الاشتراك. إذا أكّدت اشتراكك سابقاً، فهو مفعّل.'],
    confirm: ['You’re subscribed. We’ll email you when a new event is announced.', 'تم تأكيد اشتراكك. سنرسل إليك بريداً عند الإعلان عن فعالية جديدة.'],
    unsubscribe: ['You’ve been unsubscribed from event alerts.', 'تم إلغاء اشتراكك في تنبيهات الفعاليات.'],
    unauthorized: ['Sign in to subscribe to event emails.', 'سجّل الدخول للاشتراك في رسائل الفعاليات.'],
    invalid_token: ['This link is invalid or has expired. You can sign up again below.', 'هذا الرابط غير صالح أو منتهي الصلاحية. يمكنك الاشتراك مجدداً أدناه.'],
    rate_limited: ['Too many attempts. Please try again later.', 'محاولات كثيرة. يرجى المحاولة لاحقاً.'],
    failed: ['We couldn’t complete your request. Please try again shortly.', 'تعذّر إتمام طلبك. يرجى المحاولة بعد قليل.'],
  };
  let message = '';
  const language = () => window.MZActiveLanguage.get() === 'ar' ? 'ar' : 'en';
  function paint(key = message) {
    message = key;
    status.textContent = messages[key]?.[language() === 'ar' ? 1 : 0] || '';
  }
  async function submit(path, body) {
    const response = await fetch(endpoint + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(!path && token() ? { authorization: 'Bearer ' + token() } : {}) },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'failed');
  }

  signup.addEventListener('click', async () => {
    if (signup.disabled) return;
    signup.disabled = true;
    paint('waiting');
    try {
      await submit('', {language: language()});
      paint('signup');
    } catch (error) {
      paint(messages[error.message] ? error.message : 'failed');
      if(error.message==='unauthorized'){signup.hidden=true;authActions.hidden=false}
    } finally {
      signup.disabled = false;
    }
  });
  document.addEventListener('mzactive:language-change', () => paint());

  const actionLink = /^#(confirm|unsubscribe)-event-email=([0-9a-f-]{36})$/i.exec(location.hash);
  if (actionLink) {
    const [, action, token] = actionLink;
    document.getElementById('join').scrollIntoView({ block:'start' });
    signup.disabled = true;
    paint('waiting');
    submit('/' + action, {token}).then(() => {
      history.replaceState(null, '', location.pathname + location.search + '#join');
      paint(action);
    }).catch(error => paint(messages[error.message] ? error.message : 'failed')).finally(() => {
      signup.disabled = false;
    });
  }
})();

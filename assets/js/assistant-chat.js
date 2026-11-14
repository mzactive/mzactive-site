(() => {
  if (document.getElementById('mz-assistant')) return;
  const API = 'https://mzactive-marketplace-api.mzactive5.workers.dev';
  const style = document.createElement('style');
  style.textContent = `#mz-assistant{position:fixed;inset:auto 20px 86px auto;z-index:1000;font:14px/1.5 Arial,sans-serif;color:#f4f3ed}#mz-assistant[dir=rtl]{inset-inline:auto 20px}#mz-assistant *{box-sizing:border-box}#mz-assistant button,#mz-assistant textarea{font:inherit}#mz-assistant-toggle{border:0;border-radius:28px;background:#efb82f;color:#111;font-weight:800;padding:13px 18px;box-shadow:0 8px 28px #0008;cursor:pointer}#mz-assistant-panel{position:absolute;inset:auto 0 64px auto;width:min(360px,calc(100vw - 32px));height:min(520px,calc(100dvh - 110px));display:flex;flex-direction:column;background:#101513;border:1px solid #465048;border-radius:14px;box-shadow:0 16px 50px #000b;overflow:hidden}#mz-assistant-panel[hidden]{display:none}#mz-assistant-panel header{padding:14px 16px;background:#171e1a;border-bottom:1px solid #303a34;display:flex;justify-content:space-between;align-items:center}#mz-assistant-panel header strong{color:#efb82f}#mz-assistant-close{background:transparent;color:#f4f3ed;border:0;font-size:22px;cursor:pointer}#mz-assistant-note{margin:0;padding:8px 14px;color:#c4cbc5;background:#131a16;font-size:11px;border-bottom:1px solid #303a34}#mz-assistant-messages{padding:12px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:9px}#mz-assistant-messages p{margin:0;padding:9px 11px;border-radius:10px;max-width:92%;white-space:pre-wrap;overflow-wrap:anywhere}.mz-assistant-user{align-self:flex-end;background:#efb82f;color:#111}.mz-assistant-bot{align-self:flex-start;background:#202923;color:#f4f3ed}#mz-assistant-form{padding:10px;display:flex;gap:8px;border-top:1px solid #303a34}#mz-assistant-input{flex:1;resize:none;min-height:42px;max-height:100px;padding:9px;background:#080b09;color:#fff;border:1px solid #4a554d;border-radius:8px}#mz-assistant-send{border:0;border-radius:8px;background:#efb82f;color:#111;font-weight:800;padding:0 13px;cursor:pointer}#mz-assistant-send:disabled{opacity:.55;cursor:wait}@media(max-width:480px){#mz-assistant{inset-inline:12px;bottom:78px}#mz-assistant-toggle{float:inline-end}#mz-assistant-panel{position:fixed;inset:auto 12px 74px;width:auto;height:min(70dvh,560px)}}`;
  document.head.append(style);
  const root = document.createElement('div');
  root.id = 'mz-assistant';
  const updateDirection = () => { root.dir = document.documentElement.dir || 'ltr'; };
  updateDirection();
  new MutationObserver(updateDirection).observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
  root.innerHTML = `<section id="mz-assistant-panel" aria-label="MZ Active help" hidden><header><strong>MZ Active Help</strong><button id="mz-assistant-close" type="button" aria-label="Close help">×</button></header><p id="mz-assistant-note">Ask about coaches, bookings, or joining. AI answers may be mistaken. Don’t share passwords or sensitive details.</p><div id="mz-assistant-messages" role="log" aria-live="polite"></div><form id="mz-assistant-form"><textarea id="mz-assistant-input" maxlength="1000" rows="1" aria-label="Your message" placeholder="Type your question…" required></textarea><button id="mz-assistant-send" type="submit">Send</button></form></section><button id="mz-assistant-toggle" type="button" aria-expanded="false">Ask MZ Active</button>`;
  document.body.append(root);
  const panel = root.querySelector('#mz-assistant-panel');
  const toggle = root.querySelector('#mz-assistant-toggle');
  const close = root.querySelector('#mz-assistant-close');
  const form = root.querySelector('#mz-assistant-form');
  const input = root.querySelector('#mz-assistant-input');
  const send = root.querySelector('#mz-assistant-send');
  const messages = root.querySelector('#mz-assistant-messages');
  const history = [];
  function addMessage(role, content) {
    const item = document.createElement('p');
    item.className = role === 'user' ? 'mz-assistant-user' : 'mz-assistant-bot';
    item.textContent = content;
    messages.append(item);
    messages.scrollTop = messages.scrollHeight;
  }
  addMessage('assistant', 'Hello! I can help you find a coach, send a booking request, or set up a coach profile.');
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
        const messageText = data.error === 'daily_limit_reached'
          ? 'The assistant has reached today’s usage limit. You can still browse the help pages.'
          : 'The assistant is unavailable right now. Please try again shortly.';
        addMessage('assistant', messageText);
        return;
      }
      const answer = typeof data.answer === 'string' ? data.answer : 'I couldn’t prepare an answer. Please try again.';
      addMessage('assistant', answer);
      history.push({ role: 'user', content: message }, { role: 'assistant', content: answer });
    } catch {
      addMessage('assistant', 'The assistant is unavailable right now. Please try again shortly.');
    } finally {
      send.disabled = false;
      send.textContent = 'Send';
      input.focus();
    }
  });
})();

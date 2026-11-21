(() => {
  if (document.getElementById('mz-assistant')) return;
  const API = window.MZACTIVE_API_BASE;
  const style = document.createElement('style');
  style.textContent = `#mz-assistant{position:fixed;inset-inline-end:calc(16px + env(safe-area-inset-right));inset-block-end:calc(74px + env(safe-area-inset-bottom));z-index:1000;font:13px/1.5 Arial,sans-serif;color:#f0f5f3}#mz-assistant *{box-sizing:border-box}#mz-assistant button,#mz-assistant textarea{font:inherit}#mz-assistant-toggle{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:7px 12px;border:1px solid #d9ac4c;border-radius:999px;background:#064541;color:#f7f1df;font-size:12px;font-weight:750;line-height:1;box-shadow:0 5px 16px #0005;cursor:pointer}#mz-assistant-toggle:hover{background:#07564f}#mz-assistant-toggle .momo-icon{width:18px;height:18px;flex:none;display:grid;place-items:center;border-radius:50%;background:#f2b718;color:#064541;font-size:11px}#mz-assistant-panel{position:absolute;inset-inline-end:0;inset-block-end:56px;width:min(348px,calc(100vw - 32px));height:min(480px,calc(100dvh - 110px));display:flex;flex-direction:column;background:#103538;border:1px solid #465048;border-radius:14px;box-shadow:0 14px 42px #000a;overflow:hidden}#mz-assistant-panel[hidden]{display:none}#mz-assistant-panel header{padding:12px 14px;background:#205456;border-bottom:1px solid #2e6567;display:flex;justify-content:space-between;align-items:center}#mz-assistant-panel header strong{color:#f2b718}#mz-assistant-close{background:transparent;color:#f0f5f3;border:0;font-size:22px;cursor:pointer}#mz-assistant-note{margin:0;padding:8px 14px;color:#c4cbc5;background:#131a16;font-size:11px;border-bottom:1px solid #2e6567}#mz-assistant-messages{padding:12px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:9px}#mz-assistant-messages p{margin:0;padding:9px 11px;border-radius:10px;max-width:92%;white-space:pre-wrap;overflow-wrap:anywhere}.mz-assistant-user{align-self:flex-end;background:#f2b718;color:#172c28}.mz-assistant-bot{align-self:flex-start;background:#205456;color:#f0f5f3}#mz-assistant-form{padding:10px;display:flex;gap:8px;border-top:1px solid #2e6567}#mz-assistant-input{flex:1;resize:none;min-height:42px;max-height:100px;padding:9px;background:#080b09;color:#fff;border:1px solid #4a554d;border-radius:8px}#mz-assistant-send{border:0;border-radius:8px;background:#f2b718;color:#172c28;font-weight:800;padding:0 13px;cursor:pointer}#mz-assistant-send:disabled{opacity:.55;cursor:wait}@media(max-width:900px){#mz-assistant{position:static;inset:auto;display:flex;justify-content:center;width:100%;margin:0 auto 8px;pointer-events:auto}#mz-assistant-toggle{width:42px;height:42px;min-height:42px;padding:0;justify-content:center}#mz-assistant-toggle .momo-icon{width:20px;height:20px}#mz-assistant-toggle .momo-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}#mz-assistant-panel{position:fixed;inset-inline:12px;inset-block-end:calc(12px + env(safe-area-inset-bottom));width:auto;height:min(62dvh,480px);max-height:calc(100dvh - 40px);border-radius:18px}}`;
  document.head.append(style);
  const root = document.createElement('div');
  root.id = 'mz-assistant';
  root.innerHTML = `<section id="mz-assistant-panel" aria-label="Momo AI help" hidden><header><strong>Momo AI</strong><button id="mz-assistant-close" type="button" aria-label="Close help">×</button></header><p id="mz-assistant-note">Ask about coaches, bookings, or joining. AI answers may be mistaken. Don’t share passwords or sensitive details.</p><div id="mz-assistant-messages" role="log" aria-live="polite"></div><form id="mz-assistant-form"><textarea id="mz-assistant-input" maxlength="1000" rows="1" aria-label="Your message" placeholder="Type your question…" required></textarea><button id="mz-assistant-send" type="submit">Send</button></form></section><button id="mz-assistant-toggle" type="button" aria-expanded="false"><span class="momo-icon" aria-hidden="true">✦</span><span class="momo-label">Ask Momo AI</span></button>`;
  document.body.append(root);
  const panel = root.querySelector('#mz-assistant-panel');
  const toggle = root.querySelector('#mz-assistant-toggle');
  const label = toggle.querySelector('.momo-label');
  const close = root.querySelector('#mz-assistant-close');
  const form = root.querySelector('#mz-assistant-form');
  const input = root.querySelector('#mz-assistant-input');
  const send = root.querySelector('#mz-assistant-send');
  const messages = root.querySelector('#mz-assistant-messages');
  const history = [];
  function updateLabels() {
    const arabic = document.documentElement.lang === 'ar';
    const text = arabic ? 'اسأل مومو' : 'Ask Momo AI';
    if (label) label.textContent = text;
    toggle.setAttribute('aria-label', text);
  }
  function updateDirection() {
    root.dir = document.documentElement.dir || 'ltr';
    updateLabels();
  }
  updateDirection();
  new MutationObserver(updateDirection).observe(document.documentElement, { attributes: true, attributeFilter: ['dir', 'lang'] });
  document.addEventListener('mzactive:language-change', updateLabels);
  function addMessage(role, content) {
    const item = document.createElement('p');
    item.className = role === 'user' ? 'mz-assistant-user' : 'mz-assistant-bot';
    item.textContent = content;
    messages.append(item);
    messages.scrollTop = messages.scrollHeight;
  }
  addMessage('assistant', 'Hello! I’m Momo. I can help you find a coach, send a booking request, or set up a coach profile.');
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

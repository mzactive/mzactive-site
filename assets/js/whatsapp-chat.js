(() => {
  if (/\/admin\.html$/i.test(location.pathname)) return;
  document.body.classList.add("has-floating-chat");
  if (document.querySelector(".wa-chat-float")) return;
  const link = document.createElement("a");
  link.className = "wa-chat-float";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5a13.3 13.3 0 0 0-11.4 20.1L3 29l6.6-1.7A13.3 13.3 0 1 0 16 2.5Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12.1 9.8c-.3-.6-.6-.6-.9-.6h-.7c-.3 0-.7.1-1 .5s-1.3 1.2-1.3 3 .1 2.1 1.5 4.3 3.8 4.8 7.5 6.2c3.7 1.4 4.5 1.1 5.3 1s2.6-1.1 2.9-2.1.4-1.9.2-2.1-.4-.3-.9-.6-2.6-1.3-3-1.4-.7-.2-1 .3-1.1 1.4-1.4 1.7-.5.3-.9.1a11.2 11.2 0 0 1-3.3-2 12.3 12.3 0 0 1-2.3-2.9c-.2-.4 0-.6.2-.8s.4-.5.6-.7.3-.4.4-.7 0-.5 0-.7c-.1-.2-.9-2.2-1.3-3Z" fill="currentColor"/></svg><span></span>';
  const style = document.createElement("style");
  style.textContent = "body.has-floating-chat footer{padding-bottom:calc(120px + env(safe-area-inset-bottom))}@media(max-width:900px){body.has-floating-chat footer{padding-bottom:0}}.wa-chat-float{position:fixed;z-index:9999;inset-inline-end:calc(16px + env(safe-area-inset-right));inset-block-end:calc(16px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:7px;min-height:40px;padding:8px 12px;border-radius:999px;background:#25d366;color:#07391d;border:1px solid #8ef0ad;text-decoration:none;font:650 12px/1.2 Inter,'Segoe UI',Arial,Helvetica,sans-serif;box-shadow:0 6px 18px #0004;transition:transform .18s,filter .18s,box-shadow .18s}.wa-chat-float:hover{transform:translateY(-1px);filter:brightness(1.04)}.wa-chat-float svg{width:18px;height:18px;flex:none}.wa-chat-float[aria-disabled=true]{opacity:.6;cursor:default;filter:none;transform:none}@media(max-width:900px){.wa-chat-float{position:static;width:42px;height:42px;min-height:42px;padding:0;justify-content:center;gap:0;margin:0 auto calc(10px + env(safe-area-inset-bottom));box-shadow:0 4px 12px #0003}.wa-chat-float svg{width:20px;height:20px}.wa-chat-float span{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}}";
  document.head.append(style);
  document.body.append(link);
  const contact = window.MZActiveManagementContact;
  function update() {
    const arabic = document.documentElement.lang === "ar";
    const label = arabic ? "تواصل عبر واتساب" : "Chat on WhatsApp";
    const unavailable = arabic ? "واتساب غير متاح" : "WhatsApp unavailable";
    const message = arabic
      ? "مرحباً MZ Active، أود الاستفسار عن خدمات التدريب والجري."
      : "Hello MZ Active, I would like to ask about running and coaching services.";
    const number = contact?.get().whatsapp || "";
    const href = contact ? contact.link(number, message) : "";
    const span = link.querySelector("span");
    if (href) {
      link.href = href;
      link.setAttribute("aria-label", label);
      link.removeAttribute("aria-disabled");
      link.removeAttribute("tabindex");
      if (span) span.textContent = label;
    } else {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.tabIndex = -1;
      link.setAttribute("aria-label", unavailable);
      if (span) span.textContent = unavailable;
    }
  }
  update();
  if (contact) contact.subscribe(update);
  document.addEventListener("mzactive:language-change", update);
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();

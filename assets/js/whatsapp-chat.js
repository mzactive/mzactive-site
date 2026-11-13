(() => {
  if (/\/admin\.html$/i.test(location.pathname) || document.querySelector(".wa-chat-float")) return;
  const link = document.createElement("a");
  link.className = "wa-chat-float";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5a13.3 13.3 0 0 0-11.4 20.1L3 29l6.6-1.7A13.3 13.3 0 1 0 16 2.5Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12.1 9.8c-.3-.6-.6-.6-.9-.6h-.7c-.3 0-.7.1-1 .5s-1.3 1.2-1.3 3 .1 2.1 1.5 4.3 3.8 4.8 7.5 6.2c3.7 1.4 4.5 1.1 5.3 1s2.6-1.1 2.9-2.1.4-1.9.2-2.1-.4-.3-.9-.6-2.6-1.3-3-1.4-.7-.2-1 .3-1.1 1.4-1.4 1.7-.5.3-.9.1a11.2 11.2 0 0 1-3.3-2 12.3 12.3 0 0 1-2.3-2.9c-.2-.4 0-.6.2-.8s.4-.5.6-.7.3-.4.4-.7 0-.5 0-.7c-.1-.2-.9-2.2-1.3-3Z" fill="currentColor"/></svg><span></span>';
  const style = document.createElement("style");
  style.textContent = ".wa-chat-float{position:fixed;z-index:9999;inset-inline-end:18px;inset-block-end:18px;display:flex;align-items:center;gap:9px;padding:11px 16px;border-radius:999px;background:#25d366;color:#07391d;border:1px solid #8ef0ad;text-decoration:none;font:700 14px/1.2 Arial,Helvetica,sans-serif;box-shadow:0 5px 18px #0007;transition:transform .15s,filter .15s}.wa-chat-float:hover{transform:translateY(-2px);filter:brightness(1.04)}.wa-chat-float svg{width:22px;height:22px;flex:none}@media(max-width:480px){.wa-chat-float{inset-inline-end:12px;inset-block-end:12px;font-size:13px;padding:10px 13px}}";
  document.head.append(style);
  document.body.append(link);
  function update() {
    const arabic = document.documentElement.lang === "ar";
    const label = arabic ? "تواصل عبر واتساب" : "Chat on WhatsApp";
    const message = arabic ? "مرحباً MZ Active، أود الاستفسار عن خدمات التدريب والجري." : "Hello MZ Active, I would like to ask about running and coaching services.";
    link.href = "https://wa.me/97466297954?text=" + encodeURIComponent(message);
    link.setAttribute("aria-label", label);
    link.title = label;
    link.querySelector("span").textContent = label;
  }
  update();
  document.addEventListener("mzactive:language-change", update);
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
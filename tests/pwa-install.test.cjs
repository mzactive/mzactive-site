const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const installJs = read('assets/js/pwa-install-v2.js');
const installCss = read('assets/css/pwa-install-v2.css');
const index = read('index.html');
const admin = read('admin.html');
const sw = read('sw.js');
const allHtml = fs.readdirSync(root).filter(file => file.endsWith('.html'));
const pages = [
  ...allHtml.filter(file => file !== 'admin.html' && file !== 'offline.html'),
  '4-week-10k/index.html',
].filter(page => /class="footer-install"/.test(read(page)));

test('MZA install UI uses the browser install contract without pretending', () => {
  assert.match(installJs, /beforeinstallprompt/);
  assert.match(installJs, /event\.preventDefault\(\)/);
  assert.match(installJs, /promptEvent\.prompt/);
  assert.match(installJs, /promptEvent\.userChoice/);
  assert.match(installJs, /outcome === ['"]accepted['"]/);
  assert.match(installJs, /appinstalled/);
  assert.doesNotMatch(installJs, /Installation complete|Install succeeded|App installed successfully/i);
  assert.match(installJs, /Get MZA App/);
  assert.match(installJs, /احصل على تطبيق MZA/);
});

test('iOS Safari, iOS browsers, social browsers and Android guidance are explicit and bilingual', () => {
  assert.match(installJs, /iP\(hone\|od\|ad\)/);
  assert.match(installJs, /IPAD_DESKTOP/);
  assert.match(installJs, /Safari/i);
  assert.match(installJs, /Add to Home Screen/);
  assert.match(installJs, /iosBrowser/);
  assert.match(installJs, /SOCIAL_BROWSER/);
  assert.match(installJs, /FBAN\|FBAV\|Instagram/);
  assert.match(installJs, /WhatsApp\|Viber/);
  assert.match(installJs, /Android/i);
  assert.match(installJs, /Install app/);
  assert.match(installJs, /إضافة إلى الشاشة الرئيسية/);
  assert.match(installJs, /لا يمكن لهذا المتصفح داخل التطبيق تثبيت MZA/);
});

test('install styles are attached by the single install module without blocking the inline homepage CSS', () => {
  assert.match(installJs, /data-mza-install-styles/);
  assert.match(installJs, /pwa-install-v2\.css\?v=20261122a/);
  assert.doesNotMatch(index.slice(0, index.indexOf('</head>')), /<link\b[^>]*rel="stylesheet"/i);
});

test('the promotion never opens itself, and native prompts are click-guarded', () => {
  const activate = installJs.slice(installJs.indexOf('async function activate(event)'), installJs.indexOf('function bindControls()'));
  assert.ok(activate.length > 100, 'click handler missing');
  assert.match(activate, /if \(prompting\) return;/);
  assert.match(activate, /promptEvent\.prompt\?\.\(\)/);
  assert.match(activate, /openInstructions\(trigger, mode\)/);
  const beforeInstall = installJs.slice(installJs.indexOf("window.addEventListener('beforeinstallprompt'"), installJs.indexOf("window.addEventListener('appinstalled'"));
  assert.doesNotMatch(beforeInstall, /\.prompt\(|openInstructions|showModal/);
  const init = installJs.slice(installJs.indexOf('function init()'), installJs.indexOf("window.addEventListener('beforeinstallprompt'"));
  assert.doesNotMatch(init, /openInstructions|\.prompt\(|showModal/);
  assert.match(beforeInstall, /\/\/ Store the browser event; never prompt without the visitor's click\.\s*event\.preventDefault\(\);/);
});

test('dismissal is remembered across local and session storage and leaves a small footer link', () => {
  assert.match(installJs, /mza-install-promo-dismissed/);
  assert.match(installJs, /localStorage\.setItem\(key, '1'\)/);
  assert.match(installJs, /sessionStorage\.setItem\(key, '1'\)/);
  assert.match(installJs, /promo\.hidden = installed \|\| dismissed/);
  assert.match(installJs, /link\.hidden = installed \|\| !dismissed/);
  assert.match(installJs, /dismissed && !button\.hasAttribute\('data-mza-install-link'\)/);
  assert.match(installCss, /\.footer-app-link \{ grid-column: 1 \/ -1;/);
  assert.match(installCss, /\.footer-install-dismiss \{/);
  assert.match(installJs, /Dismiss app promotion/);
  assert.match(installJs, /إخفاء عرض التطبيق/);
});

test('a completed install is remembered, and standalone launches hide install controls', () => {
  assert.match(installJs, /mza-install-installed/);
  assert.match(installJs, /markInstalled\(\)/);
  assert.match(installJs, /display-mode: standalone/);
  assert.match(installJs, /display-mode: minimal-ui/);
  assert.match(installJs, /navigator\.standalone/);
  assert.match(installJs, /getInstalledRelatedApps/);
  assert.match(installJs, /mza-is-installed/);
  assert.match(installJs, /button\.hidden = installed/);
  assert.match(installCss, /\.mza-is-installed \.footer-install,/);
  assert.match(installJs, /dataset\.mzaLaunch = installed \? ['"]standalone['"] : ['"]browser['"]/);
});

test('copy clearly separates the website app from app-store availability', () => {
  assert.match(installJs, /There is no official App Store or Google Play app to download/);
  assert.match(installJs, /لا يوجد تطبيق رسمي للتنزيل من متجر التطبيقات/);
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /Website app — no App Store or Google Play download\./, page);
    assert.match(html, /تطبيق ويب — لا يتطلب تنزيلاً من متجر التطبيقات\./, page);
    assert.doesNotMatch(html, /apps\.apple\.com|play\.google\.com|store-badge|app-store-badge/i, page);
  }
});

test('one controller powers a compact header action and the footer card, never the hero', () => {
  assert.match(installJs, /function injectHeaderControl\(\)/);
  assert.match(installJs, /querySelector\('\.header-actions'\)/);
  assert.match(installJs, /mza-header-install/);
  assert.match(installCss, /\.mza-header-install \{ min-height: 36px/);
  assert.match(installCss, /@media \(max-width: 720px\) \{\s*\.mza-header-install \{ min-height: 44px/);
  const hero = index.slice(index.indexOf('<section class="hero"'), index.indexOf('<section class="search-section"'));
  assert.doesNotMatch(hero, /mza-install-button|data-mza-install-promo|Get MZA App/);
  assert.match(hero, /Find a Coach/);
  assert.match(hero, /Become a Coach/);
  const footer = index.slice(index.indexOf('<footer class="site-footer"'));
  assert.match(footer, /class="footer-install" data-mza-install-promo/);
  assert.match(footer, /class="mza-install-button footer-install-button"/);
  assert.match(footer, /data-en="Get the MZA App" data-ar="احصل على تطبيق MZA"/);
  assert.match(footer, /class="mza-install-button footer-install-button"[^>]*data-en="Get the MZA App"/);
});

test('in-app browsers get a real browser handoff and copy-link fallback', () => {
  assert.match(installJs, /function browserUrl\(\)/);
  assert.match(installJs, /x-safari-https:/);
  assert.match(installJs, /intent:\/\//);
  assert.match(installJs, /package=com\.android\.chrome/);
  assert.match(installJs, /navigator\.clipboard\.writeText/);
  assert.match(installJs, /needsBrowserHandoff = key === 'social' \|\| key === 'ios-browser'/);
  assert.match(installJs, /const openUrl = needsBrowserHandoff \? browserUrl\(\) : null/);
  assert.match(installJs, /dialogOpenLink\.hidden = !openUrl/);
  assert.match(installJs, /dialogCopyLink\.hidden = !openUrl/);
  assert.match(installJs, /Open in browser/);
  assert.match(installJs, /Copy link/);
});

test('instruction dialog works without HTMLDialogElement, stays modal in RTL and uses 44px targets', () => {
  assert.match(installJs, /typeof dialog\.showModal === 'function'/);
  assert.match(installJs, /dialog\.removeAttribute\('open'\)/);
  assert.match(installCss, /\.mza-install-dialog:not\(\[open\]\) \{ display: none; \}/);
  assert.match(installCss, /\.mza-install-dialog\[open\] \{[\s\S]*position: fixed/);
  assert.match(installCss, /\.mza-install-dialog__close \{[\s\S]*inset-inline-end:/);
  assert.match(installCss, /html\[dir="rtl"\] \.mza-install-dialog__panel \{ text-align: right; \}/);
  assert.match(installCss, /\.mza-install-dialog__confirm \{[\s\S]*min-height: 44px/);
  assert.match(installCss, /\.mza-install-dialog__open,[\s\S]*min-height: 44px/);
});

test('public footers use the compact bilingual promotion and one shared module', () => {
  assert.ok(pages.length >= 14);
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<div class="footer-install" data-mza-install-promo/, page);
    assert.match(html, /data-mza-install-dismiss/, page);
    assert.match(html, /data-mza-install-link/, page);
    assert.match(html, /data-en="Get the MZA App" data-ar="احصل على تطبيق MZA"/, page);
    assert.match(html, /class="mza-install-button footer-install-button"[^>]*data-en="Get the MZA App"/, page);
    assert.match(html, /assets\/js\/pwa-install-v2\.js\?v=20261122a/, page);
  }
});

test('the Management Portal has no installation promotion or install script', () => {
  assert.doesNotMatch(admin, /footer-install|pwa-install(?:-v2)?\.js|mza-install-button|data-mza-install/);
});

test('install assets join the offline-safe versioned shell', () => {
  assert.match(sw, /mza-shell-v8/);
  assert.match(sw, /\/assets\/css\/pwa-install-v2\.css\?v=20261122a/);
  assert.match(sw, /\/assets\/js\/pwa-install-v2\.js\?v=20261122a/);
  assert.match(installCss, /#091d21/);
  assert.match(installCss, /#103538/);
  assert.match(installCss, /#f2b718/);
  assert.match(installCss, /#67b9ac/);
  assert.match(installCss, /#172a22/);
});

test('the subdirectory guide uses the same versioned PWA assets as the rest of the site', () => {
  const guide = read('4-week-10k/index.html');
  assert.match(guide, /pwa-register\.js\?v=20261121b/);
  assert.match(guide, /icon-192\.png\?v=20261120c/);
  assert.match(guide, /apple-touch-icon-180\.png\?v=20261120c/);
});

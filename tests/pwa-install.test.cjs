const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const installJs = read('assets/js/pwa-install.js');
const installCss = read('assets/css/pwa-install.css');
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
  assert.match(installJs, /Get the MZA App/);
  assert.match(installJs, /احصل على تطبيق MZA/);
});

test('iOS Safari, social browsers and Android guidance are explicit and bilingual', () => {
  assert.match(installJs, /iP\(hone\|od\|ad\)/);
  assert.match(installJs, /Safari/i);
  assert.match(installJs, /Add to Home Screen/);
  assert.match(installJs, /SOCIAL_BROWSER/);
  assert.match(installJs, /FBAN\|FBAV\|Instagram/);
  assert.match(installJs, /Android/i);
  assert.match(installJs, /Install app/);
  assert.match(installJs, /إضافة إلى الشاشة الرئيسية/);
  assert.match(installJs, /لا يمكن لهذا المتصفح داخل التطبيق تثبيت MZA/);
});

test('install styles are attached by the single install module without blocking the inline homepage CSS', () => {
  assert.match(installJs, /data-mza-install-styles/);
  assert.match(installJs, /pwa-install\.css\?v=20261121c/);
  assert.doesNotMatch(index.slice(0, index.indexOf('</head>')), /<link\b[^>]*rel="stylesheet"/i);
});

test('the promotion never opens itself: prompts require a deliberate click', () => {
  const activate = installJs.slice(installJs.indexOf('async function activate(event)'), installJs.indexOf('function bindControls()'));
  assert.ok(activate.length > 100, 'click handler missing');
  assert.match(activate, /promptEvent\.prompt\?\.\(\)/);
  assert.match(activate, /openInstructions\(trigger,/);
  const beforeInstall = installJs.slice(installJs.indexOf("window.addEventListener('beforeinstallprompt'"), installJs.indexOf("window.addEventListener('appinstalled'"));
  assert.doesNotMatch(beforeInstall, /\.prompt\(|openInstructions|showModal/);
  const init = installJs.slice(installJs.indexOf('function init()'), installJs.indexOf('window.addEventListener(\'beforeinstallprompt\''));
  assert.doesNotMatch(init, /openInstructions|\.prompt\(|showModal/);
  assert.match(beforeInstall, /\/\/ Store the browser event; never prompt without the visitor's click\.\s*event\.preventDefault\(\);/);
});

test('public dismissal is remembered locally and replaced by a small footer link', () => {
  assert.match(installJs, /mza-install-promo-dismissed/);
  assert.match(installJs, /localStorage\.setItem\(PROMO_DISMISSED_KEY,\s*'1'\)/);
  assert.match(installJs, /localStorage\.getItem\(PROMO_DISMISSED_KEY\) === '1'/);
  assert.match(installJs, /promo\.hidden = installed \|\| dismissed/);
  assert.match(installJs, /link\.hidden = installed \|\| !dismissed/);
  assert.match(installCss, /\.footer-app-link \{ grid-column: 1 \/ -1;/);
  assert.match(installCss, /\.footer-install-dismiss \{/);
  assert.match(installJs, /Dismiss app promotion/);
  assert.match(installJs, /إخفاء عرض التطبيق/);
});

test('installed and standalone launches hide install controls', () => {
  assert.match(installJs, /display-mode: standalone/);
  assert.match(installJs, /display-mode: minimal-ui/);
  assert.match(installJs, /navigator\.standalone/);
  assert.match(installJs, /getInstalledRelatedApps/);
  assert.match(installJs, /mza-is-installed/);
  assert.match(installJs, /button\.hidden = installed/);
  assert.match(installCss, /\.mza-is-installed \.footer-install,/);
  assert.match(installJs, /dataset\.mzaLaunch = installed \? ['"]standalone['"] : ['"]browser['"]/);
});

test('the homepage install action is dismissible and not an interrupted popup', () => {
  assert.ok(pages.includes('index.html'));
  assert.match(index, /class="button button-primary mza-install-button"/);
  assert.match(index, /data-mza-install-button data-mza-install-promo/);
  assert.match(index, /data-en="Download MZA App" data-ar="تنزيل تطبيق MZA"/);
});

test('public footers use the compact bilingual promotion and one shared module', () => {
  assert.ok(pages.length >= 14);
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<div class="footer-install" data-mza-install-promo/, page);
    assert.match(html, /data-mza-install-dismiss/, page);
    assert.match(html, /data-mza-install-link/, page);
    assert.match(html, /data-en="Get the MZA App" data-ar="احصل على تطبيق MZA"/, page);
    assert.match(html, /assets\/js\/pwa-install\.js\?v=20261121c/, page);
  }
});

test('the Management Portal has no installation promotion or install script', () => {
  assert.doesNotMatch(admin, /footer-install|pwa-install\.js|mza-install-button|data-mza-install/);
});

test('install assets join the offline-safe versioned shell', () => {
  assert.match(sw, /mza-shell-v8/);
  assert.match(sw, /\/assets\/css\/pwa-install\.css\?v=20261121c/);
  assert.match(sw, /\/assets\/js\/pwa-install\.js\?v=20261121c/);
  assert.match(installCss, /#091d21/);
  assert.match(installCss, /#103538/);
  assert.match(installCss, /#f2b718/);
  assert.match(installCss, /#67b9ac/);
  assert.match(installCss, /#172a22/);
});

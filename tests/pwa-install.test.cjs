const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const installJs = read('assets/js/pwa-install.js');
const installCss = read('assets/css/pwa-install.css');
const index = read('index.html');
const sw = read('sw.js');
const pages = [
  ...fs.readdirSync(root).filter(file => file.endsWith('.html') && file !== 'offline.html'),
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
  assert.match(installJs, /Download MZA App/);
  assert.match(installJs, /تنزيل تطبيق MZA/);
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
  assert.match(installJs, /pwa-install\.css\?v=20261120f/);
  assert.doesNotMatch(index.slice(0, index.indexOf('</head>')), /<link\b[^>]*rel="stylesheet"/i);
});

test('installed and standalone launches hide install controls', () => {
  assert.match(installJs, /display-mode: standalone/);
  assert.match(installJs, /display-mode: minimal-ui/);
  assert.match(installJs, /navigator\.standalone/);
  assert.match(installJs, /getInstalledRelatedApps/);
  assert.match(installJs, /mza-is-installed/);
  assert.match(installCss, /\.mza-is-installed \.mza-install-button/);
  assert.match(installCss, /\.mza-is-installed \.footer-install/);
  assert.match(installJs, /dataset\.mzaLaunch = installed \? ['"]standalone['"] : ['"]browser['"]/);
});

test('the homepage has a prominent bilingual install action', () => {
  assert.ok(pages.includes('index.html'));
  assert.match(index, /class="button button-primary mza-install-button"/);
  assert.match(index, /data-mza-install-button/);
  assert.match(index, /data-en="Download MZA App" data-ar="تنزيل تطبيق MZA"/);
  assert.match(index, /disabled>Download MZA App<\/button>/);
});

test('every footer with the install hint loads one shared, versioned install module', () => {
  assert.ok(pages.length >= 14);
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /class="footer-install"/, page);
    assert.match(html, /assets\/js\/pwa-install\.js\?v=20261120f/, page);
    assert.match(html, /data-en="Install the MZA app"/, page);
    assert.match(html, /data-ar="تثبيت تطبيق MZA"/, page);
  }
});

test('install assets join the offline-safe versioned shell', () => {
  assert.match(sw, /mza-shell-v7/);
  assert.match(sw, /\/assets\/css\/pwa-install\.css\?v=20261120f/);
  assert.match(sw, /\/assets\/js\/pwa-install\.js\?v=20261120f/);
  assert.match(installCss, /#091d21/);
  assert.match(installCss, /#103538/);
  assert.match(installCss, /#f2b718/);
  assert.match(installCss, /#67b9ac/);
  assert.match(installCss, /#172a22/);
});

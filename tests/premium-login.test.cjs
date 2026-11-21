'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('assets/css/premium-login.css');
const dashboard = read('dashboard.html');
const admin = read('admin.html');

test('both sign-in pages load the premium stylesheet and the original gold logo', () => {
  for (const [name, html] of [['dashboard.html', dashboard], ['admin.html', admin]]) {
    assert.ok(html.includes(`premium-login.css?v=20261121a`), name);
    assert.match(html, /assets\/brand\/mzactive-logo-gold\.png/, name);
    assert.match(html, /class="premium-auth__head"/, name);
    assert.match(html, /class="premium-auth__intro" data-en=/, name);
  }
  assert.match(admin, /admin\.js\?v=20261121j/);
  assert.match(admin, /admin\.css\?v=20261121j/);
  assert.doesNotMatch(css, /filter\s*:/);
});

test('the sign-in background reuses the licensed Doha photo and existing WebP derivatives', () => {
  assert.match(css, /mzactive-hero-doha\.jpg/);
  assert.match(css, /@supports\s*\(background-image:\s*image-set\(/);
  for (const width of [960, 1280, 1600]) {
    assert.match(css, new RegExp(`mzactive-hero-doha-${width}w\\.webp`));
    assert.ok(fs.existsSync(path.join(root, 'assets/images/responsive', `mzactive-hero-doha-${width}w.webp`)));
  }
  assert.doesNotMatch(css, /https?:\/\//);
});

test('existing login contracts, error status and bilingual copy stay intact', () => {
  assert.match(dashboard, /<form id="loginForm" class="panel form-grid">/);
  assert.match(dashboard, /id="loginEmail" name="email" type="email" autocomplete="username"/);
  assert.match(dashboard, /id="loginPassword" name="password" type="password" autocomplete="current-password"/);
  assert.match(dashboard, /data-password-toggle="loginPassword"/);
  assert.match(dashboard, /data-forgot-password/);
  assert.match(dashboard, /\/api\/auth\/login/);
  assert.match(dashboard, /id="notice" class="notice" role="status" aria-live="polite"/);

  assert.match(admin, /<form id="login" class="panel">/);
  assert.match(admin, /name="email" type="email" autocomplete="username" required/);
  assert.match(admin, /id="loginPassword" name="password" type="password" autocomplete="current-password"/);
  assert.match(admin, /data-forgot-password data-en="Forgot your password\?" data-ar="هل نسيت كلمة المرور\؟"/);
  assert.match(admin, /id="notice" role="status" aria-live="polite"/);
  assert.match(admin, /<form id="setup" class="panel">/);
  assert.match(admin, /id="workspace" hidden/);
});

test('premium CSS uses only approved palette colors and accessible mobile-first patterns', () => {
  const approved = new Set([
    '#091d21', '#103538', '#205456', '#67b9ac', '#f2b718',
    '#f0f5f3', '#b8cbc6', '#c5d5d1', '#2e6567', '#367477', '#123d40',
  ]);
  const used = new Set((css.match(/#[0-9a-fA-F]{6}\b/g) || []).map(hex => hex.toLowerCase()));
  assert.deepEqual([...used].filter(hex => !approved.has(hex)), []);
  assert.match(css, /body:has\(#login:not\(\[hidden\]\)\)/);
  assert.match(css, /body:has\(#auth:not\(\.hidden\)\)/);
  assert.match(css, /html\[dir="rtl"\]/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /background-attachment: scroll/);
});

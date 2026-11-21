const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const sw = read('sw.js');
const register = read('assets/js/pwa-register.js');
const pages = fs.readdirSync(root).filter(file => file.endsWith('.html') && file !== 'offline.html');

test('MZA manifest reuses the official logo and brand colors', () => {
  assert.equal(manifest.name, 'MZA');
  assert.equal(manifest.short_name, 'MZA');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#091D21');
  assert.equal(manifest.background_color, '#091D21');
  const sizes = manifest.icons.map(icon => icon.sizes);
  assert.ok(sizes.includes('192x192'));
  assert.ok(sizes.includes('512x512'));
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
    assert.match(icon.src, /\?v=20261120c$/);
    const asset = icon.src.replace(/^\//, '').split('?')[0];
    assert.ok(fs.existsSync(path.join(root, asset)), icon.src);
  }
  assert.ok(fs.existsSync(path.join(root, 'assets/brand/mzactive-logo.webp')));
  assert.ok(fs.existsSync(path.join(root, 'assets/brand/mzactive-logo-gold.png')));
});

test('service worker keeps accounts, API traffic and private pages network-only', () => {
  assert.match(sw, /addEventListener\(['"]install['"]/);
  assert.match(sw, /addEventListener\(['"]activate['"]/);
  assert.match(sw, /addEventListener\(['"]fetch['"]/);
  assert.match(sw, /request\.method !== ['"]GET['"]/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /url\.pathname\.startsWith\(['"]\/api\/['"]\)/);
  assert.match(sw, /request\.mode === ['"]navigate['"]/);
  assert.match(sw, /cache\.match\(['"]\/offline\.html['"]\)/);
  assert.doesNotMatch(sw, /cache\.put\(request[\s\S]*\/api\//);
  new Function(sw);
});

test('registration and offline fallback share the existing language system', () => {
  assert.match(register, /serviceWorker.*in navigator/);
  assert.match(register, /register\(['"]\/sw\.js\?v=20261121b['"]/);
  assert.match(register, /scope:\s*['"]\/['"]/);
  new Function(register);
  const offline = read('offline.html');
  assert.match(offline, /assets\/js\/language-preference\.js/);
  assert.match(offline, /assets\/js\/site-language\.js/);
  assert.match(offline, /data-en=/);
  assert.match(offline, /data-ar=/);
});

test('all site pages expose install metadata and the mobile viewport', () => {
  assert.ok(pages.length >= 15);
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<meta name="viewport"/, page);
    assert.match(html, /rel="manifest" href="\/manifest\.json"/, page);
    assert.match(html, /rel="apple-touch-icon"/, page);
    assert.match(html, /apple-mobile-web-app-title" content="MZA"/, page);
    assert.match(html, /assets\/js\/pwa-register\.js/, page);
  }
  const subdirectory = read('4-week-10k/index.html');
  assert.match(subdirectory, /rel="manifest" href="\/manifest\.json"/);
  assert.match(subdirectory, /assets\/js\/pwa-register\.js/);
});

test('public footers include the compact bilingual MZA app link; the portal does not', () => {
  const withFooter = [...pages.filter(page => page !== 'admin.html'), '4-week-10k/index.html'].filter(page => /<\/footer>/.test(read(page)));
  assert.ok(withFooter.length >= 13);
  for (const page of withFooter) {
    const html = read(page);
    assert.match(html, /class="footer-install" data-mza-install-promo/, page);
    assert.match(html, /data-en="Get the MZA App"/, page);
    assert.match(html, /data-ar="احصل على تطبيق MZA"/, page);
    assert.match(html, /class="footer-vision-link"[^>]*href="(?:\.\.\/)?vision\.html"/, page);
    assert.match(html, /data-en="Our Vision" data-ar="رؤيتنا"/, page);
  }
  assert.doesNotMatch(read('admin.html'), /footer-install|pwa-install\.js/);
});

test('service worker cache refresh bypasses stale profile and language assets', () => {
  assert.match(sw, /mza-shell-v8/);
  assert.match(sw, /\/assets\/js\/language-preference\.js\?v=20261120c/);
  assert.match(sw, /\/assets\/css\/site-theme\.css\?v=20261120h/);
  assert.match(sw, /\/assets\/css\/account-menu\.css\?v=20261120h/);
  assert.match(sw, /\/assets\/js\/account-menu\.js\?v=20261120h/);
  assert.match(sw, /\/assets\/js\/auth-session\.js\?v=20261120h/);
  assert.match(sw, /\/assets\/js\/site-language\.js\?v=20261120h/);
});

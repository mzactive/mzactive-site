const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const htmlPages = [
  ...fs.readdirSync(root).filter(file => file.endsWith('.html')),
  '4-week-10k/index.html',
];
const footerPages = htmlPages.filter(file => /<\/footer>/.test(read(file)));

test('every website footer and the PWA shell expose the Management Portal link', () => {
  assert.ok(footerPages.length >= 18, `expected all pages, found ${footerPages.length}`);
  for (const page of footerPages) {
    const html = read(page);
    assert.equal((html.match(/class="management-footer-link"/g) || []).length, 1, page);
    assert.match(html, /class="management-footer-link" href="https:\/\/mzactive\.com\/admin\.html"/, page);
    assert.match(html, /aria-label="Management Portal" data-en-aria-label="Management Portal" data-ar-aria-label="بوابة الإدارة"/, page);
    assert.match(html, /class="management-shield-icon"/, page);
    assert.match(html, /<span data-en="Management Portal" data-ar="بوابة الإدارة">Management Portal<\/span>/, page);
    assert.doesNotMatch(html, /class="admin-footer-link"/, page);
  }
  const index = read('index.html');
  const company = index.slice(index.indexOf('data-en="Company"'), index.indexOf('data-en="Get in touch"'));
  assert.match(company, /class="management-footer-link" href="https:\/\/mzactive\.com\/admin\.html"/);
});

test('the Management Portal uses the approved gold palette and full RTL spacing', () => {
  const theme = read('assets/css/site-theme.css');
  assert.match(theme, /\.management-footer-link \{[\s\S]*?color: #f2b718;/);
  assert.match(theme, /\.management-shield-icon \{[\s\S]*?color: currentColor;/);
  assert.match(theme, /html\[dir="rtl"\] \.management-footer-link \{ margin: 8px 0 0 12px; \}/);
  assert.match(read('assets/css/account-menu.css'), /html\[dir="rtl"\] \.account-menu-list \{ right: auto; left: 0; \}/);
});

test('the account menu is mounted only on authenticated dashboards and derives access from the Worker', () => {
  for (const page of ['account.html', 'admin.html', 'dashboard.html', 'providers.html']) {
    const html = read(page);
    assert.match(html, /data-account-menu/, page);
    assert.match(html, /assets\/css\/account-menu\.css\?v=20261120h/, page);
    assert.match(html, /assets\/js\/account-menu\.js\?v=20261120h/, page);
  }
  const js = read('assets/js/account-menu.js');
  assert.match(js, /\/api\/me\/access/);
  assert.match(js, /access\.management\?\.enabled && permissions\.includes\('management\.view'\)/);
  assert.match(js, /access\.management\?\.enabled && permissions\.includes\('management\.ai'\)/);
  assert.match(js, /Account Settings|'settings'/);
  assert.match(js, /\/api\/auth\/logout/);
  assert.doesNotMatch(js, /URLSearchParams|location\.search/);
  for (const page of ['account.html', 'admin.html', 'dashboard.html', 'providers.html']) {
    assert.equal((read(page).match(/data-account-menu/g) || []).length, 1, page);
  }
  assert.doesNotMatch(read('index.html'), /data-account-menu/);
});

test('centralized sign-in always follows the backend destination, never a chosen role', () => {
  const helper = read('assets/js/auth-session.js');
  assert.match(helper, /data\?\.dashboard_path/);
  assert.doesNotMatch(helper, /provider_type|FormData|querySelector|<input|<select/);
  for (const page of ['admin.html', 'dashboard.html', 'providers.html']) {
    assert.match(read(page), /assets\/js\/auth-session\.js\?v=20261120h/, page);
  }
  assert.match(read('assets/js/admin.js'), /window\.MZActiveAuth\.store\(d\)/);
  assert.match(read('dashboard.html'), /window\.MZActiveAuth\.store\(data\)/);
  assert.match(read('dashboard.html'), /window\.MZActiveAuth\.destination\(access\)/);
  assert.match(read('providers.html'), /window\.MZActiveAuth\.store\(data\)/);
  assert.match(read('providers.html'), /window\.MZActiveAuth\.destination\(access\)/);
});

test('auth-session helper stores admin sessions separately and accepts only known destinations', () => {
  function load() {
    const values = { session: new Map(), local: new Map() };
    const storage = target => ({
      getItem: key => values[target].get(key) || '',
      setItem: (key, value) => values[target].set(key, value),
      removeItem: key => values[target].delete(key),
    });
    const context = {
      window: {},
      sessionStorage: storage('session'),
      localStorage: storage('local'),
    };
    vm.runInNewContext(read('assets/js/auth-session.js'), context);
    return { auth: context.window.MZActiveAuth, values };
  }

  const first = load();
  assert.equal(first.auth.destination({ dashboard_path: '/admin.html', account_type: 'member' }), '/admin.html');
  assert.equal(first.auth.destination({ dashboard_path: '/providers.html', user: { role: 'admin' } }), '/providers.html');
  assert.equal(first.auth.destination({ dashboard_path: '/evil.html' }), '/dashboard.html');
  assert.equal(first.auth.destination({ user: { role: 'provider' } }), '/providers.html');
  assert.equal(first.auth.destination({}), '/dashboard.html');

  first.values.local.set('mzactive-provider-session', 'stale');
  assert.equal(first.auth.store({ token: 'admin-token', dashboard_path: '/admin.html' }), '/admin.html');
  assert.equal(first.values.session.get('mzactive-provider-session'), 'admin-token');
  assert.equal(first.values.local.has('mzactive-provider-session'), false);

  assert.equal(first.auth.store({ token: 'member-token', dashboard_path: '/dashboard.html' }), '/dashboard.html');
  assert.equal(first.values.local.get('mzactive-provider-session'), 'member-token');
  assert.equal(first.values.session.has('mzactive-provider-session'), false);
});

test('legacy Admin Portal and admin sign-in wording is gone', () => {
  const admin = read('admin.html');
  assert.match(admin, /<title>MZ Active Management Portal<\/title>/);
  assert.match(admin, /data-en="Management Portal" data-ar="بوابة الإدارة"/);
  assert.doesNotMatch(admin, /Admin sign in|Admin command center|دخول الإدارة|دخول المسؤول/);
  for (const page of ['providers.html', 'pacer.html']) {
    assert.doesNotMatch(read(page), /Admin sign in|دخول الإدارة|"Admin Portal"/, page);
  }
});

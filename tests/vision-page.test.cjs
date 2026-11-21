const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('vision.html');
const sitemap = read('sitemap.xml');
const language = read('assets/js/site-language.js');
const generator = read('scripts/generate-pwa-icons.py');

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .filter(script => script.trim());
const contactScript = inlineScripts.at(-1);

function pngSize(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function contactFormHarness(lang) {
  const form = { addEventListener(type, handler) { this.handler = handler; }, reportValidity: () => true };
  const status = { textContent: '' };
  const links = { hidden: true, scrollIntoView() { this.scrolled = true; } };
  const whatsapp = {
    href: '',
    tabIndex: 0,
    removeAttribute(name) { if (name === 'href') this.href = ''; },
    setAttribute(name, value) { this[name] = value; },
  };
  const email = { href: 'mailto:mzactive@yahoo.com' };
  const description = { content: '' };
  const nodes = {
    visionContactForm: form,
    visionStatus: status,
    visionSendLinks: links,
    visionWhatsApp: whatsapp,
    visionEmail: email
  };
  const document = {
    getElementById: id => nodes[id],
    querySelector: selector => selector === 'meta[name="description"]' ? description : null,
    addEventListener() {}
  };
  const window = {
    MZActiveLanguage: { get: () => lang },
    MZActiveManagementContact: {
      get: () => ({ whatsapp: '97400000000' }),
      link: (number, message) => `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
    },
  };
  class FormData {
    constructor() {
      this.values = new Map(Object.entries({
        name: 'Test Person',
        email: 'test@example.com',
        organisation: 'Example Org',
        topic: lang === 'ar' ? 'partnership' : 'investment',
        message: lang === 'ar' ? 'نتطلع إلى شراكة طويلة الأمد.' : 'We would like to discuss long-term support.'
      }));
    }
    get(key) { return this.values.get(key); }
  }
  new Function('document', 'window', 'FormData', contactScript)(document, window, FormData);
  assert.equal(typeof form.handler, 'function');
  form.handler({ preventDefault() {} });
  return { status, links, whatsapp, email, description };
}

test('vision page exists and is discoverable', () => {
  assert.match(html, /<title>Our Vision \| MZ Active<\/title>/);
  assert.match(sitemap, /https:\/\/mzactive\.com\/vision\.html/);
  assert.match(language, /'vision\.html':\s*\{/);
  assert.match(language, /'Our Vision \| MZ Active':'رؤيتنا \| MZ Active'/);
  assert.match(html, /<link rel="manifest" href="\/manifest\.json">/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /href="\/assets\/icons\/icon-192\.png\?v=20261120c"/);
});

test('vision page carries full bilingual content and RTL language detection', () => {
  for (const id of ['mission', 'products', 'expansion', 'investment', 'get-in-touch']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  for (const phrase of [
    'MZActive sports platform',
    'MZ AI Brain',
    'MZ Quantum Lab',
    'Live today',
    'Future initiative',
    /GLOBAL AMBITION/,
    /INVESTMENT &amp; PARTNERSHIP/,
    'Get in Touch'
  ]) {
    assert.ok(typeof phrase === 'string' ? html.includes(phrase) : phrase.test(html), String(phrase));
  }
  for (const phrase of [
    'منصة MZActive الرياضية',
    'MZ AI Brain',
    'مختبر MZ Quantum',
    'متاح اليوم',
    'مبادرة مستقبلية',
    'الطموح العالمي',
    'الاستثمار والشراكة',
    'تواصل معنا'
  ]) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.match(html, /assets\/js\/language-preference\.js\?v=20261120c/);
  assert.match(html, /assets\/js\/site-language\.js\?v=20261120h/);
  assert.match(html, /<button class="lang-toggle" type="button"/);
  assert.match(html, /class="footer-vision-link"[^>]*aria-current="page"/);
});

test('vision page separates live products from future ambitions', () => {
  const products = html.slice(html.indexOf('id="products"'), html.indexOf('id="expansion"'));
  assert.equal((products.match(/data-en="Live today"/g) || []).length, 2);
  assert.equal((products.match(/data-en="Future initiative"/g) || []).length, 1);
  assert.match(products, /not a live product, and no timelines or outcomes are promised/);
  const investment = html.slice(html.indexOf('id="investment"'));
  assert.match(investment, /future ambitions, not current investment products/);
  assert.match(investment, /no payment collected on this site/);
});

test('Get in Touch form prepares bilingual WhatsApp and email handoffs', () => {
  for (const name of ['name', 'email', 'organisation', 'topic', 'message', 'consent']) {
    assert.match(html, new RegExp(`name="${name}"`), name);
  }
  assert.match(html, /id="visionContactForm" novalidate/);
  assert.match(html, /form\.reportValidity\(\)/);
  assert.match(html, /assets\/js\/management-contact\.js/);
  assert.match(html, /MZActiveManagementContact/);
  assert.doesNotMatch(html, /https:\/\/wa\.me\/\d/);
  assert.match(html, /mailto:mzactive@yahoo\.com/);

  const en = contactFormHarness('en');
  assert.equal(en.links.hidden, false);
  assert.equal(en.links.scrolled, true);
  assert.match(decodeURIComponent(en.whatsapp.href), /MZ Active inquiry/);
  assert.match(decodeURIComponent(en.whatsapp.href), /Name: Test Person/);
  assert.match(decodeURIComponent(en.whatsapp.href), /Topic: Investment/);
  assert.match(decodeURIComponent(en.email.href), /subject=MZ Active inquiry: Investment/);
  assert.match(en.status.textContent, /Message ready/);

  const ar = contactFormHarness('ar');
  assert.equal(ar.links.hidden, false);
  assert.match(decodeURIComponent(ar.whatsapp.href), /استفسار من موقع MZ Active/);
  assert.match(decodeURIComponent(ar.whatsapp.href), /الموضوع: الشراكة/);
  assert.match(decodeURIComponent(ar.email.href), /subject=استفسار MZ Active: الشراكة/);
  assert.match(ar.status.textContent, /الرسالة جاهزة/);
});

test('vision form adds no payment, paid provider or server submission', () => {
  assert.doesNotMatch(contactScript, /fetch\(/);
  assert.doesNotMatch(contactScript, /XMLHttpRequest/);
  assert.doesNotMatch(html, /stripe|paypal|braintree|squareup|client_secret|refresh_token/i);
  assert.match(contactScript, /event\.preventDefault\(\)/);
});

test('PWA icons are generated from the unchanged original gold logo', () => {
  assert.ok(fs.existsSync(path.join(root, 'assets/brand/mzactive-logo-gold.png')));
  assert.match(generator, /assets\/brand\/mzactive-logo-gold\.png/);
  assert.match(generator, /BACKGROUND = \(9, 29, 33, 255\)/);
  assert.match(generator, /crop_to_content/);
  assert.match(generator, /scale_image/);
  assert.deepEqual(pngSize('assets/icons/icon-192.png'), { width: 192, height: 192 });
  assert.deepEqual(pngSize('assets/icons/icon-512.png'), { width: 512, height: 512 });
  assert.deepEqual(pngSize('assets/icons/apple-touch-icon-180.png'), { width: 180, height: 180 });
  assert.deepEqual(pngSize('assets/icons/icon-maskable-192.png'), { width: 192, height: 192 });
  assert.deepEqual(pngSize('assets/icons/icon-maskable-512.png'), { width: 512, height: 512 });
});

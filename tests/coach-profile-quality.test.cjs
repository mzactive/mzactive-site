const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const css = read('assets/css/coach-profile.css');
const page = read('coach.html');
const profileJs = read('assets/js/coach-profile.js');
const assistant = read('assets/js/assistant-chat.js');
const whatsapp = read('assets/js/whatsapp-chat.js');
const contactHelper = read('assets/js/management-contact.js');
const worker = read('backend/worker.js');

test('credential facts use a real content column instead of a pseudo-element grid item', () => {
  assert.match(css, /\.facts>div\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.facts dt::before\{content:"•"/);
  assert.match(css, /\.facts dd\{margin:0;min-width:0/);
  assert.match(css, /overflow-wrap:anywhere;word-break:normal/);
  assert.doesNotMatch(css, /\.facts>div::before/);
});

test('public cover instruction strip is removed without touching cover media', () => {
  assert.doesNotMatch(page, /cover-help/);
  assert.doesNotMatch(css, /\.cover-help/);
  assert.match(page, /id="coverPhoto" class="cover-photo"/);
});

test('public layout fills the page while owner rail remains reserved', () => {
  assert.match(css, /\.profile-layout\.public-layout\{grid-template-columns:minmax\(260px,320px\) minmax\(0,1fr\)\}/);
  assert.match(css, /\.profile-layout,\.profile-layout\.public-layout\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(profileJs, /classList\.toggle\('public-layout', !\(p\.viewer\?\.owner\)\)/);
});

test('Momo assistant is compact, localized, and honest when unavailable', () => {
  assert.match(assistant, /Ask Momo AI/);
  assert.match(assistant, /اسأل مومو/);
  assert.match(assistant, /#064541/);
  assert.match(assistant, /min-height:40px/);
  assert.match(assistant, /env\(safe-area-inset-bottom\)/);
  assert.match(assistant, /The assistant is unavailable right now/);
  assert.doesNotMatch(assistant, /Ask MZ Active/);
});

test('floating WhatsApp control is compact and driven by the Worker secret', () => {
  assert.match(whatsapp, /MZActiveManagementContact/);
  assert.match(whatsapp, /aria-disabled/);
  assert.match(whatsapp, /env\(safe-area-inset-bottom\)/);
  assert.match(whatsapp, /width:42px;height:42px/);
  assert.match(contactHelper, /\/api\/public\/contact-config/);
  assert.match(worker, /url\.pathname === "\/api\/public\/contact-config"/);
});

test('no management phone number is hardcoded in frontend files or tests', () => {
  const files = [];
  for (const dir of ['assets', 'tests', '4-week-10k']) {
    for (const file of fs.readdirSync(path.join(root, dir), { recursive: true })) {
      if (typeof file === 'string' && /\.(js|cjs|html|css)$/.test(file)) files.push(path.join(dir, file));
    }
  }
  for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) files.push(file);
  const syntheticNumbers = ['97400000000', '97412345678', '97455555555'];
  for (const file of files) {
    let text = read(file);
    for (const number of syntheticNumbers) text = text.replaceAll(number, '');
    assert.doesNotMatch(text, /wa\.me\/\d{8,}/, file);
    assert.doesNotMatch(text, /\+?974\s?\d{8}/, file);
  }
});

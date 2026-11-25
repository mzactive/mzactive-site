const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(dir, 'assets/js/program-document.js'), 'utf8');
const html = fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8');
const studio = fs.readFileSync(path.join(dir, 'assets/js/coaching-studio.js'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'assets/css/program-document.css'), 'utf8');

function loadModule() {
  const window = {};
  const sandbox = { window, document: {}, TextEncoder, Uint8Array, Uint32Array, DataView, Blob: class {}, File: class {}, navigator: {}, sessionStorage: { getItem: () => null, setItem: () => {} }, setTimeout: () => {} };
  const vm = require('node:vm');
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox);
  return { window, sandbox };
}

const payload = {
  lang: 'en', coach: 'Coach Sara', athlete: 'Khaled Athlete', title: '10 DAY TRAINING PROGRAM',
  date_range: '23/11/2026 – 02/12/2026', note: 'Paces are coach targets. Report after the block.',
  whatsapp_phone: '',
  weeks: [
    { label: 'Week 1', days: [
      { key: 'monday', label: 'Monday', date: '23/11/2026', type: 'run', title: 'Easy Run', distance: '8 km', duration: '45 min', lines: ['8 km at 6:10–6:35/km.', 'Cool down 10 min.'], extras: [], isRest: false },
      { key: 'tuesday', label: 'Tuesday', date: '24/11/2026', type: 'strength', title: 'Strength', lines: ['Goblet squat 2 × 10.'], extras: [], isRest: false },
    ] },
  ],
};

test('professional document pipeline is wired into the coaching studio', () => {
  assert.match(html, /program-document\.js\?v=/);
  assert.match(html, /program-document\.css\?v=/);
  assert.match(html, /coaching-studio\.js\?v=20261125b/);
  assert.match(html, /id="programDocumentDialog"/);
  assert.match(html, /id="programDocPdf"/);
  assert.match(html, /id="programDocDocx"/);
  assert.match(html, /id="programDocShare"/);
  assert.match(html, /id="programDocFallback"/);
  assert.match(studio, /MZActiveStudio=\{openDocumentPreview\}/);
  assert.match(studio, /docLang=payload\.lang==='ar'\?'ar':'en'/);
  assert.match(studio, /Preview professional document/);
  assert.doesNotMatch(html, /const url='https:\/\/wa\.me\/'\+phone\?'text='\+encodeURIComponent\(message\),fallback=\$\('whatsappFallback'\)/);
  assert.match(css, /@media print/);
});

test('DOCX bytes form a stored ZIP with required OOXML parts', () => {
  const { window } = loadModule();
  const bytes = window.MZAProgramDocument.docxBytes(payload);
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const text = Buffer.from(bytes).toString('latin1');
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'docProps/core.xml', 'docProps/app.xml']) {
    assert.ok(text.includes(part), `missing ${part}`);
  }
  assert.ok(text.includes('Khaled Athlete'));
  assert.ok(text.includes('Coach Sara'));
  assert.ok(text.includes('10 DAY TRAINING PROGRAM'));
  assert.ok(text.includes('6:10'));
  assert.ok(text.includes('Coach note'));
  assert.ok(!text.includes('undefined'));
});

test('DOCX is Arabic-RTL aware and strips internal workout metadata', () => {
  const { window } = loadModule();
  const parsed = window.MZAProgramDocument.parseWorkout('Easy Run\n[MZ:{"km":8,"minutes":45}]\n8 km at target pace.');
  assert.equal(parsed.title, 'Easy Run');
  assert.equal(parsed.distance, '8 km');
  assert.equal(parsed.duration, '45 min');
  assert.ok(!parsed.details.includes('[MZ:'));
  const arabic = { ...payload, lang: 'ar', note: 'الوتيرة مستهدفة.' };
  const bytes = window.MZAProgramDocument.docxBytes(arabic);
  const text = Buffer.from(bytes).toString('latin1');
  const utf8 = Buffer.from(bytes).toString('utf8');
  assert.ok(text.includes('<w:bidi/>'));
  assert.ok(utf8.includes('ملاحظة المدرب'));
});

test('native file sharing uses navigator.share with a DOCX file, with an honest fallback', () => {
  const { window } = loadModule();
  assert.equal(typeof window.MZAProgramDocument.shareDocument, 'function');
  assert.ok(js.includes('files: [docxFile(payload)]'));
  assert.ok(js.includes('textFallbackUrl(payload)'));
  assert.ok(js.includes('fallbackInfo'));
});

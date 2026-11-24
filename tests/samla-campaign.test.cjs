'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('homepage has a removable SAMLA 200 campaign banner', () => {
  const html = read('index.html');
  assert.match(html, /id="samlaCampaignBanner"/);
  assert.match(html, /data-ar="صمله 200 — كل دقيقة تصنع الفرق"/);
  assert.match(html, /data-ar="احسب استراتيجية سباقك مجاناً"/);
  assert.match(html, /href="\/samla\/"/);
  assert.match(html, /api\/public\/campaigns\/samla/);
  assert.match(html, /2026-12-03T06:00:00\.000Z/);
});

test('SAMLA calculator locks official stage distances and keeps tools independent', () => {
  const html = read('samla/index.html');
  for (const distance of ['distance: 3', 'distance: 40', 'distance: 6', 'distance: 36', 'distance: 75']) {
    assert.match(html, new RegExp(distance.replace(' ', '\\s*')));
  }
  assert.match(html, /44-hour cut-off|حد قطع 44 ساعة/);
  assert.match(html, /id="carbButton"/);
  assert.match(html, /id="gelButton"/);
  assert.match(html, /id="distributeButton"/);
  assert.match(html, /id="shareCardButton"/);
  assert.match(html, /not affiliated with or endorsed by SAMLA/);
  assert.match(html, /mzactive\.com\/samla/);
});

test('admin can control the SAMLA campaign', () => {
  const admin = read('assets/js/admin.js');
  const worker = read('backend/worker.js');
  assert.match(admin, /admin\/campaigns\/samla/);
  assert.match(worker, /path === "\/api\/admin\/campaigns\/:id"|\^\\\/api\\\/admin\\\/campaigns\\\/\(\[\\w-\]\{1,40\}\)\$/);
  assert.match(worker, /site_campaigns/);
});

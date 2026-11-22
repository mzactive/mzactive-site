const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const navPages = [
  'index.html', 'coaches.html', 'pacer.html', 'providers.html', 'events.html',
  'dashboard.html', 'marketplace.html', 'training-programmes.html', 'terms.html',
];

test('Pacers is a top-level navigation destination on every core page', () => {
  for (const page of navPages) {
    const html = read(page);
    assert.match(html, /href="pacer\.html" data-en="Pacers" data-ar="المرافقون"/, page);
  }
  assert.match(read('assets/js/site-language.js'), /'Pacers':'المرافقون'/);
});

test('Pacers page follows the approved section order and bilingual copy', () => {
  const html = read('pacer.html');
  const order = ['class="hero"', 'id="choose"', 'id="services"', 'id="champions"', 'id="join"', 'id="request"'];
  let cursor = -1;
  for (const marker of order) {
    const next = html.indexOf(marker, cursor + 1);
    assert.ok(next > cursor, `${marker} is missing or out of order`);
    cursor = next;
  }
  assert.match(html, /— PACERS/);
  assert.match(html, /Find Your Pacer\./);
  assert.match(html, /Reach Your Goal\./);
  assert.match(html, /Train smarter, race stronger, and stay on pace with verified MZActive Pacers\./);
  assert.match(html, /Find a Pacer &amp; Book →/);
  assert.match(html, /Join as a Pacer/);
  assert.match(html, /5K → Marathon/);
  assert.match(html, /Running Pacers/);
  assert.match(html, /Cycling Pacers/);
  assert.match(html, /Meet Our Pacers/);
  assert.match(html, /data-en="BECOME AN MZACTIVE PACER"/);
});

test('Pacers page uses only approved directory data and keeps the booking contract', () => {
  const html = read('pacer.html');
  assert.match(html, /api\/providers\?type=pacer/);
  assert.match(html, /\/api\/providers\/\'\+encodeURIComponent\(p\.id\)\+\'\/photo/);
  assert.match(html, /pacer\.html\?provider=\'\+encodeURIComponent\(p\.id\)\+\'#request/);
  assert.match(html, /The first pacer profiles are being reviewed\./);
  assert.match(html, /ملفات أول المرافقين قيد المراجعة\./);
  assert.match(html, /Pacer listings are temporarily unavailable\./);
  assert.match(html, /الدليل غير متاح مؤقتاً\./);
  assert.match(html, /min\/km|km\/h/);
  for (const id of ['bookingForm', 'bookingSubmit', 'bookingStatus', 'serviceField', 'bookingForm']) {
    assert.match(html, new RegExp(id), id);
  }
  assert.doesNotMatch(html, /Khaled A\.|Amina B\.|Youssef M\.|Omar R\./);
});

test('registration collects real Pacer details through the shared profile API', () => {
  const html = read('providers.html');
  for (const field of [
    'pacer_sports', 'pacer_services', 'pacer_distances', 'pacer_running_pace',
    'pacer_cycling_speed', 'pacer_achievements', 'pacer_personal_bests',
    'pacer_hourly_rate_qar', 'pacer_race_rate_qar', 'pacer_service_areas',
    'pacer_availability', 'body.pacer_details=collectPacer(f)', 'value="pacer_details"',
  ]) {
    assert.ok(html.includes(field), field);
  }
  assert.match(html, /new URLSearchParams\(location\.search\)\.get\('type'\)/);
  assert.match(html, /submitter\?\.value==='draft'\?'draft':'submit'/);
});

test('Admin Portal has a Pacer workspace with review and booking filtering', () => {
  const admin = read('assets/js/admin.js');
  assert.match(admin, /pacers:\['Pacers','المرافقون'\]/);
  assert.match(admin, /pacers:'management\.coaches'/);
  assert.match(admin, /pacers:\['Review running and cycling Pacer applications/);
  assert.match(admin, /if\(tab==='pacers'\)/);
  assert.match(admin, /renderCoaches\(root,'pacer'\)/);
  assert.match(admin, /provider_type==='pacer'/);
  assert.match(admin, /p\.pacer_details\|\|/);
});

test('approved Pacers get an account-connected workspace and booking management', () => {
  const providerPage = read('providers.html');
  assert.match(providerPage, /assets\/js\/pacer-dashboard\.js/);
  const script = read('assets/js/pacer-dashboard.js');
  for (const marker of [
    '/api/me/profile', '/api/dashboard/bookings', '/api/dashboard/bookings/',
    "provider_type !== 'pacer'", "status !== 'approved'", 'pacer.html?provider=',
    "status === 'accepted'", "status === 'completed'", 'data-en="Booking requests"',
  ]) {
    assert.ok(script.includes(marker), marker);
  }
  assert.match(read('backend/worker.js'), /p\.provider_type AS provider_type/);
});

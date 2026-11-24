const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const homepageCss = fs.readFileSync(path.join(root, 'assets/css/homepage.css'), 'utf8');

const expectedSports = [
  ['running', 'Running'],
  ['fitness', 'Fitness'],
  ['bodybuilding_coach', 'Bodybuilding Coach'],
  ['swimming', 'Swimming'],
  ['cycling', 'Cycling'],
  ['triathlon', 'Triathlon'],
  ['hyrox', 'HYROX'],
  ['crossfit', 'CrossFit'],
  ['padel', 'Padel'],
  ['boxing', 'Boxing'],
  ['kickboxing', 'Kickboxing'],
];

function sportGrid() {
  const start = html.indexOf('<div class="sport-grid">');
  assert.ok(start >= 0, 'sport grid is present');
  const end = html.indexOf('</div>', start);
  assert.ok(end > start, 'sport grid closes');
  return html.slice(start, end);
}

function sportCards() {
  return sportGrid().match(/<a class="sport-card"[^>]*>[\s\S]*?<\/a>/g) ?? [];
}

test('all eleven sport cards are clickable photo cards with no placeholder icons', () => {
  const grid = sportGrid();
  const cards = sportCards();
  assert.equal(cards.length, 11, 'every expected sport card is present');
  assert.doesNotMatch(grid, /<svg\b/i, 'sport cards no longer contain placeholder icons');

  cards.forEach((card, index) => {
    const [sport, label] = expectedSports[index];
    assert.match(card, new RegExp(`^<a class="sport-card" href="coaches\\.html\\?(?:sport|type)=${sport}">`), `${sport} keeps its working coaches link`);
    assert.match(card, /<span class="sport-card-art(?: sport-card-art-[a-z]+)?">/, `${sport} uses the shared art container`);
    assert.match(card, /<picture class="responsive-photo" style="display:contents">/, `${sport} uses the shared responsive photo wrapper`);
    assert.match(card, /<source data-responsive-webp type="image\/webp"/, `${sport} has a format-gated WebP source`);
    assert.match(card, /<img src="assets\/images\//, `${sport} has a local image fallback`);
    const imgTag = card.match(/<img\b[^>]*>/)?.[0] ?? '';
    assert.doesNotMatch(imgTag, /\b(?:srcset|sizes)=/, `${sport} keeps srcset/sizes on the WebP source`);
    assert.match(card, new RegExp(`<span class="sport-card-label"[^>]*>${label}</span>`), `${sport} keeps its visible label`);
  });
});

test('boxing and kickboxing use locally hosted licensed photographs with matching responsive variants', () => {
  const expected = {
    boxing: { width: '1000', height: '562' },
    kickboxing: { width: '1000', height: '666' },
  };

  for (const [sport, dimensions] of Object.entries(expected)) {
    const card = sportCards().find((entry) => entry.includes(`sport=${sport}`));
    assert.ok(card, `${sport} card exists`);

    const img = card.match(/<img\b[^>]*>/)?.[0] ?? '';
    assert.match(img, new RegExp(`src="assets/images/sports/${sport}\\.webp\\?v=20261122"`), `${sport} uses a cache-busted local WebP master`);
    assert.match(img, /alt=""/, `${sport} keeps the decorative image alt used by other sport cards`);
    assert.match(img, /loading="lazy" decoding="async" fetchpriority="low"/, `${sport} keeps the card loading behavior`);
    assert.match(img, new RegExp(`width="${dimensions.width}" height="${dimensions.height}"`), `${sport} declares the optimized image dimensions`);

    const source = card.match(/<source\b[^>]*>/)?.[0] ?? '';
    assert.match(source, new RegExp(`sizes="\\(max-width: 720px\\) 24vw, 12vw"`), `${sport} uses the shared sport-card sizes hint`);
    const srcset = source.match(/srcset="([^"]+)"/)?.[1] ?? '';
    const variants = srcset.split(',').map((entry) => entry.trim().split(/\s+/));
    assert.deepEqual(variants, [320, 480, 640, 768, 960].map((width) => [
      `assets/images/responsive/sports/${sport}-${width}w.webp`,
      `${width}w`,
    ]), `${sport} advertises the same width variants as other sport photos`);

    assert.ok(fs.existsSync(path.join(root, `assets/images/sports/${sport}.webp`)), `${sport} master exists`);
    for (const width of [320, 480, 640, 768, 960]) {
      assert.ok(fs.existsSync(path.join(root, `assets/images/responsive/sports/${sport}-${width}w.webp`)), `${sport} ${width}w variant exists`);
    }
  }
});

test('sport card styling continues to provide shared cropping, overlays and responsive layout', () => {
  assert.match(homepageCss, /\.sport-card-art img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*cover;[^}]*object-position:\s*center;/);
  assert.match(homepageCss, /\.sport-card:hover \.sport-card-art img\s*\{[^}]*transform:\s*scale\(1\.04\);/);
  assert.match(homepageCss, /\.sport-card\s*\{[^}]*position:\s*relative;[^}]*border-radius:\s*11px;/);
  assert.match(homepageCss, /\.sport-card::before\s*\{[^}]*linear-gradient\(145deg,\s*rgb\(9 29 33 \/ 15%\),\s*rgb\(9 29 33 \/ 28%\)\)/);
  assert.match(homepageCss, /\.sport-card::after\s*\{[^}]*inset:\s*25% 0 0;[^}]*linear-gradient\(0deg,\s*#04191de8,\s*transparent\)/);
  assert.doesNotMatch(homepageCss, /\.sport-card-art-(?:boxing|kickboxing)\b/, 'no new per-sport crop overrides were added');
});


test('Fitness and Bodybuilding Coach use distinct licensed local photos', () => {
  const fitness = sportCards().find((card) => card.includes('href="coaches.html?sport=fitness"'));
  const bodybuilding = sportCards().find((card) => card.includes('href="coaches.html?type=bodybuilding_coach"'));
  assert.ok(fitness, 'fitness card is present');
  assert.ok(bodybuilding, 'bodybuilding card is present');
  assert.match(fitness, /women-fitness\.jpg/);
  assert.match(bodybuilding, /assets\/images\/sports\/bodybuilding\.jpg/);
  assert.match(bodybuilding, /bodybuilding-960w\.webp/);
  assert.doesNotMatch(bodybuilding, /women-fitness/);
  const license = fs.readFileSync(path.join(root, 'docs/image-licenses.md'), 'utf8');
  assert.match(license, /CC BY-SA 4\.0/);
});

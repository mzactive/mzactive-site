const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;

function photoImages(pageName) {
  const html = read(pageName);
  const tags = html.match(/<img\b[^>]*>/g) ?? [];
  return tags.filter((tag) => {
    const src = attr(tag, 'src') ?? '';
    return src.startsWith('assets/images/') && !src.includes('/approved-originals/');
  });
}

test('homepage and events photos reference real, numerically ordered responsive WebP candidates', () => {
  for (const pageName of ['index.html', 'events.html']) {
    const images = photoImages(pageName);
    assert.ok(images.length > 0, `${pageName} should include local photographs`);

    for (const tag of images) {
      const src = attr(tag, 'src');
      assert.ok(src, `${pageName} photo keeps its original src fallback`);
      const srcset = attr(tag, 'srcset');
      const sizes = attr(tag, 'sizes');
      assert.ok(srcset, `${src} should have srcset`);
      assert.ok(sizes, `${src} should have a sizes hint`);
      assert.match(attr(tag, 'width') ?? '', /^\d+$/);
      assert.match(attr(tag, 'height') ?? '', /^\d+$/);

      const candidates = srcset.split(',').map((entry) => {
        const [url, descriptor] = entry.trim().split(/\s+/);
        const width = Number.parseInt(descriptor, 10);
        assert.match(url, /^assets\/images\/responsive\/.*\.webp$/);
        assert.ok(fs.existsSync(path.join(root, url)), `missing responsive image ${url}`);
        assert.ok(Number.isInteger(width) && width > 0, `invalid width descriptor: ${entry}`);
        return width;
      });
      assert.deepEqual(candidates, [...candidates].sort((a, b) => a - b), `${src} srcset should be width-ordered`);
    }
  }
});

test('the high-priority homepage hero preload uses the exact same responsive candidates and sizes', () => {
  const html = read('index.html');
  const preload = html.match(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*>/)?.[0];
  const hero = photoImages('index.html').find((tag) => tag.includes('data-en-alt="Runners training together outdoors"'));
  assert.ok(preload, 'hero preload is present');
  assert.ok(hero, 'homepage hero photograph is present');
  assert.equal(attr(preload, 'imagesrcset'), attr(hero, 'srcset'));
  assert.equal(attr(preload, 'imagesizes'), attr(hero, 'sizes'));
  assert.equal(attr(preload, 'fetchpriority'), 'high');
});

test('homepage inline styles exactly mirror the maintained shared and homepage CSS files', () => {
  const html = read('index.html');
  const style = html.match(/<style id="homepage-inline-styles">([\s\S]*?)<\/style>/);
  assert.ok(style, 'critical homepage styles are inlined');
  const expected = ['assets/css/site-theme.css', 'assets/css/homepage.css']
    .map((file) => read(file).trimEnd())
    .join('\n\n');
  assert.equal(style[1].replace(/^\n/, '').replace(/\n\s*$/, ''), expected);
  assert.doesNotMatch(html.slice(0, html.indexOf('</head>')), /<link\b[^>]*rel="stylesheet"/i);
});

test('coach-login background retains the original JPEG fallback and selects only existing WebP derivatives when supported', () => {
  const css = read('assets/css/coaching-studio.css');
  assert.match(css, /\.auth-story\s*\{[^}]*background-image:[^;}]*mzactive-hero-doha\.jpg/);
  assert.match(css, /@supports\s*\(background-image:\s*image-set\(/);
  assert.match(css, /\.auth-story\s*\{[^}]*image-set\(/);
  for (const width of [960, 1280, 1600]) {
    assert.ok(fs.existsSync(path.join(root, `assets/images/responsive/mzactive-hero-doha-${width}w.webp`)));
  }
});

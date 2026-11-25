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

function webpSourcesFor(pageName, imageTag) {
  const html = read(pageName);
  const imageIndex = html.indexOf(imageTag);
  assert.ok(imageIndex >= 0, 'image tag is present in its source document');
  const pictureOpen = '<picture class="responsive-photo" style="display:contents">';
  const pictureStart = html.lastIndexOf(pictureOpen, imageIndex);
  const pictureEnd = html.lastIndexOf('</picture>', imageIndex);
  assert.ok(pictureStart > pictureEnd, 'photo uses a responsive picture wrapper');
  const beforeImage = html.slice(pictureStart, imageIndex);
  const sources = beforeImage.match(/<source\b[^>]*type="image\/webp"[^>]*>/g) ?? [];
  assert.ok(sources.length > 0, 'picture contains at least one WebP source');
  return sources;
}

function webpSourceFor(pageName, imageTag) {
  return webpSourcesFor(pageName, imageTag)[0];
}

test('homepage and events photos use format-gated WebP sources with original-format img fallbacks', () => {
  for (const pageName of ['index.html', 'events.html']) {
    const images = photoImages(pageName);
    assert.ok(images.length > 0, `${pageName} should include local photographs`);

    for (const tag of images) {
      const src = attr(tag, 'src');
      assert.ok(src, `${pageName} photo keeps its original src fallback`);
      assert.match(src, /^assets\/images\//);
      assert.equal(attr(tag, 'srcset'), null, `${src} srcset stays on the WebP <source>`);
      assert.equal(attr(tag, 'sizes'), null, `${src} sizes stays on the WebP <source>`);
      assert.match(attr(tag, 'width') ?? '', /^\d+$/);
      assert.match(attr(tag, 'height') ?? '', /^\d+$/);

      const sources = webpSourcesFor(pageName, tag);
      for (const source of sources) {
        assert.equal(attr(source, 'type'), 'image/webp');
        const srcset = attr(source, 'srcset');
        assert.ok(srcset, `${src} WebP source should have a srcset`);
        const sizes = attr(source, 'sizes');
        if (sizes) {
          const candidates = srcset.split(',').map((entry) => {
            const [url, descriptor] = entry.trim().split(/\s+/);
            const width = Number.parseInt(descriptor, 10);
            assert.match(url, /^assets\/images\/responsive\/.*\.webp$/);
            assert.ok(fs.existsSync(path.join(root, url)), `missing responsive image ${url}`);
            assert.ok(Number.isInteger(width) && width > 0, `invalid width descriptor: ${entry}`);
            return width;
          });
          assert.deepEqual(candidates, [...candidates].sort((a, b) => a - b), `${src} srcset should be width-ordered`);
        } else {
          const [url] = srcset.trim().split(/\s+/);
          assert.match(url, /^assets\/images\/responsive\/.*\.webp$/);
          assert.ok(fs.existsSync(path.join(root, url)), `missing responsive image ${url}`);
        }
      }
    }
  }
});

test('the high-priority homepage hero preload matches its WebP source and is format-gated', () => {
  const html = read('index.html');
  const preloads = html.match(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*>/g) ?? [];
  const hero = photoImages('index.html').find((tag) => tag.includes('data-en-alt="Runners training together outdoors"'));
  assert.ok(preloads.length > 0, 'hero preload is present');
  assert.ok(hero, 'homepage hero photograph is present');
  const sources = webpSourcesFor('index.html', hero);
  assert.ok(sources.length > 0, 'hero picture has WebP sources');
  for (const preload of preloads) {
    assert.equal(attr(preload, 'type'), 'image/webp');
    assert.equal(attr(preload, 'fetchpriority'), 'high');
    const href = attr(preload, 'href');
    if (href) {
      assert.ok(fs.existsSync(path.join(root, href)), `preloaded asset ${href} exists`);
    }
  }
});

test('recruitment dialog uses a dialog-sized WebP candidate rather than a sport-card size hint', () => {
  const dialogImage = photoImages('index.html').find((tag) =>
    (attr(tag, 'src') ?? '').includes('women-coach-recruitment') && attr(tag, 'alt') === ''
  );
  assert.ok(dialogImage, 'coach-recruitment dialog photo exists');
  assert.equal(attr(webpSourceFor('index.html', dialogImage), 'sizes'), 'min(390px, 100vw)');
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

test('events hero image styling remains the same after its picture wrapper', () => {
  const html = read('events.html');
  assert.match(html, /\.hero img\{position:absolute;inset:0;width:100%;height:100%;object-fit:cover/);
  assert.doesNotMatch(html, /\.hero>img\{/);
});

test('coach-login background retains the original JPEG fallback and selects existing WebP derivatives only when supported', () => {
  const css = read('assets/css/coaching-studio.css');
  assert.match(css, /\.auth-story\s*\{[^}]*background-image:[^;}]*mzactive-hero-doha\.jpg/);
  assert.match(css, /@supports\s*\(background-image:\s*image-set\(/);
  assert.match(css, /\.auth-story\s*\{[^}]*image-set\(/);
  for (const width of [960, 1280, 1600]) {
    assert.ok(fs.existsSync(path.join(root, `assets/images/responsive/mzactive-hero-doha-${width}w.webp`)));
  }
});

test('community hero preloads its dedicated format-gated WebP background', () => {
  for (const [page, asset] of [
    ['community.html', 'mzactive-community-run-768w.webp'],
  ]) {
    const html = read(page);
    assert.ok(html.includes(`rel="preload" as="image" href="assets/images/responsive/${asset}" type="image/webp"`), page);
    assert.ok(html.includes(`@supports (background-image: image-set(url("assets/images/responsive/${asset}") type("image/webp")))`), page);
    assert.ok(fs.existsSync(path.join(root, 'assets/images/responsive', asset)), asset);
  }
});

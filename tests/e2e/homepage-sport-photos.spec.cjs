'use strict';

const { test, expect } = require('./pw.cjs');

const SPORTS = [
  ['running', 'Running'],
  ['fitness', 'Fitness'],
  ['swimming', 'Swimming'],
  ['cycling', 'Cycling'],
  ['triathlon', 'Triathlon'],
  ['hyrox', 'HYROX'],
  ['crossfit', 'CrossFit'],
  ['padel', 'Padel'],
  ['boxing', 'Boxing'],
  ['kickboxing', 'Kickboxing'],
];

async function openHomepage(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mzactive-join-dialog-seen', '1');
      localStorage.setItem('mza-install-promo-dismissed', '1');
      sessionStorage.setItem('mza-install-promo-dismissed', '1');
    } catch {
      // Storage is optional; the test only needs to avoid delayed promos.
    }
  });
  await page.goto('/index.html?sport-photo-verify=1');
  await expect(page.locator('.sport-grid')).toBeVisible();
  await page.locator('.sport-card').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.sport-card img')).every((img) => img.complete && img.naturalWidth > 0),
    null,
    { timeout: 20000 },
  );
}

test('explore-by-sport cards load local photos and keep the shared card design', async ({ page }) => {
  await openHomepage(page);

  const cards = page.locator('.sport-card');
  await expect(cards).toHaveCount(10);

  const details = await cards.evaluateAll((elements) => elements.map((card) => {
    const img = card.querySelector('img');
    const art = card.querySelector('.sport-card-art');
    const cardStyle = getComputedStyle(card);
    const imageStyle = img ? getComputedStyle(img) : null;
    return {
      href: card.getAttribute('href'),
      label: card.querySelector('.sport-card-label')?.textContent.trim(),
      hasSvg: Boolean(card.querySelector('svg')),
      hasWebpSource: Boolean(card.querySelector('picture > source[type="image/webp"]')),
      src: img?.getAttribute('src'),
      currentSrc: img?.currentSrc,
      loaded: Boolean(img && img.complete && img.naturalWidth > 0),
      objectFit: imageStyle?.objectFit,
      borderTopLeftRadius: cardStyle.borderTopLeftRadius,
      hasBeforeOverlay: getComputedStyle(card, '::before').content !== 'none',
      hasAfterOverlay: getComputedStyle(card, '::after').content !== 'none',
      artPosition: art ? getComputedStyle(art).position : null,
    };
  }));

  details.forEach((card, index) => {
    const [sport, label] = SPORTS[index];
    expect(card.href, `${sport} link`).toBe(`coaches.html?sport=${sport}`);
    expect(card.label, `${sport} label`).toBe(label);
    expect(card.hasSvg, `${sport} has no placeholder icon`).toBe(false);
    expect(card.hasWebpSource, `${sport} has a WebP source`).toBe(true);
    expect(card.loaded, `${sport} photo loads`).toBe(true);
    expect(card.src, `${sport} uses a local asset`).toContain('assets/images/');
    expect(card.objectFit, `${sport} uses the shared crop`).toBe('cover');
    expect(card.borderTopLeftRadius, `${sport} uses the shared radius`).not.toBe('0px');
    expect(card.hasBeforeOverlay, `${sport} keeps the base overlay`).toBe(true);
    expect(card.hasAfterOverlay, `${sport} keeps the label scrim`).toBe(true);
    expect(card.artPosition, `${sport} uses the shared art container`).toBe('absolute');
  });

  const boxing = details[8];
  const kickboxing = details[9];
  expect(boxing.src).toContain('assets/images/sports/boxing.webp');
  expect(kickboxing.src).toContain('assets/images/sports/kickboxing.webp');
  expect(boxing.currentSrc).toContain('assets/images/responsive/sports/boxing-');
  expect(kickboxing.currentSrc).toContain('assets/images/responsive/sports/kickboxing-');
});

test('every explore-by-sport card remains clickable', async ({ page }) => {
  await openHomepage(page);

  for (const [sport] of SPORTS) {
    await page.locator(`.sport-card[href="coaches.html?sport=${sport}"]`).click();
    await expect(page).toHaveURL(new RegExp(`coaches\\.html\\?sport=${sport}$`));
    await page.goBack();
    await expect(page.locator('.sport-grid')).toBeVisible();
  }
});

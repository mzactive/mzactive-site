'use strict';

const { test, expect } = require('./pw.cjs');

async function openHomepage(page, lang = 'en') {
  await page.addInitScript((language) => {
    try {
      localStorage.setItem('mzactive-language-manual', language);
      localStorage.setItem('mzactive-join-dialog-seen', '1');
      localStorage.setItem('mza-install-promo-dismissed', '1');
      sessionStorage.setItem('mza-install-promo-dismissed', '1');
    } catch {
      // Storage is optional for these layout assertions.
    }
  }, lang);
  await page.goto('/index.html?hero-verify=1');
  await expect(page.locator('.hero h1')).toBeVisible();
}

test('desktop hero keeps its height, two-line headline, readable copy and three large actions', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop-only geometry assertions');
  await openHomepage(page);

  const layout = await page.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, height: box.height };
    };
    const hero = document.querySelector('.hero');
    const image = document.querySelector('.hero-image');
    const heading = document.querySelector('.hero h1');
    const description = document.querySelector('.hero-description');
    const actions = [...document.querySelectorAll('.hero-actions .button')];
    return {
      heroHeight: Math.round(hero.getBoundingClientRect().height),
      image: rect(image),
      heading: rect(heading),
      headingLines: [...heading.querySelectorAll('span')].map(rect),
      descriptionFontSize: parseFloat(getComputedStyle(description).fontSize),
      buttons: actions.map((link) => ({
        text: link.textContent.trim(),
        href: link.getAttribute('href'),
        height: Math.round(link.getBoundingClientRect().height),
      })),
    };
  });

  expect(layout.heroHeight).toBeGreaterThanOrEqual(300);
  expect(layout.heroHeight).toBeLessThanOrEqual(330);
  expect(layout.headingLines).toHaveLength(2);
  expect(layout.headingLines[1].top - layout.headingLines[0].top).toBeCloseTo(layout.headingLines[0].height, 0);
  expect(layout.heading.left).toBeLessThan(layout.image.right);
  expect(layout.heading.left).toBeGreaterThan(layout.image.left);
  expect(layout.descriptionFontSize).toBeGreaterThanOrEqual(14);

  expect(layout.buttons.map((button) => button.text)).toEqual([
    'Find a Coach',
    'Become a Coach',
    'Join the Community',
  ]);
  expect(layout.buttons.map((button) => button.href)).toEqual([
    '#coach-search',
    'providers.html',
    'community.html',
  ]);
  for (const button of layout.buttons) expect(button.height).toBeGreaterThanOrEqual(44);
});

test('Arabic hero uses RTL text and mirrored visual button order', async ({ page }) => {
  await openHomepage(page, 'ar');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('body')).toHaveClass(/rtl/);
  await expect(page.locator('.hero h1')).toContainText('مجتمعك لحياة');
  await expect(page.locator('.hero h1')).toContainText('أكثر صحة ونشاطاً');
  await expect(page.locator('.hero-description')).toContainText('منصة تجمع الجميع');

  const buttons = await page.locator('.hero-actions .button').evaluateAll((links) => links.map((link) => ({
    text: link.textContent.trim(),
    left: Math.round(link.getBoundingClientRect().left),
  })));
  expect(buttons.map((button) => button.text)).toEqual(['ابحث عن مدرب', 'انضم كمدرب', 'انضم إلى المجتمع']);
  expect(buttons[0].left).toBeGreaterThan(buttons[1].left);
  expect(buttons[1].left).toBeGreaterThan(buttons[2].left);
});

test('all three hero buttons keep their existing destinations', async ({ page }) => {
  await openHomepage(page);

  await page.locator('.hero-actions a[href="#coach-search"]').click();
  await expect(page).toHaveURL(/#coach-search$/);

  await page.goto('/index.html?hero-verify=buttons-2');
  await page.locator('.hero-actions a[href="providers.html"]').click();
  await expect(page).toHaveURL(/providers\.html$/);

  await page.goto('/index.html?hero-verify=buttons-3');
  await page.locator('.hero-actions a[href="community.html"]').click();
  await expect(page).toHaveURL(/community\.html$/);
});

test('mobile hero keeps readable typography, all three actions and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomepage(page);

  const mobile = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.hero-actions .button')];
    return {
      descriptionFontSize: parseFloat(getComputedStyle(document.querySelector('.hero-description')).fontSize),
      buttonHeights: buttons.map((button) => Math.round(button.getBoundingClientRect().height)),
      buttonRights: buttons.map((button) => Math.round(button.getBoundingClientRect().right)),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });

  expect(mobile.descriptionFontSize).toBeGreaterThanOrEqual(12);
  expect(mobile.buttonHeights).toHaveLength(3);
  for (const height of mobile.buttonHeights) expect(height).toBeGreaterThanOrEqual(44);
  for (const right of mobile.buttonRights) expect(right).toBeLessThanOrEqual(mobile.innerWidth);
  expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.innerWidth);
});

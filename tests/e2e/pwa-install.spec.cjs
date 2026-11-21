'use strict';

/* Local browser checks only. No store listing, real device or native install
 * result is claimed here; the Chromium prompt is a browser-fired mock event. */
const { test, expect } = require('./pw.cjs');

test.describe('MZA app install UX', () => {
  test('hero keeps only coach actions while the footer uses the native install prompt when fired', async ({ page }) => {
    await page.goto('/index.html');
    const heroActions = page.locator('.hero-actions a');
    await expect(heroActions).toHaveCount(2);
    await expect(heroActions.nth(0)).toHaveText('Find a Coach');
    await expect(heroActions.nth(1)).toHaveText('Become a Coach');
    await expect(page.locator('.hero-actions [data-mza-install-button]')).toHaveCount(0);
    await expect(page.locator('.footer-install [data-mza-install-button]')).toHaveCount(1);
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = () => { window.__mzaPromptCount = (window.__mzaPromptCount || 0) + 1; };
      Object.defineProperty(event, 'userChoice', {
        get: () => Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });
    const button = page.locator('.footer-install [data-mza-install-button]');
    await expect(button).toHaveAttribute('data-install-mode', 'native');
    await button.click();
    await expect.poll(() => page.evaluate(() => window.__mzaPromptCount || 0)).toBe(1);
    await expect(button).toBeHidden();
  });

  test('footer install action gives accurate Safari or Chrome steps in EN and AR', async ({ page }) => {
    await page.goto('/index.html');
    const button = page.locator('.footer-install [data-mza-install-button]');
    await expect(button).toHaveCount(1);
    const ua = await page.evaluate(() => navigator.userAgent);
    const iosSafari = /iPhone/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    await expect(button).toHaveAttribute('data-install-mode', iosSafari ? 'ios' : 'android');
    await button.click();
    const dialog = page.locator('#mzaInstallDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(iosSafari ? 'Add to Home Screen' : 'three-dot menu');
    await page.locator('#mzaInstallClose').click();
    await expect(dialog).toBeHidden();
    await page.locator('.lang-toggle').first().click();
    await button.click();
    await expect(dialog).toContainText(iosSafari ? 'المشاركة' : 'النقاط الثلاث');
    await page.locator('#mzaInstallClose').click();
  });

  test.describe('social in-app browser', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FBAN/FBIOS;FBAV/500.0.0',
    });

    test('detects social browsers and explains the safe path', async ({ page }) => {
      await page.goto('/index.html');
      const button = page.locator('.footer-install [data-mza-install-button]');
      await expect(button).toHaveAttribute('data-install-mode', 'social');
      await button.click();
      const dialog = page.locator('#mzaInstallDialog');
      await expect(dialog).toContainText('in-app browser cannot install MZA');
      await expect(dialog).toContainText('Safari on iPhone or Chrome on Android');
    });
  });

  test('dismissal is remembered and leaves only a small optional footer link', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.footer-install')).toBeVisible();
    await expect(page.locator('#mzaInstallDialog')).toHaveCount(0);

    await page.locator('[data-mza-install-dismiss]').click();
    await expect(page.locator('.footer-install')).toBeHidden();
    const link = page.locator('[data-mza-install-link]');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('Get the MZA App');

    await page.reload();
    await expect(page.locator('.footer-install')).toBeHidden();
    await expect(link).toBeVisible();
    await expect(page.locator('#mzaInstallDialog')).toHaveCount(0);
  });

  test('standalone launch reports the mode and hides install controls', async ({ page }) => {
    await page.addInitScript(() => {
      const realMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = query => (query.includes('display-mode: standalone')
        ? { matches: true, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }
        : realMatchMedia(query));
    });
    await page.goto('/index.html');
    await expect(page.locator('html')).toHaveAttribute('data-mza-launch', 'standalone');
    await expect(page.locator('.footer-install')).toBeHidden();
    await expect(page.locator('[data-mza-install-link]')).toBeHidden();
  });

  test('offline fallback keeps manual EN/AR selection, persistence and RTL', async ({ page }) => {
    await page.goto('/offline.html');
    const toggle = page.locator('.lang-toggle');
    await expect(toggle).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('body')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'أنت غير متصل' })).toBeVisible();
    await expect(toggle).toHaveText('English');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(toggle).toHaveText('English');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});

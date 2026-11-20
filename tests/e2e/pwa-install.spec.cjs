'use strict';

/* Local browser checks only. No store listing, real device or native install
 * result is claimed here; the Chromium prompt is a browser-fired mock event. */
const { test, expect } = require('./pw.cjs');

test.describe('MZA app install UX', () => {
  test('uses the native install prompt only when the browser fires it', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = () => { window.__mzaPromptCount = (window.__mzaPromptCount || 0) + 1; };
      Object.defineProperty(event, 'userChoice', {
        get: () => Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });
    const button = page.locator('.hero-actions [data-mza-install-button]');
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
      const button = page.locator('.hero-actions [data-mza-install-button]');
      await expect(button).toHaveAttribute('data-install-mode', 'social');
      await button.click();
      const dialog = page.locator('#mzaInstallDialog');
      await expect(dialog).toContainText('in-app browser cannot install MZA');
      await expect(dialog).toContainText('Safari on iPhone or Chrome on Android');
    });
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
    await expect(page.locator('.hero-actions [data-mza-install-button]')).toBeHidden();
    await expect(page.locator('.footer-install')).toBeHidden();
  });
});

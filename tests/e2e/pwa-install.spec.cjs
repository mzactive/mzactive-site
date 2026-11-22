'use strict';

/* Local browser checks only. No store listing, real device or native install
 * result is claimed here; the Chromium prompt is a browser-fired mock event. */
const { test, expect } = require('./pw.cjs');

const IOS_SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const INSTAGRAM_IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0 Android';
const WHATSAPP_ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.0';

test.describe('MZA app install UX', () => {
  test('one controller powers the header and footer, and the native prompt is used only after a click', async ({ page }) => {
    await page.goto('/index.html');
    const heroActions = page.locator('.hero-actions a');
    await expect(heroActions).toHaveCount(3);
    await expect(heroActions.nth(0)).toHaveText('Find a Coach');
    await expect(heroActions.nth(1)).toHaveText('Become a Coach');
    await expect(heroActions.nth(2)).toHaveText('Join the Community');
    await expect(page.locator('.hero-actions [data-mza-install-button]')).toHaveCount(0);

    const header = page.locator('.mza-header-install');
    const footer = page.locator('.footer-install [data-mza-install-button]');
    await expect(header).toBeVisible();
    await expect(footer).toBeVisible();
    await expect(page.locator('#mzaInstallDialog')).toHaveCount(0);

    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = () => { window.__mzaPromptCount = (window.__mzaPromptCount || 0) + 1; };
      Object.defineProperty(event, 'userChoice', {
        get: () => new Promise(resolve => { window.__mzaResolveChoice = resolve; }),
      });
      window.dispatchEvent(event);
    });
    await expect(header).toHaveAttribute('data-install-mode', 'native');
    await header.click();
    await header.click({ force: true });
    await expect.poll(() => page.evaluate(() => window.__mzaPromptCount || 0)).toBe(1);
    await page.evaluate(() => window.__mzaResolveChoice({ outcome: 'accepted' }));
    await expect(header).toBeHidden();
    await expect(footer).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-mza-launch', 'standalone');

    await page.reload();
    await expect(header).toBeHidden();
    await expect(page.locator('[data-mza-install-link]')).toBeHidden();
  });

  test('footer install action gives accurate Safari or Chrome steps in EN and AR', async ({ page }) => {
    await page.goto('/index.html');
    const button = page.locator('.footer-install [data-mza-install-button]');
    const ua = await page.evaluate(() => navigator.userAgent);
    const iosSafari = /iPhone/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    await expect(button).toHaveAttribute('data-install-mode', iosSafari ? 'ios' : 'android');
    await button.click();
    const dialog = page.locator('#mzaInstallDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('There is no official App Store or Google Play app to download.');
    await expect(dialog).toContainText(iosSafari ? 'Add to Home Screen' : 'three-dot menu');
    await expect(page.locator('#mzaInstallOpen')).toBeHidden();
    await page.locator('#mzaInstallClose').click();
    await expect(dialog).toBeHidden();

    await page.locator('.lang-toggle').first().click();
    await button.click();
    await expect(dialog).toContainText(iosSafari ? 'المشاركة' : 'النقاط الثلاث');
    await expect(dialog).toContainText('لا يوجد تطبيق رسمي للتنزيل من متجر التطبيقات');
    await page.locator('#mzaInstallClose').click();
    await expect(dialog).toBeHidden();
  });

  test.describe('Instagram in-app browser on iPhone', () => {
    test.use({ userAgent: INSTAGRAM_IOS_UA });

    test('detects Instagram, keeps the site usable and offers a Safari handoff', async ({ page }) => {
      await page.goto('/index.html');
      const button = page.locator('.footer-install [data-mza-install-button]');
      await expect(button).toHaveAttribute('data-install-mode', 'social');
      await expect(page.locator('.menu-toggle')).toBeVisible();
      await expect(page.locator('main')).toBeVisible();
      await button.click();
      const dialog = page.locator('#mzaInstallDialog');
      await expect(dialog).toContainText('in-app browser cannot install MZA');
      await expect(dialog).toContainText('Safari on iPhone or Chrome on Android');
      await expect(page.locator('#mzaInstallOpen')).toBeVisible();
      await expect(page.locator('#mzaInstallOpen')).toHaveAttribute('href', /^x-safari-(https|http):/);
      await expect(page.locator('#mzaInstallCopy')).toBeVisible();
      await page.locator('#mzaInstallClose').click();
      await expect(dialog).toBeHidden();
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('WhatsApp in-app browser on Android', () => {
    test.use({ userAgent: WHATSAPP_ANDROID_UA });

    test('detects WhatsApp and offers an Android Chrome handoff', async ({ page }) => {
      await page.goto('/index.html');
      const button = page.locator('.footer-install [data-mza-install-button]');
      await expect(button).toHaveAttribute('data-install-mode', 'social');
      await button.click();
      await expect(page.locator('#mzaInstallDialog')).toContainText('in-app browser cannot install MZA');
      await expect(page.locator('#mzaInstallOpen')).toHaveAttribute('href', /intent:\/\/.*package=com\.android\.chrome/);
      await expect(page.locator('#mzaInstallCopy')).toBeVisible();
    });
  });

  test('dismissal hides the card and compact action, keeps the site link, and persists', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.footer-install')).toBeVisible();
    await expect(page.locator('#mzaInstallDialog')).toHaveCount(0);

    await page.locator('[data-mza-install-dismiss]').click();
    await expect(page.locator('.footer-install')).toBeHidden();
    await expect(page.locator('.mza-header-install')).toBeHidden();
    const link = page.locator('[data-mza-install-link]');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('Get MZA App');

    await page.reload();
    await expect(page.locator('.footer-install')).toBeHidden();
    await expect(page.locator('.mza-header-install')).toBeHidden();
    await expect(link).toBeVisible();
    await expect(page.locator('#mzaInstallDialog')).toHaveCount(0);

    await link.click();
    await expect(page.locator('#mzaInstallDialog')).toBeVisible();
  });

  test('Got it closes the instructions and suppresses the card without blocking access', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.footer-install [data-mza-install-button]').click();
    await page.locator('#mzaInstallGotIt').click();
    await expect(page.locator('#mzaInstallDialog')).toBeHidden();
    await expect(page.locator('.footer-install')).toBeHidden();
    await expect(page.locator('[data-mza-install-link]')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
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
    await expect(page.locator('.mza-header-install')).toBeHidden();
    await expect(page.locator('[data-mza-install-link]')).toBeHidden();
  });

  test.describe('small iPhone screen', () => {
    test.use({
      viewport: { width: 360, height: 740 },
      isMobile: true,
      hasTouch: true,
      userAgent: IOS_SAFARI_UA,
    });

    test('install controls fit without horizontal overflow and keep 44px touch targets', async ({ page }) => {
      await page.goto('/index.html');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      const header = page.locator('.mza-header-install');
      await expect(header).toBeVisible();
      const box = await header.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      const dismiss = await page.locator('[data-mza-install-dismiss]').boundingBox();
      expect(dismiss.height).toBeGreaterThanOrEqual(44);
    });
  });

  test.describe('Arabic RTL instructions', () => {
    test.use({ userAgent: IOS_SAFARI_UA });

    test('dialog and controls respect RTL after a manual language switch', async ({ page }) => {
      await page.goto('/index.html');
      await page.locator('.lang-toggle').first().click();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('body')).toHaveAttribute('dir', 'rtl');
      await page.locator('.mza-header-install').click();
      const panel = page.locator('.mza-install-dialog__panel');
      await expect(panel).toHaveCSS('text-align', 'right');
      const closeBox = await page.locator('#mzaInstallClose').boundingBox();
      const panelBox = await panel.boundingBox();
      expect(closeBox.x).toBeLessThan(panelBox.x + panelBox.width / 2);
      await page.locator('#mzaInstallClose').click();
      await expect(page.locator('#mzaInstallDialog')).toBeHidden();
    });
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

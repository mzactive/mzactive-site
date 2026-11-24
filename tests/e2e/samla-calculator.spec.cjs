'use strict';

const { test, expect } = require('./pw.cjs');

test('SAMLA calculator renders official stages and results', async ({ page }) => {
  await page.goto('/samla/');
  await expect(page.locator('#stageRows tr')).toHaveCount(7);
  await expect(page.locator('#totals')).toContainText('200.0');
  await expect(page.locator('#totals')).toContainText('Total time');
  await expect(page.locator('body')).toContainText('not affiliated with or endorsed by SAMLA');
});

test('SAMLA AI distribution and independent calculators work', async ({ page }) => {
  await page.goto('/samla/');
  await page.locator('#distributeButton').click();
  await expect(page.locator('#aiRows tr')).toHaveCount(7);
  await page.locator('details.collapsible >> summary', { hasText: 'Carbohydrate' }).click();
  await page.locator('#carbButton').click();
  await expect(page.locator('#carbResult')).toContainText('g');
  await page.locator('details.collapsible >> summary', { hasText: 'Energy gel' }).click();
  await page.locator('#gelButton').click();
  await expect(page.locator('#gelResult')).toContainText('Gels needed'.replace('Gels needed', ''));
  await page.locator('#shareCardButton').click();
  await expect(page.locator('#strategyCanvas')).toBeVisible();
});

test('SAMLA page supports Arabic RTL and English', async ({ page }) => {
  await page.goto('/samla/');
  await page.addInitScript(() => localStorage.setItem('mzactive-language-manual', 'ar'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('body')).toContainText('صمله 200');
  await expect(page.locator('body')).toContainText('احسب');
});

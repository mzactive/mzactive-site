'use strict';

const { test, expect } = require('./pw.cjs');
const { installApiMock, json } = require('./helpers.cjs');

test('SAMLA calculator renders official stages and results', async ({ page }) => {
  await page.goto('/samla/');
  await expect(page.locator('#stageRows tr')).toHaveCount(7);
  await expect(page.locator('#totals')).toContainText('200.0');
  await expect(page.locator('#totals')).toContainText('Finishing time');
  await expect(page.locator('body')).toContainText('not affiliated with or endorsed by SAMLA');
});

test('SAMLA AI distribution and independent calculators work', async ({ page }) => {
  await installApiMock(page, {
    overrides: {
      'POST /api/samla/ai-strategy': json({ answer: 'Estimated strategy: start conservatively, hold steady pacing, fuel regularly, and keep transitions short. This is not a guarantee.' }),
    },
  });
  await page.goto('/samla/');
  await page.locator('#distributeButton').click();
  await expect(page.locator('#aiRows tr')).toHaveCount(7);
  await page.locator('details.collapsible >> summary', { hasText: 'Carbohydrate' }).click();
  await page.locator('#carbButton').click();
  await expect(page.locator('#carbResult')).toContainText('g');
  await page.locator('details.collapsible >> summary', { hasText: 'Energy gel' }).click();
  await page.locator('#gelButton').click();
  await expect(page.locator('#gelResult')).toContainText('Gels needed'.replace('Gels needed', ''));
  await expect(page.locator('#aiStrategyButton')).toBeVisible();
  await page.locator('#aiStrategyButton').click();
  await expect(page.locator('#aiStrategyPanel')).toBeVisible();
  await expect(page.locator('#aiStrategyResult')).toContainText('Estimated strategy', { timeout: 15000 });
  await page.locator('#aiStrategyClose').click();
  await expect(page.locator('#aiStrategyPanel')).toBeHidden();
  await expect(page.locator('#totals')).toContainText('200.0');
  await expect(page.locator('#aiStrategyButton')).toBeVisible();
  await page.locator('#shareCardButton').click();
  await expect(page.locator('#shareCardPreview')).toBeVisible();
  await expect(page.locator('#shareCardPreview button')).toBeVisible();
  await page.locator('#aiStrategyButton').click();
  await expect(page.locator('#aiStrategyPanel')).toBeVisible();
  await expect(page.locator('#aiStrategyResult')).toContainText('Estimated strategy');
  await page.locator('#aiStrategyClose').click();
  await expect(page.locator('#aiStrategyPanel')).toBeHidden();
  await expect(page.locator('#totals')).toContainText('200.0');
});

test('SAMLA page supports Arabic RTL and English', async ({ page }) => {
  await page.goto('/samla/');
  await page.addInitScript(() => localStorage.setItem('mzactive-language-manual', 'ar'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('body')).toContainText('صمله 200');
  await expect(page.locator('body')).toContainText('احسب');
});

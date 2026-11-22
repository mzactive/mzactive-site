'use strict';

const fs = require('node:fs');
const { test, expect } = require('./pw.cjs');
const {
  assertOfflineSafe,
  dashboardData,
  installApiMock,
  seedSession,
} = require('./helpers.cjs');

const SESSION_DETAILS = [
  'Easy Run',
  '[MZ:{"km":8,"minutes":45}]',
  '10 min mobility warm-up',
  '8 km at 6:10–6:35/km, even effort',
  '4 x 20 s relaxed strides with 60 s recovery',
  '10 min cool-down walk and static stretches',
].join('\n');

async function fillStudioField(page, selector, value) {
  // The coaching studio hides the original source fields behind its richer
  // calendar UI. Set the source value directly so this spec exercises the
  // document pipeline rather than the workout editor.
  await page.locator(selector).evaluate((el, next) => {
    el.value = next;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function openStudioWithProgram(page, options = {}) {
  await installApiMock(page, {
    dashboard: dashboardData({ role: 'provider', teams: [], programs: [] }),
    profile: { id: 'coach-e2e', status: 'approved', display_name: 'E2E Coach' },
  });
  if (options.nativeShare) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async data => { window.__sharedDocument = data; },
      });
      window.print = () => { window.__printCalled = true; };
    });
  }
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');
  await page.waitForFunction(() => Boolean(window.MZActiveStudio && window.MZAProgramDocument));

  await page.locator('#trainingClientName').fill('Khaled Athlete');
  await page.locator('#trainingClientPhone').fill('55512345');
  await page.locator('#trainingWeekStart').fill('2026-11-23');
  await fillStudioField(page, '#weekMonday', SESSION_DETAILS);
  await fillStudioField(page, '#weeklyCoachNote', 'Keep the conversational pace on easy days.');
  await page.click('#studioDocumentPreview');
  await expect(page.locator('#programDocumentDialog')).toBeVisible();
}

test('studio preview shows the full professional program in the browser', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'provider', teams: [], programs: [] }),
    profile: { id: 'coach-e2e', status: 'approved', display_name: 'E2E Coach' },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');
  await page.waitForFunction(() => Boolean(window.MZActiveStudio && window.MZAProgramDocument));
  await page.locator('#trainingClientName').fill('Khaled Athlete');
  await page.locator('#trainingWeekStart').fill('2026-11-23');
  await fillStudioField(page, '#weekMonday', SESSION_DETAILS);
  await fillStudioField(page, '#weeklyCoachNote', 'Keep the conversational pace on easy days.');

  const payload = await page.evaluate(() => window.MZAProgramDocument.fromForm(
    document.getElementById('whatsappTrainingForm'), { coachName: 'E2E Coach' },
  ));
  expect(payload.athlete).toBe('Khaled Athlete');
  expect(payload.date_range).toBe('23/11/2026 – 29/11/2026');
  expect(payload.weeks[0].days[0].distance).toBe('8 km');
  expect(payload.weeks[0].days[0].duration).toBe('45 min');

  await page.click('#studioDocumentPreview');
  const dialog = page.locator('#programDocumentDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.program-doc')).toHaveAttribute('dir', 'ltr');
  await expect(dialog.locator('.doc-table tbody tr')).toContainText('8 km at 6:10–6:35/km');
  await expect(dialog.locator('.doc-table tbody tr')).toContainText('4 x 20 s relaxed strides');
  await expect(dialog.locator('.doc-table tbody tr')).toContainText('10 min cool-down walk');
  await expect(dialog.locator('.doc-note')).toHaveText('Keep the conversational pace on easy days.');
  await expect(dialog.locator('#programDocShareInfo')).toContainText('cannot confirm delivery');
  assertOfflineSafe(mock);
});

test('DOCX download is a real Word container and PDF uses the print-ready view', async ({ page }) => {
  await openStudioWithProgram(page, { nativeShare: true });
  const downloadPromise = page.waitForEvent('download');
  await page.click('#programDocDocx');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/khaled-athlete.*\.docx$/i);
  const filePath = await download.path();
  expect(fs.readFileSync(filePath).subarray(0, 2).toString()).toBe('PK');
  await expect(page.locator('#programDocStatus')).toContainText('Document downloaded.');

  await page.click('#programDocPdf');
  await page.waitForFunction(() => window.__printCalled === true);
  await expect(page.locator('#programDocStatus')).toContainText('Save as PDF');
});

test('native share attaches the generated DOCX instead of a plain-text link', async ({ page }) => {
  await openStudioWithProgram(page, { nativeShare: true });
  await expect(page.locator('#programDocShare')).toBeVisible();
  await page.click('#programDocShare');
  await page.waitForFunction(() => Boolean(window.__sharedDocument?.files?.length));
  const shared = await page.evaluate(() => ({
    name: window.__sharedDocument.files[0].name,
    type: window.__sharedDocument.files[0].type,
    text: window.__sharedDocument.text,
  }));
  expect(shared.name).toMatch(/\.docx$/);
  expect(shared.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  expect(shared.text).toContain('Khaled Athlete');
  await expect(page.locator('#programDocStatus')).toContainText('Share sheet opened');
  await expect(page.locator('#programDocShareInfo')).toContainText('cannot confirm delivery');
  await expect(page.locator('#programDocFallback')).toBeVisible();
});

test('unsupported browsers get an explicit summary-only fallback', async ({ page }) => {
  await openStudioWithProgram(page);
  await expect(page.locator('#programDocShare')).toBeHidden();
  await expect(page.locator('#programDocFallback')).toBeVisible();
  await expect(page.locator('#programDocFallback')).toContainText('no file attachment');
});

test('Arabic program documents render RTL with Arabic headings and notes', async ({ page }) => {
  await openStudioWithProgram(page, { nativeShare: true });
  await page.evaluate(() => window.MZActiveStudio.openDocumentPreview({
    lang: 'ar', coach: 'مدربة سارة', athlete: 'خالد الرياضي', title: 'برنامج تدريبي',
    date_range: '٢٣/١١/٢٠٢٦ – ٢٩/١١/٢٠٢٦', note: 'حافظ على الوتيرة المريحة.',
    whatsapp_phone: '55512345',
    weeks: [{ label: 'الأسبوع الأول', days: [{
      key: 'monday', label: 'الاثنين', date: '٢٣/١١/٢٠٢٦', type: 'جري', title: 'جري سهل',
      distance: '٨ كم', duration: '٤٥ دقيقة', lines: ['إحماء ١٠ دقائق', '٨ كم بوتيرة مريحة', 'تهدئة ١٠ دقائق'],
      extras: [], isRest: false,
    }] }],
  }));
  await expect(page.locator('.program-doc')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.program-doc')).toContainText('إم زي أكتيف');
  await expect(page.locator('.doc-table')).toContainText('الاثنين');
  await expect(page.locator('.doc-table')).toContainText('٨ كم بوتيرة مريحة');
  await expect(page.locator('.doc-note')).toHaveText('حافظ على الوتيرة المريحة.');
  await expect(page.locator('#programDocShare')).toContainText('مشاركة المستند عبر واتساب');
});

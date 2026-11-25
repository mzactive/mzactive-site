'use strict';

const { test, expect } = require('./pw.cjs');
const { installApiMock, json } = require('./helpers.cjs');

const PROFILE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MANAGEMENT_NUMBER = '97400000000';

function publicProfile() {
  return {
    id: PROFILE_ID,
    provider_type: 'coach',
    display_name: 'Akram Babanacer',
    verified: true,
    city: 'Doha',
    country: 'Qatar',
    bio: 'Running and endurance coach based in Doha.',
    specialties: ['Running', 'Endurance'],
    languages: ['Arabic', 'English', 'French'],
    experience_years: 8,
    coaching_mode: 'both',
    program_durations: [1, 2, 3],
    indicative_rate_qar: 250,
    qualifications: 'Certified running coach',
    achievements: [{ title: 'Doha 10K winner', awarded_year: 2025 }],
    services: ['Running plans', 'Race preparation'],
    social_links: [],
    gallery_slots: [],
    viewer: { authenticated: false, owner: false, can_message: false },
  };
}

async function openProfile(page, options = {}) {
  const mock = await installApiMock(page, {
    overrides: {
      [`GET /api/providers/${PROFILE_ID}`]: json({ provider: publicProfile() }),
      'GET /api/public/contact-config': json({
        contact: { whatsapp: MANAGEMENT_NUMBER, whatsapp_configured: true },
      }),
      ...(options.overrides || {}),
    },
  });
  if (options.arabic) {
    await page.addInitScript(() => localStorage.setItem('mzactive-language-manual', 'ar'));
  }
  await page.goto(`/coach.html?id=${PROFILE_ID}`);
  await expect(page.locator('#facts > div').first()).toBeVisible();
  return mock;
}

async function layoutMetrics(page) {
  return page.evaluate(() => {
    const rect = el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    const facts = [...document.querySelectorAll('#facts > div')].map(row => {
      const dd = row.querySelector('dd');
      const r = dd.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(dd).lineHeight) || 20;
      return {
        label: row.querySelector('dt').textContent.trim(),
        value: dd.textContent.trim(),
        width: r.width,
        lines: Math.max(1, Math.round(r.height / lineHeight)),
      };
    });
    const momo = document.getElementById('mz-assistant-toggle');
    const wa = document.querySelector('.wa-chat-float');
    const overlap = (a, b) => a && b && !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);
    const footerLinks = [...document.querySelectorAll('.site-footer a')].map(rect);
    return {
      facts,
      coverHelpCount: document.querySelectorAll('#cover-help').length,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      layoutColumns: getComputedStyle(document.querySelector('.profile-layout')).gridTemplateColumns.split(' ').length,
      main: rect(document.querySelector('.main-column')),
      shell: rect(document.querySelector('.page-shell')),
      momo: {
        ...rect(momo),
        text: momo.textContent.trim(),
        label: momo.getAttribute('aria-label'),
        background: getComputedStyle(momo).backgroundColor,
      },
      whatsapp: {
        ...rect(wa),
        href: wa.getAttribute('href'),
        label: wa.getAttribute('aria-label'),
        position: getComputedStyle(wa).position,
      },
      widgetOverlap: overlap(rect(momo), rect(wa)),
      footerOverlap: footerLinks.some(rectLink => overlap(rect(momo), rectLink) || overlap(rect(wa), rectLink)),
    };
  });
}

test('coach profile facts render horizontally at every supported width', async ({ page }) => {
  await openProfile(page);
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await layoutMetrics(page);
    expect(metrics.coverHelpCount, `cover strip at ${width}px`).toBe(0);
    expect(metrics.overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    for (const fact of metrics.facts) {
      expect(fact.width, `${fact.label} width at ${width}px`).toBeGreaterThan(80);
      expect(fact.lines, `${fact.label} lines at ${width}px`).toBeLessThanOrEqual(3);
    }
  }
});

test('public desktop profile uses the available width without an empty right column', async ({ page }) => {
  await openProfile(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const metrics = await layoutMetrics(page);
  expect(metrics.layoutColumns).toBe(2);
  expect(metrics.main.right).toBeGreaterThan(metrics.shell.right - 60);
});

test('floating Momo and WhatsApp controls stay compact, labelled, and non-overlapping', async ({ page }) => {
  await openProfile(page);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const metrics = await layoutMetrics(page);
    expect(metrics.momo.text).toContain('Ask Momo AI');
    expect(metrics.momo.label).toContain('Ask Momo AI');
    expect(metrics.momo.background).toBe('rgb(6, 69, 65)');
    expect(metrics.momo.w).toBeLessThanOrEqual(130);
    expect(metrics.momo.h).toBeLessThanOrEqual(44);
    expect(metrics.whatsapp.href).toContain(`https://wa.me/${MANAGEMENT_NUMBER}?text=`);
    expect(metrics.whatsapp.label).toBe('Chat on WhatsApp');
    expect(metrics.widgetOverlap, `widget overlap at ${width}px`).toBe(false);
    expect(metrics.footerOverlap, `footer overlap at ${width}px`).toBe(false);
    expect(metrics.overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    if (width <= 900) {
      const isCentered = rect => Math.abs(rect.x - (width - rect.w) / 2) <= 2;
      expect(isCentered(metrics.momo), `Momo centering at ${width}px`).toBe(true);
      expect(isCentered(metrics.whatsapp), `WhatsApp centering at ${width}px`).toBe(true);
    }
  }
});

test('Arabic profile keeps RTL facts readable and translates the Momo label', async ({ page }) => {
  await openProfile(page, { arabic: true });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const metrics = await layoutMetrics(page);
  expect(metrics.momo.text).toContain('اسأل مومو');
  expect(metrics.momo.label).toBe('اسأل مومو');
  await page.locator('#mz-assistant-toggle').click();
  await expect(page.locator('#mz-assistant-note')).toContainText('اسأل عن المدربين');
  await expect(page.locator('#mz-assistant-input')).toHaveAttribute('placeholder', 'اكتب سؤالك…');
  await expect(page.locator('#mz-assistant-send')).toHaveText('إرسال');
  await expect(page.locator('#mz-assistant-messages p').first()).toContainText('مرحباً! أنا مومو');
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  for (const fact of metrics.facts) {
    expect(fact.width).toBeGreaterThan(80);
    expect(fact.lines).toBeLessThanOrEqual(3);
  }
});

test('public visitors cannot see private coach controls or trigger private requests', async ({ page }) => {
  const mock = await openProfile(page);
  await expect(page.locator('#editProfile')).toHaveCount(0);
  await expect(page.locator('#ownerRail')).toBeHidden();
  await expect(page.locator('[data-owner-tab]')).toHaveCount(0);
  await expect(page.locator('#changeCover')).toHaveCount(0);
  const privateCalls = mock.calls.filter(call =>
    /^\/api\/(me|admin)\//.test(call.path) || /^\/api\/providers\/[^/]+\/(bookings|analytics)$/.test(call.path));
  expect(privateCalls).toEqual([]);
});

test('new profile really uses light cards and real cover fallback, not global dark theme', async ({page}) => {
  const mock = await openProfile(page);
  const theme = await page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    heading: getComputedStyle(document.querySelector('.profile-heading')).backgroundColor,
    name: getComputedStyle(document.querySelector('#name')).color,
    button: getComputedStyle(document.querySelector('#book')).backgroundColor,
  }));
  expect(theme.background).toBe('rgb(245, 247, 246)');
  expect(theme.heading).toBe('rgb(255, 255, 255)');
  expect(theme.name).toBe('rgb(23, 51, 47)');
  expect(theme.button).toBe('rgb(16, 54, 56)');
  await expect(page.locator('.cover-wrap')).toHaveClass(/no-personal-cover/);
  await expect(page.locator('#coverPhoto')).toBeHidden();
  await expect(page.locator('#tagline')).toBeHidden();
  await expect(page.locator('#bio')).toBeVisible();
  await expect(page.locator('#profileTabs')).toBeHidden();
  await expect(page.locator('#profileSocialTabs')).toBeVisible();
  await expect(page.locator('#book')).toHaveAttribute('href',/provider=/);
  await expect(page.locator('#profilePostsPanel')).toBeHidden();
  await page.locator('[data-social-tab=posts]').click();
  await expect(page.locator('#profilePostsPanel')).toBeVisible();
  await expect(page.locator('#bio')).toBeHidden();
});
test('personal cover image uses actual API media without stock picture source', async ({page}) => {
  const mock = await openProfile(page,{overrides:{['GET /api/providers/'+PROFILE_ID]:json({provider:{...publicProfile(),has_cover:true,cover_updated_at:'2026-11-25'}})}});
  await expect(page.locator('#coverPhoto')).toHaveAttribute('src',/\/api\/providers\/[^/]+\/cover\?v=/);
  await expect(page.locator('.cover-wrap picture source')).toHaveCount(0);
});

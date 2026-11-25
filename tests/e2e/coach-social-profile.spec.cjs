'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json } = require('./helpers.cjs');

const COACH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const COACH = {
  id: COACH_ID,
  provider_type: 'coach',
  display_name: 'Akram Babanacer',
  professional_category: { en: 'Sports Coach', ar: 'مدرب رياضي' },
  verified: true,
  city: 'Doha',
  country: 'Qatar',
  bio: 'Endurance and running coach in Doha.',
  specialties: ['Running', 'Endurance'],
  languages: ['Arabic', 'English'],
  experience_years: 8,
  coaching_mode: 'both',
  program_durations: [1, 2, 3],
  indicative_rate_qar: 250,
  follower_count: 120,
  services: ['Running plans', 'Race preparation'],
  qualifications: 'Certified running coach',
  achievements: [],
  social_links: [],
  gallery_slots: [],
  public_fields: ['city', 'specialties', 'languages', 'bio', 'experience_years', 'indicative_rate_qar', 'profile_photo', 'social_links', 'program_durations', 'qualifications', 'services'],
  viewer: { authenticated: false, owner: false, can_message: false },
};

test('discovery cards are compact horizontal cards with real details on every device', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/providers': json({
        providers: [{
          ...COACH,
          has_profile_photo: true,
          profile_photo_updated_at: '2026-11-24T00:00:00.000Z',
        }],
      }),
      [`GET /api/providers/${COACH_ID}/photo`]: {
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#205456"/></svg>',
      },
    },
  });
  await page.goto('/coaches.html');
  const card = page.locator(`#coach-${COACH_ID}`);
  await expect(card).toBeVisible();
  const layout = await card.evaluate(el => {
    const photo = el.querySelector('.photo').getBoundingClientRect();
    const image = el.querySelector('.photo img');
    const badge = el.querySelector('.verified-badge').getBoundingClientRect();
    const columns = getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ').length;
    return {
      photoWidth: Math.round(photo.width), photoHeight: Math.round(photo.height),
      fit: getComputedStyle(image).objectFit, badgeHeight: Math.round(badge.height), columns,
      text: el.textContent, emoji: /[🏃🏁📍]/.test(el.textContent), tagCount: el.querySelectorAll('.tag').length,
    };
  });
  const mobile = await page.evaluate(() => window.innerWidth <= 620);
  expect(layout.photoWidth).toBe(mobile ? 90 : 120);
  expect(layout.photoHeight).toBe(mobile ? 120 : 160);
  expect(layout.fit).toBe('cover');
  expect(layout.badgeHeight).toBeLessThan(24);
  expect(layout.columns).toBe(mobile ? 1 : 3);
  expect(layout.emoji).toBe(false);
  expect(layout.tagCount).toBe(0);
  await expect(card).toContainText('Doha, Qatar');
  await expect(card).toContainText('8 years experience');
  await expect(card).toContainText('Arabic · English');
  await expect(card).toContainText('Running plans · Race preparation');
  await expect(card.getByRole('link', { name: 'View Profile' })).toHaveAttribute('href', `coach.html?id=${COACH_ID}`);
  await expect(card.getByRole('link', { name: 'Send Request' })).toHaveAttribute('href', `pacer.html?provider=${COACH_ID}#request`);
  assertOfflineSafe(mock);
});

test('homepage featured coaches use the compact horizontal card design', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/providers': json({
        providers: [{ ...COACH, has_profile_photo: false }],
      }),
    },
  });
  await page.goto('/index.html');
  const card = page.locator('#featuredCoachGrid .coach-card').first();
  await expect(card).toBeVisible();
  const layout = await card.evaluate(el => {
    const photo = el.querySelector('.coach-card-photo,.coach-card-photo-placeholder').getBoundingClientRect();
    return {
      width: Math.round(photo.width), height: Math.round(photo.height),
      hasInfo: Boolean(el.querySelector('.coach-info')),
      verified: Boolean(el.querySelector('.coach-verified')),
      emoji: /[🏃🏁📍⌖]/.test(el.textContent),
    };
  });
  const mobile = await page.evaluate(() => window.innerWidth <= 720);
  expect(layout.width).toBe(mobile ? 72 : 88);
  expect(layout.height).toBe(mobile ? 96 : 118);
  expect(layout.hasInfo).toBe(true);
  expect(layout.verified).toBe(true);
  expect(layout.emoji).toBe(false);
  await expect(card).toContainText('Akram Babanacer');
  await expect(card).toContainText('Doha, Qatar');
  assertOfflineSafe(mock);
});

test('public coach profile shows real stats, social tabs and a visible follow action', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      [`GET /api/providers/${COACH_ID}`]: json({ provider: COACH }),
      'GET /api/blog/posts': json({
        posts: [{ id: 'blog-1', title: 'Building an endurance base', summary: 'A practical four-week plan.' }],
      }),
      [`GET /api/providers/${COACH_ID}/community`]: json({
        events: [],
        posts: [{ id: 'post-1', kind: 'post', body: 'Long run today in Doha.', likes: 12, comments: 3 }],
      }),
    },
  });
  await page.goto(`/coach.html?id=${COACH_ID}`);
  await expect(page.locator('#profileStats')).toContainText('120');
  await expect(page.locator('#profileStats')).toContainText('8');
  await expect(page.locator('#followPublic')).toBeVisible();
  await expect(page.locator('#book')).toBeVisible();
  await expect(page.locator('#share')).toBeVisible();
  const header = await page.evaluate(() => {
    const cover = document.querySelector('.cover-wrap').getBoundingClientRect();
    const portrait = document.querySelector('.portfolio-portrait .portrait-frame').getBoundingClientRect();
    const copy = document.querySelector('.portfolio-copy').getBoundingClientRect();
    return {
      coverHeight: Math.round(cover.height),
      portraitRatio: +(portrait.width / portrait.height).toFixed(2),
      portraitX: Math.round(portrait.x), copyX: Math.round(copy.x),
      portraitY: Math.round(portrait.y), copyY: Math.round(copy.y),
      rtl: document.documentElement.dir === 'rtl',
      viewport: window.innerWidth,
    };
  });
  expect(header.coverHeight).toBeLessThan(100);
  expect(header.portraitRatio).toBeCloseTo(0.75, 1);
  if (header.viewport > 900) {
    expect(header.rtl ? header.portraitX < header.copyX : header.portraitX > header.copyX).toBe(true);
  } else {
    expect(header.portraitY).toBeLessThan(header.copyY);
  }

  await page.locator('#profileSocialTabs [data-social-tab="blogs"]').click();
  await expect(page.locator('#profileBlogsPanel')).toBeVisible();
  await expect(page.locator('#coachBlogs')).toContainText('Building an endurance base');
  await expect(page.locator('#community')).toBeHidden();
  await expect(page.locator('#followPublic')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#profileSocialTabs [data-social-tab="programs"]').click();
  await expect(page.locator('#profileProgramsPanel')).toContainText('1 month');
  await expect(page.locator('#profileBlogsPanel')).toBeHidden();
  assertOfflineSafe(mock);
});

test('Arabic directory cards keep the compact layout with RTL labels', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: { 'GET /api/providers': json({ providers: [{ ...COACH, has_profile_photo: false }] }) },
  });
  await page.addInitScript(() => localStorage.setItem('mzactive-language-manual', 'ar'));
  await page.goto('/coaches.html');
  const card = page.locator(`#coach-${COACH_ID}`);
  await expect(card).toBeVisible();
  await expect(card).toContainText('معتمد');
  await expect(card).toContainText('عرض الملف');
  await expect(card).toContainText('إرسال طلب');
  await expect(card).toContainText('Doha, Qatar');
  const direction = await card.evaluate(el => getComputedStyle(el).direction);
  expect(direction).toBe('rtl');
  assertOfflineSafe(mock);
});

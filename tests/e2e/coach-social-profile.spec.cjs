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

test('discovery cards show vertical real photos, statistics and compact actions', async ({ page }) => {
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
  const photo = card.locator('.photo');
  const shape = await photo.evaluate(el => {
    const image = el.querySelector('img');
    const style = getComputedStyle(image);
    return { ratio: el.getBoundingClientRect().height / el.getBoundingClientRect().width, fit: style.objectFit };
  });
  expect(shape.ratio).toBeGreaterThan(1);
  expect(shape.fit).toBe('cover');
  await expect(card.locator('.stat-row .stat')).toHaveCount(3);
  await expect(card.locator('.stat-row')).toContainText('120');
  await expect(card.locator('.stat-row')).toContainText('8');
  await expect(card.getByRole('link', { name: 'View Profile' })).toHaveAttribute('href', `coach.html?id=${COACH_ID}`);
  await expect(card.getByRole('link', { name: 'Send Request ↗' })).toHaveAttribute('href', `pacer.html?provider=${COACH_ID}#request`);
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

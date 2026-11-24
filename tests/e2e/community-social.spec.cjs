'use strict';

const { test, expect } = require('./pw.cjs');
const { assertOfflineSafe, installApiMock, json, seedSession } = require('./helpers.cjs');

const POST = {
  id: 'post-social-1', kind: 'post', body: '12 km at an easy pace this morning.',
  author_name: 'Abdelkarim Elarsi', published_at: '2026-11-24T06:00:00.000Z',
  likes: 12, comments: 3, photos: [], sport: 'running',
};

test('community feed switches Feed, Blogs and Challenges with real content', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/community/posts': json({ posts: [POST] }),
      'GET /api/blog/posts': json({ posts: [{ id: 'blog-social-1', title: 'Base building', summary: 'A simple four-week block.', coach_name: 'Coach A' }] }),
    },
  });
  await page.goto('/community.html');
  const tabs = page.locator('#communitySocialTabs');
  await expect(tabs.locator('button')).toHaveCount(4);
  await expect(page.locator('#feedList')).toContainText('12 km at an easy pace');
  await expect(page.locator('#feedList')).toContainText('Share');

  await tabs.locator('[data-feed-tab="blogs"]').click();
  await expect(page.locator('#communityBlogs')).toBeVisible();
  await expect(page.locator('#communityBlogs')).toContainText('Base building');
  await expect(page.locator('#feedList')).toBeHidden();

  await tabs.locator('[data-feed-tab="challenges"]').click();
  await expect(page.locator('#feedKind')).toHaveValue('challenge');
  await expect(page.locator('#feedList')).toBeVisible();
  await expect(page.locator('#communityBlogs')).toBeHidden();
  assertOfflineSafe(mock);
});

test('the FB composer opens the existing post form with the typed update', async ({ page }) => {
  const mock = await installApiMock(page, {
    overrides: {
      'GET /api/me/access': json({
        user: { id: 'e2e-member', email: 'member@example.invalid', role: 'provider' },
        account_type: 'member', dashboard_path: '/dashboard.html', management: { enabled: false, permissions: [] },
      }),
    },
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/community.html');
  await page.locator('#fbComposerText').fill('Long run completed in Doha.');
  await page.locator('[data-compose="photo"]').click();
  await expect(page.locator('#postForm')).toBeVisible();
  await expect(page.locator('#postBody')).toHaveValue('Long run completed in Doha.');
  assertOfflineSafe(mock);
});

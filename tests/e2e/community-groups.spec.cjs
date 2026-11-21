'use strict';

const { test, expect } = require('./pw.cjs');
const {
  assertOfflineSafe,
  communityEventFixture,
  communityFixture,
  communityMessageFixture,
  communityPostFixture,
  dashboardData,
  installApiMock,
  json,
  seedSession,
} = require('./helpers.cjs');

const VISITOR_VIEWER = {
  member: false, owner: false, can_manage: false, can_post: false,
  membership_status: '', role: '',
};

const ADMIN_ACCESS = json({
  user: { id: 'e2e-admin', email: 'admin@example.invalid', role: 'admin' },
  account_type: 'admin',
  dashboard_path: '/admin.html',
  management: { enabled: true, permissions: [] },
});

test('community discovery, detail, events, feed and chat use live fixture data', async ({ page }) => {
  const visitorCommunity = communityFixture({ viewer: { ...VISITOR_VIEWER } });
  const mock = await installApiMock(page, {
    communities: [
      visitorCommunity,
      communityFixture({
        id: 'community-cycling', name: 'Doha Cyclists', sport: 'cycling',
        viewer: { ...VISITOR_VIEWER },
      }),
    ],
    communityDetail: visitorCommunity,
    communityPosts: [
      communityPostFixture(),
      communityPostFixture({ id: 'community-post-e2e-2', body: 'Second synthetic community update.' }),
    ],
    communityEvents: [communityEventFixture()],
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/community.html');

  await expect(page.locator('#communityList')).toContainText('Doha Morning Runners');
  await page.locator('#communitySport').selectOption('running');
  await expect(page.locator('#communityList')).toContainText('Doha Morning Runners');
  await expect(page.locator('#communityList')).not.toContainText('Doha Cyclists');
  expect(mock.calls.some(call => call.path === '/api/communities' && call.query.sport === 'running')).toBe(true);
  await expect(page.locator('#upcomingList')).toContainText('Saturday Easy Run');
  expect(mock.calls.some(call => call.path === '/api/community/upcoming')).toBe(true);

  await page.locator('#communityList').getByRole('button', { name: 'Open community' }).first().click();
  await expect(page.locator('#communityDetail')).toBeVisible();
  await expect(page.locator('#communityName')).toHaveText('Doha Morning Runners');
  await expect(page.locator('#joinButton')).toHaveText('Join community');
  await expect(page.locator('#postForm')).toBeHidden();
  await expect(page.locator('#chatForm')).toBeHidden();
  await expect(page.locator('#feedList')).toContainText('Synthetic community update');
  await expect(page.locator('#feedList')).toContainText('Second synthetic community update.');

  await page.locator('#joinButton').click();
  await expect(page.locator('#joinButton')).toHaveText('Leave community');
  await expect(page.locator('#postForm')).toBeVisible();

  await page.locator('[data-community-tab="events"]').click();
  await expect(page.locator('#communityEventList')).toContainText('Saturday Easy Run');

  await page.locator('[data-community-tab="chat"]').click();
  await expect(page.locator('#chatForm')).toBeVisible();
  await expect(page.locator('#chatList')).toContainText('Synthetic group message for offline checks.');
  await page.locator('#chatInput').fill('Synthetic chat reply for automated checks.');
  await page.locator('#chatForm').getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('#chatList')).toContainText('Synthetic chat reply for automated checks.');
  const sent = mock.calls.find(call => call.method === 'POST' && call.path === '/api/communities/community-e2e/messages');
  expect(sent.body).toEqual({ body: 'Synthetic chat reply for automated checks.' });
  assertOfflineSafe(mock);
});

test('an eligible member creates an active community and a moderator creates a recurring event', async ({ page }) => {
  const mock = await installApiMock(page, { communityMessages: [communityMessageFixture()] });
  await seedSession(page, { storage: 'local' });
  await page.goto('/community.html');

  await expect(page.locator('#createCommunityForm')).toBeVisible();
  await page.locator('#newCommunityName').fill('E2E Cycling Community');
  await page.locator('#newCommunitySport').selectOption('cycling');
  await page.locator('#newCommunityDescription').fill('A synthetic private group used only for offline checks.');
  await page.locator('#newCommunityLocation').fill('Doha');
  await page.locator('#newCommunityVisibility').selectOption('private');
  await page.locator('#newCommunityRules').fill('Be respectful.');
  await page.locator('#createCommunityForm').getByRole('button', { name: 'Create community' }).click();

  await expect(page.locator('#discoverNotice')).toContainText('Community created and active now.');
  await expect(page.locator('#communityName')).toHaveText('E2E Cycling Community');
  await expect(page.locator('[data-community-tab="manage"]')).toBeVisible();
  const creation = mock.calls.find(call => call.method === 'POST' && call.path === '/api/communities');
  expect(creation.body).toMatchObject({
    name: 'E2E Cycling Community', sport: 'cycling', visibility: 'private', rules: 'Be respectful.',
  });

  await page.locator('[data-community-tab="manage"]').click();
  await page.locator('#communityEventTitle').fill('Saturday Social Ride');
  await page.locator('#communityEventBody').fill('Synthetic recurring free ride.');
  await page.locator('#communityEventStarts').fill('2026-11-28T10:30');
  await page.locator('#communityEventLocation').fill('Corniche');
  await page.locator('#communityEventRepeat').check();
  await page.locator('#communityEventForm').getByRole('button', { name: 'Create event' }).click();

  await expect(page.locator('#communityNotice')).toHaveText('Event created.');
  const eventCreation = mock.calls.find(call => call.method === 'POST' && call.path === '/api/communities/community-e2e-new/posts');
  expect(eventCreation.body).toMatchObject({
    kind: 'group_session', title: 'Saturday Social Ride', sport: 'cycling',
    location: 'Corniche', repeat_weekly: true,
  });
  await page.locator('[data-community-tab="events"]').click();
  await expect(page.locator('#communityEventList')).toContainText('Saturday Social Ride');
  assertOfflineSafe(mock);
});

test('an approved coach publishes a community post, a finite-recurring event and cancels one occurrence', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'provider' }),
    overrides: {
      'DELETE /api/me/community/events/coach-event-e2e': (ctx, state) => {
        state.coachCommunity.events = state.coachCommunity.events.map(event => (
          event.id === 'coach-event-e2e'
            ? { ...event, cancelled_at: '2026-11-21T12:00:00.000Z' }
            : event
        ));
        return json({ updated: true, cancelled: true });
      },
    },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');

  await expect(page.locator('#coachCommunityPanel')).toBeVisible();
  await expect(page.locator('#coachCommunityList')).toContainText('Doha Morning Runners');
  await page.locator('#coachCommunityPostBody').fill('Synthetic approved coach update for offline checks.');
  await page.locator('#coachCommunityPostForm').getByRole('button', { name: 'Publish post' }).click();
  await expect(page.locator('#coachCommunityPostStatus')).toHaveText('Post published.');
  const post = mock.calls.find(call => call.method === 'POST' && call.path === '/api/me/community/posts');
  expect(post.body).toMatchObject({ community_id: 'community-e2e', kind: 'post' });

  await page.locator('#coachEventTitle').fill('Free Saturday Group Run');
  await page.locator('#coachEventBody').fill('Synthetic public group session.');
  await page.locator('#coachEventStart').fill('2026-11-28T06:00');
  await page.locator('#coachEventLocation').fill('Corniche');
  await page.locator('#coachEventRepeat').check();
  await page.locator('#coachCommunityEventForm').getByRole('button', { name: 'Create event' }).click();
  await expect(page.locator('#coachCommunityEventStatus')).toHaveText('Event created.');
  await expect(page.locator('#coachEventList')).toContainText('Free Saturday Group Run');
  const event = mock.calls.find(call => call.method === 'POST' && call.path === '/api/me/community/events');
  expect(event.body).toMatchObject({
    kind: 'group_session', title: 'Free Saturday Group Run', repeat_weekly: true,
  });
  expect(event.body.community_id).toBeUndefined();

  const eventRow = page.locator('#coachEventList .card', { hasText: 'Free Saturday Group Run' });
  await eventRow.getByRole('button', { name: 'Cancel event' }).click();
  await expect(eventRow).toContainText('Cancelled');
  expect(mock.calls.some(call => call.method === 'DELETE' && call.path === '/api/me/community/events/coach-event-e2e')).toBe(true);
  assertOfflineSafe(mock);
});

test('a public coach profile shows permitted community activity without private owner controls', async ({ page }) => {
  const coachId = '11111111-1111-4111-8111-111111111111';
  const mock = await installApiMock(page, {
    coachCommunity: {
      events: [communityEventFixture({
        id: 'public-event-e2e', title: 'Public Saturday Run', community_id: 'community-e2e', rsvp: '',
      })],
      posts: [communityPostFixture({ id: 'public-post-e2e', body: 'Public coach community update.' })],
    },
    overrides: {
      [`GET /api/providers/${coachId}`]: json({
        provider: {
          id: coachId, status: 'approved', provider_type: 'coach', verified: true,
          display_name: 'E2E Community Coach', city: 'Doha', country: 'Qatar',
          bio: 'Synthetic public biography for offline checks.', specialties: ['Running'],
          languages: ['English'], services: ['Group sessions'],
        },
      }),
    },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto(`/coach.html?id=${coachId}`);

  await expect(page.locator('#name')).toHaveText('E2E Community Coach');
  await expect(page.locator('#coachCommunityEvents')).toContainText('Public Saturday Run');
  await expect(page.locator('#coachPosts')).toContainText('Public coach community update.');
  await expect(page.locator('#editProfile')).toHaveCount(0);
  await expect(page.locator('#bookings')).toHaveCount(0);

  await page.locator('#coachCommunityEvents').getByRole('button', { name: 'RSVP' }).click();
  await expect(page.locator('#coachCommunityEvents')).toContainText('Going ✓');
  const rsvp = mock.calls.find(call => call.method === 'POST' && call.path === '/api/community/posts/public-event-e2e/rsvp');
  expect(rsvp.body).toEqual({ response: 'going' });
  assertOfflineSafe(mock);
});

test('management moderates communities, reports and audit history without production writes', async ({ page }) => {
  const mock = await installApiMock(page, {
    communityAudit: [{
      id: 'audit-e2e', action: 'community_created', entity_type: 'community',
      created_at: '2026-11-21T08:00:00.000Z',
    }],
    communityReports: [{
      id: 'report-e2e', community_id: 'community-e2e', community_name: 'Doha Morning Runners',
      entity_type: 'post', entity_id: 'community-post-e2e', reason: 'spam', status: 'open',
      reporter_email: 'member@example.invalid', created_at: '2026-11-21T09:00:00.000Z',
    }],
    overrides: {
      'GET /api/me/access': ADMIN_ACCESS,
      'PATCH /api/admin/community/reports/report-e2e': (ctx, state) => {
        state.communityReports = state.communityReports.map(report => (
          report.id === 'report-e2e' ? { ...report, status: 'reviewed' } : report
        ));
        return json({ updated: true });
      },
    },
  });
  page.on('dialog', dialog => {
    if (dialog.type() === 'confirm') return dialog.accept();
    return dialog.accept(dialog.message().includes('removal') ? 'policy violation' : 'spam wave');
  });
  await seedSession(page, { storage: 'session' });
  await page.goto('/admin.html?tab=community');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#view')).toContainText('Doha Morning Runners');
  await expect(page.locator('#view')).toContainText('Reports and flagged content');

  const communityCard = page.locator('.card[data-record-id="community-e2e"]');
  await communityCard.getByRole('button', { name: 'Suspend' }).click();
  await expect(communityCard).toContainText('Suspended');
  await communityCard.getByRole('button', { name: 'Restore' }).click();
  await expect(communityCard).toContainText('Active');
  await communityCard.getByRole('button', { name: 'Audit history' }).click();
  await expect(communityCard).toContainText('community_created');

  const reportCard = page.locator('.card[data-record-id="report-e2e"]');
  await expect(reportCard).toContainText('spam');
  await reportCard.getByRole('button', { name: 'Reviewed' }).click();
  await expect(reportCard).toContainText('Reviewed');

  await communityCard.getByRole('button', { name: 'Remove' }).click();
  await expect(communityCard).toContainText('Removed');
  const removal = mock.calls.find(call => (
    call.method === 'PATCH' && call.path === '/api/admin/communities/community-e2e' && call.body?.status === 'removed'
  ));
  expect(removal.body.reason).toBe('policy violation');
  assertOfflineSafe(mock);
});

test('the community page keeps Arabic RTL discovery and placeholders', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mzactive-language-manual', 'ar'));
  const mock = await installApiMock(page);
  await page.goto('/community.html');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#discover h2')).toContainText('اكتشف المجتمعات');
  await expect(page.locator('#communitySearch')).toHaveAttribute('placeholder', 'الاسم أو الرياضة أو الوصف');
  await expect(page.locator('#communityList')).toContainText('Doha Morning Runners');
  assertOfflineSafe(mock);
});

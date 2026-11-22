'use strict';

/*
 * Shared helpers for offline-safe Playwright journeys.
 *
 * Every request that leaves the site origin is intercepted. Worker API calls
 * are answered by an in-memory mock; anything else (including WhatsApp) is
 * blocked and recorded so a test can never write to production.
 */

const assert = require('node:assert/strict');

const API_ORIGIN = (process.env.API_BASE_URL || 'https://mzactive-marketplace-api.mzactive5.workers.dev').replace(/\/$/, '');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080';
const SESSION_KEY = 'mzactive-provider-session';
const FAKE_TOKEN = 'e2e-only-mock-token-not-a-secret';

function json(body, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

function abort() {
  return { action: 'abort' };
}

function dashboardData(overrides = {}) {
  return {
    role: 'provider',
    user: { id: 'e2e-coach', email: 'coach@example.invalid' },
    teams: [],
    programs: [],
    coaches: [{ user_id: 'e2e-coach', display_name: 'E2E Coach' }],
    ...overrides,
  };
}

function connection(overrides = {}) {
  return {
    id: 'conn-e2e-1',
    coach_name: 'E2E Coach',
    athlete_name: 'E2E Athlete',
    status: 'pending',
    source: 'request',
    workspace_status: 'pending',
    updated_at: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

function message(overrides = {}) {
  return {
    id: 'msg-e2e-1',
    sender_user_id: 'e2e-coach',
    body: 'Welcome to the private workspace.',
    created_at: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

function communityFixture(overrides = {}) {
  return {
    id: 'community-e2e',
    name: 'Doha Morning Runners',
    sport: 'running',
    description: 'A welcoming group for easy runs and walks in Doha.',
    location: 'Doha',
    visibility: 'public',
    rules: 'Be kind and respect every member.',
    owner_user_id: 'e2e-coach',
    member_count: 24,
    status: 'active',
    created_at: '2026-11-01T08:00:00.000Z',
    updated_at: '2026-11-20T08:00:00.000Z',
    has_cover: false,
    viewer: {
      member: true, owner: true, can_manage: true, can_post: true,
      membership_status: 'active', role: 'owner',
    },
    ...overrides,
  };
}

function communityPostFixture(overrides = {}) {
  return {
    id: 'community-post-e2e',
    author_user_id: 'e2e-coach',
    author_name: 'E2E Coach',
    community_id: 'community-e2e',
    kind: 'post',
    title: '',
    body: 'Synthetic community update for offline checks.',
    sport: 'running',
    location: 'Doha',
    starts_at: '',
    going: 0,
    interested: 0,
    liked: false,
    likes: 3,
    comments: 1,
    photos: [],
    rsvp: '',
    status: 'published',
    published_at: '2026-11-20T09:00:00.000Z',
    created_at: '2026-11-20T09:00:00.000Z',
    cancelled_at: null,
    ...overrides,
  };
}

function communityEventFixture(overrides = {}) {
  return communityPostFixture({
    id: 'community-event-e2e',
    kind: 'group_session',
    title: 'Saturday Easy Run',
    body: 'Synthetic free group session for offline checks.',
    starts_at: '2026-11-28T05:30:00.000Z',
    location: 'Corniche',
    going: 5,
    interested: 2,
    series_id: '',
    recurrence: 'none',
    ...overrides,
  });
}

function communityMessageFixture(overrides = {}) {
  return {
    id: 'community-message-e2e',
    sender_user_id: 'e2e-coach',
    sender_name: 'E2E Coach',
    body: 'Synthetic group message for offline checks.',
    created_at: '2026-11-20T10:00:00.000Z',
    has_photo: false,
    ...overrides,
  };
}

function readBody(request) {
  const raw = request.postData();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return String(raw).slice(0, 500);
  }
}

function defaultApiHandler(ctx, state) {
  const { method, path: urlPath } = ctx;

  if (urlPath === '/health') return json({ intake_enabled: true });
  if (method === 'GET' && urlPath === '/api/public/contact-config') {
    return json({ contact: { whatsapp: '97400000000', whatsapp_configured: true } });
  }
  if (urlPath === '/api/auth/setup-status') return json({ setup_available: false });
  if (urlPath === '/api/auth/login') {
    return json({
      token: FAKE_TOKEN,
      user: { id: 'e2e-coach', role: 'provider' },
      account_type: 'provider',
      dashboard_path: '/dashboard.html',
      management: { enabled: false, permissions: [] },
    });
  }
  if (urlPath === '/api/auth/logout') return json({ ok: true });
  if (urlPath === '/api/admin/history') return json({ events: [] });
  if (urlPath === '/api/admin/dashboard') {
    return json({
      counts: { bookings: 0, coaches: 0, messages: 0, community: 0, articles: 0, ai: 0 },
      notifications: [],
      unread: 0,
      total: 0,
      activity: [],
      generated_at: '2026-11-21T12:00:00.000Z',
    });
  }
  if (urlPath === '/api/admin/notifications' && method === 'PATCH') return json({ updated: true, count: 0 });
  if (urlPath === '/api/admin/messages') return json({ messages: [] });
  if (urlPath === '/api/admin/applications') {
    return json({ providers: [], approved_providers: [], rejected_providers: [], suspended_providers: [], bookings: [] });
  }
  if (urlPath === '/api/admin/accounts' && method === 'GET') {
    return json({ accounts: [], total: 0 });
  }
  if (/^\/api\/admin\/accounts\/[^/]+$/.test(urlPath) && method === 'GET') {
    const id = urlPath.split('/').pop(), coach = id.startsWith('coach');
    return json({
      account: {
        id, email: coach ? 'coach-e2e@example.invalid' : 'athlete-e2e@example.invalid',
        role: 'provider', account_status: 'active',
        profile_id: coach ? 'profile-e2e' : null,
        profile_status: coach ? 'approved' : null,
        submission_state: coach ? 'submitted' : null,
        display_name: coach ? 'E2E Coach' : 'E2E Athlete',
        booking_count: 2, program_count: 1, role_mismatch: !coach,
      },
      events: [],
    });
  }
  if (/^\/api\/admin\/accounts\/[^/]+\/(coach-application|suspend|reactivate|delete)$/.test(urlPath) && method === 'POST') {
    const action = urlPath.split('/').pop();
    return json({
      ok: true, account_status: action === 'suspend' ? 'suspended' : 'active',
      anonymized: action === 'delete', bookings_preserved: action === 'delete',
    });
  }
  if (urlPath === '/api/admin/ai/settings' && method === 'PATCH') return json({ updated: ctx.body || {} });
  if (urlPath === '/api/admin/ai/settings') {
    return json({
      settings: [
        { key: 'athlete_coach_enabled', value: 'true', updated_at: '2026-11-22T00:00:00.000Z' },
        { key: 'coach_planner_enabled', value: 'true', updated_at: '2026-11-22T00:00:00.000Z' },
      ],
      usage: [],
      drafts: [],
    });
  }
  if (urlPath === '/api/admin/agents') {
    return json({
      snapshot: {
        pending_provider_profiles: 0, open_booking_requests: 0, pending_coach_articles: 0,
        unlinked_programs: 0, approved_providers: 0, registered_athletes: 0,
        active_training_teams: 0, pending_community_posts: 0, pending_community_comments: 0,
        published_community_posts: 0, weekly_challenges: 0,
      },
      tasks: [], pending: [], activity: [], status: 'available',
    });
  }
  if (urlPath === '/api/me/access') {
    return json({
      user: { id: 'e2e-coach', email: 'coach@example.invalid', role: 'provider' },
      account_type: 'provider',
      dashboard_path: '/dashboard.html',
      management: { enabled: false, permissions: [] },
    });
  }
  if (urlPath === '/api/me/completeness') {
    return json({ status: state.profile?.status || 'approved', completeness: { percent: 92, missing: [] } });
  }
  if (urlPath === '/api/me/contact-config') {
    return json({
      contact: { configured: true, email_configured: true, whatsapp_configured: true, email: 'management@example.invalid', whatsapp: '97400000000' },
      email_delivery: true,
    });
  }
  if (urlPath === '/api/me/contacts' && method === 'POST') {
    return json({ id: 'contact-e2e', status: 'drafted', link: 'mailto:management@example.invalid' }, 201);
  }
  if (urlPath === '/api/me/contacts') return json({ contacts: [] });
  if (/^\/api\/me\/contacts\/[^/]+$/.test(urlPath)) return json({ updated: true });

  if (urlPath === '/api/me/community') return json(state.meCommunity);
  if (urlPath === '/api/me/community/events' && method === 'POST') {
    const event = communityEventFixture({ id: 'coach-event-e2e', ...(ctx.body || {}) });
    state.coachCommunity.events.unshift(event);
    state.communityEvents.unshift(event);
    return json(event, 201);
  }
  if (urlPath === '/api/me/community/events' && method === 'GET') {
    return json({ events: state.coachCommunity.events });
  }
  if (/^\/api\/me\/community\/events\/[^/]+$/.test(urlPath)) {
    return json({ updated: true, cancelled: method === 'DELETE' });
  }
  if (urlPath === '/api/me/community/posts' && method === 'POST') {
    const post = communityPostFixture({ id: 'coach-post-e2e', ...(ctx.body || {}) });
    state.coachCommunity.posts.unshift(post);
    state.communityPosts.unshift(post);
    if (['event', 'group_session'].includes(post.kind)) state.communityEvents.unshift(post);
    return json(post, 201);
  }

  if (/^\/api\/providers\/[^/]+\/community$/.test(urlPath)) return json(state.coachCommunity);
  if (urlPath === '/api/community/upcoming') return json({ events: state.coachCommunity.events });
  if (urlPath === '/api/community/reports' && method === 'POST') {
    return json({ id: 'report-e2e', status: 'open', ...(ctx.body || {}) }, 201);
  }
  if (/^\/api\/community\/posts\/[^/]+\/comments$/.test(urlPath) && method === 'GET') {
    return json({ comments: [{ id: 'comment-e2e', user_id: 'e2e-member', author_name: 'E2E Member', body: 'Synthetic comment.', created_at: '2026-11-20T10:30:00.000Z' }] });
  }
  if (/^\/api\/community\/posts\/[^/]+\/comments$/.test(urlPath) && method === 'POST') {
    return json({ id: 'comment-e2e-new', saved: true }, 201);
  }
  if (/^\/api\/community\/posts\/[^/]+\/comments\/[^/]+$/.test(urlPath) && method === 'DELETE') {
    return json({ deleted: true });
  }
  if (/^\/api\/community\/posts\/[^/]+\/like$/.test(urlPath)) {
    return json({ liked: method === 'POST', likes: 4 });
  }
  if (/^\/api\/community\/posts\/[^/]+\/rsvp$/.test(urlPath)) {
    return json({ rsvp: method === 'DELETE' ? '' : (ctx.body?.response || 'going') });
  }

  if (urlPath === '/api/admin/community' && method === 'GET') {
    return json({
      snapshot: {
        pending_community_posts: 0, pending_community_comments: 0,
        published_community_posts: state.communityPosts.length, weekly_challenges: 0,
      },
      pending_posts: [], posts: state.communityPosts, comments: [], achievements: [],
    });
  }
  if (urlPath === '/api/admin/momo-followups' && method === 'GET') return json({ followups: [] });
  if (/^\/api\/admin\/momo-followups\/[^/]+\/(contact|dismiss)$/.test(urlPath)) return json({ updated: true });
  if (urlPath === '/api/admin/contact-config') {
    return json({ contact: { configured: true, email_configured: true, whatsapp_configured: true }, email_delivery: true });
  }
  if (/^\/api\/admin\/coaches\/[^/]+\/completeness$/.test(urlPath)) {
    return json({ completeness: { percent: 92, missing: [] } });
  }
  if (/^\/api\/admin\/coaches\/[^/]+\/contacts$/.test(urlPath) && method === 'POST') {
    return json({ id: 'contact-e2e', status: 'drafted', link: 'mailto:management@example.invalid' }, 201);
  }
  if (/^\/api\/admin\/coaches\/[^/]+\/contacts$/.test(urlPath)) return json({ contacts: [] });
  if (/^\/api\/admin\/contacts\/[^/]+$/.test(urlPath)) return json({ updated: true });
  if (urlPath === '/api/admin/communities' && method === 'GET') {
    let list = state.communities;
    const q = (ctx.query.q || '').toLowerCase();
    if (ctx.query.scope === 'mine') list = list.filter(item => item.viewer?.member);
    if (ctx.query.status) list = list.filter(item => item.status === ctx.query.status);
    if (q) list = list.filter(item => [item.name, item.sport, item.description].join(' ').toLowerCase().includes(q));
    if (ctx.query.sport) list = list.filter(item => item.sport === ctx.query.sport);
    if (ctx.query.location) list = list.filter(item => (item.location || '').toLowerCase().includes(ctx.query.location.toLowerCase()));
    return json({ communities: list });
  }
  if (/^\/api\/admin\/communities\/[^/]+\/audit$/.test(urlPath)) return json({ audit: state.communityAudit });
  if (/^\/api\/admin\/communities\/[^/]+$/.test(urlPath) && method === 'PATCH') {
    const id = urlPath.split('/')[4];
    state.communities = state.communities.map(item => item.id === id ? { ...item, ...(ctx.body || {}) } : item);
    if (state.communityDetail.id === id) state.communityDetail = { ...state.communityDetail, ...(ctx.body || {}) };
    return json({ updated: true });
  }
  if (urlPath === '/api/admin/community/reports' && method === 'GET') return json({ reports: state.communityReports });
  if (/^\/api\/admin\/community\/reports\/[^/]+$/.test(urlPath) && method === 'PATCH') {
    return json({ updated: true });
  }

  if (urlPath === '/api/communities' && method === 'GET') {
    let list = state.communities;
    const q = (ctx.query.q || '').toLowerCase();
    if (ctx.query.scope === 'mine') list = list.filter(item => item.viewer?.member);
    if (q) list = list.filter(item => [item.name, item.sport, item.description].join(' ').toLowerCase().includes(q));
    if (ctx.query.sport) list = list.filter(item => item.sport === ctx.query.sport);
    if (ctx.query.location) list = list.filter(item => (item.location || '').toLowerCase().includes(ctx.query.location.toLowerCase()));
    return json({ communities: list });
  }
  if (urlPath === '/api/communities' && method === 'POST') {
    const community = communityFixture({ id: 'community-e2e-new', ...(ctx.body || {}), name: ctx.body?.name || 'New E2E Community' });
    state.communities.unshift(community);
    state.communityDetail = community;
    return json({ community }, 201);
  }
  if (/^\/api\/communities\/[^/]+\/cover$/.test(urlPath) && method === 'PUT') return json({ saved: true });
  if (/^\/api\/communities\/[^/]+\/join$/.test(urlPath)) {
    const member = method === 'POST';
    state.communityDetail = {
      ...state.communityDetail,
      viewer: { ...state.communityDetail.viewer, member, membership_status: member ? 'active' : '', role: member ? 'member' : '' },
    };
    state.communities = state.communities.map(item => item.id === state.communityDetail.id ? state.communityDetail : item);
    return json({ status: member ? 'active' : 'left' });
  }
  if (/^\/api\/communities\/[^/]+\/events\/series\/[^/]+\/cancel$/.test(urlPath)) return json({ cancelled: true });
  if (/^\/api\/communities\/[^/]+\/posts\/[^/]+\/comments$/.test(urlPath) && method === 'GET') return json({ comments: [] });
  if (/^\/api\/communities\/[^/]+\/posts\/[^/]+$/.test(urlPath) && ['PATCH', 'DELETE'].includes(method)) return json({ updated: true });
  if (/^\/api\/communities\/[^/]+\/posts$/.test(urlPath) && method === 'POST') {
    const post = communityPostFixture({ id: 'community-post-e2e-new', community_id: urlPath.split('/')[3], ...(ctx.body || {}) });
    state.communityPosts.unshift(post);
    if (['event', 'group_session'].includes(post.kind)) state.communityEvents.unshift(post);
    return json(post, 201);
  }
  if (/^\/api\/communities\/[^/]+\/posts$/.test(urlPath) && method === 'GET') {
    let list = state.communityPosts;
    if (ctx.query.kind) list = list.filter(item => item.kind === ctx.query.kind);
    if (ctx.query.sport) list = list.filter(item => item.sport === ctx.query.sport);
    return json({ posts: list });
  }
  if (/^\/api\/communities\/[^/]+\/events$/.test(urlPath) && method === 'GET') return json({ events: state.communityEvents });
  if (/^\/api\/communities\/[^/]+\/messages\/photo$/.test(urlPath) && method === 'POST') {
    const message = communityMessageFixture({ id: 'community-message-e2e-photo', body: '', has_photo: true });
    state.communityMessages.push(message);
    return json(message, 201);
  }
  if (/^\/api\/communities\/[^/]+\/messages\/[^/]+\/photo$/.test(urlPath) && method === 'PUT') return json({ saved: true });
  if (/^\/api\/communities\/[^/]+\/messages\/[^/]+$/.test(urlPath) && method === 'DELETE') {
    const id = decodeURIComponent(urlPath.split('/')[5]);
    state.communityMessages = state.communityMessages.filter(item => item.id !== id);
    return json({ deleted: true });
  }
  if (/^\/api\/communities\/[^/]+\/messages$/.test(urlPath) && method === 'POST') {
    const message = communityMessageFixture({ id: 'community-message-e2e-new', ...(ctx.body || {}) });
    state.communityMessages.push(message);
    return json(message, 201);
  }
  if (/^\/api\/communities\/[^/]+\/messages$/.test(urlPath) && method === 'GET') return json({ messages: state.communityMessages });
  if (/^\/api\/communities\/[^/]+\/members\/[^/]+\/moderator$/.test(urlPath)) return json({ updated: true });
  if (/^\/api\/communities\/[^/]+\/members$/.test(urlPath)) return json({ members: state.communityMembers });
  if (/^\/api\/communities\/[^/]+\/notifications$/.test(urlPath) && method === 'PATCH') {
    state.communityNotifications = { ...state.communityNotifications, ...(ctx.body || {}) };
    return json(state.communityNotifications);
  }
  if (/^\/api\/communities\/[^/]+\/notifications$/.test(urlPath)) return json({ notifications: state.communityNotifications });
  if (/^\/api\/communities\/[^/]+$/.test(urlPath) && method === 'PATCH') {
    state.communityDetail = { ...state.communityDetail, ...(ctx.body || {}) };
    state.communities = state.communities.map(item => item.id === state.communityDetail.id ? state.communityDetail : item);
    return json({ community: state.communityDetail });
  }
  if (/^\/api\/communities\/[^/]+$/.test(urlPath) && method === 'GET') {
    return json({
      community: state.communityDetail,
      notifications: state.communityNotifications,
      moderators: state.communityMembers.filter(item => item.role === 'moderator').map(item => item.user_id),
      members: state.communityMembers,
    });
  }

  if (urlPath === '/api/dashboard') return json(state.dashboard);
  if (urlPath === '/api/me/profile') return json({ profile: state.profile });
  if (urlPath.startsWith('/api/providers')) return json({ providers: state.providers });
  if (urlPath.startsWith('/api/community/posts')) return json({ posts: [] });
  if (urlPath === '/api/dashboard/blog' || urlPath.startsWith('/api/dashboard/blog/')) return json({ posts: [] });
  if (urlPath === '/api/dashboard/calendar') return json({ events: [] });
  if (urlPath === '/api/dashboard/notifications') return json({ notifications: [], unread: 0 });
  if (urlPath === '/api/dashboard/feedback') return json({ feedback: [] });
  if (urlPath === '/api/dashboard/bookings') return json({ bookings: [] });
  if (urlPath === '/api/dashboard/analytics') return json({ analytics: {} });
  if (urlPath === '/api/me/achievements') return json({ achievements: [] });
  if (urlPath === '/api/me/sports-profile') {
    if (method === 'PUT') return json({ saved: true });
    return json({ profile: state.sportsProfile });
  }
  if (urlPath === '/api/connections') {
    if (method === 'POST') return json({ id: 'conn-e2e-new', status: 'pending' }, 201);
    return json({ connections: state.connections });
  }
  if (/^\/api\/connections\/[^/]+\/workspace$/.test(urlPath)) {
    const id = urlPath.split('/')[3];
    return json({
      workspace: {
        id,
        coach: { user_id: 'coach-e2e', name: 'E2E Coach' },
        athlete: { user_id: 'e2e-athlete', name: 'E2E Athlete' },
        viewing_as: state.dashboard?.role === 'provider' ? 'coach' : 'athlete',
        garmin: {},
        attachments: state.attachments,
        progress: state.progress,
        messages: state.messages,
        programs: state.dashboard?.programs || [],
        feedback: [],
        calendar: [],
      },
    });
  }
  if (/^\/api\/connections\/[^/]+\/attachments$/.test(urlPath)) {
    if (method === 'POST') {
      state.attachments.push({
        id: `att-e2e-${state.attachments.length + 1}`,
        file_name: 'mock.txt',
        byte_size: 12,
        created_at: '2026-11-20T10:00:00.000Z',
        uploader_user_id: 'e2e-coach',
      });
      return json({ id: state.attachments.at(-1).id, saved: true }, 201);
    }
    return json({ attachments: state.attachments });
  }
  if (/^\/api\/connections\/[^/]+\/attachments\/[^/]+$/.test(urlPath)) {
    return { status: 200, contentType: 'text/plain', body: 'e2e attachment' };
  }
  if (/^\/api\/connections\/[^/]+\/progress$/.test(urlPath)) {
    if (method === 'POST') {
      state.progress.push({
        id: `progress-e2e-${state.progress.length + 1}`,
        ...ctx.body,
        created_at: '2026-11-20T10:00:00.000Z',
      });
      return json({ id: state.progress.at(-1).id, saved: true }, 201);
    }
    return json({ progress: state.progress });
  }
  if (/^\/api\/connections\/[^/]+\/messages$/.test(urlPath)) {
    if (method === 'POST') return json({ id: 'msg-e2e-new', saved: true }, 201);
    return json({ messages: state.messages });
  }
  if (/^\/api\/connections\/[^/]+$/.test(urlPath) && method === 'PATCH') {
    return json({ updated: true, status: 'accepted', workspace_active: true });
  }
  if (urlPath === '/api/bookings' && method === 'POST') {
    return json({ request_id: 'E2E-REQUEST-1', provider_name: 'MZ Active', provider_whatsapp: '97400000000' });
  }
  return json({ error: 'e2e_unmocked_api', path: urlPath }, 501);
}

/**
 * Install a strict local network boundary on a page. Call before page.goto().
 * `overrides` maps "METHOD /path" to a response descriptor, a function, or an
 * array of descriptors consumed in order (handy for sequential API outcomes).
 */
async function installApiMock(page, options = {}) {
  const state = {
    calls: [],
    blocked: [],
    whatsapp: [],
    overrides: options.overrides || {},
    dashboard: options.dashboard || dashboardData(),
    profile: options.profile || { id: 'coach-e2e', status: 'approved', display_name: 'E2E Coach' },
    connections: options.connections || [],
    messages: options.messages || [],
    attachments: options.attachments || [],
    progress: options.progress || [],
    providers: options.providers || [],
    sportsProfile: options.sportsProfile || {},
    communities: options.communities || [communityFixture()],
    communityDetail: options.communityDetail || communityFixture(),
    communityMembers: options.communityMembers || [
      { user_id: 'e2e-coach', role: 'owner', joined_at: '2026-11-01T08:00:00.000Z', display_name: 'E2E Coach' },
      { user_id: 'e2e-member', role: 'member', joined_at: '2026-11-05T08:00:00.000Z', display_name: 'E2E Member' },
    ],
    communityPosts: options.communityPosts || [communityPostFixture()],
    communityEvents: options.communityEvents || [communityEventFixture()],
    communityMessages: options.communityMessages || [communityMessageFixture()],
    communityNotifications: options.communityNotifications || {
      muted: false, activity_enabled: 1, event_reminders: 1, unread_messages: 0,
    },
    communityReports: options.communityReports || [],
    communityAudit: options.communityAudit || [],
    coachCommunity: options.coachCommunity || {
      events: [communityEventFixture()], posts: [communityPostFixture()],
    },
    meCommunity: options.meCommunity || {
      user_id: 'e2e-coach',
      can_create_event: true,
      coach_profile_id: 'coach-e2e',
      communities: [{
        id: 'community-e2e', name: 'Doha Morning Runners', sport: 'running',
        visibility: 'public', status: 'active', member_count: 24, role: 'owner',
        joined_at: '2026-11-01T08:00:00.000Z',
      }],
    },
  };
  const baseOrigin = new URL(BASE_URL).origin;

  // Record WhatsApp navigation attempts even if Playwright does not route a
  // script-driven top-level navigation through the handler below.
  page.on('request', request => {
    let url;
    try {
      url = new URL(request.url());
    } catch {
      return;
    }
    if (url.hostname === 'wa.me' && !state.whatsapp.includes(url.href)) {
      state.whatsapp.push(url.href);
    }
  });

  await page.route('**/*', async route => {
    const request = route.request();
    let url;
    try {
      url = new URL(request.url());
    } catch {
      return route.continue();
    }
    if (['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue();
    if (url.origin === baseOrigin) return route.continue();

    if (url.href.startsWith(API_ORIGIN)) {
      const ctx = {
        request,
        method: request.method(),
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: readBody(request),
        url: url.href,
      };
      const key = `${ctx.method} ${ctx.path}`;
      const configured = state.overrides[key];
      let response;
      if (Array.isArray(configured)) {
        response = configured.length > 1 ? configured.shift() : configured[0];
      } else if (typeof configured === 'function') {
        response = await configured(ctx, state);
      } else if (configured !== undefined) {
        response = configured;
      } else {
        response = defaultApiHandler(ctx, state);
      }
      state.calls.push({
        method: ctx.method,
        path: ctx.path,
        query: ctx.query,
        body: ctx.body,
        status: response && response.status ? response.status : 200,
      });
      if (response && response.action === 'abort') return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}', ...response });
    }

    // Pop-ups/top-level navigations opened by the booking form are captured,
    // never visited. A 204 response keeps the current page intact.
    if (url.hostname === 'wa.me' && options.allowWhatsapp) {
      if (!state.whatsapp.includes(url.href)) state.whatsapp.push(url.href);
      return route.fulfill({ status: 204, body: '' });
    }

    state.blocked.push({ method: request.method(), url: request.url() });
    return route.abort();
  });

  return state;
}

function assertOfflineSafe(state) {
  // Cloudflare injects a free analytics beacon on the live domain. It is not
  // an app request, so allow it explicitly when tests run against production.
  const appBlocked = state.blocked.filter(({ url }) => {
    try { return new URL(url).hostname !== 'static.cloudflareinsights.com'; }
    catch { return true; }
  });
  assert.deepEqual(appBlocked, [], 'Unexpected cross-origin request escaped route interception');
  const unmocked = state.calls.filter(call => call.status === 501);
  assert.deepEqual(unmocked, [], `Unmocked worker API calls: ${JSON.stringify(unmocked)}`);
}

async function seedSession(page, options = {}) {
  const storage = options.storage === 'session' ? 'session' : 'local';
  const token = options.token || FAKE_TOKEN;
  await page.addInitScript(({ key, value, target }) => {
    try {
      (target === 'session' ? window.sessionStorage : window.localStorage).setItem(key, value);
    } catch {
      /* storage may be unavailable; the test will then see the signed-out UI */
    }
  }, { key: SESSION_KEY, value: token, target: storage });
  return token;
}

async function fillBookingForm(page, overrides = {}) {
  const values = {
    city: 'Doha',
    date: '2026-12-31',
    distance: '10K',
    pace: '5:30/km',
    name: 'E2E Customer',
    phone: '+974 6629 7954',
    details: 'Synthetic booking request for automated checks.',
    ...overrides,
  };
  for (const [id, value] of Object.entries(values)) await page.locator(`#${id}`).fill(value);
}

async function clickAdminTab(page, tab) {
  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 980) await page.locator('#mobileNavToggle').click();
  await page.locator(`#nav [data-nav-tab=${tab}]`).click();
}

module.exports = {
  API_ORIGIN,
  clickAdminTab,
  BASE_URL,
  FAKE_TOKEN,
  SESSION_KEY,
  abort,
  assertOfflineSafe,
  communityEventFixture,
  communityFixture,
  communityMessageFixture,
  communityPostFixture,
  connection,
  dashboardData,
  fillBookingForm,
  installApiMock,
  json,
  message,
  seedSession,
};

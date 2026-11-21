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
    return json({ request_id: 'E2E-REQUEST-1', provider_name: 'MZ Active', provider_whatsapp: '97466297954' });
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
  assert.deepEqual(state.blocked, [], 'Unexpected cross-origin request escaped route interception');
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

module.exports = {
  API_ORIGIN,
  BASE_URL,
  FAKE_TOKEN,
  SESSION_KEY,
  abort,
  assertOfflineSafe,
  connection,
  dashboardData,
  fillBookingForm,
  installApiMock,
  json,
  message,
  seedSession,
};

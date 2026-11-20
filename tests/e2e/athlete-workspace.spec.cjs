'use strict';

const { test, expect } = require('./pw.cjs');
const {
  FAKE_TOKEN,
  assertOfflineSafe,
  connection,
  dashboardData,
  installApiMock,
  json,
  message,
  seedSession,
} = require('./helpers.cjs');

test('booking-created workspace stays inactive until the athlete accepts', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'member', user: { id: 'e2e-athlete' } }),
    connections: [connection({ id: 'conn-booking-1', source: 'booking', status: 'pending', workspace_status: 'pending' })],
    messages: [message({ sender_user_id: 'coach-e2e', body: 'Workspace ready for planning.' })],
    overrides: {
      'PATCH /api/connections/conn-booking-1': json({ error: 'booking_not_confirmed' }, 409),
    },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');

  await expect(page.locator('#communityWorkspace')).toBeVisible();
  await expect(page.locator('#wsConnectionsBody')).toContainText('E2E Coach');
  await expect(page.locator('#wsConnectionsBody')).toContainText('Pending');
  await expect(page.locator('#wsConnectionsBody').getByRole('button', { name: 'Open messages' })).toHaveCount(0);

  // Exercise the same acceptance endpoint the athlete uses. The booking is not
  // confirmed yet, so the mocked worker must refuse to activate the workspace.
  const refused = await page.evaluate(async token => {
    const response = await fetch(`${window.MZACTIVE_API_BASE}/api/connections/conn-booking-1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'accepted' }),
    });
    return { status: response.status, body: await response.json() };
  }, FAKE_TOKEN);
  expect(refused.status).toBe(409);
  expect(refused.body.error).toBe('booking_not_confirmed');

  // Once the booking is confirmed and the athlete accepts, the same endpoint
  // activates the shared workspace and the UI unlocks private messaging.
  mock.overrides['PATCH /api/connections/conn-booking-1'] = (ctx, state) => {
    state.connections = [connection({
      id: 'conn-booking-1',
      source: 'booking',
      status: 'accepted',
      workspace_status: 'active',
    })];
    return json({ updated: true, status: 'accepted', workspace_active: true });
  };
  await page.reload();
  await page.locator('#wsConnectionsBody').getByRole('button', { name: 'Accepted', exact: true }).click();

  await expect(page.locator('#wsMessageConnection option')).toHaveCount(2);
  await expect(page.locator('#wsMessageConnection')).toContainText('E2E Coach');
  await page.locator('#wsConnectionsBody').getByRole('button', { name: 'Open messages' }).click();
  await expect(page.locator('#wsMessagesList')).toContainText('Workspace ready for planning.');

  const patches = mock.calls.filter(call => call.method === 'PATCH' && call.path === '/api/connections/conn-booking-1');
  expect(patches).toHaveLength(2);
  expect(patches[0].body).toEqual({ status: 'accepted' });
  assertOfflineSafe(mock);
});

test('coach can accept an athlete request and unlock the shared workspace', async ({ page }) => {
  const mock = await installApiMock(page, {
    dashboard: dashboardData({ role: 'provider' }),
    connections: [connection({ id: 'conn-request-1', source: 'request', status: 'pending' })],
    overrides: {
      'PATCH /api/connections/conn-request-1': (ctx, state) => {
        state.connections = [connection({ id: 'conn-request-1', source: 'request', status: 'accepted', workspace_status: 'active' })];
        return json({ updated: true, status: 'accepted', workspace_active: true });
      },
    },
  });
  await seedSession(page, { storage: 'local' });
  await page.goto('/dashboard.html');

  await expect(page.locator('#wsConnectionsBody')).toContainText('Pending');
  await page.locator('#wsConnectionsBody').getByRole('button', { name: 'Accepted', exact: true }).click();

  await expect(page.locator('#wsConnectionsBody')).toContainText('Accepted');
  await expect(page.locator('#wsConnectionsBody').getByRole('button', { name: 'Open messages' })).toBeVisible();
  await expect(page.locator('#wsMessageConnection')).toContainText('E2E Athlete');

  const patches = mock.calls.filter(call => call.method === 'PATCH' && call.path === '/api/connections/conn-request-1');
  expect(patches).toHaveLength(1);
  expect(patches[0].body).toEqual({ status: 'accepted' });
  assertOfflineSafe(mock);
});

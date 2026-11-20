const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const worker = read('backend/worker.js');
const configs = ['backend/wrangler.preview.toml', 'backend/wrangler.production.toml', 'backend/package.json']
  .map(file => read(file)).join('\n');

test('Garmin preparation stores only an official public profile URL', () => {
  assert.match(worker, /cleanGarminPublicUrl/);
  assert.match(worker, /garmin_public_url/);
  assert.match(worker, /garmin\.com/);
  assert.doesNotMatch(worker, /fetch\([^)]*garmin/i);
  assert.doesNotMatch(worker, /garmin[^;]{0,80}(client_secret|access_token|refresh_token)/i);
  assert.equal(/oauth|client_secret|refresh_token|access_token/i.test(configs), false);
});

test('Strava and paid payment providers remain disabled', () => {
  const files = [worker, configs, read('manifest.json')].join('\n');
  for (const forbidden of ['strava', 'stripe', 'paypal', 'braintree', 'squareup', 'client_secret', 'refresh_token']) {
    assert.equal(new RegExp(forbidden, 'i').test(files), false, forbidden);
  }
  assert.match(worker, /pending_payment/);
  assert.match(worker, /site does not collect payments/i);
});

test('human approval gates remain in the Worker and the Admin interface', () => {
  assert.match(worker, /approval_status='pending'/);
  assert.match(worker, /\["approved","rejected"\]\.includes\(decision\)/);
  assert.match(worker, /license_verified === true/);
  const admin = read('assets/js/admin.js');
  assert.match(admin, /Approve draft/);
  assert.match(admin, /Reject draft/);
  assert.match(admin, /Awaiting approval/);
});

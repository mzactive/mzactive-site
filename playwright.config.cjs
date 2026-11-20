/* Mobile-first Playwright configuration. All browser dependencies are free and
 * run locally through npx; no cloud/device-grid service is used. */
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

// The CLI may be globally installed (npx), while specs live in this repo.
// Point the spec shim at the Playwright copy that is actually running us.
if (!process.env.MZ_PLAYWRIGHT_TEST_MODULE) {
  const candidates = [];
  try { candidates.push(require.resolve('@playwright/test')); } catch { /* optional */ }
  try { candidates.push(require.resolve('playwright/test')); } catch { /* optional */ }
  if (require.main && require.main.filename) {
    try { candidates.push(createRequire(require.main.filename).resolve('playwright/test')); } catch { /* optional */ }
  }
  if (candidates.length) process.env.MZ_PLAYWRIGHT_TEST_MODULE = candidates[0];
}

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:8080';
const parsed = new URL(baseURL);
const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './tests/e2e',
  testMatch: '**/*.spec.cjs',
  // Keep generated artifacts outside the repository and unique per run so two
  // invocations can never delete each other's traces or screenshots.
  outputDir: path.join(os.tmpdir(), `mzactive-e2e-results-${process.pid}`),
  // Service-worker and mock state are page-scoped, but a single worker keeps
  // the local static server and artifact cleanup fully deterministic.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    // Deterministic tests: never reuse a cached shell between specs.
    serviceWorkers: 'block',
    locale: 'en-GB',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10000,
    navigationTimeout: 20000,
  },
  projects: [
    {
      name: 'iphone',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    },
    {
      name: 'android',
      use: {
        browserName: 'chromium',
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    },
  ],
};

if (isLocal) {
  config.webServer = {
    command: `python3 -m http.server ${parsed.port || '8080'} --bind ${parsed.hostname}`,
    url: baseURL,
    // Playwright owns the server by default so a stale process cannot disappear
    // mid-suite. Set PW_REUSE_SERVER=1 to attach to an existing local preview.
    reuseExistingServer: Boolean(process.env.PW_REUSE_SERVER),
    timeout: 30000,
    stdout: 'ignore',
    stderr: 'pipe',
  };
}

module.exports = config;

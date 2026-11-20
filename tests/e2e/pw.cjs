'use strict';

/*
 * Resolve the free, locally available Playwright test module without adding a
 * devDependency or lockfile. `npx playwright test` sets MZ_PLAYWRIGHT_TEST_MODULE
 * in playwright.config.cjs from the CLI's own install location.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

function load() {
  const candidates = [process.env.MZ_PLAYWRIGHT_TEST_MODULE, '@playwright/test', 'playwright/test'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      /* try the next candidate */
    }
  }
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return require(path.join(globalRoot, 'playwright', 'test.js'));
  } catch (error) {
    throw new Error(
      'Playwright test module not found. Run through `npx playwright test --config playwright.config.cjs` ' +
      'or install the free @playwright/test package. Original error: ' + error.message,
    );
  }
}

module.exports = load();

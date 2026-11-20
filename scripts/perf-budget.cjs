#!/usr/bin/env node
'use strict';

/*
 * Free Lighthouse performance/PWA runner.
 *
 * Usage:
 *   node scripts/perf-budget.cjs [url]
 *   node scripts/perf-budget.cjs --url=https://mzactive.com/
 *   PERF_URL=https://mzactive.com/ npm run perf:lighthouse
 *
 * Budgets: LCP <= 2500 ms, INP <= 200 ms (when measurable), CLS <= 0.1.
 * Lab runs cannot measure field INP; that check is reported as unavailable,
 * not silently passed or failed.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BUDGET = { lcpMs: 2500, inpMs: 200, cls: 0.1 };

function parseArgs(argv) {
  let url = process.env.PERF_URL || process.env.BASE_URL || 'http://127.0.0.1:8080/';
  let outputPath = '';
  for (const arg of argv) {
    if (arg.startsWith('--url=')) url = arg.slice('--url='.length);
    else if (arg.startsWith('--out=')) outputPath = arg.slice('--out='.length);
    else if (arg.startsWith('--')) continue;
    else if (!arg.includes('=')) url = arg;
  }
  return { url, outputPath: outputPath || path.join(os.tmpdir(), `mzactive-lighthouse-${Date.now()}.json`) };
}

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const roots = [
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
  ];
  const relativePaths = [
    ['chrome-mac-arm64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'],
    ['chrome-mac', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'],
    ['chrome-linux', 'chrome'],
    ['chrome-win', 'chrome.exe'],
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const versions = fs.readdirSync(root).filter(name => name.startsWith('chromium-')).sort().reverse();
    for (const version of versions) {
      for (const [platform, binary] of relativePaths) {
        const candidate = path.join(root, version, platform, binary);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  for (const fallback of [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ]) {
    if (fs.existsSync(fallback)) return fallback;
  }
  return '';
}

function numericAudit(audits, id) {
  const audit = audits[id];
  if (!audit || typeof audit.numericValue !== 'number' || !Number.isFinite(audit.numericValue)) return null;
  if (['notApplicable', 'manual', 'informs'].includes(audit.scoreDisplayMode)) return null;
  return audit.numericValue;
}

function checkBudget(label, value, limit, format) {
  if (value === null) return { label, value: null, passed: true, skipped: true };
  return { label, value, limit, passed: value <= limit, format, skipped: false };
}

function reportLine(result) {
  if (result.skipped) return `SKIP  ${result.label}: not measurable in this lab run`;
  const actual = result.format(result.value);
  const allowed = result.format(result.limit);
  return `${result.passed ? 'PASS' : 'FAIL'}  ${result.label}: ${actual} (budget ${allowed})`;
}

function checkLocalPwaFiles(root) {
  const problems = [];
  for (const file of ['manifest.json', 'sw.js']) {
    if (!fs.existsSync(path.join(root, file))) problems.push(`missing ${file}`);
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    if (!manifest.name || !manifest.start_url || !Array.isArray(manifest.icons) || !manifest.icons.length) {
      problems.push('manifest.json lacks name/start_url/icons');
    }
  } catch (error) {
    problems.push(`manifest.json is not valid JSON: ${error.message}`);
  }
  const index = fs.existsSync(path.join(root, 'index.html')) ? fs.readFileSync(path.join(root, 'index.html'), 'utf8') : '';
  if (!/rel="manifest"/.test(index)) problems.push('index.html has no manifest link');
  if (!/pwa-register\.js/.test(index)) problems.push('index.html does not register the service worker');
  return problems;
}

function main() {
  const { url, outputPath } = parseArgs(process.argv.slice(2));
  const chrome = findChrome();
  const chromeFlags = '--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage';
  const args = [
    '--yes', 'lighthouse', url,
    '--quiet',
    '--output=json',
    `--output-path=${outputPath}`,
    `--chrome-flags=${chromeFlags}`,
    '--only-categories=performance',
    '--form-factor=mobile',
  ];
  console.log(`Running Lighthouse (mobile) against ${url}`);
  if (chrome) console.log(`Using Chromium: ${chrome}`);

  const env = { ...process.env };
  if (chrome) env.CHROME_PATH = chrome;
  const result = spawnSync('npx', args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) {
    console.error(`Could not start Lighthouse: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }
  if (result.status !== 0) {
    console.error(`Lighthouse exited with status ${result.status}`);
    if (result.stderr) console.error(result.stderr.trim());
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(outputPath)) {
    console.error(`Lighthouse did not write ${outputPath}`);
    process.exitCode = 1;
    return;
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch (error) {
    console.error(`Could not parse Lighthouse JSON: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const audits = report.audits || {};
  const results = [
    checkBudget('LCP', numericAudit(audits, 'largest-contentful-paint'), BUDGET.lcpMs, value => `${(value / 1000).toFixed(2)}s`),
    checkBudget('INP', numericAudit(audits, 'interaction-to-next-paint') ?? numericAudit(audits, 'experimental-interaction-to-next-paint'), BUDGET.inpMs, value => `${value.toFixed(0)}ms`),
    checkBudget('CLS', numericAudit(audits, 'cumulative-layout-shift'), BUDGET.cls, value => value.toFixed(3)),
  ];
  console.log('\nPerformance budget:');
  for (const item of results) console.log(reportLine(item));
  if (results[1].skipped) {
    console.log('  Note: field INP from CrUX is unavailable for local lab runs; no INP regression is claimed.');
  }
  const perfScore = report.categories && report.categories.performance && report.categories.performance.score;
  if (typeof perfScore === 'number') console.log(`Lighthouse performance score: ${Math.round(perfScore * 100)}`);

  console.log('\nPWA checks:');
  if (report.categories && report.categories.pwa) {
    console.log(`  Lighthouse PWA category score: ${Math.round(report.categories.pwa.score * 100)}`);
  } else {
    console.log('  Lighthouse 13 has no PWA category; checking app shell locally instead.');
  }
  const pwaProblems = checkLocalPwaFiles(path.resolve(__dirname, '..'));
  if (pwaProblems.length) {
    for (const problem of pwaProblems) console.log(`  FAIL  ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('  PASS  manifest.json, sw.js, manifest link and worker registration present');
  }

  console.log(`\nLighthouse JSON: ${outputPath}`);
  if (results.some(item => !item.passed)) process.exitCode = 1;
  if (process.exitCode === 1) console.log('Budget regression detected. Review the JSON report before shipping.');
}

main();

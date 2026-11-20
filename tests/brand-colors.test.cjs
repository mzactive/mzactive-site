const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appDir = process.env.MZA_APP_DIR ||
  '/Users/mohcinezt/Documents/Codex/2026-11-14/referenced-chatgpt-conversation-this-is-an/mobile';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readApp = file => fs.readFileSync(path.join(appDir, file), 'utf8');

// Files where divergent brand hex values were replaced. The test file itself is
// excluded because it must name the forbidden values in order to assert against them.
const changedSiteFiles = [
  'blog.html',
  'community.html',
  'coaches.html',
  'community-signup.html',
  'pacer.html',
  'training-programmes.html',
  'dashboard.html',
  'marketplace.html',
  'providers.html',
  'events.html',
  'privacy.html',
  'assets/js/assistant-chat.js',
  '4-week-10k/index.html',
];
const changedAppFiles = ['App.tsx', 'app.json'];

const divergentHexes = [
  '080a0a', '080909', '080808', '070809',
  '131817', '141716', '101513',
  '1b211e', '171e1a', '202923',
  'eeb52d', 'efb82f', 'edb633', 'f2a900', 'edbd58', 'dfbd77',
  'f5f4ef', 'f4f3ed', 'f5f3ee',
  'a6ada7', 'a9b8b4',
  '303a34', '30342f', '22484a',
  'd7f36b', 'd8f27a',
  '0e262a', '082429', '0d3034',
  '061417', '66552d', 'f5d999',
];
// The optional pair preserves an existing alpha suffix when a mapped color has one.
const forbiddenBrandHex = new RegExp(`#(?:${divergentHexes.join('|')})(?:[0-9a-f]{2})?\\b`, 'i');

test('changed site files contain no divergent brand hex values', () => {
  for (const file of changedSiteFiles) {
    const match = read(file).match(forbiddenBrandHex);
    assert.ok(!match, `${file} still contains divergent brand color ${match && match[0]}`);
  }
});

test('changed app files contain no divergent brand hex values', () => {
  for (const file of changedAppFiles) {
    const match = readApp(file).match(forbiddenBrandHex);
    assert.ok(!match, `${file} still contains divergent brand color ${match && match[0]}`);
  }
});

test('authoritative landing tokens remain unchanged in site-theme.css', () => {
  const css = read('assets/css/site-theme.css');
  for (const declaration of [
    '  --bg: #091d21;',
    '  --panel: #103538;',
    '  --panel2: #205456;',
    '  --text: #f0f5f3;',
    '  --muted: #b8cbc6;',
    '  --gold: #f2b718;',
    '  --line: #2e6567;',
    '  --lime: #67b9ac;',
    '  --petroleum-950: #091d21;',
    '  --petroleum-900: #103538;',
    '  --petroleum-800: #205456;',
  ]) {
    assert.ok(css.includes(declaration), `site-theme.css must keep ${declaration.trim()}`);
  }
});

test('authoritative landing tokens remain unchanged in homepage.css', () => {
  const css = read('assets/css/homepage.css');
  for (const declaration of [
    '  --petroleum-950: #091d21;',
    '  --petroleum-900: #103538;',
    '  --petroleum-800: #205456;',
    '  --turquoise: #67b9ac;',
    '  --gold: #f2b718;',
    '  --offwhite: #f0f5f3;',
    '  --ink: #f0f5f3;',
    '  --muted: #c5d5d1;',
    '  --line: #367477;',
    '  --panel: #123d40;',
  ]) {
    assert.ok(css.includes(declaration), `homepage.css must keep ${declaration.trim()}`);
  }
});

test('mobile app C object uses the landing palette and keeps functional colors', () => {
  const app = readApp('App.tsx');
  const declaration = app.match(/const C = \{([^}]*)\}/);
  assert.ok(declaration, 'App.tsx must define the C token object');
  const tokens = Object.fromEntries(
    [...declaration[1].matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)]
      .map(match => [match[1], match[2].toLowerCase()]),
  );
  assert.deepEqual(tokens, {
    bg: '#091d21',
    panel: '#103538',
    panel2: '#205456',
    text: '#f0f5f3',
    muted: '#b8cbc6',
    gold: '#f2b718',
    line: '#2e6567',
    green: '#91c66d',
    red: '#e77c68',
  });

  const config = JSON.parse(readApp('app.json'));
  assert.equal(config.expo.splash.backgroundColor, '#091d21');
  assert.equal(config.expo.android.adaptiveIcon.backgroundColor, '#091d21');
});

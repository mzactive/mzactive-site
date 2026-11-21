const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sw = read('sw.js');
const register = read('assets/js/pwa-register.js');
const css = read('assets/css/site-theme.css');

test('the active service worker shell cache is bumped to v7', () => {
  assert.match(sw, /const CACHE = ['"]mza-shell-v7['"]/);
  assert.doesNotMatch(sw, /const CACHE = ['"]mza-shell-v6['"]/);
  assert.match(sw, /key\.startsWith\(['"]mza-shell-['"]\) && key !== CACHE/);
  assert.match(sw, /caches\.delete\(key\)/);
  // The previous name only survives as migration documentation.
  const legacy = sw.split('\n').filter(line => line.includes('mza-shell-v6'));
  assert.equal(legacy.length, 1);
  assert.match(legacy[0], /^\/\//);
  new Function(sw);
});

test('a waiting worker is never activated unconditionally in install', () => {
  const install = sw.match(/addEventListener\(['"]install['"][\s\S]*?\n\}\);/);
  assert.ok(install, 'install handler is present');
  assert.doesNotMatch(install[0], /skipWaiting/);
  assert.match(sw, /addEventListener\(['"]message['"]/);
  assert.match(sw, /event\.data && event\.data\.type === ['"]MZA_SKIP_WAITING['"]/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
});

test('cached assets are refreshed in the background without changing versioned URLs', () => {
  assert.match(sw, /url\.pathname\.startsWith\(['"]\/assets\/['"]\)/);
  assert.match(sw, /cache\.match\(request\)/);
  assert.match(sw, /fetch\(request\)/);
  assert.match(sw, /cache-control/);
  assert.match(sw, /no-store/);
  assert.match(sw, /cache\.put\(request, copy\)/);
  assert.match(sw, /event\.waitUntil\(fresh\)/);
  assert.match(sw, /cached \|\| fresh\.then/);
  // Offline navigation fallback and network-only rules remain in place.
  assert.match(sw, /request\.mode === ['"]navigate['"]/);
  assert.match(sw, /cache\.match\(['"]\/offline\.html['"]\)/);
  assert.match(sw, /url\.pathname\.startsWith\(['"]\/api\/['"]\)/);
});

test('registration polls periodically and on visibility without assuming a paid service', () => {
  assert.match(register, /'serviceWorker' in navigator/);
  assert.match(register, /register\(['"]\/sw\.js\?v=20261121a['"]/);
  assert.match(register, /scope:\s*['"]\/['"]/);
  assert.match(register, /registration\.update\(\)\.catch/);
  assert.match(register, /setInterval\(checkForUpdate, CHECK_INTERVAL\)/);
  assert.match(register, /addEventListener\(['"]visibilitychange['"]/);
  assert.match(register, /visibilityState === ['"]hidden['"]/);
  assert.match(register, /visibilityState !== ['"]hidden['"]/);
  new Function(register);
});

test('updatefound and controllerchange drive an accessible prompt', () => {
  assert.match(register, /addEventListener\(['"]updatefound['"]/);
  assert.match(register, /addEventListener\(['"]statechange['"]/);
  assert.match(register, /installing\.state === ['"]installed['"]/);
  assert.match(register, /navigator\.serviceWorker\.controller/);
  assert.match(register, /addEventListener\(['"]controllerchange['"]/);
  assert.match(register, /setAttribute\(['"]role['"],\s*['"]status['"]\)/);
  assert.match(register, /setAttribute\(['"]aria-live['"]/);
  assert.match(register, /Update & reload/);
  assert.match(register, /Later/);
  assert.match(register, /data-en/);
  assert.match(register, /data-ar/);
});

test('postMessage and reload only follow an explicit user action', () => {
  const lines = register.split('\n');
  const postIndex = lines.findIndex(line => line.includes('postMessage('));
  assert.ok(postIndex >= 0, 'a message is sent to the waiting worker');
  const beforePost = lines.slice(0, postIndex).join('\n');
  assert.match(beforePost, /function applyUpdate/);
  assert.match(beforePost, /preserveStudioDraft\(\)/);
  const applyUpdate = register.match(/function applyUpdate\(\) \{[\s\S]*?\n  \}/);
  assert.ok(applyUpdate, 'applyUpdate body is present');
  assert.match(applyUpdate[0], /updateRequested = true/);
  assert.match(applyUpdate[0], /postMessage\(/);
  assert.match(register, /addEventListener\(['"]click['"], applyUpdate\)/);
  assert.equal(lines.filter(line => line.includes('location.reload')).length, 1);
  assert.match(register, /function reloadAfterUpdate\(\) \{\n    if \(reloading\) return;/);
  assert.match(register, /addEventListener\(['"]controllerchange['"][\s\S]*?if \(!updateRequested\) return;[\s\S]*?reloadAfterUpdate\(\)/);
  assert.match(sw, /MZA_SKIP_WAITING/);
  assert.match(register, /MZA_SKIP_WAITING/);
});

test('drafts and storage survive update checks and unload', () => {
  assert.match(register, /addEventListener\(['"]pagehide['"], preserveStudioDraft\)/);
  assert.match(register, /dispatchEvent\(new Event\(['"]input['"]/);
  assert.match(register, /sessionStorage\.setItem/);
  assert.doesNotMatch(register, /localStorage\.clear|sessionStorage\.clear|localStorage\.removeItem|sessionStorage\.removeItem/);
  assert.doesNotMatch(sw, /localStorage|sessionStorage/);
});

test('fixed UI honors safe-area insets and dvh has a vh fallback', () => {
  for (const side of ['top', 'right', 'bottom', 'left']) {
    assert.match(css, new RegExp(`env\\(safe-area-inset-${side}`));
  }
  assert.match(css, /min-height: 100vh/);
  assert.match(css, /min-height: 100dvh/);
  assert.match(css, /#mz-assistant/);
  assert.match(css, /\.wa-chat-float/);
  assert.match(css, /\.mza-update-banner/);
});

test('service worker registration is cache-busted on every page that registers it', () => {
  let checked = 0;
  for (const page of fs.readdirSync(root).filter(file => file.endsWith('.html'))) {
    const html = read(page);
    if (!html.includes('pwa-register.js')) continue;
    checked += 1;
    assert.match(html, /pwa-register\.js\?v=20261121a/, page);
    assert.doesNotMatch(html, /pwa-register\.js\?v=20261120e/, page);
  }
  assert.ok(checked >= 18, `expected every registered page to be versioned, found ${checked}`);
});

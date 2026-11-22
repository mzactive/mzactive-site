const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('homepage hero welcomes the whole community in English and Arabic', () => {
  assert.match(html, /data-en="Your Community for a"/);
  assert.match(html, /data-en="Healthier, More Active Life"/);
  assert.match(html, /data-ar="مجتمعك لحياة"/);
  assert.match(html, /data-ar="أكثر صحة ونشاطاً"/);
  assert.match(html, /A community for everyone, from beginners to professionals, to explore fitness, sports, and wellness, and connect with coaches and experts\./);
  assert.match(html, /منصة تجمع الجميع، من المبتدئين إلى المحترفين، لاكتشاف الرياضة واللياقة والصحة، والتواصل مع المدربين والخبراء في مجتمع واحد\./);
});

test('hero keeps branding, photography and the three calls to action in order', () => {
  assert.match(html, /class="hero"/);
  assert.match(html, /assets\/images\/mzactive-runners\.jpg/);
  const actions = html.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const hrefs = [...actions.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(hrefs, ['#coach-search', 'providers.html', 'community.html']);
  assert.match(actions, /data-en="Find a Coach"/);
  assert.match(actions, /data-en="Become a Coach"/);
  assert.match(actions, /data-en="Join the Community" data-ar="انضم إلى المجتمع"/);
  assert.match(html, /<h1 id="hero-title"><span data-en="Your Community for a"/);
  assert.match(html, /<span class="highlight" data-en="Healthier, More Active Life"/);
});

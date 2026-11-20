const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'site-language.js'), 'utf8');

const observerStart = source.indexOf('observer = new MutationObserver(');
const observerEnd = source.indexOf('observer.observe', observerStart);
const observerBlock = observerStart >= 0 && observerEnd > observerStart
  ? source.slice(observerStart, observerEnd)
  : '';

test('global observer watches only childList/subtree, never characterData or attributes', () => {
  assert.doesNotMatch(source, /characterData\s*:\s*true/);
  assert.doesNotMatch(source, /attributes\s*:\s*true/);
  assert.doesNotMatch(source, /attributeFilter/);
  assert.ok(source.includes('childList: true'));
  assert.ok(source.includes('subtree: true'));
  assert.ok(source.includes('const observerOptions = {subtree: true, childList: true};'));
  assert.ok(source.includes('observer.observe(document.body, observerOptions)'));
});

test('inserted nodes are batched with rAF/setTimeout and skipped once processed', () => {
  assert.ok(source.includes('requestAnimationFrame'));
  assert.ok(source.includes('setTimeout'));
  assert.ok(source.includes('cancelAnimationFrame'));
  assert.ok(source.includes('flushScheduled'));
  assert.ok(source.includes('pendingNodes'));
  assert.ok(source.includes('scheduleFlush()'));
  assert.ok(source.includes('flushPending'));
  assert.ok(source.includes('new WeakSet'));
  assert.ok(source.includes('processed.has(node)'));
  assert.ok(source.includes('record.addedNodes.forEach(enqueueAdded)'));
});

test('the observer callback only enqueues and schedules; it never runs a full apply', () => {
  assert.ok(observerBlock.length > 0, 'MutationObserver callback found');
  assert.doesNotMatch(observerBlock, /\bapply\s*\(/);
  assert.doesNotMatch(observerBlock, /createTreeWalker/);
  assert.doesNotMatch(observerBlock, /querySelectorAll/);
  assert.doesNotMatch(observerBlock, /document\.body/);
  assert.ok(observerBlock.includes('addedNodes'));
  assert.ok(observerBlock.includes('scheduleFlush()'));
});

test('full body translation is limited to startup and language-change only', () => {
  const initialCalls = source.match(/apply\(state\.get\(\)\)/g) || [];
  assert.equal(initialCalls.length, 1);
  assert.ok(source.includes('apply(event.detail.lang)'));
  assert.equal((source.match(/translateTextWalker\(document\.body/g) || []).length, 1);
  assert.ok(!source.includes('translateNode(document.body'));
});

test('targeted insertion translation is scoped to inserted nodes', () => {
  assert.ok(source.includes('const translateNode = (node, lang) =>'));
  assert.ok(source.includes('translateTextWalker(node, ar)'));
  assert.ok(source.includes("queryAll(node, '[data-en][data-ar]')"));
  assert.ok(source.includes("queryAll(node, '[placeholder],[aria-label],[alt],[title]')"));
  assert.ok(source.includes('markProcessed(node)'));
});

test('existing bilingual API names and DOM translation hooks are preserved', () => {
  for (const name of [
    'MZActiveLanguage',
    'state.get()',
    'state.set(',
    'manual:true',
    'mzactive:language-change',
    'event.detail.lang',
    'data-en',
    'data-ar',
    'data-language-skip',
    'dataset.languageHandler',
    '.ar-only',
    '.en-only',
    '.lang-toggle,#lang',
    "button.id = 'siteLanguage'",
    'site-language-control',
    'data-language-label',
    'language-globe',
    'language-chevron',
    'document.documentElement.lang',
    'document.documentElement.dir',
    'document.body.classList.toggle',
    'titleSource',
    'originalAttributes',
    'setBilingualContent'
  ]) {
    assert.ok(source.includes(name), `missing API name: ${name}`);
  }
});
